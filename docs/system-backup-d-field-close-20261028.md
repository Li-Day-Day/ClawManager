# D 现场与独立验收收尾（2026-10-28）

当前真实备份尚未执行或验收，现场初始化 `--apply` 未执行。本记录不替代 A/B/C 的合同签收和部署授权。

- 现场 MySQL 已配置测试 TLS，操作者报告通过 Service 的 `VERIFY_IDENTITY` 连接和独立只读账号核对，数据库 `clawmanager`、server UUID `f1f5f76a-95f5-11f1-b08e-366835b4a029`，安装状态表 0 行。临时只读账号、observer 探测账号及探测 Pod 已删除。详细事实和测试 CA 生命周期见 [现场记录](system-backup-d-field-tls-observer-20261028.md)。
- 分配的安装 ID `installation_dfa02579009349938c8125490d9dfd41` 是 owner 的首次登记，尚需独立授权、部署材料和配置绑定。不能以该登记直接启用备份。
- [observer](../backend/internal/systembackupobserver/observer.go) 要求固定数据库、服务器、安装及独立 `user@host`，核对直接 SELECT grants、原操作者/接口/幂等键摘要和跨 actor 的同键计数；成功 backup 还检查最新已封存 capture attempt 的完成 relay。独立 SQL 只提供持久事实，不证明 Job 清单完整或 Worker 凭证已获授权。
- 操作者已用 DBA 只读连接确认 latest capture 查询在现场 MySQL 可执行；此后新加的跨 actor 同键计数查询尚未现场执行，不能引用旧回执背书。可按 [现场记录](system-backup-d-field-tls-observer-20261028.md) 重跑只读预检；其结果不是 observer 权限或备份验收。
- [两轮入口](../scripts/system-backup-d-two-round-smoke.mjs) 要求真实受控请求、独立 observer、不同幂等键和约定失败类别。默认完整验收需可独立认证的第二安装；`execution` 模式明确报告跨安装未测，不产生完整验收结论。两个模式均不得用模型数据冒充现场结果。
- 本地 Go observer 测试和 Node 冒烟、两轮、wrapper、SQL 对照模型测试通过，未安装依赖，本轮专用临时测试目录已清理。没有执行真实成功轮或失败轮。
- 共享工作区已引入 B runner 和 D 执行持久化/Job 接点，详见 [执行交接](system-backup-d-execution-records-20261028.md)；API/controller 的 production owner link、A 真实授权材料、C 成品适配、受审迁移与现场部署仍未齐。不得从模型测试或新文件存在推断整链通过。
