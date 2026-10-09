import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalBytes, digest, resultHashes, commandHashes, validateRecord, targetKey, reservationBytes, schema, transactions } from './system-backup-producer-contract.mjs';

const dir = new URL('../contracts/system-backup/v12/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const vectors = read('producer-authority-vectors.json');
const persistence = read('producer-authority-persistence.json');
const clone = structuredClone;

test('independent hand-written byte frames pin tags, length units, ordering and SHA domains', () => {
  const frames = [
    [null, '6e'], [false, '66'], [true, '74'], ['', '730000000000000000'],
    [[], '610000000000000000'], [{}, '6f0000000000000000'],
    [{a:null}, '6f0000000000000001730000000000000001616e'],
    ['中', '730000000000000003e4b8ad'],
    [['1',null], '610000000000000002730000000000000001316e']
  ];
  for (const [value, hex] of frames) {
    assert.equal(canonicalBytes(value).toString('hex'), hex);
    // Independent domain framing: 1-byte 'x' with manually encoded length.
    assert.equal(digest('x', value), createHash('sha256').update(Buffer.from(`000000000000000178${hex}`, 'hex')).digest('hex'));
  }
  assert.deepEqual(canonicalBytes({z:'last',a:'first'}), canonicalBytes({a:'first',z:'last'}));
  assert.notEqual(digest('x', 'é'), digest('x', 'e\u0301')); // no normalization
  assert.notEqual(digest('x', ['ab','c']), digest('x', ['a','bc']));
  assert.notEqual(digest('x', []), digest('y', []));
  for (const v of vectors.encoding) {
    assert.equal(canonicalBytes(v.value).toString('hex'), v.hex);
    assert.equal(digest(v.domain, v.value), v.sha256);
  }
});

test('codec refuses lossy/ambiguous JavaScript values', () => {
  const cycle = {}; cycle.self = cycle;
  const accessor = {}; Object.defineProperty(accessor, 'x', {enumerable:true,get(){throw new Error('must not execute');}});
  const hidden = {}; Object.defineProperty(hidden, 'x', {value:'secret'});
  const extended = []; extended.extra='x';
  const arrayAccessor = []; Object.defineProperty(arrayAccessor,'0',{enumerable:true,get(){assert.fail('array getter must never run');}});
  const arrayHidden = []; Object.defineProperty(arrayHidden,'x',{value:'hidden'});
  for (const v of [0,1.5,NaN,Infinity,1n,undefined,()=>{},'\ud800','\udfff',new Date(),new Map(),cycle,Array(2),extended,arrayAccessor,arrayHidden,accessor,hidden,{[Symbol('x')]:'x'}]) {
    assert.throws(()=>canonicalBytes(v));
  }
  assert.throws(()=>validateRecord('ResultRequest',accessor),/accessor property/);
});

for (const fixture of [...vectors.positive, ...vectors.commands]) {
  test(`synthetic ${fixture.definition} ${fixture.id}`, () => {
    assert.equal(validateRecord(fixture.definition, fixture.value), true);
    const hashes = fixture.definition === 'ResultRequest' ? resultHashes(fixture.value) : commandHashes(fixture.value);
    assert.deepEqual(hashes, fixture.hashes);
  });
}
for (const fixture of vectors.records) {
  test(`record ${fixture.definition} closed shape and bounds`, () => {
    assert.equal(validateRecord(fixture.definition,fixture.value),true);
    assert.throws(()=>validateRecord(fixture.definition,{...fixture.value,claim:'forged'}));
    for(const k of schema.$defs[fixture.definition].required) {
      const value=clone(fixture.value); delete value[k];
      assert.throws(()=>validateRecord(fixture.definition,value),`missing ${k}`);
    }
  });
}
for (const fixture of vectors.negative) {
  test(`reject ${fixture.id}`, () => {
    const source = (fixture.definition==='CommandRequest'?vectors.commands:vectors.positive).find(v=>v.id===fixture.source);
    assert.ok(source, fixture.source);
    const v = clone(source.value);
    const parent = fixture.path.slice(0,-1).reduce((o,k)=>o[k],v);
    if(fixture.remove) delete parent[fixture.path.at(-1)]; else parent[fixture.path.at(-1)]=fixture.value;
    assert.throws(()=>validateRecord(fixture.definition,v));
  });
}

test('complete request is hashed; same idempotency key does not hide a changed payload', () => {
  const base = vectors.positive[0].value;
  const original = resultHashes(base);
  const mutate = (path,value) => { const r=clone(base); const p=path.slice(0,-1).reduce((o,k)=>o[k],r); p[path.at(-1)]=value; return r; };
  const changes = [
    [['domain_epoch'],'2'],[['admission','policy_hash'],'1'.repeat(64)],
    [['admission','channel_profile_hash'],'2'.repeat(64)],[['input_hash'],'3'.repeat(64)],
    [['target','evaluator_profile_hash'],'4'.repeat(64)],
    [['target_generation'],'2'],[['expected_result_version'],'1'],
    [['evidence','content_hash'],'8'.repeat(64)],[['evidence','object_hash'],'7'.repeat(64)],
    [['evidence','immutable_version'],'object-v2'],[['evidence','manifest_hash'],'5'.repeat(64)],
    [['evidence','write_ref_version'],'write-v2'],[['expected_evidence_version'],'4'],
    [['observed_at'],'2026-09-30T01:00:00.000002Z'],
    [['observation_expires_at'],'2026-09-30T01:05:00.000002Z'],
    [['results','observations',0,'observed_version'],'provider-v2']
  ];
  for (const [path,value] of changes) {
    const r=mutate(path,value); const got=resultHashes(r);
    assert.equal(got.key,original.key,path.join('.'));
    assert.notEqual(got.request,original.request,path.join('.'));
  }
  for (const [path,value] of [[['grant_id'],'another'],[['grant_generation'],'2'],[['run_id'],'another'],[['request_key'],'synthetic-request-0002'],[['target','probe_scope_hash'],'1'.repeat(64)]]) {
    assert.notEqual(resultHashes(mutate(path,value)).key,original.key,path.join('.'));
  }
  const disabled=clone(base); disabled.admission=vectors.positive.find(v=>v.id==='disabled_artifact').value.admission;
  assert.equal(resultHashes(disabled).key,original.key);
  assert.notEqual(resultHashes(disabled).request,original.request);
  const keys = Object.keys(base);
  assert.deepEqual(keys.toSorted(), schema.$defs.ResultRequest.required.toSorted());
  // Digest implementation consumes the full root object, not a hand-picked
  // field set. Each root field is included by direct independent digest.
  assert.equal(original.request,digest(transactions.encoding.domains.result_request,base));
});

test('target fence survives evaluator revision but separates exact identity/ref/scope/role', () => {
  const base=vectors.positive[0].value;
  const changed=clone(base); changed.target.evaluator_profile_hash='1'.repeat(64);
  assert.equal(resultHashes(base).target,resultHashes(changed).target);
  for(const k of ['identity_hash','ref_version','probe_scope_hash']) {
    const t=clone(base.target); t[k]=k==='ref_version'?'v2':'0'.repeat(64);
    assert.notDeepEqual(targetKey(t),targetKey(base.target));
  }
});

test('max uint64 survives roundtrip without number coercion and invalid dates stay invalid', () => {
  const v=clone(vectors.positive[0].value); v.grant_generation='18446744073709551615';
  assert.equal(validateRecord('ResultRequest',v),true);
  v.grant_generation='18446744073709551616'; assert.throws(()=>resultHashes(v));
  for(const timestamp of ['2026-09-30T01:00:60.000001Z','2026-09-31T01:00:00.000001Z','0999-09-30T01:00:00.000001Z']) {
    const r=clone(vectors.positive[0].value); r.observed_at=timestamp; assert.throws(()=>resultHashes(r));
  }
  for (const field of ['store_ref_version','write_ref_version','kek_version']) {
    const r=clone(vectors.positive[0].value); r.evidence[field]='invalid/version'; assert.throws(()=>resultHashes(r));
  }
  const r=clone(vectors.positive[0].value); r.evidence.immutable_version='null'; assert.throws(()=>resultHashes(r));
});

test('stored receipts reject tampering; observation and original pending binding remain separate', () => {
  for(const name of ['ReceiptRecord','CommandReceiptRecord']) {
    const r=clone(vectors.records.find(v=>v.definition===name).value);
    r.request_hash='0'.repeat(64); assert.throws(()=>validateRecord(name,r));
  }
  const r=clone(vectors.records.find(v=>v.definition==='RunRecord').value);
  r.observation_expires_at=null; assert.throws(()=>validateRecord('RunRecord',r));
  const h=clone(vectors.records.find(v=>v.definition==='HistoricalBindingRecord').value);
  h.relative_key+='-different'; assert.throws(()=>validateRecord('HistoricalBindingRecord',h));
  const t=clone(vectors.records.find(v=>v.definition==='TargetRecord').value);
  t.target_hash='0'.repeat(64); assert.throws(()=>validateRecord('TargetRecord',t));
  const c=clone(vectors.records.find(v=>v.definition==='CommandReceiptRecord').value);
  c.outcome.run_id='wrong_run'; assert.throws(()=>validateRecord('CommandReceiptRecord',c));
});

test('relational dictionary resolves every record/key/FK and excludes live catalog writes', () => {
  const tables = new Map(persistence.tables.map(t=>[t.name,t]));
  assert.equal(tables.size,8);
  for(const t of tables.values()) {
    assert.ok(schema.$defs[t.definition]);
    assert.ok(vectors.records.some(v=>v.definition===t.definition));
    for(const key of [t.primary_key,...t.unique_keys,...t.indexes]) for(const c of key) assert.ok(Object.hasOwn(t.columns,c),`${t.name}.${c}`);
    for(const fk of t.foreign_keys) {
      const target=tables.get(fk.table); assert.ok(target);
      assert.equal(fk.columns.length,fk.references.length);
      assert.ok([target.primary_key,...target.unique_keys].some(k=>JSON.stringify(k)===JSON.stringify(fk.references)));
      fk.columns.forEach(c=>assert.ok(t.columns[c]));
      assert.equal(fk.delete,'RESTRICT'); assert.equal(fk.update,'RESTRICT');
    }
    const record=vectors.records.find(v=>v.definition===t.definition);
    assert.ok(canonicalBytes(record.value).length<=t.record_max_bytes);
  }
  assert.equal(persistence.migration_number,null);
  assert.equal(persistence.embedded_catalog_changed,false);
  assert.deepEqual(persistence.approved_reviewers,[]);
  const inventory=JSON.parse(readFileSync(new URL('../docs/system-backup-restore-schema-inventory.json',import.meta.url),'utf8'));
  const raw=JSON.stringify(inventory);
  for(const name of tables.keys()) assert.equal(raw.includes(`"${name}"`),false,'proposal is not inventory');
});

test('reservation charges bounded retained rows and rejects unknown or overflowing costs', () => {
  assert.equal(reservationBytes({system_backup_producer_result_receipts:1,system_backup_producer_evidence_refs:2}),376832n);
  assert.equal(reservationBytes({system_backup_producer_command_receipts:1},100n),196708n);
  assert.throws(()=>reservationBytes({unknown:1}));
  assert.throws(()=>reservationBytes({system_backup_producer_targets:-1}));
  assert.throws(()=>reservationBytes({system_backup_producer_targets:Number.MAX_SAFE_INTEGER}));
});

test('shared enum sets agree with existing contracts and package stays unapproved', () => {
  const d=read('dependency-provider-capability.schema.json').$defs;
  assert.deepEqual(schema.$defs.ProviderObservation.properties.status.enum,d.CapabilityStatus.enum);
  assert.deepEqual(schema.$defs.ProviderObservation.properties.reason.enum,d.CapabilityReasonCode.enum);
  assert.deepEqual(schema.$defs.DependencyObservation.properties.status.enum,d.ObservedHealth.enum);
  assert.deepEqual(schema.$defs.DependencyObservation.properties.reason.enum,d.HealthReason.enum);
  assert.deepEqual(schema.$defs.DependencyObservation.properties.slot.enum,d.DependencyKind.enum);
  assert.deepEqual(schema.$defs.EvidenceBinding.properties.classification.enum,read('evidence-chunk-log.schema.json').$defs.RedactionClassification.enum);
  assert.equal(schema.$defs.EvidenceID.pattern,read('admin-api-common.schema.json').$defs.EvidencePublicId.pattern);
  assert.deepEqual(transactions.approved_reviewers,[]);
  assert.equal(transactions.production_wiring,false);
  assert.deepEqual(vectors.runtime.map(v=>v.id),Array.from({length:10},(_,i)=>`V${String(i+1).padStart(2,'0')}`));
  assert.ok(vectors.runtime.every(v=>v.status==='not_run'&&v.evidence===null));
  assert.equal(vectors.production_authorization,false);
  const manifest=read('contract-manifest.json');
  const item=manifest.artifacts.find(v=>v.id==='producer_authority');
  assert.equal(item?.status,'draft');
  assert.equal(item?.path,'contracts/system-backup/v12/producer-authority.schema.json');
  assert.ok(read('cross-owner-review-requests.json').public_contract_reviews.some(v=>v.artifact_ids.includes('producer_authority')&&v.approved_reviewers.length===0));
  for(const p of [transactions.schema,transactions.persistence,transactions.vectors]) assert.ok(existsSync(new URL(p,dir)));
});
