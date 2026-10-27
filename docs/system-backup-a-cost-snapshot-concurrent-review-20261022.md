# A：成本汇总并发快照实际回执与准备复核

## 2026-10-22：原轮五个成本子项已由 A 独立复核

已核对[操作者原始日志](evidence/d-cost-snapshot-concurrent-remote-20261022-101417-6826f52e.txt)，限定接收 MySQL 8.4.8 的 `cost_snapshot_concurrent_commit` 及四项成本汇总差异检查，五项均通过、父测试通过、最终退出 0。并发记录明确包含首个 COUNT 关闭、独立 writer 已提交、原 RR 快照保持不变和新 RR 事务看到变化。96 份正式迁移名称、catalog、同轮本地/远端探针摘要及三次 seed 均匹配；该专项不再列为“尚未执行”，无需为关闭这项待办重跑。

[A 新的独立接收回执](evidence/a-cost-snapshot-concurrent-actual-accepted-20261022.json)直接解析原日志，并与固定摘要的 D 准备/实测记录交叉核对。原日志 SHA-256 为 `45bffb02fa03d7a654700778e206020ecf47bc486dc45b03b2bd107040ae7daa`；准确 namespace 为 `sbk-mig-261022023330-7a22`，UID 为 `07aab8cd-5998-4b2f-90c8-1b894f4bf08e`。账号、随机业务库、namespace、远端 scratch 和本地缓存均报告清理；未记录准确本地 scratch ID，因此没有补写独立路径清理或远端复查成功。四条 socket close 消息原样保留。

本轮实测没有提供完整同轮源码清单或源码前后摘要。原 A 入口执行逐包测试和编译，并校验二进制与迁移 catalog，不能称为逐包源码输入指纹。当前 `restore_rows_mysql_test.go` 相对成本准备已新增报告检查，观察摘要为 `77ea3c03be4c077b40fbd8e1b458aa78572a58772821db89e163b3da83653ff2`；另外两个成本测试文件仍匹配原准备。不能把当前源码倒推为原二进制来源，也不接收新增报告用例或当前整棵工作树。

只接收正式迁移后的合成十五表夹具及成本 RR 行为；真实 B dump 认证、生产恢复写入授权、完整 large-smoke、完整 GC、角色批准、本人 MFA 和生产验收继续待办。本次 A 没有执行远测、Go 测试/构建或安装依赖；审阅器的 12 项离线正负检查全部通过，覆盖缺用例/并发记录、重复 PASS、错 UID/二进制、迁移遗漏、错误激活、清理缺失及非零/重复退出。

可只读复核新回执；未来观测源码变化会使当前观察校验失败，保留原历史结果而不自动更新摘要：

```powershell
node .\docs\evidence\a-cost-snapshot-concurrent-actual-review-20261022.mjs --check
```

## 原本地准备的历史接收

原准备轮限定接收 D 的本地测试准备。候选与合入后完整业务包各通过 **88 根／396 项**，旧业务包 **86 根／387 项逐名保留**。新增两根／九项本地检查。当时实际 MySQL 尚待执行；新的实际结果以上节为准，原准备回执中的 pending/false 保留历史含义。

[A 接收回执](evidence/a-cost-snapshot-concurrent-accepted-20261022.json)和[独立复核脚本](evidence/a-cost-snapshot-concurrent-review-20261022.mjs)固定原准备回执、完整日志、源码和清理身份。可在仓库根目录执行只读复核：

```powershell
node .\docs\evidence\a-cost-snapshot-concurrent-review-20261022.mjs --check
```

原准备轮仅改三份测试文件。既有 `restore_rows_mysql_test.go` 删除新增子测试调用后，原字节及摘要完全恢复；另加驱动包装的本地测试及 tagged MySQL 场景。1,524 项冻结来源相对于 1,522 项基线的其余文件逐项不变，原接收时 208 份实际项目输入、相关 Go 文件集合及嵌入资产集合匹配；96 份 SQL 和一份 registry JSON 在范围内。冻结来源摘要为 `5d43fb6dc511d21ff25287b25ef12d4f43bcc37ed534902d7a573e52e0316523`。范围不包含整棵当前共享工作树的其他修改，不登记新 owner 来源基线。

代码复核确认，包装层委托原事务 BeginTx、QueryContext、结果读取和关闭。首个准确 COUNT 结果关闭成功后才调用写连接，不靠 sleep 排时序。原 collector 仍采用只读 Repeatable Read，完整读取十五表计数与成本汇总；写事务只改隔离夹具已有准确 ID 的八位金额最低位并明确提交。旧事务必须保持原结果，新事务必须取得相同行数和变更后摘要；预期摘要由完整夹具行的内存汇总路径计算，并非从新 SQL 摘要自证。

九项新增本地检查覆盖准确匹配／不匹配查询、写入回调失败、查询失败，以及结果关闭成功／失败／期间取消和一次调用约束。写入或查询失败的 collector 检查要求零快照、无提交和回滚。真实场景复用原 run namespace UID、server UUID、随机库 owner nonce、正式迁移及 SELECT-only reader；恢复原金额前重新核对准确身份，写入或 COMMIT 回包失败也不能假定没有提交。原外层数据库／账号清理继续执行。上述场景设计及本地模型通过不构成真实并发数据库结果。

tagged seed 在源码位置和 Windows 独立二进制位置各通过三项；Windows／Linux 探针及 Linux 迁移 CLI 构建通过。原日志和 native 回执的退出 0、default vet、来源复核及空 stderr 匹配；完整业务日志的 run／pass 名单一致、无失败或跳过。旧混合包日志只提取本业务包 387 项进行保留核对，不将其他包计入本轮。

[原清理回执](evidence/d-cost-snapshot-concurrent-cleanup-20261022.json)记载准确 owner `.tmp-d-index-cache-8155571ac24945128752f25b204346f0` 的 6,782 份文件已删除，包含源码副本、缓存、tmp、telemetry 和三个二进制；A 独立确认整个准确目录不存在。A 本轮只读取、复核和保存审阅文件，没有安装依赖、重跑已成功测试或生成测试／构建产物。

原准备阶段的 [D 完整 PowerShell 命令](system-backup-d-cost-snapshot-concurrent-20261022.md)和接收条件保留供追溯。实际父测试及五个子项、并发观察、探针/迁移摘要、准确 namespace UID 清理和退出 0 已按上节原日志复核；缺失的源码清单与准确本地 scratch 身份仍明确保留，不据此补写。原“逐包输入校验”描述现已纠正为逐包测试/编译，不能等同 D config-writer 的冻结清单。

本轮不批准真实 B dump 证明、恢复写入授权、生产账号、DDL freeze adapter、完整 GC 或生产验收；现场原材料与运行卷缺项继续沿用[统一交接](system-backup-a-field-evidence-handoff-20261021.md)。已接收的角色十项、GC task 十八项和 freeze 前置三十四项无需因此重跑。
