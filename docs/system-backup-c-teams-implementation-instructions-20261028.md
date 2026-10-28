# 给 C / Team 负责人的实现任务单

2026-10-28，可独立转发。固定核对分支 `codex/backup-team-integration@288d74a92c37c6432ebb3dcdd6fd7c2afd837675`；B PR公共runner为 `08d15abf`，D基线 `backup@8ef5fa7f`另有本地增量。你的持续开发需交最新head及上述核对点之后的diff，不能以旧分支测试宣布当前公共整链通过。

## 已有贡献与唯一控制面

保留现有Team-data SQL/Redis/对象/文件、capture/restore/worker/catalog、shared gate与迁移兼容实现。`team_data_worker.go:TeamDataService.Run/runOwned` 是另一任务体系的worker，不在公共task内启动它；其GET_LOCK不停止业务writer，也不等于strong gate。

当前D公共链使用unversioned v12 canonical表。你分支的 `system_backup_v2_*`、legacy默认engine selector、独立v2启用flag是明确兼容方案，不能机械替换当前SQL。保留缺runner时拒绝capture；不在zhanghui08同时启动legacy/v2/B私有三个控制器。schema/engine最终选择及全套grants/registry/observer迁移由D统筹、部署owner授权，不要求Team私自改绿catalog。

## T1：交当前Team schema/数据贡献，修复旧视图漂移

**位置**：`backend/internal/systembackup/team_data.go`、`team_data_schema.go`、`team_data_restore.go`；B导入的 `backend/internal/systembackup/domain/teams.go` 旧显式列清单及 `normalizeTeam` 作为共同核对点。不要通过反射或忽略unknown列声称兼容。

**输入**：D/B给原task/attempt/config/checkpoint、共享MySQL视图及原registry/schema pins；Team owner给当前业务表/列、关联/状态/敏感字段语义及增量。重点核对teams/members/tasks/events/work_items/workflow_phases/outbox/templates，以及owner-Team/北向新增实际表。

**输出**：准确schema/registry diff、每表完整字段与引用、状态转换/排除/重建规则、空表完整性及同checkpoint计数/摘要。新Team字段不能被旧 `domain/teams.go` allowlist静默丢掉；历史/removed/模板与正在进行的工作均须定义。

**事务/异常/验收**：B共享捕获点，不另开Team SQL快照冒充同一checkpoint；漂移/未知状态/缺关联拒绝。用真实当前Team数据库覆盖完整表、空表、新列/类型、未知状态/孤儿引用与隐藏JSON字段；模型测试与真实SQL分开。

## T2：接公共task→B worker，抽取现成执行能力

**位置**：`team_data.go`、`team_data_worker.go`、`team_data_redis.go`、`team_data_recovery.go`和 `cmd/system-backup-artifact/team_data.go` 的纯数据/执行adapter。保留旧Run作为legacy入口；公共路径不调用其claim/UPDATE system_team_data_backup_jobs或自动把旧running任务批量置failed。

**准确D输入**：复用 `systembackupdispatch.Input`：Authority包含InstallationID/TaskPublicID/TaskType/RequestID、ConfigVersion/ConfigSHA256、AttemptNo/Phase、当前ClaimOwner/ClaimRowVersion、MaintenanceOwner/FencingToken、原DeadlineAt；另有原ConfigSnapshot、ProfileID/Revision、原JobBindings、BackupSpec。来源须是原SQL/部署准入，不能从Team配置或请求任选。ClaimRowVersion不是Job generation。

**实际调用**：D `composeTaskExecution→TaskExecutionLoop→Dispatcher→B publicadapter`；Prepare只由 `LinuxProfileConfig.BuildParts/BuildWriters` 冻结描述，Capture经D `ExecutionJobPorts` 的真实ConfigMap/Job caller执行。D/B负责注册Team模块operation及精确payload/adapter入口；目前不能称为已有Team公共生产caller。你把现成逻辑抽成不自建任务/控制SQL的模块，并提供构造函数/依赖表，由该caller调用；不自己猜operation或注册另一套任务API。

**输出**：领域capture/checkpoint/统计/警告及认证证据引用。最终公共返回 `dispatch.ModuleResult{SchemaVersion,Part,Category,Status,Checkpoint,Statistics,Warnings,EvidenceIDs,FailureCategory}`，category为teams；status只completed/failed/canceled，非task succeeded。共享mysql/redis/workspace part的唯一结果与领域checks由D/B组合，不让两个collector重复发布同一part。

**异常/验收**：取消、超时、失claim/fence停止新读/Job/外部写；保留原checkpoint和部分/未知动作，不新建attempt、不重捕已封存内容。验证公共领取receipt/attempt唯一、未知Job创建不盲重发、真实UID/grant/result绑定、terminal不会复活。legacy成功不能当公共链成功。

## T3：全部Team writer接唯一gate，冻结Redis/文件身份

**位置**：`backend/internal/backupgate/{boundary,driver,work_unit,http_boundary}.go`，Team scheduler/outbox/dispatch/stream/presence、workspace/Runtime写入与gateway实际入口。保留现有Team work boundary和Skill子任务join；补完整writer差集。

**输入**：D提供同一公共gate/maintenance owner/fence、原writer UID/generation/state/checkpoint与hold/deadline；Team提供所有实际进程/异步/远端writer身份及真实停写方法。B负责实际Pause/ACK/恢复，D负责原intent/ACK/resume账本；外部NFS/Runtime writer不能由Pod列表推断不存在。

**输出**：完整writer清单与逐项ACK/未确认停止事实；Redis keyset/type/TTL/stream及checkpoint/恢复语义，workspace/PVC/PV/namespace/UID/subpath与共享writer证明。source与target凭据分离；密码/token只以A批准引用提供，不放checkpoint/事件。

**事务/异常**：先公共intent提交再远程Pause；全ACK且当前CheckPaused后才捕获；所有collector/Job确认停止并撤权后再Resume。未知停止/StopAndWait超时不能释放许可或恢复源；恢复用新scope。不能用两个gate各自drained替代一个完整屏障。

**验收**：在途Team任务、outbox重发、断线stream、后台last-seen/异步写、远端Runtime、TTL/类型变化、共享PVC、取消清理卡住、gate重开逐项实测；拒绝“所有已列writer成功”替代完整覆盖证明。

## T4：恢复必须离线且不重放业务，独立验证

**位置**：`team_data_restore.go`、`team_data_recovery.go`、`team_data_provision.go`及B `domain/teams.go:normalizeTeam`。

**输入**：B/D提供原sealed source、isolated target、原user/instance/team/PVC等映射、受认证workspace与Redis/object身份、原schema/registry/checkpoint和容量；A提供restore-write与独立SELECT-only verifier授权。

**输出**：完整映射/规范化报告及teams分类closed verifier checks（expected/actual、摘要/计数、证据ref、warning/failure映射）。保留已完成历史；在途tasks/work items/outbox/stream cursor按唯一合同关闭或清空，Team/member不得恢复后自动调度/启动/发送消息；token/Secret引用按新目标策略重建，不恢复旧来源访问权。

**验收**：真实隔离库/Redis/文件/对象联合恢复，源目标误指、旧namespace/PVC/token残留、outbox重复发送、原任务重放、错mapping、撤权/期限、故意漏表/漏workspace拒绝。Verifier不得使用restore admin账号或做写入。旧状态规范化不足先提交明确合同决定，不能猜默认值。

## T5：公共产物适配边界，不重复建设

**位置**：`systembackup/artifact.go`、`team_data_catalog.go`、`cmd/system-backup-artifact/*` 的legacy格式适配边界。保留legacy行为，不将其Manifest/Ed25519 framing/本地key文件直接注册为公共v12。

公共artifact/finalizer/catalog已有唯一owner。Team只提供领域内容、immutable seal/字节格式/摘要及证据交接，B `BuildPartResult`消费真实 `SealedPart{Reference,ContentSHA256,EvidenceIDs}`；A先认证worker原结果，D/A登记原报告。重封装/重加密必须新摘要和证明，不能沿用旧signature/checksum。

如果你同时承担公共C基础设施，请将这部分单独交给原唯一owner职责：`CurrentTaskFacts.Backup/Preflight`须用D原CurrentFactsSQL/同snapshot和原有效期；`ManifestReader.Read`返回原public manifest bytes；finalizer/catalog及两份catalog正式合同/三canonical表领域规则分别签收。不能把TeamDataCatalogStore现有成功当这些接口已实现，也不要求Skills负责人重写它们。

## D/B/A必须同时交付

D负责唯一schema/engine决策、scheduler/claim/receipt/续租/阶段CAS、ResourceJournal、writer账本、模块生产caller及结果推进；新SQLExecutionRecords/Job bridge仍需最终验收与真实owner。B负责worker operation、共享checkpoint/实际执行/停Job和workspace证明。A负责原材料/用途/身份/期限/撤销、worker grant与签名。任何缺项准确not_ready，Team不替其他owner造实现。

交付最新head、相对288d74a9及当前D/B的精确diff、实际构造caller、完整覆盖矩阵、原生日志/退出码和清理记录。不得安装依赖；删本轮自有cache/tmp/binary，保留日志。分别报告模块本地、真实SQL/存储、真实K8s和公共整链验收；保留原所有阶段/权限/schema/registry门禁。
