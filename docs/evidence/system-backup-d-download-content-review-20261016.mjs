// Read-only inspection of the frozen local gate; never invokes Go, SSH or SQL.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const sha=b=>createHash('sha256').update(b).digest('hex');
const round=process.argv.find(v=>/^r[0-9]+$/.test(v))??'r57';
const logPath=`docs/evidence/d-download-admission-content-local-20261016-${round}.txt`;
const manifestPath=`docs/evidence/d-download-admission-content-source-20261016-${round}.json`;
const log=read(logPath).toString('utf8').replaceAll('\r\n','\n'),m=JSON.parse(read(manifestPath));
const digest=sha(m.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
assert.equal(m.source_sha256,digest);assert.equal(m.stable_copy_verified,true);
assert.ok(log.includes(`LOCAL_SOURCE d-download-audit-frozen=yes files=${m.files.length} source_sha256=${digest}`));
for(const marker of ['d_download_admission_content_local_exit=0','LOCAL_PASS d-download-audit-frozen-postcheck=yes remote-requested=False dependencies-installed=no','CLEANED download-audit-local-source-cache=True','LOCAL_STAGE download-audit buffered-reports=yes default-vet=yes retry=no','PASS download-audit dispatch bindings=13 dedicated-root=yes network=no products=none'])assert.ok(log.includes(marker),marker);
assert.doesNotMatch(log,/^\s*--- FAIL:|CLEANUP_PENDING|^panic:|^fatal error:/m);
const active=new Map(),groups=[],events=log.split('\n').filter(l=>l.startsWith('{"Time":')).map(l=>JSON.parse(l));
for(const e of events){
  assert.ok(!['fail','skip'].includes(e.Action));
  if(e.Action==='start')active.set(e.Package,[]);
  if(e.Action==='pass'&&e.Test){assert.ok(active.has(e.Package));active.get(e.Package).push(e.Test)}
  if(e.Action==='pass'&&!e.Test)groups.push({package:e.Package,tests:active.get(e.Package)});
}
assert.equal(groups.length,3);
const defaults=groups.filter(g=>!g.tests.includes('TestDDownloadAdmissionAuditMySQLSeed'));
assert.equal(defaults.length,2);assert.equal(new Set(defaults.map(g=>g.package)).size,2);
const componentSource='backend/internal/systembackupevidence/download_admission_content_test.go';
const roots=[...read(componentSource).toString('utf8').matchAll(/^func (TestDownloadAdmission\w+)\(/gm)].map(v=>v[1]);
assert.equal(roots.length,4);
const component=defaults.flatMap(g=>g.tests).filter(n=>roots.includes(n.split('/')[0]));
for(const name of roots)assert.equal(component.filter(n=>n===name).length,1,name);
const seed=groups.find(g=>g.tests.includes('TestDDownloadAdmissionAuditMySQLSeed'));assert.equal(seed.tests.length,6);
assert.ok(!events.some(e=>/^TestDDownloadAdmissionAuditMySQL(?:\/|$)/.test(e.Test??'')));
const pins=m.files.filter(p=>/^backend\/internal\/(systembackupevidence|systembackupsecurity)\//.test(p.path)||/^backend\/go\.(mod|sum)$/.test(p.path)||p.path.startsWith('scripts/system-backup-d-download-audit-'));
const drift=[];
for(const p of pins){if(!existsSync(new URL(p.path,root))||sha(read(p.path))!==p.sha256)drift.push(p.path)}
// Current runtime/default-test drift invalidates current acceptance. Tagged
// probes are separately recorded rather than inheriting this default run.
for(const path of drift)assert.match(read(path).toString('utf8'),/^\/\/go:build systembackup_mysql\b/);
const owner=log.match(/^LOCAL_OWNER download-audit-source=.+[\\/](\.tmp-d-index-cache-([a-f0-9]{32})) container=(codex-d-download-audit-[a-f0-9]{32})$/m);
assert.ok(owner);assert.equal(owner[3],`codex-d-download-audit-${owner[2]}`);assert.ok(!existsSync(new URL(owner[1],root)));
const decision='docs/evidence/system-backup-d-sensitive-download-contract-20261016.json';
assert.equal(sha(read(decision)),'8b14d0804e9bfb4b5169bc585fd1aa50d38877b61b228984184c7427d73d8eac');
const report={kind:'d_download_admission_content_local_acceptance',recorded_at:new Date().toISOString(),status:'private_receipt_and_public_operation_codecs_accepted_only',raw_log:logPath,raw_log_sha256:sha(read(logPath)),source_manifest:manifestPath,source_manifest_sha256:sha(read(manifestPath)),source_files:m.files.length,source_sha256:digest,default_main:defaults.flatMap(g=>g.tests).filter(n=>!n.includes('/')).length,default_including_subtests:defaults.flatMap(g=>g.tests).length,component_main:roots.length,component_including_subtests:component.length,component_tests:component,seed_checks:6,seed_repeat_not_added:true,focused_pins:pins.length,excluded_tagged_probe_drift:drift,owner_checked_absent:owner[1],container:owner[3],process_exit:0,default_vet:true,dependencies_installed:false,remote_executed:false,actual_new_SQL_executions:0,persistent_receipt_store:false,full_prelocked_admission:false,nonce_consumption:false,formal_schema_or_approval:false,production_enabled:false,overall_complete:false};
assert.ok(defaults.flatMap(g=>g.tests).includes('TestSystemPublicationClaimAfterSlowLocalSetup'));
report.slow_setup_regression=true;
report.frozen_scope_only=true;
report.additions_outside_manifest_not_accepted=true;
report.prior_failed_round='docs/evidence/d-download-admission-content-local-20261016-r56.txt';
if(process.argv.includes('--record'))writeFileSync(new URL(`system-backup-d-download-content-review-20261016-${round}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,default:[report.default_main,report.default_including_subtests],component:[report.component_main,report.component_including_subtests],focused:pins.length,taggedDrift:drift.length,cleanup:true}));
