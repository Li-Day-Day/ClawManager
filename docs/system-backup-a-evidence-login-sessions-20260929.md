# A：登录和刷新会话登记（2026-09-29）

【2026-09-30 认证边界增量】新增 [LDAP 登录拒绝路径测试与源码验证入口](system-backup-a-auth-boundary-20260930.md)，按当前用户名/认证来源路由验证，保留工作区的登录入口协同修改。下文为原会话接线说明；目录撤销事件和完整 HTTP 链仍未验收。

【2026-09-30 并发探针增量】新增 [登录会话 MySQL 并发探针](system-backup-a-login-sessions-mysql-20260930.md) 和独立 `-LoginSessionsOnly` 执行模式，覆盖重复刷新、刷新/退出双向竞争、改密/禁用竞争、审计/撤销回滚及安装隔离。操作者运行 sbk-mig-260930024748-02c7 已通过真实 MySQL 15/15，清理和退出 0 已核对，接收记录见新文档。此结果仅关闭会话登记/撤销探针范围；后文 repository 更新、HTTP 和 LDAP 事件的待验证项仍保留。

本轮将普通登录产生的管理员 token 对接入 `system_backup_admin_sessions`，供上一轮下载 authority 查询。只在明确启用时登记；不会赋予备份 RBAC 权限、跳过 MFA，也不在下载 GET 时补建会话。业务角色为 `user` 的账号不登记备份会话；备份 viewer/operator/config_admin 等仍须具有数据库 active admin 身份及各自固定 RBAC 绑定。

## 登录、刷新和撤销

JWT 新增随机 128-bit `jti`，避免同一秒为同一账号生成相同 token。现有 user_id/token_type/iat/exp 语义不变。登记器独立验证 HS256、令牌类型、有效期、jti 和用户 ID；数据库只存 token 的 SHA-256，不存原始 token。

登录在验证本地密码或 LDAP 身份后捕获凭据快照，只更新 last_login/auth_provider/同步后的 role。条件更新核对密码 hash、原角色、认证来源、external ID 及 active 状态，避免旧用户快照覆盖并发改密或禁用。MySQL 报告零 changed rows 时重新检查完整条件，兼容同一个数据库时间刻度内的重复登录；真正的 MySQL 并发行为仍需现场验证。启用登记后，自定义 repository 必须实现 `LoginStateRepository`，不能回退到整行更新。

`SQLLoginSessions.RecordPair` 在 Repeatable Read 事务中核对数据库 UUID/name，锁定用户并复核已验证凭据的 SHA-256、active/admin 状态、数据库 UTC、logout epoch。登记 access 和 refresh 的 hash，并与审计同事务提交。登记失败只返回固定错误，不向调用方返回新 token。查询当前密码所用的 SQL 与明文密码无关。

管理员刷新必须提交当前数据库中仍有效的父 refresh 会话。父记录的用户、subject、凭据、到期时间和 revoked 状态全部检查通过后，事务一次性撤销父 refresh 并登记新 token 对。改密后的旧 refresh 无法重新绑定到新密码；重复刷新被拒绝。事务中任何写入或审计失败都会回滚父会话消费和新会话登记。提交结果不明时不返回 token，用户需重新登录，不将不确定结果当作成功。

退出使用与登记相同的数据库 pin，撤销该安装下用户的全部 access/refresh 会话并更新 logout epoch。JWT 的 iat 为秒级，因此同一秒内退出后立即重新登录可能被保守拒绝，跨过下一秒后重试。刷新现在是单次消费，多窗口同时使用同一个 refresh token 时仅一个请求应成功，其他窗口需要使用更新后的 token 或重新登录。启用前未登记的管理员 refresh token 不受信，需重新登录；业务 user 保留原登录/刷新语义。

每次登记只清理当前安装、当前用户至多 256 条已到期会话，并限制未过期且未撤销会话至多 256 条；不清理 nonce、审计或 logout epoch。复用现有 080 表结构，没有新增或执行迁移，也未生成运行凭据或 RBAC 绑定。

LDAP 只绑定本次已验证目录身份的本地用户快照。外部目录之后发生的改密/禁用无法由本地固定 `external:ldap` 标记自动感知；目录到本地禁用/会话撤销的事件接线仍需交付，不能宣称目录全局退出已完成。本地 LDAP 账号更换外部身份时也必须明确撤销既有会话；当前 credential_hash 沿用现有密码 hash 摘要，不包含目录状态或 external ID。

## 显式运行开关

服务默认关闭读会话登记，`SYSTEM_BACKUP_READ_SESSIONS_ENABLED` 仅接受空值、`false` 或 `true`；其他值拒绝启动。启用必须同时提供：

- `SYSTEM_BACKUP_REGISTRATION_INSTALLATION_ID`：已受审安装 ID。
- `SYSTEM_BACKUP_READ_SESSIONS_SERVER_UUID`：受审数据库 UUID；数据库名来自已有应用配置。
- 现有 JWT secret 至少 32 bytes；已有 080 会话/撤销表和 audit_logs 的所需数据库权限。

开关未改入部署清单，也未在任何环境启用。设置开关前需完成 D 的 schema/数据库身份及权限复审。完整 evidence 路由仍需正式 owner policy、审计/失败持久化与 provider/Transit 授权装配。

## 本地验证与限制

新增 SQL 事务模拟测试验证双令牌登记、父 refresh 单次消费、改密拒绝、logout epoch、用户/subject/凭据/到期绑定、回滚、提交不明、提交后取消、数据库身份/UTC/时间漂移、令牌声明和会话上限。登录服务测试覆盖回调边界、错误不泄漏、密码失败不登记、并发用户变化拒绝和 LDAP 身份快照。另有 JWT 唯一性、HTTP 错误状态和运行开关测试。

完整验证命令为 `pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1 -IncludeAuth`。本机缺少 `github.com/klauspost/compress v1.18.0`，因此完整 services 包和服务端构建未通过依赖准备阶段。没有安装依赖，`GOPROXY=off`、`GOSUMDB=off`、`-mod=readonly` 保持有效。

新增明确限定范围的 `-AuthSourceOnly`：执行完整 security/evidence/utils/repository 包测试，再以 Go 文件列表运行实际 auth_service/auth_sessions/enterprise_auth/quota/user/default_passwords 源码及对应测试，并独立测试 server 的开关构造函数。不替换依赖、不生成生产代码 stub；该模式不验证整个 services 包或 main.go 装配编译，也不构建完整 server。Linux evidence MySQL 探针和 migration runner 构建仍执行。

受限验证退出 0，共 160 个主测试、715 个子用例通过：security 78/370，evidence 45/333，utils 5/0，repository 9/0，登录/用户/配额源码 22/6，服务开关辅助函数 1/6。另有验证入口的 19 个模拟命令用例通过。Linux evidence MySQL 探针与 migration runner 构建成功；未运行真实 MySQL，也未执行远程操作或启用部署。

完整验证失败轮和受限验证成功轮的自有 scratch、cache、临时测试文件及构建二进制均已清理，并独立核对两个目录不存在。194 项相关源码摘要在受限验证期间保持一致；仅保留源码、文档和验证日志。没有安装依赖。

范围、各套件计数、源码/构建/输出摘要及清理结果见 [机器记录](evidence/system-backup-a-evidence-login-sessions-local-20260929.json)。保留 [完整包验证受阻输出](evidence/system-backup-a-evidence-login-sessions-local-20260929.txt)、[受限源码验证成功输出](evidence/system-backup-a-evidence-login-sessions-source-local-20260929.txt) 和 [验证入口测试输出](evidence/system-backup-a-evidence-login-sessions-runner-20260929.txt)。完整 services/server 验证仍待依赖可用后补齐；真实 MySQL 锁/并发撤销、LDAP 撤销事件、生产登录与下载端到端、OIDC/STS/Transit 以及 D 的正式 owner policy 均不由本地模拟通过来替代。
