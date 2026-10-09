# D → A：实际 provider 测试输入（2026-09-24）

操作者已完成远程部署，`provider_lab_exit=0`。本交接提供实际服务/key/version/身份/存储输入；不等于 A capability matrix 或正式灾备验收通过。完整非敏感引用、三把公钥、8 个 Secret 的 UID/resourceVersion 见 [交接 JSON](evidence/system-backup-d-provider-lab-handoff-20260924.json)。记录来自操作者输出，未独立复查或签名登记。

## 安装与访问

- SSH 运维入口：`root@10.130.14.23`；Kubernetes context：`kubernetes-admin@kubernetes`。
- 测试 namespace：`sbk-provider-zh-7474d6e0b052`；UID：`a285351a-b52a-4b91-af78-1e5fa8e78387`。
- handoff 生成时间：`2026-09-24T01:19:44.197729+00:00`（北京时间 09:19:44）。
- 工具 Pod：`lab-tools`，包含 bao、mc、Python 3 标准库 HTTPS；只有 CA 和初始化脚本挂载，没有自动挂载测试身份。
- 以下 `.svc` endpoint 供集群内测试 Pod 使用，不能假定 Windows 或 SSH 宿主机可直接解析。
- 公共 CA：本 namespace ConfigMap `lab-trust`，键 `ca.crt`；现有工具 Pod 内 `/trust/ca.crt`。PEM 字节 SHA-256：`798900e820c19cb689b60e80813d98fa3b6f0ddc5e3068fb10e3e40a9593cf5f`。测试证书有效期 7 天，保持 CA/主机名验证。
- 服务端审计：OpenBao 声明式 file/lab，`/data/audit.json`，0600、`log_raw=false`、accessor 哈希启用；不开放 API 动态创建审计设备。

## KMS 与三类签名

Provider 为 **OpenBao 2.6.2 Transit**，共同 endpoint：

`https://bao.sbk-provider-zh-7474d6e0b052.svc:8200`

完整 key ref 必须同时绑定 endpoint/namespace UID、下表 key_path 与 key_version；不能仅用名称或默认 latest。

| 用途 | key_path | key_version | 测试身份别名 |
| --- | --- | --- | --- |
| KMS 生成 DEK | `transit/keys/d-kek-v1` | 1 | `d-kms-generate` |
| KMS 解密 DEK | `transit/keys/d-kek-v1` | 1 | `d-kms-unwrap` |
| capture_certificate | `transit/keys/d-capture-certificate-v1` | 1 | `d-sign-capture-certificate` |
| acceptance_record | `transit/keys/d-acceptance-record-v1` | 1 | `d-sign-acceptance-record` |
| catalog_record | `transit/keys/d-catalog-record-v1` | 1 | `d-sign-catalog-record` |

KMS 是 derived AES-256-GCM，三类 signer 各有独立 Ed25519 key material 和 policy。固定 KMS context 原文为：

`sbk-provider-zh-7474d6e0b052/capability-spike/attempt-1/capture`

其 base64 在交接 JSON 的 `handoff.kms.context_base64`。HTTP 请求必须显式包含该 context；`bits` 使用 JSON 字符串 `"256"`，签名 `key_version` 使用字符串 `"1"`，以匹配 provider 的类型敏感 ACL；机器合同中的版本仍是整数 1。

生成身份只允许对应 datakey 路径，不能 decrypt/admin；unwrap 身份只允许对应 decrypt/context。每个 signer 只允许自己的 sign/verify/metadata，不能跨用途签名、签其他版本或管理密钥。密钥不允许 export/plaintext backup，轮换策略须另行制定和验证，不能静默切到 latest。

这些身份的 token 分别在同名不可变 Secret 的 `token` 键内。**仅把本次测试需要的 Secret 挂载给对应测试 Pod**，不输出值，也不挂载 `lab-recovery`/MinIO admin 给普通能力探针。五个 token 从各自签发时起 8 小时过期且不可续期；不能按本文件时间重置 TTL。开始测试前确认实际有效期；过期需由操作者重新签发，不能回退到 root。这里是独立 spike 会话，不是生产 capture task/attempt 身份证明。

## Evidence

- Provider：**MinIO / S3**，独立测试实例。
- Endpoint：`https://minio.sbk-provider-zh-7474d6e0b052.svc:9000`。
- Bucket：`d-provider-evidence`；prefix：`a-spike/`。
- 身份别名：`d-evidence-read`、`d-evidence-write`、`d-evidence-delete`。
- 三个身份分别仅有此前缀的 GetObject、PutObject、DeleteObject；另允许该 bucket 的 GetBucketLocation，没有 list/admin。
- 凭据分别位于同名不可变 Secret，键为 `access_key`、`secret_key`；UID/resourceVersion 见 JSON。这是隔离测试静态账号，随环境清理，不是生产短期 grant。
- 已有工具：tools Pod 内 mc、Python HTTPS。mc 的自定义信任文件放在 `<config-dir>/certs/CAs/`，该版本没有 `--certs-dir`。本环境没有交付生产 Evidence/provider-proof adapter。

## 已通过与待执行

Bootstrap 已通过声明式审计核验、KMS v1 生成/解密、生成身份 decrypt 拒绝、错误 context/bits 拒绝、三把不同公钥、三类签名/验签、错误签名版本拒绝及六项跨用途签名拒绝。

MinIO bucket/账号/policy 创建成功。日志阶段名 `minio-read/write/delete` 表示三类账号配置，**不代表 Evidence 数据面的读写删探针已执行**。A 接下来可用上述真实输入执行 Evidence 读写删/Range/checksum/越权/TLS，以及身份撤销/过期、历史版本/轮换等剩余矩阵。

所有服务仍与源安装同集群。1-of-1 解封材料和 root token 在隔离 namespace 的 `lab-recovery`，没有源集群之外的恢复保证。`provider_capability_approved=false`、`disaster_recovery_eligible=false`，未注册 signed evidence，未创建 active system-backup config。

运行绑定：

- tools image：`10.130.14.23:5000/clawmanager@sha256:8829a85386402301f06f00a766a8b3627001bb4d7f327e16af228d3b337d9cb3`。
- MinIO image：`10.130.14.23:5000/minio@sha256:52dfd5c0bbd38d3219f2058c7af216d9f9a27a994b7b5baad09bbd38866015ff`。
- 实际初始化脚本：不可变 ConfigMap `lab-client`，SHA-256 `3ebe6f7e7233c9848dc252d983cbacab5322738758cb32672f6c09511baa7f8a`。本地源文件校验匹配；不以镜像内旧脚本代替。

## A 测试结束后的清理

当前先保留供 A 测试。结束后在本机 PowerShell 执行：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
node .\scripts\system-backup-d-provider-lab.mjs cleanup --ssh-host root@10.130.14.23 --namespace sbk-provider-zh-7474d6e0b052 --uid a285351a-b52a-4b91-af78-1e5fa8e78387 --ssh-password
$cleanupExit = $LASTEXITCODE
Write-Output "provider_cleanup_exit=$cleanupExit"
if ($cleanupExit -ne 0) { throw '测试环境清理未完成，请回传输出' }
```

清理会删除本次 namespace 内测试密钥、账号、数据、Pod/PVC，并等待 Kubernetes PV 消失；不删除其他安装或共享镜像缓存。清理后本交接中的服务与身份即失效，文档仅保留为历史记录。
