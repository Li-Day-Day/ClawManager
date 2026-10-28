import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix=path.join(root,'docs/evidence/d2-metrics-controller-candidate-e08f-20261027');
const sourcePath=prefix+'.source.json',inventoryPath=prefix+'.inventory.json',terminalPath=prefix+'.json';
const output=path.join(root,'docs/evidence/a2-metrics-post-native-namespace-observed-20261027.json');
const owner=path.join(root,'.tmp-d-index-cache-e08fbb1a239c4e48a05f97e7c2614616');
const source=path.join(owner,'source');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p);
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const ownFile=fileURLToPath(import.meta.url),ownHash=hash(read(ownFile));
const startedAt=new Date().toISOString();
const manifestBytes=read(sourcePath),manifestHash=hash(manifestBytes),manifest=json(sourcePath);
assert.equal(manifest.kind,'d2_metrics_controller_private_candidate_snapshot.v1');
assert.equal(manifest.source_root,source);
assert.equal(manifest.files.length,1718);
const expected=manifest.files.map(p=>p.path);
assert.equal(new Set(expected).size,expected.length);
assert.deepEqual(expected,[...expected].sort());
for(const p of expected)assert.match(p,/^(backend|contracts|scripts)\//);
assert.equal(hash(Buffer.from(manifest.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n')),manifest.source_sha256);

// Independent read-only namespace observation after the runner's seventh Go
// stage. It never holds files open, delays cleanup, modifies the peer owner,
// changes the frozen checker, or starts Go. Deletion races are non-passing.
function scan(){
  const found=[];
  function visit(directory){
    assert.equal(fs.realpathSync(directory),directory);
    assert.equal(fs.lstatSync(directory).isSymbolicLink(),false);
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const absolute=path.join(directory,entry.name),stat=fs.lstatSync(absolute);
      assert.equal(stat.isSymbolicLink(),false,'Redirected source entry '+absolute);
      if(stat.isDirectory())visit(absolute);
      else if(stat.isFile())found.push(path.relative(source,absolute).replaceAll('\\','/'));
      else assert.fail('Non-regular source entry '+absolute);
    }
  }
  for(const directory of ['backend','contracts','scripts'])visit(path.join(source,directory));
  found.sort();assert.deepEqual(found,expected,'Post-native namespace differs from frozen manifest');
  return {files:found.length,paths_sha256:hash(Buffer.from(found.join('\n')+'\n')),
    all_regular_files_in_three_roots_enumerated:true,extra_missing_or_redirected_entries:0};
}

let report={kind:'a2_metrics_independent_post_native_namespace_observation.v1',status:'not_observed',
  started_at:startedAt,observer:{path:path.relative(root,ownFile).replaceAll('\\','/'),sha256:ownHash},
  source_manifest:{path:path.relative(root,sourcePath).replaceAll('\\','/'),size:manifestBytes.length,sha256:manifestHash},
  source_sha256:manifest.source_sha256,owner,Go_executed_by_A2:false,peer_files_modified:false,peer_cleanup_delayed:false,
  content_hash_postcheck_independently_repeated_here:false,whole_native_receipt_accepted:false,
  whole_baseline_accepted:false,SQL_executed:false,PromQL_executed:false,dependencies_installed:false};
try{
  report.namespace_before_wait=scan();
  console.log(JSON.stringify({status:'watching_exact_native_inventory_completion',source_sha256:manifest.source_sha256,files:1718,observer_sha256:ownHash}));
  const deadline=Date.now()+30*60*1000;
  while(true){
    if(fs.existsSync(inventoryPath)){
      let inventoryBytes,inventory;
      try{inventoryBytes=read(inventoryPath);inventory=JSON.parse(inventoryBytes.toString('utf8'));}
      catch(error){if(!fs.existsSync(source))throw error;await new Promise(r=>setTimeout(r,25));continue;}
      assert.equal(inventory.kind,'d2_metrics_controller_candidate_native_inventory.v1');
      assert.equal(inventory.steps,7);assert.equal(inventory.source_sha256,manifest.source_sha256);
      assert.equal(inventory.binaries.length,2);
      assert.equal(fs.existsSync(source),true,'Source removed before post-native namespace observation');
      const observationStarted=new Date().toISOString();
      const namespace=scan();
      assert.equal(hash(read(sourcePath)),manifestHash);
      assert.equal(hash(read(ownFile)),ownHash);
      for(const p of manifest.controls){const b=read(path.join(root,p.path));assert.equal(b.length,p.size);assert.equal(hash(b),p.sha256);}
      report={...report,status:'passed_post_native_namespace_observation_only',
        inventory:{path:path.relative(root,inventoryPath).replaceAll('\\','/'),size:inventoryBytes.length,sha256:hash(inventoryBytes),
          steps_reported:7,roots_reported:inventory.roots,pass_events_reported:inventory.pass_events},
        observation_started_at:observationStarted,observation_finished_at:new Date().toISOString(),namespace_after_native:namespace,
        all_seven_native_stages_reported_complete_before_observation:true,
        runner_final_content_postcheck_and_terminal_cleanup_must_be_received_separately:true};
      break;
    }
    if(fs.existsSync(terminalPath)||!fs.existsSync(source))throw Error('Native window ended without an observable post-native source namespace');
    if(Date.now()>deadline)throw Error('Namespace observer deadline reached without restarting native work');
    await new Promise(r=>setTimeout(r,25));
  }
}catch(error){report={...report,status:'post_native_namespace_not_proven',error:String(error),finished_at:new Date().toISOString()};process.exitCode=1;}
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,status:report.status,error:report.error??null}));
