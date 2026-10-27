# D bootstrap 全局配置范围锁专项

本轮真实 SQL 的冻结来源接收已完成：`f0f6587b…` 在 namespace `sbk-mig-261026080436-31de` / UID `ad17e4ad-4be9-4cdb-addc-eb5b020ef9f5` 中三项均通过。每项均核对 before-C1 三锚点、隔离空区间、不同连接的真实 InnoDB 等待、原 bootstrap 回滚后直接写入提交一行及数据库清理；插入场景实际等待 `uk_sb_config_version` 的 INSERT_INTENTION。96 份迁移、二进制/inputs 哈希、退出码 0、namespace/UID、远端 scratch 与本地 owner 清理均通过。与原消费 26 项共享来源 `4a5f56e4…`，准确接收为 `evidence/d-bootstrap-actual-frozen-reviewed-20261026.json`，同名 `d-bootstrap-actual-frozen-review-20261026.mjs --check` 可重算。

接收器已修复 UTF-16LE BOM 原日志解码、Go 将子用例 PASS 集中放在末尾的执行区间划分，以及迁移尾编号 081/文件数 96 的区分；两接收器共 78 项回归通过。验收期间另有 `bootstrap_entry_mysql_test.go` 与 `bootstrap_inline_domain_test.go` 两份测试源码变化，汇总保留旧/新哈希，严格当前来源接收仍拒绝匹配。本结果只接收本轮冻结二进制的三项范围锁与同源 26 项消费，未覆盖后续源码、完整联合门禁或生产授权；原包装器不改写。本次未安装依赖、未启动新的远测或 Go 构建。

真实远测 `2a2a4104…` 的三个场景均在共享 producer 夹具的 claim 初始化处失败，未到达范围锁观察逻辑。它与原消费 26 项远测 `537e083b…` 的失败同因：owner-write 短窗口为 12 秒，claim 却请求 45 秒。现已在共享夹具中将 claim 截止限制到原 owner-write 截止以内；原生产期限守卫不变。共享 bootstrap seed 也改用短窗口，先验证过长 claim 被拒绝，再运行合法生命周期，避免正常两分钟夹具掩盖短窗口错误。原失败回执、operator 日志与清理记录保留，不能改判为实际范围锁通过。

修复后本地准备 `f69fd7c3…` 已完成：冻结来源 `b4a90dad…` 的两根 seed、Linux 探针、迁移程序与包装器均 exit 0，来源后检通过，owner 独立确认缺席，临时源码、缓存和二进制已清理；同源常规生命周期及 14 个原子失败子用例通过，无失败/跳过。汇总见 `evidence/d-bootstrap-claim-window-fix-20261026.json`，原生回执为 `evidence/d-bootstrap-config-ranges-mysql-20261026-144036-f69fd7c3.json`。未安装依赖、未重跑真实 SQL；三项实际范围锁证据仍待操作者重新执行远测。

后续入口门禁增量已调整夹具：通过 owned DB 的 beforeDDL 测试挂点，在任何 C1 producer 表安装前，用原真实 legacy writer 建立三锚点，再执行原完整八表 DDL 和新的 producer 生命周期。它不会删除或绕过已有 domain 表。接收器增加三项拒绝缺失/晚建/已有 C1 表的锚点标记检查，25 项通过记录见 r4 日志；这项新 tagged 源码的本地 seed/编译验证见前段新回执，不能借下文旧 `2452011f` 回执背书。

这是独立于原 bootstrap 消费 26 项的新范围。A 的 L1 桥接需要在全局 installation 锁后、producer domain 前，以正式 `uk_sb_config_version` 索引锁住所有配置和空区间，包含 nonce 元数据。操作者的直接写入不先取得 installation 锁，必须仍被这个 config 前缀阻塞。

当前准确本地准备已通过：`9dfbf1f2` 包装器记录两根 seed、Linux probe/migration 编译及终端均 exit 0，来源后检通过，准确 owner 已删除且独立核验缺席；接收器 22 项检查、PowerShell/Bash 语法通过。接收证据为 `evidence/d-bootstrap-config-ranges-mysql-local-reviewed-20261026.json`，同名 local-review `.mjs --check` 已重算通过。该来源包含 A 的 `feac2255…` 全局 L1、统一 attempt context 和当前三锚点夹具。真实三项 SQL 仍未执行；完整 A/D 联合回归与随后原文件/nonce/CA 的整链组合不是本证明范围。未安装依赖，构建产物已清理。

夹具进一步把三个锚点固定为 `000_existing`、`002_anchor`、`zzz_anchor`，并验证目标安装按相同 ASCII 顺序落在后两个锚点之间；新 origin 插入 `001`、既存 `000` 的新 version 均位于前两个锚点之间。这避免旧目标专用空查询也恰好锁住相同空区间。首次 `6e223109` 编译虽然 exit 0/已清理，但快照早于该加强及 A 新桥接，仅作历史准备证据保留于 `evidence/d-bootstrap-config-ranges-local-historical-reviewed-20261026-6e223109.json`，不改判为当前夹具接收。

三个场景分别为：更新其他 origin 的既存 nonce 元数据；向原本不存在的 origin 插入 version 1；向既存 origin 的空 version 2 区间插入。每个用例用实际原 A disabled-bootstrap writer 建立无关配置夹具，再暂停真实候选消费服务已取得的前部锁。

直接插入从锁前捕获的完整规范行构造 `INSERT VALUES`，保留所有列，仅修改新键并省去 auto ID。使用 `INSERT SELECT` 会先等待源行记录锁，无法独立证明插入区间锁，本探针明确不使用它。nonce 更新也必须改变原值，避免无效更新误判。

探针要求 `performance_schema.data_lock_waits` 真实记录直接写入与 bootstrap 连接之间的等待，表必须是 owned schema 的 `system_backup_configs`；插入等待必须位于 `uk_sb_config_version` 且包含 `INSERT_INTENTION`，不能用固定 sleep、调用 trace 或 source-row S 锁当作通过。随后取消原 bootstrap、要求零成功返回和非 config 全表内容不变，确认直接写入释放后提交一行并读回，且原 bootstrap 未产生自己的配置。

这仍是隔离数据库中的合成授权夹具，不证明生产 grant、nonce 材料、provider 或物理容量。它证明的是准确服务/索引锁协议；每个 owned DB、原生 cache、临时源和二进制均由包装器清理，日志与来源清单保留。不安装依赖，不接受任意 DSN。

本地准备入口：

```powershell
pwsh -NoProfile -File .\scripts\system-backup-d-bootstrap-ranges-mysql-validation.ps1
```

待 A 新 L1/attempt-deadline 的本地联合验证与本专项编译完成后，操作者再单独执行：

```powershell
$operatorLog = '.\docs\evidence\d-bootstrap-config-ranges-operator-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'
& pwsh -NoProfile -File .\scripts\system-backup-d-bootstrap-ranges-mysql-validation.ps1 -Remote 2>&1 | Tee-Object -FilePath $operatorLog
$rangesExit = $LASTEXITCODE
"bootstrap_config_ranges_exit=$rangesExit" | Tee-Object -FilePath $operatorLog -Append
```

独立接收入口为 `docs/evidence/d-bootstrap-config-ranges-mysql-review-20261026.mjs`，参数依次为包装器结果 JSON、操作者日志、要新建的 `docs/evidence` 接收文件。接收器核对两根精确 seed、Linux 编译、固定来源/inputs、三份真实等待与释放证据、原生退出 0、所有清理；不会连接远端或改写原包装器预接收 false。
