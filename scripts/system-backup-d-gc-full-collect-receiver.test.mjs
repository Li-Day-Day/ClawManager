import test from 'node:test';
import assert from 'node:assert/strict';
import {coldCases,sha,receiveColdCollect,decode} from './system-backup-d-gc-full-collect-receiver.mjs';

// Synthetic parser fixtures prove refusal behavior only; these are never
// emitted as actual database evidence or written to docs/evidence.
function fixture() {
  const files=[{path:'backend/test.go',size:1,sha256:'a'.repeat(64)}];
  const source={files,source_sha256:sha(files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'),stable_copy_verified:true,dependencies_installed:false,production_approved:false};
  const preparation={kind:'d_gc_capacity_full_review_request.v1',remote_input_pins:structuredClone(files),capsule_sha256:'c'.repeat(64)};
  const binary='b'.repeat(64),root='TestDDownloadGCFullCollectMySQL';
  const lines=[`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=1`,`LOCAL_PASS d-download-gc-full-collect-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${binary} ddl_sha256=${preparation.capsule_sha256}`,`=== RUN   ${root}`];
  for(const name of coldCases)lines.push(`=== RUN   ${root}/${name}`,'    probe.go:1: CANDIDATE_GC_CHECKS uid_owned_clone=yes embedded_migration=no production_approval=no');
  lines.push('    probe.go:2: PASS full_collect_candidate cases=7 actual_sql=yes public_collect=yes domain=synthetic_uid_scoped_published_tasks physical_report=synthetic candidate_gc_check=yes provider_read=no production_approval=no',`--- PASS: ${root} (1.00s)`);
  for(const name of coldCases)lines.push(`    --- PASS: ${root}/${name} (0.10s)`);
  lines.push('PASS',`PASS d-download-gc-full-collect-mysql binary_sha256=${binary} inputs_sha256=${preparation.capsule_sha256} new_cases=7 component=public-full-collect-cold-group freeze_adapter=fixed_owner scope=synthetic-known-task-authority actual_mysql=yes public_collect=yes full_group=yes full_gc=candidate_only physical_capacity=no candidate_gc_checks=yes role_approval=no human_mfa=no provider_read=no production_approval=no namespace=sbk-mig-261026000000-abcd uid=11111111-2222-4333-8444-555555555555`,'PASS fresh-migration-replay=001..081 applied=96 exact_filenames=yes','CLEANED namespace=sbk-mig-261026000000-abcd uid=11111111-2222-4333-8444-555555555555','CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True',`LOCAL_CLEANUP config-writer-source-owned=C:/test/.tmp-d-index-cache-${'d'.repeat(32)} removed=True`,'gc_full_collect_exit=0');
  return {text:lines.join('\n'),source,preparation,ownerAbsent:()=>true};
}

test('candidate receipt preserves synthetic authority and incomplete production scope',()=>{
  const r=receiveColdCollect(fixture());
  assert.equal(r.native_cases.length,7);assert.equal(r.production_approved,false);assert.equal(r.twelve_groups_complete,false);assert.equal(r.physical_report,'synthetic');
});

for(const [name,edit] of [
  ['zero native tests',f=>f.text=f.text.replace(/^=== RUN.*\n/gm,'')],
  ['missing leaf',f=>f.text=f.text.replace(/^\s+--- PASS: .*\/commit \(0.10s\)\n/m,'')],
  ['duplicate root',f=>f.text+='\n--- PASS: TestDDownloadGCFullCollectMySQL (1.00s)'],
  ['trailing duplicate leaf',f=>f.text+='\n    --- PASS: TestDDownloadGCFullCollectMySQL/commit (0.10s)'],
  ['duplicate leaf',f=>f.text=f.text.replace('PASS\nPASS d-download', '    --- PASS: TestDDownloadGCFullCollectMySQL/commit (0.10s)\nPASS\nPASS d-download')],
  ['skip',f=>f.text=f.text.replace('--- PASS: TestDDownloadGCFullCollectMySQL/commit','--- SKIP: TestDDownloadGCFullCollectMySQL/commit')],
  ['wrong binary',f=>f.text=f.text.replace('mysql binary_sha256='+ 'b'.repeat(64),'mysql binary_sha256='+ 'e'.repeat(64))],
  ['source drift',f=>f.source.files[0].sha256='f'.repeat(64)],
  ['re-pinned unreviewed source',f=>{f.source.files[0].sha256='f'.repeat(64);f.source.source_sha256=sha(f.source.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n');}],
  ['owner remains',f=>f.ownerAbsent=()=>false],
  ['pending cleanup',f=>f.text+='\nCLEANUP_PENDING namespace=test'],
  ['different UID cleanup',f=>f.text=f.text.replace('CLEANED namespace=sbk-mig-261026000000-abcd uid=11111111','CLEANED namespace=sbk-mig-261026000000-abcd uid=99999999')],
  ['no postcheck',f=>f.text=f.text.replace('LOCAL_PASS config-writer-frozen-postcheck=yes','absent')],
  ['outer failure',f=>f.text=f.text.replace('gc_full_collect_exit=0','gc_full_collect_exit=1')],
  ['scope escalation',f=>f.text=f.text.replace('full_gc=candidate_only','full_gc=passed')]
])test('rejects '+name,()=>{const f=fixture();edit(f);assert.throws(()=>receiveColdCollect(f));});

test('decodes Windows UTF16 transcript',()=>assert.equal(decode(Buffer.concat([Buffer.from([255,254]),Buffer.from('sample','utf16le')])),'sample'));
