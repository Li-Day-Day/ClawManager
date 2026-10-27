# A：D GC task 十八项实际 MySQL 独立复核

接收 D `154631-7f8bf868` 的十八项 GC task 资格组件，关闭原十五过三败中 prune 的三个失败。原失败日志继续保留；本轮不批准完整 GC、生产角色、本人 MFA/provider 或历史安装升级。

[A 接收记录](evidence/a-download-gc-task-actual-accepted-20261021.json)执行 143 项核对，[接收器反例检查](evidence/a-download-gc-task-actual-review-checks-20261021.json)通过 37 项。复核仅读取已有日志、清单、普通测试事件和固定迁移字节，没有运行 Go、SSH、SQL，未安装依赖或创建构建产物。反例在内存中执行，写出实际 SQL 接收文件数量为零。

原始输入为[完整日志](evidence/d-download-gc-task-remote-20261021-154631-7f8bf868.txt)、[来源清单](evidence/d-download-gc-task-remote-20261021-154631-7f8bf868-source.json)和 [D 接收记录](evidence/d-download-gc-task-actual-accepted-20261021.json)。1,475 文件与已独立评审的 prune 追加迁移来源完全一致，逻辑摘要为 `5383dd6b3967edf9966896b7b298a0d05df04ab23b10db42df18f354c33a5f5b`。普通两包 620 根/5,019 项逐名保留，包内和脱离 checkout 的两个 seed 各 13 项一致。

日志首次本地测试命令在任何测试开始前因 `math` 的 Windows `asm.exe` 返回 `0xc0000043` 而 build failed。固定来源的原门禁只对该已知工具错误重试同一命令，vet 保持启用；重试后两完整包、seed、构建、postcheck 和外层退出成功。A 接收器只识别该确切前置失败片段并单列记录，仍拒绝断言失败、skip、未知崩溃、其他 FAIL、额外重试失败和待清理状态；未删除原始失败行或将首次命令改判成功。

实际 MySQL 8.4.8 在一次性 namespace `sbk-mig-261021083028-23bd`、原 UID `ab140148-6c3b-4fc5-8d20-7b918aa97b5d` 中运行；001..081 的 96 文件 fresh replay、迁移 JSON、冻结 SQL 字节与目录摘要 `0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe` 相符。Linux probe、inputs、migration runner 的本地与远端摘要分别一致。准确十八叶子和 root 均 PASS，root 用时 77.18 秒，最终 `download_gc_task_exit=0`。

| 观察项 | 本轮实际证据 |
| --- | --- |
| 实际并发等待 | 六处分别位于 backup 行、dependent 行和 drill/preflight/artifact verify/prune 空范围子例；表名正确、holder/writer 为不同正整数，每处均报告 writer rollback。 |
| prune 空范围 | 原组件与隔离谓词锁集合相同、存在实际 record lock，并明确排除父表 FK 等待。 |
| 计划摘要 | backup 四类和对应四个 empty range 共八份，绑定正确种类/表及摘要。仅作为计划摘要接收，未将其声称为原始 EXPLAIN 或扫描成本上界。 |
| 清理 | 每例一个、合计十八个不同子库；namespace 原 UID、远端 scratch、本地 cache/source 均由原日志报告。准确本地 owner 目录另经 A 独立核对不存在；未重新连接服务器核验远端缺席。 |

可重复离线核对：

```powershell
node .\docs\evidence\a-download-gc-task-actual-review-20261021.mjs --check
node .\docs\evidence\a-download-gc-task-actual-review-checks-20261021.mjs
```

A owner 十一项和受限角色十项仍各自等待新完整实际回执。后续优先补新组件运行身份的权限/元数据、真实生产材料/容量与 report/journal 卷、完整 GC policy/共享审批及恢复 E2E。073 staging 的类似 ID 格式问题也未由本轮 081 prune 修复接收。
