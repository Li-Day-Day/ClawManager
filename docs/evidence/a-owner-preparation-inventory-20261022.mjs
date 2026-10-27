// A derived test inventory is metadata, not a native Go JSON transcript and
// never actual SQL evidence. Only a separately pinned review may register it.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {localStages,canonicalLocalName,decode,sha256,workspace} from './a-download-owners-actual-review-20261020.mjs';
export {ownerInventoryEvents} from './a-download-owners-actual-review-20261020.mjs';

const packageNames=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'];
const seedNames=['TestASQLTaskDownloadOwnersMySQLSeed','TestADownloadAdmissionMySQLSeed',
 ...['detached_embedded_config','historical_config_projection','independent_encrypted_object'].map(n=>'TestADownloadAdmissionMySQLSeed/'+n),
 'TestASensitiveDownloadMFAMySQLSeed',...['actual_config_required_cells','duplicate','unknown','trailing','catalog','ddl','budget'].map(n=>'TestASensitiveDownloadMFAMySQLSeed/'+n)].sort();
const equalNames=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const runNames=text=>[...text.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m=>m[1]);
const passNames=text=>[...text.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]);
const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function deriveOwnerPreparationInventory({logBytes,sourceBytes,priorNativeEventsBytes,exists=fs.existsSync,root=workspace}){
 const log=decode(logBytes),source=JSON.parse(decode(sourceBytes));
 assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.production_approved,false);
 assert.ok(Array.isArray(source.files)&&source.files.length>0);assert.equal(new Set(source.files.map(f=>f.path)).size,source.files.length);
 for(const f of source.files)assert.ok(typeof f.path==='string'&&/^(backend|contracts|scripts|docs)\//.test(f.path)&&!f.path.includes('\\')&&!f.path.split('/').some(p=>['.','..',''].includes(p))&&isHash(f.sha256)&&Number.isSafeInteger(f.size)&&f.size>=0);
 assert.equal(sha256(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),source.source_sha256);
 assert.doesNotMatch(log,/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^fatal error:|^RUN namespace=|^CLEANUP_PENDING|^Exception:|^.*_exit=[1-9][0-9]*\s*$/m);
 assert.ok(log.includes('LOCAL_SOURCE config-writer-frozen=yes source_sha256='+source.source_sha256+' files='+source.files.length));
 assert.ok(log.includes('PASS download-owners-dispatch:'));
 assert.ok(log.includes('LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=False'));
 assert.ok(log.includes('CLEANED local-registration-build-cache=True'));
 const ownerMatches=[...log.matchAll(/^LOCAL_OWNER config-writer-source=(.+)$/gm)];assert.equal(ownerMatches.length,1);
 const owner=ownerMatches[0][1];assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
 assert.ok(log.includes('LOCAL_CLEANUP config-writer-source-owned='+owner+' removed=True'));assert.equal(exists(owner),false);
 const stages=localStages(log);assert.deepEqual(stages.map(s=>s.package),[...packageNames,packageNames[1]]);
 assert.ok(equalNames(stages[2].names,seedNames));
 const detachedAt=log.indexOf('LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent',stages[2].end);assert.ok(detachedAt>stages[2].end);
 const detached=log.slice(stages[2].end,detachedAt);assert.ok(equalNames(runNames(detached),seedNames)&&equalNames(passNames(detached),seedNames));
 assert.match(detached,/\nPASS\s*$/);
 assert.match(log,/LOCAL_PASS a-download-owners-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=[a-f0-9]{64} ddl_sha256=[a-f0-9]{64}/);
 assert.match(log,/LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=[a-f0-9]{64}/);
 const prior=decode(priorNativeEventsBytes).trim().split('\n').map(JSON.parse);
 assert.equal(prior.some(e=>['fail','build-fail','skip'].includes(e.Action)),false);
 const packages=stages.slice(0,2).map(stage=>{
  const tests=stage.names.map(canonicalLocalName);assert.equal(new Set(tests).size,tests.length);
  const oldPass=prior.filter(e=>e.Package===stage.package&&e.Test&&e.Action==='pass').map(e=>e.Test);
  const oldRun=prior.filter(e=>e.Package===stage.package&&e.Test&&e.Action==='run').map(e=>e.Test);
  assert.ok(oldPass.length>0&&equalNames(oldPass,oldRun));
  assert.equal(prior.filter(e=>e.Package===stage.package&&!e.Test&&e.Action==='pass').length,1);
  for(const name of oldPass)assert.ok(tests.includes(name),'previous test omitted: '+name);
  return {package:stage.package,tests:[...tests].sort(),roots:tests.filter(n=>!n.includes('/')).length,pass_events:tests.length,previous_tests_preserved:oldPass.length};
 });
 return {kind:'a_owner_preparation_derived_inventory.v1',origin:'derived_from_verified_verbose_local_transcript_not_native_Go_JSON',source_sha256:source.source_sha256,source_manifest_sha256:sha256(sourceBytes),local_log_sha256:sha256(logBytes),prior_native_events_sha256:sha256(priorNativeEventsBytes),packages,scopes:{full_two_ordinary_packages:true,original_default_vet:true,all_previous_tests_preserved:true,packaged_and_detached_seed_checks:13,actual_MySQL:false,production_approved:false}};
}

