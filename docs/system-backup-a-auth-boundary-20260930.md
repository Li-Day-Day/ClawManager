# A 登录会话：认证边界补充验证

日期：2026-09-30。承接 [会话 MySQL 15/15 验收](system-backup-a-login-sessions-mysql-20260930.md)，本轮补充认证服务边界的拒绝路径测试。测试调用当前生产 Go 源码；repository、目录认证和会话登记回调由测试替身提供，不代表 HTTP、LDAP 服务或真实 MySQL 的端到端验证。

## 本地结果

最终源码门禁退出 0：48 个主测试、43 个子用例全部通过，其中本轮新增 LDAP 边界为 5 组、22 个子用例。认证服务源码为 32/37（5.653 秒），LDAP 配置源码为 11/6（1.841 秒），utils 为 5/0（2.787 秒）。这里的用例耗时不含隔离缓存下的首次编译。执行器回归 8 项通过；PowerShell 解析及 Go 格式检查通过。

180 项输入源码摘要在成功轮前后保持一致。失败轮、部分通过轮和成功轮的三个自有 scratch 目录均已独立核对不存在，执行器测试 fixture 也已清理；未安装依赖或执行远程动作。见 [成功日志](evidence/system-backup-a-auth-boundary-complete-local-20260930.txt) 和 [机器验证记录](evidence/system-backup-a-auth-boundary-local-20260930.json)。

完整 handlers/server 依赖预检退出 1：现有 MinIO 依赖需要 `github.com/klauspost/compress v1.18.0`，当前缓存不可用，受限环境下打开下载锁失败。离线设置保持生效，没有安装依赖或申请放开安装权限。因此完整 HTTP/server 编译和端到端测试仍未通过；utils 的 HTTP 错误映射单测不能替代 AuthHandler 实际路由测试。

## 新增覆盖

[auth_sessions_test.go](../backend/internal/services/auth_sessions_test.go) 增加以下场景：

- 目录密码失败、不可用、用户不存在、返回空身份或不匹配身份时，不返回 token，不更新登录状态，不调用会话登记器；目录内部错误不透出。
- 本地账号禁用、外部身份缺失或空白、未预置用户、目录适配器缺失时，在访问目录前拒绝。
- 目录认证期间，本地账号的 active、role、external ID、auth provider 或 credential 被修改时，条件更新拒绝旧快照，保留最新账号状态，不登记会话。该顺序由测试替身固定，不声称观测到数据库并发锁等待。
- LDAP 登录和刷新遇到会话拒绝或数据库不可用时均不返回 token；刷新必须向登记器传递原父 refresh token。刷新当前不再次访问目录，这不是目录撤销事件验证。
- LDAP 角色升级和降级先更新本地角色，再调用会话登记器。数据库侧是否登记非管理员会话仍由实际 SQL 登记器判断。

工作区的登录入口现按用户名查到账号后，由账号认证来源选择本地密码或 LDAP。已有协同修改同时覆盖旧 `login_alias` 不再登录、带 `ldap_` 前缀的本地用户名仍走本地认证；本轮保留并验证该行为，没有恢复旧的前缀路由。

## 执行入口和范围

在仓库根目录 PowerShell 执行：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-a-auth-boundary-validation.ps1 -BuildParallelism 1
```

入口先报告 handlers/server 的依赖预检状态，然后执行实际 auth/session/user/quota 源文件及对应测试（含 `username_login_test.go`）、LDAP 适配器配置测试、完整 utils 包测试。保留 vet；启用 `GOPROXY=off`、`GOSUMDB=off`、`GOTOOLCHAIN=local`、`-mod=readonly`，不安装依赖。缓存、遥测和临时构建文件放入本次随机目录，finally 校验目录身份后清理，并恢复调用前的环境变量。

首轮源码编译发现既有 `auth_service_test.go` 已依赖新增 `username_login_test.go` 中的辅助函数，而文件列表遗漏后者。本轮为本入口及原 `-AuthSourceOnly` 入口同时补齐该文件，直接使用现有测试源码，不复制或伪造辅助函数。

第二轮认证服务测试通过后，LDAP 配置源码门禁发现 `firstNonEmpty` 定义于 `enterprise_auth_manager.go`。LDAP 命令已包含该生产文件，仍不生成辅助函数替身；两次源码列表修正的失败日志与各轮清理结果单独保留。

`PASS a-auth-boundary-source-only` 只表示上述源码门禁通过；`FULL_PACKAGE_DEPENDENCY_PREFLIGHT exit=0` 也只表示依赖解析成功，不表示整个 server 已构建。完整 services/handlers/server 仍需另行编译和测试。

## 分项验收状态与后续验证

| 范围 | 状态及后续验证 |
| --- | --- |
| HTTP 登录、刷新、退出 | 依赖可用后验证实际 Gin 路由、中间件和 AuthHandler：错误响应不含 token，退出撤销失败返回 503，真实数据库中的旧 refresh 被拒绝。 |
| repository 条件更新 | 修正版运行 `sbk-mig-260930075123-5f56` 已完成真实 MySQL 22/22，包含 6 次精确行锁等待及 2 次零 changed rows 重查，清理齐全、退出 0。[独立接收记录](evidence/a-login-state-mysql-remote-sbk-mig-260930075123-5f56.json)关闭本范围，无需重跑；首次 21/22 探针故障保留为历史。 |
| 真实 LDAP 认证 | 使用独立测试目录覆盖 TLS、service bind、身份查询、用户 bind、权限变化与服务不可用；本轮配置单测不代表 bind 成功。 |
| 目录撤销事件 | 当前目录之后的改密/禁用没有自动接到本地会话撤销。需先确定受信事件来源、身份映射、重放/乱序策略及事务撤销入口，再验收旧 access/refresh 的失效；不得仅凭 `external:ldap` 摘要声称已经覆盖。 |

认证边界本地单测不替代上述分项验收；repository 项以后续独立 MySQL 22/22 回执为准，其余项仍待补齐。没有启用部署开关或修改业务数据库，不重跑已成功的 MySQL 套件。
