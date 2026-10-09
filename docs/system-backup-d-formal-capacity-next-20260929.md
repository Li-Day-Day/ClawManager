# D：正式报告卷与真实 collector 后续入口（2026-09-29）

**本轮来源补查**：已直接核对本机 fix16 构建附件、runner SHA 和 catalog；该镜像 CLI 不含历史审查三个参数，实际升级须交付新 runner。旧原文和应用构建绑定仍缺，owner 仍待签收。见[旧 SQL / 构建来源交付材料](system-backup-d-legacy-source-upgrade-handoff-20260929.md)。本段不放行 080 或真实 collector。

**最新现场回执已收到：正式报告卷准备完成，无需重跑创建入口。** [回执归档](evidence/system-backup-d-formal-report-live-20260929.json)记录 probe exit=0、传输校验 OK、临时 Pod/卷内标记和两端脚本清理成功。正式 PVC 保留；这是操作者回传证据，本任务未独立登录复查。collector 尚未启动，账号/Secret、真实报告更新与过期、跨节点真实消费者仍待验收，不放行080。

PVC `system-backup-capacity-report` UID 为 `d9452769-2406-4437-8dab-775f2de7bf13`，PV UID 为 `85c6c189-a646-4031-8e59-de26f8a45ed6`，Longhorn Volume UID 为 `02f4708d-d89f-4c19-a3f8-50551d99f79b`。卷当时 attached/healthy，位于 k8s-master。UID999/GID65532探针验证 MySQL 挂载只读、auto.cnf可读、报告目录写入和rename；fix16实际 imageID与候选一致，三个capacity参数存在。候选仅填入已确认的collector_uid/report_pvc，专用账号与Secret仍留空。

Multipathd、KernelModulesLoaded两个False条件仍保留，不能以本次成功清除。初次密码失败后重试成功；Windows pending-socket警告未使本次探针或两端清理失败。不要重跑 `-PrepareReportVolume`，该入口会拒绝已有正式PVC。

**fresh与实际库比较也已回传完成，无需重跑。** [比较回执](evidence/system-backup-d-fresh-live-comparison-20260929.json)：08:32 UTC fresh重放93迁移、99表，canonical hash仍为 `252611190c9d2cc4e02959ec5443709e78e55687773bb7afc3647eb45c0cea44`。固定实际库45张D表的差异只有 `system_backup_admin_revocations`、`system_backup_admin_sessions`、`system_backup_metadata_reservations`、`system_backup_totp_credentials` 四张表缺失，恰好对应080；其余41张在列/索引/外键与server version范围未发现差异，结果未截断。

隔离 namespace `sbk-mig-260929083141-1b7a` / UID `2483d42c-6b80-41ad-a67b-d8fbc37dc019`、远端脚本及本地scratch均报告CLEANED。本次接收核对当前catalog/文件名、建库/采集SQL指纹、目标namespace/Pod/DB身份、四表与080定义映射；原始records已由入口清理，不能声称在接收时重新计算完整schema hash。附件SHA与回执私有transcript SHA分别保留，不混用。

账号入口仍受完整统计表检查约束，现场缺080四表已由本次比较确认；现在无需运行一个预期失败的账号创建入口。下一实质门槛是旧SQL/构建来源与对应owner的受审查结论，再经正式迁移入口补080，之后才能创建完整权限账号并验收真实collector。比较范围不覆盖业务数据语义或所有schema属性，不替代历史来源、迁移审批和锁内前置检查。以下保留创建和比较入口用于追溯。

## 先执行正式报告卷准备

```powershell
.\scripts\system-backup-d-live-preflight-remote.ps1 -PrepareReportVolume
```

固定已有 namespace/MySQL Pod/node 身份，重新执行现有 Longhorn 预检及非加密 V1 双副本限制。读取 MySQL auto.cnf 属主 UID，运行固定 app digest 的 `-help` 并记录三个 capacity 参数是否存在和实际 imageID。镜像帮助正常但缺参数时仍可独立准备卷；镜像运行失败则在建卷前阻断。

只创建新的 `system-backup-capacity-report`，RWX/Filesystem/16Mi，使用现有 longhorn-rwx；已有同名 PVC 一律拒绝接管，不复用已删除的临时测试卷。记录 namespace、PVC、PV、Longhorn Volume UID 及实际 profile、回收策略。当前 SC 为 Delete：入口保留 PVC，但手动删除 PVC 仍可能触发后端删除；未修改全局 SC 或 PV 策略。

root 初始化容器只挂新报告卷，检查根目录无业务内容后设置 root:65532 / 2770；不递归操作、不挂载 MySQL。非 root 探针使用现场发现的 UID/GID65532，MySQL PVC 与 mount 双层只读，不设置 fsGroup；检查 /proc/mounts 的 ro、读取 auto.cnf、报告写入/0640/rename/读取及删除探针标记。该探针是权限检查，不会写 report.json，也不冒充真实 collector。

输出 `PREPARED_NOT_ACCEPTED` 仅表示准备完成。临时 Pod 按本轮标签/UID核对后删除；正式 PVC/PV/Longhorn 保留。失败或创建响应不确定时保留精确身份与 reconciliation 标记，不自动删除卷、不重复接管。若返回 cleanup_pending，先处理其具体 Pod 身份。执行后回传完整 JSON 和两端 CLEANED，不回传密码。

## 专用账号与 Secret

```powershell
.\scripts\system-backup-d-live-preflight-remote.ps1 -PrepareCapacityAccount
```

此入口先核对候选文件中的 namespace/Pod/数据库 UUID，确认 registry 的完整统计表名单全部存在。已知现场缺 080 四表，因此预期在 `required-tables` 阻断，账号和 Secret 均不会创建。不能减表、使用库级 SELECT 或直接执行 SQL 绕过迁移审查。

表齐备后，使用目标 MySQL 容器已有 MYSQL_ROOT_PASSWORD 执行账号管理，密码不离开该容器的客户端环境。创建全新 `cm_capacity_collector`，仅对固定表逐表 GRANT SELECT，无角色、无写权限、无 GRANT OPTION；SHOW GRANTS 精确比较通过后将进程内随机密码构成 DSN，以 stdin 直接创建 immutable Secret `system-backup-capacity-dsn`，key 为 `dsn`。不将 DSN 放命令参数、日志或本地文件。账号使用 `%` host 供动态 Pod 连接；权限范围限制为固定表，网络限制需由已有集群策略约束。

已有同名账号或 Secret 拒绝覆盖；部分成功保留 `reconciliation_required`，不自动 DROP/ALTER 或轮换。成功回执仍不代表 collector 实际连接已通过。得到卷及账号回执后才填写 capacity 候选的 collector_uid/report_pvc/collector_db_user/credentials_secret；仍使用现有生成器初始 replicas=0。

真实 collector 的连续更新、停写超过5秒拒绝，以及真实 HTTP/bootstrap 消费尚待实际镜像、完整表、账号、正式卷接线后验证。本轮没有把权限探针的标记当容量报告。

## fresh 与实际库受控比较

```powershell
.\scripts\system-backup-d-fresh-baseline-remote.ps1 -CompareLive
```

此模式需要重新捕获一次隔离 fresh：之前完整 records 已清理，摘要无法重建。不是重新确认已通过的93迁移/99表结论，而是为本次实际比较获得完整输入。沿用同一干净重放、双次采集、catalog/SQL指纹及隔离清理校验，再只读捕获固定实际库元数据和前后 ledger、Pod/container restart 身份。比较仅覆盖 D 表 columns/indexes/FK 和 server version，输出差异路径、数量与原始字节摘要，不输出字段默认值。

两份完整 records 仅保存在本轮私有 scratch，finally 清理；无永久 fresh-reference.json。结果即使 matched 也不签收旧 SQL 数据语义，不批准080，不注册 evidence。现场仍有缺表和历史迁移差异时应如实保留。

## 历史来源与本地验证

本轮进一步只读扫描 git fsck --full --no-reflogs --unreachable 返回的1175个不可达 tree，其直接目录条目没有三条旧文件名。未恢复 SQL 原文；不说明无文件名的 blob、已清理对象或外部构建归档不存在原件。未 fetch、未 prune、未修改账本。旧045/046/047的原文、构建来源和owner语义签收继续保留缺项。

本地36项测试通过：正式卷5、账号3、live捕获2、fresh接收与比较4、容量生成器/预检8、隔离RWX回归14；三个新模式 CheckOnly 通过。均为本地/mock验证，不等于现场成功。Python 使用现有运行时并加 -B，Node无需安装；没有构建产物或本轮临时目录遗留。

### 后续失败路径修正

正式卷测试现为6项（本轮累计37项）：增加固定失败原因码白名单，原始异常/命令错误仍不输出。空目录检查改为先独立执行 find 再检查结果，防止管道末端 wc 成功掩盖 find 失败。`cleanup_verified` 只说明本轮临时 Pod 清理；新增 `probe_markers_cleanup_verified` 单独说明卷内探针文件是否完成清理。探针失败或中断时该项保持 false，不把 Pod 删除当作卷内文件已清理。正式卷继续保留，需结合实际回执处理，不能盲目重跑。
