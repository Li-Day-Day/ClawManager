# D：A/D 完整服务事务的 MySQL 验证入口

日期：2026-10-08。

最新状态：A/D 服务链远程 MySQL 复测已通过 22/22 个子用例，`001..080` migration replay 通过，22 个临时数据库及本轮 namespace/UID 均已清理。验收范围及完整证据见 [A 接收交接记录](system-backup-a-producer-service-handoff-20261008.md)。下文的“尚未远程执行”仅描述本页原始本地准备阶段，不再代表当前状态。

后续 D 增加了 [独立历史结果收据读取入口](../backend/internal/systembackupproducer/history_read.go)，允许在原 domain 关闭、grant 撤销后通过**新的独立读取授权**读取精确原收据，不生成执行句柄或重新调用 provider；配套的 [本地测试](../backend/internal/systembackupproducer/history_read_test.go)覆盖授权拒绝、请求不匹配、过期和损坏记录。producer 整包 Go 测试退出 0，`go vet` 在一次 Windows `vet.exe` 进程异常后重试退出 0，临时构建缓存已清理。新入口尚无生产身份/撤权 authority；[新增的隔离 MySQL 用例](../backend/internal/systembackupevidence/d_producer_mysql_test.go)尚未执行，既有 22/22 验收不覆盖它。带 MySQL 标签的本地 seed 尝试被自动审批拒绝，未连接数据库；按操作者要求，新的远程验证留给操作者执行。

后续远程复测已由操作者完成，以上“尚未执行”是准备阶段记录。[本地完整日志](evidence/a-d-producer-history-local-20261008-162611.txt)和[远程完整日志](evidence/a-d-producer-history-remote-20261008-162611.txt)记录同一轮 861 文件快照、`live-drift-files=0`、默认 vet/本地 seed 通过；远程 migration replay 通过，`TestDProducerMySQL` **24/24** 个子用例通过，包含 `independent_historical_receipt_closed_domain`。远程 binary SHA-256 为 `bfe69ee0d800a99fc1b02f044495f0a4f879070a46837a858d7d26fd904386a0`，DDL SHA-256 为 `70d001e7cfc465f8098dc037fd932a6d76647629561e2e8be91decbdf75df016`，日志报告 24 个测试数据库、本轮 namespace/UID 和传输/构建缓存清理。该测试的读取 authority 是显式测试替身，仍不构成生产身份、撤权或 C provider 验收。

D 随后新增 [独立历史命令收据读取入口](../backend/internal/systembackupproducer/command_history_read.go)，为关闭 domain、撤销 grant 后的原命令提供独立授权只读查回，不生成新句柄。对应本地定向测试 5 个顶层、含子用例 17 项通过，Linux 测试二进制编译通过，脚本确认缓存和产物已清理；该新增入口尚无生产 authority 或真实 MySQL 专项验收，不计入上面的 24 项远程结果。

新增 `backend/internal/systembackupevidence/d_producer_mysql_test.go`，使用 `systembackup_mysql` build tag。沿用已通过的公开服务夹具，真实路径直接运行 D 服务和 A 的 `NewSystem*Environment` SQL，串联 Acquire → BeginCall → Observation → Pending → Claim/ReadClaim → Finish → CommitResult。测试 SQL driver 不参与真实路径的查询、写入、提交和回滚。身份、引用、容量、evaluator 和对象证明仍是明确的测试 authority，不代表生产身份或 C/provider 验收。

## 用例与边界

本地 seed 同时覆盖固定时钟和每次 SQL 采样推进的时钟；Observation 采用 probe 的 CapturedAt，history/proof 时间随之对齐，避免固定时钟掩盖真实数据库时序问题。容量采样固定为微秒精度。

22 个 MySQL 子用例覆盖：完整服务链和精确只读重放；pending/claim/finish/result 的审计及最终检查失败回滚；四个阶段的 grant 过期与撤销拒绝；A chunks 和 D receipt 插入的真实 SQL 失败；并发 claim 单赢家；并发结果提交的一次写入和同收据重放；真实 COMMIT 成功后向服务隐藏确认，首次返回空结果和 ErrCommitUnknown，后续精确读取原收据。执行 grant 过期后仍允许独立授权的历史收据读取，关闭读取授权后拒绝。

回滚与重放比较所有 A/D/审计表的完整行，不只比较计数；成功检查 run committed/version 5、target/result version 1、A ready/version 3、claim 清空、Exact.Version/1 原样保留、health 不变、history 不变、三条 evidence references 和 chunks。

丢失确认通过真实 mysql driver 的事务包装注入：先调用实际 COMMIT，再返回错误。这不是 TCP 断连代理，也不验证进程重启后的句柄重建。撤销/过期夹具同步改写 canonical record 和 SQL 投影，不直接伪造成功状态。仅覆盖 unconfigured candidate 结果模式。

## 隔离与执行

入口拒绝任意 DSN；仅连接隔离 MySQL Pod 的 127.0.0.1:3306，先核验 run namespace、namespace UID、server UUID、MySQL 8 和严格 SQL 模式。每个子用例随机创建 dprod_ 库，运行 065 的 A evidence/chunks DDL、A GC 候选约束和 D 八表候选 DDL，结束核验 server UUID 后删除并确认库已不存在。候选 DDL 不进入正式 migration。

远程入口复用 fresh-migration smoke 的临时 namespace/emptyDir MySQL、固定镜像与 migration binary。目标为 root@10.130.14.23，context kubernetes-admin@kubernetes，node1；现有 SOURCE_NAMESPACE 只用于既有隔离基线流程。producer profile 将隔离 smoke 的镜像策略固定为 Never，缺失缓存镜像时失败，不自动拉取。新增 phase 只写运行 namespace 的测试 Pod，传入契约夹具并清理临时文件。未批准生产启用或生产表变更。

本地命令（不安装依赖，GOPROXY/GOSUMDB 关闭，默认 vet 开启）：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-a-producer-adapter-validation.ps1 -MySQLService
```

该入口冻结 backend Go/SQL、go.mod/go.sum、脚本和 v12 契约，记录逐文件 SHA-256，运行两包回归和 tagged seed，再编译 Linux MySQL probe 与 migration runner；finally 清除本轮源码副本、缓存、遥测目录和二进制。远程必须传入已通过的 ExpectedSnapshot；输入变化将拒绝连接远端。

本地验证结果、最终源码清单和可直接执行的远程命令见本任务交接记录。尚未远程执行，不能将本地通过解释为 MySQL 用例通过。

## 远程执行命令

在仓库根目录运行以下命令。入口会先校验指纹，再重新进行本地回归和编译，之后才连接远端；若共享源码有任何后续变更，停止并重新冻结验证，不跳过指纹检查。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
Start-Transcript -Path ('.\docs\evidence\system-backup-d-producer-service-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
try {
    & .\scripts\system-backup-a-producer-adapter-validation.ps1 -MySQLService -Remote `
        -ExpectedSnapshot '.\docs\evidence\system-backup-d-producer-service-snapshot-20261008.json'
} finally {
    Stop-Transcript
}
```

本机 Docker 可访问，但没有已缓存的 MySQL 镜像；没有拉取镜像，也没有连接 SSH/Kubernetes。两个早期固定时钟快照已停止后续编译并清理，保留日志和 superseded_reason，不能作为最终验收依据。

## 本地结果

最终冻结 853 个输入文件，181 个顶层测试、含子用例 1829 项通过；默认 vet、固定/推进时钟 seed、Linux MySQL probe 和 migration runner 编译均通过。快照结束时源码漂移为 0。所有本轮构建/缓存/源码副本已清理，未安装依赖，未执行真实 MySQL。

[固定源码清单](evidence/system-backup-d-producer-service-snapshot-20261008.json)、[本地完整日志](evidence/system-backup-d-producer-service-advancing-local-20261008.txt)、[机器回执](evidence/system-backup-d-producer-service-mysql-20261008.json)。
