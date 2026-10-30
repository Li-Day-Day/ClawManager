# A：执行密钥、KEK 与三用途签名集成复审

2026-10-30；复审基线 `1b51175e`，包含 A 的 `8c1acdcc`。本结论来自当前生产源码的调用搜索与接口核对；既有本地 fixture 测试不等于现场调用回执。

## 已接入的原链路

- 生产 controller `cmd/system-backup-v2-controller/public_capture.go` 调用 `NewDeploymentService`，后者组合原 `NewPublicCapture`。forward、独立 recovery、worker mTLS/TokenReview、加密执行日记与 functional task key 仍走该链路，不建立第二套执行授权。
- `PublicJobOwner.Authorize` 的 functional `acquire/complete` 在原 Job 行锁内派生 staging key，原事务提交为准入顺序点；已准入 worker 的停止仍需 `StopJob/Stopped` 证明。该 key 不是正式 backup KEK。
- `systembackupsecurity` 的 bootstrap/config mutation 原事务已调用 `stageBootstrapKEK`；D 的 registry Store 可保存精确 binding、用途/版本、撤销和历史引用事实，A 的 `PreparedAdmission.Recheck` 要求独立 mapping、两用途 capability 与完整 coverage。
- 公共 C 的原签名输入与 envelope 合同已有固定向量。A 的 `NewOriginalSigningResolver` 和 `NewJWTSigningTokenSource` 可构造三用途独立的短期凭据，并复用 `NewCredentialTransitSigner`，不改变签名原字节。

## 尚未接通的生产接点

| Owner | 当前源码事实 | 必须交付的接线与可验证回执 |
| --- | --- | --- |
| C/D 原 KEK 来源 | `BootstrapAdmissionSource.BootstrapAdmissionInput`、`MutationAdmissionSource.MutationAdmissionInput` 只有接口；`BootstrapComposition`、`MutationComposition` 只有构造实现，未发现生产 caller。`Bound.CompleteScan` 恒返回 `ErrKEKCoverage`。 | 从原注册/配置记录独立读取完整 mapping 与两用途能力；在同一 KEK fence 下完成 retained、inflight/unknown、hold/catalog、restore/prune 四分区历史回填和 writer 钩子，再把 composition 注入原 bootstrap/config mutation caller。提交后读回精确安装、identity/opaque registry version、provider numeric version、原 ref 字节与 SHA、撤销和引用。禁止把候选 JSON 或现有配置自身当独立来源。 |
| B capture | `worker.NewCaptureKeyJob` 在生产源码中尚无调用；它要求原 `Invocation.ProviderKey`、`systembackupkms.Config`、受控 `PermitMount`。 | 从最终 writer 的冻结 C `KeyBinding`、`KeyContext`、part/part_index、原 task/attempt、invocation SHA 与原 Job/Pod/SA 身份构造，不接受请求自报；接原 mTLS 控制的 reserve/begin/end，在实际 provider generate 前后复查。提交源码符号、镜像 digest 与合法/错用途/跨安装/错版本/撤销回执。 |
| B/D/C 签名 | `NewOriginalSigningResolver` 仅在测试中实例化；三个 `OriginalSigningAuthority.AuthorizeSigning` 原业务 reader 和生产 signer caller 均未发现。 | B 从冻结 capture 正文和完成证据调用 `capture_certificate`；D 在原发布事务事实下调用 `acceptance_record`；C/D 从不可变 catalog action/引用调用 `catalog_record`。各自重建 C 的原始 signing input 并比对 SHA，认证当前用途、安装、key/version、工作身份、期限及撤销；从独立历史 reader 取公钥，配置三个独立 JWT role/policy 和当前 source Recheck。 |
| D/B 运行与撤销 | functional staging key 的本地授权顺序已收紧；真实并发行为未测。 | 用包含本提交的新镜像验证原 Job 行锁与并发 Revoke 的顺序，以及已准入调用的 `StopJob/Stopped` 证明。forward 关闭时独立 recovery 必须仍可按旧 ref/version 读取历史日记；不能借失效 forward 恢复。 |

生产 readiness 目前仍明确拒绝 acceptance：`deployment_service.go` 的 `system_backup_v2_execution_readiness` 写入和 `deployment_platform.go` 的 profile 都将 `acceptance_ready` 固定为 `FALSE`。当前生产构造路径也没有给 `worker.Invocation.ProviderKey` 赋值；`NewCaptureKeyJob` 仅存在于定义和测试。B/D 必须提交原冻结 writer、ProviderKey 来源及 acceptance 发布接线，读回 readiness 和原 Job/SQL 记录后，才能开始正式 capture/acceptance 的现场验收。现有 OpenBao trust/key profile 回执不能替代此接线。

### recovery-only 启动复审发现（待 D 修正）

`NewDeploymentService` 在 forward grant 缺失/失效时会令 `Forward=Recovery` 且关闭 forward，但随后无条件调用 `checkControlGrants`。该 probe 以 `Forward.DeploymentBinding()` 的数据库账号核对完整 capture/runtime-control 表权限；恢复账号若仅有恢复权限，服务可能在原 recovery authority 有效时仍启动失败。D 当前负责的 `deployment_service.go` 有在途修改，A 已交其共享文件 owner 处理，未覆盖。验收应证明：缺失或撤销 forward grant 时，精确恢复账号可建立 recovery-only 服务、不能公布 forward readiness 或签发 worker；恢复仍使用独立签名 grant 与当前任务/历史 ref 检查，缺恢复必要权限则拒绝。不能通过给恢复账号补全 capture 权限来掩盖此问题。

## 材料与测试口径

复用已固定的 OpenBao v2.6.2、JWT trust readback SHA `595ab8034b889490a055b56094ffdd1d71ace5a188d10fa77eab19d3deb89244`、backup KEK v1 profile SHA `fd5c182837152d128d00ece72520a90baa924d07cc76311f151f4f2ab05d4e9f`。这些公开回执证明配置/属性，不证明 role、policy、permit、任务授权或真实 generate/unwrap；不重复昨日采集。

现场正式材料尚需：原 mapping/coverage 来源及 SQL 读回、B 冻结任务上下文和最终 writer、三个签名用途的原业务 reader、受控 provider role/policy/permit/JWT 引用、新部署镜像摘要、历史 ref/version 与当前独立 recovery grant。凭据、JWT、私钥和 DEK 只走受控挂载，不进 Git。没有这些材料时，生产 caller 应继续拒绝；本地测试只报告合成材料的结果。
