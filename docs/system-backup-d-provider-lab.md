# D → A 隔离 provider 测试环境

状态：2026-09-24 修正版已由操作者执行成功，`provider_lab_exit=0`。实际测试 namespace `sbk-provider-zh-7474d6e0b052`，UID `a285351a-b52a-4b91-af78-1e5fa8e78387`，当前保留给 A 测试。实际 key ref、身份、bucket/prefix/TLS 与清理命令见 [D→A 交接](system-backup-d-a-provider-handoff-20260924.md)，[非敏感记录](evidence/system-backup-d-provider-lab-handoff-20260924.json)。Provider 完整矩阵/灾备验收仍未批准。以下失败尝试和修正保留为历史，不要重新部署已经成功的环境。

修正说明：mc 的该发布版没有 `--certs-dir`，改用 `<config-dir>/certs/CAs` 默认信任目录（[固定版本 flags](https://github.com/minio/mc/blob/RELEASE.2025-08-13T08-35-41Z/cmd/flags.go)）。测试 CA 显式加入 `keyCertSign/cRLSign`，leaf 显式声明 SKI/AKI，以兼容 [Python 3.13 默认严格 X.509 校验](https://docs.python.org/3.13/library/ssl.html#ssl.create_default_context)。原始 provider 错误被旧脚本过滤，因此这两项已确认代码缺陷不能被写成已确认的远程唯一根因。

本次不要求重建镜像：Node 入口发送当前本地 client 源码，远程创建不可变 `lab-client` ConfigMap，只读挂载到 tools Pod，执行前验证 SHA-256。镜像内旧 client 不再作为初始化入口。实际 handoff 同时记录镜像 digest 与 `bootstrap_client_sha256`，不可只依据镜像 digest 判断初始化脚本版本。脚本 stderr 仅输出闭集阶段/错误码/HTTP 数字状态；外层只转发严格白名单记录，继续隐藏 provider 原始响应与 Secret。

第二次尝试 `sbk-provider-zh-cdbbb7353bdd` 已通过 init/unseal，在 `bao-audit` 收到 HTTP 400，namespace/PV 清理成功由操作者回传。旧脚本调用 API 创建审计设备，但该版本默认禁止此操作。现改用固定版本支持的[声明式审计配置](https://github.com/openbao/openbao/blob/v2.6.2/website/content/docs/configuration/audit.mdx)，在不可变 `bao-config` 中定义 file/lab，初始化时只通过 GET `sys/audit` 检查设备、文件路径、哈希配置。保持 `unsafe_allow_api_audit_creation=false`，审计文件只写测试 PVC、mode 0600，`log_raw=false`。新部署仍须远程验证，不把本地配置测试记为 provider 验收通过。

第三次尝试 `sbk-provider-zh-9daa154ca550` 通过审计/Transit/key/identity 创建，在 KMS roundtrip 收到 403，namespace/PV 清理已回传。依据[固定版本 ACL 类型敏感匹配](https://github.com/openbao/openbao/blob/v2.6.2/vault/policy/acl.go#L800)和[Transit TypeInt 转换](https://github.com/openbao/openbao/blob/v2.6.2/sdk/framework/field_data.go#L205)，修正 `bits` 与签名 `key_version` 的传输/白名单表示为十进制字符串 `"256"`/`"1"`；合同和 handoff 的 key_version 仍是整数 1。增加错误 context、bits、签名 version 的真实 403 检查，并拆分 generate/decrypt/denials 阶段。未移除 required/allowed 参数限制、未使用 root 代替测试身份；该修正的实际效果待远程重跑。后续 A 直接调用这些测试身份时须使用 handoff 中 `provider_wire_parameters` 的表示。

## 选择与边界

2026-09-23 操作者盘点退出 0：远程已有 kubectl、OpenSSL、Python 3、ctr、crictl；没有 aws/vault/bao/mc/docker。存在 MinIO 工作负载和 longhorn/longhorn-rwx/longhorn-static，节点为 amd64。清单只能说明已观察到的资源，不能证明外部 KMS 不存在。

本轮为 A 的独立 provider capability spike 部署真实 OpenBao Transit 和独立 MinIO 服务。测试 namespace 是 `sbk-provider-zh-<随机值>`；源安装仍是 `clawmanager-zhanghui08-system`，UID 必须等于 `337cfe30-2c17-4b8e-b32a-760778b8098e`。脚本对源 namespace 只读取 MinIO deployment/pod 元数据，从运行中镜像 ID 固定 MinIO digest，不读取源凭据、不连接业务 bucket、不创建系统备份 active config。

OpenBao 的 [Transit 接口](https://openbao.org/docs/api/secret/transit/) 提供 datakey、解密、Ed25519 签名和 key 版本；[短期 token](https://openbao.org/docs/api/auth/token/) 可使用不同 policy。这里使用实际 HTTP API 和 mc 管理接口，不假装 AWS KMS。工具镜像采用 [OpenBao 2.6.2](https://github.com/openbao/openbao/releases/tag/v2.6.2)、[mc RELEASE.2025-08-13T08-35-41Z](https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z)、Python 3.13；最终部署固定操作者推送的单平台镜像 digest。上游基础 tag 不是供应链签名证明。

**仅测试环境：** 单实例、同源集群、7 天测试 CA、1-of-1 解封材料和 root token 放在隔离 namespace 的 `lab-recovery` Secret。禁用 mlock；没有 HA/独立灾备/生产密钥托管承诺。任务 Pod 无 Kubernetes API token，只有操作者具有部署/挂载测试身份的权限。Namespace NetworkPolicy 限制本 namespace 互访和 kube-system DNS；实际隔离仍需 CNI 执行，NodeLocal DNS 等差异会导致部署失败而非自动放宽出口。

这不是正式灾备环境；v12 acceptance 所需独立恢复路径、task/attempt 身份生命周期、历史版本/轮换、provider proof 和外部存储判定仍由后续实现/验证完成。这里没有改写 A 的生产 adapter。

## 操作者构建

在 Windows Docker Desktop 的 Linux 引擎运行；只构建测试工具镜像，不重建业务 fix15。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
docker build --platform linux/amd64 --provenance=false --sbom=false -f Dockerfile.system-backup-provider-lab -t 10.130.14.23:5000/clawmanager:backup-test-zh-provider1 .
if ($LASTEXITCODE -ne 0) { throw 'provider lab image build failed' }
docker push 10.130.14.23:5000/clawmanager:backup-test-zh-provider1
if ($LASTEXITCODE -ne 0) { throw 'provider lab image push failed' }
```

Dockerfile 专属 `.dockerignore` 仅纳入测试 client 源码。构建过程从上游镜像复制已有 bao/mc 二进制，不执行 apt/pip/go/npm 安装。不要在服务器安装 Docker、aws、mc 或其他依赖。

## 部署

将 push 得到的 digest 填入；不使用 tag、`latest` 或应用 fix15 的 digest。

```powershell
$providerImage = '10.130.14.23:5000/clawmanager@sha256:填写实际64位digest'
node .\scripts\system-backup-d-provider-lab.mjs deploy --ssh-host root@10.130.14.23 --image $providerImage --ssh-password
$providerExit = $LASTEXITCODE
Write-Output "provider_lab_exit=$providerExit"
```

远程现有 Python 须至少 3.9，OpenSSL 须支持 `req -addext`，longhorn StorageClass 的 reclaimPolicy 必须为 Delete。预期新建 3 个 Pod（bao/minio/lab-tools）、2 个 PVC（1Gi + 2Gi）、两个 ClusterIP Service、网络策略、TLS/身份 Secret 与非敏感 handoff ConfigMap。Longhorn 实际副本占用可能大于 3Gi。没有 NodePort、Ingress 或 TLS 跳过选项。

TLS 私钥在远程 `/dev/shm` 的临时目录生成，finally 删除。初始化响应在两端进程内存/管道传输；不要单独手动运行 `client.py bootstrap`，不要打印或提交 Secret。工具 Pod 的临时 mc 配置在内存 emptyDir，bootstrap 后删除。失败日志故意不显示 provider 原始响应；若部署失败，回传阶段/退出码/namespace/UID，先做脱敏诊断。

普通部署失败会按 UID 清理本次 namespace 并等待 Kubernetes PV 消失。SSH 被强制中断/主机失联等不能保证 finally 完成，使用已打印身份执行显式 cleanup。不要删掉其他 namespace 或强制解除 finalizer。

## 给 A 的实际交接

只有部署 exit 0 且出现 `PASS: isolated provider lab provisioned; A capability acceptance pending` 时才可使用输出的 JSON。另存于测试 namespace 的 ConfigMap `lab-handoff` 的 `handoff.json`。

| 类别 | 创建内容 |
| --- | --- |
| KMS | OpenBao Transit；路径 `transit/keys/d-kek-v1`、版本 1；生成与解密分别为 `d-kms-generate`、`d-kms-unwrap`。Context 固定为本 namespace 的独立 spike/attempt/capture，并写入 handoff。 |
| capture_certificate | 独立 Ed25519 key `d-capture-certificate-v1`，版本 1；身份 `d-sign-capture-certificate`。 |
| acceptance_record | 独立 Ed25519 key `d-acceptance-record-v1`，版本 1；身份 `d-sign-acceptance-record`。 |
| catalog_record | 独立 Ed25519 key `d-catalog-record-v1`，版本 1；身份 `d-sign-catalog-record`。 |
| Evidence | 独立 MinIO，bucket `d-provider-evidence`，prefix `a-spike/`；`d-evidence-read/write/delete` 三个身份分别只有该对象前缀 GetObject/PutObject/DeleteObject 权限，另允许读取该 bucket 的 region，没有 list/admin。 |
| 工具 | `lab-tools` Pod 内已有 `bao`、`mc` 和 Python 标准库 HTTPS；没有生产 provider-proof adapter。 |
| TLS | 精确 endpoint、ConfigMap `lab-trust`、CA SHA-256 在实际 handoff；必须验证 CA/服务名。 |

完整 key 标识由 endpoint/namespace UID + key_path + key_version 组成，不能只抄一个 `v1`。本 bootstrap 禁止 export/plaintext backup，测试身份不能轮换/删除/管理 key。KMS datakey 默认版本必须在返回 ciphertext 中验证为 v1；当前 named key 固定，未来轮换需新 named ref 或明确版本协议，不得自动追踪 latest。

KMS/signing 会话 TTL 8 小时且不可续期，只用于独立 spike，**不是生产 capture 任务的 task-scoped 会话证明**。过期后需要操作者重新签发；不得静默回退到 root。Evidence 身份是仅限本测试前缀的静态测试账号，随环境删除；不是生产短期写 grant。各身份的 Secret 名称/UID/resourceVersion 均在 handoff 中；A 的测试 Pod 只应挂载该项测试必需的身份，而非 root/recovery 或所有身份。测试账号和 key 名称是非敏感别名，Secret 值不出终端。

部署内置检查仅包含：KMS v1 roundtrip、生成身份不能解密、三把不同公钥、各自签名/验签，以及六项跨用途签名拒绝。MinIO 创建 bucket/用户/policy 不等于 Evidence 数据面通过。A 仍须执行完整范围/撤销/轮换/历史验签、Evidence Range/checksum/读写删/越权/TLS、provider-proof 等检查；输出保持 `provider_capability_approved=false`、`disaster_recovery_eligible=false`。

## 测试结束清理

服务是交给 A 继续测试的临时资源，所以部署成功后暂时保留。A 测试结束后使用本次输出的 namespace 和 UID：

```powershell
node .\scripts\system-backup-d-provider-lab.mjs cleanup --ssh-host root@10.130.14.23 --namespace '填写本次sbk-provider-zh名称' --uid '填写本次UID' --ssh-password
$cleanupExit = $LASTEXITCODE
Write-Output "provider_cleanup_exit=$cleanupExit"
```

清理使用 Kubernetes DELETE 的 UID precondition，删除 namespace 内测试密钥/凭据/桶数据和 PVC，并等待对应 Kubernetes PV 消失。未通过不声称清理成功；不强制删除底层 Longhorn 资源或共享镜像缓存。用户构建的镜像/仓库 tag 生命周期由操作者管理，不自动删除 registry blob 或共享 node cache。

本地验证不安装依赖，使用 `python -B scripts/system-backup-d-provider-lab.test.py` 和 Node 语法检查。测试包含编排/拒绝/敏感输出、mc 参数、闭集诊断及现有 OpenSSL 的严格 X.509/错误主机名校验，测试私钥临时目录在结束后删除。mock 和本地证书检查不能替代远程 provider 交接验收。
