import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedGoClosure,checkSelectedPackageSets} from './a-native-selected-go-closure-20261027.mjs';
const root='clawreef/internal/root',module={Path:'clawreef',Main:true,Dir:'C:\\frozen\\backend'};
const row=(ImportPath,dir,fields={})=>({ImportPath,Module:module,Dir:module.Dir+'\\'+dir,Imports:[],GoFiles:['main.go'],...fields});
const graph=()=>[row(root,'internal\\root',{GoFiles:['root.go'],TestGoFiles:['root_test.go'],XTestGoFiles:['external_test.go'],TestEmbedFiles:['testdata/input.json']}),
  row(root+' [root.test]','internal\\root',{ForTest:root,GoFiles:['root.go','root_test.go'],Imports:['clawreef/internal/only-test-dependency']}),
  row('clawreef/internal/root_test [root.test]','internal\\root',{ForTest:root,GoFiles:['external_test.go'],Imports:['clawreef/internal/external-test-dependency']}),
  row('clawreef/internal/only-test-dependency','internal\\only-test-dependency',{EmbedFiles:['schema.json']}),
  row('clawreef/internal/external-test-dependency','internal\\external-test-dependency'),
  {ImportPath:root+'.test',ForTest:root,Imports:[root+' [root.test]'],GoFiles:['C:\\cache\\generated-d']},
  row('clawreef/internal/unrelated','internal\\unrelated',{TestGoFiles:['not-run_test.go']})];
test('closure retains internal/external test-only edges and embeds, excluding unrelated package tests',()=>{
  const actual=selectedGoClosure(graph(),[root]);
  assert.ok(actual.files.includes('backend/internal/only-test-dependency/schema.json'));
  assert.ok(actual.files.includes('backend/internal/external-test-dependency/main.go'));
  assert.ok(actual.files.includes('backend/internal/root/testdata/input.json'));
  assert.ok(actual.files.includes('backend/internal/root/external_test.go'));
  assert.ok(!actual.files.some(p=>p.includes('cache')||p.includes('unrelated')));
});
test('test-only dependency omissions and malformed graphs cannot shrink closure',()=>{
  const missing=graph().filter(row=>row.ImportPath!=='clawreef/internal/only-test-dependency');
  const escaped=graph();escaped[0].TestGoFiles=['../outside_test.go'];
  const duplicate=graph();duplicate.push(duplicate[0]);
  for(const rows of [missing,escaped,duplicate])assert.throws(()=>selectedGoClosure(rows,[root]));
});
test('a newly added source file in a selected package invalidates metadata reuse',()=>{
  const before=[{path:'backend/internal/root/root.go'}],after=[...before,{path:'backend/internal/root/new_linux.go'}];
  assert.doesNotThrow(()=>checkSelectedPackageSets(['backend/internal/root'],before,before));
  assert.throws(()=>checkSelectedPackageSets(['backend/internal/root'],before,after));
});
