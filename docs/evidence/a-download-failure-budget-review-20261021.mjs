// Independent A review of D's frozen HTTP failure-budget results; no SQL/build.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace, raw, json, decode, sha256, inventory, events, changed, exact, manifest} from './a-frozen-validation-utils-20261021.mjs';
const dPath = 'docs/evidence/d-download-failure-budget-preparation-20261021.json', d = json(dPath);
assert.equal(d.status, 'local_download_failure_budget_only');
const full = 'docs/evidence/d-download-failure-budget-20261021-full';
const source = json(full + '-source.json');
assert.equal(sha256(source.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), source.source_sha256);
assert.equal(source.files.length, 1467); assert.equal(new Set(source.files.map(f => f.path)).size, source.files.length);
for (const f of source.files) {assert.match(f.path, /^(backend|contracts|scripts|docs)\//); assert.ok(!f.path.includes('\\') && !f.path.split('/').some(p => ['', '.', '..'].includes(p))); assert.match(f.sha256, /^[a-f0-9]{64}$/); assert.ok(Number.isSafeInteger(f.size) && f.size >= 0);}
for (const run of d.runs) {
  const prefix = `docs/evidence/d-download-failure-budget-20261021-${run.stage}`;
  for (const [file, pin] of [[prefix + '-source.json', run.source_manifest_sha256], [prefix + '.jsonl', run.events_sha256], [prefix + '-native.json', run.native_sha256]]) assert.equal(sha256(raw(file)), pin, file);
  const n = json(prefix + '-native.json');
  assert.equal(n.source_sha256, json(prefix + '-source.json').source_sha256);
  assert.equal(n.exit, run.stage === 'counterfactual' ? 1 : 0);
  for (const flag of ['source_postcheck', 'default_vet']) assert.equal(n[flag], true);
  for (const flag of ['dependencies_installed', 'remote']) assert.equal(n[flag], false);
  assert.equal(raw(prefix + '-stderr.txt').length, 0);
}
const packages = ['systembackupsecurity', 'systembackupevidence', 'systembackupread', 'systembackupproducer', 'systembackupgcmetadata'].map(n => 'clawreef/internal/' + n);
const passed = inventory(full + '.jsonl', packages), previous = inventory('docs/evidence/a-gc-connection-integration-20261021-r1.jsonl', packages);
assert.equal(passed.length, 6598); assert.equal(passed.filter(e => !e.Test.includes('/')).length, 782);
const key = e => `${e.Package}\0${e.Test}`, names = new Set(passed.map(key));
assert.equal(previous.length, 6591); assert.ok(previous.every(e => names.has(key(e))));
const added = passed.filter(e => !previous.some(p => key(e) === key(p))).map(e => e.Test);
const roots = ['TestDownloadHTTPFailureIndependentBudget', 'TestDownloadHTTPFailureJournalQueueDeadline', 'TestDownloadResultFailureIndependentBudget'];
exact(added, [...roots, roots[0] + '/live_request', roots[0] + '/canceled_provider_request', roots[2] + '/expired_result_transaction', roots[2] + '/public_result_failure']);
const own = ['http.go', 'download_http_failure_budget_test.go'].map(n => 'backend/internal/systembackupevidence/' + n);
const previousSource = manifest('docs/evidence/a-gc-connection-integration-20261021-r1-source.json');
exact(changed(source, previousSource).filter(p => /^(backend|contracts)\//.test(p)), own);
assert.ok(previousSource.files.every(p => source.files.some(q => q.path === p.path)));
for (const file of own) {const pin = source.files.find(f => f.path === file); assert.equal(raw(file).length, pin.size); assert.equal(sha256(raw(file)), pin.sha256);}
const http = decode(raw(own[0]));
const helper = /\/\/ Failure persistence gets its own deadline[\s\S]*?func \(s Service\) reportDownloadFailure\(parent context.Context, id, code string\) \{\n\tctx, cancel := context.WithTimeout\(context.WithoutCancel\(parent\), 5\*time.Second\)\n\tdefer cancel\(\)\n\ts.Failure\(ctx, id, code\)\n\}\n\n/;
assert.ok(helper.test(http));
const restored = http.replace(helper, '').replace('s.reportDownloadFailure(ctx, id, boundary(e).Error())', 's.Failure(context.WithoutCancel(ctx), id, boundary(e).Error())')
  .replace('\t\t\t\t\ts.reportDownloadFailure(ctx, id, "download_audit_or_release_failed")', '\t\t\t\t\tfailureContext, stop := context.WithTimeout(context.Background(), 5*time.Second)\n\t\t\t\t\ts.Failure(failureContext, id, "download_audit_or_release_failed")\n\t\t\t\t\tstop()')
  .replace('s.reportDownloadFailure(ctx, id, "download_audit_or_release_failed")', 's.Failure(ctx, id, "download_audit_or_release_failed")');
assert.equal(sha256(restored), previousSource.files.find(f => f.path === own[0]).sha256, 'HTTP changes exceed the independent failure callback budget');
const counter = events('docs/evidence/d-download-failure-budget-20261021-counterfactual.jsonl');
exact(counter.filter(e => e.Test && e.Action === 'fail').map(e => e.Test), [...roots, roots[0] + '/live_request', roots[0] + '/canceled_provider_request', roots[2] + '/expired_result_transaction']);
const cleanup = json(d.cleanup.receipt);
assert.equal(sha256(raw(d.cleanup.receipt)), d.cleanup.sha256); assert.equal(cleanup.removed, true); assert.equal(cleanup.source_postcheck, true); assert.equal(cleanup.process_terminal, true);
assert.equal(path.dirname(cleanup.absolute_owner).toLowerCase(), workspace.toLowerCase()); assert.match(path.basename(cleanup.absolute_owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/); assert.equal(fs.existsSync(cleanup.absolute_owner), false);
const record = {kind: 'a_independent_download_http_failure_budget_review', status: 'accepted_frozen_local_failure_callback_budget_only', source: full + '-source.json', source_manifest_sha256: sha256(raw(full + '-source.json')), source_sha256: source.source_sha256, source_files: 1467, events_sha256: sha256(raw(full + '.jsonl')), native_sha256: sha256(raw(full + '-native.json')), full: {main: 782, all: 6598}, previous_checks_retained: 6591, added_checks: added, counterfactual_failures: 6, own_inputs_match_tested_bytes: own, independent_callback_seconds: 5, cleanup: d.cleanup, d_receipt_sha256: sha256(raw(dPath)), reviewer_sha256: sha256(raw('docs/evidence/a-download-failure-budget-review-20261021.mjs')), no_new_go_tests_or_builds_run_by_review: true, dependencies_installed: false, actual_sql: false, physical_write_sync_timeout_proved: false, current_whole_worktree_verified: false, owner_receipt_baseline_changed: false, production_approved: false};
const output = path.join(workspace, 'docs/evidence/a-download-failure-budget-accepted-20261021.json');
if (process.argv[2] === '--check') assert.deepEqual(json('docs/evidence/a-download-failure-budget-accepted-20261021.json'), record);
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, full: record.full, retained: 6591, actual_sql: false, current_whole_worktree_verified: false}));
