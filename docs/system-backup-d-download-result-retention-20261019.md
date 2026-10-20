# D 下载结果审计保留关联

【实际 SQL 后续接收】[D 二十四项独立回执](evidence/d-download-admission-actual-accepted-20261019.json)已按 F8 原冻结接收准入十三项与结果/持久组十一项；包含实际 FK、失败回滚、重复结果及冷重建检查，全部 pin/95 文件/24 子库/原 UID/清理/退出 0 齐全。当前生产及 probe 匹配，普通测试的三处异常返回由 r52 另行验证；不再将该原专项列为待跑。真实 owner/ref、物理容量/身份/权限、完整组 GC/墓碑及生产接线仍未完成。

【r52 持久读取后续】[原组重建/十九 nonce/严格 audit/摘要](system-backup-d-download-retention-group-20261019.md)已接结果事务首次和最终复查，四完整包 693/5,532、新七根/109、seed/脱离 checkout 各 12、Windows/Linux probe/runner 与当前 1,402 来源零漂移、六目录清理通过。MFA 九项实际 SQL 已由 D 独立接收；结果 root 增为十一项，当前完整准入共十三加十一项，需自身实际 SQL 回执。下文 r47 八项与 1,397 来源保持原冻结范围，不能替代新组读取、完整 GC/墓碑或生产验收。

【r47 冻结范围接收】[独立复核](evidence/d-download-result-retention-packages-20261019-r47-review.json)重算五个完整包 **692 主/5,435 含子项**，新增四根/36 项，默认 vet、无失败/跳过、Go/native/包装退出 0；当前 server 同轮通过。tagged 两根 seed 共 12 项及脱离 checkout 的同 12 项通过，Windows/Linux 探针和 Linux migration runner 构建、冻结 postcheck 均通过。[清理回执](evidence/d-download-result-retention-cleanup-20261019.json)确认本轮两个源码快照和一个缓存目录均已删除，内含测试临时目录及三份二进制全部随 owner 清理；未安装依赖或连接远端。

冻结输入 1,397 项，SHA `bfabe2cf58b2c2011187be91c4893a806a1730591e226abf06e02fd6e3976f1a`。最终复核刻意以 exit 1 提示三个并发脚本差异：A 修改 `system-backup-fresh-migration-smoke.sh`，新增 `system-backup-mysql-startup.test.mjs` 和 `system-backup-mysql-startup-diagnostic.ps1`。原 Go/SQL/胶囊 pin 仍匹配，完整输入集不能称当前零漂移；这三项启动诊断不由本轮旧冻结结果背书，后续远测须使用新冻结输入单独验收。首个复核 helper 因 Node `spawnSync rg EPERM` 未能枚举，改用终端现成 rg 生成完整清单后完成复核；未替换或放宽源码/测试检查。

承接 [r45 owner/公开下载清理](system-backup-d-download-producer-owner-20261019.md)。r45 独立结果事务已经将原 Operation、准入 receipt、nonce、intent 和 claim 关联到结果审计正文，但只有 intent 被准入 receipt 的 FK 保护；新结果审计仍可能被通用 audit GC 提前删除。本轮补单独、不可变的结果关联行，不修改原准入组。

## 同一结果事务

`SQLDownloadResults.Finish` 在 L0/L1 当前配置和 L2 原 actor FK 目标之后，复查原 Operation/准入 receipt，在 L3 锁住准确 operation_id 的结果唯一键。已有结果行即拒绝，不回放；随后取得原 owner/ref、nonce、物理容量 reservation 和 intent 前缀。

实际 audit INSERT 后使用其真实 ID，严格回读原 actor/action/正文/时间，再写 `system_backup_download_result_receipts` 并回读全部十一投影。关联包含原安装、Operation 的数据库/公开 ID、evidence 的数据库/公开 ID、intent/result audit ID、准确结果 canonical 字节数/SHA-256、原微秒 result_at 和原 retain_until。结果 audit 的旧 TIMESTAMP 秒精度保持独立核对，不能把关联中的原微秒时间截为秒。

准确 claim CAS 后，最终复查原配置/准入组/nonce/intent、结果 audit 和全部结果关联，再确认原 reservation/retention 期限，唯一提交。缺表、缺权限、重复、写入行数/投影/最终回读漂移均回滚整个结果、claim 释放和容量记账。撤权/取消/原下载期限已过不阻止记录已发生事实；未知提交不重试。

## 候选 DDL 和引用目录

[原 D 候选 SQL](system-backup-d-download-admission-schema-proposal-20261019.sql)追加结果表及准入组复合唯一键。结果表以 operation_id 为主键、result_audit_id 唯一；复合 FK 同时绑定原安装/Operation/evidence/intent/retain_until，另一个 FK RESTRICT 指向真实 result audit。没有自动 CASCADE，也没有修改正式编号 migration 或批准。

四任务/producer 的封闭 evidence 引用目录增加结果表的数值 evidence_id 和公开 evidence_public_id，在 L3 按真实 operation_id 主键锁定有界引用/空区间。独立从已发布 DDL 和候选提取的引用列从 23 增为 25；缺任一新列/权限仍在 chunk 读取前拒绝。不能将 r45 的旧 23 列范围当作本轮验收。

部署须测量结果 audit、关联行、全部索引和 FK 工作的真实物理预算。结果账号对新表仅 INSERT/SELECT，不获得 UPDATE/DELETE，也不修改原 Operation/准入 receipt/nonce/intent；实际有效角色和数据库级授权仍待评审。分组 GC 还须使用共同锁序、原保留期限及后来延长的 hold/ref，按组删除；本轮外键保护不是已完成的保留组 GC 实现。已有未关联历史审计不自动回填或推断归属。

## 验证与实际 SQL 接点

r46 [定向原始日志](evidence/d-download-result-retention-focused-20261019-r46.jsonl)与 [native 终态](evidence/d-download-result-retention-focused-20261019-r46-native.txt)通过 **29 主/190 含子项**，其中本轮新增四根/36 项，无失败/跳过、默认 vet、冻结 postcheck 和 exit 0；源码快照已自动清理，缓存仅在本轮完整验证间共享，结束时删除。该轮 1,396 来源 SHA `e206068031cf43b3cd2b30f4239e129a6ed1eed3107024bd57c38966a1422a58`，尚不包含随后新增的 tagged SQL 根与派发/包装增量。r47 最终逐包为 security 253/1,985、evidence 283/2,135、read 75/519、producer 75/784、server 6/12；同轮 seed/构建/冻结复查和清理见页首。没有安装依赖或连接远端。

普通测试新增四根，覆盖准确原组/锁序、十一投影首次和最终回读故障、整事务回滚/不可重试、DDL FK 图与缺新元数据提前拒绝。既有结果失败和未知提交也检查新关联行随事务回滚或随未知提交保留。

新增 `TestDDownloadResultRetentionMySQL` 八叶子：`result_audit_delete_restrict`、`admission_delete_restrict`、`parent_retention_update_restrict`、`retention_group_fk`、`intent_group_fk`、`installation_group_fk`、`link_insert_rollback`、`duplicate_result_rejected`。需要实际 InnoDB 分别证明 1451/1452/1062、失败关联导致零结果及不释放原 claim；编译/seed/模型均不替代这些结论。

既有完整准入十三项的 `requireRows` 同时核对结果关联行数。派发入口仍是 `-ConfigDownloadAdmissionOnly`，阶段只选原十三项根和新增八项根；MFA 九项仍独立，不重复已接收的旧 nonce/审计/config-proof 专项。两种 PowerShell 的派发检查已通过；Git Bash 首次沙箱信号管道受限，随后受审的纯 `bash -n` exit 0，没有执行 shell 阶段或 SQL。

MFA/Admission 共享的本地嵌入候选胶囊已按生成器刷新，ownership SHA 为 `dc0687839ce07646688b7a53d3c7ddda20ea5b269999d499a0730e2d2e0f50a9`；正式 95 文件 catalog 和 canonical 候选 pin 未变。旧冻结回执保持原字节和范围，不因本轮新 pin 扩大；实际远测须使用本轮新源码/胶囊/binary pin 和二十一个子库/root、原 namespace UID、完整清理/postcheck/退出码。实际 SQL 尚未执行。

## 下一步仍需的输入

其余 owner 仍需要原生产/登记事务持久提供证据级绑定；staging/restore resource/promotion 的既有行、prune 的 confirmation/candidate 期限和 external action 的 dispatch_deadline 均不足以替代。catalog scan/record/import 还缺正式 C schema。不能从现在的 `now+TTL` 或 parent task deadline 补写历史事实。

正式迁移/grants、保留组 GC、实际物理容量/运行身份/持久故障 sink、完整 owner 的实际 InnoDB、生产 main、B→A→D 恢复、历史升级激活及[原六项](system-backup-d-six-scope-readiness-20261015.md)继续未完成。
