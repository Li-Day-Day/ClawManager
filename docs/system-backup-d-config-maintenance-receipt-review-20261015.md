# D：离线 canonical 回填的维护收据评审提案

【2026-10-16 r40】A 八项具体 authority 的实际 MySQL 已按 [D 独立回执](evidence/system-backup-d-a-authority-review-20261016-r40.json)接收其原 1,265 输入/94 文件冻结轮；与下方七项服务保持独立范围，两者均无需重跑。当前合并已为 95 文件 catalog，真实认证/旧原文/target/容量、正式 081/082 和生产接线仍缺，不能由旧回执放行当前整树。

【2026-10-16 七项私有服务 MySQL 已接收】[限定接收回执](evidence/system-backup-d-canonical-backfill-service-mysql-accepted-20261016.json)核对操作者 [08:34:36 原日志](evidence/d-canonical-backfill-remote-20261016-083436-235.txt)及[源码清单](evidence/d-canonical-backfill-remote-20261016-083436-235-source.json)：1,265 项输入当前逐项/集合匹配；MySQL 8.4.8、94 项 fresh replay、七个服务叶子各一次 PASS、两次实际配置行锁等待。准确 namespace `sbk-mig-261016005638-22b8` / UID `df21e81b-ea71-4fd7-87a8-a33290d62c68`、七组 installation/收据/审计/config 清理及两端 scratch/cache 均有成功标记，69 个本地路径独立确认不存在，终态 exit 0。无需再跑本服务专项。

本次完整 security 为 230 主测试/1,525 子测试；精度 2/4 已包含其中，三次 seed 各 1/7 是重复覆盖。一次 Windows `asm.exe 0xc0000043` 仅重试同条 test/vet 命令，三个 overlay 精度反例按预期 exit 1，正常断言无重试；两次上传前密码拒绝也保留。正式服务的 apply/replay/nochange、分开的观察、audit/receipt/final 回滚、容量回调过期、真实提交回复丢失与双 worker 单次写入均由该冻结探针验证。授权与物理容量仍为 synthetic，不能据此接收 A 八项具体 authority、真实认证或生产回填。新 run 的清理不证明旧 16:33 中断 run 的远端候选目录状态。

【2026-10-15 r38 服务尝试已中断】16:33 的七项服务尝试于 17:23:39 终止；[D 终态复核](system-backup-d-a-authority-preparation-review-20261015.md)确认没有实际 SQL/namespace/远端最终清理证明，69 本地路径不存在。远端候选 scratch 状态仍未知，不能据中断判定未建立或已清理。A 新八项具体 authority 的本地准备已另行接收，仍非实际 MySQL。下文两个专项的独立验收边界及旧 storage 已接收状态保持。

【2026-10-15 维护收据真实 MySQL 已接收】[限定验收回执](evidence/system-backup-d-maintenance-receipt-mysql-accepted-20261015.json)核对 15:25:47 run 的 1,254 文件冻结清单：七组存储场景与九项约束检查、实际配置行锁等待、94 个正式 migration 全部通过。namespace 精确 UID、七个 owned fixture 及两端 scratch/cache 报告清理，日志内本地临时路径独立确认不存在。该回执只覆盖当轮 frozen storage/test-only caller；当前 SQL 组件新增负观察/最终复查的时钟下界，新摘要已单列，不能据旧 run 接收该增量或完整私有服务。旧 storage 专项无需重复，实际服务使用下文 -BackfillServiceOnly 的独立入口；production_approval=no。


2026-10-15。依据 A 已签收的 `a-config-canonical-write-security.v1`，[082 SQL 提案](system-backup-d-config-maintenance-082-proposal-20261015.sql)将此前设计落实为独立持久化表。编号须与安装 ledger/其他分支再次核对；当前文件在 docs，未加入 runner、schema inventory 或 catalog，未执行 MySQL。

作用域唯一键为准确 server UUID/database、installation、独立认证的维护主体摘要、固定 `config_canonical_backfill` action 和 idempotency key。同一 key 不随 grant 更新重新开放；request hash 绑定 grant identity/version、target/config version、原 hash/size、完整 row fingerprint、原文 provenance、schema/catalog/migration pins 和原因。主体摘要必须来自受信认证的稳定 issuer/subject；禁止客户端任意填写主体摘要来创建新的作用域。主体/grant/request 派生规则已由 [A 摘要交付](system-backup-a-canonical-maintenance-digest-handoff-20261015.md)提供；row/provenance 采用 [A 修订 2 交付](system-backup-a-config-backfill-identity-handoff-20261015.md)。这些格式不能沿用 Admin actor 或读授权，也不认证运行材料。

每个成功结果持久化原配置身份、source provenance 摘要、wrote=true/false、真实 intent/result audit ID，以及完整脱敏 canonical 响应和 hash/size。没有 pending/unknown 行；只有同事务提交的结果才对外可见，未知 COMMIT 通过准确 target/key/hash 的当前授权只读观察判定。它不是 `system_backup_operations.config_update`，也没有新 HTTP 入口。

提案提供 config installation/version 与两个真实 audit ID 的外键、UUID/key/version/digest/长度/布尔约束及准确响应长度。JSON 有效性不证明 UTF-8 JCS、checksum、来源或授权；这些由后续 writer 在锁定原 row 后逐项检查，final guard 重新核对当前授权、有效期、目标和来源。same-byte no-change 必须重新授权并记录 wrote=false；已有不同字节拒绝。

候选保留策略为 installation 生命周期保留完整成功收据、唯一 key 和对应 audit 锚点，暂不允许自动 GC；这样不会通过删除旧收据使 key 重新执行。提升前必须审查它对 audit_logs 生命周期和容量的影响，不能默认全局 audit GC 已兼容。容量不足、audit/receipt 写失败或唯一冲突不能绕过事务。

正式提升还需审查此表的 D ownership、schema-only 控制元数据分类、迁移/schema/catalog pins、真实 MySQL 约束和并发回滚，以及维护主体/请求摘要 profile。生产角色不得获得 receipt UPDATE/DELETE 权限；备份业务 restore 不恢复收据、授权或活跃安装状态。

具体运行写授权与旧配置准确原文当前仍暂无。SQL 只建收据存储，不合成 canonical、不回填、不创建授权。原 066 保持原始字节，081/082 均为未执行的独立评审提案。

## 2026-10-15 私有 SQL 存储候选

`backend/internal/systembackupsecurity/config_maintenance_receipt.go` 与 `config_maintenance_receipt_sql.go` 为同包后续维护事务提供私有 scope、脱敏 canonical 收据/审计表示、暂存、重载和最终复查。它们采用 A 已交付的三种摘要 profile，保留 request hash 对原因的绑定，成功体和审计正文不保存原文、旧作者/原因、归档地址或授权材料。这是 082 提案的存储候选，尚未形成完整回填服务。

调用者须先完成独立维护主体、用途授权、原归档来源、schema/catalog/migration pins 和容量准入，拥有事务及配置行锁，再显式完成 NULL→准确原文或已相同字节的处理，并插入本事务的真实 intent/result audit。组件重新扫描完整配置行；尚为 NULL 时拒绝暂存，不代替调用者 UPDATE。wrote 从此前 NULL/原文状态推导，两个 audit ID 必须不同、真实存在、无 Admin user/resource 身份，且 action、准确 scope、request correlation、phase、wrote 和时间顺序都匹配闭集正文。

收据 INSERT 显式列出全部 26 个非 ID 列；随后按永久唯一作用域 `SELECT * ... FOR UPDATE`，验证完整 27 列集合、每个存储事实、真实审计、原始响应字节和 hash/size。请求 hash 不同返回 conflict，不能通过更新 grant version 重新开放相同 key。SQL JSON 允许键顺序/空白改变，仍拒绝额外字段、重复键及损失 Unicode；MEDIUMBLOB 收据要求原始 JCS 字节不变。重载完成后再次核对完整配置行、数据库身份和单调 UTC 时间；私有快照只允许原 sql.Tx 最终复查。

组件不开始、提交或回滚事务，不签发/认证 grant，不创建 HTTP/CLI，不发布或安装 081/082。失败后调用者必须回滚整个事务；未知 COMMIT 必须由未来已授权 observation 服务重新连接判定，不能把内部同事务快照当作已提交成功。真实 MySQL 的 082 约束、并发、持久化回滚和未知提交仍需后续独立探针。已接收的 [writer MySQL 回执](evidence/system-backup-d-config-writer-mysql-accepted-20261015.json)只覆盖当轮 update/rollback，未覆盖这两份新增文件。

[r26 本地冻结回执](evidence/system-backup-d-maintenance-receipt-local-20261015-r26.json)与[原始日志](evidence/system-backup-d-maintenance-receipt-local-20261015-r26.txt)已通过：229 主 / 1,521 子测试，其中维护收据 9 主 / 86 子已计入。三个包分别为 security 205 / 1,385、config composition 20 / 113、A response-content 4 / 23；默认 vet、native exit 0、无断言或工具重试。1,246 个冻结输入的逻辑 SHA 为 c0c3389648c14de1c9ae881a0735d883382c1c90c7ae790f34973323fa5ec158，终态及当前仓库全部匹配，94 个日志内生成路径已确认不存在，未安装依赖或执行 SSH。模型使用 A/独立 Node 行向量、真实 database/sql 调用与测试 transport，验证永久 key、27 列篡改、真实锚点校验、调用者事务所有权、原始响应副本及最终漂移；模型的 rollback 仅为 transport 行为，不作为 InnoDB 原子提交证据。具体安装运行写授权、旧原文及来源认证协议仍为暂无，production_approval=no。
## 维护收据隔离 MySQL 专项

已增加 tagged `TestDConfigMaintenanceReceiptMySQL`、detached seed 和独立 `d-config-maintenance-receipt` 派发。它沿用 fresh namespace/UID、缓存镜像与完整正式 migration 重放，然后核对准确 ledger、server UUID/database 和 InnoDB；081 nullable 列与 082 表都只在新建探针库中显式安装，LF DDL SHA 分别为 `14db3b88263f0ab3e31e293aa0351bb08da23464d4a0fee8854263d56354cce1` 与 `e1a95c7863065580819e28353fa984fa8a98701ca2eeae57aff7ba5159a43b87`。

七个主场景为提交后原字节重放与新 key 的 wrote=false、调用者 rollback、receipt 插入失败原子回滚、result audit 插入失败原子回滚、实际 UNIQUE/FK/CHECK/保留约束、真实 COMMIT 成功后丢失回复的新事务观察、以及先观察实际配置行锁等待再提交并发重放。CHECK 定向验证 wrote、不同审计锚点、准确长度、JSON OBJECT 和摘要格式；配置/审计删除被 FK RESTRICT 拒绝。输入 kind/候选原文/摘要、嵌套 writer/catalog、未知字段和重复字段均有拒绝 seed。

SQL 夹具只为随机 owned installation 插入完整生成配置并保留准确原文，随后测试本事务内的真实配置行、双审计和收据。测试中的维护 actor/grant/source/capacity 准入均为 synthetic；没有运行授权验证、真实旧归档、实际历史回填或公共入口。本专项不授予任何生产能力，不替代先前 writer HTTP/MySQL 回执。每个用例清理其准确 installation 的 receipts/audits/config 和触发器，核对实际目标与最终行不存在；namespace 和两端构建目录仍由外层 finally 清理。

本地执行会冻结一次源码，运行安全包与默认 vet、tagged seed、空工作目录中的 Windows seed、Linux 探针和完整 migration runner 编译，再让独立 Windows seed 验证 PowerShell 实际生成的 JSON 胶囊。[r27 冻结本地回执](evidence/system-backup-d-maintenance-receipt-probe-local-20261015-r27.json)与[原始日志](evidence/system-backup-d-maintenance-receipt-probe-local-20261015-r27.txt)已通过：安全包 207 主 / 1,395 子，加三种 seed 模式共 3 主 / 21 子，合计 210 / 1,416。默认 vet、native exit 0，无断言或工具重试。Linux 收据探针 f648578f…6168 与迁移 runner 4a988db2…83ff 编译完成，实际 PowerShell 胶囊 4480d7e0…d3a3 已由空目录独立程序复核；1,251 个输入终态及当前全部匹配，68 个日志内生成路径已确认不存在，无依赖安装或 SSH。本轮还包含 A 的审计原始时刻绑定修复及正向回归，没有代跑 A 的独立 counterfactual。真实 MySQL 尚未运行。只有以下专属新场景 PASS、准确指纹、namespace 精确 UID 清理和两端缓存清理齐全时，才接收真实 082 SQL 验收；不能拼入旧 writer/index 日志。

操作者在仓库根目录执行以下完整命令。`-MaintenanceReceiptsOnly` 只选新收据专项；没有该参数的既有 writer 命令保持原行为。脚本不安装依赖，最终删除测试二进制、缓存、临时源码和夹具目录；原始证据日志与源码清单保留。

```powershell
$maintenanceStamp = Get-Date -Format 'yyyyMMddHHmmss'
$maintenanceManifest = Join-Path $PWD "docs/evidence/d-maintenance-receipt-remote-$maintenanceStamp-source.json"
$maintenanceLog = Join-Path $PWD "docs/evidence/d-maintenance-receipt-remote-$maintenanceStamp.txt"
Start-Transcript -LiteralPath $maintenanceLog -NoClobber
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -MaintenanceReceiptsOnly -Remote -BuildParallelism 2 `
        -SourceManifestPath $maintenanceManifest
} finally {
    Stop-Transcript
}
```

成功 marker 为 `PASS d-config-maintenance-receipt-mysql ... synthetic_admission=yes production_approval=no`。任何 CLEANUP_PENDING 均保留准确身份；失败日志不覆盖、不通过重复旧 writer 测试消除。生产角色、容量/保留、源/授权认证和正式 migration 的评审缺口仍保留。
## 私有回填服务的 SQL 精度修订与独立专项

当前 `config_canonical_backfill.go` 已提供私有 apply/observe 事务编排，明确没有生产 authority、签发协议、路由或运行 grant。D 新增 `TestDConfigCanonicalBackfillMySQL`，直接调用该服务，分别验证服务层的准入、容量、写入、审计、收据、最终复查、提交和独立观察。原七组 receipt storage 探针继续独立存在，其冻结回执保留，不把 test-only prepare 编排当作服务验证。

代码复核发现，私有服务把 UTC_TIMESTAMP(6) 插入正式 001 的 `audit_logs.created_at TIMESTAMP`。该列省略小数精度，实际为秒精度；MySQL 默认会将较高精度输入舍入，半秒后可能写成下一秒，随后严格的 `audit <= receipt` 检查会拒绝合法尝试。[MySQL 8.4 精度规则](https://dev.mysql.com/doc/refman/8.4/en/fractional-seconds.html)说明了此行为。现在审计 INSERT 显式使用 UTC_TIMESTAMP()，保留真实秒精度审计；配置行、收据及最终授权/容量时钟仍使用微秒，不放宽顺序、有效期或 schema 校验，也不更改正式 001/066。

新增确定性模型覆盖前半秒、恰好半秒、秒末和午夜末，另外固定正式审计列的精度。测试 transport 可分别模拟两个 SQL 表达式在 TIMESTAMP(0) 下的结果；临时 overlay 只恢复旧表达式，必须让半秒、秒末和午夜末三个指定断言失败，前半秒继续通过，真实副本保持不变。它是 SQL 规则模型，不能代替实际 MySQL 回执。

服务专项只执行新 root，不重复 writer、index 或七组 storage 用例。七个服务场景分别为实际 apply/重放/no-change 与独立观察权限、result audit 失败回滚、receipt 失败回滚、已有配置/双审计/收据暂存后 final admission 拒绝、容量回调跨越被冻结的期限后回滚、真实提交回复丢失时不释放结果且只观察、两个请求均被实际配置行锁阻塞后只执行一次。每个用例还对比完整 installation_state，保证 active/deployment/监控状态未改变；准确旧配置行指纹与 canonical 状态另行核对。准入与物理容量仍为 synthetic，实际 SQL/事务是被测对象。

默认本地运行会冻结一次输入，执行精度回归及三个指定 counterfactual、完整安全包、三种 seed/实际胶囊检查、Linux 探针和迁移 runner 编译，最后删除全部自有构建产物。[r29 最终本地回执](evidence/system-backup-d-canonical-backfill-service-local-20261015-r29.json)及[完整日志](evidence/system-backup-d-canonical-backfill-service-local-20261015-r29.txt)已通过：安全包 219 / 1,445，三种 seed 共 3 / 21，合计 222 / 1,466；另两个精度主测试/四个子用例已包含在安全包，不重复相加。三个指定 counterfactual 断言按预期失败、exit 1，真实源码未改。正常 gate native exit 0、默认 vet；仅一次已知 Windows compile.exe 崩溃的同命令重试，没有重试失败断言。Linux 服务探针 998f7a9f…25a7 和 migration runner 5a58caa3…acbf 编译完成，实际胶囊 4480d7e0…d3a3 由独立 Windows seed 验证；全部 1,258 输入及文件集合与当前仓库匹配，68 个生成路径确认不存在，无依赖安装或 SSH。真实服务 MySQL 尚未运行。旧 source/二进制不会混入新回执；旧 storage 日志仍按自身冻结范围接收。

操作者可在仓库根目录使用以下独立命令；它只选择新的服务专项：

```powershell
$backfillServiceStamp = Get-Date -Format 'yyyyMMddHHmmss'
$backfillServiceManifest = Join-Path $PWD "docs/evidence/d-canonical-backfill-remote-$backfillServiceStamp-source.json"
$backfillServiceLog = Join-Path $PWD "docs/evidence/d-canonical-backfill-remote-$backfillServiceStamp.txt"
Start-Transcript -LiteralPath $backfillServiceLog -NoClobber
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -BackfillServiceOnly -Remote -BuildParallelism 2 `
        -SourceManifestPath $backfillServiceManifest
} finally {
    Stop-Transcript
}
```

专属成功标记为 `PASS d-config-canonical-backfill-mysql ... synthetic_authority=yes synthetic_capacity=yes production_approval=no`。仍需核对七组子用例、同轮二进制/胶囊摘要、准确 namespace UID 清理、两端 scratch/cache 清理。正式 081/082、运行授权/观察协议、旧原文来源认证、物理容量和生产接线保持未批准。

[r28 准备轮失败记录](evidence/system-backup-d-canonical-backfill-service-local-20261015-r28.json)保留：正常精度/安全包与三个指定反例通过后，tagged 编译发现共享数据库 setup 重构漏掉 trigger 分支的局部 err 声明。已只修正该声明，r29 使用新冻结来源完整验证；r28 没有进入 SSH/MySQL，构建目录已清理，不把其正常包 PASS 当作 Linux/真实 SQL 通过。
