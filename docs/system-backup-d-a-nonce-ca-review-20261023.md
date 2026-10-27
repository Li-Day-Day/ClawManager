# D 对 A nonce/CA 候选的非实现者交叉评审

评审对象为 `a-nonce-ca-peer-review-request-20261023.json` 固定的 source SHA `c8cd927fb10133cabab70dd00f58dce092534d1d6e05a33a59314488a99d1e34`、383 份输入及其准确证据。请求检查原生退出 0；D 逐项核对当前来源和原证据摘要。原 8 根/54 条事件、默认 vet、两包 Linux 构建和清理仅保留 A 的本地准备含义。本轮为独立源码评审，未重跑 Go、联网、安装依赖或产生测试构建产物。

**结论：当前版本请求修改。** nonce 本地候选的实现边界可接收为后续装配输入；CA 的公开 Binding 输出保护须修复并补回归后再提交准确新版本。没有批准实际权限、原映射来源、跨资源政策、实际 MySQL 或生产装配。

## D-A-CA-01 / P2：CA Binding 可输出全部部署 pin

位置：`backend/internal/systembackupcatrust/ca.go:34` 的公开 `Binding`，以及 `ca_test.go:257` 的格式化测试。

`Binding` 含公开 installation/database/config、provider/scope、描述/CA 路径与摘要、Endpoint、固定 IP、有效时间。当前只为 `*Validator`、`*check` 实现 String/GoString/MarshalJSON，Binding 本身没有对应方法。因此部署组合、校验错误或日志若直接格式化/序列化 Binding，路径、端点及完整 pin 会全部输出；现有格式化测试只传 `f.v`，覆盖不到这个载体。

静态反例（没有执行，也不应放真实映射）：

```go
b := systembackupcatrust.Binding{
    DescriptorFile: "PRIVATE_DESCRIPTOR_PATH",
    CAFile: "PRIVATE_CA_PATH", Endpoint: "https://PRIVATE_ENDPOINT.invalid",
}
fmt.Sprintf("%+v %#v", b, &b) // 默认结构体输出包含这些字段
json.Marshal(b)               // 成功输出公开字段，未被当前 Validator 方法阻断
```

这不等于 CA 私钥或 nonce 密钥已经泄漏；问题是明确要求保护的部署映射可以被意外输出，并与 nonce `Key`/`Binding` 的防护边界不一致。建议对 CA Binding 的值/指针实现统一的常量 String、GoString 和拒绝 JSON，并补 `%v/%+v/%#v`、`json.Marshal` 值/指针及 sentinel 不出现的断言。原请求/回执必须保留；新字节重新跑本地门禁并生成新版本请求，不能修改旧 A 接收以覆盖修复。

## 逐项意见

| 项目 | D 源码意见 | 保留的边界 |
| --- | --- | --- |
| nonce 原绑定 | New 约束原 installation/server/database/config、精确版本和绝对清洁路径；Prepare 将 grant/config 与原绑定逐项比较，typed descriptor 验证 purpose/identity/version/provider/scope，活动 nonce 引用必须恰一匹配。 | 原映射是谁提供、文件挂载身份/权限、Kubernetes UID/在线 ACL 由部署来源和其他 adapter 证明，构造器不认证来源。 |
| nonce 材料 | 只接受精确 32 字节和完整字节 SHA；validateKey 的副本成功/失败路径擦除。Material 重读原文件并返回调用者拥有的副本，失败擦除；调用者擦除责任保留。 | 材料摘要不作为资源 identity。Material 不消费 nonce、不签发 proof、不替代 bootstrap admission 的上级授权。 |
| 历史身份/保留 | 同 tx 读取所有 config 版本/identity，以及未过 retain_until 的全局 nonce 各版本 MAX；未知版本、身份冲突或保护期限不足拒绝，未以现有文件子集缩小所需集合。066/075 的版本列为 ascii_bin。 | 首次空库例外依赖 Prepare 已有精确活动原映射。真实全局可见性、历史材料来源及 MySQL 快照/并发边界待实际证明。 |
| nonce 时限/事务 | Recheck 核对同 tx 的服务器/数据库、原 observed/expires、SQL/墙钟不回退和最终时间/取消；只读、不 Begin/Commit/Rollback、不联网调用 provider。 | 调用方仍负责实际事务、锁序、完整权限及末次 admission/CrossResources。不能拿合成 SQL driver 代替实际事务验收。 |
| CA 固定网络 | New 闭合 https 端点、禁止用户信息/路径/query/fragment；连接固定 TargetIP，TLS ServerName 用原 hostname，无 DNS/代理/redirect fallback；TLS>=1.2，受控 CA 根、有效 CA PEM 闭集、证书链有效期参与原 30 秒观察界限。 | 这里是 TLS 信任观察，不认证 provider 权限、HTTP 服务身份或原端点允许策略；这些仍归对应资源与共同政策。 |
| CA 事务复查 | Prepare 外部工作前后核对同一文件摘要；Recheck 仅原文件/同 tx 数据库身份/时间复核，无新 TLS 连接、不结束事务，迟到读取拒绝。 | “本地文件”须由受控挂载证明；仅绝对路径/哈希不能证明底层不是远程卷。实际事务期间的文件 I/O 与预算仍须部署验收。 |
| 输出保护 | nonce Key/Binding/Validator/check 的格式化/JSON 边界可接收；CA Validator/check 有同类保护。 | CA Binding 缺失见 D-A-CA-01，当前版本不签收此项。 |
| 装配 | PrepareBootstrapAdmission 先验证/重新读取原 grant，要求完整 registries/references/CrossResources，并按原时限复查；两个资源 adapter 不是授权签发者。 | 禁止从 HTTP/approval JSON/constructor success 合成批准，仍需原材料、权限、跨资源决定与实际装配。 |

机器意见见 `evidence/d-a-nonce-ca-reviewed-20261023.json`，仅绑定准确原来源和本次逐项意见，不扩大到后续字节，也不取消当前 D 本地收尾/下载门禁失败的处理。
