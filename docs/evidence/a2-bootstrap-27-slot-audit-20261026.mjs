import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode, ...extra] = process.argv.slice(2);
assert.ok(['--write', '--check'].includes(mode) && extra.length === 0,
  'Usage: node docs/evidence/a2-bootstrap-27-slot-audit-20261026.mjs --write|--check');
const jsonPath = 'docs/evidence/a2-bootstrap-27-slot-audit-20261026.json';
const markdownPath = 'docs/system-backup-a2-bootstrap-27-slot-matrix-20261026.md';
const bytes = new Map();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => { if (!bytes.has(p)) bytes.set(p, fs.readFileSync(p)); return bytes.get(p); };
const text = p => read(p).toString('utf8');
const json = p => JSON.parse(text(p).replace(/^\uFEFF/, ''));
const pin = p => ({ path: p, size: read(p).length, sha256: sha(read(p)) });
const S = 'backend/internal/systembackupsecurity/';
const B = 'backend/internal/systembackupbootstrapsecurity/';
const E = 'backend/internal/systembackupevidence/';
const C = 'contracts/system-backup/v12/';

const helpers = {};
function helper(id, path, symbol, role) {
  const declaration = new RegExp(`^func (?:\\([^\\n]*\\) )?${symbol}\\(`, 'm');
  const match = declaration.exec(text(path));
  assert.ok(match, `Missing exact Go declaration: ${path} :: ${symbol}`);
  helpers[id] = { path, symbol, line: text(path).slice(0, match.index).split('\n').length, role };
}
helper('config', S+'config_bootstrap.go', 'DecodeBootstrapConfig', '结构、数值、闭集校验；不证明资源存在或授权');
helper('files', S+'registration_files.go', 'RegistryBytes', '原 registry 完整字节 SHA 和受控路径读取；不等于业务 schema/授权');
helper('current_files', S+'bootstrap_candidate_files.go', 'NewBootstrapCandidateFileAuthority', '原 grant/RBAC 与 registry 当前来源；强制保留独立原 authority');
helper('descriptor', B+'reference.go', 'DecodeSecurityReference', 'draft SecretRef 字节与闭集解析；无材料/locator/授权');
helper('pin_match', B+'reference.go', 'MatchesBootstrapPin', '十五种 purpose 的 draft 元数据对应；不是准入');
helper('capture_relation', B+'producer_candidate_binding.go', 'NewCaptureCandidateRelation', '原 capture ref/候选关系比较与副本；不是 authority/validator');
helper('nonce', 'backend/internal/systembackupnoncebootstrap/nonce.go', 'New', '真实 legacy BootstrapResourceValidator；只支持受控 exact-version external_secret 文件 profile');
helper('nonce_prepare', 'backend/internal/systembackupnoncebootstrap/candidate_adapter.go', 'PrepareCandidateAttempt', '锁前读取真实 nonce 材料；物理失败保留闭合状态供 L3 判别');
helper('nonce_lock', 'backend/internal/systembackupnoncebootstrap/candidate_adapter.go', 'LockReferences', '全局配置/固定 cutoff retained nonce 范围与原材料绑定');
helper('ca', 'backend/internal/systembackupcatrust/ca.go', 'New', 'artifact_ca/evidence_ca 真实 legacy validator；受控固定 IP+原 hostname TLS');
helper('ca_prepare', 'backend/internal/systembackupcatrust/candidate_adapter.go', 'PrepareCandidateAttempt', '每次 attempt 锁前真实 TLS 与原文件观察；不认证原部署映射');
helper('ca_check', 'backend/internal/systembackupcatrust/candidate_adapter.go', 'CheckCandidate', '原准备状态、共同 SQL 时间、晚文件检查；不再拨 TLS');
helper('s3', E+'s3.go', 'NewS3Store', 'evidence 的版本化 S3 运行客户端；构造不批准 capability 或 artifact/catalog 用途');
helper('s3_observer', S+'providerproof_s3.go', 'NewS3ExternalActionObserver', '已有 active-config 外部动作 presence 观察；不覆盖首次 bootstrap 准入');
helper('sts', E+'s3_sts.go', 'NewS3STSCredentials', '运行时受限 STS 凭据解析；仍要求独立 WebIdentity authority');
helper('system_sts', E+'system_sts.go', 'NewSystemExecutionSTSCredentials', '原 C1 execution/claim 绑定的 STS；不是初始化授权');
helper('transit', E+'transit.go', 'NewTransitKeys', '运行时 wrap/unwrap 客户端；不是资源准入');
helper('keyring', E+'transit_keyring.go', 'NewTransitKeyring', '消费已准入的历史 key mapping，不能倒过来认证 mapping');
helper('signer', S+'transit_signer.go', 'NewTransitSigner', '真实签名运行客户端与公钥校验；构造不等于 signer 准入');
helper('sign_history', S+'artifact_signing_history.go', 'NewArtifactSigningKeyHistory', '三类签名用途、公钥隔离与复制；输入仍需独立认证');
helper('sign_retention', S+'artifact_signing_history.go', 'ValidateArtifactSigningRetention', '消费完整已认证引用扫描的历史保留检查');
helper('acceptance', S+'artifact_acceptance_candidate.go', 'VerifyAcceptanceCandidate', 'draft acceptance 签名验证候选；不授予 signer 调用权');
helper('capability', S+'capability.go', 'ValidateCapabilityEvidence', 'capability 正文校验；不是 producer/资源认证');
helper('system_prepare', E+'system_execution.go', 'NewSystemExecutionPreparer', '已有独立执行授权后的正文/Wrap 准备；不产生 bootstrap authority');
helper('broker_parser', 'backend/internal/services/k8s/secret_broker_server.go', 'ParseSecretBrokerReadAllowlist', 'comma/newline 名称清单 parser；不消费 JSON registry 的版本/完整摘要/UID');

const rules = text(S+'config_bootstrap_rules.go');
function closedArray(name) {
  const m = new RegExp(`var ${name} = \\[\\]string\\{([^}]+)\\}`).exec(rules);
  assert.ok(m, `Closed source array missing: ${name}`);
  const values = [...m[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
  assert.equal(new Set(values).size, values.length);
  return values;
}
const registryKinds = closedArray('bootstrapRegistryKinds');
const referencePurposes = closedArray('bootstrapReferencePurposes');
assert.equal(registryKinds.length, 9); assert.equal(referencePurposes.length, 20);
const cliPath = 'backend/cmd/system-backup-bootstrap/main.go';
const cli = text(cliPath);
const start = cli.indexOf('func linkedOwnerAdapters()');
const end = cli.indexOf('\nfunc main()', start);
assert.ok(start >= 0 && end > start);
const linked = cli.slice(start, end);
assert.match(linked, /Registries:\s*map\[string\]security\.BootstrapResourceValidator\{/);
// Refuse silent interpretation of a later, different composition shape.
assert.ok(!/\b(?:References|CrossResources|Candidates)\s*:/.test(linked), 'CLI composition changed; review this audit');
const linkedKinds = [...linked.matchAll(/^\s*"([a-z_]+)"\s*:/gm)].map(m => m[1]);
assert.deepEqual(linkedKinds, ['rbac_bindings','provider_proof_issuers','strong_auth_issuers']);
const expectedMissing = [...registryKinds.filter(k => !linkedKinds.includes(k)).map(k => 'registry:'+k), ...referencePurposes.map(p => 'reference:'+p), 'cross_resources'];
assert.equal(expectedMissing.length, 27);

const refSource = text(B+'reference.go');
const mapMatch = /want := map\[string\]string\{([\s\S]+?)\n\s*\}\[pin\.Purpose\]/.exec(refSource);
assert.ok(mapMatch);
const correspondence = Object.fromEntries([...mapMatch[1].matchAll(/"([a-z_]+)":\s*"([a-z_]+)"/g)].map(m => [m[1],m[2]]));
assert.equal(Object.keys(correspondence).length, 15);
const unmapped = referencePurposes.filter(p => !Object.hasOwn(correspondence, p));
assert.deepEqual(unmapped, ['artifact_upload_issuer','evidence_store','evidence_kek','kek','status_relay']);
assert.equal(json(C+'secret-ref.schema.json')['x-contract-status'], 'draft');
assert.equal(json(C+'secret-broker-read-allowlist.json').entries.length, 0);
assert.equal(json(C+'secret-allowlist-functional-test.json').entries.length, 1);

const rows = [];
function add(slot, owner, layer, refs, contracts, mappingGap, localAction, originalFacts) {
  assert.ok(expectedMissing.includes(slot));
  assert.ok(!rows.some(r => r.slot === slot));
  for (const id of refs) assert.ok(helpers[id], id);
  for (const p of contracts) json(C+p);
  const purpose = slot.startsWith('reference:') ? slot.slice(10) : null;
  rows.push({ slot, coordination_scope:owner, implementation_layer:layer,
    existing_helpers:refs.map(id => ({id,...helpers[id]})),
    contract_sources:contracts.map(p => ({path:C+p,declared_status:json(C+p)['x-contract-status']??'no_freeze_status_asserted'})),
    secret_ref_correspondence:purpose ? {purpose:correspondence[purpose]??null,status:correspondence[purpose]?'draft_metadata_correspondence_only':'no_single_SecretRef_correspondence'} : null,
    contract_or_original_mapping_gap:mappingGap,
    actual_composition:{cli_slot_linked:false,production_original_authority_verified:false,synthetic_test_composition_is_not_deployment:true},
    next_local_action:localAction,original_facts_required:originalFacts,
    local_audit_clears_slot:false,actual_SQL_or_field_resource_accepted:false,
    current_candidate_non_implementer_and_real_mapping_review_complete:false });
}
const R='registry_bytes_and_config_only', H='adjacent_runtime_or_metadata_helper', V='concrete_bootstrap_validator_and_candidate_adapter';
add('registry:parts','A/B/C 分项；D 合同/组合',R,['config','files','current_files'],['manifest-system-backup-v1.schema.json','runner-data-interfaces.schema.json'],
  '已存在 manifest/runner 正文合同和 ref/字节校验；本轮未找到 parts registry 的独立业务 validator。SQL schema registry 不能替代 parts inventory。',
  '按现有 part/collector 合同建立闭集覆盖对照，列出缺失的 registry schema 与原 owner 必选矩阵；合同明确后实现真实 Prepare/Recheck。',
  ['当前安装完整必选 parts、各源不可变身份和 owner','实际 collector/runner 能力及支持矩阵']);
add('registry:redis_sources','C 资源；B 关联 workload',R,['config','files'],['runner-data-interfaces.schema.json'],
  'ConfigValues 只固定 kind/version/SHA，未建立 Redis topology、TTL/一致性策略至真实 collector 的准入映射。',
  '核对已有 runner Redis 输入字段与源 registry 的缺失决定，准备错源/错版本/不支持策略的拒绝要求。',
  ['原 Redis topology/实例身份与受控连接引用','允许的 TTL/一致性策略、真实权限与 collector 能力']);
add('registry:failure_domains','A/B/C 事实；D 合同',R,['config','files'],['manifest-system-backup-v1.schema.json'],
  'manifest 中风险/attestation 字段不是故障域 registry 授权；未找到完整真实域、历史及 source overlap validator。',
  '逐项对照 manifest 的故障域/风险/attestation 字段，明确 append-only 历史与同源排斥规则后补 validator。',
  ['稳定故障域 ID 与源/目标关系','当前管理员 attestation、原始期限及物理隔离来源']);
add('registry:disaster_identity_mapping','A 安全映射；B/C 恢复语义',R,['config','files','descriptor'],['secret-ref.schema.json'],
  'SecretRef 的 purpose/身份只是 draft metadata，未建立原身份至灾难身份的完整、无歧义、有权使用的 typed registry。',
  '整理恢复身份种类、覆盖关系及可撤销 authority 输入，沿原合同明确解析器；不从 Secret 名称推导。',
  ['原身份→灾难身份的版本化受控映射','安装、资源用途、灾难身份权限及有效期来源']);
add('registry:source_writers','B 主 writer 清单；A/C 提供各源 writer',R,['config','files'],['source-writer-check-state.schema.json'],
  '现有 check-state 是结果格式，不能证明 writer inventory 完整或实际 quiesce 覆盖。',
  '把 check-state 与真实 inventory/策略输入逐字段对齐，保留 unknown/diff 拒绝；等待各源原 writer 事实再补业务 validator。',
  ['MySQL/Redis/object/workspace/runtime 全量实际 writer','各 writer 不可变身份、quiesce/恢复策略与观察来源']);
add('registry:secret_allowlist','A；B/C 实际使用方',R,['broker_parser','descriptor','files'],['secret-ref.schema.json','secret-broker-read-allowlist.json','secret-allowlist-functional-test.json'],
  'broker parser 接受字符串名单，JSON staging registry entries=0，functional-test 仅一项；均不是当前安装 UID/版本/用途/工作身份授权。',
  '明确原 registry JSON 至 broker 输入的受审 typed 转换和 UID/版本规则；实现精确字节/业务字段检查需先固定合同。',
  ['当前安装 namespace/Secret 不可变身份及准确版本','用途、工作身份、最小权限与原 broker 解析来源']);

add('reference:artifact_write','C provider；A 凭据安全',H,['descriptor','pin_match','s3','capability'],['secret-ref.schema.json','dependency-provider-capability.schema.json'],
  'artifact_write→artifact_write 仅 metadata 对应；evidence S3 客户端不能认证 artifact scope、条件创建或 checksum 能力。',
  '复用封闭描述符检查，列明 original provider proof 与 C1 admission/原 grant 的可信关联及失败清理输入；接入 C 的真实写适配后独立评审。',
  ['原 artifact provider/root 身份、限定写 scope 与凭据版本','条件创建/checksum 的原授权观察及原始期限']);
add('reference:artifact_read','C；A 安全复审',H,['descriptor','pin_match','s3_observer'],['secret-ref.schema.json','artifact-common.schema.json'],
  '现有 S3 observer 限 active-config external-action presence，不是首次 bootstrap 的精确历史只读凭据准入。',
  '明确 original read credential 与对象版本/校验和的绑定，准备拒绝 latest、写删越权及错版本的适配测试。',
  ['准确对象/历史版本对应的只读身份','受控 provider/root 与不扩大写删权的授权来源']);
add('reference:artifact_delete','C；A 安全复审',H,['descriptor','pin_match','s3'],['secret-ref.schema.json','provider-finalizer-request.schema.json'],
  '运行时 Delete/Absent 及请求正文不证明 artifact 精确版本删除授权/缺失证明；业务 GC 门禁另属原 owner。',
  '将 exact-version/delete-marker/absence 语义与 C 原 provider verifier 对齐，保留 unknown 与受限 scope。',
  ['受限删除身份、对象/版本 scope','原 provider 缺失证明、版本和 delete-marker 语义']);
add('reference:artifact_upload_issuer','C issuer；A 身份/短凭据策略',H,['sts','system_sts'],['secret-ref.schema.json','a-capability-role-mapping.json'],
  '无单一 SecretRef purpose 对应；现有 STS 客户端与 C1 execution 绑定不能自行扩大为 artifact 首次 issuer 授权。',
  '对照现有 STS authority 字段，明确原 issuer、subject、audience、policy、scope 和生命周期的部署映射接口。',
  ['真实 issuer/STS/OIDC 机制与调用身份','原短凭据 scope、期限、撤销及 artifact 用途授权']);
for (const [purpose,owner] of [['artifact_ca','C 传输；A 信任复审'],['evidence_ca','A']]) {
  add('reference:'+purpose,owner,V,['descriptor','pin_match','ca','ca_prepare','ca_check'],['secret-ref.schema.json'],
    '真实 validator 和 candidate API 已实现；Binding 来源的原安装/provider/scope、原 CA 版本、固定 IP/hostname allowlist 仍须独立认证，CLI 未装配。',
    '完成新入口五包及材料 seed/Linux 准确验证，按原受控映射交叉评审后显式组合；不得以构造/TLS 成功批准 mapping。',
    ['原 descriptor 与 CA 精确字节/版本及可信解析路径','原安装/provider/scope 授权、准确 hostname+固定允许 IP','原始有效期与撤销/替换规则']);
}
add('reference:evidence_store','A',H,['s3','system_prepare'],['dependency-provider-capability.schema.json','capability-evidence.schema.json'],
  'store identity 无单一 SecretRef 对应；已有 S3/system 运行组件消费已准入输入，不建立独立 store/root 或故障域权限隔离。',
  '将 store identity、root、不可变 provider 及原 C1 evidence channel profile 关联到受控部署解析；列出尚缺 authority。',
  ['独立 typed store/root、安装/provider 身份','对象版本/完整性/保留语义与隔离来源']);
add('reference:evidence_write','A',H,['descriptor','pin_match','s3','system_sts','system_prepare'],['secret-ref.schema.json','dependency-provider-capability.schema.json'],
  'evidence 写入、STS、publication 组件已存在；首次 bootstrap 仍缺原 write ref 的 purpose/scope/权限/能力准入 adapter。',
  '复用原 writer 的条件创建/checksum/unknown 处理，补 Prepare/Recheck 所需原 authority 接口与真实权限负例，保持原 C1 channel 绑定。',
  ['原 evidence 写 scope/凭据准确版本','真实 conditional-create/checksum 权限和原观察期限']);
add('reference:evidence_read','A',H,['descriptor','pin_match','s3'],['secret-ref.schema.json','dependency-provider-capability.schema.json'],
  'Stat/Range 和下载链已有运行实现；不能从请求 URI 或读成功反推原 bootstrap 只读准入。',
  '复用精确 Ref/version/checksum 运行校验并补独立当前 read authority，核对原历史读取与撤销规则。',
  ['准确 evidence 对象/版本与只读身份','受控 locator、checksum、撤销及历史读取策略']);
add('reference:evidence_delete','A',H,['descriptor','pin_match','s3'],['secret-ref.schema.json','provider-finalizer-request.schema.json'],
  'Delete/Absent 与 GC 候选门禁存在；仍缺首次资源准入的原删除身份、版本权限和缺失证明 authority，不能以 GC helper 直接填槽。',
  '连接原受限删除凭据与精确版本/缺失 verifier，保持 GC owner/hold/retention/lease 与资源准入分工。',
  ['原受限删除身份及精确对象/版本权限','原缺失证明能力、unknown/retention 语义']);
add('reference:evidence_kek','A',H,['descriptor','transit','keyring','system_prepare'],['secret-ref.schema.json','a-capability-role-mapping.json'],
  '无单一 SecretRef 对应；NewTransitKeyring 明确消费 admission-validated 历史 mapping，不会认证其输入。',
  '明确 wrap/unwrap variant、原 authority 与全 retained evidence key refs 的事务/历史扫描接点；复用 keyring 的准确路由和无 fallback 规则。',
  ['安装绑定的原 evidence KEK identity/ref/version','wrap/unwrap 工作身份权限及所有 retained evidence 的历史映射']);
add('reference:kek','A；B/C 使用路径',H,['descriptor','transit','keyring'],['secret-ref.schema.json','a-capability-role-mapping.json'],
  'bootstrap KEK 不能直接对应一个 generate/unwrap/wrap descriptor；备份 variant/调用权限/历史数据引用需要独立规则。',
  '建立备份 DEK generate/wrap/unwrap variant 到原 typed 资源的需求对照，复用现有传输/路由，保留历史引用扫描要求。',
  ['原 backup KEK variant/provider/ref/version','生成/解封/包裹精确权限和历史保留事实']);
add('reference:capture_signing','A；B capture 输入',H,['descriptor','pin_match','capture_relation','signer','sign_history','sign_retention'],['secret-ref.schema.json','manifest-system-backup-v1.schema.json','a-artifact-signature-vectors.json'],
  'capture_signing→capture_certificate 比较及候选关系实现已存在，但关系 DATA、摘要和 signer 构造不是原 signer 认证/运行授权。',
  '从原 deployment authority 接收完整 purpose/ref/descriptor/候选关联，补真实 signer 能力/权限与当前/历史生命周期，再显式装配；不让 receipt 自证授权。',
  ['原 capture 专用 key/version/public key 及 domain/payload','原调用身份、三类用途隔离和完整历史验证/retention 引用']);
add('reference:acceptance_signing','A；D acceptance 组合',H,['descriptor','pin_match','signer','sign_history','sign_retention','acceptance'],['secret-ref.schema.json','acceptance-marker.schema.json','a-artifact-signature-vectors.json'],
  'acceptance_record 的 draft 签名验证候选和三用途 key history 已有；真实 acceptance signer 的授权/能力准入尚未装配。',
  '对齐现有 acceptance domain/JCS/历史 key 合同与原 signer 调用授权，保留业务 acceptance 判定独立，不复用 capture/catalog key。',
  ['原 acceptance 专用 signer/key/version','payload/domain、授权调用方与历史验签/撤销策略']);
add('reference:catalog_signing','A；C catalog 内容',H,['descriptor','pin_match','signer','sign_history','sign_retention'],['secret-ref.schema.json','artifact-index.schema.json','a-artifact-signature-vectors.json'],
  'catalog_record 对应和三用途隔离 helper 存在；catalog signer 的实际 record/domain 能力与原资源授权未组合。',
  '核对 C catalog record 合同到原专用 signer 的绑定，复用分离/历史保留检查并准备错用途/版本负例。',
  ['原 catalog 专用 signer/key/version','受审 record/domain、调用范围和完整历史验证来源']);
add('reference:catalog_read','C；A 身份安全',H,['descriptor','pin_match','s3'],['secret-ref.schema.json','artifact-index.schema.json'],
  'metadata exact_read 对应存在；evidence 的 S3 运行组件不证明 catalog 签名记录读取与发现边界。',
  '连接原 C catalog provider 的准确 record/version 只读接口及完整性/签名验证，禁止扩大 append 权限。',
  ['原 catalog provider/root 与只读 ref/version','准确 record/version、签名/完整性和发现授权边界']);
add('reference:catalog_append','C；A 身份安全',H,['descriptor','pin_match','s3'],['secret-ref.schema.json','artifact-index.schema.json'],
  'append_record 元数据对应不是 catalog 追加授权；evidence Put 不能证明 record key 不可覆盖及 catalog checksum 语义。',
  '对齐 C 原 append/conditional-create 冲突协议，复用传输能力但另做用途/权限及不可覆盖检查。',
  ['原 append 身份/版本和受审 root','不可覆盖 record key、条件创建/checksum 原能力来源']);
add('reference:catalog_snapshot','C；A 来源复审',H,['descriptor','pin_match'],['secret-ref.schema.json','artifact-index.schema.json'],
  'catalog_snapshot→catalog_discovery 的 metadata 对应不选择 snapshot_list/inventory_read 模式，也不证明覆盖完整。',
  '固定原 discovery 模式、manifest/version/checksum 与覆盖校验接口；拒绝模式混用、缺失、过期和冲突。',
  ['原 snapshot/inventory 模式及精确 manifest/version/checksum','原覆盖范围、来源权限与观察期限']);
add('reference:nonce_hmac','A',V,['descriptor','pin_match','nonce','nonce_prepare','nonce_lock'],['secret-ref.schema.json','strong-auth-nonce-ledger.schema.json'],
  'legacy 与 candidate 真实文件/32字节/wipe/global-retention 校验已实现；原受控 external_secret identity/purpose/安装映射和 CLI 组合仍未完成。Kubernetes UID/API profile 不由此实现。',
  '完成准确新材料包门禁和独立原映射复审，按原始 binding 显式接线；核对全局 retained key 版本/期限，不哈希 secret 充当身份。',
  ['原 exact-version external_secret descriptor/material 受控路径与 byte pins','安装/provider/scope/purpose 授权及原有效期','全部 control retention 内历史 key/version、ProtectedUntil 与撤销策略']);
add('reference:status_relay','B；A 工作身份安全',H,['descriptor','capability'],['runner-data-interfaces.schema.json','job-observation-cursor.schema.json','a-capability-role-mapping.json'],
  '无单一 SecretRef relay 对应；通用 descriptor/capability 正文不能认证 relay 身份或 Job/task/attempt。本轮未找到 bootstrap relay 资源 adapter。',
  '依据现有 runner/Job 合同列出 mTLS/工作身份/attempt/撤销的 typed 接点，等待原 relay 服务/Job 权威映射后接入。',
  ['真实 relay 服务身份/版本、mTLS/客户端身份','Job UID/generation/task/attempt 与终止/接管/撤销的原权威事实']);
add('cross_resources','A 安全；B/C 分项事实；D 组合','partial_cross_resource_checks_only',['config','descriptor','capture_relation','sign_history','sign_retention','current_files'],['secret-ref.schema.json','a-capability-role-mapping.json','producer-authority-transactions.json'],
  '已有局部配置约束、三用途公钥隔离、retention 和 capture 关系检查；完整同安装、故障域、灾难身份、Secret allowlist、凭据/签名用途与保留关系尚无真实总组合。',
  '复用各局部检查建立关系输入与共同 SQL 时钟/生命周期组合，逐条要求可认证的原事实；不以单项 bool AND 或新 grant 代替。',
  ['同一原 installation/config/grant 下全部可信观察','原故障域/灾难身份/allowlist/用途隔离和完整历史引用','原独立 authority 对 C1 admission、原资源期限及实际容量的绑定']);

assert.deepEqual(rows.map(r=>r.slot).sort(), [...expectedMissing].sort());
rows.sort((a,b)=>expectedMissing.indexOf(a.slot)-expectedMissing.indexOf(b.slot));
for (const id of ['registry:parts','registry:redis_sources','registry:failure_domains','registry:disaster_identity_mapping','registry:source_writers','registry:secret_allowlist']) {
  assert.equal(rows.find(r=>r.slot===id).implementation_layer,R);
}
const readyPath='docs/evidence/a2-bootstrap-original-files-material-adapters-ready-20261026.json';
const ready=json(readyPath);
for (const expected of ready.files) assert.deepEqual(pin(expected.path),expected,'A2 six-file handoff changed');
const evidencePaths=['docs/evidence/a2-original-files-materials-targeted-observed-20261026.json','docs/evidence/a2-bootstrap-a2e7-terminal-reviewed-20261026.json','docs/evidence/a-nonce-ca-r2-local-accepted-20261023.json'];
for(const p of evidencePaths) json(p);
assert.equal(json(evidencePaths[0]).test_pass_events,393);
assert.equal(json(evidencePaths[1]).whole_run_accepted,false);
const counts=Object.fromEntries([...new Set(rows.map(r=>r.implementation_layer))].map(k=>[k,rows.filter(r=>r.implementation_layer===k).length]));
assert.deepEqual(counts,{[R]:6,[H]:17,[V]:3,partial_cross_resource_checks_only:1});
read('docs/system-backup-a-bootstrap-resource-handoff-20261022.md');
read(S+'bootstrap_admission.go'); read(S+'config_bootstrap_rules.go');
read('docs/evidence/a2-bootstrap-27-slot-audit-20261026.mjs');
const result={kind:'a2_bootstrap_27_slot_current_source_audit.v1',date:'2026-10-26',status:'current_source_inventory_and_local_actions_not_admission_or_acceptance',
  derivation:{source_registry_kinds:registryKinds,source_reference_purposes:referencePurposes,total_owner_requirements:30,CLI_linked_registry_slots:linkedKinds,CLI_linked_reference_slots:[],CLI_cross_resources_linked:false,CLI_candidate_original_authority_linked:false,missing_slots:expectedMissing,missing_slot_count:27,slots_cleared_by_this_audit:0},
  implementation_layer_counts:counts,SecretRef_correspondence:{source:B+'reference.go',mapped_draft_metadata:correspondence,no_single_SecretRef_mapping:unmapped,authority_conferred:false},
  helper_native_scope:{historical_legacy_r2_receipt:evidencePaths[2],candidate_targeted_observation:evidencePaths[0],candidate_roots:12,candidate_test_pass_events:113,full_nine_package_run_failed:evidencePaths[1],snapshot_postcheck_completed_in_failed_run:false,current_entry_increment_native_accepted:false,helper_passes_do_not_clear_CLI_slots:true},
  rows,
  boundaries:['仅从已读当前源码/现有合同和旧27清单建立审计；未认证部署材料。','draft metadata 对应不批准 purpose 转换、资源权限或真实能力。','本轮没有运行 Go、读取凭据/材料或访问集群/SQL；没有构造 grant/approved DTO。','已有 helper 不应统称缺代码；CLI 缺槽也不能因 helper 存在而减少。','原授权来源、安装/provider/scope/用途映射和非实现者评审仍须逐项交付；此处不假定现场缺失。'],
  dependencies_installed:false,Go_or_builds_executed:false,build_products_created:false,remote_contacted:false,credentials_or_secret_material_read:false,actual_SQL:false,production_approved:false,goal_complete:false};
// Cache every source first, then detect changes during this read-only audit.
const inputs=[...bytes.keys()].sort().map(pin);
for(const p of inputs) assert.equal(sha(fs.readFileSync(p.path)),p.sha256,'Source changed during audit: '+p.path);
result.inputs=inputs;
const layerLabel={[R]:'配置/原字节组件；业务 validator 待补',[H]:'已有运行/元数据 helper；准入 adapter 未组合',[V]:'真实 validator + candidate API 已实现；未接 CLI',partial_cross_resource_checks_only:'局部关系检查已实现；完整组合待补'};
const safe=s=>s.replaceAll('|','\\|').replaceAll('\n',' ');
let md='# A2：剩余 27 个 bootstrap 槽位当前源码矩阵\n\n';
md+='当前闭集共 **30 个 owner 检查槽位**，CLI 只链接 RBAC 和两个 issuer registry；剩余仍为 **6 registry + 20 reference + 1 cross_resources = 27**。本审计没有清除任何槽位。nonce_hmac、artifact_ca、evidence_ca 已有真实 validator 与 candidate 适配；其他槽位也有不同程度的运行/元数据代码，不能统称缺代码或全归为外部依赖。\n\n';
md+='准确路径、符号行号、合同状态、原始事实和输入摘要见[机器清单](evidence/a2-bootstrap-27-slot-audit-20261026.json)。下表记录本轮已读源码，不能代替原部署授权、真实资源准入、交叉签收或现场验收。旧 27 项交接清单及 A1 进度未被覆盖。\n\n';
md+='| 槽位/协调范围 | 已有代码层次与准确符号 | 合同/映射缺口 | 可继续的本地动作 | 需要的原始事实 |\n| --- | --- | --- | --- | --- |\n';
for(const r of rows){const syms=r.existing_helpers.map(h=>`[${h.symbol}](../${h.path}#L${h.line})`).join('、');md+=`| ${safe(r.slot)}；${safe(r.coordination_scope)} | ${safe(layerLabel[r.implementation_layer])}；${syms} | ${safe(r.contract_or_original_mapping_gap)} | ${safe(r.next_local_action)} | ${safe(r.original_facts_required.join('；'))} |\n`;}
md+='\n`MatchesBootstrapPin` 只实现 15 种 draft metadata 对应；另 5 项 '+unmapped.map(p=>'`'+p+'`').join('、')+' 没有单一 SecretRef 对应，需各自的 typed 组合，不能增加一个 alias 就视为准入。SecretRef、manifest、acceptance/index 合同的 draft 状态按机器清单原文保留。\n\n';
md+='当前候选材料十二根/113 条通过来自五包定向观察；a2e7 完整九包失败，未完成来源后检或 Linux 阶段。历史 nonce/CA r2 接收只保留其准确范围。新入口、原材料组合、实际 SQL 与生产授权不继承这些局部结果。\n\n';
md+='核对命令：`node docs/evidence/a2-bootstrap-27-slot-audit-20261026.mjs --check`。它只读当前源码和两份审计产物，逐项核对闭集、CLI 接线、15/5 purpose 对应、27 行覆盖及摘要；当前输入变化会拒绝旧记录。没有新依赖、Go/构建、临时构建产物或远端操作。\n';
if(mode==='--write'){
  assert.equal(fs.existsSync(jsonPath),false);assert.equal(fs.existsSync(markdownPath),false);
  fs.writeFileSync(jsonPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(markdownPath,md,{flag:'wx'});
}else{
  assert.deepEqual(JSON.parse(fs.readFileSync(jsonPath,'utf8')),result);
  assert.equal(fs.readFileSync(markdownPath,'utf8'),md);
}
process.stdout.write(JSON.stringify({mode,report:jsonPath,matrix:markdownPath,missing:27,concrete_material_validators_unwired:3,other_runtime_or_metadata:17,registry_business_validators_pending:6,partial_cross:1,slots_cleared:0,Go_executed:false})+'\n');
