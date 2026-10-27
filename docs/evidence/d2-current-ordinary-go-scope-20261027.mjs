import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {remainingOrdinaryPackages} from './d2-current-ordinary-inventory-20261027.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sorted=values=>[...new Set(values)].sort();
const productionFields=['GoFiles','CgoFiles','CFiles','CXXFiles','MFiles','HFiles','FFiles','SFiles','SwigFiles','SwigCXXFiles','SysoFiles','EmbedFiles'];
const testFields=['TestGoFiles','XTestGoFiles','TestEmbedFiles','XTestEmbedFiles'];

// Actual build metadata only. Generated test mains/ForTest variants remain in
// the raw capture; original packages supply the separately selected source and
// test files. Every local selected file must match a frozen manifest pin.
export function describeOrdinaryScope(rows,packages,source,pins,read=fs.readFileSync){
  assert.ok(packages.length>0&&packages.every(p=>remainingOrdinaryPackages.includes(p)));
  assert.equal(new Set(packages).size,packages.length);
  for(const row of rows){assert.equal(row.Error,undefined);assert.ok(!row.Incomplete);assert.ok(!row.DepsErrors?.length);assert.equal(typeof row.ImportPath,'string');}
  const originals=rows.filter(r=>r.ImportPath.startsWith('clawreef/')&&!r.ForTest&&!r.ImportPath.endsWith('.test')&&!r.ImportPath.includes(' ['));
  const names=originals.map(r=>r.ImportPath);assert.equal(new Set(names).size,names.length);
  for(const p of packages)assert.ok(names.includes('clawreef/'+p),'Requested package absent from go list');
  const map=new Map(pins.map(p=>[p.path,p])),selected=new Map();
  const describeFiles=(row,fields)=>sorted(fields.flatMap(field=>row[field]??[])).map(file=>{
    assert.equal(typeof row.Dir,'string');assert.equal(typeof file,'string');
    assert.ok(file&&!path.isAbsolute(file)&&!file.split(/[\\/]/).some(p=>p==='..'||p==='.'||p===''));
    const absolute=path.resolve(row.Dir,file),relative=path.relative(source,absolute).replaceAll('\\','/');
    assert.ok(relative.startsWith('backend/')&&!relative.split('/').includes('..'),'Project source outside frozen backend');
    const pin=map.get(relative);assert.ok(pin,'Unmanifested selected input: '+relative);
    const bytes=read(absolute);assert.equal(bytes.length,pin.size);assert.equal(sha(bytes),pin.sha256);
    selected.set(relative,pin);return relative;
  });
  const metadata=originals.sort((a,b)=>a.ImportPath.localeCompare(b.ImportPath)).map(row=>({package:row.ImportPath,
    production_files:describeFiles(row,productionFields),test_files:describeFiles(row,testFields),
    imports:sorted(row.Imports??[]),test_imports:sorted(row.TestImports??[]),external_test_imports:sorted(row.XTestImports??[])}));
  return {listed_packages:rows.length,generated_or_test_variant_rows:rows.filter(r=>r.ForTest||r.ImportPath.endsWith('.test')||r.ImportPath.includes(' [')).length,
    project_packages:metadata,selected_files:[...selected.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,3,'Usage: ordinary-go-scope OWNER');
  const root=path.resolve(import.meta.dirname,'../..'),owner=path.resolve(process.argv[2]);assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.lstatSync(owner).isSymbolicLink(),false);assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
  const id=path.basename(owner).slice('.tmp-d-index-cache-'.length),prefix=path.join(root,'docs/evidence/d2-current-ordinary-native-'+id);
  const manifestPath=prefix+'.source.json',manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.kind,'d_local_closeout_snapshot.v1');const packages=JSON.parse(fs.readFileSync(path.join(owner,'ordinary-packages.json'),'utf8'));
  const captures=[];
  for(const goos of ['windows','linux'])for(const tags of ['ordinary','systembackup_mysql']){
    const log=prefix+`.${goos}.${tags}.jsonl`,bytes=fs.readFileSync(log);
    captures.push({goos_label:goos,tags_label:tags,input:{path:log,size:bytes.length,sha256:sha(bytes)},...describeOrdinaryScope(parseGoList(bytes.toString('utf8')),packages,path.join(owner,'source'),manifest.files)});
  }
  const result={kind:'d2_current_ordinary_actual_go_list_scope.v1',scope:'Actual dependency/test metadata and selected frozen source pins; command exits and source pre/postcheck require the native receipt',manifest:{path:manifestPath,size:manifestBytes.length,sha256:sha(manifestBytes)},requested_packages:packages,captures,Go_executed_by_reader:false,actual_mysql:false,source_scope_accepted:false};
  fs.writeFileSync(prefix+'.scope.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:prefix+'.scope.json',captures:captures.length,selected_file_counts:captures.map(c=>c.selected_files.length)}));
}
