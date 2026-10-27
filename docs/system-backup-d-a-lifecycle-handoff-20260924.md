# D → A：专用身份生命周期、轮换与清理补充（2026-09-24）

对应 [A 补充输入清单](system-backup-a-d-lifecycle-input-request-20260924.md)。**操作者已完成本轮远程测试，D 本地独立复核通过；临时身份、key 和 Kubernetes 资源报告清理完成，待 A 复核签收。** 原始 provider 交接及其 SHA-256 `c6d15516cc4b9f32dd1f4cffaa767c050ff2f2315df4509ad086c7aa51eccf4b` 保留不变。

## 本轮结果与签收边界

- run：`d-lc-387dab09ff2a1367ca4b5b56`；北京时间 2026-09-24 11:16:04 至 11:51:46，耗时约 35 分 42 秒。
- [原始脱敏结果](evidence/system-backup-d-lifecycle-d-lc-387dab09ff2a1367ca4b5b56-run.json)，文件 SHA-256 `99fc68a174daa0785fbbb9b552f7f2fe05432daa284b8aad8d3123a9625fdcd9`；[D 本地接收记录](evidence/system-backup-d-lifecycle-receipt-387dab09ff2a1367ca4b5b56.json)。原始文件未改写。
- 14 项检查通过：五类身份各自撤销、240 秒自然过期及有效控制；KMS 和三用途 signer 的独立 old/new named-ref 切换。共 15 个专用身份、8 把测试 key、16 个 Pod，194 条调用观察、388 条服务端审计投影。
- D 本地 `verify` 退出 0，重验六份新旧 Ed25519 签名、错公钥/错用途/篡改拒绝、原 handoff/源码/namespace/CA/image 绑定和审计关联。另逐项核对十组生命周期调用均为 200→403，拒绝前后控制调用均为 200，自然过期拒绝均晚于 provider 到期点加 10 秒。
- `cleanup_verified=true`、`recovery_intent_retained=false`；证据包含 8 把 key、5 个 policy 删除后的 GET 404，脚本报告本 run 的 token、Secret、Pod、检查点和 intent 清理完成。D 未再次连接集群独立点查 Kubernetes 资源；原 provider lab 保留。
- 操作者回传了 SSH `close - IO is still pending on closed socket` 提示及 `status=passed`，没有单独回传进程退出码，因此不补写“远程退出 0”。完整结果和本地复核支持接收本轮，无需仅因关闭提示重跑，也无需执行 RECOVERY。

本轮关闭 D 的隔离测试执行与证据交付，不代替 A 签收。远程观察仍是未签名操作者证据，正式 provider proof/registry 和生产 capability 批准保持未完成。以下为可复现方案与恢复说明；当前成功 run 不需要重复执行。

选择 A 清单允许的“由 D 执行控制动作”方式：操作者一次运行 D 的完整隔离测试，结果是新的非敏感 JSON。短会话随执行签发并清理，不预先签发等待 A，避免交接到手已经过期。A 可先审阅本文件和脚本，再让操作者运行，最后独立重验保留的签名、公钥、输入版本、审计和清理记录；这不是供 A 随后长期挂载的身份池。

## 固定环境与新资源

- namespace `sbk-provider-zh-7474d6e0b052`，UID `a285351a-b52a-4b91-af78-1e5fa8e78387`。
- endpoint `https://bao.sbk-provider-zh-7474d6e0b052.svc:8200`；CA `lab-trust/ca.crt`，SHA-256 `798900e820c19cb689b60e80813d98fa3b6f0ddc5e3068fb10e3e40a9593cf5f`。
- 镜像 `10.130.14.23:5000/clawmanager@sha256:8829a85386402301f06f00a766a8b3627001bb4d7f327e16af228d3b337d9cb3`，核对实际 Pod imageID。无需安装依赖或重新构建镜像。
- 每次生成随机 `d-lc-<24位hex>` run。所有新资源名称均包含完整 run；记录绑定 namespace UID、不可变 intent ConfigMap UID、原 handoff hash 和四份 Python 源文件的 LF-normalized SHA-256。
- context 原文为 `<namespace UID>/<run>/capture`，输出 `context_base64`。禁止复用原 v1 context。

| 新资源 | 数量 / 命名 | 权限与用途 |
| --- | --- | --- |
| 测试 key | 8；`<run>-{kms,capture,acceptance,catalog}-{old,new}` | 两把 derived AES-256-GCM 和六把 Ed25519。每把内部版本均为整数 1；禁止 export/plaintext backup。完整 ref 包含 endpoint、namespace UID、key_path、key_version。 |
| 数据面 policy | 5；`<run>-{generate,unwrap,capture,acceptance,catalog}` | generate 只访问当前 key/context/bits；unwrap 只访问两把测试 KMS key/context；signer 只访问自己的当前 key，签名输入绑定 run、完整 ref 和用途，显式字符串版本 `"1"`。无默认 policy、管理、续期权限。 |
| 专用身份 Secret | 15；`<run>-{revoke,expire,control}-<role>` | 五类角色各有三组完全独立 token，Secret immutable，只含 `token`；输出名称/UID/resourceVersion，不输出值。 |
| 普通数据 Pod | 最多 15；同名身份对应一个 Pod | 每 Pod 只挂载自己的一个 token 和 CA，禁用 SA token，非 root、只读根文件系统。 |
| D 控制 Pod | 1；`<run>-admin` | 单独挂载 `lab-recovery` 的 `root_token` 键和 CA，不挂 unseal key。不执行数据面正测；只执行签发、撤销、专用 key/policy 管理。普通探针绝不挂 recovery。 |
| 意图/检查点 | 24 ConfigMap | 1 个 intent；8 个 key 指纹；15 个身份元数据。均 immutable，子资源绑定 intent UID。失败时保留供精确恢复。 |

控制入口是 D 操作者权限，不是扩大原五个数据面身份权限。D 控制脚本私有内存中枚举 accessor，仅在 metadata 的 run、owner UID、namespace UID 三者全匹配、角色/组及 policy 同时吻合时撤销。accessor 不输出；交付只有服务端 HMAC，可供关联审计。

## 身份撤销与自然过期测试

五类角色为 KMS generate、KMS unwrap、capture_certificate、acceptance_record、catalog_record。每类均执行以下实测，不能以另一类结果代替：

1. 撤销组实际 TTL 900 秒、不可续期、无父 token。先用该身份完成受保护调用，再由 D 按精确 metadata 找到唯一 accessor 执行撤销；同一身份必须返回 HTTP 403，其前后有效控制身份均须 HTTP 200。
2. 自然过期组实际 TTL 240 秒、不可续期、无父 token；控制组 TTL 3600 秒。分别核对 provider lookup 的 creation_time、expire_time、explicit_max_ttl、renewable、policy 和 orphan。
3. 每次只为当前角色签发短会话；准备 Pod 后必须取得到期前 HTTP 200，且时间仍早于 provider 到期点。若调度过慢，直接失败，不能跳过正测。
4. 签发以 provider 时间为依据，远程宿主 UTC 与 provider 创建时间差超过 5 秒则失败。等待同时满足 provider `expire_time + 10秒` 和单调时钟 `签发开始 + TTL + 10秒`。异常时钟后跳使等待超过 TTL+60 秒则失败。
5. 到期后相同身份受保护操作须 HTTP 403，前后控制身份均须 HTTP 200；这一窗口不调用 revoke/renew。服务端审计另检查该自然过期身份在失效检查前没有人工撤销记录。

负测只接受指定状态，网络错误、TLS 错误、500 或“身份未签发成功”不算撤销/过期通过。五组顺序测试仅自然等待约 21 分钟，加 Pod 调度和 API 调用通常需更久；入口总超时 50 分钟，控制身份为 1 小时。所有时间、TTL、Secret 不可变引用及控制观察均随结果交付。

## KMS 与三类 signer 轮换、历史验证

本轮覆盖原 handoff 规定的 **new named key/ref 轮换**，不是同名 key 从内部 v1 rotate 到 v2。旧、新 key 都显式声明内部版本 1。OpenBao 的 datakey API 文档未列 `key_version` 参数，因此不虚构该参数的有效性：固定 named key、返回密文 `vault:v1:` 检查和轮换后 metadata 指纹复核共同约束版本；没有静默 latest 的应用协议。参见 [Transit API](https://openbao.org/docs/api/secret/transit/)。

| 范围 | 操作顺序与验收 |
| --- | --- |
| KMS | 旧 ref 生成并解包成功 → 仅将本 run 的 generate policy 切到新 ref → 新 ref 生成/解包成功 → 旧 ref 新生成 403 → 原旧密文仍按旧 ref 解包且 DEK SHA-256 相同 → 新旧密文交叉使用错误 ref 均 400 → 错 context 403。DEK 和密文不归档。 |
| capture_certificate | 独立旧 key 产生签名 → policy 切至独立新 key → 新 ref 签名 → 旧 key 新签名、缺版本、错版本及跨用途调用均 403。 |
| acceptance_record | 同上，独立 key/policy/身份，不复用 capture key。 |
| catalog_record | 同上，独立 key/policy/身份，不复用其他 signer。 |
| 历史验签 | 六把公钥必须不同。保存六份合成 payload、完整 ref、公钥、签名；远程清理 key 后，本机 Node Ed25519 独立验签。旧签名继续用旧公钥通过；错公钥、错用途绑定、篡改内容必须失败。A 后续可重新执行 `verify`。 |

HTTP ACL 的 bits、签名 key_version 使用十进制字符串 `"256"`、`"1"`，合同 ref 内版本仍为整数。权限检查和签名验证失败均停止，不回退原 v1 基线或 root 数据面调用。

## 脱敏审计

运行前检查 provider `file/lab` 审计仍指向 `/data/audit.json`，且 `log_raw=false`、`hmac_accessor=true`。保留原审计配置，不动态增加设备。

控制和数据调用只记录闭集 action/path、HTTP 状态、UTC 时间、provider request_id。在原 `bao` Pod 中读取审计文件并先投影后输出；匹配本 run 精确路径、成功响应 request_id、已签发 accessor 的 HMAC。原日志和 provider 错误正文不离开 provider Pod。输出字段仅为 request_id、request/response、时间、路径、操作、身份别名、error 布尔值。按 UUID 关联 request/response，撤销按身份 HMAC 关联。缺审计配对或自然过期前发现人工撤销，不出通过结论。

本机入口再次严格校验所有层级字段、名称、hash、ref、时间和签名；出现未知字段或任意 provider 文本时拒收。禁止输出 token、原 accessor、DEK、私钥、密文、原始响应、Secret data、完整根身份审计。token 签发及 accessor 撤销语义参见 [Token API](https://openbao.org/docs/api/auth/token/)。

JSON 是操作者执行的**未签名证据**，不是已注册的 provider proof。公钥/合成签名可重验，只能证明该签名与保存的公钥/输入相符；不能独立证明全部远程生命周期观察真实发生，也不替代 A 的输入快照签收或可信证据登记。

## 精确清理与失败恢复

普通成功或测试失败都会进入清理；只有全部验证完成才输出 `cleanup_verified=true`。

1. 按 namespace UID、intent UID 和固定源码 hash 复核所有权；按三项 metadata/policy 精确撤销本 run 残留 token，并再次查询确认无本 run 身份。签发后尚未创建 Secret 的中断窗口也通过 provider metadata 找回，不依赖 token 值。
2. 本 run 的 5 个 policy 必须仍等于已知 old/new 内容才允许删除，随后 GET 404；不改旧五个身份的 policy。
3. 本 run 的 8 把 key 必须匹配持久化的 metadata 指纹才设置 deletion_allowed 并删除，随后 GET 404。指纹覆盖 name/type/keys/derived/latest_version，排除因清理重试而改变的 deletion_allowed。
4. Pod 和 Secret 精确点删，用 Kubernetes DELETE UID precondition，并轮询确认消失。Secret 同时比较 UID/resourceVersion/immutable；Pod 核对 owner、完整挂载、镜像、禁用 SA token 等。名称相同但 UID 替换时拒绝删除。
5. 导出并验证服务端审计投影，再删除 D 控制 Pod、23 个子检查点及 intent。清理/审计失败时保留 intent，尽力删除 root 挂载 Pod；再次 RECOVERY 会重建独立控制 Pod。Pod 自身最长运行 1 小时。
6. 不删测试 namespace、PVC、基线 key、原八个身份、MinIO 对象、共享镜像或源业务资源。保留本机脱敏 JSON，保留 provider 原审计用于 A 复核；原日志最终随全部 A 测试结束后的 lab namespace/PV 清理销毁，不能单独截断审计文件。

如果在 provider 创建 key 后、不可变指纹检查点写入前发生中断，或者在 Secret 创建后、其引用检查点写入前中断，**自动清理会保留相关资源并报失败**。操作者应保留原 run/intent，核对服务端审计和 Kubernetes 创建记录后由 D 做精确恢复；不得补写臆测指纹或按前缀批量删除。若无法建立身份，等 A 全部测试结束后走原 D 文档按 namespace UID 删除整个 lab。此状态绝不能标为已清理。

SSH 中断时按打印的 RECOVERY 原命令恢复，不生成新 run 替代清理。源码 hash 变化时恢复原运行版本再清理，不能绕过绑定。已成功清理的 run 不需要重复 RECOVERY。审计读取超过 128 MiB/4096 条投影会失败并保留 intent，不能截断后谎报完整。

## 操作者完整命令

入口使用已有 Node/OpenSSH，SSH 密码只输入 OpenSSH 提示，不写到参数、环境变量、聊天或文件。执行前 A 可审阅本文件和脚本；本次会在既有隔离 lab 中执行上述签发、撤销和轮换动作。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
node .\scripts\system-backup-d-lifecycle.mjs run --ssh-host root@10.130.14.23 --ssh-password
$lifecycleExit = $LASTEXITCODE
Write-Output "d_lifecycle_exit=$lifecycleExit"
if ($lifecycleExit -ne 0) { throw '本轮未通过；保留run_id，按输出RECOVERY检查清理，不要重建整个lab' }
```

入口打印 run_id、RECOVERY 和 `redacted_result=...`，并把验证后的 JSON 以不覆盖已有文件的方式写入 `docs/evidence/system-backup-d-lifecycle-<run>-run.json`。回传该文件和退出码，不回传原审计/Secret。命令安静等待自然过期时不要以为卡住。

仅在中断或清理失败时执行（实际 run 以先前输出为准）：

```powershell
node .\scripts\system-backup-d-lifecycle.mjs cleanup --ssh-host root@10.130.14.23 --run-id '填写原d-lc-run' --ssh-password
$cleanupExit = $LASTEXITCODE
Write-Output "d_lifecycle_cleanup_exit=$cleanupExit"
if ($cleanupExit -ne 0) { throw '清理未完成；保留intent并回传脱敏状态' }
```

A 拿到本轮 JSON 后离线重验，不再调用已删除的身份/key：

```powershell
node .\scripts\system-backup-d-lifecycle.mjs verify --file '.\docs\evidence\system-backup-d-lifecycle-填写实际run-run.json'
if ($LASTEXITCODE -ne 0) { throw 'D生命周期结果/独立验签复核失败' }
```

## 本地验证与未覆盖项

本轮 11 项 Python 标准库测试和 21 项 Node 测试通过。Node 使用真实 Ed25519 合成签名验证正负样例；Python 使用 mock/虚拟时间检验编排顺序、隔离与失败恢复，**不是 provider 过期实测**。未安装依赖，Python `-B`，无构建、无生成测试产物。

准备阶段代理终端的 SSH 命令被沙箱拦截；远程测试已由操作者在正常终端执行，随后 D 在本地完成上述结果复核，没有从代理会话重新执行签发或测试。

```powershell
& 'C:\Users\zhanghui08\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -B .\scripts\system-backup-d-lifecycle.test.py
node --test --test-isolation=none .\scripts\system-backup-d-lifecycle.test.mjs
```

仍未覆盖同名 key 内部 v1→v2 轮换、生产 task/attempt scoped grant、Evidence grant 绑定、provider-proof adapter/正式 registry、源集群外恢复。`provider_capability_approved`、`evidence_registered`、`production_scoped_grant_verified`、`disaster_recovery_eligible` 始终为 false。本轮远程执行及 D 本地复核已完成，A 复核和正式签收仍待完成。
