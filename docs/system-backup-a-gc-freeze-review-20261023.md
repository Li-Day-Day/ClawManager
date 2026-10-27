# A：GC freeze 私有候选增量复审

2026-10-23。仅接收[空连接器边界修复](evidence/a-gc-freeze-nil-reviewed-20261023.json)，不批准新增权限、完整 GC、真实 MySQL 或生产接线。

`driver.Connector` 可以由命名 map、slice、func、chan 实现；接口非空时，其底层值仍可能为空。原 guard 只检查指针和接口，四类空值均会到达 Connect。新增测试记录四个准确失败叶子及父测试失败，四个非空对照通过。候选将四种可空类型加入 guard，修复后包含 D 原三个候选根测试的四根/33 条事件全部通过，无失败或跳过。反向恢复单行 guard 可匹配原文件 SHA；原/新生产字节及 A 测试字节均已封存。

本轮在稳定冻结副本、离线模块和默认 vet 下验证；其余冻结输入逐项后检。仅在工作树生产文件仍匹配原摘要时写入修复。准确自有源码、缓存、构建目录已删除；未安装依赖。原失败保留。定向运行不替代完整 owner 本地门禁，新完整运行另有原始日志。

当前候选保持私有，未连接 `Collect`。单物理连接、明确事务/解锁未知结果及请求物理丢弃的状态不能当作真实服务端锁已释放。`Admit` 和事务 `work` 是可信调用接口，尚不构成实际 worker/grant/schema 权限证明或完整 metadata 策略。

A/D 仍须共同核对准确版本的 BACKUP_ADMIN/观察权限、前后准入、锁顺序、完整 metadata/freeze 协议、物理容量、失败接管和真实锁观察；本轮不为这些权限或运行事实代签。已接收角色十项及 GC 前置/连接生命周期四十二项维持原范围，无需重跑，也不能合并成完整 GC 已通过。

## 本地可先完成的装配约束

以下是 A 的装配要求和候选建议，不是实际 grants 或完整协议批准：

| 边界 | A 本轮决定 | 尚需实际证明 |
| --- | --- | --- |
| 权限 profile | 现有 Early 校验仅允许其精确权限集合，global REFERENCES 不隐含 BACKUP_ADMIN。不得直接扩大旧 profile 来套用已接收角色回执；freeze 应有单独的显式配置及精确权限复核。 | 正式账号、授权来源、BACKUP_ADMIN 与准确观察字段的范围、撤权和额外权限拒绝。 |
| 全局锁顺序 | 建议先在独占连接上完成只读 admission、获取并观察本会话 freeze，再开始唯一 RR 事务，保留原 L0/L1/L2/L3 及后续锁前缀。不可在已有事务的 Early 回调中临时插入全局锁。 | 所有参与方的完整锁顺序和 DDL/账号管理等待关系，由 A/D 联合核对；建议顺序不能单独证明无死锁。 |
| 事务所有权 | 当前 Collect 已通过 beginDownloadGCConnection 持有连接及事务；不能把已有 Collect 直接放入候选 work 回调，造成第二事务/另一连接。须先拆出接受准确同一 tx 的受保护工作阶段。 | 原 worker/引用/owner/时钟/fence/容量/nonce/tombstone/审计末次检查全部保留，同事务晚失败回滚。 |
| 元数据范围 | freeze 只提供候选保护边界，不能省略完整 schema、外部引用、临时表/会话状态或当前权限认证。Admit/work 回调不能作为现场证明。 | 完整元数据可见性、非遗漏观察、正式摘要及部署版本绑定。 |
| 结束与不确定结果 | 沿用 Transaction 与 Unlock 分开报告；未知提交不重试、不宣称回滚，未知释放停止后续批次。ErrBadConn 请求丢弃不等于服务端锁释放证据。 | 准确持有者的独立观察、取消/丢回复/连接被杀、锁消失或故障接管回执。 |
| 时限与生产装配 | 原授权 context、工作及清理预算不能续期。私有 helper 仍不接 Collect；取得共同方案和实际证据后再装配。 | 原协议十二组实际专项及完整 Collect，含等待上限、全局影响和晚失败。 |

本轮检查限仓库候选与原合同：`download_retention_gc.go`、`download_retention_gc_connection.go`、`download_retention_gc_early.go`、`download_retention_gc_freeze.go` 及 `d-gc-backup-lock-protocol-requirements-20261021.json`。没有发放 grant、连接远端或改变原 Early 白名单。
