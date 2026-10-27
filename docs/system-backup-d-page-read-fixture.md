# D 页面只读 API 固定数据验证

本轮提供 `GET /api/v1/admin/system-backup-overview`、配置及配置版本，以及 backup、restore drill、preflight、artifact verification 四类任务的列表和详情读取。各任务的 events/logs 与目录扫描/记录/导入、prune run、operation、promotion 列表返回固定空集；Manifest 返回 `503 not_ready`。端点只接收访问令牌、现有管理员身份；未配置正式 `system_backup.read` role binding，因此只允许显式固定数据验证，不能作为生产授权实现。

默认 `SYSTEM_BACKUP_READ_FIXTURE` 未设置，端点返回 `503 not_ready`。只有测试环境设为 `1` 才返回固定数据，并发送 `X-System-Backup-Data-Source: fixture` 与 `Cache-Control: no-store`。任务与配置字段分别来自 v12 的 `admin-task-detail-redacted-examples.json` 和 `admin-control-redacted-examples.json`；任务 ID 扩为三条以验证分页。没有写入数据库、调用 controller 或接触真实备份。

列表支持 `limit`（默认 50，最大 500）、`status` 和 opaque `cursor`。游标以当前服务的 JWT secret 签名，绑定资源类型、limit、过滤条件及位置；篡改或跨列表复用返回 `400 validation_failed`。无状态过滤返回 `stable_cutoff`，有状态过滤返回 `eventual`。详情校验资源前缀，未知 ID 返回 `404 not_found`。错误使用 `{code,message,details,request_id}`。

这批端点用于验证 Admin 只读 wire shape。正式权限绑定、数据库查询、事件与日志内容、Manifest、恢复差异和基线详情仍需按 v12 合同继续实现；不能把固定数据视为运行环境状态。

## 并行开发增量（独立工作树）

前端新增 `backupApiRead.ts`，提供 overview、config/版本、四类任务列表/详情及任务 events/logs 的类型化只读客户端，并验证列表 envelope、资源 ID、分页上限、取消请求和错误码。它拒绝带 `X-System-Backup-Data-Source: fixture` 的响应。`systemBackupReadService.ts` 复用应用现有 Axios token/refresh 拦截器，保持 HTTP 状态和来源标记。非示例页面仅在构建时显式设置 `VITE_SYSTEM_BACKUP_LIVE_READ=1` 后使用下述真实读源；默认仍不发起备份 API 请求。正式 `system_backup.read` 权限、真实数据库查询及相应 DTO 签收仍是显示生产数据的前置。

客户端的运行时边界检查进一步核对 v12 `schema_version`、安装/任务身份、任务种类、列表字段与条数、游标的 4096 UTF-8 字节上限、状态筛选的 `eventual` 一致性和事件/日志的目标 ID。它是读取边界的结构检查，**不替代完整 JSON Schema 或服务端授权**；现有契约测试继续验证完整字段与条件约束。新增失败、错资源和取消期间解码测试在无依赖 Node 测试中通过。

`backupReadPages.ts` 再提供完整任务列表的分页收集：固定每页 limit，沿 opaque cursor 读取，拒绝重复游标、重复任务 ID、跨安装混合和页间一致性标记变化；取消或达到页数/条数预算时失败，不把部分记录冒充完整列表。真实数据库读取、正式权限与分页来源签收仍是启用前置。

`backupLiveSource.ts` 与 `BackupLiveWorkspace.tsx` 已把只读路径接到非示例页面的显式联调模式：先读取概览、配置及四类任务的第一页，且安装 ID、配置版本与启用状态相符后展示真实摘要。用户可按需加载后续页；游标循环、重复任务、跨安装数据和一致性变化会使该次加载失败，已显示的记录保留并可重试。`503 not_ready` 或带 fixture 来源标记的响应继续显示原“未接入”界面；首屏失败与取消不展示部分记录。真实视图只显示已获取的概览、配置和任务 ID/状态；目录、清理和基线标为尚未开放，日志与差异不展示。示例入口仍独立。当前后端仍只有固定数据入口，正式 `system_backup.read` 授权及数据库查询未交付，因此本接线不会让实际安装提前显示可用状态。

后续增量：显式联调视图在可见标签页内每 30 秒重新读取完整首屏；读取失败按 5、10、20、40、60 秒退避，不可用时 60 秒复查。隐藏标签页暂停请求，重新可见后立即复查；刷新前取消旧分页请求，卸载或手动刷新时终止旧读。调度与取消逻辑现集中在 `backupLivePolling.ts`，固定时钟测试覆盖不重叠读取、后台暂停及停止后丢弃迟到结果。四类任务第一页和按需后续页完成后均再次读取概览，安装、配置版本或启用状态漂移则拒绝组合结果。页面定向测试 31 项通过；先前独立 i18n 测试 5 项通过。浏览器计时、完整 Vite 构建和真实数据库响应尚未验收。
