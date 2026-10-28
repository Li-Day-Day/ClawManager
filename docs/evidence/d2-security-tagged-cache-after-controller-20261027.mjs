import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';


// Root's exact current window only. This copies completed immutable cache
// objects for the later metrics increment; it never invokes Go or accepts 15 stages.
const root=path.resolve(import.meta.dirname,'../..');
const sourceOwner=path.join(root,'.tmp-d-index-cache-6eb295fa53fa4b299fc506a66bc76960');
const prefix=path.join(root,'docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2');
const log=prefix+'.step-4.jsonl',manifestPath=prefix+'.source.json';
const output=path.join(root,'docs/evidence/d2-security-tagged-cache-after-controller-20261027.json');
assert.equal(fs.existsSync(output),false,'One-shot continuation already exists');
const owner=path.join(root,'.tmp-d-index-cache-'+crypto.randomUUID().replaceAll('-',''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const plain=p=>{assert.equal(fs.realpathSync(p),p);assert.equal(fs.lstatSync(p).isSymbolicLink(),false);};
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const free=()=>{const s=fs.statfsSync(root,{bigint:true});return s.bavail*s.bsize;};
const floor=8n*1024n*1024n*1024n,misses=new Set(['ENOENT','EACCES','EPERM','EBUSY']);
const report={kind:'d2_security_tagged_compilation_cache_continuation.v1',status:'waiting_for_completed_controller_tests',node_pid:process.pid,
  sourceOwner,owner,owner_created:false,source_read_only:true,source_mutated:false,Go_started:false,tests_started:false,
  test_result_reuse:false,dependencies_installed:false,whole_owner_window_accepted:false,entries:[],source_misses:0,space_limited:false,error:null};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
save();console.log(JSON.stringify({status:report.status,owner,node_pid:process.pid,Go_started:false}));
try{
  const deadline=Date.now()+90*60*1000;let completed;
  while(!completed){
    if(fs.existsSync(prefix+'.json')||!fs.existsSync(sourceOwner)){report.status='source_ended_without_copy';save();process.exit(0);}
    if(Date.now()>=deadline){report.status='wait_expired_without_copy';save();process.exit(0);}
    if(fs.existsSync(log)){
      const text=fs.readFileSync(log,'utf8');
      if(text.endsWith('\n')){
        const rows=text.trim()?text.trim().split(/\r?\n/).map(JSON.parse):[];
        if(rows.some(r=>r.Action==='pass'&&!r.Test&&r.Package==='clawreef/internal/systembackupcontroller')){
          const names=validateGoEvents(text,'clawreef/internal/systembackupcontroller');for(const n of ['TestControllerCleanupUsesEachImmutableDeadline','TestControllerResidualVolumeUsesEachImmutableDeadline','TestControllerCleanupRejectsUnknownResidualVolumeFacts'])assert.ok(names.includes(n));completed=Buffer.from(text);
        }
      }
    }
    if(!completed)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  const manifest=json(manifestPath);assert.equal(manifest.kind,'d2_metrics_controller_private_candidate_snapshot.v1');
  assert.equal(manifest.source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
  assert.equal(manifest.files.length,1718);assert.equal(manifest.complete_source_file_set.physical_files,1719);
  plain(sourceOwner);plain(path.join(sourceOwner,'cache'));
  assert.equal(fs.readFileSync(path.join(sourceOwner,'owner.txt'),'utf8'),path.basename(sourceOwner));
  for(const pin of [...manifest.files,...manifest.node_extra_inputs]){const b=fs.readFileSync(path.join(sourceOwner,'source',pin.path));assert.equal(b.length,pin.size);assert.equal(sha(b),pin.sha256);}
  report.completed_seed_log={path:log,sha256:sha(completed)};report.frozen_source_bytes_checked=true;
  if(free()<=floor){report.status='space_floor_no_copy';save();process.exit(0);}
  fs.mkdirSync(owner);fs.writeFileSync(path.join(owner,'owner.txt'),path.basename(owner),{flag:'wx'});fs.mkdirSync(path.join(owner,'cache'));
  report.owner_created=true;report.status='copying_completed_CAS_only';save();
  const names=[];
  for(const d of fs.readdirSync(path.join(sourceOwner,'cache'),{withFileTypes:true})){
    if(!d.isDirectory()||!/^[a-f0-9]{2}$/.test(d.name))continue;
    const folder=path.join(sourceOwner,'cache',d.name);plain(folder);
    for(const f of fs.readdirSync(folder,{withFileTypes:true}))if(f.isFile()&&/^[a-f0-9]{64}-[ad]$/.test(f.name))names.push(d.name+'/'+f.name);
  }
  for(const name of names.sort()){
    let b;try{const p=path.join(sourceOwner,'cache',name);plain(p);b=fs.readFileSync(p);}catch(e){if(misses.has(e.code)){report.source_misses++;continue;}throw e;}
    if(free()-BigInt(b.length)<floor){report.space_limited=true;break;}
    const to=path.join(owner,'cache',name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,b,{flag:'wx'});
    const hash=sha(b);assert.equal(sha(fs.readFileSync(to)),hash);report.entries.push({name,size:b.length,sha256:hash});
  }
  report.status='prepared_compiler_cache_only';
}catch(e){report.error=e.message;report.status='failed';process.exitCode=1;}
finally{
  report.prepared_bytes=report.entries.reduce((n,p)=>n+p.size,0);save();
  if(report.owner_created)fs.writeFileSync(path.join(owner,'preparation.json'),JSON.stringify({kind:report.kind,owner,report:output,
    report_sha256:sha(fs.readFileSync(output)),cache_only:true,tests_started:false,test_result_reuse:false},null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({status:report.status,owner,entries:report.entries.length,bytes:report.prepared_bytes,error:report.error,Go_started:false}));
