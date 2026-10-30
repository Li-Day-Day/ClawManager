# D → B：生产数据库 caller 的恢复模式

承接 b0a1015f。本轮发现生产命令 `runConfiguredPublic` 在进入服务构造前，仍对数据库连接无条件执行 capture/runtime 完整权限 probe，令上一轮服务内部的 recovery-only 分支无法覆盖实际入口。

入口现在调用 `CheckDeploymentDatabase`，从原 SHA 固定部署配置、原独立签名恢复 grant、原 key 文件和实际 SQL 账号/数据库身份进行准入。它与 `NewDeploymentService` 复用 `loadDeploymentIdentities`；服务构造仍重新验证，不以早期检查代替运行时授权。恢复 grant 必须只有 recover 用途，并匹配部署配置 SHA、installation 和 controller owner。forward 有效且启用时，保留完整 capture/runtime grant probe。

forward 缺失、失效、用途不匹配或显式关闭时，内部 Forward 指针归到 Recovery，避免继续借用旧 forward 的 profile、issuer 或 record key 元数据。恢复模式仍要求部署配置明确固定 issuer 证书摘要；不从失效 forward 推导信任。原 SQLRecoveryAuthority、RuntimeBaseReady、冻结日记和任务级恢复检查不变，没有新权限签发、迁移或业务写入。

生产健康状态使用实际 ForwardEnabled。`/readyz` 的 200 仍表示健康控制器可以运行恢复，不是采集准入；恢复模式明确显示 `config=disabled effective=disabled`。standby/dependency failure 仍拒绝就绪。正式采集资格仍以原 SQL readiness 与任务授权为准，未扩大 acceptance。

验证使用真实 Ed25519 签名、原 PinnedExecutionIdentity 和隔离 SQL driver，覆盖缺失/过期 forward 降级、残留错配配置/profile 不被保留、有效 forward 必须检查 capture 权限，以及过期恢复 grant、错误账号、配置、用途、record key 和签名的拒绝。HTTP handler 回归覆盖 enabled→disabled 状态和 standby。仍未执行完整 Linux NewDeploymentService + Kubernetes + MySQL 的部署验收，未证明真实仅恢复账号完成恢复。

命令：`go test -p 8 ./internal/systembackupexecution ./cmd/system-backup-v2-controller -run 'TestDeploymentDatabaseAdmission|TestDeploymentRecovery|TestPublicRecoveryHealth' -count=1`。测试使用已有共享 Go 缓存，本轮临时编译/测试目录为 `backend/.tmp-db-admission`，结束后删除，不清理其他窗口的缓存或产物。

最终版本验证退出 0：execution 12.603s，controller command 12.959s；默认 vet 启用。测试临时目录已删除。此前仅 execution 身份用例的早期运行不能代替本次包含健康响应的最终回归。
