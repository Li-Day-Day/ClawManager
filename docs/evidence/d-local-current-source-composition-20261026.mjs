import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {reviewDrill} from './d-drill-http-review-20261023.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const deltaPath='backend/cmd/server/system_backup_read_drill_history_mysql_test.go';
const oldTag={path:deltaPath,size:15250,sha256:'04ff3f7266b9b99c72cd024b1c189e34fbb13c613231f7da41a1b1d63b09be9b'};
const newTag={path:deltaPath,size:20190,sha256:'e8df47f25eb1765cb354a7f88a1dc2952bc56b699129d7ac8ba604c91b3e21b7'};
const ordinal=(a,b)=>a.path<b.path?-1:a.path>b.path?1:0;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function sourcePins(files){
 assert.ok(Array.isArray(files)&&files.length>0);
 const seen=new Set();
 return files.map(p=>{
  assert.deepEqual(Object.keys(p).sort(),['path','sha256','size']);
  assert.ok(typeof p.path==='string' && /^(backend|contracts|scripts|docs)\//.test(p.path));
  assert.ok(!p.path.includes('\\')&&!p.path.split('/').some(x=>['','..','.'].includes(x)));
  assert.ok(!seen.has(p.path),'duplicate source path');seen.add(p.path);
  assert.ok(Number.isSafeInteger(p.size)&&p.size>=0);assert.match(p.sha256,/^[a-f0-9]{64}$/);
  return {path:p.path,size:p.size,sha256:p.sha256};
 }).sort(ordinal);
}
export function assertExactTagDelta(base,current){
 const a=sourcePins(base),b=sourcePins(current);
 assert.deepEqual(a.map(p=>p.path),b.map(p=>p.path),'source sets differ');
 const changes=a.flatMap((p,i)=>p.size===b[i].size&&p.sha256===b[i].sha256?[]:[{before:p,after:b[i]}]);
 assert.deepEqual(changes,[{before:oldTag,after:newTag}],'only the exact reviewed tagged HTTP repair may differ');
 return b;
}
const local=p=>{const f=path.resolve(root,p);assert.ok(f.startsWith(root+path.sep));return f;};
const read=p=>fs.readFileSync(local(p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:path.relative(root,local(p)).replaceAll('\\','/'),sha256:sha(read(p))});
function currentSet(){
 const extras=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
 const out=[];
 function walk(rel){
  assert.equal(fs.lstatSync(local(rel)).isSymbolicLink(),false);
  for(const e of fs.readdirSync(local(rel),{withFileTypes:true})){
   const p=rel+'/'+e.name;assert.equal(e.isSymbolicLink(),false,'redirected current source');
   if(e.isDirectory()){if(!['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(e.name))walk(p);}
   else if(e.isFile()&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p)&&(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/.test(p)||extras.has(p)))out.push(p);
  }
 }
 for(const p of ['backend','contracts','scripts','docs'])walk(p);
 return out.sort();
}
function checkPins(pins){for(const p of pins)assert.equal(pin(p.path).sha256,p.sha256,'reviewed evidence changed: '+p.path);}
export function composeCurrent(){
 const nativePath='docs/evidence/d-gc-finalizer-native-frozen-reviewed-20261026.json';
 const native=json(nativePath);assert.equal(native.kind,'d_gc_finalizer_native_acceptance.v1');
 assert.equal(native.status,'complete_exact_frozen_native_scope_current_tagged_drill_delta_pending');
 assert.equal(native.source_current_bytes_and_set_match,false);assert.equal(native.source_current_set_match,true);
 assert.equal(native.stage_map.length,23);assert.equal(native.receiver_passes,163);checkPins(native.inputs);
 const basePath=json(native.primary_validation.path).source,base=json(basePath);
 const repairPath='docs/evidence/d-drill-http-repair-local-20261026.json',repair=json(repairPath);
 const receivedPath='docs/evidence/d-drill-http-current-increment-received-20261026.json',received=json(receivedPath);
 assert.deepEqual(reviewDrill(repairPath,{actual:false}),received);
 assert.equal(received.scope,'local_preparation_only');assert.equal(received.actual_mysql_cases,0);assert.deepEqual(received.unrelated_source_drift,[]);
 assert.equal(repair.kind,'d_drill_detail_source.v1');assert.equal(repair.files.length,1629);
 assert.equal(sha(repair.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),repair.source_sha256,'repair digest uses its own recorded order');
 const current=assertExactTagDelta(base.files,repair.files);
 assert.deepEqual(currentSet(),current.map(p=>p.path));
 for(const p of current){const b=read(p.path);assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256);}
 const sourceDigest=sha(current.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
 assert.equal(sourceDigest,native.current_source_sha256_at_review);
 assert.ok(read(deltaPath).toString('utf8').startsWith('//go:build systembackup_mysql'));
 const resultPath=repairPath+'.result.json',result=json(resultPath),log=result.child_log;
 assert.equal(result.child_exit,0);assert.equal(result.error,null);assert.equal(result.source_postcheck,true);
 assert.equal(result.remote_requested,false);assert.equal(result.actual_mysql_results_accepted,false);assert.equal(result.cleanup.removed,true);
 assert.equal(fs.existsSync(result.cleanup.owner),false);assert.equal(sha(read(log)),result.child_log_sha256);
 const text=read(log).toString('utf8').replace(/^\uFEFF/,'');
 for(const name of ['TestDDrillDetailHTTPSeed','TestDDrillDetailHTTPSeed/foreign_installation_fk_fixture','TestDDrillDetailHTTPSeed/foreign_installation_fk_fixture/drill_history_foreign_installation']){
  assert.match(text,new RegExp('^\\s*--- PASS: '+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' \\(','m'));
 }
 assert.match(text,/^CLEANED local-registration-build-cache=True\s*$/m);
 assert.doesNotMatch(text,/--- (FAIL|SKIP):|^FAIL|^panic:|^fatal error:/m);
 const independentPath='docs/evidence/d-gc-finalizer-independent-reviewed-20261026.json',independent=json(independentPath);
 assert.equal(independent.result,'PRIVATE_GC_FROZEN_SCOPE_ACCEPTED_CURRENT_TAGGED_INCREMENT_PENDING');
 checkPins(independent.source_pins);checkPins(independent.native_check_receivers);
 for(const p of [independent.native_acceptance,independent.review_request,independent.requirements])checkPins([p]);
 assert.deepEqual(independent.criteria.map(c=>c.id),Array.from({length:10},(_,i)=>'F'+(i+1)));
 assert.ok(independent.criteria.every(c=>c.status.startsWith('accepted')));assert.deepEqual(independent.new_blocking_findings,[]);
 const clockPath='docs/evidence/a2-gc-finalizer-f4-reviewed-20261026.json',clock=json(clockPath);
 assert.equal(clock.status,'accepted_exact_frozen_private_candidate_F4_clock_boundary');checkPins(clock.inputs);
 assert.equal(clock.strict_T0_less_than_T2_less_than_T1_verified_in_model,true);
 assert.deepEqual(currentSet(),current.map(p=>p.path),'current source set changed during composition');
 for(const p of current)assert.equal(sha(read(p.path)),p.sha256,'current bytes changed during composition');
 const inputs=[nativePath,basePath,repairPath,receivedPath,resultPath,log,independentPath,clockPath,'docs/evidence/d-local-current-source-composition-20261026.mjs','docs/evidence/d-local-current-source-composition-20261026.test.mjs'];
 return {kind:'d_current_local_source_composition.v1',status:'current_dependency_matched_local_validation_complete_owner_signoff_pending',goal_complete:false,source_sha256:sourceDigest,source_files:current.length,files:current,origin:'derived_current_source_binding_from_exact_native_segments_and_tagged_HTTP_repair_not_one_new_native_run',base_native_source_sha256:base.source_sha256,base_native_acceptance:pin(nativePath),tagged_repair_native_source_sha256:repair.source_sha256,tagged_repair_source_digest_order:'PowerShell recorded order; compare sources by path, size and hash',tagged_repair_acceptance:pin(receivedPath),exact_changes:[{before:oldTag,after:newTag}],retained_native_stage_numbers:Array.from({length:23},(_,i)=>i).filter(i=>![8,15].includes(i)),replaced_native_stage_numbers:[8,15],replacements:{8:'current tagged drill seed including foreign FK fixture regression',15:'current Linux HTTP probe compilation'},ordinary_packages_repeated_by_composition:false,current_source_set_and_bytes_verified_before_and_after:true,GC_frozen_candidate_bytes_unchanged:true,independent_GC_review:pin(independentPath),independent_F4_review:pin(clockPath),all_declared_native_obligations_current_dependencies_covered:true,removed_owners:[...native.owners_removed,result.cleanup.owner],dependencies_installed:false,remote_contacted:false,actual_mysql:false,production_approved:false,whole_business_restore_or_GC_approved:false,pending:['A owner final profile signoff','final handoff and completion audit'],inputs:inputs.map(pin)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,out]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&out);
 assert.equal(path.dirname(local(out)),path.join(root,'docs/evidence'));
 const value=composeCurrent();
 if(mode==='--write')fs.writeFileSync(local(out),JSON.stringify(value,null,2)+'\n',{flag:'wx'});else assert.deepEqual(json(out),value);
 console.log(`CURRENT_LOCAL_COMPOSITION_OK source=${value.source_sha256} files=1629 native_obligations=23 tag_delta=1 actual_mysql=no production=no`);
}
