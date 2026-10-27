# D 对 A 081/082 候选评审的接收与正式化边界

[D 独立核对](evidence/system-backup-d-a-migration-review-20261016-r41.json)验证 [A 的评审](system-backup-a-download-and-migrations-review-20261016.md)所固定的 11 份来源大小及原始 SHA，以及当前完整 95 文件 catalog。接收 A 对 nullable canonical 列和维护收据候选的边界说明；未将敏感下载的新 operation 建议混入这两份迁移，也未采用 config_update 代替维护收据。

## D 记录的对象决议候选

- `system_backup_configs.canonical_config_json` 继承现有 D 所有、confidential、metadata_only/reference_only；只追加可空列，不更新旧 066，不反向生成旧原文，不回填 NULL，不复制 source 安装的配置进入 target。
- `system_backup_config_maintenance_receipts` 提议 D 所有、confidential、metadata_only/reference_only，依赖 config 与 audit_logs。正常业务 dump/restore 不带入它的行，源收据不能给新安装授权或使目标 key 重新开放。保留 installation 生命周期的唯一 key、准确脱敏原响应和两个实际审计锚点，当前不提供自动 DELETE/GC；候选交叉评审为 A，未登记批准。
- `system_backup_control_health` 提议 D 所有、internal、metadata_only/reference_only，依赖 installation/config。writer epoch/sequence 和观察属于目标本地活跃状态，不能从备份恢复并重新计时；源 healthy 不能成为目标 healthy。新 writer 必须重新通过可信 leader admission，初态 unknown；候选交叉评审为 A，未登记批准。

这些意见另存为候选，没有将尚未迁移的表添加到正式 inventory 或把 registry approved 改为真。原正式对象与批准状态保持其实际记录。

## 需要纠正的 B/C 依赖判断

当前 `schema-registry-decisions.json` 中，既有 `system_backup_configs` 明确要求 **A、B、C** 交叉评审，当前批准列表为空。因此 A/D 可以独立完成候选代码、追加 SQL、精确输入和隔离测试准备，但“正式 config schema 晋升已经不依赖 B/C”并不成立。完整共享 catalog/schema 的批准继续保留该依赖，不以新增叶子对象只需 A 的提议绕过现有规则。

## 正式迁移前尚缺的证据

081/082 仍为 docs 提案。仓库当前编号未占用不证明实际安装 ledger 无冲突；真实旧 SQL/ledger 和受审安装身份尚缺，不能只根据文件名分配后宣称升级路径完成。当前旧真实 SQL 回执对应 94 文件加私有候选，不能改 pin 后当作 95 文件正式路径。

082 的 FK RESTRICT 证明候选会拒绝删除引用的 config/audit 锚点，但不证明 audit 正文不可 UPDATE。代码检索未找到可据以关闭这项要求的生产 audit DELETE/保留装配；这也不能证明外部 GC 或运维 SQL 不会处理它。需要实际账号无 receipt/audit UPDATE/DELETE、外部 GC/保留规则、容量及未知提交观察证据。payload 长度、INFORMATION_SCHEMA 的估计分配或合成 reservation 均不替代物理并发预留和完整保留。

取得受审正式文件与目标输入后，分别验证全新重放和真实历史升级、原 066 字节及旧 ledger 保留、NULL 旧行继续拒绝、真实 FK/CHECK/并发/回滚与逐版本来源。写入授权和旧原文不足时仍不执行回填。此记录没有安装 schema、执行远端命令或批准生产。
