// Validate the review candidate without changing the operator's live checker.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(raw(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const candidatePath='docs/evidence/a-verifier-dialect-candidate-20261022.json';
const testArchivePath='docs/evidence/a-verifier-dialect-candidate-tests-20261022.json';
const candidate=json(candidatePath),tests=json(testArchivePath);
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--published'));
const published=process.argv[2]==='--published';
const owner=fs.mkdtempSync(path.join(root,'.tmp-a-verifier-dialect-'));
const source=path.join(owner,'source'),temp=path.join(owner,'tmp');
const prefix='docs/evidence/a-verifier-dialect-20261022-'+randomBytes(4).toString('hex');
const output=prefix+'-result.json';
const pin=(p,b=raw(p))=>({path:p,size:b.length,sha256:sha(b)});
const report={kind:'a_verifier_dialect_isolated_validation.v1',status:'failed',candidate:pin(candidatePath),candidate_tests:pin(testArchivePath),owner,
  live_checker_expected_sha256:published?candidate.candidate_sha256:candidate.before_sha256,published,stages:[],source_inputs:[],source_postcheck:false,
  dependencies_installed:false,remote_run:false,go_test_or_build_run:false,production_approved:false};
function run(stage,args,expected=0) {
  const result=spawnSync(process.execPath,args,{cwd:source,env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp},encoding:'utf8',timeout:120000});
  const stdout=prefix+'-'+stage+'.stdout',stderr=prefix+'-'+stage+'.stderr';
  fs.writeFileSync(path.join(root,stdout),result.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(root,stderr),result.stderr??'',{flag:'wx'});
  report.stages.push({stage,args,exit:result.status,stdout:pin(stdout),stderr:pin(stderr)});
  if(result.error)throw result.error;
  assert.equal(result.status,expected,stage+' '+result.stderr);
  return result;
}
try {
  fs.mkdirSync(source);fs.mkdirSync(temp);
  assert.equal(sha(raw(candidate.path)),report.live_checker_expected_sha256,'Live checker does not match the selected validation mode');
  const bytes=Buffer.from(candidate.candidate_bytes_base64,'base64'),testBytes=Buffer.from(tests.bytes_base64,'base64');
  assert.equal(sha(bytes),candidate.candidate_sha256);assert.equal(sha(testBytes),tests.sha256);
  assert.equal(fs.existsSync(path.join(root,tests.path)),published,'Unexpected candidate test publication state');
  if(published)assert.equal(sha(raw(tests.path)),tests.sha256);
  const oldScope=json('docs/evidence/d-verifier-registry-counts-20261022-r3-83ec9750-scope.json');
  const names=new Set(oldScope.files.map(p=>p.path));
  const groups=[['scripts','.mjs'],['contracts/system-backup/v12','.json'],['backend/internal/db/migrations','.sql']].map(([dir,ext])=>{
    const files=fs.readdirSync(path.join(root,dir)).filter(p=>path.extname(p)===ext).sort();
    for(const file of files)names.add(dir+'/'+file);return {path:dir,extension:ext,files};
  });
  for(const p of [...names].sort()) {
    assert.ok(!path.isAbsolute(p)&&!p.split('/').some(part=>['','..','.'].includes(part)));
    const b=raw(p),target=path.join(source,p);report.source_inputs.push(pin(p,b));
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,b,{flag:'wx'});
  }
  const beforePins=report.source_inputs;
  for(const p of beforePins)assert.deepEqual(pin(p.path),p,'Source changed during freeze');
  fs.writeFileSync(path.join(source,candidate.path),bytes);
  fs.writeFileSync(path.join(source,tests.path),testBytes);
  const frozen=beforePins.map(p=>p.path===candidate.path?pin(p.path,bytes):p);
  if(!frozen.some(p=>p.path===tests.path))frozen.push(pin(tests.path,testBytes));
  report.frozen_inputs=frozen;
  const r=run('full-contract-tests',['--test','--test-isolation=none',
    'scripts/system-backup-contract-artifacts.test.mjs','scripts/system-backup-d-control-exclusion.test.mjs',
    'scripts/system-backup-contract-check.test.mjs','scripts/system-backup-verifier-registry.test.mjs',tests.path]);
  const stats=Object.fromEntries([...r.stdout.matchAll(/^[#ℹ]\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$/gm)].map(m=>[m[1],Number(m[2])]));
  assert.deepEqual(stats,{tests:120,pass:120,fail:0,cancelled:0,skipped:0,todo:0});report.tests=stats;
  const normal=JSON.parse(run('normal-cli',['scripts/system-backup-contract-check.mjs','--check']).stdout);
  const strict=JSON.parse(run('strict-cli',['scripts/system-backup-contract-check.mjs','--check','--strict'],1).stdout);
  assert.deepEqual(normal,strict);assert.equal(normal.contract_status,'draft');
  assert.deepEqual(normal.verifier_check_registries.map(p=>[p.owner,p.registry,p.required_check_count]),[
    ['A','users_backup_validate',8],['A','ai_gateway_backup_validate',12],['A','users_restore_validate',11],['A','ai_gateway_restore_validate',14],
    ['D','resources_backup_validate',12],['D','control_plane_restore_validate',35]]);
  assert.ok(normal.blockers.policy_pending.length>0&&normal.blockers.cross_review_pending.length>0&&normal.blockers.schema_hash_pending);
  assert.deepEqual([...normal.blockers.missing_artifacts].sort(),['catalog_scan_record','recovery_catalog_records','restore_target','status_relay']);
  report.cli={counts:normal.verifier_check_registries,blockers:normal.blockers};
  const schemaPath=path.join(source,'contracts/system-backup/v12/verifier-contract.schema.json'),schemaBytes=fs.readFileSync(schemaPath);
  const registryPath=path.join(source,'contracts/system-backup/v12/schema-registry.json'),registryBytes=fs.readFileSync(registryPath);
  for(const [name,change] of [
    ['outer-not',d=>d.not={}],['common-ref-not',d=>d.allOf[0].not={}],['branch-extra-property',d=>d.allOf[1].properties.status={not:{}}],
  ])for(const mode of ['--check','--write']) {
    const schema=JSON.parse(schemaBytes);change(schema.$defs.ControlExclusionCheck);fs.writeFileSync(schemaPath,JSON.stringify(schema));
    try {
      const result=run(name+'-'+mode.slice(2),['scripts/system-backup-contract-check.mjs',mode],1);
      assert.equal(result.stdout,'');assert.match(result.stderr,/verifier registry D\.control_plane_restore_validate requires/);
      assert.deepEqual(fs.readFileSync(registryPath),registryBytes,'Rejected declaration wrote registry');
    } finally {fs.writeFileSync(schemaPath,schemaBytes);}
  }
  for(const p of frozen)assert.deepEqual(pin(p.path,fs.readFileSync(path.join(source,p.path))),p,'Frozen candidate changed');
  for(const p of beforePins)assert.deepEqual(pin(p.path),p,'Live input changed');
  for(const g of groups)assert.deepEqual(fs.readdirSync(path.join(root,g.path)).filter(p=>path.extname(p)===g.extension).sort(),g.files,'Live file set changed');
  report.source_postcheck=true;report.status=published?'published_checker_validated_current_inputs':'isolated_candidate_validated_live_checker_preserved';
} catch(error) {
  report.failure=error.message;process.exitCode=1;
} finally {
  const resolved=path.resolve(owner);
  assert.equal(path.dirname(resolved),root);assert.match(path.basename(resolved),/^\.tmp-a-verifier-dialect-[A-Za-z0-9]{6}$/);
  assert.equal(fs.lstatSync(resolved).isSymbolicLink(),false);
  fs.rmSync(resolved,{recursive:true,force:true});report.cleanup_verified=!fs.existsSync(resolved);
  assert.equal(report.cleanup_verified,true);
  fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({receipt:output,status:report.status,cleanup:report.cleanup_verified,failure:report.failure}));
}
