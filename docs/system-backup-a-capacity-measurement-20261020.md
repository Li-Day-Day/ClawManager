# A：容量采集的表集合与原始测量期限

【后续完整门禁补证】[A 对 D r73 的独立复核](system-backup-a-download-gc-review-20261020.md)已核对新来源 1,437 项、security 完整包 255 主/2,011 含子项及本轮 postcheck、默认 vet 和准确产物缺席。当前容量来源字节匹配，该新记录补足下文 r2 单包通过但未走到末尾 postcheck 的限制；原失败仍按历史保留。现场物理测量、账号和共享卷继续待验收。

当前状态：原始表集合/时间窗口修订的[旧独立回执](evidence/a-capacity-measurement-accepted-20261020.json)保持原范围。后续发现 `system_backups` 不匹配 `system_backup_*`，已补入采集查询、配置生成器与账号脚本的表闭集，并由[新装载增量回执](evidence/a-download-deployment-accepted-20261020-r5.json)核对：容量 Node 9 项、Python 4 项模拟测试、security 255 主/2,011 含子项、默认 vet、Linux 主入口编译、r5 冻结复查及准确产物清理通过。security 沿用与 r5 输入相同的 r2 通过记录；r2 末尾 postcheck 因另一包失败未执行，回执明确记录该限制。未安装依赖或部署采集器。MFA 九项、准入/结果二十四项保持原冻结范围，SQL task owner 十一项仍待操作者回执。

旧冻结来源共 1,415 项，SHA `535f11543b5da63dd1db265657acf548e3030a858de741b27b654de4243f02c0`。Linux 采集器二进制 SHA `aeee3e07acf75ecc948f4bed40aa67e7f9f0d5c7bb38cdde8ce311f8c7102f7b`，已在验证后删除；两份部署模板单独固定摘要并复核。该回执只证明当轮来源，后续补入基础备份表的 Go、Node、Python 改动另行验证。

## 基础备份表遗漏修订

`system_backups` 是四任务 owner 的基础备份表，名称既不属于 `system_backup_`，也不属于 `system_restore_`。仅按两个前缀和 audit_logs 统计会遗漏它；之前即使精确核对配置中的表集合，也无法发现生成器本身把该表排除。

当前采集查询显式包含该表；容量配置必须同时声明 audit_logs、system_backup_configs 和 system_backups。Node 从正式 catalog 生成集合并检查基础备份表，Python 账号脚本拒绝缺少该表的旧输入，Go 模型将其数据及索引同时纳入累加。Python 只执行注入假 transport 的单测，未运行真实账号创建或 Secret 写入。

旧配置须重新生成、固定摘要并与实际账号/表元数据核对，不能仅更换采集器镜像来宣称修复完成。本地回归和 Linux 编译也不替代现场重新采集与共享报告可见性检查。

## 实现

原 Linux 采集器用 `SUM` 和表数量判断统计完整性。同数量的错误表集合可能满足计数检查；`ObservedAt` 又在物理空间与表分配测量之后采样，消费者的五秒期限会从较晚时刻开始。

`registration_capacity_measurement.go` 现在在物理测量前固定 SQL UTC 时间，逐一核对 SHA 固定配置中的表名和 `BASE TABLE` 类型，逐行累加数据及索引分配字节。缺表、重复/额外/替换表、NULL、负数、整数溢出、查询/游标错误或取消均返回不可用，不返回部分报告。测量结束再次读取 SQL UTC；时钟回退或达到原始五秒截止时拒绝报告，成功报告保留原开始时间。

Linux 入口保留数据库 UUID/库名/datadir、`auto.cnf` 与真实 `statfs` 检查，在同一专用 SQL connection 上调用新测量器。消费者、容量预算、保留账本和 SQL grants 规则未变。该修订不使 information_schema 的 InnoDB 估计成为精确存储配额。

两份空部署模板的迁移目录摘要从旧 `68794b…b1564` 同步到当前 95 文件的 `2e8c5a…de237`。现场 `zh-fix16` 候选保留历史身份和摘要，不能直接作为新部署清单使用；需要重新核对 namespace/Pod UID、镜像、数据库、最小权限账号及独立共享报告卷。

## 验证与未完成项

- 新增 24 个测量回归叶子全部通过：精确集合、原时间窗口内慢采集、同数量替换、缺失/重复/额外表、视图/NULL/负数/溢出、时钟/原截止、空间/SQL/游标失败和取消。它们包含在完整 security 包的 2,010 项中，不重复相加。
- `20261020-r3` 的容量部署 8 项、注册部署 4 项和 schema diff 3 项 Node 回归全部通过；独立 stdout/stderr 文件在 `docs/evidence/a-capacity-measurement-20261020-r3-*`。
- `20261019-r1` 因旧空模板摘要停在 Go 前，目录已清理。`20261019-r2` 的 vet 返回 `0xc000026b` 后会话中断，没有最终成功/清理标记；已在 10 月 20 日核对无对应进程，并守卫删除其准确自有目录。
- `20261020-r3` 的 `compile.exe`/`vet.exe` 返回 `0xc0000043`，两个业务包均 build failed，未执行新增回归；finally 已清理准确自有目录。失败原始记录保留。
- `20261020-r4` 采用同一冻结输入和串行构建，保持默认 vet、`GOPROXY/GOSUMDB=off` 和模块只读。security 全部测试通过，registration 命令没有测试文件，Go 的包级 `[no test files]`/skip 仅作为编译/vet 检查，不计作通过的测试。Linux 编译及冻结 postcheck 通过，最终进程退出 0，准确自有源码、缓存、临时文件和二进制均清理，独立复核确认目录不存在。此前两轮 Windows 工具异常仍按失败/中断保留，不改记为成功。

即使本地门禁通过，Windows 模型与 Linux 交叉编译也不证明现场 Linux `statfs`、实际受限账号、MySQL 表元数据、报告卷 Unix 权限、跨 Pod 原子替换和可见延迟。真实材料/容量、持久故障 sink、grants/分组 GC、正式共享 schema 批准及生产 main/E2E 继续保留。
