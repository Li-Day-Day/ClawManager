import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewVerboseGo,selectedProjectFiles} from './a-d-api-native-scope-review-20261027.mjs';

const pkg='clawreef/internal/systembackupapi';
const server='clawreef/cmd/server';
const good='=== RUN   TestA\n=== RUN   TestA/child\n--- PASS: TestA (0.01s)\n    --- PASS: TestA/child (0.00s)\nPASS\nok  '+pkg+' 0.123s\n';
test('verbose native receiver closes root and nested run/pass inventories',()=>{
  assert.deepEqual(reviewVerboseGo(good,pkg,['TestA']),{package:pkg,roots:['TestA'],passed_events:2});
});
test('verbose receiver refuses failures, skips, cache/no-test and unfinished logs',()=>{
  for(const text of [good.replace('PASS: TestA/child','FAIL: TestA/child'),good.replace('PASS: TestA/child','SKIP: TestA/child'),
    good.replace('0.123s','(cached)'),good.replace('=== RUN   TestA/child\n',''),good.replace('PASS\nok','ok'),
    good+'FAIL\n','? '+pkg+' [no test files]\n'])assert.throws(()=>reviewVerboseGo(text,pkg,['TestA']));
});
test('verbose receiver refuses duplicates, wrong packages and omitted roots',()=>{
  for(const text of [good.replace('=== RUN   TestA\n','=== RUN   TestA\n=== RUN   TestA\n'),
    good.replace('--- PASS: TestA (0.01s)','--- PASS: TestA (0.01s)\n--- PASS: TestA (0.01s)'),
    good.replace(pkg,server)])assert.throws(()=>reviewVerboseGo(text,pkg,['TestA']));
  assert.throws(()=>reviewVerboseGo(good,pkg,['TestA','TestB']));
  assert.throws(()=>reviewVerboseGo(good.replace('=== RUN   TestA\n','--- PASS: TestA (0.01s)\n').replace('--- PASS: TestA (0.01s)\nPASS','PASS'),pkg,['TestA']));
});
const module={Path:'clawreef',Main:true,Dir:'C:\\snapshot\\backend'};
const row=(ImportPath,directory,extra={})=>({ImportPath,Dir:module.Dir+'\\'+directory,Module:module,GoFiles:['main.go'],Imports:[],...extra});
function graph(){return[row(pkg,'internal\\systembackupapi',{Imports:['clawreef/internal/dep'],TestGoFiles:['main_test.go']}),
  row(server,'cmd\\server'),row('clawreef/internal/dep','internal\\dep'),
  {ImportPath:pkg+'.test',ForTest:pkg,GoFiles:['C:\\cache\\generated-d'],Imports:[pkg]}];}
test('dependency receiver follows project imports and excludes generated test mains',()=>{
  assert.deepEqual(selectedProjectFiles(graph()),['backend/cmd/server/main.go','backend/internal/dep/main.go',
    'backend/internal/systembackupapi/main.go','backend/internal/systembackupapi/main_test.go']);
});
test('dependency receiver rejects omissions, duplicate rows, incomplete packages and path escape',()=>{
  const missing=graph().filter(r=>r.ImportPath!=='clawreef/internal/dep');
  const duplicate=graph();duplicate.push(duplicate[0]);
  const incomplete=graph();incomplete[2].Incomplete=true;
  const escape=graph();escape[2].GoFiles=['../escape.go'];
  const foreignModule=graph();foreignModule[2].Module={...module,Path:'other'};
  const externalDir=graph();externalDir[2].Dir='C:\\outside';
  for(const rows of [missing,duplicate,incomplete,escape,foreignModule,externalDir])assert.throws(()=>selectedProjectFiles(rows));
});
