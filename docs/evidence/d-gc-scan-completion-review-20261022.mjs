import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const evidence = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(evidence, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8').replace(/^\uFEFF/, ''));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stages = {};
for (const stage of ['baseline', 'focused', 'published']) {
  const prefix = `d-gc-scan-completion-20261022-${stage}`;
  const native = read(`${prefix}-native.json`);
  assert.equal(native.exit, stage === 'baseline' ? 1 : 0);
  if (stage === 'published') {
    const drift = read('d-gc-scan-completion-drift-accepted-20261022.json');
    assert.equal(native.input_unchanged, false);
    assert.equal(native.input_before_sha256, drift.pre_test_sha256);
    assert.equal(native.input_after_sha256, drift.post_test_sha256);
    assert.equal(drift.selected_before_sha256, drift.selected_after_sha256);
    assert.equal(drift.full_package_result_accepted, true);
    assert.equal(drift.tagged_probe_changes_accepted, false);
  } else {
    assert.equal(native.input_unchanged, true);
    assert.equal(native.input_before_sha256, native.input_after_sha256);
  }
  assert.equal(native.default_vet, true);
  assert.equal(native.dependencies_installed, false);
  assert.equal(native.remote_executed, false);
  const events = fs.readFileSync(path.join(evidence, `${prefix}.stdout`), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line.replace(/^\uFEFF/, '')));
  const failed = events.filter(e => e.Action === 'fail' && e.Test).map(e => e.Test);
  const passed = events.filter(e => e.Action === 'pass' && e.Test).map(e => e.Test);
  assert.equal(events.filter(e => e.Action === 'skip').length, 0);
  if (stage === 'baseline') {
    const expectedLeaves = [
      ...['empty_epoch', 'closed_cursor'].flatMap(shape => ['lost_reply', 'tx_done', 'canceled'].map(mode => `TestDownloadRetentionGCScanCompletion/${shape}/${mode}`)),
      ...['empty_tail', 'page'].flatMap(shape => ['tx_done', 'canceled'].map(mode => `TestDownloadRetentionGCScanCompletion/${shape}/${mode}`)),
      ...['empty_epoch', 'closed_cursor'].map(shape => `TestDownloadRetentionGCBatchScanRollbackFailure/${shape}`),
    ];
    assert.deepEqual(failed.filter(name => name.includes('/')).sort(), expectedLeaves.sort());
    assert.equal(failed.length, expectedLeaves.length + 2);
    assert.equal(passed.length, 12);
  } else {
    assert.equal(failed.length, 0);
    assert.equal(events.at(-1).Action, 'pass');
    if (stage === 'focused') assert.equal(passed.length, 26);
  }
  stages[stage] = { exit: native.exit, passed: passed.length, roots: passed.filter(name => !name.includes('/')).length, failed, source_sha256: native.frozen_source_sha256, input_count: native.input_count, stdout_sha256: digest(path.join(evidence, `${prefix}.stdout`)), stderr_sha256: digest(path.join(evidence, `${prefix}.stderr`)) };
}
const base = read('d-gc-scan-completion-base-20261022.json');
const candidate = read('d-gc-scan-completion-candidate-20261022.json');
const changed = candidate.files.filter(file => base.files.find(old => old.path === file.path)?.sha256 !== file.sha256).map(file => file.path);
assert.deepEqual(changed, ['backend/internal/systembackupevidence/download_retention_gc_batch.go']);
// Reconstruct the exact old bytes, rather than trusting a one-file hash delta
// to establish that no unrelated local edits were folded into the fix.
let original = fs.readFileSync(path.join(root, changed[0]), 'utf8');
const replaceOnce = (from, to) => {
  assert.equal(original.split(from).length, 2, `Reverse patch anchor: ${from}`);
  original = original.replace(from, to);
};
replaceOnce('\t"context"\n', '\t"context"\n\t"database/sql"\n');
replaceOnce('(candidates []downloadGCBatchCandidate, through int64, more bool, scanErr error)', '([]downloadGCBatchCandidate, int64, bool, error)');
replaceOnce([
  '\t// Every path, including an empty range, must observe transaction completion',
  '\t// before releasing hints. ErrTxDone does not establish the driver\'s earlier',
  '\t// rollback result. This scan performs no writes; report an audit failure,',
  '\t// discard all hints and let the caller retain its original cursor.',
  '\tdefer func() {',
  '\t\tif err := tx.Rollback(); err != nil || ctx.Err() != nil {',
  '\t\t\tcandidates, through, more, scanErr = nil, 0, false, ErrAudit',
  '\t\t}',
  '\t}()',
].join('\n'), '\tdefer tx.Rollback()');
replaceOnce('\tthrough = cursor.ThroughID', '\tthrough := cursor.ThroughID');
replaceOnce('\tcandidates = []downloadGCBatchCandidate{}', '\tcandidates := []downloadGCBatchCandidate{}');
replaceOnce('\tmore = len(candidates) > limit', '\tmore := len(candidates) > limit');
replaceOnce('\treturn candidates, through, more, nil', [
  '\t// Do not carry a connection/lock/snapshot into a candidate transaction.',
  '\tif err = tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {',
  '\t\treturn nil, 0, false, ErrAudit',
  '\t}',
  '\treturn candidates, through, more, nil',
].join('\n'));
assert.equal(crypto.createHash('sha256').update(original).digest('hex'), base.files.find(file => file.path === changed[0]).sha256);
for (const name of [...changed, 'backend/internal/systembackupevidence/download_retention_gc_scan_completion_test.go']) {
  assert.equal(digest(path.join(root, name)), candidate.files.find(file => file.path === name).sha256, `Current source changed: ${name}`);
}
const owner = path.join(root, '.tmp-d-index-cache-91d7897bdfb34761ad4adce2669bb651');
const cleaned = !fs.existsSync(owner);
if (process.argv.includes('--check')) {
  const accepted = read('d-gc-scan-completion-accepted-20261022.json');
  assert.deepEqual(accepted.stages, stages);
  assert.equal(accepted.cleaned, true);
  assert.equal(cleaned, true);
} else {
  assert.equal(cleaned, true, 'Clean this run owner before final acceptance');
  fs.writeFileSync(path.join(evidence, 'd-gc-scan-completion-accepted-20261022.json'), JSON.stringify({ kind: 'd_gc_scan_completion_acceptance', stages, changed, cleaned, actual_mysql: false, remote_executed: false, dependencies_installed: false, production_approved: false }, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ status: 'accepted', stages, cleaned }));
