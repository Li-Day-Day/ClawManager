import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Clone the already frozen joint source. Overlay only explicitly named tagged
// test/script preparation inputs; never pull a newer ordinary backend into the
// proof of the joint native suite. This tool does not run Go or install modules.
const [rootArg,baseArg,targetArg,manifestArg]=process.argv.slice(2);
const root=path.resolve(rootArg),base=path.resolve(baseArg),target=path.resolve(targetArg),manifest=path.resolve(manifestArg);
for(const source of [base,target]){
  const owner=path.dirname(source);assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.realpathSync(owner),owner);assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));assert.equal(path.basename(source),'source');
}
assert.equal(fs.realpathSync(base),base);assert.equal(fs.existsSync(target),false);assert.notEqual(base,target);assert.equal(path.dirname(manifest),path.join(root,'docs/evidence'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const special=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const excluded=new Set(['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__']);
function pins(directory){
  const out=[];
  function walk(relative){
    assert.equal(fs.lstatSync(path.join(directory,relative)).isSymbolicLink(),false);
    for(const entry of fs.readdirSync(path.join(directory,relative),{withFileTypes:true})){
      const name=(relative+'/'+entry.name).replaceAll('\\','/');assert.equal(entry.isSymbolicLink(),false);
      if(entry.isDirectory()){if(!excluded.has(entry.name))walk(name);}
      else if(entry.isFile()&&/\.(go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name)&&(!name.startsWith('docs/')||/^docs\/[^/]+\.sql$/.test(name)||special.has(name))){const bytes=fs.readFileSync(path.join(directory,name));out.push({path:name,size:bytes.length,sha256:sha(bytes)});}
    }
  }
  for(const dir of ['backend','contracts','scripts','docs'])walk(dir);
  return out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
const digest=ps=>sha(ps.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n');
const before=pins(base);fs.mkdirSync(target);
for(const p of before){const bytes=fs.readFileSync(path.join(base,p.path));assert.equal(sha(bytes),p.sha256);const to=path.join(target,p.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes,{flag:'wx'});fs.chmodSync(to,0o444);}
assert.deepEqual(pins(base),before);assert.deepEqual(pins(target),before);
const tag='backend/internal/systembackupevidence/bootstrap_original_materials_mysql_test.go';
const scripts=['system-backup-a-evidence-validation.ps1','system-backup-d-config-writer-validation.ps1','system-backup-d-download-gc-full-profile-phase.sh','system-backup-d-download-gc-full-profile-dispatch.test.ps1','system-backup-d-download-gc-full-collect-phase.sh','system-backup-d-download-gc-full-collect-dispatch.test.ps1','system-backup-d-gc-full-collect-receiver.mjs','system-backup-d-gc-full-collect-receiver.test.mjs','system-backup-d-gc-full-profile-prepare.ps1','system-backup-d-gc-frozen-supplement-snapshot.mjs'].map(p=>'scripts/'+p);
const changes=[];
for(const name of [tag,...scripts]){
  const from=name===tag?path.join(path.dirname(base),'overlays',tag):path.join(root,name);assert.equal(fs.lstatSync(from).isSymbolicLink(),false);const bytes=fs.readFileSync(from);
  if(name===tag){assert.equal(bytes.length,25537);assert.equal(sha(bytes),'19b1c83160c3cc93f707ed90dfbe06155e2ae6a5f04d727a8d1e3e97496ee2ad');assert.match(bytes.toString('utf8'),/^\/\/go:build systembackup_mysql\r?\n/);}
  const old=before.find(p=>p.path===name)??null,pin={path:name,size:bytes.length,sha256:sha(bytes)};
  const to=path.join(target,name);if(fs.existsSync(to))fs.chmodSync(to,0o644);fs.writeFileSync(to,bytes);fs.chmodSync(to,0o444);assert.equal(sha(fs.readFileSync(from)),pin.sha256,'overlay source changed');
  if(old?.sha256!==pin.sha256)changes.push({path:name,before:old,after:pin,scope:name===tag?'D1 tagged local seed/compile only':'GC preparation script only'});
}
assert.deepEqual(pins(base),before);
const files=pins(target),result={kind:'d_gc_full_frozen_source.v1',source_sha256:digest(files),files,stable_copy_verified:true,dependencies_installed:false,frozen_joint_base_source_sha256:digest(before),explicit_preparation_delta:changes,ordinary_backend_from_joint_only:true,whole_current_tree_ready:false};
fs.writeFileSync(manifest,JSON.stringify(result,null,2)+'\n',{flag:'wx'});process.stdout.write('GC_FROZEN_SUPPLEMENT_SOURCE '+result.source_sha256+' files='+files.length+' explicit_delta='+changes.length+'\n');
