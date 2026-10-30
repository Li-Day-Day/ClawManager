# A：三用途签名 resolver 与短期凭据接线

2026-10-29。复用现有 `CredentialTransitSigner` 的原始 C 签名输入与 provider 验签；本增量不改变 payload、JCS、domain、Ed25519 key/version 或历史验签格式。

## 已实现的组合

`NewOriginalSigningResolver(history, bindings, original, tokens)` 固定同一安装的 `capture_certificate`、`acceptance_record`、`catalog_record` 三个独立当前 binding。`history` 必须含三用途独立公钥；resolver 拒绝同一 provider key 被跨用途复用、错误 opaque/provider version、撤销的当前公钥和非精确 HTTPS endpoint。每次 `ResolveSigning` 先检查完整 binding 与签名输入 SHA-256，再从 `OriginalSigningAuthority` 取得当前原业务 use，最后从独立 `SigningTokenSource` 取一次短期凭据。原 use 和凭据在返回前复查；现有 signer 在真实 provider RPC 前后继续复查，并清零所拥有的 token buffer。

`NewJWTSigningTokenSource` 是可构造的 provider 凭据来源：每用途独立的 role、policy、投影 JWT 文件和精确 signing key。它用固定 CA/HTTPS 逐次向已审 JWT mount 登录，要求 batch、不可续租、1–20 秒、单一准确 policy、无 identity policy；provider 登录回执的 role/namespace/Pod UID/SA UID 必须与**原 authority**的 workload 身份相等。它不本地解码 JWT 当认证；投影文件在签名期间被替换或移除时 Recheck 拒绝。三个 signer 分别使用已有 `NewCredentialTransitSigner`，不共享 token 或可调用的 key 对象。

## 原业务 reader/caller（仍需 B/C/D 接入）

`OriginalSigningAuthority.AuthorizeSigning(ctx, TransitSigningRequest)` 是生产必须实现的接点，返回 `OriginalSigningUse` 和同一来源的 `Recheck`。它不能凭请求中的 purpose、key 或 SHA 自行放行，须从原受控事实重建 C unsigned payload 的完整签名输入字节并比较 SHA，校验当前调用身份、资源、权限、版本、期限和撤销：

| 用途 | 原事实来源与生产 caller |
| --- | --- |
| `capture_certificate` | B 的冻结 capture context、原 task/attempt/fence、最终 Job/checkpoint/staging 集和完成时间；D 的原 Job/Pod/SA、执行授权及停止屏障。B 最终 writer 在原 Job 内调用 capture 专用 signer。 |
| `acceptance_record` | D 原发布事务内的 manifest/marker/checksum、同 attempt 清理证据、资格判断/config version 与当前发布许可；由 D acceptance 发布 caller 调用专用 signer。 |
| `catalog_record` | C 的 registration/append 或 tombstone/prune 原记录、有效 acceptance 与不可变 artifact 引用、action identity 和冲突判等；D 的原发布/删除事务 caller 调用专用 signer。 |

原 signer key-history reader 还须认证三用途分别的 registry opaque version → provider numeric version/公钥映射、当前撤销与完整历史引用；轮换时调用 `ValidateArtifactSigningRetention`，不能用测试向量的 key/version 代替。当前仓库仍没有上述三个原业务 `OriginalSigningAuthority` 的生产实现，也没有已准入三用途 key/role/policy 读回，所以 resolver 构造与本地测试不是生产签名成功回执。

## KEK provider 用途与现场前置

KEK generate/unwrap 的精确 policy/role 工具仍为 `scripts/system-backup-a-apply-kek-policy.py`。它要求 C 冻结 request 的 review-only plan、独立审核 SHA、D 已提交的准确 mapping、原 Job 身份及固定的 JWT trust readback SHA；默认只校验材料，显式 `--apply` 才下发，`--revoke` 分用途删除并读回。已通过的 JWT trust 与 KEK profile 回执继续复用，不重新做全量盘点。B 尚未交付冻结 `systembackupkms.Access` 的完整 `KeyBinding`、`KeyContext`、`operation`、endpoint/key_name、原 invocation SHA、execution grant SHA、Job/Pod/SA UID、provider JWT projection 与最终 writer 调用，因此当前不能生成真实 exact-context plan 或签署 permit。

接收入口是 `worker.Invocation.ProviderKey` → `worker.NewCaptureKeyJob`（原 mTLS 控制、reserve/begin/end）和 `systembackupkms.PermitMount`（经原 issuer 签名的完整 `ProviderPermit`）。permit 必须固定同一个 `Access` 的 context base64、operation、Pod/SA/Job 身份、原 grant/调用摘要、role/policy/JWT 文件、最短期限；不能由 A 工具自行签出新的任务授权。D 的 KEK Store 完整 coverage/首登提交读回和原 source reader 尚未完成时，任何 policy/role 应停留在准备态。

现场命令将在真实 plan SHA、Job identity SHA、JWT mount、role/policy 和受控文件路径确定后给出。执行顺序是独立审查 plan → exact policy/role 下发读回 → 原 Job permit/凭据装配 → 小范围 generate/unwrap → 错用途、错版本、错 context 拒绝 → 单用途撤销读回及原 worker 停止证明。不能用旧 synthetic spike 的成功代替这些回执。

## 本地验证（2026-10-30）

`go vet -p 1 ./internal/systembackupsecurity` 退出码 0；`go test -p 1 -run '^Test(OriginalSigningResolver|SigningJWT)' ./internal/systembackupsecurity` 退出码 0。KEK policy/role 工具的 11 个 Python 测试与 C plan builder 的 18 个 Node 测试均为 0。A 专用 Go 缓存及临时构建目录已删除。以上仅覆盖本地构造、拒绝和计划校验；没有生产 original signing authority、已准入三用途 signer key/role、现场 generate/unwrap 或撤销读回。

后续 A 增量：KEK policy 编译前按 Go KMS 同一固定 registry version 规则拒绝 `latest`、`current`、`default`、空白和路径字符。新增回归将 KeyBinding 摘要、context base64、generate/unwrap ACL 的 context 一并重算后仍要求拒绝，避免靠旧 hash 不匹配掩盖可变别名。`py -3 -B scripts/system-backup-a-apply-kek-policy.test.py` 共 12 项退出 0；这是本地计划/策略检查，未下发现场 policy 或完成真实 generate/unwrap。
