# A：D 固定调用快照到系统正文与 Wrap 的接线

日期：2026-09-30。承接 [D 调用快照](system-backup-d-producer-execution-20260930.md)、[A 系统 Transit](system-backup-a-system-transit-20260930.md)和 [mTLS 主体证明](system-backup-a-system-peer-20260930.md)。本轮实现 A 对 D 具体 Execution/ExecutionHandle 的调用桥接；尚未实现生产 CommandEnvironment/ExecutionEnvironment、独立部署注册表或系统发布事务。

## 入口与信任来源

[NewSystemExecutionPreparer](../backend/internal/systembackupevidence/system_execution.go) 接受 D 的具体服务与不透明句柄，以及独立部署/evaluator 提供的 SystemExecutionPreparationPolicy。公共入口不接受 SnapshotView、替代 BeginCall 的成功回调或普通 claim 数据。零值服务/句柄不能启动准备。

策略固定数据库范围、run ID、原 input hash、evaluator profile、主体/issuer 摘要、准确正文 identity/hash/大小、正文校验策略、完整 JWT/Transit 配置及独立认证投射。其 `SystemExecutionPreparationPolicyHash` 为带版本域的内部闭集 JSON 摘要，CA 字节由已核对的 SHA-256 绑定。该摘要用于 D ReferenceApproval.PolicyHash，不替代 C1 channel_profile_hash，也不是认证凭据或公共合同冻结。

**生产环境必须独立核准完整策略。** D 的身份和 ref 环境需验证主体与 JWT issuer/subject/投射的可信映射、原 input 与准确输出正文的关系、evaluator 来源、准确 KEK 版本和通道独立性。不能把调用者传入的策略重新求 hash 后直接批准；配置合法、两次 hash 相等及 mock TLS 测试通过均不能代替这些检查。

## 调用顺序

1. 在任何正文读取、token 文件读取和 provider 请求前，对同一个句柄调用 D BeginCall 两次：`content_read` 指向原探测 provider/ref，`wrap` 指向准确 evidence KEK/ref。两个请求固定相同的策略摘要、evidence ID 和原预算；预算最多 20 秒，并受调用方 deadline 与正文策略截止约束。
2. 从原快照的 View 读取比较输入，核对 scope/run/input/subject/issuer、目标角色/provider/ref/scope/evaluator profile、原 observation 到期及 locked-absence evidence。正文策略到期必须等于 run 的原 observation 到期。
3. 比较两份快照的共享 domain/grant/run/target/身份/host/evidence 事实。只有每个用途的 CallRequest、ReferenceApproval 和其 request hash 可以不同；取得 Wrap 快照期间发生续租、身份版本变化或观察变化均拒绝。两个服务端快照都保留，不将副本或 hash 当作凭证。
4. 再次复查两个原快照后构造现有 SystemTransitPreparer。每次 AuthorizeSystemPreparation 都向同一 D 服务执行两次 RecheckCall，并核对只读 view 未变。正文验证前后、凭据交换前后、Wrap 前后及暂存完成均沿用这条复查链。任何失败只返回拒绝，不重新 BeginCall、不替换快照或延长原期限。
5. ProducerIdentityHash 固定两份服务端快照摘要，Content.ValidUntil 取原预算和两个原快照截止的最小值；Transit 层仍扣除时钟余量并限制单次外部调用。返回的正文策略是独立副本，修改返回值不改变后续检查。

每次 D 调用自身完成受 Guard 保护的事务；A 不持有 SQL 事务执行正文读取、JWT 交换或 Transit 网络操作。多次复查不能使 SQL 授权和远端 Wrap 成为原子操作；撤销后的本地拒绝不代表撤回已发出的远端请求。

## 验证范围

[新增测试](../backend/internal/systembackupevidence/system_execution_test.go) 使用包内私有模拟调用接口测试 A 的映射与各阶段拒绝，并复用真实本地 TLS/JWT/Transit 协议服务器完成小正文加密和解密回读。生产公共构造器只接具体 D 服务；私有模拟快照不能通过该具体桥的 RecheckCall。测试包含错误 scope/run/input/issuer/角色/evaluator/ref/policy、未绑定观察、观察期变化、证据已存在、身份/续租变化、撤销、快照替换、过期及错误正文。

该模拟接口不证明 A 与真实 D SQL 环境的成功联调。D 包自己的生命周期、调用和事务测试在同一冻结快照回归中执行；其模拟 driver 的通过也不代替真实 MySQL 行锁和生产部署验证。Linux 测试二进制只交叉编译，不在本轮执行。

验证使用 [冻结源码验证脚本](../scripts/system-backup-a-producer-adapter-validation.ps1)，保持默认 vet、禁用依赖下载，结束后删除本轮缓存、源码副本和测试二进制。准确源码指纹、计数、并行改动与清理结果见 [本轮机器记录](evidence/system-backup-a-system-execution-local-20260930.json)。不重跑已验收的远程 MySQL 登录状态套件。

Windows 冻结快照回归通过 136 个主测试、1318 项含子测试记录，其中本轮新增 SystemExecution 的 4 个主测试、47 项含子测试记录全部通过。输入快照包含 212 个文件，既有测试计入总数；这不是新增 1318 个用例，也不证明随后并行修改的 D 文件版本。

Linux evidence 测试二进制交叉编译与默认 vet 通过，验证进程退出 0，无测试断言失败、编译器故障或重试；Linux 二进制未执行。A evidence 源码均保持与快照一致；后续变化的 D validate.go、pending.go、pending_test.go 不在本次最终版本验收范围。本轮临时源码、缓存、遥测目录及二进制均已清理，未安装依赖。

## 后续接线

- D 的生产环境须接 mTLS 原请求证明、共享部署/撤销/host/角色状态及独立完整策略核准；不能只实现一个返回请求 hash 的回调。
- C 的实际证据通道、A 的真实 JWT/Transit ACL 与 workload 映射仍须验证；采用 Job 时需要 B 的宿主身份和取消接口。
- D pending/claim 的确认提交、A 系统 STS/发布与历史恢复、最终证据/能力结果事务仍未完成。本入口不签发 PublicationClaim，也不能发布对象或登记 ready。

本轮没有修改公共合同、DDL、生产路由或启用开关，不构成 V01–V10 或系统备份全流程验收。
