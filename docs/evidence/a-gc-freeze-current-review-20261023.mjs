// Current four-file standalone validation; keep the old two-file decision intact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const stem='docs/evidence/d-gc-freeze-protocol-d49501bd26ef47a4ba1ad6d27f9c69fd';
const r=json(stem+'.json');
assert.equal(r.kind,'d_gc_freeze_protocol_candidate_validation.v1');
assert.equal(r.error,null);assert.equal(r.exit_code,0);assert.equal(r.linux_build_exit,0);
for(const k of ['owner_removed','inputs_stable','default_vet'])assert.equal(r[k],true,k);
for(const k of ['actual_mysql','collector_wired','role_approved','dependencies_installed'])assert.equal(r[k],false,k);
assert.equal(path.dirname(r.owner),root);assert.equal(path.basename(r.owner),'.tmp-d-freeze-protocol-d49501bd26ef47a4ba1ad6d27f9c69fd');assert.equal(fs.existsSync(r.owner),false);
assert.equal(path.resolve(r.source),path.resolve(root,stem+'-source.json'));
assert.equal(path.resolve(r.log),path.resolve(root,stem+'.jsonl'));
const source=json(r.source),expected=[
 'backend/internal/systembackupevidence/download_retention_gc_freeze.go',
 'backend/internal/systembackupevidence/download_retention_gc_freeze_test.go',
 'backend/internal/systembackupevidence/download_retention_gc_freeze_a_test.go',
 'scripts/system-backup-d-gc-freeze-candidate-validation.ps1',
].sort();
assert.deepEqual(source.map(p=>p.path).sort(),expected);
for(const p of source){const b=Buffer.from(p.bytes_base64,'base64');assert.equal(sha(b),p.sha256);assert.equal(sha(read(p.path)),p.sha256,'current freeze input drift '+p.path);}
const oldSource=json('docs/evidence/a-owner-gc-full-local-20261023-111154-source.json');
for(const p of source.filter(p=>p.path.endsWith('.go')))assert.equal(oldSource.files.find(f=>f.path===p.path)?.sha256,p.sha256,'Go protocol source changed since original full owner validation');
const text=read(r.log).toString('utf8').replace(/^\uFEFF/,''),pkg=JSON.parse(text.split(/\r?\n/)[0]).Package;
assert.match(pkg,/_.*\.tmp-d-freeze-protocol-d49501bd26ef47a4ba1ad6d27f9c69fd\/source$/);
const names=validateGoEvents(text,pkg);
const roots=['TestAFreezeTypedNilConnectorBoundary','TestDownloadGCFreezeCandidateClosedPreflight','TestDownloadGCFreezeCandidateFailures','TestDownloadGCFreezeCandidateOrderAndFreshDisposal'];
const oldInventory=json('docs/evidence/a-owner-gc-full-local-20261023-111154-inventory.json');
const expectedNames=oldInventory.packages.flatMap(p=>p.tests).filter(n=>roots.includes(n.split('/')[0])).sort();
assert.equal(expectedNames.length,33);assert.deepEqual(names,expectedNames);
assert.deepEqual(names.filter(n=>!n.includes('/')).sort(),roots.sort());
const requirements='docs/evidence/d-gc-backup-lock-protocol-requirements-20261021.json';
const groups=json(requirements).actual_acceptance_groups;assert.equal(groups.length,12);
const previous='docs/evidence/a-gc-freeze-protocol-reviewed-20261023.json';
const report={kind:'a_gc_freeze_current_local_validation_review.v1',decision:'current_four_file_candidate_locally_validated_not_full_GC',roots:4,pass_events:33,original_full_owner_names_preserved:true,production_Go_unchanged_since_original_owner_gate:true,A_typed_nil_regression_included:true,windows_standalone_and_default_vet:true,linux_standalone_compiled:true,current_selected_inputs_match:true,cleanup_independently_absent:true,required_actual_groups:groups.map(g=>g.id),joint_A_D_approval:false,grants_approved:false,collector_wired:false,full_GC_accepted:false,actual_mysql:false,production_approved:false,dependencies_installed:false,source_files:source.map(p=>pin(p.path)),evidence:[stem+'.json',stem+'-source.json',stem+'.jsonl',previous,'docs/evidence/a-owner-gc-full-local-20261023-111154-source.json','docs/evidence/a-owner-gc-full-local-20261023-111154-inventory.json',requirements,'docs/evidence/a-gc-freeze-current-review-20261023.mjs'].map(pin)};
const out='docs/evidence/a-gc-freeze-current-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(out),report);}
console.log('A_GC_CURRENT_LOCAL_REVIEW roots=4 cases=33 linux=yes cleanup=yes actual_mysql=no');
