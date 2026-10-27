# D 总览当前 promotion 记录与来源绑定

【2026-10-14 最新真实 MySQL 验收已通过】[索引 v2-r2 联合回执](system-backup-d-admin-read-index-v2-r2-remote-20261014.md)中 promotion 子测试、full-schema 父测试、A 授权、HTTP 与迁移全部 PASS，指纹匹配、清理完整、最终退出 0。当前绑定/跨安装/可用性丢失的限定数据库缺口已关闭，无需执行下方相同输入的独立命令；资格/证据语义、七组健康及完整 PromotionResource/总览仍待完成。下方本地和待远测描述保留其交付时范围。

日期：2026-10-14。范围是 065/066/067/069 正式表的内部读取和数据库绑定校验。完整 OverviewResource、PromotionResource、当前七组健康、恢复资格与生产页面仍须各 Owner 权威来源和签收。

## 读取与事务

[ReadOverviewPromotionControl](../backend/internal/systembackupread/overview_promotion.go)沿用现有总览 RepeatableRead 事务：A 初次授权、锁定安装/config、完整控制计数、当前 matrix 的 active promotion、backup/drill/evidence/创建配置绑定、后续 Owner builder、A 最终复查、确认 COMMIT 后返回。

只查询受信安装和当前 matrix 的 active 记录，不回退到别的 matrix、旧 superseded/revoked 记录或另一个安装。只有实际查询没有返回 active 行时才得到无当前记录；SQL/流错误、未知 schema、损坏行、重复 active 或缺少来源均失败关闭，不能变成“基线缺失”。内部结果和嵌套来源类型禁止 JSON 序列化，getter 返回值副本，不注册新的 HTTP 路由。

完整总览 builder 须使用 `readOverviewPromotionInTransaction` 接点，在同一事务内补 Owner 来源及闭集资源；不能先提交独立结果再拼接另一个时点的数据。普通 SELECT 共用一致性快照；必要的当前锁定读取还须证明准确版本/绑定。授权原因保留给既有错误映射，任一构建/撤权/取消/提交不明都返回零结果。

## 已核对的绑定与边界

- Promotion：准确 schema/安装/matrix/ID、active 的生命周期空值条件、hash 形状、正且可安全表达的版本、actor/时间、创建时七组健康为 healthy。
- Backup：同安装、准确 ID 与 matrix；持久化终态 acceptance/eligible 标记、manifest/acceptance checksum、registration ID/hash 与 promotion 一致；当前 row version/prune guard 不小于创建记录版本。合法可用性状态须相符。
- Drill：同安装、准确本地 backup 来源和 checksum；持久化 acceptance/eligible、delete-on-success/succeeded/none 的清理组合；当前 row version 不回退。
- Evidence：通过已绑定的 promotion/drill 取得准确全局 ID，再核对 schema、drill owner/目标、content checksum 和版本。该表没有安装列，不能用外部提供的 evidence ID 独立查询。只读取登记元数据，不选择 inline payload、object locator、envelope 或 provider 内容。
- 创建配置：同安装、准确历史版本和 schema，不能把当前配置代替创建时配置；允许创建版本与现行版本不同。

source row version/prune guard 是创建时版本，不要求与当前可变行版本相等；合法健康/hold 更新会推进当前版本。创建时 healthy 也不等于当前 healthy。artifact 随后成为不可用/corrupt 等状态时，当前记录仍存在，其来源可用性如实保留，不能抹掉基线或重写历史健康。

这里的 bool 只表示查得并核对数据库记录，不能直接作为完整资源或恢复放行。Promotion、backup、drill 的资格 decision hash 分别保留；本组件不猜测公共决议 hash 的重算/映射算法，不认证实际 signed catalog、验证报告正文、隔离恢复或健康证明，也不创建新的 eligibility。Evidence 只按 promotion 已登记引用读取；允许的 drill owner/type 元数据不能替代 A 对具体报告语义的签收。完整组装前须由 D/A/C 明确决议来源、七组当前依赖 identity/version 与有效期，并补 B 的清理/归属变化事实。

## 本地验证与远程范围

读取包 50 个顶层、含子测试 256 项及默认 vet 已通过；当前 promotion 新增部分为 6 个顶层/75 项，覆盖绑定漂移、跨安装/matrix、重复行、缺来源、版本回退、合法版本推进与可用性丢失、原始类型不可序列化、getter 副本、SQL/流失败、权限原因、提交不明及同事务 builder 的失败零结果。五条投影已静态核对存在于对应正式迁移。Linux tagged A/D MySQL 探针编译退出 0，SHA-256 为 `c27e39152b0c7d9ff7b7cbadc39ecee46967d327a809eed91d3862bd25600932`；准确自有目录报告 CLEANED 并另查不存在，未安装依赖、未保留测试构建产物。[机器回执](evidence/system-backup-d-promotion-control-local-20261014.json)绑定三个 D 源文件和完整本地输出，不声称冻结整个依赖图，编译不算数据库执行。

`TestDAdminReadFullSchemaMySQL` 新增 `overview_current_promotion_binding_and_availability_loss`：空 active 查询、正式 CHECK/FK 下的合成 backup/drill/evidence/promotion 行、真实 A read scope 与跨安装隔离、源 artifact 变 corrupt 且 row version 推进后仍保留创建记录；会话撤销后也要求零结果。这些是合成数据库投影，不证明真实 artifact/catalog committed、eligible backup/隔离演练或生产创建授权。现有历史远程回执不包含新增断言，不能补记 PASS。

若要独立验证，由操作者从仓库根目录保存新文件并运行：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-promotion-control-mysql-remote-20261014.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D promotion control MySQL validation failed' }
  Write-Output 'D_PROMOTION_CONTROL_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

验收要求同轮新增子测试与父测试/A 授权/任务 HTTP/迁移全部 PASS，准确二进制/DDL/catalog 指纹、相同 namespace UID、run-owned 数据库及两端缓存清理、最终退出 0，且无 CLEANUP_PENDING。当前[索引 v2 档位](system-backup-d-index-writer-baseline-20261014.md)也会运行同一最新 A/D full-schema 探针；其新断言与准确指纹齐全时可分别接收，不必另外重跑独立档位。

本轮没有运行远程测试、改变生产 grants、编号 migration 或开放总览/基线 HTTP。生产 Admin 读取连接的 promotions/来源/evidence SELECT 和 A 的授权查询权限仍须受审部署；方法包装及 root 隔离探针不替代权限正负测。
