# 用户和实例备份恢复实现与验证说明

记录日期：2026-10-27。本文保存详细实现与验证记录，commit message 仅摘录要点。

背景与目标
----------
实现 users/instances 领域的全量备份、隔离恢复与迁移基础能力，
面向已安装基础平台、仅有 bootstrap admin 的空白 ClawManager 目标。
保留账号身份、密码哈希、配额、实例归属和持久化内容；恢复后实例保持
停止、任务配置保留但禁用，由用户确认后再启动。

本提交包含此前累计开发和合并前审查修复，共 295 个文件，含 102 个
Go 测试文件。当前基于 main，计划后续整合到 backup；不表示已完成
与目标分支公共控制器的兼容，也不表示生产迁移或整个 P0 已验收。

1. 用户与实例领域数据
--------------------
- 建立领域表、恢复动作及跨域依赖 registry，区分业务数据、运行状态、
  历史引用和不能跨环境重放的执行记录。
- 通过 MySQL 元数据 Catalog 和 REPEATABLE READ / READ ONLY 事务采集，
  核对源库名称、server UUID 与只读权限；不在源环境运行 migration。
- 实现结构化行编码，保留 NULL、二进制、精确数值和密码哈希，设置行数
  与内存限额，超限拒绝；当前为有界内存批次，不宣称大库流式采集。
- 实现 schema/归属/外键检查及配置归一化，映射目标 placement，清除源
  临时令牌、Pod 句柄和活动状态，停止实例并禁用调度。
- 在隔离恢复事务中替换 bootstrap admin 并按依赖恢复数据，失败回滚；
  提交前保存加密校验依据，使用独立 SELECT-only verifier 核对结果。
- 生产 restore execute 未开放；领域恢复入口限制在证明隔离的 cm_drill_*
  目标，拒绝错误身份、非空目标及未知恢复合同。

2. WorkBuddy Lite 身份、历史记录与 Wine
------------------------------------
- 根据服务器只读核对的结构实现 workbuddy-linux-uid.v1 固定版本适配：
  身份表、allocator、主键、唯一索引、列类型及已观察到的无外键约束。
- 保留全部当前和历史 UID 占用，包括已删除实例或用户的历史行；原样
  恢复 next_uid 高水位与间隙，拒绝回退、重复 UID 和不兼容目标 seed。
- 校验 Linux Lite 的 GID=UID、用户归属、UID 范围、NULL storage identity，
  将数据库身份与实例根 marker、HOME 实际 Linux 属主交叉验证。
- 在发现、采集、发布及恢复边界验证身份，避免 SQL 与工作空间来自
  不同身份版本；缺失、替换、重复 JSON key、链接冒充或属主错误均拒绝。
- 增加 workbuddy-lite-instance-wine.v1，保留实例根、home、身份文件、
  固定 c:/z: 盘符映射、注册表和受限 DOS 扩展属性；保留旧 HOME 布局。
- WorkBuddy Pro 身份适配不纳入本次放行范围，未知合同继续拒绝。

3. 工作空间、加密暂存与备份成品
------------------------------
- 归档登记根中的文件、隐藏目录、Skill、任务和会话/SQLite/WAL 数据，
  处理 UID/GID、权限、时间与明确支持的扩展属性。
- 拒绝路径穿越、越界链接、非法文件类型和未知属性；为实际 DeepSeek
  镜像增加显式、版本与镜像绑定的 node_modules 链接布局规则。
- 使用流式 gzip 与分片 AES-256-GCM，绑定任务/attempt/path/context，
  验证认证终止帧及密文完整性，拒绝截断、追加、换序、篡改和错误密钥。
- 实现不可变发布、签名 bundle、密钥封装、完成标记和恢复输入验证，
  形成源环境关闭后仍可读取的内部备份集；不在成品内嵌明文密钥。
- 内部成品协议为 users-instances-functional.v1alpha1，不冒充已冻结
  的公共六域备份格式；KMS/provider 和生产权限证明需外部接入。

4. 控制器、暂停补偿与 Kubernetes 资源
----------------------------------
- 增加内部控制库、任务状态机、幂等、fencing、claim/接管、取消、恢复
  操作、资源 journal、结果报告和失效授权处理。
- 实现 prepare、持久化 pause intent、全部 writer ACK、capture/seal、
  collector 退出与撤权、按源状态 resume 的流程及失败补偿。
- 为 Lite gateway、Deployment/Pod 等提供暂停/恢复适配与进程证明边界；
  不以 HTTP 404 或副本数为零直接冒充可靠停止证明。
- 增加 PVC/PV/HostPath/NFS/CSI 解析、Job、VolumeSnapshot、恢复 PVC、
  ConfigMap 与隔离 NetworkPolicy 构建及实际 client-go runner。
- 资源操作绑定不可变请求、owner、UID 与 journal/fence；处理不确定
  创建和删除结果，避免接管或清理来源不明的对象。
- 实现工作空间/数据库 worker、mTLS grant、短期凭据、授权复核和撤权；
  恢复结果保留在 quarantine，不自动启动目标 Agent。

5. 跨域接口、六域准入与应用接入
------------------------------
- 增加显式跨域配置、Team placement、assets、版本化 owner/provider
  接口及六域 acceptance/catalog 扫描、导入和操作接口。
- 增加 provider gateway 服务端及受约束派发；缺少真实 owner 资料或
  能力证明时拒绝执行，不用合成 fixture 冒充生产合同。
- 应用按 CLAWMANAGER_BACKUP_CONTROL_CONFIG 显式启用独立控制库，
  注册管理员备份 API 和 HTTP 写入协调边界。
- 将实例、Team、北向服务、调度、同步、Skill materialization、扫描、
  PVC 与 WorkBuddy prewarm 等后台业务路径接入 mutation gate。
- 新增管理员任务页、状态与取消、结果/目录分页、记录详情、脱敏报告
  下载，以及导航、路由和前端 API service。
- 提供 backup-controller/worker/inventory/lab/node-proof/provider-gateway/
  contract-schema 命令、三份镜像 Dockerfile、示例配置和接入说明。

6. 合并前审查修复
----------------
- 修复只读恢复预检仅检查空白目标的问题：重新认证源分片和冻结 bundle，
  读取唯一 restore invocation，使用同一恢复 policy 和容量限制，在只读
  事务中核对源数据、目标 Catalog、placement、归属及 WorkBuddy 适配。
- 增加缺表、字段变化、缺 placement、错误 owner、缺 adapter、非空目标、
  invocation 缺失/重复及超限负例；断言无写入/commit且源与目标不变。
- 修复 BackupResults 在 effect 中同步重置状态的 lint 错误，将分页和
  记录选择重置移到交互处理器，保证重复选择同一记录仍能重新加载。
- 更新 README 最新状态入口，保留历史实验失败与限制记录，增加完整
  逐文件改动清单和面向 backup 分支的合并前审查报告。

验证记录
--------
- 当前 backend 全量 go test ./...、go vet ./... 通过。
- GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build ./... 通过。
- 本轮 Linux domain 30 个顶层测试通过，0 skip、0 fail；此前 Linux
  worker/workspace 回归包含属主、Wine xattr 和链接攻击测试。
- 前端五个变更 TS/TSX 文件 ESLint、TypeScript/Vite build、已有版本
  与 OpenCode 默认入口测试通过；未声称全项目 ESLint 或浏览器 E2E 通过。
- 实际缓存镜像文件测试覆盖 OpenClaw/Hermes/OpenCode/DeepSeek/WorkBuddy
  的历史 Lite/Pro 组合；Pro 文件测试不代表 Pro 身份恢复已放行。
- 非 WorkBuddy 混合演练覆盖四用户、八实例及源关闭后的独立目标恢复。
- 最新 WorkBuddy Lite 实验：lab-2a536b7c49c740c3，四用户、两实例、四条
  当前/历史身份，90 文件/链接、182 元数据条目、四个 SQLite 副本和
  600 条合成 WAL 消息通过；Wine 映射、DOS 属性、跨用户 UID 隔离通过。
- 恢复后撤销/锁定写账号，再用独立只读账号校验；源/目标实验数据库
  均已停止，恢复 Agent 未启动。测试全部使用合成数据和隔离资源。
- Go 格式、Python/PowerShell/JSON 语法和限定模式的凭据/产物扫描通过。
  测试日志、密文、临时凭据、二进制、node_modules 和 dist 不纳入提交。

已知限制与后续整合
------------------
- 本地审查的 origin/backup 已有另一套公共 controller/producer/security
  和 migration 合同；当前内部控制器不能与其直接同时启用。
- 合入前必须统一任务协议、权威停写 gate、mutation lease、资源/证据
  账本、API/安全入口和成品/catalog 接线；不能只消除文本冲突。
- 已观察到 server/main.go 一组 import 冲突；目标 schema 新增 migration
  仍需在整合后的独立数据库重跑目录、归一化及恢复准入验证。
- 10 月 27 日提交前 fetch 后，远端 backup 已更新至 52117dee，新增公共
  备份和 Skill Hub 改动；此前目标分支审查对应 edc43f1e，后续需针对
  最新 backup 重新检查。此次仅提交独立功能分支，没有执行分支合并。
- 尚未验收真实隔离 K8s、Runtime Agent 全生命周期、CSI/NFS/HostPath、
  VolumeSnapshot、源状态恢复以及各发布版本完整凭据/业务语义。
- WorkBuddy Pro 身份适配、Codex Pro/Claude Code Pro 实镜像测试和 Windows
  Agent 不在当前放行范围。历史 Wine/文件测试不等于文档编辑业务验收。
- 参考服务器仅用于此前只读结构核对，未执行真实迁移。

详细范围与证据：
- docs/users-instances-backup-change-list.md
- docs/users-instances-backup-premerge-review.zh-CN.md
- docs/users-instances-backup-development-plan.zh-CN.md
- docs/users-instances-backup-source-inspection.zh-CN.md
