# D：provider-proof 事务组件与远程执行入口

2026-09-28 最新状态：独立迁移入口已在隔离 MySQL 8.4.8 重放 `001..080` 共 93 个文件；权限/nonce/幂等/审计与 HTTPS/JWT/MFA 套件 9/9、bootstrap 嵌套 3/3 PASS，清理完成。见 [最新远程回执](evidence/system-backup-d-runtime-migration-mysql-sbk-mig-260928072119-004e.json)。真实双 issuer 的签名和 ACL 已另行通过；实际 HTTP 部署、本人 MFA、真实配置准入及激活仍待完成，详见 [D HTTP、issuer 与激活验收进度](system-backup-d-http-activation-20260928.md)。

## 历史实现与验收记录

以下状态保留最初交付时的上下文，包含当时尚未实现的 HTTP/认证接线；历史 MySQL 结果只绑定原始二进制/DDL，不覆盖后续代码。当前完成范围以上方最新记录为准。

状态：**本地事务组件已实现；操作者回传的真实 MySQL 8.4.8 隔离测试 5/5 通过并报告清理完成；真实 provider-proof issuer key 与候选 registry 已创建并通过本地文件核验。签名服务、正式配置激活与应用 HTTP 接线尚未完成。** 此文件补充 [A 组件交付](system-backup-a-provider-proof-adapter-20260924.md)，不修改已有生命周期签收或正式 registry 批准状态。

## 已实现

`backend/internal/systembackupsecurity/providerproof_transaction.go` 提供 D 的 `ProviderRegistrationService.Register`，直接调用 A 的解码、请求摘要、强认证、Prepare 和 Stage。使用真实 `database/sql` 事务，固定 Repeatable Read；持有 installation/config 锁，检查当前用户 active/admin，再调用事务内会话、目标可见性与 destructive 权限检查。普通 admin 不自动获得 destructive，生产实现需要 pinned RBAC 中的 security_admin。

已提交重试按 installation/admin actor/endpoint/idempotency key 查询；相同 body 返回原 operation/evidence，不重新登记或消费 nonce，同 key 不同摘要返回冲突。权限与会话仍须重新检查；原 proof 过期不破坏已提交请求的重试。

新登记以数据库 UTC 时间验证。nonce 版本清单取全局配置历史与仍在保留期的全局账本版本；逐 candidate 用唯一索引 `FOR UPDATE` 锁定查重，包括不存在记录的 gap lock。因现有 nonce 唯一约束是全局的，入口先按安装 ID 顺序锁定所有 installation 行，再读取配置/历史 key，保守串行化跨安装登记与配置切换；避免两个安装使用不同 active HMAC version 同时消费相同 nonce。配置写入方必须遵守 installation→config 锁顺序。缺历史 HMAC key 或同版本对应多个不同 Secret 身份均应失败关闭。并发死锁/存储故障不会被解释为成功，调用方只能以原 key 重试。

成功事务依次写 audit intent、inline evidence、同步 succeeded operation、consumed nonce、audit result；容量预留也必须使用同一个事务。nonce 最后写入时重新检查认证有效期。nonce 保留至 proof 到期加 control retention；evidence 用 evidence retention。任一步失败全部回滚；Commit 出错返回独立的 `provider_registration_commit_unknown`，不返回 201、不自动换 key。登记不改变目标结论或 row version。

`providerproof_registry.go` 提供 `PinnedRegistrationAuthority` 和实际 public-key registry 解码器。对原始 UTF-8 文件字节验证锁定配置中的 SHA-256，拒绝超限、重复 JSON key、未知字段、版本漂移和错误用途。强认证与 provider-proof 公钥不得复用；强认证 key 的有效期须覆盖 proof。HMAC 解析器收到 active identity hash、版本及完整历史版本清单，不能只按一个版本字符串任意选择 Secret。

## 尚未完成的应用接线

仓库当前没有可直接复用的 system-backup Admin mutation handler、服务端强认证会话实现和共享 control-metadata 容量记账器。此轮没有通过虚构数据库表或默认放行补齐这些接口。`PinnedRegistrationAuthority` 的以下必需函数缺任一项都会拒绝登记：

- `CheckSessionAndVisibility`：对当前认证会话以及安装内目标执行事务内检查。subject/session 必须来自认证中间件，不能来自请求 body。
- `TargetBinding`：锁定并读取 A/C/B 审阅过的真实 provider identity/location/action/UID/version/checksum/length/state 映射；输入只含 typed target，不能从提交 proof 回填期望值。
- `NonceKeys`：通过锁定的配置历史和 Secret identity/version 读取 HMAC key；历史缺失、同版本身份歧义必须拒绝。
- `ReserveMetadata`：与应用共享的容量/保留记账；输入的 inline size 不是整笔事务的总开销，必须包括 operation、nonce 和 audit 元数据。

生产强认证 issuer、活跃 config、上述适配器、HTTP 状态映射与失败请求审计策略仍需完成并联测。当前未注册 HTTP 路由，未声称整条 Admin API 可用。三份新增 registry wire profile 使用 `.draft.v1`，没有修改或冻结 A/C/D 正式合同。

## 独立真实 issuer key 的准备

用户已指定继续使用 `root@10.130.14.23` 的隔离环境。代理先前的只读 BatchMode SSH 检查返回 `Permission denied (publickey,password)`；本机 Docker engine 未运行。操作者随后在交互式终端完成远程 MySQL 测试和真实 issuer key 创建并回传结果，详见下方归档。config 尚未激活。

准备入口复用已交接 lab 的 namespace UID、TLS CA hash 和 digest 镜像校验。随机创建独立 Ed25519 key，禁止 export/plaintext backup；不复用 capture/acceptance/catalog key。root_token 只挂入临时控制 Pod，输出只含公钥、完整 ref、指纹和 registry bytes/hash。没有签发数据面 token、没有开放通用签名 ACL、没有制造 provider 观察证明或 MFA 证明。

以下 installation ID 是本次 lab 的明确测试作用域，不是生产安装的批准身份。成功结果的 registry 有效期为 90 天，这是 verifier 的信任窗口，不是 OpenBao key 的自动销毁 TTL。创建后的 key、immutable intent/registry 属于交付配置而保留；临时控制 Pod 自动按 UID 删除。

以下为创建入口说明；本次已成功创建，**不要再次执行 create**。需要复核时使用同一 run 的 inspect。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
node .\scripts\system-backup-d-provider-issuer.mjs create --ssh-host root@10.130.14.23 --installation-id installation_sbk_provider_zh_7474d6e0b052 --ssh-password
if ($LASTEXITCODE -ne 0) { throw 'issuer 准备/清理未通过；保留 run_id，按 RECOVERY 清理控制 Pod' }
```

成功会保存 `docs/evidence/system-backup-provider-issuer-<run>.json` 和 `.registry.json`，输出 registry SHA-256。它始终标记 `active_config_updated=false`、`attestation_service_ready=false`、`provider_capability_approved=false`。独立 key 和候选公钥 registry 不等于可上线的 issuer：还须实现可信 provider 观察→固定 profile 签名服务，评审后将实际文件 hash/version 通过 config mutation 绑定。不能直接将该文件当作正式 evidence。

中断时运行入口打印的 `cleanup-control` 命令，删除精确绑定 intent/UID 的临时控制 Pod，保留 key 与配置。完成 checkpoint 后可以使用 `inspect` 重新核对 key 指纹并取回同一份 registry。若在 key 创建与 checkpoint 写入之间中断，inspect 会拒绝自动认领；保留 intent、run 和服务端审计，由操作者核对，不重新创建同名 key、不按前缀批量删除。`cleanup-control` 仍可清理临时 Pod。

## MySQL 验证入口

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-d-provider-registration.ps1 -Remote -SshTarget root@10.130.14.23
if ($LASTEXITCODE -ne 0) { throw 'D MySQL 验证或清理失败，请保留输出与 CLEANUP_PENDING 信息' }
```

使用已有 Go/模块缓存、tar、OpenSSH；`GOPROXY=off`、`GOTOOLCHAIN=local`、`-mod=readonly`，不安装依赖。固定 fix15 migration 镜像，在随机 `sbk-mig-*` namespace 的 emptyDir MySQL 重放 migration，停止临时 app，核对 namespace UID/server UUID 标记后，测试再创建随机 `dpr_*` 数据库。源 MySQL 和业务资源不写入。

探针从当前 migrations 065/066/075 原样提取 evidence/operation/nonce CREATE TABLE，保留真实 CHECK/unique/FK 约束。config、target、session/visibility、capacity 是显式 synthetic 测试依赖；这不是生产目标映射或 HTTP 鉴权验收。使用真实 Ed25519 合成 proof，验证六连接同请求只提交一笔、body 冲突、相同 nonce 配新 key 被拒、结果审计触发器报错回滚所有表、撤权阻止已提交重试，以及目标 row 不变。Commit 不确定性目前由本地 driver 故障测试覆盖，**尚无真实 MySQL commit 断连实测**。

成功必须看到 `PASS d-provider-registration-mysql`、run-owned database 删除检查、namespace UID 清理和两端 scratch 清理。PowerShell finally 删除测试二进制、DDL bundle、专用 Go cache；临时数据库与 Pod 内文件也会清理。单有 `LOCAL_PASS` 只证明本地测试/编译，不代表 MySQL 实测。

## 本地验证

已执行 Go security/transaction 单元回归及 Linux amd64 tagged MySQL 探针离线编译；构建目录与专用缓存已清理。9 项 issuer 输出校验和 2 项既有 Shell phase 回归通过。Shell 首次因 Windows sandbox 的 Bash `EPERM` 未执行，正常权限重跑通过；没有远程访问。Python issuer 脚本使用标准库，语法检查不生成 pycache。

## 2026-09-24 远程 MySQL 结果

已归档[操作者回传结果](evidence/system-backup-d-provider-registration-mysql-20260924.json)。来源是本任务中的控制台输出，未签名，代理未独立回查远程环境；未单独提供进程退出码，归档保留为 null。

MySQL 8.4.8 在 `sbk-mig-260924071052-5204`（UID `439e6cf3-ad8f-40a8-ab59-3ff49d5ed7cf`）完成 fresh migration `001..079`，实际应用 92 个文件，exact filenames 与 D 列类型检查通过。`TestDProviderRegistrationMySQL` 的同请求并发、body 冲突、nonce 重放、结果审计失败全表回滚、撤权后禁止已提交重试五项全部通过。最终 `PASS d-provider-registration-mysql` 中二进制与 DDL hash 与本地编译输出一致，完整值及镜像 digest 见归档。

输出报告 run-owned database、匹配 UID 的 namespace、远程 scratch、本地 build cache 均清理完成。OpenSSH close/IO-pending 提示之后仍有对应 PASS/CLEANED 标记，无需仅为该提示重跑本轮测试。开头 `LOCAL_PASS real_mysql=not_run` 仅描述远程阶段开始前的本地阶段，不覆盖后续远程通过结果。

通过范围限于上述隔离 MySQL 探针；synthetic 应用依赖与真实 commit 断连未测等边界保持不变。

## 2026-09-24 真实 issuer key 与候选 registry 结果

操作者完成 run `d-issuer-d7f0a14ec84d78927620d25f`，回传 `d_provider_issuer_exit=0`。本地已有[远程结果文件](evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.json)和[候选 registry 原始文件](evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json)。代理通过现有 `validateIssuerResult` 重新验证闭合字段、当前脚本源码 hash、固定 handoff、安装范围、key ref/version、公钥、90 天窗口和清理状态；单独验证 registry 文件与结果内 registry_json 的 UTF-8 字节完全相同，SHA-256 与操作者输出一致。该核验未再次 SSH 查询远程状态。

| 字段 | 实际值 |
| --- | --- |
| registry version / run | `d-issuer-d7f0a14ec84d78927620d25f` |
| registry SHA-256 | `c1b76a352d37cee763235c645cf82ded5e4193cb66fb12614a83c4cb950ed4a8` |
| installation | `installation_sbk_provider_zh_7474d6e0b052` |
| issuer | `https://bao.sbk-provider-zh-7474d6e0b052.svc:8200/provider-proof/d-issuer-d7f0a14ec84d78927620d25f` |
| key ID | `https://bao.sbk-provider-zh-7474d6e0b052.svc:8200/transit/keys/d-issuer-d7f0a14ec84d78927620d25f-provider-proof-v1` |
| key version / purpose | `1` / `provider_proof_issuer` |
| Ed25519 public key (base64) | `bicNqDLJzd507P7dday47m125TRqXADsYMo5LWGVJvA=` |
| verifier 信任窗口（UTC） | `2026-09-24T07:18:44Z` 至 `2026-12-23T07:18:44Z` |
| 远程 key metadata snapshot 指纹 | `c5b8dda9bc73682fad917afa78d96c08ae52cb400f33a231b6f49fcc8ad54b86` |
| namespace / UID | `sbk-provider-zh-7474d6e0b052` / `a285351a-b52a-4b91-af78-1e5fa8e78387` |
| immutable registry ConfigMap UID | `e5d86466-b53c-43fe-bcd9-a922884d6fa4` |

指纹来自远程 key metadata snapshot，包含 key 名称、类型、版本等，不能解释为仅对公钥原始字节计算的 SHA-256。issuer URL 是绑定身份，不表示该 URL 已提供可调用的签名服务。`temporary_control_pod_removed=true`，key 和 immutable intent/registry 作为配置保留；本次无需执行 RECOVERY，也无需因 SSH close 提示重跑。

当前可以交给 A 做组件与候选输入复审：D 事务组件、MySQL 隔离测试结果、真实公钥与精确 registry hash/version 均已具备。以下仍是未完成项，不能把阶段性交接视为最终验收：

- A/C/D 对 draft wire profile 和可信目标映射的复审。
- D 的 HTTP/会话/目标/nonce Secret/共享容量适配、HTTP 错误映射与失败请求审计。
- 可信 provider 实际观察到固定 profile 签名的服务，以及独立的强认证 issuer 接线。
- 正式 config/registry 激活与完整 API 联测；真实 MySQL commit 断连及跨安装 HMAC 轮换并发测试。

结果中的 `active_config_updated=false`、`attestation_service_ready=false`、`provider_capability_approved=false` 保持原值。本轮只更新 D 的交接记录，未替 A 签收、未激活远程配置。
