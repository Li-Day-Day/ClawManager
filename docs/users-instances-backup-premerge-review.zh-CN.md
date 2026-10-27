# 用户和实例备份恢复：合并前审查（2026-10-26）

后续更新：2026-10-27 已在本地处理与 `backup@52117dee` 的两处实际文本冲突及发现的兼容问题，详见[分支整合记录](users-instances-backup-branch-integration.zh-CN.md)。下文保留首次审查事实；公共控制面的业务整合项仍未完成。

## 结论与边界

当前工作区相对 `main` 的后端测试、静态检查、Linux 编译、前端构建及本次 WorkBuddy Lite 隔离复测通过。发现并修复了恢复预检覆盖不足和前端结果页状态更新问题；完整文件清单见[改动清单](users-instances-backup-change-list.md)。

**目标是 `backup`，当前不能标为“可直接合入后只剩集群测试”。** 本地 `origin/backup` 中已有不同的公共控制器、安全入口和数据库合同。下面的控制面整合项仍是合入阻塞项。本次没有切换分支、暂存、提交、推送或执行 Git 合并，也没有运行真实备份迁移。

- 工作区基线：`main` / `576e4bb5440d453fd25300586e57ce81cb616f31`。
- 比较目标：本地缓存 `origin/backup` / `edc43f1ee32ffbdac512f6184c86eb4174f38c90`。两者 merge-base 为上述 main 基线。
- 未联网 fetch；本报告不能代表远端在此缓存之后的变化。只读比较目标分支，不将目标代码写入当前工作区。
- 服务器 `172.16.0.158` 本次未连接；测试全部在本机隔离环境。此前服务器结构核对只作为版本化适配的依据。
- WorkBuddy Pro 身份恢复适配不纳入当前范围；Codex Pro、Claude Code Pro 实镜像测试及 Windows Agent 继续排除。其他已有 Pro 测试仅保留历史证据，不据此放开未知身份合同。

## 审查发现

### B1 / P1：公共控制面尚未整合（未解决，阻塞直接合入启用）

当前实现使用 `internal/systembackup/control`，内部协议 `users-instances-control.v1alpha1`，通过 `CLAWMANAGER_BACKUP_CONTROL_CONFIG` 打开独立 `cm_backup_control_*` 数据库。目标分支使用 `systembackupcontract`、`systembackupcontroller`、`systembackupproducer`、`systembackupsecurity` 等包和应用 migration 中的公共控制表。

证据包括本地 `control/task.go`、`control/config.go`、`control/schema.sql`，以及目标分支 `systembackupcontract/types.go`、`systembackupcontroller/gate.go`、`mutation_lease.go`、`protected_mutation.go`、`systembackupproducer/types.go` 和 migration 065～080。具体差异：

| 边界 | 当前用户/实例实现 | `backup` 分支 | 必须解决的问题 |
| --- | --- | --- | --- |
| 任务和状态 | 内部 Task、generation、row version、毫秒 deadline | 公共 Task/Operation、installation、claim、数据库时钟 | 显式映射身份、状态、幂等、取消、接管；不能直接反序列化或复用 SQL |
| 停写与恢复 | `mutation.Enter/Wait`、独立 maintenance/mutations/process 账本 | GateToken、MutationLeaseToken、事务内 protected mutation | 接入同一个权威 gate 和 fence；一套关门不代表另一套 writer 停止 |
| 资源和证据 | 独立 resources、worker grant、journal | 公共 staging/drill resources、producer authority、evidence | 在同一权威事务中核对 claim、资源 UID、最终 guard、撤权和失败恢复 |
| 数据库安装 | 手工安装到专用控制库的内部 schema | 目标分支应用迁移及公共表 | 不能把两套建表 SQL 直接混装，也不能把公共元数据当业务域恢复 |
| 管理入口 | `/admin/system-backup` 页面及 `/api/v1/admin/system-backup/*` API | `/admin/backups` 页面；公共 tasks/config/read/security 边界 | 确定统一入口和安全策略，避免用户以为两页面管理同一任务 |
| 成品与目录 | `users-instances-functional.v1alpha1`、内部六域 adapter/acceptance 接口 | 公共契约、producer/evidence/catalog 体系 | 接入实际 owner provider 并验证签名、授权、catalog、准入，不能只改版本名 |

本次没有在缺少目标分支依赖的 main 工作区凭空新增导入或替换公共协议；那会产生不可编译代码或绕过既有 gate。后续应以 `backup` 的公共控制面为权威接入数据模块，明确保留或停用内部实验入口，并在整合后的树上重跑检查。当前分支测试通过不能替代该项。

### B2 / P2：文本冲突与目标 schema 复核（未解决，合入准备项）

本地改动与目标分支共有 5 个重叠路径：`backend/cmd/server/main.go`、`backend/internal/services/instance_service.go`、`backend/internal/services/team_service.go`、`frontend/src/components/AdminLayout.tsx`、`frontend/src/router/index.tsx`。

用临时文件进行只读三方文本预演后，`main.go` 有 1 组 import 冲突：当前 `systembackup/control`、`systembackup/mutation` 与目标 `systembackupsecurity`。其他 4 个文件没有文本冲突。临时检查输出没有写回仓库，未执行分支合并。将来整合入口时按 B1 选择需要的依赖，不能靠删掉安全模块解决冲突。

目标分支新增 browser worker、用户名键、A 域表及公共控制表 migration；当前实验的最小 schema 不等于目标分支完整 schema。需在新隔离库安装目标 migration，复核 users/instances 的表清单、normalizer、跨域依赖和空白目标准入。当前严格拒绝未知合同的行为应保留，不能通过放宽检查掩盖不兼容。

### F1 / P1：只读恢复预检未验证源数据与目标恢复合同（已修复）

原控制器预检只确认空白目标及身份 allocator seed，目标缺表、字段变化、placement/配置策略缺失等情况可能在预检阶段显示通过，等到 restore 才失败。实际恢复事务仍有校验，未发现该缺口能绕过事务直接写入不兼容数据。

修复：新增 `domain.PreflightRestoreDrill`，在只读 REPEATABLE READ 事务中读取目标 Catalog，用完整源 Snapshot 和冻结 Policy 执行 Normalize，检查空白目标并再次核对隔离身份；不执行 DDL/DML 或写校验证据。控制器重新验证签名成品和冻结 bundle，认证解密数据库分片，检查唯一 restore invocation、行数与内存限额，使用同一 WorkBuddy/placement/config/dependency/team policy。临时解密和归一化行字节在使用后清理；不承诺整个 Go 进程所有秘密副本均能清零。

新增测试覆盖：合法目标、缺表、字段变化、缺 placement、错误 owner、WorkBuddy 缺 adapter、非空目标，以及缺失/重复 invocation 和容量上限。断言源/目标不变、无 writes/commit、仅只读事务。真实隔离 MySQL 演练额外验证合法身份源预检和 allocator 回退写前拒绝。

涉及 `domain/preflight.go`、`domain/preflight_test.go`、`profile/target.go`、`profile/preflight_test.go`、`profile/workbuddy.go`、`profile/workbuddy_test.go`、`profile/discovery.go`、`cmd/backup-lab/identity.go`。

### F2 / P2：结果页在 effect 内同步重置状态（已修复）

`BackupResults.tsx` 两处违反 React hooks lint；分页与记录选择的同步状态重置移到交互处理器，effect 负责异步加载及取消。重复选择同一条记录时克隆 selection，保证清空详情后重新触发加载，不会停留在空详情。变更文件 ESLint 与 TypeScript/Vite 构建通过；没有把构建当作浏览器交互验收。

### F3：历史说明容易误读（已修复文档入口）

组件 README 原首段仍以第 13 节为最新，并称缺少身份资料和 Docker 不可用。已更新为第 24、25 节和本报告，并注明下面是历史批次记录；没有删除过去失败或尚未完成验收的记录。

## 检查与测试结果

| 检查 | 结果和范围 |
| --- | --- |
| `go test ./...` | 整个当前 backend 通过；包含原项目与新增备份包，允许 Go 测试缓存 |
| `go vet ./...` | 整个当前 backend 通过 |
| `GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build ./...` | 整个当前 backend 交叉编译通过；不是 K8s 部署验证 |
| 新预检用例 | domain/profile 定向回归通过 |
| Linux domain 全套 | 30 个顶层测试通过、0 skip、0 fail；交叉编译测试二进制，在无网络、只读根文件系统的缓存 Linux 镜像执行，临时文件放新命名卷 |
| 前端变更文件 ESLint | 5 个 TS/TSX 文件通过；未声称全项目 ESLint 通过 |
| `npm run build` | TypeScript 与 Vite 构建通过；保留较大 bundle、npm 用户配置警告，不作为本次功能失败 |
| 前端已有版本和 OpenCode 入口测试 | `test:version`、`test:opencode-default-entry` 通过 |
| WorkBuddy Lite SQL/文件隔离复测 | 真实 MySQL、Linux 命名卷、合成用户与新目标，通过；结果详见下文 |
| 文本与清单 | 已跟踪改动 Git whitespace 检查通过；全部候选 Go 文件 gofmt、Python/PowerShell/JSON 语法检查通过；没有发现冲突标记、所扫描的私钥/token/带口令 URL 模式或二进制产物。扫描范围和结果见本地摘要，不把启发式扫描当作完整凭据或安全审计 |
| 目标分支 | 缓存 ref 的静态合同比较与只读文本冲突预演；未构建或运行整合后的代码，因此没有目标分支集成通过结论 |

此次 WorkBuddy 运行目录：`.codex-temp/backup-lab/workbuddy-identity-20261026-065823-76aa4976/`；backup ID `lab-2a536b7c49c740c3`。源/目标都使用新建内部 Docker 网络和独立命名卷，不对宿主暴露 MySQL 端口，不使用生产账号或真实业务行。通过后源库与目标库已停止，报告和实验卷保留。

- 4 用户、2 个 Linux Lite 实例；源 admin 哈希/资料替换、配额和 owner 关系验证通过。
- 4 条身份记录含历史占用、allocator 高水位保留；失败回滚与回退拒绝通过。
- 90 个文件/链接、182 个元数据条目一致；2 个身份 marker 和 UID 隔离通过。
- 4 个原生 SQLite 临时副本检查、600 条合成 WAL 消息恢复通过；Wine 映射和 DOS 属性通过。
- 停止源数据库后恢复到新目标；撤销/锁定写账号后由独立 SELECT-only verifier 核验。
- Agent 保持停止。结果中的 `kubernetes_verified`、`runtime_agent_lifecycle_verified` 仍为 false。

临时审查输出位于 `.codex-temp/premerge-review/`，包括 `branch-conflict-check.json`、`domain-linux.log` 和文件扫描摘要；不纳入提交清单。构建产物、测试密文和临时凭据也不纳入。

## 合入与集群验证前的剩余项

1. 核对最新 `backup` ref，在该分支上下文完成 B1 的公共合同与单一 gate/ledger 接线，并解决 B2；当前不执行合并。
2. 在整合后的代码上运行 backend 全量测试/vet、Linux 构建、前端检查和目标 migration 隔离演练；补充公共控制器到 users/instances collector 的取消、失去 fence、接管、失败恢复集成测试。
3. 准备独立 Linux/K8s 测试集群、Runtime Agent/平台固定 digest、存储类别与 SnapshotClass、命名空间/隔离网络/临时授权配置，验证真实暂停、Job、快照、恢复资源和源状态恢复。
4. 用版本化真实配置字段、Secret/密钥 provider 合同和合成业务样本覆盖登录、模型渠道凭据、Skill/任务/历史业务语义。当前传输完整性测试不等于所有厂商业务语义验证。

以上均不授权在参考服务器执行真实迁移。生产恢复 execute 仍不在当前已验收范围。

## 提交前远端状态补记（2026-10-27）

用户现已授权提交并推送 GitHub，仍不直接合并到 `backup`。提交前执行只读 fetch，
远端 `backup` 已从上述审查版本更新至 `52117deea14df5a3a8dcceb8abed5b9c7cada17e`，
新增公共备份验证/证据与 Skill Hub 等改动。本报告的逐项目标分支审查仍对应
`edc43f1ee32ffbdac512f6184c86eb4174f38c90`，不能解释为新版本已经整合或验证通过。
本次提交保持当前 main 基线的数据模块实现，使用独立功能分支交付；后续以最新
`backup` 重新进行兼容接线和冲突检查。前文“不提交/未 fetch”描述的是 10 月 26 日
审查阶段的操作边界，不是本次已获授权的提交操作。
