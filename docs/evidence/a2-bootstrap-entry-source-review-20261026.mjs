import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { cases } from './d-bootstrap-entry-mysql-review-20261026.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode)&&extra.length===0,'Expected --write or --check');
const output='docs/evidence/a2-bootstrap-entry-source-reviewed-20261026.json';
assert.equal(fs.existsSync('docs/evidence/a2-bootstrap-entry-vector-lookup-gap-20261026.json'),false,
 'This preliminary source review was withdrawn after missing actual fixture group/ID resolution; see a2-bootstrap-entry-vector-lookup-gap-20261026.json. Fresh corrected-source review is required.');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p);
const text=p=>read(p).toString('utf8');
const json=p=>JSON.parse(text(p).replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)};};
const manifests=[
 ['docs/evidence/a-bootstrap-entry-source-ready-20261026-r2.json','a_bootstrap_entry_source_ready.v1','01a1676e-1c7a-7cd3-89fe-f188be645950',7],
 ['docs/evidence/d2-bootstrap-entry-source-ready-20261026.json','d_bootstrap_entry_source_ready.v1','01a1678e-27d8-7823-af8d-ea362169a481',8],
 ['docs/evidence/d-bootstrap-entry-source-ready-20261026.json','d_bootstrap_entry_probe_source_ready.v1','01a1676d-ff9a-7a71-9df5-bfb6b97c3f84',9],
];
const files=new Map();
for(const [path,kind,owner,count]of manifests){
 const r=json(path);assert.equal(r.kind,kind);assert.equal(r.owner_chat,owner);assert.equal(r.production_approved,false);
 assert.equal(r.files.length,count);assert.equal(new Set(r.files.map(p=>p.path)).size,count);
 for(const p of r.files){assert.deepEqual(pin(p.path),p);if(files.has(p.path))assert.deepEqual(files.get(p.path),p);files.set(p.path,p);}
}
assert.equal(files.size,24);
const probe='backend/internal/systembackupevidence/bootstrap_entry_mysql_test.go',source=text(probe);
assert.equal(pin(probe).sha256,'fe6fce771300f6393b216b2e9cff6b2a6ff6ee4b4ec9f39b4758e3c96ed3f09c');
const list=/var bootstrapEntryCases = \[\]string\{([^}]+)\}/.exec(source);assert.ok(list);
const names=[...list[1].matchAll(/"([a-z0-9_]+)"/g)].map(m=>m[1]);
assert.deepEqual(names,cases);assert.equal(new Set(names).size,22);
const success='docs/evidence/a2-bootstrap-entry-receiver-tests-no-isolation-20261026.txt';
const first='docs/evidence/a2-bootstrap-entry-receiver-tests-20261026.txt';
for(const s of ['# tests 33','# pass 33','# fail 0','# cancelled 0','# skipped 0'])assert.ok(text(success).split(/\r?\n/).includes(s));
assert.match(text(first),/EPERM/);assert.match(text(first),/spawn/);
const core='backend/internal/systembackupsecurity/config_bootstrap_transaction.go';
assert.equal((text(core).match(/matrix != g\.MatrixKey/g)||[]).length,2);
const wrapper='scripts/system-backup-d-bootstrap-entry-mysql-validation.ps1';
const marker=text(wrapper).split(/\r?\n/).findIndex(l=>l.includes("Write-Output ('BOOTSTRAP_ORIGINAL_MATERIALS_MYSQL_RESULT="))+1;
assert.ok(marker>0);
const checkpoints=[
 ['pre_C1_history','bootstrapEntryNew invokes the original A Bootstrap inside beforeDDL with C1 absent; dProducerMySQLDB installs the requested original C1 DDL afterward. Canonical A tables are SHOW CREATE clones from the exact 96-migration ledger and retain real FKs.'],
 ['hidden_C1_identity','A real random run-owned account receives only eight A table grants. Metadata must show zero C1 tables and direct SELECT must return typed 1142. Actual A prefix access and exported fence rejection are both checked.'],
 ['history_authorization','Exact successful original operation, disabled v1/config and compatible configured domain are required. Real users revocation and synthetic current authority denial are negatives. A1 r2 now checks persistent matrix_key in initial history and final readback.'],
 ['late_domain_mutation','The second Authorize callback changes canonical domain epoch/row version in the original transaction; RowsAffected must be one. The rejected call is checked against full A/D row snapshots.'],
 ['domain_PK_gap','The original A service holds the domain absence range. A direct writer omits installation locks. performance_schema must show the exact requester/blocker, domains PRIMARY RECORD INSERT_INTENTION edge. Cancellation releases it and only the deliberate domain row may remain.'],
 ['binding_and_commit_unknown','Wrong context/transaction negatives call the exported fence. COMMIT acknowledgement is hidden only after actual driver Commit succeeds; retry must be read-only history without a second reservation.'],
 ['cleanup','The low-privilege connection closes before its account is dropped. Per-case DB teardown confirms absence under the pinned server UUID. Gap workers have bounded cancel/rollback/wait cleanup; receiver rejects CLEANUP_PENDING, failures and skips.'],
 ['receiver','Exactly 22 child runs/passes and scoped fixture/DomainOpener/variant/visibility/mutation/waitgraph/result/cleanup markers are required. Parent PASS, pinned migrations/images/binaries, UID, cleanup and exit order are checked.'],
].map(([name,evidence])=>({name,evidence}));
const result={
 kind:'a2_bootstrap_entry_probe_independent_source_review.v1',status:'source_review_complete_native_and_actual_SQL_unproven',
 probe:pin(probe),planned_actual_cases:cases,
 ready_manifests:manifests.map(([path,kind,owner,count])=>({...pin(path),kind,owner,files:count})),
 ready_files_union:[...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),
 ready_schema_collision_resolved:true,A1_r2_matrix_source_checked:true,checkpoints,Go_probe_source_findings:[],
 nonblocking_wrapper_finding:{priority:3,path:wrapper,line:marker,description:'Entry wrapper still prints BOOTSTRAP_ORIGINAL_MATERIALS_MYSQL_RESULT. Its JSON kind/suite/file prefix are correct and no current parser consuming this label was found. Use an entry-specific label and update the ready pin before future use; do not modify an in-flight snapshot.'},
 independent_receiver_regression:{
  command:['node','--test','--test-isolation=none','--test-reporter=tap','docs/evidence/d-bootstrap-entry-mysql-review-20261026.test.mjs'],
  native_exit:0,synthetic_tests:33,pass:33,fail:0,skipped:0,log:pin(success),build_products_created:false,
  first_harness_attempt:{native_exit:1,reason:'Sandbox denied child-process spawn before receiver assertions; EPERM preserved.',log:pin(first)},
 },
 not_proven:[
  'New entry Go seed/full packages/Linux/terminal cleanup need their own accurate gate.',
  'These 22 MySQL cases were not executed by this review.',
  'The SQL suite calls ConfigBootstrapService and the fence, not the deployed CLI/candidate Apply path.',
  'Resource/deployment authority and domain state variants are synthetic; real current grant/RBAC/material composition is separate.',
  'Views/wrong-engine/unknown-metadata negatives and all common-prefix protocols are not all actual SQL cases in this suite.',
  'Provider permissions, physical capacity, 27 owner slots and production readiness remain unaccepted.',
 ],
 Go_executed:false,actual_SQL:false,dependencies_installed:false,remote_contacted:false,credentials_read:false,production_approved:false,goal_complete:false,
};
result.inputs=[...manifests.map(m=>m[0]),first,success,'docs/evidence/d-bootstrap-entry-independent-requirements-20261026.json','docs/evidence/d-resources-mysql-actual-review-20261023.mjs','docs/evidence/a2-bootstrap-entry-source-review-20261026.mjs'].map(pin);
for(const p of files.values())assert.deepEqual(pin(p.path),p,'Source changed during read-only review');
if(mode==='--write')fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),result);
process.stdout.write(JSON.stringify({mode,output,source_union:24,planned_actual_cases:22,synthetic_receiver_pass:33,Go_probe_source_findings:0,nonblocking_label_line:marker,Go_executed:false,actual_SQL:false})+'\n');
