import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prefix = process.argv[2];
assert.match(prefix ?? '', /^d-download-committed-packages-20261019-r\d+$/);
const relative = `docs/evidence/${prefix}`;
const bytes = name => fs.readFileSync(path.join(root, name));
const text = name => bytes(name).toString('utf8').replace(/^\uFEFF/, '').replaceAll('\r', '');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(text(relative + '-source.json'));
const native = text(relative + '-native.txt');
assert.equal(manifest.stable_copy_verified, true);
assert.equal(manifest.dependencies_installed, false);
assert.match(native, /NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread default_vet=yes/);
assert.match(native, /FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native, /CLEANED snapshot=True/);
assert.match(native, /d_admission_native_exit=0/);
assert.equal(bytes(relative + '-stderr.txt').length, 0);
const events = text(relative + '.jsonl').split('\n').filter(Boolean).map(line => JSON.parse(line));
assert.equal(events.filter(e => ['fail', 'build-fail', 'skip'].includes(e.Action)).length, 0);
const packages = ['security','evidence','read'].map(suffix => {
  const pkg = 'clawreef/internal/systembackup' + suffix;
  const terminal = events.filter(e => e.Package === pkg && !e.Test && ['pass','fail'].includes(e.Action));
  assert.equal(terminal.length, 1, pkg); assert.equal(terminal[0].Action, 'pass');
  const tests = events.filter(e => e.Package === pkg && e.Test && e.Action === 'pass');
  assert.equal(new Set(tests.map(e => e.Test)).size, tests.length);
  return {package: pkg, main_pass: tests.filter(e => !e.Test.includes('/')).length, all_pass: tests.length};
});
const roots = [...text('backend/internal/systembackupevidence/download_committed_test.go').matchAll(/^func (TestCommittedDownload\w+)\(t \*testing\.T\)/gm)].map(m => m[1]);
assert.ok(roots.length >= 5);
for (const name of roots) assert.equal(events.filter(e => e.Action === 'pass' && e.Test === name).length, 1, name);
const selected = events.filter(e => e.Action === 'pass' && e.Test && roots.some(r => e.Test === r || e.Test.startsWith(r + '/')));
assert.equal(sha(Buffer.from(manifest.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n')), manifest.source_sha256);
const drift = [];
const listed = text(relative + '-current-files.txt').trim().split('\n').map(p => p.replaceAll('\\','/'));
const excluded = /(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/i;
const include = file => /^(?:backend|contracts|scripts|docs)\//.test(file) &&
  (!file.startsWith('docs/') || /^docs\/[^/]+\.sql$/i.test(file) || [
    'docs/system-backup-restore-schema-inventory.json', 'docs/evidence/a-config-canonical-request-vectors-20261014.json',
    'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
    'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
  ].includes(file)) && !excluded.test(file) && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/i.test(file);
const current = new Set(listed.filter(include)), expected = new Set(manifest.files.map(f => f.path));
for (const file of current) if (!expected.has(file)) drift.push({path:file, reason:'new'});
for (const file of manifest.files) {
  const resolved = path.resolve(root, file.path); assert.ok(resolved.startsWith(root + path.sep));
  if (!current.has(file.path) || !fs.existsSync(resolved)) { drift.push({path:file.path,reason:'missing'}); continue; }
  const b = fs.readFileSync(resolved);
  if (b.length !== file.size || sha(b) !== file.sha256) drift.push({path:file.path,reason:'changed'});
}
const ownedCache = path.join(root,'.tmp-d-admission-committed-20261019-r20');
const snapshot = native.match(/owner=([^\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
const earlierNative = text('docs/evidence/d-download-committed-packages-20261019-r21-native.txt');
assert.match(earlierNative,/d_admission_native_exit=0/);
assert.match(earlierNative,/CLEANED snapshot=True/);
const earlierSnapshot = earlierNative.match(/owner=([^\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
const cleanup = [ownedCache,earlierSnapshot,snapshot].map(dir => {
  assert.equal(path.dirname(dir).toLowerCase(), root.toLowerCase());
  assert.equal(fs.existsSync(dir),false,dir);
  return {path:dir,exists:false};
});
const result = {
  kind:'d_download_committed_binding_frozen_review', source_files:manifest.files.length, source_sha256:manifest.source_sha256,
  capture_attempts:manifest.capture_attempts, packages,
  go_main_pass:packages.reduce((n,p)=>n+p.main_pass,0), go_all_pass:packages.reduce((n,p)=>n+p.all_pass,0),
  new_roots:roots, new_all_pass:selected.length, current_source_drift:drift, current_sources_match:drift.length===0,
  hashes:{go_log:sha(bytes(relative+'.jsonl')),native:sha(bytes(relative+'-native.txt')),manifest:sha(bytes(relative+'-source.json'))}, cleanup,
  earlier_focused_run:{path:'docs/evidence/d-download-committed-focused-20261019-r20.jsonl',sha256:sha(bytes('docs/evidence/d-download-committed-focused-20261019-r20.jsonl')),scope:'working tree smoke only, before subsequent final guards/provider-positive additions'},
  earlier_full_run:{path:'docs/evidence/d-download-committed-packages-20261019-r21.jsonl',sha256:sha(bytes('docs/evidence/d-download-committed-packages-20261019-r21.jsonl')),scope:'its own frozen sources, before provider-positive/history additions and duplicate-read removal'},
  installed_dependencies:false, actual_mysql:false, current_server_rerun:false, production_enabled:false,
  http_download_runtime_wired:false, result_audit_wired:false, original_six_scopes_complete:false,
  limitations:'Real JWT/EdDSA admission and SQL download/provider guards on scripted SQL and synthetic owner/capacity. No actual InnoDB, deployed provider/token exchange, HTTP dispatch/result audit, formal schema/grants, owner/physical capacity, historical deployment or full original-goal acceptance.'
};
fs.writeFileSync(path.join(root,relative+'-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({go_main_pass:result.go_main_pass,go_all_pass:result.go_all_pass,new_roots:roots.length,new_all_pass:selected.length,source_files:manifest.files.length,drift,cleanup:cleanup.length}));
