import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode)&&extra.length===0,'Use --write or --check');
const output='docs/evidence/a2-bootstrap-mapping-decisions-20261026.json';
const markdown='docs/system-backup-a2-bootstrap-mapping-decisions-20261026.md';
const cache=new Map(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>{if(!cache.has(p))cache.set(p,fs.readFileSync(p));return cache.get(p);};
const text=p=>read(p).toString('utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(text(p));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const C='contracts/system-backup/v12/',B='backend/internal/systembackupbootstrapsecurity/',S='backend/internal/systembackupsecurity/',E='backend/internal/systembackupevidence/';
const schema=json(C+'secret-ref.schema.json');assert.equal(schema['x-contract-status'],'draft');
const variants=schema.oneOf.map(n=>n.$ref.split('/').at(-1)).map(name=>{
 const body=schema.$defs[name].allOf.find(n=>n.properties?.purpose?.enum&&n.properties?.ref_kind);
 assert.ok(body,name);
 return{definition:name,ref_kinds:body.properties.ref_kind.enum??[body.properties.ref_kind.const],purposes:body.properties.purpose.enum,declared_purpose_policy:body['x-purpose-policy']??null};
});
assert.equal(variants.length,6);
const schemaPurposes=[...new Set(variants.flatMap(v=>v.purposes))].sort();assert.equal(schemaPurposes.length,23);
const literal=/var bootstrapReferencePurposes = \[\]string\{([^}]+)\}/.exec(text(S+'config_bootstrap_rules.go'));assert.ok(literal);
const purposes=[...literal[1].matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);assert.equal(purposes.length,20);
const mappingLiteral=/want := map\[string\]string\{([\s\S]+?)\n\s*\}\[pin\.Purpose\]/.exec(text(B+'reference.go'));assert.ok(mappingLiteral);
const mapping=Object.fromEntries([...mappingLiteral[1].matchAll(/"([a-z_]+)":\s*"([a-z_]+)"/g)].map(m=>[m[1],m[2]]));
assert.equal(Object.keys(mapping).length,15);for(const target of Object.values(mapping))assert.ok(schemaPurposes.includes(target));
const noSingle=purposes.filter(p=>!Object.hasOwn(mapping,p));
assert.deepEqual(noSingle,['artifact_upload_issuer','evidence_store','evidence_kek','kek','status_relay']);
const extraPurposes=schemaPurposes.filter(p=>!Object.values(mapping).includes(p));
assert.deepEqual(extraPurposes,['catalog_ca','data_key_generation','evidence_read_write','kek_unwrap','kek_wrap','provider_proof_issuer','secret_bundle_part','strong_auth_issuer']);
for(const name of ['ExternalSecretRef','KubernetesSecretRef'])assert.match(variants.find(v=>v.definition===name).declared_purpose_policy,/AES-256-KW and functional-test only/);
assert.ok(text(S+'transit_signer.go').includes('strconv.ParseUint(version, 10, 32)'));
assert.ok(text('backend/internal/systembackupcatrust/ca.go').includes('binding.Purpose != "artifact_ca" && binding.Purpose != "evidence_ca"'));
assert.ok(text('backend/internal/systembackupnoncebootstrap/nonce.go').includes('seen[k.Version]'));
const decisions=[];
function add(id,scope,owner,status,sources,implemented,missing,local,original){
 for(const p of sources)read(p);
 decisions.push({id,scope,coordination_owner:owner,status,sources,existing_local_semantics:implemented,precise_missing_decision:missing,next_local_action:local,original_source_or_fact_needed:original,authority_source_verified:false,slots_cleared:0});
}
add('M1','全部 15 种 metadata 对应与其余资源','A/D；资源原 owner','original_authority_origin_unverified',
 [B+'reference.go',B+'producer_candidate_binding.go',S+'config_bootstrap_candidates.go',S+'bootstrap_candidate_files.go','docs/system-backup-a-capability-producer-admission-request-20260929.md'],
 'DecodeSecurityReference 校验完整字节/闭集；MatchesBootstrapPin 仅比 purpose/identity/version；CaptureCandidateRelation 明确是关系 DATA，原 authority 必须独立认证部署、用途、provider/scope、候选及当前状态。',
 '必须指出现有哪一条独立受控来源认证完整 ref→provider/scope/purpose→C1 admission/target/profile 关系，以及当前撤销/期限如何复核。摘要、构造成功和 receipt 不得自证这一来源。',
 '给原 authority 的已有接口逐方法标出实际来源和未实现接点；可复用固定 grant/RBAC/文件及关系检查，不增加新 grant/approved DTO。',
 '原部署/provisioning 的受控映射路径、准确版本、独立认证方式和当前授权/撤销来源。');
add('M2','kek / evidence_kek 的操作组合与变体','A；B/C 数据使用路径，D 事务组合','composite_contract_choice_required',
 [C+'secret-ref.schema.json',C+'a-capability-role-mapping.json',E+'transit.go',E+'transit_keyring.go'],
 'SecretRef 分别描述 data_key_generation、kek_unwrap、kek_wrap；Secret KEK wrap/unwrap 的原 purpose-policy 明确为 AES-256-KW、functional-test only。TransitKeyring 消费已准入的完整历史 mapping，不认证它。',
 '分别选择 backup/evidence 的原生产 provider/variant、所需 generate/wrap/unwrap 操作集合、调用身份和全部 retained 引用覆盖；不能将单个 SecretRef 别名成整个 KEK，也不能将 functional-test profile 自动升为生产。',
 '把现有操作/历史路由字段与两个用途逐项对照，保留错误变体和缺历史拒绝；生产选择须沿原 owner 合同给出。',
 '原 key provider/ref/version、操作权限、工作身份、完整保留引用及原变体政策。');
add('M3','artifact_upload_issuer','C issuer；A 身份，D pre-config admission','issuer_authorization_contract_required',
 [C+'secret-ref.schema.json',E+'s3_sts.go',E+'system_sts.go',E+'system_execution.go'],
 '没有单一 SecretRef 对应；现有 S3 STS 依赖逐次授权，System STS 已绑定原 Execution/claim。普通 task/download/gc/recovery 身份不能自动成为首次 bootstrap issuer。',
 '明确该用途采用的原 issuer/STS/OIDC 机制、issuer/subject/audience/policy、原 scope/期限/撤销，以及初始化前由哪条独立来源或原 C1 执行授权承接。',
 '复用现有客户端和有界生命周期，对齐原授权字段；不新增一个 alias、AccessKind 或全局 grant 来绕过缺口。',
 '原 issuer 和工作身份策略、受限短凭据 scope/有效期及初始化前的独立授权来源。');
add('M4','evidence_store','A；D evidence channel','store_identity_composition_required',
 [C+'dependency-provider-capability.schema.json',E+'s3.go',E+'system_execution.go',E+'system_sts.go'],
 'S3Config 已有 installation、Identity、Version、endpoint/bucket/root/CA；store identity 不是某一个 credential，SecretRef 没有 store-kind。运行组件仍消费已准入映射。',
 '指出原 typed store/root 的来源，并把对象不可变版本/完整性/保留、故障域和权限隔离与原 evidence channel profile 完整关联；不能从连接成功或 store hash 推导授权。',
 '对照现有 S3Config/Ref/channel 字段列出 mandatory resolver 输入和拒绝条件，复用已有读写/缺失协议。',
 '原 store/root/provider 不可变身份、受控解析来源及隔离/保留/能力的原观察。');
add('M5','status_relay','B 服务；D 当前 Job cursor；A 工作身份','relay_contract_mapping_required',
 [C+'secret-ref.schema.json',C+'runner-data-interfaces.schema.json',C+'job-observation-cursor.schema.json',C+'a-capability-role-mapping.json'],
 'SecretRef 无 status_relay purpose/kind；Job cursor 已有 job_uid/generation、relay_identity_ref/version/bound_at/expires_at、sequence/body hash。六类 capability role 中没有可自动替代 relay 的新角色。',
 '明确真实 relay 服务/客户端 mTLS 身份与原 Job UID/generation/task/attempt、绑定期限/序列/撤销的权威关联；不能以 relay 自报或普通 Secret 名称代替。',
 '把 runner/Job cursor 的现有字段对照到 B 原服务合同，保留重放、错 attempt 和撤销拒绝；不扩 provider enum 或硬塞 SecretRef alias。',
 'B 原 relay 身份/版本与 TLS/工作身份来源，D 当前 Job/attempt/cursor 权威事实。');
add('M6','catalog_snapshot → catalog_discovery','C；A 来源复审','discovery_mode_and_coverage_decision_required',
 [C+'secret-ref.schema.json',C+'artifact-index.schema.json',B+'reference.go',E+'s3.go'],
 '已有 draft metadata 对应，credential_capability 可为 snapshot_list 或 inventory_read；evidence S3 Store 的 Stat/Range/Put/Delete/Absent 不提供 catalog discovery 完整性。',
 '在原 ref/version/provider profile 下明确选择哪一种发现模式、精确 manifest/version/checksum、覆盖和缺失证明规则；不能从 supported 列表自动挑模式或在失败时换模式。',
 '按两种原模式列出所需输入及拒绝分支，接 C 原 discovery adapter；不混用 inventory 与 snapshot 结果。',
 '原 discovery 模式及授权，精确 manifest/version/checksum、覆盖边界和原观察期限。');
add('M7','catalog transport 的 CA 来源','C 传输；A 信任复审','nested_transport_binding_required',
 [C+'secret-ref.schema.json',S+'config_bootstrap_rules.go','backend/internal/systembackupcatrust/ca.go'],
 'Schema CA purpose 有 catalog_ca，但 bootstrap 20 refs 没有 catalog_ca；现有具体 CA validator 只接受 artifact_ca/evidence_ca。这不是自动增加第 21 个槽位的授权。',
 '明确 catalog adapter 在现有合同下从哪里取得并验证原 CA bundle、hostname/允许目标及其 provider/scope/版本绑定；不得擅自将 catalog_ca 折成 artifact_ca。',
 '核对 C 原 catalog 连接 profile 的 trust 字段和 A 可复用的校验接点；需要合同决定时写明原来源。',
 '原 catalog endpoint/CA/目标 allowlist、provider/scope 映射和有效期来源。');
add('M8','capture / acceptance / catalog signing','A signer；B capture/C catalog payload，D 组合','signer_identity_version_and_probe_contract_required',
 [C+'secret-ref.schema.json',C+'a-capability-role-mapping.json',S+'transit_signer.go',S+'artifact_signing_history.go',B+'producer_candidate_binding.go'],
 '三 purpose 映射、EdDSA/domain、三用途 key history/retention 和 capture 关系已实现。SecretRef identity_version 可为非数字 token；TransitSigner 的 Vault version 必须是规范正整数。Capability 正文不是签名授权或实际 challenge 认证。',
 '由原来源明确 ref identity/version→provider key ID/numeric version/public key、purpose/domain/payload、调用身份/权限，以及实际探针输入/验证与原 C1 run/profile 的关系；不能剥 version 前缀、使用 latest 或仅凭 healthy 认证。',
 '复用 signer、原历史隔离和关系比较，准备准确 typed 关联及独立原 authority 接点；未有原探针合同就不自造签名授权/challenge grant。',
 '原 signer/key mapping、ACL、专用用途/签名域、实际探针合同及完整历史引用/撤销政策。');
add('M9','nonce_hmac 的 profile 与全局版本归属','A','supported_local_profile_implemented_original_facts_unverified',
 [C+'secret-ref.schema.json','backend/internal/systembackupnoncebootstrap/nonce.go','backend/internal/systembackupnoncebootstrap/candidate_adapter.go',C+'strong-auth-nonce-ledger.schema.json'],
 '具体 validator 支持受控 exact-version external_secret 文件，真实 32 字节/wipe/原期限；candidate 锁全局配置及固定 cutoff retained 行。版本映射按原 ledger 的 version 定位，冲突 identity 会拒绝。',
 '原部署必须明确采用已支持的文件 profile，并给出所有受保留版本的唯一/一致 identity 归属与保护期；Kubernetes Secret UID/API profile 不能由文件或哈希外观冒充。',
 '保留已实现的全局歧义/撤销/期限拒绝并显式组合；若原部署使用其他 profile，需要它的真实 owner adapter。',
 '原 descriptor/material 路径和版本映射、provider/scope 授权、全局 retained key 版本及保护/撤销事实。');
add('M10','evidence_read_write 与三个精确 evidence credential 槽','A','local_decoder_contract_drift_fix_staged',
 [C+'secret-ref.schema.json',B+'reference.go','docs/evidence/a2-reference-capability-parity-candidate-20261026.json'],
 '该 Schema purpose 只允许 exact_write/exact_read/conditional_create/range_read，不包含 delete/append/discovery；也不在 15 个 bootstrap metadata 对应中。已发现 Go 多收四项，精确窄修和 schema 驱动回归已暂存。',
 '先使 parser 符合现有合同；再沿原 evidence_write/read/delete 分离策略给出真实权限，不得以 combined descriptor 填三槽或从 metadata decoder 推导授权。',
 '当前冻结运行结束后，在协调的 Go 窗口做 old 四反例、fixed 八项/完整 helper 与实际 import caller 验证、独立接收和产物清理。',
 '三个精确凭据用途的原身份/scope/权限及撤销来源；当前本地 parser 修复本身不依赖现场秘密。');
assert.equal(decisions.length,10);
const extraClassification={
 catalog_ca:'需原 catalog transport 绑定决定；不新增或别名 bootstrap 槽',
 data_key_generation:'KEK 多操作组合的一部分，不直接等于 kek/evidence_kek',
 evidence_read_write:'组合读写 metadata，不替代三个精确证据凭据槽',
 kek_unwrap:'KEK 变体/历史解封组合的一部分',
 kek_wrap:'原 Secret KEK 声明为 AES-256-KW functional-test only',
 provider_proof_issuer:'已有 issuer registry 途径，不自动变成缺失 reference 的授权',
 secret_bundle_part:'源 part/allowlist/工作身份合同，不是独立 bootstrap reference',
 strong_auth_issuer:'已有 issuer registry 途径；公钥配置检查不证明本人 MFA',
};
for(const purpose of extraPurposes)assert.ok(extraClassification[purpose]);
const matrix=json('docs/evidence/a2-bootstrap-27-slot-audit-20261026.json');assert.equal(matrix.derivation.missing_slot_count,27);
read('docs/evidence/a2-bootstrap-mapping-decisions-20261026.mjs');
const result={kind:'a2_bootstrap_mapping_contract_decision_audit.v1',status:'existing_contract_coverage_and_precise_missing_decisions_not_new_policy_or_authority',
 schema_status:'draft_unchanged',schema_variants:variants,schema_purposes:schemaPurposes,bootstrap_purposes:purposes,
 metadata_correspondences:mapping,metadata_correspondence_count:15,no_single_SecretRef_mapping:noSingle,
 schema_purposes_without_direct_bootstrap_correspondence:extraPurposes.map(p=>({purpose:p,classification:extraClassification[p]})),
 current_CLI_missing_slots:27,slots_cleared:0,decisions,
 boundary:'只核对原合同与实现/原来源缺失决定；不批准 alias、grant、变体、生产权限或真实映射，也不把现场尚未核实说成不存在。',
 Go_tests_or_builds_executed:false,dependencies_installed:false,credentials_or_material_read:false,remote_contacted:false,actual_SQL:false,production_approved:false,goal_complete:false};
result.inputs=[...cache.keys()].sort().map(pin);for(const p of result.inputs)assert.equal(sha(fs.readFileSync(p.path)),p.sha256,'Source changed during audit: '+p.path);
let md='# A2：bootstrap typed mapping 决定核对\n\n';
md+='本轮核对现有 **20 个 bootstrap reference、23 种 SecretRef purpose、15 种已实现 metadata 对应**。其中 5 个 bootstrap 用途没有单一 SecretRef 对应；Schema 另外 8 种 purpose 也不能自动变成新槽位或别名。CLI 当前缺项仍为 27，本审计清槽 0。\n\n';
md+='具体枚举、原来源/准确摘要及每项所需原始事实见[机器清单](evidence/a2-bootstrap-mapping-decisions-20261026.json)。这是缺失决定核对，不是新授权或合同批准。\n\n';
md+='| 决定 | 范围 / 协调 owner | 已有实现或原合同事实 | 还缺的明确决定 | 可继续的本地动作 |\n| --- | --- | --- | --- | --- |\n';
const safe=s=>s.replaceAll('|','\\|').replaceAll('\n',' ');
for(const d of decisions)md+=`| ${d.id} | ${safe(d.scope)}；${safe(d.coordination_owner)} | ${safe(d.existing_local_semantics)} | ${safe(d.precise_missing_decision)} | ${safe(d.next_local_action)} |\n`;
md+='\n发现的实际本地代码偏差只有 provider capability 表中的 `evidence_read_write` 多收四项；[窄修候选](evidence/a2-reference-capability-parity-candidate-20261026.json)没有改 Schema、原 vectors、15 个 metadata 对应或授权。其余 9 个 provider-purpose 的能力集合与 Schema 相同。候选仍待原冻结运行结束后的协调验证窗口、真实 Go 反例/正例、caller 闭包及独立评审。\n\n';
md+='M2–M8 列出的原 owner 决定须提供现有受控来源或准确合同决定；不会用新 grant、approved DTO、provider enum 或 alias 替代。M9 已有受限 profile 的实现，须核对原实际部署事实；M10 的 parser 修复可在本地继续。所有 Schema draft 状态、未核实现场状态和未验边界均保留。\n\n';
md+='只读复核：`node docs/evidence/a2-bootstrap-mapping-decisions-20261026.mjs --check`。此命令核对当前已声明输入和两份产物，不访问材料/集群/SQL，不运行 Go 或安装依赖。\n';
if(mode==='--write'){assert.equal(fs.existsSync(output),false);assert.equal(fs.existsSync(markdown),false);fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.writeFileSync(markdown,md,{flag:'wx'});}
else{assert.deepEqual(json(output),result);assert.equal(text(markdown),md);}
process.stdout.write(JSON.stringify({mode,output,markdown,bootstrap_purposes:20,schema_purposes:23,mapped:15,unmapped_bootstrap:5,extra_schema:8,decisions:10,slots_cleared:0,Go_executed:false})+'\n');
