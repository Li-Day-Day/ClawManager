# A 审计采集器：隔离 MySQL 验收入口

本入口只验收 `system-backup-audit-collect` 的实际 MySQL 查询与 Node 审阅衔接。没有复跑另一个 A 的 owner、角色专项，也不需要 B/C 尚未交付的 bootstrap 资源。

## 14:43 轮已接收：17 项隔离 MySQL 全部通过

操作者提供[原完整回执](evidence/a-live-audit-mysql-aaudit-20261022144319-a2932cb5.json)及[原始日志](evidence/a-live-audit-mysql-aaudit-20261022144319-a2932cb5.txt)，已通过原版完整 bundle 审阅。[A 限定接收](evidence/a-live-audit-mysql-accepted-20261022.json)确认 MySQL 8.4.8 的 17 个子项和父测试全部 PASS，五份实际 SQL envelope 经 Node 接受两个正常样本、拒绝错关联/缺 nonce/错摘要三个样本，SSH 与远端退出 0。该专项待办关闭，无需重复执行。

本轮 namespace 为 `aaudit-20261022144319-a2932cb5`，UID `c3dd3327-9801-46e3-8574-968023ae7a13`，准确 namespace 及上传目录均报告 `absent=yes`，本地清理 true。probe SHA 为 `a167b495ced5856ca7ee380f16e18707d2f2cc9bb16cc79ebb877dc428421fed`；原回执 SHA 为 `c853673d41eae495af9d4cab8f4ef0e5b4c62c9302a87df705802332a4e96a16`，原日志 SHA 为 `bee69adb9a8c29f95c0c12abecdba034b5b0673c67225cbaa833e4132a3ec792`。原源码摘要 `0e80d17469a8be44798334fbfcaedc6b27db6aeef2fa7dbae8cad8c85a2f688e` 及完整 31 项来源在接收时与工作区匹配，默认 vet/最终源码复核通过，未安装依赖。未重新登录核实远端删除；公开回执没有准确本地 owner 路径，不补写独立路径清理成功。

接收后，本对话的另一项 A 本地工作修正了共享合同 checker 的有限结构门禁，因此普通 bundle 的“当前全部来源”检查会因那份共享脚本变化而拒绝旧源码清单。原回执不改写、不重测来消除这一历史差异。已经在修改前、原版 bundle 成功核对全部来源后保存[原 31 项源码证据胶囊](evidence/a-live-audit-mysql-aaudit-20261022144319-a2932cb5-source-capsule.json)，完整字节 SHA 为 `3b59c0a653c2bfb27180a2986c9f0120964349de4c4500c3151d0c0a8d9195f0`；它不包含测试二进制或凭据文件。对本轮历史结果使用下述专用只读复核：

```powershell
node .\docs\evidence\a-live-audit-mysql-accepted-review-20261022.mjs --check
```

该脚本先用固定摘要验证原回执、日志、接收记录及整个胶囊，逐项核对原 manifest 和每份源码字节，再在独占临时目录中运行受验的原版接收器；结束精确删除临时副本。它不使用当前源码替换原受验版本，也不认证当前整棵工作树。源码证据胶囊是可追溯材料，临时解包目录、缓存与构建产物不保留。共享 checker 的新本地修复及前后各 120 项回归有[独立接收记录](evidence/a-d-verifier-security-published-review-20261022.json)，不修改本轮数据库结果。

本次仍为五张选定列合成表、Unix socket 和合成 HTTP 回执；没有正式应用迁移、TLS 握手、真实登录/MFA、真实下载 HTTP/provider 或恢复 E2E，不关闭 27 项 bootstrap 资源/受审运行装配等缺口。下面两轮失败和准备状态保留其原义。

## 14:18 轮 Pod 已就绪，SQL 夹具失败

[原轮回执](evidence/a-live-audit-mysql-aaudit-20261022141823-e13e4bde.json)及[原始日志](evidence/a-live-audit-mysql-aaudit-20261022141823-e13e4bde.txt)确认临时 MySQL 已启动，探针进入 `TestAuditCollectorMySQL`，但在原 `mysql_test.go:81` 的 schema 初始化阶段失败，17 个子项尚未开始。根测试、远端和 SSH 均为 exit 1；namespace `aaudit-20261022141823-e13e4bde` / UID `ce5b62e3-5e4a-44da-85e3-d4b1fceb2d61` 及上传目录报告 `absent=yes`，本地清理 true。原日志没有 MySQL 数字错误码，不能补写具体的数据库错误码或把这一轮改为成功。

源码核对发现原 schema 的首行注释含分号，而执行器直接 `strings.Split(schema, ";")`，会把注释拆成额外 SQL 片段；另有尚未执行到的 operation INSERT 使用 11 个占位符、只有 10 个参数。修复把真实嵌入 fixture 和初始化构造移入共享的测试文件，默认本地包与 tagged 探针使用同一实现：跳过完整注释行，限定五张已知表的一行一条 CREATE，拒绝未知/重复/缺表或不支持的多语句布局；所有 seed INSERT 显式列名并校正 operation 的十列/十参数。没有改正式迁移、生产采集查询、账号权限、17 项清单或接收标准。

失败诊断现在只输出固定阶段、错误类别及 MySQL 数字错误码/规范 SQLSTATE，绝不输出 SQL、密码、DSN、audit 正文或原始 error message。默认本地测试直接检查真实五表 DDL与六条 seed 的列/占位符/参数一致性、注释分号与 CRLF、布局拒绝及诊断脱敏。修复的本地验证与新探针编译完成后仍须新一轮完整远测；本地检查不证明实际 MySQL 17 项通过。

[修复后的本地回执](evidence/a-live-audit-mysql-aaudit-20261022143049-f0c7c704.json)为 `local_compiled_real_mysql_pending`：完整采集器包测试/default vet 通过（包测试 1.100 秒，不含冷编译），Linux tagged 探针编译通过，入口退出 0，源码/文件集合前后匹配，local cleanup=true，无远测或依赖安装。新增三个 Go 主测试及诊断的五个命名子项随完整默认包执行；审阅器/bundle 11 项另行全部通过。冻结来源摘要为 `29c8fd7b5845affabb2703cbf4f266474d66eed05f1a6e12c88b1cdf90f6a161`，本地探针指纹为 `a167b495ced5856ca7ee380f16e18707d2f2cc9bb16cc79ebb877dc428421fed`。结束后独立重算全部已选输入仍匹配，并确认准确 owner `.tmp-a-evidence-15fa6455954a4d338674db0a39f8418d` 不存在；冻结源码、cache/tmp 和二进制均已删除。该指纹属于已删除的测试构建，后续远测重新构建并保留新轮绑定，不据此认证部署镜像或实际 SQL 结果。原 14:18 失败回执与原字节保留。

## 13:34 轮启动超时与轻量诊断

操作者回传的 [Public receipt](evidence/a-live-audit-mysql-aaudit-20261022133449-57611b7c.json) 和 [原始日志](evidence/a-live-audit-mysql-aaudit-20261022133449-57611b7c.txt) 保留失败：本地单测/default vet 和 Linux 探针编译通过，但临时 MySQL Pod 等待 Ready 240 秒超时，SSH/远端退出 1，17 个 SQL 用例尚未开始。namespace `aaudit-20261022133449-57611b7c`、UID `e090a3d1-b4d9-42c6-8dda-17d64f7f6398` 和上传目录均报告 `absent=yes`；本地清理为 true。回执的 `remote_cleanup_verified=false` 是包装器未走到完整成功审阅的保守状态，不抹去日志中的清理报告，也不等于已独立登录复查。

旧日志未采集调度事件，不能据此认定根因。历史同类问题出现过 `Too many pods`，本轮也需原调度事件确认；不自动缩容或删除其他工作负载。

先在本机仓库根目录执行同一入口的轻量模式，无需重新编译 Go：

```powershell
& .\scripts\system-backup-a-live-audit-mysql.ps1 -Remote -StartupOnly
```

它冻结当前输入并校验上传脚本，复用完整模式的原镜像 digest、原 MySQL 所在节点、Never 策略、资源限额、Secret、emptyDir 和同一 Ready 探针；只上传 shell，不构建/上传测试程序，不运行 SQL、应用迁移或 Go telemetry。Ready 后立即清理，成功状态仅为 `isolated_mysql_startup_passed`，不能交给完整 17 项 SQL 接收器作为通过证明。该模式必须显式带 `-Remote`。

两种模式超时均在清理之前采集本轮 Pod 的公开状态、container reason/exit、按 Pod UID 过滤的事件 reason 和 FailedScheduling message，以及原节点 Pod 上限与非终态 Pod 数。查询有 10 秒请求时限；namespace UID/run label 或 Pod 身份不符时跳过诊断；诊断失败不覆盖原等待失败、不阻止清理。不会读取 Secret 内容、Pod YAML、数据库日志或 readiness 的原始报错正文。Pod 数采样和调度事件并非同一原子快照，最终以本轮事件和状态共同判断。

若事件明确为 `Too many pods`，先由操作者处理对应节点容量，再重跑轻量模式；Ready 成功后才继续下面的完整 `-Remote` 命令。否则按实际 waiting/terminated/scheduling 原因处理。保留新生成的两个回执文件，不用旧超时日志重建已删除 Pod 的原因。

本地诊断增量已验证：[复核记录](evidence/a-live-audit-startup-diagnostic-local-20261022.json)固定相关源码/测试摘要及原失败回执。13 项 shell 生命周期检查、11 项审阅器/bundle 检查均通过；PowerShell 7 和 5.1 各通过七个真实包装器命令替身场景、缺 Remote 拒绝及实际源码清单 parity，Bash 语法检查通过。保留沙箱 Bash 启动失败、中止轮及首次完整套件的六项替身错误；替身改用 return 后分四组重跑全部 13 项 shell 检查通过。只验证本地流程，不计作现场 SQL、Go 新构建或 17 项验收。自有临时目录、模拟回执和中止轮本机上传夹具均已清理，不安装依赖、不联系集群。操作者随后报告已清理不用的 Pod，可直接继续下方完整 `-Remote` 专项；本页尚未接收新轮结果。

## 操作命令

在本机仓库根目录 PowerShell 执行：

```powershell
& .\scripts\system-backup-a-live-audit-mysql.ps1 -Remote
```

默认 SSH 目标 `root@10.130.14.23`；可以用 `-SshTarget` 指定已有授权的测试节点。不带 `-Remote` 仅运行本地单测、默认 vet 和 Linux 测试程序编译，不会联系远端。沿用本机已有 Go、Node、rg、ssh、scp；不安装依赖，`GOPROXY=off`，独立缓存和 telemetry=off。

脚本冻结采集器和审阅器的依赖文件，绑定源码与 Linux 测试程序 SHA-256。远测前后复核源码；同一次远测不会自动重试。结束时打印：

- `Public receipt: ...json`：源码清单、编译状态、远测请求和审阅结果、本地清理状态。
- `Remote transcript: ...txt`：远端用例、公有合成样本、命名空间 UID 与清理结果。

运行后提供这两个路径即可。测试程序、源码副本、私有 DSN 文件和独立编译缓存均属于临时产物，不作为交付文件保留。

## 回传后独立复核

新版回执带 `evidence_binding_version=1`，保存本次 `run_id`、实际 SSH 退出码及原始日志文件的 SHA-256。包装脚本在审阅前后检查日志未变化，源码清单同时包含复核入口。旧版回执缺少这些绑定时不能用新版入口判定通过；此前仅本地编译的回执仍只表示远测待完成。

新增 `stage` 和 `failure_stage` 固定阶段标识，区分源码冻结、telemetry、本地单测/vet、Linux 编译、上传、远端 MySQL、日志审阅和最终源码复核。阶段标识不包含凭据或原始异常正文，只说明执行停在哪个关口；手动中止需结合操作者说明判断，不能据此推断工具故障。

获得两个实际路径后，可在本机只读复核：

```powershell
node .\scripts\system-backup-a-live-audit-mysql-bundle.mjs --receipt '实际 Public receipt JSON 路径' --transcript '实际 Remote transcript TXT 路径'
```

该入口不连接 SSH、数据库或其他网络，也不修改证据文件。它要求运行/清理/源码校验均成功，检查日志原始字节、运行 ID、测试程序摘要、已保存审阅结果和当前源码清单，并重新审阅 17 项测试记录及 5 个原始 SQL 样本。日志转换换行、混用不同运行、缺用例、正文变化或源码不匹配均拒绝。成功输出 `isolated_mysql_receipt_verified`；失败以非零状态退出。

源码摘要按 PowerShell 回执中的顺序、路径、文件大小及 SHA-256 重算，并核对完整依赖集合和当前文件内容。SHA-256 绑定用于证据一致性核对，不是数字签名或独立执行证明，仍需确认操作者及现场执行来源。当前源码已变化时，应先确认对应版本，不能直接把新代码与旧回执混合验收。

## 远端隔离边界

只读取现有 `clawmanager-zhanghui08-system` 命名空间中 MySQL Pod 的公开镜像摘要与节点元数据。不会读取现有数据库、Secret 或业务凭据。

创建名称为 `aaudit-<14 位时间>-<8 位随机串>` 的新命名空间。Pod 在同一节点复用已有不可变 MySQL 镜像，`imagePullPolicy: Never`；无缓存镜像即失败，不会拉取。设置 CPU、内存、临时磁盘上限，使用 `emptyDir`、独立随机密码、无 ServiceAccount token、600 秒 Pod 截止时间。

命名空间 UID 和 run label 在执行及删除前均检查。全新 MySQL 内的 guard 表绑定 run ID、命名空间 UID 与 `@@server_uuid`；测试拒绝已有其他用户数据库的服务器。只读 observer 和无权限账号均为本次临时新建。

`testdata/mysql.sql` 是 **5 张表的查询列兼容合成夹具**，不是正式迁移；没有运行应用迁移、没有复制线上表结构或数据。其用途是检查真实 MySQL 的 JSON 类型、预处理查询、只读事务、账号权限和采集后审阅行为。不能据此声称正式部署 schema 已验收。

## 用例与通过标准

17 个叶子用例：首尾各一次正常采集；server UUID、数据库、账号、角色、operation 不匹配；无权限账号；observer 更新被 MySQL 拒绝；MySQL 执行只读事务时拒绝更新；缺失 join；损坏 admission JSON；未知正文成员；重复结果行；错审计关联；缺 nonce；正文摘要错误。

正常采集、错关联、缺 nonce 和错摘要共输出 5 个带真实 SQL 原始结果字节的 envelope。Node 审阅器必须接受两次正常样本，拒绝三个错链/摘要样本；单有 Go `PASS` 不算完成。其余拒绝用例必须没有成功输出。

成功回执必须同时具有 17 个唯一用例、正确源码/程序哈希、本次命名空间和 UID、`absent=yes` 清理记录、SSH 零退出及完整 Node 审阅。失败、重复、截断、清理未验证都会拒绝。

结束删除整个隔离命名空间，检查不存在，并删除远端上传目录；本地在 `finally` 中删除独立源码、测试程序和缓存，保留公开证据。SSH 中断时不能推断远端清理成功，应保留部分回执核实其中命名空间和 UID；不要直接重跑或删除其他命名空间。

删除后查询命名空间不存在时，必须同时满足 API 调用成功和结果为空。API 失败、删除失败或 UID 变化均报告 `absent=unverified` 并以失败退出。创建响应丢失时，只能在名称和本次 run label 匹配后恢复 UID，再校验后清理。

包装脚本在最后一次源码校验通过后才写入整体通过状态；SSH、审阅或源码复核失败，回执统一记为 `status=failed`、`source_stable=false`。用命令替身运行真实包装脚本，验证这些异常时不会保留通过状态；这些模拟回执在测试结束时删除，不作为数据库验收证据。

## 证据含义

状态 `local_compiled_real_mysql_pending` 表示本地准备已通过，尚未得到远端结果。只有操作者远测回执经审阅后，才允许报告 `isolated_mysql_collector_passed`。

即使隔离 MySQL 验收通过，HTTP 回执仍是合成夹具；TLS 连接、正式迁移、真实登录/MFA、provider 传输、完整恢复链路及生产审批均未覆盖。完整现场链路仍需实际授权、B/C 资源交接和运行配置就绪。
