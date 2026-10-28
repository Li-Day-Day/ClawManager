# D：完整 GC 生命周期候选的准确交接

2026-10-27 17:01 当前版本为 **D r5／A r4**，原始 `dc79d81f...` / 1,720 → operator `f3ed3894...` / 1,721；A r4 检查器再次重放退出 0。16:31 的同 binary source GC3＋真正空 cwd GC3 已实际通过并清理。正式 `ReviewedSourcePath`、准确证明和重试命令见 [本次修复交接](system-backup-d-gc-detached-seed-fix-20261027.md)。实际 GC15 SQL 仍为零；Root 推广任何普通源码后必须新候选和 A 新复审。下文所有旧版本描述为历史，不可借用为当前批准。

当前版本为 D r4／A r3：A 已正式接收 [6bf973bd 原始／46bcb275 operator 来源](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json)，D-GC 的只读 replayer `--check` 已退出 0，五个 capture 字段与当前候选匹配。旧 r1／r2／r3 候选及其漂移拒绝记录保留；未来获原远测权限时须用当前准确 A 文件作为 `ReviewedSourcePath`，不能用 candidate 或旧 review。未启动 operator／Go／SSH，SQL0、PromQL0、productionfalse；详见 [当前完整交接](system-backup-d-gc-operator-source-preparation-20261027.md)。下列旧来源段落仅为历史。

最新正式源码复审：A 已创建 [准确 4003／44a3 operator source review](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r1.json)，D-GC 已读回并运行其 replayer `--check`，退出 0，五个 capture 字段与 D 候选 r2 完全匹配。它只接收这份源码，不调度 Go／SSH、不接收实际 SQL；Root 当前独占窗口期间不启动 operator。metrics 八文件若随后落 live，必须另出候选和新 A review，不能复用这份历史来源批准。详见 [当前完整记录](system-backup-d-gc-operator-source-preparation-20261027.md)。

最新本地验证：Root `2d061...` 十五阶段已终态，三根 GC seed 和当前 Linux tagged evidence 编译通过，源码后检和清理完成；D-GC 已重放 [D1 独立 native 复核](evidence/d1-current-fifteen-stage-reviewed-20261027-2d061.json) 的 `--check`，退出 0。准确来源仍为 1,718 / `4003...`，Linux evidence 仅编译阶段使用 `-vet=off`，未执行 SQL。完整 operator source／harness 已获得上条 A 复审，执行仍受窗口协调和来源不变约束；下列“尚待补验”段落属于各阶段历史，不能覆盖这些准确新结果。

当前 operator 材料为 [20261027-r2](system-backup-d-gc-operator-source-preparation-20261027.md)，准确绑定 c057 helper 修复和 bf76 live parser，并仅移除会触发互斥 guard 的冗余 Proof 参数；包含 1,719 份 operator 输入及独立渲染 harness。候选生成时的 `source_only_native_and_global_review_pending` 状态保持原字节，后续 native 和正式 A 复审见以上准确回执，不回写已固定 hash 的旧材料。旧 20261026 r3 和 20261027 r1 仅保留历史。r2 准备本身未运行 Go／native 测试／SSH，A 的安全 AST 前缀检查已通过；实际 operator 尚未启动。

## 2026-10-27：修复真实 tagged 编译冲突

A2 的 `9c2f727f86c548a38792cebd423489e7` 真实执行在 tagged seed 编译阶段失败：本文件新增的 `dGCLifecyclePool` 和 `dGCLifecycleReleased` 与历史 owner lifecycle 测试重名。该轮整体失败保留，不能用已通过的普通包结果冒充 tagged／Linux 通过。

D 只在新增 `download_gc_full_lifecycle_mysql_test.go` 中把两个 helper 分别改为 `dGCFullLifecyclePool` 和 `dGCFullLifecycleReleased`，定义和调用共 14 个标识符；旧 owner 文件、cold 文件、SQL、断言与用例集合均未改。新 SHA 为 `c05714705f0e489f13004095ca9648f90edd5e2786fed1b182400083913f3e55`，32,957 字节。精确逆变换恢复原 `cac6c2bc...` / 32,901 字节，当前包文本声明扫描未发现新文件的顶层函数名冲突。这些检查不是编译通过。

[窄修 source-ready](evidence/d-gc-full-lifecycle-helper-rename-source-ready-20261027-r1.json) SHA 为 `1fe287e6d71980583ae2ee44a68416f241b28b73a97cfd46083da35267ab476b`；运行 `node docs/evidence/d-gc-full-lifecycle-helper-rename-20261027.mjs` 可只读重放证明。旧 A 组件回执和 r3 请求保留为修复前来源；需要 A 对新 after-pin 再复审。已把准确新旧 pin、失败证据和后续 seed／Linux 要求交给 A1、A2、Root、D1 和 Bootstrap D。

A 随后已实际创建 [r2 组件回执](evidence/a-gc-tagged-component-reviewed-20261027-r2.json)，SHA `48be9d08eaed5bfe348b0c58551acd0da6654dc54a03648e0af76d0840b7a6b0`。D 已读回并运行 `node docs/evidence/a-gc-tagged-component-rename-review-20261027.mjs --check`，退出 0，life after-pin 与当前 `c057...` 相同。该回执仅复核组件范围，`ordinary_scope_review_complete=false`、`native_accepted=false`；它不把 9c2f 改为成功，也不放行当前全树或真实 SQL。

Bootstrap D 的 d846/session27089 只验证原 ae7 / 1,741 来源，不含新增 GC 文件；现已终态 `passed_exact_linux_supplement`，四项 Linux 编译退出 0，pre／postcheck 和准确清理均成功。[准确回执](evidence/d-bootstrap-entry-linux-d846e3793f0242cd96da1912a39c49de.json) SHA 为 `8394b5383e885585368c930898a91acca58b71afe596202295e305ea73fd160a`；[独立读回](evidence/d-bootstrap-entry-linux-reviewed-d846e3793f0242cd96da1912a39c49de.json) 确认 owner 缺席。D-GC 已读回核对并通知 A1、A2 和 Root。它不追认原 ae7 的最终后检，不把原轮改为成功，也不代表新 GC 编译通过。

D-GC 未热改该冻结副本、未启动新 Go。后续准确补证窗口由 A2 优先与 Root 协调，要求当前 c057 来源的新 tagged 编译、原 OriginalMaterials seed、三根 GC seed 与 Linux evidence，随后后检和准确清理。

以下为 2026-10-26 的历史组件准备记录，表内 `cac6...` 字节已由上述纯重命名修复替代。

当前仍是准备材料，实际 MySQL 执行数为零。新根为 `TestDDownloadGCFullLifecycleMySQL`，有 15 个独立子用例；本地无 SQL seed 为 `TestDDownloadGCFullLifecycleMySQLSeed`。旧 42 项、Full profile 33 项及冷组 7 项保留各自来源和作用，不计入新 15 项。

A 已创建并逐项读取确认 [准确两组件复审](evidence/a-gc-tagged-component-reviewed-20261026-r1.json)，状态为 `reviewed_exact_two_tagged_test_components_only_global_source_NOT_ready`，其中 life pin 为下表修正后的 `cac6c2bc...`。它只复核两份 tagged 测试的内容范围，实际 Go／SQL 仍未执行；全树存在并行 API 等普通代码变化，不能据此豁免 Root 的普通来源匹配、父完整回归／后检／清理和必要普通增量验收。先前“回执已创建”通知曾因 guard 失败撤回；本段只记录此后实际存在并读回的新文件。

## 精确 tagged 增量

| 文件 | 原字节 | 新字节 |
| --- | --- | --- |
| `backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go` | SHA `d1b0c295339e9e6e61fec08dddf7336cb499a82b9645ff250bab8ca7c9d6818f`，23,008 字节 | SHA `e9806c4892ac770ae2f3cf97e9bcb6ba2f123d125b6d5a00d9533e055d9bdf09`，23,173 字节 |
| `backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go` | 不存在 | SHA `cac6c2bc0be61f48d28835828b26f17d92fe9f97deeea4dea3a87c7b5354a7e2`，32,901 字节 |

cold fixture 的唯一语义变更是 schema pin 排除外层易变自增分配计数。解析器保留列、约束、索引及带引号 COMMENT 原字节；重复、非正整数、未闭合字符串、未审的外层注释／版本注释／嵌套尾部格式全部拒绝。该行为只存在于 tagged 合成域策略，生产 metadata 算法未改。

15 项包括删除后 kill、Begin 前 holder 退出和取消、自然租约到期后换 fence 接管、两个公开 holder、保留其他 holder、成功或回滚后的新物理会话、受污染共享池、同库外部临时表 shadow、错误时区、准确有界 lock wait、公开 owner 持锁期间 DDL pending、512 无关操作行下的批次和 EXPLAIN、超大 VIEW 定义拒绝。

静态再审修正了 TEMP 拒绝码的初始误断言：MySQL 8.4 的 CREATE TEMPORARY TABLE 使用数据库级 CREATE_TMP_ACL，经 check_access 返回 1044 ER_DBACCESS_DENIED_ERROR，并不进入表级 check_grant 的 1142 分支。新源码准确要求 1044，不接受任意错误，不增加权限。依据为 [MySQL 官方 8.4 授权源码](https://github.com/mysql/mysql-server/blob/8.4/sql/auth/sql_authorization.cc) 与 [官方错误码](https://dev.mysql.com/doc/mysql-errors/8.4/en/server-error-reference.html)。旧 `4fede77d` 和 r2 请求保留为修正前准备，不能作为新的可编译输入审批。

接管保持原 operation deadline。所有容量报告在各自新调用之前采样，原五秒上界不变。DDL 可得到 `committed` 或 `denied_atomic`，两种均须验证原 holder 释放和后续 DDL 效果。执行计划完整记录是否实际使用索引，即使 `range_indexed=false` 也不能推导为生产规模认可。候选权限和物理报告始终是明确合成事实，不增加 worker TEMP 或 DDL 权限。

## 独立验证材料

`docs/evidence/d-gc-full-lifecycle-*` 提供 requirements、phase、源码适配器、operator、结果接收器和纯解析测试。它们不编辑中央 scripts，不修改任何已有冻结副本。

源码适配器先计算一份候选 inventory，只在创建新的 run-owned source 时替换准确的七处 harness selector／scope，并注入新 phase。每处替换要求原字面恰好出现一次。原始 inventory、变更后 inventory 和独立 harness pins 均进入材料；任何变化都需要新的准确复核。后续 capture 要求 A 的 `d_gc_full_lifecycle_source_review.v1`、`reviewer=A`、`status=accepted_exact_lifecycle_candidate_inputs`，并核对完整 `files`、`source_sha256`、`original_files`、`original_source_sha256`、`origin_harness_pins`，不接受只审批文件名。用于结果接收的该 review 还需准确 `capsule_sha256`。

运行准备脚本不会自动获得远端执行授权。目前未执行 operator。实际执行前须完成入口终态、单一 Go 窗口交接、当前普通代码 gate 和精确 tagged delta 复审。Root 已协调统一 GC 三个 seed 和 Linux evidence 窄补，D-GC 不自行启动第二组 Go。普通代码如有新修正，其必要验证单列，不能套用旧完整包结果。

本轮纯本地解析验证：receiver 23 项全过，source selector 11 项全过，PowerShell AST dispatch 全过，Bash `-n` 退出 0。首次 selector 测试误把实际清理变量 `$resolved` 断言成 `$evidenceScratch`；修正断言后 r2 通过，原失败日志保留。以上均未调用 Go／MySQL／SSH，无构建产物产生。

修正前 [r2 复审请求](evidence/d-gc-full-lifecycle-review-request-20261026-r2.json) SHA 为 `9d47398f4a6a75a676831eb28cfc324de90f126365a3f442a0ced1944e551b77`，保留但不再用于当前字节审批。新 r3 复核命令为：

```powershell
node docs/evidence/d-gc-full-lifecycle-review-request-20261026.mjs `
  --source docs/evidence/d-gc-full-lifecycle-source-candidate-20261026-r3.json `
  --check docs/evidence/d-gc-full-lifecycle-review-request-20261026-r3.json
```

r2 候选 inventory 为 `db79d5085650ac0873cd10482178089ea8727700349a91bc30c19c234bbad2be` / 1,705。它包含当时并行新增的其他 scripts，只是未接收候选，不能代表当前整树已通过或未来可直接执行。

## 未完成边界

真实 catalog imports／records／scan states 的正式 schema、生命周期与原 authority 仍见 [材料清单](evidence/d-gc-catalog-authority-materials-request-20261026.json)。事实齐备后，真实 Policy 适配器仍由 D 完成接线和验证。33／7／15 的真实 SQL、全部十二组现场接收、真实物理容量和生产启用均未批准；这些边界不免除当前可完成的本地准备。
