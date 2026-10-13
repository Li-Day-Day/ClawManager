import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { systemBackupTranslations, backupLocaleTags, formatBackupDate } from '../src/lib/systemBackupI18n.ts';
import { backupEntryPoints, previewScenarios, formatBytes } from '../src/pages/admin/backups/backupReadModel.ts';
import { createBackupPreview, defaultPreviewCopy, previewBackupSource } from '../src/pages/admin/backups/backupPreview.ts';
import { backupStatuses, drillStatuses, simpleTaskStatuses } from '../src/types/systemBackupContract.ts';

// Node 24 runs these tests without installing frontend dependencies. Resolve
// extensionless local TS imports only while loading the real i18n registry.
const sourceRoot = new URL('../src/', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (!['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(error.code) || !specifier.startsWith('.') || !context.parentURL?.startsWith(sourceRoot)) throw error;
      return nextResolve(`${specifier}${error.code === 'ERR_UNSUPPORTED_DIR_IMPORT' ? '/index.ts' : '.ts'}`, context);
    }
  },
});
let i18n;
try { i18n = await import('../src/lib/i18n.ts'); } finally { hooks.deregister(); }
const { translate, interpolate, localeOptions } = i18n;
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test('every configured language resolves every backup message through the shared registry', () => {
  const locales = localeOptions.map(({ value }) => value).sort();
  assert.deepEqual(Object.keys(systemBackupTranslations).sort(), locales);
  const keys = Object.keys(systemBackupTranslations.en).sort();
  for (const locale of locales) {
    const dictionary = systemBackupTranslations[locale];
    assert.deepEqual(Object.keys(dictionary).sort(), keys);
    for (const key of keys) {
      assert.ok(typeof dictionary[key] === 'string' && dictionary[key].trim(), `${locale}.${key} is empty`);
      assert.equal(translate(locale, `systemBackup.${key}`), dictionary[key]);
      assert.deepEqual(placeholders(dictionary[key]), placeholders(systemBackupTranslations.en[key]), `${locale}.${key} placeholders`);
      assert.doesNotMatch(dictionary[key], /\bP[01](?:[-_][a-z0-9]+|[a-z])?\b/i, `${locale}.${key} exposes an internal phase`);
      const variables = Object.fromEntries(placeholders(dictionary[key]).map((name) => [name, '123']));
      assert.doesNotMatch(interpolate(dictionary[key], variables), /\{\w+\}/);
    }
  }
});

test('entry points, scenarios, execution states and page message calls have translations', () => {
  const page = readFileSync(new URL('../src/pages/admin/backups/SystemBackupsPage.tsx', import.meta.url), 'utf8');
  const livePage = readFileSync(new URL('../src/pages/admin/backups/BackupLiveWorkspace.tsx', import.meta.url), 'utf8');
  const keys = [
    ...backupEntryPoints.flatMap((entry) => [entry.label, entry.description]),
    ...previewScenarios.map((scenario) => `scenario_${scenario}`),
    ...new Set([...backupStatuses, ...drillStatuses, ...simpleTaskStatuses].map((status) => `status_${status}`)),
    ...[...page.matchAll(/\bb\('([^']+)'/g)].map((match) => match[1]),
    ...[...livePage.matchAll(/\bb\('([^']+)'/g)].map((match) => match[1]),
  ];
  for (const locale of Object.keys(systemBackupTranslations)) {
    for (const key of keys) assert.ok(translate(locale, `systemBackup.${key}`), `${locale}.${key}`);
  }
  for (const file of ['SystemBackupsPage.tsx', 'BackupLiveWorkspace.tsx', 'backupReadModel.ts', 'backupPreview.ts', 'useBackupText.ts']) {
    const code = readFileSync(new URL(`../src/pages/admin/backups/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /[\u3400-\u9fff]/, `${file} contains hardcoded Chinese`);
    assert.doesNotMatch(code, /\bP[01](?:[-_][a-z0-9]+|[a-z])?\b/i, `${file} contains an internal phase label`);
  }
});

test('localized demo copy changes without changing authoritative IDs or status fields', async () => {
  const original = createBackupPreview('ready');
  for (const locale of Object.keys(systemBackupTranslations)) {
    const copy = Object.fromEntries(Object.keys(defaultPreviewCopy).map((key) => [key, translate(locale, `systemBackup.fixture_${key}`)]));
    assert.ok(Object.values(copy).every((value) => typeof value === 'string'));
    if (locale === 'en') assert.deepEqual(copy, defaultPreviewCopy);
    const result = await previewBackupSource('ready', copy).read(new AbortController().signal);
    assert.equal(result.kind, 'ready');
    const data = result.data;
    assert.deepEqual(data.backups, original.backups);
    assert.deepEqual(data.overview, original.overview);
    assert.equal(data.config.change_reason, copy.changeReason);
    assert.equal(data.events[0].message, copy.eventMessage);
    assert.equal(data.logs[0].message, copy.logMessage);
    const differences = data.differences[data.preflights[0].task.public_id];
    assert.equal(differences[0].resource, copy.schemaLabel);
    assert.equal(differences[0].source, copy.schema);
    assert.equal(differences[1].target, copy.capacity);
    assert.equal(differences[2].target, copy.expired);
  }
});

test('read errors remain language independent until rendered', async () => {
  const result = await previewBackupSource('error').read(new AbortController().signal);
  assert.deepEqual(result, { kind: 'error', code: 'previewError' });
  const messages = Object.keys(systemBackupTranslations).map((locale) => translate(locale, `systemBackup.${result.code}`));
  assert.equal(new Set(messages).size, localeOptions.length);
});

test('date and byte formatting use the selected language, not the browser default', () => {
  const instant = '2026-09-30T02:30:00Z';
  for (const locale of Object.keys(systemBackupTranslations)) {
    const expected = new Intl.DateTimeFormat(backupLocaleTags[locale], {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
    }).format(new Date(instant));
    assert.equal(formatBackupDate(instant, locale), expected);
    assert.equal(formatBackupDate('invalid', locale), '—');
    assert.equal(formatBytes(null, backupLocaleTags[locale]), '—');
  }
  assert.notEqual(formatBackupDate(instant, 'en'), formatBackupDate(instant, 'de'));
  assert.equal(formatBytes(1536, 'en-US'), '1.5 KiB');
  assert.equal(formatBytes(1536, 'de-DE'), '1,5 KiB');
});
