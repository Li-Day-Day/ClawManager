import test from 'node:test';
import assert from 'node:assert/strict';
import {assertExactTagDelta} from './d-local-current-source-composition-20261026.mjs';
const tagged='backend/cmd/server/system_backup_read_drill_history_mysql_test.go';
const original={path:tagged,size:15250,sha256:'04ff3f7266b9b99c72cd024b1c189e34fbb13c613231f7da41a1b1d63b09be9b'};
const repair={path:tagged,size:20190,sha256:'e8df47f25eb1765cb354a7f88a1dc2952bc56b699129d7ac8ba604c91b3e21b7'};
const production={path:'backend/production.go',size:1,sha256:'a'.repeat(64)};
test('exact tagged delta tolerates independent manifest ordering',()=>{
 assert.equal(assertExactTagDelta([production,original],[repair,production]).length,2);
});
for(const [name,change]of [
 ['removed source',a=>a.pop()],['added source',a=>a.push({path:'contracts/new.json',size:1,sha256:'b'.repeat(64)})],
 ['duplicate path',a=>a.push({...a[0]})],['production bytes changed',a=>a[1].sha256='c'.repeat(64)],
 ['repair bytes differ',a=>a[0].sha256='d'.repeat(64)],['declared size differs',a=>a[0].size++],
 ['parent traversal',a=>a[0].path='backend/../outside.go'],['absolute path',a=>a[0].path='C:/outside.go']
])test('reject '+name,()=>{const a=[{...repair},{...production}];change(a);assert.throws(()=>assertExactTagDelta([production,original],a));});
