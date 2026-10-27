import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const resolve=p=>path.join(root,p);
const bytes=p=>fs.readFileSync(resolve(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(bytes(p).toString('utf8').replace(/^\uFEFF/,''));
const evidence='docs/evidence/';
const pkg='backend/internal/systembackupgcmetadata/';
const names=['catalog.go','catalog_test.go'];
const owner='.tmp-d-index-cache-0f0b327a8c394230b477fde2cca729bb';
const roots=['TestReadCompleteProgramsAndOpaqueObservation','TestIndependentFramingGoldenAndNullEmpty','TestPrivilegeCoverageCannotBeReplacedByHash','TestObserverIdentityAndLiveConnection','TestEveryDomainFailureReturnsNoPartialCatalog','TestRoutineSignaturesAndReturnMetadata','TestEveryProjectedCellChangesOrRejectsItsDigest','TestCatalogBoundsAndOriginalContext','TestConfigurationAndZeroValue'];
const pinDigest=m=>sha(Buffer.from(m.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'));
const basePath=evidence+'d-gc-program-observer-base-20261021.json';
const base=json(basePath);
assert.equal(pinDigest(base),base.source_sha256);
assert.equal(base.files.length,1458);
const runs=[];
for(const mode of ['isolated','published']){
  const prefix=evidence+'d-gc-program-observer-20261021-r1-'+mode;
  const manifest=json(prefix+'-source.json'),native=json(prefix+'-native.json');
  assert.equal(pinDigest(manifest),manifest.source_sha256);
  assert.equal(manifest.files.length,1460);
  assert.equal(native.source_sha256,manifest.source_sha256);
  assert.equal(manifest.base_source_sha256,base.source_sha256);
  const byPath=new Map(manifest.files.map(p=>[p.path,p]));
  for(const p of base.files) assert.deepEqual(byPath.get(p.path),p,'base input drift '+p.path);
  assert.deepEqual(manifest.files.filter(p=>!base.files.some(b=>b.path===p.path)).map(p=>p.path).sort(),names.map(n=>pkg+n).sort());
  assert.equal(native.exit,0);assert.equal(native.postcheck,true);assert.equal(native.default_vet,true);
  assert.equal(native.dependencies_installed,false);assert.equal(native.remote,false);assert.equal(native.mode,mode);
  assert.equal(bytes(prefix+'-stderr.txt').length,0);
  const log=bytes(prefix+'.jsonl').toString('utf8');assert.ok(log.endsWith('\n'));
  const ev=log.trim().split(/\r?\n/).map(s=>JSON.parse(s));
  assert.ok(!ev.some(e=>e.Action==='skip'||e.Action==='fail'));
  assert.ok(ev.some(e=>e.Action==='pass'&&e.Package==='clawreef/internal/systembackupgcmetadata'&&!e.Test));
  const tests=ev.filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Test);
  assert.deepEqual(tests.filter(t=>!t.includes('/')).sort(),[...roots].sort());
  for(const name of tests)assert.equal(ev.filter(e=>e.Action==='run'&&e.Test===name).length,1,'not a single uncached run '+name);
  for(const p of [pkg+'catalog.go',pkg+'catalog_test.go','backend/go.mod','backend/go.sum']){
    assert.equal(sha(bytes(p)),byPath.get(p).sha256,'current package/module differs from tested bytes '+p);
  }
  runs.push({mode,source_sha256:manifest.source_sha256,files:manifest.files.length,main:roots.length,checks:tests.length,elapsed:ev.find(e=>e.Action==='pass'&&!e.Test&&e.Package==='clawreef/internal/systembackupgcmetadata').Elapsed,source_manifest:prefix+'-source.json',source_manifest_sha256:sha(bytes(prefix+'-source.json')),events_sha256:sha(bytes(prefix+'.jsonl')),native_sha256:sha(bytes(prefix+'-native.json')),default_vet:true,exit:0,source_postcheck:true});
}
assert.equal(runs[0].source_sha256,runs[1].source_sha256);
// Independent Node framing oracle: no imports or execution of Go helpers.
function digest(domain,rows){
  const chunks=[Buffer.from('clawmanager.gc-program-catalog.v1/'+domain+'\0')];
  const number=n=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(n));return b;};
  for(const row of rows){chunks.push(Buffer.from('R'),number(row.length));for(const s of row){if(s===null)chunks.push(Buffer.from('N'));else{const b=Buffer.from(s);chunks.push(Buffer.from('S'),number(b.length),b);}}}
  chunks.push(Buffer.from('C'),number(rows.length));return sha(Buffer.concat(chunks));
}
const grants=["GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON *.* TO 'gc_observer'@'localhost'","GRANT SHOW_ROUTINE ON *.* TO 'gc_observer'@'localhost'"];
const goldens={empty_triggers:digest('triggers',[]),fixture_grants:digest('grants',grants.sort().map(s=>[s]))};
assert.equal(goldens.empty_triggers,'067ecda4a0afbb92f9d58f651af4482f1162406a79ef3502dff6316cbf82c85e');
assert.equal(goldens.fixture_grants,'80efcf1b5ee62e4b3ccc30bbe6f673abdbe2c37ea5eafda5ff82701933f957a6');
const cleanupPath=evidence+'d-gc-program-observer-cleanup-20261021.json';
const cleanup=json(cleanupPath);
assert.equal(cleanup.owner,owner);assert.equal(cleanup.removed,true);assert.equal(cleanup.process_terminal,true);assert.equal(cleanup.source_postcheck,true);
assert.equal(fs.existsSync(resolve(owner)),false);
const priorPath=evidence+'d-download-gc-producer-20261021-r5-source.json';
const prior=json(priorPath);assert.equal(pinDigest(prior),prior.source_sha256);
const oldByPath=new Map(prior.files.map(p=>[p.path,p]));
const baseByPath=new Map(base.files.map(p=>[p.path,p]));
const intervening={prior_source_sha256:prior.source_sha256,prior_manifest_sha256:sha(bytes(priorPath)),added:base.files.filter(p=>!oldByPath.has(p.path)).map(p=>p.path),modified:base.files.filter(p=>oldByPath.has(p.path)&&oldByPath.get(p.path).sha256!==p.sha256).map(p=>p.path),removed:prior.files.filter(p=>!baseByPath.has(p.path)).map(p=>p.path),covered_by_this_package_run:false};
const receipt={kind:'d_gc_program_metadata_observer_local_preparation',status:'local_component_only',base_source_sha256:base.source_sha256,base_manifest_sha256:sha(bytes(basePath)),intervening,runs,goldens,published:names.map(n=>({path:pkg+n,sha256:sha(bytes(pkg+n))})),cleanup:{path:cleanupPath,sha256:sha(bytes(cleanupPath)),owner_absent:true},boundaries:{dependencies_installed:false,remote:false,actual_sql_cases:0,privileges_approved:false,ddl_freeze:false,full_gc_policy:false,production_activation:false,whole_current_module_tested:false,existing_four_package_receipts:'historical frozen sources only',remaining:['real MySQL observer account and visibility positive/negative proof','full program dependency policy and reviewed expected digests','view ALGORITHM/SHOW CREATE, event ORIGINATOR and other metadata outside these explicit projections','DDL freeze spanning observation, collector mutation and commit','catalog/import/logical/bootstrap authoritative lifecycle','full collector, physical budget, roles and original six scopes']}};
const out=evidence+'d-gc-program-observer-preparation-20261021.json';
if(process.argv.includes('--write')){assert.equal(fs.existsSync(resolve(out)),false,'do not overwrite accepted receipt');fs.writeFileSync(resolve(out),JSON.stringify(receipt,null,2)+'\n');}
else{assert.ok(process.argv.includes('--check'),'use --write or --check');assert.deepEqual(json(out),receipt);}
console.log('PASS program metadata observer: isolated and published default-vet package runs, pinned source, independent framing, guarded cleanup; actual SQL/freeze/full policy still pending');
