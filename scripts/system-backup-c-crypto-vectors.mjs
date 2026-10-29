// Explicit fixture regeneration only. Private keys live in memory, never files.
import {generateKeyPairSync, sign, createCipheriv} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {canonical, signing, domains, sha, b64, aad, sealFrame} from './system-backup-c-crypto-wire.mjs';
const root=new URL('../contracts/system-backup/v12/public-c-crypto-v1/',import.meta.url);
mkdirSync(root,{recursive:true});
const save=(name,value)=>writeFileSync(new URL(name,root),JSON.stringify(value,null,2)+'\n');
const str={type:'string',minLength:1,maxLength:256};
const hash={type:'string',pattern:'^[0-9a-f]{64}$'};
const integer={type:'integer',minimum:0,maximum:9007199254740991};
const positive={...integer,minimum:1};
const time={type:'string',format:'date-time'};
const closed=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const key=purpose=>closed({purpose:{const:purpose},key_id:str,key_version:{...str,maxLength:128}});
const common={origin_installation_id:str,backup_public_id:{type:'string',pattern:'^sbk_[A-Za-z0-9_-]+$'},attempt_no:positive};
const capture=closed({schema_version:{const:'system-backup-capture-certificate.v1'},...common,fencing_token:str,capture_context_hash:hash,
  jobs:{type:'array',minItems:1,items:closed({uid:str,generation:positive,phase:str})},
  checkpoints:{type:'array',minItems:1,items:closed({part:str,checkpoint_hash:hash})},
  staging_resources:{type:'array',minItems:1,items:closed({uid:str,location_hash:hash})},
  capture_completed_at:time,issued_at:time,expires_at:time,signing_key:key('capture_certificate')});
const locator=closed({provider:str,identity_hash:hash,key:{...str,maxLength:1024},version:str});
const catalogBase={schema_version:{const:'system-backup-catalog-record.v1'},...common,record_id:str,recorded_at:time,signing_key:key('catalog_record')};
const registered=closed({...catalogBase,event_type:{const:'artifact_registered'},manifest:locator,manifest_checksum:hash,marker_checksum:hash,acceptance_checksum:hash,capture_certificate_hash:hash,artifact_index_checksum:hash});
const deleted=closed({...catalogBase,event_type:{const:'artifact_deleted'},registration_checksum:hash,manifest_checksum:hash,marker_checksum:hash,acceptance_checksum:hash,prune_public_id:str,deletion_evidence_id:str,deletion_evidence_hash:hash});
const schema=(title,body)=>({$schema:'https://json-schema.org/draft/2020-12/schema',title,'x-contract-version':'public-c-crypto.v1','x-contract-status':'candidate',...body});
save('capture-payload.schema.json',schema('Unsigned capture certificate v1',capture));
save('catalog-payload.schema.json',schema('Unsigned catalog record v1',{oneOf:[registered,deleted]}));
const kek=closed({provider:{enum:['external-kms','external-secret','k8s-secret']},identity_hash:hash,registry_version:str,provider_key_id:str,provider_version:str});
const context=closed({origin_installation_id:str,backup_public_id:common.backup_public_id,attempt_no:{type:'string',pattern:'^[1-9][0-9]*$'},phase:str,part:str,part_index:{type:'string',pattern:'^(0|[1-9][0-9]*)$'},envelope_id:str,capture_context_hash:hash});
const chunk=closed({path:{...str,maxLength:1024},chunk_index:integer,plaintext_length:{...integer,maximum:1048576},ciphertext_length:{...integer,maximum:1048576},final:{type:'boolean'},nonce:{type:'string',pattern:'^[0-9a-f]{24}$'},tag:{type:'string',pattern:'^[0-9a-f]{32}$'},frame_sha256:hash});
save('envelope.schema.json',schema('Final backup envelope v1',closed({schema_version:{const:'system-backup-envelope.v1'},entries:{type:'array',minItems:1,items:closed({envelope_id:str,context,kek,wrap_algorithm:{enum:['provider-native','AES-256-KW']},wrapped_dek:{type:'string',pattern:'^[A-Za-z0-9_-]+$'},data_algorithm:{const:'AES-256-GCM'},framing_version:{const:'aes-gcm-chunked.v1'},chunks:{type:'array',minItems:1,items:chunk}})}})));
const hashA='a'.repeat(64),hashB='b'.repeat(64),hashC='c'.repeat(64);
const base={origin_installation_id:'installation_synthetic',backup_public_id:'sbk_example01',attempt_no:1};
const cap={schema_version:'system-backup-capture-certificate.v1',...base,fencing_token:'17',capture_context_hash:hashC,jobs:[{uid:'job-capture-synthetic',generation:1,phase:'capture'}],checkpoints:[{part:'mysql',checkpoint_hash:hashA}],staging_resources:[{uid:'pvc-synthetic',location_hash:hashB}],capture_completed_at:'2026-09-15T01:20:00Z',issued_at:'2026-09-15T01:21:00Z',expires_at:'2026-09-16T01:21:00Z'};
const acceptance=JSON.parse(readFileSync(new URL('../contracts/system-backup/v12/publication-redacted-examples.json',import.meta.url))).examples.acceptance.payload;
const reg={schema_version:'system-backup-catalog-record.v1',...base,record_id:'scr_synthetic_registration',recorded_at:'2026-09-15T01:31:00Z',event_type:'artifact_registered',manifest:{provider:'s3',identity_hash:hashA,key:'synthetic/manifest.json',version:'immutable-object-v7'},manifest_checksum:acceptance.manifest_checksum,marker_checksum:acceptance.marker_checksum,acceptance_checksum:hashB,capture_certificate_hash:hashC,artifact_index_checksum:hashA};
const del={schema_version:'system-backup-catalog-record.v1',...base,record_id:'scr_synthetic_tombstone',recorded_at:'2026-09-15T02:31:00Z',event_type:'artifact_deleted',registration_checksum:hashA,manifest_checksum:reg.manifest_checksum,marker_checksum:reg.marker_checksum,acceptance_checksum:hashB,prune_public_id:'spr_synthetic',deletion_evidence_id:'sev_synthetic_deletion',deletion_evidence_hash:hashC};
const keys=Object.fromEntries(Object.keys(domains).map(p=>[p,generateKeyPairSync('ed25519')]));
const vectors=[];
for(const [name,purpose,payload] of [['capture','capture_certificate',cap],['acceptance','acceptance_record',acceptance],['registration','catalog_record',reg],['tombstone','catalog_record',del]]) {
 const keyID=purpose==='acceptance_record'?'acceptance-key-example':purpose+'-synthetic';
 const version=purpose==='acceptance_record'?'7':'registry-r17';
 payload.signing_key={purpose,key_id:keyID,key_version:version};
 if(name==='registration') {payload.acceptance_checksum=vectors.find(v=>v.name==='acceptance').object_sha256;payload.capture_certificate_hash=vectors[0].object_sha256;}
 if(name==='tombstone') {payload.registration_checksum=vectors.find(v=>v.name==='registration').object_sha256;payload.acceptance_checksum=vectors.find(v=>v.name==='acceptance').object_sha256;}
 const bytes=signing(payload,purpose,keyID,version);
 const value=b64(sign(null,Buffer.from(bytes.input),keys[purpose].privateKey));
 const record={payload,signature:{algorithm:'EdDSA',key_purpose:purpose,key_id:keyID,key_version:version,domain_separator:domains[purpose],protected_header:bytes.protectedHeader,value}};
 const raw=canonical(record);
 const trust={installation:base.origin_installation_id,purpose,key_id:keyID,key_version:version,provider_version:'3',public_key_base64url:b64(keys[purpose].publicKey.export({format:'der',type:'spki'}).subarray(-32)),not_before:'2026-09-01T00:00:00Z',not_after:'2026-10-01T00:00:00Z',revoked:false};
 const expected={installation:base.origin_installation_id,purpose,key_id:keyID,key_version:version,provider_version:'3',backup_public_id:base.backup_public_id,attempt_no:1,manifest_checksum:acceptance.manifest_checksum,marker_checksum:acceptance.marker_checksum};
 const negative=[
  {name:'payload-byte',target:'record',path:['payload','backup_public_id'],value:'sbk_example02'},
  {name:'wrong-purpose',target:'record',path:['signature','key_purpose'],value:'manifest'},
  {name:'wrong-domain',target:'record',path:['signature','domain_separator'],value:'clawmanager/legacy/v1'},
  {name:'wrong-header',target:'record',path:['signature','protected_header'],value:b64('{}')},
  {name:'wrong-key',target:'trust',path:['key_id'],value:'other'},
  {name:'wrong-registry-version',target:'trust',path:['key_version'],value:'latest'},
  {name:'wrong-provider-version',target:'trust',path:['provider_version'],value:'4'},
  {name:'cross-installation',target:'expected',path:['installation'],value:'other-installation'},
  {name:'revoked',target:'trust',path:['revoked'],value:true},
  {name:'outside-key-validity',target:'trust',path:['not_after'],value:'2026-09-15T00:00:00Z'},
  {name:'padded-signature',target:'record',path:['signature','value'],value:value+'='},
  {name:'wrong-public-key',target:'trust',path:['public_key_base64url'],value:b64(Buffer.alloc(32))},
 ];
 if(name==='capture') negative.push({name:'expired-job-certificate',target:'clock',value:'2026-09-16T01:21:00Z',mode:'job'});
 vectors.push({name,trust,expected,payload_json:canonical(payload),payload_sha256:sha(canonical(payload)),header_json:canonical(bytes.header),protected_header:bytes.protectedHeader,payload_base64url:bytes.payload64,signing_input_ascii:bytes.input,signing_input_sha256:sha(bytes.input),signature_base64url:value,record_json:raw,object_sha256:sha(raw),negative});
}
save('signature-vectors.json',{version:'public-c-crypto.v1',kind:'synthetic-public-only',vectors});
const keyBytes=Buffer.from(Array.from({length:32},(_,i)=>i)); // PUBLIC synthetic test DEK
const kekBytes=Buffer.from(Array.from({length:32},(_,i)=>255-i)); // PUBLIC synthetic test KEK
const wrap=createCipheriv('id-aes256-wrap',kekBytes,Buffer.alloc(8,0xa6));
const wrapped=Buffer.concat([wrap.update(keyBytes),wrap.final()]);
const binding={schema_version:'aes-gcm-chunked.v1',origin_installation_id:base.origin_installation_id,backup_public_id:base.backup_public_id,attempt_no:'1',phase:'capture',part:'mysql',part_index:'0',path:'mysql/part-00001.enc',envelope_id:'env_synthetic_01',capture_context_hash:hashC,kek_binding_sha256:''};
const keyRef={provider:'external-secret',identity_hash:hashA,registry_version:'opaque-r17',provider_key_id:'synthetic-backup-kek',provider_version:'immutable-v3'};
binding.kek_binding_sha256=sha(canonical(keyRef));
const frames=[{index:0,plaintext_hex:Buffer.from('synthetic backup 原始数据').toString('hex'),nonce_hex:'000102030405060708090a0b',final:false},{index:1,plaintext_hex:'',nonce_hex:'0c0d0e0f1011121314151617',final:true}].map(f=>{
 const plain=Buffer.from(f.plaintext_hex,'hex');const wire=sealFrame(keyBytes,Buffer.from(f.nonce_hex,'hex'),binding,f.index,plain,f.final);
 return {...f,aad_hex:aad(binding,f.index,plain.length,f.final).toString('hex'),frame_hex:wire.toString('hex'),frame_sha256:sha(wire)};
});
const keyContext=Object.fromEntries(Object.entries(binding).filter(([k])=>!['schema_version','path','kek_binding_sha256'].includes(k)));
const envelope={schema_version:'system-backup-envelope.v1',entries:[{envelope_id:binding.envelope_id,context:keyContext,kek:keyRef,wrap_algorithm:'AES-256-KW',wrapped_dek:b64(wrapped),data_algorithm:'AES-256-GCM',framing_version:binding.schema_version,chunks:frames.map(f=>({path:binding.path,chunk_index:f.index,plaintext_length:f.plaintext_hex.length/2,ciphertext_length:f.plaintext_hex.length/2,final:f.final,nonce:f.nonce_hex,tag:f.frame_hex.slice(-32),frame_sha256:f.frame_sha256}))}]};
save('envelope-vectors.json',{version:'public-c-crypto.v1',kind:'synthetic-functional-test-only',test_dek_hex:keyBytes.toString('hex'),test_kek_hex:kekBytes.toString('hex'),wrapped_dek_hex:wrapped.toString('hex'),binding,frames,envelope_json:canonical(envelope),envelope_sha256:sha(canonical(envelope)),negative:['wrong-installation','wrong-task','wrong-attempt','wrong-phase','wrong-part','wrong-part-index','wrong-path','wrong-envelope','wrong-capture-context','wrong-kek-binding','wrong-key','wrong-index','wrong-tag','truncated','trailing','missing-eof','wrong-wrap-key']});
keyBytes.fill(0);kekBytes.fill(0);
