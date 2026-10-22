# A：测试环境真实授权、证据下载与审计链路

【2026-10-22 隔离审计采集器 17 项已接收】[新验收](system-backup-a-live-audit-mysql-20261022.md)关闭独立采集器的合成选定列 MySQL 专项：17 项、五份 SQL 样本的 Node 正负复核、原源码/程序绑定、准确 UID 清理和退出 0 齐全。它没有真实 HTTP、正式部署 schema、TLS/MFA/provider 或生产下载运行装配，不改变下方 27 项缺口与整条真实链路待验状态。原受验来源已归档，后续共享 checker 的独立本地修改不回写本轮结果。

【2026-10-22 接续核对】操作者已明确 B/C 的 bootstrap 适配器及实际资源交接材料尚未交付；不是遗漏了某个已知路径。当前源码仍缺 27 个检查槽位，不能把公开候选包或历史 lab 测试当作这些实现。[本轮接续记录](evidence/a-live-chain-continuation-review-20261022.json)固定下面两项新核对及来源摘要。本次没有更改旧输入摘要、运行远程命令或新增适配器，真实 HTTP/SQL 链路仍未验收。

另一 A 已接收[10 月 22 日公共现场盘点](evidence/a-field-public-inventory-reviewed-20261022.json)。本对话核对其原 transport 回执 SHA `07a599af6c63e4bd02105dae0f7592997580f811928127a83367a9253fba9e8d`、SSH exit 0、准确 namespace UID 和选定字段：9 Pod/9 容器/5 PVC，app 仍是原 fix18 imageID，显式支持的 DSN 引用为零，未观察到下载 journal 路径挂载。envFrom/实际进程配置未采集，不能据此认定所有 DSN 不存在；该回执未执行 SQL、未重新检查 provider TLS/token。无需重复同轮公共盘点；下一步依赖实际资源实现与受审运行装配。

旧 `registration-bootstrap-d-admin-7d01a0782656f2af361b56e5` 公开候选另有本地失配：声明的完整 `admin-control-resources.schema.json` SHA 为 `0f6224f3c5f499102ad9148f40bf4e2a3997cd144fe82e898c6740f85c7532bc`，当前文件为 `6d1c88a46406bc4488b6c7f35545ffc4dfd286e3b020cea916e1980f07e1a865`。现有 `system-backup-d-activation-inputs.mjs` 因这项检查退出 **1**，不能当作历史“输入完整但阻断/exit 2”。这只是完整 schema 字节变化，不据此推断 ConfigValues 子定义必定改变；旧 pin 不自动更新。该候选仍仅声明三个 registry 和一个 reference，没有完整 `bootstrap-config.json` 或 `runtime.json`，不能直接生成 apply 包。

【16:56 定向回执已核对，暂停重复远测】[状态记录](evidence/a-live-chain-state-review-20261021.json)确认 config=0、安装/evidence 查询无行、登录 session recorder=false、安装未配置。现场 `--requirements` 明确缺 30 项/exit 2，镜像 digest 为 `c16f07c2...5c6c9d`；注册二进制存在，但 help 未显示下载相关参数。因此目前无有效配置可直接复用，缺口是未完成的 bootstrap/provider 接线与旧部署，不能靠制造一行 config 或签一个 token 补齐。

本地先新增独立 `systembackupbootstrapsecurity` 包的 RBAC 适配器，接续又补两类 issuer registry 的校验接线；当前源码缺项为 27，16:56 回执中的部署缺 30 项。检查读取固定 SHA/版本的真实挂载文件，在借用的原 SQL 事务中核对数据库身份并重读原文件，不写入/提交。没有修改另一 A 的 owner／角色探针或其接收器，未部署新镜像；具体验证结果见下文。

现场 ledger 97 个文件名与当前仓库 96 个不同：仓库的 `064_add_instance_browser_workers.sql`、`081_fix_system_backup_prune_item_identity.sql` 未出现在账本；账本另有 `045_update_workbuddy_windows_runtime.sql`、`046_add_instance_pvc_name.sql`、`047_add_instance_runtime_variant.sql`。这只是名字差异，不代表已经判断物理 DDL 不等价；不能据此盲目重跑全部迁移。旧 provider CA、两张下载回执表、运行角色、容量/journal、STS/OIDC 与实际人员 MFA 等现场缺口继续保留。下一步以补齐代码/受审部署材料为主，当前不再要求操作者重复盘点。

【16:40 新回执已核对】[现场观察记录](evidence/a-live-chain-environment-review-20261021.json)固定原回执 SHA，确认 SSH exit 0、MySQL 8.4.8/准确数据库 UUID、provider CA 已于 `2026-10-01T01:19:11Z` 过期、两张下载回执表未出现、系统 namespace 未观察到独立下载运行时及 journal claim。容量 report claim 不能替代 journal。旧盘点把安装状态表误写为 `system_backup_installations`，现已按正式 065 修正为 `system_backup_installation_state`；原输出不能据此证明安装状态表缺失，config 行及 active 版本也尚未采集。

16:40 检查时源码的 bootstrap 主入口 `linkedOwnerAdapters()` 返回空集合；后续本地增量已接入 RBAC，部署镜像尚未更新。以下定向状态检查已在 16:56 完成，保留命令供复核，不要求重复执行：

```powershell
.\scripts\system-backup-a-live-chain-current-state.ps1
```

这个入口固定本轮 namespace、MySQL Pod、server UUID 和 app Pod UID，读取 config/安装元数据、evidence 分组计数、migration 文件名、镜像 digest、实际登录 session recorder 开关及两个现有 CLI 的帮助/requirements。它不扫描其他 namespace，不打印密码/正文/provider locator，不启动新服务、不写库。缺失适配器的 CLI exit 2 被保留为 blocker；外层成功仅表示观察完成。原字段、fixture 和已经完成的 owner／角色专项不随该检查改写。

state-only 新边界和包装器回归已加入本地套件：完整 Node 11 项、PowerShell 7/5.1 均通过；其后补充的实际 shell session 开关 true/false 输出又通过同一 state-only 定向回归，未重复其他套件。自有临时目录已独立核对缺席。历史普通模式及之前的失败回执保持。读完定向状态后才能决定复用已有配置或补首次 bootstrap 接线；当前不创建 candidate 下载表、替换 provider TLS 或配置新 grant。

此工作与另一 A 对话的 owner 十一项／受限角色十项及接收器基线工作分开。交付包含现场盘点、真实 HTTP 验证客户端、原始 SQL 审计核对工具及下述 bootstrap 安全 registry 增量；没有修改迁移、owner／角色探针或接收器，也没有启用任何工作负载。真实环境整条链路仍待现场条件及后续回执。

## 2026-10-22：验证回执的源码一致性

本对话的 `scripts/system-backup-a-bootstrap-security-validation.ps1` 现由独立 `scripts/system-backup-a-bootstrap-source.ps1` 统一枚举原有验证范围，在复制后、冻结副本测试结束后及工作目录结束检查时重新核对文件集合和内容。新增、删除、修改分别记录在 `added`、`removed`、`changed`，必需 fixture 缺失另列 `missing_required`；枚举包含被 ignore 的源码，以免漏掉实际会参与 Go 编译的文件。该范围只属于本对话的安全 registry 验证，不替代或调整另一 A 的整体门禁。

新回执分别记录 `frozen_validation_passed`、`frozen_source`、`current_source`、`current_validation_inputs` 和 `current_inputs_match`。当前源码或入口/helper 与测试输入不一致，或者检查发生错误时，不得把冻结通过当作当前通过：保留冻结结果，状态改为 `frozen_security_validation_passed_current_inputs_drifted_or_unverifiable` 并退出失败。原 Go 测试失败、冻结副本改变仍保持 `failed`，不会被当前目录一致所升级。回执中的当前一致性只证明记录时的观察，不锁定后续共享目录编辑。

本次仅修改验证工具，没有重新执行 Go 包回归、Linux 编译或现场命令。历史三个包通过仍只适用于原固定输入。[本次源码复核记录](evidence/a-bootstrap-source-review-20261022.json)固定原回执及新工具的摘要，当前选择为 372 项，新增 `backend/internal/systembackupread/verification_detail.go`，原清单无删除、无内容变化；这印证了下文已经披露的历史覆盖边界。

`scripts/system-backup-a-bootstrap-source.test.ps1` 在 PowerShell 7 与 Windows PowerShell 5.1 各通过 30 项检查，两个进程均退出 0。测试覆盖文件集合与内容差异、必需文件删除、ignore 内源码、无关回执不入范围、基线摘要/重复路径拒绝，以及实际验证入口的回执、异常退出、环境恢复和清理。入口场景使用合成源码与替身 Go 执行器，只证明工具流程；没有把替身结果计作 Go 回归。冻结副本被加入源码和 Go 步骤失败均保持失败；工作目录或校验 helper 变化均保留冻结通过但拒绝当前通过。测试后已删除两轮独占夹具目录及其全部临时回执、副本、cache/tmp，不安装依赖。

## 2026-10-22：剩余资源交接清单

[27 项 bootstrap 资源交接清单](system-backup-a-bootstrap-resource-handoff-20261022.md)逐项列出 6 个 registry、20 个 reference 及跨资源检查的材料、协调范围与验收要求，并给出通用 Prepare/Recheck 接口、组合位置和接收顺序。已用当前源码闭集与实际装配逐项核对，清单无重复/遗漏；[核对记录](evidence/a-bootstrap-resource-handoff-review-20261022.json)固定 18 项来源摘要及各行内容。协调范围依据既有主计划，不构成新分工或交叉签收，本次未向其他对话发消息、未新增适配器、未运行测试/构建或联系现场。

另一 A 的[统一现场采集](system-backup-a-field-evidence-handoff-20261021.md)已覆盖 SQL 物理元数据、证书与运行卷，故不再另建扫描器；需要确认部署是否更新时复用其 `scripts/system-backup-a-field-inventory.ps1`，完整采集则沿用其受审 plan/CheckOnly 流程。原 27 个接线缺项与真实 HTTP/审计待验状态保持。

## 两类 issuer registry 接线

新增 `systembackupbootstrapsecurity.Issuers`，同时为 `provider_proof_issuers` 和 `strong_auth_issuers` 两个槽位检查同一对固定内容寻址文件。provider scope 必须绑定原 grant 的 installation；两类公钥包含历史/撤销版本在内均不得共用。provider 的 target/proof 列表必须属于实际支持的类型、无重复且具有可用的对应关系。两个 registry 都须存在未撤销、已生效并保留超过五分钟有效期的版本；强认证侧还须支持实际 registration runtime 的 TOTP/otp 配置。仅保留过期/撤销/尚未生效的版本不能通过。

新增公开 `DecodeStrongAuthIssuerRegistry`，由 bootstrap、原 `PinnedRegistrationAuthority.Load` 与实际 `LoadRegistrationApplication` 共用。它沿用固定摘要、准确大小写、完整非 null 字段、无重复/未知成员及规范 base64 校验，并核对用途、key/version 唯一性、时间区间、支持的认证方法与 ACR/AMR 策略。允许保留结构合法的历史版本；同 issuer 同时生效的版本必须具有相同策略。Recheck 重新读取原固定文件及当前时间，能够拒绝 Prepare 后密钥到期或未来版本生效导致的策略冲突。

这里只验证部署公钥信任配置，没有连接实际 signer、签发 proof 或登记人员 MFA，也不证明 Secret/KEK、provider STS/OIDC、运行角色、TLS、journal 或其他跨资源条件已通过。对应 typed-ref 与跨资源槽位保持缺失。

本轮验证入口改为 `scripts/system-backup-a-bootstrap-security-validation.ps1`，冻结完整 security 测试所需的 371 项输入，执行 security、bootstrapsecurity、bootstrap 命令三个包默认测试与 vet，再编译 Linux 命令。[第三轮最终回执](evidence/a-bootstrap-security-local-20261021-180508-7e896abf.json)确认三个包全部通过，分别为 133.539s、31.944s、3.907s，默认 vet 保留，Linux 编译通过，入口退出 0。执行使用单并行度和 600 秒测试时限，未安装依赖、未联系现场；起止 UTC 为 `2026-10-21T10:05:08.4133684Z` 至 `2026-10-21T10:42:41.3419967Z`。前轮 RBAC 专项回执作为当时固定源码的历史结果保留。

最终回执 SHA256 为 `7c5c406a6b1a2476e5dae67ad8ff870b1bc1797e05c32cadda388e31b58c8130`。源码输入摘要为 `2e9dc9fa100f5e0cefa31018bbc65e4fc93416fc6977a622d45fc600d0703a78`；结束后独立复核当前这 371 项仍匹配，验证入口及 helper 摘要也未变化。独立确认 `.tmp-a-evidence-132f1a6c6a614bc99bf9233a1d60ef7d` 不存在，冻结副本、缓存、测试临时材料及二进制均已清理。结果仅证明本地三个安全 registry 及命令接线，未证明整条真实 HTTP/SQL 审计链路；27 项及现场条件仍缺失。

当前文件集合另有一项并行增量：`backend/internal/systembackupread/verification_detail.go` 在冻结后加入，当前选择会得到 372 项。观察 SHA256 为 `1b4cd2832a8d9dad1cab4941b883eb3e7c8fc7fa7a325038a084c94f9787207e`；本轮安全包/适配器/命令源码没有引用新增方法，文件本身仅有函数和常量定义，没有 `init` 或包变量初始化，但它仍未包含在本轮编译/测试中。本轮不覆盖、不验收该新增 read 文件，也不宣称当前共享工作树整体通过；其独立验证与整体基线接收继续由相应工作负责。原 371 项回归及其清理结果保持。

首轮[失败回执](evidence/a-bootstrap-security-local-20261021-173920-4f75a639.json)保留：完整 security 包超过入口设置的 180 秒总时限，panic 时正在执行旧 `TestConfigOperationAActualStoreRejectsContradictorySQL` 的普通用例，栈仍有 regexp 计算及 runnable SQL 清理 goroutine；这是总超时，不能判为完整回归通过。bootstrapsecurity（26.568s）和命令（3.715s）各自通过，但整轮退出 1，Linux 编译未执行。本轮目录 `.tmp-a-evidence-34b1ad6a06154eae9c39521b71b4c58f` 已清理并独立核对不存在。后续入口恢复 Go 的默认 600 秒测试时限，并将编译/Go 并行度设为 2；相同三个包完整重测，测试范围及断言不删减。

第二轮[工具启动失败回执](evidence/a-bootstrap-security-local-20261021-180021-dc28107a.json)也保留：相同 371 项/相同摘要，600 秒时限、并行度 2。多项 Windows compile/asm 以 `0xc000026b` 退出，现有 helper 原命令重试后 Go 进程自身也退出，整轮失败、未编译 Linux。随后普通执行环境连只读终端也报 `OpenDesktopW failed: 624`，改用可正常启动的本机执行环境只读核对，确认回执 failed、cleanup=true，且已无本轮临时目录；没有停止其他会话进程。入口现默认并行度恢复 1，并在后续回执记录入口/helper 摘要及起止时间，继续原三个包完整验证。两轮失败均不升级为通过。

当前尚缺 27 项：6 类 registry（parts、redis_sources、failure_domains、disaster_identity_mapping、source_writers、secret_allowlist）、全部 20 类 reference 和跨资源校验。继续接线需要具体资源的正式 schema、准确身份/版本、权限及能力来源，不能只用配置中声明的 hash 或 JSON approval 替代。现场安装仍缺配置/安装记录、session recorder 开关和完整部署输入；TLS、候选下载表的受审安装、迁移物理等价性、运行角色和 journal 条件仍按上述回执推进，当前不重复盘点或生成可执行 apply 包。

[Secret 准入材料核对](evidence/a-live-chain-secret-admission-gaps-20261021.json)固定现有合同及真实 broker 代码摘要。仓库的 broker read allowlist 为零项 staging 列表，另一份仅有一项 `functional-test` Secret；不能由此证明当前安装的 Secret/KEK/nonce 权限。文件自带的 `registry_sha256` 绑定有序投影，bootstrap `RegistryBytes` 却要求准确完整文件字节的 SHA，两者不能直接混用。实际 `ParseSecretBrokerReadAllowlist` 接收逗号/换行分隔字符串，没有读取该 JSON 的版本或摘要。现有 draft SecretRef 与 bootstrap 还使用不同的 purpose 名称，需要资源 owner 给出适用的 typed 映射及实际身份/能力检查，不能按相似拼写强转或以“32 字节文件存在”代替 nonce 准入。本项核对没有消掉任何 adapter 缺项，也没有读取凭据或改动 broker。

## Bootstrap RBAC 本地增量

新增 `backend/internal/systembackupbootstrapsecurity/rbac.go`，并由 `backend/cmd/system-backup-bootstrap/main.go` 固定装配 `/run/system-backup/registries`。目录来自代码装配，不能由 HTTP 请求选择；文件路径使用现有内容寻址布局 `rbac_bindings/<version>/<sha256>.json`，沿用现有 256 KiB、SHA、关闭 JSON schema、安装及角色校验。只有匹配原 grant 人员的 `security_admin` 可通过，并要求每条绑定的 subject 与其 actor_id 一致，防止其他人员声称当前管理员 subject。

Prepare 只读取固定角色文件并核对 grant/config 绑定；Recheck 使用调用方原事务执行唯一身份查询 `SELECT @@server_uuid,DATABASE()`，然后重读相同固定文件。它不执行 SQL 写入、不提交事务、不访问 provider、不创建人员或 MFA。原 bootstrap 外层继续负责当前有效离线 grant、本地 admin 锁及所有资源齐备检查；本适配器不能独立完成初始化。前轮仅接入 RBAC 时，`--requirements` 为 blocked/exit 2、缺失 29 项；本轮加入 issuer 后为 27 项，仍未打开数据库或做 provider admission。

前轮 RBAC 验证入口已扩为上述 `scripts/system-backup-a-bootstrap-security-validation.ps1`。原轮冻结所需 production 依赖、新包及 bootstrap 命令全部测试和准确 fixture，前后核对摘要，在独立 cache/tmp 中离线执行两个包完整测试（默认 vet），再编译 Linux bootstrap。结束删除本轮缓存、冻结源码和二进制，仅保留可审阅的输入摘要／状态回执；不安装依赖。

前轮[本地验证回执](evidence/a-bootstrap-rbac-local-20261021-170848-43c8d063.json)状态为 `local_rbac_and_requirements_passed_remaining_29_adapters_blocked`：两个包完整测试、默认 vet 和 Linux 编译均通过，入口退出 0。首轮测试用例通过但 `compress/flate` 的 Windows `vet.exe` 以 `0xc0000043` 崩溃，故整轮失败；现有守卫对完全相同命令重试一次后通过，没有关闭 vet 或重试测试断言失败。103 项冻结输入摘要为 `47740387a9c3707d2f948d70072447c3a74895fa4486c0476ef4b192b98c7c4d`，当时独立复核所选输入仍相同。回执 SHA256 为 `bef34bb962aee2344279f030247726806c2df81dc75ac3614e9b13ae93ca82bb`；独立确认原轮 `.tmp-a-evidence-b1eb10180af144e383adc2b6d8b02be4` 已不存在，缓存、二进制和测试临时材料均清理。没有现场 HTTP／SQL 审计通过声明。

另一 A 的源码预检覆盖整个 backend/contracts 普通源码，因此本增量会触发其旧基线差异。这里不放宽、不改写它的门禁或接收材料；后续整体验收须由该流程审阅并纳入本增量。本地两个包通过也不能替代另一 A 的 owner／SQL role 验收或共享工作树整体放行。

## 第一轮现场观察及换行修复

操作者回传 `a-live-chain-inventory-20261021-161011-6cfacdab.txt`：Kubernetes context 为 `kubernetes-admin@kubernetes`，系统 namespace UID 为 `337cfe30-2c17-4b8e-b32a-760778b8098e`。现有 app 为 fix18；该 namespace 中没有带 `--download-runtime` 和下载独立 DSN 配置的 Deployment，也没有下载 journal PVC。已有容量 report PVC 不代替 journal，普通 app Running 也不代表独立下载 HTTPS 服务已装配。

原轮最后出现 `bash: line 29: $'\r': command not found`，SSH exit 127，失败保留。原因是 Windows PowerShell 向 native stdin 管道末尾另加 CRLF；本地先替换脚本内部 CRLF 仍不能消除最后这一行。包装器现使用远端 `tr -d '\015' | bash -s -- ...`，并保留本轮脚本、完整 payload SHA、远端退出码和独占创建的公共回执。原轮观察不记为完整盘点成功。

## 下一条现场命令

在仓库根目录执行。两个 namespace 来自原现场输出，MySQL Pod UID 也使用原观察值；若对象已重建，数据库观察会在执行 SQL 前拒绝，需要先核对新身份，不能删除 UID 守卫。

```powershell
.\scripts\system-backup-a-live-chain-inventory.ps1 `
  -Namespace @('clawmanager-zhanghui08-system','sbk-provider-zh-7474d6e0b052') `
  -InspectDatabase `
  -ExpectedNamespaceUid '337cfe30-2c17-4b8e-b32a-760778b8098e' `
  -MySqlPod 'mysql-66496b8965-d6tsl' `
  -ExpectedMySqlPodUid 'dab1cbf6-ca49-4e16-bd2d-27e70da52004'
```

入口默认 SSH 为 `root@10.130.14.23`，数据库为 `clawmanager`。它读取工作负载、Service、Ingress、PVC 及 provider 实验 namespace 中公开 CA 的 subject/issuer/有效期/指纹；不输出证书私钥或 Secret 值。数据库阶段固定前后 namespace/Pod UID，通过已有 MySQL 容器的管理凭据仅执行三条 SELECT，输出 server UUID、库名、版本、SQL UTC 和指定表／列名。密码留在容器环境中，不经过本机命令行或回执。

管理连接只是特权观察者，不是注册／下载运行身份。输出明确 `runtime_grants_verified=false`、`active_config_verified=false`。表存在也不代表完整 schema、最小 grants 或 active config 已通过。源码中的下载 admission/result 表仍有独立候选 DDL，不能仅由正式 migration 数量推断已安装，更不能由盘点入口自动应用候选 SQL。

provider 原交接为七天测试证书、八小时且不可续期的测试会话；下一轮读取当前公开 CA 有效期。旧证书／会话不可当作当前可用授权，也不以静态实验身份冒充新运行时需要的 STS/OIDC 权限。缺失／过期只输出 blocker，不关闭 TLS 校验、不重造期限。

## HTTP 验证客户端

`scripts/system-backup-a-live-chain.mjs` 复用现有 HTTP 路由和 proof selector，不生成 JWT、TOTP seed、proof、owner 或 evidence。输入是公共测试计划：两个独立 TLS origin、证书名称、CA 文件及 SHA，安装／数据库／人员身份，指定测试 evidence ID、预期完整正文摘要／大小，以及下载运行时 SHA。完整下载限制为现有 8 MiB 响应上限，暂不扩为 Range／断线／撤权全矩阵。

现场输入齐全后，生成一次公共模板并填写经核对的事实。空模板故意不可运行，不填密码、token、proof 或 provider 密钥：

```powershell
node .\scripts\system-backup-a-live-chain.mjs --template .\docs\evidence\a-live-chain-plan.json
.\scripts\system-backup-a-live-chain.ps1 -PlanPath .\docs\evidence\a-live-chain-plan.json
```

两个 origin 都必须为无路径／凭据／query 的 HTTPS origin，允许使用经核对的本地转发端口，但证书仍按明确 `server_name` 和固定 CA 验证。客户端不跟随重定向，不提供跳过 TLS 的参数。公共文件与回执均不覆盖旧文件。

实际执行顺序：

1. 检查独立进程 readiness 的 204、空正文和准确运行时 SHA。
2. 检查匿名下载得到 401，不带 Operation ID。
3. 私密提示输入已有测试账号密码，调用应用 `/api/v1/auth/login`；服务器生成并验证的 access token 只留在进程内。
4. 检查带真实 token、无 proof 的下载得到 `strong_auth_required`，不带 Operation ID。
5. 此时才私密提示输入本人已有认证器的新 TOTP，调用独立服务 `/api/v1/admin/system-backup-strong-auth/proof`；固定 endpoint／evidence／幂等键，核对返回绑定。
6. 用同 token、proof 和键请求完整下载。正文流只用于计算 SHA／字节数，随后清零数据 chunk，不写到磁盘；核对 ETag、Content-Length、no-store、nosniff 和服务器 Operation ID。

包装器用重定向的私密 stdin 分两次传递凭据，不在参数、文件或 stdout 放入密码／验证码。只给子进程清除 Node 调试／注入选项，不改系统环境。不会自动 enroll／覆盖人员 TOTP，不会在失败后自动重复密码请求。尚未登记的人员 MFA、缺失的 DB session 记录或权限应作为现场 blocker 单独处理。

HTTP 通过状态固定为 `HTTP_PASSED_AUDIT_PENDING`，不把正文成功当作审计成功。用户中断或失败保留公共 blocker 阶段；已发生的登录／TOTP／下载业务事务不会被客户端伪造回滚或删除。

## 原始 SQL 审计核对

后续新增[独立只读审计采集器](system-backup-a-live-audit-collector-20261022.md)，可在真实 HTTP 成功及受审观察连接就绪后代替人工执行/整理 SQL。它复用下列固定查询，绑定完整观察账号/角色及前后同连接数据库身份，在只读事务回滚后输出无损原始结果；本地接收器再调用原审计核验，不把采集 envelope 当作签名证明。不会修改另一 A 的元数据采集入口，也不减少剩余 27 项 bootstrap 缺项。镜像构建入口已纳入新命令，当前现场镜像尚未更新，真实数据库尚未验证；具体命令和验证边界见新文档。

HTTP 新轮成功后，按其准确回执生成一条只读查询：

```powershell
node .\scripts\system-backup-a-live-chain.mjs --query C:\evidence\http-receipt.json --output C:\evidence\audit-query.sql
```

查询通过准确 `sop_...` 关联 Operation、admission receipt、原 intent audit、result retention link、原 result audit 与 consumed nonce。只用 SELECT/LEFT JOIN/LIMIT 2，不查询 password、token、proof、raw claim、nonce HMAC 或 provider locator。必须由操作者在同数据库中用已有受审观察连接执行，保留该单条查询的原始 JSON 输出；收到环境盘点和 HTTP Operation ID 后再固定实际 Pod／UID 的远程执行命令，不猜连接路径或授予权限。

```powershell
node .\scripts\system-backup-a-live-chain.mjs --audit C:\evidence\audit-export.json --receipt C:\evidence\http-receipt.json
```

接收器核对数据库／安装／人员／evidence／请求／会话绑定、三份关闭正文、原始 row version／claim 摘要、两个 audit ID 及唯一 nonce、原始 admission/result 规范字节数和摘要、SQL 时间顺序与保留期限。结果必须是 `local_write_complete` 且与客户端收到字节数一致。缺失、额外行、错链、重复／未知 JSON 字段及摘要不符均拒绝。

成功只记 `LIVE_HTTP_AUDIT_LINKS_PASSED`，并明确原始导出的操作者来源仍须复核、完整恢复 E2E 未通过。它不代替 provider ACL／物理容量／卷的验收、完整失败矩阵、另一 A 的 owner／角色专项或正式 schema 批准。

## 2026-10-22：HTTP 异常路径

客户端现统一处理请求错误、响应 abort/error/未完成关闭、正文超限及超时，失败时关闭连接、清理计时器和已缓冲字节。生产 CLI 每个请求仍使用 20 秒上限，没有新增 plan、环境变量或 CLI 超时覆盖参数；测试调用可缩短 transport 的实际时限，但不能超过 20 秒。登录、MFA 和下载没有自动重试。

失败仍为 `BLOCKED`，实际 CLI 退出 2；回执新增固定闭集 `failure_code`，不保存原始网络错误文本。响应已提供合法下载 Operation ID 时，保留该公开 ID；`partial_received_bytes` 记录中断前收到的有界字节数。响应完整但内容/长度/摘要校验失败时保留 `received_bytes`，不登记成功摘要。这些字段只表示客户端观察，不能说明服务端事务已回滚、nonce 未消费或下载结果已登记。诊断时保留原 Operation/幂等键；成功审计查询生成器仍拒绝 `BLOCKED` 回执。

[异常路径验证记录](evidence/a-live-chain-http-failures-20261022.json)固定当前相关文件摘要，完整 live-chain **26/26**、审计采集器 **7/7** 通过，无失败或跳过。26 项包含原 11 项、一个父用例及 14 个子用例：13 类本地真实 HTTPS 故障和一个实际 CLI 默认 20 秒超时用例。覆盖响应头前断连、正文中途断连、正文短于声明长度、chunked 短正文、错误摘要、正文超限、仅响应头/部分正文后超时、非法 Operation header、readiness/login/proof 超时及无效 JSON。请求计数与提示次数确认没有重试，失败输出不含密码/JWT/proof/refresh token、正文或非法 header。

实际 CLI 超时子用例耗时约 21.8 秒，保存 `BLOCKED`/`timeout`/`plaintext_download`、准确 Operation ID 和 4 个已收字节，退出 2；原回执拒绝覆盖，第二次启动没有再次发起登录或下载。所有新旧测试证书/私钥、plan、请求、回执与 SQL 临时目录均已清理并独立核对缺席。只使用已有工具，没有安装依赖、执行 Go 构建、联系现场集群/provider 或查询真实 SQL。这些是客户端本地故障验证，不替代现场失败审计、provider 准入或完整恢复 E2E。

## 本地验证

前轮 Node **10 项全部通过，无失败／跳过，退出 0**；本轮新增 state-only 后的 11 项及后续定向结果见页首。原十项包括完整模拟流程、错误停止边界、原始审计反例、本机实际 TLS 的 CA／主机名验证、正文摘要／超限／重定向、实际 Node CLI 双阶段私密 stdin、查询生成及审计接收、旧回执拒绝覆盖。盘点 Bash 用假 kubectl／openssl 检查只读范围、过期 CA 和数据库 UID 漂移；CR 检查直接比较字节，不把 Git Bash 与 Linux 的解析差异当作现场成功。

PowerShell 包装器回归在 **7 与 5.1 两种版本分别通过**：包含末尾 CR 清理入口、完整退出、原文件保护、固定 DB 观察 payload、远端失败保留和非法 namespace 拒绝。新私密输入包装器完成语法检查，其 Node 私密 stdin 协议另由真实 CLI 回归覆盖，尚未由现场人员运行。

测试只使用已存在的 Node、PowerShell、Git Bash/OpenSSL，无依赖安装。所有本轮 `.tmp-a-live-chain-tests-*` 和 `.tmp-a-live-inventory-test-*`、生成的测试证书／私钥／临时计划／回执／SQL 已在 finally 中守卫删除并独立核对。没有执行现场 HTTPS／SQL、修改集群、应用 migration 或启动新工作负载。
