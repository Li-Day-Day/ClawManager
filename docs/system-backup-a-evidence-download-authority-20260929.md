# A：管理员 evidence 下载授权（2026-09-29）

本轮新增 `SQLDownloadAuthority`，将现有 JWT/数据库会话、hash-pinned RBAC、owner 可见性、证据 claim 与 STS 只读授权接到同一条下载链路。新增 `DownloadKeys` 在解包前后核对授权，并将 wrapped DEK 绑定到数据库登记的 envelope。仍是待运行装配的组件，不代表完整下载服务已部署或真实 provider 已验收。

## 身份、权限与事务

`DownloadAuthorityConfig` 仅由受审部署代码构造：固定 SQLRegistry 的 DB UUID/name/installation 和必需的 SQLPolicy，复制 JWT 验签 secret，固定配置版本/hash、RBAC 版本/hash/目录、S3 store/read 引用、OIDC issuer/audience/subject/投射 token 文件及准入期限。没有从请求读取 endpoint、文件路径、角色或 provider 凭据的分支。

`AuthenticateContext` 复用 `JWTRegistrationAuthenticator` 的 HS256、access token、exp/iat、user_id 校验，并创建当前 authority 专用的私有 context。后续查询检查 active admin 用户、当前密码 hash、数据库 session 的 uid/subject/credential/expiry/revoked。新增 `CheckRegistrationSessionUntil` 返回锁定的 session expiry；旧 `CheckRegistrationSession` 保持原签名及拒绝行为。JWT subject/session 不从外部 Actor 字段反推。

本轮验证时只有 TOTP 流程插入 `system_backup_admin_sessions`，普通登录/refresh 尚未登记读会话。后续 [登录会话增量](system-backup-a-evidence-login-sessions-20260929.md) 已增加默认关闭的登录/刷新登记和撤销接线；该新增代码有独立验证记录，不回写本轮结果。这里不在 GET 上自动创建会话，也不把 session 缺行当作允许。分类矩阵测试证明权限映射，不能证明各角色的生产登录链路已经启用。

RBAC 读取现有 `rbac_bindings` 内容寻址文件，以现有严格 decoder 拒绝重复、大小写别名、缺项和 null，再按 v12 固定角色映射核对 classification 权限：public/internal 要 read，confidential 要 read+operate，sensitive 要 read+security_configure。config_admin 没有 operate，不能据其配置权限下载 confidential 数据；普通业务 admin 身份本身也不赋予系统备份权限。

每次授权独立开启 Repeatable Read 事务。文件在事务外读取，事务中锁定并比较当前 config/RBAC/store/read 引用，以捕获读取期间配置更换。锁序为全安装排序范围、当前 config、users/session，再调用 D 的 `SQLPolicy.LockScope` 锁定 owner，加载完整 evidence/chunks，并调用同一事务上的 `SQLPolicy.Authorize`。缺少 policy 不能构造授权器；它仍负责真实 owner 可见性及跨 owner 规则，本轮没有提供 allow-all 实现。

Commit 返回后再次检查调用取消及 grant 期限，避免事务提交等待跨过会话截止时间后仍向 Handler 返回成功；新增专门反例覆盖提交期间取消和到期。

读取完整已登记 manifest 后复核 ready、精确 immutable version、确定性 key、framing、claim/row version 和分类权限；锁等待后重新采样数据库 UTC，拒绝超过五秒的本机时钟偏差。grant 到期取准入、JWT、数据库 session、下载 claim 的最早期限；job-log 另受 evidence expiry 限制。停止 backup schedule 不等于撤销保留证据的下载权限，因此下载不要求 config enabled，也不要求原任务仍在运行或未过 owner deadline。

## Handler、STS 与解包

Handler 识别 `BoundDownloadAuthenticator`，传递其认证 context；claim 成功提交后先检查下载授权，获取/解密正文并完成原事务内复查后，再在发送任何明文前检查授权。原 confidential/sensitive intent/result 审计和 claim 释放保持有效；失败不发送先前已解密正文。运行装配必须让 Handler.Auth 和 STS 使用同一个 SQLDownloadAuthority。

STS 仅允许完整登记 Ref 的 Stat 和界内 Range；Put/Delete、其他版本、越界范围及 task/gc claim 全部拒绝。每次 SQL 提交后重新读取投射 OIDC token，沿用 task authority 的有界预检查和现有 STS HTTPS 交换；交换完成后仍会再次实时授权。预解析 JWT 不替代 STS 的签名/信任认证。

`DownloadKeys` 的 Wrap 始终拒绝。Unwrap 要求数据库中的精确 KeyRef，并将 `Framing + evidence Identity + KeyRef + wrapped DEK` 重建为 canonical envelope，核对已登记 envelope_hash 后才调用底层 keyring；因此相同 KEK 下的其他 wrapped DEK 不能借此解包。解包完成后再次授权，撤销、claim/manifest/session 变化或到期均擦除返回的 DEK 并拒绝。

本轮没有签发 Transit 凭据；底层 keyring 仍需接实时短期 unwrap resolver 和独立 ACL。下载的会话权限不能借用 task wrap 身份，也不能借用 GC 删除身份。

## 装配与验收边界

推荐顺序：构造受审 SQLRegistry/SQLPolicy，再构造 SQLDownloadAuthority；以该 authority 装配 S3STSCredentials 与 Handler.Auth，以 `DownloadKeys{Authority: authority, Keys: admittedKeyring}` 装配 Handler.Service.Keys。S3Store 和 STS 必须共享受审 S3Config；Service.Registry 必须与 authority 查询同一个真实 registry，Service.Failure 必须持久化失败。不能把本地测试 driver、内存 registry 或 synthetic owner policy 用于运行服务。

仍需 D 的正式 owner policy/事务锁序复审及路由/审计/故障持久化装配、真实 MySQL 查询和撤销并发测试、平台 OIDC/STS/read ACL 与 Transit unwrap 身份，以及端到端验收。system capability、GC 与到期 write_unknown 恢复授权仍未完成。此前任务授权交付中的“下载 authority 待实现”以本轮代码为增量，现场接线仍待交付。

## 本地验证

入口新增可选 `-IncludeSecurity`，本轮执行 `pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1 -IncludeSecurity`，同时验证 security 和 evidence 包，保留 vet、只读依赖、禁止下载及隔离产物清理；没有执行 `-Remote`。

新测试覆盖实际 JWT 验签、会话撤销/密码变更、RBAC 分类矩阵及畸形 wire、SQL 配置/对象/claim 漂移、owner policy 拒绝、STS 只读范围、错误 wrapped DEK 拒绝、解包期间撤销与 DEK 擦除，以及本机真实 HTTPS Handler 的正确读取/撤销拒绝。SQL transport 和 owner policy 是显式 synthetic fixtures，不能作为真实 MySQL 锁或生产 owner 权限验收。

最终完整包测试通过：security 为 72 个主测试、337 个子用例（13.128 秒），evidence 为 45 个主测试、333 个子用例（7.080 秒）；evidence 本轮新增 5 个主测试、65 个子用例，包括提交期间取消/到期。

首轮 security 通过，但下载 Handler 正向用例被旧内存夹具的固定 actor=`admin` 拒绝，新认证使用十进制用户 ID=`42`。修正了测试 registry 的 actor/session 校验，并要求撤销用例确实到达对象读取阶段；未放宽生产授权。首轮在包测试阶段失败，未构建 Linux 探针，自有 scratch 已清理。失败日志单独保留，最终复测使用新 scratch 和完整套件，所有源码修改先于最终复测。

最终入口退出 0；Linux/MySQL 探针与 migration runner 构建通过，未运行真实 MySQL 或远程操作。两轮自有 scratch/cache/临时测试文件/构建二进制均由入口清理，已另行核对两个 scratch 不存在。89 项 Go/module/runner/相关 DDL 源码摘要、两轮输出摘要及构建摘要见 [机器记录](evidence/system-backup-a-evidence-download-authority-local-20260929.json)；[最终完整输出](evidence/system-backup-a-evidence-download-authority-final-local-20260929.txt)与[首轮失败输出](evidence/system-backup-a-evidence-download-authority-local-20260929.txt)均保留。未安装依赖，未回写历史验收。
