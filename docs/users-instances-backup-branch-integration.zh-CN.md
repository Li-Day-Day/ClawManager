# 用户和实例备份：backup 分支整合记录

本文保留各轮处理时的状态快照。2026-10-27 的修复后来已提交为 `14768599` 并推送；当时“不提交、PR 关闭”的描述是历史状态。2026-10-28 的新增整合见文末，最新状态以 Git 与 PR 为准。

日期：2026-10-27。用户要求先解决功能分支与 `backup` 的冲突；本轮不创建提交、不推送、不重新打开 PR，不操作真实业务环境。

## 本地整合状态

- 功能分支：`codex/users-instances-backup`，HEAD 仍为 `b95eab59081da252bed4a8d0fc0792a7f7d1f2ad`。
- 目标：同步后的 `origin/backup`，`52117deea14df5a3a8dcceb8abed5b9c7cada17e`。
- 使用 `git merge --no-commit --no-ff origin/backup` 将目标改动整合到本地功能分支；没有创建 merge commit，也没有修改远端 `backup`。
- 两个文本冲突文件均已解决并登记到 index。保留 MERGE_HEAD，处于待创建合并提交状态。大量已暂存文件来自目标分支原有改动，不是本轮重新实现的功能。
- 旧 PR #1 保持关闭；远端功能分支仍是原提交。由于本轮不推送，GitHub 上原有提交的冲突状态不会自动更新。

## 冲突处理

### 启动入口

`backend/cmd/server/main.go` 同时保留内部 control/mutation 和目标分支的 systembackupsecurity 导入，保留目标分支新增的认证 session、退出撤销、公共只读入口，以及 Skill worker 的 StartContext/StopAndWait 接线。没有通过删除安全模块或回退生命周期来消除冲突。

### Skill materialize worker

`backend/internal/services/skill_package_materialize_worker.go` 以目标分支的新生命周期结构为基础，保留当前功能分支的 BackupGate：

- 使用 service interface 和 run context，重复启动不会创建重叠运行，停止会取消并等待当前任务。
- Backfill 和领取批次前都要进入停写 gate；关门时不启动写入，已取消的 run 不再获取许可。
- 批次许可覆盖所有子任务以及取消后 ReleaseToPending 清理，必须等待完成后再释放。
- StopAndWait 超时不表示已停止写入，不能提前释放许可或允许重叠重启。
- 部分 claim 失败、任务清理失败及 gate 释放失败保留在返回错误中；backfill 许可释放失败也传递至停止结果。

新增 5 个定向回归用例，覆盖关门阻止写入、取消不获取许可、停止超时下的清理/释放顺序、错误合并、backfill 许可释放失败。目标分支已有 worker 生命周期测试同时保留并执行。

## 整合检查发现并修复的问题

### 新增浏览器组件表未进入领域清单

全量测试发现目标 migration `064_add_instance_browser_workers.sql` 增加的 `instance_browser_workers` 没有 scope rule。依据仓库中的真实 migration 和 model 补齐：

- 纳入 instances 域，明确依赖 instances；备份保留源行，恢复保留资源档位、显示尺寸、profile 保留选项、镜像设置和时间字段。
- 恢复设为 enabled=0、status=disabled、generation=1、observed_generation=0，清除 last_error，不重放 ready/provisioning 等源运行状态。
- 明确允许列名，继续拒绝未知字段、缺失目标表和孤儿实例引用。
- 新增只读预检、隔离事务恢复和校验测试，以及错误归属/未知源列/未知目标列/缺表写前拒绝负例。

这些测试使用隔离 SQL 驱动替身，证明归一化与事务检查逻辑；本轮没有启动真实浏览器组件，也没有宣称浏览器 profile 存储与生命周期已完成集群验收。

### Windows CRLF 导致已发布合同的固定摘要失败

5 个公共备份测试失败对应 4 个按精确字节验证的文件。逐个核对证明：工作区文件仅多出 CRLF；转换回 LF 后与 `origin/backup` Git blob 完全一致。

通过 `.gitattributes` 固定相关 schema JSON、066 migration、065 测试 schema 和 provider issuer registry 为 LF，并将本地副本恢复成 Git 中的规范字节。没有更新任何预期摘要，没有放宽签名、摘要或合同检查。此前失败的 5 个测试全部通过。

## 检查结果

- 两个文本冲突均消除，未合并条目为空。
- Skill worker 5 个新增 gate 测试及原生命周期测试通过。
- 浏览器组件元数据预检、恢复、校验及负例测试通过。
- 固定摘要失败的 5 个测试修复后通过。
- 前端 TypeScript/Vite build、变更文件 ESLint、版本/OpenCode 入口测试、7 个 instance-access 测试通过。
- 整合后的 backend 全量 `go test ./...`、`go vet ./...` 和 `GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build ./...` 全部通过。全量测试允许缓存；需要外部 MySQL/对象存储配置的集成用例仍按原条件跳过，不将此次通过当作真实环境验收。

完整 merge diff 的 whitespace 检查会报告 `backup` 原有 SQL/历史 evidence 中的尾部空行和空格。未改写历史证据；本轮相对 `origin/backup` 的增量单独检查。

本地检查日志位于 `.codex-temp/premerge-review/merge-*.log`，不纳入提交。没有连接参考服务器、运行真实备份迁移或进行实际 K8s 资源操作。

## 仍需单独完成

本轮解决文本和已发现的编译/测试兼容问题，不代表两个控制面完成业务整合。当前 `/admin/backups` 与内部 `/admin/system-backup` 入口仍分别存在；公共任务/claim/fence、停写 gate、资源/证据账本、成品与 provider/catalog 合同仍需统一。不能以此次编译和测试通过作为两套控制器可同时启用的证明。

完整 migration 的实际 MySQL 恢复、真实 Runtime Agent 停写/源状态恢复、K8s Job/快照及 CSI/NFS/HostPath 验收仍待隔离集群验证。生产恢复 execute 未开放。

## 2026-10-28：整合 backup 新一轮主线更新

本轮从功能分支 `14768599` 整合 `origin/backup@63a13b2771091e4ba47b691ce066a670cbc88d54`。目标分支新增公共备份接线，并合入主线的北向批量操作、运行池、工作区等更新。只更新功能分支和现有 PR，不合并到目标 `backup`。

### 冲突与兼容修复

- `cmd/server/main.go` 同时保留公共 `systembackupapi` 与内部 `control/mutation` 导入，沿用新公共 API、安全入口及服务初始化，保留已有停写接线。
- `northbound/core_service.go` 保留普通与批量操作分流及并发上限，将停写许可放到共用 `processNext` 入口。批次预留/推进也会写账本，单独纳入同一停写 gate。取消发生在准入前或准入过程中时不领取任务；许可释放错误被记录或合并返回。
- 新增独立 Runtime 代理策略续期循环会写入 Agent 配置，为完整续期过程补充 gate。取消、拒绝准入和释放失败不会被误报为成功。
- 新表 `runtime_rollout_checkpoints` 作为加密归档中的历史证据，恢复时不写入活动表；`instance_workspace_write_intents` 属于源端未完成写操作的协调状态，恢复时丢弃，避免重放操作或误锁定目标工作区。源归档数据保持不变。
- 北向新增 `lite-instances:delete`、`pro-instances:delete`、`owners:usage:read` 纳入历史权限校验。恢复后的 session 仍撤销且过期，caller policy 仍禁用，不激活源权限。
- 目标分支 migration 从 96 个增至 136 个；迁移文件与 `origin/backup` 完全一致，本轮未编辑 SQL。通过 `node scripts/system-backup-contract-check.mjs --write` 重新生成目录摘要，同步 controller 严格准入常量和测试内嵌清单，摘要为 `dba576ad9efd3f377d8d07de2a9a86d4e523d8dafe8943751beb057a64e52441`。生成的 registry 只改文件数和摘要，未修改合同冻结状态、真实 schema 观察证据或历史签名材料。
- 固定 canonical registry 与内嵌 fixture 为 LF，防止 Windows 检出与生成工具产生字节差异。

### 验证与边界

本轮新增回归覆盖普通/批量/预留三条写路径的关闭 gate、取消及释放行为，续期禁写与持有许可到完成、新权限恢复后保持失效，以及新增运行协调状态不被重放。使用内存替身和合成元数据，不连接生产服务。

验证命令与结果记录在本地忽略目录 `.codex-temp/premerge-review/merge-20261028-*`。检查包括后端全量 `go test ./...`、`go vet ./...`、Linux amd64 无 CGO 编译，前端构建及版本/OpenCode 入口/instance-access 测试，合同生成一致性检查。依赖按仓库锁文件同步；需要外部配置的集成测试仍按原条件跳过。

上述检查最终全部通过；后端完整结果见 `merge-20261028-tests-verified.log`，全量测试允许使用 Go 缓存。新增协调状态恢复和北向 gate 用例另执行过 `-count=1`。初次因本地缺少新增依赖、旧目录摘要或测试内嵌清单而失败的日志保留，不作为最终结果。

本轮未连接参考服务器，未执行数据库 migration、真实备份恢复或 K8s 资源操作。目录摘要同步只确认当前源码目录的一致性，不代表 136 个 migration 的真实数据库验收。此前公共与内部控制面统一、真实隔离集群及业务验收待办继续保留。处理开始时 PR 已为 Open、非 Draft，本轮保留其状态，不执行合并。
