# A：Operation writer 的原始响应与 SQL 事实绑定

D 正在将公开配置写入从 ConfigResource 切换为 A 的 [Operation codec](system-backup-a-config-operation-response-20261015.md)，采用最终事务中的 terminal time、inline 原始响应及当前授权重放。本项是对这条新链的独立 A 回归和借用字节修订，不将旧 ConfigResource 内容回执扩大为新协议验收。

## writer 保留私有原文

新 Stage 接口同时接收 typed Operation policy 和 `[]byte`。代码检查发现，若直接借出 writer 的原始 byte slice，回调可以在 Stage 或稍后的 Recheck 改写它。Stage 期间改动可能污染计算中的响应 hash；最终 Recheck 期间改动则可能使返回给客户端的正文与已保存 evidence/receipt hash 不一致。

writer 现在先固定私有原文的 hash，再把独立 byte copy 交给 Stage。Stage 存入不同正文时，原有 evidence hash/size 核对必须拒绝并回滚；回调稍后修改自己保留的副本，不会改变 writer 返回的原文。该修订不替代 Stage 对 typed policy、当前权限、准确 SQL row、截止和完整原文的核对。

## 独立组合回归

新增 A 用例复用实际 JWT authenticator、SQLLoginSessions 当前会话检查与 PinnedConfigMutationAuthority，再调用实际 mutation service；SQL transport、registry 与其他 owner 是明确模型。

- update/rollback 均在配置/CAS 的实际 SQL 调用后推进模型数据库时钟两秒，要求响应 finished/updated 使用推进后的 terminal time，created/started 保持原始时间。
- 独立解析实际发送的 Operation INSERT 的 columns、VALUES 与绑定 args，逐项比较公开 Operation 字段；要求返回正文、evidence 中正文、checksum 和 operation 收据 hash 一致。测试没有从预期 policy 反填一个“正确 SQL row”。
- 两类 endpoint 的 Stage 改写副本必须回滚；最终 Recheck 改写其借用副本时，可正常返回，但只能返回 writer 原始主体和原始保存字节。每项均要求注入改动确实发生。

[专用入口](../scripts/system-backup-a-config-operation-binding-validation.ps1)还构建只撤掉 Stage byte-copy 的临时 Go overlay，保持冻结源码本身不变，只运行两个 Recheck 污染用例。它们必须在正确断言处失败、退出 1，才算反例控制有效；普通编译错误或其他失败不算证明。随后以正常源码运行完整 security/config 回归。所有 overlay、源码副本、cache/tmp/telemetry 和产物都在 finally 清理，不安装依赖或执行远端。

## 两轮失败与准确范围

[首轮失败记录](evidence/a-config-operation-binding-failed-20261015.json)保留定向 2/6 通过和两个预期反例失败，但完整回归在 `TestConfigMutationACommitClockAfterFinalBoundaries/session-expiry` 失败。新的响应有效期被会话截止截短后，通用 unavailable 抢先遮住 permission 错误。A 将最终新时钟/单调性检查后的会话判断提前到通用 deadline 判断之前，保留原测试和错误语义；D 随后也在终态编码前补会话检查。

[第二轮失败记录](evidence/a-config-operation-binding-failed-20261015-r2.json)保留定向 3/9 通过及有效反例，完整回归仍在真实 TLS/HTTP update 后 rollback 失败。该冻结副本的单收据 SQL 模型没有按 endpoint/key 区分原收据；D 后续修正这一作用域，r18 已输出本地回归 PASS。A 不把 r18 自动当作自己的独立签收，也不删除两轮原始失败。两轮准确源码/构建目录均已删除并独立确认。

## 实际 Operation 存储与重放适配的 A 检查

新增 [实际存储组合回归](../backend/internal/systembackupsecurity/config_operation_store_a_test.go)，使用 `SQLOperationResponses`、实际 JWT/SQLLoginSessions/current file RBAC，以及准确调用者事务。Operation 查询行由 A 直接解析 writer 实际 INSERT 的 column/value/args 构成，不使用生产响应 policy 重新生成预期 SQL。其余 SQL transport、资源 readiness 与安装材料仍明确为模型。

- update/rollback 各先完成一次有效写入，再注入跨 actor/request、其他 evidence owner、完成前 evidence 创建时间、非 NULL 的空外置字段，以及 chunk 读取/关闭失败；所有注入须实际发生，读取必须拒绝、无提交或新写入。
- 同时改写 evidence 正文、正文 hash、大小和 operation 收据 hash，使它们相互自洽，但正文 actor 与独立 SQL Operation 相反，仍须拒绝。仅验证 hash 不能证明原响应的业务事实。
- 成功 Read 后修改调用者得到的 byte copy，不能污染内部原文；Read 与最终 Recheck 之间延长保留期、替换 evidence public ID 或撤销当前会话均须拒绝，不能把一个新的合法行当成先前读取的同一快照。

## 第三轮限定验收

第三轮 [固定输入](evidence/a-config-operation-binding-source-20261015-r3.json)为 1,224 项，摘要 `1b30acb271a4eff285d1583b0a835cd65dbbce11373bf7e1288c0a80d30843f1`。[r3 原始输出](evidence/a-config-operation-binding-local-20261015-r3.txt)与[接收记录](evidence/a-config-operation-binding-review-20261015.json)确认：

- 定向 6 主测试/37 子用例（43 项）全部通过，包括新 A 实际存储检查、最终会话分类和先 update 再 rollback 的真实 TLS/HTTP 场景。
- 临时 overlay 只撤掉 Stage 私有响应复制，update/rollback 的两个 Recheck 污染子用例均在指定断言处失败，exit 1，反例控制有效。正常冻结源码未改动；这两项预期失败不混入完整回归失败。
- 正常源码完整 security/config 两包 197 主测试/1,025 子用例，共 1,222 项检查通过。security 为 177/912、23.477 秒；config 为 20/113、3.286 秒。定向重复覆盖不与完整包叠加。
- 默认 vet，进程 exit 0，无已知 Windows 工具崩溃重试；保持只读 module、离线依赖、local toolchain。未安装依赖。
- 测试后固定副本复核通过，归档时全部 1,224 项已有 live 输入相同、没有新增未纳入输入；十项明确评审输入均匹配。原公开 Operation schema、已接收 codec 和独立向量未改动。
- 准确构建目录 `.tmp-a-evidence-40b25100d26a41ccbd3f4afc701ed038` 和源码目录 `.tmp-d-index-cache-36de390de4894acfb51a03d62b34e4cf` 已删除并独立确认；日志中的 117 个不同测试 fixture 目录也均确认不存在。源码副本、overlay、cache/tmp/telemetry 和二进制没有遗留。

据此，**A-CONFIG-WIRE-01 在本轮固定候选实现范围内已修复**：writer 的完整公开 Operation、真实终态 SQL 时间/事实、inline evidence/收据 hash、当前授权原字节重放和 HTTP 成功体一致。原 [open 审计记录](evidence/a-config-success-wire-audit-20261015.json)保留为发现时的历史事实，以本次接收记录提供后续状态，不能静默改写旧输入或以旧 ConfigResource 回归关闭问题。

这轮不证明真实 MySQL、完整生产 owner、部署 HTTP 或具体写授权。旧 ConfigResource diagnostic 实验不再满足公开 writer 的接口；公开完整 Operation 在 8 KiB 内 inline 存储，不需要把旧大正文 diagnostic 发布器当作该成功体的前置条件。原始配置行的完整 canonical 保存与真实引用 readiness 仍各自受原门禁约束。
