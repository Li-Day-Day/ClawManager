# A 当前测试命令与未完成范围

**17:14 本轮最终收尾：联合候选的 Windows/Linux 编译与清理已接收，按用户“做完这轮后暂停”收住。** `a-cleanup-gate-joint-terminal-reviewed-20261027.json` 核对了本轮 169 个 Windows 测试根/344 条通过事件、后续 9 项实际原生阶段退出 0、5 份编译产物的记录及头部、完整源码后检和两处 owned 目录确已删除。原串行入口构建中断/失败保留，随后同一命令恢复构建通过；Linux 二进制只编译，未运行。未推广 gate/cleanup 源码，未安装 SQL ledger/grants，未接通真实 residual provider，也未启动 GC 十五项实际远测。当前 live 输入仍为 1720/dc79，D r5/A r4 的 GC 命令保持原精确来源范围；暂停期间不自动执行。

恢复后待办：正式 cleanup 事务/原 verified-success workflow 接线、SQL/schema/catalog/grants 与 A 的新台账 GC 引用/八用例联合落地、真实 provider residual 来源、缺失 bootstrap 映射，以及 GC 十五项和其他未收原始运行事实的远测。不能用本轮私有 native 接收代替这些交付。

**16:46 最新结论：Owners 已完成并正式接收十一项，无需重跑。** 回执为 `docs/evidence/a-download-owners-mysql-accepted-sbk-mig-261027083544-2360.json`：实际 MySQL 8.4.8、11/11、161 个门禁、96 份正式迁移、全部清理完成。外层最初因中文 PowerShell 页脚被接收器拒绝；已按完整尾部块精确修复（原日志未改），136 个 parser 控制通过并离线重新接收，见 `a-owner-footer-locale-reviewed-20261027.json`。历史失败 10/11 继续拒绝。当前后续待测项是 GC 新十五项实际 SQL 和 gate/cleanup 私有增量，不是重复原 Owners。

如只需复核已完成的 Owners 回执，执行以下只读命令（无 Go / SSH / SQL）：

```powershell
node docs/evidence/a-owner-footer-locale-review-20261027.mjs --check
node docs/evidence/a-download-owners-actual-review-20261020.mjs `
    --log a-download-owners-mysql-remote-20261027-160458-2bce7205.txt `
    --source a-download-owners-mysql-remote-source-20261027-160458-2bce7205.json
```

2026-10-27 截止 17:00 的最新状态优先于下文历史来源说明：owner `145649-489723bd` 已在 MySQL 8.4.8 实际运行，10 PASS / 1 FAIL（`missing_reference_column`，DDL 错误 1845），退出 1，清理完成。A1 的 COPY 三段夹具修复和 A2 独立源码复核均完成，原 source preflight ready；普通 owner 基线未变。当前应优先由有原远测权限的操作者重跑下面 **Owners** 原命令，它自带完整本地准备；无需先重复一轮窄编译。由 A2 协调唯一 Go 窗口，避免与 gate/cleanup 同时启动。尚未收到修复后新实际通过回执。

原 GC 十五项流程的本地 detached seed 暴露了 checkout 相对路径错误，D 已窄修；新的三 seed 源内/真正空 cwd 及当前 Linux compile 尚待接收。**旧 D r4 / A r3 审核不可用于当前源码**。新的 D r5 / A r4 精确源码审核已接收（仅源码，不代表 native 或 SQL 通过）；下面 GC 命令已改为新审核。旧 1720/6bf、owner-only 1720/d646 均保留为各自准确历史快照，当前完整 1720 份为 `dc79d81f…`，由入口重新冻结。

owner 新轮 `a-download-owners-mysql-remote-20261027-160458-2bce7205.txt` 已于 16:37:39 终态退出 0，其冻结 owner `.tmp-d-index-cache-d9cec1f9ff704989b41ea30e453af991` 已独立确认不存在。不要重复启动 Owners。

16:33 补测结果：A1 已复用该轮已完成构建的 Windows evidence 二进制（SHA256 `fee29569c5276341f0368c02beecc9b0b7aaffe73431a61fb6614d2d0e9e2e4a`），实际运行源码目录 GC 三 seed 与真正空 cwd GC 三 seed，共 3+3 全部通过，无跳过。见 `docs/evidence/a-gc-three-seeds-same-binary-native-20261027-r1.json` 与两份 `.source.log` / `.empty.log`；执行真实退出 0，1720 份冻结来源前后核对通过，本轮自有复制二进制、TEMP 和空目录均已清理。A2 已独立接收 `a2-gc-three-seeds-same-binary-native-reviewed-20261027-r1.json`。未重新编译，没有执行真实 GC SQL。随后 Owners 同源 Linux evidence 编译（SHA `74e2a3b7…`）与正式十一项回执已补齐，故 GC 冷组修复的本地 seed/当前 Linux 编译准备已完成；不把这些算成真实 GC 7/15/33 项通过。

清理/gate 私有联合 Windows 原生已限定接收：新 cleanup 包 14 根/60 条、controller 全包 155 根/284 条，零失败/跳过，见 `a-cleanup-gate-windows-reviewed-20261027.json`。正式 controller 命令及 Linux 编译仍在独立窗口收尾，不据此批准正式迁移、grants 或真实 provider adapter。

16:56 截止前状态：`d2-cleanup-gate-joint-c6e41-20261027.windows.json` 记录 controller 入口构建退出 1，stdout/stderr 为空；对应 `.terminal.json` 正确拒绝后续整轮接收，Linux 未执行。不推断为代码断言失败，也不将 Windows 包通过拼成完整构建通过。该私有候选不落 live，正式 SQL/catalog/grants、GC 新台账集成和真实 residual adapter 仍待完成。其 owned 源码/缓存由 Root D 与 D1 负责清理，不能删除仍在使用的其他对话目录。

以下命令从仓库根目录运行。当前完整输入为 1,720 份，摘要 `6bf973bd11709b14fa04c13175aadfbd126020be3a10a8c514596b5dd29cb9ca`。owner 普通 backend/contracts 基线为 `7c428878…`，703 个测试根 / 5,530 条原生通过事件，原 5,190 个名称保留；两份新增 PromQL 准备脚本另有准确源码与本地 mock 接收。25 项 Node 回归、131 项合成实际接收器控制通过。实际远端 owner 十一项、GC 新 SQL 和真实 PromQL 均未因此通过。

不要安装依赖；测试完成后清理本轮拥有的缓存、临时目录、二进制和传输包，保留原始日志、来源清单及接收回执。不要清理其他对话仍在使用的目录。

## 当前只读本地复核

```powershell
node docs/evidence/a-owner-current-support-source-review-20261027.mjs --check
node docs/evidence/a-owner-current-registration-review-20261027.mjs --check
node docs/evidence/a-gc-lifecycle-operator-source-review-20261027-r3.mjs --check
```

以上三项在各自历史准确来源均退出 0；新增 tagged 修复后不能当成当前完整来源通过。A1 新 owner-only 修复审查 `a-owner-copy-fixture-source-review-20261027.mjs --write/--check` 已退出 0，随后新增 GC tagged 修复需再组合。源码变化导致拒绝时停止，先补准确增量审核。

当前可重放的准确源码核对如下，均已实际退出 0；它们不会启动 Go、SSH 或 SQL：

```powershell
node docs/evidence/a-gc-cold-capsule-source-review-20261027.mjs --check
node docs/evidence/a-gc-lifecycle-operator-source-review-20261027-r4.mjs --check
node docs/evidence/a-gate-budget-source-review-20261027-r2.mjs --check
node docs/evidence/a-cleanup-ledger-gc-candidate-20261027.mjs --check
```

## 原 owner 十一项远测

由有原 SSH 执行权限的操作者运行；A1 本对话不连接 SSH。此命令先执行原源码预检及冻结后门禁，再走原完整本地准备和远端流程，并自动接收准确回执。

```powershell
& .\docs\evidence\a-download-owner-role-retest-20261021.ps1 -Mode Owners
```

保留脚本打印的本轮日志、来源清单、真实 native 退出状态与清理记录。任何来源预检、SQL 用例或清理失败都不能计为通过。历史 SSH 启动失败及本次 10/11 失败均保留；必须同一新完整轮次通过十一项，不能拼接旧十项与新一项。

## GC 新十五项生命周期夹具

准确源码审核为 `a-gc-lifecycle-operator-source-reviewed-20261027-r4.json`，对应 D r5 候选，1,720 份原始输入 / 1,721 份运行输入，运行来源摘要 `f3ed3894471df5b01166a68f6e20ca7e77e4cabfcdb6a9c03a55fd0886aabf62`。本轮修复必须通过真正空 cwd 的同 binary GC 三 seed，再进入实际 SQL；原 operator 的门禁继续强制执行。它是隔离夹具：authority 为 synthetic known tasks、physical report 为 synthetic，生产批准为 false；不重计旧 42 / Full33 / cold7，也不代表十二组真实协议或完整真实域已通过。**先等当前 Owners 本地 Go 完成，并经协调确认没有其他 Go 窗口后执行；不要与本轮 Owners 或 gate/cleanup 编译同时运行。**

```powershell
$gcLifecycleToken = [guid]::NewGuid().ToString('N')
$gcLifecycleSourcePath = Join-Path $PWD ("docs/evidence/d-gc-full-lifecycle-remote-source-$gcLifecycleToken.json")
$gcLifecycleLogPath = Join-Path $PWD ("docs/evidence/d-gc-full-lifecycle-remote-$gcLifecycleToken.txt")
$gcLifecycleReceiptPath = Join-Path $PWD ("docs/evidence/d-gc-full-lifecycle-actual-$gcLifecycleToken.json")
$gcLifecycleReviewPath = Join-Path $PWD 'docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r4.json'
Start-Transcript -LiteralPath $gcLifecycleLogPath -NoClobber | Out-Null
try {
    & .\docs\evidence\d-gc-full-lifecycle-operator-20261026.ps1 `
        -ReviewedSourcePath $gcLifecycleReviewPath `
        -SourceManifestPath $gcLifecycleSourcePath -BuildParallelism 1 -Remote
} finally {
    Stop-Transcript | Out-Null
}
node docs/evidence/d-gc-full-lifecycle-receiver-20261026.mjs `
    --log $gcLifecycleLogPath --source $gcLifecycleSourcePath `
    --review $gcLifecycleReviewPath --write $gcLifecycleReceiptPath
```

只有原始完整日志被实际接收器接收，才能登记该十五项夹具通过。接收器要求准确 namespace UID、同轮二进制与输入摘要、逐项运行/通过、冻结后检和清理。

## PromQL 与其他剩余工作

PromQL 现有 97 组 / 231 项原始表达式预期，尚未由真正 promtool 执行。准备脚本只能使用已有且平台匹配的 Linux ELF 或本机已有镜像；本地没有可用 promtool、Docker daemon 也不可用时，这一步仍缺工具输入，不自动下载或安装。两份脚本的 mock 测试不证明 PromQL 预期正确，也不证明生产 rule loader、missing-series、告警恢复或通知去重。

仍需原事实/实现与对应验证：真实 cleanup collector、自动清理原始起点及不可变预算绑定、四个 gate/hold 的同源冻结投影、bootstrap 27 个资源槽位及原 authority、B/C 同版本域输入、Full33 / cold7 / 十二组真实协议和完整真实域的准确回执。原已接收 writer、readback、role、drill 等历史专项不因新增工作自动要求重跑；按各自实际依赖变化决定。

机器进度见 `docs/evidence/a-all-local-work-progress-20261023.json`。本次本地门禁完成不等于全部 A 工作或生产链完成。
