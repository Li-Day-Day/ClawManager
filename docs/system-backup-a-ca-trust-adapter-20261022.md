# A bootstrap CA 信任适配候选

2026-10-22，状态：代码与本地验证准备，未装配生产入口。现场受控材料由用户确认“未准备”，不能预填实际身份、授权期限、CA 指纹或目标地址。

`backend/internal/systembackupcatrust` 实现真实的 `BootstrapResourceValidator.Prepare` 和 `BootstrapResourceCheck.Recheck`，可服务现有 `evidence_ca` 与 `artifact_ca` 槽位。A 负责 evidence；artifact 的原资源映射和传输策略仍需 C 提供及交叉评审。本候选不减少 `linkedOwnerAdapters()` 当前的 27 个缺项。

## 原材料和可信装配

`Binding` 是部署组合代码传入的封闭参数，不是 HTTP/ConfigValues DTO，也不是带 approved=true 的 JSON。部署 owner 必须从原受控材料取得 installation/server/database/config SHA、typed CA 描述文件的完整 SHA、provider/scope、原 CA 文件完整 SHA、准确主机名/端口和允许连接的固定 IP，以及原有效区间。identity_hash 沿用受审身份算法，不能从 CA、密钥或凭据内容临时生成来冒充原资源身份。

构造器只检查这些参数的结构和封闭目标，不认证其来源或宣称它们已交叉签收。有效 offline grant 仍由外层每次读取和复查；组合策略还要认证本 CA 与实际 provider/凭据引用使用同一目标和安装。未取得这些真实材料及非实现 owner 评审前，不把 New 返回成功当作生产准入，不创建替代授权。

## 检查行为

Prepare 在 SQL 锁之前读取准确文件并核对完整字节摘要；typed 描述必须是 ca_bundle，匹配同配置的准确 purpose/identity/version，以及受控 provider/scope。CA 文件只允许公开 CERTIFICATE PEM 块和空白，拒绝被 pem.Decode 跳过的前置垃圾、私钥块、错误类型、坏 DER、非 CA、无签发用途、过期或尚未生效的 CA。

TLS 连接只拨号到组合代码固定的 IP 和原端口，按原 hostname 验证证书链，最低 TLS 1.2；没有请求指定 DNS、重定向、环境代理或替代地址。只做握手，不发送 HTTP/provider 操作，不读取写删凭据。Prepare 后再次核对本地文件和取消状态。观察有效期受原映射期限、CA/服务端链最早到期和最长 30 秒共同约束。

Recheck 不访问网络，只核对 SQL 调用方时间及本机时间、同一文件的原始摘要，并在调用方事务内只读核对 `@@server_uuid,DATABASE()`。本地/SQL 读取结束后再次检查有效期，避免慢读取跨过观察期限。它不增加外部锁、写入、Commit 或 Rollback。文件缺失或变化、身份不符、时钟倒退、取消或过期均返回固定错误。

本候选没有实现在线 OCSP/CRL 取证，也不把一次 TLS 握手当作当前 provider ACL、完整证书撤销体系、真实 MFA 或恢复整链通过。部署信任撤销需要移除/替换原受控映射材料并由外层原 grant/配置权限复查；若部署合同要求其他证书撤销来源，须接入可信本地撤销观察后再签收。签名/密钥历史验证的 CA 保留策略仍是独立资源要求。

## 验证范围

`docs/evidence/a-ca-trust-candidate-validation-20261022.ps1` 冻结安全依赖与本包源码，关闭依赖下载，执行完整本包测试及默认 vet，并构建 Linux 测试程序；finally 清理准确 owner 下的源码副本、缓存、测试临时目录及二进制。当前测试使用一次性合成 CA 和真实 loopback TLS 握手，事务身份/取消使用受控 SQL driver；没有联系现场 provider 或实际 MySQL。

覆盖正常握手、事务内零网络/零提交、过期叶证书、不可信 CA、主机名不符、PEM 垃圾/私钥、映射/描述/CA 变化、错误安装与数据库、过期/读取期间过期、取消及输出保护。本轮本包测试/default vet 和 Linux 构建已通过，[原始回执](evidence/a-ca-trust-candidate-20261022-161401-c7097458.json)保留 376 份输入及结果；[收尾核对](evidence/a-round-pause-reviewed-20261022.json)另外检查原字节摘要及准确 owner 缺席。非实现 owner 评审仍待完成，未据此批准现场材料或生产装配。
