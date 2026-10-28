import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {overlayLifecycleRunner} from './d-gc-full-lifecycle-source-20261026.mjs';
import {lifecycleCases} from './d-gc-full-lifecycle-receiver-20261026.mjs';
const repo=path.resolve(import.meta.dirname,'../..');
const original=fs.readFileSync(path.join(repo,'scripts/system-backup-a-evidence-validation.ps1'),'utf8');
test('copied selector uses lifecycle names and all three seeds, retains offline/default vet',()=>{
  const changed=overlayLifecycleRunner(original);
  for(const token of ["'d-download-gc-full-lifecycle.test'","'d-download-gc-full-lifecycle'","'scripts/system-backup-d-download-gc-full-lifecycle-phase.sh'","'^Test(DDownloadGCFullLifecycleMySQLSeed|DDownloadGCFullCollectMySQLSeed|DDownloadGCFullProfileMySQLSeed)$'","$env:GOPROXY='off'","$env:GOSUMDB='off'","$env:GOTOOLCHAIN='local'","-mod=readonly","LIFECYCLE_SCOPE ordinary_full_not_repeated=yes tagged_seeds_default_vet_and_linux_only=yes","Invoke-AEvidenceGoStep -Arguments @('test','-tags','systembackup_mysql','-run',$configProofSeedPattern,'-count=1','-v',$evidenceProbePackage) -Stage 'test-vet'","Remove-Item -LiteralPath $resolved -Recurse -Force","Refusing cleanup outside owned scratch"]){assert.ok(changed.includes(token),token);}
  assert.ok(!changed.includes('-vet=off'));assert.equal(fs.readFileSync(path.join(repo,'scripts/system-backup-a-evidence-validation.ps1'),'utf8'),original);
});
for(const token of ["'d-download-gc-full-collect.test'","'d-download-gc-full-collect'","'scripts/system-backup-d-download-gc-full-collect-phase.sh'","'^Test(DDownloadGCFullCollectMySQLSeed|DDownloadGCFullProfileMySQLSeed)$'"]){
  test('reject missing selector '+token,()=>assert.throws(()=>overlayLifecycleRunner(original.replace(token,"'unknown'"))));
  test('reject duplicate selector '+token,()=>assert.throws(()=>overlayLifecycleRunner(original+'\n# '+token)));
}
test('requirements, Go catalog and receiver agree exactly',()=>{
  const requirements=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'d-gc-full-lifecycle-requirements-20261026.json'),'utf8'));
  assert.deepEqual(requirements.cases,lifecycleCases);assert.equal(requirements.requirements.length,12);assert.equal(requirements.actual_mysql_executed,false);
  const go=fs.readFileSync(path.join(repo,'backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go'),'utf8');
  const literal=go.slice(go.indexOf('var dGCFullLifecycleCases = []string{'),go.indexOf('\n}',go.indexOf('var dGCFullLifecycleCases = []string{')));
  assert.deepEqual([...literal.matchAll(/"([a-z0-9_]+)"/g)].map(m=>m[1]),lifecycleCases);
});
test('phase verifies binary, capsule, UID, exact root, native leaves and trap',()=>{
  const s=fs.readFileSync(path.join(import.meta.dirname,'d-gc-full-lifecycle-phase-20261026.sh'),'utf8');
  for(const token of ['D_PROVIDER_REGISTRATION_DDL_SHA256','RUN_NAMESPACE_UID','-test.list "^TestDDownloadGCFullLifecycleMySQL$"','-test.run "^TestDDownloadGCFullLifecycleMySQL$"','-test.count=1','-eq 15','trap ','old42_full33_cold7_not_recounted=yes','production_approval=no'])assert.ok(s.includes(token),token);
});
