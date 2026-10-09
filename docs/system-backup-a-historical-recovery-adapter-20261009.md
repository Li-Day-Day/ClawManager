# A 历史恢复适配接线（2026-10-09）

本轮消费 D 新增的 `HistoricalRecoveryEnvironment`、`HistoricalRecoverySession`、`LoadHistoricalBinding`、`ClaimRecovery`、`FinishRecovery` 和事务内 `FinishRecoveryInTx`。A 的实现位于 `backend/internal/systembackupevidence/system_historical_recovery.go`；它是请求绑定的组合层，不发布 HTTP 入口，也不签发 provider 凭证。

## 已接入的 A 边界

- 只接受 `SystemPeerAuthenticator` 对当前请求完成 mTLS 验证后产生的 `SystemPeer`；每次准备恢复时为准确 evidence ID 创建私有工作负载意图。`load`、`claim`、`finish` 之外的操作一律拒绝。
- 在 D 的 L2 授权调用中读取数据库 UTC，复核请求、scope、证书与工作负载身份；独立 authority 的返回值必须绑定同一工作负载 hash、请求 hash、Stat 用途，且身份截止不能晚于 mTLS 证明的截止。D 随后锁定专用撤销行并比较 epoch。
- `claim` 和 `finish` 的 L8 使用 D 的同一 `Transaction` 读取原 A registry 与有序 chunks，经原 codec 重建并与 D 的不可变历史完整比较；再锁读原行，返回实际 state、版本、claim、manifest 与保留时间。最终 Guard 中重新核对当前身份，并读回 D 的 CAS 后 A 行与 chunks。
- 当前部署、安装前缀、引用/GC、容量、审计和 C 的冻结 Stat 证明通过**必需且没有默认成功实现**的 `SystemHistoricalAuthoritySession` 注入。`VerifyStat` 必须只验证事务前取得的证明；不能在 SQL 锁内访问 provider。当前代码没有生产 authority 实现，因此不构成生产恢复路径。

## D 专用撤销表候选审阅

`contracts/system-backup/v12/producer-recovery-revocation-candidate.sql` 的 `(scope_key, workload_identity_hash)` 唯一键和 epoch/撤销字段可支持 D 的 L2 精确拒绝；缺行时 D 已拒绝。A 暂不签收生产使用：还需冻结受信工作负载注册、轮转和撤销写路径，保证 epoch 不回退或重用，并明确它们与 L0/L1 当前部署准入的锁序。该候选表尚不在编号 migration/inventory；不能因本地 adapter 编译通过就启用恢复。

## 后续验收边界

本地用例验证请求/身份绑定、参数冻结、跨 scope 和越权操作拒绝，以及缺少 L2 授权时 L8 拒绝。D 新恢复接口现有测试为模拟事务；此前 A/D 真实 MySQL 回执产生于这些恢复文件之前，不覆盖此路径。下一轮需要在隔离 MySQL 运行新增恢复专用套件，覆盖专用撤销、旧配置停用/轮换、并发 claim、L8 锁等待、审计/Guard 回滚和 404/超时未知；另由 C 的真实限制通道证明 Stat 与 Range/PUT/Delete/Wrap 隔离。远程执行前先冻结准确源码、候选 DDL 和测试脚本指纹。

本地冻结门禁的[快照](evidence/system-backup-a-producer-snapshot-20261009-031310-7bd02265.json)状态为 `passed_snapshot_only`：A/D 两包测试、默认 vet、Linux 测试二进制编译通过，脚本退出 0，临时源码与缓存清理。首次 Windows compile 返回 `0xc0000043`，脚本在同一快照上重试后通过。`live_drift_after_validation` 仅列出运行中由 D 新增的 `d_recovery_mysql_test.go`，该文件不在本轮冻结验证范围。

D 随后新增的 MySQL 恢复用例已有[本地预检日志](evidence/a-d-historical-recovery-local-20261009-112626.txt)：恢复定向测试、离线 seed、Linux MySQL 探针与迁移工具编译通过，退出 0，构建缓存清理；`real_mysql=not_run`。这份预检和上述 A 快照都不等于新增恢复路径的真实 MySQL 验收。

## A 后续加固（2026-10-09）

`systemHistoricalRecoverySession` 现在只接受一次 L2 授权，并保存当次 mTLS 意图的准确 evidence/scope/Stat 绑定摘要；最终 Guard 同时复核该摘要、工作负载身份和请求存活。未完成 L2 的 session 不能调用最终复核。测试分别验证二次授权、绑定变化和原 HTTP 请求结束均被拒绝；不同身份及超出证书截止的负测使用新 session，确保实际走到对应的校验分支。

使用已有 Go 依赖离线执行 `go test ./internal/systembackupevidence ./internal/systembackupproducer -run '^(TestSystemHistoricalRecovery|TestHistoricalRecovery)' -count=1`，两包通过；测试使用独立临时 `GOCACHE`，结束后删除。Go telemetry 的 upload token 写入提示没有改变测试退出码。此验证只覆盖本地适配器和 D 模拟事务，不扩展此前真实 MySQL 回执的范围。

当前 D 已新增 `RecoveryFenceManager` 的 register/rotate/revoke 候选事务，但专用撤销表仍是候选 DDL，且尚无已审核的生产管理身份、当前部署准入、A 历史 authority session 或 C 的受限 Stat 证明。下一步须先冻结这些输入及 L0/L1/L2 锁序，再用 A 的真实 mTLS 环境接 D 的隔离 MySQL 专项；不能把 D-only 的两项 MySQL 成功用例视为这次接线的验收。

该 A mTLS × D 事务隔离 MySQL 专项现已实现并完成本地预检；D 的只读历史读取已补 L8 原行回调，A 的最终 Guard 要求原行已锁并复查。操作者远程命令、固定摘要和准确验收范围见[新交接](system-backup-a-historical-recovery-mtls-mysql-handoff-20261009.md)。真实 MySQL 尚未执行，之前的 D-only 回执仍不覆盖它。

操作者于 2026-10-09 执行 D-only 的[隔离 MySQL 回执](evidence/a-d-historical-recovery-remote-20261009-115925.txt)：`TestDHistoricalRecoveryMySQL` 两个子用例 `claim_revocation_and_evidence_only_finish` 和 `commit_ack_loss_has_no_claim` 通过；二进制与 DDL SHA-256 分别为 `28c17c09607281a1870338b0307c27d024972e6f9226d1c7f7a2f867af2a81bd`、`97abacd3f045046d01cb74211362a9a6aeada8c724c16958b48178517d5c8ff8`，与本地预检相同。两个测试数据库、namespace、远端 scratch、本地缓存均报告清理，退出码 0。首次 Windows 编译返回 `0xc0000043`，同一命令自动重试后成功；SSH closed-socket 提示没有改变 PASS 和清理状态。该回执只接收 D 事务及 A 原行读取的冻结范围，不证明本文件新增的 mTLS 环境参与了远端事务，也不证明真实 C Stat 权限或生产部署身份。
