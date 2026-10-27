# A：维护授权组合层的独立 MySQL 探针

2026-10-16：本专项八项实际 MySQL 已限定接收，无需重跑。操作者 [08:58:02 日志](evidence/a-maintenance-authority-remote-20261016-085802-222.txt)在 MySQL 8.4.8 上通过全部八个指定用例，完整 94 文件迁移重放通过，显式远测退出码 0。见[A 验收记录](evidence/a-maintenance-authority-mysql-accepted-sbk-mig-261016011333-1fdd.json)。认证事实供应者仍为合成，真实 grant/原归档/target/capacity 适配和生产门禁不由该回执关闭；D 的独立七项服务专项仍须自己的完整回执。

本轮 namespace 为 `sbk-mig-261016011333-1fdd`，准确 UID `f48845de-1f0a-4130-b347-c7e44927b7bc`；八份 owned installation 与收据/审计/配置行清理、准确 namespace/UID 及远端 scratch 清理均由同轮日志报告。两层准确本地自有目录和 67 个不同 fixture 共 69 路径已独立确认不存在。六项最终漂移/到期负测均先证明真实暂存效果，再证明整笔回滚；独立观察使用不同的当前观察 grant，在合成写准入 verifier 已拒绝后仍返回准确原收据。完整 installation_state 不变断言全部通过。

冻结清单固定 1,265 项输入，source `cce6428a4579a26fbe0d95c2403131567fa942d35fe704e69b7a174845ee7835`；probe `f9ffd7219ee7fd6bf03b4808ab176a7be0c33511ad676ce3ae760d5ecea28fbd`、inputs `bbbc2f73516b20279a00e66b40c5f0ead8ed2a327ce56a60356edd0067c77234`、migration runner `6076811670a742bf5f96d0a411a5f7bca0362d000685bb36938a455beb208160` 在本地/远端 marker 中分别相同。全部已有输入与当前文件匹配、无新增遗漏；与下方旧本地准备清单逐项比较，文件集合、size 与内容 hash 完全相同，只是 775 个排列位置不同，故顺序敏感的总摘要不同。两轮各保留自己的 source/input/binary pin，不改写旧回执。四条 socket-close 诊断原样保留，随后八项、清理、frozen postcheck 和 exit 0 均完整。

本项为 [A grant/source 组合校验层](system-backup-a-config-maintenance-authority-handoff-20261015.md)和 [私有回填服务](system-backup-a-config-backfill-service-handoff-20261015.md)增加同轮真实 SQL 验证。它直接装配 `pinnedConfigMaintenanceAuthority`，不再用一个直接返回 admission 的整体假 Authority 替代该组合层。实际身份/holder、grant 签名、原归档、当前安装 schema/ledger 和物理容量的供应者仍为明确合成；不交付或认证运行授权、原始历史 canonical 文件，不启用生产路由或正式 081/082。

## 八项必须分别通过的场景

| 叶子用例 | 必须观察的结果 |
| --- | --- |
| `grant_target_mismatch` | 独立 grant 的 database 与请求不同，permission 拒绝；不调用 archive/capacity，canonical 保持 NULL，审计/收据均无新增。 |
| `independent_observation` | 实际 apply 提交后撤销写准入，使用不同 logical ID/version 的当前 observation grant 读取准确原收据；写用途不能冒充观察，写拒绝不能 fallback；只有一次 canonical/两条审计/一份收据/一次容量准入。 |
| `grant_same_version_bytes_drift` | 同一事务已能看到 canonical/两条审计/收据后，同 grant 身份/版本的原始字节 SHA 变化；unavailable，完整回滚。 |
| `archive_verifier_drift` | 已暂存上述全部真实 SQL 后，archive 验证代次改变；unavailable，完整回滚。 |
| `installed_target_drift` | 同样在已暂存之后，合成 CurrentTarget 的 catalog pin 改变；unavailable，完整回滚。该场景不声称实际修改或验证生产 catalog。 |
| `grant_expires_after_staging` | 先确认真实暂存效果，再在最终 grant verifier 内等到数据库 UTC 达到被冻结的 grant 截止；permission，完整回滚。 |
| `source_expires_after_staging` | 先确认真实暂存效果，再在 archive verifier 内等到数据库 UTC 达到原 source 截止；permission，完整回滚。 |
| `capacity_expires_after_staging` | 容量回调确认真实暂存效果并等待实际数据库截止，然后故意延长内层 ValidUntil；外层原截止不得续期，unavailable，完整回滚。 |

三个到期场景使用数据库 UTC 样本和已有受控等待辅助函数，不能以宿主 sleep 代替截止观察。负测必须返回空结果，并从新事务读取实际 counts 和原 row fingerprint/canonical 状态；最终失败前须先观察到指定暂存效果，不能把提前 setup/权限错误记作成功拒绝。所有场景前后比较完整 installation_state，不能改变 active/deployment/监控状态。

## 隔离与派发

唯一 root 是 `TestAConfigMaintenanceAuthorityMySQL`，固定八个叶子用例，没有外部可选 test regex。复用 D 已有的 fresh namespace/UID/server UUID 校验、完整 94 文件正式 catalog、准确候选 DDL pin 和每个随机 installation 的独立清理。只在该隔离库中安装候选 canonical 列及收据表；真实旧配置和生产授权不进入夹具。

[专属 wrapper](../scripts/system-backup-a-config-maintenance-authority-mysql-validation.ps1)冻结一次 backend/contracts/scripts/明确 fixture 输入；公共 harness 的 `ConfigMaintenanceAuthorityOnly` 只在独立 writer+maintenance profile 下允许，与 BackfillServiceOnly/WriterSecurityOnly 混用会在创建 scratch 或调用 Go/SSH 前拒绝。旧四个 writer/storage/service profile 的 payload/seed/phase/命令检查保持原行为。远程 [A phase](../scripts/system-backup-a-config-maintenance-authority-phase.sh)仅选择新 root，不重跑已接收的业务十五表、管理读取、writer 或纯收据专项；fresh catalog replay 是新 namespace 的建库前置。

离线 seed 包含 D capsule 校验、A DB-clock seed、A 新夹具绑定 seed 三个顶层测试；新 seed 验证正确 write/observation/provenance 与错误 tuple/purpose/manifest，不访问数据库。相同 seed 从空 CWD 的 Windows executable 再运行，并校验 PowerShell 实际生成的 JSON 胶囊；不能把这些 seed 的 PASS 算作八项 MySQL 已执行。

## 本地准备及剩余边界

首次 sandbox 内 Git Bash `-n` 因 signal pipe 的 Win32 error 5 失败，[原日志](evidence/a-maintenance-authority-mysql-shell-local-20261015.txt)保留。随后只读 `bash -n` 已在 sandbox 外通过，见[语法回执](evidence/a-maintenance-authority-mysql-shell-local-20261015-r2.txt)，未执行脚本体、网络、安装或远端动作。

本地完整准备已通过，见[限定回执](evidence/a-maintenance-authority-mysql-local-review-20261015.json)、[原日志](evidence/a-maintenance-authority-mysql-local-20261015.txt)和[冻结清单](evidence/a-maintenance-authority-mysql-source-20261015.json)。固定 1,265 项输入，source SHA-256 为 `35214503498b44f472823f2340e8f8dbcf6e18f9d0c1d0e71ca69d86a3ae5d09`；完整 security 230 主测试/1,525 子测试通过。三个 seed 共 3 主测试/22 子测试，分别在 checkout、空 CWD executable 和实际输入胶囊下通过，重复覆盖不相加。默认 vet、exit 0，无工具或断言重试；旧 11 项 evidence 分发、原四档位和新独立档位检查全部通过。

Linux 探针 SHA-256 为 `aec66bf5d43e5bce2bbf946ba9d3ba2084476fdbfa765c0f4bb77b198b5d8860`，实际 inputs 为 `4480d7e0f017f87ba22c38a76c89212f922f6b408149f2dfd3b8967a544fd3a3`，migration runner 为 `7b3689676deceb159de2ed0ee5181c28fe03f6361b9db9f825de841911fd54c6`。归档时全部输入及 12 项重点文件匹配，无新增遗漏；原 A 写入合同、维护摘要合同和正式 066 原字节未变。准确自有 source/内部构建目录及 67 个日志内 fixture 路径均独立确认不存在。该次本地准备未安装依赖或执行 SSH，八项真实 MySQL 执行数为 0；2026-10-16 操作者实测已按本页顶部的新回执接收。

D 七项私有服务的 [16:33 操作者尝试](evidence/d-canonical-backfill-remote-20261015163349.txt)已在 17:23:39 以“管道已被停止”结束，见[A 中断核对](evidence/a-canonical-backfill-mysql-interrupted-20261015.json)。本地编译完成，但日志没有实际 SQL root、namespace 或远端最终成功/清理证据，不能算作通过；准确本地 source/构建目录及 67 个 fixture 已独立确认删除。远端 scratch 是否建立和清理仍未知，本轮未发起远端查询。该七项服务与本页八项组合层保持独立范围，原 writer/storage/index/business 专项不重跑。

现有 `schema_migrations` ledger 只保存 filename/applied_at，不保存已执行 SQL 的原字节 hash。即使文件名与编译 catalog 一致，也不能由此推导或补造真实 schema/历史 SQL 的认证 pin；本测试的 CurrentTarget facts 不替代生产 adapter。完整 CurrentTarget、holder/grant/archive 的实际认证协议/材料、实际物理容量与 lifetime receipt/audit 保留、正式迁移和生产部署均保持独立待办。

## 历史操作者命令（本轮已验收，无需重跑）

以下保留本轮操作者入口供追溯，不再请求重跑。本轮由用户执行，A 只核对回传结果；再次运行会重新冻结当时源码，产生不同范围的独立回执。

```powershell
$authorityStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$authorityExit = 1
Start-Transcript -Path ".\docs\evidence\a-maintenance-authority-remote-$authorityStamp.txt" -NoClobber
try {
    & .\scripts\system-backup-a-config-maintenance-authority-mysql-validation.ps1 `
        -Remote -BuildParallelism 2 `
        -SourceManifestPath ".\docs\evidence\a-maintenance-authority-remote-source-$authorityStamp.json"
    $authorityExit = 0
} finally {
    Write-Host "a_maintenance_authority_remote_exit=$authorityExit"
    Stop-Transcript
}
```

只有八个指定叶子各自 PASS、准确同轮 binary/inputs/source、namespace 精确 UID 清理、owned 行和两端 scratch/cache 清理、进程成功全部齐全时，才接收本项真实 SQL。专属 phase marker 为 `PASS a-config-maintenance-authority-mysql ... synthetic_verified_facts=yes actual_authentication=no production_approval=no`。单独的 root PASS、编译/seed 成功或旧 D service/storage 回执都不充分；SSH 失败与实际数据库断言失败分别保留，失败日志不覆盖。
