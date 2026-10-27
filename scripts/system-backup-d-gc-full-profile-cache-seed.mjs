import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [rootArg,sourceArg,targetArg]=process.argv.slice(2),root=path.resolve(rootArg),source=path.resolve(sourceArg),target=path.resolve(targetArg),owner=path.dirname(target);
assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(path.basename(target),'cache');assert.equal(fs.realpathSync(owner),owner);assert.equal(fs.realpathSync(target),target);assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
let copied=0,bytes=0,available=fs.existsSync(source);
if(available){
  assert.equal(fs.realpathSync(source),source);assert.equal(fs.lstatSync(source).isSymbolicLink(),false);assert.notEqual(source,target);
  for(const dir of fs.readdirSync(source,{withFileTypes:true})){
    if(!dir.isDirectory()||!/^[a-f0-9]{2}$/.test(dir.name))continue;
    assert.equal(fs.lstatSync(path.join(source,dir.name)).isSymbolicLink(),false);
    for(const entry of fs.readdirSync(path.join(source,dir.name),{withFileTypes:true})){
      if(!entry.isFile()||!/^[a-f0-9]{64}-[ad]$/.test(entry.name))continue;
      let raw;try{raw=fs.readFileSync(path.join(source,dir.name,entry.name));}catch(e){if(['ENOENT','EACCES','EPERM','EBUSY'].includes(e.code))continue;throw e;}
      fs.mkdirSync(path.join(target,dir.name),{recursive:true});fs.writeFileSync(path.join(target,dir.name,entry.name),raw,{flag:'wx'});copied++;bytes+=raw.length;
    }
  }
}
process.stdout.write(JSON.stringify({kind:'d_gc_full_profile_compilation_seed.v1',source,target,available,copied,bytes,source_read_only:true,test_result_reuse:false,compiler_not_started:true,dependencies_installed:false})+'\n');
