# D：历史恢复身份撤销行管理候选（2026-10-09）

`backend/internal/systembackupproducer/recovery_fence.go` 增加 D 专用的 `RecoveryFenceManager.ChangeFence`。它只写候选表 `system_backup_producer_recovery_revocations`，不签发 A 的后台工作负载身份、C 的 Stat 权限、旧 producer grant 或恢复 claim。请求是精确 CAS 目标；受信 `RecoveryFenceSession.Authorize` 必须另行核验当前管理身份、部署准入和请求摘要。没有该适配就无法构造可用的生产管理入口。

| 操作 | 必须满足 | 同一事务内的结果 |
| --- | --- | --- |
| `register` | 该 scope/身份摘要从未出现，预期代次/版本为 0/0 | 插入未撤销行，代次/版本为 1/1 |
| `rotate`，身份不变 | 精确匹配现有代次/版本，允许已撤销行重新准入 | 代次/版本各加 1，清除撤销状态 |
| `rotate`，新身份摘要 | 精确匹配旧行，新摘要从未出现 | 旧行代次/版本各加 1 并撤销；新行以同一新代次、版本 1 插入。旧身份不可复用 |
| `revoke` | 精确匹配未撤销行的代次/版本 | 数据库 UTC 写入撤销时间，代次/版本各加 1；重复撤销拒绝 |

事务使用现有 repeatable-read/UTC 安装身份检查。锁序为 L0/L1 安装与部署前缀、旧撤销行、新身份行（如有）、受信管理授权、intent audit、CAS、result audit、最终行及授权复查、提交。任一失败回滚；提交确认不明时不返回成功行，也不自动重试。撤销操作的 audit 容量必须由受信适配独立保留，不依赖新 producer 命令准入。

当前候选表 DDL 仍在 [`producer-recovery-revocation-candidate.sql`](../contracts/system-backup/v12/producer-recovery-revocation-candidate.sql)，**没有进入编号 migration、inventory 或生产入口**。A 需评审工作负载注册、证书/CA、部署状态、管理撤权及 L0/L1 锁序；C 需评审与受限 Stat profile 的关系。两方签收前，D 的候选写路径和恢复入口保持未接线。

D-only 标准库事务测试覆盖首次登记、同身份与换身份轮转、同一 CAS 并发请求单赢家、旧代次/重复操作拒绝、撤销、审计/最终复查/CAS 失败回滚、换身份第二次写入失败的整体回滚和提交结果不明不返回行。进程内并发测试不替代隔离 MySQL 的真实行锁、gap lock、断连和部署授权验收。

本地离线回执：`GOPROXY=off go test ./internal/systembackupproducer -count=1` 与 `go vet ./internal/systembackupproducer` 均退出 0；最后新增缺行/撤销行拒绝用例后，`GOPROXY=off go test ./internal/systembackupproducer -run '^TestRecoveryFence' -count=1` 退出 0。每次使用的仓库内临时 Go 缓存均在命令结束后清理；没有安装依赖或生成保留的测试二进制。该轮本地测试不包含真实 MySQL；隔离 MySQL 的后续回执见下节。

## 隔离 MySQL 专项（已收到操作者回执）

`backend/internal/systembackupevidence/d_recovery_fence_mysql_test.go` 新增 `TestDRecoveryFenceMySQL`，复用 `ProducerRecoveryOnly` 的隔离 `sbk-mig-*` namespace、每个子用例独立 `dprod_*` 数据库和组合候选 DDL。四个子用例覆盖真实 MySQL 的登记/同身份与换身份轮转/撤销、缺行与旧 CAS、并发单赢家、审计与 FinalGuard 回滚、第二次 INSERT 失败时撤销旧行的整体回滚，以及 COMMIT 已落库但确认丢失不返回授权行。工作负载管理身份和审计策略仍为显式测试替身；真实 A/C 准入不在此专项范围。

本地 `-ProducerRecoveryOnly` 门禁退出 0：恢复定向测试与默认 vet、带 MySQL 标签的 seed、Linux MySQL 探针和固定迁移 runner 编译通过；探针 SHA-256 为 `a8e9842e598e6e7306984845e28e6ce0c43568e013a17a53075ff5fafa1a872b`，组合 DDL SHA-256 为 `97abacd3f045046d01cb74211362a9a6aeada8c724c16958b48178517d5c8ff8`，runner SHA-256 为 `0de9fa2fe36acb028a5e449765bf7f1a1713005ec6afe2db03616b157e6f7fea`，脚本报告 `CLEANED local-registration-build-cache=True`。此回执的 `real_mysql=not_run` 不代表远端 PASS。

操作者在仓库根目录执行：

```powershell
& .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -Remote -SshTarget 'root@10.130.14.23'
```

操作者回传的控制台输出报告 MySQL 8.4.8、namespace `sbk-mig-261009064842-1ad7`（UID `d2673791-2c1c-4247-9046-d5ef28e87784`），94 文件的 001..080 fresh replay PASS。`TestDRecoveryFenceMySQL` 四个子用例和 `TestDHistoricalRecoveryMySQL` 两个子用例全部 PASS，合计六次专用数据库清理；最终输出含 `PASS d-producer-recovery-mysql`、`CLEANED namespace=...`、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True`，没有 `CLEANUP_PENDING`。探针、组合 DDL、迁移 runner 的 SHA-256 均与上述本地预检相同。逐项记录见[结构化回执](evidence/system-backup-d-recovery-fence-mysql-20261009.json)。仓库目前没有这次成功运行的完整原始日志；该记录依据用户粘贴的控制台输出，不补造独立退出码。

本轮首次 Windows `vet.exe` 以 `0xc0000043` 退出，同一命令自动重试后通过；SSH password 提示附近出现 closed-socket 文本，后续两套测试与清理标志仍完整报告 PASS。此前由 D 启动、在 SSH 前中止的本地编译尝试保留在[中断日志](evidence/a-d-recovery-fence-remote-20261009-142750.txt)，不算远端验收。D-only 真实 MySQL 事务检查至此关闭；工作负载管理身份、审计容量、C Stat 证明、A/C 正式签收和编号 migration 仍是独立的生产门禁。

## 后续 D-only：独立读取与管理/恢复竞争

`RecoveryFenceReader.ReadRecoveryFence` 使用单独的受信读取环境，在新事务内重新绑定精确 scope、身份摘要、请求 nonce、短预算与当前管理读取权限。L0/L1 部署前缀和 L2 管理读取授权后，才锁定精确撤销行；缺行返回显式 `Found=false`，现有行只返回身份摘要、代次、行版本和撤销状态。FinalGuard 再核对同一行及当前授权。提交不明、授权过期或 Guard 失败均不返回观察值。观察值仅描述读取时的状态，不能证明之前某个 `ChangeFence` 请求就是写入者，也不生成恢复 claim 或 provider 权限。

D 的标准库测试覆盖缺行、登记/撤销后观察、跨 scope、过期、错误请求摘要、读取权限拒绝、最终复查拒绝、缺表、行漂移与读取提交不明。新的隔离 MySQL 专项分别检查 COMMIT 确认丢失后的重新授权读取，以及同一撤销行上的管理轮转→旧代次 `ClaimRecovery`、管理撤销→旧代次 `FinishRecovery` 竞争；管理事务先锁行，恢复事务进入 L2 后被阻塞，管理提交后旧代次拒绝，原 evidence 行保持不变。测试环境中的管理认证、审计容量和 C 证明仍为替身；生产签收边界不变。

给 A/C 的审查输入：

1. A 审查独立管理读取身份、部署启用/撤销、证书/CA 轮转、L0/L1 锁序和 `RecheckRead` 的当前状态来源；缺少生产适配时入口保持不可调用。
2. C 审查历史恢复 Stat profile 与当前撤销代次的绑定；读取观察值不得转成 Stat、Range、PUT、Delete 或 Wrap 凭据。
3. A/C 共同审查候选撤销表与 producer C1 的锁序、失败关闭及新身份重用规则；签收后才考虑单独编号 migration/inventory。既有 080 与 only-080 升级入口不承载这些候选对象。

本轮本地 `-ProducerRecoveryOnly` 门禁退出 0：读取入口定向测试与默认 vet、带 MySQL 标签的 seed、Linux MySQL 探针和固定迁移 runner 编译通过。新探针 SHA-256 为 `ad63c9a2b65bf4afd4072fb2d2f096143b037357c478dd06f5b93d3c473878e1`，组合 DDL 仍为 `97abacd3f045046d01cb74211362a9a6aeada8c724c16958b48178517d5c8ff8`，runner 仍为 `0de9fa2fe36acb028a5e449765bf7f1a1713005ec6afe2db03616b157e6f7fea`；`CLEANED local-registration-build-cache=True`。该本地回执报告 `real_mysql=not_run`；远端结果见下文。

操作者随后运行上文同一 `-ProducerRecoveryOnly -Remote` 命令，回传的控制台输出报告 MySQL 8.4.8、namespace `sbk-mig-261009074618-5503`（UID `eead87dd-98b2-46da-8d7c-fcfd1083cb87`）。94 文件的 001..080 fresh replay 通过；`TestDRecoveryFenceMySQL` 四项、`TestDRecoveryFenceRecoveryRaceMySQL` 两项、`TestDRecoveryFenceReadMySQL` 一项及 `TestDHistoricalRecoveryMySQL` 两项均 PASS，合计九次专用数据库清理。最终输出含 `PASS d-producer-recovery-mysql`、namespace、远端 scratch 和本地缓存的 `CLEANED` 标记，没有 `CLEANUP_PENDING`；探针、DDL、runner 指纹均与本轮本地预检相同。逐项记录见[本轮结构化回执](evidence/system-backup-d-recovery-fence-read-race-mysql-20261009.json)。SSH 密码提示附近仍有 closed-socket 文本，但其后测试和清理结果完整；仓库没有此次完整原始日志，粘贴输出也没有独立的最终 shell 退出码。此前[六项回执](evidence/system-backup-d-recovery-fence-mysql-20261009.json)只证明当时版本；本轮九项回执覆盖新增读取和竞争测试。D-only MySQL 检查已完成，A/C 正式签收、生产适配与编号 migration 仍待独立处理。
