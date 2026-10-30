# D → B 源清单事务身份接入

本次交付只补公共 Linux source discovery 的生产身份接点，不代表完整六域、模块成品或现场停止/恢复验收完成。

原 D `checkSource` 在启动/readiness 使用连接池查询；B 的 `LinuxProfile.inventory` 另开只读 RR 事务。此前检查数据库名和 server UUID，但没有在实际读取连接上复用 D 的账号、角色和权限检查。

现在 `LinuxProfileConfig.VerifySource(ctx, tx)` 在清单读取前和读取结束后调用。D 的 `platformProfile` 注入原 `checkSourceIdentity`，使用传入事务检查 CURRENT_USER、CURRENT_ROLE、DATABASE、server UUID 和 SHOW GRANTS。Runtime profile 在原 platform profile 上组合 writers，保留同一回调。启动/readiness 继续使用原检查。认证失败不返回清单，事务由 B rollback；回调不得 commit/rollback，也不签发新权限。

该回调在通用 B 构造中保持可选以兼容已有低层调用；D 生产构造明确注入。恢复路径继续只读冻结计划，不因源账号失效而重新发现或要求新的 forward 权限。MySQL 的权限查询不是 A 的任务授权快照，也不能代替原 Gate、任务授权或来源 writer proof。

A 同步指出 recovery-only 启动仍检查完整 capture grants。现按运行模式分支：两种模式均先复查独立 Recovery 的签名、期限、SQL 账号/数据库身份和 record keys；仅 forward 模式执行完整 capture/runtime grant probe。恢复操作仍由原 SQLRecoveryAuthority 和数据库自身权限约束，未新增恢复权限清单或赋权工具。模式回归覆盖恢复身份撤销、仅恢复权限及 forward 缺 capture 权限；不把该单元测试当作真实恢复账号部署成功。

模式测试使用 closure 模型，仅证明分支调用和错误传播；未覆盖 NewDeploymentService 的完整缺失/失效 forward grant 降级构造、PublishReadiness 禁止 forward 的组合流程，以及真实 MySQL 仅恢复账号的恢复操作。这三项仍需部署集成验收。

回归入口：`go test -p 2 ./internal/systembackup/publicadapter ./internal/systembackupexecution -run 'TestLinux|TestDeployment|TestSourceGrant' -count=1`。新增 SQL driver 测试覆盖同一事务、认证先于源读取、完整读取后复查、两阶段拒绝均不泄露清单、只读回滚。模型测试不等于现场 MySQL 授权及 Kubernetes 验收。

实际验证：默认缓存写权限失败；改用独立缓存，首次低并发构建中断后以 `-p 8` 跑最终版本。publicadapter 通过（4.278s）；execution 的既有 `TestDeploymentPassesRetainOwnerAfterTaskFailure` 在 1 秒 deadline 下耗时 1.41 秒失败。未修改该测试或生产调度逻辑，编译结束后以 `-p 2` 重跑 execution 的 `TestDeployment|TestSourceGrant`，通过（14.069s）。保留首轮失败，不将其描述成一次全部通过。两次均保留 Go 默认 vet。
