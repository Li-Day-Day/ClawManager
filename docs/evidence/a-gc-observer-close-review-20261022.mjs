// A's independent, read-only review. No tests/builds/SQL or deployment actions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(import.meta.dirname,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(path.resolve(root,p));
const decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b).replace(/^\uFEFF/,'');
const json=p=>JSON.parse(decode(raw(p)));
const pin=p=>({path:p,sha256:sha(raw(p)),bytes:raw(p).length});
const sameSet=(a,b)=>{assert.equal(new Set(a).size,a.length);assert.equal(new Set(b).size,b.length);assert.deepEqual([...a].sort(),[...b].sort());};
const packageName='clawreef/internal/systembackupgcmetadata',dir='backend/internal/systembackupgcmetadata/';
const receiptPath='docs/evidence/d-gc-observer-close-preparation-20261022.json';
assert.equal(pin(receiptPath).sha256,'f6b4e39c11791fdefcfd8679ed77012ed71b0cd25dde921162a7871b1a505230');
const d=json(receiptPath);assert.equal(d.status,'locally_validated_published_cleaned');
for(const k of ['dependencies_installed','actual_mysql','production_freeze_enabled','full_gc','current_whole_tree_tested','driver_close_interruptible','remote_release_proved'])assert.equal(d[k],false);
assert.equal(d.first_fixture_attempt_accepted,false);
for(const f of d.evidence){assert.equal(sha(raw(f.path)),f.sha256);assert.equal(raw(f.path).length,f.size);}
const checkedManifest=p=>{
  const s=json(p);sameSet(s.files.map(f=>f.path),s.files.map(f=>f.path));
  for(const f of s.files){assert.ok(/^(backend|contracts|scripts|docs)\//.test(f.path));assert.ok(!f.path.includes('\\')&&!f.path.split('/').some(v=>['','.','..'].includes(v)));assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(f.size)&&f.size>=0);}
  assert.equal(sha(s.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),s.source_sha256);return s;
};
const events=p=>{const text=decode(raw(p));assert.ok(text.endsWith('\n'));return text.trim().split(/\r?\n/).map(JSON.parse);};
const complete=p=>{
  const e=events(p);assert.equal(e.filter(v=>['fail','skip','build-fail'].includes(v.Action)).length,0);
  assert.ok(e.every(v=>v.Package===packageName));
  const ran=e.filter(v=>v.Action==='run'&&v.Test).map(v=>v.Test),passed=e.filter(v=>v.Action==='pass'&&v.Test).map(v=>v.Test);
  sameSet(ran,passed);sameSet(e.filter(v=>v.Action==='pass'&&!v.Test).map(v=>v.Package),[packageName]);
  return {path:p,pin:pin(p),passed,roots:passed.filter(v=>!v.includes('/'))};
};
const basePath='docs/evidence/d-gc-observer-close-base-20261022.json',base=json(basePath);
const prefix='docs/evidence/d-gc-observer-close-20261022-v2-';
const modes=Object.fromEntries(['old','candidate','published'].map(mode=>{
  const sourcePath=prefix+mode+'-source.json',nativePath=prefix+mode+'-native.json';
  const source=checkedManifest(sourcePath),native=json(nativePath);
  assert.equal(source.files.length,7);assert.equal(native.source_sha256,source.source_sha256);
  assert.equal(native.source_postcheck,true);assert.equal(native.default_vet,true);
  for(const k of ['dependencies_installed','remote_executed','actual_mysql'])assert.equal(native[k],false);
  assert.equal(raw(prefix+mode+'.stderr').length,0);
  return [mode,{sourcePath,nativePath,source,native}];
}));
assert.equal(modes.old.native.exit,1);assert.equal(modes.candidate.native.exit,0);assert.equal(modes.published.native.exit,0);
assert.equal(modes.published.source.source_sha256,d.source_sha256);assert.equal(d.source_files,7);
assert.deepEqual(modes.candidate.source.files,modes.published.source.files);
const production=dir+'catalog.go',test=dir+'connection_close_test.go';
for(const f of modes.old.source.files)if(f.path!==production)assert.deepEqual(f,modes.candidate.source.files.find(v=>v.path===f.path));
for(const f of modes.published.source.files){assert.equal(raw(f.path).length,f.size);assert.equal(sha(raw(f.path)),f.sha256);}
sameSet(fs.readdirSync(path.join(root,dir)),modes.published.source.files.filter(f=>f.path.startsWith(dir)).map(f=>f.path.slice(dir.length)));
sameSet(d.changed_files.map(f=>f.path),[production,test]);
const change=d.changed_files.find(f=>f.path===production),added=d.changed_files.find(f=>f.path===test);
assert.equal(change.before_exists,true);assert.equal(added.before_exists,false);assert.equal(added.before_sha256,null);
const before=Buffer.from(change.before_bytes_base64,'base64');assert.equal(sha(before),change.before_sha256);
assert.equal(change.before_sha256,'cfb30e1a2956a2b9929676cf9bb8aecd4361b15beda94d91ada8661800061556');
assert.equal(change.after_sha256,'20e12239be1deb8ca8b2dc8f575bb96c68fb7b9098b8c0ce84bb1ea934e39082');
assert.equal(added.after_sha256,'8265d59abb134d84bbb56e1d5015d3b7119b209cd05cf82bf7088ad6c8a4eddd');
for(const f of d.changed_files){assert.equal(sha(raw(f.path)),f.after_sha256);assert.deepEqual(raw(f.path),Buffer.from(f.tested_bytes_base64,'base64'));}
const after=decode(raw(production));
const replacement='\t// Conn.Close can wait for the driver even after the final SQL checks.\n\t// A cancellation during that wait must not release a late observation.\n\tif c.Close() != nil || ctx.Err() != nil {';
assert.equal(after.split(replacement).length,2);
assert.deepEqual(Buffer.from(after.replace(replacement,'\tif c.Close() != nil {')),before,'only production delta must be post-close context check and its comment');
assert.equal(modes.old.source.files.find(f=>f.path===production).sha256,change.before_sha256);
const priorSourcePath='docs/evidence/d-gc-view-create-20261021-r3-published-source.json',priorSource=checkedManifest(priorSourcePath);
assert.equal(base.files.length,6);
for(const f of base.files){assert.deepEqual(priorSource.files.find(v=>v.path===f.path),f);const now=modes.published.source.files.find(v=>v.path===f.path);assert.ok(now);if(f.path!==production)assert.deepEqual(now,f);}
const counterRoot='TestProgramObservationAfterConnectionClose';
const counterEvents=events(prefix+'old.jsonl');
sameSet(counterEvents.filter(v=>v.Action==='run'&&v.Test).map(v=>v.Test),[counterRoot,...['live','canceled','deadline','close_error'].map(v=>counterRoot+'/'+v)]);
sameSet(counterEvents.filter(v=>v.Action==='pass'&&v.Test).map(v=>v.Test),[counterRoot+'/live',counterRoot+'/close_error']);
sameSet(counterEvents.filter(v=>v.Action==='fail'&&v.Test).map(v=>v.Test),[counterRoot,counterRoot+'/canceled',counterRoot+'/deadline']);
sameSet(counterEvents.filter(v=>v.Action==='fail'&&!v.Test).map(v=>v.Package),[packageName]);
assert.equal(counterEvents.filter(v=>v.Action==='skip').length,0);
const invalidFirst='docs/evidence/d-gc-observer-close-20261022-old.jsonl',invalidEvents=events(invalidFirst);
assert.equal(json('docs/evidence/d-gc-observer-close-20261022-old-native.json').exit,1);
sameSet(invalidEvents.filter(v=>v.Action==='fail'&&v.Test).map(v=>v.Test),[counterRoot,...['canceled','deadline','close_error'].map(v=>counterRoot+'/'+v)]);
const candidate=complete(prefix+'candidate.jsonl'),published=complete(prefix+'published.jsonl');sameSet(candidate.passed,published.passed);
assert.equal(published.passed.length,281);assert.equal(published.roots.length,13);
const prior=complete('docs/evidence/d-gc-view-create-20261021-r3-published.jsonl');assert.equal(prior.passed.length,276);assert.equal(prior.roots.length,12);
const retained=prior.passed.filter(v=>published.passed.includes(v));assert.equal(retained.length,276);
const additions=published.passed.filter(v=>!prior.passed.includes(v));sameSet(additions,[counterRoot,...['live','canceled','deadline','close_error'].map(v=>counterRoot+'/'+v)]);
const oldest=complete('docs/evidence/d-gc-program-observer-20261021-r1-published.jsonl');assert.equal(oldest.passed.length,243);assert.equal(oldest.passed.filter(v=>published.passed.includes(v)).length,243);
const declared=modes.published.source.files.filter(f=>f.path.endsWith('_test.go')).flatMap(f=>{
  const text=decode(raw(f.path));assert.ok(!text.includes('//go:build'));
  return [...text.matchAll(/^func (Test\w+)\(/gm)].map(m=>m[1]);
});sameSet(declared,published.roots);
const imports=new Set(modes.published.source.files.filter(f=>f.path.endsWith('.go')).flatMap(f=>[...decode(raw(f.path)).matchAll(/import\s*\(([\s\S]*?)\)/g)].flatMap(m=>[...m[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]))));
assert.ok(imports.size>0);for(const name of imports){assert.ok(!name.split('/')[0].includes('.'));assert.ok(fs.existsSync(path.join('C:/Program Files/Go/src',name)));}
const semanticsPath='docs/evidence/d-gc-observer-close-sql-semantics-20261022.json',semantics=json(semanticsPath);
assert.equal(sha(raw(semantics.path)),semantics.sha256);assert.equal(semantics.sha256,'683b3e35d41b37f4c80500467fb5a56fab7cc5de922b2c3818aae6bfea971fba');
const sql=decode(raw(semantics.path));assert.ok(sql.includes('func (c *Conn) Close() error {\n\treturn c.close(nil)\n}'));
const ci=sql.indexOf('func (c *Conn) close(err error) error {'),closeBody=sql.slice(ci,sql.indexOf('\n}',ci)+2);
assert.ok(closeBody.includes('c.dc.releaseConn(err)')&&closeBody.includes('return err'));
const validationPath='docs/evidence/d-gc-observer-close-validation-v2-20261022.ps1',validation=decode(raw(validationPath));
for(const text of ["$env:GOPROXY='off'","$env:GOSUMDB='off'","$env:GOTOOLCHAIN='local'","$env:GOENV='off'","$env:GOFLAGS=''","$env:GOTELEMETRY='off'","'test','-mod=readonly','-p=1','-count=1','-timeout=120s','-json'"] )assert.ok(validation.includes(text));
assert.ok(!validation.includes('-vet=off'));
const cleanupPath='docs/evidence/d-gc-observer-close-cleanup-20261022.json',cleanup=json(cleanupPath),owner=path.resolve(base.owner);
assert.equal(cleanup.removed,true);assert.equal(path.resolve(cleanup.owner),owner);
assert.equal(path.dirname(owner).toLowerCase(),root.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
for(const v of Object.values(modes))assert.equal(path.resolve(v.native.owner),owner);
assert.equal(fs.existsSync(owner),false);
const record={kind:'a_gc_metadata_observer_close_independent_review',status:'accepted_scoped_post_close_context_boundary_only',
  source_receipt:pin(receiptPath),source_scope:'Exact standalone metadata package (five Go files) plus go.mod/go.sum; not a whole-worktree or owner/role baseline approval',
  source_sha256:d.source_sha256,source_files:modes.published.source.files,
  source_manifest:pin(modes.published.sourcePath),production_changed:production,new_test:test,
  production_before_sha256:change.before_sha256,production_after_sha256:change.after_sha256,only_context_check_and_comment_changed:true,
  sql_queries_privileges_digest_format_and_original_budget_unchanged:true,
  validation_script:pin(validationPath),stdlib_imports:[...imports].sort(),
  candidate:{native:pin(modes.candidate.nativePath),events:candidate.pin,root_count:13,checks:281},
  published:{native:pin(modes.published.nativePath),events:published.pin,root_count:13,checks:281,all_declared_roots_executed:true},
  previous_view_baseline:{source:pin(priorSourcePath),events:prior.pin,roots:12,checks:276,retained:276},
  original_program_baseline:{events:oldest.pin,checks:243,retained:243},new_checks:additions,
  counterexample:{source:pin(modes.old.sourcePath),native:pin(modes.old.nativePath),events:pin(prefix+'old.jsonl'),exit:1,valid_failures:['canceled','deadline'],live_and_physical_close_error_controls_passed:true},
  excluded_first_fixture:{events:pin(invalidFirst),reason:d.first_fixture_error,exit:1,accepted:false},
  sql_close_semantics:{record:pin(semanticsPath),stdlib:{path:semantics.path,sha256:semantics.sha256},physical_driver_error_not_propagated_by_pool_return:true,remote_release_proved:false},
  cleanup:pin(cleanupPath),owned_directory:owner,owned_directory_independently_absent:true,
  review_actions:'Read code, reconstruct exact pre-change bytes, validate full named test inventories/counterexamples/source pins and inspect local standard library; no rerun of successful tests or builds.',
  dependencies_installed:false,tests_or_builds_rerun_by_A:false,test_or_build_artifacts_created_by_A:false,actual_mysql_executed:false,
  driver_close_interruptible:false,remote_connection_or_lock_release_proved:false,production_role_approved:false,production_freeze_enabled:false,full_gc_accepted:false,
  entire_worktree_accepted:false,new_owner_source_baseline_registered:false,
  reviewer_sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output=path.join(root,'docs/evidence/a-gc-observer-close-accepted-20261022.json');
if(process.argv[2]==='--check')assert.deepEqual(JSON.parse(fs.readFileSync(output)),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,published_roots:13,published_checks:281,previous_checks_retained:276,new_checks:5,valid_counterexample_failures:2,owned_directory_absent:true,actual_mysql_executed:false}));
