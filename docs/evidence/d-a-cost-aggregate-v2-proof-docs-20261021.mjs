import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096/source/';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,a);return s.replace(a,b);};
const edit=(p,fn)=>{fs.chmodSync(root+p,0o666);fs.writeFileSync(root+p,fn(fs.readFileSync(root+p,'utf8').replaceAll('\r\n','\n')));};
edit('contracts/system-backup/v12/verifier-contract.schema.json',s=>{
 for(const key of ['users_backup_validate','users_restore_validate']){
  const start=s.indexOf('"'+key+'":');const end=s.indexOf('\n',start);const line=s.slice(start,end);
  const fixed=line.replace('both views, including exact cost aggregates, to','both views to').replace('authenticated expected counts and cost aggregates, and separate','authenticated expected counts and separate');
  assert.notEqual(line,fixed);s=s.slice(0,start)+fixed+s.slice(end);
 }
 for(const key of ['ai_gateway_backup_validate','ai_gateway_restore_validate']){
  const start=s.indexOf('"'+key+'":');const end=s.indexOf('\n',start);const line=s.slice(start,end);
  const fixed=line.replace('both views to','both views, including exact cost aggregates, to').replace('authenticated expected counts and separate','authenticated expected counts and cost aggregates, and separate');
  assert.notEqual(line,fixed);s=s.slice(0,start)+fixed+s.slice(end);
 }
 JSON.parse(s);return s;
});
edit('backend/internal/systembackupbusinessa/restore_verify.go',s=>{
 s=once(s,'// expected table counts and evidence, and prove this transaction can only use\n// a SELECT-only credential. Recheck runs before the read transaction commits.','// expected table counts, cost aggregate digest and evidence. It must prove\n// this transaction can only use a SELECT-only credential. Recheck runs before\n// the read transaction commits.');
 return once(s,'// expected counts and checks restored execution/credential state in one\n// read-only RepeatableRead target transaction. SQL/proof failure returns no','// expected counts and cost aggregates, and checks restored execution/credential\n// state in one read-only RepeatableRead target transaction. SQL/proof failure returns no');
});
edit('backend/internal/systembackupbusinessa/capture.go',s=>once(s,"// SourceSnapshot is a single source transaction's redacted statistics. It is\n// not evidence that any dump captured those rows or used the same checkpoint.","// SourceSnapshot is a single source transaction's redacted counts and cost\n// aggregate digest. The digest is required even for empty cost_records. This\n// is not proof that a dump captured those rows or used the same checkpoint."));
edit('scripts/system-backup-contract-artifacts.test.mjs',s=>{
 s=once(s,"    assert.equal(choices[1].properties.actual.$ref, '#/$defs/ABusinessCountValue');",`    assert.equal(choices[1].properties.actual.$ref, '#/$defs/ABusinessCountValue');
    if (category === 'ai_gateway') {
      assert.deepEqual(choices.at(-1).properties.id.enum, ['ai_gateway.cost_aggregates']);
      assert.equal(choices.at(-1).properties.expected.$ref, '#/$defs/ABusinessDigestValue');
      assert.equal(choices.at(-1).properties.actual.$ref, '#/$defs/ABusinessDigestValue');
      assert.match(a[key].required_proof, /cost aggregates/);
    }`);
 return once(s,"    assert.equal(choices[1].properties.actual.$ref, '#/$defs/ABusinessViolationValue');",`    assert.equal(choices[1].properties.actual.$ref, '#/$defs/ABusinessViolationValue');
    if (category === 'ai_gateway') {
      assert.deepEqual(choices.at(-1).properties.id.enum, ['ai_gateway.restore_cost_aggregates']);
      assert.equal(choices.at(-1).properties.expected.$ref, '#/$defs/ABusinessDigestValue');
      assert.equal(choices.at(-1).properties.actual.$ref, '#/$defs/ABusinessDigestValue');
      assert.match(a[key].required_proof, /cost aggregates/);
    }`);
});
console.log('Aligned proof requirements with the AI gateway aggregate checks');
