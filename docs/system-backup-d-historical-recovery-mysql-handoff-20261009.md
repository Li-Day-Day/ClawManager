# D 历史恢复隔离 MySQL 验证交接（2026-10-09）

目标只覆盖 D 的历史恢复 SQL 事务及候选撤销行。测试使用 A 原 registry/chunks 的实际只读重建器，但后台工作负载授权、容量/审计策略和 C Stat 证明仍是明确的测试替身；不构成生产 A/C 签收或正式 migration 验收。

在 Windows PowerShell 中从本仓库执行：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -Remote -SshTarget 'root@10.130.14.23'
```

该 profile 使用已有依赖离线运行恢复入口本地测试、编译 Linux MySQL 探针与固定迁移 runner；按 SHA-256 固定二进制和组合 DDL，在隔离 `sbk-mig-*` namespace 的 `emptyDir` MySQL 中只运行 `TestDHistoricalRecoveryMySQL`。它不重跑既有 `TestDProducerMySQL` 成功套件，也不对现有业务数据库应用候选撤销表。

远端用例覆盖：原 owner 截止前拒绝、审计失败回滚、两请求并发 claim 仅一个提交、claim 后撤销代次变化拒绝 finish、404/超时保持 `write_unknown`、重新 claim 后匹配 Stat 收敛 `ready`、重复 finish 拒绝，以及 COMMIT 已落库但确认丢失时不返回 claim。成功输出须同时含 `PASS d-producer-recovery-mysql`、`CLEANED namespace=...`、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True`，且无 `CLEANUP_PENDING`。本 profile 不输出 `SNAPSHOT`；快照检查不是该命令的验收项。任一断言失败或清理未确认，保留原日志，不改判为 PASS。

本地编译仅证明探针可构建；MySQL 行锁、CHECK/FK、事务回滚与断连行为必须由上述远端回执确认。取得回执后记录二进制/DDL 摘要、namespace UID、各子用例与清理状态，并保持 A/C 真实身份与 provider 证明待验。

## 2026-10-09 用户提供的远端回执

`TestDHistoricalRecoveryMySQL` 在 MySQL 8.4.8 的隔离 namespace `sbk-mig-261009040331-032c`（UID `92e78280-f9ad-4900-94d9-b3315de104fe`）运行 PASS：`claim_revocation_and_evidence_only_finish` 与 `commit_ack_loss_has_no_claim` 两个子用例均 PASS，且各自报告 `CLEANED evidence run-owned database`。固定迁移 runner 和 001..080 新库回放（94 个迁移文件）PASS。探针二进制 SHA-256 为 `28c17c09607281a1870338b0307c27d024972e6f9226d1c7f7a2f867af2a81bd`，组合 DDL SHA-256 为 `97abacd3f045046d01cb74211362a9a6aeada8c724c16958b48178517d5c8ff8`，迁移 runner SHA-256 为 `0de9fa2fe36acb028a5e449765bf7f1a1713005ec6afe2db03616b157e6f7fea`。输出含 `CLEANED namespace=...`、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True`。SSH 的 closed socket 提示出现在 PASS/清理输出之间，未改变测试退出结果。此回执由用户在对话中提供；仓库 `docs/evidence` 中当前尚无这一成功运行的完整原始日志，已有两份文件分别是更早的 SSH 未启动和中断运行记录。
