// Receiver for the exact r4 work-extraction profile, before the finalizer.
// A later finalizer revision needs a new source review and complete profile.
// Refuses unfinished/failed runs; never actual SQL.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
import {validateCloseoutSource} from './a-owner-closeout-source-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const local=p=>{const f=path.resolve(root,p);assert.ok(f.startsWith(root+path.sep));return f};
const rel=p=>path.relative(root,local(p)).replaceAll('\\','/');
const read=p=>fs.readFileSync(local(p));const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:rel(p),size:read(p).length,sha256:sha(read(p))});
const [fullPath,suppPath,mode]=process.argv.slice(2);assert.ok(fullPath&&suppPath&&['--write','--check'].includes(mode),'full-receipt supplement-receipt --write|--check required');
assert.ok(fs.existsSync(local(fullPath))&&fs.existsSync(local(suppPath)),'terminal full and supplement receipts required before acceptance');
const full=json(fullPath),supp=json(suppPath);
for(const r of [full,supp]){assert.equal(r.error,null);assert.equal(r.frozen_postcheck,true);assert.equal(r.owner_removed,true);assert.equal(fs.existsSync(r.owner),false);assert.equal(path.dirname(r.owner),root);assert.match(path.basename(r.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(r.dependencies_installed,false);assert.equal(r.production_approved,false);assert.equal(r.actual_mysql,false);}
assert.equal(full.kind,'d_local_closeout_validation.v1');assert.equal(full.remote_contacted,false);assert.equal(full.runner_profile,'http_native_producer_diagnostic_then_six_serial_packages');assert.equal(full.steps.length,15);
assert.equal(supp.kind,'a_owner_profile_supplement.v1');assert.equal(supp.full_package_gate_approved,false);assert.equal(supp.ordinary_source_identical_before_tests,true);assert.equal(supp.peer_cache_read_only,true);assert.equal(supp.test_result_reused,false);assert.equal(supp.steps.length,3);
const source=json(full.source),extra=json(supp.source);validateCloseoutSource(source);validateCloseoutSource(extra);
assert.equal(local(supp.expected_full_package_source),local(full.source));assert.equal(supp.expected_full_package_source_sha256,source.source_sha256);
const ordinary=p=>/^(backend|contracts)\//.test(p)&&!p.endsWith('_mysql_test.go');
const ordinaryPins=s=>s.files.filter(p=>ordinary(p.path));assert.deepEqual(ordinaryPins(extra),ordinaryPins(source));
assert.deepEqual(extra.files.filter(p=>/^(backend|contracts)\//.test(p.path)),source.files.filter(p=>/^(backend|contracts)\//.test(p.path)),'tagged or ordinary source differs across composed stages');
for(const p of extra.files.filter(p=>/^(backend|contracts)\//.test(p.path)))assert.deepEqual(pin(p.path),p,'current backend/contracts input drift');
const walk=dir=>fs.readdirSync(local(dir),{withFileTypes:true}).flatMap(e=>{const p=dir+'/'+e.name;assert.equal(e.isSymbolicLink(),false);if(e.isDirectory())return ['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(e.name)?[]:walk(p);return e.isFile()&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p)?[p]:[]});
assert.deepEqual([...walk('backend'),...walk('contracts')].sort(),extra.files.filter(p=>/^(backend|contracts)\//.test(p.path)).map(p=>p.path).sort(),'current backend/contracts file set drift');
for(const r of [full,supp])for(const s of r.steps){assert.equal(s.exit_code,0);assert.equal(sha(read(s.log)),s.sha256);}
const packages=['systembackupevidence','systembackupproducer','systembackupresources','systembackupread','systembackupsecurity','server'];
const packageTests=new Map();
for(const [i,p]of packages.entries()){
 const pkg=i===5?'./cmd/server':'./internal/'+p,step=full.steps[i+1];
 assert.deepEqual(step.command,['go','test','-json','-count=1','-timeout=45m',pkg]);assert.equal(step.platform,'windows');
 packageTests.set('clawreef/'+pkg.slice(2),validateGoEvents(read(step.log).toString('utf8'),'clawreef/'+pkg.slice(2)));
}
const previousPath='docs/evidence/a-owner-gc-full-local-20261023-111154-inventory.json',previous=json(previousPath);
assert.equal(previous.packages.reduce((n,p)=>n+p.pass_events,0),5138);
const inventories=previous.packages.map(p=>{const tests=packageTests.get(p.package);assert.ok(tests);for(const name of p.tests)assert.ok(tests.includes(name),'previous owner test omitted: '+name);return {package:p.package,roots:tests.filter(n=>!n.includes('/')).length,pass_events:tests.length,previous_checks_preserved:p.tests.length,added:tests.filter(n=>!p.tests.includes(n))}});
const failedSourcePath='docs/evidence/a-owner-final-full-local-20261023-144309-source.json',failedSource=json(failedSourcePath);
const changedEvidence=failedSource.files.filter(p=>p.path.startsWith('backend/internal/systembackupevidence/')&&p.path.endsWith('.go')&&sha(read(p.path))!==p.sha256).map(p=>p.path).sort();
assert.deepEqual(changedEvidence,['download_admitted_http_test.go','download_output_deadline_a_test.go','download_retention_gc.go','download_retention_gc_producer_test.go'].map(p=>'backend/internal/systembackupevidence/'+p).sort(),'unexpected evidence production/test changes');
const extractionPath='docs/evidence/a-gc-work-extraction-reviewed-20261023.json',extraction=json(extractionPath);
assert.deepEqual(extraction.current,pin('backend/internal/systembackupevidence/download_retention_gc.go'));assert.equal(extraction.protected_body_byte_identical_after_reversing_extraction,true);assert.equal(extraction.production_approved,false);
const pattern='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$';
const seedNames=['TestASQLTaskDownloadOwnersMySQLSeed','TestADownloadAdmissionMySQLSeed',...['detached_embedded_config','historical_config_projection','independent_encrypted_object'].map(n=>'TestADownloadAdmissionMySQLSeed/'+n),'TestASensitiveDownloadMFAMySQLSeed',...['actual_config_required_cells','duplicate','unknown','trailing','catalog','ddl','budget'].map(n=>'TestASensitiveDownloadMFAMySQLSeed/'+n)].sort();
assert.deepEqual(supp.steps[0].command,['go','test','-json','-tags','systembackup_mysql','-run',pattern,'-count=1','-timeout=180s','./internal/systembackupevidence']);
assert.deepEqual(validateGoEvents(read(supp.steps[0].log).toString('utf8'),'clawreef/internal/systembackupevidence'),seedNames);
assert.deepEqual(supp.steps[1].command,['go','test','-c','-tags','systembackup_mysql','-o',path.join(supp.owner,'binary/owner-seeds.exe'),'./internal/systembackupevidence']);
assert.deepEqual(supp.steps[2].command,['go','test','-c','-tags','systembackup_mysql','-o',path.join(supp.owner,'binary/owners.test'),'./internal/systembackupevidence']);
assert.deepEqual(supp.steps.map(s=>s.platform),['windows','windows','linux']);
assert.equal(supp.detached_exit,0);const detached=read(supp.detached_log).toString('utf8');assert.doesNotMatch(detached,/--- (?:FAIL|SKIP):|^FAIL|^panic:/m);assert.match(detached,/^PASS\s*$/m);
for(const regex of [/^=== RUN\s+(\S+)\s*$/gm,/^\s*--- PASS: (\S+) /gm])assert.deepEqual([...detached.matchAll(regex)].map(m=>m[1]).sort(),seedNames);
assert.deepEqual(supp.binaries.map(b=>b.name),['owner-seeds.exe','owners.test']);for(const b of supp.binaries)assert.match(b.sha256,/^[a-f0-9]{64}$/);
assert.deepEqual(full.steps[13].command,['go','build','-o',path.join(full.owner,'binary/system-backup-migrate'),'./cmd/system-backup-migrate']);assert.equal(full.steps[13].platform,'linux');
assert.match(full.binaries.find(b=>b.name==='system-backup-migrate')?.sha256,/^[a-f0-9]{64}$/);
const logInitPath='docs/evidence/d-local-closeout-log-initialization-20261023.json',logInit=json(logInitPath);
assert.equal(logInit.kind,'d_local_closeout_log_sink_initialization.v1');
for(const key of ['runner_edited','frozen_source_edited','tests_restarted','existing_logs_overwritten'])assert.equal(logInit[key],false);
assert.deepEqual(logInit.files.map(f=>f.stage),[10,11,12,13,14]);
for(const f of logInit.files){assert.equal(local(f.path),local(full.steps[f.stage].log));assert.equal(f.initial_bytes,0);assert.equal(f.initial_sha256,sha(Buffer.alloc(0)));}
const runner='docs/evidence/a-owner-profile-supplement-20261023.ps1';assert.equal(sha(read(runner)),supp.runner_sha256);
assert.equal(sha(read(rel(full.runner))),full.runner_sha256);
const events=Buffer.from([full.steps[5].log,full.steps[1].log].map(p=>read(p).toString('utf8').replace(/^\uFEFF/,'').trim()).join('\n')+'\n');
const eventPath='docs/evidence/a-owner-current-composed-native-20261023.jsonl';
const report={kind:'a_owner_current_composed_local_acceptance.v1',status:'complete_current_owner_profile_local_preparation_only',source:pin(full.source),supplement_source:pin(supp.source),source_sha256:source.source_sha256,events:{path:eventPath,size:events.length,sha256:sha(events)},packages:inventories,all_previous_5138_checks_preserved:true,evidence_existing_source_delta:changedEvidence,production_HTTP_result_guards_unchanged:true,GC_original_protected_body_preserved:true,packaged_seed_checks:13,detached_seed_checks:13,Linux_owner_probe_built:true,Linux_migration_runner_built:true,current_backend_contracts_set_and_bytes_match:true,all_owned_test_artifacts_removed:true,current_baseline_registration_permitted:true,empty_log_initialization_disclosed:true,actual_SQL:false,production_approved:false,whole_worktree_approved:false,dependencies_installed:false,inputs:[fullPath,suppPath,...full.steps.map(s=>s.log),...supp.steps.map(s=>s.log),supp.detached_log,previousPath,failedSourcePath,extractionPath,logInitPath,runner,rel(full.runner),'docs/evidence/a-owner-current-composed-review-20261023.mjs'].map(pin)};
const output='docs/evidence/a-owner-current-composed-local-accepted-20261023.json';
if(mode==='--write'){assert.equal(fs.existsSync(local(eventPath)),false);assert.equal(fs.existsSync(local(output)),false);fs.writeFileSync(local(eventPath),events,{flag:'wx'});fs.writeFileSync(local(output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}else{assert.equal(sha(read(eventPath)),sha(events));assert.deepEqual(json(output),report);}
console.log('A_OWNER_CURRENT_COMPOSED accepted=yes prior_checks=5138 seed_locations=2 seeds_each=13 actual_SQL=no');
