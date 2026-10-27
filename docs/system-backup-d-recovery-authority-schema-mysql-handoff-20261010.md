# D 恢复授权候选表隔离 MySQL 验证交接（2026-10-10）

目标：只验证 [两张候选表](../contracts/system-backup/v12/producer-recovery-authority-candidate.sql)在隔离 MySQL 8 上可创建，以及安装外键、唯一键、部署 epoch/版本和管理主体版本/撤销 CHECK 的正负例。此专项不认证管理主体、不执行历史恢复、不批准生产 migration/inventory，也不重跑 D 已通过的九项恢复事务。

远端运行前的本地离线预检已退出 0：A 的 10 月 10 日复审后，`-ProducerRecoveryOnly -RecoveryTest Schema` 完成固定 seed、默认 vet、Linux MySQL 探针及迁移 runner 构建；当时探针 SHA-256 为 `e7d8ace89c18495e1312f4a9c1d69c5461c08de89f7bb04e90e9c8f18a585feb`，组合 DDL SHA-256 为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，runner SHA-256 为 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。脚本报告 `CLEANED local-registration-build-cache=True`。Windows `vet.exe` 与 `compile.exe` 各出现一次 `0xc0000043`，同一命令重试后通过；更早一次本地脚本 DDL 数组展开失败已修正且当次缓存清理完成。此前原文 subject 版本的探针/DDL 摘要已失效，不作远端比对。此预检本身**不代表真实 MySQL PASS**。

操作者从仓库根目录执行完整命令：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest Schema -Remote -SshTarget 'root@10.130.14.23'
```

命令用现有 `sbk-mig-*` 隔离 namespace 和 `emptyDir` MySQL 执行 94 文件 fresh replay，再运行唯一目标 `TestDRecoveryAuthoritySchemaMySQL`。每个测试建立随机 `dprod_*` 数据库，完成后按原 namespace UID 和数据库 server UUID 清理。它不会对现有业务库应用候选表。

接受远端回执须同时看到 `--- PASS: TestDRecoveryAuthoritySchemaMySQL`、`PASS d-recovery-authority-schema-mysql`、namespace 清理、`CLEANED remote-registration-scratch=yes` 和 `CLEANED local-registration-build-cache=True`，且无 `CLEANUP_PENDING`；记录独立 PowerShell 退出码、namespace/UID、MySQL 版本及探针/DDL/runner 摘要。任何断言失败或清理不明均保留原日志，不改判 PASS。此专项只关闭 DDL 物理约束验证；A/C 管理身份、C Stat 证明、全局锁序生产适配与正式签收继续分别验收。

## 操作者回传的隔离 MySQL 结果

2026-10-10 回传显示 MySQL 8.4.8 的 `sbk-mig-261010013410-3690`（UID `a3ded9da-d90a-4812-bc26-a0f4c68f13fb`）完成 94 文件 fresh replay；唯一目标 `TestDRecoveryAuthoritySchemaMySQL` PASS，run-owned 数据库、namespace、远端 scratch 与本地缓存均报告清理，无 `CLEANUP_PENDING`。本次命令的本地探针摘要 `ed3086519435c7e2c57e665173c3eedb808a76ddd7f4b5941057014a97d1ad41` 与远端 PASS 行一致；组合 DDL `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`、runner `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f` 均与前述本地检查一致。探针二进制变化反映命令执行时源码快照变化，不沿用旧探针摘要作本次验收。SSH 密码提示附近有 closed-socket 文本，其后测试及清理标志完整。

[结构化接收记录](evidence/system-backup-d-recovery-authority-schema-mysql-20261010.json)依据用户粘贴的控制台输出；仓库没有本次完整原始成功日志，粘贴内容也未提供独立 PowerShell 退出码。因此可按**控制台所示隔离 MySQL 专项 PASS**记录，不把它扩展为生产准入、A/C 签收或正式迁移验收。
