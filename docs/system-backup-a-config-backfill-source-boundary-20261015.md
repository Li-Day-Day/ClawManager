# A：旧 canonical 原文验证的字节与取消边界

本项推进 [canonical 写入/回填交接](system-backup-a-config-canonical-write-handoff-20261014.md)中的原文验证前置，修改的是只读 `Reader.VerifyConfigBackfillSource`，不提供回填写权限或执行数据库更新。

## 发现与修订

代码检查发现，入口原来直接借用调用方 `source`，先核对 JSON、旧行 hash/size 和全部展开列，随后调用最终权限复查并提交，最后才复制字节进内部回执。因此，权限或数据库回调期间对原始 buffer 的改动可能让最终回执的 canonical 与已核对的 hash 不一致；较早改动还会让本应验证准确原文的调用被意外拒绝。原测试只验证返回后调用方改 buffer 不影响回执，未覆盖回调期间的输入变化。

现在先检查 2..262144 字节的输入预算，再立即复制原文；JSON、准确 hash/size、所有展开列及返回回执都使用该私有副本。没有 trim、重建、重新序列化或猜测原文。保留同事务读授权、共享行锁、最后权限复查和只读提交。

另在提交返回后检查调用 context：若 driver COMMIT 回调期间发生取消，即使 driver 返回 nil，也不释放可用验证回执。没有写入待重试，因此不增加任何自动写重试或“提交成功即授权”行为。

## 验证范围

新增两个主测试、11 个子用例：五个用例分别在初始授权、查询、rows.Close、最终复查和 COMMIT 中同步改动调用方 buffer，要求最终仍返回起始原文对应的准确回执；六个取消用例覆盖入口前及这五个回调阶段，要求返回完全空的回执。COMMIT 取消用例还证明已进入 driver COMMIT，防止仅在更早阶段取消就误判覆盖通过。

测试通过既有严格查询/参数 fixture 核对真实生产函数，没有复制一个“正确实现”充当被测函数。SQL transport 和授权是模型，不证明真实 MySQL、来源 provenance、行指纹算法、具体安装写授权或正式维护收据。同步输入变动测试也不声称支持调用方无同步地并发写同一 Go slice。

[本地专用入口](../scripts/system-backup-a-config-backfill-source-validation.ps1)冻结全部构建输入，先跑源验证定向测试，再运行完整读取包；同轮 cache 只保留至 finally，并删除本轮源码、cache/tmp/telemetry 与测试产物。默认 vet，Go module readonly、proxy/sum off、local toolchain，不安装依赖。

本地门禁已通过，见[完整输出](evidence/a-config-backfill-source-local-20261015.txt)、[冻结输入](evidence/a-config-backfill-source-snapshot-20261015.json)与[限定接收记录](evidence/a-config-backfill-source-boundary-review-20261015.json)。1,202 项输入摘要为 `7252dca45159df131ba02766a6c6396dcadecaaa1b413e77c9e103365a8bec71`；定向 4 主测试/11 子用例（1.196 秒）、完整读取包 52 主测试/217 子用例（269 项，3.448 秒）全部通过，默认 vet、退出 0、无工具重试。新增 2/11 已包含在完整包内，定向重复覆盖不另加总。

冻结副本测试后复核通过。三项本轮源码/测试/入口仍与副本匹配；四项后续 D 响应重放/事务输入发生漂移，不据本轮读取包回归接收 D 最新实现。准确目录 `.tmp-a-evidence-df8f00254b5f4079a6182cd75e508deb` 与 `.tmp-d-index-cache-2488baf3b4e148df934e19d9e5d2116d`、cache/tmp/telemetry 和测试产物均删除，并独立确认不存在。原 A 写入合同、维护摘要合同及 066 原字节保持已签收 hash。

本轮未安装依赖、执行远端/真实 SQL、交付历史原文或签发运行 grant。缺少原始 canonical 文件的旧行继续保持 NULL/读取 503；具体运行 grant、独立 writer/收据及实际迁移和回填仍需另行完成。
