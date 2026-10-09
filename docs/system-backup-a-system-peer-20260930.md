# A 系统 producer mTLS 主体证明

日期：2026-09-30。作者 A，交接对象 D。承接 [系统 Transit 准备入口](system-backup-a-system-transit-20260930.md)及 [D 四命令生命周期](system-backup-d-producer-lifecycle-20260930.md)。本轮实现真实 mTLS 传输身份校验和不可从请求 JSON 构造的证明对象，为 D 的生产 Authenticate/最终复查提供输入。它尚不是完整 C1 AuthenticatedPrincipal，也不授予部署、管理、evaluator 或 provider 权限。

## 认证与固定绑定

[SystemPeerAuthenticator](../backend/internal/systembackupevidence/system_peer.go) 从独立部署映射构造，固定数据库 UUID/库名/installation、issuer identity、workload subject、客户端 CA 摘要、准确叶证书摘要和原准入截止。映射必须来自受信部署注册表，不能从 HTTP body、候选配置或本次 capability 结果构造。Subject 是受信映射的标签，不读取请求 header、证书 CN 或未验签 JWT 来赋予身份。

AuthenticateRequest 要求已完成且已验证的 TLS 1.2 以上握手；使用自己的固定 CA 重新验证 client-auth 证书链，并核对精确叶证书指纹。同一 CA 签发的另一张证书仍拒绝。拒绝代理 header 冒充、无客户端证书、未完成握手、未验证链及缺失/畸形证书输入。不能把普通反向代理传来的证书 header 当作本入口的认证依据。

成功返回字段私有的 `SystemPeer`，仅属于该 authenticator 实例和原 HTTP 请求上下文。证书 DER 被复制，修改调用方 request 中的切片不会改变证明。JSON 编码与解码拒绝，零值或其他实例的证明无效；原请求取消/结束后不得转交后台任务继续使用。

身份摘要采用三个独立内部域的闭集 JSON SHA-256：workload 摘要绑定 scope、issuer 和 subject；actor 摘要额外绑定 CA/精确证书；admission 摘要再绑定原截止。更换证书会改变 actor/admission 摘要，保持相同 workload 标签的摘要稳定。这是 A 的内部映射细化，不是 D 的 C1 typed-frame，也没有代替跨 owner 合同签收或注册表唯一映射审查。

## 事务内复查

`Check(ctx, peer, scope, dbNow)` 只做本地校验，不查询数据库、不读取文件、不调用网络、不新增锁。scope 与 dbNow 必须由 D 已核对身份的事务提供，不能接收请求自报值。它检查：

- 原请求与当前操作均有效，证明属于当前实例，scope 完全相同。
- 数据库时间为 UTC 微秒精度，与本机时间相差不超过五秒。
- 证书链和原准入在本机当前时间、数据库采样时间上均有效；不借复查刷新原期限。
- 返回固定摘要、subject 与原证书/准入截止的最小值，供 D 当前授权与最终 Guard 比较。

`Close` 使本实例签发的证明在本机失效。它不等于共享 domain/部署撤销、不取消其他进程或已经发出的远端操作。共用 pinned-peer 校验增加了显式时间参数的内部实现，既有 task/download/GC 路径继续使用当前本机时间；同时对 nil 证书元素拒绝，避免畸形本地 TLS 状态引发 panic。

## D 接入顺序与未完成检查

1. 在可信 HTTP/TLS 宿主入口调用 AuthenticateRequest；不要通过反序列化普通数据、代理 header 或调用方 actor hash 生成证明。每次新请求重新认证。
2. 在 CommandEnvironment.Prepare 固定独立部署输入和容量报告。将该请求的 SystemPeer 放入服务端私有会话；不要放进需要 JSON 深拷贝的 CommandRequest，也不要把 PeerFacts 当作可复用 credential。
3. 取得规定的安装/domain/身份锁后，用同一数据库 scope 和新鲜 DB 时间调用 Check。将 ActorIdentityHash 对比请求 actor/subject、IssuerIdentityHash 对比当前部署 issuer，校验当前注册表仍认可 AdmissionHash、workload 与证书映射。
4. 继续核验共享撤销状态、domain epoch、三场景准入、host/Job UID/generation、evaluator 角色/完整槽和 operation 权限。TLS 身份通过不能设置 Management、HistoricalReceiptRead 或接受 termination decision；这些都需要独立授权。
5. 最终 Guard 对同一个私有证明再次 Check，并复核已经锁住的撤销/部署/角色/lease 事实；Guard 后新鲜 DB 时间检查仍保留。网络断开导致原请求取消时，禁止继续提交。

D 已提供 BeginCall/RecheckCall/BindObservation 的本地实现接口，但其生产 ExecutionEnvironment、真实 CommandEnvironment 尚未接入此组件；系统 Wrap/STS/发布/历史恢复也不能仅凭 SystemPeer 执行。无配置路径的独立部署信任、Job 宿主验证、跨实例撤销和紧急管理通道仍需对应 owner 完成。本轮没有增加生产路由、DDL、公共字段或批准标记。并行更新后的 D 源码不自动属于本轮已测快照，准确边界以机器记录中的输入及变化列表为准。

## 本地验证

[测试](../backend/internal/systembackupevidence/system_peer_test.go) 使用真实本地 TLS 握手、签名证书及 client-auth 验证，覆盖正确证书、同 CA 不同叶证书、无客户端证书和伪造 header；另覆盖 scope/实例/时钟隔离、JSON/零值拒绝、原请求取消、调用方 request 修改、证书 pin 轮换、错误 CA 和原准入截止边界。TLS 证明检查不触发 SQL；这些用例不代替生产注册表/撤销/host 或真实 MySQL 行锁验证。

执行 [冻结快照验证脚本](../scripts/system-backup-a-producer-adapter-validation.ps1)，包含完整 evidence/producer 两包测试、默认 vet 和 Linux evidence 测试二进制交叉编译。GOPROXY/GOSUMDB 关闭，不安装依赖；临时源码、缓存和二进制在结束后清理。结果与输入指纹见 [机器记录](evidence/system-backup-a-system-peer-local-20260930.json)。此前已成功的 MySQL 套件没有重跑。

Windows 两包回归通过 126 个主测试、1195 项含子测试记录；本轮新增 SystemPeer 的 4 个主测试、32 项含子测试记录全部通过。测试输入为 209 个文件的逐字节快照，测试断言失败为零。该计数包含既有用例，不代表新增 1195 个用例。

Linux evidence 测试二进制交叉编译及默认 vet 通过，未在 Linux 执行该二进制；验证进程退出 0，无编译器故障或重试。快照本身保持不变，A evidence 源码仍与快照一致；D 的 execution.go、execution_policy.go 及新增 execution_test.go 不在本次最终版本验收范围。脚本确认本轮源码副本、缓存、临时目录、遥测目录和二进制均已删除。
