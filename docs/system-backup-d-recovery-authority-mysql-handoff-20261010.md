# D 当前恢复部署与撤销原子事务：隔离 MySQL 交接

日期：2026-10-10。目标是验证 [D 候选组合入口](../backend/internal/systembackupproducer/recovery_authority.go)在隔离 MySQL 8.4.8 上按 L0→L1a→L1b→L2 锁序把当前部署和准确撤销行写入同一事务。测试使用 [候选表 DDL](../contracts/system-backup/v12/producer-recovery-authority-candidate.sql)及原 L2 候选表，不修改现有业务库。

## 本地门禁

`-ProducerRecoveryOnly -RecoveryTest Authority` 的本地预检已退出 0：D 组合入口与部署 CAS 用例、A 的 L1b 管理行用例、默认 vet、带标签 fixture seed、Linux MySQL 探针和 pinned migration runner 编译通过。探针 SHA-256 为 `7aeb517f18b7b44072ce21c078b24c021e721e63002bdb9e60bd05a57bbe9065`；组合 DDL SHA-256 为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`；runner SHA-256 为 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。脚本报告 `CLEANED local-registration-build-cache=True`。这些摘要只标识本次本地快照；远程命令会重建并重新计算，不能把本地 PASS 记成真实 MySQL PASS。

## 操作者完整命令

从仓库根目录在 PowerShell 运行，保留完整原始输出：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
try {
    & .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest Authority -Remote -SshTarget 'root@10.130.14.23'
    'EXIT_CODE=0'
} catch {
    'EXIT_CODE=1'
    throw
}
```

固定输入：脚本创建独有 `sbk-mig-*` namespace 和 run-owned MySQL 数据库；预设 `clawmanager` 应用镜像 digest、MySQL 8.4.8 镜像、当前 001..080 migration、组合候选 DDL 与当前源码探针。脚本核对上传二进制、DDL、runner 的 SHA-256 和 namespace UID，并在结束时清理 namespace、远端 scratch、本地缓存和 run-owned 数据库。不要把目标改成生产数据库。

`TestDRecoveryAuthorityMySQL` 检查：结果审计失败后的 L1a/L2 同时回滚；两个首次注册争用同一 L0 父锁时恰好一个成功；同身份证书轮转同步推进部署与撤销 epoch；真实 COMMIT 完成但回包丢失时不返回授权，随后独立读取确认两行一致；管理主体禁用后旧请求拒绝且两侧版本不动。测试中的管理 mTLS facts 和审计容量仍是 fixture，未验证真实首位管理者注册、独立审计存储、C Stat profile、历史恢复生产适配或真实 provider。

后续源码增量加入“管理事务持锁时独立管理读取等待，提交后同时观察 L1a/L2 新 epoch”，以及紧急撤销后同一身份不能由 `rotate` 复活。带 MySQL 标签的本地 fixture seed 已通过，但本页下方旧远程 PASS 使用此前探针 SHA，**不覆盖新增断言**；统一远程运行须重新计算二进制摘要并保留完整退出码与清理结果。

再后续的 `TestDRecoveryAuthorityRaceMySQL` 让新组合管理事务分别与旧 epoch 的 `ClaimRecovery` 和 `FinishRecovery` 竞争：管理事务持 L0/L1a/L1b/L2 锁时恢复操作不得越过 L2；提交轮转或撤销后，恢复操作须被拒绝，证据行不变，部署与准确撤销行同为新 epoch。`Authority` profile 现同时选中该测试和 `TestDRecoveryAuthorityMySQL`。带 `systembackup_mysql` 标签的本地 fixture seed 已重新编译通过，报告 `real_mysql=not_run`，自有缓存已清理；竞争断言的真实 MySQL 结果仍待操作者统一远程回执。

接受新回执须同时有独立 `EXIT_CODE=0`、94 文件 fresh migration replay PASS、`--- PASS: TestDRecoveryAuthorityMySQL`、`--- PASS: TestDRecoveryAuthorityRaceMySQL`、`PASS d-recovery-authority-mysql`、完整探针/DDL/runner SHA、namespace 名与 UID，以及 run-owned 数据库、namespace、远端 scratch、本地缓存全部 CLEANED；不得出现 `CLEANUP_PENDING`。任一断言、清理或退出码不满足时保留原日志并按失败处理。即使专项 PASS，候选表仍需 A/C 签收和编号 migration/inventory，恢复与管理生产入口保持关闭。

## 操作者回传结果

2026-10-10 的完整控制台粘贴包含 `EXIT_CODE=0`。隔离 namespace `sbk-mig-261010041324-6d97`、UID `cf1a6a11-eeda-4dcf-bed1-2d3b6f6fa6da`；MySQL 8.4.8；94 文件精确 fresh replay PASS；`TestDRecoveryAuthorityMySQL` 与 `PASS d-recovery-authority-mysql` 均出现。探针 SHA-256 `145580aa116c662d811bb7b4b41ef9987a079c9a05333720afd0d9d940fc7978` 在本地构建行与远程 PASS 行一致；DDL `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`、runner `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f` 也一致。探针与上文先前本地快照的摘要不同，不能混用。run-owned 数据库、namespace、远端 scratch 和本地缓存均报告 CLEANED；没有 `CLEANUP_PENDING`。SSH 密码提示附近的 closed-socket 文本不改变其后的测试、清理与退出码判据。[结构化接收记录](evidence/system-backup-d-recovery-authority-mysql-20261010.json)依据操作者粘贴，仓库未保存本次原始日志文件。

结论只关闭本次 D 候选组合事务的隔离 MySQL 专项。管理身份与审计在此专项仍为 fixture；生产授权、A/C 签收、正式 migration/inventory 和历史恢复激活保持未完成。

## 后续增量：当前状态的独立授权读取

D 新增 [当前部署与撤销联合读取](../backend/internal/systembackupproducer/recovery_authority_read.go)：每次新建管理会话，按 L0→L1a→L1b→L2 锁定当前部署及其准确身份撤销行，仅在 `read_fence` 权限、请求摘要和 FinalGuard 均通过且只读事务确定提交后返回状态。缺部署可返回明确缺行；部署与撤销 epoch 不一致则失败关闭。返回值仅说明读取时的当前状态，不能证明是哪次请求造成该状态。

本地 `-ProducerRecoveryOnly -RecoveryTest Authority` 复验退出 0，包含 D 包用例、fixture seed、Linux MySQL 探针与 pinned runner 编译；报告 `CLEANED local-registration-build-cache=True`。本次**新增读取探针** SHA-256 为 `44f35881e7d00035a8afa3d5f74bec0c68127613583a94126026686d468bc9ab`，DDL 为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，runner 为 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。上节的远程 PASS 属于先前探针 SHA，不覆盖此增量。

远程测试使用上面的完整 PowerShell 命令。增量判据是在既有原子事务断言外，`TestDRecoveryAuthorityMySQL` 还验证注册和丢失 COMMIT 回包后均可由新管理读取会话观察相等 epoch，并在管理行禁用后拒绝读取。

操作者的第二次完整控制台回执满足这些判据：`EXIT_CODE=0`，94 文件 fresh migration replay PASS，`TestDRecoveryAuthorityMySQL` 与 `PASS d-recovery-authority-mysql` 均通过；namespace `sbk-mig-261010053900-67fd`、UID `a2c10cfe-9f3b-4e53-9f41-38db728674b4`；本地和远程 probe SHA 均为 `44f35881e7d00035a8afa3d5f74bec0c68127613583a94126026686d468bc9ab`，DDL/runner SHA 与本节本地门禁一致。run-owned 数据库、namespace、远端 scratch 和本地缓存均报告 CLEANED，未出现 `CLEANUP_PENDING`。[独立结构化接收记录](evidence/system-backup-d-recovery-authority-read-mysql-20261010.json)依据操作者粘贴，仓库未保存原始日志文件。此 PASS 只关闭候选联合读取的隔离 MySQL 验证，不构成生产管理 mTLS 或恢复准入签收。
