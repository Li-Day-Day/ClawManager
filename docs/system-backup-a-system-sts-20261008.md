# A 系统发布 STS 适配

日期：2026-10-08。作者 A，接收方 D/C。承接 [系统 claim 与发布结果](system-backup-a-system-publication-20261008.md) 和 [系统 producer 设计](system-backup-a-system-producer-adaptation-20260930.md)。A 新增系统专用 STS 凭据适配，绑定 D 已提交的私有 claim、两个原调用快照和实际 Prepared；条件 PUT 编排、C 真实证明及生产授权环境继续接入。

## 授权与固定快照

[NewSystemExecutionSTSCredentials](../backend/internal/systembackupevidence/system_sts.go) 的公共入口要求具体 D Execution、ExecutionHandle、PublicationClaim，另需原 Prepared、历史/通道/STS 策略及必需的 SystemSTSProfileVerifier。普通 ClaimBinding、SnapshotView、JSON 或 callback 不能替代 D 的私有对象。

SystemSTSPolicyHash 绑定完整原历史、通道、STS/store 端点与 CA 摘要、角色、issuer/audience、主体与投射文件、独立 provider profile。D 必须在 ClaimPublication 前独立核准此策略摘要；计算摘要本身不授予权限。固定策略使用真实无配置/禁用/启用场景绑定，不制造配置版本或 task attempt。

构造获取 sts、publish 两个已提交调用快照：分别绑定通道 write 和 store 引用，比较同一 scope、主体、grant 代次/版本、run/input、原历史时间、manifest、claim 和引用版本。共享授权事实必须完全相同。本地预算最多 20 秒，并受原 owner 写截止、D 原快照及 claim 限制；适配器另留五秒余量。实例不替换快照或续租，旧授权变化后需由原生产生命周期重新准入。

Resolve 只接受原准确 Ref 的 Stat 或原对象 checksum/size/写截止的条件 PUT。Range、Delete、跨对象、错误版本和截止变化均拒绝。每次 STS 交换前后调用独立 provider verifier，并在 verifier/投射令牌读取前后对两个原快照执行 D RecheckCall。失败不返回可用凭据，所有已取得的令牌副本擦除。

## 共用交换协议与独立 provider 证明

[STS 共用传输](../backend/internal/systembackupevidence/s3_sts.go) 保留固定 TLS 信任、禁止重定向、2048 字节策略上限、关闭的 XML 响应形状、精确 issuer/audience/subject/role/session 比较及短授权窗口。任务/download/GC/recovery 继续执行原 validGrant，完整旧授权值仍按原等值比较；系统路径不经过旧 config/attempt 授权结构。共用交换入口与无 authority 的传输构造器均为包内私有。

STS 请求仍遵循原 900 秒会话期限，实际可用窗口由远端策略的日期 Deny 限制；返回 ExpiresAt 表示策略截止，不伪称远端凭据已经提前到期。策略限制准确对象、唯一操作、TLS、截止，以及 PUT 的 If-None-Match。原有本地策略解释测试仅验证所发策略，不构成真实 provider 行为证明。

SystemSTSProfileVerifier 必须由独立 C 通道验证准确 profile、角色/CA、对象与操作，以及实际 ACL 和截止执行。尤其 S3 GetObject 通常不能区分 HEAD 与 GET/Range；本适配器拒绝 Range 调用不等价于远端禁止读取正文。Stat 需要已经验证的限制通道或 provider 机制，缺少该证明必须拒绝。接口没有默认成功实现。

JWT 投射文件的本地读取只检查准确 issuer/audience/subject/时间和大小；签名由真实 STS 验证。D 的工作主体认证和实时授权独立完成，不能用未验证 JWT 的声明授予生产权限。关闭实例前宿主须排空在途请求；Close 或数据库撤权不保证撤销已经签发的远端凭据或取消已发送 PUT。

## 验证范围

[新增测试](../backend/internal/systembackupevidence/system_sts_test.go) 在包内模拟 D 不透明快照与独立 profile verifier，使用实际 Prepared、真实本地 TLS STS 请求、JWT 投射文件及策略解释器。覆盖准确 Stat/条件 PUT 凭据、对象/截止/用途越权、profile 拒绝、交换前后撤权、快照变化、响应错误和令牌擦除。公共接口只接受真实 D 服务，包内模拟 seam 不向调用者开放。

STS 用例不执行真实 provider、完整 D 生产 authority、对象 PUT 或 V01–V10，也不将模拟 verifier 视为已交付 C 证明。同期 D 的 A/D 集成用例通过真实 D 生命周期服务和 A SQL 适配完成 pending、claim、FinishPublication、CommitResult 及收据重放，但数据库驱动和授权环境仍为本地模拟。该集成不证明公共 STS 构造器与真实 D claim 的成功联调。既有任务及其它 STS 用例随完整两包回归运行。验证使用 [冻结源码入口](../scripts/system-backup-a-producer-adapter-validation.ps1)，禁止下载依赖并在结束后清理产物。

首轮 232 文件快照中，STS 的 5 个主测试、52 项含子测试检查通过；D 新增 A/D 联调的 3 个主测试、17 项含子测试记录在 probe 初始化报 producer_invalid_record，导致整轮退出 1。未自动重试断言，也未执行 Linux 编译；该轮临时产物已清理。保留 [首轮完整日志](evidence/system-backup-a-system-sts-local-20261008.txt) 及 [失败快照](evidence/system-backup-a-producer-snapshot-20261008-014703-bebe2478.json)，不能记为整轮成功。

首轮运行期间，A 复核补上历史 TargetHash 对当前 run/target 的显式比较及两项拒绝用例，D 的联调测试也有并行变化；失败快照列出四个变化文件。修订版使用新的完整快照运行，不能把首轮 probe 错误归因于 A 的 TargetHash 修改。

修订轮 [完整日志](evidence/system-backup-a-system-sts-local-20261008-r2.txt) 与 [232 文件快照](evidence/system-backup-a-producer-snapshot-20261008-020112-8e39e641.json) 确认两包 176 个主测试、1779 项含子测试检查全部通过，其中 STS 5/54、D 实际 A 适配集成 3/17；断言失败为零。默认 vet 保持启用，Linux 测试二进制仅编译、不执行。Linux 编译阶段两条 Windows compile/asm 进程错误 0xc0000043 触发一次同快照、同缓存重试，随后成功；没有重试测试断言。整体退出 0，结束时源码变化为零，专属源码副本、缓存、临时目录和二进制均已清理。详见 [机器回执](evidence/system-backup-a-system-sts-local-20261008.json)。

## 后续

继续将 STS 接到实际 S3 条件 PUT 与独立不存在/结果证明，保留原密文与 owner 写截止，再调用 D FinishPublication 和独立 CommitResult。生产部署身份/authority、C 限制通道、完整生命周期联调、历史恢复、真实 MySQL 和正式迁移保持原验收范围。

按用户要求，本地工作继续；下一步必须由远程测试验证时暂停目标，交付可直接复制的完整命令、日志路径及验收标准，由用户执行远程测试。
