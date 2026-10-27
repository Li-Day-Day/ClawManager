import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode, rootArg, ...args] = process.argv.slice(2);
const root = path.resolve(rootArg);
const special = new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const excluded = new Set(['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function files(base) {
  const out=[];
  function walk(relative) {
    const absolute=path.join(base,relative);
    assert.equal(fs.lstatSync(absolute).isSymbolicLink(),false,'redirected source directory');
    for(const entry of fs.readdirSync(absolute,{withFileTypes:true})) {
      const name=(relative+'/'+entry.name).replaceAll('\\','/');
      assert.equal(entry.isSymbolicLink(),false,'redirected source');
      if(entry.isDirectory()) { if(!excluded.has(entry.name)) walk(name); }
      else if(entry.isFile() && /\.(go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name) && (!name.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(name) || special.has(name))) out.push(name);
    }
  }
  for(const dir of ['backend','contracts','scripts','docs']) walk(dir);
  return out.sort();
}
function pins(base) {
  return files(base).map(name=>{
    const absolute=path.join(base,name);
    assert.equal(fs.lstatSync(absolute).isSymbolicLink(),false);
    const bytes=fs.readFileSync(absolute);
    return {path:name,size:bytes.length,sha256:sha(bytes)};
  });
}
function digest(entries) { return sha(entries.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'); }
if(mode==='capture') {
  const [targetArg,manifestArg]=args,target=path.resolve(targetArg),manifest=path.resolve(manifestArg),owner=path.dirname(target);
  assert.equal(path.dirname(owner),root);
  assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.realpathSync(owner),owner);
  assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
  assert.equal(path.basename(target),'source');assert.equal(fs.existsSync(target),false);
  assert.equal(path.dirname(manifest),path.join(root,'docs','evidence'));
  const before=pins(root);
  fs.mkdirSync(target);
  for(const p of before) {
    const bytes=fs.readFileSync(path.join(root,p.path));
    assert.equal(sha(bytes),p.sha256,'source drift while copying '+p.path);
    const to=path.join(target,p.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes,{flag:'wx'});
    fs.chmodSync(to,0o444);
  }
  assert.deepEqual(pins(root),before,'source changed during snapshot');
  assert.deepEqual(pins(target),before,'frozen copy mismatch');
  const result={kind:'d_gc_full_frozen_source.v1',source_sha256:digest(before),files:before,stable_copy_verified:true,dependencies_installed:false};
  fs.writeFileSync(manifest,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  process.stdout.write('GC_FULL_SOURCE '+result.source_sha256+' files='+before.length+'\n');
} else if(mode==='seed') {
  const [fromArg,toArg,reportArg]=args,from=path.resolve(fromArg),to=path.resolve(toArg),report=path.resolve(reportArg);
  for(const cache of [from,to]) {
    const owner=path.dirname(cache);
    assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
    assert.equal(fs.realpathSync(owner),owner);assert.equal(fs.realpathSync(cache),cache);
    assert.equal(path.basename(cache),'cache');assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
  }
  assert.notEqual(from,to);assert.equal(path.dirname(report),path.join(root,'docs','evidence'));
  let copied=0,bytes=0,unavailable=0;
  for(const d of fs.readdirSync(from,{withFileTypes:true})) {
    if(!d.isDirectory() || !/^[a-f0-9]{2}$/.test(d.name))continue;
    for(const entry of fs.readdirSync(path.join(from,d.name),{withFileTypes:true})) {
      if(!entry.isFile() || !/^[a-f0-9]{64}-[ad]$/.test(entry.name))continue;
      let raw;try { raw=fs.readFileSync(path.join(from,d.name,entry.name)); } catch(e) { if(['ENOENT','EPERM','EACCES','EBUSY'].includes(e.code)){unavailable++;continue;}throw e; }
      fs.mkdirSync(path.join(to,d.name),{recursive:true});fs.writeFileSync(path.join(to,d.name,entry.name),raw,{flag:'wx'});copied++;bytes+=raw.length;
    }
  }
  fs.writeFileSync(report,JSON.stringify({kind:'d_gc_full_compilation_seed.v1',from,to,copied,bytes,unavailable,source_read_only:true,test_results_reused:false,dependencies_installed:false})+'\n',{flag:'wx'});
  process.stdout.write('GC_FULL_COMPILATION_SEED entries='+copied+' test_results_reused=no\n');
} else if(mode==='check') {
  const manifest=JSON.parse(fs.readFileSync(path.resolve(args[0]),'utf8'));
  assert.deepEqual(pins(root),manifest.files);assert.equal(digest(manifest.files),manifest.source_sha256);
  process.stdout.write('GC_FULL_FROZEN_POSTCHECK passed\n');
} else throw Error('unknown snapshot mode');
