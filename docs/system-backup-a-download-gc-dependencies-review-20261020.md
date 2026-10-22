# A：GC sibling / prune 依赖独立复核

[独立回执](evidence/a-download-gc-dependencies-independent-accepted-20261020.json)接收 D r4 冻结来源内的具体任务资格、依赖模型和 collector 组合。它与 A 已独立执行的 INT 审计列 r4 来源逐路径、大小、字节和有序摘要相同：1,446 输入，SHA `04c9f4e42ba2df4bef2192eed1e70b84d66fd5a64cc8d21723199176d1e939df`。这次只复核原始事件和代码，没有重跑 Go、构建、安装依赖、执行 SQL 或远端动作，也没有修改或删除 D 的目录。

## 原始证据与计数

独立读取 D 原始 JSONL，而非仅接受 D 汇总：四完整包 737 主/6,114 含子项，全部唯一 RUN/PASS 配对，无 fail/build-fail/skip，四包各自终结 PASS。任务组件为 14 主/303 含子项。D evidence 的准确测试名称集合与 A 同源独立执行的 332 主/2,800 项完全相同；该对照不把 A 单包扩大为 A 独立运行过四包。

| 八个新增测试根（省略 TestDownloadRetentionGCTask 前缀） | 含根检查数 |
| --- | ---: |
| OtherArtifactDependents | 121 |
| DependencyKeysAndOwnExclusion | 6 |
| DependentDrillInventory | 11 |
| DependentBounds | 4 |
| DependentRetryPromotionAndLeases | 17 |
| PruneDependencyAndRequiredTable | 4 |
| LateArtifactDependenciesPoisonCopies | 6 |
| CollectorLateArtifactDependenciesRollback | 13 |
| 新八根小计 | 182 |

原六根由 117 增至 121：SQLFailuresAndConfiguration 从 15 增至 19。故净增为 182+4=186，总量 117+186=303。已修正 D 交付文档中容易把“八根/186”理解为八根自身计数的表述；原始测试和机器回执未改写。

同时核对默认 vet、串行 GOMAXPROCS=1/-p=1、普通及最终 postcheck、整体 exit 0、三个 tagged seed/22 及脱离二进制同名 22 项、Windows/Linux probe 和 Linux migration runner 的成功/摘要标记。六个准确 D 自有目录在本次读取时均不存在。本地编译产物的历史摘要不等于仍保留二进制，文件已按要求清理。

r1 原十三项失败保留，r4 相同名称全部通过。先前检查错误读取 query recorder，当前测试明确从 `f.d.writes` 查目标写入；不能将原失败记作成功。

## 代码与断言覆盖

- 四种 owner × 三种 sibling × 十种状态，120 个叶子逐名核对。过期、终态、清理收敛的 sibling 可以保留；活动任务、未来原期限/完成时间、reconcile、活动 claim、其他安装或矛盾来源均拒绝。新 sibling 可以晚于原下载准入创建，但必须满足自己的原始期限与完整事实。
- 三个完整来源查询仅以 source_public_id 选行，不用安装、来源类型、状态或期限过滤矛盾引用。自身排除同时比较任务类型和准确主键，其他表相同数字主键仍受保护。其他任务总数和 drill inventory 总量另受 10,000 上限约束。
- 原 child 必须出现在自己的来源范围。Recheck 先比较 sibling 集合和全部原事实，再选择它们的资源/holder 范围；不能借新 sibling 选择新的资源前缀。对仍符合条件但版本改变、后来出现的 settled 资源也拒绝。
- retry、promotion 和任何保留的 prune item 仍阻断；不把终态标志当作引用消失。其他 drill 的 cleanup/inventory、每个 holder 的 lease 范围与原 backup source lease 按准确行比较，缺失、外源、活动 lease 拒绝。
- 失败 guard 的共享状态不能由值拷贝恢复。测试在还原全部原事实后再次使用拷贝，要求拒绝且不新增查询，避免残留引用遮蔽该断言。
- 四类晚到引用 × 墓碑 INSERT/结果 DELETE/Operation DELETE 共十二个叶子执行真实 collector 和具体 task guard。断言核对实际写入确已发生、事务未提交、rollback 增一、原四类行和两份审计原文逐字节恢复、容量复原、无墓碑及依赖模型恢复。

上述是脚本化 SQL transport 的事务组合证据，不是多连接 InnoDB 幻读、空范围等待或真实触发器并发证据。

## 索引与实际锁范围仍待证明

[八类准确 SQL 和参数清单](evidence/a-download-gc-query-plan-20261020.json)逐条保留当前投影、谓词、排序、LIMIT 与 FOR UPDATE；未执行。静态复核发现以下声明索引的前导列与谓词不完整匹配：

| 范围 | 查询谓词 | 正式迁移中相关索引的前导列 |
| --- | --- | --- |
| drill / preflight / artifact_verify（三类） | source_public_id | 067：source_artifact_type, source_public_id |
| lease state | source_artifact_type, source_public_id | 068：origin_installation_id, source_artifact_type, source_public_id |
| holder lease | holder_type, holder_public_id | 068：origin_installation_id, source_artifact_type, source_public_id, holder_type, holder_public_id |
| staging inventory | backup_public_id | 073：origin_installation_id, backup_public_id, created_at, id |
| restore inventory | drill_public_id | 077：origin_installation_id, drill_public_id, created_at, id |
| prune incoming | artifact_public_id | 070：origin_installation_id, artifact_public_id, status |

这不是八类查询已被证明全表扫描的结论。当前计划、自动生成的 FK 索引、数据分布和实际锁必须现场核对；源码里的 LIMIT 不能证明扫描和锁量有界。InnoDB 的锁与实际扫描索引记录有关，组合索引的普通查找也受前导列影响，参见 [MySQL 锁范围](https://dev.mysql.com/doc/refman/8.4/en/innodb-locks-set.html)与[组合索引](https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html)。

下一轮应在隔离夹具内采集准确 EXPLAIN FORMAT=JSON、SHOW CREATE TABLE/SHOW INDEX、空/非空/接近和超过上限/大量不相关行的数据集，以及锁持有者、等待者、释放后的结果。只看 sleep/超时不算锁证据；使用独立观察连接采集 [data_lock_waits](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-data-lock-waits-table.html) 并关联准确连接和事务。需覆盖同目标插入/更新、无关目标写入及所有实际写入者的顺序，不以一个“没有死锁”的小样本批准全局顺序。

查询不能为了命中已有索引加安装/状态过滤、隐藏矛盾来源。若现场确认需增加索引，候选设计须覆盖上述完整谓词并经正式共享 schema 评审；本轮没有执行 DDL、添加 migration 或批准索引方案。部署前还需验证原 worker 期限与容量预算下的耗时，不能用延长期限掩盖扫描问题。

## 当前工作树边界及后续

本次观察中，task、dependency 测试、collector/model 和全部正式迁移仍与接收来源一致。三个验证脚本随后变化，并新增 D GC task MySQL 测试、派发测试及 phase 脚本；准确列表记录在回执 `current_drift`。这些新输入和后续变化不受原四包回执覆盖，不能称当前整个工作树通过。当前枚举是父 PowerShell 提供的采样，不是新构建快照；独立脚本显式拒绝声称整个工作树已验收。

独立工具首次尝试由 Node 启动 rg 时被环境以 EPERM 拒绝，未生成接收回执；已改为父 PowerShell 的既有 Get-DIndexSourceFiles 只读枚举。一次校验按文档预设八根/186 停止后，依据原事件确认并修正为八根/182 加旧根四项，未删减测试或放宽生产规则。

完整 policy 仍需其余 evidence/逻辑/FK、catalog/import、system producer 原始绑定、完整当前 worker 授权/撤权、trigger/program 观察、DDL freeze 与物理容量。实际 owner 十一项、受限角色十项的顺序保持；D 正在新增的 GC task 实际 SQL 专项需其自己的新准备回执，不能用本轮代替。详见[下一轮证据清单](system-backup-a-download-next-evidence-20261020.md)。生产 GC、正式 schema 与角色均未批准。

复核命令（既有工具，无安装）：

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
node .\docs\evidence\a-download-gc-dependencies-independent-review-20261020.mjs --check
```

该命令重查原始事件/摘要和当前已枚举路径的字节，保留历史 drift 观察并输出当前差异；不会覆盖接收回执、启动 Go 或执行 SQL。后续若枚举集合有变化，须用既有 Get-DIndexSourceFiles 另存新清单后作新轮复核，不能把旧清单作为实时全集。
