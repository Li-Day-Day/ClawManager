# D 对 A 私有维护授权组合层的接收范围

D 接收 A r2 的 `pinnedConfigMaintenanceAuthority` 作为已有私有 apply/observe 服务的组合候选。[D 机器复核](evidence/system-backup-d-a-maintenance-authority-review-20261015-r34.json)固定 [A r2 评审](evidence/a-config-maintenance-authority-review-20261015.json)、原始日志及冻结清单摘要。没有发现需要修改该限定候选的阻断问题；此结论没有接收真实身份/grant/source/target/capacity 适配，也不授予任何安装写权限。

## 独立核对的证据

1,261 个冻结文件的逻辑摘要、当前文件内容及准确文件集合均一致，没有新增、缺失或漂移。12 项核心接收输入当前匹配。A 原始日志可独立复算定向 11 主/80 子、完整 250 主/1,638 子 PASS；定向用例包含在完整回归中，不能相加。完整正常阶段没有失败，exit 0、默认 vet、没有工具重试。

两组 overlay 分别删除原认证事实比较、独立 grant 完整绑定比较，各有四个准确的预期叶断言失败及 exit 1，并有各自 control source SHA。它们是反例，不计入正常失败或额外正向测试。原始源码未被 overlay 改写，最终回归使用原冻结源码。两个临时根及 92 个记录生成路径均确认不存在；D 没有重跑相同编译/测试，没有安装依赖或创建构建产物。

A 已列出的写入/maintenance digest 合同及正式 066 保持不变；D 另核对正式 001 原始摘要 `292e0f7b…8455d` 和 94 个正式 SQL migration 未变化。081/082 继续是 docs 候选。D r33 的前端源码摘要也保持一致，方便用户在固定版本上测试截图。

## 组合边界复核

| 来源/对象 | 代码已强制的限定行为 | 还不能由本候选证明的事实 |
| --- | --- | --- |
| `CurrentTarget` | 构造必需，不能接收请求 scope；前后及最终检查匹配部署固定安装、UUID/database、schema/catalog/ledger 与 actor pin | 真实现场事实计算、控制行/metadata 锁和独立调用者身份来源 |
| `WriteGrant` | 当前用途、稳定 actor/逻辑 grant 派生、完整 scope/key/request SHA 与有效期匹配；最终重查固定原字节摘要/版本/撤销代次/截止 | 实际签名/holder 认证、当前撤销源、跨独立调用的不可变 grant 版本登记 |
| `ObservationGrant` | 独立当前观察授权可不同于旧写授权，但仍绑定原稳定 actor、原请求和永久 key；不能用写用途替代观察用途 | 实际观察用途签发/认证和同主体证明，不凭空新增跨主体委托 |
| `OriginalArchive` | 独立来源事实重算 provenance，并匹配准确目标/version/原文 hash-size；源和 scope 字节副本隔离；最终固定首次事实与最早截止 | 真正旧原文、原归档签名/manifest/记录认证，不从当前展开列反推原文 |
| `ReserveMetadata` | 准确预算、原 sql.Tx 与首次有效期固定，回调后重查数据库时钟，不能通过延长对象截止续期 | 实际 row/index/既有分配/并发 reservation、安装生命周期审计/收据保留和物理容量 |

CurrentTarget、grant 和 archive 回调持有原事务，仍必须只读；只有 ReserveMetadata 可以预留。观察路径不调用 ReserveMetadata，不为观察新写审计/收据或使用计数。该只读约束需要具体生产适配及真实 SQL 验收，私有 callback 类型本身不能保证它。

特别保留跨请求约束：`maintenanceSameGrant` 固定的是一次 admission 的首次事实。新请求首次收到“同逻辑 grant ID/version 的另一份字节”时，真实 verifier 必须依靠可信不可变登记拒绝，不能只检查摘要格式和当前签名，再把一次事务内比较当作跨请求版本不可变性证明。A r2 的 remaining 已明确此义务，D 没有新增 grant wire profile 或替代签发协议。

实际认证拒绝、撤销或过期保持 permission；已认证但相对首次观察发生漂移（含同 grant 版本下字节变化）保持 unavailable。最终复查不能采纳新的事实/更晚截止。该分类与既有私有服务同事务失败关闭组合一致。

## 后续范围

原始 canonical 文件及具体安装运行授权继续登记“暂无”，不因收到此组合实现而关闭。真实 CurrentTarget、认证 actor/holder/grant/archive、物理容量/保留、正式 081/082 和生产装配仍待实际交付。

现有 `TestDConfigCanonicalBackfillMySQL` 七组专项使用 test-only admission。即使其冻结二进制包含新 authority，或本地安全包已运行新 authority 的模型组合测试，也不能证明真实 MySQL 已调用 `pinnedConfigMaintenanceAuthority`。该组合的实际 SQL 验证须有自己的准确调用证据；不挪用已接收的 storage/writer/index，也不要求当前操作者重跑这些旧专项。

16:03 服务专项已按 SSH 未启动归档；16:33 新日志尚未取得最终远端回执。D 不自动 SSH、重启或从日志更新时间推断进程存活。本轮只新增私有组合评审接收记录，六项整体目标保持未完成。
