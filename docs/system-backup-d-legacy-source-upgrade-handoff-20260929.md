# D：旧 SQL / 构建来源补查与 080 交付门槛

## 2026-09-30 Git 提交追查

后续补查已覆盖本地已有 `ldap-test-zh-fix1` 至 `fix16` 的 16 个中间镜像：在无网络、只读、非 root 容器内只对 server 二进制检索六个精确新旧文件名，均无命中；逐镜像 ID/repo digest 和 server SHA 已记录，探针容器已清理。此前已查的初始 ldap 镜像与 fix17 结论继续保留。见 [中间镜像来源回执](evidence/system-backup-d-intermediate-image-source-trace-20260930.json)。没有提取旧 SQL、修改已有镜像或访问业务库，来源缺项未解除。

本次在独立临时 bare 仓库读取上游保留的全部 136 个 PR head 历史，并核对本地全部分支/标签、非浅克隆状态和三个不可达 stash commit。旧 `045_update_workbuddy_windows_runtime.sql`、`046_add_instance_pvc_name.sql`、`047_add_instance_runtime_variant.sql` 无文件名历史命中。按去除数字编号后的后缀扩大搜索，也仅发现现行三份文件。

可确定的首次出现为 PR #199 中的 `ee7b4f61b2d58a4e21119cd4d79b4b3ea782a256`（2026-09-09 17:35:51 +08:00，`feat(team): integrate team distribution with latest upstream`），直接新增 050/052/053；主线为 `00d4d2a70b72cabd85badec71c167db415a1138f`（2026-09-10 17:01:39 +08:00）。没有找到旧编号重命名为新编号的提交。PR #177 的 `7b20d8ef` 只引入 044 Workbuddy 支持，不能作为三份旧原文来源。

详见[Git 追查回执及 136 个 ref 固定值](evidence/system-backup-d-git-source-trace-20260930.json)。这将缺口缩小到当前不可见的历史分支/其他 fork、未提交构建上下文或外部构建归档，不能认定旧文件从未存在，也不能以现行提交填入实际 history review 的来源批准。实际升级继续保持阻断。

本轮新增的是本机 Docker / BuildKit 的直接检查证据，见[机器回执](evidence/system-backup-d-build-provenance-followup-20260929.json)。旧 045/046/047 原文仍未恢复，不能生成已批准的 history-review 文件，未执行实际 080 或真实 collector 验收。此前正式报告卷准备、fresh/live D 表比较和隔离历史兼容测试的通过结论继续有效，无需重跑。

## 已收敛的构建来源

| 对象 | 本轮直接观察 | 能证明的范围 |
| --- | --- | --- |
| fix16 | BuildKit `lonxosx8cu2i6blgphjedv9ta`，2026-09-29 10:16:52 至 10:22:06 +08:00；context `.`、`Dockerfile`、revision `f9429da92c443b0b8df4c990b8281efe9521d260`；产物附件 digest 与现场固定的 `d462c2a0…12169e` 一致 | 本机构建记录绑定该 OCI index；revision 不能还原未提交文件，未声称签名供应链验证或全部 guard 源码等价 |
| fix16 正式 migrate 二进制 | SHA-256 `5596bd834caf90d57bf6cdda4faea3e82a1ac95c94703a87a99579a6485b77cc`；`--catalog-only` 输出 93 文件及 `68794bdd…51b1564`；`--help` 没有历史审查三个参数 | 该镜像不能承载当前已实现的 reviewed-history CLI。必须另交付新 runner；不能仅凭 catalog 一致复用 fix16 升级 |
| `ldap-test-zh` | 缓存 digest `ffc97737…e5b504ff`；BuildKit `qjtvz88w551sd26bmtue108su`，2026-08-20，revision `a234f9c3af5770184a03841c96c71ad44c14f450`，产物附件匹配 | 找到一个更早构建来源；其 server 未检出目标旧三条或现行同主题三条文件名，不是旧 SQL 原件 |
| `ldap-test-zh-fix17` | 缓存 digest `b3d9ebc1…750f0fd`；server SHA 与文件名检查见回执，六个目标文件名均无命中 | 仅是第二个样本，不能推广到全部镜像、构建缓存或远程归档 |

本轮只检查当前 Docker builder 的历史范围；没有读取远程 registry、拉取镜像、构建、安装依赖或连接实际数据库。三个探针均为 `--pull=never --rm --network=none --read-only --cap-drop=ALL`，无宿主卷挂载；收尾 ancestor 查询无容器残留。未生成本地二进制或测试缓存。

既有可达 Git 和不可达 tree 文件名调查仍见[此前记录](system-backup-d-formal-capacity-next-20260929.md)。本轮尝试不可达 blob 内容检查时，Node 启动 git 被 EPERM 拒绝，未完成该范围，不能登记为“全部 blob 已排除”。本地任务记录检索也没有恢复原文；转录副本不作为新增独立来源。

## 对应 owner 的具体签收项

归属依据为 `docs/system-backup-restore-schema-inventory.json`，而非按迁移编号推定。以下是待审事项，不是签收结果；未向其他人发送消息。

| 历史记录 | 对应对象 / owner | 原文恢复后必须回答 |
| --- | --- | --- |
| `045_update_workbuddy_windows_runtime.sql` | `system_image_settings` / D；涉及实例运行时需 B 交叉核对 | 与现行 050 的匹配条件、镜像更新、runtime_type/display_name 是否相同；先后执行是否改变既有 Workbuddy 行；不得以表结构相同签收数据语义 |
| `046_add_instance_pvc_name.sql` | `instances` / B | 与现行 052 的列类型、可空性、位置、已有列处理是否一致；PVC 绑定与存量实例兼容性是否可接受 |
| `047_add_instance_runtime_variant.sql` | `instances` / B | 与现行 053 的默认值及 Linux/Windows 分类条件、更新顺序是否一致；已有非空 variant 是否可能被覆盖，错误分类有无后果 |

D 继续负责原文字节 SHA-256、构建上下文/commit/镜像绑定、应用到当前 DB UUID 的历史证据，以及升级门禁聚合。D 对自己负责的对象也不能在原文缺失时提前签收。原 owner 若不在当前分工中，须补原业务负责人的可追溯结论；不得填写虚构姓名或以 D 汇总替代 B 签收。

需补交的最小证据包：三个**原文件名、原字节**的 SQL；能包含这些字节的历史构建上下文或提取记录及其摘要；历史镜像/部署或恢复记录与本库 ledger 的联系；逐文件审查者、结论和记录引用。二进制中出现同名字符串只提供查找线索，不证明内容或实际应用。用 050/052/053 改名、使用规范化摘要替代原字节摘要、凭当前 schema 反推旧 SQL，均不能填补这个缺口。

## 正式升级交付顺序

1. 恢复来源证据并取得上述 owner 结论。所有缺项保持 pending；现有 review plan 的 `executable=false` 不变。
2. 交付含 `--history-review-file`、`--expected-history-review-sha256`、`--historical-sql-dir` 的独立 runner。固定其二进制 SHA、镜像 digest、源码上下文摘要及 CLI/catalog 回执；不能复用当前 fix16 migrate。隔离探针 PASS 不等于新部署 CLI 已验收。
3. 依据[正式输入格式](system-backup-d-reviewed-history-20260929.md)生成运维审查文件：固定 UUID、库名、catalog、完整 95 条 expected_applied、三个原文字节摘要和来源引用；pending 仅 080。记录审查 JSON 的原始字节 SHA。本文和 review plan 都不能作为该输入文件。
4. 准备迁移专用 DSN Secret、可恢复检查点及窗口。由正式 runner 在同一迁移锁连接上复核身份、完整 ledger 和 capture gate；部署前另核对四表无部分残留及 users FK 条件。不得用 raw mysql、修改 ledger 或重启 core 绕过入口。
5. 补 080 后核对 96 条 ledger、原 95 条 id/filename/applied_at 保留、080 只登记一次、四表完整字段/索引/FK。若发生部分 DDL，保留目标/catalog 并核对现存结构后决定恢复，不能盲重试。
6. 才进入[真实 collector 后续入口](system-backup-d-formal-capacity-next-20260929.md)：完整表名单检查通过后建立逐表 SELECT 专用账号和 immutable Secret，沿用已准备的正式 PVC，填充候选并验收连续更新、停写超过 5 秒拒绝及跨节点真实 HTTP/bootstrap 消费。权限探针不算 collector 验收，迁移 PASS 不算配置激活。

当前阻断明确为：旧原文/实际应用构建绑定、owner 语义签收、含历史兼容参数的新 runner 部署证据及现场迁移交付条件。D 表比较结果不覆盖业务数据语义；Longhorn 两项 False 条件也不因本轮来源调查而关闭。
