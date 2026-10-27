# A 系统结果提交证据适配

日期：2026-10-08。作者 A，接收方 D。承接 [A claim 与发布结果](system-backup-a-system-publication-20261008.md) 和 [D CommitResult](system-backup-d-producer-result-20261008.md)。A 为结果提交提供实际 ready registry/chunks 加载及最终回读；D 继续拥有结果事务、run/target CAS、引用和收据写入。独立 evaluator、生产投影与授权环境仍需接入。

## 接口与首次提交

[NewSystemResultEnvironment](../backend/internal/systembackupevidence/system_result.go) 接收原 Prepared、独立证据通道、完整原历史绑定和必需的 SystemResultAuthority；传入 D NewResults 后使用原 ExecutionHandle 调用 CommitResult。构造沿用原 C1 解码和 manifest 全字段比较。PrepareResult 固定完整请求、主体/版本摘要以及 result key/request 摘要，将嵌套场景、槽集合、可空对象版本和容量时间副本与 authority 隔离。

L8 使用实际 A 参数化 SQL 锁定 registry/chunks，比较原正文、manifest、对象摘要及大小、准确大小写的对象版本、store/KEK/write/recovery 通道绑定及所有分块原字节。只接受 ready/none、准确 evidence row_version 且没有 publication/GC claim 的记录；pending、write_unknown、错误版本、缺失或多余分块均拒绝。返回的 ResultEvidence 从实际匹配成功的数据库行和原准备数据生成。

最终 Guard 再比较原历史及报告事实，要求保留期覆盖收据，执行必需 authority 的当前权限检查，然后 current read 验证 A 全部字段仍与初次锁定相同。结果提交不能修改 evidence 状态、版本、health、claim、保留时间或 reconcile 元数据；投影、引用、收据与审计的写入失败必须由 D 外层事务整体回滚。

SystemResultAuthority 负责真实身份/撤销、完整 evaluator 请求真实性、规范目标映射、完整投影及引用前缀锁、容量和审计；最终检查还须重新核对 D 已锁记录及投影。ready 仅是存储事实，不能替代完整能力状态/reason 证明。A 没有提供默认成功的生产 authority，也没有新增 HTTP 启用入口、DDL 或事务自行提交入口。

## 精确收据重放

收据分支要求独立 ReadReceipt 权限，精确匹配原 scope、result key、request hash 和完整请求。该分支不得混入执行/历史/投影/evidence 事实，也不运行 A evidence 查询、收费、写入或时间刷新；因此不会因原 evidence 已归档而强制再次发布。当前身份与收据保留期由 D 的原截止及 authority 校验。

本环境仍要求进程持有原 Prepared，适用于存活 producer 的精确结果重试。进程丢失后的独立历史读取、关闭域/跨配置恢复需要专门加载器，不能用伪造 Prepared 替代。

## 验证范围

[A 用例](../backend/internal/systembackupevidence/system_result_test.go) 使用实际 A SQL、D 的真实 Transactions 执行器和标准库事务模拟 driver。准备阶段经过已有 A pending、claim/finish 适配；结果提交中的其它写入用同事务标记模拟，检查被拒绝时 A 行、分块和标记完整回滚。覆盖 ready 成功、精确收据读取、对象版本/claim/正文/分块/保留时间冲突、最终变化、权限撤销、容量过期、查询/审计失败和 authority 输入副本隔离。

这些 A 用例没有通过真实 Lifecycle/ExecutionHandle 调用 D CommitResult，也不验证生产投影或 evaluator。D 自身的编排/CAS 用例在同一两包快照中运行；两部分不能合并宣称完整生产联调通过。真实 MySQL、provider、V01–V10 及完整 HTTP/LDAP 撤权仍在后续范围。

验证采用 [冻结源码脚本](../scripts/system-backup-a-producer-adapter-validation.ps1)，禁止依赖下载并在结束后清理本轮产物。Windows 两包回归通过 168 个主测试、1708 项含子测试记录；本轮新增的 5 个主测试、50 项含子测试检查全部通过。准确输入为 227 个文件的冻结快照，结束时所有源码与快照一致，没有并行文件变化。

默认 vet 和 Linux 测试二进制交叉编译通过，脚本退出 0，无断言失败、工具进程故障或重试。Linux 二进制未执行；本轮源码副本、缓存、临时目录、遥测目录和二进制均已清理。详见 [机器验收记录](evidence/system-backup-a-system-result-local-20261008.json)。

## 后续

接通生产 Command/Execution/Pending/Claim/Finish/Result authority、实际 evaluator 与完整投影、系统 STS/条件 PUT、C 独立证据通道、历史恢复以及真实 MySQL 联调。旧引用退休/GC 与正式 D 迁移保持原验收范围。
