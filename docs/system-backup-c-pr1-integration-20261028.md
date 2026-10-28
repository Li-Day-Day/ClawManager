# PR #1 artifact/recovery 与当前 v12 接线核对（2026-10-28）

核对固定输入为 `refs/remotes/origin/pr-1` → `14768599f30846e9cfe22c121059ecf698e1b048`。本轮只读取 Git 对象及 ref/tree 元数据；没有 merge、checkout、测试、构建、安装依赖或执行 PR 的 SQL，没有改变已经验证的 read/API 源码。没有本轮测试产物需要清理。

结论：PR 确实交付了六域 recovery 的通用算法、SQL journal、owner 网关客户端/服务端和 schema 库；不能再说 C 类能力完全没有代码。不过它没有直接实现本轮 `CurrentTaskFacts`/`ManifestReader`，与当前 v12 的 manifest、签名、finalizer wire、task identity 和控制表并不兼容，真实原生存储 backend 仍由 owner 提供。不能把旧两域功能包、六域通用实现、原生 provider 实现和当前 A→B→C→D 接线混为同一条已完成链。

| PR 路径/符号 | 实际交付 | 可复用范围与边界 |
| --- | --- | --- |
| `backend/internal/systembackup/artifact/bundle.go` `Directory.Publish/Read` | 本地 `os.Root` 上 exclusive-create、密文认证、签名 bundle、checksum marker；`Version=users-instances-functional.v1alpha1`，purpose 只允许 functional_test，scope 固定 users/instances | 是用户/实例领域贡献读取和本地功能链。不是原 v12 六域 artifact、S3 provider、`_ACCEPTANCE`/recovery catalog。`Directory.Read(ctx,id)` 返回重建的 Bundle，不返回原 v12 manifest 字节。 |
| `artifact/catalog.go` `Directory.Scan` | 扫描本地 `.committed` 文件并逐项认证；DomainContract v1/v2 描述其它领域依赖 | 不等于当前 v12 强一致 provider snapshot/inventory catalog scan，更不能据此通过四矩阵灾备门禁。 |
| `recovery/contracts.go`、`schema.go`、`contracts.schema.json` | 六域、六 part、manifest/index/marker/acceptance/registration/tombstone 的 closed schema 库和 Go 交叉校验器 | 有实质领域实现；需要按下表对齐原机器合同，不能因相同 `system-backup.v1` 字符串认定 wire 兼容。 |
| `recovery/finalize.go` `Finalizer.Execute` | 已持久化请求字节、原 deadline/generation、发送前 Journal.Sent、未知写结果只 Observe/Open、精确 bytes 冲突判断 | 可作为受审 adapter/算法来源。`AppendProvider`、Journal、原生证明仍是必需输入，不直接满足现 `provider-finalizer-request.schema.json`。 |
| `recovery/publish.go` `Publisher.Publish` | 六域 precommit/authenticate、index→签名manifest→marker→cleanup→acceptance→条件registration 顺序；缺 proof/part/owner 拒绝 | 不是单纯模型空壳，但实际 collector、PublicationProofs、Authenticator、provider/authority 都需同版本注入；尚非当前生产装配。 |
| `recovery/import.go` `Importer.Import` / `Catalog.CheckNotDeleted` | 固定版本及内容hash、三目的签名、core关系、全部密文认证和前后 tombstone 检查 | 可复用验证结构；当前 v12 wire/keys/bootstrap/ref及 current health 必须先对齐，Import 历史结果不等于永久恢复或当前详情授权。 |
| `recovery/scan.go` `Scanner.Step`、`control/catalog_scans.go` `CatalogScans` | 固定snapshot分页、页链/count/hash、同事务page/record/cursor CAS及EOF重算 | 领域算法已交付；对应独立SQL控制库结构，与原计划三张 canonical 表不等价。`CatalogScans` 自开事务，不能直接挂到当前详情原 read transaction 后拼接结果。 |
| `recovery/gateway.go` `NewGateway`、`gateway_server.go` `NewGatewayServer` | TLS1.3 mTLS `/recovery/v1` 自定义 owner 协议、随机nonce/完整request hash/短期回执、有界open和单次发送journal | 是真实HTTP/TLS通用实现，不是S3 SDK/native provider实现。`NativeGatewayBackend` 仍要求owner实现原生expiry/key/hash/length、version/absence/snapshot。 |
| `host/provider_gateway.go` `RunProviderGateway`、`cmd/backup-provider-gateway/main.go` | owner backend factory显式注册；默认命令传nil factories，缺factory在读凭据/连接/监听前拒绝 | 尚不能凭仓库默认命令启动可写生产provider。`-check-config`只检查结构，不代表真实能力或部署成功。 |

当前 v12 与 PR 精确不兼容项：

| 项目 | 当前 v12 | PR `14768599` | 接线影响 |
| --- | --- | --- | --- |
| manifest identity | 顶层 `origin_installation_id/backup_public_id/attempt_no/orchestrator/deployment_profile` | `identity` 嵌套对象保存这五项 | 当前 `ReadBackupManifest` 必须核对原字节顶层identity；PR字节不能通过，不得解包/改写后仍保留旧checksum。 |
| manifest其它必填 | `git_commit/generated_at/runner_type/task_purpose/capture_certificate_hash/kek_recovery/consistency/precommit_eligibility/control_evidence/config_recovery/business_summaries` | `git_version/created_at_ms/purpose/config_snapshot/kek_recoverable/consistency_class/business_domains/control_plane`，并无上述一一同形对象 | 都是closed objects，不能仅用字段别名转换宣布兼容；时间类型也从RFC3339变成整数毫秒，consistency PR只接strong/bounded，当前含weak。 |
| manifest对象外壳 | `manifest-system-backup-v1.schema.json` 根是该manifest本体 | `Publisher`用`Seal`输出`{payload,signature}`，payload内才是Manifest，且payload `schema_version`仍叫`system-backup.v1` | 同名schema存在breaking wire冲突；必须A/B/C/D明确同版本合同，不做自动探测或隐式兼容。 |
| signature | `artifact-common.schema.json`：algorithm=`EdDSA`，key_purpose、domain_separator、base64url protected_header；JWS输入 `protected_header+'.'+base64url(JCS(payload))`；purpose闭集capture_certificate/acceptance_record/catalog_record | algorithm=`Ed25519`；`{protected:{algorithm,key_id,key_version,purpose,schema_version},value:[]byte}`；标准base64字节编码；签名输入是canonical数组 `["clawmanager/system-backup/v1/"+purpose,header,payload]`；另有manifest purpose | 原A signer/verifier不能直接读取；不是只改算法字符串。三个实际key分离的思路可复用，wire/domain/purpose须正式决定。 |
| `_COMMITTED` | schema=`system-backup-committed.v1`，backup ID顶层 | schema=`system-backup.v1`，identity嵌套 | 固定版本reader必须拒绝，不能换字段后保留旧不可变object/version/hash。 |
| `_ACCEPTANCE` | payload schema=`system-backup-acceptance.v1`，顶层backup/attempt、`staging_cleanup_evidence_id/hash`、`decision_at`、整数config_version及signing_key | schema=`system-backup.v1`，identity、`staging_cleanup_evidence` Reference、`decision_time_ms`、`config_snapshot` Reference | 必须对齐完整payload和签名输入；双方local acceptance false不注册的行为方向一致，不代表对象兼容。 |
| provider finalizer request | `logical_action_hash/action_type/canonical_payload_base64/payload_sha256/content_type/dispatch_deadline/conditional_create/credential_envelope`；limit262144 | `action_id/key/sha256/content_length/deadline_at_ms/dispatch_generation/condition="create-if-absent"/canonical_bytes/provider_identity`；MaxDocument4MiB | 语义关联存在，但缺原logical action与credential envelope shape。必须保留原generation/deadline/短期credential规则做正式adapter，不能把普通Gateway Request直接发给原provider。 |
| capability闭集 | v12 catalog codes见`dependency-provider-capability.schema.json`/registry及主计划 | `RequireCapabilities`额外必需 `content_length_bound_request/native_deadline_enforced`，网关role固定catalog | 原生长度/到期证明有价值，但这两项不能未经同版本合同升级注入当前闭集；也不能把catalog role证明当作artifact role能力。 |
| observation期限边界 | 本轮current facts要求 `ObservedAt<=SQLNow<ValidUntil`，原期限不延长 | `Observation.decisive`使用整数毫秒、`ValidUntil>=now`（等值仍可decisive）；capability expiry则等值拒绝 | adapter必须统一时钟和准确过期边界，不通过重新采样、四舍五入或续期放宽现门禁。 |
| task身份/时间/幂等 | 当前`sbk_/spf_`UUID、安装/actor/endpoint/key scope、DATETIME(6)、config snapshot+next_reconcile_at；SQLApplication持有原授权事务 | `control.NewID`生成`sb-`+32hex；独立`system_backup_tasks`；scope只有actor/key；毫秒时间+profile_revision；自己的Serializable事务 | 同构状态名称可参考，不能用PR Task或其DTO替代当前TaskHeader。没有当前A AuthorizeAction/RecheckAction/ReadScope装配桥。 |

请求合同核对：PR `handlers/system_backup_handler.go` 使用 `DisallowUnknownFields`、4KiB正文和尾随EOF检查，调用 `control.Request.Validate`。字段为 `kind/profile/artifact/record_sha256/purpose/acceptance_policy`；backup/catalog_scan禁止artifact，drill/preflight必需artifact，acceptance仅backup且必须匹配policy。`{}` 在该代码中也会被拒绝。因此它提供了具体的另一套创建请求语义，而不是允许D把`{}`当生产请求。

但该handler没有调用拒绝重复key的`recovery.Canonical`；普通Go decoder仍会折叠重复字段。Hash是对Go struct的`json.Marshal`做SHA256，不是当前待冻结的默认值/null/JCS规范。可选string字段的missing与显式null都落空串，acceptance pointer的missing与null都落nil；这还没有成为当前backup/preflight的closed JSON Schema和默认/null决定。`recovery/contracts.schema.json`里的`Request`是provider Request，不是`control.Request`。PR中的原v12 OpenAPI两条create仍缺requestBody，manifest仍将四份合同列为missing。PR SQL原actor/key重放分支明确允许profile有效期后返回原task，未给当前compact-tombstone/idempotency-expired规则。不能把这套策略暗中移植为当前生产请求。

三张计划表也没有据此全部补齐：PR `control/schema.sql` 明确是独立CONTROL DB手工安装，禁止作为application migration套用。其`system_backup_catalog_records`为 `(scan_id,key_hash,object_key,record_json)`，无原计划的`scr_`public ID、provider/ref/version、validation/deletion/failure、first/last scan、row-version等规范化身份；scan为`system_backup_catalog_scans(scan_id,task_id,state_json)`，不是`system_backup_catalog_scan_states`；imports也未以原计划表形态交付。当前canonical migrations/registry门禁仍须D负责，C补领域原始合同。

最小接收顺序应为：

1. B/C先声明本批哪些是现v12贡献、哪些是独立alpha功能/新breaking合同；A复核签名purpose/domain、材料和原生provider权限，D固定同版本schema/DTO parity与迁移归属。
2. 先复用纯数据贡献/验证算法；当前production装配必须仍实现 `CurrentTaskFacts.Backup/Preflight` 和 `ManifestReader.Read`，提供原安装/task/row-version、SQL时限、immutable locator/version/hash及完整C schema验证，所有SQL使用原CurrentFactsSQL能力，不另开详情事务。
3. C交付真实 `NativeGatewayBackend` 或直接厂商adapter及原生能力证据、固定配置/输入；通用网关代码不能替代真实S3材料和现场证明。共享`six-domain module` owner仍必须提供真实collector/verifier/cleanup/PublicationProofs/Authenticator。
4. 未达以上条件，保持当前TaskWriter/details/manifest生产装配not_ready；不得导入PR后把独立functional_test或本地目录包成功当作首条系统备份链通过。

本报告是固定Git对象的源码核对，无PR运行结论，不更改父D当前冻结验证来源或原阶段门禁。
