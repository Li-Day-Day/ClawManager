import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => fs.readFileSync(path.join(root, name));
const text = name => read(name).toString('utf8').replace(/^\uFEFF/, '').replaceAll('\r', '');
const json = name => JSON.parse(text(name));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const goPrefix = 'docs/evidence/d-download-public-go-20261019-r18';
const nodePrefix = 'docs/evidence/d-download-public-node-20261019-r18';
const go = json(goPrefix + '-source.json');
const node = json(nodePrefix + '-source.json');
const goNative = text(goPrefix + '-native.txt');
const nodeNative = text(nodePrefix + '-native.txt');
assert.equal(go.stable_copy_verified, true); assert.equal(go.dependencies_installed, false);
assert.equal(node.backend_contract.stable_copy_verified, true); assert.equal(node.installed_dependencies, false);
assert.match(goNative, /NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread default_vet=yes/);
assert.match(goNative, /FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(goNative, /CLEANED snapshot=True/);
assert.match(goNative, /d_admission_native_exit=0/);
assert.match(nodeNative, /NATIVE_EXIT public-node=0 dependency_installation=no actual_mysql=no/);
assert.match(nodeNative, /FROZEN_POSTCHECK public-node=yes frontend=yes/);
assert.match(nodeNative, /CLEANED public-node=True/);
assert.match(nodeNative, /d_public_node_exit=0/);
assert.equal(read(goPrefix + '-stderr.txt').length, 0);
assert.equal(read(nodePrefix + '-stderr.txt').length, 0);
assert.equal(go.source_sha256, node.backend_contract.source_sha256);
assert.deepEqual(go.files, node.backend_contract.files);
const events = text(goPrefix + '.jsonl').split('\n').filter(Boolean).map(line => JSON.parse(line));
assert.equal(events.filter(e => ['fail', 'build-fail', 'skip'].includes(e.Action)).length, 0);
const packages = ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupevidence', 'clawreef/internal/systembackupread'].map(pkg => {
  const terminal = events.filter(e => e.Package === pkg && !e.Test && ['pass', 'fail'].includes(e.Action));
  assert.equal(terminal.length, 1, pkg); assert.equal(terminal[0].Action, 'pass');
  const passed = events.filter(e => e.Package === pkg && e.Test && e.Action === 'pass');
  assert.equal(new Set(passed.map(e => e.Test)).size, passed.length);
  return {package: pkg, main_pass: passed.filter(e => !e.Test.includes('/')).length, all_pass: passed.length, skipped: 0};
});
const roots = ['backend/internal/systembackupread/download_admission_operation_test.go', 'backend/internal/systembackupevidence/download_admission_public_vector_test.go']
  .flatMap(file => [...text(file).matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)].map(match => match[1]));
assert.equal(roots.length, 4);
for (const name of roots) assert.equal(events.filter(e => e.Test === name && e.Action === 'pass').length, 1, name);
const focusedGo = events.filter(e => e.Test && e.Action === 'pass' && roots.some(name => e.Test === name || e.Test.startsWith(name + '/')));
const tap = text(nodePrefix + '.tap');
const tapCount = field => Number(tap.match(new RegExp(`^# ${field} (\\d+)$`, 'm'))[1]);
assert.equal(tapCount('tests'), tapCount('pass'));
for (const field of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(tapCount(field), 0, field);
const selectedNode = tap.split('\n').filter(line => /^# Subtest: (?:public admission |public download admission |download admission |all policies validate|evidence GET )/.test(line));
assert.equal(selectedNode.length, 51);
const listingPath = 'docs/evidence/d-download-public-current-files-20261019-r18.txt';
const listed = text(listingPath).trim().split('\n').map(file => file.replaceAll('\\', '/'));
const excluded = /(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/i;
const goInclude = file => /^(?:backend|contracts|scripts|docs)\//.test(file) &&
  (!file.startsWith('docs/') || /^docs\/[^/]+\.sql$/i.test(file) || [
    'docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json',
    'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
    'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
  ].includes(file)) && !excluded.test(file) && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/i.test(file);
const supplementaryExcluded = /(?:^|\/)(?:node_modules|dist|build|cache|\.git|\.tmp[^/]*)(?:\/|$)/i;
const frontendInclude = file => !supplementaryExcluded.test(file) && (/^frontend\/(?:src|scripts|public)\//.test(file) || /^frontend\/[^/]+\.(?:json|js|ts|mjs|cjs|html)$/i.test(file));
const supportInclude = file => ['Dockerfile','docs/system-backup-restore-division-plan.md'].includes(file) ||
  file.startsWith('deployments/') && !supplementaryExcluded.test(file) && /\.(?:yaml|yml|json|sh|sql|tmpl|conf|txt|md)$/i.test(file);
const drift = [];
for (const [name, snapshot, include] of [['backend_contract', go, goInclude], ['frontend', node.frontend, frontendInclude], ['support', node.support, supportInclude]]) {
  assert.equal(hash(Buffer.from(snapshot.files.map(pin => `${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n') + '\n')), snapshot.source_sha256, name);
  const expected = new Set(snapshot.files.map(pin => pin.path));
  const current = new Set(listed.filter(include));
  for (const file of current) if (!expected.has(file)) drift.push({group: name, path: file, reason: 'new'});
  for (const pin of snapshot.files) {
    const resolved = path.resolve(root, pin.path); assert.ok(resolved.startsWith(root + path.sep));
    if (!current.has(pin.path) || !fs.existsSync(resolved)) {drift.push({group: name, path: pin.path, reason: 'missing/unlisted'}); continue;}
    const bytes = fs.readFileSync(resolved);
    if (bytes.length !== pin.size || hash(bytes) !== pin.sha256) drift.push({group: name, path: pin.path, reason: 'changed'});
  }
}
const tscPath = 'docs/evidence/d-download-public-frontend-20261019-r17.json';
const vitePath = 'docs/evidence/d-download-public-vite-20261019-r18.json';
const tsc = json(tscPath), vite = json(vitePath);
assert.equal(tsc.typescript, true); assert.equal(tsc.vite, false); assert.equal(tsc.status, 'failed');
assert.match(text('docs/evidence/d-download-public-frontend-20261019-r17-native.txt'), /NATIVE_EXIT typescript=0/);
assert.match(text('docs/evidence/d-download-public-frontend-20261019-r17-vite-stderr.txt'), /require is not defined/);
assert.equal(vite.status, 'vite_production_build_passed'); assert.equal(vite.vite, true); assert.equal(vite.source_postcheck, true);
assert.equal(vite.config_loader, 'native'); assert.ok(vite.output_files > 0);
assert.equal(tsc.source_sha256, node.frontend.source_sha256); assert.equal(vite.source_sha256, node.frontend.source_sha256);
for (const receipt of [tsc, vite]) {
  assert.deepEqual(json(receipt.source_manifest).frontend.files, node.frontend.files);
  assert.equal(receipt.artifacts_cleaned, true); assert.equal(receipt.installed_dependencies, false);
}
const cleanup = [];
const absent = (directory, parent, pattern) => {
  assert.equal(path.dirname(directory).toLowerCase(), parent.toLowerCase()); assert.match(path.basename(directory), pattern);
  assert.equal(fs.existsSync(directory), false, directory); cleanup.push({path: directory, exists: false});
};
for (const file of ['docs/evidence/d-download-public-go-20261019-r16-native.txt', goPrefix + '-native.txt',
  'docs/evidence/d-download-public-node-20261019-r16-native.txt', 'docs/evidence/d-download-public-node-20261019-r17-native.txt', nodePrefix + '-native.txt']) {
  const log = text(file); assert.match(log, /CLEANED (?:snapshot|public-node)=True/);
  absent(log.match(/owner=([^\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1], root, /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
}
for (const receipt of [tsc, vite]) absent(receipt.owned_directory, path.join(root, 'frontend'), /^\.tmp-d-frontend-build-[a-f0-9]{32}$/);
const cache = json('docs/evidence/d-download-public-run-owner-20261019-r18.json');
assert.equal(path.basename(cache.path), '.tmp-d-admission-public-' + cache.owner);
absent(cache.path, root, /^\.tmp-d-admission-public-[a-f0-9]{32}$/);
const strict = json('docs/evidence/d-download-public-contract-strict-20261019-r17.json');
assert.equal(strict.contract_status, 'draft'); assert.ok(strict.blockers.policy_pending.length > 0); assert.ok(strict.blockers.cross_review_pending.length > 0);
assert.deepEqual(json('docs/evidence/d-download-public-contract-check-20261019-r17.json'), strict);
const failed = [
  'docs/evidence/d-download-public-focused-20261019-r14.txt',
  'docs/evidence/d-download-public-go-20261019-r16.jsonl',
  'docs/evidence/d-download-public-node-20261019-r16.tap',
  'docs/evidence/d-download-public-node-20261019-r17.tap',
  'docs/evidence/d-download-public-frontend-20261019-r17-vite-stderr.txt',
].map(file => ({path: file, sha256: hash(read(file)), accepted_as_whole_run_pass: false}));
const result = {
  kind: 'd_download_public_read_frozen_review', packages,
  go_main_pass: packages.reduce((sum, pkg) => sum + pkg.main_pass, 0), go_all_pass: packages.reduce((sum, pkg) => sum + pkg.all_pass, 0),
  new_go_roots: roots, new_go_all_pass: focusedGo.length, node_tests: tapCount('tests'), selected_new_node_cases: selectedNode.length,
  source_counts: {backend_contract: go.files.length, frontend: node.frontend.files.length, support: node.support.files.length},
  source_sha256: go.source_sha256, frontend_source_sha256: node.frontend.source_sha256, support_source_sha256: node.support.source_sha256,
  go_capture_attempts: go.capture_attempts, node_capture_attempts: node.backend_contract.capture_attempts,
  current_source_drift: drift, current_sources_match: drift.length === 0,
  log_hashes: {go: hash(read(goPrefix + '.jsonl')), node: hash(read(nodePrefix + '.tap')), go_native: hash(read(goPrefix + '-native.txt')), node_native: hash(read(nodePrefix + '-native.txt')), current_listing: hash(read(listingPath))},
  frontend: {typescript_stage_passed: true, original_tsc_vite_whole_run_passed: false, subsequent_native_loader_vite_passed: true, same_source: true, output_files: vite.output_files, browser_or_runtime_verified: false},
  cleanup, preserved_failed_runs: failed, strict_summary: strict.summary,
  installed_dependencies: false, actual_mysql: false, current_server_rerun: false, formal_contract_frozen: false, formal_schema_approval: false,
  http_download_runtime_wired: false, production_enabled: false, original_six_scopes_complete: false,
  limitations: 'Public enum/schema/policy/GET declarations, native producer/read models and TS client validation/build only. No real InnoDB, deployed owner/capacity/keys/grants, download HTTP/provider integration, new browser E2E, historical upgrade or full original-goal completion.'
};
fs.writeFileSync(path.join(root, 'docs/evidence/d-download-public-review-20261019-r18.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({go_main_pass: result.go_main_pass, go_all_pass: result.go_all_pass, new_go_roots: roots.length, new_go_all_pass: focusedGo.length, node_tests: result.node_tests, source_counts: result.source_counts, current_source_drift: drift, cleaned_directories: cleanup.length}));
