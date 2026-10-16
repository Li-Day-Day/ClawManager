# A 对 D canonical 配置 mutation 候选的增量评审

日期：2026-10-15。依据 [A 写入合同](evidence/a-config-canonical-write-contract-20261014.json)、[原签收](evidence/a-config-canonical-write-signoff-20261014.json)、D decoder 回执和当前 update/rollback 事务候选。本页是 Codex A 角色的本地实现评审，不是人工签名、安装运行写授权或部署批准。合同 `a-config-canonical-write-security.v1` 的准确字节仍为 SHA-256 `58b48404e34fea5d6c754ecf91297d70084417696dfd6397d2cee642858c0f1d`，公共 v12 合同保持 draft。

后续此前未包含的 RBAC 候选已由[独立增量评审](system-backup-a-config-rbac-review-20261015.md)在新固定副本中限定接收；下方 797 项历史门禁仍保持原范围，不扩写成包含 RBAC 的旧证据。运行时 session/principal/授权装配继续单独验收。

最新状态：[Operation writer/存储/重放/HTTP 的 A 独立评审](system-backup-a-config-operation-binding-review-20261015.md)已在 1,224 项冻结输入上通过，见[接收记录](evidence/a-config-operation-binding-review-20261015.json)。A-CONFIG-WIRE-01 在该固定候选范围内修复；后两段保留发现及 codec 交付时的历史状态。定向 6/37、两个有效撤保护反例和完整 security/config 两包 197/1,025（1,222 项）通过，默认 vet、exit 0、无重试；全部 live 输入匹配，准确目录及 117 个 fixture 已删除并独立确认。实际 JWT/session/file RBAC、SQL response adapter、Operation 原文/收据和真实 TLS/HTTP 已组合验证，SQL transport/资源仍为模型。公开 inline Operation 不再依赖旧 diagnostic 发布器；真实 MySQL mutation、生产路由/材料、迁移和独立维护 writer/授权/原文继续待完成。

2026-10-15 后续公开接线阻断：[A-CONFIG-WIRE-01](evidence/a-config-success-wire-audit-20261015.json)确认 OpenAPI 要求同步 update/rollback 返回 `task-operation.schema.json#/$defs/Operation`，而当前 writer/完整内容候选返回 ConfigResource。须统一准确 canonical HTTP response、保存 hash、evidence profile 和原字节重放后再接线；此前 ConfigResource 内容测试不能关闭此项。另[错误合同增量](system-backup-a-registration-contract-alignment-20261015.md)已将强认证状态改为 v12 的 401，纠正此前仅保留候选 403/409 的局部回归结论；原历史回执不改写。

该阻断已有 [A Operation codec 交付](system-backup-a-config-operation-response-20261015.md)：完整公共 Operation JCS、严格历史表示 parser、独立向量/schema parity 与最大字段 1,232 字节的有界证明已本地接收；1,216 项固定输入下，定向 5/41、security/config 完整 183/952（1,135 项）、默认 vet/退出 0 和准确产物清理通过。仅提供数据表示，不授予权限。D 后续应在最终事务取得准确完成/更新时间后构建成功体，保存和返回相同原字节；不能先以初始准备时间伪造完成事实，也不能沿用 ConfigResource response hash。writer/receipt/reader 未切换前 finding 仍 open。

## 已核对的实现边界

| 要求 | 当前候选实现 |
| --- | --- |
| 完整 ConfigValues 与 bootstrap 分离 | enabled 的两个值由完整 mutation decoder 接收；bootstrap 继续只接收 disabled。canonical/hash/size/展开列由同一不可变对象生成。 |
| 请求身份与幂等 | installation、actor、endpoint/method 和严格正文进入 A 摘要 profile；proof/session/key/request ID 不混入正文摘要。当前授权后先查收据，再判断新请求 expected_version。 |
| update/rollback | 新增递增版本，rollback 重新加载准确旧版本并追加新行；active pointer CAS 不重置 first-enabled/监控历史。旧 canonical 缺失或展开列不符时失败关闭。 |
| 强认证与审计 | 真实 intent/operation ID 进入 nonce FK；历史 key 版本参与重放检查；配置、state、evidence、收据、nonce、intent/result 同事务。 |
| 重放与未知提交 | 重放保持原响应并检查当前权限；未知提交使用同 target/key/hash 的只读观察，不盲目写入。provider 准备/读取在锁外完成，最终检查在事务内。 |
| 运行依赖 | Authority、Resolver、Responses 都是必需的受信适配器，缺失即拒绝。现有测试使用 SQL 模型和模拟适配器，不能证明这些生产边界已装配。 |

D 的 [原 decoder 回执](evidence/system-backup-d-config-mutation-local-20261014.json)只覆盖当时 decoder/摘要/既有 security 回归，不覆盖后来新增的事务候选。核对时它的 decoder、A 向量等输入仍匹配，验证脚本已有后续修改；历史回执保留其原范围，不扩大为当前 writer 的验收。

## 已复现并修订的两个阻断

[修订前输出](evidence/a-config-mutation-final-guard-repro-20261015.txt)实际运行了 A 的受控时钟测试：7 个应拒绝场景均返回 200，两项仍有效的对照通过。该轮另有 `crypto/internal/fips140deps/cpu` 的 Windows `vet.exe 0xc0000043` 工具错误，因此不能称为默认 vet 通过；实际故障用例输出与工具故障分别保留。原隔离目录已清理。[中途输入采样](evidence/a-config-mutation-review-before-20261015.json)不是完整冻结依赖图；D 模型测试在并行工作中有修订，最终验收改用下方固定副本。

1. **最终时间早于适配器工作。** 原代码只在最终检查开始时读取 `finalNow`，随后仍加载强认证材料、验证响应、授权和目标。耗时期间 proof、MFA 年龄、会话或 operation deadline 已过期，仍可能以旧时间提交；收据重放也可能返回已过期会话的响应。现在进入事务时核对已认证 token 的 iat/exp；所有最终适配器和目标核对完成后再次读取数据库时间，最后只做本地 temporal check 和提交。update 与 rollback 共用该检查，重放同样在最终授权之后重新核对会话时间。现有 `Verify` 的 age/skew/expiry 规则提取为私有纯时间校验复用，不新增一种“仅凭时间授予权限”的入口。
2. **最终验证返回的 nonce 事实被丢弃。** 原代码丢弃最后一次 Verify 的结果；active 或历史 key 的 HMAC 已漂移，仍提交较早消费的绑定。现在最终结果必须保留已消费的 active HMAC/key version，并保持所有既有候选版本的 HMAC；新增配置引入的额外版本允许加入，避免把合法 nonce key 轮换误判为漂移。既有版本消失/变化则整个事务回滚。

时间检查使用最后一次数据库观测，不在其后再次调用可能耗时的 issuer/provider/authority 适配器。它补充当前身份/RBAC/撤销检查，不能替代具体适配器的受信主体、准确 ref/registry、当前撤销、issuer/key 有效性和容量验证。真实 InnoDB 行锁、跨连接竞争、提交响应丢失和数据库/连接的提交语义仍需隔离 MySQL 验收。

## 本地门禁

修订后的门禁全部通过，A 接收状态为 `accepted_local_candidate_with_required_integration_gates`，见[增量评审与接收记录](evidence/a-config-mutation-final-guard-local-20261015.json)、[阶段记录](evidence/a-config-mutation-final-guard-run-20261015.json)和[完整输出](evidence/a-config-mutation-final-guard-local-20261015.txt)。定向 5 个主测试、10 个子用例通过；完整 security/read 两包共 151 个主测试、646 个子用例，合计 797 项检查通过。security 包为 101/440、运行 40.387 秒，read 包为 50/206、运行 4.551 秒。定向与全包的重复覆盖不另计为独立通过项。

[固定输入](evidence/a-config-mutation-final-guard-source-snapshot-20261015.json)包含 978 份 backend Go/module/SQL/JSON、v12 JSON/SQL，以及两份明确引用的证据 fixture；从副本运行 A 定向测试及完整 security/read 两包。`GOPROXY=off`、`GOSUMDB=off`、`GOTOOLCHAIN=local`、`-mod=readonly`，默认 vet 开启。最终两阶段均一次通过，退出 0，没有 Go 工具重试；早先复现轮的 vet 故障保留，不扩大为最终门禁失败或隐去。

最终核对已有 978 项 live 输入零漂移。并行新增的 `config_mutation_rbac.go` / `_test.go` 未进入本轮副本，未据此验收该 RBAC helper 或当前整个工作树。准确目录 `.tmp-a-config-review-final-3e28a1c734bc42838c24d3c071ca5587`、源码副本、cache/tmp/telemetry 和二进制均删除，并独立确认不存在；复现目录及失败缓存复制产生的目录也已清理。未安装依赖、未连接远端/真实 MySQL、未执行候选 DDL 或 Linux 交叉编译。

新增回归覆盖 deadline/会话/proof/MFA 在最终回调期间失效、active/历史 nonce 结果漂移、有效时间边界、重放会话过期、rollback 缺 proof/最终过期，以及新 key 版本可加入。权限、nonce、审计、配置和 state 的回滚观察基于 D 的 SQL 模型，不作为真实数据库原子性证明。

## 继续交接的门禁

- D 把 081 提案与实际安装 ledger/其他分支核对后评审并提升；当前 SQL 仍在 docs，未进入正式 runner/catalog。066 原字节不变，不能以本地评审替代 fresh/history migration 验收。
- 后续新增的 RBAC 语义比较 helper 独立评审/验证；它不能自行授予执行写权限，也不在上述 797 项检查的输入中。
- 装配当前会话/撤销/RBAC、准确 registry/ref/强认证材料、容量与完整不可变响应 evidence 的实际适配器；覆盖大于 inline 限额的响应，不以模拟接口替代生产授权。
- 用正式候选结构跑 update/rollback 同 key 并发、冲突、历史 nonce/key 轮换、撤权、审计/收据失败、最终等待过期和未知提交观察的隔离 MySQL 专项；旧 bootstrap/读取回执不覆盖本 writer。
- 旧行回填继续要求独立 purpose-specific 运行写授权、受信原始 canonical 文件和独立维护收据。当前没有实际材料交付或可执行 backfill writer，缺原文版本保持 NULL/读取 503；不合成旧字节，不借用 config_update 收据。

原 A 签收指纹保持历史记录；本轮 `strongauth.go` 复用时间校验及 writer 修订使用本轮新输入指纹评审，不静默改写旧签收，也不更改公共 registry 的 reviewer/production 标志。

## 2026-10-15 会话与实际 authority 组合评审

A 新增 [组合回归](../backend/internal/systembackupsecurity/config_mutation_session_a_integration_test.go)，将真实 `JWTRegistrationAuthenticator`、`SQLLoginSessions.CheckConfigMutationSession`、`PinnedConfigMutationAuthority` 与 `ConfigMutationService` 贯通。JWT 为本地合成签名；registry 为固定合成绑定；SQL transport、容量、资源准备及响应仍使用模型。普通变更的 StrongAuth 来源明确拒绝，测试不能因此冒充安全变更的 proof/MFA 接线。

当前代码核对：会话来源在调用者事务内锁当前活动 admin/password、准确安装/session 和用户撤销行；credential hash 随改密失效，撤销时间采用 issued-at 的严格上界。数据库会话截止必须覆盖已认证 token 的截止；全部行锁之后重新读取数据库 UTC。来源不创建/刷新会话或提交事务。Pinned authority 用准确 current/proposed RBAC 原文核对权限，并拒绝 resolver 低报语义风险；它不把有权限等同于可以跳过 MFA。

组合用例包含有效普通写入，以及改密、session 撤销、数据库会话缩短一微秒、issued-at 时撤销、锁外准备期间撤销、最终检查时撤销；负测要求配置、active pointer、审计/收据等模型状态整笔回滚。另验证已提交后撤销的主体不能通过 ObserveCommitted 读取原响应，也不能再写入。最终阶段的撤销注入仅验证重查和回滚控制流，不代表真实 InnoDB 在持锁期间允许其他连接改行。

[本轮固定输入](evidence/a-config-session-composed-source-20261015.json)为 1,165 项，摘要 `7235a49730c38eec7740294416d11ebe7891ba65b0c2a036349e1d5f488dd6f1`；[完整输出](evidence/a-config-session-composed-local-20261015.txt)与[限定接收记录](evidence/a-config-session-composed-review-20261015.json)确认完整 security 包 120 个主测试、548 个子用例（668 项）通过，默认 vet，运行 29.855 秒、退出 0，无工具重试。新增组合测试为其中 2 个主测试、7 个子用例，不重复叠加统计。测试后固定副本核对通过；准确 scratch `.tmp-a-evidence-a563026fd6a943198f9af5f2535e4ac3` 与源码目录 `.tmp-d-index-cache-b1f26c7376bd4080826210c6d3451220` 已删除，并独立确认不存在。未安装依赖。

接收时 10 项会话/authority/事务及其依赖输入与固定副本一致；现有输入漂移仅为并行修改的 `config_mutation_capacity_test.go` 与 `config_mutation_strongauth.go`，不得由这份旧副本签收。其他新增文件同样不能扩大本轮范围；完整包通过不代表本评审已批准其中全部材料和容量适配。

本评审仍不证明配置 proof 签发 HTTP、实际目录撤销事件输入、生产 authority/Resolver/Responses 装配、真实 MySQL 锁/并发或部署写权限。实际安装运行 grant、旧 canonical 原文和正式 081/082 提升继续独立交付；本地签收不替代这些材料。

## 配置 proof 签发增量（本地验证通过）

新增 [VerifyConfigMutationAndIssue](../backend/internal/systembackupsecurity/config_mutation_totp.go)，复用现有密码/AES-GCM TOTP/Ed25519 签名链。配置 proof 要求明确的数据库身份和安装、已有 credential-bound session、已确认的 MFA，以及同事务当前 security_admin 授权。它不登记或刷新登录会话，不直接执行配置变更；最终写入仍须重新核对 current/proposed 资源和权限并同事务消费 nonce。

既有 `POST /api/v1/admin/system-backup-strong-auth/proof` 增加一个严格的配置输入分支，保留原 provider 请求格式。配置格式有且只有 `password`、`code`、`endpoint`、`idempotency_key`、`request` 五个字段；endpoint 只接受 update/rollback 两个 operation ID。request 使用原完整配置变更 decoder。服务端用部署 installation 和已认证用户 ID 计算 A 已签收的摘要，不接收 request_hash、actor、session、auth_time 或风险标志。

例如 rollback 的 request 为 `{"expected_version":7,"change_reason":"恢复已核准版本","rollback_from_version":4}`，endpoint 为 `rollbackSystemBackupConfig`。update 使用 `updateSystemBackupConfig` 与完整 ConfigUpdateRequest。完整外层正文上限为 256 KiB 加 8 KiB 包装空间；内部请求仍独立受 256 KiB 限制。成功响应沿用 `header_name`/`header_value`，将返回的 proof 用于原配置请求及相同幂等键。密码、验证码和原文 proof 不进入审计。

签名后的 TOTP step 与 verified audit 仅在同事务提交成功后释放 proof；配置分支在签名前检查 SQL 会话，在提交前再次核对当前权限、同会话及新数据库 UTC。签名或回调跨过 proof/session/key 截止、最终撤权、审计失败都会拒绝；提交结果未知不返回 proof，也不盲重发。失败密码/TOTP 保留原持久化限流；配置 proof 不能代替首次 MFA confirm。

[组合回归](../backend/internal/systembackupsecurity/config_mutation_totp_test.go)使用实际 JWT、bcrypt、AES-GCM、TOTP、请求摘要及 Ed25519 Verify，SQL 和授权仍使用受控模型。覆盖 update/rollback、跨 endpoint/hash/key/subject/session 拒绝、同 TOTP 重用、缺失/撤销/缩短会话、签名/审计/最终检查失败、未知提交、HTTP 严格输入和超过旧 24 KiB 的合法请求，并保留 provider/confirm 对照。

[首轮固定源码](evidence/a-config-proof-issuance-source-20261015.json)为 1,168 项，摘要 `c704d40971d7f81cef90bbfb3b110868dfa1f623701833fdd6e7aa456d657f80`；[原始门禁](evidence/a-config-proof-issuance-local-20261015.txt)退出 1，四个正向子用例因测试夹具的 RequestBinding 漏填 issuer/受众/主体/会话而失败。已有真实 Verify 正确拒绝空 issuer，这不是放宽生产校验的理由。A 补齐独立验证上下文，并逐项只改一个绑定字段验证拒绝；没有改生产实现来迎合夹具。14 个失败注入、严格 HTTP 输入及 provider/confirm 对照均通过。首轮准确 scratch `.tmp-a-evidence-bfdcfe75e85640708545f61119c4d09b` 和源码目录 `.tmp-d-index-cache-15645b5d873b445881db53079ab62f4c` 已删除并独立确认。

[修订固定副本](evidence/a-config-proof-issuance-source-20261015-r2.json)为 1,170 项，摘要 `0c6599ed25d7cc4bdb65abd54f7ba9a9b5bc8ee95c936744cf884664b8c5dd8a`；[r2 输出](evidence/a-config-proof-issuance-local-20261015-r2.txt)与[限定验收记录](evidence/a-config-proof-issuance-review-20261015.json)确认完整 security 包 134 个主测试、643 个子用例（777 项）全部通过，默认 vet，包运行 18.952 秒、退出 0，无工具重试。新增 proof 回归为其中 6 个主测试和 30 个子用例，不重复叠加统计。测试后固定源码核对通过；准确 scratch `.tmp-a-evidence-5cfec5ffdc5c4122ae9010fe2171d436` 与源码目录 `.tmp-d-index-cache-37cd43d5e5e6414da632b55ae5f10c99` 已删除并独立确认不存在，未安装依赖。

接收时 9 项签发/会话/摘要与验证依赖输入均与副本一致。期间 D 新增并继续修改 Resolver 和事务主体/模型，现有输入漂移为这四份 D 文件，均以副本准确字节为界；完整包回归不自动构成 A 对最新 Resolver、事务修订或所有生产资源适配的独立签收。原首轮失败记录保留，不把失败轮与成功轮的重复检查合计。

这是现有 registration 服务的 proof 输入扩展，不新增配置写 HTTP 或离线回填入口，不签发安装写 grant；生产 Resolver/Responses、部署材料和真实 MySQL 验收仍待接线。既有公共合同仍为 draft，原 A 签收指纹不改写。

## A 完整配置响应内容验证与维护摘要（固定副本本地接收）

A 新增的 [canonical-only helper](../backend/internal/systembackupsecurity/config_response_canonical.go)与[对应测试](../backend/internal/systembackupsecurity/config_response_canonical_a_test.go)采用独立文件名，保留 D 并行 `config_mutation_response_content.go` / `config_mutation_response_read.go` 实现。A helper 不导入 evidence：依赖方向必须保持 evidence → security；响应存储桥接不能在 security 内反向导入 evidence 造成循环，应由独立组合层处理。

[首轮固定输入](evidence/a-config-response-content-source-20261015.json)、[原始失败输出](evidence/a-config-response-content-local-20261015.txt)与[失败归档](evidence/a-config-response-content-failed-20261015.json)记录 1,175 项输入、摘要 `236120161e3f977290f6fd6431347aafa329319390556dc938da1af2b497474c`；包 setup 因上述反向导入产生循环依赖，退出 1，未执行测试断言，不算默认 vet 或任何用例通过。拥有目录 `.tmp-a-evidence-393df5a7b3d3481da45d862095d614a8` 与 `.tmp-d-index-cache-455112c2fc624ae09a75c7375de6b510` 已删除并独立确认不存在。

A 的 [内容 profile](../backend/internal/systembackupevidence/config_response_content.go)要求独立认证的 ContentAuthority 提供准确 typed ConfigValues、安装/actor/version/time、deployment switch 以及已经审核脱敏的原因；以现有 writer 的完整 JCS ConfigResource 核对所有字节。它只接收大于 8 KiB 的 system-owned diagnostic/application-json，不冒充 capability 或日志，不开放任意 diagnostic body，不截断或剔除未知字段后宣称安全。dispatcher 在读前/读后检查当前生产者与完整固定策略，拒绝策略、原因、内容、截止或生产者漂移。

当前真实大正文夹具为约 10.5 KiB，使用合法的 128 字符 ref/registry version、完整 enabled ConfigValues 与 480 字节合成已脱敏原因，不靠空白填充；已补完整加密往返、未知/重复字段、错误主体/版本/原因、reader/取消和策略撤销负测，但在修复依赖并实际跑通之前不作接收。

此 profile 是已脱敏内容验证，不是自由文本原因的通用清洗器；实际原因策略、当前写权限和持久化发布/SQL 绑定仍由独立受信来源与组合层落实，不能从待验正文反推策略。未安装依赖，未发起远端或执行迁移。

D 随后已将响应组合逻辑移入 `systembackupconfig`，security 中只保留依赖 A canonical builder 的 typed preparation，反向导入已消失。[r2 固定输入](evidence/a-config-response-content-source-20261015-r2.json)为 1,183 项，摘要 `f97f89bd352925af54a88cbd38425c34c2495e032fac2a12aa17cdf9b5f55a1c`；没有排除 D 文件或测试。[专用验证入口](../scripts/system-backup-a-config-response-content-validation.ps1)先运行配置响应/维护摘要定向，再用同轮缓存运行 security/evidence/producer 三包。[r2 原始输出](evidence/a-config-response-content-local-20261015-r2.txt)与[限定验收记录](evidence/a-config-response-content-review-20261015.json)确认定向 9 主测试/58 子用例、完整三包 396 主测试/2,526 子用例（2,922 项）通过，默认 vet、退出 0，无工具重试。定向重复覆盖不与完整包相加。

- security：140 主测试、686 子用例，51.975 秒。
- evidence：181 主测试、1,131 子用例，64.198 秒。
- producer：75 主测试、709 子用例，59.471 秒。

测试后固定源码核对通过；准确目录 `.tmp-a-evidence-4b52a8bf68614342a624aecc4947961c` 与 `.tmp-d-index-cache-cbb1b50302714ec18f454f2aabc76b08`、缓存、源码副本和二进制均已删除，并独立确认不存在。源码快照工具另有[五项独立回归](evidence/a-config-response-snapshot-tools-20261015.txt)通过、fixture 清理为 True；维护摘要合成向量也已纳入固定输入名单。首轮失败记录保留。

接收时 13 项 A 实现/测试、工具、向量及共享解析输入仍与副本一致。D 后续继续修改 transaction/preparation、四份响应组合代码/测试与其验证脚本，共七项已有输入漂移；当前 canonical response helper 的字段/JCS 构造另经检查仍为已审实现。本记录不把旧固定副本的三包通过扩大为最新事务装配或 `systembackupconfig` 包的独立接收，D 后续运行须绑定自己的准确输入和结果。

内容验证发生在 framing 第一遍读取阶段；它不替代 Wrap/第二遍暂存、外部发布和提交前的当前权限/时效复查。完整响应组合层仍须约束固定 deadline，并完成独立的发布意图、准确对象和同事务绑定，不能把内容 profile 当成发布或 SQL 写权限。

## 配置 proof 独立 MySQL 探针本地门禁

[新专项](system-backup-a-config-proof-mysql-handoff-20261015.md)已补 `ConfigProofOnly` 独立 profile、冻结源码入口及完整正式迁移 schema 上的 15 项签发用例；不会执行 config mutation writer、候选 081/082 或回填。并发和配置撤权要求按实际 worker 连接观察到对应 InnoDB 行锁等待，审计失败必须回滚，真实 COMMIT 后合成丢失回执不得释放 proof 或用原验证码再次签发。

[本地验收](evidence/a-config-proof-mysql-local-review-20261015.json)确认 1,196 项冻结输入下，定向 6/30、seed 1/6（共 43 项不同 Go 检查）、空目录编译 seed、默认 vet、11 项派发及三份 Shell 语法检查通过；Linux 探针和迁移 runner 构建成功，最终退出 0，无工具重试。冻结复核与全部已有 live 输入核对通过，准确源码/缓存/二进制目录已删除并独立确认。未安装依赖或连接远端；该门禁只证明本地逻辑和探针可独立构建，15 项实际 MySQL 结果仍待操作者回传，不作为新配置 writer、生产权限或部署激活的接收。

## 共用强认证错误边界增量

[错误边界交接](system-backup-a-registration-error-boundary-20261015.md)关闭未知强认证 code 被复制到内部返回错误及 typed nil 导致 error traversal/HTTP 解引用 panic 的问题。只接收既有四种强认证 code；未知 code、普通私有错误及 typed nil 均返回固定 unavailable，不保留私有 cause。合法权限、强认证及 provider 状态映射保持既有语义。配置 writer 复用同一内部转换器。

[增量接收](evidence/a-registration-error-boundary-review-20261015.json)绑定 1,204 项冻结输入与本轮三份生产源码的新指纹：定向 3/34、完整 security/config 两包 163/841（1,004 项）、默认 vet、退出 0，无工具重试，准确产物清理已独立确认。五项 A 输入仍匹配；后续三项 D preparation/transaction/test 漂移不据本轮冻结回归接收。原 A 合同和旧签收保留各自准确字节与范围，公共 v12 和实际运行授权未由本轮放行。
