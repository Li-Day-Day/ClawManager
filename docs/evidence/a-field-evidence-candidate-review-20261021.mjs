// Record the tested candidate without approving unsupported DSN-file transport.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {fieldRequirements} from '../../scripts/system-backup-a-field-evidence.mjs';
const root=path.resolve(import.meta.dirname,'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(path.join(root,p)),json=p=>JSON.parse(raw(p));
const nativePath='docs/evidence/a-field-evidence-local-20261021-native.json',native=json(nativePath);
for(const role of ['node','powershell51','powershell7','python'])assert.equal(native[role].exit,0);
const logs=['node','powershell51','powershell7'].map(role=>({role,path:native[role].output,sha256:sha(raw(native[role].output))}));
assert.match(raw(logs[0].path).toString('utf8'),/tests 34\n/);assert.match(raw(logs[0].path).toString('utf8'),/pass 34\n/);assert.match(raw(logs[0].path).toString('utf8'),/fail 0\n/);
for(const log of logs.slice(1))assert.match(raw(log.path).toString('utf8'),/PASS field-wrapper:/);
const inputs=['scripts/system-backup-a-field-evidence.py','scripts/system-backup-a-field-evidence.ps1','scripts/system-backup-a-field-evidence.mjs','scripts/system-backup-a-field-evidence_test.py','scripts/system-backup-a-field-evidence.test.ps1','scripts/system-backup-a-field-evidence.test.mjs','scripts/system-backup-a-field-evidence-fixture.mjs','scripts/system-backup-a-download-deployment.mjs','scripts/system-backup-d-deployment.mjs','scripts/system-backup-d-capacity-deployment.mjs','scripts/system-backup-a-capacity-material-review.mjs','scripts/system-backup-contract-check.mjs','scripts/system-backup-schema-hash-evidence.mjs','contracts/system-backup/v12/schema-registry.json','backend/cmd/system-backup-registration/download_deployment.go','backend/cmd/system-backup-registration/download_grants.go','backend/cmd/system-backup-registration/download_readiness.go','backend/internal/systembackupsecurity/registration_runtime.go','backend/internal/systembackupsecurity/bootstrap_deployment.go','Dockerfile',...fs.readdirSync(path.join(root,'backend/internal/db/migrations')).filter(p=>p.endsWith('.sql')).map(p=>'backend/internal/db/migrations/'+p)].map(p=>({path:p,sha256:sha(raw(p)),bytes:raw(p).length}));
const owned=fs.readdirSync(root).filter(p=>/^\.tmp-a-field-(?:evidence|wrapper)-/.test(p));assert.deepEqual(owned,[]);
const record={kind:'a_field_evidence_candidate_preparation',status:'environment_transport_locally_tested_dsn_file_transport_pending',source_scope:'exact listed files at review time; not a frozen whole-worktree acceptance',inputs,logs,native:nativePath,native_sha256:sha(raw(nativePath)),tests:{node:34,python:8,powershell_versions:['5.1','7'],fake_transport_only:true},existing_observations:fieldRequirements().existing_observations,retained_failures:native.retained_failures,owned_test_directories_independently_absent:true,dependencies_installed:false,test_build_artifacts_created:false,ssh_executed:false,actual_sql_executed:false,dsn_file_transport_implemented:false,actual_field_evidence_accepted:false,production_approved:false,next_required:'readonly native DSN-file inspection in existing registration binary; then validate current runtime references and collect actual operator evidence',reviewer_sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))};
const out=path.join(root,'docs/evidence/a-field-evidence-candidate-preparation-20261021.json');
if(process.argv[2]==='--check')assert.deepEqual(JSON.parse(fs.readFileSync(out)),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(out,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,node_tests:34,python_tests:8,powershell_versions:record.tests.powershell_versions,cleanup_verified:true,actual_field_evidence_accepted:false}));
