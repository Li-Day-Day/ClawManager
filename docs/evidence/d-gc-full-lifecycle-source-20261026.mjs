import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {sha} from '../../scripts/system-backup-d-gc-full-collect-receiver.mjs';

const runnerPath='scripts/system-backup-a-evidence-validation.ps1';
const phaseOrigin='docs/evidence/d-gc-full-lifecycle-phase-20261026.sh';
const phaseTarget='scripts/system-backup-d-download-gc-full-lifecycle-phase.sh';
const special=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const excluded=new Set(['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__']);
const digest=files=>sha(files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n');
const pin=(p,b)=>({path:p,size:b.length,sha256:sha(b)});
function inventory(base){
  const names=[];
  function walk(rel){
    assert.equal(fs.lstatSync(path.join(base,rel)).isSymbolicLink(),false);
    for(const e of fs.readdirSync(path.join(base,rel),{withFileTypes:true})){
      assert.equal(e.isSymbolicLink(),false,'redirected source');const n=rel+'/'+e.name;
      if(e.isDirectory()){if(!excluded.has(e.name))walk(n);}
      else if(e.isFile()&&/\.(go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(n)&&(!n.startsWith('docs/')||/^docs\/[^/]+\.sql$/.test(n)||special.has(n)))names.push(n);
    }
  }
  for(const d of ['backend','contracts','scripts','docs'])walk(d);
  return names.sort().map(n=>pin(n,fs.readFileSync(path.join(base,n))));
}
const exactly=(s,from,to,n=1)=>{assert.equal(s.split(from).length-1,n,'harness selector changed: '+from);return s.split(from).join(to);};
export function overlayLifecycleRunner(text){
  // These substitutions construct a NEW reviewable source image. Existing
  // frozen sources and the central runner are never edited in place.
  let s=text;
  s=exactly(s,"if($ConfigDownloadGCFreezeOnly){ & (Join-Path $evidenceRoot 'scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1') }","if($ConfigDownloadGCFreezeOnly){ Write-Output 'LIFECYCLE_SCOPE dedicated_selector_overlay=yes historical_freeze_dispatch=not_selected' }");
  s=exactly(s,"Invoke-AEvidenceGoStep -Arguments @('test','-count=1',('-timeout='+$downloadEvidenceTestTimeout),'-v','./internal/systembackupsecurity','./internal/systembackupevidence') -Stage 'test-vet'","Write-Output 'LIFECYCLE_SCOPE ordinary_full_not_repeated=yes tagged_seeds_default_vet_and_linux_only=yes'");
  s=exactly(s,"'^Test(DDownloadGCFullCollectMySQLSeed|DDownloadGCFullProfileMySQLSeed)$'","'^Test(DDownloadGCFullLifecycleMySQLSeed|DDownloadGCFullCollectMySQLSeed|DDownloadGCFullProfileMySQLSeed)$'");
  s=exactly(s,"'d-download-gc-full-collect.test'","'d-download-gc-full-lifecycle.test'");
  s=exactly(s,"'d-download-gc-full-collect'","'d-download-gc-full-lifecycle'");
  s=exactly(s,"'scripts/system-backup-d-download-gc-full-collect-phase.sh'","'"+phaseTarget+"'");
  s=exactly(s,"VALIDATION_SCOPE download-gc-freeze-only=yes component=backup-lock-prerequisites scope=synthetic full-gc=not-run freeze-adapter=not-wired role-approval=no production-approval=no real_mysql=not_run","VALIDATION_SCOPE download-gc-full-lifecycle-only=yes public_collect=yes authority=synthetic_known_tasks physical=synthetic production-approval=no real_mysql=not_run");
  return s;
}
const originPaths=[phaseOrigin,'docs/evidence/d-gc-full-lifecycle-source-20261026.mjs','docs/evidence/d-gc-full-lifecycle-operator-20261026.ps1','docs/evidence/d-gc-full-lifecycle-receiver-20261026.mjs','docs/evidence/d-gc-full-lifecycle-requirements-20261026.json'];
export function lifecyclePlan(repo){
  const original=inventory(repo),bytes=new Map(original.map(p=>[p.path,fs.readFileSync(path.join(repo,p.path))]));
  for(const p of original)assert.deepEqual(pin(p.path,bytes.get(p.path)),p,'source changed between inventory and read');
  bytes.set(runnerPath,Buffer.from(overlayLifecycleRunner(bytes.get(runnerPath).toString('utf8'))));
  assert.ok(!bytes.has(phaseTarget),'phase target already exists; scope review required');
  bytes.set(phaseTarget,fs.readFileSync(path.join(repo,phaseOrigin)));
  const files=[...bytes].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,b])=>pin(p,b));
  const origins=originPaths.map(p=>pin(p,fs.readFileSync(path.join(repo,p))));
  assert.deepEqual(inventory(repo),original,'root changed while planning');
  return {bytes,result:{kind:'d_gc_full_lifecycle_source_candidate.v1',source_sha256:digest(files),files,original_source_sha256:digest(original),original_files:original,origin_harness_pins:origins,overlays:[{path:runnerPath,reason:'exclusive lifecycle selector and narrow ordinary-test scope'},{path:phaseTarget,origin:phaseOrigin}],stable_copy_verified:false,dependencies_installed:false,production_approved:false,actual_mysql_executed:false}};
}
function ownerPath(repo,owner){assert.equal(path.dirname(owner),repo);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.realpathSync(owner),owner);assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [mode,repoArg,...args]=process.argv.slice(2),repo=path.resolve(repoArg);
  const evidence=path.join(repo,'docs','evidence');
  const receipt=p=>{const absolute=path.resolve(p);assert.equal(path.dirname(absolute),evidence);return absolute;};
  if(mode==='render'){
    process.stdout.write(overlayLifecycleRunner(fs.readFileSync(path.join(repo,runnerPath),'utf8')));
  }else if(mode==='plan'){
    const {result}=lifecyclePlan(repo);fs.writeFileSync(receipt(args[0]),JSON.stringify(result,null,2)+'\n',{flag:'wx'});process.stdout.write(JSON.stringify({source_sha256:result.source_sha256,files:result.files.length,status:'requires_exact_A_source_review_before_capture_or_Go'})+'\n');
  }else if(mode==='capture'){
    const [ownerArg,outArg,reviewArg]=args,owner=path.resolve(ownerArg);ownerPath(repo,owner);
    const review=JSON.parse(fs.readFileSync(receipt(reviewArg),'utf8')),{bytes,result}=lifecyclePlan(repo);
    assert.equal(review.kind,'d_gc_full_lifecycle_source_review.v1');assert.equal(review.reviewer,'A');assert.equal(review.status,'accepted_exact_lifecycle_candidate_inputs');assert.equal(review.production_approved,false);
    for(const k of ['source_sha256','files','original_source_sha256','original_files','origin_harness_pins'])assert.deepEqual(result[k],review[k],k+' requires renewed review');
    const target=path.join(owner,'source');assert.equal(fs.existsSync(target),false);fs.mkdirSync(target);
    for(const [p,b] of bytes){const to=path.join(target,p);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,b,{flag:'wx'});fs.chmodSync(to,0o444);}
    assert.deepEqual(inventory(target),result.files);assert.deepEqual(inventory(repo),result.original_files);
    result.stable_copy_verified=true;fs.writeFileSync(receipt(outArg),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    process.stdout.write('LOCAL_SOURCE config-writer-frozen=yes source_sha256='+result.source_sha256+' files='+result.files.length+'\n');
  }else if(mode==='check'){
    const owner=path.resolve(args[0]);ownerPath(repo,owner);
    const m=JSON.parse(fs.readFileSync(receipt(args[1]),'utf8'));assert.equal(m.stable_copy_verified,true);assert.deepEqual(inventory(path.join(owner,'source')),m.files);assert.equal(digest(m.files),m.source_sha256);process.stdout.write('LIFECYCLE_FROZEN_POSTCHECK passed\n');
  }else throw Error('expected plan, capture or check');
}
