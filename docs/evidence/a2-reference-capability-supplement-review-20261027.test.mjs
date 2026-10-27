import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {acceptedWindows,compareInputs} from './a2-reference-capability-supplement-review-20261027.mjs';

const accepted=acceptedWindows();
const life='backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go';
const script='scripts/system-backup-d-bootstrap-entry-linux-supplement.ps1';
const valid=()=>({files:accepted.old.files.map(p=>{
  if(![life,script].includes(p.path)) return {...p};
  const b=fs.readFileSync(p.path);return {path:p.path,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};
})});
test('accept only current fourteen-token GC repair and independent driver delta',()=>{
  assert.equal(compareInputs(valid(),accepted).length,2);
});
const cases=[
  ['missing compiled source',v=>{v.files=v.files.filter(p=>!p.path.endsWith('/reference.go'));}],
  ['duplicate source pin',v=>{v.files.push({...v.files[0]});}],
  ['added Go source',v=>{v.files.push({path:'backend/internal/systembackupcatrust/extra.go',size:1,sha256:'a'.repeat(64)});}],
  ['ordinary runtime change',v=>{v.files.find(p=>p.path.endsWith('/systembackupcatrust/ca.go')).sha256='a'.repeat(64);}],
  ['ordinary test change',v=>{v.files.find(p=>p.path.endsWith('/systembackupcatrust/ca_test.go')).sha256='a'.repeat(64);}],
  ['regression omission',v=>{v.files=v.files.filter(p=>!p.path.endsWith('/reference_contract_parity_test.go'));}],
  ['old decoder restored',v=>{v.files.find(p=>p.path.endsWith('/reference.go')).sha256='99de31e723c22e1b3f8cbf33f0689054ae7ec589bab0c4c3e3666c26ca083022';}],
  ['schema broadened',v=>{v.files.find(p=>p.path==='contracts/system-backup/v12/secret-ref.schema.json').sha256='a'.repeat(64);}],
  ['unreviewed GC repair',v=>{v.files.find(p=>p.path===life).sha256='a'.repeat(64);}],
  ['GC repair wrong size',v=>{v.files.find(p=>p.path===life).size++;}],
  ['unreviewed peer driver',v=>{v.files.find(p=>p.path===script).sha256='a'.repeat(64);}],
  ['path traversal',v=>{v.files[0].path='../'+v.files[0].path;}],
  ['negative size',v=>{v.files[0].size=-1;}],
];
for(const [name,mutate] of cases)test('reject '+name,()=>{const v=valid();mutate(v);assert.throws(()=>compareInputs(v,accepted));});
