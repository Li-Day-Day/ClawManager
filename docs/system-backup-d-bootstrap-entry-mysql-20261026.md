# D bootstrap 部署/旧入口专项

最新补验（2026-10-27 09:58 终态）：`d846e3793f0242cd96da1912a39c49de` 已完成准确原 1,741 份输入的 server、bootstrap、migration runner 和 tagged evidence 四项 Linux 构建，前后检及清理均通过。D1 独立接收器生成结果和 `--check` 均 exit 0，见 `evidence/d1-bootstrap-entry-linux-reviewed-20261027-d846.json`；四份恢复的原文件字节、命令、二进制摘要、删除及 owner 缺席均已核对。该结果只补齐原冻结来源的 Linux 检查，原 ae7 仍为 failed，未补写其原末次后检，也不接收随后 API/parser 新源码。当前普通源码及 parser/tagged 补验继续由各负责人串行完成，本专项22项实际 SQL 尚未执行。

2026-10-27 终态更正：`ae7af3833e1f424f946638b88c7f68d8` 最终为 **failed**，Linux server 编译因磁盘空间不足退出，后续三步 Linux 和最终 source postcheck 未完成。十包 / 四 seed 的通过事件只是已观察的局部结果，不能接收整轮。原 owner 已删除并独立确认缺席；严格与 frozen-only 接收器都实际 exit 1，未生成通过文件。D1 独立失败回执为 `evidence/d-bootstrap-entry-native-rejected-20261027-ae7.json`，同目录 `d-bootstrap-entry-failed-native-review-20261027.mjs --check` 已通过。D2 正在恢复原精确输入准备 Linux 补验；没有重跑已通过的长测，也没有启动实际 SQL。以下“仍运行”是失败终态之前的历史观察。

联合原生验证 `ae7af3833e1f424f946638b88c7f68d8` 已在 17:12:34 完成四根本地 seed。D1 独立解析原日志：定向三包 33 根 / 164 条通过事件，完整十包 1006 根 / 8546 条通过事件，四根 seed 全部通过，无 fail/skip。Linux 四步构建仍在运行，尚无最终回执、后检或清理终态，因此整轮仍待接收。下文“尚无 seed”及 `7582937f` 失败是此前阶段记录。当前工作区已含新 API/材料装配增量；本轮即使成功，也只能接收实际冻结来源，不能扩为当前工作区或真实 SQL 已通过。

这是新增的独立入口范围，不扩大原消费 26 项、配置范围锁 3 项或原材料 22 项。依据 `evidence/d-bootstrap-entry-independent-requirements-20261026.json`，部署显式候选装配由 D2/A1 负责，本专项验证旧入口 C1 域负向门禁和原历史重试。现已编写 22 个实际 SQL 场景、operator/phase 和接收器；33 项接收器检查与 PowerShell/Bash 语法通过。尚无本专项 Go seed/编译或实际 SQL 结果。

联合入口 `7582937f` 的 producer 定向根在夹具加载阶段因不存在的 `configured_artifact` 失败，尚未进入 full10/四 seed/Linux。本探针也有同源引用错误：把正例组写成了 `results`。经原始向量和嵌入 capsule 核对，已窄修为 `positive` 组的 `disabled_artifact` / `unconfigured_artifact`，当前 Go `ba5414ac…` / 21772 字节；原始向量、生产门禁和 22 项目录均未改变。精确两个 literal 的修复及原 `fe6f` 源码归档见 `evidence/d1-bootstrap-entry-fixture-lookup-delta-20261026.json`，同名 `.mjs --check` 返回 0；这不是 Go seed 通过。本轮还只修正专用 stdout 结果标签，逆变换全文字节相等、PSAST 通过，见 `evidence/d1-bootstrap-entry-stdout-tag-delta-20261026.json`。旧失败不改判，等待统一新冻结原生验证。

实际探针先核对隔离 namespace、UID、server UUID、正式 96 份迁移及 FK。仅复制完整规范八张 A 表。旧历史由原真实 legacy writer 在任何 C1 表安装前建立，再应用原 C1 八表 DDL；不是重写已成功的候选消费历史。0/partial/full 模式分别应用已固定的空安装、原第一个完整 domain DDL 和原完整八表 DDL，不删除已有域表来绕门禁。

22 项覆盖旧 schema 首次成功、部分 C1 拒绝、完整 C1 无域/未配置域首次拒绝；旧 schema、完整 C1 无域、相同 configured-v1 域的精确历史读取；错误 hash/version、未配置域所有状态、当前 admin/独立授权撤销的拒绝；最后域变更回滚、域主键空区间锁、错误 context/transaction 以及 COMMIT 已成功但确认丢失后的同 key 恢复。

隐藏 C1 用例在 owned 隔离库创建一次性账号，仅授予八张 A 表的精确 CRUD 权限，明确没有 C1 权限。它必须实际看见零张 C1 元数据，直接查询 domain 得到 typed MySQL 1142，并能取得 A 前缀；实际 `LockBootstrapInlineDomain` 和旧服务入口都必须拒绝。账号和数据库分别清理并留标记，接收器拒绝缺失清理。账号材料不写日志或证据文件，不涉及生产账号。

域 open 通过真实 `DomainOpener` 和明确合成的管理 authority 建立。closed/revoked/hash/version 变体使用完整原 codec 写入受控测试记录，不表示这些生命周期或管理权限已获批准。最后变更必须在原事务实际更新一行，随后 A/D 固定检查拒绝并恢复全部原行。域空区间用例要求实际 InnoDB 等待图、PRIMARY 的 INSERT_INTENTION、不同 writer/blocker 连接；取消旧入口后直接 writer 才能提交一行，其余 A 表保持不变。直接 writer 故意不取 installation 锁，以隔离域 PK gap 证明，不证明忽略协议的生产 writer 合法。

本专项的资源 admission、容量回调、部署映射和域管理 authority 均为合成。它不证明生产资源许可、物理容量、完整 GC、完整恢复或真实部署。部署候选装配自身的原 source 准备、DSN 打开前失败和 one-use attempt 由同来源的 D2/A1 native 增量另行验证；本 SQL 探针不能代替它们。必须在打开凭据前拒绝的是缺少 owner/原 mapping、当前 grant/RBAC 无效、Prepare 返回错误、原 grant 过期或 attempt 取消。若原 authority 按既定合同将非 RBAC 物理失败封存在 nil-error closed prepared state，当前 grant/RBAC 完整时仍可打开 SQL 判断锁内 L3 精确历史；该 closed state 不能批准新消费、重新执行、刷新原观察或收费，不得用跳过 Prepare 的提示替代。

默认本地准备会精确执行消费、范围、入口、原材料四根 seed，然后构建 Linux probe 和 migration runner，后检冻结来源并删除本轮源码副本、缓存和二进制。不安装依赖，不远测：

```powershell
pwsh -NoProfile -File .\scripts\system-backup-d-bootstrap-entry-mysql-validation.ps1
```

待当前新增入口的准确本地联合验证和本专项准备通过后，操作者在仓库根目录执行：

```powershell
$operatorLog = '.\docs\evidence\d-bootstrap-entry-operator-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'
& pwsh -NoProfile -File .\scripts\system-backup-d-bootstrap-entry-mysql-validation.ps1 -Remote 2>&1 | Tee-Object -FilePath $operatorLog
$entryExit = $LASTEXITCODE
"bootstrap_entry_exit=$entryExit" | Tee-Object -FilePath $operatorLog -Append
```

独立接收器 `docs/evidence/d-bootstrap-entry-mysql-review-20261026.mjs` 的参数依次为 wrapper 输出的结果 JSON、操作者日志和要新建的 `docs/evidence` 接收文件。它核对准确四根 seed、源码/inputs/二进制、完整 22 项、真实权限/锁/变更标记、退出 0 和所有清理，不联网，不改写原 wrapper 的预接收 false。33 项接收器检查使用合成日志，不能记作真实 SQL 通过。
