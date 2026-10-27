# A 登录、刷新、退出 HTTP 本地整包验收

用户后续明确允许安装依赖。本轮只补齐仓库已锁定的 `github.com/klauspost/compress v1.18.0`，没有升级版本或修改 `go.mod`、`go.sum`。官方 Go 代理连接超时的[原记录](evidence/a-auth-dependency-install-20261016-121059.txt)保留；随后使用 goproxy.cn 下载成功，[安装记录](evidence/a-auth-dependency-install-mirror-20261016-121154.txt)的 module sum 与仓库原有 `go.sum` 一致。安装缓存保留，测试构建产物清理。

## 当前接收

后续 [LDAP 请求取消修复](system-backup-a-ldap-request-cancellation-20261016.md)另完成 1,330 输入冻结轮的完整 services 包验证：1,177 项通过、无跳过，新增实际 TCP/TLS/StartTLS 24 项，旧源码取消反例、默认 vet、源码前后检查与准确产物清理齐全。它接收该轮 services 修订，不把下述旧五包结果冒称为新轮五包验证；真实企业目录/realm/本人 MFA 仍待实际环境证据。

[最终日志](evidence/a-auth-http-local-20261016-124641.txt)、[源码清单](evidence/a-auth-http-source-20261016-124641.json)和[独立回执](evidence/a-auth-http-review-20261016.json)接收 Windows/amd64、CGO 关闭的本地冻结轮：1,295 项输入，source `982a21978375f5e44b32fe94b3092c7b8ac11b043ab7e027f1d81faff57dedf5`。repository、services、middleware、handlers、cmd/server 五个完整包通过，默认 vet 开启，1,010 个主测试和 364 个子用例，共 **1,374 项不同检查通过**。七个既有用例因 Unix 权限或 Windows 缺少符号链接权限跳过，名单在回执中，不计作 PASS，也不声称它们已由 Linux CI 验证。

测试阶段 `GOPROXY/GOSUMDB=off`、模块只读、`-count=1`，无自动测试重试。最终 Go/脚本退出均为 0，冻结副本 postcheck 通过；归档时全部已有清单输入无漂移，34 份重点来源匹配。两个准确源码 owner、两个测试/cache owner，以及两轮安装 scratch 共六条路径独立确认不存在。第二轮复用第一轮仍在使用时复制出的编译缓存，只用于本次修复验证，最后同样删除，没有保留构建缓存或二进制。

## 本轮修订

[真实入口用例](../backend/internal/handlers/auth_sessions_a_test.go)包含 5 主测试/25 子用例，共 30 项，已计入上述总数。它组合实际 Gin handler、AuthService、bcrypt、JWT 生成/验签和退出 JWT middleware：登录/刷新返回的令牌必须等于已登记的凭据绑定令牌；拒绝、不可用和回调内取消不返回令牌；非法请求不得登记会话；目录身份必须等于已预配身份，且接收原请求 context；退出先调用 backup 撤销，再调用 desktop 撤销，任一失败不能返回成功，缺失/无效/refresh bearer 不得调用撤销。

初轮[失败回执](evidence/a-auth-http-initial-failure-review-20261016.json)保留四包通过、services 失败和退出 1，没有改写为整体成功。失败来自既有 Browser Worker 删除夹具：`WorkspacePath` 是任意临时目录，而生命周期服务仍使用默认 workspace root。修订只使[该夹具](../backend/internal/services/browser_worker_service_test.go)采用同一受控临时 root 下的真实实例目录结构，并增加组件清理失败时目录仍在、成功后目录删除的断言；没有放宽生产删除保护。

初轮连接池故障日志还证明 `upper/db` 默认 WARN 会记录带参数的 SQL，登录 CAS 参数包含密码哈希。[登录状态更新](../backend/internal/repository/user_login.go)现使用同一个底层 `*sql.DB` 或 `*sql.Tx` 及 session context 执行原有参数化 SQL，绕开 ORM 的参数日志。原条件更新、零 changed-rows 的身份重查、当前凭据/角色/目录身份比较和泛化错误保持；该方法不创建或提交事务。[新增回归](../backend/internal/repository/user_login_logging_a_test.go)在日志启用时验证关闭 pool 与取消 context 都安全拒绝、不再进入驱动，也不把凭据写入日志或错误，两项及父测试通过。

## 接收边界

这是进程内 `httptest` 的本地 HTTP 入口与整包门禁，用户仓库、会话持久化和目录 transport 使用模型；没有部署 HTTP 或 TLS 握手、真实 LDAP TLS/bind/撤销事件、本人 MFA 或实际维护 grant 验收。此前十五项 proof MySQL、八项维护授权组合和七项回填服务分别保留原冻结证据，本轮不将它们合并为当前生产链成功。正式 081/082、A/B/C schema 交叉审批、真实原文/授权/容量材料和敏感下载合同仍待交付。

## 本地复现命令（已通过，无需重跑）

以下只供后续相关源码变更后复现，使用现有模块缓存，不下载依赖、不访问远端：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$ErrorActionPreference = 'Stop'
$authStamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$authLog = Join-Path $PWD.Path "docs/evidence/a-auth-http-local-$authStamp.txt"
$authSource = Join-Path $PWD.Path "docs/evidence/a-auth-http-source-$authStamp.json"
$authExit = 1
Start-Transcript -Path $authLog -NoClobber
try {
    & .\scripts\system-backup-a-auth-http-validation.ps1 `
        -BuildParallelism 2 -SourceManifestPath $authSource
    $authExit = 0
} finally {
    Write-Host "a_auth_http_exit=$authExit"
    Write-Host "auth_http_log=$authLog"
    Write-Host "auth_http_source=$authSource"
    Stop-Transcript
}
```
