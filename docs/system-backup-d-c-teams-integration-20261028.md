# D 接收 C / Teams 持续开发输入

固定来源：`codex/backup-team-integration@288d74a92c37c6432ebb3dcdd6fd7c2afd837675`。原生只读 ls-remote 与 fetch 已核实；本次只更新跟踪引用，未 merge/checkout、未执行其 SQL/安装依赖/启动 controller。当前主链 `backup@8ef5fa7f` 加 A/D 本地增量、B `08d15abf` 导入和适配分别记录，不以 C 自报测试替代这些字节的验收。

C 分支有实质实现，不能说 Teams owner 没有交付：Team-data capture/restore/worker/catalog、实际 SQL/Redis/对象/文件链、历史 Team shared gate、Skill 生命周期、迁移兼容和前端接点均有代码。其 README 和 validation.json 同时明确：**公共 v2 production task writer、完整 details、runner/shared-gate adapter 与现场部署尚未完成**。该结论与 D 当前剩余依赖相符。

| 输入位置 | 已有贡献 | 当前公共链如何消费 |
| --- | --- | --- |
| `backend/internal/systembackup/team_data{,_worker,_redis,_restore,_recovery,_catalog,_preflight}.go`、`cmd/system-backup-artifact/team_data.go` | 已有 Team 领域数据及实际 provider/worker 调用 | 作为 C 领域 collector/worker/格式适配输入；接 D→B 的冻结 part 与 A/C 原认证/封存接点，不让 C 重写公共控制面，不把其独立任务ID当公共 task。 |
| `backend/internal/backupgate/*`、Skill worker | Team shared maintenance/work-unit boundary、取消后等待退出与清理 | 必须与 D public gate/完整 writer inventory 形成唯一权威；不能同时各自关两把 gate 再互相声明 drained。原 UID/停止证据与当前恢复权限仍必需。 |
| `docs/backup-team-integration/sql-map.json`、`reference/*`、版本化 migrations | 为保留 Team 历史，控制表改为 `system_backup_v2_*`；另有隔离副本导入工具 | 当前 D Writer/Details/claim/observer 使用 unversioned v12 canonical 表，不能直接替换源码或只改表名。首轮保留当前安装/schema；跨分支部署若选择 v2，须整体固定 SQL dialect、原授权映射、schema/registry/grants/observer 和迁移策略，重新验收。不得在现场自动跑该分支DDL或改catalog pin。 |
| `cmd/system-backup-v2-controller/main.go`、engine selection | 独立命名、显式 opt-in，默认 legacy，缺 production runner 时拒绝 capture | 保留其拒绝行为。D 当前 main→公共 TaskExecutionLoop→B runner 是当前路径，不额外启动版本化 controller 或旧独立 B controller。 |
| `docs/backup-team-integration/validation.json` | 分支报告真实 MySQL/schema/import/storage 以及单元/前端测试，分别注明 controlled K8s 和 fixture browser | 接收为该固定分支的交付声明；原始本地日志未由 D 独立签收，不记为当前 zhanghui08 的公共整链成功，不自动重跑全部用例。 |

当前 B 公共 runner 是 `08d15abf` 新交付，C 分支记录的 backup source 是 `8ef5fa7f`，不含本地 D TaskWriter/Details、完整 Input.Backup/外层计划绑定或最新 B公共执行包。集成范围必须列这些实际增量，不能只说两边已包含同一个 ABI commit。

仍须 C 原 owner 提供的准确公共接点：

1. `systembackupread.CurrentTaskFacts.Backup/Preflight`：沿用 D 原 query-only `CurrentFactsSQL` 与同 snapshot，返回精确 installation/task/row-version、ObservedAt/ValidUntil 和当前 provider/artifact/evidence/source 事实；不能复用 legacy saved usable 或另开详情SQL事务。
2. `systembackupread.ManifestReader.Read(ctx,CurrentFactsSQL,TaskCheckEvidenceControlSnapshot)`：原 public manifest bytes、immutable version/hash 与原读取权；legacy Team manifest/本地包重编码结果不能沿用旧 checksum/signature。
3. 供 B `publicadapter.BuildPartResult` 的真实 `SealedPart{Reference,ContentSHA256,EvidenceIDs}` 与格式适配。A先认证原 worker.Result，C证实 immutable seal，D/A登记原报告；不能用 worker self-report/文件名直接填。
4. 公共 artifact/finalizer/catalog concrete adapter 及 `recovery_catalog_records/catalog_scan_record` 正式领域合同；D据其落实三张 canonical catalog 表。不因 C 有 legacy Team catalog 或159份迁移就宣布原三表/四合同齐全。

当前本轮不整合 UI。原阶段/权限、A 原用途/签名/材料、C provider/故障域、未知外部结果只读收敛和独立 observer 门禁全部保留。现场安装ID已获 owner 首次分配 `installation_dfa02579009349938c8125490d9dfd41`，但原部署/独立授权绑定与 bootstrap 未完成；此登记不授资源权限。
