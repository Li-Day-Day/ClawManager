# A → B：在线 KEK、Job 使用与正式材料交接

2026-10-29，交付给已拉取 `baa175ca` 的 B。用户要求写入仓库供 B 自行拉取；本文不表示已完成正式备份整链。接口已在 `b14bf695` 接入，`baa175ca` 补上精确 registry version 拒绝。公共 C 后续 `4575b0ea` 是未准入候选解码器，不能用其输出直接获得正式密钥配置。

## 截图缺项的责任划分

| B 列出的缺项 | A 负责的部分 | 仍需其他 owner 提供 |
| --- | --- | --- |
| 正式流式 writer、冻结 capture context、真实授权材料 | 在线 KEK 和原 Job 安全构造已交付，准确调用见下文；A 继续做正式映射准入校验、用途/期限/撤销和受控凭据接入 | B 实现 writer/cmd 分支，B/C 签收读取源之前冻结的完整 context；D 提供原 task/Job/工作身份事实与装配 |
| KEK 准入映射、历史引用扫描 | A 验证独立原映射来源、用途权限、版本、期限、撤销及保留，不能由候选 JSON 自证 | C 负责业务 mapping/retained 合同、完整来源与扫描；D 负责持久化、共同 fence、原事务 Bind/Stage/最终 Recheck |
| 三用途签名 resolver | A 已提供在线 signer/credential 接口；业务 resolver 的安全接线仍须完成，不能全部归给公共 C，也不能宣称已有正式凭据 | C 给签名原字节和业务成品；B 给 capture 原事实；D 给 acceptance/catalog 原事务、资格和当前权限事实 |
| Runtime/relay、Agent 协议、B 身份/诊断的生产 caller | A 复用原执行授权、mTLS/TokenReview 和撤销边界，不接管 Runtime/Agent 实现 | D Runtime、Agent owner、B 按各自接点完成。provider 凭据撤销不能代替真实停止证明 |

## B 现在可以调用的入口

主入口为 [worker/key_use.go](../backend/internal/systembackup/worker/key_use.go) 的：

```go
worker.NewCaptureKeyJob(ctx, originalControlClient, originalInvocation, kmsConfig, permitMount)
```

它复用原控制通道与原 Job 行的 reserve/check/begin/end。不要在 B 另写一个总是成功的 `OriginalJobAuthority`，也不要直接使用 functional `Lease.DEK` 充当 provider DEK。

以下是调用骨架；`write` 是 B 需要接入的正式流式写入回调，并非仓库中虚构的 writer API：

```go
func captureWithProviderKey(
    ctx context.Context,
    client *worker.ControlClient,
    invocation worker.Invocation,
    config systembackupkms.Config,
    permit systembackupkms.PermitMount,
    write func(context.Context, []byte) error,
) (systembackupwire.WrappedKey, error) {
    job, err := worker.NewCaptureKeyJob(ctx, client, invocation, config, permit)
    if err != nil {
        return systembackupwire.WrappedKey{}, err
    }
    defer job.Close()
    return job.WithDEK(ctx, write)
}
```

B 的调用顺序与约束：

1. 在读取源前，B/C 冻结完整 `KeyRequest`，由原计划/加密日记保存 `Invocation.ProviderKey`（`kms.Access`）。安装、task、attempt、phase、part、part_index、envelope_id、capture_context_hash 与原 invocation 一一匹配；不能把 functional staging 的 config hash 改名为 capture context。
2. `kms.Config` 必须来自已准入的安装/key/provider/CA/版本及有效窗口；`PermitMount` 的 permit SHA 和签名公钥必须独立固定。示例中的 `REPLACE_WITH_*` 不是可运行材料。
3. 原 mTLS control client 在真实 Job 内 reserve 成功后，构造才可继续。未知 reserve 结果不换 nonce 重试。正式 planned key 引用还须由 D 接入历史引用索引，并在任何 provider 调用前持久保留；该新 registry 接线目前未完成。
4. `WithDEK` 在原使用窗口中同步调用 `write(ctx, borrowedDEK)`。回调使用收到的有界 context、写入未发布的 C framing 数据，不缓存/复制到后台任务、不把 DEK 放入 DTO、日志或返回值。回调返回后 A 擦除自有明文缓冲区。
5. 只有回调、key-end 和末次授权检查全部成功后，才能使用返回的 `WrappedKey` 继续 C envelope/发布流程。错误或结果未知时，未发布输出不可验收；同一个 CaptureJob/envelope 不重复 Generate。新的尝试必须由原任务授权/日记流程安排，不能由 worker 自行换身份续跑。

`finished` 仅是回调状态，不是业务成功、Pod 已停止或撤销完成。D 的 `Revoke` 阻止后续使用；已交付到进程内的 DEK 依靠原 deadline 和真实 StopJob/Stopped 证明收束。不要让 writer 在返回错误后继续异步写出。

当前 worker key-use 通道有意只接纳 capture/generate，拒绝 functional acquire/complete 与 unwrap。独立恢复入口在 [kms/job.go](../backend/internal/systembackupkms/job.go)：`NewRecoveryJob(ctx, config, permit, originalRecoveryAuthority, expectedRequest)`，使用当前独立恢复授权和完整 retained mapping/request。不能将 cleanup recovery grant 或过期 forward grant 作为历史 restore unwrap 授权；不能为了接线删除 capture-only 检查。恢复的 worker 生产调用仍待原恢复业务来源和 D 装配。

## Task key、签名与 public C

- `PinnedExecutionIdentity.DeriveTaskCaptureKey` 仍是原授权下的 functional staging 派生接点，见 [execution_identity.go](../backend/internal/systembackupcontroller/execution_identity.go)。原 task key/加密日记继续复用；该结果不冒充正式 backup KEK 生成的随机 DEK。
- 在线签名入口为 [transit_signing_credentials.go](../backend/internal/systembackupsecurity/transit_signing_credentials.go) 的 `NewCredentialTransitSigner` 与 `TransitSigningCredentials.ResolveSigning`。三个用途为 `capture_certificate`、`acceptance_record`、`catalog_record`；各自固定 key、opaque registry version 与独立 provider numeric version。
- 签名原字节是 C 定义的 ASCII `base64url_no_pad(JCS(header))+"."+base64url_no_pad(JCS(unsigned_payload))`。不新增 prefix/prehash；resolver 的 input SHA 仅用于绑定授权。C 合同、AAD 与向量见 [C crypto contract](system-backup-c-crypto-contract-20261029.md)。
- `ResolveSigning` 的生产原业务事实接线仍缺，不能仅凭调用者传入 purpose/hash 放行。B 交 capture 原 task/attempt/fence、冻结 context、Job/检查点/staging 集与完成时限；D/C 交 acceptance/catalog 事实。A 据此补安全 resolver。

## 已有现场材料：直接复用，不重采

| 公开证据 | 已证明的范围 |
| --- | --- |
| [JWT trust readback](evidence/a-site-kek-jwt-trust-readback-20261029.json) | OpenBao JWT mount/config 存在且读回通过；固定完整 readback SHA。未创建本轮用途 role 或工作凭据 |
| [backup KEK profile](evidence/a-site-backup-kek-profile-20261029.json) | 观测的 backup key provider version 1 存在；derived AES-GCM/HKDF，禁导出/明文备份/删除；profile 匹配且临时 Pod 已清理 |
| [签名候选 key](evidence/a-site-signing-key-candidates-20261028.json) | 候选 Ed25519 公钥/版本元数据；不是本轮三用途已准入授权 |
| [部署组合示例](../examples/backup-controller/online-kek-job.example.json) | endpoint、CA pin、trust readback pin、挂载路径和待补字段的结构参考；明确 example_only，不是 grant 或 DeploymentConfig 输入 |

OpenBao 版本已由操作者确认 `v2.6.2`。namespace、CA、Bao Pod、安装与候选 key 的昨日采集继续复用。profile/trust 成功不等于 registry admission、实际 datakey/decrypt、当前 task 授权或历史恢复通过。

正式仍缺的材料/代码，按责任交付：

| Owner | 交付项 | 禁止替代方式 |
| --- | --- | --- |
| A + D/部署 owner | 经独立原来源认证的 KEK identity_hash、opaque registry_version、provider_key_id/name/version、CA source、两用途 ref 关系、期限/撤销；原事务准入读回 | 不从 key 名、profile hash 或 config pin 推造首次映射；当前仅有合同/候选，不把未提交 registry 类型当已装配 |
| B + D | 原 frozen `KeyRequest`、invocation SHA、execution grant SHA、Job/Pod/SA UID、原窗口及 writer/cmd 调用位置 | 不自报 UID，不用测试 authority、旧 Lease.DEK 或任意 context hash |
| A + 部署 owner，D 校验 Job projection | 精确用途 policy/role 读回、受控 provider permit、独立 SHA/公钥 pin；原 Pod 的 JWT projection | capture audience 为 `clawmanager-backup-kek-generate`，recovery 为 `clawmanager-backup-kek-unwrap`；不替换原 worker control audience，不给 capture 同时授予 unwrap |
| A + C/D/B | 三用途签名来源、精确 key/version、公钥历史、当前原业务授权 resolver | public C synthetic 向量不是生产签名材料 |
| C/D/恢复 owner，A 检查 | 完整历史 mapping/CA/expected request/envelope、四类引用与 adoption/fence、当前独立 recovery grant | 历史 key 存在不能证明当前可读；新空索引不能证明旧历史为空 |

凭据只通过受控挂载/resolver 注入；token、JWT、DEK、私钥、Secret.data、正式 grant 正文不入 Git，也不要求 B 在聊天粘贴。工具和参数说明见 [A 在线 KEK 交接](system-backup-a-online-kek-20261029.md)。本轮用途 role/policy 尚未下发，不能重跑旧 trust apply 代替它们。

## B 拉取后的核对与验证边界

1. 保留 B 本地未提交代码，使用原统一分支的正常集成流程；不要覆盖 B writer。`baa175ca` 已含 A 当前修复，本文是接口/责任交接，不是又一套执行链。
2. migration 125 的 `key_use_json` 需由 D 沿完整部署迁移路径装配，尚无本现场执行回执；不要直接跳过未部署迁移去单独执行 125。D 新 KEK registry 存储/锁协议正在开发，见 [D 交接](system-backup-d-kek-persistence-locks-20261029.md)（若本地尚未拉到该文件，应等待其提交）。
3. 本地 A KMS 全包在 `baa175ca` 修复源码上通过（18.117s）；新增别名负例先复现旧代码漏洞，合法不透明版本、错用途/安装/key/version、到期/撤销及独立 recovery 回归保留。测试用本地 TLS、synthetic token/key/authority，不是现场授权验收。
4. B 所述精确依赖缺失是其构建环境的独立阻塞，不能沿用 A 机器的通过结论。请在 B 交接中列明准确 package/module/version、GOOS/GOARCH、Go 版本和失败命令；A 可据此核对自己引入的依赖。不要为测试擅自降级版本、改 go.mod/go.sum 或安装替代包。
5. Go 依赖齐备后可按变更范围运行 `go test -mod=readonly -p=2 -count=1 -timeout=180s ./internal/systembackupkms ./internal/systembackup/worker`（在 backend 下）。使用隔离测试目录，结束后删除本轮构建/测试产物；不得删除别人的活动缓存。生产 SQL 并发撤销、真实进程停止、正式 generate/unwrap 和最终产物仍须单独联调。

A 下一项代码是原 KEK 准入 validator，消费 C 未准入候选和 D 已锁事实，固定独立映射来源、用途、最短期限及完整历史保留。该项尚未交付为生产实现；不会要求 B 用临时恒成功 resolver 把整链“跑通”。
