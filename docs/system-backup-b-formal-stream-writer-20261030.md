# B 正式流式 writer 与新 native ABI 接收说明

基线 `d94e22102f0dc6279522c6a7487156370bd90f4a`，本轮均为本地未提交增量。没有安装依赖、现场执行、迁移、提交或推送。本文区分可调用的 writer、尚未启用的公共生产装配与未完成验证，不将本地候选视为正式备份成品。

## 1. 实际入口与调用链

```text
backup-worker --formal-config <原 invocation 固定 SHA 的公共映射文件>
  原 mTLS/Pod Ready
  LoadFormalCaptureMaterials（固定原字节/闭集配置，非注册准入）
  NewCaptureKeyJob（原 Job reserve/begin/end + A provider permit）
  RunFormalCapture
    C KeyRequest/KeyContext → EncryptStream
    同步 workspace tar/gzip 或已有只读 SQL snapshot 编码
    WriteUnpublishedFile → CMBKGC01 密文 → 单 entry C envelope 候选
    同一原 Job/nonce 再检查 → 输出候选 receipt
```

实际 CLI caller 位于 `backend/cmd/backup-worker/main.go`，不再只有 `NewCaptureKeyJob` 的定义/测试引用。新增入口需要原冻结 Invocation 的 `ProviderKey`、`FormalCapture` 和 `--formal-config`；任一缺失拒绝，不进入 functional Acquire/Complete，不获取 Lease.DEK，也不借用 unwrap。旧 invocation 不含新字段时，其 JSON/hash 和原 functional 路径保持兼容设计；worker 组合仍待本机编译验证，不能据设计声称回归已通过。

现有 Job 工厂、材料 ConfigMap/permit/JWT 挂载与正式 controller 接收端尚未自动启用此分支；需要 D/A/C 按下表共同装配。没有修改 public acceptance/readiness、业务 gate 或创建另一个控制面。

## 2. 流式格式与安全边界

实现 `backend/internal/systembackupwire/stream.go`：

- 直接消费原冻结 C `KeyRequest` / `KeyContext`，包含安装/task/attempt/phase/part/part_index/envelope_id/capture_context_hash。**不从 inventory/checkpoint 计算并冒充 capture context，也不认证调用者自报 hash**。D/C 仍须交付其真实业务来源与签收；A 原授权将完整请求、invocation hash 和 Job 身份绑定。
- 单次 key callback、单个压缩归档路径；一帧最多 1 MiB，完整 41-byte header、GCM tag、连续索引和独立加密 EOF；复用 C `ChunkAAD`，frame SHA 覆盖完整 header/cipher/tag。
- 生产 nonce 使用 crypto/rand；同 DEK 内记录 nonce，重复重新取样且最多 8 次，持续重复/随机源失败拒绝。MaxFrames（含 EOF）最多 65536，限制元数据内存；MaxPlaintextBytes 限制压缩后的输入，另保留原 workspace/SQL 限额。
- 同步 push producer，没有后台 pipe/goroutine；produce 完成后关闭 writer，禁止晚到 Write。任何生产/输出/nonce/取消/容量失败返回零 seal，不接受部分结果。
- 持有 DEK 的范围只在原 Job 同步 callback。复制的 key/plain buffer 尽力清零，输出没有 key，cipher 引用被释放；不承诺 Go AES 展开密钥、SIGKILL/OOM 或运行时所有拷贝的安全清除，原内存/no-swap/core-dump 条件仍需部署验证。
- `StreamSeal.EnvelopeJSON` 仅接受同一完整 request 与对应 wrapped key，输出 C 单 entry envelope 的精确 JCS 字段/顺序、base64url 无 padding 和 chunk metadata。闭集字段编码器只处理本 envelope 的字符串/整数/bool，**未替换原通用 JCS 依赖**。C 独立 golden 的完整帧及完整 envelope 已逐字节一致。
- crypto 层支持 C Secret variant 以执行原向量；生产 FormalCapture 必须通过原 KMS Generate Access，不提供 Generate→Secret/随机 staging key 的降级。

分项文件仍是未发布候选，C 最终 owner 必须汇总全部 entries、排序、校验并形成不可变成品。单 part envelope 不是最终 manifest、capture certificate、acceptance 或 catalog。

## 3. 原 Job 使用期与候选输出

`CaptureKeyJob.Recheck` 用于 callback 外的原 nonce/授权复查。callback 中 `OriginalKeyAuthority.WithUse` 已持有本地 mutex，不能再次调用加锁 Recheck；本轮新增 worker 内部 `recheckDuringUse`，通过**同一原 mTLS key-check** 读取并精确比较原 Job、invocation、grant、authority hash、nonce、Access、Until，且只接受 `using` 状态。它不 reserve/begin/续约，也不持有跨网络 SQL 事务；A 需复审该共享 key-use 增量。

每个密文帧实际写入前后、源编码前后都做原使用期复查；结束后原 key-end、provider 授权复查及候选返回前的 key-check 继续执行。复用原物理 StopJob/Stopped 才能证明已获准的进程退出，远程 revoked 标记不能独立证明停写。

候选文件沿 `staging.WriteUnpublishedFile` 的 O_EXCL partial、文件 fsync、create-only hardlink、只读 final 和目录 fsync 路径创建；原 SealFile 复用同一实现，旧格式没有改名或隐式升级。只清理本调用确切创建的 partial，不删除外来文件。

已存在候选/partial 在 Generate 前拒绝。两文件（cipher 与 envelope）不构成跨文件事务：后续授权、provider end、输出或目录同步失败可能留下候选，**返回零结果，由原 owner 读回/隔离/清理，不重新 Generate 同一 envelope，不盲重写**。`provider_outcome_unknown` 保留原 ErrUnknown；底层错误不包含路径/凭据。不同 part 的 envelope 名也纳入原模块 staging 重名检查及诊断。

FormalCaptureResult 是 `public-c-stream-candidate.v1alpha1`，含原 invocation hash、两个 local receipt 和源统计。stdout receipt 或 Kubernetes JobSucceeded 都不授予任务终态。**没有调用旧 Complete**：D 当前 observer 读取旧 CMBKENC1/AAD，而 C 新格式为 CMBKGC01，不能混用。必须由 D/C 的正式 observer/结果/证书/finalizer接收后再推进任务。

## 4. 输入合同与最小接收例子

在原 journaled Invocation 中添加：

```go
inv.ProviderKey = &originalFrozenAccess // 原 Generate + 完整 C request；非 Admin JSON
inv.FormalCapture = &worker.FormalCaptureSpec{
    Version: worker.FormalCaptureVersion,
    ConfigSHA256: originalIndependentMaterialsSHA256,
    EnvelopeName: "workspace-envelope.json", // 与所有 part 输出名互不冲突
    MaxFrames: 128, // 含 EOF；MaxCompressedBytes <= (MaxFrames-1)*1MiB
}
// journal/intent/worker grant 须绑定更新后的 inv.Hash()，不能沿用旧 hash。
```

`--formal-config` 文件为 `FormalCaptureMaterials` 的 JSON（schema_version、kms、permit）。KMS 是已准入的 `systembackupkms.Config`，Permit 是原 `PermitMount`（permit path/SHA、公钥、credential directory），没有 DEK、token、私钥或 approved 布尔值；其嵌套 JSON 字段按原 Go 类型序列化。loader 验证原字节 SHA、大小/重复/未知字段和精确映射，**不将一个同形 Config 或 permit 引用视为已获准**，签名/当前权限继续由 A 原 resolver 检查。

CLI 使用现有 request/control-ca/client-cert/client-key/workload-token 参数，再显式挂载 `--formal-config`。D 需以受审 typed Job 配置添加只读材料、permit、JWT/凭据引用和参数；不开放任意 command 或全盘挂载。原材料应作为 original Job intent 的一部分留存并可接管核对。

SQL 库层复用 `domain.CaptureSource` 的只读数据库身份/UUID/权限/schema校验和 bounded snapshot 编码；不新增 schema discovery/迁移。**CLI 数据库模式目前在 key reserve 之前拒绝**：A/D 尚未提供正式 provider-mode 的独立 SELECT-only 数据源凭据交付；不能从 KEK permit/public JSON 读取 DSN 密码，不能复用旧 functional acquire。库调用者必须提供原已准入 `FormalCaptureEnvironment.Database`，当前未宣称该生产 caller 已交付。

## 5. native ABI 与源认证测试适配

本地 `runtime_profile_test.go` 现使用 HTTPS GET fixture、runtime-locator.v2、native operation/restart digest 和 D `GatewayControl`。停止/恢复只经回调，若调用旧 HTTP DELETE/POST 则测试失败。它是 native ABI 回调模型，不是假 Agent 物理证明或 D SQL 测试。

该 profile 显式注入 VerifySource，核对读取前后同一 sql.Tx、查询边界和完整 inventory；增加首检/末检撤权后不进入模块/writer/Job 构造、无 source write、事务回滚的用例。模块正式 envelope 输出碰撞也有独立有效 fixture 与负例。

## 6. D/A/C 必须接收与尚缺输入

| Owner | 本轮可接收的实际代码 | 仍需交付或共同决定 |
| --- | --- | --- |
| **D** | 原 backup-worker CLI consumer、FormalCaptureSpec/materials SHA、候选 receipt、native callback/VerifySource 测试。 | 原业务冻结 Access/Context 的实际 caller 与同一 capture point；最终 invocation/Job/Pod/SA/grant SHA；typed Job 的只读 formal-config/permit/JWT 挂载与 args；正式 C 格式 observer/结果 journal/取消接管/旧候选 unknown 收敛，不能使用旧 seal observer；实际源认证与完整 mount/writer 证明。 |
| **A** | NewCaptureKeyJob 直接消费、原 nonce 的 Recheck 与私有使用期 key-check、无 DEK 控制传输、unknown 分类；请复审 key_use.go/key_use_test.go 的窄增量。 | 已准入 Config、独立 permit/pin、精确 role/policy/JWT/当前撤销来源；生产 DB 的独立只读 credential lease（当前 key-use lease 明确不携带 Database）；实际 revocation/StopJob proof。未装配的 KEK CompleteScan/独立 mapping 仍须完成。 |
| **公共 C** | 精确 CMBKGC01/AAD/envelope 实现与独立 golden 一致结果、part-local wrapped-key/chunk/receipt。 | 完整冻结 capture context 业务字段/来源签收，跨 part envelope/index 合并与不可变发布，capture certificate 的原事实与 signer authority/历史 reader；正式校验/独立还原接收。候选不能自签成功。 |
| **Teams / Skills** | 现有模块入口保留，新 envelope 名也检查碰撞。 | 各域真实同步 producer、对象/SQL/Redis/workspace的一致性与完整 writer/结果合同。当前 generic worker 源生产器只实现原用户/实例 SQL 和 workspace，不冒充其他域已接。 |
| **构建/现场 owner** | 原始源码 pin、C golden/staging 测试记录、未运行测试列表。 | 现成准确 JCS module cache或已有构建环境；同版本 App/worker/Runtime、隔离 SQL/存储/密钥引用与真实门禁/停止/恢复/封存验证。 |

完整正式 task→产物→独立还原不在本轮被宣称完成。新模式未自动注册到现有部署，未放宽 acceptance/readiness 或原授权。

## 7. 准确验证

见 [证据目录](evidence/b-formal-stream-20261030/README.md)。wire 全包与 staging 全包、这两包 vet 通过。新 worker/CLI/native 模型源码已添加，但因缺少精确 JCS 依赖而 **尚未类型检查/编译/执行**；只做最终语法解析。没有安装依赖、使用替身库或把旧通过结论套到新代码。
