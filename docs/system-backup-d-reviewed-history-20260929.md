# D：已安装库的历史账本兼容入口

**最新验收（2026-09-30 06:27 UTC）**：本轮真实 CLI 已在隔离 MySQL 8.4.8 完成 94 份 fresh replay 和八项历史/故障恢复测试，全部 PASS；96→97 恢复及重复执行通过，namespace 和两端 scratch 均报告清理。runner/probe/source 三项摘要与最终本地验证一致，见 [完整远端回执](evidence/system-backup-d-history-cli-mysql-20260930.json)。本固定输入无需重跑。下文较早的“远端待执行”等描述保留为历史记录，以本段为当前结论；该结论仅限 synthetic 隔离材料，实际安装未升级、配置未激活。

**本轮来源补查**：已直接核对本机 fix16 构建附件、runner SHA 和 catalog；该镜像 CLI 不含历史审查三个参数，实际升级须交付新 runner。旧原文和应用构建绑定仍缺，owner 仍待签收。见[旧 SQL / 构建来源交付材料](system-backup-d-legacy-source-upgrade-handoff-20260929.md)。本段不放行 080 或真实 collector。

9 月 28 日独立迁移入口新增的未知文件名拒绝规则，会阻断含历史额外记录的已安装库。本次补充显式、受证据约束的 `080` 升级路径；默认路径继续拒绝未知记录。没有删除/改名旧 ledger，没有重放旧 SQL，也没有修改 A/B/C 的 migration 或批准其业务语义。

## 输入与执行范围

新增三个 CLI 参数，必须成组提供：

- `--history-review-file`：运维挂载的审查 JSON。
- `--expected-history-review-sha256`：由部署过程固定的该文件原始字节摘要。
- `--historical-sql-dir`：只读挂载的旧 SQL 原文目录，文件名必须与历史 ledger 完全相同。

保留原有 `--apply`、DSN 文件、数据库 UUID/库名和 catalog 摘要参数。`--catalog-only` 拒绝这些数据库/审查输入。解析审查文件、核对原文摘要及目标绑定失败时，不打开数据库连接。

审查 JSON 字段（不是已批准的实际安装配置）：

| 字段 | 要求 |
| --- | --- |
| version | `1` |
| server_uuid / database / catalog_sha256 | 与独立命令部署 pins 一致 |
| reviewed_by / review_reference | 真实审查者和可追溯的审查记录；不能填测试 fixture |
| decision | `retain_history_without_replay`，明确保留历史并不重放 |
| expected_applied | 完整、无重复的当前目录除 080 以外的文件名，加上全部历史额外文件名 |
| pending | 只能为 `["080_add_system_backup_registration_runtime.sql"]` |
| historical | 每项含 `filename`、旧原文字节 `sql_sha256`、与历史构建/应用记录绑定的 `provenance_reference` |

解析器拒绝未知字段、多份 JSON、重复/遗漏条目、当前 migration 充当历史别名、路径穿越、目录/目标不符、摘要不符、缺旧 SQL，以及扩大待迁移集合。旧原文只读取及计算摘要，绝不执行。解析成功的审查对象在 db 包外不可修改。

**这是受信任的部署输入，不是审批服务。** `reviewed_by` 和 reference 本身不是数字签名；程序验证文件绑定和执行范围，审查真实性由现有运维交付流程负责。不能把任意文本重新哈希、填写审批人就当作恢复了旧来源，也不能通过 HTTP 接受这些输入。

进入数据库后使用原有同一连接的 migration exclusion 和 UUID 检查，重新核对完整账本集合；增加或减少任何未预期文件均拒绝。只会执行正式 080 的四条 DDL 并新增它的账本行。完成后的相同输入可识别包含 080 的账本，不重复 DDL。旧历史行的 applied_at 不修改；schema_migrations 缺失时直接拒绝，不能按新库初始化。

## 当前交付边界

现场三条旧 SQL 原文及其审查尚未恢复，因此**没有生成实际库可用的审查文件，也未执行实际升级**。这个入口解决“如何在有证据时保留历史并升级”的实现缺口，不宣布旧 SQL 与 050/052/053 等价，不代替 fresh schema 基线、数据语义审查或备份准入。现有 `-UpgradeReview` 只读探针继续报告这些缺项。

本次代码晚于 fix16，不能把 fix16 视作含有此修复。本轮当前源码探针已完成独立真实 MySQL 验证，后续实际部署仍需 runner 构建指纹及部署验收；已经通过的 fix16 Controller 测试仍有效，但不覆盖本入口。

本地验证命令：

```powershell
.\scripts\system-backup-d-history-validation.ps1
```

验证覆盖真实账本形状 `92 current + 3 historical` 的驱动模拟、拒绝路径、capture gate、同连接锁/身份、仅 080 写入以及成功后的重试。所有旧 SQL/审查者均为明确标注的测试 fixture，不能用作实际安装证据。脚本禁止依赖下载，测试与 Linux 构建使用独立目录并在结束时清理。

本地结果：27 个新增子场景和 db 包测试通过，Linux runner 构建通过，独立构建/测试缓存清理后为 0。正式 catalog 仍为 93 文件、`68794bddc66b9809fae57a111778dd8ad53e2a5a5bfb218108295c8d751b1564`。见 [本地验证及源码指纹](evidence/system-backup-d-reviewed-history-local-20260929.json)。

后续真实 MySQL 8.4.8 隔离验证已收到六场景全部 PASS：未审查、错误目标、额外未知文件的拒绝，capture gate 拒绝后恢复，95→96 保留历史和精确 runtime DDL，以及重试保留账本/运行行。namespace `sbk-mig-260929062117-1e03` 及两端临时目录均报告清理；探针摘要与本地记录相符。见 [远程回执](evidence/system-backup-d-reviewed-history-mysql-20260929.json)。测试历史材料为 synthetic，不证明实际旧 SQL 来源，不覆盖部分 DDL 故障恢复、部署 CLI 或已安装库结构验收；未执行实际升级。

## Linux CLI 实际执行入口（2026-09-30）

本轮实际执行已通过，脚本退出 0，容器与本地二进制/缓存均清理。新 runner SHA 为 `99265645c6d27fe8c4245073ca5ce4f1b442396d2d8b2b30fddee4802b60efe4`；93 文件 catalog、全部文件名、三个历史参数和不完整审查输入拒绝均已在 Linux 容器验证。见 [Linux CLI 回执](evidence/system-backup-d-history-cli-linux-20260930.json)。没有连接数据库或生成新发布镜像。

新增 `scripts/system-backup-d-runner-linux-validation.ps1`：先确认已有 Linux Docker 引擎及固定 digest 的 linux/amd64 镜像，再离线编译当前 runner。该镜像仅作为运行环境；以只读 bind mount 执行新二进制，不把 fix16 内置的旧 runner 冒充为新版。

```powershell
.\scripts\system-backup-d-runner-linux-validation.ps1 -CheckOnly
.\scripts\system-backup-d-runner-linux-validation.ps1
```

CheckOnly 只检查工具存在与参数，不访问 Docker 或构建。实际运行禁止依赖下载和镜像拉取，以非 root、只读根文件系统、无网络、无 capabilities 执行 catalog/help/不完整历史材料拒绝检查；独立重算仓库 catalog 并比较全部文件名。构建前后及执行后核对 backend Go/SQL/module 输入摘要，源文件变化即拒绝回执。使用 `-trimpath` 的本次二进制摘要不可与此前未使用该参数的构建摘要混用。

输出分别记录承载镜像 digest/image ID、新 runner SHA 和源码集合 SHA。finally 只清理本轮随机名且标签匹配的容器与 scratch，保留用户既有镜像。此入口不生成发布镜像、不连接 MySQL、不执行 080，也不提供真实 history-review。正式 runner 镜像或部署包、CLI 的真实数据库验收及旧来源签收仍是独立交付项。

增加 `-ValidatePackage` 可验证独立镜像封装：使用现有 PowerShell/.NET 的 `System.Formats.Tar` 将唯一静态二进制以 0755 放入 rootfs tar，`docker image import` 配置非 root 用户、默认入口和本轮所有权标签。此过程不使用基础镜像、构建器缓存、依赖下载或 Dockerfile RUN。再以无宿主挂载方式核对独立镜像的 catalog、历史参数和拒绝输出。返回本地 image ID，尚不是 registry 发布 digest；finally 核对本轮标签后删除测试镜像及 tar，不保留待部署镜像。

本轮 `-ValidatePackage` 已实际通过，独立镜像 ID 为 `sha256:a6d2a2e984aff9d207b70666e2901db1849c4b637b450f1a2833ad737528eaad`，runner 与前次只读挂载运行的 SHA 完全一致。脚本退出 0，测试镜像、容器、tar、二进制和缓存均已清理；既有承载镜像未删除。见 [独立镜像验证回执](evidence/system-backup-d-history-runner-package-20260930.json)。该 ID 仅标识本轮已删除的测试产物，不是可拉取的发布引用。

```powershell
.\scripts\system-backup-d-runner-linux-validation.ps1 -ValidatePackage
```

这一最小镜像只含 runner；实际部署仍需受审的 DSN、原文及 review 只读挂载。若数据库连接采用证书验证，还需部署受信 CA 文件及相应 DSN/TLS 接线，不能把无网络 catalog 检查扩展为数据库 TLS 已验收。

## 真实 CLI 与故障恢复验收入口（2026-09-30）

新增入口（在仓库根目录的 PowerShell 执行，SSH 密码只在终端输入）：

```powershell
.\scripts\system-backup-d-invariants.ps1 -HistoryCLI -Remote
```

省略 `-Remote` 只执行离线单测、独立 vet、Linux 探针及 runner 编译。`-HistoryCLI` 自动选择历史审查模式和已固定的 fix16 digest；fix16 仅用于临时库的初始 93 文件重放，受测的历史迁移命令来自本轮源码编译的独立 runner。不是 fix16 的内置旧 runner，也不是独立镜像部署或数据库 TLS 验收。

沿用既有 fresh smoke 的随机 namespace、临时 MySQL emptyDir 和清理机制；停止的只有该 namespace 内的测试 app。CLI 模式将两个测试 Pod 的 imagePullPolicy 设为 Never，所需镜像未缓存在选定节点时直接失败，不拉取、不安装。探针先核验 namespace/run/server UUID marker、93 条初始账本及空 runtime 表，再构造 95 条 synthetic 账本。真实安装及正式报告 PVC 不修改。

上传后分别验证探针与 runner SHA-256，并确认精确测试名 `TestDReviewedHistoryCLI` 存在，防止零匹配误报通过。测试调用实际 CLI 子进程，DSN、review 和三份合成 SQL 放在临时私有目录；子进程不继承数据库密码环境变量，DSN 不放命令行、不进入日志。runner 和探针的 catalog/全部文件名必须一致。

八个子场景：未审查 95 条拒绝；错误目标拒绝；新增未知 ledger 拒绝；capture gate 拒绝并解除；部分 DDL 时断连；DDL 完整但 ledger INSERT 时断连；同输入恢复为 96 条并比对 fresh DDL；再次执行保留账本及 runtime 数据。所有失败都要求 CLI 退出 1 且仅输出固定公开错误，不能以任何非零退出代替正确拒绝。

故障注入在同一临时数据库中持有明确的表锁，轮询确认真实 runner 已等待目标 SQL，并验证其 connection ID 等于 migration advisory lock 的持有者，才执行 KILL CONNECTION。部分 DDL 场景预建无外键的第三张表并锁住它，runner 实际创建前两张表后被中断；第二场景对 ledger 加 READ 锁，允许初始 SELECT，但阻断四张表完成后的 INSERT。两次均要求旧 95 条 filename/id/applied_at 不变、没有 080 记录、CLI 不报告 PASS。

每次恢复前由测试显式比对现存表与本轮 fresh 的 SHOW CREATE TABLE，匹配后才以相同 target/catalog/review 重试。**这是已知正确部分 DDL 的受控恢复验证，不是自动修复任意结构漂移。** 当前 runner 的 IF NOT EXISTS 不验证既有表定义；实际升级失败后仍必须人工核对结构，不能据本测试授权盲目重试。没有模拟“账本已提交但成功回包丢失”，也不覆盖所有迁移的故障恢复。

通过应看到八个子场景及 `PASS d-reviewed-history-cli`，随后 namespace、远端 scratch、本地缓存的 CLEANED。出现错误或 CLEANUP_PENDING 就保留回执，不登记通过。临时凭据由 Go 测试清理，上传二进制由远端 trap 清理；异常导致目录仍非空时报告失败，外层 namespace 清理兜底，不把失败标成成功。

截至本轮入口交付，远端运行仍待操作者在终端输入 SSH 密码并回传结果；本地检查与最终指纹单独归档，不把此前六场景 PASS 复用于这八项。实际旧 SQL 来源、owner 签收、080 升级、collector 和配置激活门槛保持独立。

本地最终结果见 [CLI/恢复入口验证回执](evidence/system-backup-d-history-cli-recovery-local-20260930.json)：四个 Go 包测试、独立 vet、Linux 探针及 runner 编译通过；9 项不同的 Node 顶层测试、2 个 wrapper 模拟场景通过，PowerShell/Bash 语法检查通过。已编译探针在无网络 Linux 容器中确认准确测试名存在、无隔离身份时拒绝。runner SHA 为 `99265645c6d27fe8c4245073ca5ce4f1b442396d2d8b2b30fddee4802b60efe4`；本轮缓存、二进制和模拟目录均已清理，未安装依赖或拉取镜像。最终 wrapper 将两份 Linux 构建统一为 trimpath，以复用本轮缓存；本地早先探针未使用该参数，远端运行必须记录新生成的探针摘要，不能照抄本地摘要。源码变化保护通过独立模拟测试，不把较早的本地构建调用记作已执行最终 wrapper 的该项检查。

### Windows asm 共享冲突后的只构建重试

操作者随后回传 `D_PROBE_VET serial=true`、`D_PROBE_BUILD linux-integration=true`，以及 `internal/cpu` 的 `asm.exe: exit status 0xc0000043`。脚本已走过本地测试/vet，失败发生在上传和 SSH 之前，回执包含 `CLEANED local-probe-build-cache=True`；没有本轮远端 MySQL 结果。该状态码是 [STATUS_SHARING_VIOLATION](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55)，占用者仍未知，不能归因于某个安全软件或进程。

入口现在只对 asm/compile/link.exe 的该项精确退出诊断做有限重试：最多三次，等待 2 秒、4 秒；保留同一轮缓存，重试前重新检查 backend 源码摘要。输出同时包含语法错误、其它退出码、源码漂移，或三次仍失败时直接停止；不会下载依赖、修改工具链、结束其它进程或关闭防护。最终成功或失败均执行原有清理。

本次已通过测试/vet，只需重试构建并接续远端阶段：

```powershell
.\scripts\system-backup-d-invariants.ps1 -HistoryCLI -BuildOnly -Remote
```

`-BuildOnly` 仅供 `-HistoryCLI` 使用，不运行本地单测及 vet（含 test -c 的隐式 vet），输出明确为 `unit-tests=skipped vet=skipped`；它仍构建两份 Linux 二进制、核对源码/传输摘要，并在 `-Remote` 时完整运行八项真实验收。若 Go/SQL/module 输入有变化，应去掉 `-BuildOnly` 重新验证，而不是沿用旧测试结论。省略 `-Remote` 可仅复验本地构建。

wrapper 模拟测试现为 10 个场景，覆盖正常/源码漂移、只构建、探针及 runner 的一次冲突后恢复、三次冲突上限、普通语法错误、混合错误、其它状态码和失败期间源码变化。断言重试保留缓存、失败不输出 LOCAL_PASS、跳过的检查不冒充通过、所有结束路径清理并恢复环境；模拟通过不表示机器上的共享冲突根因已消除。

本轮 `-HistoryCLI -BuildOnly` 已实际退出 0：两份 Linux 构建均在第 1 次尝试通过，编译前后源码摘要一致，缓存和二进制已清理。runner 摘要仍为 `99265645…60efe4`，trimpath 探针为 `f9bbbfa9…4d0bfe3`。另用真实 Go 非法参数验证普通 native 失败仅执行一次，并保留调用者错误偏好。见 [只构建及有限重试本地回执](evidence/system-backup-d-history-cli-build-retry-local-20260930.json)。本轮未复现实际共享冲突；重试恢复来自模拟故障覆盖，不能宣称找到了占用者或根因已消失。单测/vet 明确跳过，远端验收仍未执行。

### SSH 连接关闭后的预检（2026-09-30）

操作者再次运行后，两份 Linux 构建均首次通过，runner/probe/source 摘要与上述本地回执完全一致；随后输入 SSH 密码时出现 `Connection closed by 10.130.14.23 port 22`，停止于 `Remote scratch creation failed`。这次未上传二进制或启动远端测试。本地清理为操作者报告 True；旧入口只有收到 mkdir 成功退出后才跟踪目录，因此不能由该日志断言远端目录不存在。旧日志未包含随机路径，本轮不猜测路径或按前缀批量删除。

先在用户终端运行独立诊断，不再为了排查 SSH 重编译：

```powershell
.\scripts\system-backup-d-invariants.ps1 -CheckRemote -Verbose
```

该模式只通过 SSH 执行带本轮随机标记的 printf，要求退出 0 且收到准确标记；没有构建、上传、创建远端目录或调用 Kubernetes。`-Verbose` 透传 OpenSSH `-v`，用于区分认证前关闭和认证成功后会话关闭；连接关闭本身不能确定密码错误或服务端根因。保留 host key 严格校验，每次连接只提示一次密码，密码仅在终端输入。预检成功输出 `D_PROBE_SSH_PREFLIGHT_PASS`，仍不代表 MySQL 已验收，也不能保证后续连接持续可用。

预检通过后，backend 输入未变化时再执行 `-HistoryCLI -BuildOnly -Remote`；输入变化则去掉 `-BuildOnly`。所有 `-Remote` 运行现在均先预检再构建，后续创建/上传/执行/清理仍各自需要 SSH 认证。

目录创建前输出随机完整路径和 owner；尝试创建前即登记待核验状态，创建命令写入 `.owner` 并返回独立确认标记。无确认则禁止上传/测试，但仍尝试清理。清理只接受路径不存在，或路径不是软链接、owner 文件不是软链接且内容逐字匹配本轮身份；缺少/不匹配的 owner 不删除，报告 `CLEANUP_PENDING`。即使清理 SSH 启动异常，也继续清理本地缓存。此前失败运行的未知目录状态不因此自动消除。

本次只修改 PowerShell 编排及测试/文档，没有重编译 Go。20 个 wrapper 模拟场景通过，新增覆盖预检成功/非零/错误标记/启动异常、远端模式在构建前拒绝、mkdir 回包丢失以及清理失败/无确认/异常。实际 Bash 清理命令另通过六种本地目录状态测试（不存在、本轮 owner、外来 owner、缺 owner、多余 owner 内容、普通文件）；模拟中不连接 SSH/MySQL。测试目录已清理，未安装依赖。见 [SSH 失败及本地修复回执](evidence/system-backup-d-history-cli-ssh-preflight-20260930.json)。真实远端认证仍待操作者完成，八场景未执行。

最新操作者 SSH 预检已通过：密码认证成功、printf 命令退出 0，wrapper 验证随机标记后输出 `D_PROBE_SSH_PREFLIGHT_PASS`。末尾 `IO is still pending on closed socket` 提示没有导致此次预检失败；未证明上次关闭连接的根因已消除。本次没有构建、上传或运行 MySQL，也没有核验旧运行的未知 scratch。

同时只读重算当前 backend 源码集合摘要为 `e333a14366a0ce1e98e72e35140a714cbdb536fb59df58b62b43bcc5357c4d54`，与先前 `f1b8a139…e38c8` 不同。因此下一步在操作者终端运行完整入口，不使用 `-BuildOnly`：

```powershell
.\scripts\system-backup-d-invariants.ps1 -HistoryCLI -Remote
```

该命令先预检 SSH，再执行离线测试/vet、编译及远端隔离验收；认证仍由操作者在终端完成。最终须取得八场景及 `PASS d-reviewed-history-cli`、namespace/远端 scratch/本地缓存清理结果，才能登记本轮 MySQL 通过。见 [预检通过回执](evidence/system-backup-d-history-cli-ssh-ready-20260930.json)。

最新完整运行已通过四包单测、独立 vet 及两份 Linux 编译：source=`e333a14366a0ce1e98e72e35140a714cbdb536fb59df58b62b43bcc5357c4d54`，runner=`7ab37c3ac839a499e2ee19d066e3fba49abc34b334c951ebf456d503e2fc0fbb`，probe=`028470fafe5c0dad7b7728914db8d420a65daa6a318121d60057b142588c1e54`。本轮 scratch `2ce41ce4aefb44e9bfd7495a2fcbee5d` 创建回包未确认，后续远端目录与本地缓存均报告清理成功。尚未上传或启动 MySQL；清理成功不能区分 mkdir 从未执行与已创建后删除，也不能扩展为更早未知目录已清理。

入口现将随机目录准备放在 SSH 预检之后、所有本地测试/编译之前。创建命令允许复用本轮 owner 完全匹配的目录，拒绝软链接、缺 owner、外来 owner、非目录等状态，不补写已有目录的 owner。只有退出 255 且 stderr 明确含 `Connection closed by ... port ...`、不含认证/host key 失败时，才等待 2/4 秒重试，最多三次；每次密码仍在终端输入。目录命令失败、确认标记缺失或其他错误直接停止。若 mkdir 成功但 owner 尚未写入即中断，会拒绝重试接管并报告清理待核验。上传和 MySQL 命令没有增加重试，不会重复运行故障验收。

本次 PowerShell 模拟场景共 25 个通过；实际 Bash 六种创建状态各重复两次，验证同 owner 可恢复且外来/不完整状态原样保留，另六种清理状态通过。真实本地子进程验证 stdout、stderr、exit 255 分离保留，不连接远端。测试目录已删除，未安装依赖，未重编译 Go。

当前源码仍与刚完成的完整本地检查一致，下一步可用以下命令；若源码随后变化，去掉 `-BuildOnly`：

```powershell
.\scripts\system-backup-d-invariants.ps1 -HistoryCLI -BuildOnly -Remote -Verbose
```

先准备远端目录，成功后才开始编译；连续连接关闭会在编译前停止。`-Verbose` 保留诊断供进一步判断认证/会话阶段。本轮改动缓解连接中断的重跑成本，不声称修复了 SSH 根因。见 [目录创建中断及本地改进回执](evidence/system-backup-d-history-cli-ssh-create-retry-20260930.json)。

### 当前 catalog 建库修正（2026-09-30）

操作者最新日志已确认 SCP 退出 0、bundle SHA 校验 OK，远端启动 `sbk-mig-260930054140-3824`（UID `549aaa6c-303a-4097-9c00-a79650d7352a`）的 MySQL 8.4.8。失败为 `migration replay stopped at 93/94`，旧 fix16 应用仍 Running；随后 namespace、scratch `ccc6163ffea74fdbb1a1a19e6dedc771` 及本地缓存均报告清理。此次 SSH 的 socket 提示没有阻断传输/命令；八项历史 CLI 测试尚未进入。

原因是 CLI 模式仍复用旧镜像建库，而当前迁移目录及 controller 合同已增加 `063_unique_usernames.sql`，catalog 为 94 份、SHA `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。不能降低预期数量或用旧镜像的 93 份冒充当前 catalog。

修复沿用既有独立迁移 phase：wrapper 随包发送该脚本，CLI 模式强制用本轮 `D_HISTORY_CLI_BINARY/SHA256` 作为 fresh runner，冲突输入在 Kubernetes 操作前拒绝。仅在本轮 namespace UID、MySQL Pod owner、二进制 SHA、server UUID 均核验后，对临时 MySQL 执行当前 CLI 的无 history-review fresh `--apply`。DSN 在 Pod 私有临时文件内，执行后删除；失败由 namespace 清理兜底。此模式不创建旧 migration-app Pod，进入历史探针前要求 fresh runner 完成且不存在 migration-app；完整 ledger 数量、全部文件名及现有 D 字段类型校验继续保留，MySQL 镜像仍为 Never 拉取策略。

当前探针按嵌入 catalog 动态构造 synthetic 账本：94 份 fresh，删除 080 后加三份合成历史记录为 96，再恢复 080 为 97。此前 93/95/96 的回执保留其历史范围，不能扩展为新 catalog 或实际旧库升级已获授权。八场景范围不变，真实结果仍需远端重跑。

本轮未修改 backend，重算源码摘要仍为 `e333a14366a0ce1e98e72e35140a714cbdb536fb59df58b62b43bcc5357c4d54`，可沿用刚完成的本地单测/vet，运行：

```powershell
.\scripts\system-backup-d-invariants.ps1 -HistoryCLI -BuildOnly -Remote
```

如源码随后变化则去掉 `-BuildOnly`。成功链应包含 `PASS pinned-migration-runner`、`applied=94 exact_filenames=yes`、八项测试及 `PASS d-reviewed-history-cli`，最后各项清理成功；仅 fresh replay 通过不等于八项通过。验证范围与指纹见 [本轮回执](evidence/system-backup-d-history-cli-fresh-catalog-20260930.json)。

本地验证已完成：25 个 wrapper 模拟场景、9 项既有 Node 顶层检查，以及新增完整 harness 的五种场景通过（正常、fresh runner 失败、同数量错误文件名、意外 app Pod、冲突 runner 输入）。均未连接真实 MySQL；测试目录已清理，未安装依赖。

### 故障注入夹具修正（2026-09-30）

最新真实 run 为 `sbk-mig-260930060054-0627`，UID `c9b9adee-1cc5-4861-8ce6-cbe82e897606`，MySQL 8.4.8。94 份 fresh runner 和精确文件名/字段检查通过，历史 CLI 的未审查账本、错误目标、额外未知记录、capture gate 四项通过。第五项在 0.06 秒内报 `CLI exited before fault injection: <nil>`：CLI 已正常退出，测试未观察到预期阻塞，尚未执行 KILL。第六至八项没有运行，不能登记完整八项通过。namespace、本轮 scratch `47b018e0886140f1a914c505239ea96a` 和本地缓存均由操作者回传 CLEANED。

此前预建第三张表再 LOCK TABLES WRITE 的夹具没有达到目标。删除该预建/锁等待方案，替换为仅集成测试编译包含的单连接 loopback TCP 代理：完整转发握手和非目标流量；仅在目标 COM_QUERY 或 COM_STMT_PREPARE 完整包发送前暂停。连接 ID 从真实 MySQL 握手读取，并与 `IS_USED_LOCK` 返回的 migration lock owner 核对一致后才 KILL CONNECTION。协议字段依据 [MySQL 握手定义](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_connection_phase_packets_protocol_handshake_v10.html)、[COM_QUERY](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_com_query.html) 和 [COM_STMT_PREPARE](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_com_stmt_prepare.html)。代理不记录包内容/凭据，不接受第二个连接，所有连接及转发任务随本轮测试关闭。

部分 DDL 场景暂停第三条 CREATE，在 KILL 前确认第一、二张表的真实 SHOW CREATE TABLE 与 fresh 一致，第三、四张表未由夹具预建。断连后要求它们仍不存在，账本不变。第二个场景暂停 ledger INSERT 的 query/prepare，此时四张表均须已完成并匹配 fresh；断连后不得记录 080 或报告成功。恢复仍需同 target/catalog/review，随后验证 96→97 和再次执行的幂等性。这覆盖语句发送前连接丢失，不声称覆盖服务端语句执行中断或提交成功但回包丢失。

另检查到 go-sql-driver/mysql v1.9.0 有独立 stderr 日志器，原 `log.SetOutput(io.Discard)` 不能保证断连时只有固定公开错误。CLI 现通过 `mysql.NewConnector`/`sql.OpenDB` 保留每个连接配置中的 `NopLogger`，避免 FormatDSN 丢失 logger 配置；数据库参数、迁移权限、锁和目标校验保持原行为。新增真实本地 TCP 立即断开场景，要求子进程退出 1 且只输出固定错误。

本地新增代理测试覆盖 DDL query、ledger prepare、逐字节 TCP 分片、握手身份、认证包不误匹配、目标不向上游泄漏、断连传播、禁止重连、取消时收敛和异常包拒绝。它使用模拟协议端点，不代替真实 MySQL。完整入口不带 BuildOnly 时会运行这些测试和 CLI 子进程测试，并对带集成标签的代码执行 vet。新 runner/probe 必须重新编译，旧二进制指纹不能继续作为本次修正的验证结论。

本轮最终本地验证已通过：四包既有测试、新代理四个子场景、CLI 子进程/真实 TCP 断开测试、集成标签 db/CLI vet、两份 Linux 编译。最终独立校验的源码摘要前后一致，为 `da3a64b57805dffdaa6ef711c5d696b12a711da39659b254dd3d872a188aac4f`；probe 为 `6bfc8a2acf76bdad7ae6807a2cb3d40c0b325188750cc921d657807dd3ab7f92`，runner 为 `69e44727bcfad1e483263ab8fc0d9faf6a29977ea4accd887c6ffe3994304ef7`。初始较早启动的完整 wrapper 因本轮中途补了 CLI 日志修复，在编译结束后被源码变化保护拒绝，未将其记作完整 PASS；上述最终校验单独在稳定源码上完成。两轮缓存、二进制均清理，未安装依赖。

由于本轮新源码的本地验证已经完成，当前摘要不变时可继续：

```powershell
.\scripts\system-backup-d-invariants.ps1 -HistoryCLI -BuildOnly -Remote
```

该命令仍重新编译两份 Linux 二进制；若后续源码再变化，去掉 BuildOnly。需要新的八项全部通过及清理回执，不能复用本次前四项结果拼成完整通过。见 [故障边界修正回执](evidence/system-backup-d-history-cli-fault-boundary-20260930.json)。

### 八场景真实 MySQL 验收通过（2026-09-30）

操作者回传完整成功链：namespace `sbk-mig-260930062648-2795`，UID `417bb93c-0a4b-42e5-afec-a0bc999f59da`，MySQL 8.4.8。当前 CLI 初始化 94 份迁移，全部文件名和 D 字段类型精确通过；`TestDReviewedHistoryCLI` 的八个子场景全部 PASS（总计 0.52 秒）。两次断连分别观察到 2/4 张表已完成，并核验连接是迁移锁持有者后执行 KILL；失败未写入 080，后续同 target/catalog/review 恢复至 97 条并保持历史行，再次执行保留账本和 runtime 数据。

runner=`69e44727bcfad1e483263ab8fc0d9faf6a29977ea4accd887c6ffe3994304ef7`，probe=`6bfc8a2acf76bdad7ae6807a2cb3d40c0b325188750cc921d657807dd3ab7f92`，source=`da3a64b57805dffdaa6ef711c5d696b12a711da39659b254dd3d872a188aac4f`，与最终本地校验完全一致。本次 BuildOnly 明确跳过本地单测/vet，其结论由已固定的前轮本地校验支撑，不将本次跳过记作重跑通过。

回执包含 `PASS d-reviewed-history-cli` 以及 namespace、远端 scratch、本地缓存三项 CLEANED；本轮未重新连接远端复查，以上为操作者完整终端回执的校验结果。Windows socket 关闭提示没有使本轮失败。结构化 [成功回执](evidence/system-backup-d-history-cli-mysql-20260930.json) 固定原始附件 SHA、运行身份、全部八项、二进制/源码/catalog 指纹和清理状态。

本固定输入的独立 CLI 与故障恢复验收已完成，无需继续重跑。实际安装旧 SQL 原文/构建来源、owner 审查、正式部署与激活条件仍是独立交付项；本轮没有执行实际升级、配置激活或历史来源等价确认。
