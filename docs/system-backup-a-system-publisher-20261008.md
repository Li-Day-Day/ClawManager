# A 系统对象发布编排

日期：2026-10-08。作者 A，接收方 D/C。系统 producer 的原密文通过 [SystemPublisher](../backend/internal/systembackupevidence/system_publish_runtime.go) 接入实际 S3 条件 PUT，随后核对对象、取得独立 C 证明，再由 D FinishPublication 提交 evidence 状态。入口保留原 claim 与两个 STS 调用快照；生产身份、C 证明实现及完整真实环境联调仍须接入。

## 入口与事务归属

NewSystemPublisher 要求具体 D Execution、ExecutionHandle、PublicationClaim、原 Prepared、固定 SystemSTSPolicy，以及独立 profile、不存在、结果证明和 FinishAuthority。内部建立 SystemFinishEnvironment 和 D Finalizer，不允许调用者用普通 JSON、ClaimBinding 或公开 callback 替代 D 的私有能力。

构造沿用 [系统 STS](system-backup-a-system-sts-20261008.md) 的固定 sts/publish 快照、原 owner 写截止和最多二十秒减五秒余量的预算。Publish 是单次入口，不能重入或自动重试 PUT。宿主保留原暂存用于后续恢复；Close 前排空请求。它不生成新 ID、不重新加密、不续租，也不调用旧 Service.Publish 的独立事务。

## 对象写入与结果核对

先对原准确对象执行 Stat。已有对象的版本、原生 SHA256 和大小匹配时跳过暂存及写入。无法确定对象存在时，只有独立 C 返回新鲜、challenge 绑定的准确键不存在证明，才允许读取原暂存。完整性或权限拒绝不启动写入。

暂存读取限定为原 manifest 的 object size 加一字节，验证长度与 SHA256，关闭 reader 后再复查 D 原快照。独立不存在证明的原失效时间贯穿暂存读取和 PUT 的 context，并限制实际请求签名的截止；读取跨过证明有效期不得启动写入。仅将这份已验证的密文送入 S3Store.Put，保留准确 key、checksum、content-length、原 owner deadline 和 If-None-Match。内存密文在返回时清理；宿主拥有的耐久暂存不被删除。

PUT 成功、失败、冲突或响应不明后都只执行一次新的 Stat。不会因为错误重发第二次 PUT。Stat、不存在证明、暂存打开/读取/关闭、PUT、结果证明各阶段之后复查原 D 快照；关闭、撤权、快照变化、过期或 context 取消均阻止继续提交。

## 独立结果证明

SystemPublicationVerifier 收到完整 scope、run、claim、policy/profile、manifest、原 Ref、期望摘要/大小、当前观察和随机 challenge。返回证明必须逐字段对应请求，观察时间须在本次调用内，失效时间不超过原预算及观察后 30 秒。ProofHash 仅供独立 FinishAuthority 核对 C 来源，不因格式正确而成为授权。

ready 必须同时具备匹配原 manifest 的 Stat、精确对象版本和独立 C 证明；普通 PUT 响应或未知 Stat 无法制造 ready。write_unknown 只可由独立 verifier 返回已验证的不确定结果，且不携带对象版本。没有证明时不伪造 proof hash 或状态提交，原 claim 由已有期限和独立恢复机制处理。

所有远程访问先于 D Finalizer 的数据库事务。D 再核对当前主体、完整 C 来源、历史引用、容量和原 claim，并在 FinalGuard 后执行状态 CAS。FinishResult 只说明 evidence 发布状态，不能替代 D CommitResult 的独立能力结果收据。

## 验证范围

[本地用例](../backend/internal/systembackupevidence/system_publish_runtime_test.go) 使用真实 Prepared 和原密文、实际 TLS STS 交换及签名 S3 HEAD/PUT，请求接收端独立核验签名、条件头和正文。D 调用快照、C verifier 和最终提交在这些编排用例中为包内模拟；既有 D 实际 A 适配集成用例另行覆盖数据库事务。两组测试不能合并声称已完成实际 D claim 到真实 provider 的端到端验收。

修订轮使用 [冻结源码验证入口](../scripts/system-backup-a-producer-adapter-validation.ps1)，[完整日志](evidence/system-backup-a-system-publisher-local-20261008-r2.txt) 和 [234 文件快照](evidence/system-backup-a-producer-snapshot-20261008-023155-4643bb3b.json) 确认：两包 180 个主测试、1826 项含子测试检查全部通过，其中新增发布编排 4/47，既有系统 STS 5/54、D 实际 A 适配集成 3/17；断言失败为零。默认 vet 保持启用，Linux 测试二进制仅编译、不执行。一次 Windows vet 进程 0xc0000043 触发一次同快照、同缓存重试，随后通过，整体退出 0。源码变化为零，专属源码副本、缓存、临时目录及二进制全部清理。未安装依赖，未执行远程操作。详见 [机器回执](evidence/system-backup-a-system-publisher-local-20261008.json)。

首轮 [日志](evidence/system-backup-a-system-publisher-local-20261008.txt) 和 [234 文件快照](evidence/system-backup-a-producer-snapshot-20261008-021955-706adf43.json) 记录 180 个主测试、1825 项含子测试检查及默认 vet/Linux 编译通过，退出 0，专属产物已清理。该快照尚未包含不存在证明失效时间向暂存/上传传递的补强；结尾准确列出两个源码变化文件，不能作为修订版通过依据。修订版新增暂存跨过证明截止的拒绝用例，并在接收端验证实际 PUT 签名期限。

修订轮结束之后、生成回执时，D 的 integration authority/fixture 两个测试文件出现并行变化，并新增 integration SQL 和 MySQL 两个测试文件；验证入口脚本也开始扩展。本轮发布源码仍匹配通过的快照；回执保留实际执行的原脚本摘要，单列验证结束后的修改与新增文件，不把它们计作已验证。

## 后续交付

继续接生产身份/authority、独立 C profile/结果证明、历史恢复和真实 MySQL/provider 验收。按用户要求，当下一步需要远程测试时暂停目标，给出完整可复制命令、日志路径及验收标准，由用户执行；不重跑已验收的远程套件。

## 2026-10-08 后续接线

A 已新增 [发布调用证据适配](../backend/internal/systembackupevidence/system_publication_call.go)：在 D 的 `sts`、`publish` 调用事务中锁定并核对实际 evidence/chunks、原 claim 与历史 run/观察字段，最终 Guard 再读回；其它生产授权由传入的 Execution 环境承担。新的 [跨包测试](../backend/internal/systembackupevidence/system_publication_call_integration_test.go)用真实 D Lifecycle/Execution/Publication 签发的私有 claim 和调用快照，走通本地 TLS STS、签名 S3 条件 PUT、D FinishPublication、CommitResult；篡改原 chunk 后的快照复查被拒绝。

本轮最终 [完整日志](evidence/system-backup-a-publication-call-local-20261008-r2.txt)与[冻结快照](evidence/system-backup-a-producer-snapshot-20261008-064425-98645ce2.json)记录 241 个输入文件、两包 186 个主测试和 1571 个子测试通过，默认 vet 与 Linux 测试二进制交叉编译通过；源码零漂移，脚本退出 0，临时源码、缓存和二进制已清理。此前[首轮日志](evidence/system-backup-a-publication-call-local-20261008.txt)记录一次 Windows 编译/vet 工具故障及同快照重试，不能单独当作最终结果；后续新贯通用例的首个定向运行还暴露夹具把数据库时间设到真实时钟之后，导致已提交结果正确返回 `ErrCommittedExpired`，修正为当前时间采样后才取得上述最终回执。

本地贯通仍使用测试身份/evaluator、C profile/不存在/结果证明及 TLS S3 接收端。生产 Execution/Finish/Result authority、C 独立限制通道及真实 provider 证明、进程丢失后的历史读取、正式部署与 V01–V10 验收尚未完成；本轮不改变正式 DDL、公共合同或启用开关。
