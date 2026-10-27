import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=p=>fs.readFileSync(p);
const json=p=>JSON.parse(bytes(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=bytes(p);return{path:p,size:b.length,sha256:sha(b)}};
const previous='docs/evidence/a-gc-tagged-component-reviewed-20261026-r1.json';
const life='backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go';
const cold='backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go';
const owner='backend/internal/systembackupevidence/download_gc_owner_lifecycle_mysql_test.go';
const old=json(previous);assert.equal(old.kind,'a_gc_tagged_component_scope_review.v1');
assert.equal(old.ordinary_scope_review_complete,false);
assert.deepEqual(pin(cold),old.changes.find(c=>c.path===cold).after);
assert.deepEqual(pin(owner),{path:owner,size:13125,sha256:'56c14b89a7a670d1d4529961fbbf65799d9edaab1f20ae683b100f8034314ec9'});
const after=bytes(life),text=after.toString('utf8');
assert.deepEqual(pin(life),{path:life,size:32957,sha256:'c05714705f0e489f13004095ca9648f90edd5e2786fed1b182400083913f3e55'});
assert.equal(text.split('dGCFullLifecyclePool').length-1,2);
assert.equal(text.split('dGCFullLifecycleReleased').length-1,12);
const reversed=Buffer.from(text.replaceAll('dGCFullLifecyclePool','dGCLifecyclePool').replaceAll('dGCFullLifecycleReleased','dGCLifecycleReleased'));
assert.equal(reversed.length,old.changes.find(c=>c.path===life).after.size);
assert.equal(sha(reversed),old.changes.find(c=>c.path===life).after.sha256,'Other assertion/SQL/protocol changed');
for(const name of ['dGCFullLifecyclePool','dGCFullLifecycleReleased']){
  const declarations=fs.readdirSync('backend/internal/systembackupevidence').filter(p=>p.endsWith('.go')).flatMap(p=>{
    const content=bytes('backend/internal/systembackupevidence/'+p).toString('utf8');
    return [...content.matchAll(new RegExp('^func '+name+'\\(', 'gm'))].map(()=>p);
  });
  assert.deepEqual(declarations,['download_gc_full_lifecycle_mysql_test.go'],'New helper still has duplicate declaration');
}
const failure='docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7.json';
const failed=json(failure);assert.equal(failed.status,'failed');assert.equal(failed.error,'Go phase failed: tagged_seed');
assert.equal(failed.snapshot_unchanged,true);assert.equal(failed.cleanup,true);
const result={...old,supersedes:pin(previous),changes:old.changes.map(c=>c.path===life?{...c,after:pin(life)}:c),
  exact_identifier_delta:{before:old.changes.find(c=>c.path===life).after,after:pin(life),
    renames:[{from:'dGCLifecyclePool',to:'dGCFullLifecyclePool',occurrences:2},
      {from:'dGCLifecycleReleased',to:'dGCFullLifecycleReleased',occurrences:12}],
    reverse_transform_size:reversed.length,reverse_transform_sha256:sha(reversed),old_owner_file_unchanged:pin(owner)},
  original_tagged_compile_failure_preserved:pin(failure),
  component_reviewer:pin('docs/evidence/a-gc-tagged-component-rename-review-20261027.mjs'),
  new_current_tagged_native_validation_required:true,
  actual_Go_run_by_this_review:false,actual_SQL:false,current_owner_baseline_ready:false,goal_complete:false};
const output='docs/evidence/a-gc-tagged-component-reviewed-20261027-r2.json';
if(mode==='--write')fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),result);
console.log(JSON.stringify({mode,output,sha256:sha(bytes(output)),life:pin(life),ordinary_scope_review_complete:false,native_accepted:false}));
