# A 系统 producer Transit 准备入口

日期：2026-09-30。作者 A，交接对象 D/C，采用 Job 时包括 B。承接 [小正文与 C1 绑定适配](system-backup-a-producer-c1-adapter-20260930.md)。本轮接入专用 JWT 到 Transit encrypt 的完整本地调用链，生产认证、真实角色权限与 SQL 发布仍未启用。

## 实现

[SystemTransitPreparer](../backend/internal/systembackupevidence/system_transit.go) 只提供 Prepare 和 Close。Prepare 消费 system/installation 的 capability JSON，使用专属 Transit JWT 映射准备原字节的加密暂存；没有公开 Wrap、Unwrap、凭据读取或发布方法。已有 TaskPreparer、download Transit 和 STS 用途规则不变。

受信 `SystemPreparationAuthority` 必须同时认证正文生产者并批准准确的 encrypt-only profile。它返回的结构只是内部事实，不是可由请求构造的权限。适配实现须从 D 固定调用快照核对 deployment、主体/宿主、domain、grant/run/ref/观察期限及当前撤销状态，并验证专用通道独立于被测 provider。当前没有该接口的生产成功实现。

`SystemWrapProfileHash` 覆盖 endpoint、CA 摘要、installation、KEK identity/ref、Transit key name/内部版本、mount、role、policy、issuer、audience、subject 和本地投射文件路径。CA bytes 另外由 Transit 构造器精确核对。它采用独立域和闭集结构 JSON，不等同于 D 的 C1 channel_profile_hash，也不能自行证明通道准入。部署 registry 必须将这个具体 profile 纳入受信准入映射，不能只把计算出来的摘要原样回显为批准。

一次调用固定完整授权摘要与截止。截止取调用方原 deadline、20 秒调用预算、原授权截止减五秒时钟余量的最小值；读取 JWT 后再受其原 expiry 减余量限制。租约延长、缩短、profile/KEK/policy/身份换版都使旧调用失败。交换前后、Wrap 前后及暂存结束均实时复查；失败不返回可用 Prepared，宿主需清理未登记的密文暂存。

JWT 使用独立 audience 和投射文件，拒绝与工作身份认证配置复用。每次 Wrap 读取当前投射文件并执行一次 HTTPS JWT login，不缓存或自动重试凭据。复用原 Transit 检查：固定 CA/origin、禁止代理/重定向、最多 20 秒且不超过本次原截止的非续租 batch token、恰好一个批准 policy、准确 role metadata、指定 KEK 内部版本和 evidence 派生 context。客户端拒绝 Unwrap；真实 provider ACL 仍需现场证明。

凭据 resolver 只接受本 preparer 在有效调用中建立的私有 context 绑定。直接调用底层 Wrap、外部 context 键、旧调用结束后再次使用均不能取得凭据。该绑定只是 A 内部调用隔离，不能替代 D 的 ExecutionHandle/CallSnapshot 或工作身份认证。

## 与 D 当前交付的关系

D 已新增 lifecycle 的 Acquire/Renew/Revoke/Takeover 代码及 `CommandEnvironment`，本轮冻结输入中包含其当时版本。生命周期使用的环境认证与管理撤销仍需要真实适配；A 不把这些接口声明算作生产主体已认证。本入口将来应通过 D 的 BeginCall/RecheckCall 实现 `SystemPreparationAuthority`，不从 HTTP body、调用方 grant 数据或候选配置摘要直接生成成功授权。

下一步仍需系统 STS、提交后 publication claim、同一最终 Guard 事务内的 pending/chunks/历史绑定/容量/审计、结果登记和独立历史恢复。C 的实际条件写、准确对象证明及 Stat/正文权限隔离，B 的可选 Job 身份/暂存/取消接口分别验收。本轮没有修改候选八表、正式迁移、公共合同 approved_reviewers 或生产路由。

## 验证方法和边界

[system_transit_test.go](../backend/internal/systembackupevidence/system_transit_test.go) 用本地 TLS 服务检查真实 HTTP JWT login 和 encrypt 请求及准确 context/版本；模拟 Transit 返回密文后完整解密校验未填充原正文。测试覆盖投射 token 轮换、无凭据缓存、交换/加密/暂存后撤销、续租导致旧调用失效、错误 JWT issuer/audience/subject、超期 TTL、额外 policy、调用方短 deadline、取消、身份凭据复用、profile/KEK 漂移、未绑定 Wrap 和禁用 Unwrap。

[验证脚本](../scripts/system-backup-a-producer-adapter-validation.ps1) 将实际 evidence/producer/security 包、go.mod/go.sum 和 v12 合同文件逐字节复制到本轮目录，核对文件集合与摘要后再运行。没有删减测试或替换生产源码。Windows 两包测试及默认 vet、Linux evidence 测试二进制编译共享同一冻结输入；末尾校验快照未变，另列工作树并行变化。GOPROXY/GOSUMDB 关闭；源码副本、cache/tmp/telemetry 和二进制随本轮目录清理，输入摘要和测试日志保留作证据。

这是本地适配验证，不证明 JWT 签名已由真实发行方验证、部署身份/KEK ACL 已准入、在途远端调用可立即撤销，也不证明真实 MySQL 或 V01–V10。结果见 [本轮机器记录](evidence/system-backup-a-system-transit-local-20260930.json)，不扩展既有远程 login-state 或 evidence 探针范围。

最终两包 122 个顶层测试、含子用例 1159 项通过，其中本轮 SystemTransit 新增 38 项；默认 vet 和 Linux 测试二进制交叉编译通过，Linux 二进制未执行。首次 Windows 编译遇到两次 `compile.exe 0xc0000043`，执行器在同一快照/缓存上重试一次后通过，没有测试断言失败。205 份冻结输入与指纹保留在 [快照记录](evidence/system-backup-a-producer-snapshot-20260930-083042-c9ef25fb.json)，本轮源码副本及全部构建产物已删除。A evidence 源码与快照全部一致；D 的 lifecycle.go/lifecycle_test.go 在期间更新，其更新后版本不属于本轮结果。

验证执行器另增加嵌套 finally，避免记录写入异常跳过清理。该补强发生于本次 Go 验证启动后；对最终 finally 代码注入 receipt 写入异常，确认异常仍向上传递且临时目录被删除，并通过 PowerShell 语法检查。机器记录区分本次运行的执行器摘要与最终执行器摘要。
