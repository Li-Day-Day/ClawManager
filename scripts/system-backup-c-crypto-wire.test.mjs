import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDecipheriv} from 'node:crypto';
import {canonical,sha,signing,verifyRecord,aad,sealFrame,openFrame,openStream} from './system-backup-c-crypto-wire.mjs';
const root=new URL('../contracts/system-backup/v12/public-c-crypto-v1/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
for(const v of read('signature-vectors.json').vectors) {
 test(v.name+' original bytes',()=>{
  const p=verifyRecord(v.record_json,v.trust,v.expected,'2026-09-15T02:00:00Z');
  assert.equal(canonical(p),v.payload_json);
  const bytes=signing(p,v.trust.purpose,v.trust.key_id,v.trust.key_version);
  assert.equal(canonical(bytes.header),v.header_json);
  assert.equal(bytes.protectedHeader,v.protected_header);
  assert.equal(bytes.payload64,v.payload_base64url);
  assert.equal(bytes.input,v.signing_input_ascii);
  assert.equal(sha(bytes.input),v.signing_input_sha256);
  assert.equal(sha(v.payload_json),v.payload_sha256);
  assert.equal(sha(v.record_json),v.object_sha256);
  assert.equal(JSON.parse(v.record_json).signature.value,v.signature_base64url);
 });
 for(const n of v.negative) test(v.name+' rejects '+n.name,()=>{
  const data={record:JSON.parse(v.record_json),trust:structuredClone(v.trust),expected:structuredClone(v.expected)};
  let now='2026-09-15T02:00:00Z';
  if(n.target==='clock') now=n.value;
  else {let dest=data[n.target];for(const k of n.path.slice(0,-1)) dest=dest[k];dest[n.path.at(-1)]=n.value;}
  assert.throws(()=>verifyRecord(canonical(data.record),data.trust,data.expected,now,n.mode??'historical'));
 });
 test(v.name+' rejects duplicate and noncanonical JSON',()=>{
  assert.throws(()=>verifyRecord(' '+v.record_json,v.trust,v.expected,''));
  assert.throws(()=>verifyRecord(v.record_json.replace('{','{"payload":{},'),v.trust,v.expected,''));
 });
}
test('existing A acceptance signature remains compatible',()=>{
 const original=JSON.parse(readFileSync(new URL('../contracts/system-backup/v12/publication-redacted-examples.json',import.meta.url))).examples.acceptance;
 const av=JSON.parse(readFileSync(new URL('../contracts/system-backup/v12/a-artifact-signature-vectors.json',import.meta.url)));
 const v=read('signature-vectors.json').vectors.find(v=>v.name==='acceptance');
 verifyRecord(canonical(original),{...v.trust,public_key_base64url:av.public_key_base64url},v.expected,'');
 assert.equal(sha(signing(original.payload,'acceptance_record','acceptance-key-example','7').input),av.signing_input_sha256);
});
const e=read('envelope-vectors.json');
const key=Buffer.from(e.test_dek_hex,'hex'),frames=e.frames.map(f=>Buffer.from(f.frame_hex,'hex'));
test('envelope canonical bytes and fixed frame vectors',()=>{
 assert.equal(canonical(JSON.parse(e.envelope_json)),e.envelope_json);
 assert.equal(sha(e.envelope_json),e.envelope_sha256);
 for(const f of e.frames) {
  const plain=Buffer.from(f.plaintext_hex,'hex');
  assert.equal(aad(e.binding,f.index,plain.length,f.final).toString('hex'),f.aad_hex);
  assert.equal(sealFrame(key,Buffer.from(f.nonce_hex,'hex'),e.binding,f.index,plain,f.final).toString('hex'),f.frame_hex);
  assert.equal(sha(Buffer.from(f.frame_hex,'hex')),f.frame_sha256);
 }
 assert.equal(openStream(key,frames,e.binding).toString('hex'),e.frames[0].plaintext_hex);
});
for(const field of Object.keys(e.binding)) test('AAD rejects changed '+field,()=>{
 const value=field==='attempt_no'?'2':field==='part_index'?'1':field.endsWith('hash')||field.endsWith('sha256')?'d'.repeat(64):e.binding[field]+'x';
 assert.throws(()=>openFrame(key,frames[0],{...e.binding,[field]:value},0));
});
for(const name of ['wrong-key','wrong-index','wrong-tag','truncated','trailing','missing-eof']) test('framing rejects '+name,()=>{
 const bad=frames.map(f=>Buffer.from(f));let k=key;
 if(name==='wrong-key') k=Buffer.alloc(32);
 if(name==='wrong-index') bad[0][19]^=1;
 if(name==='wrong-tag') bad[0][bad[0].length-1]^=1;
 if(name==='truncated') bad[0]=bad[0].subarray(0,-1);
 if(name==='trailing') bad[1]=Buffer.concat([bad[1],Buffer.from([0])]);
 if(name==='missing-eof') bad.pop();
 assert.throws(()=>openStream(k,bad,e.binding));
});
function unwrap(k) {const d=createDecipheriv('id-aes256-wrap',k,Buffer.alloc(8,0xa6));return Buffer.concat([d.update(Buffer.from(e.wrapped_dek_hex,'hex')),d.final()]);}
test('AES-256-KW exact wrapped vector',()=>assert.deepEqual(unwrap(Buffer.from(e.test_kek_hex,'hex')),key));
test('AES-256-KW wrong key rejected',()=>assert.throws(()=>unwrap(Buffer.alloc(32))));
test('historical capture expiry is not current Job authorization',()=>{
 const v=read('signature-vectors.json').vectors[0];
 assert.doesNotThrow(()=>verifyRecord(v.record_json,v.trust,v.expected,'2026-10-29T00:00:00Z','historical'));
 assert.throws(()=>verifyRecord(v.record_json,v.trust,v.expected,'2026-10-29T00:00:00Z','job'));
});
test('restricted JCS rejects ambiguous numbers and unicode',()=>{
 for(const x of [-0,NaN,Infinity,0.5,9007199254740992,'\ud800']) assert.throws(()=>canonical(x));
 assert.equal(canonical({'\ue000':1,'😀':2}),'{"😀":2,"":1}');
});

// Test-only interpreter of the keywords used by these closed payload schemas;
// this is not a general JSON Schema implementation or a production validator.
function matches(value,s,base) {
 if(s.$ref) {const url=new URL(s.$ref,base),pointer=url.hash.slice(1);url.hash='';let target=JSON.parse(readFileSync(url));for(const p of pointer.split('/').slice(1))target=target[p.replace(/~1/g,'/').replace(/~0/g,'~')];if(!matches(value,target,url))return false;}
 if(s.const!==undefined && canonical(value)!==canonical(s.const))return false;
 if(s.enum && !s.enum.some(x=>canonical(x)===canonical(value)))return false;
 if(s.oneOf && s.oneOf.filter(x=>matches(value,x,base)).length!==1)return false;
 if(s.allOf && !s.allOf.every(x=>matches(value,x,base)))return false;
 if(s.not && matches(value,s.not,base))return false;
 if(s.if && matches(value,s.if,base) && s.then && !matches(value,s.then,base))return false;
 const types=Array.isArray(s.type)?s.type:[s.type];
 if(s.type && !types.some(t=>t==='null'?value===null:t==='array'?Array.isArray(value):t==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):t==='integer'?Number.isSafeInteger(value):typeof value===t))return false;
 if(typeof value==='string' && ((s.minLength!==undefined&&[...value].length<s.minLength)||(s.maxLength!==undefined&&[...value].length>s.maxLength)||(s.pattern&&!new RegExp(s.pattern).test(value))||(s.format==='date-time'&&!Number.isFinite(Date.parse(value)))))return false;
 if(typeof value==='number' && ((s.minimum!==undefined&&value<s.minimum)||(s.maximum!==undefined&&value>s.maximum)))return false;
 if(Array.isArray(value)) {
  if(s.minItems!==undefined&&value.length<s.minItems)return false;
  if(s.uniqueItems&&new Set(value.map(canonical)).size!==value.length)return false;
  if(s.items&&!value.every(x=>matches(x,s.items,base)))return false;
  if(s.contains&&!value.some(x=>matches(x,s.contains,base)))return false;
 }
 if(value!==null && typeof value==='object'&&!Array.isArray(value)) {
  if(s.required?.some(k=>!Object.hasOwn(value,k)))return false;
  if(s.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(s.properties??{},k)))return false;
  for(const [k,sub]of Object.entries(s.properties??{}))if(Object.hasOwn(value,k)&&!matches(value[k],sub,base))return false;
 }
 return true;
}
for(const v of read('signature-vectors.json').vectors) test(v.name+' unsigned closed schema',()=>{
 const file=v.name==='capture'?'capture-payload.schema.json':v.name==='acceptance'?'../acceptance-marker.schema.json':'catalog-payload.schema.json';
 const url=new URL(file,root);let schema=JSON.parse(readFileSync(url));if(v.name==='acceptance')schema=schema.properties.payload;
 const payload=JSON.parse(v.payload_json);
 assert.ok(matches(payload,schema,url));
 assert.equal(matches({...payload,unexpected:true},schema,url),false);
 delete payload.signing_key;
 assert.equal(matches(payload,schema,url),false);
});
test('final envelope closed schema',()=>{
 const url=new URL('envelope.schema.json',root),schema=read('envelope.schema.json');
 const envelope=JSON.parse(e.envelope_json);
 assert.ok(matches(envelope,schema,url));
 envelope.entries[0].plaintext_dek='forbidden';
 assert.equal(matches(envelope,schema,url),false);
});
