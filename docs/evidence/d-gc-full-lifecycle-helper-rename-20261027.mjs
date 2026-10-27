import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Pure byte/symbol checks only. No Go, SQL, subprocess or temporary artifacts.
const repo=path.resolve(import.meta.dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=fs.readFileSync(path.join(repo,p));return {path:p,size:b.length,sha256:sha(b)};};
const file='backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go';
const ownerFile='backend/internal/systembackupevidence/download_gc_owner_lifecycle_mysql_test.go';
const coldFile='backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go';
const previous='docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7.json';
const failedLog='docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7.tagged_seed.jsonl';
const component='docs/evidence/a-gc-tagged-component-reviewed-20261026-r1.json';
const expectedBefore={path:file,size:32901,sha256:'cac6c2bc0be61f48d28835828b26f17d92fe9f97deeea4dea3a87c7b5354a7e2'};
const expectedAfter={path:file,size:32957,sha256:'c05714705f0e489f13004095ca9648f90edd5e2786fed1b182400083913f3e55'};
const expectedOwner={path:ownerFile,size:13125,sha256:'56c14b89a7a670d1d4529961fbbf65799d9edaab1f20ae683b100f8034314ec9'};
const expectedCold={path:coldFile,size:23173,sha256:'e9806c4892ac770ae2f3cf97e9bcb6ba2f123d125b6d5a00d9533e055d9bdf09'};
const renames=[{before:'dGCLifecyclePool',after:'dGCFullLifecyclePool',occurrences:2},{before:'dGCLifecycleReleased',after:'dGCFullLifecycleReleased',occurrences:12}];
const newBytes=fs.readFileSync(path.join(repo,file)),text=newBytes.toString('utf8');
assert.deepEqual(pin(file),expectedAfter);assert.deepEqual(pin(ownerFile),expectedOwner);assert.deepEqual(pin(coldFile),expectedCold);
let reversed=text;
for(const r of renames){
  assert.equal([...text.matchAll(new RegExp('\\b'+r.before+'\\b','g'))].length,0);
  assert.equal([...text.matchAll(new RegExp('\\b'+r.after+'\\b','g'))].length,r.occurrences);
  reversed=reversed.replace(new RegExp('\\b'+r.after+'\\b','g'),r.before);
}
const reversedBytes=Buffer.from(reversed);
assert.equal(reversedBytes.length,expectedBefore.size);assert.equal(sha(reversedBytes),expectedBefore.sha256,'non-rename source change');
const old=JSON.parse(fs.readFileSync(path.join(repo,previous),'utf8'));
assert.equal(old.status,'failed');assert.equal(old.cleanup,true);assert.equal(old.snapshot_unchanged,true);assert.equal(old.actual_SQL,false);
assert.equal(old.phases.find(p=>p.phase==='tagged_seed').exit,1);
assert.deepEqual(old.files.find(p=>p.path===file),expectedBefore);
assert.deepEqual(old.files.find(p=>p.path===ownerFile),expectedOwner);
const reviewed=JSON.parse(fs.readFileSync(path.join(repo,component),'utf8'));
assert.deepEqual(reviewed.changes.find(p=>p.path===file).after,expectedBefore);
const log=fs.readFileSync(path.join(repo,failedLog),'utf8');
for(const name of renames.map(r=>r.before))assert.ok(log.includes(name+' redeclared in this block'));
// This textual declaration scan complements the exact lexical proof. It is
// explicitly not a compiler or native seed result.
const funcs=s=>[...s.matchAll(/^func ([A-Za-z_][A-Za-z_0-9]*)\(/gm)].map(m=>m[1]);
const names=funcs(text),all=new Map();
assert.equal(new Set(names).size,names.length);
for(const name of fs.readdirSync(path.dirname(path.join(repo,file))).filter(n=>n.endsWith('.go'))){
  const p='backend/internal/systembackupevidence/'+name;
  for(const f of funcs(fs.readFileSync(path.join(repo,p),'utf8'))){if(!all.has(f))all.set(f,[]);all.get(f).push(p);}
}
for(const name of names)assert.deepEqual(all.get(name),[file],'top-level helper collision: '+name);
const result={kind:'d_gc_full_lifecycle_helper_rename_source_ready.v1',status:'pure_lexical_repair_ready_for_A_component_review_native_validation_pending',before:expectedBefore,after:expectedAfter,renames,reverse_identifier_transform_restores_before_bytes:true,old_owner_file_unchanged:expectedOwner,cold_file_unchanged:expectedCold,scope:'Only fourteen identifier tokens in the new Full lifecycle tagged file; SQL/assertions/test roots/case catalog unchanged',textual_function_declaration_scan:{new_file_functions:names.length,new_file_names_unique_across_current_package_text:true,compiler_run:false},inputs:[previous,failedLog,component,'docs/evidence/d-gc-full-lifecycle-helper-rename-20261027.mjs'].map(pin),previous_native_status:'failed',previous_tagged_build_failure_retained:true,previous_linux_validation_not_run:true,current_native_validation_passed:false,required_next:['A exact after-pin component review','single Go owner terminal and cleanup handoff','tagged evidence seed compilation with historical owner file included','all three GC seed roots and Linux tagged evidence compile in the coordinated caller scope','source postcheck and exact run-owned cleanup'],Go_run_by_this_repair:false,actual_SQL:false,production_approved:false,ordinary_code_modified:false,historical_owner_source_modified:false,dependencies_installed:false};
const args=process.argv.slice(2),out=path.join(import.meta.dirname,'d-gc-full-lifecycle-helper-rename-source-ready-20261027-r1.json');
assert.ok(args.length===0||(args.length===2&&['--write','--check'].includes(args[0])));
if(args[0]==='--write'){const p=path.resolve(args[1]);assert.equal(path.dirname(p),import.meta.dirname);fs.writeFileSync(p,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
else assert.deepEqual(JSON.parse(fs.readFileSync(args[1]?path.resolve(args[1]):out,'utf8')),result);
process.stdout.write(JSON.stringify({status:result.status,after:expectedAfter,identifier_tokens:14,inverse_bytes_verified:true,new_file_top_level_symbols_unique:true,Go:false,actual_SQL:false,production_approved:false})+'\n');
