import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const sourceOwner=path.join(root,'.tmp-d-index-cache-d9cec1f9ff704989b41ea30e453af991');
const source=path.join(sourceOwner,'source/.tmp-a-evidence-56ba2bd63868421aaebd3322607c533a/cache');
const manifest='docs/evidence/a-download-owners-mysql-remote-source-20261027-160458-2bce7205.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const plain=p=>{assert.equal(fs.realpathSync(p),p);assert.equal(fs.lstatSync(p).isSymbolicLink(),false)};
for(const p of [sourceOwner,path.join(sourceOwner,'source'),path.dirname(source),source])plain(p);
assert.equal(fs.readFileSync(path.join(sourceOwner,'owner.txt'),'utf8').trim(),path.basename(sourceOwner));
const manifestBytes=fs.readFileSync(path.join(root,manifest));assert.equal(hash(manifestBytes),'873b457f58e0b2e357c4c1fed62f518531d88277eb6ad63d8ef3be8df30c4909');
const id=crypto.randomUUID().replaceAll('-',''),owner=path.join(root,'.tmp-d-index-cache-'+id),target=path.join(owner,'cache');
assert.equal(path.dirname(owner),root);fs.mkdirSync(owner);fs.mkdirSync(target);fs.writeFileSync(path.join(owner,'owner.txt'),path.basename(owner),{flag:'wx'});
const report={kind:'d2_joint_content_cache_seed.v1',sourceOwner,source,target,owner,source_manifest:{path:manifest,size:manifestBytes.length,sha256:hash(manifestBytes)},source_read_only:true,pairs:[],skipped:0,space_limited:false,error:null,Go_started:false,tests_started:false,test_result_reuse:false,cache_usage:'Content-verified Go build cache prewarming only; all future tests must use -count=1 and produce actual RUN/PASS events. Cache entry content does not by itself prove a test.',dependencies_installed:false,owner_removed:false};
const floor=8n*1024n*1024n*1024n;const free=()=>{const s=fs.statfsSync(root,{bigint:true});return s.bavail*s.bsize};
try{
 const actions=[];
 for(const d of fs.readdirSync(source,{withFileTypes:true})){if(!d.isDirectory()||!/^[a-f0-9]{2}$/.test(d.name))continue;plain(path.join(source,d.name));for(const f of fs.readdirSync(path.join(source,d.name),{withFileTypes:true}))if(f.isFile()&&/^[a-f0-9]{64}-a$/.test(f.name))actions.push(d.name+'/'+f.name)}
 for(const name of actions.sort()){
  let action,data,match;
  try{plain(path.join(source,name));action=fs.readFileSync(path.join(source,name));match=action.toString('ascii').match(/^v1 ([a-f0-9]{64}) ([a-f0-9]{64})[ ]+([0-9]+)[ ]+([0-9]+)\n$/);if(!match||!name.endsWith(match[1]+'-a')){report.skipped++;continue}
   const dataName=match[2].slice(0,2)+'/'+match[2]+'-d';plain(path.join(source,dataName));assert.ok(fs.statSync(path.join(source,dataName)).isFile());data=fs.readFileSync(path.join(source,dataName));if(data.length!==Number(match[3])||hash(data)!==match[2]||!fs.readFileSync(path.join(source,name)).equals(action)){report.skipped++;continue}
   const toData=path.join(target,dataName),toAction=path.join(target,name);let charge=BigInt(action.length);if(!fs.existsSync(toData))charge+=BigInt(data.length);if(free()-charge<floor){report.space_limited=true;break}
   fs.mkdirSync(path.dirname(toData),{recursive:true});if(!fs.existsSync(toData))fs.writeFileSync(toData,data,{flag:'wx'});assert.equal(hash(fs.readFileSync(toData)),match[2]);
   fs.mkdirSync(path.dirname(toAction),{recursive:true});fs.writeFileSync(toAction,action,{flag:'wx'});assert.equal(hash(fs.readFileSync(toAction)),hash(action));
   report.pairs.push({action:name,action_sha256:hash(action),data:dataName,data_sha256:match[2],size:data.length});
  }catch(e){if(['ENOENT','EACCES','EPERM','EBUSY','EEXIST'].includes(e.code)){report.skipped++;continue}throw e}
 }
}catch(e){report.error=e.message;process.exitCode=1}
const output='docs/evidence/d2-joint-cache-seed-'+id+'.json';fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(owner,'preparation.json'),JSON.stringify({kind:report.kind,owner,cache_only:true,tests_started:false,source_read_only:true,report:output,report_sha256:hash(fs.readFileSync(path.join(root,output)))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({owner,target,report:output,pairs:report.pairs.length,bytes:report.pairs.reduce((n,p)=>n+p.size,0),skipped:report.skipped,space_limited:report.space_limited,error:report.error,Go_started:false}));
