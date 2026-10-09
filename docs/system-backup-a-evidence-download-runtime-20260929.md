# A：下载运行装配与 Transit 短期凭据（2026-09-29）

本轮新增 `NewDownloadRuntime`，把已有 HTTP Handler、SQLDownloadAuthority、S3 STS、只读对象访问和 envelope 绑定的 Transit 解包装配成同一个 `http.Handler`。它可供 D 的 TLS Admin 宿主挂载，构造时必须传入真实 SQLPolicy 和持久化 Failure。没有生产策略的默认实现，也没有从环境读取静态 token 的替代路径。

## 运行入口

`DownloadRuntimeConfig` 固定 Authority、S3STSConfig、历史 Transit 映射及 Failure。构造器核对 installation、store identity/version、root、STS issuer/audience 与 SQL 授权配置完全一致；所有 provider 与 KEK 调用使用同一 SQLDownloadAuthority 实例。配置不匹配、缺少 policy/Failure/Transit 映射时不创建可用入口。

运行入口只暴露 ServeHTTP 与 Close，内部 Store 的 Put/Delete/Absent 固定拒绝；S3 authority 同样只允许 Stat/Range。提供给 S3 构造器的不存在 verifier 是显式拒绝器，没有不存在证明，也不能被当作 GC 或写入恢复的替代实现。

宿主须将 handler 挂到 `systembackupevidence.Path`，保留已有管理员登录会话登记、实际 TLS 请求状态和审计接线，并在关闭前排空请求，再调用 Close 释放连接和自身 JWT secret 副本。重复关闭安全，关闭后的请求返回有界 503。不能用调用者提供的 forwarded TLS/身份头替代真实 TLS 和 JWT 校验。本轮未修改生产 main/router、配置开关、凭据或部署。

当前宿主核对：`backend/cmd/server/main.go` 的主 Admin 服务调用 `srv.ListenAndServe()`；另一个 `northboundCoreServer.ListenAndServeTLS()` 属于 northbound 独立服务，不能据此认定 Admin 已有可用 TLS 入口。D 接入时须先明确 Admin 的真实 TLS 终止与监听方案，再装载经过准入的 DownloadRuntimeConfig，并完成关闭排空。仅在现有 HTTP router 增加下载路由会被 Handler 的 TLS 检查拒绝。

## 下载专用的历史解包

`NewDownloadTransit` 接受至多 128 个受审历史 `DownloadTransitConfig`。每条映射包含原 TransitConfig 的 endpoint/CA、installation、完整 KeyRef、物理 key 名和显式版本，以及固定 JWT auth mount/role/policy 和投射文件。相同 KeyRef 或同 endpoint 下复用 role/policy 的映射拒绝；下载角色没有 Wrap 路径，也不回退到当前/latest key。

新映射仍须由可信注册/部署流程提供，配置本身不证明远端角色、ACL 或 key 独立性。专用投射 JWT 的 issuer/subject 与下载工作身份一致，audience 和文件路径必须与 S3 STS 投射不同；每次调用重新读取，允许正常轮换，不缓存 token。OIDC payload 的本地绑定检查不代替 provider 验签，真实 JWT 验签及 issuer/JWKS 信任由 OpenBao auth mount 执行。

解包按以下顺序完成：数据库 session/RBAC/owner/claim 与完整 envelope 校验；再次查询授权后读取投射 JWT；调用固定 origin 的 JWT login；验证响应 token 的 role、精确 policy 和期限；交换后复查 principal/lease/key；调用精确版本 Transit decrypt；解密后再次复查下载授权，最后由原 Handler 在发送正文前复查。任一阶段撤销、claim 接管、配置漂移或到期都拒绝返回 DEK/正文。

JWT 登录采用 OpenBao 的 `POST /v1/auth/<mount>/login`，只发送固定 role 和投射 JWT；返回字段由官方 [JWT/OIDC API](https://openbao.org/docs/api/auth/jwt/) 定义。实现复用原 Transit 的固定 CA、无环境代理、无重定向及有界 HTTPS 客户端，严格拒绝重复/尾随 JSON、错误或 wrapped envelope、额外策略、错误角色、异常 token、压缩与超限响应。token、JWT 和可控正文副本按生命周期擦除；Go/HTTP/JSON 内部副本不能保证全部清零。

## 凭据期限及生产限制

本 profile 只接受 `token_type=batch`、明确 `renewable=false`、1..20 秒 lease_duration，且策略列表只有受审 decrypt policy；split token/identity policies 不能额外增权。响应接收时间加 TTL 必须不晚于 SQL grant 和投射 JWT 的最早截止时间减去 5 秒时钟余量；该余量覆盖 SQL 授权允许的数据库时钟偏差，交换后复查及本地凭据到期也保留同一余量。超长 provider TTL 直接拒绝，不靠客户端截短伪装 provider 约束。客户端使用更保守的请求开始时间加 TTL。

Batch token 不可续期，也不能单独手动撤销，详见 OpenBao 的 [token 类型比较](https://openbao.org/docs/concepts/tokens/#token-type-comparison)。本实现没有把“数据库撤销后停止客户端解密/返回”宣称为“已签发 provider token 立即失效”。短期 token 仍可能在服务端保持有效至固定 TTL，角色/策略的真实撤销行为必须现场验证。若生产要求每个 token 即时撤销，当前 profile 不能作为该能力的完成证据，须另交付可撤销 service-token 生命周期。

建议受审角色固定 `role_type=jwt`、准确 issuer/subject/single audience、独立且无 default/identity 附加权限的 policy，以及 5 秒 batch TTL。Policy 仅允许既有专用 key 的 `transit/decrypt/<key>` update，限定 `EvidenceTransitContext(installation, KeyRef)`，禁止 encrypt/create/export/key management。角色及 ACL 内容、准确 key/version、禁用导出、历史保留和灾后读取必须独立验证；本轮不自动创建任何 provider 角色、key 或策略。

## 验证与后续

新增测试经过真实本机 TLS HTTP：Admin Range 请求 → STS 交换 → S3 签名/版本/Range → 专用 JWT 登录 → Transit decrypt → GCM 读取与发送前鉴权；覆盖 JWT 文件轮换、超长期限、错误策略/角色、坏响应、交换前后与解密后撤销、claim 接管、错 envelope/key、取消、只读边界、关闭和构造漂移。

SQL transport、owner policy、claim/audit registry、JWT issuer、STS/S3 和 Transit provider 均为明确的合成夹具。测试执行真实生产授权、协议和 framing 代码，但不能证明正式 SQLPolicy、真实数据库并发、OIDC 验签/ACL 或生产路由已经接入。已有 MySQL 历史验收不扩展到新客户端。本轮只编译 Linux MySQL 探针，不自动远程执行。

D 下一步须交付正式 SQLPolicy、会话与 Failure/审计持久化、可信历史映射装载以及实际 TLS 入口；A/C 须交付独立投射身份、provider 角色/ACL 与现场证据。后续增量已增加 [任务侧 Wrap 凭据与正文准备入口](system-backup-a-evidence-task-prepare-20260929.md)，其生产宿主接入、system capability producer、历史 store 映射和完整 worker 生命周期仍未完成。

验证入口：`pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`。结果与源码绑定见 [机器记录](evidence/system-backup-a-evidence-download-runtime-local-20260929.json)，[完整输出](evidence/system-backup-a-evidence-download-runtime-local-20260929.txt)。未安装依赖；缓存、临时测试文件和构建二进制在验证结束后清理。

本轮验证完成：73 个主测试、520 个子测试通过（17.763 秒），包含数据库领先 4 秒的到期反例。Linux MySQL 探针与迁移工具编译通过，未执行真实 MySQL；99 项输入源码摘要前后不变。wrapper 退出 0，隔离缓存、临时目录和二进制已清理且独立检查目录不存在。首次无时钟余量的结果保留为 initial 历史记录，不作为最终版本验收。
