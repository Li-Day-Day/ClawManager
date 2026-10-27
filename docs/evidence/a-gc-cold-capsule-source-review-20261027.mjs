// Exact reverse-delta proof for the tagged detached-fixture repair.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest,changesBetween} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)};};
const previous='docs/evidence/a-gc-tagged-component-reviewed-20261027-r2.json',old=json(previous);
const cold='backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go';
const life='backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go';
const code=read(cold).toString('utf8'),eol=code.includes('\r\n')?'\r\n':'\n';
const start=code.indexOf('// Keep the same committed admission/result and sealed retention-group model,');
const end=code.indexOf('func TestDDownloadGCFullCollectMySQLSeed',start);assert.ok(start>0&&end>start);
const factory=code.slice(start,end);
for(const s of ['newAdmissionTxFixtureWithConfig','admissionConfigBytes(t, input.EffectiveConfig, rbac)',
 'NewSQLDownloadAuthority','f.service.Admit(f.request)','resultFixture(t, f).Finish',
 'newRetentionGCFixtureFromGroup(t, f, committed.operationID, time.Hour)'])assert.ok(factory.includes(s));
let reverse=code.slice(0,start)+code.slice(end);
reverse=reverse.replace(eol+'\t"path/filepath"','');
const seed=['\tinput, err := decodeADownloadMFAInputs(aDownloadMFASeed)','\tdGCFreezeOK(t, err)','\tm := dGCColdModelFixture(t, input)'].join(eol);
assert.equal(reverse.split(seed).length,2);
reverse=reverse.replace(seed,'\tm := newRetentionGCFixture(t)');
assert.equal(reverse.split('m := dGCColdModelFixture(t, input)').length,2);
reverse=reverse.replace('m := dGCColdModelFixture(t, input)','m := newRetentionGCFixture(t)');
const previousCold=old.changes.find(p=>p.path===cold).after;
assert.equal(Buffer.byteLength(reverse),previousCold.size);
assert.equal(sha(reverse),previousCold.sha256,'unexpected non-fixture source change');
assert.deepEqual(pin(life),old.changes.find(p=>p.path===life).after);
const baseName='docs/evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json',base=json(baseName),files=enumerate(root);
const owner='backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go';
const ownerReviewName='docs/evidence/a-owner-copy-fixture-source-reviewed-20261027.json',ownerReview=json(ownerReviewName);
assert.deepEqual(files.find(p=>p.path===owner),ownerReview.files.find(p=>p.path===owner));
assert.deepEqual(changesBetween(base.files,files).map(p=>p.path),[cold,owner].sort());
assert.equal(files.length,1720);
const result={...old,supersedes:pin(previous),changes:old.changes.map(p=>p.path===cold?{...p,after:pin(cold)}:p),
 component_reviewer:pin('docs/evidence/a-gc-cold-capsule-source-review-20261027.mjs'),
 reviewed_cold_delta:'Use validated embedded capsule config for original committed admission/result model in BOTH seed and actual fixture. Exact reverse transform recovers the old cold file hash; original assertions, SQL cases and ordinary loader unchanged.',
 capsule_repair:{before:previousCold,after:pin(cold),reverse_size:Buffer.byteLength(reverse),reverse_sha256:sha(reverse),
 actual_SQL_case_path_and_seed_both_repaired:true,ordinary_loader_changed:false,docs_copied_to_empty_cwd:false},
 exact_current_input_composition:{base:pin(baseName),owner_source_review:pin(ownerReviewName),
 source_files:1720,source_sha256:sourceDigest(files),files,only_changed:[cold,owner].sort(),
 ordinary_backend_contracts_unchanged:true},
 required_GC_seed_contexts:['source checkout','same compiled binary in genuinely empty cwd'],
 current_Linux_tagged_evidence_compile_required:true,new_current_tagged_native_validation_required:true,
 actual_Go_run_by_this_review:false,actual_SQL:false,current_owner_baseline_ready:false,goal_complete:false};
const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const out='docs/evidence/a-gc-tagged-component-reviewed-20261027-r3.json',text=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.join(root,out),text,{flag:'wx'});else assert.equal(read(out).toString('utf8'),text);
assert.deepEqual(enumerate(root),files);
console.log(JSON.stringify({status:result.status,source_sha256:sourceDigest(files),reverse_proven:true,native:false,SQL:false}));
