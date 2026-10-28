import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode)&&extra.length===0);
const base='contracts/system-backup/v12/';
const output='docs/evidence/a2-bootstrap-registry-contract-coverage-20261027-r2.json';
const markdown='docs/system-backup-a2-bootstrap-registry-contract-coverage-20261027-r2.md';
const bytes=new Map();
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>{if(!bytes.has(p))bytes.set(p,fs.readFileSync(p));return bytes.get(p);};
const text=p=>read(p).toString('utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(text(p));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const kinds=['parts','redis_sources','failure_domains','disaster_identity_mapping','source_writers','secret_allowlist'];
const escape=s=>s.replaceAll('~','~0').replaceAll('/','~1');
const schemas=fs.readdirSync(base).filter(n=>n.endsWith('.schema.json')).sort();
assert.ok(schemas.length>20,'schema inventory unexpectedly incomplete');
const mentions=[],freezeBlockers=[],freezeAnnotationDefinitions=[];
function visit(value,file,pointer='') {
  if(typeof value==='string'&&kinds.includes(value))mentions.push({file,pointer,kind:value,position:'value'});
  if(!value||typeof value!=='object')return;
  for(const [key,item]of Object.entries(value)) {
    const at=pointer+'/'+escape(key);
    if(kinds.includes(key))mentions.push({file,pointer:at,kind:key,position:'key'});
    if(key.includes('freeze-block')){const entry={file,pointer:at,value:item};if(typeof item==='string'||(Array.isArray(item)&&item.every(v=>typeof v==='string')))freezeBlockers.push(entry);else freezeAnnotationDefinitions.push(entry);}
    visit(item,file,at);
  }
}
const schemaInventory=schemas.map(n=>{
  const p=base+n,j=json(p);visit(j,p);
  return{...pin(p),id:j.$id??null,contract_status:j['x-contract-status']??null};
});
const manifest=json(base+'manifest-system-backup-v1.schema.json');
const common=json(base+'artifact-common.schema.json');
const runner=json(base+'runner-data-interfaces.schema.json');
const state=json(base+'source-writer-check-state.schema.json');
const enums=json(base+'registry-enums.json');
const broker=json(base+'secret-broker-read-allowlist.json');
const functional=json(base+'secret-allowlist-functional-test.json');
const matrix=json('docs/evidence/a2-bootstrap-27-slot-audit-20261027.json');
const partNames=Object.keys(manifest.properties.parts.properties);
assert.deepEqual(partNames,['mysql','redis','object_storage','workspace','deployment_resources','secret_bundle']);
assert.equal(manifest.properties.parts.minProperties,1);
const acceptanceClauses=manifest.allOf.filter(c=>c.if?.properties?.task_purpose?.const==='acceptance');assert.equal(acceptanceClauses.length,1);
const acceptanceRequiredParts=acceptanceClauses[0].then.properties.parts.required;assert.deepEqual(acceptanceRequiredParts,partNames);
assert.equal(common.$defs.PartSummary.properties.required.const,true);
assert.equal(manifest.properties.precommit_eligibility.properties.required_parts_complete.const,true);
const inventories=state.properties.observed_inventory_hashes.required;
assert.deepEqual(inventories,['mysql','redis','object','workspace','runtime']);
assert.deepEqual(state.properties.check_state.enum,['clean','drift','unknown']);
assert.equal(broker.entries.length,0);assert.equal(functional.entries.length,1);
assert.notEqual(broker.schema_version,functional.schema_version);
const brokerCode='backend/internal/services/k8s/secret_broker_server.go';
assert.match(text(brokerCode),/func ParseSecretBrokerReadAllowlist\(raw string\) \[\]string/);
assert.match(text(brokerCode),/r == ',' \|\| r == '\\n' \|\| r == '\\r'/);
const handoff='docs/system-backup-a-bootstrap-resource-handoff-20261022.md';
const plan='docs/system-backup-restore-division-plan.md';
for(const p of [handoff,plan,'backend/internal/systembackupsecurity/config_bootstrap_rules.go','backend/internal/systembackupsecurity/registration_files.go'])read(p);
const linked=(file,pointer)=>({file,pointer});
const rows=[
  {kind:'parts',existing:[linked(base+'manifest-system-backup-v1.schema.json','/properties/parts'),linked(base+'artifact-common.schema.json','/$defs/PartSummary'),linked(base+'runner-data-interfaces.schema.json','/x-interfaces/1')],
   observed:{manifest_part_names:partNames,minimum_present_parts:1,acceptance_required_parts:acceptanceRequiredParts,present_part_required:true,precommit_required_parts_complete_claim:true,collector:runner['x-interfaces'].find(i=>i.name==='Collector')},
   missing_contract:'acceptance 必选六项已由现有 allOf 冻定。仍缺各 part 源身份/owner、collector 实现、depends_on 的原 registry 正文和真实完整性观察；其他任务 profile 的适用规则按其原合同处理，不改写已知的 acceptance 六项要求。'},
  {kind:'redis_sources',existing:[linked(base+'artifact-common.schema.json','/$defs/PartSummary/properties/checkpoint_type'),linked(base+'runner-data-interfaces.schema.json','/$defs/RequestContext')],
   observed:{redis_checkpoint_types:common.$defs.PartSummary.properties.checkpoint_type.enum.filter(x=>x.startsWith('redis_')),request_context_required:runner.$defs.RequestContext.required},
   missing_contract:'源 registry 中 topology/实例身份/连接引用/TTL 与一致性策略、collector 支持矩阵的正式字段与原观察来源。结果支持 RDB/scan-window 不证明具体部署能使用这些 profile。'},
  {kind:'failure_domains',existing:[linked(base+'manifest-system-backup-v1.schema.json','/properties/target')],
   observed:{target_required:manifest.properties.target.required,target_classes:manifest.properties.target.properties.target_class.enum,risk_codes:manifest.properties.target.properties.risks.items.enum},
   missing_contract:'稳定域 ID 的原身份定义、源/目标全关系、append-only 历史及 attestation 绑定/到期/撤销的 registry 正文。名称或 target 摘要不能证明物理隔离。'},
  {kind:'disaster_identity_mapping',existing:[linked(base+'manifest-system-backup-v1.schema.json','/properties/config_recovery'),linked(base+'secret-ref.schema.json','/$defs')],
   observed:{config_recovery_required:manifest.properties.config_recovery.required,recovery_parameter_freeze_blocker:manifest.properties.config_recovery.properties.redacted_parameters['x-freeze-blocker']},
   missing_contract:'原身份到灾难身份的受控版本化 typed 映射、安装/用途/权限/期限和覆盖/歧义规则。config_recovery 的 redacted_parameters 仍有明确 freeze blocker，不能当完整恢复映射 schema。'},
  {kind:'source_writers',existing:[linked(base+'source-writer-check-state.schema.json','/properties/observed_inventory_hashes'),linked(base+'source-writer-check-state.schema.json','/properties/check_state'),linked(base+'source-writer-check-state.schema.json','/properties/reason_code')],
   observed:{inventory_families:inventories,states:state.properties.check_state.enum,reason_codes:state.properties.reason_code.enum,required_state_fields:state.required},
   missing_contract:'完整实际 writer inventory 的 typed 正文和稳定身份、各 writer 的 lease/participant/拒绝/恢复策略及差集观察来源。五个 hash 与 clean 状态是结果，不能证明实际 writer 集合完整。'},
  {kind:'secret_allowlist',existing:[linked(base+'secret-broker-read-allowlist.json',''),linked(base+'secret-allowlist-functional-test.json',''),linked(brokerCode,'ParseSecretBrokerReadAllowlist')],
   observed:{broker_schema_version:broker.schema_version,broker_entries:broker.entries.length,functional_schema_version:functional.schema_version,functional_entries:functional.entries.length,functional_entry_keys:Object.keys(functional.entries[0]).sort(),broker_parser_format:'comma/newline namespace/name:key entries; no JSON registry version/UID conversion'},
   missing_contract:'当前安装准确 namespace/Secret UID/版本、用途/工作身份授权，以及原 JSON registry 至 broker 字符串的受审 typed 转换。两个不同 schema_version、空 staging 与单条 functional-test 不能相互替代。'}
];
for(const row of rows){const source=matrix.rows.find(r=>r.slot==='registry:'+row.kind);assert.ok(source);row.original_facts_required=source.original_facts_required;row.coordination_scope=source.coordination_scope;row.authority_verified=false;row.slots_cleared=0;}
read('docs/evidence/a2-bootstrap-registry-contract-coverage-20261027-r2.mjs');
const result={kind:'a2_bootstrap_registry_existing_contract_coverage.v1',status:'exact_existing_payload_coverage_and_original_registry_decisions_pending',schema_inventory_scope:'Direct *.schema.json files in contracts/system-backup/v12; exact literal mentions are inventory evidence, not proof about unscanned sources or semantic aliases.',schema_inventory:schemaInventory,exact_registry_kind_mentions:mentions,explicit_schema_freeze_blockers:freezeBlockers,freeze_annotation_field_definitions:freezeAnnotationDefinitions,freeze_annotations_are_not_independent_proof_of_unresolved_delivery:true,sql_registry_boundary:{kind:enums.kind,status:enums.status,categories:enums.category,note:'SQL object classification does not define the six bootstrap registry bodies.'},registry_rows:rows,missing_CLI_slots:27,slots_cleared:0,public_payload_fields_do_not_grant_resource_authority:true,new_business_registry_schema_created:false,new_provider_or_grant_created:false,deployment_facts_verified:false,Go_or_builds_executed:false,dependencies_installed:false,remote_contacted:false,actual_SQL:false,production_approved:false,goal_complete:false};
result.inputs=[...bytes.keys()].sort().map(pin);for(const p of result.inputs)assert.equal(sha(fs.readFileSync(p.path)),p.sha256,'Audit input changed: '+p.path);
const safe=s=>s.replaceAll('|','\\|').replaceAll('\n',' ');
let md='# A2：六类 bootstrap registry 的现有合同覆盖\n\n';
md+='已逐项读取现有 schema、原分工计划和 broker parser。下表把可引用的结果合同与尚需原 owner 提供的 registry 正文分开；CLI 仍缺 27 槽，本轮清槽 0。准确字段、JSON pointer、合同状态、全文摘要和 schema 目录盘点见[机器记录](evidence/a2-bootstrap-registry-contract-coverage-20261027-r2.json)。\n\n';
md+='| Registry | 现有可引用合同 | 仍需固定的正文/准入决定 |\n| --- | --- | --- |\n';
for(const row of rows)md+=`| ${row.kind}；${safe(row.coordination_scope)} | ${row.existing.map(r=>`[${r.file.split('/').at(-1)}](../${r.file}) ${r.pointer?`\`${r.pointer}\``:''}`).join('；')} | ${safe(row.missing_contract)} |\n`;
md+='\nmanifest 表层允许六种 part 名称、最少一项；其 allOf 明确规定 acceptance 必须同时包含全部六项，每个已出现 part 要求 required/completed。此要求已有合同依据；原 registry 仍须提供六项的实际源身份、owner、collector 和依赖映射。source-writer check state 固定五类 inventory hash 与 clean/drift/unknown，但仍要求真实 inventory 和完整差集。secret allowlist 两个 JSON 的 schema_version 不同，broker parser 又是字符串格式；目前没有把示例视为当前安装的 UID/版本/用途授权。\n\n';
md+='`manifest-system-backup-v1.schema.json#/properties/config_recovery/properties/redacted_parameters/x-freeze-blocker` 明确要求在 freeze 前替换为闭集恢复参数 schema。其余原文 freeze 注解与注解字段的 schema 定义分别列入机器记录；注解仍在文件中不单独证明对应实现/评审交付尚未完成，须对照现有准确回执。本次没有替原 owner 作合同决定。\n\n';
md+='复核：`node docs/evidence/a2-bootstrap-registry-contract-coverage-20261027-r2.mjs --check`。此命令只读受控合同和本地源码，不读取凭据或现场材料，不运行 Go 或访问 SQL。\n';
if(mode==='--write'){assert.equal(fs.existsSync(output),false);assert.equal(fs.existsSync(markdown),false);fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.writeFileSync(markdown,md,{flag:'wx'});}
else{assert.deepEqual(json(output),result);assert.equal(text(markdown),md);}
console.log(JSON.stringify({mode,schemas:schemas.length,registry_rows:6,explicit_freeze_annotations:freezeBlockers.length,freeze_annotation_definitions:freezeAnnotationDefinitions.length,slots_cleared:0,Go_executed:false}));
