# D 任务事件分页与详情 SQL 探针

> 2026-10-16 更正：此前将事件 API 依赖写成“A 再提供读时脱敏”并不准确。主分工文档第 6.2 节事件表定义及机器合同 `admin-activity-resources.schema.json` 的 `EventResource.message.x-redacted-before-persist=true` 已要求入库前脱敏。D 已据此实现同事务读取已脱敏 message 的完整事件接口，详见 [事件 API 交接](system-backup-d-event-api-20261016.md)。以下元数据实现与旧测试回执保留为历史说明。

日期：2026-10-16。继续推进 D 的只读链路：新增四类任务事件控制记录读取、独立域认证的分页游标，以及已实现详情控制字段的真实 MySQL 探针断言。

## 任务事件的 D 读取贡献

`Service.ListTaskEventControl` / `Reader.ReadTaskEventControlPage` 读取备份、演练、预检和校验的事件元数据。先经 A 的现有 ScopeProvider 取得可信安装并读取准确 Task；在同一 RepeatableRead 事务里固定该任务事件最大 ID，再按 `created_at DESC,id DESC` 取至多 limit+1 条。后续页面同时限定原 cutoff 与时间/ID keyset，因此新插入的回溯时间事件也不能进入旧分页。无事件是已查询的空列表，任务不存在仍先做最终权限复查。

固定 SELECT 包括 schema/安装/目标、事件类型/级别、保存的 task_status、封闭 details 的 token/数字/引用、request ID 和时间；不选择 `message`、配置正文或错误原文。事件及其 details 是观察记录，不改变 Task 的当前状态。时间严格保留数据库 UTC 微秒精度。details_present=false 时不得混入 detail；truncated=true 时原大小/hash 必须完整；SET 以外的 diagnostic event 仍限定 a–d 的既有命名规则。

事件、页面和服务结果都拒绝 JSON 序列化，事件切片 getter 返回副本。初版将事件正文留待 A 读时脱敏，是过度前置。现已依据入库前脱敏合同，由内部 `readTaskEventControlInTransaction` 在同事务读取本页绑定的已脱敏正文，并在最后权限复查/确认提交前完成完整 DTO。四类事件 HTTP 和独立页面已经接线，以页首最新交接为准。

## 续页安全

游标独立使用 `system-backup-admin-task-event-control-page.v1` HMAC-SHA256 域，绑定安装、任务种类/准确 ID、limit、cutoff、微秒 UTC 时间和事件 ID。严格拒绝非规范 base64/整数/时间、签名或域错误、跨任务/页大小使用、重复或乱序来源。游标的安装在最初授权阶段比对，错误安装在 Task/事件 SELECT 之前拒绝。该域不能作为 task/config/log 游标使用。

## 四类详情的真实 SQL 断言准备

`d_detail_control_mysql_test.go` 接在现有 `TestDAdminReadFullSchemaMySQL` 的真实任务/attempt/Job fixture 后面。新增断言覆盖四类固定列和跨安装读取、另一个数据库连接提交的控制字段变更与原快照一致性、BIGINT UNSIGNED 最大字节值及 NULL consistency、catalog-import 校验的 NULL 本地产物状态。父测试真实会话撤销之后还检查 D 新详情读取被拒绝。

这些只是现有、固定 namespace/UID/MySQL server UUID 的隔离探针增量。必须运行完整父测试的 fixture 流程；不要仅筛选 detail_control 子项，因为早先执行记录 fixture 在父测试的 execution 子项中建立。当前未执行真实 SQL。本机 Docker 没有 MySQL 镜像，本轮不下载镜像、不自行 SSH、不改变已有远测的签收结论，也不启用生产。

## 本轮验证

复用已有 Go 1.26.1 镜像和 module cache，`system-backup-d-task-read-local-validation.ps1` 冻结源码后，以断网、只读源码/模块缓存、非 root 的临时 Linux 容器运行读取包整包测试及带 MySQL tag 的安全包编译。输出文件必须为 docs/evidence 中新文件，专属源码副本与全部构建缓存自动清理。

首轮读取包 69 主测试/470 含子项全部通过（新增事件 7/57），随后 tag 编译抓到新增探针 raced/traced 变量名笔误，失败日志保留。修正后第二轮整包 69/470 项、默认 vet 和 MySQL-tag 编译均通过。tag 编译采用仅编译、不选择测试的过滤器，不计作真实 SQL 执行。

- [首轮日志](evidence/system-backup-d-task-read-local-20261016-r1.txt) / [冻结清单](evidence/system-backup-d-task-read-source-20261016-r1.json)
- [修正后日志](evidence/system-backup-d-task-read-local-20261016-r2.txt) / [冻结清单](evidence/system-backup-d-task-read-source-20261016-r2.json)

新的事件 DTO/HTTP 与页面能力以 [事件 API 交接](system-backup-d-event-api-20261016.md) 为准。真实 MySQL、完整详情的跨 Owner 事实、日志正文、manifest、总览和写操作仍按各自范围继续验收。
