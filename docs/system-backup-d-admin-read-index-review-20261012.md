# D：四类任务只读分页索引评审

日期：2026-10-12。此页评审 [候选 DDL](system-backup-d-admin-read-index-candidate-20261012.sql)，不批准或执行 migration。

## 查询与现有索引

`systembackupread.Reader` 对四张任务表使用相同的安装范围和自增 `id` 倒序分页。首屏先查 `MAX(id)` 固定上界；分页查 `origin_installation_id=? AND id<? ORDER BY id DESC LIMIT ?`，可选 `AND status=?`。每页只投影 v12 Task 的共同字段，不读取配置快照、失败消息或 provider 数据。

共同详情读取按 `origin_installation_id=? AND public_id=?` 定位，现有四表的 `uk_*_origin_public(origin_installation_id,public_id)` 已覆盖该查找；本候选不为详情增加索引。

现有四表的 `uk_*_origin_public(origin_installation_id,public_id)` 以 `public_id` 排序；`idx_*_status(origin_installation_id,status,next_reconcile_at,id)` 的 `next_reconcile_at` 夹在 `status` 与 `id` 之间；backup/drill 的 `idx_*_created(origin_installation_id,created_at,id)` 也以 `created_at` 排序。这些索引均不能直接提供目标 `id DESC` 顺序。候选每表两条索引分别服务无状态筛选和有状态筛选；不能把仅有的状态索引视作两类分页的共同替代。

| 查询 | 候选索引 | 预期访问方式 |
| --- | --- | --- |
| `MAX(id)` 与无筛选页 | `(origin_installation_id,id)` | 安装范围内从最大 id 倒序扫描，按 limit 停止 |
| 有 `status=?` 的页 | `(origin_installation_id,status,id)` | 安装与状态共同定界，再按 id 倒序扫描 |

## 隔离 MySQL 评审命令

对四张表分别在已审查的隔离数据库中，以真实分布的安装、状态和至少多页任务量执行下列只读查询；`<table>` 只能替换为四张固定表名。比较新增索引前后计划、扫描行数、排序和耗时，不能仅以空表 EXPLAIN 下结论。

```sql
EXPLAIN ANALYZE SELECT COALESCE(MAX(id),0) FROM <table> WHERE origin_installation_id='installation_review';
EXPLAIN ANALYZE SELECT id,public_id,origin_installation_id,task_type,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,retry_of_public_id,status,pending_reason,attention_reason,can_cancel,config_version,retryable,failure_category,row_version,deadline_at,created_at,updated_at,schema_version FROM <table> WHERE origin_installation_id='installation_review' AND id<1000000000 ORDER BY id DESC LIMIT 51;
EXPLAIN ANALYZE SELECT id,public_id,origin_installation_id,task_type,actor_type,actor_id,endpoint,idempotency_key,request_hash,request_id,retry_of_public_id,status,pending_reason,attention_reason,can_cancel,config_version,retryable,failure_category,row_version,deadline_at,created_at,updated_at,schema_version FROM <table> WHERE origin_installation_id='installation_review' AND id<1000000000 AND status='succeeded' ORDER BY id DESC LIMIT 51;
```

验收需记录 MySQL 版本、表行数、每安装行数、状态分布、实际语句与绑定值、`EXPLAIN ANALYZE` 原文、P50/P95 读延迟、写入/更新延迟、索引占用，以及新增索引期间对写入的影响。若优化器仍进行大范围扫描或 filesort，应先调整方案再编号 migration。两条额外索引/表会增加写入和存储成本；最终取舍须由现场计划与负载测量决定。当前没有真实 MySQL EXPLAIN 回执，候选 DDL 保持不执行。

## Operation 列表增量

`system_backup_operations` 的 D 内部列表现按 `origin_installation_id=? AND id<? ORDER BY id DESC LIMIT ?` 分页。现有 `(origin_installation_id, public_id)`、`(origin_installation_id, result_config_version)` 等索引不能直接按安装范围提供 `id` 顺序；候选 DDL 增加 `(origin_installation_id,id)`。使用包含多页操作、不同安装和不同状态的隔离数据库，比较新增前后的 `MAX(id)`、第一页和续页 `EXPLAIN ANALYZE`、扫描行数、读延迟及写入成本后再决定是否编号 migration。该候选没有执行。
