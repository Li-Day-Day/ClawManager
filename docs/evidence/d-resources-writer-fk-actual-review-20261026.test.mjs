import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reviewFK, validateFKTranscript, validateSharedInputs } from './d-resources-writer-fk-actual-review-20261026.mjs';
import { validateFKTranscript as oldParser } from './a-resources-writer-fk-actual-review-20261023.mjs';

const prefix = 'docs/evidence/d-resources-mysql-20261026-084808-2a9906c3';
const transcriptFile = 'docs/evidence/d-resources-writer-fk-operator-20261026-2a9906c3.txt';
const supplementFile = 'docs/evidence/d-resources-local-recheck-c5fe0b025c054ef4b239bc8cc6c71f81.json';
const json = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const receipt = json(prefix + '.json');
const text = fs.readFileSync(transcriptFile, 'utf8');
const meta = { migrationCount: 96, lastMigration: '081', catalogHash: '0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe' };
const check = value => validateFKTranscript(value, receipt, meta);
const probe = 'TestAResourcesWriteFKMySQL';
const child = `    --- PASS: ${probe}/reparent_items (0.42s)`;

test('original A parser rejects the actual deferred summaries; D accepts unmodified output', () => {
  assert.throws(() => oldParser(text, receipt, meta));
  const result = check(text);
  assert.equal(result.remote_cases, 10);
  assert.equal(result.namespace_uid, 'c95e7743-0206-4aa5-a2fb-b76f74757a07');
});
test('BOM and CRLF accepted', () => assert.equal(check('\uFEFF' + text.replaceAll('\n', '\r\n')).remote_cases, 10));
test('inline summaries also accepted', () => {
  const summaries = text.split('\n').filter(line => line.startsWith('    --- PASS:'));
  let inline = text.split('\n').filter(line => !line.startsWith('    --- PASS:')).join('\n');
  for (const line of summaries) {
    const name = line.match(/\/([^ ]+) /)[1];
    inline = inline.replace(`=== RUN   ${probe}/${name}\n`, `=== RUN   ${probe}/${name}\n${line}\n`);
  }
  assert.equal(check(inline).remote_cases, 10);
});

const mutations = {
  'missing FK observation': s => s.replace(/^.*FK_SCHEMA.*\n/m, ''),
  'wrong declared FK count': s => s.replace('job_relations=2', 'job_relations=1'),
  'disabled FK checks': s => s.replace('checks=1', 'checks=0'),
  'case omitted': s => s.split('\n').filter(line => !line.includes('/reparent_both')).join('\n'),
  'duplicate pass': s => s.replace(child, child + '\n' + child),
  'duplicate start': s => s.replace(`=== RUN   ${probe}/reparent_items\n`, `=== RUN   ${probe}/reparent_items\n=== RUN   ${probe}/reparent_items\n`),
  'same count different cases': s => s.replaceAll('/reparent_both', '/unreviewed_case'),
  'failed case': s => s.replace(child, child.replace('--- PASS:', '--- FAIL:')),
  'skipped case': s => s.replace(child, child.replace('--- PASS:', '--- SKIP:')),
  'parent absent': s => s.replace(`--- PASS: ${probe} (3.84s)\n`, ''),
  'package absent': s => s.replace('\nPASS\n', '\n'),
  'mixed root': s => s + '\n=== RUN   TestDResourcesWriteMySQL',
  'summary before start': s => child + '\n' + s.replace(child + '\n', ''),
  'summary in cleanup interval': s => s.replace(child + '\n', '').replace('CLEANED resources-remote-scratch=yes', child + '\nCLEANED resources-remote-scratch=yes'),
  'summary after package completion': s => s.replace(child + '\n', '') + '\n' + child,
  'case starts before FK check': s => { const line = `=== RUN   ${probe}/reparent_items`; return line + '\n' + s.replace(line + '\n', ''); },
  'wrong binary hash': s => s.replace('cases=10 binary_sha256=' + receipt.binary_sha256, 'cases=10 binary_sha256=' + 'a'.repeat(64)),
  'wrong input hash': s => s.replace('inputs_sha256=' + receipt.inputs_sha256, 'inputs_sha256=' + 'a'.repeat(64)),
  'wrong migration binary': s => s.replace('pinned-migration-runner binary_sha256=' + receipt.migration_binary_sha256, 'pinned-migration-runner binary_sha256=' + 'a'.repeat(64)),
  'wrong catalog': s => s.replaceAll(meta.catalogHash, 'a'.repeat(64)),
  'incomplete migration replay': s => s.replace('applied=96', 'applied=95'),
  'wrong last migration': s => s.replace('001..081', '001..096'),
  'wrong server version': s => s.replace('RESOURCES_FIXTURE mysql=8.4.8', 'RESOURCES_FIXTURE mysql=8.4.7'),
  'unpinned image': s => s.replace(/app_image=\S+/, 'app_image=image:latest'),
  'wrong namespace UID': s => s.replace('CLEANED namespace=sbk-mig-261026005733-6904 uid=c95e7743', 'CLEANED namespace=sbk-mig-261026005733-6904 uid=aaaaaaaa'),
  'missing namespace cleanup': s => s.replace(/^CLEANED namespace=.*\n/m, ''),
  'missing database cleanup': s => s.replace(/^.*owned-database-and-user=yes\n/m, ''),
  'missing scratch cleanup': s => s.replace('CLEANED resources-remote-scratch=yes\n', ''),
  'missing local cleanup': s => s.replace(/^CLEANED resources-local-owner=.*\n/m, ''),
  'pending cleanup': s => s + '\nCLEANUP_PENDING test',
  'wrong native exit': s => s.replace('resources_writer_fk_exit=0', 'resources_writer_fk_exit=1'),
  'missing native exit': s => s.replace('resources_writer_fk_exit=0', ''),
  'wrong result receipt': s => s.replace('2a9906c3.json', 'aaaaaaaa.json'),
  'config activated': s => s.replace('"config_activated":false', '"config_activated":true'),
  'human MFA overclaim': s => s.replace('"human_mfa_verified":false', '"human_mfa_verified":true'),
  'truncated after PASS': s => s.slice(0, s.indexOf('CLEANED namespace=')),
};
for (const [name, mutate] of Object.entries(mutations)) test('reject ' + name, () => assert.throws(() => check(mutate(text))));

const values = () => {
  const supplement = json(supplementFile), parent = json(supplement.parent_receipt.path);
  return [structuredClone(receipt), json(prefix + '-source.json'), parent, json(parent.source)];
};
test('all 122 ordinary package/module/contract inputs match original supplement', () => validateSharedInputs(...values()));
for (const [name, mutate] of Object.entries({
  'resource source': v => { v[1].files.find(p => p.path.endsWith('/restore_write.go')).sha256 = 'a'.repeat(64); },
  'module': v => { v[1].files.find(p => p.path === 'backend/go.mod').sha256 = 'a'.repeat(64); },
  'contract': v => { v[1].files.find(p => p.path.startsWith('contracts/')).size++; },
  'new package file': v => { v[1].files.push({ path: 'backend/internal/systembackupresources/new.go', size: 1, sha256: 'a'.repeat(64) }); },
  'filtered command': v => { v[0].steps[0].command.push('-run', 'TestOne'); },
  'wrong suite': v => { v[0].suite = 'writer'; },
  'failed local step': v => { v[0].steps[0].exit_code = 1; },
})) test('reject shared supplement with changed ' + name, () => { const v = values(); mutate(v); assert.throws(() => validateSharedInputs(...v)); });

test('full on-disk D review preserves originals and does not write approval', () => {
  const before = fs.readdirSync('docs/evidence').sort();
  const result = reviewFK(prefix + '.json', transcriptFile, supplementFile);
  assert.equal(result.remote_cases, 10); assert.equal(result.declared_job_foreign_keys_accepted, 2);
  assert.equal(result.local_pass_events, 843); assert.equal(result.local_root_tests, 71);
  assert.equal(result.shared_local_recheck.input_files, 122); assert.equal(result.shared_local_recheck.new_local_run_claimed, false);
  assert.deepEqual(result.original_local_step0_damage.malformed_lines, [404, 405, 406, 407]);
  for (const key of ['production_approved', 'full_restore_accepted', 'A_signoff_claimed', 'generic_FK_UNIQUE_accepted', 'B_C_rules_accepted', 'physical_capacity_accepted', 'remote_cleanup_independently_queried']) assert.equal(result[key], false);
  assert.deepEqual(fs.readdirSync('docs/evidence').sort(), before);
});
