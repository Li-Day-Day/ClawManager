import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildDownloadAuditInputs } from '../../scripts/system-backup-d-download-audit-bundle.mjs';
const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root));
const sha = b => createHash('sha256').update(b).digest('hex');
const logPath = 'docs/evidence/d-download-admission-audit-local-20261016-r50.txt';
const manifestPath = 'docs/evidence/d-download-admission-audit-source-20261016-r50.json';
const log = read(logPath).toString('utf8'), m = JSON.parse(read(manifestPath));
assert.equal(m.stable_copy_verified, true);
const digest = sha(m.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
assert.equal(digest,m.source_sha256);
assert.ok(log.includes(`LOCAL_SOURCE d-download-audit-frozen=yes files=${m.files.length} source_sha256=${digest}`));
assert.match(log,/^d_download_admission_audit_exit=0\s*$/m);
assert.match(log,/^LOCAL_PASS d-download-audit-frozen-postcheck=yes remote-requested=False dependencies-installed=no\s*$/m);
assert.match(log,/^CLEANED download-audit-local-source-cache=True\s*$/m);
assert.match(log,/PASS download-audit dispatch bindings=13 dedicated-root=yes network=no products=none/);
assert.match(log,/LOCAL_STAGE download-audit buffered-reports=yes default-vet=yes retry=no/);
assert.match(log,/go version go1\.26\.1 linux\/amd64/);
assert.doesNotMatch(log,/^\s*--- FAIL:|CLEANUP_PENDING|^panic:|^fatal error:/m);
const groups=[],active=new Map();let bundle;
for(const line of log.split(/\r?\n/)) {
  if(!line.startsWith('{'))continue;
  let e;try{e=JSON.parse(line)}catch{continue}
  if(e.kind==='d_download_audit_bundle'){assert.equal(bundle,undefined);bundle=e;continue}
  if(!e.Package)continue;
  assert.notEqual(e.Action,'fail');assert.notEqual(e.Test,'TestDDownloadAdmissionAuditMySQL');
  if(e.Action==='start')active.set(e.Package,[]);
  assert.ok(active.has(e.Package));active.get(e.Package).push(e);
  if(e.Action==='pass'&&!e.Test) {
    const tests=active.get(e.Package).filter(x=>x.Action==='pass'&&x.Test).map(x=>x.Test);
    groups.push({package:e.Package,top_level:tests.filter(t=>!t.includes('/')).length,including_subtests:tests.length,tests});
  }
}
assert.equal(groups.length,3);
const defaults=groups.filter(g=>!g.tests.includes('TestDDownloadAdmissionAuditMySQLSeed'));
assert.equal(defaults.length,2);
const fresh=defaults.flatMap(g=>g.tests).filter(t=>t.startsWith('TestDownloadAdmissionAudit'));
const sourceTests=path=>[...read(path).toString('utf8').matchAll(/^func (TestDownloadAdmissionAudit\w+)\(/gm)].map(m=>m[1]);
const ownNames=sourceTests('backend/internal/systembackupevidence/download_admission_audit_test.go');
const aNames=sourceTests('backend/internal/systembackupevidence/download_admission_audit_a_test.go');
const own=fresh.filter(t=>ownNames.includes(t.split('/')[0]));
const independent=fresh.filter(t=>aNames.includes(t.split('/')[0]));
assert.equal(ownNames.length,5);assert.equal(own.length,34);
assert.equal(aNames.length,3);assert.equal(independent.length,27);
assert.equal(fresh.length,61);
const seed=groups.find(g=>g.tests.includes('TestDDownloadAdmissionAuditMySQLSeed'));
assert.equal(seed.top_level,1);assert.equal(seed.including_subtests,6);
assert.equal((log.match(/^--- PASS: TestDDownloadAdmissionAuditMySQLSeed \(/gm)??[]).length,1);
assert.equal((log.match(/^    --- PASS: TestDDownloadAdmissionAuditMySQLSeed\//gm)??[]).length,5);
assert.ok(bundle);assert.equal(bundle.image_pull_policy,'Never');assert.equal(bundle.catalog_migrations,95);
const capsule=buildDownloadAuditInputs();
assert.equal(sha(Buffer.from(JSON.stringify(capsule))),bundle.pins.find(p=>p.path==='d-download-audit-inputs.json').sha256);
const focused=m.files.filter(p=>p.path.startsWith('backend/internal/systembackupevidence/')||p.path.startsWith('backend/internal/systembackupsecurity/')||
  p.path.startsWith('scripts/system-backup-d-download-audit-')||/^backend\/go\.(mod|sum)$/.test(p.path)||
  p.path.startsWith('backend/internal/db/migrations/')||['scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-evidence-go-step.ps1',
    'scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh',
    'scripts/system-backup-d-migration-phase.sh','backend/internal/systembackupcontroller/bootstrap.go'].includes(p.path));
for(const pin of focused){const bytes=read(pin.path);assert.equal(bytes.length,pin.size,pin.path);assert.equal(sha(bytes),pin.sha256,pin.path)}
const decision='docs/evidence/system-backup-d-sensitive-download-contract-20261016.json';
assert.equal(sha(read(decision)),'8b14d0804e9bfb4b5169bc585fd1aa50d38877b61b228984184c7427d73d8eac');
const erratum='docs/evidence/system-backup-d-sensitive-download-erratum-20261016-r47.json';
assert.equal(JSON.parse(read(erratum)).decision_sha256,sha(read(decision)));
const source=read('backend/internal/systembackupevidence/download_admission_audit_mysql_test.go').toString('utf8');
assert.ok(source.includes('"actual_insert_id_and_timestamp", "rollback_visibility", "same_transaction_mutation", "cross_transaction_anchor"'));
const owner=log.match(/^LOCAL_OWNER download-audit-source=.+[\\/](\.tmp-d-index-cache-([a-f0-9]{32})) container=(codex-d-download-audit-[a-f0-9]{32})\s*$/m);
assert.ok(owner);assert.equal(owner[3],`codex-d-download-audit-${owner[2]}`);assert.equal(existsSync(new URL(owner[1],root)),false);
const report={kind:'d_download_admission_audit_local_acceptance.v1',recorded_at:new Date().toISOString(),status:'local_audit_component_and_probe_preparation_accepted_actual_mysql_pending',
  raw_log:logPath,raw_log_sha256:sha(read(logPath)),source_manifest:manifestPath,source_manifest_sha256:sha(read(manifestPath)),source_files:m.files.length,source_sha256:digest,
  go_groups:groups,default_main:defaults.reduce((n,g)=>n+g.top_level,0),default_including_subtests:defaults.reduce((n,g)=>n+g.including_subtests,0),
  new_component_main:5,new_component_including_subtests:34,independent_a_main:3,independent_a_including_subtests:27,total_audit_component_main:8,total_audit_component_including_subtests:61,
  reviewer_count_correction:'Initial reviewer expected only D five roots; actual frozen run also contains three independent A roots. Counts corrected by actual source declarations without rerunning Go.',
  seed_main:1,seed_including_subtests:6,detached_seed_repeat_not_added:true,
  payloads:bundle.pins,focused_current_pins:focused.length,decision,decision_sha256:sha(read(decision)),erratum,erratum_sha256:sha(read(erratum)),
  owner_directory_checked_absent:owner[1],container_name:owner[3],exit_code:0,dependencies_installed:false,remote_executed:false,actual_mysql_case_executions:0,
  default_vet:true,buffered_original_reports:true,per_gate_test_retries:0,earlier_failures_retained:true,
  actual_audit_INSERT_ID_component:true,SQL_model_only:true,nonce_consumption_implemented:false,full_prelocked_prefix_implemented:false,
  operation_receipt_atomic_admission_implemented:false,production_adapter_enabled:false,formal_migrations_added:false,production_approval:false,overall_goal_complete:false,
  preserved_prior_attempts:['docs/evidence/d-download-admission-audit-local-20261016-r47.txt','docs/evidence/d-download-admission-audit-local-20261016-r48.txt','docs/evidence/d-download-admission-audit-local-20261016-r49.txt']};
writeFileSync(new URL('./system-backup-d-download-audit-review-20261016-r50.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,default:[report.default_main,report.default_including_subtests],new_component:[5,34],independent_a:[3,27],seed:[1,6],focused:focused.length,actual_mysql:0,cleanup:true}));
