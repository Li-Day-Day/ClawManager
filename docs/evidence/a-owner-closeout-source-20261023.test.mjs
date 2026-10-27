import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {validateCloseoutSource} from './a-owner-closeout-source-20261023.mjs';
const source=JSON.parse(fs.readFileSync(new URL('./a-owner-profile-supplement-a1af4a2e2f5645c79fadfade1051f398-source.json',import.meta.url),'utf8'));
const digest=s=>crypto.createHash('sha256').update(s.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n').digest('hex');
test('exact native closeout snapshot validates without schema coercion',()=>validateCloseoutSource(source));
const cases=[
 ['resources manifest kind',s=>{s.kind='d_index_group_source_snapshot'}],
 ['unverified copy',s=>{s.stable_copy_verified=false}],
 ['dependency installation',s=>{s.dependencies_installed=true}],
 ['extra manifest authority',s=>{s.production_approved=true}],
 ['duplicate input',s=>{s.files.splice(1,0,structuredClone(s.files[0]))}],
 ['unsorted inputs',s=>{[s.files[0],s.files[1]]=[s.files[1],s.files[0]]}],
 ['parent traversal',s=>{s.files[0].path='backend/../outside.go'}],
 ['absolute input',s=>{s.files[0].path='C:/outside.go'}],
 ['backslash input',s=>{s.files[0].path='backend\\outside.go'}],
 ['blocked dependency tree',s=>{s.files[0].path='backend/vendor/outside.go'}],
 ['negative size',s=>{s.files[0].size=-1}],
 ['unsafe numeric size',s=>{s.files[0].size=Number.MAX_SAFE_INTEGER+1}],
 ['uppercase hash',s=>{s.files[0].sha256='A'.repeat(64)}],
 ['extra per-file authority',s=>{s.files[0].approved=true}],
];
for(const [name,mutate]of cases)test(name+' rejects even with recomputed digest',()=>{const s=structuredClone(source);mutate(s);s.source_sha256=digest(s);assert.throws(()=>validateCloseoutSource(s));});
test('unchanged inputs cannot claim another digest',()=>{const s=structuredClone(source);s.source_sha256='0'.repeat(64);assert.throws(()=>validateCloseoutSource(s),/source digest mismatch/)});
