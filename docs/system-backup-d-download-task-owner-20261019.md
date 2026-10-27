# D 下载四类任务 owner 与引用锁适配

【后续 r45】[通用下载 owner 与独立公开清理](system-backup-d-download-producer-owner-20261019.md)新增有原 producer 历史的 system/capability_snapshot；四任务构造器保持原范围。修正 r32 将 optional producer 空区间集中在 L5 的问题，分别在 L3/L4/L5 检查；公开 HTTP 结束事务不再依赖已撤销的用户 actor context 释放原 claim。r45 四完整包 682/5,387、新 producer/公开清理十根/50、1,394 来源接收时零漂移和累计十五个自有目录清理均有独立回执。下文 r32 计数及边界只代表原冻结范围，实际 MySQL/正式 schema/grants/物理容量及其他 owner 仍未验收。

承接[HTTP/runtime 与独立结果事务](system-backup-d-download-http-result-20261019.md)。本轮新增具体 `SQLTaskDownloadOwners`，同时实现准入 owners 和只读下载 `SQLPolicy`。它读取已发布 067 的 `system_backups`、`system_restore_drills`、`system_backup_preflights`、`system_backup_artifact_verifications`，并通过已有 `PinnedDownloadAdmissionEnvironment`、SQL authority 和结果事务接点组合；尚未启用生产 main。

## 真实读取与权限边界

- Preview 在同一借用事务内复用当前安装/config/session/credential/revocation 检查，从当前 config 的 hash pin 读取 RBAC 原文件。先检查基本 read 权限，再根据实际行的 public/internal/confidential/sensitive 分类检查完整权限，随后解析任务和 chunk 元数据。MFA 专用的 `PreviewDownloadEvidence` 保持 private-only。
- 任务必须同安装、同类型、同 public ID、准确 schema，正 ID/安全 row_version、UTC 微秒 created/deadline 且 created 小于 deadline。证据创建时间不能早于任务；预读在 chunk 前检查，并在返回 manifest 后比对同一快照的创建时间。
- 使用原任务 `deadline_at`，不以当前时刻、配置 TTL 或读授权期限替换。任务终态或 deadline 已过不阻止读取仍在保留期内的证据。
- SQLPolicy 只接受 JWT 验证后或已知提交凭据产生的私有 actor context，并绑定 DB 指针、安装、server UUID 和 database；普通 Actor/session 字段不是此授权。每次仍检查当前 SQL 会话和当前 RBAC。
- `Registry()` 返回用途受限的副本；`Admit`、`Deletable`、`Audit` 均拒绝，不能借下载策略取得生产写入、通用审计或 GC 权限。

## 引用与锁序

从已发布 065–080 及当前下载候选 DDL 独立提取的测试夹具包含 **23 个证据引用列**。静态目录同时覆盖数字 FK 和任务报告、事件等逻辑 public ID；receipt 的 `evidence_id`、`evidence_public_id` 都进入查询，主键使用实际 `operation_id`。

适配器先以 INFORMATION_SCHEMA 验证可见列集合和类型。缺列、重复列、未知可见 system_* 引用列、类型错误或不完整 producer 安装都拒绝；SQL 标识符始终来自代码闭集。随后按 L3 Operation/receipt 引用、L4 固定四任务表、L5 其他引用的顺序查询有界排序行及空区间。备份的 manual/promotion hold 与任务行一起读取并锁定；hold 不被解释为拒绝只读下载。

所有返回引用共享 10,000 行上限，重复/倒序 ID、溢出和 owner deadline/创建时间漂移均拒绝。chunks 留在原准入后段锁定。安装了四张 system producer 候选表时，额外锁定其对应证据空区间；任务证据若出现在只允许 system evidence 的 producer 来源中，按完整性错误拒绝。

最终 Recheck 复用已经取得的 L0/L1/L2 锁，并只读复查 L3+ 引用，不在 evidence 锁之后新取 owner/ref 锁。独立结果事务只调用原 owner/ref 锁和身份/原期限检查，不把已撤权会话重新授权，也不阻止记录已经发生的结果；无效 owner/ref 则使结果与 claim 释放一起回滚。

## 本轮验证

- r28 编译失败：新测试未使用 import。未执行测试，失败证据保留。
- r29 在独立 DDL 夹具边界失败：实际 receipt 比草稿目录多 `evidence_public_id`，共 23 列而非 22。已补真实两种引用条件，未放宽未知列拒绝。
- r30 测试 transport 将 SQL 字符串内 regex `?` 当作 bind marker，触发驱动内 Fatal 后在数据库清理处等待。原进程按 300 秒超时退出，完整失败日志保留；模型只为这条无参数元数据查询排除字面量问号，并改为返回 SQL 错误以避免占住 driver 锁。
- r31 冻结定向轮通过 **10 主/66 含子项**，默认 vet、无跳过、native/包装退出 0。实际 RBAC 四角色×四分类、四任务类型、正常/错误引用、原过期 deadline、真实 pinned 环境+准入+提交后策略、撤权后的结果与回滚均执行；本地 SQL transport 和行数据仍是模型。
- [r32 独立回执](evidence/d-download-task-owner-packages-20261019-r32-review.json)接收同一冻结来源的三个完整包：security **253/1,985**、evidence **268/2,043**、read **75/519**，合计 **596 主/4,547 含子项**，新增十根/66 项。默认 vet、无跳过、Go/包装退出 0。1,388 输入 SHA `a4820738f81979034ab9118fc8b6e84b297b80aaa02bad72d43e6c991b014a93`，当前集合与逐文件摘要无漂移；五个快照及自有缓存共六个准确目录均确认不存在。
- 本轮未重跑当前 server、前端构建或浏览器；不安装依赖。复核脚本首次无法从 Node 启动 rg，尚未产生接收回执；改为由 PowerShell 导出原始 rg 文件列表、Node 独立校验集合与摘要后退出 0，没有扩大测试范围。
- [本机只读 MySQL 预检](evidence/d-download-task-owner-mysql-preflight-20261019.json)确认 Docker named pipe 不存在、kubectl 未设置 current-context、mysql CLI 不存在。未启动 daemon、修改 context 或派发远测；这不是实际 SQL 验收。

## 仍需完成

1. 其他 owner 类型的真实来源：staging、restore resource、promotion、system producer、catalog 等不能借用四任务 deadline。当前适配器对这些类型保持拒绝；这不是完整 owner 覆盖。
2. INFORMATION_SCHEMA 只反映账号可见对象，不能证明账号看不到的未知未来表不存在。正式 schema/grants、完整元数据可见性、所有参与者共同锁序和实际 InnoDB 空区间/并发必须独立验收。
3. 真实物理容量、运行身份/投射材料、持久故障 sink、结果审计保留组 GC 与最小权限、正式迁移和生产装配仍缺。脚本 SQL/报告与密钥夹具不能证明现场事实。
4. [原六项范围](system-backup-d-six-scope-readiness-20261015.md)继续未完成；本轮不替代历史升级、恢复/管理入口、完整公共读源或四矩阵 E2E。
