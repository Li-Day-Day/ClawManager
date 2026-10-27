# D：080 升级与专用报告存储评审材料

**本轮来源补查**：已直接核对本机 fix16 构建附件、runner SHA 和 catalog；该镜像 CLI 不含历史审查三个参数，实际升级须交付新 runner。旧原文和应用构建绑定仍缺，owner 仍待签收。见[旧 SQL / 构建来源交付材料](system-backup-d-legacy-source-upgrade-handoff-20260929.md)。本段不放行 080 或真实 collector。

本轮完成历史来源调查、升级前置方案和专用卷方案。没有执行现场升级、建卷、GRANT、服务部署或 MFA/激活，也没有代 A/B/C 批准业务数据语义。

## 历史迁移的调查结论

### 对话记录定位：旧账本与新增阻断来自不同时期

已回查本机保存的原始任务记录（不是只根据当前文档推断）：

| 时间/证据 | 已确认事实 |
| --- | --- |
| 9 月 14 日任务“作为D，我接下来需要做什么”，用户 16:09 回传的 SQL 结果 | 旧 `045/046/047` 的 applied_at 均为 `2026-08-12 02:32:22`；同主题当前 `050/052/053` 均为 `2026-09-14 07:16:42`。这是数据库原样时间，未推定数据库时区。旧三条在本轮 fix16 之前就存在。 |
| 9 月 28 日 14:46:49（北京时间），D 任务“作为D，A需要你接入权限、nonce、幂等和审计事务，并配置真实 issuer、验证 MySQL。” | 将已在隔离环境验证的 registration-runtime DDL 写入正式 `080`，四张运行表从此进入 embedded catalog。 |
| 同任务 9 月 28 日 14:49:21 发起补丁，14:50:15 工具完成 | 新增 `ApplyPinnedMigrations` / 独立迁移命令，同时在 `target != nil` 分支加入未知 ledger 文件名即拒绝的检查；当前 `backend/internal/db/migrations.go` 仍保留该逻辑。 |
| 同任务 9 月 28 日 15:02 的测试说明及后续 fresh replay 证据 | 验证了未知 ledger 拒绝和全新库重放；没有证明含这三条历史额外记录的已安装库可以升级。fix16 的隔离新库 PASS 同样不覆盖这个场景。 |

因此，**“正式独立入口会被这三条记录挡住”的兼容缺口可定位到 D 在 9 月 28 日补部署入口的迭代**。旧记录本身不是那次写入；已知历史库兼容路径没有一并闭环，属于 D 的升级集成缺口，不能转交 A/B/C 代为处理。080 缺失则表示新迁移尚未应用到实际库；不能由此断言 fix16 的 Controller 恢复修复损坏了数据库。当前还没有该实际库运行独立升级命令的失败日志，阻断结论来自已核对的源码逻辑与实际 ledger；fix16 是否编入完全相同实现仍待构建绑定证明。

对话没有提供旧三个 SQL 的原文或最初构建版本，也没有记录将它们重编号为 `050/052/053` 的实际操作，因此只能称为同主题文件，不能把“重编号/SQL 等价”写成已证实事实。详细任务 ID、原始记录行号和时间见来源调查 JSON 的 `conversation_provenance`。

当前本地非浅克隆，HEAD `f9429da92c443b0b8df4c990b8281efe9521d260`。搜索工作树及所有本地可见分支、remote refs、tags、reflog，三条旧文件名均没有原文/历史命中。未 fetch，不能据此断言未公开分支、过期不可达对象或历史构建归档中不存在原件。结果及现有 SQL 指纹见 [来源调查记录](evidence/system-backup-d-historical-migrations-20260929.json)。

| 实际库额外 ledger | 同主题现有文件 | 已核对的现有作用 |
| --- | --- | --- |
| `045_update_workbuddy_windows_runtime.sql` | `050_update_workbuddy_windows_runtime.sql` | 更新匹配 Linux 镜像的 Workbuddy 系统镜像设置及 runtime/display name |
| `046_add_instance_pvc_name.sql` | `052_add_instance_pvc_name.sql` | 若列不存在，给 instances 添加 nullable varchar(253) pvc_name；已有同名列不会核对类型 |
| `047_add_instance_runtime_variant.sql` | `053_add_instance_runtime_variant.sql` | 若列不存在则添加 varchar(32) runtime_variant，并按已有运行时字段更新 Linux/Windows 变体 |

三个当前文件均首次在 `00d4d2a70b72cabd85badec71c167db415a1138f` 可见。原 P0 inventory 记录旧三条于 2026-08-12 登记、当前三条于 2026-09-14 登记：只证明文件名都运行过，不能证明旧原文与上述语义等价，尤其 050/053 涉及数据更新，单靠现在 schema 相同不足以补证。相关业务语义留给原 owner 审核，D 负责来源/指纹和部署门禁聚合。

需要的真正交付是旧 SQL 原文与对应 commit/build-context/镜像构建来源，及与实际 applied 记录的绑定。没有原文时记录未解决，不做文件名别名表、不伪造旧 migration、不删 ledger。不重新要求用户猜文件路径；当前可见本地来源已查完。

## 080 的具体升级方案

后续 D 实现已补充[受审查的历史账本兼容入口](system-backup-d-reviewed-history-20260929.md)：默认仍拒绝未知记录；只有来源原文、审查清单、目标 pins 和完整账本验证后才允许只补 080。实际旧原文仍缺，未生成实际可用的审查文件。下述现场方案仍为不可执行状态，不能据此放行。

机器材料：[080 升级 review JSON](../deployments/k8s/system-backup-080-upgrade.zh-fix16.review.json)。这是 `executable=false` 的评审对象，没有 Kubernetes apiVersion，也不是可直接 apply 的 Job。

绑定实际 namespace UID、数据库 `clawmanager`/UUID `f1f5f76a-95f5-11f1-b08e-366835b4a029`、fix16 digest、93 文件 catalog。080 创建的四张表与现场缺失表完全对应；三个 user_id 外键要求 users.id 是兼容的 signed INT，并使用 InnoDB。它不会创建用户、登记 MFA、创建 session 或激活配置。

**当前不能直接执行。** 当前源码 `ApplyPinnedMigrations` 在同一锁连接上核对 DB 身份、读取 ledger 后，遇到未知 filename 会返回 `target migration ledger contains unknown migration`。因此，即使只缺 080，三条历史额外记录也使独立升级入口拒绝继续。源码的这个行为不能仅凭 catalog hash 推断已编入 fix16，需要确认镜像构建与 guard 实现。不能换成 raw mysql 或重启 core 来绕过这个检查。

执行前顺序：

1. 收敛旧 SQL 来源及适用的 owner 结论；若需要迁移兼容机制，另行明确设计、审查并验证，不在本方案中放开 allowlist。
2. 核对实际镜像 `--catalog-only` 与构建来源，准备独立 migration DSN、现有恢复检查点和部署窗口。
3. 重新核对 target/ledger，仅 080 待应用；核对 users.id 引用条件、四张 runtime 表无部分残留，以及 maintenance gate idle。
4. 使用正式独立 runner，在其迁移互斥与 capture gate 检查下执行；只读前检的 idle 观察不能代替此锁。
5. 核对四表字段、索引/FK、080 ledger 单行及历史记录保留。按本次观察，补 080 后是 **96 条 ledger = 93 当前 + 3 历史**，绝不能为得到 93 而删记录。整体历史兼容/schema 基线仍需独立验收。

MySQL DDL 可能部分提交。失败时保留同一 UUID/catalog，读取已建表结构和 ledger，确认后按正式入口恢复；`IF NOT EXISTS` 不验证已存在表，不能盲目重试。没有自动 DROP/清 ledger 回滚命令，也不把新 runtime 空表视作可以随意删除。

## 专用报告卷方案

**最新现场补充**：已收到 [UpgradeReview 回执](evidence/system-backup-d-upgrade-review-live-20260929.json)。三种 StorageClass 中包含 `longhorn-rwx`；k8s-master UID/hostname、无污点和 MySQL PV 路径已观察到。同节点方案现降为备选，先评估现有 RWX 供给；尚未证明 Longhorn 健康、目标节点客户端条件或实际 RWX 挂载能力。下表中路径隔离、目录权限和消费者方案仍为未执行的备选设计。

机器材料：[同节点报告卷 review JSON](../deployments/k8s/system-backup-capacity.zh-node-local.review.json)。这是待评审方案，**尚未实现到现有 RWX 生成器/预检，也未创建任何资源**。原有 RWX profile 保持严格，不能只改 accessModes 就让它通过。

先查看现有 StorageClass；当前 namespace 的 hostPath 清单不说明全局没有 CSI/NFS。如果已有合适共享存储，优先沿用已经实现的 RWX profile。若采用同节点方案，所有消费者需要共同约束：

| 项目 | 具体方案 |
| --- | --- |
| 独立卷 | 新 local PV `clawmanager-zhanghui08-capacity-local-pv` + PVC `system-backup-capacity-report`，不复用 MySQL/workspaces/minio/redis 卷 |
| 本地路径 | 提议 `/var/lib/clawmanager/system-backup-capacity/zhanghui08`，尚未验证；实施前检查真实路径、父路径/符号链接、与实际数据树分离、无其它内容 |
| 存储声明 | Filesystem、RWO、Retain；独立 no-provisioner StorageClass 使用 WaitForFirstConsumer；16Mi 是申请/绑定声明，不是目录配额 |
| 调度 | PV 与 collector、HTTP、bootstrap 都绑定经验证的 k8s-master hostname 标签；node UID、标签与 taint 尚待查询。禁止用 Pod spec.nodeName 绕过 WFFC scheduler |
| 权限 | 报告根目录 group 65532/mode 2770，文件 0640；collector UID 999 仅为 auto.cnf 属主候选，仍须在实际容器验证；MySQL 卷只读且不设置 fsGroup/递归 chown |
| 消费者 | collector 单写者，初始 0 副本、Recreate；HTTP 初始 0 副本且只读；bootstrap 初始 suspended 且只读；migration Job 不需要报告卷 |
| 故障 | 节点不可用或报告超过 5 秒，容量准入失败；不自动搬动 DB 或复制旧报告伪装新鲜 |

RWO 可以由同一节点上的多个 Pod 使用；local PV 的节点亲和性和延迟绑定是 Kubernetes 官方支持的机制。但这不证明目标节点或权限已满足，也不提供跨节点高可用。[Kubernetes 持久卷访问模式](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes)、[local volume](https://kubernetes.io/docs/concepts/storage/volumes/#local)、[延迟绑定](https://kubernetes.io/docs/concepts/storage/storage-classes/#volume-binding-mode)。

实施同节点 profile 时，D 必须同时改生成器及预检：验证所有读写消费者的同节点约束、实际 PV/PVC UID/路径隔离、最小 toleration、UID/GID 和单写者；新增消费者读到 <=5 秒新鲜报告的现场验收，拒绝 RWOP、业务卷复用和额外写入者。不能把此文档当作这些实现和测试已经完成。

## 补充现场只读检查

本次回传已完成以下命令，不必重复运行。only-080、无部分残留、users FK 元数据、gate 当时 idle、目标稳定均通过；额外三条历史记录仍在。检查没有获取迁移锁，不是升级许可，也未测试新历史兼容入口。回执中的三项固定缺项仍待各自的实际交付与验证。

已增加 `-UpgradeReview`，只读取此次尚未知的前置条件（同时重查目标身份防止漂移），不复跑 Controller 隔离测试：

```powershell
.\scripts\system-backup-d-live-preflight-remote.ps1 -UpgradeReview -CheckOnly
.\scripts\system-backup-d-live-preflight-remote.ps1 -UpgradeReview
```

本人完成交互 SSH。输出包括 users.id 元数据、080 部分残留、维护锁计数、StorageClasses、目标节点标签/UID/污点与 MySQL PV 路径/claim 绑定，不输出凭据或业务行。模式始终保留历史来源、schema 基线和存储/账号阻断；exit=2 表示正常输出评审前置观察，不是升级许可。两端传输目录仍由既有 wrapper 清理。拿到这些观察才能将方案收敛为现场可执行变更。
