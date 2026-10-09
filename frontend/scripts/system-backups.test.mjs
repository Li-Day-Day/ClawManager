import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from '../../scripts/system-backup-a-schema-validation.mjs';
import { filterBackups, formatBytes, unavailableBackupSource } from '../src/pages/admin/backups/backupReadModel.ts';
import { createBackupPreview, previewBackupSource } from '../src/pages/admin/backups/backupPreview.ts';

// Resolve the repository's draft schemas for the existing dependency-free
// validator. No schema copies, generated fixture files or network resolution.
const contractRoot = new URL('../../contracts/system-backup/v12/', import.meta.url);
const documents = new Map();
function document(name) {
  if (!documents.has(name)) documents.set(name, JSON.parse(readFileSync(new URL(name, contractRoot), 'utf8')));
  return documents.get(name);
}
function resolved(schema, file) {
  if (Array.isArray(schema)) return schema.map((item) => resolved(item, file));
  if (!schema || typeof schema !== 'object') return schema;
  if ('maxProperties' in schema) {
    // The activity contract repeats its closed nine-field bound. Prove the
    // keyword redundant before adapting it for the shared test validator.
    assert.equal(schema.additionalProperties, false);
    assert.ok(Object.keys(schema.properties).length <= schema.maxProperties);
    const { maxProperties: ignored, ...closed } = schema;
    void ignored;
    return resolved(closed, file);
  }
  if (schema.$ref) {
    const [relative, fragment] = schema.$ref.split('#');
    const targetFile = relative || file;
    const target = fragment.slice(1).split('/').reduce((value, key) => value[key], document(targetFile));
    const { $ref: ignored, ...siblings } = schema;
    void ignored;
    return { allOf: [resolved(target, targetFile), resolved(siblings, file)] };
  }
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, resolved(value, file)]));
}
function schema(file, name) { return resolved(document(file).$defs[name], file); }

test('preview read projections conform to the existing draft JSON schemas', () => {
  const detailFile = 'admin-task-detail-resources.schema.json';
  const schemas = {
    backups: schema(detailFile, 'BackupDetailResource'), drills: schema(detailFile, 'DrillDetailResource'),
    preflights: schema(detailFile, 'PreflightDetailResource'), verifications: schema(detailFile, 'ArtifactVerificationDetailResource'),
    events: schema('admin-activity-resources.schema.json', 'EventResource'),
    logs: schema('admin-activity-resources.schema.json', 'LogEntryResource'),
  };
  for (const scenario of ['ready', 'empty', 'disabled', 'logs_expired']) {
    const data = createBackupPreview(scenario);
    assert.equal(data.source, 'preview');
    assert.ok(validate(schema('admin-control-resources.schema.json', 'OverviewResource'), data.overview), `${scenario}: overview`);
    for (const [key, definition] of Object.entries(schemas)) {
      data[key].forEach((row, index) => assert.ok(validate(definition, row), `${scenario}: ${key}[${index}]`));
    }
  }
  const invalid = structuredClone(createBackupPreview('ready').backups[0]);
  invalid.acceptance_eligible = false;
  assert.equal(validate(schemas.backups, invalid), false, 'eligible reason cannot survive an ineligible verdict');
  const extra = { ...createBackupPreview('ready').backups[0], unregistered_field: true };
  assert.equal(validate(schemas.backups, extra), false, 'DTOs stay closed');
});

test('default source never reports fixture data as an installed system', async () => {
  assert.deepEqual(await unavailableBackupSource.read(new AbortController().signal), { kind: 'unavailable' });
});

test('preview failures and unsupported/loading states do not fall back to successful data', async () => {
  for (const [scenario, kind] of [['error', 'error'], ['loading', 'loading'], ['unsupported', 'unsupported']]) {
    const result = await previewBackupSource(scenario).read(new AbortController().signal);
    assert.equal(result.kind, kind);
    assert.equal('data' in result, false);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(previewBackupSource('ready').read(controller.signal), { name: 'AbortError' });
});

test('execution success does not imply backup eligibility or recovery readiness', () => {
  const data = createBackupPreview('ready');
  const functional = data.backups.find((backup) => backup.task_purpose === 'functional_test');
  assert.equal(functional.task.status, 'succeeded');
  assert.equal(functional.artifact_usable, true);
  assert.equal(functional.acceptance_ready, false);
  assert.equal(functional.acceptance_eligible, false);
  assert.ok(functional.eligibility_reason_codes.includes('functional_test'));
  assert.equal(data.overview.backup_recovery_readiness, false);
  assert.equal(data.drills[0].task.status, 'succeeded');
  assert.equal(data.drills[0].cleanup_status, 'running');
  assert.equal(data.drills[0].acceptance_eligible, false);
  assert.equal(data.preflights[0].task.status, 'succeeded');
  assert.equal(data.preflights[0].report_validity_reason, 'report_expired');
});

test('unknown finalization is neither a readable artifact nor a registered recovery point', () => {
  const data = createBackupPreview('ready');
  const backup = data.backups.find((item) => item.task.status === 'finalization_unknown');
  assert.equal(backup.artifact_usable, false);
  assert.equal(backup.acceptance_eligible, false);
  assert.equal(backup.artifact_registration_id, null);
  assert.equal(data.catalog.find((item) => item.backupId === backup.task.public_id).registration, 'pending');
});

test('empty and disabled states retain their distinct semantics', () => {
  const empty = createBackupPreview('empty');
  for (const key of ['backups', 'catalog', 'drills', 'preflights', 'verifications', 'events', 'logs']) assert.deepEqual(empty[key], []);
  assert.equal(empty.overview.active_task_count, 0);
  const disabled = createBackupPreview('disabled');
  assert.equal(disabled.overview.effective_enabled, false);
  assert.equal(disabled.config.effective_enabled, false);
  assert.equal(disabled.overview.monitoring_armed, true);
  assert.ok(disabled.backups.length > 0, 'historical records remain visible');
});

test('expired log preview retains durable events and refresh produces isolated fixtures', () => {
  const expired = createBackupPreview('logs_expired');
  assert.equal(expired.logsExpired, true);
  assert.ok(expired.events.length > 0);
  expired.backups[0].checksums.manifest = null;
  expired.backups[0].verifier_summary.passed = -1;
  const fresh = createBackupPreview('ready');
  assert.ok(fresh.backups[0].checksums.manifest);
  assert.equal(fresh.backups[0].verifier_summary.passed, 6);
});

test('backup filters combine ID/matrix search with exact execution status', () => {
  const backups = createBackupPreview('ready').backups;
  assert.equal(filterBackups(backups, ' K8S-CLUSTER ', 'succeeded').length, 2);
  assert.equal(filterBackups(backups, '000000000002', 'all').length, 1);
  assert.equal(filterBackups(backups, '000000000002', 'succeeded').length, 0);
  assert.equal(filterBackups(backups, '', 'all').length, backups.length);
  assert.equal(filterBackups(backups, 'missing', 'all').length, 0);
});

test('unknown byte count is not displayed as a measured zero', () => {
  assert.equal(formatBytes(null), '—');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 KiB');
  assert.equal(formatBytes(2147483648), '2.0 GiB');
});
