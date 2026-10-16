# A：users / AI Gateway 备份校验交接（draft）

## 2026-10-14 最新远测：十五表 MySQL 专项已接收

操作者交付的 [15:58 完整 transcript](evidence/a-business-restore-mysql-remote-20261014-155831.txt)已核对，run `sbk-mig-261014083514-40ca`，namespace UID `8027bfb2-4ec0-47ac-bf56-96eeffddd906`，MySQL `8.4.8`，最终 `A_BUSINESS_RESTORE_REMOTE_EXIT=0`。详见[限定接收记录](evidence/a-business-restore-mysql-accepted-sbk-mig-261014083514-40ca.json)。

完整列写入/回读及事务回滚、五条正式 FK 与 collation 唯一性负测、SELECT-only 权限与最终 proof 回滚、SQL NULL 和精确金额，以及 users/quotas 各 1001 行的有界批次均 PASS。十五表包含 220 个可写字段、221 个回读字段；本地与 Pod 独立 seed、完整 A 包门禁和 8 项离线派发检查也通过。读账号、随机业务库、准确 UID namespace、远端 scratch 和本地构建缓存均有清理记录；A 未另外执行 SSH 或远端清理复查。

Linux 探针 SHA-256 `c992cb570395a3b865c26ab1ef6646e3b641739fdbf56fda8e4c988ce45dc7ef`、迁移 CLI `0b867cb471b6c5b1b6d529977c079c9a85fbb577e013ca71889b6673263e24ab`均与 r4 相同。94 份迁移的准确文件名及重算 catalog `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`匹配；44 份 A Go 源码加一份嵌入资产在接收核对时零漂移。

本次关闭独立 registry 夹具、策略表真实列投影和十五表隔离 MySQL 专项待办，无需重跑本专项或三表专项。来源/目标 proof 和事务 writer 仍是合成测试夹具；B 真实证明与写入、D 生产编排、registry/live schema 冻结及 integrated large-smoke.v1/发布矩阵仍待完成。以下失败和本地修订记录保留历史范围，以本节为最新状态。

## 2026-10-14 14:46 历史远测：策略表列投影失败与修复

操作者已交付 [14:46 开始的完整 transcript](evidence/a-business-restore-mysql-remote-20261014-144644.txt)，run `sbk-mig-261014071142-71e1`、namespace UID `4f34fddd-c799-4b54-afab-ad8a57edd161`。本地完整 A 包、空目录编译后 seed、bundle 摘要、94 份 fresh migration/pinned runner、Pod 内 seed，以及随机业务库同 catalog 重放均通过。Linux 探针摘要 `9d19d84a2e8ac08657d2db6ab94c71609cd3b1961633c44b85526f6835998a84` 与 r3 相同，上一轮 registry 运行时文件依赖已被本次远端 seed 覆盖。

随后 `TestABusinessRestoreRowsMySQL` 在 SQL 列闭合检查处报 `incomplete migrated-column closure`，最终 `A_BUSINESS_RESTORE_REMOTE_EXIT=1`。随机库、准确 UID namespace、远端 scratch、本地缓存均报告清理完成；读账号尚未创建，十五表写入/回读、回滚、FK/唯一性、权限及有界数据量阶段尚未执行。[失败审计](evidence/a-business-restore-mysql-failed-sbk-mig-261014071142-71e1.json)保留这一轮的原始结果，不接收为专项通过。

本地源码定位到探针反射投影误收 `models.NorthboundCallerPolicy.Username/Email` 的 `db` tag：它们来自 users JOIN，而正式 migration 057 的策略表只有 `user_id/enabled/scopes_json/created_at/updated_at/updated_by` 六列。测试探针现显式排除这两个关联字段，并新增带非空关联值的六列回归；未知真实列仍拒绝，列闭合错误增加表名、计数与缺失列诊断。修订后 seed 的十五表投影为 220 个可写字段、221 个回读字段。B 后续实际 writer 同样必须只使用各表自有 SQL 列，不能按 DTO 的所有 `db` tag 自动 INSERT 关联字段。生产模型、规范化器、正式迁移和 registry 门禁均未改动。下一轮仍由操作者运行下方完整 `-BusinessRestoreOnly` 命令；不重复三表专项或已通过的 A/D 管理读取专项。

修复后的 [r4 本地记录](evidence/a-business-restore-local-20261014-r4.json)与[完整输出](evidence/a-business-restore-local-20261014-r4.txt)已通过完整 A 包回归/默认 vet、六列与生成列 seed、空目录中的编译后 Windows seed、Linux 探针和迁移 CLI 编译，最终退出 0。Linux 构建首次因本机 `internal/runtime/gc vet.exe 0xc0000043` 失败，同命令、同隔离缓存一次重试后通过，未关闭 vet。44 份 Go 源码及一份嵌入资产在门禁中采样与结束核对时零漂移；该检查不声称冻结整个依赖图。新 Linux 探针 SHA-256 为 `c992cb570395a3b865c26ab1ef6646e3b641739fdbf56fda8e4c988ce45dc7ef`，迁移 CLI 摘要仍为 `0b867cb471b6c5b1b6d529977c079c9a85fbb577e013ca71889b6673263e24ab`。本轮 scratch、缓存及二进制均已清理，并独立确认准确目录不存在；未安装依赖或执行 SSH。真实 SQL 修复验收仍需新一轮完整回执，不把 r4 编译成功扩大为十五表远测通过。

## 2026-10-14 下午：独立探针丢失 registry 夹具，已修复并补门禁

操作者运行 `sbk-mig-261014055505-7480` / namespace UID `f8543764-a936-4d07-b77f-31567f4a139a` 的[失败回执](evidence/a-business-restore-mysql-failed-sbk-mig-261014055505-7480.json)已归档，原始[控制台附件](evidence/a-business-restore-mysql-console-sbk-mig-261014055505-7480.txt)和[完整 transcript](evidence/a-business-restore-mysql-remote-20261014-133105.txt)均保留。5 项派发回归、bundle 校验、94 份 fresh migration 与 pinned runner 均通过；随机业务库也重放了同一 94 份迁移。当前迁移文件集合及 catalog SHA-256 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93` 与本轮逐项一致。

随后 `TestABusinessRestoreRowsMySQL` 构造来源夹具时，`registryFixture` 尝试打开 `../../../contracts/system-backup/v12/schema-registry.json`；MySQL Pod 只有编译后二进制，因此失败。这个运行时文件依赖是 A 探针打包的遗漏，本地 `go test` 在仓库目录下通过未覆盖这一条件。十五表写入、完整列回读、FK/唯一性、SELECT-only 和有界数据量验证均未开始，不能接收为专项通过。随机库、准确 UID namespace、远端 scratch 和本地 cache 清理标记均齐全，wrapper 退出 1；读账号创建尚未到达。

修复将原字节 registry 测试快照放入 A 包 `testdata/schema-registry.json`，仅通过 `_test.go` 的 `go:embed` 编入测试二进制。正常仓库回归逐字节比较它与正式 registry，漂移即失败；每次调用仍解析为独立 map。合成 frozen/reviewer 状态仍只在测试内使用，正式 registry 的 draft 状态和生产 `CaptureScope` 严格门禁均未修改。

两个业务 profile 现在都会在本地编译 Windows tagged 探针，进入没有仓库文件的空目录运行完整十五表 seed；只有这一步通过才继续 Linux 编译与后续 SSH。Pod 内校验二进制摘要后也先运行相同 seed，再运行实际 SQL 用例。其他读取 verifier 合同或运行时源码的测试保留为仓库内 parity 测试，不属于独立探针选择的 seed/SQL 用例。修订后的 [r3 本地记录](evidence/a-business-restore-local-20261014-r3.json)及[完整捕获输出](evidence/a-business-restore-local-20261014-r3.txt)已通过完整 A 包测试/默认 vet、registry 原字节 parity、tagged seed、空目录中的编译后 Windows seed、Linux 探针与迁移 CLI 编译，退出 0。44 份 A Go 源码加一份嵌入资产前后摘要一致；独立确认空目录条目为 0、旧相对 registry 路径不存在。一次 Windows `net/url compile.exe 0xc0000043` 在原命令、同缓存有限重试后通过，未关闭 vet。缓存与二进制均已清理、未安装依赖、未执行远端测试。新 Linux 探针 SHA-256 为 `9d19d84a2e8ac08657d2db6ab94c71609cd3b1961633c44b85526f6835998a84`，迁移 CLI 仍为 `0b867cb471b6c5b1b6d529977c079c9a85fbb577e013ca71889b6673263e24ab`。r2 不覆盖独立运行条件；下一次仍使用下方完整 `-BusinessRestoreOnly` 命令，脚本会重新编译，需以新一轮指纹和 SQL 结果接收。

## 2026-10-14：远端启动失败修复与本地核对

上午三表与十五表两轮均在解包后、启动 MySQL harness 前失败，未获得真实 MySQL 通过证据。保留原始 [三表 transcript](evidence/a-business-history-mysql-remote-20261014-102734.txt) 和 [十五表 transcript](evidence/a-business-restore-mysql-remote-20261014-102704.txt)。两份文件均包含 `=kubernetes-admin@kubernetes: command not found`、远端 scratch 与本地 cache 清理以及退出 1；用户补充的控制台输出包含本地测试/编译和 bundle 摘要校验成功，不能把它们算作远端 SQL 验收。

原因是我在加入 Bash 预检时写成 `$evidenceBashPreflightKUBE_CONTEXT`，PowerShell 将其整体解析为未定义变量，吞掉了 `KUBE_CONTEXT` 环境变量名。现已改为显式 `${evidenceBashPreflight}KUBE_CONTEXT`，并把 Bash 预检改为对三份脚本分别执行 `bash -n`。新增 [离线派发回归](../scripts/system-backup-a-evidence-dispatch.test.ps1)直接提取生产脚本的 profile 赋值和命令字符串，覆盖默认/三表/十五表三种情况，并确认两种业务档位都能拦住原缺陷；5 项已通过。`-Remote` 在编译和首次 SSH 前自动运行这项门禁。回归不连接网络，也不执行生成的 shell 命令，因此不冒充 Bash 或 MySQL 验收。

另在本地核对迁移时发现 `049`/`078` 的 `users.local_username_key` 为正式生成列。探针已将可写列和回读列分开：222 个可写字段不包含该列，完整回读额外校验其值；本地用户应等于目标 username，非本地用户应为 SQL NULL。元数据须证明它是 `STORED GENERATED`，未知列或可写列变成生成列仍拒绝。`DEFAULT_GENERATED` 时间默认值不误算作生成列。后续远测须使用本次修订后新编译的探针，不能沿用上午的二进制摘要。B 实际写入器也须排除这类数据库生成列，保留其正式生成表达式、唯一键和 collation，由 MySQL 计算后再验证，不能把完整回读字段列表直接用于 INSERT。

同日 [D 新组合接口评审](system-backup-d-a-business-batch-review-20261014.md)已接收十五表组合入口和初次/最终 B proof 的候选语义。A 本地核对其 8 份源码摘要全部匹配，关闭“组合接口尚未被 D 候选评审”的交接缺口；真实 B 证明/事务写入、D 生产编排、registry 冻结及恢复放行仍各自待完成。

修订后[本地门禁记录](evidence/a-business-restore-local-20261014-r2.json)及[完整捕获输出](evidence/a-business-restore-local-20261014-r2.txt)：完整 A 包测试（默认 vet）、tagged seed 与生成列子用例、Linux/amd64 MySQL 探针和迁移 CLI 编译全部通过，退出 0。44 份 A 包 Go 源码在验证前后无漂移；不是整个仓库的冻结快照。该轮探针 SHA-256 为 `8d6dfbc41b491c05aaa1563e7b4e60a12f51f43192cb4009f544a26d4003306c`。本轮 scratch、缓存与二进制已清理，并独立确认目录不存在；未安装依赖、未执行 SSH 或真实 MySQL。[命令派发与失败回执记录](evidence/a-business-dispatch-fix-local-20261014.json)另列 5 项派发回归、21 项工具/日志回归及两份 D 评审的指纹核对。

按用户安排，远端测试留到下午约 14:00 用户有空时执行；本轮继续本地工作，不自动发起远测。下一轮只需下方 `-BusinessRestoreOnly` 完整专项，无须再先跑三表档位。

随后按当前工作树做了[生产接线审计](evidence/a-business-production-handoff-audit-20261014.json)：排除测试文件后，整个 `backend` 未找到 A 业务包的导入、十五表规范化入口的调用点或 B 整批 proof 的具体方法实现；匹配仅限 A 接口定义和入口内部调用。该次审计时 r2 记录的 44 份 A 源码零漂移；此后测试夹具修订以本页顶部 r3 记录为准。registry 当前为 `draft`，schema hash 为 `pending_live_evidence`，严格 scope 构造继续拒绝。这里确认的是本工作树的待接点；B 外部代码和未收到的远端结果不在本次证明范围。候选源码评审、本地测试和后续 MySQL 专项各自独立，不据此宣布真实恢复链路完成。下一步分别等待操作者十五表回执、B 的真实来源/目标证明与事务写入器、D 的生产调用和跨 Owner 冻结/发布门禁。

## 2026-10-14：15 表真实 schema MySQL 探针（待修订后远端回执）

新增 `-BusinessRestoreOnly` 独立档位及 [`restore_rows_mysql_test.go`](../backend/internal/systembackupbusinessa/restore_rows_mysql_test.go)。它复用 run ID/namespace UID/二进制摘要固定的隔离 MySQL harness，在本轮随机 `abiz_` 库用 D 的 `ApplyPinnedMigrations` 重放完整正式 catalog，保留原 FK、唯一键、collation 和列类型；不使用 `CREATE TABLE LIKE` 或删减 DDL。catalog 摘要由同轮 harness 的独立 pin 输入，并与探针内嵌 catalog 比较，迁移目标同时绑定实际 server UUID 和准确数据库名。

探针只删除这一本轮随机库里迁移生成的默认 admin/配额测试种子，不启动应用或访问生产业务行。数据库内有独立随机 ownership marker；清理前同时核对源 namespace marker、server UUID 和该随机 marker。新读账号使用独立随机密码，只获 15 张 A 表和 ownership marker 的表级 SELECT，无全局/库级权限或 grant option；测试结束删除读账号、随机库、探针二进制和本轮 namespace。

拟验收范围：

- 统一入口产出的 15 表完整可写列写入并逐列回读，包含数据库计算的 `users.local_username_key` 回读校验，字段集合必须与真实 `information_schema.COLUMNS` 完全闭合；金额保持十进制字符串，JSON 比较语义值，SQL NULL 与空串严格区分。
- 整批末尾注入 duplicate key 后确认 15 表及 B 实例夹具均回滚；正式迁移的五条 A FK 均对悬空引用拒绝，用户名和邮箱按目标 collation 拒绝冲突。当前 gateway 历史中的多项引用没有物理 FK，不能把这五项扩大为它们已有数据库约束。
- 真实 SELECT-only 账号执行 `SQLRestoreVerifier` 的 24 项计数/失活检查；UPDATE/DELETE/INSERT/DDL、源库读取和控制表读取必须被 MySQL 权限拒绝。独立读 proof 的末尾失败不得返回部分 check。
- 第二批验证可空字段和 LDAP 明确清除语义；另一个有界批次包含 1001 用户、1001 配额及其余各表一行。该规模不代替跨 Owner 的 `large-smoke.v1` 发布门禁。

来源/目标证明及写入器均为明确标记的测试夹具，实际 SQL/凭据/FK 结果需操作者远测后才可接收；不是 B 的生产 dump 认证或恢复事务实现。本地 `-BusinessRestoreOnly` 门禁已通过完整 A 包回归、无 MySQL 的 tagged seed、Linux 探针与迁移 CLI 编译，结果见上方 r2 记录。PowerShell parser、5 项派发回归及两种互斥档位的前置拒绝已验证；本机 Git Bash 因 `Win32 error 5` 在启动时失败，未完成 `bash -n`，须由远端执行时验证，不能记为语法通过。

本地门禁通过并冻结代码后，由操作者执行新的完整专项；旧三表专项没有成功远端回执时，可直接选择此更完整的档位，无须先运行两遍：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$aRestoreLog = Join-Path 'docs\evidence' ('a-business-restore-mysql-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
Start-Transcript -Path $aRestoreLog -NoClobber
$aRestoreSavedPreference = $ErrorActionPreference
try {
  # Forward child output through this host so the transcript captures it.
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = $null
  & powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-a-evidence-validation.ps1 -BusinessRestoreOnly -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23' 2>&1 | ForEach-Object { Write-Host $_.ToString() }
  $aRestoreExit = $LASTEXITCODE
  Write-Output "A_BUSINESS_RESTORE_REMOTE_EXIT=$aRestoreExit"
  if ($null -eq $aRestoreExit -or $aRestoreExit -ne 0) { throw 'A fifteen-table MySQL validation failed; retain the complete transcript' }
} finally {
  $ErrorActionPreference = $aRestoreSavedPreference
  Stop-Transcript
}
```

上午旧的外层 transcript 未捕获子 PowerShell 的全部 stdout；上述命令显式将子进程输出转发到当前 host，stderr 本身不作为失败结论，保留真正退出码。已用本地模拟子进程验证 stdout/stderr、含空格参数以及 0/37 两种退出码；不需要 SSH 或 Go 编译。仍须保留整份文件，若终端有额外未落盘内容一并提供。

接收须同时具备本地 `LOCAL_PASS a-business-standalone-seed=yes checkout-fixtures=absent`、Pod 内 seed PASS、同轮 fresh migration 与 pinned migration runner PASS、`TestABusinessRestoreRowsMySQL` 全部阶段及最终 PASS、`PASS a-business-restore-mysql`、读账号/随机库/准确 UID namespace/远端 scratch/本地构建缓存的 CLEANED、指纹一致及 `A_BUSINESS_RESTORE_REMOTE_EXIT=0`，且没有 `CLEANUP_PENDING`。任何失败或缺失均保留原始记录，不拼接不同轮次。该回执仍不关闭 B 的真实证明器/写入器、D 生产编排、registry 冻结或完整大数据量恢复。

## 2026-10-14：15 表统一规范化接线候选

新增 [`NormalizeBusinessForRestore`](../backend/internal/systembackupbusinessa/business_restore.go)，将 users 六表与 AI Gateway 九表组合为一个候选批次。输入是现有各表的来源投影和映射；网关的 users/model 映射同时用于生成依赖行和历史 FK，B 的一份 instances 映射同时用于网关历史和 token 别名。任一表的来源计数与封存 dump 计数不一致、跨表映射漂移、缺少 proof、转换失败或最终授权检查失败，均不返回任何候选行。

`BusinessRestoreBinding` 绑定原 `CaptureEvidence` 的 registry/schema/checkpoint/capture-context/evidence，以及 B 提供的隔离目标身份摘要和目标数据库时间。来源必须完整覆盖 15 表，不能省略空表。入口先复制所有切片、map 与指针字段，再向证明器传独立副本；证明器修改输入或调用方在同步回调期间修改原输入，不能改变这轮实际转换值。调用方仍不得在复制期间并发写原数据，否则属于 Go 数据竞争。

新增 B-owned `BusinessRestoreSourceProofVerifier` 候选接口，须分别实现 `VerifyBusinessRestoreSources` 与 `RecheckBusinessRestoreSources`。初次检查必须认证整批投影（包括空表）、同一封存 dump/checkpoint/evidence、Secret/ref 准确版本、全部依赖映射、目标配额容量、隔离身份与数据库时间、目标占用/唯一性、启动 fence 和 restore-write 权限；最终检查复核同一输入绑定及当前授权。现有企业认证、模型、规则、token 别名和网关各表 proof 仍全部必需，不以整批证明替代。B 必须在实际 SQL 写事务内再次验证隔离身份和写权限；A 的最终检查与之后的 SQL 写入之间没有原子性保证。

`BusinessRestoreRows` 只包含 15 表的完整候选行，没有成功状态、eligibility、目标写入回执或 `PartResult`。本轮不执行恢复 SQL，不开启生产路由，也不修改公共 wire schema 或 registry 的 draft 状态。B 的真实证明器/目标写入器、D 的合同交叉评审和实际编排、全表 MySQL FK/唯一键/权限及大数据量验收仍待完成。

远端 `-BusinessHistoryOnly` 仍仅验证下文的三张历史表列兼容性，不覆盖新 15 表组合入口或真实 B proof。不得用该专项通过扩大宣称整体恢复已完成。

同日新增的 [D 限定源码评审](system-backup-d-a-normalization-boundary-review-20261014.md)覆盖 users 停用、企业认证明确清除、模型双凭据清除、别名到期、风险规则启动门禁及原网关历史六表映射，并接收既有只读校验接口的边界。A 核对其机器记录中的 12 份输入原字节摘要均与当时源码一致。该首份记录未覆盖新组合入口；随后 [D 组合接口评审](system-backup-d-a-business-batch-review-20261014.md)已补齐该候选评审，8 份指纹本轮核对一致。两份评审均未批准 registry 交叉评审列表、合同冻结或真实恢复放行。

本轮[本地验收记录](evidence/a-business-restore-local-20261014.json)：最终源码的完整 Go 业务包回归（默认 vet）退出 0，最终 Linux/amd64 MySQL tagged 探针和迁移 CLI 编译退出 0；共享合同测试 70/70，A 对象向量测试 3/3。最终验证前后 43 份 A 包 Go 源码摘要无变化；这不是整个仓库的冻结快照。初始 profile 与源码补充重叠，其结果不能代替最终记录；一次新增负测因误把合法历史 role 当成非法输入而失败，改用负数消息序号后全包通过，失败输出仍保留。各轮缓存、遥测目录和二进制均已清理，未安装依赖、未连接真实 MySQL。

## 三张网关历史表的隔离 MySQL 探针（待远端回执）

新增 `backend/internal/systembackupbusinessa/history_rows_mysql_test.go`（`systembackup_mysql` 标签）及 `scripts/system-backup-a-business-history-phase.sh`。`-BusinessHistoryOnly` 档位先用本机现有 Go 依赖跑 A 包测试并编译 Linux 探针和当前迁移 CLI；`-Remote` 才会创建带 run ID/UID 的临时命名空间，在其空库重放当前迁移。探针只在该命名空间的 MySQL Pod 内创建身份标记和随机 `abiz_` 库，以 `CREATE TABLE ... LIKE` 复制三张正式迁移表，将 A 候选规范化产生的 `model_invocations`、`audit_events`、`cost_records` 完整行写入并回读脱敏字段、终态及精确金额。测试和脚本验证二进制摘要及目标身份，并在结束时清理随机库、探针文件和临时命名空间。

本轮 `powershell -NoProfile -File .\scripts\system-backup-a-evidence-validation.ps1 -BusinessHistoryOnly` 退出 0：完整 A 包测试、带 MySQL 标签的本地编译、Linux 探针与当前迁移 CLI 编译均通过，`CLEANED local-registration-build-cache=True`。另一次直接带标签的本地编译也退出 0，隔离缓存已清理。未安装依赖；真实 MySQL 探针尚未运行。

远端环境由操作员执行，建议在仓库根目录运行并保存完整回执：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$aBusinessLog = Join-Path 'docs\evidence' ('a-business-history-mysql-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
Start-Transcript -Path $aBusinessLog -NoClobber
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-a-evidence-validation.ps1 -BusinessHistoryOnly -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  $aBusinessExit = $LASTEXITCODE
  Write-Output "A_BUSINESS_HISTORY_REMOTE_EXIT=$aBusinessExit"
  if ($aBusinessExit -ne 0) { throw 'A business history MySQL validation failed; retain the complete transcript' }
} finally {
  Stop-Transcript
}
```

通过门槛：命令退出 0，完整 transcript 同时含 `PASS fresh-migration-replay`、`PASS pinned-migration-runner`、`PASS A business history rows fit migrated MySQL columns`、`PASS a-business-history-mysql`、`CLEANED A business run-owned database`、`CLEANED namespace=`、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True` 和 `A_BUSINESS_HISTORY_REMOTE_EXIT=0`，且没有 `CLEANUP_PENDING`，同轮探针及迁移 CLI 指纹一致。源码或脚本变化后以新运行的摘要为准，不拼接不同轮次输出。这是合成 B proof 投影的列兼容性探针；仍不能作为真实 dump 认证、B 生产写入器、跨表 FK、权限或大数据量恢复的通过证明。

日期：2026-10-13。范围是 A 拥有的 `users` 六表和 `ai_gateway` 九表。对应代码在 [`systembackupbusinessa`](../backend/internal/systembackupbusinessa/capture.go)，check ID 和 expected/actual 闭集在 [v12 verifier 合同](../contracts/system-backup/v12/verifier-contract.schema.json)。这份交接不是 P0a 完成证明。

## A 当前可交付的接口

1. `NewPinnedCaptureScope(registryJSON, expectedSHA256)` 要求独立部署侧 pin 与冻结 v12 registry 原字节相符；15 表、分类、normalizer/verifier ID、实测 schema hash evidence 和全部交叉评审必须齐全。当前 registry 仍为 draft，构造会拒绝。pin 不得从请求或待验证 JSON 自身计算。
2. `SQLCountCollector.CollectSnapshot` 在只读 RepeatableRead 事务内检查 15 张表均为 InnoDB，并一次性返回按表排序的脱敏行数。它不读取业务行，也不产生 dump、staging 或 capture certificate；任何查询/提交失败都不返回部分结果。此独立事务本身不能证明与 B 的 dump 使用同一 checkpoint。
3. `VerifyBackupSnapshot` 要求 B 的 `CaptureProofVerifier` 先认证 source/dump 的注册 evidence、dump 内容及同一 checkpoint，再输出 users 8 项、AI Gateway 11 项 v12 check；checkpoint、capture context 或计数差异会同时返回失败 check 和 `ErrSnapshotMismatch`。
4. `VerifyBusinessMetadata` 只在 proof 和全部 check 通过后给出两类的对象数/行数及 registry、schema、checkpoint、capture context、evidence ID。它没有 `PartResult.status`、staging 字节或 eligibility。`KnownVerificationFailureCategory` 把 A 可确定的备份统计/绑定错误映射为 `validation_failed`、恢复目标计数/失活状态差异及 A 的纯规范化错误映射为 `normalization_failed`、缺少 proof/evidence 映射为 `evidence_incomplete`；B 的签名、provider、权限和超时错误保留原类型。
5. [`SQLRestoreVerifier.VerifyRestoreTarget`](../backend/internal/systembackupbusinessa/restore_verify.go) 是恢复完成后的只读候选校验器。它要求 B 的 `RestoreTargetReadProofVerifier` 在同一只读 RepeatableRead 事务开始和提交前证明隔离目标身份、规范化完成、预期计数/evidence 及 SELECT-only 凭据；随后核对 15 张表的 InnoDB/行数和 9 条凭据或执行状态的失活规则，输出 users 11 项、AI Gateway 13 项脱敏 v12 draft check。SQL、proof 或提交失败不返回部分结果；完整比较出现差异时返回失败 check 和 `normalization_failed`。它不执行恢复写入，也不验证逐行业务值或 Secret/ref。

## B / D 接线前必须补齐

新增 [`model_invocations` 完整行候选规范化入口](../backend/internal/systembackupbusinessa/model_invocation_restore.go)：覆盖迁移 028 的全部 SQL 列。A 的来源投影只接收请求正文、响应正文和错误文本的 SQL 非 NULL 状态，不接收原文；目标对应字段统一写 `[REDACTED]` 或保留 NULL。用户、实例、模型、运行 Pod、gateway、会话和 trace 由 B 证明的来源→目标映射绑定，同批次拒绝重复 ID、trace 复用及映射漂移；历史 `pending` 转为 `failed` 并补终止时间。B 须用真实 dump 独立认证每行原值与 NULL 状态、共同的跨表会话/trace 映射、目标占用和写入权限；当前仅有 A 的纯转换和本地 proof 夹具，不执行 SQL。D 需交叉评审历史 request ID 保留、状态失活与流量门禁。

新增 [`audit_events` 完整行候选规范化入口](../backend/internal/systembackupbusinessa/audit_event_restore.go)：覆盖迁移 028 的全部列。来源消息和 details 原文不进入 A，目标消息固定为 `[REDACTED]`，details 依 SQL NULL 状态写 NULL 或 `[REDACTED]`；调用、会话、trace 等归属映射必须闭合且由 B 证明。该入口仅生成候选历史行，不执行 SQL，也未获得真实 B dump 证明。

新增 [`cost_records` 完整行候选规范化入口](../backend/internal/systembackupbusinessa/cost_record_restore.go)：覆盖迁移 028 的全部列，五项金额均以精确 `DECIMAL(18,8)` 字符串传入和输出，`actual_cost` 保留 SQL NULL，避免运行时 `float64` 精度丢失。A 检查同批 ID、会话、trace、用户、实例、调用、模型等映射与金额/计数格式；B 仍须证明真实来源行、目标占用及写入权限。三张表与既有聊天、风险记录必须共享同一份跨表映射，单表候选入口本身不证明整体一致。

这三张表的增量使用离线 Go 依赖和工作区隔离缓存执行完整 `go test -p=1 ./internal/systembackupbusinessa -count=1`，退出 0；新增测试覆盖原文脱敏、精确金额、空表与失败 proof、引用漂移、历史 pending 失活及零部分结果。隔离缓存已清理，未安装依赖。**A 的 15 表已有各自的候选规范化入口；跨表校验仍待编排接入，真实 B proof、隔离目标 SQL 写入和大数据量验收仍未完成。**

后续新增 [A 网关历史跨表映射校验入口](../backend/internal/systembackupbusinessa/ai_gateway_cross_table_restore.go)，要求 users、llm_models、chat_sessions、model_invocations、audit_events、cost_records、risk_hits 与 chat_messages 的来源→目标引用在同一批次中一致；同一来源 trace 只能落到一个目标 trace，目标 trace 不能复用任一来源 trace。此函数是确定性一致性检查，须在各表 B proof 验证后、目标写入前调用；目前尚未接入 B 写入器，也不代替源 dump 认证。第一次完整 A 包回归在本机 Go 标准库编译阶段遇到 `0xc0000043`，未产生业务断言结论；同一源码以 `GOMAXPROCS=1`、`-p=1` 离线重跑完整 `go test ./internal/systembackupbusinessa -count=1` 退出 0。两次隔离缓存均已清理，未安装依赖。

新增 [A 网关历史组合规范化入口](../backend/internal/systembackupbusinessa/ai_gateway_history_restore.go)：固定整批输入快照，先检查跨表映射，要求 B 对同一份封存 dump、checkpoint、evidence 与依赖映射给出整批来源证明，再逐表执行已有 B proof 和规范化器；任一项失败均不返回部分历史行。组合范围为会话、模型调用、审计事件、费用、风险命中及聊天消息六表；users、llm_models 和 risk_rules 的规范化仍由各自入口完成，组合 proof 必须认证其依赖映射。完整 `go test -p=1 ./internal/systembackupbusinessa -count=1` 离线退出 0，覆盖成功整批、整批证明缺失、跨表漂移、逐表 proof 失败零部分结果及证明器修改输入副本隔离；隔离构建缓存已清理，未安装依赖。当前无真实 B 整批证明器或目标 SQL 写入器，仍仅为本地接线候选。

- B 提供可验证的 capture certificate、准确 Job/attempt/phase identity、同一 MySQL checkpoint 与 dump 内容绑定、source/dump evidence 的登记事实和 sealed staging 的长度/摘要/所有权。若 B 不能证明 A 的来源计数事务与 dump 同一 checkpoint，不能把统计比较写成通过；应改用 B 受控的同一冻结视图重取计数。
- B 另需实现真实的 `RestoreTargetReadProofVerifier`：以独立权威证明隔离目标安装/库身份、已完成的规范化写入、与 dump 绑定的目标预期行数、准确 evidence 和只读数据库凭据，并在事务结束前复查。当前只有 A 的接口与本地夹具；不能把夹具结果当作真实恢复验收。
- D 在任务配置中固定经独立审核的 registry pin，并在捕获时复核当前 live schema hash；当前代码只验证 registry 中已登记的 observed hash，不重新测量运行库的完整 schema。
- D 只有取得 B 的 sealed staging 和证书事实、A 的两类校验结果、准确 task/attempt/config/deadline 后，才可组装 `PartResult`。A 元数据不能替代 B runner、C artifact/finalizer 或 D 的成功/eligibility 判定。
- A 仍需完整 SQL 行与 Secret/ref 的生产捕获/恢复规范化、A/B/C/D 交叉评审、真实隔离 MySQL 和大数据量验证。合成投影 fixture 不能当作生产数据行覆盖证明。

合成 `users` 恢复向量现将历史账号置为 `is_active=false`，并把 `password_hash` 设为固定的非 bcrypt 占位值 `!system-backup-password-reset-required!`。正式迁移的 `users.password_hash` 为 `VARCHAR(255) NOT NULL`，原先置 `null` 的向量无法落库；新值满足列约束且不能作为原密码凭据复用。

[Go 用户规范化入口](../backend/internal/systembackupbusinessa/users_restore.go)现在只接受不含密码、LDAP 身份或登录别名的来源投影与独立目标 ID/用户名/邮箱映射，拒绝错误源 ID、超出 MySQL `INT` 的主键、非法角色和不可落库的文本/时间；生成的完整 `models.User` 行强制停用、`auth_provider=local`、清空外部身份/别名/last_login，并写入同一不可认证占位值。这是可供后续目标写入器消费的纯转换；它不认证 B dump、不证明映射来源或唯一性，也不执行 SQL。生产写入、账号重新启用与密码重置流程仍须单独验收。

增量批处理 `NormalizeUsersForRestore` 要求每个来源用户恰有一条映射、目标 ID 无重复，按目标 ID 输出全批结果并保留不可由调用方改写的 source→target 关系；后续 FK 可通过 `TargetID` 解引用。[配额规范化入口](../backend/internal/systembackupbusinessa/quota_restore.go)仅接收该关系中的用户，要求配额 ID 映射闭合、同一用户至多一条配额及每个目标用户有独立目标容量。`max_cpu_cores` 用迁移 009 的 `DECIMAL(10,2)` 字符串精确比较，超额或非规范十进制直接失败；任一错误不返回部分配额。目标容量必须由 B/D 的隔离目标权威提供，当前代码不认证该来源，也不执行 SQL。MySQL collation 唯一性、目标库既有行和 restore-write 权限仍必须在写入前由 B 验证。

[北向认证挑战完整行规范化入口](../backend/internal/systembackupbusinessa/northbound_challenge_restore.go)覆盖正式迁移 045 的 `northbound_auth_challenges` 字段：按独立来源→目标 ID/challenge ID 映射生成可写行，保留 v12 草案要求的 nonce hash 与 key ID，但强制 `status=expired`，把 `expires_at`、`used_at` 和 `updated_at` 固定到 B 提供的目标数据库 UTC 时间之前，并清除来源 IP。批量入口拒绝映射缺失/重复、大小写冲突、非法 hash/状态/时间，任一失败不返回部分行；空批次也要求有效目标时间。生产仓库的 `ClaimChallenge` 会把 issued 行置为 `processing`，故草案来源状态闭集已补上 processing，fixture 证明其也会失活。B 仍须独立认证 dump、目标时间/映射、目标库唯一性与写权限；当前入口不执行 SQL，也不能证明历史 nonce 在源端已撤销。

[北向会话完整行规范化入口](../backend/internal/systembackupbusinessa/northbound_session_restore.go)以已规范化用户映射重建 `northbound_sessions.user_id`，保留经闭集校验的历史 refresh hash、hash history 与 scope JSON，并把 `status` 固定为 `revoked`，将 access/refresh 过期及 `revoked_at` 固定在目标数据库时间之前。批量入口拒绝来源/目标 ID、session ID 和当前 refresh hash 冲突；单行入口拒绝不合法的历史 JSON、未知/重复 scope、非法时间与未映射用户，失败不返回部分行。scope 闭集按当前 `northbound/types.go` 固定，运行时增加 scope 必须触发 A 策略复审；D 仍须交叉评审这项候选实现。B 必须独立认证 dump、目标时钟/用户映射、目标库唯一性和写权限；当前入口不执行 SQL。

B 解码正式迁移 045 的 `DATETIME(6)` 时须按 UTC 语义给 A，目标时点须由隔离目标库的 `UTC_TIMESTAMP(6)` 取得并认证；调用方传入的本机时间不能代替。SQL 写入前仍需按目标 MySQL 的 collation 与既有行重检 session ID 和 refresh hash 唯一性。

[北向调用者策略完整行规范化入口](../backend/internal/systembackupbusinessa/northbound_caller_policy_restore.go)覆盖正式迁移 057 的 `northbound_caller_policies`：主键 `user_id` 和可空 `updated_by` 均通过 A 已闭合的用户映射转换，来源 scope JSON 仅允许当前认证/管理端一致的十项生产闭集，拒绝未知或重复 scope、启用但空 scope、无效时间及重复用户；输出策略始终 `enabled=false`。SQL 列可空的 `updated_by` 在 Go 来源投影中保留 nil 区分，B dump 解码器不得把它默认为 0。用户名、邮箱和 DTO 专用 `Scopes` 不属于写入行；B 须另验目标用户占用、真实 dump 与 restore-write 授权，D 须对策略做交叉评审。

`enterprise_auth_settings` 的密码清除语义已按生产运行时代码修正：`LDAPBindPasswordCiphertext == nil` 会继承环境变量 `LDAP_BIND_PASSWORD`，非 nil 的空字符串才是明确清除。v12 合成恢复向量现在输出 `ldap_bind_password_ciphertext=""`；只读恢复校验会把 SQL `NULL` 和任何非空密文都计为失活违规。B 的正式写入器必须保留这一 `NULL`/空串区别，并验证 Secret/ref 的准确版本后才可规范化；当前向量及只读计数不证明生产密文来源、逐行数据或实际恢复写入。D 需交叉评审该语义与目标环境变量行为。

[企业认证完整行候选规范化入口](../backend/internal/systembackupbusinessa/enterprise_auth_restore.go)现覆盖迁移 050 的全部非密文 SQL 字段：来源投影将原密码列区分为 SQL NULL、明确空串和非空密文引用，只有后者携带脱敏的不可变 Secret/ref 版本；任何来源密文都不会进入输出行。批量入口要求冻结 registry 的独立 pin、已规范化用户映射、准确 evidence ref 和 B 的 `EnterpriseAuthSourceProofVerifier`，空表也必须证明；错误来源、未来 provider、重复/越界 ID、未知密码状态或版本别名、未映射 `updated_by` 均零部分结果。输出保留其余历史列并强制 `enabled=false`、`ldap_bind_password_ciphertext=""`。当前 proof 只有本地夹具，B 必须对真实 dump、SQL NULL/空串/密文状态、typed Secret/ref 的准确版本和目标写入权限实现独立证明；D 需交叉评审。单行纯转换入口本身不构成恢复授权。

该增量的完整 `go test ./internal/systembackupbusinessa -count=1 -p=1` 第一次遇到本机 Go 编译器 `0xc0000043`，在同一隔离缓存下重试相同命令后退出 0，`CLEANED a-enterprise-row-test=True`。用例覆盖全行失活输出、SQL NULL/空串/非空来源状态、更新者 FK、空表 proof、版本漂移、输入错误及 proof 失败零部分结果。未安装依赖；测试构建缓存及临时目录已清理。尚无真实 B proof 或目标 MySQL 行写入回执。

`llm_models` 还存在第二条凭据路径：运行时的 `SecretRefService.ResolveString` 在 `api_key` 为空时会解析 `api_key_secret_ref`。v12 合成向量现将两列都置为 SQL NULL，A 只读恢复校验同时拒绝两列的非 NULL 值。新增[模型完整行候选规范化入口](../backend/internal/systembackupbusinessa/llm_model_restore.go)覆盖迁移 045/056：来源直接 key 和 Secret 引用分别以 NULL/空/非空状态及不可变版本进入 B proof，不把原值传给 A；目标模型禁用并清空两列。价格使用精确 `DECIMAL(18,8)` 字符串，避免现有运行时 `float64` 模型丢失小数精度。模型列表 JSON 只允许运行时的 `id`/`display_name` 闭集，URL 禁止用户信息和查询参数，任何错误都不返回部分目标行。B 须独立实现真实 dump、两条凭据路径的 typed Secret/ref 认证、映射/目标占用和写入授权；D 须交叉评审。当前候选实现不执行 SQL。

此增量的 `node scripts/system-backup-a-object-fixtures.test.mjs` 为 3/3，共享合同测试为 70/70；完整 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次退出 0，`CLEANED a-llm-model-test=True`。Go 用例覆盖双凭据失活、精确价格、完整列、空表/失败 proof、版本漂移、URL/JSON/价格负测和重复名称零部分结果。未安装依赖，隔离构建缓存与临时目录已清理；真实 MySQL 与 B proof 仍待验证。

[Gateway token 别名完整行候选规范化入口](../backend/internal/systembackupbusinessa/gateway_alias_restore.go)覆盖迁移 038 的 BIGINT ID、B 拥有的 `instance_id`、历史 SHA-256 token hash、三个非空时间和可空 `last_used_at`。A 将目标 `expires_at` 固定为 B 提供目标数据库 UTC 时间所在整秒的前一秒，保证 MySQL `TIMESTAMP` 秒级列落库后仍早于当前目标时点；原始 token 从不进入 A。批量入口要求冻结 registry pin、来源→目标别名与实例映射，以及 B 对真实 dump、映射、目标时钟和目标 `instances.access_token` 已清除的独立 proof，空表也要证明。运行时 `GetByAccessToken` 先查 B 的 `instances.access_token`，才查 A 的过期别名；因此单靠 A 别名过期不能证明旧直连 token 失效。B 必须在实例恢复中清除直连 token，并对目标唯一键、FK 与写入权限负责；D 需交叉评审这一跨 owner 顺序。当前接口不执行 SQL，proof 只有本地夹具。

该增量完整 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次退出 0，`CLEANED a-gateway-alias-test=True`；用例从来源尚活跃的别名证明目标到期、BIGINT/实例映射、历史时间保留、空表 proof、B 直连 token/目标时钟 proof 失败零部分结果、非法 hash/孤儿实例/重复 hash 拒绝。未安装依赖，隔离构建缓存和临时目录已清理。真实目标 MySQL 写入及 B proof 仍待执行。

[风险规则完整行候选规范化入口](../backend/internal/systembackupbusinessa/risk_rule_restore.go)覆盖迁移 079 的所有列，保留通过闭集和 Go 正则校验的历史规则内容、动作、严重度、排序和审计时间，但目标 `is_enabled` 恒为 false；来源和目标规则 ID 映射须与 `risk_hits.rule_id` 字符串引用一致，内置规则身份不得改名。B proof 必须认证真实 dump、映射及隔离目标的应用启动门禁，空表同样需要证明。运行时 `NewRiskRuleRepository` 在构造时会补种缺失的内置规则，且补种值 `IsEnabled=true`；若目标应用在 A 的失活校验和 D 的放行之前启动，会重新出现启用规则。反过来，`RiskDetectionService` 在无启用规则时返回 allow，因此隔离恢复目标不能在规则重新审阅前服务用户流量。当前只有 A 候选转换和本地 proof 夹具，没有 B 启动门禁、生产 SQL 写入或 D 放行实现；D 需交叉评审启动顺序和规则重启策略。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次被本机 Go 工具 `0xc0000043` 中断；在同一隔离缓存下重试相同命令后退出 0，`CLEANED a-risk-rule-test=True`。用例覆盖完整行失活、空表和启动门禁 proof、无效动作/严重度/正则、规则 ID 冲突及内置规则映射拒绝。未安装依赖；隔离构建缓存、遥测目录和临时目录已清理。测试没有接入 B 真实 dump 或目标 MySQL。

[风险命中完整行候选规范化入口](../backend/internal/systembackupbusinessa/risk_hit_restore.go)覆盖迁移 028 的全部 SQL 列。`trace_id` 改用 B 证明的跨表映射，历史 `request_id`、规则名称/动作/等级和时间保留；`match_summary` 按 v12 合成向量统一写成 `[REDACTED]`，不把可能含敏感内容的原摘要带入目标库。可空用户、实例、运行 Pod、模型调用、会话和 gateway 归属仅在 B 提供闭合映射时重建，`rule_id` 必须命中同批风险规则映射；原 SQL NULL 保持 NULL。B 的 `RiskHitSourceProofVerifier` 必须独立认证真实 dump、跨表映射、目标占用和写入授权，空表也须证明。当前接口与本地夹具不执行 SQL，尚无隔离目标 MySQL 回执；D 需交叉评审摘要脱敏和归属映射策略。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次退出 0，`CLEANED a-risk-hit-test=True`。用例覆盖完整行脱敏、空表 proof、SQL NULL、缺失规则、引用漂移、非法字段、同一用户映射不一致和 proof 失败零部分结果。未安装依赖，隔离构建缓存、遥测目录与临时目录已清理；该结果不等于 B 真实 dump 或隔离目标 MySQL 验收。

[聊天会话完整行候选规范化入口](../backend/internal/systembackupbusinessa/chat_session_restore.go)覆盖迁移 079 的全部 SQL 列：用户/实例可空引用经 B 映射，历史标题与时间保留，目标 `session_id` 不得等于自身或本批任何来源 `session_id`，`last_trace_id` 一律写 SQL NULL。B proof 须认证 dump、目标库唯一性、用户/实例存在、与 `chat_messages`、`model_invocations`、`risk_hits` 一致的会话 ID 映射及写入权限。运行时即使无 `last_trace_id`，仍可能按会话 ID 从模型调用记录回查 trace；因此仅清空游标不足以证明来源执行不可继续。D 必须结合模型调用内容脱敏、目标会话标识发放和应用流量门禁交叉评审。当前只有纯转换和本地 proof 夹具，无真实目标 SQL 写入。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次退出 0，`CLEANED a-chat-session-test=True`。用例覆盖完整行与游标清除、空表 proof、SQL NULL、来源 ID 复用拒绝、来源集合碰撞、引用漂移、时间异常及 proof 失败零部分结果。未安装依赖，隔离构建缓存、遥测目录和临时目录已清理；B 真实 proof、隔离 MySQL 和 D 评审尚未通过。

[聊天消息完整行候选规范化入口](../backend/internal/systembackupbusinessa/chat_message_restore.go)覆盖迁移 079 的全部 SQL 列，保留历史 role、请求 ID、序号和时间，把 LONGTEXT `content` 固定为 `[REDACTED]`。每条消息须引用同一批 `chat_sessions` 来源→目标会话映射，`trace_id` 另由 B 证明跨表一致的来源→目标映射，目标 trace 不得与本批任何来源 trace 重合；可空用户、实例和模型调用引用分别映射，原 SQL NULL 保持 NULL。B proof 须独立认证真实 dump、跨表映射、目标占用和写入权限，空表也不能跳过。当前只有 A 纯转换与本地夹具，D 需联审内容脱敏后可用的历史审计范围及应用流量门禁。

`chat_messages` 首轮完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-chat-message-test=True`。发现 `risk_hits` 仍保留来源 trace 后，已把该表也改为受 B proof 约束的目标 trace 映射，并为两表补充来源 trace 重用、同源拆分与异源合并负测。最终文件状态再次运行完整包，同样首次退出 0，`CLEANED a-chat-risk-final=True`。未安装依赖，两次隔离缓存、遥测目录与临时目录均已清理；测试仍未接真实 B dump 或目标 MySQL。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次被本机 Go 工具 `0xc0000043` 中断；在同一隔离缓存下重试相同命令后退出 0，`CLEANED a-caller-policy-test=True`。测试覆盖禁用输出、两处用户外键、可空更新者、生产认证与管理端 scope 闭集同步、未知/重复权限及零部分批量结果。未安装依赖；临时构建缓存和遥测目录已清理。测试未接 B dump，也未写隔离 MySQL。

B 拥有的 `northbound_operations.session_id` 是字符串引用，正式迁移 045 未声明外键；B 恢复该表时仍须使用同一份来源→目标 session ID 映射，不能因为数据库没有 FK 就保留指向旧会话的字符串。A 的批量入口不代替 B 对跨域字符串引用的验证。

会话规范化及统一错误分类增量以 `go test ./internal/systembackupbusinessa -count=1 -p=1` 完整包验证，首次退出 0，`CLEANED a-session-category-test=True`；上一轮规范化入口的完整包测试同样退出 0，`CLEANED a-session-restore-test=True`。用例覆盖目标用户 FK 映射、撤销/到期、历史 JSON 与 scope 闭集、运行时 scope 漂移、批量冲突零部分结果和五类 A 恢复错误的 `normalization_failed` 映射。未安装依赖，隔离 Go 缓存与临时目录均已清理。两轮均为本地纯转换测试，不是 B dump 或真实 MySQL 恢复回执。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-user-quotas-test=True`；用例覆盖批量映射闭集、不可变结果副本、孤儿/重复配额、精确 CPU 小数、目标容量不足及零部分结果。随后发现正式 SQL 配额数值列允许 `NULL`，来源投影已改为显式可空指针且规范化器拒绝 nil，避免把 `NULL` 默默解释为零。修正后的四文件定向 `go test` 再次退出 0，`CLEANED a-user-quotas-null-test=True`，覆盖 SQL NULL 拒绝；最终增量尚未重跑完整包。两轮均未安装依赖，隔离构建缓存与遥测目录已清理。B dump 解码器尚未接入，必须原样保留 SQL NULL 区分。

验证：先运行完整 `go test ./internal/systembackupbusinessa -count=1 -p=1`，退出 0，`CLEANED a-users-restore-test=True`；补上 MySQL `INT` 上限拒绝后，定向 `go test internal/systembackupbusinessa/users_restore.go internal/systembackupbusinessa/users_restore_test.go -count=1 -p=1` 再次退出 0，`CLEANED a-users-restore-final=True`。负测覆盖错误映射、越界主键、非法角色、超长/控制字符/无效 UTF-8 和非法时间；bcrypt 比对确认占位值无法认证。两轮均未安装依赖，构建缓存和遥测目录均已清理。最终增量尚未重跑完整包；较早完整包结果不覆盖之后的主键上限改动。

验收状态：A 本地包测试与共享合同测试覆盖 15 表闭集、草案拒绝、pin 漂移、SQL 原子失败、proof 缺失、结果差异、溢出、类别统计、错误分类和运行时 check ID 与合同一致。本轮 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-businessa-failure-test=True`；未安装依赖。真实 B proof 和生产 `PartResult` 尚无通过回执。

只读恢复校验增量的共享合同测试 `node scripts/system-backup-contract-artifacts.test.mjs` 为 70/70；完整 Go 包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-restore-verify-test=True`。用例覆盖 24 个 draft check ID 与合同顺序一致、单个只读事务、B proof 前后复查、行数与失活状态差异、SQL/提交/proof 失败零部分结果。未安装依赖，隔离构建缓存与遥测目录已清理。此处的 B proof 是本地夹具，真实隔离目标 MySQL 尚无接收回执。

挑战状态合同修正后，`node scripts/system-backup-a-object-fixtures.test.mjs` 3/3 通过；新增规范化器的完整 Go 包测试退出 0，`CLEANED a-challenge-restore-test=True`。Go 测试执行期间又追加了空批次目标时间门禁和负测，因此最终文件再以相同三文件定向命令复测：第一次被本机 Go 编译器异常 `0xc0000043` 中断，构建缓存已清理；重试 `go test internal/systembackupbusinessa/northbound_challenge_restore.go internal/systembackupbusinessa/users_restore.go internal/systembackupbusinessa/northbound_challenge_restore_test.go -count=1 -p=1` 退出 0，`CLEANED a-challenge-final-retry=True`。未安装依赖，测试均不连接目标 MySQL。
