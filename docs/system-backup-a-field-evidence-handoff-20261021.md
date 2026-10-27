# A：实际权限、原始材料、容量和运行卷统一采集

【采集前部署输入已修正】[部署准备记录](system-backup-a-field-deployment-preparation-20261022.md)修正 registration/download 两份空模板的旧迁移摘要，使其与当前 96 文件目录一致；现有组合器 15 项通过，自有临时文件已清理。当前 bootstrap 源码仍有 27 个真实资源准入槽位缺口，先按[已有交接](system-backup-a-bootstrap-resource-handoff-20261022.md)补原材料/具体实现与受审装配，再完整采集；仅换镜像不能补齐准入。没有生成 apply 包、部署资源或新 owner 来源基线。

【现场公共盘点已复核】[10 月 22 日新回执复核](system-backup-a-field-inventory-review-20261022.md)确认 9 Pod/5 PVC 的公共引用、工具/payload SHA 和退出 0。主应用仍为原 fix18 imageID，9 个容器中没有显式 DSN 变量引用；report PVC 已绑定但无人挂载，没有 RWOP claim/journal 挂载。envFrom/实际 SQL/材料/权限不在本次范围，不能由显式引用缺席推断所有配置不存在。已整理[公共引用](evidence/a-field-observed-references-20261022.json)，仍不能把空计划视为可执行；下一步先准备受审运行装配与原材料，再执行完整采集，无需重复同轮盘点或角色十项/GC 十八项。

【2026-10-22：DSN 文件入口已完成本地准备，现场证据待采集】现有 registration 命令新增独占 `--inspect-sql-evidence` 入口，直接使用原挂载 DSN，不要求应用容器安装 mysql。完整命令包 84 项通过，原 49 项保留，Windows/Linux 构建成功；统一接收器 Node 41 项、Python 13 项及 PowerShell 7/5.1 的假 transport 回归通过，见[限定准备记录](evidence/a-field-evidence-dsn-preparation-20261022.json)。旧候选与失败原记录保留。所有自有源码副本、缓存和构建产物已清理，未安装依赖、构建/部署镜像或执行现场 SQL。新代码还需要在真实受审镜像内提供，不能据本地通过声称现场部署已更新。

统一入口为 `scripts/system-backup-a-field-evidence.ps1`，远端只运行本轮 SHA 绑定的 Python 脚本，不上传二进制、安装依赖或创建远端临时文件。接收工具为 `scripts/system-backup-a-field-evidence.mjs`。本工具采集既有部署事实，不创建账号、grant、材料、Secret、PVC、配置行或新有效期，也不改变工作负载。

角色十项已通过[独立实际接收](system-backup-a-download-gc-role-mysql-accepted-20261021.md)，无需重测。该隔离专项不能代替本页的真实生产运行身份。

## 当前现场前置条件

已核对原日志 SHA 的两份[环境观察](evidence/a-live-chain-environment-review-20261021.json)和[定向状态观察](evidence/a-live-chain-state-review-20261021.json)保留为历史来源。它们记录 config=0/安装未配置、没有独立下载运行时/journal claim、provider lab CA 过期、已部署 bootstrap 缺 30 个适配器。这些是原观察时点的事实；后续本地代码变化不能改写现场状态，也不能证明今天仍无新部署。

操作者此前不确定部署是否更新，现已使用下方入口取得并复核 08:56 公共盘点。它固定原 context/namespace UID，只执行元数据 `get`，不请求 Secret、不 exec 容器、不查询 SQL；不输出环境变量值、args、annotations 或存储后端内容。回执包含 Pod/镜像/容器实例、候选 DSN 变量名及原 Secret 引用名/键、挂载/PVC/PV UID。候选变量存在不等于实际连接池、只读检查能力或正式角色已批准。namespace 已替换时停止，不自动接受新 UID。以下命令保留用于以后部署变化后的新观察，本轮不必重复执行。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
.\scripts\system-backup-a-field-inventory.ps1
```

在既有可登录服务器的 PowerShell 会话执行，保留末尾 `Public inventory receipt:` 的完整路径。该入口独占创建 JSON 回执，不覆盖旧材料，不安装依赖，也不产生远端临时文件。8 项 Python 公共输出/失败检查和 PowerShell 5.1/7 假 transport 检查通过，原终端输出纳入准备记录。盘点不运行角色十项或 D GC 十八项。

当前[公共采集计划](evidence/a-field-evidence-plan-20261021.json)已独占生成，预检明确列出 10 类缺项；完整采集尚未启动 SSH，公共盘点单独执行成功。计划保留历史环境标识作为待核对引用，账号、Pod/PVC UID、授权期限、材料摘要和容量输入没有凭空填写。新盘点得到的 MySQL/data/report 引用保存在旁证 JSON，尚无对应运行连接和 collector/report/journal 挂载，故未拼成可执行计划。先核对受审部署/接线及真实引用，再填写和执行完整采集；不要把旧 app Pod 填作下载运行时，也不要为了通过工具复制凭据、造 config 行或延长原 provider 期限。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'

# 只读显示已核对观察、所需事实及未验范围；退出 2 表示前置条件仍需准备。
node .\scripts\system-backup-a-field-evidence.mjs --requirements

# 本轮计划已生成；查看缺项，退出 2 是预期，且不会联系集群。
py -3 -B .\scripts\system-backup-a-field-evidence.py `
  --plan .\docs\evidence\a-field-evidence-plan-20261021.json --check-plan
```

## 计划中填什么

计划是采集引用清单，容量部分直接复用已有 `system-backup-capacity` 公共 input 格式，不替换生产配置格式。密码、DSN、token、私钥和 TOTP 均不放在计划或回执中。

| 项目 | 必须来自现场的值 |
| --- | --- |
| `observer` | 既有受审观察连接所在 Pod/UID/container、实际 SQL 用户及下述连接引用；可以是特权观察者，但明确不算运行账号。支持原 MySQL 容器的本地 socket/原 root 密码环境变量名。 |
| `profiles.registration` / `download` / `collector` | 三个实际既有连接，用户各不相同且非 root。`gc` 可另加，需保留自己的范围。Pod/UID/container 与当前部署相符。 |
| `tables` | 完整待核对表集合。download 至少包含现有下载候选必需表，collector 至少包含生成器的全部容量表（含 `system_backups`），observer 覆盖所有运行身份集合。不能用缩小清单放行。 |
| `materials` | 公共 ConfigMap 名称/原 UID/键、原始 UTF-8 字节 SHA，类型为证书/证书包 `ca_pem` 或 `public_json`；不输出任意材料原文。 |
| `volumes.data/report/journal` | 实际 Pod/UID/container、挂载与文件路径、PVC 名/UID、PV UID、明确 subPath，以及真实预算要求 `minimum_available_bytes`。data 的 subPath 与原容量 input 相同；report/journal 使用完整挂载。 |
| `capacity_input` | 已有容量部署公共 input 的完整对象，含当前 catalog、数据库/节点/镜像、collector 用户/UID、data/report PVC 等原始事实。不是空模板或仅替换镜像的旧计划。 |

DSN 文件连接使用以下结构。下面是字段说明用例；字符串占位值不能用作现场事实，示例摘要也不能证明某镜像已部署：

```json
{
  "pod": "existing-runtime-pod",
  "pod_uid": "实际原 UID",
  "container": "existing-container",
  "dsn_env": "SYSTEM_BACKUP_DOWNLOAD_DSN_FILE",
  "inspector_sha256": "ec5c39bff91ba3d64c3d83ee22b5b2327da0782e9f680ecf41d58f34682e7be3",
  "expected_user": "实际既有用户",
  "tables": ["实际完整表清单"]
}
```

`registration`/`collector` 固定引用 `SYSTEM_BACKUP_REGISTRATION_DSN_FILE`，`download` 固定引用 `SYSTEM_BACKUP_DOWNLOAD_DSN_FILE`，可选 `gc` 使用 `SYSTEM_BACKUP_GC_DSN_FILE`；不能交换角色变量。变量值和原 DSN 只由容器内现有 Go 驱动读取，沿用原传输/TLS 配置，不导出到本机。采集前后校验 `/usr/local/bin/clawreef-system-backup-registration` 字节摘要，绑定请求 SHA、同连接前后 SQL 身份、只读事务和成功回滚；驱动/关闭/回滚错误不输出部分成功结果。

示例中的 Linux amd64 SHA 来自[本轮冻结构建](evidence/a-field-dsn-native-accepted-20261021.json)；Windows amd64 为 `168fecfedb43193cb5d484429d82c2dc377e8aa18b4c36ae0f305aead082aba5`。它们只是本轮已删除构建产物的指纹，不是目标镜像 digest，也不授权任意新构建。实际目标需与受审镜像内的 inspector 字节相符；其他构建必须带自己的受审来源/摘要。

原 MySQL Pod 的观察者可使用以下连接字段，配合相同 `pod/pod_uid/container/expected_user/tables`。仅 observer 允许 socket，`expected_user` 必须是原 root；socket 路径需取实际值，密码字段只写原环境变量名称：

```json
{
  "socket_path": "/var/run/mysqld/mysqld.sock",
  "password_env": "MYSQL_ROOT_PASSWORD"
}
```

已有受审环境变量 TCP 连接仍可选用 `credential_env:{user,password,host,port}`（只写变量名）及 `ssl_ca_file`；它仅适用于目标已经有对应变量和 mysql 客户端的情况，不为采用此路径新增凭据或安装工具。另一个观察账号不能代替实际运行连接池的账号/数据库证据。

可选 TCP 客户端固定正常验证 CA/主机名；TCP 和观察者 socket 均使用 `--no-defaults --no-login-paths`，避免 option/login 文件混入其他命令。缺少既有工具或原连接要求时保留 blocker，不改变部署来绕过。

## 完整执行命令

填好真实公共引用后，先执行本地预检。它使用已安装的 Python 3、Node；Windows 的既有 `py -3` 不可用时停止，不安装或下载。

```powershell
.\scripts\system-backup-a-field-evidence.ps1 `
  -PlanPath .\docs\evidence\a-field-evidence-plan-20261021.json `
  -CheckOnly
```

只有完整本地预检成功后，在现有可以登录服务器的 PowerShell 会话执行一次：

```powershell
$fieldRun = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$fieldReceipt = ".\docs\evidence\a-field-evidence-$fieldRun.json"

.\scripts\system-backup-a-field-evidence.ps1 `
  -PlanPath .\docs\evidence\a-field-evidence-plan-20261021.json `
  -SshTarget 'root@10.130.14.23' `
  -OutputPath $fieldReceipt

if ($?) {
  node .\scripts\system-backup-a-field-evidence.mjs `
    --plan .\docs\evidence\a-field-evidence-plan-20261021.json `
    --receipt $fieldReceipt
}
```

入口独占预留回执，固定原 plan/script/payload SHA，保留实际 SSH 退出码。输入变化、缺项或非法参数在 SSH 前停止。远端脚本通过 stdin 执行并处理 Windows 管道末尾 CR，不生成缓存/字节码；不需要远端 scratch 清理。远端失败保留结构化公共 blocker，无法识别的 stdout 不复制进公共回执。

## 本轮会取得的事实及接收边界

SQL 每个身份在同一只读连接中采集原 CURRENT_USER/CURRENT_ROLE、SHOW GRANTS、表/列/index、CHECK、完整 outgoing/incoming FK（含跨 schema）、trigger/routine 的元数据与定义摘要，并前后核对身份。运行身份与特权观察者按原集合比较，结束时重查观察者；每次 exec 前后固定 namespace/Pod UID、容器实例、重启计数和 imageID。没有撤权、regrant、DDL 或写入测试，直接 grants 也未自动变成生产角色批准；两次元数据一致不证明整个窗口完成 DDL freeze。

材料核对 ConfigMap 原 UID/版本及字节 SHA。CA 包中的每张证书分别核对采集时未过期，记录 subject/issuer/原起止时间/DER SHA；PEM 原始字节 SHA 与 DER 指纹保持区分。包内任意证书过期即留下 blocker，不能只检查第一张。原 authority/material 期限、issuer/role/policy、OIDC、完整链/主机名和 provider ACL 仍需原材料与对应交付复核，不能由一个相同摘要代验。

卷核对实际挂载/PVC/PV/claimRef/CSI 或 NFS 后端引用，保留 Unix UID/GID/mode 和 statfs 字节数。实际 `/proc/mounts` 的只读标志必须与声明相符，路径不得通过符号链接替换；data 必须只读，report 要求 RWX、2770/640 与 65532 group，journal 要求 RWOP、实际非 root 进程持有的 0600/0640 文件及可写权限检查。三个不同后端引用只能排除本轮可见的同一引用，不能据此批准真实物理隔离、底层配额/预留、单写者 fencing 或跨 Pod 原子可见性。

容量阶段运行既有镜像内 collector 的 `--check-capacity-source`，核对计划中的声明镜像 digest/节点，另保留容器运行时实际 imageID；不能把运行时 imageID 格式强当作镜像 manifest digest。读取该 collector 原挂载 source/report 字节并取得同轮原 SQL UTC。接收器复用现有容量验证器，严格核对完整表集合（含 `system_backups`）、原配置 SHA、数据库/datadir、int64 数值及精确纳秒年龄；恰好五秒允许，超过一纳秒拒绝。检查模式不写报告、不换采集身份、不续造 observed_at 或 TTL。

native 兼容结果中的旧索引字段 `unique` 表示 MySQL 的 NON_UNIQUE 数值，采集端统一命名为 `non_unique`，不翻转数值；同时出现两个字段会拒绝。元数据一致不构成正式角色批准。

采集成功只记 `READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED`；离线复核通过只记 `READ_ONLY_FACTS_REVIEWED_REMAINING_ACCEPTANCE_REQUIRED`，`complete_field_acceptance=false`、`production_approved=false`。原始回执的操作者来源仍需核对，完整生产接线、原持久 owner/ref/hold/history、角色审批、物理预留、可见性/单写者实际测试、本人 MFA/provider 与恢复 E2E 分别继续。

本轮没有为 owner 十一项登记新的普通来源基线。冻结 native 来源相对已接收角色来源有五份 owner 真实 tagged 依赖变化，路径见准备记录；不能把本轮 84 项命令包检查或旧 5,019 项清单挪作当前 owner 完整 gate 的证明。角色十项与 D GC 十八项的历史接收保持，owner 十一项仍需自己的新完整来源/实际回执。
