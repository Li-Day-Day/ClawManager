# D：下载失败 journal 的 Windows 替换夹具修正

操作者四任务专项原日志 `docs/evidence/d-download-task-chain-remote-20261020-085907.txt` 在本地 evidence 包失败，最终 `download_task_chain_exit=1`，并明确 `remote validation has not started`。唯一失败叶子是 `TestDownloadFailureJournalTamperAndCapacity/replace`：Windows 不允许重命名仍由 `os.OpenFile` 打开的文件。原失败日志保留，不能记成远端失败或实际十二项已执行。

修正只在 `backend/internal/systembackupevidence/download_failure_journal_test.go`：先记录原文件身份和字节，关闭测试句柄，重命名旧文件，在原路径写入字节/大小完全相同的新文件，再重新打开准确旧文件作为 journal 的保留句柄。独立断言旧句柄仍是原文件、新路径是不同文件、双方大小和 journal 记录大小一致，且 journal 尚未被毒化。这样在 Windows 和 Linux 上都构造出相同的身份不匹配观测，不依赖平台是否允许对打开文件重命名。

原 `replace` 检查 `Check` 拒绝，新增 `replace_append` 检查没有先调用 `Check` 时直接 `Append` 也拒绝。两项均核对旧文件与新路径未被追加。D 的本次夹具修正没有跳过测试、放宽检查或修改生产 journal/runtime/authority。A 同期将 Unix 模式收紧至仅 `0600`/`0640` 并增加测试，保留在后续冻结范围中。

## 原 producer 编译失败及冻结入口

`docs/evidence/d-download-producer-remote-20261020-090845.txt` 的另一轮失败是 D 移走未完成的 `download_retention_gc.go` 草稿时，直接 A 入口仍在从共享工作目录编译，报 `The system cannot find the file specified`。最终 `download_producer_exit=1`，没有启动远测。此失败由 D 的并发源码修改造成；原日志保留，不能归为 MySQL 或 Windows 工具崩溃。两轮原 `.tmp-a-evidence-*` 目录均已独立确认不存在。

现有 `system-backup-d-config-writer-validation.ps1` 增加互斥的 `-DownloadTaskChainOnly` 和 `-DownloadProducerOnly`：先稳定复制并保存来源 manifest，然后从固定副本调用原 A 入口，测试、编译和打包共用该副本，最后复核并清理。原 A 专项与远端十二/十八项选择保持独立。PowerShell 5/7 均通过准确冻结入口、真实派发和十七种互斥反例检查；复核首轮 AST 选择器错误单独保留，已限定外层调用节点后通过。

## 本地验证终态与来源范围

- r60：五个 journal 根、32 个含子项通过，包含原 `replace` 和新增 `replace_append`；默认 vet、冻结 postcheck、退出 0，源码快照已自动清理。原冻结为 1,420 输入，SHA `59ab377fe426c725a64bfc432fa2fefbf29961193b9f0447c5b1e72cb2c87182`。
- r61：security/evidence/read/producer/server 五完整包 709 主、5,624 含子项通过，无失败/跳过，默认 vet 和普通包来源 postcheck 通过；四 seed 及脱离 checkout 各 19 项、Windows/Linux probe、Linux runner、最终 postcheck 和整体退出 0。原冻结 1,420 输入，SHA `b7a0c14718b6422d2411df095723bda2ba0a2218688e9666f5ec5354b6431b09`。源码及二进制自动清理后，独立缓存也已守卫删除，[三个准确自有目录均不存在](evidence/d-download-journal-fix-native-cleanup-20261020.json)。
- r62：实际调用新的冻结包装入口，未传 `-Remote`。冻结 SHA `6cc7f2ee71f5336e6ab03b6adf1b8efcd5ec02d43e6520da4398f10383ef9f8e`，1,420 输入；security/evidence 完整包 553 主/4,309 含子项、四 seed/脱离各 19 项、Windows/Linux binary、Linux runner、整体 postcheck 和包装退出 0。与 r61 的准确来源集合相比，只有冻结包装脚本增加两个 profile，Go/SQL/胶囊均相同。四个自有源码/缓存/二进制目录全部不存在，见[最终清理](evidence/d-download-journal-fix-cleanup-20261020.json)。

[独立复核](evidence/d-download-journal-fix-20261020-r61-review.json)逐项检查原两轮本地失败及准确目录缺席、来源 manifest 的记录顺序摘要、完整包/两组 seed/二进制与 postcheck、两种 PowerShell 的派发反例和四目录清理。冻结范围验证通过。复核 CLI exit 1 另行指出当前共享目录新增 registration HTTPS lifecycle 两份 Go 文件并修改其 `main.go`；它们属于 `cmd/system-backup-registration` 的独立主入口，不由本轮五包/探针回执背书。当前下载 Go、修正夹具、两种胶囊、冻结包装和派发输入仍匹配，不声称整个当前目录零漂移。

前述运行检查点只保留当时观测，现有自有会话均已终态。命令已在[四任务专项](system-backup-d-download-task-chain-mysql-20261019.md)和[producer 专项](system-backup-d-download-producer-mysql-20261020.md)改为冻结入口，会对用户运行时的当前源码重新稳定复制和执行完整本地门禁。新的实际十二/十八项仍各待用户执行和独立接收，不能以本地编译关闭。

本轮没有安装依赖或执行 SSH。GC 只完成了前置合同核对，未完成的实现草稿已经移出并删除；当前构建中没有新增 GC 实现，原六项和 GC 后续仍未完成。
