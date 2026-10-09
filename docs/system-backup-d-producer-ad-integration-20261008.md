# D：producer 与 A SQL 适配的跨包事务联调

日期：2026-10-08。承接 [D 结果提交](system-backup-d-producer-result-20261008.md) 和 [A ready 证据适配](system-backup-a-system-result-20261008.md)。本轮补齐公开服务入口与实际 A SQL 的本地集成证据，没有新增生产默认授权或启用 HTTP 路径。

## 新增联调范围

[跨包用例](../backend/internal/systembackupevidence/d_producer_integration_test.go) 位于 A evidence 包，以便直接复用 A 的真实准备数据和 SQL 适配；只通过 D 的公开入口取得 ExecutionHandle 和 PublicationClaim，不构造私有句柄或代替服务修改成功状态。

调用链为 `Lifecycle.Execute(acquire)` → `BeginCall(probe)` → `BindObservation` → `AdmitPending` → `ClaimPublication` → `ReadPublicationClaim` → `FinishPublication(ready)` → `CommitResult`。其中 pending/claim/finish/result 使用实际 `NewSystem*Environment`：A 的 registry/chunks 锁定、插入、最终回读，以及 D 的历史/引用/target/run/收据写入和 evidence CAS，都经过同一 `database/sql` 事务。

[测试 SQL driver](../backend/internal/systembackupevidence/d_producer_integration_db_test.go) 保存双方表的同一 BEGIN 快照，解释当前参数化语句和每个 CAS 条件。它验证提交/回滚边界，不实现 InnoDB 的 FK、gap lock、隔离冲突或跨进程竞争。只有初始 domain 被直接播种；后续成功步骤均调用实际服务。

测试独立检查最终 run 为 committed/version 5、target/result version 为 1、A evidence 为 ready/version 3、claim 已消费、对象版本大小写保留、health 和历史不变，且存在结果和收据引用。pending 重放、同请求 claim 读回及最终精确收据重放不得写入。执行期限过期且 A loader 不可用时，独立授权的收据读取仍须成功；关闭读取权限后必须拒绝。

失败注入覆盖 A 分块插入、pending 审计/最终检查、claim CAS/最终检查、Finish run CAS/分块漂移/最终检查/容量跨期，以及结果收据插入/分块漂移/审计/最终检查/容量跨期。每项比较事务前后全部 A 行、chunks、D 行和审计参与者，失败不得留下部分写入或新 claim。

提交不明用例模拟数据库已保存结果但确认响应丢失：首次调用必须返回空结果及 `ErrCommitUnknown`，不会自动重试；下一次独立授权的精确请求只读取原收据。

## 验证与限制

两包冻结源码回归通过：176 个顶层测试、含子测试 1777 项；其中本轮跨包联调为 3 个顶层测试、含子测试 17 项（14 项失败注入）。默认 vet 和 Linux evidence 测试二进制交叉编译通过，Linux 二进制未执行。脚本退出 0，本轮源码副本、缓存、临时目录、遥测目录和二进制均已清理，未安装依赖或执行远端操作。

验证入口复用 [A/D 两包快照脚本](../scripts/system-backup-a-producer-adapter-validation.ps1)。[成功快照](evidence/system-backup-a-producer-snapshot-20261008-014922-c1f62e08.json)包含 232 个文件；测试阶段首次遇到 Windows asm.exe 的 `0xc0000043`，同快照/缓存重试一次后通过，没有重试断言失败。结束时 `system_sts.go` 与 `system_sts_test.go` 已被并行工作更新；通过结论只对应快照，不能用于这两份后续版本。本轮三份联调测试及全部 D producer 源码仍与成功快照一致。准确指纹与边界见 [机器回执](evidence/system-backup-d-producer-ad-integration-20261008.json)。

首轮在 Windows 工具进程故障后的同快照重试中暴露联调夹具错误：只读 probe 的测试 authority 错误返回非零 AdditionalCost，被 D 拒绝。已修正为 probe 零费用、BindObservation 才有写入附加费用，未放宽生产判断。失败快照及其并行源码差异保留，失败运行的缓存和测试产物已清理；后续验收使用修正后的新快照。

[测试 authority](../backend/internal/systembackupevidence/d_producer_integration_authority_test.go) 比较固定夹具并检查最终 D 记录；身份、host、引用前缀、容量、evaluator 和 C 对象证明仍是测试替身。A 准备数据复用已有加密夹具，没有使用真实 provider 或把 D 调用快照接入真实 Wrap/STS。结果模式只覆盖未配置 candidate；完整 configured 规范映射/legacy 投影仍由 D 单包替身用例覆盖，尚未完成生产 SQL 接线。

本轮不能替代真实 MySQL、部署身份与撤销、独立 C 通道、真实 STS/条件 PUT、完整 HTTP/LDAP、V01–V10 或 Owner 签收。独立进程丢失/关闭域/跨配置的历史恢复、域管理、引用退休/GC 和任意 caller-owned LockedPrefix 仍待完成；八表候选 DDL 未进入正式 migration/inventory。
