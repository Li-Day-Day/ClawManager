# A provider-proof 验签与 inline 登记组件

本轮把原先仅有 envelope 校验和 verifier 接口的实现补为：严格请求解码、实际 Ed25519 验签、可信快照绑定、不可变 inline evidence 准备，以及使用调用者事务的真实 SQL INSERT。代码位于 `backend/internal/systembackupsecurity/`。签名 profile 与跨 owner 接线仍为 draft，未开启 Admin 路由、未注册真实 provider evidence、未改变任何远程配置。

本地最终验证：36 个 Go 顶层测试（含未修改的 D 验收探针）和 9 个 Node 测试通过，无依赖安装，隔离测试目录已清理。源码指纹与边界见 [机器验收记录](evidence/system-backup-a-provider-proof-adapter-local-20260924.json)。

## 已实现的调用链

1. `DecodeProviderProofRegistration`：原始 JSON 最多 16 KiB；拒绝未知/缺失/重复字段、尾随 JSON、非法 UTF-8 和孤立 UTF-16 surrogate escape。正常成对 emoji 可接受。这个解码函数不完成权限或密码学验证。
2. `ProviderProofRequestSHA256`：对有界、规范化请求计算 SHA-256，含 idempotency key、expected row version 和完整 proof。D 可先查已提交的相同请求，而不因为 proof 随后过期就破坏幂等重试。仅有 digest 不能授权登记；不同 body 必须由 D 返回 idempotency conflict。
3. `PrepareProviderProofEvidence`：使用事务内数据库时间、锁定的 issuer registry 与目标快照，验证最大有效期、issuer/key/purpose/version、Ed25519 签名、安装/audience/目标/全部 proof 字段，以及目标的可信 identity/location/action/UID/version/checksum/length/state。缺少可信期望不能用请求字段填充。输出是不可由包外构造的 prepared value，既不表示已经登记，也不改变目标结论。
4. `StageProviderProofEvidence`：只接受非零 prepared value、服务端生成的 `sev_` ID 和调用者已有 `*sql.Tx`。对三种目标使用固定表名、参数化 installation/public ID 查行并 `FOR UPDATE`，再次核对 row version；INSERT 中以 `UTC_TIMESTAMP(6)` 检查 proof 时间窗口。该函数不自行 commit，也不写 target state。

SQL 与 migration 065 对齐：`storage_state=inline`、`media_type=application/json`、`encryption=none`、classification=`internal`，内容是完整 canonical `{payload,signature}` 对象，最多 8192 字节，保存其 SHA-256 和字节数。不会调用 KMS、外置 store 或网络，不制造未登记外置对象。

对于 external-action 的 presence proof，如果 provider 分配的版本号尚未写入本地，可信 binding 可以明确设置 `AllowAttestedObservedVersion=true`；该策略只允许在本地期望版本为 null 时接受签名认证后的非空 observed version，位置/action key/checksum/长度及其他字段仍须精确匹配。客户端不能提交这个开关；已有版本、absence 或 ownership 不可使用此例外。

Evidence 的 `expires_at` 使用服务端 retention 截止时间，不能把短 proof 有效期误当成审计保留期；proof 的有效期保留在签名内容中，后续使用者仍须按使用时刻重新判断。目标类型映射分别为 `provider_presence_proof`、`provider_absence_proof`、`ownership_proof`。

## Ed25519 profile（待 A/C/D 复审）

`signed_proof_base64` 是 canonical JSON `{payload,signature}` 的 canonical padded base64。接收端既校验整个对象的精确规范字节，也校验签名覆盖范围；不能只接受一个布尔验证结果。

`payload` 包含 `installation_id`、`audience`、`target` 和 `proof`。内部 `proof` 含外层 proof 的全部字段，唯独排除 `signed_proof_base64`，避免循环签名。`target` 包含 type/public ID。安装和 audience 来自服务端配置，不能由请求选择。

`signature` 使用既有 `ProofSignature` 形状；固定 `format=jws`、`algorithm=EdDSA`、domain separator=`clawmanager.system-backup.provider-proof.v1`。protected header 的精确字段为 `alg`、`key_version`、`kid`、`purpose=provider_proof_issuer`、`typ=domain separator`。签名输入为 `base64url(canonical header) + "." + base64url(canonical payload)`；签名、protected header 使用无 padding 的 canonical base64url。

这是固定 ASCII 字段名、字符串/null 和非负安全整数的受限 JCS profile，不是通用 JSON canonicalizer。`content_length` 和规范化请求中的 `expected_row_version` 不接受超过 `2^53-1` 的数值，避免 Node/Go 表示差异。请求传输上限和规范化后的请求上限均为 16 KiB。

服务端提供 issuer/key ID/version 精确绑定的公钥条目，以及 key purpose、NotBefore/NotAfter、revoked 标志和允许的 target/proof types。构造 verifier 时复制公钥及范围切片；没有 latest 回退或从请求下载 JWK 的路径。历史 key 只有在仍受信、未撤销且时间覆盖 proof 时可用。签名错误返回 `signature_invalid`；已验签数据与 envelope/可信快照不一致返回 `checksum_mismatch`；issuer/expiry/profile 不合法返回 `validation_failed`；目标 row 漂移返回 `version_conflict`。数据库故障返回不带原因链的 `ErrProviderEvidenceStorage`，由 API 映射内部错误，不能当作无效 proof。

## D 的事务接线要求

这不是已启用的 HTTP handler。D 必须在已有同步 `provider_proof_register` operation 中完成以下步骤，所有可提交状态共享同一数据库事务：

1. 认证、目标可见性、`system_backup.destructive` 和近期强认证；按现有锁顺序锁定 config/issuer registry、目标及 nonce/idempotency 相关状态。A 的解码/context 类型不得直接绑定 Admin 提交的“可信配置”。
2. 计算请求 digest，使用现有 actor/endpoint/安装作用域的幂等记录查重。相同已完成请求返回原 operation/evidence；同 key 不同 digest 返回冲突。认证与访问权限仍须重查。
3. 读取数据库时间和可信目标映射，构造 `ProviderProofRegistrationContext`；其 registry version/hash 必须由 D 对实际已解析 key snapshot 认证并锁定。A 只检查该字段格式，不负责从持久配置加载 registry，也不能把字符串 hash 存在当作已验证快照。
4. 调用 Prepare；使用服务端生成的 evidence ID 调用 Stage；在同一事务写 operation 成功/result evidence ID、nonce 消费、audit intent/result、容量/retention 记录，然后 commit。任何错误由事务 owner 按已有失败/审计策略处理；不得提交部分成功写入。
5. Commit 后才返回 201。Prepared/Stage 成功均不得提前返回“已登记”。Proof registration 不修改 `confirmed_present/confirmed_absent` 或 resource lifecycle；后续 resolution 单独使用登记的证据。

Stage 的二次 row-version 锁用于防止读取后漂移，不代替步骤 1–3 的可信字段映射与锁定。包内没有另建 nonce ledger、幂等表或审计协议。证据重复登记/并发重放的原子性依赖 D 接线；本轮只验证稳定 digest 与 body 冲突可区分，不声称完整 Admin replay 链路已验收。

## 验证与实际边界

新增测试用真实 Ed25519 合成签名验证三种 Node/Go 固定样例（普通、中文/emoji、整数边界）、请求字段篡改、错误安装/audience/issuer/purpose/version、撤销/到期、历史 key、可信 metadata 不一致、8 KiB/16 KiB 边界、重复字段及非法 Unicode。SQL 测试使用标准库 driver 驱动真实 `database/sql` 事务接口，检查参数、row drift、最终过期拒绝、错误脱敏、由调用者提交和失败回滚；未连接 MySQL。

本机复现：

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    & .\scripts\system-backup-a-provider-proof-validation.ps1
    node .\scripts\system-backup-a-provider-proof-signature.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Provider-proof 固定签名向量验证失败' }
    node .\scripts\system-backup-a-security.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'A 合同安全回归失败' }
}
```

Runner 使用已有 Go，关闭代理/下载，只在本轮专属目录编译，finally 清理源副本、cache 和临时产物。固定 synthetic 公钥/签名向量是交付 fixture，不是测试缓存；没有保存真实私钥或 provider 凭据。

尚未完成：D HTTP/事务接线和真实 MySQL 并发/重放/commit 失败测试、C/D 对该 wire profile 的复审、真实 `provider_proof_issuer` 公钥与 registry 交接。先前 lab 的三类 capture/acceptance/catalog signer 不能代替 provider-proof issuer；旧 lifecycle 历史证据也不能转换为新 issuer 签名证明。当前 active config 仍无已验证可用记录，因此本轮没有远程命令或部署动作。真实接线与输入就绪后再提供绑定具体环境的完整远程测试命令。

这些组件不覆盖完整 Evidence 外置存储、Range 下载、envelope 加密、GC 或源集群外恢复，整体 capability 与正式 evidence 登记仍保持未完成。
