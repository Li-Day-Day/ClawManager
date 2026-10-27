import path from 'node:path';
import assert from 'node:assert/strict';

// Trace actual go-list -deps -test JSON, retaining synthetic variants for their
// test-import edges. Generated test-main files are compiler cache products.
export function selectedGoClosure(rows,roots){
  assert.ok(roots.length>0);assert.equal(new Set(roots).size,roots.length);
  const packages=new Map(rows.map(row=>[row.ImportPath,row]));assert.equal(packages.size,rows.length);
  const todo=rows.filter(row=>roots.includes(row.ImportPath)||roots.includes(row.ForTest)).map(row=>row.ImportPath);
  for(const root of roots)assert.ok(packages.has(root),'Missing selected root '+root);
  const visited=new Set(),files=new Set(),directories=new Set();
  while(todo.length){
    const name=todo.pop();if(visited.has(name))continue;visited.add(name);
    const row=packages.get(name);assert.ok(row,'Missing selected dependency '+name);
    assert.equal(row.Error,undefined);assert.ok(!row.Incomplete&&!row.DepsErrors?.length);
    for(const child of row.Imports??[])if(!visited.has(child))todo.push(child);
    if(!name.startsWith('clawreef/')||name.endsWith('.test'))continue;
    assert.equal(row.Module?.Path,'clawreef');assert.equal(row.Module.Main,true);
    assert.ok(row.Module.Dir&&row.Dir);
    const dir=path.win32.relative(row.Module.Dir,row.Dir).replaceAll('\\','/');
    assert.ok(dir&&!dir.startsWith('..')&&!path.win32.isAbsolute(dir));
    const directory='backend/'+dir;directories.add(directory);
    const fields=['GoFiles','CgoFiles','CFiles','CXXFiles','MFiles','HFiles','FFiles','SFiles','SwigFiles','SwigCXXFiles','SysoFiles','EmbedFiles'];
    if(roots.includes(row.ImportPath))fields.push('TestGoFiles','XTestGoFiles','TestEmbedFiles','XTestEmbedFiles');
    for(const field of fields)for(const input of row[field]??[]){
      assert.ok(typeof input==='string'&&input&&!path.win32.isAbsolute(input)&&!input.split(/[\\/]/).some(p=>['','.','..'].includes(p)));
      files.add(directory+'/'+input.replaceAll('\\','/'));
    }
  }
  return{files:[...files].sort(),directories:[...directories].sort()};
}

export function checkSelectedPackageSets(directories,frozenPins,targetPins){
  const names=(pins,directory)=>pins.filter(p=>p.path.endsWith('.go')&&path.posix.dirname(p.path)===directory).map(p=>p.path).sort();
  for(const directory of directories)assert.deepEqual(names(frozenPins,directory),names(targetPins,directory),
    'Selected package Go file set changed: '+directory);
}
