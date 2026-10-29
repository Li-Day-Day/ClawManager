# 公共 C：backup KEK、最终 envelope/AAD 与三用途签名交付

交付版本：`public-c-crypto.v1`，2026-10-29；依据共享 HEAD `f2f78aefe03a963e88f324c0d1c6d627e99bef0c` 的主计划 §7、§9.4、§10 和 v12 artifact-common。本包固定 C 提交的字节决定，状态为 **candidate**；不把 B capture / D acceptance 的业务签收、A 的安全复审或现场 provider 装配写成已完成。原 v12 manifest/status 不改，旧实现没有自动切换到本协议。

交付文件：

- [Go generate/wrap/unwrap 接口](../backend/internal/systembackupwire/kek.go)；[Go AAD 编码器](../backend/internal/systembackupwire/aad.go)。
- [envelope 闭集 schema](../contracts/system-backup/v12/public-c-crypto-v1/envelope.schema.json)。
- [capture unsigned payload 闭集](../contracts/system-backup/v12/public-c-crypto-v1/capture-payload.schema.json)、[catalog registration/tombstone 闭集](../contracts/system-backup/v12/public-c-crypto-v1/catalog-payload.schema.json)。acceptance 原样采用 [v12 payload](../contracts/system-backup/v12/acceptance-marker.schema.json#/properties/payload)。
- [三用途四对象原字节和正负向量](../contracts/system-backup/v12/public-c-crypto-v1/signature-vectors.json)、[最终 envelope/AAD/分片向量](../contracts/system-backup/v12/public-c-crypto-v1/envelope-vectors.json)。JSON 中 `*_json`/`signing_input_ascii` 字符串解码后的 UTF-8 字节就是原文件内容；无 BOM、无末尾换行。
- [可执行参考](../scripts/system-backup-c-crypto-wire.mjs)、[回归](../scripts/system-backup-c-crypto-wire.test.mjs)。它们是离线 conformance 参考，不提供在线身份认证、provider ACL 或全业务验证器。
- [交付 SHA-256 清单](../contracts/system-backup/v12/public-c-crypto-v1/bundle-manifest.json)固定本包与消费的原 schema 文件字节；它是版本 pin，不是签名授权或跨 owner 签收。

## KEK 接口与调用约束

`Generator.Generate(ctx, request, withDEK) -> (WrappedKey,error)`；`Wrapper.Wrap(ctx,request,dek) -> (WrappedKey,error)`；`Unwrapper.Unwrap(ctx,expectedRequest,wrapped,withDEK) -> error`。三个能力接口分开注入，capture Job 不接收 Unwrapper。

| variant | capture 操作 | recovery 操作 | 资格 |
|---|---|---|---|
| external-kms | GenerateDataKey：返回 32-byte DEK 和 provider 密文；通过回调在本 Job 使用 DEK | 精确 key/version、相同 encryption context 的 unwrap/Decrypt | 仅此 variant 可参与 acceptance，仍需原准入 |
| external-secret / k8s-secret | 在本 Job 使用 CSPRNG 生成 32-byte DEK；读取精确不可变 32-byte KEK；AES-256-KW wrap | 当前恢复授权读取原版本并 AES-256-KW unwrap | 最多 functional_test / same-cluster-copy |

没有 external-kms wrap 的默认别名，也没有 generate→本地随机+wrap 的权限降级。KEK 完整绑定为 `{provider,identity_hash,registry_version,provider_key_id,provider_version}`，注册版本是不透明字符串；provider version 独立填写，OpenBao/Transit 映射须为规范正整数，不从 registry version 剥前缀、不用 latest。endpoint、CA、实际身份和 ACL 来自独立可信部署映射，不由 artifact 或 Admin 请求控制。

KeyContext 为 `{origin_installation_id,backup_public_id,attempt_no,phase,part,part_index,envelope_id,capture_context_hash}`，全部字符串。attempt 从 1 开始，part_index 从 0 开始，十进制无前导零。external-kms 的 encryption context 是此对象和 `kek_binding_sha256=SHA256(JCS(完整 KEK binding))` 的合并对象；adapter 必须绑定其全部字段。Secret KW 不原生认证 context，不能声称它单独阻止 context 换绑；GCM AAD 和冻结的 envelope/index 负责最终绑定。

调用前及返回明文/结果前重新检查原授权、撤销、期限、context、完整 key binding。unwrap 同时接收可信 expectedRequest，不能仅相信 envelope 自带引用。当前原 grant 失效不能由历史 key 保留代替授权。明文限本 Job/回调内使用，所有返回路径尽力擦除；禁止日志、序列化、跨 Pod 传输。SIGKILL/OOM 的清除不作保证，内存/no-swap/core-dump probes 仍按主计划执行。

adapter 应返回可分类的 `permission_denied`、`key_unavailable`、`binding_mismatch`、`integrity_failed`、`deadline_exceeded`、`outcome_unknown`、`unsupported_operation`；错误正文不得含密钥或凭据。接口暂不规定 provider SDK 的 error 类型。权限/完整性失败不重试；超时/连接中断视为结果未知。Generate 未得到完整成功结果时丢弃该 envelope identity，下一次使用新 DEK/envelope identity，不复用旧 nonce；wrap 的未知结果可以在同一原授权下对原 DEK 重算 KW，但不把未知 staging 写入当作已完成。artifact final PUT 的未知结果另走原 external-action 只读判等，不能借 KEK 重试重发发布。

## 最终 envelope 与 AAD

`restore-metadata/envelope.json` 内容为 UTF-8 JCS 的 `system-backup-envelope.v1`，字段严格遵循 schema，checksum 覆盖完整 bytes。envelope entries 按 envelope_id 的 UTF-16 顺序唯一排序；每个 phase/part 使用独立随机 DEK 与唯一 envelope_id。每个 entry 保存 context、完整 KEK binding、wrap_algorithm、base64url 无 padding 的 wrapped DEK、AES-256-GCM、framing version 和 chunks；不含明文密钥。

chunks 按 `(path,chunk_index)` 排序，path 按 UTF-16 顺序；同 path 从 index 0 连续，恰好一个最后 EOF。path 为原 UTF-8 相对 POSIX 路径，不含空段、`.`、`..`、反斜杠或起始 `/`，不作 Unicode normalization/URL decoding。nonce/tag 为小写 hex；每个 chunk 保存完整 frame 的 SHA-256，不是明文 hash。字段中的长度、nonce、tag 必须与 frame 原字节相等；context.envelope_id 必须与 entry.envelope_id 相同。provider-native 仅对应 external-kms，AES-256-KW 仅对应 Secret variants。完整 index/manifest/marker 校验及这些跨字段关系是恢复前置条件，JSON Schema 单独不能替代它们。

`aes-gcm-chunked.v1` 每个 frame 的布局如下，所有整数 unsigned big-endian：

| offset | 长度 | 内容 |
|---|---:|---|
| 0 | 8 | ASCII `CMBKGC01`（版本固定在 magic） |
| 8 | 4 | header length = 41 |
| 12 | 8 | chunk index，从 0 连续；v1 上限 2^53−1 |
| 20 | 4 | plaintext length，数据帧 1..1048576，EOF 为 0 |
| 24 | 4 | ciphertext length，等于 plaintext length，不含 tag |
| 28 | 1 | final：0 数据帧，1 EOF |
| 29 | 12 | CSPRNG nonce |
| 41 | N | GCM ciphertext |
| 41+N | 16 | GCM tag |

同 DEK 的 nonce 全部唯一；达到 2^32 帧前必须更换 DEK/entry。正式 writer 每帧随机生成 nonce，发现重复即拒绝并换新 nonce；向量的固定 nonce 仅测试用。空文件仍有一个加密 EOF。缺失/重复/重排 frame、未知 flag/version、截断、EOF 后追加 bytes 一律拒绝。每帧最多输出认证后的数据，但整个目标保持隔离直到 EOF 和 index 校验全部成功。nonce/密文/envelope metadata 原子落地；不能通过重新生成 metadata 猜测复用未知写入。

AAD 是以下序列的**原始二进制 bytes**，不先取 SHA，也不作字符串拼接。`LP(s)=uint32be(UTF8(s)字节数)||UTF8(s)`；字符串非空且最多 4096 字节，符合各 schema 更小上限：

```text
LP("clawmanager.system-backup.chunk.v1")
LP("aes-gcm-chunked.v1")
LP(origin_installation_id) || LP(backup_public_id) || LP(attempt_no)
LP(phase) || LP(part) || LP(part_index) || LP(path)
LP(envelope_id) || LP(capture_context_hash) || LP(kek_binding_sha256)
uint64be(chunk_index) || uint32be(plaintext_length) || uint8(final)
```

capture_context_hash 必须来自读取源前冻结的 C/B 原 context：schema/算法、安装/task/attempt、phase/part 顺序、envelope identities、path 编码/分片规则。实际扫描 path 进入 chunk AAD，不进入预先未知的列表。checkpoint、checksum、warning、终态不得回填进该冻结 context。该 context 的业务合同仍须与 B 签收；本包不把任意自报 hash 当来源证明。

## 三用途签名原字节

| purpose | unsigned schema_version | domain / header.typ |
|---|---|---|
| capture_certificate | system-backup-capture-certificate.v1 | clawmanager.system-backup.capture_certificate.v1 |
| acceptance_record | system-backup-acceptance.v1 | clawmanager.system-backup.acceptance.v1 |
| catalog_record（registration 与 tombstone） | system-backup-catalog-record.v1 | clawmanager.system-backup.catalog_record.v1 |

算法固定 EdDSA，实际曲线 Ed25519。protected header 恰为 `{alg:"EdDSA",key_version,kid,purpose,typ}`，JCS 排序后 UTF-8；`kid=key_id`、`typ=domain_separator`，无额外字段。签名输入固定 ASCII `base64url_no_pad(JCS(header))+"."+base64url_no_pad(JCS(unsigned_payload))`。不额外加 domain 前缀，不预 hash 后再签。最终 `{payload,signature}` 沿原 artifact-common Signature；对象 checksum 为完整 JCS 对象的 SHA-256，signature 不进入 unsigned payload。

payload 顶层字段全部由上述闭集 schema 明列。capture 的 jobs 按 `(uid,generation,phase)`、checkpoints 按 part、staging_resources 按 uid 唯一排序；包含全部 capture Job（含 secret capture）、checkpoint、capture staging，不能只取样例的一项，不包含发布阶段新建的 manifest candidate。`capture_completed_at <= issued_at < expires_at`，expires_at 晚于任务 deadline；Job 创建/重建按当前时钟检查，历史 artifact 按签发时 key 有效性验签，不因证书后来过期自动失效。

acceptance 原 payload 不加 installation 字段，避免更改 A 既有签名字节；通过可信 manifest checksum、marker checksum、backup/attempt 及 key trust 的安装映射绑定安装。local_reason_codes 唯一排序，hash=SHA256(JCS(array))。`true` 仅允许 `["eligible"]`；`false` 不含 eligible；时间、清理证据、资格由 D 原事实产生。

catalog 两事件均使用 catalog_record key。registration 绑定不可变 manifest locator 和 manifest/index/marker/acceptance/capture checksums，只能引用有效 local_acceptance=true 的 acceptance。tombstone 绑定完整 registration checksum、相同 artifact checksums、prune 与删除证据；它不证明其他 key 上对象不存在。record_id 和存储 key 由原 action identity 确定，create-if-absent 后读取原 bytes 判等；同 identity 不同完整对象 checksum 是 conflict，不能重新签名覆盖。分页、inventory snapshot、catalog scan 合同不在此签名包内。

三个 purpose 分别独立 key ID、版本与实际公钥；同 purpose 的 registration/tombstone 可共用 catalog key。registry key version 与 provider 数字 version 分列；向量特意使用 `registry-r17` 对 provider `3`，acceptance 保留原 `7`。provider version 不新增到 protected header，由可信部署映射和 A signer 请求绑定。所有历史引用的 key/version、公钥与 revoked 状态保留；公钥存在不等于当前允许 Sign。

旧 `systembackup/signature.go` 的 newline-domain 和 `systembackup/recovery` 的 slash-domain/manifest 不是本协议，不做兼容验签回退。需要迁移时重新验证原业务来源、生成新对象并更新引用，不能改 purpose 字符串保留旧 signature。新 envelope 也不兼容旧 `CMBKENC1`。

## 向量、验证及接线边界

signature-vectors 每例提供 unsigned 原 JSON/JCS、header 原 JSON/JCS、两段 base64url、最终 signing_input_ascii 与 SHA、signature、公钥、registry/provider 精确版本、完整对象与 SHA；负例是对指定原例应用单一 JSON path 替换，其余字节/可信输入不变。四例覆盖 capture、acceptance、registration、tombstone。所有 signing 私钥仅在生成进程内存中存在，不落盘。envelope 向量内标注的 DEK/KEK 是公开 synthetic 常量，绝不用于实际备份。

运行 `node scripts/system-backup-c-crypto-wire.test.mjs`；无需安装依赖，不生成构建产物。`system-backup-c-crypto-vectors.mjs` 仅显式重建向量时执行，会生成新公钥/签名及连带 checksum，正常测试不重建 golden 文件。参考验签函数验证字节/可信 key/time/task 绑定；正式消费者必须先验证闭集 payload schema、三用途 key 隔离及上文业务规则，再进行签名检查，不能直接把此参考函数当生产准入器。

本次 Node 85 项通过，包含 A 原 acceptance golden 的独立兼容验证、四份 unsigned payload 与 envelope 的闭集 schema 检查；Go 测试另用标准库独立解密固定 GCM 帧、核对 AAD 原字节并拒绝改 AAD。负例覆盖 payload/header/domain/purpose、安装/key/registry/provider version、撤销、时间/Job 过期、padding、公钥、AAD 全字段、tag/index/长度/EOF 和错 KW key。首次 `node --test` 因环境禁止子进程 spawn EPERM 失败；改同进程执行上述命令通过，无权限放宽。

待正式接线的具体项：external-kms/Secret provider adapter 和真实原授权 resolver；B capture 完整事实/冻结 context 的同版本签收；D acceptance/catalog 发布事务及 C reader/index/metadata 完整校验。当前交付是可评审合同、接口和可复验字节向量，不是这些现场能力的成功回执。

Go 实际命令：在 backend 下执行 `go test -mod=readonly -p=2 -count=1 -timeout=120s ./internal/systembackupwire`，Go 1.26.1 windows/amd64，CGO=0，GOTOOLCHAIN=local、GOWORK=off、GOPROXY/GOSUMDB=off。退出 0，包输出 ok。GOCACHE/GOTMPDIR 隔离在 `backend/.tmp-c-crypto-contract-20261029`，finally 清理返回 `cleanup=True`，随后独立 Test-Path=False。Node 不输出临时文件；保留的 JSON 是用户要求的版本合同与公开测试向量，不是临时构建产物。未改动或清理其他聊天的临时目录。
