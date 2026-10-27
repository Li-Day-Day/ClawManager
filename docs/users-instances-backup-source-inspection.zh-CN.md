# 用户与实例备份：源服务器只读检查记录

检查日期：2026-10-23（Asia/Shanghai）。源服务器：`172.16.0.158`。

本次用途为部署、schema、数量和存储位置核对。用户确认当前 SSH 主机指纹后采用临时指纹绑定连接，没有改写本机 known_hosts。未保存登录密码、数据库密码、密码哈希、Token、Secret 值或用户文件内容。

## 1. 环境与数据规模

| 项目 | 观测结果 |
| --- | --- |
| Kubernetes | v1.36.4；单个 Ready control-plane 节点 |
| 节点系统 | Ubuntu 24.04.4 LTS；containerd 2.3.4 |
| 平台 namespace | `clawmanager-system` |
| 部署 profile | 应用环境变量为 `single-node` |
| 数据库 | MySQL 8.4.8；数据库名 `clawmanager` |
| 数据库对象 | 77 张表，检查时均为 InnoDB；80 条 applied migration 记录 |
| MySQL 日志能力 | binary log 开启；GTID mode 为 OFF |
| 用户 | 3 个，均为 active admin；3 个均存在非空密码哈希，其中 1 个用户名为 admin |
| 用户配额 | 3 条 |
| 实例 | 22 个，均为 Linux Lite；查询时数据库状态均为 running |
| 运行绑定 | 22 条；实例未发现缺失的所属用户 |
| Skill | 152 条 Skill，194 条实例绑定 |
| AI Gateway 聊天 | 5 个 session、21,057 条 message；为本次只读事务的计数，运行环境仍会继续变化 |
| 模型与 Team | 1 条模型记录；0 个 Team |

密码哈希只检查了是否非空，没有提取其值，也没有执行真实登录验证。以上数量不是备份结果或跨数据源一致性证明。

## 2. 实例类型

| 类型 | 模式 | 变体 | 数量 |
| --- | --- | --- | --- |
| OpenClaw | Lite | Linux | 4 |
| Hermes | Lite | Linux | 3 |
| OpenCode | Lite | Linux | 4 |
| DeepSeek Harness | Lite | Linux | 5 |
| WorkBuddy | Lite | linux | 6 |

22 个数据库 workspace 路径均已映射到主机目录并验证目录存在；这些 workspace 根目录没有发现符号链接或解析到所检查存储根之外的情况。没有递归遍历全部文件，因此不构成子树链接、内容完整性或 UID/GID 全量验证。

## 3. 存储位置和能力

当前 PVC 均使用名称为 `manual` 的 class；未发现 StorageClass 对象，也未发现 `snapshot.storage.k8s.io` API 资源。

| PVC | PVC 声明容量 | 访问模式 | PV 实际后端 |
| --- | --- | --- | --- |
| `clawmanager-workspaces` | 50 GiB | RWX | HostPath `/data/clawmanager/system/workspaces` |
| `mysql-data` | 5 GiB | RWO | HostPath `/data/clawmanager/system/mysql` |
| `redis-data` | 1 GiB | RWO | HostPath `/data/clawmanager/system/redis` |
| `minio-data` | 10 GiB | RWO | HostPath `/data/clawmanager/system/minio` |

实际工作空间和 MySQL 目录所在文件系统为根分区 ext4；检查时 `df` 显示约 437 GiB 总量、276 GiB 可用。PVC request/容量不是本地目录硬配额，也不能代替实际可用空间检查。

5 个 Agent runtime Deployment 都将同一个 `clawmanager-workspaces` PVC 挂载到 `/workspaces`，应用进程本身也挂载该 PVC。实例目录按以下规则映射：

```text
容器：/workspaces/<agent-type>/user-<user-id>/instance-<instance-id>
主机：/data/clawmanager/system/workspaces/<agent-type>/user-<user-id>/instance-<instance-id>
```

因此不能把共享 PVC 当作某个实例的专属卷，也不能只暂停一个写入方后就认定整份系统数据一致。备份需统一协调应用/worker 和所有实际 runtime writer，在有界停写窗口内完成加密暂存，随后恢复源运行状态。

抽样根目录名称表明，配置/会话可能分布在 `home/.openclaw`、`home/.hermes`、`home/.config/opencode`、`home/.opencode`、`home/.local`、`home/.dsh`、`starter` 等位置。WorkBuddy 还包含身份文件以及 `home/.workbuddy`、`home/.config/WorkBuddy`、`home/.workbuddy-key-fallback` 等目录。这里只读取了目录项和 metadata，没有读取密钥或业务文件内容；后续不能把单个 dot-directory 当成全部持久化数据。

WorkBuddy runtime 另有 `/run/workbuddy-lite` 和 `/tmp` 的 emptyDir 挂载，应登记为临时执行状态并由相应 adapter 确认处理，不复制为可自动重放的运行状态。

## 4. 与当前本地实现的差异

这是实际发现的兼容性差异，不是已执行的修复；没有在服务器上运行任何应用 migration。

### 4.1 Runtime 能力

服务器已存在 6 个 WorkBuddy Lite 实例，而当前本地 `scope.RuntimeProfiles()` 只登记 WorkBuddy Pro。本地清单必须暂时明确拒绝该组合，后续需补充 WorkBuddy Lite 的数据、身份、停写和恢复 adapter，不能用 Pro 规则代替或跳过这 6 个实例。

### 4.2 本地期待、源库不存在的表

- `enterprise_auth_settings`
- `runtime_upgrade_items`
- `runtime_upgrade_audits`

源 `users` 表没有本地模型中的 `auth_provider`、`login_alias`、`external_id`。源 `runtime_pods` 也没有本地升级逻辑使用的部分版本和能力字段。

这表示不能直接用当前本地 User/Runtime model 假定源 schema 完整，也不能在只读发现阶段调用 `db.Initialize` 等会自动迁移数据库的入口。

### 4.3 源库新增、当前领域 registry 尚未覆盖的表

- `instance_lifecycle_batches`
- `instance_lifecycle_batch_items`
- `instance_lifecycle_batch_attempts`
- `instance_lifecycle_manual_guards`
- `instance_lifecycle_scheduler`
- `runtime_rollout_instances`
- `workbuddy_browser_grants`
- `workbuddy_instance_recoveries`
- `workbuddy_linux_identities`
- `workbuddy_linux_identity_allocator`
- `workbuddy_pod_terminations`

此外，源 `instances` 有本地当前模型尚未包含的 `alias`、`workbuddy_storage_identity`，运行绑定有 `storage_identity`。这些字段和表要先登记 preserve/reset/disable/reference-only 策略及验证规则；特别是 WorkBuddy 的稳定存储身份、UID/GID 分配不能仅根据实例 ID 重新猜测。

`instance_skills`、`instance_gateway_token_aliases` 已属于此前明确的跨域依赖，不应重复归为新发现的无 owner 表。

源库还有 `portal_demo_*` 等非标准表，需要明确业务归属或排除理由；本次没有读取其数据内容。

迁移历史也不同：源最近记录包含 WorkBuddy storage identity/recovery、生命周期批次及 owner records 等 migration。不能只比较最大数字编号，就认为两边 schema 相同或可直接升级。

## 5. 对后续实现的具体影响

1. 真实清单应使用不运行 migration 的只读连接，先查询 `information_schema` 和 applied migration，再选择源版本 adapter。
2. 完整枚举 3 个用户、22 个实例及其关联关系；对未知表、字段和未支持 Runtime 给出阻断报告，不输出成功的部分清单。
3. Kubernetes discovery 必须沿 Pod/Deployment mount → PVC → PV 实际后端解析。此环境的正确结论是“PVC 包装的 HostPath”，不是“有 PVC 就支持 CSI snapshot”。
4. shared workspace 按实例目录建立映射，同时登记应用和 runtime 池为 writer；HostPath Job 需要绑定实际存储节点。单节点停写采集必须在 seal 后恢复业务。
5. 备份保存完整账号登录数据、配置和文件；恢复阶段清除旧运行绑定/访问令牌，禁用生命周期调度和旧任务执行。源 admin 替换目标 admin 的已确认策略仍需在受控迁移阶段实现。
6. 模型/聊天记录、Skill Hub metadata/绑定/对象、Secret/ref 必须经各域 collector 联合处理，不能只备份 `users`、`instances` 两张表。
7. 正式 Job 的数据库和 K8s 身份仍需实现最小权限；本次运维只读检查的 root 通道不是正式备份权限设计。

## 6. 本次未验证/未执行

- 未暂停或重启任何 Agent，未修改 workload 副本数。
- 未修改数据库、平台配置、Secret 或应用镜像；仅执行只读 metadata/计数查询。
- 未创建 Job、CronJob、PVC、快照或备份对象，未导入恢复数据。
- 未提取凭据值、用户密码哈希或会话内容。
- 检查时没有现有 CronJob；平台 namespace 没有 Job 记录。这不证明不存在其他主机级或外部备份手段。
- 未验证源集群外 artifact target/KMS/catalog，也未完成灾备资格验收。
- 此服务器可用于 Kubernetes single-node、HostPath、5 类 Linux Lite 的适配验证；没有覆盖 Longhorn/CSI、NFS、Pro、Codex、Claude Code 或多节点部署。

## 7. WorkBuddy 身份专项复核（2026-10-26）

用户再次授权在 `172.16.0.158` 使用 SSH 只读验证。连接核对了之前已确认的 ED25519 指纹，未改写 known_hosts。仅运行 metadata/只读事务查询、运行脚本读取及身份文件/目录属主比对；没有导入、执行 migration、修改分配器、chown、暂停或重启实例。数据库凭据只在原 Pod 内部使用，没有输出或保存其值。

本次实际应用镜像：`clawmanager@sha256:c69bc1466cf31fbd7daec49d8f75ef254e2dec7865881bf66d7924becbab5cc9`；WorkBuddy Lite 镜像：`workbuddy-lite@sha256:5d5aa912f211949e0e3a52884533b8c9685697890d629ce93868b8fdf5acde71`。这与前述离线文件测试的 WorkBuddy 镜像一致。

### 7.1 真实 schema 已取得，不再缺建表资料

脱敏 metadata DDL 已保存到 `examples/backup-controller/workbuddy-observed-schema-20261026.sql`，没有源数据行：

- `workbuddy_linux_identities`：`instance_id int NOT NULL`（主键）、`user_id int NOT NULL`、`linux_uid int NOT NULL`（唯一索引）、`created_at datetime(6) NOT NULL`。
- `workbuddy_linux_identity_allocator`：`id int NOT NULL`（主键）、`next_uid int NOT NULL`。
- 两表都是 InnoDB/utf8mb4_0900_ai_ci，没有数据库外键约束。
- 身份表没有 `storage_identity` 或 `linux_gid` 列；`instances.workbuddy_storage_identity` 为可空 `varchar(512)`。

### 7.2 观察到的关系与运行规则

| 检查 | 只读结果 |
| --- | --- |
| 现存 WorkBuddy 实例 | 6；全部关联到身份记录，所属用户一致 |
| 身份表记录 | 13；其中 7 条没有对应现存实例 |
| UID 范围 | 当前已登记 10000～10012 |
| 分配器 | 1 条，id=1，next_uid=10013，大于全部已登记 UID |
| 现存实例的 workbuddy_storage_identity | 6 个全部为空 |
| 身份文件 | 13 个 `.workbuddy-identity.json`；schema=1，字段为 schema、instanceId、userId、uid、gid；13 个均 uid=gid |
| 现存实例 HOME | 6/6 的实际 UID、GID 与数据库 linux_uid 相等；6/6 身份文件的 uid/gid 与数据库相等 |

运行镜像的 `/opt/workbuddy-lite/launch.py` 明确校验：`10000 <= uid <= 65533`、`gid == uid`，实际进程 UID/GID 与参数一致且 supplementary groups 为空。该文件 SHA256 为 `d4a6761f754ac743d85b337957aa06df91a8b1d9475da6061adcb22dc0c21259d`。因此本版本 GID 的派生关系已有代码证据，不能继续假设存在独立 GID 表列。

“7 条无现存实例的身份记录”是观察事实；它们是否永久保留、何时可回收以及创建实例时分配器如何并发推进，仍需源分支的分配/删除实现或发布合同确认。本次未将它们判定为垃圾，也没有删除或重分配。旧实例 storage_identity 为空同样是事实；不能自行生成新身份字符串填回数据库或目录。

### 7.3 已定位的本地兼容性工作

1. `WorkBuddySchema` 当前要求身份表内存在独立 storage identity 和 GID 列，与本次实际版本不符。需要明确版本的适配，处理 GID=UID、所属用户匹配和旧版空 storage identity，而非放宽所有版本。
2. 通用关系校验要求每条 instance_id 都能关联现存实例，会拒绝实际保留的历史身份。需要专用规则及保留策略，不能直接全局取消孤儿记录检查。
3. 分配器目前是 `reference_only`，正常化导入会跳过。恢复实现必须完整考虑历史 UID、分配器高水位和目标初始化，防止启动后 UID 碰撞；尚不能直接切换为普通表导入。
4. 必须联合校验数据库身份、schema=1 身份文件及全部持久化根 UID/GID；现有 HOME/Wine 文件实验不能单独证明此平台关系恢复。

新增 `workbuddy_observed_test.go`，仅用合成 ID/UID/时间戳复现上述结构。隔离单测确认身份历史、空 storage identity 和 allocator 高水位可以经只读 capture、加密、解密原样保留；旧适配器仍在首次写入前拒绝恢复且不改目标 admin。两项测试通过。这里使用隔离内存 SQL 驱动，不是此版本身份恢复成功或 MySQL 实际导入验收。

**状态更新：** 阻塞已从“没有真实 schema 依据”变为“已确认具体版本差异，专用导入/分配器适配仍待开发验证”。不再要求用户重复提供上述 DDL；源分支的分配器/删除/兼容逻辑仍有帮助。服务器工作负载检查结束时均为 Running，本轮 SSH 会话已关闭。

### 7.4 后续开发状态

上述待开发项已由 `workbuddy-linux-uid.v1` 专用适配补齐，并通过本机独立 MySQL/Linux 卷恢复实验；详见[开发记录第 24 节](users-instances-backup-development-plan.zh-CN.md#24-workbuddy-lite-身份历史占用与-uid-分配器恢复2026-10-26)。身份、历史 UID 占用及 next_uid 原值保留，数据库、schema=1 marker 与 HOME owner 联合核验；恢复实例保持停止。没有对本服务器执行导入、分配器改写或目录修复。真实平台新建/删除时的分配器业务行为、其他身份版本及实际 K8s 存储链路仍需单独验收。
