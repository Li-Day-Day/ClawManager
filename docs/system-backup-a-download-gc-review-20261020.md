# A：下载保留组 GC 与早期引用检查独立复核

【2026-10-20 r78 任务资格组件限定复核】[新任务资格评审](system-backup-a-download-gc-task-review-20261020.md)与[A 独立回执](evidence/a-download-gc-task-independent-accepted-20261020-r78.json)接收原冻结来源新增六根/117 项及原四包 5,855 项、同源补编译和六目录缺席证明。任务组件字节仍匹配；正在新增的 references 组件与三份变化中的 collector/model 文件明确排除，当前整个工作树尚未据此验证。实际锁序/计划/受限账号、完整 policy 及生产批准仍缺。下方 r73 来源和“当前匹配”描述保留当时范围，不延伸到后续新阶段。

本轮限定接收 D r73 的本地组件与模型回归，见[A 独立回执](evidence/a-download-gc-independent-accepted-20261020-r73.json)。逐项核对四完整包 716 主/5,738 含子项、GC 十二根/125 项（新增早期检查五根/52 项）、默认 vet、两次源码 postcheck、三个 tagged seed/脱离仓库 seed 各 22 项、Windows/Linux probe、Linux migration runner、进程退出 0 和准确产物缺席。未发现本增量需新增修订的来源问题；完整生产 GC 策略仍未交付，不批准角色、schema 或现场删除。

本次直接读取原始 JSONL/native 与来源清单，重新计算摘要、逐一核对 RUN/PASS、当前文件集合与字节、正式 95 文件 catalog，以及两个快照和调用者专用缓存缺席；没有重跑测试、构建或安装依赖，没有改写 D 的实现与回执。

## 来源范围

完整来源 1,437 项，SHA `8bab0c41906a653a7e243e5dbdfdd71e5f9048ef9b26bd51543997acbf9dc5dc`，与 A 已接收的 Node 组合器快照完全相同。定向 r72 来源另为 `06b5b14f3e7da1f5cc7e47316a54a20f977880fda1b9086f34c41383b1ecd750`；不把 r72 的旧 core 字节冒称 r73。当前检查时全部 1,437 输入的集合/内容匹配。

| 完整包 | 主测试 | 含子项检查 |
| --- | ---: | ---: |
| systembackupsecurity | 255 | 2,011 |
| systembackupread | 75 | 519 |
| systembackupproducer | 75 | 784 |
| systembackupevidence | 311 | 2,424 |

security 的新完整通过及本轮 postcheck 也补足了此前容量修订沿用失败整轮中单包通过记录的限制。原 r2 失败和未走到末尾 postcheck 的历史继续保留；新证据另记为 r73。

## A 核对的安全边界

- collector 先取得 L0/配置范围，再以非锁定提示选择 L1 的四个维护收据引用范围；两个审计 ID 均按升序覆盖 intent/result 两列，没有按安装或维护状态缩小。取得原组后独立比较 Operation、actor 和两条 audit 的提示值。
- 原 user 的 L2 FK 和实际 worker/原组 L3 位于早期范围之后。后续复查使用原四范围的 current locking read，guard 绑定同一事务、原提示与 principal；失败状态由值副本共享，不能复制后恢复。
- `MaintenanceReceipts=absent|installed` 必须显式给出，并与完整结构指纹及必要权限一致。正式 catalog 仍未包含候选维护收据 082；缺表、不可见或权限不足均不算空范围。
- 当前账号、当前角色、不带 FOR 的 SHOW GRANTS、排序语句 hash 和结构指纹在开始及复查时核对。拒绝 root、角色、额外数据库、GRANT OPTION、审计 UPDATE/INSERT、墓碑 DELETE 和未知写权限；实际最小 SELECT 集合仍由受审的准确 pin 限定。
- collector 保留已 deleted 的 evidence envelope，要求 locator、claim、inline 和 chunks 均为空，原始期限与保护期到达且版本晚于原收据。metadata GC 不触发 provider 删除，也不把旧用户 proof 当作当前 worker 授权。
- 墓碑覆盖完整 23 项投影，保留原公开摘要与私有组 rolling hash。每个删除前复核准确原行；所有回调结束后，再独立核对 worker/config、envelope、墓碑和原 PK/公开键/幂等键的缺失。未知提交不重试。

模型覆盖四种审计引用、提示替换、角色/权限和结构变更、危险入站 FK、迟到引用及整组回滚、失败 guard 副本、23 项墓碑漂移和唯一键复活。这些检查并未执行实际 InnoDB 的空范围/跨表死锁、触发器或真实受限账号。

## 权限推论与必须保留的门禁

MySQL 的 INFORMATION_SCHEMA 一般按对象权限过滤；“当前查询没有返回引用”本身不能证明全库引用为空。全局 REFERENCES 是否为目标受限账号提供完整跨库 FK 元数据可见性，目前仍是候选推论，必须用实际账号正负验证；本轮没有批准该全局权限。[MySQL 元数据与权限](https://dev.mysql.com/doc/refman/8.4/en/information-schema-introduction.html#information-schema-privileges)

不带 FOR 的 SHOW GRANTS 会包含 mandatory roles，因此保留当前语句形式和 exact pin；`CURRENT_ROLE=NONE` 不能单独代替完整检查。[MySQL SHOW GRANTS](https://dev.mysql.com/doc/refman/8.4/en/show-grants.html)

表/列、数据库级和静态全局权限变更的生效时间不同。真实撤权验证须分别观察旧连接、新连接、当前 grants 输出和业务语句结果，不能用一次失败查询替代整个证明。[MySQL 权限变更生效时机](https://dev.mysql.com/doc/refman/8.4/en/privilege-changes.html)

此早期组件只覆盖 direct grants、四类结构指纹和维护收据的审计引用；完整 `DownloadRetentionGCPolicy` 仍须提供当前 GC grant/revocation、受审 trigger/program 定义与 DDL freeze，以及 owner/artifact/全部逻辑与 FK 引用、hold/lease 的真实锁定与复查。没有这些来源时仍必须拒绝，不能把模型 policy、元数据 hash 或 read-only 下载 owner 适配器当成生产删除授权。

## 后续顺序

1. 已交给操作者的 SQL task owner 十一项继续等待同轮回执，旧 MFA 九项和准入/结果二十四项不重跑。
2. 准备受限 SQL 角色的实际元数据可见性、FOR UPDATE、持连接撤权及越权负例；测试应位于受守卫的隔离 MySQL，生产 GRANT 另行批准。
3. 补齐完整 GC policy、实际 owner/ref/hold、privileged schema/trigger 观察与 DDL freeze、物理容量、批次扫描/统计和 standard 墓碑后续回收。
4. 正式共享 schema/角色签收、真实材料、本人 MFA/provider、四矩阵与现场部署/E2E 继续保留。当前没有开启生产 GC 调度或路由。
