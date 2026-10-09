# A 登录状态条件更新 MySQL 探针

日期：2026-09-30。本轮补齐 [认证边界清单](system-backup-a-auth-boundary-20260930.md) 中 repository `UpdateLoginState` 的真实 MySQL 验证。探针调用实际 repository 代码与 upper/db MySQL adapter；操作者修正版运行已获 22/22 限定范围验收。

## 远程验收结论

运行 `sbk-mig-260930075123-5f56` 在 MySQL 8.4.8 上全部 22 项通过，包含 6 次匹配请求/阻塞连接的真实 users 行锁等待、2 次零 changed rows fallback SELECT。94 文件完整 fresh 重放、users 结构摘要、修正版 probe 和 migration 二进制摘要均符合交接记录；678 项当前源码摘要与修正版快照全部一致。

测试数据库删除及不存在检查、namespace、远程 scratch、本地构建缓存清理标记齐全，`a_login_state_remote_exit=0`。SSH 的 socket close 诊断没有伴随测试或清理失败，不影响本次接收；预期的 `sql: database is closed` 用例最终 PASS。见 [完整操作者日志](evidence/a-login-state-remote-20260930-153937.txt) 和 [独立验收记录](evidence/a-login-state-mysql-remote-sbk-mig-260930075123-5f56.json)。

本登录状态套件无需重跑。验收覆盖完整 fresh 迁移后 users 结构上的 repository 更新、条件重查、并发拒绝及错误返回；不扩展到 HTTP 登录链、真实 LDAP bind/撤销事件、生产 SQL 日志脱敏、配置激活或系统 producer V01–V10。正常成功退出的清理证据不等于另行验证了强制子用例 panic 时的清理。首次失败及本地修正历史继续保留。

## 首次远程失败和修正

操作者运行 `sbk-mig-260930070728-6476` 在 MySQL 8.4.8 完成 94 文件重放，前 21 项通过，含 2 次零 changed rows 的真实重查及 6 次精确阻塞连接匹配的行锁等待。第 22 项 `database_failure_is_redacted` panic，探针退出 2，wrapper 退出 1；整套未验收通过。见 [原始回传](evidence/a-login-state-remote-sbk-mig-260930070728-6476.txt) 和 [失败核对记录](evidence/a-login-state-mysql-failed-sbk-mig-260930070728-6476.json)。

失败来自探针先调用 `upper.Session.Close()` 销毁 adapter，再继续使用它：upper/db v4.10.0 把内部 `*sql.DB` 清空，Exec 在返回数据库错误前解引用 nil。该构造不能用于验证正常数据库不可用时的错误映射。本次修正保留 adapter，仅关闭底层 `database/sql` 连接池；本地无网络回归与远程用例共用故障注入/断言，继续调用实际 `UpdateLoginState`，不捕获 panic 冒充通过，也不修改生产认证逻辑。

父级 context、session 和数据库清理由 defer 改为 `t.Cleanup`，按先关闭 probe 连接、核对服务器并删除 probe 库、最后关闭 admin/context 的顺序执行。Go 的子用例 panic 会运行父级 Cleanup；原父级 defer 未执行，因此失败日志没有独立 DROP 数据库成功标记。外层日志已确认临时 namespace（MySQL 使用 emptyDir）、远程 scratch 和本地 cache 删除；没有据此补造数据库清理回执。

原探针及 migration 二进制 SHA-256 均匹配准备记录。输入 JSON 的远程摘要 `087a1da9…` 已用 Windows PowerShell 5.1.26100.6899 精确复现；本地 PowerShell 7.6.5 对同一 94 文件描述产生原 `5eb3f79a…`，这是序列化字节差异。真实 schema 摘要由远程报告，本次未重新访问集群计算。

修正版已完成本地验证：repository 11 项（含共享故障注入回归）、离线 seed 门禁通过，Linux probe/migration 编译通过，执行器退出 0。新 probe SHA-256 为 `8e69b46048f93e32fb3cb1a01d22cd8f7051a978ae3dd760fe87f5d4551b27b9`，migration 摘要不变。最终轮的 678 项源码快照复查一致，三个本地轮次的自有构建目录均已核对不存在；未安装依赖、未执行新的远程动作。见 [修正版日志](evidence/system-backup-a-login-state-fix1-final-local-20260930.txt) 和 [修正版交付记录](evidence/system-backup-a-login-state-fix1-local-20260930.json)。

前两轮本地失败日志保留：第一轮工具进程异常按既有规则重试后，离线初始化 fixture 因 SQL 空白差异拒绝；第二轮源码 import 在编译期间变化，出现 fmt 导入元数据缺项。修正 SQL 空白比较并固定源码后，最终轮完整通过；没有关闭 vet 或放宽故障断言。下方“本地准备”保留最初版本的历史结果。

上述修正随后由 `sbk-mig-260930075123-5f56` 完成 22/22 及全部清理验证，结果见本文开头。下方命令保留供复现，本轮无需再执行；原成功准备和远程失败记录不改写为通过。

## 数据库与迁移范围

新增 `-LoginStateOnly` 模式，沿用已有 fresh migration 执行器及身份校验。远程只允许 `sbk-mig-*` 临时 namespace 的 emptyDir MySQL；先执行本轮源码编译的完整 migration runner，再核对 namespace UID、数据库 marker、server UUID，以及 `schema_migrations` 的完整文件名集合。

当前基线为 94 文件、catalog SHA-256 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。输入描述与探针内嵌 catalog、controller pin 必须一致；缺环境、旧 catalog、遗漏/额外 ledger 均失败，不跳过。

探针创建随机 `alu_<32位十六进制>` 数据库，以 `CREATE TABLE ... LIKE clawmanager.users` 复制完整 fresh 迁移后的 users 表。它不使用旧会话探针的简化 001 DDL，也不对源库用户行执行更新。两份 `SHOW CREATE TABLE` 仅去除源 seed 数据产生的 AUTO_INCREMENT 计数后必须逐字一致，归档该结构摘要；LDAP 字段、生成列和唯一索引因此来自完整迁移结果。

这是完整迁移后 users 结构上的 repository 测试，未在 probe 库再次重放整个应用 schema。fresh 重放结果与 repository 用例各自记录；不代表历史用户数据升级或全库业务行为通过。

为复用执行器，既有 `D_PROVIDER_REGISTRATION_DDL` 载荷槽在此模式传递 JSON 输入描述，文件扩展名不用于判断内容。探针只解析它的 kind、catalog hash 和排序文件清单，核对 SHA-256；不把该载荷作为 SQL 执行。

## 22 项运行用例

| 数量 | 场景 | 核心断言 |
| --- | --- | --- |
| 2 | local/LDAP 首次更新与同秒重复登录 | 首次更新成功；第二次零 changed rows 调用真实重查 SELECT，保持正确身份和 last_login |
| 2 | LDAP 角色升级/降级 | 只有原角色匹配才持久化目标角色 |
| 9 | 旧凭据/身份快照 | 改密、密码大小写/尾空格、禁用、角色、provider、DN、DN 大小写、DN 变 NULL 均拒绝，保留最新行 |
| 1 | NULL 与空字符串身份 | 本地 NULL 身份不能匹配新写入的空字符串 |
| 1 | 用户已删除 | 条件更新及重查均不产生成功 |
| 6 | 真正等待用户行锁 | 并发改密、禁用、角色、provider、DN、DN 变 NULL 提交后，等待中的旧登录被拒绝 |
| 1 | 数据库不可用 | 保留 adapter、关闭底层连接池后，更新返回固定 unavailable 错误，不改变登录状态 |

零 changed rows 使用 `clientFoundRows=false`，同一物理连接上的 `Com_select` 前后计数证明真实 fallback 执行。锁等待查询 `performance_schema.data_lock_waits`，同时匹配请求连接、阻塞连接、数据库和 users 表；只有观察到该等待后才提交竞争修改。轮询间隔不作为竞争证据，缺少等待观测直接失败。

每个子用例仅重置本轮 probe 库的合成 users 行。工作连接使用有界 context；提前失败也回滚阻塞事务、取消并回收 worker。探针自身的 SQL 错误断言只输出固定说明/错误码。预期的连接池关闭错误会由 upper/db 默认诊断输出 SQL 和合成参数；此用例验证 repository 返回的固定错误，不代表生产 SQL 日志脱敏已通过。探针不使用实际用户密码、DN 或 token。

## 本地准备

本轮本地执行退出 0：repository 10 项常规测试、1 项离线 seed 门禁通过；Linux MySQL 探针与 migration runner 编译通过。执行器 16 项和远程阶段 7 项模拟回归通过，PowerShell 解析、Go 格式与 Bash 语法检查通过。隔离构建目录已核对不存在；未安装依赖或执行远程动作。上述结果不计作 22 项真实 MySQL 通过。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-a-evidence-validation.ps1 -LoginStateOnly -BuildParallelism 1
```

本模式只运行 repository 常规测试、离线 `TestLoginStateMySQLSeed`，并编译 Linux repository 探针及 migration runner；不重跑会话 15/15 或 evidence 25/25。离线 seed 验证受限环境输入、摘要和完整 catalog，不连接 MySQL。

执行器保持 `GOPROXY=off`、`GOSUMDB=off`、`GOTOOLCHAIN=local`、`-mod=readonly` 与 vet，不安装依赖。隔离缓存、二进制、遥测及临时目录在 finally 中清理。执行器模拟回归为 16 项，远程阶段模拟回归为 7 项；这些模拟测试只验 dispatch/拒绝/清理，不计为上述 22 项数据库验收。

本轮本地日志见 [准备日志](evidence/system-backup-a-login-state-local-20260930.txt)，最终验证范围和源码摘要见 [交付记录](evidence/system-backup-a-login-state-local-20260930.json)。

## 操作者远程命令

沿用项目已记录的操作者远程验证流程。本轮未执行 SSH、启用会话开关或更新实际业务库。SSH 密码仅在终端交互输入，host key 保持校验。

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    $aLoginStateExit = 1
    $aLoginStateLog = Join-Path (Get-Location) ('docs/evidence/a-login-state-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
    Start-Transcript -Path $aLoginStateLog -NoClobber | Out-Null
    try {
        & .\scripts\system-backup-a-evidence-validation.ps1 `
            -LoginStateOnly `
            -Remote `
            -BuildParallelism 1 `
            -SshTarget 'root@10.130.14.23'
        if (-not $?) { throw 'Login state MySQL runner failed' }
        $aLoginStateExit = 0
    } finally {
        Write-Output "a_login_state_remote_exit=$aLoginStateExit"
        Stop-Transcript | Out-Null
    }
}
```

执行入口沿用 context `kubernetes-admin@kubernetes`、只读发现源 namespace `clawmanager-zhanghui08-system`、测试节点 `node1` 和既有固定镜像 digest。本轮二进制与迁移从工作区重新编译，不能用旧 93 文件回执批准当前版本。

## 回传与验收

需回传完整输出，至少包含：

- probe、输入描述（wrapper 字段沿用 `ddl_sha256`）及 migration 二进制 SHA-256，fresh migration 的 94 文件和 catalog hash；
- `MIGRATION_INPUT`、`USERS_SCHEMA`、全部 22 个子用例 PASS、2 条零 changed rows 观测及 6 条 `OBSERVED login-state lock wait`；
- `PASS a-login-state-mysql`、`CLEANED login-state run-owned database`、namespace 清理、远程 scratch 和本地 cache 清理，以及 `a_login_state_remote_exit=0`。

数据库清理先核对服务器 UUID，再仅 DROP 本轮随机数据库并查询确认不存在。外层 namespace 与 scratch 清理继续由原执行器负责；缺任一清理证据或出现 CLEANUP_PENDING 均不得记为通过。远程通过后按实际二进制、迁移及源码绑定登记独立回执。

HTTP 登录/刷新/退出、LDAP 真实 bind/撤销事件，以及系统 producer 的 V01–V10 仍不在本探针范围。本轮没有修改认证生产逻辑或正式数据库迁移。
