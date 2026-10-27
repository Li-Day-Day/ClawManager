# A evidence Transit KEK 适配器（2026-09-28 开始，2026-09-29 本地验证通过）

后续 [下载运行装配增量](system-backup-a-evidence-download-runtime-20260929.md) 已增加 SQL 下载会话绑定的专用 JWT 短期解包 resolver。本文“没有真实 resolver 实现”指此前版本；任务侧 wrap、远端角色/ACL 和生产接线仍待交付。新 batch profile 的 TTL/撤销限制以新文档为准。

本轮在 `backend/internal/systembackupevidence/transit.go` 增加真实 HTTPS Transit encrypt/decrypt 客户端，接现有 `Keys` 接口。已有 framing/登记/GC 代码不变。实现与本地 TLS 模拟服务测试不等于真实 OpenBao 现场验收；此前 `sbk-mig-260928090803-518e` 的 MySQL 成功记录保持原范围，不覆盖本轮新适配器，也无需为本轮重复 MySQL 套件。

## 接口及凭据要求

`NewTransitKeys(TransitConfig, TransitCredentials)` 接收经控制面准入的固定 endpoint、installation、逻辑 KeyRef、具体 Transit key 名与正整数 key_version，以及 CA 原始字节和 SHA-256。构造器不接受 HTTP caller 提交这些参数，拒绝 HTTP、userinfo、query/fragment/path、非法 key 名、零版本、CA 指纹不匹配及无法解析的 CA。配置结构自身不是远程 key 独立性或权限检查证明。

`TransitCredentials.Resolve` 每次调用获取新鲜授权；返回值必须绑定同一 installation、完整 KeyRef、此次 `evidence_dek_wrap` 或 `evidence_dek_unwrap` 操作与到期时间。适配器不缓存 token；过期、撤销解析失败、用途/安装/ref 不符会在网络请求前拒绝。提供者应返回独占 token 字节副本，调用后适配器清零该副本。HTTP 请求的 deadline 不晚于凭据到期；响应回来后也会复核到期。Go 的 TLS/JSON/HTTP 内部可能产生不可直接清零的副本，不能据此声称实现了整个进程的秘密内存擦除。

真实 resolver 仍需接受信 Secret/凭据系统的 UID/resourceVersion、用途、撤销和任务范围校验；此包没有允许所有请求的生产 resolver。测试里的 resolver 仅用于合成凭据。

## Provider wire profile

采用 OpenBao 官方 [Transit API](https://openbao.org/docs/api/secret/transit/) 的 encrypt/decrypt 接口：本地随机生成的 32 字节 DEK 经 encrypt 包装，unwrap 经 decrypt 解包。Wrap 显式发送正整数 `key_version`，不接受默认 latest；解包前先核对 `vault:v<固定版本>:`。该适配器只支持 `aes256-gcm96` 包装 32 字节 DEK 的 60 字节二进制 frame，其他 key 类型需单独实现 adapter。

由 `EvidenceTransitContext(installation, KeyRef)` 生成固定 base64 context；其原始 canonical JSON 字段为 `purpose=system-backup-evidence-dek.v1`、installation_id、key。把该准确值钉在两类 token 的 ACL 中。Context 将 evidence 与 capture/signing 分开，并绑定安装和完整逻辑引用；不能把其他用途的 context 改个调用标签后复用。

Wrap：`POST /v1/transit/encrypt/<固定key>`，只发送 plaintext（base64）、context、key_version。Unwrap：`POST /v1/transit/decrypt/<固定key>`，只发送 ciphertext、context。禁止由调用者选择 path、key、版本、batch、nonce、type 或 response wrapping。没有自动重试或自动创建 key 的路径。Provider ACL 必须只给已有 key 的 update，拒绝 create/upsert/export/管理；构造器不会创建或轮换远程 key。

仅用固定 CA 验证 HTTPS，不使用环境代理，不跟随 redirect，限制 TLS/HTTP 超时、响应 header/body 大小，拒绝压缩响应。严格检查重复 JSON 字段、尾随 JSON、错误/response-wrapping envelope、版本不符和异常 DEK 长度。所有失败只返回 `encryption_key_unavailable`，不把 provider 错误体、token 或 DEK 写入日志或错误消息。已验证正文/密钥的副本按接口生命周期清理。

## 部署前缺项

### 历史密钥路由增量（2026-09-29）

`NewTransitKeyring(installation, configs, writeKey, credentials)` 现提供单安装的不可变路由快照，可直接作为现有 `Service.Keys` 或 `Prepare` 的 Keys 参数。每条配置仍通过 `NewTransitKeys` 验证，重复完整 KeyRef、跨安装映射、无效配置以及未登记的当前写入引用会拒绝整个构造，不发起 provider 请求。

新写入只接受明确指定的 `writeKey`；旧引用保留用于解包。读取使用 envelope 已绑定的完整 identity/version 定位唯一 adapter，未知引用、旧 provider 拒绝或实时凭据解析失败直接返回 `encryption_key_unavailable`，不尝试当前密钥或其他 provider。传入 nil writeKey 可构造只读集合。配置切片、CA 字节及 writeKey 指针后续被调用者修改，不会重定向已经构造的集合。每次操作仍重新解析凭据，不缓存 token 或 DEK。

路由快照解决历史读取的组件接点，不执行远程 key rotation、历史引用登记、授权撤销或密钥删除。替换快照不会自动撤销旧进程持有的快照：D 必须在登记/claim 准入时拒绝过期配置，凭据服务和 provider ACL 必须拒绝旧写入权限。历史引用仍按保留/引用约束保留；`Close` 仅释放空闲连接，调用方在该快照的在途请求结束后调用。不能将只读集合或本地测试视为灾备验收。

新增测试使用两台本机 TLS 模拟 provider、不同 KEK 材料及显式内部版本 1/2，经过真实 Prepare/OpenRange 验证轮换后旧/新 evidence 的跨块读取。另覆盖旧引用写入拒绝、失败时不回退、resolver 撤销、调用者修改配置、构造失败、取消及只读模式。现场独立 key、授权/历史 registry 的生产交付仍按下述缺项执行。

本次完整本地入口退出 0：23 个 Go 主测试、114 个子用例通过，包耗时 3.198 秒；新增 2 个主测试、8 个构造拒绝子用例，其余轮换断言在主用例内。Linux/MySQL 探针及 migration runner 构建通过，隔离 cache/二进制/遥测目录清理完成，未安装依赖或执行远程测试。见 [本次输出](evidence/system-backup-a-evidence-keyring-local-20260929.txt)及 [源码绑定记录](evidence/system-backup-a-evidence-keyring-local-20260929.json)。此前内容校验记录中的 21 项 backend/scripts 源码绑定未改变；本轮只新增两个 Go 文件，不回写历史 receipt。B/C 暂未接入由操作者确认，日志采集和不存在证明仍待其生产接点。

现有 lab 初始化创建的是 `d-kek-v1`，其 context 为 capture 用途，身份提供 datakey/decrypt 权限。它不是本组件所需的独立 evidence KEK/Wrap/Unwrap 授权，既有 lab 成功记录不能直接作为这里的生产输入。

需要实际交付：独立且已存在的 derived `aes256-gcm96` evidence key；不可变 KeyRef 到 endpoint/key/version 的受审映射；固定 context；分离的 encrypt/decrypt 身份与 provider ACL；历史版本读取和保留；实时凭据 resolver。必须验证 disabled export/plaintext backup、用途隔离、准确版本、到期/撤销和错误 context 拒绝。现有 capture/signing key 和身份不应被改写或扩权来满足此组件。

后续仍按既有分工推进 S3 精确版本/受限写入及权威不存在证明，接真实 redaction/schema validator；D 接控制面引用/权限、正式 GC migration、HTTP 路由和 reconcile 调度。目标未完成，不更新 capability approval、本人 MFA 或配置激活状态。需要远程操作前另给完整隔离验证命令，本轮没有执行远程操作。

## 本地验证

测试使用本机 TLS server 模拟 provider，执行真实 AES-GCM 和现有 Prepare/OpenRange，覆盖跨块读取。负测覆盖版本/响应版本字段不一致、403、redirect、超限/压缩响应、重复与尾随 JSON、200 中 errors/wrap_info、过期/安装/ref/用途错误的 grant、resolver 错误、请求途中凭据到期、异常 token、错误 ciphertext、短 DEK、TLS CA/hostname、配置错误和 context 隔离。

执行入口为 `scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`，不带 `-Remote`。保持 vet，依赖只读且断开 Go dependency proxy；构建产物和 cache 在 finally 清理。

2026-09-29 完整运行通过：10 个顶层测试、27 个子用例（9 个下载、18 个 Transit 失败场景），包耗时 3.224 秒；Linux/MySQL 探针和当前 migration runner 编译成功，runner 退出 0，报告 `CLEANED local-registration-build-cache=True`，结束后复查无本轮 scratch。Go 格式及 3 个 PowerShell 文件语法检查通过。TLS 拒绝测试产生的两条 bad-certificate 提示属于预期负测，不是 provider 现场结果。

开发中有两次失败：首次合成服务等待未读 HTTP body 的取消信号导致测试收尾阻塞，已给该测试处理器消费 body 并设置等待上限；当时仅终止已核对路径的本轮测试进程，runner 失败并清理。第二次 Go 测试通过（2.752 秒），但 Linux 编译的 `asm.exe` 退出 `0xc0000043`，runner 失败并清理。重试 helper 现只对已观察到的 vet/asm 精确进程退出码最多重试 3 次，原命令最终退出 0 才通过；断言失败/panic 不重试，也不涉及远程请求。14 项 helper 策略/原生 stderr 用例在当前 PowerShell 与 Windows PowerShell 5.1 通过，包括带空格的参数边界和持续失败终止。

本轮源码摘要、构建摘要和验证范围见 [本地验证记录](evidence/system-backup-a-evidence-transit-local-20260929.json)。原来 MySQL 验收绑定的 8 个 Go 文件、DDL 摘要和 migration runner 摘要均保持一致；新探针摘要另行登记，不改写历史 receipt。没有安装依赖或执行远程测试，没有批准 capability、本人 MFA 或配置激活。
