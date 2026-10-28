# 现场备份 provider 初选

状态：测试 lab 服务已恢复，部分候选材料已创建；尚未完成新安装授权、正式装配或真实备份验收。适用于 `installation_dfa02579009349938c8125490d9dfd41` 的首次准备，不构成 bootstrap grant。

- artifact 和 catalog：拟使用专用、启用对象版本控制的 S3 兼容存储，分别设独立 bucket/root 与受限身份。catalog 必须由 C 确认正式发现和不可变记录合同。
- evidence：拟使用另一个独立故障域的 S3 兼容存储，独立 bucket/root，分别配置精确 write、read、delete 身份及保留策略。不同 bucket 或名称不证明物理故障域隔离。
- backup KEK、evidence KEK 和三个专用签名用途：拟使用受控 OpenBao Transit，分别配置 key、精确版本、最小权限和保留历史。实际 backup 操作组合及签名 wire 仍需 B/C/D 确定；现有测试 profile 不能升格为生产。
- 现有 namespace 中的 MinIO 只作为待核查的候选，不假定支持所有能力或与源数据隔离；当前公共信息未证明上述专用存储、OpenBao、凭据和生产 ACL 存在。

2026-10-28 用户执行公共资源盘点：目标 namespace 的 `minio` Pod 在 `k8s-master` 运行，`minio-data` PVC 为 Bound、10Gi、manual；全局输出还显示 `sbk-provider-zh-7474d6e0b052` 中的 `bao` 和 `minio` Service。该输出没有证明 Service 的 endpoints、后端工作负载、存储位置、凭据、TLS 或操作能力。历史 [lab 环境观察](evidence/a-live-chain-environment-review-20261021.json)记录该 lab 的 CA 在当时已过期，不能把该 lab 自动视为本安装的生产 provider。用户本次输出同时确认 MySQL 当前 Pod UID `6d314752-86e1-41ce-9831-af03179dcf3b`。以上为操作者转述而非独立采集。

后续公共输出：目标 MinIO Pod UID `2b674b10-0360-4164-8055-022c46991d17`，镜像标签 `10.130.14.23:5000/minio:2026.6.5`，Service endpoint 存在。目标 MySQL 和 MinIO 均运行在 k8s-master，两个 manual PV 为该节点上的不同 hostPath；不能作为节点故障隔离的证明。lab namespace UID `a285351a-b52a-4b91-af78-1e5fa8e78387`；lab MinIO Pod 在 node1，Service 有 endpoint，PVC 2Gi longhorn；Bao Service 无 endpoint，bao-data PVC 为 1Gi longhorn。lab 仍是另一安装的历史测试环境，位置不同不证明独立存储故障域或授权，Bao 当前没有可用后端的证据。以上为用户转述，未观察 Secret、provider ACL、对象版本或物理副本拓扑。

进一步的操作者输出显示两个节点 `k8s-master` 和 `node1` 均 Ready，Longhorn StorageClass 存在，lab 两个 PV 的 CSI driver 均为 `driver.longhorn.io`。lab MinIO 是 node1 的独立 Pod，使用 digest 固定镜像及 PVC，lab 中未列出 Deployment 或 StatefulSet。PV 本身无 node affinity；这不表明 Longhorn 数据副本的落点或可用容量，也不证明离线恢复能力。两个节点同集群，不能据此声称集群或站点级灾难隔离。

Longhorn 后续操作者观察：两个节点的磁盘 Ready/Schedulable，输出的可用字节分别约 2.24 TB 和 2.02 TB；只是瞬时磁盘数据，不能替代容量预算和预留。lab MinIO 卷 attached/healthy，两副本分别在两个节点运行；Bao 卷 detached/unknown，两副本停止。仅证明当时卷状态，不证明业务 bucket/version/ACL、provider TLS、跨集群隔离或灾难恢复。旧 lab 创建脚本将其明确标为 same-cluster-only，证书有效期 7 天；旧信任与身份不能自动继承。

操作者随后报告旧 lab CA 和 Bao 证书均于 2026-10-01 到期。按本交接的现场恢复命令创建了 `bao-tls-recovery-20261028` Secret、`bao-trust-recovery-20261028` ConfigMap 和挂载原 `bao-data` 的 `bao-recovery-20261028` Pod；Pod Ready，Service endpoint 为 `10.244.166.187:8200`。新 CA 指纹 `36:EC:6F:6D:D7:00:2B:A1:74:DD:0F:8B:34:0A:68:3C:00:DA:28:F6:06:AC:EC:A5:AF:30:28:E5:31:1F:A0:1F`，到期 2026-11-27 06:12:31 UTC。Ready 是 TCP 探测，不证明初始化、解封、真实 TLS 验证或授权；原 MinIO TLS 不受此次更换影响，依旧需要单独核验。此处为操作者输出转述。

首次恢复 CA 缺少 keyUsage，现场 Python TLS 严格校验返回 verify code 92，未确认 Bao 状态。操作者随后用修正证书替换 Pod：`bao-recovery-tls2-20261028` Ready，endpoint `10.244.166.187:8200`；新 CA ConfigMap `bao-trust-recovery2-20261028`，公开指纹 `0D:5D:A6:B5:BE:A5:4C:70:A9:70:14:44:75:50:6D:87:E8:17:46:6E:04:DA:C0:90:EB:C7:FE:65:C4:B8:61:33`，到期 2026-11-27 06:22:26 UTC。OpenSSL strict 本地验证通过；Python 实际服务名连接与初始化/解封状态仍待现场确认。旧恢复 CA/Secret 保留，未声明清理。

操作者后续报告 Python 实际服务名 TLS 校验成功，Bao `initialized=true`、`sealed_before=true`、`sealed_after=false`，Pod UID `a9e53b50-905a-446e-8edc-7361c45b269d`。这证明该次恢复与解封结果，不证明旧 token 有效、密钥映射获准或新安装材料已交付。

操作者报告 Bao 新 CA ConfigMap `bao-trust-recovery2-20261028` UID `dfa905e3-e00d-4c45-a955-b8547e806757`、resourceVersion `119752785`，原 PEM 字节 SHA-256 `e7ff215f4fb96613cba2c0c89e9b28afe19b412b5d63be0593843a45fe99f518`；该值与 DER 指纹不同。lab MinIO 的原服务证书于 2026-10-01 01:19:12 UTC 到期，不能用于当前 TLS 验收。

操作者之后为 lab MinIO 重建测试 Pod `minio-recovery-20261028`，保留原 PVC 与账号引用，Pod Ready，Service endpoint `10.244.166.180:9000`。新 CA PEM 字节 SHA-256 `a8f7a9e77cb410a669fef288b1fc8584ed2dbc49938f22c4923c821043792510`，证书指纹 `432bdfe0d6d09121f4234cd3b3a7af6a9bc6cc014242b58ca03f8870a7b225f8`，到期 2026-11-27 07:02:25 UTC；OpenSSL strict 离线校验通过，真实服务名连接与 S3 授权待核验。

操作者后续报告 MinIO Pod UID `6b4c3daa-d1a9-4bc7-8b63-ee46914798d9`，从 Bao Pod 通过 Service 主机名完成 TLS 校验，健康接口返回 HTTP 200。此结果不证明 bucket 版本控制、S3 身份权限或对象操作。

操作者只读管理查询：旧 `d-provider-evidence` bucket 的 versioning status 为空，三个旧 evidence 用户处于 enabled，各有同名 policy；仍未核验旧身份实际操作，也不能作为新安装授权。

后续只读核验报告 TLS 主机名通过；旧 lab 六把 Transit key 中有三个用途隔离的 Ed25519、两个 issuer Ed25519 以及一把 derived AES-256-GCM。`d-kms-generate`、`d-kms-unwrap` 和三个签名用途的旧 token 查询均返回 403，不能用于新安装。403 只表明该查询未获授权，不单凭此断言 token 一定过期。旧 key 属于 lab 历史 scope，不自动授权新安装。

操作者随后为新安装创建并回读五把候选测试 key，名称前缀 `sbk-zh08-dfa02579009349938c8125490d9dfd41-`：`backup-kek-v1`、`evidence-kek-v1` 为 derived AES-256-GCM；`capture-v1`、`acceptance-v1`、`catalog-v1` 为 Ed25519；均为 version 1、不可导出。尚未签发新用途身份或验证 ACL、操作与签名 wire，不代表 bootstrap authority；backup KEK 所需操作组合仍需 B/C 决定。原始输出由用户提供。

操作者报告目标 namespace 创建 immutable Secret `system-backup-nonce-dfa02579-v1`，UID `79a744da-147a-44bc-b0a4-a7963373916a`，key 长 32 字节。它只是候选材料：现有 `systembackupnoncebootstrap` 支持 exact-version `external_secret` 文件 profile，不能从 Kubernetes Secret UID 自行推断该 profile 的权威身份；还缺原 descriptor、identity/provider/scope、文件映射与 pins、受控授权、历史保留和真实装配。材料长度正确不构成准入。

本轮应用侧对照验证由操作者执行并贴回完整输出：原应用 Pod `clawmanager-app-788b97b78f-l8k5f` 在原策略下访问两个 lab 服务均 TCP 超时；增加临时、按 namespace/Pod 标签和目标端口限制的入站策略后，均到达 TLS 校验但报缺少本地 issuer。随后按上述固定公开 CA 执行 `scripts/system-backup-a-field-tls-check.py`，两个服务均返回 `http=200 verify=0`、`KUBECTL_EXEC_EXIT=0`，最终 `TLS_HEALTH_CHECK_OK=true`。MinIO CA 来自 `minio-trust-recovery-20261028`，UID `d8059048-e355-4549-81de-753c81c74f41`、resourceVersion `119778274`，PEM SHA 与此前记录一致。临时策略 `a-tlscheck-1148aa2a29a7-bao` 和 `a-tlscheck-1148aa2a29a7-minio` 均报告删除，`CLEANUP_OK=true`。此结果只接收本次应用 Pod、显式 CA、临时放通下的主机名/TLS 与健康检查；CA 经 stdin 输入，未持久挂载，正式网络策略、工作身份、provider ACL 和整链仍未验收。完整限定结论见 `evidence/a-field-public-inventory-review-20261028.json`；A 未自行远测。下一步需提供本安装新用途凭据的受控引用及操作范围，旧 lab token 不作替代。

在选定实际服务实例之前，须确认目标拓扑、故障域、持久性、容量、TLS 主机名、访问身份、保留策略和 operator 对资源位置的权威来源。不得填造 endpoint、bucket、key version、Secret 引用、到期时间或授权。所有 B/C 原合同、真实 adapter、独立 authority、精确 selections 和跨资源校验齐备后，才可建立受控材料和 production link，执行准入检查。此文件不能作为许可或生产配置。
