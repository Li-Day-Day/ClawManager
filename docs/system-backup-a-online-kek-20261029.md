# A 在线 backup KEK 与 Job 使用边界交接

2026-10-29；沿用 `102928ff` 的原执行授权，复用公共 C `a7424ce18eb616886f1087159fc8c8d2ae138770` 的 `public-c-crypto.v1`。本次是在线组件和本地验证，尚无现场正式调用或完整生产装配成功回执。用户已授权完成后提交并推送远程；不会将阶段测试替代整体完成。

## 已实现的调用入口

`backend/internal/systembackupkms` 直接实现 C 的 `Generator` / `Unwrapper`，没有更改 C 原合同或新建执行授权表。

| 入口 | 作用及限制 |
| --- | --- |
| `NewCaptureGenerator` | HTTPS `transit/datakey/plaintext/<exact-key>`，显式 bits 字符串 `256`、provider version 字符串；检查响应 numeric version 与 ciphertext prefix。 |
| `NewRecoveryUnwrapper` | HTTPS `transit/decrypt/<exact-key>`；完整 wrapped request 必须等于独立可信 expectedRequest，不从 envelope 自报字段建立授权。 |
| `TransitContext` | C 全部上下文 + `SHA256(JCS(full KEK binding))` 的 JCS/base64，与 policy compiler 相同。 |
| `NewPinnedJobResolver` / `NewJobResolver` | 独立 pin 的 Ed25519 provider permit、完整 context/operation、原 Job/Pod/SA UID、invocation SHA、已有 execution grant SHA；后者可用固定 TLS provider 交换 projected JWT。 |
| `NewCaptureJob` / `NewRecoveryJob` | 给 B 的 Job 进程内构造，冻结 request；调用者只传同步 `WithDEK` 回调，返回不含明文 DEK。 |

capture 与 recovery 是不同具体类型，不能由 capture 对象断言出 unwrap。endpoint、安装、完整 key binding、CA 原 PEM SHA、当前 mapping 有效窗口来自可信配置。禁止 latest、默认版本、generate→encrypt 和 Secret fallback。provider-native ciphertext 只接纳已审 derived AES256GCM profile：nonce12 + DEK32 + tag16，共 60 字节。

permit 只增加 provider 用途限制，不能单独授权执行，始终还需原 `OriginalJobAuthority`。permit/凭据文件移除、替换、错 pin、过期、换原授权均拒绝；没有 env 默认 token。静态 token permit 最长 20 秒；JWT permit 最长 24 小时且不超过原 Job 和 mapping 截止时间。JWT 换出的 batch token 最长 20 秒、不可续租、单一用途 policy，逐次获取且不缓存。provider RPC 使用 `CredentialExpiresAt`；已成功取得 DEK 后，callback 仍受原 grant/permit/mapping 的 `ExpiresAt` 限制，二者不能混淆。B 不得在 callback 外保留 DEK。原生产使用屏障尚未接入，因此这不是已完成的流式 capture 生产验收。

provider 网络调用在事务外进行；进入回调之前、之后都复查原 grant。回调失败、响应损坏、provider 不确定结果或末次授权失败均不返回可用 wrapped result；失败时不能复用旧 envelope identity 重试 Generate。owned token/DEK buffers 尽力清零；Go immutable strings/GC 不提供 secure-memory 保证。callback 不能保留或跨 Pod 传递 DEK，不能把副作用失败当成可以重试。

恢复使用当前独立 recovery authority 和保留的 exact mapping，不依赖 forward generator/token。mapping 当前读授权窗口与历史 key 写入窗口不同；历史 key material 的存在不是当前 unwrap 权限。provider numeric version 与 registry opaque version 始终分列。

## 给 D/B 的原授权和撤销接点

**当前增量已实现原控制通道的 `worker.OriginalKeyAuthority` 和 `worker.NewCaptureKeyJob`，以及 `PublicJobOwner.Authorize` 的使用记录接线；尚未取得真实 SQL/Job 并发回执，B 的最终 writer/cmd 调用仍缺失。** 原 invocation 增加可选 `provider_key`，完整原字节仍由已有加密 plan 固定；缺少它时新构造拒绝。现有 `PublicJobOwner.Authorize` 提交 SQL 事务后才返回 functional `Lease.DEK`，不可直接换成正式 provider DEK。继续复用 `WorkloadIdentity` 的 mTLS + TokenReview + 当前 Pod/SA/Job 核对；不能用 DownwardAPI、自报 UID 或测试 authority 替代。

1. B 在读取源前把 C 完整 frozen request 与原 invocation/Job 绑定，保存到现有加密执行日记。原 guard 检查安装、任务、attempt、config SHA/version、claim/fence、Job/Pod/SA、operation 和完整 request；`Identity()` 的 execution grant SHA 不能来自调用请求。
2. 同进程 guard 必须沿已有 gate → maintenance → installation → task → Job 锁序，在同一最终使用边界内复查原 guard/Job 未撤销、同步执行 Job 本地 callback、末次检查原时间界限。不得先 commit 再裸调用 callback；不得为实现接口把控制器 SQL 凭据随意下发 worker。
3. 授权端与 Job 分离时，需要原 Job journal 上受控、有界的 in-flight use lease 和停止屏障。可行语义：同锁序准入窗口；撤销阻止新窗口并进入 draining；原窗口关闭且有真实 worker 停止证明后，才报告撤销完成。断线或超时导致结果不可发布，不续租原许可。使用记录只是原 Job 的观察，不是第二套任务授权。该协议现已落在原控制通道和 migration 125 的原 Job 行 `key_use_json` 上；真实 SQL/Pod 并发验收仍未完成。
4. 必须区分“撤销请求已接收”和“撤销已完成”。已进入 callback 的字节不能事后收回。最终准入点之前已撤销的调用不得进入 callback；已准入的使用由有界窗口和停止证明收束。当前 `Revoke` 的 flag commit 不是 DEK 已停止使用的证明，应与原 `StopJob` / kubelet witness 组合，并保留独立 recovery。

D 已确认 migration 125 未占用，并要求 `key_use_json` 只作为原 Job 使用观察；`finished` 不替代真实停止证明。A 本轮仅在 `public_jobs.go.Authorize` 增加冻结请求/元数据/最短期限与同事务 key-use 接点，`execution_identity.go` 增加原 grant digest 的公开 getter；未覆盖 D 的 relay/runtime 实现。B 的本地独立聊天未找到；本文交付 B 所需合同。测试 mutex 只验证 adapter 的 guard 合同，不能替代真实 SQL/Job 并发联调。

### 原通道的单次使用协议

1. B 在读取源前把完整 `kms.Access` 作为 `worker.Invocation.ProviderKey` 冻结到原加密 plan。原安装/task/attempt/phase、part、envelope、context 必须与 C/B 签收的冻结业务合同一致；不能把现有 functional staging 的 config hash 改名成 C capture context。
2. Job 内 `worker.NewCaptureKeyJob(ctx, originalControlClient, originalInvocation, kmsConfig, permitMount)` 先通过原 mTLS/TokenReview 通道 `key-reserve`。原 SQL guard 后锁同一个 Job 行，记录完整请求、原 grant/claim 摘要、Job/Pod/SA、随机 nonce、最短期限和 `reserved`。已有记录拒绝再次 reserve，包括同 nonce；未知 commit 不重试、不换 nonce。
3. 只有 reserve 成功才构造/调用 provider。当前身份检查走 `key-check`；取得 DEK 后 `key-begin` 在同一 Job 行把 `reserved` 变成 `using`，再进入 Job 本地同步 callback。回调签名是 `func(context.Context, []byte) error`；context 的 deadline 包含原授权、permit 和 KEK mapping 的最短期限。
4. callback 成功后 `key-end` 只能把 `using` 变为 `finished`；末次原授权检查成功才返回 wrapped result。callback 失败、断线、超时、撤销或未知提交都不返回可发布结果。`CaptureJob` 本身也只允许一次 Generate，防止复用同 envelope；临时失败不能以重试原 identity 修复。
5. 原 `Revoke` 同样锁该 Job 行：先提交者确定新 use 是否准入。撤销之后无法 reserve/begin/end；已准入 callback 由截止时间及原 StopJob 物理终止收束。`finished` 只是回调已返回的观察，**不是**停止证明、业务接受或撤销完成。未知结果留待原 recovery/StopJob 处理。
6. `Lease.ExpiresAt` 现在也限制到原 SQL guard、relay 和 invocation 的最短期限；不会以证书期限延长 claim。新 key-use response 仅含公开元数据，不含 DEK/JWT/token；`provider_key` invocation 明确拒绝 functional `acquire/complete` 和 unwrap。旧 invocation 缺省字段用 `omitempty`，原哈希字节保持不变。

migration 125 只给 `system_backup_v2_runtime_resources` 增加有界 JSON 观察列，未改历史 SQL，catalog 同步更新；**未在现场执行迁移**。现有 backup-worker main 仍没有 C 最终 writer 分支，不能仅修改 invocation 就启用；B 必须在原受审 worker 镜像内调用新构造，并提供 C framing writer。单独的 backup cleanup recovery grant 不能据此授予历史 restore unwrap。

## 给公共 C 的签名与 provider 接口

签名继续复用 `CredentialTransitSigner`：原字节是 ASCII `base64url_no_pad(JCS(header))+"."+base64url_no_pad(JCS(unsigned_payload))`，不加 prefix、不先 hash 后签；resolver 绑定的 SHA 只用于授权原字节，不改变 provider 输入。capture_certificate、acceptance_record、catalog_record 使用独立 key/purpose/version，registry 与 provider 版本分列。

公共 C 字节合同已固定；真实 `ResolveSigning` 仍需由 C/D/B 原业务事实授权并提供当前用途的受控凭据，不能仅凭 request 中的 purpose/hash 放行。最终 envelope/AAD 使用 C 新格式，不将旧 functional staging 改名为正式 artifact。Secret wrapper 没有在本包伪装成 external-kms Generate。

## 正式 policy/凭据准备

现场用户回传 `OpenBao v2.6.2 (dd9c19c37a878cf4a81b18efb8d6f0599c7da923)`，构建提交时间 `2026-08-18T15:48:19Z`。精确版本已记录，不再重复采集。接口复核以 [v2.6.2 datakey](https://raw.githubusercontent.com/openbao/openbao/v2.6.2/builtin/logical/transit/path_datakey.go)、[JWT role](https://raw.githubusercontent.com/openbao/openbao/v2.6.2/builtin/credential/jwt/path_role.go)、[JWT login](https://raw.githubusercontent.com/openbao/openbao/v2.6.2/builtin/credential/jwt/path_login.go) 源码为依据；现场 ACL 参数匹配与实际 token 行为仍需回执。

### 已收到的公开信任材料

`docs/evidence/a-site-kek-jwt-trust-20261029.json` 保存用户回传的 discovery/JWKS。固定 issuer 为 `https://kubernetes.default.svc.cluster.local`，仅 RS256；公钥 kid 为 `hJdzzIdsquCaYdXN062zwOqXT0cVvxBEabgRBYGXgdQ`。转换后的 SPKI SHA256 为 `849773cc876caae09a61d5cdd3adb3c0ea974f4715bf104469b81105819781d4`，已用独立 cryptography 库核对 RSA 参数。

公开 prepared 文件为 `docs/evidence/a-site-kek-jwt-trust-prepared-20261029.json`；LF 原始文件 SHA256 为 `6e9de9b8d822810fa7f32ef7fa31f137cd8eb873c03c987662eb049794f8aed5`，canonical config SHA256 为 `32cefa6049533b732d3a099f1993330eac961d5bb8960766429647ed9bb757b3`。历史 CRLF 工作副本的 hash 不可用于部署。预期 mount 为 `sbk-kek-jwt-` 加 config SHA。配置使用固定公钥，不自动跟随 JWKS URL 换信任；集群轮换后须重新审查公开公钥并建立新版本，不能覆盖旧 mount。

### 远程执行命令

在具有本次提交文件的仓库根目录执行（Python 3.9+、kubectl；不安装依赖）：

```bash
set +x
python3 -B scripts/system-backup-a-site-jwt-trust.py
python3 -B scripts/system-backup-a-site-jwt-trust.py --apply
```

第一条只做本地检查。第二条复用已知 namespace/CA/bao Pod UID 和 `lab-recovery/root_token` 引用：只读 Secret metadata，使用固定 digest 工具镜像创建临时管理 Pod，在 Pod 内以只读 0400 挂载读取凭据，创建内容寻址 JWT mount/config 并读回；finally 使用 UID precondition 删除临时 Pod。凭据不进入本机文件、命令参数、stdout 或 Git。临时公开源文件放在 Pod 的内存 emptyDir，Pod 删除后消失。脚本拒绝同名异内容，不覆盖现有 trust，不隐式重试未知写入。

成功输出必须含 `jwt_trust_readback_verified`、`config_readback_sha256`、`temporary_control_pod_removed:true`。这一步不创建 role、token 或 task 授权。请保留该公开回执供下一步准确 pin；失败输出只含阶段状态和临时 Pod 名，不能将部分成功当作通过。

### 原 Job 用途策略与 role

`scripts/system-backup-a-apply-kek-policy.py` 消费 `backupTransitPlan` 的公共输出及独立审核 SHA。默认 dry-run，`--apply` 才下发两个 exact context 的内容寻址 ACL 并读回。增加四个成组参数后才建立原 Pod 的单一已审用途 role：`--job-identity`、`--job-identity-sha256`、`--jwt-mount`、`--jwt-config-sha256`。最后一个必须是上一步的完整 config **读回** hash，不能误用 config request hash。

身份 JSON 必须含 `operation: backup_dek_generate` 或 `backup_dek_unwrap`；一次仅建立对应的一个 role，不给同一 capture 身份同时发 unwrap。身份模板见 `examples/backup-controller/online-kek-capture-identity.example.json`；字段必须取自原 Job/API/授权回执，不从请求自报 UID 拼装。role audience 分别固定为 `clawmanager-backup-kek-generate` 或 `clawmanager-backup-kek-unwrap`、namespace/SA subject、Pod UID、SA UID，并将验证过的三个 UID/namespace claim 映射到 token metadata。token 为 batch、最大 20s、无 default/identity 额外 policy、不可续租；clock/expiration/not-before leeway 为 -1。原 mTLS/TokenReview 的 worker audience `clawmanager-backup-worker` 保持原用途；D/B 应另建 provider JWT projection 并将其纳入原 Job/WorkerObserver 的准入，而不是替换原控制身份。

Job resolver 校验 provider 返回的 role、namespace、Pod/SA UID、准确 policy、TTL 和 token type；不把本地解码 JWT 当认证。JWT 签名自身不证明 Pod 当前存活或任务仍获授权；注销用途 role/policy 是 provider 权限撤销的一部分，原 DB revoked 不能自动撤销 provider token。该 provider 侧注销尚未自动接入原 StopJob 流程，现场关闭必须分别取得精确 role/policy 删除与原进程停止回执。JWT 签名自身不证明 Pod 当前存活，原 `OriginalJobAuthority` 的当前身份、任务/fence 和撤销检查仍是必要条件。移除 projected token 阻止后续登录；已取得 DEK 的撤销仍依赖原使用屏障。

工具的 `--revoke generate` 只删除已审 capture policy 及相应 role 并检查不存在，保留 unwrap；`--revoke unwrap` 只删除恢复用途。ACL 消失不能证明已开始的 callback 停止，输出固定 `worker_stopped:false`。禁止在没有原停止证明时报告完整撤销成功。

```bash
# 这些路径为待挂载材料，不能使用 synthetic 向量冒充真实任务。
python3 -B scripts/system-backup-a-apply-kek-policy.py \
  --plan /run/system-backup/reviewed-backup-kek-plan.json \
  --plan-sha256 "$REVIEWED_PLAN_SHA256" \
  --endpoint https://bao.sbk-provider-zh-7474d6e0b052.svc:8200 \
  --ca-file /run/system-backup/bao-ca.crt \
  --ca-sha256 e7ff215f4fb96613cba2c0c89e9b28afe19b412b5d63be0593843a45fe99f518 \
  --operator-token-file /run/system-backup/operator-token \
  --job-identity /run/system-backup/original-job-identity.json \
  --job-identity-sha256 "$ORIGINAL_JOB_IDENTITY_SHA256" \
  --jwt-mount "$REVIEWED_JWT_MOUNT" \
  --jwt-config-sha256 "$JWT_CONFIG_READBACK_SHA256"
# 显式加 --apply 才下发；operator token 只通过受控文件引用读取。
```

## 仍需 owner 交付的受控引用

| Owner | 所需材料 | 用途与当前限制 |
| --- | --- | --- |
| D/B | 原 encrypted journal 的 C frozen request、invocation SHA、Job/Pod/SA UID、原 execution grant SHA、截止时间 | 由原授权核验，不能由 HTTP 请求自报；真实任务尚未交回 |
| D/B | 原 Job callback writer/cmd 接线、C 冻结 context 业务来源和真实并发回执 | 原控制通道 reserve/begin/end 已有代码；缺最终 writer、实际 SQL/Pod 验收及部署启用，不能使用 functional Lease.DEK 替代 |
| registry owner / 公共 C | identity_hash、opaque registry_version、installation、provider key ID/name、numeric version、用途、期限与撤销位置 | 已有五个候选 key 不能自动成为已签收正式映射；不能从 key 名猜 registry 字段 |
| 部署 owner | JWT trust 公开读回；精确 policy/role 读回；受控 permit、独立 SHA/公钥 pin | 上述脚本准备完成，现场未执行；permit 私钥和 JWT/token 不上传 |
| 公共 C/D/B | 三种 signing input 的原业务授权、三独立 key/version、当前 resolver、历史验签公钥 | 原字节已固定；不能仅凭调用方 purpose/hash 放行 |
| C/D / 恢复 owner | 历史 request/envelope、旧 KEK/ref/version/CA、当前独立 recovery grant、引用扫描及水位 | forward 不可用时仍可恢复；旧 key 存在不等于当前读授权，保留历史引用期间不得销毁 |

所有秘密经受控挂载或 resolver 注入。Git 只保存代码、公开信任材料、示例和脱敏回执；禁止 token/JWT、私钥、DEK、Secret.data、真实 .env、DSN 密码或正式生成 grant 正文。昨日 key/CA/namespace/Pod 记录继续复用；用户确认无记录的新 policy/身份就是尚未创建，不要求重复寻找。

## 本地验证与现场状态

- Go `systembackupkms` 最近一轮全包 exit=0（7.289s），含真实本地 TLS fixture、签名/pin resolver、独立 capture/recovery 构造和 JWT 17 类路径；覆盖合法、错用途/安装/key/context/version、到期/撤销、错误 provider metadata/policy/type/TTL、无缓存重登录、callback 超过 token TTL 但未超过原许可等。并发边界使用测试 authority，不是生产 SQL 证明。
- Python policy/role/revoke 11 项；JWT 公钥转换 3 项；trust apply/readback 3 项；临时管理 Pod runner 3 项（含成功/未知创建/准入变更/等待或执行失败清理，以及替换 UID 不删除）均通过。原 JS planner 18 项通过。
- 修正公开 JSON 的 LF bytes 后，重跑公钥转换、trust apply 和 runner 测试全部通过。Python `-B` 不留 bytecode，测试不创建现场资源。
- 提交前按当前共享 HEAD 再跑四个全包：`systembackupkms` 6.762s、`systembackupcontroller` 5.110s、`systembackupsecurity` 74.357s、`systembackupexecution` 1.607s，全部通过（`-mod=readonly -p=2 -count=1 -timeout=180s`，默认 vet）；Python 20 项与 JS 18 项再次全部通过。
- 前述 Go 临时目录 `.tmp-a-online-kms-20261029`、`.tmp-a-online-jwt-20261029`、`.tmp-a-kek-final-20261029` 已 finally 清理并独立确认不存在。未清理其他聊天产物。
- **尚未调用现场正式 KEK、下发本轮 trust/policy/role、取得正式 JWT batch token，亦无真实 SQL/Job/撤销完成回执。** 本地 synthetic key/token/authority 与正式材料分开。当前可提交的是可复用组件及明确交接，整体生产装配目标仍未完成。

### 原 key-use 接线本轮验证（现场尚未执行）

五包测试通过：worker 4.749s、KMS 7.246s、execution 2.422s、controller 6.491s、migrationcatalog 1.199s；隔离目录 `.tmp-a-key-use-20261029` 已清理并确认不存在。新增真实本地 mTLS 控制通信测试、原使用状态的换 Pod/SA/Job/claim/grant/key/version/用途/nonce/期限拒绝、单次 reserve/begin/end 和旧 invocation 兼容检查。SQL 转移测试是协议模型，**不是**真实 MySQL 锁竞争或 kubelet 停止证明。

随后补充 reserve/begin/end 未知提交错误传递，worker 4.769s、KMS 6.408s 全包再次通过，`.tmp-a-key-use-final-20261029` 已清理。另发现原 staging binding 已含 PartIndex，已增加 C part/part_index 的逐字段对照，worker 最终全包回归 3.858s 通过；`.tmp-a-worker-binding-final-20261029` 已清理并独立确认不存在。role 工具已修复原计划会为同 Pod 同时生成两种 role 的问题，身份现在必须包含一个 operation，两个用途使用不同 JWT audience；policy 11 项和 trust/apply/清理相关 6 项回归通过。旧 `493040af` 远程命令只配置公开 trust，不调用 role 生成，仍可使用；下发 role 必须使用修复后的脚本。公共 C bundle 的 16 个文件 hash 未变，migration catalog 检查通过。
