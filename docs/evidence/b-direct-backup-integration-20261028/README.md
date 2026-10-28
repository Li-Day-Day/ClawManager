# backup 本地冲突解决记录

这是上一轮“仅解决冲突、不推送”时的历史状态快照。用户随后授权直接提交推送；最新检查拆分、准确验收边界及集群清单见 [本轮交付说明](../../system-backup-install-smoke-and-acceptance-20261028.md)。下文不作为最终 Git 提交/推送状态。

按用户最后指示，本轮仅处理冲突和必要的编译集成修复，**不提交、不推送、不合并 PR**。功能 HEAD 保持 `47f3d0114a898c6446e9b04a3ffd54d6ae50b9e7`，本地正在合入的公共基线为 `2ed5e284eb8b0e73fdb286b0dff9eb217b6f5c5b`。Git 保留 merge in progress，冲突索引应为空，等待后续审阅和提交指令。

## 已处理冲突

| 文件 | 处置 |
| --- | --- |
| publicadapter/linux_profile.go | 保留公共侧对 Input/SourceInventory 的深拷贝，builder 不能改写原任务或 SQL 发现快照。 |
| publicadapter/runner.go | 保留公共侧 channel/类型化 nil 检查及 BackupSpec.RequestedParts 深拷贝。 |
| publicadapter/relay.go | 保留 B 的私有 transport seam，导出生产入口仍为 NewAuthenticatedRelayHandler，未恢复裸 NewRelayHandler。 |
| publicadapter/relay_test.go、relay_tls_test.go | 使用私有 decoder 构造继续验证 wire/真实 loopback TLS；A 原认证入口另有原生回归。 |
| publicadapter/README.md | 保留已交付的 A relay 和具体 runtime writer 说明。 |
| system-backup-b-public-runner-handoff-20261028.md | 保留 B 交付并明确 D 新 task loop/records/Job Ports 已到，但生产 owner link 和真实验收尚未完成。 |

合并还暴露语义冲突：新 A relay_message.go 引用 B publicadapter，而 B relay_auth.go 引用 A evidence，形成 Go import cycle。将原 RelayVersion/RelayMessage/RelayEvidence 数据定义移到无依赖的 `internal/systembackup/relaywire`，B 原导出名使用类型别名，A 只引用该数据包。原 JSON 字段、版本、序列/进度、认证/事务和 proof 校验均保留；B 的消息校验改为包内函数，不产生新协议、控制面或旁路入口。A 两份 relay_message 文件仅替换 import 路径，不修改其绑定/复查逻辑。

## 验证与边界

- A evidence + B publicadapter 全包离线回归退出 0：3479 个 pass test event（包含嵌套子测试），0 fail / 0 skip。覆盖原认证、消息绑定和 B runner/writer；不代表真实 SQL/K8s/迁移。
- 公共 controller + controller main 定向回归退出 0：106 个 pass test event，0 fail / 0 skip；匹配 Test(Execution|TaskExecution|TaskClaim|BackupStart|SQLDeadline)，覆盖公共领取回执、执行记录、Job Ports 和实际 D→B 组合。**不是 controller 全包测试通过声明。**
- 两份直接相关 Node 合同测试 76 项通过，0 fail / 0 skip。
- publicadapter、relaywire、A evidence、公共 controller 及 controller main 的 `go vet` 退出 0。
- 原首次 13 包检查有 9 包成功；另 4 包因上述 import cycle setup failed，原失败日志保留。修复后重跑受影响的 A/B 全包及 controller 定向范围，没有把首次失败改写成成功。
- 未改动的 API/read/security/observer/plan custody/server 等范围复用首次有效结果，不无变化重复全部构建。

命令与退出码见 `final-go-exits.json`、`scope-final-node-exits.json`；源码范围见 `source-pin.json`，事件统计见 `test-summary.json`。原生完整日志保留在本地同目录的 `go-tests.jsonl`、`relay-merge-final.jsonl`、`controller-merge-final.jsonl`、`merged-vet.log`、`scope-final-node.log`。当前均为本地记录，不把本地路径当作远端已发布记录。

## 按收窄范围保留的问题

新公共 migration 082 使真实 source catalog 为 137 文件、hash `88f4b5f39622a068b060e083689da263ee066bd9642de77fd82e8a28926ee557`；原 bootstrap guard/registry 仍为 136 文件、hash `dba576ad9efd3f377d8d07de2a9a86d4e523d8dafe8943751beb057a64e52441`。最终普通 inventory/contract `--check` 仍退出 1（missing or stale）。**本轮不更新 owner 策略、审批或原门禁，不宣称全部检查通过或可直接发布。**

在用户收窄范围前曾尝试清单同步及 pending 草案，之后全部恢复到合并索引的原字节：division plan、decisions、cross-review requests、inventory/registry、A canonical fixture、两份空白模板及两份 schema 测试都不包含该临时改动。此前 `inventory-write.json`、`contract-write.json`、`inventory-final.log`、`contract-final.log`、`node-integration.log` 属于撤回前的本地迭代，不能作为最终工作树通过依据；其中 Node 原结果 131 项中 129 pass / 2 fail，输出汇总还遇到 GBK 字符打印错误，但原测试日志已先保存。最终状态只看 scope-final / final-go 记录。

本轮没有修改 CI workflow，没有实际 K8s 冒烟、真实数据库/Runtime Agent/存储、生产写入、授权签发或迁移，也没有安装依赖。MinIO 镜像与公共现场首链输入仍为既有待补项。

本轮 Go 使用 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`，cache/tmp 限定为 `.codex-temp/b-direct-backup-integration-20261028`，没有输出独立仓库二进制。测试结束后，带 workspace 绝对路径和 owner marker 检查的 native PowerShell 清理命令在执行前被自动审批以 `blocked by policy` 拒绝；未换工具或路径绕过，专用 cache/tmp 暂留。日志保留，没有删除其他 owner 产物。
