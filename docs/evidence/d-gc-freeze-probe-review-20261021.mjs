import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const owner=path.join(root,'.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e');
const relative='docs/evidence/d-gc-freeze-probe-20261021-r2';
const revised='docs/evidence/d-gc-freeze-probe-20261021-r3';
const raw=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const owned=[
 'backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go',
 'scripts/system-backup-a-evidence-validation.ps1',
 'scripts/system-backup-d-config-writer-validation.ps1',
 'scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1',
 'scripts/system-backup-d-download-gc-freeze-phase.sh',
];
const parent=json(relative+'-source.json'),source=json(revised+'-source.json'), base=json('docs/evidence/d-gc-freeze-probe-base-20261021.json');
const native=json(relative+'-native.json');
const revision=json(revised+'-native.json');
assert.equal(revision.exit,0);assert.equal(revision.source_postcheck,true);assert.equal(revision.source_sha256,source.source_sha256);
assert.equal(revision.parent_source_sha256,parent.source_sha256);assert.equal(source.parent_source_sha256,parent.source_sha256);
const revisedFile='backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go';
assert.deepEqual(source.changed_from_parent,[revisedFile]);assert.equal(source.files.length,parent.files.length);
for(const pin of parent.files.filter(p=>p.path!==revisedFile))assert.deepEqual(source.files.find(x=>x.path===pin.path),pin,'unexpected revision input');
assert.equal(revision.ordinary_test_input_exclusion_checked,true);
assert.doesNotMatch(raw(revised+'-ordinary-exclusion.stdout').toString('utf8'),/download_gc_freeze_mysql_test\.go/);
const phasePath='scripts/system-backup-d-download-gc-freeze-phase.sh';
const referencePhasePath='scripts/system-backup-d-download-gc-task-phase.sh';
const candidatePhase=process.argv.includes('--check')?raw(phasePath):fs.readFileSync(path.join(owner,'source',phasePath));
const referencePhase=raw(referencePhasePath);
assert.equal(sha(referencePhase),base.files.find(x=>x.path===referencePhasePath)?.sha256,'reference phase drift');
const normalizedPhase=candidatePhase.toString('utf8').replaceAll('\r\n','\n')
 .replace('# Backup-lock prerequisite experiment only; isolated synthetic accounts, no Collect.','# GC task-eligibility component only; keep earlier accepted suites separate.')
 .replaceAll('d-download-gc-freeze','d-download-gc-task')
 .replaceAll('TestDDownloadGCFreezeMySQL','TestDDownloadGCTaskMySQL')
 .replaceAll('new_cases=34','new_cases=18')
 .replaceAll('component=backup-lock-prerequisites freeze_adapter=not_wired','component=SQLDownloadGCTaskEligibility');
assert.equal(normalizedPhase,referencePhase.toString('utf8').replaceAll('\r\n','\n'),'phase changed beyond constant substitutions');
const phaseEquivalence={reference_path:referencePhasePath,reference_sha256:sha(referencePhase),candidate_sha256:sha(candidatePhase),syntax_structure_preserved_by_exact_constant_substitutions:true,local_bash_executed:false};
for(const m of [source,parent,base]){
 assert.equal(new Set(m.files.map(p=>p.path)).size,m.files.length);
 assert.equal(sha(m.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),m.source_sha256);
 for(const p of m.files)assert.match(p.path,/^(?:backend|contracts|scripts|docs)\/(?!.*(?:\.\.|\\)).+$/);
}
assert.equal(source.files.length,base.files.length+3);
for(const pin of source.files)assert.ok(base.files.some(x=>x.path===pin.path)||owned.includes(pin.path),'unexpected added input');
for(const p of base.files.filter(p=>!owned.includes(p.path)))assert.deepEqual(source.files.find(x=>x.path===p.path),p,'unowned candidate change '+p.path);
assert.equal(native.exit,0);assert.equal(native.source_postcheck,true);assert.equal(native.source_sha256,parent.source_sha256);
for(const m of [native,revision])for(const k of ['dependencies_installed','remote','actual_mysql','full_gc','freeze_adapter_wired','production_approved'])assert.equal(m[k],false,k);
const stages=[...['ps7','ps5'].flatMap(ps=>['d-download-gc-freeze','d-download-gc-task','d-download-producer','a-download-gc-role','a-evidence'].map(x=>ps+'-'+x)),'inputs','tagged-seed','full','windows-build','detached-seed','linux-build','linux-migration'];
for(const stage of stages)assert.equal(native.stages.find(x=>x.stage===stage)?.exit,0,stage);
const revisedStages=['ordinary-exclusion','tagged-seed','windows-build','detached-seed','unowned-deny','linux-build'];
for(const stage of revisedStages)assert.equal(revision.stages.find(x=>x.stage===stage)?.exit,0,stage);
assert.equal(native.stages.find(x=>x.stage==='local-bash-syntax')?.status,'unavailable');
function goResult(stage,expected,prefix=relative){
 const text=raw(prefix+'-'+stage+'.stdout').toString('utf8');
 assert.ok(text.endsWith('\n'),'unterminated Go output');
 const rows=text.trim().split(/\r?\n/).map(x=>JSON.parse(x));
 assert.equal(rows.filter(x=>x.Action==='fail').length,0);
 const packages=rows.filter(x=>x.Action==='pass'&&!x.Test).map(x=>x.Package).sort();
 assert.deepEqual(packages,expected.toSorted());
 const passed=rows.filter(x=>x.Action==='pass'&&x.Test);
 return {packages,roots:passed.filter(x=>!x.Test.includes('/')).map(x=>x.Test),tests:passed.length,skips:rows.filter(x=>x.Action==='skip').length};
}
const full=goResult('full',['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence']);
const tagged=goResult('tagged-seed',['clawreef/internal/systembackupevidence'],revised);
assert.deepEqual(tagged.roots.toSorted(),['TestASensitiveDownloadMFAMySQLSeed','TestDDownloadGCFreezeMySQLSeed']);
assert.equal(tagged.skips,0);
const detached=raw(revised+'-detached-seed.stdout').toString('utf8');
assert.match(detached,/^--- PASS: TestDDownloadGCFreezeMySQLSeed /m);
assert.match(detached,/^--- PASS: TestASensitiveDownloadMFAMySQLSeed /m);
assert.doesNotMatch(detached,/--- (FAIL|SKIP):/);
assert.match(detached,/^PASS\r?$/m);
const negativePrefix='docs/evidence/d-gc-freeze-probe-unowned-deny-20261021-r3';
const negative=json(negativePrefix+'-native.json'),negativeOutput=raw(negativePrefix+'.stdout').toString('utf8');
assert.equal(negative.actual_exit,1);assert.equal(negative.denied_at_owned_namespace_uid,true);assert.equal(negative.fixture_started,false);
assert.match(negativeOutput,/owned namespace UID required/);assert.match(negativeOutput,/--- FAIL: TestDDownloadGCFreezeMySQL /);assert.doesNotMatch(negativeOutput,/FREEZE_FIXTURE|--- SKIP:/);
const evidence=[relative+'-source.json',relative+'-native.json',relative+'-binaries.json',revised+'-source.json',revised+'-native.json','docs/evidence/d-gc-freeze-probe-20261021-r1-native.json','docs/evidence/d-gc-freeze-probe-20261021-r1-bash-syntax.stderr','docs/evidence/d-gc-freeze-probe-concurrent-scope-20261021-r3.json','docs/evidence/d-gc-freeze-probe-dependencies-20261021.txt','docs/evidence/d-gc-freeze-probe-dependencies-20261021-native.json',negativePrefix+'-native.json',negativePrefix+'.stdout',negativePrefix+'.stderr',...stages.flatMap(x=>[relative+'-'+x+'.stdout',relative+'-'+x+'.stderr']),...revisedStages.flatMap(x=>[revised+'-'+x+'.stdout',revised+'-'+x+'.stderr'])].map(p=>({path:p,size:raw(p).length,sha256:sha(raw(p))}));
const receiptPath='docs/evidence/d-gc-freeze-probe-preparation-20261021.json';
if(process.argv.includes('--check')){
 const receipt=json(receiptPath);
 assert.deepEqual(receipt.evidence,evidence);assert.equal(receipt.source_sha256,source.source_sha256);
 assert.deepEqual(receipt.phase_equivalence,phaseEquivalence);
 assert.deepEqual(receipt.full,full);assert.deepEqual(receipt.tagged_seed,tagged);
 for(const pin of receipt.changed_files){assert.equal(sha(raw(pin.path)),pin.after_sha256,pin.path);assert.equal(sha(Buffer.from(pin.tested_bytes_base64,'base64')),pin.after_sha256);}
 assert.equal(receipt.status,'locally_validated_published_actual_mysql_pending');
 assert.equal(receipt.actual_mysql,false);assert.equal(receipt.production_approved,false);
 console.log('PASS freeze prerequisite preparation: local tests, source pins, five published files, actual MySQL pending');
}else{
 assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
 const changed=owned.map(p=>{
  const b=base.files.find(x=>x.path===p), tested=fs.readFileSync(path.join(owner,'source',p));
  assert.equal(sha(tested),source.files.find(x=>x.path===p)?.sha256);
  if(b)assert.equal(sha(raw(p)),b.sha256,'publication conflict '+p);else assert.equal(fs.existsSync(path.join(root,p)),false,'new path occupied '+p);
  return {path:p,before_exists:!!b,before_sha256:b?.sha256??null,before_bytes_base64:b?raw(p).toString('base64'):null,after_sha256:sha(tested),tested_bytes_base64:tested.toString('base64')};
 });
 const binaries=['d-download-gc-freeze.exe','d-download-gc-freeze.test','system-backup-migrate'].map(name=>{const bytes=fs.readFileSync(path.join(owner,name));assert.ok(bytes.length>10000);assert.equal(bytes.subarray(0,name.endsWith('.exe')?2:4).toString('hex'),name.endsWith('.exe')?'4d5a':'7f454c46');return {name,size:bytes.length,sha256:sha(bytes)}});
 assert.equal(binaries.find(x=>x.name==='system-backup-migrate').sha256,json(relative+'-binaries.json').find(x=>x.name==='system-backup-migrate').sha256);
 const receipt={kind:'d_gc_freeze_prerequisite_preparation',status:'locally_validated_unpublished_actual_mysql_pending',source_sha256:source.source_sha256,source_files:source.files.length,base_source_sha256:base.source_sha256,ordinary_test_parent_source_sha256:parent.source_sha256,only_revised_tagged_file:revisedFile,ordinary_tag_exclusion_verified:true,full,tagged_seed:tagged,case_count:34,changed_files:changed,binaries,evidence,phase_equivalence:phaseEquivalence,local_bash_syntax:'unavailable_0xC0000142_remote_preflight_retained',actual_mysql:false,full_gc:false,freeze_adapter_wired:false,role_approved:false,production_approved:false,dependencies_installed:false,remote_executed:false};
 fs.writeFileSync(path.join(root,receiptPath),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log('FREEZE_PREPARATION verified; publication and exact cleanup pending');
}
