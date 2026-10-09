# D 页面只读 API 固定数据验证

本轮提供 `GET /api/v1/admin/system-backup-overview`、配置及配置版本，以及 backup、restore drill、preflight、artifact verification 四类任务的列表和详情读取。各任务的 events/logs 与目录扫描/记录/导入、prune run、operation、promotion 列表返回固定空集；Manifest 返回 `503 not_ready`。端点只接收访问令牌、现有管理员身份；未配置正式 `system_backup.read` role binding，因此只允许显式固定数据验证，不能作为生产授权实现。

默认 `SYSTEM_BACKUP_READ_FIXTURE` 未设置，端点返回 `503 not_ready`。只有测试环境设为 `1` 才返回固定数据，并发送 `X-System-Backup-Data-Source: fixture` 与 `Cache-Control: no-store`。任务与配置字段分别来自 v12 的 `admin-task-detail-redacted-examples.json` 和 `admin-control-redacted-examples.json`；任务 ID 扩为三条以验证分页。没有写入数据库、调用 controller 或接触真实备份。

列表支持 `limit`（默认 50，最大 500）、`status` 和 opaque `cursor`。游标以当前服务的 JWT secret 签名，绑定资源类型、limit、过滤条件及位置；篡改或跨列表复用返回 `400 validation_failed`。无状态过滤返回 `stable_cutoff`，有状态过滤返回 `eventual`。详情校验资源前缀，未知 ID 返回 `404 not_found`。错误使用 `{code,message,details,request_id}`。

这批端点用于验证 Admin 只读 wire shape。正式权限绑定、数据库查询、事件与日志内容、Manifest、恢复差异、基线详情和页面接线仍需按 v12 合同继续实现；不能把固定数据视为运行环境状态。
