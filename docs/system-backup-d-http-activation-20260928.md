# D HTTP、issuer 与激活验收进度

最新部署前置增量已完成隔离远程验证：[93 文件迁移与 HTTP/MySQL 接收记录](evidence/system-backup-d-runtime-migration-mysql-sbk-mig-260928072119-004e.json)。独立入口在 MySQL 8.4.8 上执行 `001..080 applied=93 exact_filenames=yes`，固定摘要的 migration runner PASS，9 个一级用例和 3 个 bootstrap 嵌套用例全部 PASS（1.54 秒）。namespace `sbk-mig-260928072119-004e` / UID `01632b8f-0728-4ed3-8aef-22ef44000a44` 及测试数据库、远端 scratch、本地缓存均报告 CLEANED。本地复核三个构建摘要、catalog 摘要和 163 项源码绑定一致，剩余 scratch 为 0。来源为操作者控制台附件，未独立查询远端，也未提供单独 shell 退出码。见[正式运行表与独立迁移入口](system-backup-d-runtime-deployment-20260928.md)。本增量无需重跑；真实 admission、运行身份、部署 HTTP、本人 MFA 与实际配置激活仍待完成。以下保留旧 92 文件目录的验收历史。

此前 92 文件目录的隔离远程验收为 **9/9 PASS，bootstrap 嵌套子项 3/3 PASS**（历史记录）：[完整 HTTP/MFA 与 MySQL 接收记录](evidence/system-backup-d-http-mfa-mysql-sbk-mig-260928063437-0e3f.json)。`sbk-mig-260928063437-0e3f` / UID `4209e0c4-8f99-43d8-96c5-5a88a3b732b7` 使用 MySQL 8.4.8，整个套件耗时 1.59 秒，新 HTTPS/JWT/MFA 用例耗时 0.33 秒。探针 `d5d994bffb426a5be75073a8fb20457e7557e4485fed6f334c7efb3b4d9db877`、DDL `2661503d821ae4a5346609a6dfba93db5483b6538e71de46c2e686d9a050ceba` 与本地记录一致，55 个源码绑定重新核对全部匹配。数据库、匹配 UID 的 namespace、远程 scratch 和本地缓存均报告 CLEANED；本地另行确认临时目录数为 0。证据来自操作者控制台回传，未独立查询远端，也没有单独的 shell 退出码。

本轮已执行到退出撤销、配置切换锁、旧 runtime pin 拒绝、重载后角色撤销拒绝，以及审计不含测试凭据的断言，前次统计 SQL 错误已解决。该组探针无需重复运行，可作为 D 组件交接评审证据。**真实用户 MFA、真实服务部署和实际配置激活仍未完成，不能按 D 全部完成交接或解除发布门禁。** 下一阶段是补齐真实 registry/ref 的初始化 admission，部署运行身份/TLS/容量采集与退出撤销接线，再进行管理员本人 MFA、部署 HTTP 及配置激活验收。原本地 NOT_RUN 和失败记录保留为历史，由本轮 PASS 补充。

统计 SQL 修复的本地验证已通过：[修复版验证记录](evidence/system-backup-d-http-mfa-receipt-count-local-20260928.json)。安全包测试及默认 vet PASS（2.119 秒），Linux MySQL 探针和 HTTPS 服务均编译成功，退出码 0；修复查询引用的列已静态对照真实迁移，构建缓存和产物已清理，未安装依赖。新探针为 `d5d994bffb426a5be75073a8fb20457e7557e4485fed6f334c7efb3b4d9db877`，DDL 仍为 `2661503d821ae4a5346609a6dfba93db5483b6538e71de46c2e686d9a050ceba`。生产代码和 DDL 没有变化。此本地记录生成时修复版尚未远程执行；后续完整远程 PASS 见本文开头的新接收记录。

前次远程结果为 **FAIL**（后续修复版已通过，保留失败历史）：[2026-09-28 HTTP/MFA 接收记录](evidence/system-backup-d-http-mfa-mysql-sbk-mig-260928061146-2742.json)。`sbk-mig-260928061146-2742` / UID `1befd988-d9c7-4689-a1ed-a22dd0b64ba6` 的 9 个一级子项中 8 PASS、1 FAIL，bootstrap 的 3 个嵌套子项均 PASS。旧探针 `dc7eda72…c0e56` 与 55 个源码绑定一致。新增用例已完成 JWT/MFA、provider observation、首次 HTTP 201 和相同结果的幂等重试，随后在第 204 行的统计 SQL 失败：测试错误地对没有 `origin_installation_id` 列的 evidence 表使用了该谓词。原始 MySQL 错误编号未回传；诊断依据是匹配的源码与真实迁移 DDL。后续退出/配置撤销及审计泄露断言未执行，不能算完整验收通过。数据库、匹配 UID 的 namespace、远程 scratch 和本地缓存均报告 CLEANED。

修复仅涉及探针：operations/nonce 继续按 installation 统计，evidence 按 HTTP 返回的 public_id 与 owner 绑定核对，并断言全表总数仅增加一条，检查重试是否产生额外 evidence。MySQL 测试错误现在仅补充驱动错误编号，不输出原始诊断、SQL 参数或凭据。应用逻辑和 DDL 未修改；修复后的新探针已在 sbk-mig-260928063437-0e3f 通过完整隔离 MySQL 验收。

本次增量本地验证已通过：[HTTP/MFA 事务授权验证记录](evidence/system-backup-d-http-mfa-local-20260928.json)。安全包测试与默认 vet PASS（1.485 秒），Linux MySQL 探针及 HTTPS 服务均编译成功，runner 退出码 0；gofmt 与 PowerShell 语法检查通过，构建缓存和产物已清理，未安装依赖。新探针 SHA-256 `dc7eda72dd21898bda24301446fe864c0ee7bf7157df52473eaee2c4fd3c0e56`，DDL 未变，仍为 `2661503d821ae4a5346609a6dfba93db5483b6538e71de46c2e686d9a050ceba`。该旧本地记录生成时新增真实 MySQL 用例尚未运行；后续先发现探针统计 SQL 错误，修复后第 9 个一级子项已远程 PASS。无需重跑已通过的探针或重建 issuer/管理员候选。

后续增量（2026-09-28）：MFA 登记、确认及签发的 RBAC 检查已移入凭据事务；使用明确的 Repeatable Read，按登记路径的顺序锁定 installation/config，配置切换后旧 runtime pin 返回 not_ready，重新加载后被撤销的角色返回 permission_denied。首次初始化前仅接受部署固定的 v1 授权，孤立 config 行或非 v1 均拒绝。缺少事务授权回调不允许签发；现有应用 logout hook 不依赖此回调。

新增 `https_jwt_mfa_registration_and_config_revocation` 隔离 MySQL 用例，串联实际 HTTPS listener、HS256 access JWT 验证、三个 registry 的摘要与结构校验、MFA 登记/确认/签发、provider observation 接口、首次登记与无 proof 幂等重试、退出撤销，以及配置切换的锁和旧 pin 拒绝。它还验证未绑定管理员不能创建 MFA 状态、refresh/错签 JWT 拒绝、TOTP 重放拒绝及审计不含凭据。该用例的签名密钥、provider 事实、nonce material、capacity admission 是明确的 synthetic fixtures；没有使用真实管理员密码或真实 issuer 私钥。之前 8 项远程 PASS 不覆盖本增量；本增量现在已有独立的 9/9 远程 PASS 记录。真实用户 MFA、服务部署与实际配置激活仍未完成。

本文件续接 [2026-09-24 D 事务交接](system-backup-d-provider-registration-20260924.md)及 [A 的两项解析器复审意见](system-backup-a-d-registration-rereview-20260924.md)。**尚未完成远程服务部署、配置 mutation/激活或完整 HTTP 验收，不可据此解除发布门禁。** 先前 MySQL 5/5 只覆盖其原始二进制和原始 DDL，不能覆盖本轮新增代码。

此前的 8 项隔离数据库验收已通过：操作者回传 `sbk-mig-260928040448-6b0a`（UID `6773f835-6de1-4d63-bee5-c57815e32f04`）的 MySQL 8.4.8 结果，8 个一级子项及首次配置事务中的 3 个嵌套子项全部 PASS，整个套件耗时 1.19 秒。二进制 `51e618ceca9abefc8e75901cffa5d7508d691932530e0e39648b6cdc57d319fb`、DDL `2661503d821ae4a5346609a6dfba93db5483b6538e71de46c2e686d9a050ceba` 与本地记录一致，53 个源码绑定再次核对无变化。见[本轮 MySQL/HTTPS/bootstrap 接收记录](evidence/system-backup-d-bootstrap-mysql-sbk-mig-260928040448-6b0a.json)。bootstrap 数据库、登记数据库、匹配 UID 的 namespace、远程 scratch 和本地缓存均有 CLEANED 标记，本地临时目录数为 0。记录来自操作者控制台回传，未独立重查远端，未提供单独进程退出码。

新增 HTTPS 用例使用实际测试 TLS listener 和隔离 MySQL，但 HTTP actor 来自 fixed test authenticator；bootstrap 使用 synthetic admission/registry/ref。因此本轮覆盖存储与隔离传输行为，不证明实际管理员 JWT、部署运行身份、本人 MFA 或实际应用配置已激活。这组已通过的探针无需重复执行；下一阶段是完整真实输入、部署 admission/调用入口及实际服务联调。本地旧记录保留当时的 NOT_RUN，以本轮远程接收记录补充。

最新远程进度：2026-09-28，两把现有真实 issuer key 的 Transit 签名及 16 个 ACL 拒绝场景已通过，操作者退出码为 0，临时资源清理已报告完成。D 在本地重新核对了证据文件的源码 bindings、两个 registry pin、每个拒绝状态，并用固定公钥独立复验两份签名。见[原始远程结果](evidence/system-backup-issuer-signing-d-sig-fa480a2d4c87ebdf0e48f9e6.json)和[接收记录](evidence/system-backup-d-issuer-signing-verified-20260928.json)。**这是 Transit 密钥持有与权限隔离验收，不是已部署的应用 HTTP、本人 TOTP 或配置激活验收。**

管理员核对也已通过：`admin` 是数据库中实际的本地、启用管理员，ID 为 `1`，操作者退出码 0；不是从默认种子推断的 ID。2026-09-28T02:22:23.791098Z 的只读快照确认 `config_rows=0`、`active_installations=0`、`target_installations=0`、D runtime 表 `0/4`。见[身份接收记录](evidence/system-backup-d-admin-identity-verified-20260928.json)。已核对候选 RBAC 原始 SHA-256 `c01f269405ebf341f7bb6910d486654752324020ae3127939fa045ec6bb5486f` 及 `actor_id=1, subject=user:1, role=security_admin`。

已生成[首次初始化的公开输入包](../deployments/k8s/system-backup-provider-lab/registration-bootstrap-d-admin-7d01a0782656f2af361b56e5/bootstrap-admission.json)，包含三个原始 registry 的 immutable ConfigMap 提案、按 kind/version/hash 定位的 volume 文件和数据库/用户身份约束。文件及挂载路径的 hash 已核对；尚未 apply，没有创建远端账号/表/服务，也没有激活配置。该候选严格绑定数据库 `clawmanager`、server UUID `f1f5f76a-95f5-11f1-b08e-366835b4a029`，不能直接复制到其他数据库。

完整初始化仍有实际缺口：合同要求 9 类 registry，已验证 3 类，尚缺 `parts`、`redis_sources`、`failure_domains`、`disaster_identity_mapping`、`source_writers`、`secret_allowlist` 的真实版本化内容；20 类 ConfigReference 尚未完成从实际 provider/Secret ref 到配置 identity_hash/version 的映射。这里“尚未映射”不等于底层 20 种能力都不存在。本轮已加入首次配置事务组件和运行时数据库身份校验，但首次配置的部署 admission/调用入口、完整 config_update 事务、服务/表部署及本人 MFA 验收仍未完成。因此不能把当前输入包当作可执行的完整激活计划，不能导入 throwaway fixture 补齐必填字段。公开输入包中的 implementation 清单保留生成时的历史状态，以本文后续记录补充。

## 首次配置事务增量（09-28，管理员身份确认后）

新增 `config_bootstrap.go`、`config_bootstrap_rules.go` 与 `config_bootstrap_transaction.go`：严格解析完整 ConfigValues，拒绝 enabled=true、缺字段、大小写别名、重复/null/字符串数值、重复 registry/ref、缺少任何一类引用及违反跨字段约束的配置；不自动填入默认值。安全系数精确限制到 MySQL DECIMAL 的两位小数，规范化后计算 JCS 内容 SHA-256。数字规则的源 schema hash 和每项上下界/默认值由测试核对。

规则还可用 `node scripts/system-backup-d-bootstrap-rules.mjs --check` 离线重生成比对，不写文件或启动子进程。审查合同变化后才能使用 `--write` 更新规则，并单独运行 gofmt；源 schema 仍为 draft，生成器不代替跨 owner 审核。

`ConfigBootstrapService.Bootstrap` 是库内离线事务入口，不是 HTTP API 或可直接运行的激活命令。输入必须包含操作者固定的数据库 UUID/库名、精确本地管理员 ID/用户名、配置摘要和幂等键。事务重新读取服务器身份、UTC 时钟和当前 active/local/admin 身份，使用与登记事务相同的安装锁顺序。完整 v1 配置（enabled=false）、installation active_config_version=1、操作回执、intent/result 审计和容量预留必须一起提交；任何写入失败都回滚。重复请求重新鉴权；同键异体冲突；已有配置或安装拒绝二次初始化；提交结果不明只能保留原键重试。

`BootstrapAdmission` 是尚待部署实现的强制接口：必须核对有效 offline grant、实际 RBAC、全部九类 registry 与二十类 typed ref、用途隔离、nonce material 和实际容量。同一事务内使用该接口，缺少实现直接拒绝。当前仅在测试代码提供 synthetic admission，生产 runtime 没有接入测试实现，也没有开放首次授予 security_admin 的 HTTP 旁路。因此这部分是已完成本地及隔离真实 MySQL 验证、待部署接入的事务组件，不能标成已完成配置激活。

运行时 JSON 新增必填 `expected_server_uuid` 和 `expected_database`。当前身份快照对应 `f1f5f76a-95f5-11f1-b08e-366835b4a029` / `clawmanager`。启动、配置检查、登记鉴权、TOTP 事务及 S3 观察事务检查各自连接的数据库身份。其他数据库上的相同数字用户 ID 不会获得此候选的授权。更换数据库须重新解析管理员并更新可信输入，不能删除这两个 pin 绕过检查。独立 HTTPS 服务收到正常关闭信号后现在正常退出。

隔离远程探针扩充了两个子项：`https_registration_replay_conflict_and_revocation` 使用真实 TLS listener 与隔离 MySQL，验证同键重试、冲突与权限撤销；`first_config_bootstrap_atomicity` 使用本次从原迁移精确抽取的完整 config/state/operation DDL，在另一 run-owned 数据库验证结果审计失败回滚、并发仅一个提交、摘要/小数持久化、数据库错配、二次初始化和管理员撤销。该测试的 registry/ref/session admission 仍为显式 synthetic fixture，不能当作真实部署或本人 MFA。数据库按本轮精确名称及 server UUID 校验后清理，不写实际应用库。新增用例现已由 `sbk-mig-260928040448-6b0a` 的远程结果验证；旧 6/6 PASS 和旧二进制/DDL hash 仍不覆盖本轮。

复测使用同一入口，默认单进程构建且全程禁止下载依赖：

```powershell
& .\scripts\system-backup-d-provider-registration.ps1 -Remote -SshTarget root@10.130.14.23
```

无需重建两个真实 issuer，也无需重复管理员只读解析。此命令只运行隔离验收，不部署服务或激活实际配置。

本轮最终本地结果已保存于[初始化组件验证记录](evidence/system-backup-d-bootstrap-local-20260928.json)：安全包测试及默认 vet 通过（1.357 秒），Linux MySQL 探针与 HTTPS 服务均编译成功，规则重生成对照、PowerShell 语法和 gofmt 检查通过。新二进制 SHA-256 为 `51e618ceca9abefc8e75901cffa5d7508d691932530e0e39648b6cdc57d319fb`，DDL 为 `2661503d821ae4a5346609a6dfba93db5483b6538e71de46c2e686d9a050ceba`。此前沙箱内 Windows 编译/vet 子进程出现 `0xc0000043`，以及新增 schema 对照测试的读取范围错误，均记录在本轮证据中；修正测试后，同一离线 runner 在沙箱外完整成功，退出码 0。未安装依赖，runner 报告清理成功，本地确认 `.tmp-d-registration-*` 剩余目录数为 0。该本地记录生成时新增真实 MySQL 用例尚未运行；后续远程 PASS 见本文开头的独立接收记录，实际应用配置仍未变更。

2026-09-28 本地验证已完成：[机器记录与源码 SHA-256](evidence/system-backup-d-registration-runtime-local-20260928.json)。安全组件包测试通过，A 原始 3 个顶层复测（包含此前 4 个违规接受场景）全部通过，A 的测试断言未修改；provider/strong-auth 两个 Node 校验共 16 项通过，Python syntax 通过，Linux MySQL 探针和 HTTPS 服务均编译成功。两个 runner 的专用目录已清理，未安装依赖。A runner 仅调整为使用仓库 go.mod/go.sum 的离线模块模式，以支持新增的已有缓存依赖。完整核心应用未编译：现有 MinIO SDK 的 `klauspost/compress v1.18.0` 不在本机缓存，未尝试安装。

新探针 SHA-256 为 `0134051f33c48cda5f245f6738231689170b1f30de43f94ff962b78e345a0c02`，含隔离 runtime addendum 的 DDL SHA-256 为 `e3ea82737411a4cfdc49f84709bca462db4a9bbed2015b9b89b48bed05f3362a`。2026-09-28 操作者回传的真实 MySQL 8.4.8 测试已 **6/6 PASS**，包括新增 TOTP 持久化、防重放、限流和会话撤销；回传 hash 与本地记录一致，记录中的源码 hash 也已重新核对。详见[本轮远程证据](evidence/system-backup-d-provider-registration-mysql-20260928.json)。数据库、匹配 UID 的 namespace、远程 scratch 和本地缓存均有 CLEANED 标记；本地也确认 runner 临时目录不存在。该记录来自操作者控制台回传，未独立远程复查，未提供单独进程退出码。原本地记录保留验证当时的 `NOT_RUN` 状态，以本轮远程证据补充；不得复用 09-24 旧探针的 PASS。

## 已补入代码的路径

- `providerproof_registry.go` 在结构体解码前逐层核对大小写敏感的完整字段集合；禁止缺失、null、别名覆盖及非规范公钥 base64。强认证 policy 的 wire 字段固定为 `methods/acr/amr`。三个 profile 共用检查，原始文件 hash 仍单独校验。
- `providerproof_http.go` 接入合同路径 `POST /api/v1/admin/system-backup-provider-proofs`：强制 JSON/16 KiB 上限、单值幂等 header 与 body 一致、严格 proof header、服务端 actor、提交后返回 201 和 Location。提交状态不确定返回 503 `not_ready`，details.reason 为 `provider_registration_commit_unknown`；调用者保留原 body/key 重试。
- `registration_api.go` 和 `cmd/system-backup-registration` 提供独立 HTTPS listener。使用现有应用 HS256 access JWT，要求 exp/iat，subject 为 `user:<id>`，session 为 access token 的 SHA-256；不信任请求中的 subject/session 或 forwarded identity。HTTP 请求不能借 `X-Forwarded-Proto` 冒充 TLS。
- `totp.go`、`totp_sql.go` 提供真实 TOTP 算法及登记/确认/签发路径：密码复核、每用户随机 seed、AES-256-GCM 加密且绑定 installation/user、数据库时间、事务锁下消费 step、持久化失败限流、请求摘要/幂等键/会话绑定的短期 Ed25519 proof。首个动态码仅确认登记，操作 proof 需要下一动态码。未提供自动重置 MFA 的旁路。
- `transit_signer.go` 使用固定 HTTPS endpoint、CA、key/version 和单用途 token 调用 OpenBao；拒绝重定向，并用 registry 公钥本地复验返回签名。provider 与 strong-auth 使用不同 key、token 和 purpose。
- `providerproof_s3.go` / `s3_read_client.go` 的实际观察适配器仅覆盖 **S3 external_action 的 provider_presence**：从锁定的数据库 action 读取目标，核对 active config 的 provider identity、限定 bucket/prefix，HEAD 获取对象版本，再 GET 该版本并计算实际 SHA-256/长度。403、404、超时、删除标记或无版本对象均拒绝，不伪造 absence。支持 manifest/marker/acceptance action；catalog、staging/restore ownership、absence 尚未实现。
- `registration_files.go` 从只读挂载中按 config 固定 kind/version/hash 加载 registry，按完整配置历史解析 nonce identity/version，拒绝同版本身份歧义或缺少历史 material。
- `registration_runtime.go` 装配上述组件并要求实际 active config 与 runtime 中的版本和三个 registry pin 一致。`-check-activation` **仅验证已存在的活跃配置，不是激活命令**；它不创建配置、不更新 active_config_version、不绕过 config_update 的权限/nonce/幂等/审计协议。
- `registration_capacity.go` 使用数据库身份和时间绑定的容量报告，事务内保守预留 evidence、operation、nonce 和 audit 开销。报告过期、物理 headroom 不明或预算不足均拒绝。预留不会因 statistics 刷新自动归零，需要后续在停止写入时建立可靠基线；这不能替代其他控制面写路径统一采用同一容量协议。

S3 location hash 当前 draft 定义为固定字段 canonical JSON `{bucket,endpoint,key}` 的 SHA-256，action hash 为实际 action_key 的 SHA-256；登记与观察使用同一实现。该映射仍需 A/C/D 复审，不代表已有正式映射批准。

## HTTPS 流程与敏感输入

所有请求使用现有登录获得的 `Authorization: Bearer ...`。密码、动态码、enrollment URI、token、nonce material 和加密 key 不进入证据文件或日志，不在聊天中传递。

1. `POST /api/v1/admin/system-backup-strong-auth/enroll`，JSON `{password}`，返回私密的 `enrollment_uri`。只有 deployment 固定 RBAC 中的 security_admin 且当前 DB 用户仍为 active/admin 才允许。
2. 在用户自己的认证器添加 URI；`POST .../confirm` 提交 `{password,code}`。动态码由用户输入，代理不能生成一个测试码并称作真实用户验收。
3. `POST /api/v1/admin/system-backup-provider-observations`，JSON `{target,expected_row_version}`，重新校验会话、RBAC、目标可见性，返回实际观察后签名的 provider proof。
4. 用户形成完整登记 request；`POST .../proof` 提交 `{password,code,request}`，返回 `X-Strong-Auth-Proof` 的 padded-base64 JSON header 值。动态码成功 step 在数据库事务内消费。
5. 向登记路径提交相同 request，使用相同 `Idempotency-Key` 及上述 header。201 才表示事务提交。已提交的相同请求可在 proof 过期后重试，但必须重新通过当前会话/权限检查。

核心应用增加了可选的 logout hook：部署必须设置 `SYSTEM_BACKUP_REGISTRATION_INSTALLATION_ID` 并包含本轮 `AuthHandler`/main 改动，才能将普通 `/auth/logout` 接到 D 会话撤销。撤销记录同时阻止旧 access token 再次创建 D 会话；修改密码后旧 credential hash 绑定也会失效。仅启动独立 listener、不部署核心 logout hook，不能作为完整会话验收通过。

## 数据库与部署输入

四张运行表现已通过 `080_add_system_backup_registration_runtime.sql` 纳入正式 embedded migration catalog，并登记为 D-owned、metadata_only/reference_only；TOTP 为 secret，数据行不进入业务备份。A 交叉评审仍为待确认。历史 `deployments/k8s/system-backup-provider-lab/registration-runtime.sql` 保留供既有证据与 DDL 对照，后续 runner 使用正式 080；本次新迁移尚未在远端验收或应用库执行。详见[运行时部署增量](system-backup-d-runtime-deployment-20260928.md)。

独立服务读取 deployment 固定的 runtime JSON（字段见 `RegistrationRuntimeConfig`），并用 `SYSTEM_BACKUP_REGISTRATION_RUNTIME_SHA256` 校验其原始字节。数据库 DSN、TLS cert/key、JWT key、两个 Transit token、TOTP encryption key、S3 只读凭据、历史 nonce key 均从指定挂载文件读取。启动/校验失败只输出固定错误，不暴露底层凭据或 provider/SQL 文本。

`--collect-capacity /absolute/path/report.json` 必须运行在可读取实际 MySQL datadir 的 Linux sidecar 中。它核对 `auto.cnf` 的 server UUID 与 SQL server 一致，再采集该数据卷的可用空间和 control table/index 占用；每秒原子更新报告。API 只读挂载报告，超过 5 秒即拒绝。应用 Pod 自己的磁盘空间不能代替数据库数据卷空间。

独立 strong-auth 公钥已于 2026-09-28 准备成功：run 为 `d-mfa-605b0a987c4d17bb3f642e72`，registry SHA-256 为 `6b309f8cd8c48f06b131d4a5efc4003556f552436d82fc84044f723b6aec6e8f`，操作者报告退出码 0。已核对本地 registry 原始字节、候选结果、生成脚本 bindings 和 handoff，确认其公钥与 provider-proof 公钥不同；有效期为 UTC 2026-09-28 01:26:11 至 2026-12-27 01:26:11。候选结果报告临时控制 Pod 已删除，密钥及 immutable registry 保留。见[原始候选记录](evidence/system-backup-strong-auth-issuer-d-mfa-605b0a987c4d17bb3f642e72.json)。这不是签名服务、本人 MFA 或配置激活验收，三个状态仍为未完成。

当前尚无经实际验证的完整 runtime 文件、两个最小权限运行 token、已部署 TLS listener/collector、经 mutation 提交的活跃配置或本人 TOTP 验收记录。不会用占位 hash、测试 MFA 或任意 SQL UPDATE 补齐这些前置。

## 可执行的远程下一步

代理最后一次只读 SSH 检查返回 `Permission denied (publickey,password)`，没有可用的非交互身份。以下步骤由现有密码终端执行；不需要在聊天中提供凭据。

新增 MySQL 探针已执行通过，无需原样重跑。以下命令保留供代码变化后的复测使用（仍是 synthetic 用户与签名 key）：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-d-provider-registration.ps1 -Remote -SshTarget root@10.130.14.23
if (-not $?) { throw 'MySQL probe or cleanup failed' }
```

独立 strong-auth key 已创建成功，**不要重复运行以下历史创建命令，也无需执行其 RECOVERY**：

```powershell
node .\scripts\system-backup-d-strong-auth-issuer.mjs create --ssh-host root@10.130.14.23 --installation-id installation_sbk_provider_zh_7474d6e0b052 --ssh-password
$mfaExit = $LASTEXITCODE
Write-Output "d_strong_auth_issuer_exit=$mfaExit"
```

它只准备独立不可导出 key 与候选 public registry，自动按 UID 清理临时 root-mounted Pod，保留配置 key/intent/registry；不签发 MFA、不激活配置。真实 provider-proof key `d-issuer-d7f0a14ec84d78927620d25f` 不需要重建。

两把现有真实 issuer key 的签名与权限隔离验收已通过，无需重复运行或执行本次 RECOVERY。以下命令保留供相关代码变化后的复测：

```powershell
node .\scripts\system-backup-d-issuer-signing.mjs run --ssh-host root@10.130.14.23 --ssh-password
$signingExit = $LASTEXITCODE
Write-Output "d_issuer_signing_exit=$signingExit"
```

该脚本固定本次两个 registry 的 hash 和远程 immutable checkpoint UID，先核对现有 key fingerprint 与 TLS CA；控制 Pod 创建两份短期、不可续期、无默认策略的专用测试 token，两个普通 Pod 各只挂载一份 token。ACL 只允许对应 `transit/sign/<exact-key>`，显式要求字符串 `key_version="1"`，与固定 handoff 的 `provider_wire_parameters.signing_key_version` 一致，不得省略版本或追加参数。参数约束依据 [OpenBao policy 文档](https://openbao.org/docs/concepts/policies/)。成功签名的输入采用 `D_TRANSIT_ACCEPTANCE_V1` 测试域，不能作为真实用户 MFA 或业务 provider proof 使用。本地 Node 使用已固定公钥独立复验两份 Ed25519 签名，并要求交叉 key、漏传/错误版本、额外参数、key 读取和撤销后访问等 16 个请求均被 403 拒绝。

脚本不改 issuer key 和活跃配置；测试结束撤销 token、删除临时策略/Secret/Pod/intent。cleanup 按 namespace UID、intent owner UID、精确名称和 token metadata 核对，不按前缀删除。发生错误保留 `d-sig-*` run ID；新版只在清理未确认时需要 RECOVERY，若明确输出 `cleanup=complete`/`CLEANED` 则无需再次清理。原始 provider 输出和凭据不进入聊天或证据。该验收仅证明真实 Transit 签名与 ACL，不执行 Go HTTPS handler、S3 观察或本人 TOTP，也不保留部署运行 token。

首次真实执行 `d-sig-1cc37da4b37ca37297b8b10b` 在 `provider.sign.normal` 失败，退出码 1，详见[失败记录](evidence/system-backup-issuer-signing-d-sig-1cc37da4b37ca37297b8b10b.failed.json)。旧 runner 只有 cleanup 返回成功后才恢复该失败阶段，因此从控制流可推断该 run 已清理；没有独立远程复查或显式 CLEANED 回传，不能将推断冒充实测。已发现探针和 Go `TransitSigner` 发送数字版本，与此前固定 handoff 要求字符串版本不一致，现统一修正；原失败日志缺少 HTTP 状态，最终根因和修复效果仍待远程复测确认。新版在保持非零退出的同时记录受限错误码、HTTP 状态及显式清理状态，禁止写入原始响应。此次变更不改变数据库事务/DDL，但旧二进制 hash 不覆盖修改后的 signer。

格式修正后本地验证：安全组件包 `go test -count=1 ./internal/systembackupsecurity` 通过（2.032s），19 项 Node 测试及 9 项 Python 检查通过；专用 Go cache/tmp 已清理，Python 使用 `-B`，未安装依赖。TLS signer 回归测试明确要求字符串版本，数字版本不能被该测试服务接受。见[修正验证记录](evidence/system-backup-d-issuer-signing-wire-fix-20260928.json)。本次未重跑真实 MySQL，也未执行修正后的远程签名验收。

上述修正记录的 `NOT_RUN` 是当时状态，现由 `d-sig-fa480a2d4c87ebdf0e48f9e6` 的远程结果补充：`real-issuer-signatures=2`、`acl-denials=16`、`local-ed25519-verification=yes`、`CLEANED signing-test-resources=yes issuer-keys-retained=yes`、退出码 0。该结果的原始字节 SHA-256 为 `b6c5bca348f1b9d7b7235af7c3b5402af9dd3a036c4346f68d97793cf68a07a5`。修正后的路径已通过实测；由于首次失败未记录 HTTP 状态，仍不把那次失败的具体 HTTP 根因写成已确认事实。

下一步接入 HTTP 所需的实际管理员 RBAC 绑定。登记运行时使用 `actor_id=<十进制用户ID>`、`subject=user:<同一ID>`、`role=security_admin`，且仍复查数据库当前 active/admin 状态。需由操作者指定用于本人 TOTP 验收的现有 ClawManager 账号；不能推定 ID=1、把 Kubernetes SSH 管理员当作应用用户，或授权所有 admin。账号标识可以回传，密码、动态码及 token 只在后续受保护的交互中输入。

操作者随后同意按默认本地账号 `admin` 继续核对。已准备 `scripts/system-backup-d-admin-identity.mjs` 和 Python 只读执行器：固定既有应用 namespace UID 与 provider lab UID，选择唯一 Ready MySQL Pod，验证 Pod→ReplicaSet→Deployment 的 UID 归属；在 READ ONLY 事务内查询精确用户名、本地认证来源、用户 ID、角色/启用状态、数据库 UUID 以及配置/运行表计数，并在查询后再次核对 Pod 和 namespace。不会读取密码哈希、邮箱、token 或配置正文，不创建远程对象，不激活配置。

```powershell
node .\scripts\system-backup-d-admin-identity.mjs --ssh-host root@10.130.14.23 --username admin --ssh-password
$adminExit = $LASTEXITCODE
Write-Output "d_admin_identity_exit=$adminExit"
```

仅在唯一、启用的本地管理员通过验证后，入口才写入本地 `system-backup-admin-identity-d-admin-*.json` 及 `system-backup-registration-rbac-d-admin-*.candidate.json`。候选绑定必须与报告中的 database/server UUID 一起使用，不能把该用户 ID 原样套用到新建隔离数据库；换库必须重新解析真实账号。候选文件仍不是 active registry 或已完成 HTTP 验收。18 项本地检查通过（13 Node + 5 Python），无新增依赖或测试构建产物。操作者现已成功执行 `d-admin-7d01a0782656f2af361b56e5`，该步骤无需重复运行。代理非交互 SSH 仍无可用身份；后续远程操作仍不能依赖在聊天中传递凭据。

管理员身份核对时的实现检查曾确认：当时只有读取既有配置的 bootstrap checker 和只读 `-check-activation`。本轮后来加入了上述首次配置事务组件，部署 admission/调用入口及完整 `config_update` 仍未完成。不能提供一条伪称“激活”的 SQL 或命令。09-28 的新只读快照已再次确认当前为零配置/零活跃安装；`ConfigUpdateRequest.expected_version` 最小值为 1，初次安全权限授予须走 offline bootstrap，不能假装已有 version=1 后调用更新接口。

后续仍须完成：运行 token 的最小权限发放及交叉用途拒绝、部署 TLS listener/collector 和 core logout hook、完整 config_update mutation/bootstrap、失败 HTTP 请求审计策略、其余目标/ownership/absence 适配、共享容量跨写路径集成、真实 commit 断连与跨安装 HMAC 轮换并发，以及用户本人动态码驱动的端到端验收。以上任何项目都没有在本记录中宣称完成。

实现参考：TOTP 使用 [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238)；窄范围 S3 SigV4 读路径按 [AWS 签名文档](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html)，并与仓库 A-owned Python signer 的固定向量比对。
