# A 系统 claim 与发布结果 SQL 适配

日期：2026-10-08。作者 A，接收方 D。承接 [A pending SQL](system-backup-a-system-pending-20261008.md)、[D claim](system-backup-d-producer-claim-20261008.md) 和 D FinishPublication。A 新增 claim/finish 的实际证据加载和最终回读；D 继续拥有外层事务、CAS、提交结果及私有 PublicationClaim 签发。远端 STS/PUT、生产授权与历史恢复仍待接入。

## 接线

[NewSystemClaimEnvironment 与 NewSystemFinishEnvironment](../backend/internal/systembackupevidence/system_publication.go) 均要求原 Prepared、独立证据通道、完整原历史绑定以及对应的必需 authority。构造复用 pending 的严格 C1 解码及 manifest/content/object/store/KEK/write/recovery 全字段比较，不从普通 JSON 或调用方 manifest 构造准备凭据。

将 claim 环境传入 D NewPublication，随后调用 ClaimPublication 或显式 ReadPublicationClaim；将 finish 环境传入 D NewFinalizer，随后用已签发的私有 claim 调用 FinishPublication。本轮没有增加原始可提交 SQL transaction、HTTP 启用入口或默认成功的 authority。环境适用于仍持有原 Prepared 的当前 producer；进程丢失后的恢复需要独立历史加载和权限检查。

SystemClaimAuthority 负责实际身份/撤销/host/ref、容量、审计及独立读回授权。SystemFinishAuthority 还必须独立验证 C 结果证明对 scope/run/claim/store/ref/key/manifest/准确对象版本与时间的绑定。普通 PUT 成功响应、调用者 checksum 或 proof hash 不足以批准 ready。网络操作在事务之前完成，所有事务回调及最终检查均不能访问 provider。

## 证据与最终状态

每次 Prepare 固定 D 请求摘要、原历史摘要、原准备记录和独立会话；传给 authority 的分块数组、可空对象版本和容量报告均作副本隔离。L8 使用实际 registry/chunks SQL 锁定原证据，逐项比较所有不可变字段与分块原字节；不存在、ready/删除状态、原历史不同、缺块/多块或查询失败均拒绝。受信 ClaimEvidence/FinishEvidence 由锁定数据库行与原 Prepared 推导，不复制请求的声明代替检查。

| 阶段 | 最终 Guard 允许的变化 |
| --- | --- |
| 新 claim | 原版本加一，claim_owner 精确等于 D ClaimRequestHash，claim_expires_at 等于原请求截止。state/failure/health/正文/chunks/保留及 reconcile 元数据保持原样。 |
| 显式 claim 读回 | 原行保持不变；版本必须是原 expected + 1，owner/expiry 精确匹配同一原请求。不能制造尚未提交的 claim，也不能用换过 nonce 的请求读回。 |
| Finish ready | 版本加一，清空 claim，写入准确大小写和原字节的对象版本，state/failure 为 ready/none。 |
| Finish write_unknown | 版本加一，清空 claim，state/failure 为 write_unknown/provider_unavailable，对象版本保持 NULL。 |

最终检查先执行真实 authority 的当前权限复查，再对 L8 已锁的 registry/chunks 作 current read。允许列表以外的任何变化，包括错误 state/version/expiry、正文摘要、nonce/tag、保留期、health 或 reconcile 时间，都会拒绝提交。A 的 ready 校验只有私有最终路径可使用；旧 pending/claim 加载器仍只接受未发布状态及 NULL 对象版本。

Ready 是存储结果，不能自动改写能力结论或健康状态。D 的 CommitResult 仍需独立检查原观察时间、完整结果槽、代次、资格与引用。SQL 授权和已发出的远端请求不构成原子操作，本轮也不提供取消在途 PUT 的保证。

## 验证

[新增测试](../backend/internal/systembackupevidence/system_publication_test.go) 使用 A 的实际 SQL 加载器和 D 的真实 Transactions 执行器，模拟同事务内的 claim/result 列变更与审计参与方。它验证精确 claim 读回、ready/write_unknown、错误版本/claim/expiry、manifest/chunks/retention 漂移、authority 拒绝、容量跨期和读取失败，检查拒绝时数据库快照完整回滚。

这些 A 用例不签发真实 Lifecycle 句柄，也不调用 D 的私有 claim/result CAS；D 自身的编排及 CAS 用例在完整两包回归中执行。两部分证据不等价于生产 authority 下的完整成功联调，更不证明真实 MySQL 锁竞争或远端 provider。Linux 测试二进制仅交叉编译。

验证入口为 [冻结源码脚本](../scripts/system-backup-a-producer-adapter-validation.ps1)，保留默认 vet，禁止依赖下载，结束后删除本轮源码副本、缓存、遥测目录和二进制。准确输入、结果和并行源码变化见 [机器记录](evidence/system-backup-a-system-publication-local-20261008.json)。已成功的远程登录状态 MySQL 套件没有重跑。

Windows 两包回归通过 159 个主测试、1594 项含子测试记录，其中本轮新增 SystemPublication 的 4 个主测试、37 项含子测试记录全部通过。输入为 223 个文件的冻结快照；总数包含此前 A/D 用例，不代表新增 1594 项用例。

Linux 测试二进制交叉编译及默认 vet 最终通过，脚本退出 0，本轮源码副本、构建缓存、临时目录、遥测目录和二进制均已清理。Linux 编译首次遇到 Windows vet.exe 的 0xc0000043 进程故障；脚本在同一冻结源码和缓存上重试一次后通过，未重试测试断言，完整日志保留首次故障。

验证结束时 A evidence 源码均与测试快照一致。并行新增的 D result.go、result_test.go 不在本轮 223 文件快照中，不能将本轮通过结论用于 D CommitResult；其 A ready 加载器和完整联调继续待接入。

## 后续

继续接系统 STS/条件 PUT、C 的独立证据通道与结果证明、生产 Command/Execution/Pending/Claim/Finish authority、完整 Lifecycle 到发布的联调、独立历史恢复与实际 MySQL 验收。候选 D 表及公共接口仍需既定合同评审与正式部署；本轮没有改变 DDL 或启用生产路径。
