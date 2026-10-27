# 用户与 Linux Agent 实例备份恢复开发清单

更新时间：2026-10-23。依据 `system-backup-plan.v12` 和本次用户确认的需求。

## 1. 已确认的范围

- 全部用户和全部 Linux Agent 实例；目标是已经初始化、只有 admin 的空白 ClawManager。
- 目标 admin 使用源 admin 的密码和资料；用户配额、实例归属及相关外键必须保持一致。目标若已有其他业务数据则拒绝导入，不做隐式合并。
- 包含 Lite/Pro；OpenClaw、Hermes、OpenCode、DeepSeek Harness、Linux WorkBuddy、Linux Codex、Claude Code 按实际类型/模式登记能力。未知类型、Windows、未适配组合阻止完整备份，不能静默跳过。
- 保留账号登录能力、配额、工作空间文件、实例内 Skill、会话历史和任务配置。数据库密码哈希不能通过普通用户 JSON DTO 导出，该 DTO 明确隐藏此字段。
- 模型和渠道凭据采用加密备份；必须处理外部 Secret/ref 和应用自身加密密钥的依赖，不能只复制无法在目标解密的 ciphertext。
- 恢复后的实例、任务、调度器和渠道均不自动执行或连接生产，由用户显式重新启动。源实例备份结束后需按备份前状态恢复运行，迁移切换时另行保持停止。
- Kubernetes，覆盖 Longhorn/其他 PVC、HostPath、NFS。共享卷里的 Lite 实例必须按实例子目录采集，不能把同卷其他实例混入。
- 暂停 Agent、备份 Job、快照、恢复资源也纳入本工作；通过独立接口与其他同事的实现对接，避免重复的任务状态机和存储格式。

## 2. 与原计划的关系

当前交付按 P0 顺序推进：规范与基础能力、备份、隔离恢复演练、生产目标只读 preflight/diff。本文不宣称 P0 已支持生产恢复执行。

完整迁移到空白平台是已确认的产品目标，但真实凭据激活及空白目标写入属于后续受控迁移阶段。P0 演练仍使用 stub/disabled Secret、清除平台访问令牌并禁用旧绑定；备份必须完整保存将来安全迁移需要的数据。真实目标写入前需独立控制 journal、目标空白校验、显式确认及独立权限。不能把演练接口改成生产 execute。

原计划将 legacy NFS 留到 P1；本次要求扩展存储适配范围。NFS 规划进入本地领域模块，但在 writer inventory、停写 ACK、时间预算和不可变暂存得到实证前不得标为 strong 或 P0 验收通过。

用户和实例两个业务域不是完整系统备份。AI Gateway 的模型/凭据、Skill Hub 元数据/绑定和对象、Teams 任务等仍需相应 owner 的采集结果。缺少必要跨域依赖时必须阻止宣称“完整迁移”。

本清单不是已冻结的全局机器合同。新领域模块和适配接口均属内部实现；全局 OpenAPI、artifact schema、状态/错误枚举仍需 P0-0a 冻结和 parity 校验。

## 3. 分阶段任务与验收

### T01 数据与能力清单

- [x] 用户和实例 25 张表的初始 registry：领域归属、恢复动作、敏感列与跨域依赖。详细字段级规则和真实 verifier 在 T02/T09/T10 完成。
- [x] 补充 v12 之后新增的运行升级表，不能仅复制旧文档表名。
- [x] 7 类 Linux Agent 的规划矩阵；OpenClaw/Hermes/OpenCode/DeepSeek Harness/WorkBuddy 支持 Lite/Pro 规划，Codex/Claude Code 当前仅 Pro；未知和 Windows 明确拒绝。各类型真实恢复能力仍待验证。
- [x] PVC/CSI、HostPath、NFS 和共享卷实例路径的采集规划。
- [x] 规划 DTO 不含密码/令牌；清单不能充当真实快照或 strong 一致性证明。
- [x] 使用当前模型、embedded migration 和 runtime constants 的回归检查，防止新增类型/表静默漏备。
- [ ] 真实数据库完整枚举、K8s 存储/挂载发现和字段级 registry，替代人工提供的源清单。

验收：只读规划覆盖已确认组合；用户/实例计数、身份或存储信息不完整时拒绝整份计划。跨域依赖显式列出供共享 coordinator 检查，本规划器尚不验证这些依赖是否已交付。规划不访问或修改集群。

### T02 公共接口与规范衔接

- [ ] 与公共 Controller 对接 Collector、Normalizer、只读 Verifier、Runner/JobObserver、artifact store、Secret resolver。
- [ ] 冻结 DTO/schema/枚举、命令能力和错误映射，加入 parity 测试。
- [ ] 必选依赖未交付时返回 not-ready，不用空实现伪造成功。

### T03 独立执行和持久化基础

- [ ] 独立 Controller Deployment/ServiceAccount、DB claim、leader Lease 和任务接管。
- [ ] 任务/operation/资源 intent/event/check 的 migration、审计脱敏、request ID、开关。
- [ ] 最小权限、NetworkPolicy、固定 digest Job 镜像；不继承应用 cluster-admin。
- [ ] 复用统一状态机和 external-action 账本，不为本领域新增第二套全局任务状态。

### T04 停写与安全恢复运行

- [ ] 用户/实例 API、SyncService、RuntimeScheduler、Skill worker 以及实际 runtime writer 接入 gate。
- [ ] Lite 停止实例 gateway；Pro 停止拥有的 workload；记录原状态、UID、generation、ACK。
- [ ] gate/fencing、绝对停写时限、失联 watchdog、失败/取消/换主后的恢复。
- [ ] 不以 Pod NotReady、lease 超时或副本数为零代替 writer 已停止的证据。

### T05 采集 Job、快照与暂存

- [ ] 独立普通采集和 Secret 采集身份；所有 Job ready 后才拿 gate。
- [ ] CSI 能力探测、VolumeSnapshot、只读恢复 PVC 和固定 checkpoint。
- [ ] HostPath 绑定存储节点，在 gate 内完成加密暂存；NFS 验证全部 writer 后使用相同保守策略。
- [ ] Lite 共享 PVC 的实例目录映射、单独采集、路径/链接校验和权限元数据。
- [ ] 资源创建前记 intent，登记 UID/owner marker，seal 后不再读取 live source。

### T06 用户和实例数据库备份

- [ ] 统一一致性 MySQL snapshot：保留完整数据类型、密码哈希、NULL、外键、schema/version/checksum。
- [ ] `users`、`user_quotas`、`enterprise_auth_settings` 和全部实例域数据。
- [ ] 不把 `system_backup_*`、maintenance 状态等源活动控制行带入业务恢复。
- [ ] 业务历史与运行控制状态分开登记；不直接序列化普通 API 模型作为完整备份。

### T07 文件、会话、Skill、任务配置和凭据

- [ ] 采集完整持久化根及登记的外部持久化挂载，不只备份 `.openclaw`。
- [ ] 各 Runtime 配置、数据库/WAL、会话、Skill 和定时任务配置完整性检查。
- [ ] Secret allowlist、外部 ref、LDAP 应用加密依赖、模型/渠道凭据的加密与重封装方案。
- [ ] 流式压缩/加密；禁止持久化明文暂存，禁止日志输出密码、hash、token 或凭据 URI。

### T08 发布与跨 owner 集成

- [ ] 接统一 artifact index、manifest、commit、acceptance 和外部 catalog。
- [ ] 与 AI Gateway、Skill Hub、Teams 以 registry dependencies 交叉校验。
- [ ] 明确区分执行成功、技术可读、历史资格及当前恢复 readiness。

### T09 隔离恢复与归一化

- [ ] 创建专属 namespace、临时数据库、PVC/目录及隔离网络；planned/observed 两次身份检查。
- [ ] 按顺序恢复用户/配额、实例、配置和文件，并校验全量 ID/外键映射。
- [ ] 保留密码哈希；不复用旧 JWT、Agent session、Share Link 或运行绑定。
- [ ] 保留会话和任务定义，禁用任务调度、渠道连接、旧 outbox/命令执行。
- [ ] P0 的模型/渠道/LDAP Secret 仅物化 stub/disabled 配置，真实值仍以加密内容保留。

### T10 只读验证与空白目标 preflight

- [ ] 结束 restore Job、撤销写凭据，用独立 SELECT-only verifier。
- [ ] 用户登录数据、配额、用户-实例关系、配置、文件、会话与 Skill 校验。
- [ ] 验证实例均 stopped、无旧运行绑定、无自动执行和生产外联能力。
- [ ] 空白目标检查包含用户、实例、共享依赖和 bootstrap admin；保留源 admin 替换规则的明确计划，不在 P0 preflight 执行替换。
- [ ] 差异报告只包含统计、校验结果与风险摘要。

### T11 清理、API 和运维

- [ ] Job/快照/PVC/namespace 的可接管安全清理；不猜测删除未知 owner 资源。
- [ ] 接统一 Admin API/Console、进度、取消、审计、证据和指标。
- [ ] 接统一 artifact health/prune/promotion，避免重复实现 C/D 的组件。

### T12 验收

- [ ] Go 单测、K8s fake：多类型路径、Windows/未知组合拒绝、存储能力失败、ID/FK、凭据、崩溃/取消/恢复。
- [ ] 真实 Kubernetes：cluster/single-node，Longhorn/PVC、HostPath、NFS 的实际恢复演练。
- [ ] 验证所有用户和实例，无遗漏；源网络阻断后仍可发现和解密备份。
- [ ] 真实集群数据、密钥、快照权限和镜像未提供时，只报告代码级验证，不能宣称端到端迁移完成。
- [ ] 原计划 P0 发布还需要其他 owner、六业务域及 k8s/k3s 四矩阵证据；本领域测试不能替代全系统验收。

## 4. 首批实现

先实现 T01 的内部 registry、Linux Runtime 能力矩阵、只读存储采集规划和 service 适配入口，使用现有 Go/K8s 依赖验证。它不注册生产写入路由，不执行停机或恢复，后续 T02～T12 在统一合同和真实能力上逐项接入。

已新增：

- `backend/internal/systembackup/scope`：内部领域清单、表 registry、Runtime/存储规划及验证。
- `backend/internal/services/user_instance_backup_scope.go`：接现有 User/Instance 模型及 Linux/Windows variant 识别，避免通过 API JSON 丢失字段或泄露凭据值。
- `backend/cmd/backup-inventory`：离线只读校验工具，只接收无凭据的规划输入，不连接数据库/集群。
- `examples/backup-inventory/linux-agents.json`：虚构 Linux Lite/Pro 规划示例，不是实际环境的能力证明。

从 `backend` 目录运行示例：

```powershell
$env:GOTOOLCHAIN = 'local'
$env:GOPROXY = 'off'
$env:GOSUMDB = 'off'
go run ./cmd/backup-inventory -input ../examples/backup-inventory/linux-agents.json
```

`snapshot_probe_passed` 和 `additional_mounts_known` 必须来自之后的真实 discovery/probe，不能在实际迁移中直接照抄示例。清单指纹只是本模块排序后 JSON 的 SHA-256，不是共享合同的 JCS manifest hash、签名或 capture certificate。

首批规划结束时尚未交付执行能力；后续领域组件开发状态见第 7 节。真实 writer gate/Runner、凭据重封装、Admin API/Console 和全系统灾备资格仍未交付。隔离数据库中的 admin 替换已实现并用测试替身验证，未执行真实环境写入。

## 5. 本批验证记录

- 已使用本机 Go 1.26.1，并设置 `GOTOOLCHAIN=local`、`GOPROXY=off`、`GOSUMDB=off`；没有下载或安装开发依赖。
- `internal/systembackup/scope`、`cmd/backup-inventory` 的新增测试，以及 `internal/services` 中的清单适配、运行时配置/类型/路径相关回归测试均通过。
- 离线示例实跑：2 个用户、2 个实例（Hermes Lite、Linux Codex Pro），输出 25 张表的 registry、跨域依赖、停止状态策略和稳定指纹。
- 负向验证覆盖 Windows/未知类型、未知平台变体、用户或实例数量不完整、缺失归属、共享卷根目录/路径逃逸、跨实例源目录重叠、来源含凭据的输入及超大/多 JSON 文档。
- 此结果只证明首批只读规划代码的行为；未执行源停机、真实 CSI probe/快照、Job、数据导出/导入或恢复演练，也未证明公共 v12 合同已经冻结。

## 6. 源服务器只读检查后的任务补充

2026-10-23 已按用户授权检查真实服务器，详见 [源服务器检查记录](users-instances-backup-source-inspection.zh-CN.md)。实际环境为 3 个用户、22 个 Linux Lite 实例、共享 PVC 包装的单节点 HostPath；与本地 schema 和能力矩阵存在差异。

- [x] 人工只读核对真实数据库结构/数量及 K8s PVC/PV/workspace 映射；这不等于真实 discovery 代码已经交付。
- [ ] 在 T01 增加源 schema/migration 探测和版本适配；源库缺少本地 enterprise auth/upgrade 表及部分字段，不允许为清单读取自动迁移源库。
- [ ] 登记源新增的生命周期、WorkBuddy 身份/恢复、rollout 表及字段，明确 owner 和归一化策略。
- [ ] 补充 WorkBuddy Linux Lite 适配：服务器已有 6 个，而首批本地规划器只支持 Pro。完成前继续明确拒绝，不得将其排除后称全量成功。
- [ ] K8s discovery 支持“PVC → PV → HostPath”解析和共享卷实例子目录；不能只凭 PVC/class 名称认定可使用 CSI 快照。
- [ ] 后续以该环境验证 single-node/HostPath/Lite；Longhorn、NFS、Pro 和其他 Agent 仍需独立 fixture/真实环境。

## 7. 领域执行组件实现（隔离测试阶段）

本轮按原始计划开始 T02/T04/T05/T06/T07/T09/T10 的领域组件开发；**下列完成项是代码/隔离测试完成，不表示相应整项 Txx 或 P0 交付完成**。详细入口、接入顺序和限制见 [组件说明](../backend/internal/systembackup/README.md)。服务器本轮没有连接或修改。

- [x] T01：增加 WorkBuddy Linux Lite 规划；增加源分支的生命周期/恢复/授权/身份表分类；领域 registry 共 36 表。平台 chat_sessions/chat_messages 纳入 AI Gateway 依赖。
- [x] T06：只读 metadata catalog、单个一致性事务的领域表采集、全字段/NULL/原始字节、内存与行数限额；未使用普通 User JSON DTO，不运行源迁移。
- [x] T09：字段级 restore allowlist、目标 schema 校验、legacy local auth 适配、用户与实例归属检查、停止状态/禁用调度/清除令牌；未知字段失败。
- [x] T09：隔离数据库身份双检查、空白目标检查、按 FK 顺序参数化写入、事务内源 admin 替换目标 bootstrap admin，失败全部回滚；无生产 execute 入口。
- [x] T07：AES-GCM 加密 staging 分片，任务/context 绑定、强制终止认证；完整工作空间归档/隔离目录恢复，含各 Agent 文件、Skill、会话、任务；严格路径与容量检查。
- [x] T07/T09：显式 JSON 字段规则执行器，保留定义、随机 stub 凭据、禁用执行；未知规则拒绝。各真实 runtime 的完整配置/文件规则尚未冻结，测试使用 fixture registry。
- [x] T04：持久化 journal 接口和保守停写编排；prepare barrier、intent 先于 pause、ACK 校验、seal 后恢复原状态、取消/失败补偿。真实 writer 和 watchdog adapter 未接线。
- [x] T05：PVC/PV 实际类型解析、共享卷 subPath 计算、Job/VolumeSnapshot/恢复 PVC/隔离 NetworkPolicy 构建和身份检查；仅构建对象，不提交真实 API。
- [x] T10：SELECT-only grant 检查、逐字段/行数/活动表验证；真实独立 verifier Job、权限撤销与完整六域校验仍待公共 Runner。
- [x] T12：领域闭环隔离测试，覆盖 22 实例、七类文件、admin 替换、失败回滚、密文篡改、目录逃逸、停写失败/取消和非空目标拒绝；已有 scope/service 相关回归通过。
- [ ] 接入共享 Controller 的真实 gate/fencing/journal、API 与后台 writer、Lite/Pro 暂停恢复、资源 Runner/JobObserver/status relay 和可运行 worker 镜像。
- [ ] 接入共享 artifact/压缩/KEK/envelope/catalog、完整 Secret/runtime 文件规则与跨域依赖；新增 WorkBuddy 身份 schema 的显式适配。
- [ ] Linux/MySQL 8/K8s 隔离集成测试，含真实 CSI/HostPath/NFS、进程崩溃接管、权限撤销、UID/GID 和跨域完整恢复。当前本机 Docker daemon 未启动，未伪造该项验收。

## 8. P0 继续开发：工作空间 worker 与资源执行

- [x] T05/T07：增加流式 gzip、只写密文的文件 staging、fsync + create-if-absent 封存、receipt 和整份密文预校验；失败不会覆盖已有文件或删除其他 attempt 的 partial。
- [x] T05/T09：增加 `kube.Runner` 实际创建、GET 接管、Job 条件观察和带 UID/resourceVersion 前置条件的删除代码；强制接持久化 journal/fence，缺失即拒绝执行。SQL adapter 后续进展见第 9 节。
- [x] T07/T09：增加 Linux `backup-worker` 命令、工作空间采集与隔离恢复执行器、离线镜像打包 Dockerfile，以及 Job 的 invocation/任务 mTLS 身份挂载。
- [x] T02/T03：增加 mTLS ControlClient/ControlHandler 内部接口实现，绑定 SPIFFE identity、完整 invocation hash、policy 和时限；没有默认放行 Authorizer，不向现有应用注册可写路由。
- [x] T09：恢复前完整校验密文/压缩流，恢复后执行显式文件 JSON 规则，替换凭据并禁用运行开关；结果保持 quarantine，不自动启动 Agent。
- [x] T12：本地临时目录、localhost mTLS、K8s fake 验证执行器正常/失败路径；未连接参考服务器，未创建真实集群资源或迁移业务数据。
- [x] T05/T12：创建前持久化 dispatch intent；创建超时且 GET 404 时保持待核对，不重复创建或误报清理完成；缺少创建来源的既有资源不接管、不删除。
- [ ] 将 ResourceJournal、Authorizer 接公共数据库/Controller，补全真实 writer、Job UID/挂载身份验证、任务结果证据/status relay、取消/身份撤销与 watchdog。
- [x] 将数据库采集/恢复/独立校验接 worker，见第 9 节。
- [ ] 补充完整 runtime 文件/Secret 规则、WorkBuddy 身份版本适配及最终 artifact/catalog。
- [ ] 构建发布实际镜像，完成 Linux 隔离 MySQL/K8s、CSI/HostPath/NFS 和灾后离线读取验收；本轮不执行真实迁移。

本批验证结果：`go test ./internal/systembackup/... ./cmd/backup-inventory ./cmd/backup-worker -count=1`、用户/实例清单服务层相关回归、上述包的 `go vet` 均通过。`GOOS=linux GOARCH=amd64 CGO_ENABLED=0` 的 worker 交叉编译通过，临时产物已移除；这不代表已在 Linux 执行或已构建镜像。全部使用本机已有工具链和依赖，禁止网络依赖下载。

## 9. P0 继续开发：数据库 worker 与 SQL 账本适配

本节更新第 8 节的数据库 worker 和 ResourceJournal 状态，其余待集成事项继续保留。

- [x] T06：`capture-database` 在同一连接核对数据库/UUID 和 SELECT-only grant 后采集，一致性事务数据直接压缩加密到 staging，关闭源连接后可恢复。
- [x] T09：`restore-database` 完整认证输入后执行隔离恢复；源 admin 替换、配额/实例归属和停止策略复用领域适配。COMMIT 前封存精确归一化结果的加密 evidence，并再次核对隔离和任务授权；失败回滚。
- [x] T10：`verify-database` 使用独立只读连接和原 restore evidence 做精确数据校验；不重新生成随机 stub，不自动启动实例，发现篡改或写权限即失败。
- [x] T03/T05：数据库 TLS 连接配置、通过 mTLS acquire grant 下发的独立短期口令、数据库 Job 的只读输入/独立加密 evidence 卷，以及 worker 精确 endpoint 出站网络策略。没有 DSN/密码命令行参数或业务 Secret 挂载。
- [x] T03/T05：`SQLJournal` 和显式 SQL 列映射适配器；事务内双次 fencing、SELECT FOR UPDATE、版本 CAS、不可变请求/UID 校验、提交响应丢失后重新读取。仅对接公共权威表，不自动建表或复制一套全局状态。
- [x] T12：SQL 驱动替身下的离线数据库 worker 往返、凭据/TLS 参数、权限拒绝、坏密文不写目标、evidence 冲突/失权回滚，以及账本 CAS/重建适配器/提交响应丢失测试。
- [ ] 公共资源表的真实列映射、唯一约束、lease/fencing 查询、HMAC ownership、Job observation/status relay 和 Authorizer/凭据发放撤销接线。当前仓库未发现这些公共权威表/Controller，不能把适配器测试称为完整控制面交付。
- [ ] 真实 Lite/Pro writer gate、runtime/Secret 文件规则、WorkBuddy 身份版本适配、最终 artifact/catalog、跨域恢复和 API/Console 集成。
- [ ] Linux/MySQL/K8s 隔离环境中的真实执行、并发/崩溃、权限撤销和存储矩阵验收。未连接参考服务器或执行真实迁移。

本批验证：systembackup 全部包、两个命令、相关 service 清单回归通过；最后增加的恢复内存预算负向案例也通过，`go vet` 无报错。Linux amd64 静态 worker 构建通过并核对 ELF 文件头，临时二进制已移除。没有安装依赖或访问真实数据库/K8s。现有业务 `InstanceService.Stop` 使用后台 context，且成功返回并不统一代表各运行时已确认停写，因此本批没有直接把它冒充有 deadline/ACK 的备份 writer。

## 10. P0 继续开发：Linux Lite/Pro 暂停恢复适配

本节更新前文“真实 writer 未实现”的代码状态；公共控制面及运行时证明仍待接入，不能据此将 T04 或 P0 整体验收勾选完成。

- [x] T04：Linux Lite 通过现有 Runtime Agent HTTP 客户端实现 Observe/Pause/CheckPaused/Resume；保留 binding/slot，使用预留的新 generation 恢复源实例，避免旧停止请求晚到影响恢复后的实例。
- [x] T04：Linux Pro Deployment 的 UID/RV 条件缩容、原 Pod/container 清单、停止证明接口、原副本恢复及晚到 PATCH 隔离。
- [x] T04：Linux Pro 独立 Pod 的 UID/RV 条件删除、不可变加密 restart 引用、单次创建和新 UID 回写接口；已停止实例保持停止。拒绝 controller/mirror Pod 和不一致的源配置。
- [x] T04：每次采集前及全部封存后重新核对所有 writer；补偿单独检查恢复执行权；`RecoverSource` 支持从持久化原始意图接管，包含没有 ACK 的不确定停止操作。
- [x] T12：本地模拟 API 的失败测试，覆盖晚到 DELETE/PATCH、停止/创建响应丢失、单次创建、原停止状态、配置/身份漂移、节点停止证明缺失、采集期间失去停写及恢复权限失效。
- [ ] 对接公共 pause journal、捕获/恢复 lease、writer gate、watchdog，以及源配置加密引用、generation 预留、dispatch claim 与 binding/slot 事务更新。没有采用独立影子全局表。
- [ ] 实现并接入真实节点/CRI 停止证明和 Runtime Agent 能力证明；补齐 API/文件编辑/定时任务等全部 writer 的停写，禁止自动拉起的控制器绕过 gate。
- [ ] 其余领域接入与验收继续按第 9 节推进：真实配置/Secret 规则、WorkBuddy 身份版本适配、artifact/catalog、公共 API/Console、Linux/MySQL/K8s 隔离存储矩阵。

这里的“恢复原运行状态”专指备份后恢复源平台；备份导入的目标实例仍然保持停止。新代码没有连接参考服务器、停止真实 Agent、写真实数据库或创建真实集群资源。

本批验证：`go test ./internal/systembackup/... ./cmd/backup-inventory ./cmd/backup-worker -count=1`、service 层的 `BackupGateway` 和用户/实例清单相关回归均通过；上述包及 `internal/services` 的 `go vet` 通过。补充的实际 Pro 适配器与 `flow.Capture`/`RecoverSource` 组合测试也通过，验证采集取消后的源恢复和无 ACK 的中断接管。这里的“实际适配器”指新增实现代码；远端仍为本地 HTTP 模拟和 Kubernetes fake，未执行真实集成验收。

## 11. 本项目公共控制组件、管理入口及领域备份包

用户确认暂时没有其他同事的公共 Controller 实现，直接在本项目补齐。本节取代前文“等待其他同事公共实现”的工作安排；原始 P0 范围、服务器只读和隔离测试约束不变。

本批实现项：

- [x] 独立控制库 schema、任务幂等 admission、请求参数校验、阶段推进、行版本取消、数据库时间租约与接管 generation。
- [x] 任务与资源共用 SQL 事务执行权；持久化暂停清单、原状态、恢复 dispatch；配置 revision 固定到任务，健康信息过期后不接新任务。
- [x] HTTP 与一批实际后台 writer 接入持久化门禁；覆盖启动迁移、RuntimeScheduler、Sync、materialize、实例/Team 删除、配置级联、安全扫描、PVC monitor、WorkBuddy prewarm、Team 消费/扫描和 northbound operation。
- [x] JobCollector 接真实 client-go Runner、mTLS Ready/结果回传和 Job Complete 检查；只读日志或 succeeded 计数不能代替结果证明。
- [x] SQL WorkerAuthorizer 对 SPIFFE、invocation hash、Job UID、阶段、执行权、固定 grant 时限和暂停 ACK 联合校验；结果重复提交幂等，不同结果冲突。
- [x] collector 停止/凭据撤销/节点证明先于源恢复；缺失证明不打开门禁、不进入成功终态；取消后使用独立有界补偿 context。
- [x] CRI 节点侧只读停止证明解析与命令执行器，严格区分 EXITED 与容器不存在；远程部署接线未完成。
- [x] JSON/YAML/TOML/dotenv 配置归一化机制；保留精确整数，拒绝未覆盖字段、歧义语法和隐式插值。真实版本规则清单仍待完成。
- [x] 功能测试领域备份包：DEK 封装、Ed25519 签名、只复制密文、不可覆盖对象、提交标记、源目录关闭后的独立读取。
- [x] 发布意图持久化、取消窗口关闭与 `commit_started_at_ms` 同事务记录、精确已提交内容核对；发布结果不确定时只读 resolver，不以缺失对象推断可重发。
- [x] Controller Service 的任务、健康发布、finalization resolver 三个独立循环；失去租约立即停止推进。
- [x] 管理员 API 和 `/admin/system-backup` 页面：配置原因、任务阶段、轮询、幂等提交、版本取消；默认依赖不满足时不可发起执行。

**尚需开发，不应写成“全部完成，只差验证”：**

- [ ] 具体 profile 的完整 Executor/不可变计划组装，以及可部署 controller 主程序；连接源 discovery、快照/PVC/Job、已实现的数据采集/恢复/校验和发布组件。
- [ ] 真实 Job/Pod/挂载/隔离证据适配、节点证明远程部署、任务 mTLS 身份签发、数据库临时账号发放/撤销、Lite 能力发现、加密重启资料和源 binding/slot 更新。
- [ ] 全部 runtime/version 配置与业务 Secret 规则、WorkBuddy 源分支身份字段适配、跨域模型/会话/Skill 依赖，以及完整公共 artifact/catalog 合同。
- [ ] 外部 writer/所有应用副本覆盖证明与遗留 mutation permit resolver；控制进程不能仅因许可过期就假定写入已停止。
- [ ] Linux/MySQL 8/K8s 隔离集成测试和 CSI/HostPath/NFS 矩阵；不在参考服务器执行真实迁移。

已完成的验证包括新组件单元/故障测试、systembackup 与涉及的 services/k8s/northbound/handlers/middleware 回归、前端 TypeScript/Vite 构建。SQL 并发语义和集群行为仍使用替身，不能当作真实 MySQL/K8s 证明。前端依赖使用 `npm ci --offline --ignore-scripts --no-audit --no-fund` 从本机缓存安装，没有联网下载。后端继续使用本机 Go 工具链与离线依赖。

当前功能版本是 `users-instances-control.v1alpha1` / `users-instances-functional.v1alpha1`，不是完整六域 `system-backup.v1` 的合规声明。详细接口与默认行为见[组件说明](../backend/internal/systembackup/README.md)。

收尾复核：上述后端完整范围回归与 `go vet` 均通过；最后的 collector 停止顺序、Worker SQL 授权和发布响应丢失测试通过。`GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build ./internal/systembackup/... ./cmd/backup-worker ./cmd/server` 通过，仅为交叉编译，没有在 Linux 或真实集群运行。

## 12. 第 1、2 项继续开发（2026-10-25）

本节记录执行编排和运行时基础组件的新增代码。**两项尚未整体完成，不是只剩环境验证。** 本批没有连接参考服务器、修改真实数据库/K8s，或执行真实迁移。

本批已实现：

- [x] `control.Pipeline` 实现 Executor 阶段推进：冻结 discovery 计划、准备资源/collectors、关闭并排空门禁、采集、源补偿、校验和发布；隔离恢复包含 preflight、资源准备、恢复、停止确认和独立 verifier。
- [x] AES-256-GCM 计划/进度/重启资料/身份凭据存储；关联任务、profile revision、记录类型和密钥版本。记录不可覆盖，接管不改变原计划；发现不确定采集/恢复时转补偿，不盲目重放。
- [x] 保留旧 profile driver 供接管恢复，新任务显式选择当前 revision；存在多版本但未选择时拒绝 admission。
- [x] 短期 Worker mTLS 客户端证书签发、加密保存、不可变 Kubernetes Secret 创建/核对/删除，包含 dispatch 和 UID/RV 账本。清理不生成新身份，不接管无创建意图的既有 Secret。
- [x] 临时 MySQL 账号实际生命周期代码：固定数据库/服务器 UUID、TLS、任务归属、远端互斥锁、精确权限、锁定账号、终止既有会话、删除及零会话确认。恢复写权限仅允许 `cm_drill_` 数据库；库名下划线按 `partial_revokes` 设置处理，防止通配授权。
- [x] Worker 密钥/账号提供器移到授权事务提交之后，随后重新核对执行权、撤销状态和固定到期时间，避免 Vault 嵌套事务死锁；重新授权失败会擦除密钥并返回空 lease。
- [x] `kube.WorkerObserver` / `control.LiveWorkers`：实际 client-go 读取 Job/Pod，递归核对冻结 spec、PVC/PV、不可变 Secret/ConfigMap、节点 UID、Pod UID 和容器 ID；在 Ready/取密钥前持久化进程身份。替换 Pod、容器重启、权限注入或挂载漂移不会继承原授权。
- [x] `backup-node-proof` Linux 命令及 `ProofClient`：TLS 1.3 双向认证、精确节点/控制器 SPIFFE、请求摘要/随机 nonce/有效期，远端只暴露固定 CRI inspect 停止证明。提供离线镜像 Dockerfile 和逐节点 Pod 模板，未构建或部署镜像。
- [x] collector 已持久化 terminated 后重复清理不再依赖已被 GC 的 CRI 记录。首次停止仍需要证据，Job/Pod 404 不是停止证明。

第 1、2 项仍需开发的部分：

- [ ] 具体环境 `ProfileDriver`：从真实数据库/K8s discovery 组装完整、冻结的源 writer 清单、快照/PVC/Job、挂载身份、密文包发布和目标隔离计划；目前 Pipeline 提供阶段执行逻辑，但尚无该 driver。
- [ ] `backup-controller` 主程序、配置装载和完整部署/RBAC，将 Service、Pipeline、Worker relay、身份/账号提供器及上述 driver 接成可部署服务。
- [ ] Lite Runtime Agent 能力发现、重启参数映射、generation 预留，以及 Lite/Pro 恢复后的源 binding/slot 事务更新；Vault 提供加密存储，但不等于这些业务适配已经实现。
- [ ] 将 profile 的源停写/目标隔离证明接入 `LiveWorkers.CheckEvidence`，完成节点证书/端点配置与挂载清单发现。没有观察到 Worker 进程身份的失败任务仍保留待核对，需要补 resolver，不能直接宣布清理成功。

本批验证：systembackup 全部包、三个备份命令、handlers/middleware/services/k8s/northbound 回归通过；新加的 Vault 篡改与接管、不可变计划重试、证书作用域、SQL 撤权顺序、取密钥期间撤销、Job/Pod/卷漂移、进程替换、localhost mTLS 节点证明与 MySQL 通配授权测试通过。备份相关 `go vet` 及 Linux amd64 静态交叉编译通过。测试依赖本机缓存，远端为 SQL 驱动替身、Kubernetes fake 或 localhost TLS 服务；真实 Linux/MySQL/K8s 集成验收仍未执行。

配置和部署边界见[组件说明新增章节](../backend/internal/systembackup/README.md#执行编排与运行时基础组件2026-10-25)。

## 13. 第 1、2 项剩余代码接线（2026-10-25）

本节更新第 12 节列出的四个剩余开发点。本仓库的具体驱动、启动程序和运行时接线已补齐；这不表示整个 P0 已验收，也不把外部 Runtime Agent 镜像和存储证明服务当作已经部署。

- [x] `profile.Driver`：完整 SQL 实例清单与显式挂载映射核对，Linux/Lite/Pro 范围检查，冻结 Pod/PVC/PV、节点、快照 class 和隔离策略身份。拒绝未覆盖的持久卷、外部共享 Pod、HPA，以及缺失能力证明的 NFS。
- [x] 绑定 `Pipeline` 的实际 callbacks：源 writer 暂停/恢复、数据库与 workspace collector、CSI 快照与克隆卷、隔离恢复 PVC、数据库 verifier、密文完整性核验和签名发布。目标恢复实例保持停止；恢复 PVC、隔离数据库及加密证据保留，临时 Job/ConfigMap/Secret/出站规则/源快照/克隆卷按账本清理。
- [x] `backup-controller` / `host`：文件配置、版本密钥和证书装载、client-go、独立控制库、Service、Pipeline、mTLS relay、临时 SQL 凭据、节点证明及 LiveWorkers 接线；提供离线结构检查、Dockerfile、RBAC/Deployment/隔离策略模板。启动不自动安装 schema。
- [x] Lite TLS 能力探测客户端和不可变重启参数；源 generation 预留与 restart dispatch 同事务，Lite binding/Pro Pod 回写与恢复回执同事务。验证原 runtime Pod 与 used_slots，重复恢复不重复分配 generation 或槽位。现有控制库需要显式安装新增 `restart_result` 列。
- [x] 实际 `CheckEvidence`：Worker 运行前核对源 pause 或目标隔离；冻结节点及卷身份；核对控制器自身 staging/evidence 挂载与各命名空间 Worker PVC 的真实共享后端。
- [x] 未 Ready Worker resolver：只有原 Job 已持久化删除、从未记录进程/发放密钥、授权已撤销且没有遗留 Pod 才允许无节点记录清理。已有进程记录仍要求节点停止证明。超时记录允许用于清理，但不能用于继续执行。
- [x] `target` profile 无需源账号连接，从签名密文包装配恢复计划；验证与恢复均限制在隔离目标。

仍然独立保留此前第 3、4 项：各 runtime/version 的完整文件/业务 Secret/跨域依赖策略、所有外部 writer 覆盖及遗留 mutation permit resolver。部署的 Runtime Agent 还需实现文档中的能力契约，NFS 还需存储方真实的外部 writer 排除证明；本批只完成本仓库客户端与校验接线，不提供无条件成功的模拟生产证明。

本批验证使用本机临时目录、SQL 驱动替身、Kubernetes fake、localhost TLS。覆盖源 generation/dispatch/binding 的事务提交与回滚、恢复重试、过期记录清理、无 Ready Worker 授权边界、密文与 invocation 替换、延迟绑定卷调度、共享卷后端漂移、Runtime 能力缺失/过期 Pod 身份，以及配置离线检查。详细部署参数和外部契约见[控制器接入说明](../examples/backup-controller/README.md)。没有连接参考服务器，没有执行真实迁移。

验证结果：`systembackup/...`、四个备份命令及 handlers/middleware/services/services-k8s/northbound 回归通过；相关 `go vet` 通过；`GOOS=linux GOARCH=amd64 CGO_ENABLED=0` 下备份组件、四个命令与 server 编译通过。新增 JSON/YAML 模板通过本地解码校验，没有应用到集群。真实 Linux/MySQL/K8s 的隔离联调与存储矩阵验收尚未执行。

## 14. 第 3、4 项适配与覆盖证明（2026-10-25）

本节记录最新代码状态，更新第 11、13 节中的第 3、4 项。所有测试仍在本机临时目录、SQL 驱动替身、Kubernetes fake 或 localhost TLS 中执行，没有连接参考服务器，没有执行真实迁移。

- [x] 版本化 RuntimePolicy：Linux 支持矩阵、镜像 digest、配置路径/格式/字段全覆盖策略；采集时只读校验，恢复时使用签名绑定的同版策略，旧 Files 配置冲突拒绝执行。未登记发布版本不放行。
- [x] 业务 Secret/ConfigMap/Skill 对象采集：按 K8s UID/RV、完整 key、对象版本/hash/size 固定来源；覆盖 Agent Pod 引用和数据库凭据引用；直接密文封装，无明文落盘。增加固定 TLS 的只读 S3/MinIO 适配器。
- [x] assets 恢复 Job + 独立只读 verifier Job：隔离 PVC 保存 Skill 对象和逻辑 key 索引；Secret 及配置中凭据使用不可用的演练值，任务定义保留、触发关闭；读取目标实际字节验收，篡改/缺失/额外文件失败。
- [x] 跨域数据库依赖：模型、会话、Skill 元数据和绑定在同一只读事务归档；已知本仓库字段显式归一化，核验外键与逻辑引用；Team 事件/任务/工作流/模板也归档，提供精确 schema 的逐列适配接口，非空未适配表拒绝恢复。
- [x] WorkBuddy 源分支接口：精确 schema fingerprint + 语义列映射、storage identity/UID/GID 核对、allocator 不重放；缺表或缺适配拒绝恢复。用户确认“暂时没有，先完成适配接口”，因此没有猜测或声称实现真实源分支字段映射。
- [x] 签名领域贡献合同及独立扫描：策略/实例规则/依赖/资产完整性绑定；源平台不可用时可分页读取提交目录，逐个重新验签并认证密文。目标策略不匹配拒绝导入。
- [x] 应用进程注册和全副本核对：业务初始化前登记真实 Pod/节点/容器身份，每个许可绑定进程；冻结 Deployment/ReplicaSet/Pod 链，要求全部副本覆盖并持续重验，重启/扩缩容漂移失败。
- [x] 外部 writer 证明协议及严格客户端：TLS、随机 nonce、完整请求摘要、固定任务时限和远端副作用结束证明；无证明不执行。
- [x] 崩溃进程及旧许可 resolver：正面的原 CRI 进程停止证明 + 远端副作用结束 + 二次任务 fence；进程撤销/审计/精确许可删除同事务。未绑定旧 token 还需独立归属证明；未知/过期许可不自动删除。
- [x] 控制 schema、既有安装手工升级脚本、应用身份注入模板及部署接入文档。本轮未安装或应用到任何集群。

**尚未完成，不能把第 3、4 项或整个 P0 标为“只差验证”：**

- [ ] 真实发布镜像的完整文件规则及 WorkBuddy 具体源 schema 映射。框架和接口可运行，合成配置测试不等于验证所有厂商版本；WorkBuddy 此次交付边界已按用户回复缩为接口。
- [ ] Team owner 的具体逐列/JSON 策略、Redis/共享空间等完整跨域交付，以及全系统六域 artifact/catalog 的独立签名、注册/删除事件、retention/provider finalizer/acceptance。当前签名领域包和目录扫描不是完整公共合同。
- [ ] 现场外部 writer/storage fence 服务及 Runtime Agent 能力端的实现/接入；本仓库没有这些外部组件源码，现有客户端不会用模拟证明放行。应用覆盖目前限明确登记的单容器 Deployment。
- [ ] 真实 Linux/MySQL/K8s 隔离集成与 CSI/HostPath/NFS 矩阵验收。生产凭据绑定、目标 MinIO 回填和启动不属于当前隔离恢复入口。

测试覆盖业务凭据与对象往返、完整字段与资源身份漂移、目标篡改拒绝、WorkBuddy 缺 schema/非法身份、跨域引用缺失、配置版本冲突、应用容器重启、TLS 证明重放/过期/不完整、许可清理的原子性/响应丢失/租约到期。详细字段与边界见[接入说明](../examples/backup-controller/README.md)。

验证结果：`systembackup/...` 与 server、四个备份命令、handlers/middleware/services/services-k8s/northbound 回归通过；备份组件及命令的 `go vet` 通过；Linux amd64 静态交叉编译通过。后续 WorkBuddy 严格拒绝、许可 resolver 和跨平台配置检查改动分别完成相关包回归，配置检查输出 `configuration structure valid; no connections opened`。模板仍未部署，真实数据库并发和集群存储行为未验收。

## 15. 跨域适配与六域 catalog 核心（2026-10-25）

本节更新第 14 节的跨域/catalog 剩余项。按本次要求，已有仓库结构直接开发；缺少真实资料的部分交付严格接口，不猜测生产能力、不执行真实迁移。

- [x] 本仓库 Teams 明确字段适配：Team/member/task/event/work item/workflow phase/template；活动任务关闭、outbox 仅归档、跨 Team 引用及成员归属检查，独立目标共享卷映射接口。JSON 仍要求逐叶策略。
- [x] AI Gateway 调用/成本/风险/审计与 resources 镜像/出站例外/扫描/管理审计依赖；非活动恢复处理。领域贡献合同 v2 包含四个关联域，旧 v1 保留读取兼容。
- [x] 六业务域、六物理 part 及 control_plane 独立 verifier 的类型、注册表、完整性校验及机器可读 schema。缺 part 或 verifier 不以空数据代替。
- [x] 三用途独立 Ed25519 签名、规范 JSON、冻结 manifest/index/marker、清理后 acceptance、合格后 catalog registration；functional_test 不生成 acceptance/注册。
- [x] 原生 provider 条件创建接口、精确 payload/身份/时限冻结、SQL 提交关闭取消、不确定写只读核对、强 absent/到期校验。准入必须有显式 Admission。
- [x] 固定 snapshot/inventory 全量扫描；签名字节、记录、分页回执及游标同事务持久化；最终一致性读取重验签名、数量、摘要、分页链和 tombstone 引用；响应丢失后续扫。
- [x] 不依赖源 DB/K8s 的 catalog 导入认证：固定所有对象版本，全量认证密文最终记录，导入前后两次检查 tombstone。返回已验证元数据，不自动写目标业务库。
- [x] 历史恢复点保护、hold/lease/finalizer 排除、shortage、候选摘要绑定；全版本删除证明接口和不可变首次执行人/时间的签名 tombstone。
- [x] Redis 原子采样/专用快照/隔离恢复接口；scan_dump 流式交给加密 staging，重复变化和容量限制；绝对 TTL、过期跳过、时钟漂移拒绝；scan_dump 只能为 bounded。
- [x] 四张独立控制库 catalog 表和手工升级脚本、JSON Schema 生成命令及[详细接入说明](../backend/internal/systembackup/recovery/README.md)。本轮未安装 schema、未应用部署。

仍需真实资料的接入开发：存储端原生到期条件写/版本化 absent/固定 inventory；Redis topology、原子采样与 stream group 格式；Team 共享卷恢复及全部 writer 证明；owner 私有 JSON/加密格式；WorkBuddy 源表；真实 runtime 镜像规则。接口均明确拒绝缺失或未知能力。

当前可部署 HTTP/UI 仍为用户/实例 functional_test。六域 acceptance 的 provider/owner 适配、冻结任务 Admission、控制器配置接线及真实隔离集成尚未完成，不能把整个 P0 表述为“开发全部结束，只差验证”。本轮完成的是上述跨域已知 schema 和六域公共核心/接口。

验证：本地全量 `systembackup/...`、五个备份命令、server、handlers/middleware/services/services-k8s/northbound 回归及相关 `go vet` 通过。新增测试覆盖六 part 合成密文发布/导入/扫描/删除记录、丢失响应不重发、SQL 原子提交与接管、签名/对象/页链篡改拒绝、TTL/retention、域完整性和活动任务关闭。全部为隔离替身与本机数据，没有连接参考服务器或执行真实迁移。

Linux amd64 静态交叉编译通过。控制器示例配置使用绝对文件路径离线检查，通过并输出 `configuration structure valid; no connections opened`；没有装载现场数据库连接或执行集群调用。

## 16. 适配器与控制器接线（2026-10-25）

本节更新第 15 节的接线状态。服务器继续仅作为此前的只读参考；本批没有连接服务器、执行真实迁移、安装 SQL 或应用 K8s 配置。

- [x] `CatalogExecutor` 与现有 Service/Pipeline 组合：新增 `catalog_scan`、`catalog_import` functional_test 任务，冻结 profile/provider/请求摘要，分页与结果持久化，成功终态要求结果记录存在。前端增加任务入口和注册记录 SHA-256 输入；导入只做完整认证，不写业务目标。
- [x] `host.Config.Catalogs`、独立目录控制器配置、固定信任/codec/KEK 文件、locator/bootstrap 白名单；独立模式不需要源 DB/K8s 或节点 relay。提供仅用于离线结构检查的 `catalog.example.json`。
- [x] Provider owner HTTPS/mTLS 网关客户端：随机请求绑定、版本流读取、强 absence 回执、固定快照续扫、每页能力检查；写权限显式启用，检查原生条件/长度/hash/到期能力且不重发未知写。服务端及底层存储能力仍需真实实现，不是通用 S3 写入器。
- [x] 显式 CMSTG01 codec：对象版本、备份身份、AAD、wrapped DEK 与全部 AEAD 帧认证；私有格式工厂接入宿主注册表，未知格式拒绝。该兼容适配不声称替代原计划所有正式发布格式。
- [x] 六域 owner Discover/Bind/Contribute/Publisher 接入 profile：冻结计划，writer 合入暂停账本，collector 合入同一采集窗口及停止流程，资源准备/源校验/未知变更核对/清理/结果校验必须完整提供。
- [x] `SixDomainPlan` 在发布前加密冻结；真实 `CatalogAdmission` 在 SQL 事务内绑定原计划、用途、provider、签名实际公钥、前序确认结果及源补偿/Worker 状态。`SixDomainPublisher` 写入独立提交结果，接管只读核对，不重发不确定写，不补发缺失的后续步骤。
- [x] Team 共享卷 owner 回执接入 target discovery 和数据库 Worker；冻结并反复核对 PVC/PV UID、绑定、StorageClass、删除状态和 owner 内容/UID/GID/隔离证明，不再只传未经核验的名称映射。
- [x] Redis collector/restore 编排适配：原子采样或专用快照、先完整认证再写、逐项持久化意图、绝对 TTL、未知结果不重发。真实 Redis 客户端、格式和恢复账本仍由 owner 实现。
- [x] 更新 JSON Schema、控制库安装/升级脚本和接入文档。目录任务不产生 acceptance；六域功能包不伪装成已注册的灾备点。

本轮交付的隔离验证：新增 localhost TLS provider 请求绑定/错误版本/过期重放/缺原生到期能力/未知写不重发、SQL 发布准入/签名密钥变化/前序缺失、owner 完整暂停注册表与名称冲突、目录任务推进与配置漂移、codec 固定描述符和私有格式工厂、共享 PVC/PV 身份、Redis 不确定写测试。`systembackup/...`、相关命令/server、handlers/middleware/services/services-k8s/northbound 回归通过，前端 TypeScript 检查、Go vet 和 Linux amd64 交叉编译通过。均为本机替身、合成数据、临时目录或 localhost，没有真实环境验收。

仍需资料后开发/接入：厂商原生 provider 服务端与授权证明；Redis 原子采样、stream/group、隔离恢复 journal；共享卷真实内容恢复；各 owner collector/verifier/加密格式；WorkBuddy 源 schema 和实际 Runtime 镜像规则。注册工厂接口已接通，但默认二进制不附带这些缺资料的实现。另有六域 acceptance 专用准入、prune 的真实 lease/CAS/删除执行，以及目录结果浏览 API，不能把这些称作“只差验证”。详见[六域接入文档](../backend/internal/systembackup/recovery/README.md)。

## 17. 不依赖现场资料的第 1、2、3、6 项（2026-10-25）

本节替代第 16 节中对应的“恢复 journal、lease/CAS 和目录浏览尚未实现”状态。本次完成这些模块的通用实现，未连接参考服务器、安装控制表、部署集群资源或执行真实迁移/删除。

| 项目 | 本轮实现 |
| --- | --- |
| 1. 目录管理 | 完整扫描快照的分页查询、注册/删除记录详情、脱敏任务报告及下载；管理员路由和页面接线；游标绑定扫描与快照，历史结果不作为恢复授权 |
| 2. Redis 账本 | 整份清单/策略/目标绑定、逐项 Freeze/Sent/Done SQL 日志、进度计数、接管及只读 Reconcile；无正面匹配和 writer 停止证明时保留未决状态 |
| 3. 恢复与清理互斥 | 同库串行锁、不可变 artifact 登记、消费者级恢复租约、manual/promotion hold、固定清理计划、锁内重算和认领、发送前提交、未知删除只读核对、删除证明及未发送计划取消 |
| 3. 生命周期与终态 | ProtectedCollector 连接 Pipeline，持续续租、失去执行权取消、停止并验证后释放；多消费者不能相互释放；任务终态检查未决写、清单完整度、未释放租约和清理状态 |
| 6. 离线工具 | --diagnose 输出固定错误码、字段位置、策略覆盖和资料类别；--materials-template 输出脱敏资料清单；不读取引用的凭据/密钥文件、不连接服务，结构检查不声称运行验证 |

SQL 新增七张控制表和协调锁初始行，初装 schema 与 upgrade-recovery-operations.sql 同步。API 增加 catalog、catalog/:record、report 三类只读路由；报告和页面不暴露 provider 地址、对象路径、bootstrap、签名原文或业务内容。

隔离测试涵盖：目录分页/游标越界/未完整扫描/损坏记录/删除详情/脱敏报告；Redis 整份计划替换、提交响应丢失、不确定写和取消后的正面核对；保留标记或 guard version 变化、过期未释放租约阻止清理、清理认领阻止新恢复、未决删除不得取消、全部版本不存在和 writer 停止证明；多消费者释放隔离、任务终态拦截、安装/升级 SQL 一致性；诊断不回显配置值、不读引用文件及 CLI 参数互斥。

这些测试使用 SQL driver 替身、合成签名记录、Kubernetes fake、本机临时目录和 localhost；真实 MySQL 锁竞争与厂商存储语义仍需后续隔离集成验收。Redis 真正的命令/格式、共享卷复制、厂商删除及停止证明依旧需要相应 owner；SQL 协调器和 ProtectedCollector 已可接入，但默认命令不注册猜测的生产实现。六域 acceptance 准入和 provider 网关服务端通用层不属于用户本次选择的四项，仍保留后续开发。

验证结果：`systembackup/...`、五个备份命令、server、handlers/middleware/services/services-k8s/northbound 回归通过；相关 Go vet、Linux amd64 静态交叉编译、前端 TypeScript 检查与 Vite 构建通过。新增控制 schema 和终态检查完成针对性回归。实际离线运行示例配置诊断返回 `structure_valid=true`、`runtime_verified=false`，资料模板输出 11 个类别且不要求生产 Secret。所有 Go 验证关闭模块代理和校验服务；SQL 升级脚本未执行，未连接参考服务器。

## 18. 六域 acceptance 准入与 provider 网关服务端（2026-10-25）

本节更新第 17 节保留的两项通用开发。没有连接参考服务器、安装 SQL、部署集群资源、执行真实迁移或删除。

- [x] 独立 AcceptancePolicy 配置、profile 能力快照、SQL 任务准入和历史 revision 匹配；仅 backup 可显式选择 acceptance，旧功能备份不能自动升级。
- [x] AcceptanceEvidence 绑定策略、目标/KEK/控制面与六域独立 verifier 引用；SixDomainAcceptanceOwner 提供只读证据验证接口，缺实现拒绝。
- [x] 完整发布计划和验收授权加密冻结，绑定 request/profile/plan hash；重试不能覆盖。发布前复核证据与实际三个 signer，每个发送事务复核授权及源补偿/Worker 状态。
- [x] _ACCEPTANCE 从已确认发布链重算并验签；注册精确绑定 locator/bootstrap/core/matrix/签名 key，只有 local_acceptance=true 可注册。本地提交重新核对全部确认对象，成功终态不能借用旧功能包。
- [x] 管理页面验收选项与报告接线；分别显示流程完成、灾备资格、目录注册状态，报告不授权恢复。
- [x] GatewayServer 实现六个既有协议操作、TLS 1.3 双向认证、叶证书指纹/操作授权、固定 provider/root、请求大小/时限/规范 JSON 校验、流式精确版本回执及快照分页校验。
- [x] GatewayDispatch SQL 永久发送认领、相同 root/key 和 action 不可变；提交响应丢失、并发重复或接管只读核对，不再次 Create；独立控制表手工脚本，不自动安装。
- [x] backup-provider-gateway 命令、离线配置检查、固定 hash 的后端配置与 native factory 接口、示例配置及接入说明。默认无厂商 factory 时在凭据读取、连接和监听之前拒绝。

验证使用 SQL driver 替身、合成六域/签名资料、临时目录和真正的 localhost mTLS：覆盖策略缺失/不匹配/过期、授权及计划替换、错误签名/缺少前序、终态与脱敏报告、并发重复单次发送、SQL 提交和原生响应丢失、弱证据/过期/错误范围/未知字段拒绝以及离线命令。后端全回归、Go vet、Linux amd64 编译、前端 TypeScript/Vite 构建通过；Vite 仍提示较大的应用 bundle。协议 schema 完成离线重新生成与一致性校验。

仍需资料后实现/接入：厂商 NativeGatewayBackend 的真实 native expiry、精确版本/强 absent/固定 inventory；六域 owner 的实际证据验证、隔离 verifier、目标故障域及 KEK 恢复策略；原有 Redis/共享卷/WorkBuddy/实际镜像规则。客户端、服务端及控制器通用接线已完成，但默认二进制不附带这些缺依据的实现。真实 MySQL 并发、厂商存储语义及 Linux/K8s 存储矩阵验收仍需后续隔离联调，不能称为整个 P0 已完成或可直接生产迁移。

## 19. 本机 Lite/Pro 隔离备份数据链路（2026-10-26）

按用户“先验证 OpenClaw Lite/Pro”的回复，本轮在本机 Docker Desktop Linux 引擎新建实验，不连接 `172.16.0.158`，不读取真实业务数据、不执行真实迁移。新增 `backend/cmd/backup-lab` 和 `examples/backup-controller/run-local-lab.ps1`；实验独立于控制器准入，不向生产控制器注入模拟证明。

- [x] 使用缓存的真实 Lite/Pro 镜像创建 baseline，在无网络容器中启动 OpenClaw Gateway、健康检查并停止。两个实际程序版本均为 `2026.7.1-2 (0790d9f)`，按本地 sha256 镜像 ID 固定；没有拉取镜像。
- [x] 独立 MySQL 8.4.8、内部 Docker 网络、无宿主端口；随机生成专用账号、TLS 和加密签名密钥。2 个合成用户（含 admin）、2 个 Linux 实例、5 张 InnoDB 表、9 行数据。
- [x] 源库冻结为 `super_read_only`；真实 SELECT-only/TLS 连接调用现有数据库 Worker，只读实例目录调用现有 workspace Worker，再由现有 artifact 发布签名加密包。采集前后数据库和文件 HMAC 一致。
- [x] 停止源 MySQL，在无网络、无源文件/SQL/staging 挂载的新容器中认证、解密和解包；2 个账号 bcrypt 哈希核对、数据库快照逐值核对、38 个文件逐个 HMAC 核对通过。
- [x] 正常副本先通过认证，再改变一个密文字节，读取被拒绝；正式发布包保持只读且再次认证成功。Lite、Pro、MySQL 容器均确认退出码 0，内部网络无连接容器。

成功实验：`run-20261026-012427-a099cb95`，backup ID `lab-deaaeda241d22ea4`。结果位于项目内 Git 忽略目录 `.codex-temp/backup-lab/run-20261026-012427-a099cb95/result.json`，镜像及启停记录见同目录 `environment.json`，备份包见 `artifacts/`。失败调试轮次与命名卷保留，没有清空已有资源。运行入口、配置前提和所缺资料详见[本机实验说明](../examples/backup-controller/README.md)。

验证：上述真实容器实验完整退出 0；`go test` 覆盖 backup-lab 编译和 worker/artifact/domain/workspace/staging 现有回归，`go vet ./cmd/backup-lab` 通过，Linux amd64 静态 runner 实际运行通过。修复的是实验脚本的 PowerShell tmpfs 参数引用、Windows 挂载凭据文件权限、临时 MySQL 初始化进程判断，以及解压/只读产物负例处理；没有修改生产采集/发布逻辑。

**验收边界仍明确保留：** 这是实际采集/加密/发布模块的数据链路验证，五张最小合成表不覆盖整个应用 schema；合成会话、任务和凭据文件仅证明内容保留。尚未通过管理页面或控制器创建 K8s Job，未验证 Runtime Agent API 暂停/恢复源状态、CSI/NFS/HostPath 存储矩阵、Linux UID/GID、目标业务库导入、admin 替换或恢复后模型/渠道调用。报告中 KubernetesControllerVerified 与 RuntimeAgentLifecycleVerified 均为 false。

完整流程后续需要：专用隔离 K8s 的部署位置/访问方式和存储配置、对应 Runtime Agent 镜像或源码及备份能力、全部 writer/远端副作用停止证明服务、最终 Lite/Pro 配置 schema/持久卷/Secret 清单。证书、合成账号、控制库和部署文件可由项目继续生成，无需提供生产凭据；外部服务缺实现时仍有接入开发，不能将其描述为仅缺配置或整个 P0 已完成。

## 20. WorkBuddy Lite 复杂目录隔离测试（2026-10-26）

按用户要求补测 WorkBuddy Lite，沿用本机 Docker Desktop，全部为独立合成环境。未连接参考服务器、生产数据库或外部渠道。新增 `run-workbuddy-lab.ps1`、`workbuddy-lab-fixtures.py`；backup-lab 增加独立 WorkBuddy fixture、符号链接核对、Linux owner 保留和真实 Wine 布局负例探针，未放宽生产归档器的安全策略。

缓存镜像固定 ID `sha256:e2eff0ff74b146b126cc88f05f0ee7f863c40041de2849d6c304bd40fe0ce496`，镜像内 WorkBuddy 5.3.14。两个 daemon/bridge 使用 12001/12002 独立非 root UID，私有 HOME、无网络、无新增权限和 Linux 命名卷，启动健康及正常停止通过。没有运行 Runtime Agent 的完整动态身份/namespace 生命周期，文档 SDK 尚未就绪，不能把 daemonReady 当作全部业务可用。

已通过：MySQL 合成 5 表/9 行、2 用户、2 实例；签名加密包离线认证；1,081 个文件/链接内容和 Linux UID/GID/权限/目录/链接目标一致；源及恢复后跨 UID 读取拒绝；4 个原生 SQLite 数据库 quick_check；两个专用合成 SQLite WAL 中 600 条记录恢复；密文篡改拒绝。真实原生数据库由镜像自行初始化，合成业务文件位于明确标记的 fixture 目录，未猜测厂商会话和任务表格式。

**发现实际阻塞：** 用该镜像的 wineboot 真正初始化 Linux 文档 SDK Wine prefix 后，出现 `dosdevices/c:`、`dosdevices/z:`，其中 `z:` 指向 `/`。当前 workspace.Archive 对冒号路径和绝对链接明确拒绝，探针确认返回 ErrArchive。普通 HOME 备份通过不代表包含已初始化文档组件的完整实例备份通过；没有删除或排除这些文件来制造成功，需要独立的、版本化且受约束的 Wine/Linux 布局适配。该 Linux 依赖仍在本轮范围，不是 Windows Agent 迁移。

成功基础实验 `workbuddy-20261026-014646-4350bf08`、backup ID `lab-737c38475bda7ad6`。同目录 `result.json`、`workbuddy-result.json`、`workbuddy-wine-result.json` 分别记录数据链路、权限/SQLite、完整备份不就绪；Wine 探针在基础实验之后独立追加运行，临时 prefix 已随容器释放。实验 MySQL/Agent 均退出 0，命名卷和备份包保留。脚本的预期拒绝负例执行成功不等于 WorkBuddy 完整迁移验收成功。

尚缺：真实 WorkBuddy 身份表/存储身份生命周期合同（当前 MySQL fixture 不猜建身份表），文档组件适配，原生凭据/连接器/任务/会话语义及隔离业务样本，Runtime Agent/K8s 停止与存储矩阵。文件 owner 保留不能替代平台身份表迁移。无需提供真实用户数据或生产凭据。

验证：backup-lab 编译、domain/workspace/worker/artifact 回归和 backup-lab vet 通过，Linux 静态 runner 在实际容器运行；补测恢复卷跨 UID 拒绝与真实 Wine 负例通过。[运行方式和完整边界](../examples/backup-controller/README.md)已同步。

## 21. WorkBuddy Lite Wine 专用备份恢复适配（2026-10-26）

本节更新第 20 节的 Wine 布局阻塞。用户要求继续开发，身份资料不足时保留严格接口，并询问服务器验证与所有 Agent 覆盖；本轮没有连接参考服务器或执行真实迁移。

- [x] `workspace.Layout` / `workbuddy-lite-wine.v1`：以单实例 HOME 为根，核验固定 Wine prefix、真实祖先目录、drive_c、dosdevices 和三份注册表；仅接受确切的 c:→../drive_c、z:→/ 链接。不跟随盘符采集，不允许其他盘符/绝对链接或伪造盘符子路径。
- [x] 保留实际镜像产生的 `user.DOSATTRIB`：专用 PAX 字段传输并恢复原始字节，限定 Wine 布局、目录/普通文件和 4096 字节上限；其他 xattr/ACL/capability 继续拒绝。目标不支持扩展属性时失败，不制造有损成功。
- [x] `ArchiveWithLayout` / `RestoreWithLayout` 接入真正 Worker；恢复完整认证后才写隔离空根，Z 映射最后建立，内容、UID/GID、mode、mtime 和允许的 xattr 保留。默认 Archive/Restore 的跨平台安全规则保持不变。
- [x] 发布策略 `WorkspaceLayout` 显式启用，只接受 WorkBuddy/Linux/Lite 和固定镜像 digest；通过现有冻结任务/签名合同绑定，恢复配置规则必须与策略一致。空布局字段省略，保留旧策略编码和摘要兼容。
- [x] Linux 安全回归覆盖正常往返、通用策略拒绝、盘符目标变化、额外盘符/绝对链接/路径穿越/前缀替换/缺注册表、未知布局、DOS 属性往返、未知/超限/非法 PAX 与 xattr、错误 Agent/模式/镜像、策略摘要变化、规则替换及源配置不变。
- [x] 实际缓存 WorkBuddy 5.3.14 镜像：在 UID/GID 12001 下创建 Wine prefix，与原生 daemon 初始化的配置和 SQLite 共存，再停止测试进程；新 Linux 卷里调用生产 Worker 完成流式加密与独立恢复，不连接源数据库或 K8s。

最终共存实验：`wine-20261026-022546-20c35e5f`，backup ID `lab-070a29f097f29614`。1,987 个条目、1,270,263,771 字节文件内容、451,860,314 字节密文；逐项内容、UID/GID、mode、非链接 mtime、链接文本、DOS 扩展属性相同。两个原生 SQLite 数据库的 DB/WAL/SHM 临时副本 quick_check 通过；原恢复卷始终只读用于校验。恢复后仅启动隔离 Wine CLI，验证源注册表键、C 盘文档、Z 盘容器根映射和 DOCX 测试文件，之后停止全部 Wine 进程，未启动恢复的用户 Agent。

实验中补充处理了两种真实边界：原生 daemon 父进程退出不表示测试子进程均已退出，初始化脚本现在结束自己创建的进程组并等待私有 PID namespace 内存活进程结束；SQLite 可能需要从 WAL 重建 SHM，校验改在 DB/WAL/SHM 的专用临时副本执行，不修改只读恢复原件。两者均为隔离测试脚本处理，不替代生产 Runtime Agent 的停止证明。最新实验采集/恢复成功后在保留卷上补跑校验，原始失败记录和卷保留，不重放真实迁移。

验证：`systembackup/...`、backup-lab/backup-worker/backup-controller 回归及相关 vet 通过；Wine workspace/Worker 测试交叉编译后在真实 Linux 命名卷中执行，通过。Linux 测试仅使用现有 Worker 的 CHOWN/FOWNER/DAC_OVERRIDE capabilities，不启用 privileged。本机 WSL2 tmpfs 不支持该 user xattr，不能作为扩展属性验收卷；支持属性的 Linux 命名卷已验证。这也说明服务器存储能力必须另行验收。

**环境与范围：** 宿主 Windows；实际内核 `5.15.146.1-microsoft-standard-WSL2`，测试进程和实例数据均在 Linux 容器/命名卷。尚未验收隔离 Linux/K8s 服务器、CSI/NFS/HostPath、Runtime Agent、原生文档编辑、真实 WorkBuddy 身份表或完整配置凭据语义。报告保留相应 false；身份表仍缺资料即拒绝迁移，没有猜字段或重新分配身份。下一步需要独立测试服务器/集群和实际存储配置，`172.16.0.158` 仍只读。

所有声明支持的 7 类、12 种 Linux Agent 类型/模式组合都需要对应发布镜像集成；本节完成时实际镜像记录只覆盖 OpenClaw Lite/Pro 和 WorkBuddy Lite，后续覆盖更新见第 22 节。完整矩阵、适配配置及重复运行命令见[接入说明](../examples/backup-controller/README.md)。

## 22. 其他 Agent 实际镜像测试和多用户混合恢复（2026-10-26）

用户要求继续补齐实际镜像隔离测试、混合用户/实例演练并修复问题，随后明确排除 Codex Pro 和 Claude Code Pro。本轮只使用本地缓存镜像、合成用户、全新 Linux Docker 卷；没有连接 `172.16.0.158` 或执行真实迁移。

- [x] 新增 `run-agent-matrix-lab.ps1` / `agent-matrix-fixtures.py` 及 backup-lab `matrix-capture`、`matrix-restore`：原生初始化，确认测试写进程退出，只读源卷、生产 Worker 流式加密、签名策略和密钥封装、独立目标恢复，逐项核对内容/权限/UID/GID/mtime/链接/xattr 和 SQLite DB/WAL/SHM。
- [x] 5 类 10 组合都有最终通过证据，累计 8,261 个条目、23 个原生 SQLite、3,000 条合成 WAL 消息。Hermes/OpenCode 另外通过原生会话读回，DeepSeek 恢复后网关可启动。历史失败均保留；统计取各组合最新成功记录，不将失败报告覆盖为成功。
- [x] DeepSeek 实际暴露约 430 个镜像依赖绝对链接导致通用归档拒绝：新增显式 `deepseek-harness-node-modules.v1`，限定 npm 包名、固定实例路径和镜像内精确目标，包括实际的特殊映射；绑定 DeepSeek/Linux 和不可变发布镜像策略。只备份链接文本，普通布局仍拒绝，其他绝对路径/目录替换/穿越/链接下文件攻击均拒绝。
- [x] 修复测试初始化：OpenClaw 健康探测假令牌、PowerShell 单 digest 数组解析、Hermes Lite 网络边界、DeepSeek 假路由和禁浏览器启动、WorkBuddy Pro 正常 app.quit 和 Lite 脱离进程组的测试 sidecar 收尾。私有容器中观察退出，未伪造 Runtime Agent 停机证据。
- [x] 新增 `run-mixed-agent-lab.ps1` / `mixed-agent-verify.py`、合成多用户 SQL fixture 和混合策略绑定：四用户、非 WorkBuddy 八实例，完整数据库/文件备份与恢复；源库关闭后在新 MySQL 卷上导入。目标仅合成 admin，直接调用 `RestoreDrill`，随后撤销/锁定恢复账号，另一个 SELECT-only 账号调用 `VerifyDrill`。
- [x] 混合演练验证 source admin 密码哈希和资料替换、禁用用户状态、19 位小数精度配额、实例外键归属；实例/desired state 停止，任务配置保留但关闭，旧平台令牌/Pod 句柄清除。3,371 个文件/链接 HMAC 相同，7 个原生 SQLite、2,400 条 WAL 消息通过，8 个实际 UID 不能读取其他实例目录。
- [x] 缺 WorkBuddy 身份 schema 的负例在任何数据库写入前拒绝，bootstrap admin 仍在；重复导入非空目标拒绝。明确将混合 SQL 演练限定为四种非 WorkBuddy 类型，没有静默过滤全量迁移中的 WorkBuddy。

| 组合 | 实测版本 | 最终成功运行 | 条目数 / 原生 SQLite 数 |
| --- | --- | --- | --- |
| OpenClaw Lite / Pro | 2026.7.1-2 | `matrix-20261026-025759-8fbda614` | 1910 / 1；1909 / 1 |
| Hermes Lite | v0.21.0 | `matrix-20261026-025759-8fbda614` | 485 / 1 |
| Hermes Pro | v0.16.0 | `matrix-20261026-025056-26a342e5` | 669 / 1 |
| OpenCode Lite / Pro | 1.18.13 | `matrix-20261026-025056-26a342e5` | 各 70 / 1 |
| DeepSeek Harness Lite / Pro | 0.1.0-rc.6 | `matrix-20261026-030839-8b2aa1e1` | 481 / 0；623 / 1 |
| WorkBuddy Lite | 5.3.14 | `matrix-20261026-030309-e7cf97bc` | 74 / 2；另有第 21 节 Wine 共存验证 |
| WorkBuddy Pro | 5.3.14 | `matrix-20261026-030120-f713c22e` | 1970 / 14 |

混合运行：`.codex-temp/backup-lab/mixed-20261026-030941-3509ab6f`，backup ID `lab-40e20db883ff8dc6`，包含 `agent-matrix-summary.json`、`mixed-restore-result.json`、`mixed-verify-result.json`、`mixed-linux-result.json`。源库、目标库和本轮所有 Agent 进程均已停止，测试卷/报告保留。

验证：`go test ./internal/systembackup/... ./cmd/backup-lab ./cmd/backup-worker ./cmd/backup-controller` 及相关 vet 通过；Linux workspace 全套（含 Wine xattr、DeepSeek 链接攻击）与 Worker 全套在 Linux 命名卷上通过。混合实验使用真实隔离 MySQL 和生产数据模块，并非 SQL mock。

**仍需资料/外部修复，不能视为生产 P0 完整验收：**

1. WorkBuddy 对应分支、身份表脱敏 DDL/约束及 storage_identity/UID/GID 生命周期；其两种模式的文件测试通过不等于身份迁移放行。
2. 独立 Linux/K8s 测试环境、Runtime Agent 和平台 digest、StorageClass/VolumeSnapshotClass、CSI/NFS/HostPath 与权限/属性配置，才能验收真实暂停、快照、源状态恢复和跨存储链路。
3. 各版本完整持久化挂载、真实配置字段/Secret 引用/密钥服务合同和可生成的合成业务样本。当前 marker policy、合成历史/Skill/任务/假模型渠道凭据只证明传输和隔离，不覆盖所有厂商业务语义。WorkBuddy Pro 未验证登录后业务或文档编辑；无需提供生产用户行、密码或密钥。
4. DeepSeek 缓存 rc.6 启动脚本缺少 `node --expose-internals`，且不能用 NODE_OPTIONS 传此参数；测试以显式 Node 命令加 `--no-open` 启动后通过。需其镜像构建源码或修正后的镜像，才可验收默认启动器。Hermes Lite/Pro 实测版本不同；目标版本变更需相应 digest 再测。

完整运行命令和限制见[接入说明](../examples/backup-controller/README.md)。Codex Pro、Claude Code Pro 本轮按用户要求排除；Windows Agent 继续排除。

## 23. WorkBuddy 真实身份结构只读复核（2026-10-26）

用户再次授权参考服务器检查后，已取得真实身份表/分配器 DDL、唯一索引与运行时 GID=UID 约束，并验证现存六实例的 HOME/身份文件/数据库 UID 一致。此前“缺少真实建表资料”已解除；专用恢复适配尚未完成，不能据此直接放行。

关键差异：身份表只有 instance_id/user_id/linux_uid/created_at；另有 next_uid 分配器；13 条身份含 7 条无现存实例的历史记录；六个现存实例的 storage identity 字段均为空。当前独立 GID/storage 列接口、通用孤儿校验和 reference_only 分配器策略均不能直接覆盖此版本。

已保存不含源数据的 metadata DDL，并用全合成行添加加密 capture 往返及首次写入前拒绝的隔离回归（2 项通过）。这轮没有开发/放开新的导入适配，没有在参考服务器恢复数据。下一阶段是版本化身份映射、历史记录及分配器高水位、身份文件/文件属主联合验证，再进行隔离 MySQL 恢复；相关源分支分配/删除逻辑仍待核实。完整事实、证据边界见[只读复核记录](users-instances-backup-source-inspection.zh-CN.md#7-workbuddy-身份专项复核2026-10-26)。

## 24. WorkBuddy Lite 身份、历史占用与 UID 分配器恢复（2026-10-26）

本节更新第 23 节的待开发状态。按已有只读证据实现 `workbuddy-linux-uid.v1`；本轮没有连接或写入 `172.16.0.158`，没有执行真实迁移。仅使用本机 Docker Desktop Linux、缓存镜像、全新命名卷、内部网络和合成数据。

- [x] 固定身份表、分配器两张表的元数据指纹；Catalog 额外采集其唯一索引，源/目标必须保持 `linux_uid` 唯一约束、主键、列类型/可空性和已观察到的无外键结构。未知版本不通过改一个指纹就能放行。
- [x] Linux Lite 的 GID=UID、schema=1 身份文件、UID 10000～65533、用户归属和 `workbuddy_storage_identity IS NULL` 专用适配；不制造 GID/storage 列或补写身份字符串。Pro、非空 storage identity 等其他合同仍拒绝。
- [x] 保留全部身份记录，包括删除实例、删除用户的历史占用及 created_at。仅此固定表在专用验证通过后允许历史引用；其他表的用户/实例外键完整性检查不变。现存实例必须匹配身份，UID 重复和与非 WorkBuddy 实例 ID 冲突均拒绝。
- [x] 原样恢复 allocator id=1 的 next_uid，要求大于全部当前/历史 UID，保留间隙；65534 作为无可用 UID 的边界值保留，绝不回绕。只有空白目标的空表或初始 (1,10000) 可接收，已前进的分配器拒绝覆盖。身份、分配器、源 admin 和其余用户/实例行在同一事务中恢复，失败完整回滚。
- [x] `PreflightDrillWithPolicy` 接入控制器，首次预检与恢复事务使用相同的版本化空白目标检查。旧无版本预检继续拒绝有分配器数据的目标。
- [x] 控制器冻结来自只读 SQL 的预期身份；发布前解密并认证已封存数据库分片，确认身份未在发现至停写之间变化。恢复端从已认证数据库分片推导身份，不查询源库。Worker 在采集前后、恢复完成时交叉核对身份文件与 HOME 的实际 Linux UID/GID；缺失、替换、重复 JSON key、链接冒充或错误属主均失败，不自动 chown 修补。
- [x] 新增 `workbuddy-lite-instance-wine.v1`：以包含 `.workbuddy-identity.json` 和 `home/` 的单实例根归档，兼容 `home/` 内固定 Wine 盘符、注册表及 DOS 属性。原 HOME 布局继续保留，二者路径不能混用。没有排除文档组件或放开任意绝对链接。

隔离实验入口：`run-mixed-agent-lab.ps1 -Suite workbuddy-identity`。从此前通过的只读 WorkBuddy Lite baseline 复制两份到新卷；只在新卷中赋予合成 UID 21000/21001、身份文件及独立 WAL 历史，测试用 Wine fixture 单独标记。真实 MySQL 采用已核对的身份 DDL，其余用户/实例表使用固定最小实验 schema；所有用户、密码、身份行和历史消息都是合成的。

最终实验 `workbuddy-identity-20261026-063224-df31201d`，backup ID `lab-0f0eeb84a600370f`：

| 检查 | 结果 |
| --- | --- |
| 用户与实例 | 4 用户、2 Linux Lite 实例；源 admin 替换目标 admin，禁用用户和精确配额保留 |
| 身份与历史占用 | 4 身份记录：2 现存、2 历史，其中一条历史所属用户也已删除；全部逐值保留 |
| 分配器 | next_uid=23000 原样恢复；事务内下一 UID 插入与递增探针成功、历史 UID=21010 重用被唯一索引拒绝，探针随后回滚 |
| 失败路径 | allocator 回退在写前拒绝；证据回调失败后 admin/身份/初始分配器回滚；非空目标重复恢复拒绝 |
| 独立核验 | 先停止源库，再恢复新目标；锁定并撤销写账号后，用独立 SELECT-only 账号核对全部正常化行 |
| 文件与身份 | 90 个文件/链接内容 HMAC 一致；182 个条目的内容/链接/UID/GID/mode/xattr 一致；2 个身份文件匹配数据库 |
| 历史 | 4 个原生 SQLite 副本 quick_check，600 条合成 WAL 消息可读；未向未知厂商历史表猜字段写入 |
| 隔离及 Wine | 两个用户跨 HOME 读取拒绝；实例根内 c:/z: 映射及合成文档 DOS 属性保留；没有启动恢复的 Agent |
| 目标状态 | 全部实例和 desired state 停止，任务配置保留但禁用，旧平台令牌/Pod 句柄清除 |

结果保留在 `.codex-temp/backup-lab/workbuddy-identity-20261026-063224-df31201d/` 的 `mixed-restore-result.json`、`mixed-verify-result.json`、`mixed-linux-result.json` 和加密 artifacts。源库、目标库均已停止，测试卷保留。第一轮不含实例根 Wine fixture 的成功记录也保留。

验证：`systembackup/...`、backup-lab/controller/worker/inventory 回归及 vet；domain、Worker、workspace 编译为 Linux 二进制，在无网络 Linux 容器执行通过（Wine 属性测试用支持 xattr 的命名卷）。新增身份漂移、错误用户/UID/GID/marker、allocator 上限/回退、目标唯一索引缺失、事务回滚、实例根 Wine 路径攻击等用例。Windows 宿主不能替代 Linux owner/xattr 检查。

**当前放行范围：此固定 Linux Lite 身份版本的隔离恢复适配已通过。** 不是生产迁移或整个 P0 验收。仍需专用隔离 K8s/实际存储、Runtime Agent 全生命周期和该发布版本完整配置/Secret/业务样本；源分支分配/删除/旧版兼容代码可用于验证真实平台的后续创建/删除行为。当前只完整保留历史占用，不实施回收；分配探针是合同模拟，不是假称已执行平台真实分配器。WorkBuddy Pro 身份合同未核实，保持拒绝；Codex Pro、Claude Code Pro 仍按用户要求排除。

## 25. 合并前清单、审查与修复（2026-10-26）

用户要求整理全部改动、审查修复并检查，明确不提交、不推送、不合并；随后指定目标分支为 `backup`。WorkBuddy Pro 身份适配不纳入当前开发范围，保持未知合同拒绝。

- [x] 生成[完整改动清单](users-instances-backup-change-list.md)：294 个文件（13 个已跟踪修改、281 个新增），含 102 个 Go 测试文件；逐文件列明状态和增删行数，忽略实验产物与临时凭据。
- [x] 修复恢复预检：控制器重新认证源数据库分片和冻结 bundle，使用 restore invocation 的完整策略和容量限制，在只读事务中验证源数据、目标 Catalog、归属、placement、WorkBuddy 身份和空白目标。不再仅以目标为空作为预检通过条件。
- [x] 新增合法/不兼容 schema、缺 placement、错误 owner、缺身份适配、非空目标、缺失/重复 invocation、容量限制回归；检查没有 writes/commit 且输入与目标未变化。
- [x] 修复 `BackupResults` effect 同步重置状态的 lint 错误；分页与选择时清理状态，同一条记录可以重复读取。更新组件 README 的最新状态入口并标注历史记录。
- [x] 当前 backend 全量 `go test ./...`、`go vet ./...`、Linux amd64 构建通过；前端变更文件 ESLint、TypeScript/Vite build、已有版本/OpenCode 入口测试通过。Linux domain 30 个顶层测试通过，无 skip/fail；脚本语法、Go 格式和限定模式文件扫描通过。
- [x] WorkBuddy Lite 实际隔离 MySQL/文件复测 `workbuddy-identity-20261026-065823-76aa4976`，backup ID `lab-2a536b7c49c740c3`：4 用户、2 实例、历史身份与 allocator、90 文件/链接、182 元数据条目、4 SQLite 和 600 WAL 消息验证通过，Agent 保持停止；源/目标库已停止。没有连接参考服务器或真实迁移。
- [ ] **合入 `backup` 的控制面整合仍未完成。** 本地缓存目标 `edc43f1ee32ffbdac512f6184c86eb4174f38c90` 已有公共 controller/producer/security 和独立合同，不能与本次内部控制器自动互通。任务、停写 gate、资源账本、API/安全入口、成品目录及目标 migration 必须接成一致的权威链路。
- [ ] 临时只读三方文本检查发现 `backend/cmd/server/main.go` 有 1 组 import 冲突，另 4 个重叠修改文件无文本冲突。未将结果写回工作区，未执行合并；文本无冲突也不表示运行语义兼容。
- [ ] 完成目标分支整合后，在其完整 migration schema 上重跑隔离演练与构建，再到独立 Linux/K8s 集群验收 Runtime Agent、真实存储、Job/快照、暂停和源恢复。当前通过不代表这些项通过。

完整依据、修复位置、检查范围及合入条件见[审查报告](users-instances-backup-premerge-review.zh-CN.md)。此次比较未 fetch，不代表远端缓存之后的更新；没有切换分支或修改 index，HEAD 仍为 `576e4bb5440d453fd25300586e57ce81cb616f31`。
