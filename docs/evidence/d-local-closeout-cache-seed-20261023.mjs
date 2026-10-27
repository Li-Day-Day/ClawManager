import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Only copy immutable Go compilation cache entries. Do not mutate the peer
// owner, overwrite this run's entries, restart tests or reuse test results.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const owner=path.join(root,'.tmp-d-index-cache-becb8b4d45194f83bcd50d6423f8e8b4');
const peerOwner=path.join(root,'.tmp-d-index-cache-016b5ce97d4a42ea8d8cbe10c00f17df');
const source=path.join(peerOwner,'source/.tmp-a-evidence-334c8eaf35894609b8aaf8c0185479b6/cache');
const target=path.join(owner,'cache');
assert.equal(fs.realpathSync(owner),owner);
assert.equal(fs.realpathSync(source),source);
assert.equal(fs.realpathSync(target),target);
assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
const report={kind:'d_local_closeout_compilation_cache_seed.v1',source,target,peer_source_read_only:true,existing_entries_overwritten:false,test_result_reuse:false,tests_restarted:false,dependencies_installed:false,entries:[],skipped_existing:0,source_disappeared:0};
const candidates=[];
for(const dir of fs.readdirSync(source,{withFileTypes:true})) {
  if(!dir.isDirectory() || !/^[a-f0-9]{2}$/.test(dir.name))continue;
  assert.equal(fs.lstatSync(path.join(source,dir.name)).isSymbolicLink(),false);
  for(const item of fs.readdirSync(path.join(source,dir.name),{withFileTypes:true})) {
    if(item.isFile() && /^[a-f0-9]{64}-[ad]$/.test(item.name))candidates.push(`${dir.name}/${item.name}`);
  }
}
// Publish data before the action records referencing it, atomically and only
// if absent. A concurrent compiler's own result always wins.
candidates.sort((a,b)=>Number(a.endsWith('-a'))-Number(b.endsWith('-a')) || a.localeCompare(b));
for(const name of candidates) {
  const to=path.join(target,name);
  if(fs.existsSync(to)){report.skipped_existing++;continue;}
  let data;
  try{data=fs.readFileSync(path.join(source,name));}catch(e){if(e.code==='ENOENT'){report.source_disappeared++;continue;}throw e;}
  fs.mkdirSync(path.dirname(to),{recursive:true});
  const temporary=path.join(target,`.seed-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(temporary,data,{flag:'wx'});
    try {
      fs.linkSync(temporary,to);
      report.entries.push({name,size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
    }catch(e){if(e.code!=='EEXIST')throw e;report.skipped_existing++;}
  } finally {fs.unlinkSync(temporary);}
}
fs.writeFileSync(path.join(root,'docs/evidence/d-local-closeout-cache-seed-20261023.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(`LOCAL_CACHE_SEED copied=${report.entries.length} kept=${report.skipped_existing} remote=no install=no overwrite=no tests_restarted=no`);
