# A evidence S3 HTTP 适配器（2026-09-29）

`backend/internal/systembackupevidence/s3.go` 实现现有 `Store` 接口，接入加密 framing、Publish 收敛和 GC。它使用固定 HTTPS endpoint、CA、region、bucket、root、installation 及受信 registry identity/version；不会从 Admin 输入接受 URL、凭据、bucket 或根路径。当前交付是客户端和本地 TLS 合成测试，尚未接入生产 STS resolver 或 C 的权威不存在证明 verifier。

## 请求和版本约束

每次操作通过 `S3Credentials.Resolve` 取得新鲜凭据。授权 scope 包含完整 Ref、操作、写入/删除的对象摘要和长度、Range 边界、写入截止时间。Resolver 必须基于实际 registry、任务/claim、owner、配置和撤销状态校验并取得真实 STS 授权；把请求 scope 原样复制到返回结构本身不是授权。适配器拒绝不匹配 scope、缺失 session token、过期凭据和不合法的 ref/root；每次调用清零返回的独占凭据字节副本。Go/SDK/HTTP 内部字符串副本不受完整内存清零保证。

使用仓库已有 `minio-go/v7/pkg/signer`，没有增加或安装依赖。SigV4 请求仅在客户端内发送，不向 Admin 返回预签名 URL，也不记录 URL、密钥或 provider 原始错误体。签名覆盖请求方法、路径、精确版本 query 和相关 header；有效期最多 60 秒，并取 credential、调用 context 和 owner 写入 deadline 中最早的值。禁用环境代理、redirect、压缩及连接复用；不给写入 body 设置自动重放函数。请求有 TLS/header/body 时间和大小限制。

根据 [S3 预签名请求语义](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)，到期约束针对请求准入，不能证明已经接收的上传在截止时间后绝不提交。客户端截止会停止等待；丢失响应仍按 `write_unknown`/精确 Stat 收敛，不能把网络取消当作 provider 回滚，也不能恢复已终结 owner。

- **Put**：只对未发布 ref 执行一次 single PUT，发送签名的 `If-None-Match: *`、Content-Length、payload SHA-256 和原生 checksum header；使用 `Expect: 100-continue` 允许 provider 在接收大正文之前返回拒绝。拒绝已发布版本写入；409/412 返回冲突，不盲重放。成功响应必须携带有效版本和匹配的完整 SHA-256。参考 [PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)。
- **Stat**：发送 checksum mode，检查原生 SHA-256 与对象长度，不接受 ETag 或自定义 metadata 代替 checksum，也不接受复合 checksum。pending/write_unknown 仅可对已登记唯一对象 key 发现版本；版本登记后每次 HEAD 都指定且复核它。参考 [HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)。
- **Range**：必须指定不可变版本；单次最多一个加密 frame，核对 206、完整 Content-Range、长度和返回版本，完整读入有界密文后才交给 envelope 校验。200、短 body、重复版本 header 或错误 range 不暴露正文。
- **Delete**：仅针对指定版本；删除前重新核对同版本 Stat 的 SHA-256/长度。204 只作为操作回执，之后仍必须取得权威不存在证明才允许 GC 清除登记中的 payload。允许缺失或单个 `x-amz-delete-marker: false`，拒绝 true、重复或其他值。参考 [DeleteObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html)。

支持的 profile 是 path-style、versioned S3、single PUT、完整原生 SHA-256；不自动回退到 unversioned、multipart、unsigned payload 或普通删除。旧 lab 的静态身份/未版本化数据面记录不证明这些新要求已满足。

## 不存在证明边界

构造器必须接收 `S3AbsenceVerifier`；没有“默认信任 404”或“DELETE 204 即删除完成”的实现。每次 Absent 发出新的随机 challenge，verifier 必须认证 C 的 issuer/provider proof，绑定 endpoint/bucket/root/CA 身份、完整 key/version、读取权限和一致性窗口。返回值还须匹配 challenge，观察时间不得早于本次查询、不得在未来，有效期不得超过 30 秒。

pending intent 的无版本查询要证明整个 exact key 不存在，不能把 latest delete marker 当作历史版本不存在。published ref 的 GC 要证明准确版本不存在。这个接口仍需 C 的真实实现；测试中的内存对象状态证明只用于验证接点和失败处理，不是可部署的 provider proof。

## 验证与剩余交付

本地 TLS 服务独立验证实际收到的 SigV4 签名、签入的 header 和版本 query，并验证条件写入、SHA-256/长度。测试将真实 S3 HTTP 客户端接到现有 Service，覆盖丢失 PUT 响应后收敛、跨块读取、条件冲突、删除回执不足时保留 typed ref、补齐证明后 GC；另覆盖异常响应、scope、凭据、TLS 和证明绑定。

验证入口保持 `scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`，不带 `-Remote`。本轮最终运行通过：16 个 Go 顶层测试、61 个子用例，包耗时 3.328 秒；其中 S3 新增 6 个顶层测试和 34 个子用例。Linux/MySQL 探针及 migration runner 编译成功，runner 退出 0，隔离构建产物/cache 已清理。Go 格式检查通过；原有 10 个 evidence/Transit Go 文件与上一轮摘要一致，go.mod/go.sum 未改动，没有安装依赖。

首次运行有一次断言失败：大于 1 MiB 的条件 PUT 提前被拒绝时返回 `artifact_unavailable`，没有得到测试期望的冲突结果，runner 退出 1 并清理。加入 `Expect: 100-continue` 后，该场景及完整套件通过；同时补齐合法的 delete-marker false、重复/异常 marker 和删除/Range 边界验证。旧失败未计为通过，也没有跳过 vet 或重试断言失败。

本轮 [完整本地输出](evidence/system-backup-a-evidence-s3-local-20260929.txt)和 [源码/构建绑定记录](evidence/system-backup-a-evidence-s3-local-20260929.json)单独归档。四条本机 bad-certificate 提示来自 S3/Transit 的预期 TLS 拒绝测试。没有执行真实 MySQL 或远程 provider 测试；先前 MySQL 和 Transit 记录保持原版本、原范围。

下一步仍需生产 STS resolver（含任务级限制和撤销）、C 的真实不存在证明、已准入的版本化 bucket/checksum profile、独立 Transit evidence key/ACL 与实际 redaction/schema validator。D 接正式 GC migration、SQLPolicy、session/RBAC、HTTP 和调度。没有更新 capability approval、本人 MFA 或配置激活；远程测试准备就绪前不复用旧成功记录作新能力验收。
