import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const coldCases=['commit','late_policy_denied','last_delete_reply_lost','commit_reply_lost','rollback_reply_lost','unlock_reply_lost','cancel_after_work'];
export const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const decode=bytes=>(bytes[0]===255&&bytes[1]===254?bytes.toString('utf16le'):bytes.toString('utf8')).replace(/^\uFEFF/,'');
const digest=files=>sha(files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n');
const one=(text,re,label)=>{const matches=[...text.matchAll(re)];assert.equal(matches.length,1,label);return matches[0];};

// Validate immutable inputs and native output. This never connects to the
// server or converts synthetic fixture authority into production approval.
export function receiveColdCollect({text,source,preparation,ownerAbsent}) {
  assert.equal(preparation.kind,'d_gc_capacity_full_review_request.v1');
  assert.equal(source.stable_copy_verified,true);
  assert.equal(source.dependencies_installed,false);
  assert.equal(source.production_approved,false);
  assert.equal(new Set(source.files.map(p=>p.path)).size,source.files.length);
  assert.equal(digest(source.files),source.source_sha256);
  assert.ok(preparation.remote_input_pins.length>0);
  const pins=new Map(source.files.map(p=>[p.path,p]));
  for(const p of preparation.remote_input_pins) assert.deepEqual(pins.get(p.path),p,'unreviewed remote input '+p.path);
  assert.deepEqual(source.files.filter(p=>p.path.startsWith('backend/')).map(p=>p.path),preparation.remote_input_pins.filter(p=>p.path.startsWith('backend/')).map(p=>p.path),'new ordinary backend input');
  const sourceLine=one(text,/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)\r?$/gm,'exact source marker');
  assert.equal(sourceLine[1],source.source_sha256);assert.equal(Number(sourceLine[2]),source.files.length);
  const root='TestDDownloadGCFullCollectMySQL';
  const start=one(text,new RegExp('^=== RUN\\s+'+root+'\\r?$','gm'),'native root');
  one(text,new RegExp('^--- PASS: '+root+' \\(([0-9.]+)s\\)\\r?$','gm'),'unambiguous transcript root pass');
  const phase=one(text,/^PASS d-download-gc-full-collect-mysql binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) new_cases=7 component=public-full-collect-cold-group freeze_adapter=fixed_owner scope=synthetic-known-task-authority actual_mysql=yes public_collect=yes full_group=yes full_gc=candidate_only physical_capacity=no candidate_gc_checks=yes role_approval=no human_mfa=no provider_read=no production_approval=no namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})\r?$/gm,'scope marker');
  const local=one(text,/^LOCAL_PASS d-download-gc-full-collect-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})\r?$/gm,'local compiled binary');
  assert.equal(local[1],phase[1]);assert.equal(local[2],phase[2]);assert.equal(phase[2],preparation.capsule_sha256);
  assert.ok(phase.index>start.index);
  const native=text.slice(start.index,phase.index);
  const ran=[...native.matchAll(new RegExp('^=== RUN\\s+'+root+'/(\\S+)\\r?$','gm'))].map(p=>p[1]);
  const passed=[...native.matchAll(new RegExp('^\\s+--- PASS: '+root+'/(\\S+) \\([0-9.]+s\\)\\r?$','gm'))].map(p=>p[1]);
  assert.deepEqual(ran,coldCases);assert.deepEqual(passed,coldCases);
  assert.deepEqual([...text.matchAll(new RegExp('^=== RUN\\s+'+root+'/(\\S+)\\r?$','gm'))].map(p=>p[1]),coldCases,'out-of-boundary native run');
  assert.deepEqual([...text.matchAll(new RegExp('^\\s+--- PASS: '+root+'/(\\S+) \\([0-9.]+s\\)\\r?$','gm'))].map(p=>p[1]),coldCases,'out-of-boundary native pass');
  one(native,new RegExp('^--- PASS: '+root+' \\(([0-9.]+)s\\)\\r?$','gm'),'native root pass');
  one(native,/^PASS\r?$/gm,'native binary pass');
  assert.doesNotMatch(native,/^\s*--- (?:FAIL|SKIP):|^FAIL\r?$|panic:|fatal error:/m);
  one(native,/PASS full_collect_candidate cases=7 actual_sql=yes public_collect=yes domain=synthetic_uid_scoped_published_tasks physical_report=synthetic candidate_gc_check=yes provider_read=no production_approval=no/g,'native explicit candidate boundary');
  assert.equal((native.match(/CANDIDATE_GC_CHECKS uid_owned_clone=yes embedded_migration=no production_approval=no/g)||[]).length,7);
  assert.doesNotMatch(text,/^CLEANUP_PENDING|^CLEANUP_SKIPPED/m);
  const cleanup=one(text,/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})\r?$/gm,'exact namespace cleanup');
  assert.equal(cleanup[1],phase[3]);assert.equal(cleanup[2],phase[4]);
  for(const marker of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True']) assert.ok(text.includes(marker),marker);
  const owner=one(text,/^LOCAL_CLEANUP config-writer-source-owned=(.+[\\/]\.tmp-d-index-cache-[a-f0-9]{32}) removed=True\r?$/gm,'source cleanup')[1];
  assert.equal(ownerAbsent(owner),true,'exact source owner remains');
  assert.match(text,/^PASS fresh-migration-replay=001\.\.\d+ applied=\d+ exact_filenames=yes/m);
  assert.match(text,/^gc_full_collect_exit=0\r?$/m);
  return {kind:'d_gc_full_collect_actual_candidate_receipt.v1',status:'native_7_candidate_cases_received_not_production',source_sha256:source.source_sha256,binary_sha256:phase[1],capsule_sha256:phase[2],native_cases:coldCases,failed:0,skipped:0,namespace:cleanup[1],namespace_uid:cleanup[2],local_owner:owner,local_owner_absent:true,remote_cleanup_reported:true,remote_cleanup_independently_verified:false,actual_SQL:true,public_collect:true,domain_authority:'synthetic_uid_scoped_published_tasks',physical_report:'synthetic',candidate_gc_checks:true,production_approved:false,twelve_groups_complete:false,whole_tree_ready:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),options={};
  for(let n=0;n<args.length;n+=2){assert.ok(['--log','--source','--preparation','--write'].includes(args[n]));assert.ok(args[n+1]);assert.equal(options[args[n]],undefined);options[args[n]]=args[n+1];}
  for(const key of ['--log','--source','--preparation'])assert.ok(options[key],key);
  const root=path.resolve(import.meta.dirname,'..'),evidence=path.join(root,'docs','evidence');
  const file=arg=>{const p=path.resolve(arg);assert.equal(path.dirname(p),evidence,'receipt input/output must be directly in docs/evidence');return p;};
  const log=file(options['--log']),source=file(options['--source']),prep=file(options['--preparation']);
  const result=receiveColdCollect({text:decode(fs.readFileSync(log)),source:JSON.parse(decode(fs.readFileSync(source))),preparation:JSON.parse(decode(fs.readFileSync(prep))),ownerAbsent:owner=>{
    const p=path.resolve(owner);assert.equal(path.dirname(p),root);assert.match(path.basename(p),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);return !fs.existsSync(p);
  }});
  Object.assign(result,{log,log_sha256:sha(fs.readFileSync(log)),source_manifest:source,source_manifest_sha256:sha(fs.readFileSync(source)),preparation:prep,preparation_sha256:sha(fs.readFileSync(prep))});
  if(options['--write'])fs.writeFileSync(file(options['--write']),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify(result)+'\n');
}
