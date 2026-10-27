# D GC 批次扫描的事务结束检查（2026-10-22）

本轮处理不依赖远测和 A/B/C 评审的本地边界：扫描下载元数据 GC 候选时，空范围和已结束游标原先通过 defer 忽略 Rollback 错误，仍可能返回 EndOfRange；普通候选页还接受了不能证明驱动回滚结果的 ErrTxDone。扫描直接调用者也可能在回滚期间取消后获得已经过期的候选。

修复让 scanDownloadGCBatch 的所有已开启扫描事务路径统一执行一次 Rollback，并在结束后检查原 context。回滚报错（含 ErrTxDone）或结束时已取消，均清空候选、扫描上界和 more，返回原有 ErrAudit。CollectBatch 因此保留调用者传入的完整游标，不计 Examined/Collected/Rejected，不宣称范围结束，也不进入候选 Collect。已知成功的空范围和正常页保留原行为。

这是只读 hint 事务的失败处理，不新增写事务的 commit_unknown/rollback_unknown 分类。扫描不执行 mutation；真正 Collect 的单事务、当前权限复查和独立不确定结果分类保持原约定。没有增加 backup lock、解锁语句、后台 context、重试或角色权限。

新增测试使用真实 scan/CollectBatch 与现有 SQL 模型，仅替换事务结束回包，覆盖空 epoch、已结束游标、空尾页、正常页和损坏候选页，以及已知回滚、丢失回包、ErrTxDone 和结束期间取消。另从公共 CollectBatch 检查四种范围在扫描回滚失败时原游标完整保留、没有写入且没有进入收集事务。这些模型验证错误传播，不能证明远端 MySQL 的物理清理或锁释放。

本轮使用独立源码快照及 owner 缓存，关闭 Go proxy/sumdb 和自动工具链下载；没有安装依赖、修改远测入口或执行远端命令。两项正在运行的历史详情十六项与 GC 四十二项继续按它们各自冻结来源验收，不由本轮本地结果代替，也不自动覆盖本轮新字节。

旧实现对照准确命中十二个预期失败叶子，其余十二个对照通过；修复后两个根测试与二十四个场景全部通过，隔离输入前后摘要一致。当前工作区完整 systembackupevidence 包通过 374 个根测试、3,080 条通过事件，无失败、取消或跳过，保留 default vet，原生退出 0，用时 365.747 秒。

完整包的外层包装器因全清单摘要变化退出 1，原失败及 native 回执保持不变。独立复核以此前保存的 SHA256 唯一重建测试前清单：测试期间只有 download_gc_owner_lifecycle_mysql_test.go 变化，前后都带 systembackup_mysql 标签，Go 原生包清单也将它列在 IgnoredGoFiles；它没有参与普通测试。剔除这一份未参与输入后，其余 1,568 份选定输入前后摘要完全相同。两份 Node 合同脚本在整包测试开始前已经变化，整个测试期间保持不变；本轮没有执行或接收它们。新旧 tagged 探针字节与并发来源范围单独归档，不用普通包结果接收新增远测探针。

候选反向恢复后的旧运行文件精确匹配原快照 SHA256，限定运行改动只有批次扫描结束检查。初始冻结来源 1,568 份，SHA256 为 f4c67e2866b8ad64136e3ee8390dc2e8e39be4f9aeae36d6815eca29855a6829；本轮未把整棵当前工作树纳入验收。

准确自有目录 .tmp-d-index-cache-91d7897bdfb34761ad4adce2669bb651 下 3,733 份文件已删除，源码副本、缓存、tmp、telemetry 和测试构建产物均已清理，并独立确认目录不存在。初次准备因 owner 名称长度校验失败，在任何构建之前退出；该次仅一份 marker 的无效 owner 也已清理。未安装依赖或执行远端命令。

[最终限定验收](evidence/d-gc-scan-completion-accepted-20261022.json)、[并发输入复核](evidence/d-gc-scan-completion-drift-accepted-20261022.json)及[清理回执](evidence/d-gc-scan-completion-cleanup-20261022.json)保留本轮边界。[验证脚本](evidence/d-gc-scan-completion-validation-20261022.ps1)记录实际命令；清理后可分别执行 node docs/evidence/d-gc-scan-completion-drift-20261022.mjs --check 与 node docs/evidence/d-gc-scan-completion-review-20261022.mjs --check 复核历史证据、当前两份候选字节和清理状态。后续限定源码变化需重新验证，不能沿用本轮结果认证新字节。完整 freeze/GC 生产接线、九表 normalization 和 D 原六项仍待分别验收。
