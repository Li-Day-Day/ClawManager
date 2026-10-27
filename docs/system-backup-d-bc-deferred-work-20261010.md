# D 在 B/C 暂未接入时的执行与交接清单

日期：2026-10-10。依据 [开发流程](system-backup-development-flow.md)、[D 当前授权合同](system-backup-d-historical-authority-freeze-20261010.md)和当前工作树。本文记录可独立推进的工作与接入判据，不改变 v12 主计划、机器合同或 Owner 签收权限。

## 已有证据与当前阻断

- D producer 隔离 MySQL 28 项、历史恢复/撤销九项及 A mTLS 组合专项已有各自限定范围的回执；L1b Manager 行专项第二次远程运行已 PASS，完整退出码为 0，run-owned 数据库、namespace、远端 scratch 和本地缓存均清理。它们不证明当前部署/管理生产适配。
- 当前 `RecoveryFenceManager.ChangeFence` 只变更 L2 撤销行；候选 L1a 部署行与 L1b 管理行尚未由同一生产事务接线。独立的 L1a/L1b 行校验组件和候选 DDL 已存在，仍需原子管理事务、上级授权、审计容量和正式 migration/inventory。
- D 已补 [L1a 部署行 SQL 原语](../backend/internal/systembackupproducer/recovery_deployment_sql.go)：准确 scope 读取、首次插入、epoch/row version 单步 CAS 和 FinalGuard 复读；同包本地用例覆盖插入、停用、CAS 失败回滚及代次回退拒绝。原语尚未接入 `ChangeFence` 的 L2 更新，不能单独作为部署管理入口。
- D 已另增 [L1a/L2 组合事务候选](../backend/internal/systembackupproducer/recovery_authority.go)，由 D 锁 L0/L1a、受信会话锁 L1b，再锁 L2，并在同一事务推进部署/撤销、审计和 FinalGuard。本地 producer 包用例及[隔离 MySQL 专项](system-backup-d-recovery-authority-mysql-handoff-20261010.md)已通过各自限定验收；远程专项的管理身份/审计仍为 fixture，生产适配、首位管理者上级授权和 A/C 签收未完成。
- D 已增[当前部署与准确撤销行的独立授权读取](../backend/internal/systembackupproducer/recovery_authority_read.go)，供未知提交结果之后的新会话观察当前状态；本地门禁与[隔离 MySQL 增量回执](evidence/system-backup-d-recovery-authority-read-mysql-20261010.json)通过。读取结果不归因于先前请求，也不授予恢复权限；远程管理身份仍为 fixture。
- C 的准确原对象只读 Stat profile/独立证明尚未签收；B 的真实 capture、runner、隔离恢复资源与停止确认尚未交接。固定 fixture 只能验证 D 的编排行为，不能形成 artifact 或发布资格。

## D/A 可独立完成的顺序

1. **冻结当前授权边界。** A/D 明确首位管理主体的上级授权、管理 mTLS 当前撤权来源、独立紧急审计容量和管理事务拥有者；D 将 L0→L1a→L1b→L2 锁序及缺行父锁落为同一事务的生产 SQL。`ChangeFence` 单独提交不能作为部署轮转或紧急撤权的实现。
2. **完成 D 的原子管理事务。** 首次部署注册、同身份 pin/profile 轮转、换身份、停用和紧急撤权必须同时推进 L1a 部署 epoch/版本与准确 L2 撤销 epoch；旧身份永不复用。受信管理事实从 A 的 mTLS 校验器进入，每次新事务和 FinalGuard 重查 L1b 独立权限。所有成功结果仅在确定 COMMIT 后返回。
3. **关闭 D 的本地与隔离数据库验证。** 覆盖缺行并发注册、旧 pin/epoch、权限撤销、管理变更与 claim/finish/读取竞争、死锁重试、审计/CAS 回滚及 COMMIT 回包丢失。本地只验证固定代码快照；隔离 MySQL 需单独保留原始退出码、二进制/DDL 摘要、namespace UID 与清理回执。远程测试前向操作者交付从仓库根目录可直接执行的完整命令。
4. **完成合同和部署准备。** A/C 签收字段、锁序和证明形状后，D 才给候选表分配编号 migration、更新 inventory/catalog/schema hash 并重新收集对应现场证据。实际安装升级、collector、Owner adapters、配置激活与四矩阵验收各有独立门禁，不沿用 synthetic 回执。
5. **准备 D 编排和页面接点。** 保持 `/admin/backups` 固定数据入口显式启用；以可替换 fixture 验证任务状态、CAS、幂等、超时、取消、接管、只读预检结果和页面失败/不支持状态。真实数据与 mutation 只在对应 Owner adapter、权限和审计可用后接入。

## B/C 回来时的最小交接

| Owner | 必须交付给 D 的受信输入 | D 的接入与验收 | 缺席期间的状态 |
| --- | --- | --- | --- |
| B | capture/checkpoint/participant ACK、Job UID/generation 与停止确认、隔离恢复资源 inventory/cleanup、restore target/status relay 合同 | 将观察结果绑定 task/attempt 与 fencing；验证取消、接管、超时和资源保留/清理；用真实源卷和四矩阵复验 | fixture 可测试状态机；不得声称真实备份或隔离演练通过 |
| C | committed artifact、catalog 登记/扫描记录、准确原 ref 的 Stat-only profile 与独立证明、版本/checksum/size/expiry | 接入 artifact lease、恢复原行核对与 preflight/verify；验证 profile 轮转及 Range/PUT/Delete/Wrap 拒绝 | fixture 可测试解析和失败关闭；不得导出 ready 或发布资格 |

接入后的端到端顺序是 B capture → A evidence → C artifact/catalog committed → D 原子编排与只读验证 → B 隔离演练 → D 页面与 P0c 运维闭环。每段使用真实受信输出和独立验收回执；任何一段缺失，P0a/P0b 维持未通过。

## 10 月 10 日后续 D 增量（尚未远程重验）

- D 候选原子事务和旧 L2 单独入口现在都拒绝对已撤销行执行 `rotate`；组合事务另拒绝对停用的当前部署做隐式轮转，不会通过旧身份恢复许可。新增包内回归和隔离 MySQL 断言。本轮 `TestRecoveryFence*` / `TestRecoveryAuthority*` 定向 Go 测试通过；新增 MySQL 断言仍待统一远程运行。
- 结果审计失败后重新发起请求的本地用例已通过：失败事务不留 L1a/L2 部分行，只有新的事务才可完成首次登记。该用例不模拟真实 MySQL 死锁，也不授权未知 COMMIT 后自动重试；后者仍只允许独立授权读取。
- 新增撤销行 SQL 写入失败的本地用例：首次请求返回不可用且 L1a/L2 全部回滚，同一准确请求只有在新的事务中重试才成功。定向 Go 测试退出 0，自有缓存已清理。失败由本地假驱动注入，真实 MySQL 死锁及其回执仍未验证；未知 COMMIT 结果依旧不得自动重试。
- D 原子授权的隔离 MySQL 专项现增加管理事务持 L0/L1a/L1b/L2 期间的独立管理读取竞争：读取必须等提交，再同时观察 L1a/L2 新 epoch。带 `systembackup_mysql` 标签的 fixture seed 编译与运行已通过，自有 Go 缓存已清理；该竞争断言本身尚待远端真实 MySQL 执行。
- `Authority` profile 现另含新组合管理事务与 `ClaimRecovery`/`FinishRecovery` 的持锁竞争：提交轮转或撤销后，旧 epoch 的恢复不得更改证据，部署与撤销行须同时处于新 epoch。带 MySQL 标签的本地 fixture seed 已重新编译通过，报告 `real_mysql=not_run` 并清理缓存；真实 MySQL 断言仍待操作者统一远程运行。
- `/admin/backups` 显式开启的真实只读视图增加前台 30 秒刷新、失败时 5–60 秒退避、不可用时 60 秒复查、后台暂停及每次刷新取消旧分页；四类任务首屏及按需后续页读取后复核概览版本。调度固定时钟用例覆盖不重叠请求和停止后丢弃迟到结果；当前页面定向测试 31 项通过，先前 i18n 测试 5 项通过。尚无项目 Vite 构建或浏览器实测，页面真实数据仍受 API 与权限门禁约束。
- 已准备 `scripts/system-backup-d-independent-remote.ps1`，依次运行八种现有隔离 MySQL profile，每项使用独立 namespace 与数据库，保留各自 PASS/清理判据，并在全通过后输出 `EXIT_CODE=0`，任一失败输出 `EXIT_CODE=1` 后抛出。**远程阶段尚未执行**；由操作者在 D 候选代码冻结后从仓库根目录统一运行，不以 A/C 生产签收为候选测试前提。
- 只读 inventory 检查仍为 99 对象、三张 C catalog 表未入 inventory；合同检查为 94 文件、60 项策略已登记、39 项待提交、60 项交叉评审待完成。候选恢复表仍不是编号 migration，不能把上述定向 PASS 视为正式 schema 冻结。

## 统一隔离远程验证入口（待执行）

在 D 侧候选代码与测试冻结后，操作者从仓库根目录运行以下完整 PowerShell 命令并保留原始控制台输出。此候选专项不以 A/C 生产签收为运行前提：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-d-independent-remote.ps1 -SshTarget 'root@10.130.14.23'
```

该入口按 `D,A,Schema,ADeployment,Manager,Authority,AManager,ARead` 顺序运行八个现有隔离 MySQL 专项。每项重新构建 Linux 探针、重放准确 migration、在独立 namespace 与 run-owned 数据库中测试，并清理该项的数据库、namespace、远端 scratch 和本地构建缓存。只有八项各自显示对应的远程 `PASS`、指纹和全部 `CLEANED`，且末尾有 `PASS d-independent-remote profiles=...` 与 `EXIT_CODE=0`，才接受统一通过；脚本在首个失败处停下，输出 `EXIT_CODE=1` 并抛错。不能把旧回执、局部 profile 通过或本地 fixture seed 计作本次通过。

这是候选组件的隔离数据库验证，不给生产恢复或页面真实数据开门。首位管理者的上级授权、独立紧急审计容量、A 的生产身份/历史恢复适配、C 的准确 Stat 证明以及正式编号 migration/inventory 仍各自需要签收与验证。待这些输入齐备后，再安排生产门禁与 B/C 真实接入后的端到端验收。

2026-10-10 曾误启动该统一脚本，用户明确远程测试由本人执行后即中止。进程只到第一个 `D` profile 的本地编译，尚未到 SSH；本次临时构建目录已清理。该中止运行不形成任何远程回执，也不计入八项通过。随后本地页面 Node 检查先为 35/35 通过；后续增加按需分页版本漂移用例，页面测试 31/31 通过（另有先前 i18n 5/5）。Go 两包全包检查中两个包的测试均输出 `ok`，但 Windows `vet.exe` 一次异常退出使整条命令退出 1。对失败的 evidence 包单独保持 vet 开启并使用隔离 telemetry/缓存重试，退出 0，报告 `LOCAL_PASS systembackupevidence-vet=yes` 与 `CLEANED d-vet-cache=True`。这两条本地结果共同覆盖测试与 vet；它们不构成远程 MySQL 结果。

## 操作者首次统一运行的部分回执

操作者粘贴的 2026-10-10 控制台输出（SHA-256 `9a68ca49298df674133a8b18853ea0e77120c816769327f5d57af228c22a3ad5`）显示 `D`、`A`、`Schema` 三项各自完成 94 文件 fresh migration replay、目标 MySQL 测试、探针/DDL 指纹和 run-owned 数据库、namespace、远端 scratch、本地缓存清理，并分别输出 `PASS d-independent-remote profile=...`。三项 namespace/UID 依次为 `sbk-mig-261010073124-3a83` / `7fa2c8a1-8218-4639-a83c-2e049a17282c`、`sbk-mig-261010074431-2793` / `c1325e1f-ae71-4ce9-8fa1-8f8bc92cfd39`、`sbk-mig-261010075533-2f07` / `83105be2-c4aa-4737-a822-277e21ed7252`。它们只证明各自运行时快照，不是八项统一通过。

统一脚本随后在 `ADeployment` 的**本地** `TestDeploymentBoundHistoricalAuthorityChecksL1aAndFinalGuard` 停止，输出 `permission_denied`、`CLEANED local-registration-build-cache=True` 和最终 `EXIT_CODE=1`；该项未进入 SSH，后续 `Manager`、`Authority`、`AManager`、`ARead` 均未运行。原因是测试替身继承了拒绝 `LockReferences` 的默认方法；并行修改时短暂出现两份同名方法，现已合并为一份并验证。修复后 `ADeployment` 完整本地 profile 退出 0，报告单元测试/vet、Linux MySQL 探针、pinned migration runner 编译通过及缓存清理；后四项管理相关单元测试的合并本地检查也退出 0 并清理缓存。**修复后的远程八项统一回执仍待操作者重新运行**；首次部分回执不可拼接成新快照的统一 PASS。

## 2026-10-12 D 并行增量

- `TestDRecoveryAuthorityMySQL` 新增真实 L2 行锁等待取消：另一连接持有准确撤销行锁时，管理变更不得返回授权；释放锁后，L1a/L2 仍为旧 epoch/版本。该断言已编译进入 MySQL tag 的 fixture seed，但真实 MySQL 尚待操作者同轮远测。
- D 原子授权定向 Go 测试与 MySQL fixture seed 本地通过，专用 Go 缓存和临时目录已清理；本地结果不替代隔离 MySQL 回执。
- A 并行新增 `ABootstrap`、`ARevoke`；当前统一入口实际为十个 profile。上文八项描述及首次部分回执保持其当时的历史范围，不能拼作十项通过。A 侧代码冻结后由操作者运行当前脚本，逐项核对同轮指纹、退出码和清理。
- 独立审计卷的部署输入与验收顺序见[预检清单](system-backup-d-recovery-audit-deployment-preflight-20261012.md)。A 的本地 journal 测试已具备，生产专用卷、预留容量、单写者与故障注入回执仍待完成。
- 新增[只读 PVC/PV 预检脚本](../scripts/system-backup-d-recovery-audit-storage-preflight.ps1)，检查准确 UID 绑定、受审 StorageClass/CSI driver、卷别名、`ReadWriteOncePod` 与申请容量。PowerShell 语法通过；模拟 Kubernetes JSON 的正常绑定、容量不足、错误 driver 和 CSI 卷别名拒绝均通过。未连接实际集群，脚本输出不能代替存储后端物理预留或 journal 接线验收。
- 页面只读联调现状重验：`node --test --test-isolation=none frontend/scripts/system-backups.test.mjs frontend/scripts/system-backups-i18n.test.mjs` 本地 36/36 通过、退出 0，无构建产物。默认 Node test worker 在当前沙箱 `spawn EPERM`，故使用同进程隔离模式；该结果仍不覆盖 Vite 构建、浏览器计时、正式权限或真实数据库响应。
- 四类任务表、分页、配置脱敏与总览来源的[真实只读查询边界](system-backup-d-live-read-query-boundary-20261012.md)已整理为 D/A 交接输入；D 另增不暴露 HTTP 的数据库任务页读取器，要求 A 受信安装授权与 FinalGuard 才能返回行。现有后端仍只注册 fixture 处理器，生产 DTO 和 `system_backup.read` 仍未实现，因此不打开真实读源。

## 当前十项统一远测交接

以上八项文字保留 10 月 10 日的历史快照。当前脚本依次运行 `D,A,Schema,ADeployment,Manager,Authority,AManager,ARead,ABootstrap,ARevoke`，其中 D `Authority` 已包含新增的真实 L2 锁等待取消断言。A/D 候选代码冻结后，按既定约定由操作者在仓库根目录执行：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-d-independent-remote.ps1 -SshTarget 'root@10.130.14.23'
```

仅当十项逐一报告本轮准确二进制/DDL/migration 指纹、对应 MySQL `PASS`、run-owned 数据库及 namespace UID、远端 scratch 与本地缓存 `CLEANED`，且最终有 `PASS d-independent-remote profiles=D,A,Schema,ADeployment,Manager,Authority,AManager,ARead,ABootstrap,ARevoke` 和 `EXIT_CODE=0`，才登记本轮统一通过。任何一项失败、清理不明或无最终退出码，保留原始输出并记为未通过；此前分项回执不能拼接。当前仓库尚无这十项同轮远测回执，D 不代操作者运行。

2026-10-12 操作者后续分段运行：前段 D/A/Schema/ADeployment 的终端输出未保存，Manager 的部分输出已贴在会话中，显示其 MySQL PASS 和清理；Authority 首次在本地门禁后 SSH 密码提示超时，未创建远端测试。续跑原文已保存为[Authority/AManager 回执](evidence/system-backup-d-authority-amanager-remote-20261012.txt)：Authority 真实 MySQL 两项通过，run-owned DB、namespace、远端 scratch 和本地缓存均报告清理；AManager 则在 `PinnedDecision` 的 `artifact_unavailable` 和 `Combined` 的 MySQL 1146 失败，其三项测试数据库、namespace、scratch 和本地缓存均报告清理，ARead/ABootstrap/ARevoke 尚未执行。该失败不是通过回执。定位到 AManager 的隔离探针 DDL 未装配生产 `users`/`audit_logs`，而两项测试都需要写审计表；同一缺口也会影响后续 ABootstrap/ARevoke。验证脚本现仅为这三个管理 profile 增加 001 migration 的准确建表语句，`users` 在 `audit_logs` 前。本地 AManager profile 已通过语法、Go/vet、探针和 DDL 生成并清理缓存；新 DDL SHA-256 为 `2474fbc894ada0607ec88e5a2a0d9056a249798d8e07e48d76f7e090aaec0f82`，真实 MySQL 仍需从 AManager 续测。分段回执会明确记录各项来源与缺失，不宣称原十项入口的单次 `EXIT_CODE=0`。

其后操作者分段续测的[AManager/ARead 日志](evidence/system-backup-d-amanager-resume-20261012.txt)显示：AManager 的 pinned decision、L1b adapter 和完整组合事务三项真实 MySQL 用例均通过；ARead 的授权读取用例通过。两 profile 各自具备数据库、namespace、远端 scratch、本地缓存 `CLEANED`，迁移 runner 和二进制指纹一致；AManager 新 DDL 为上列 `2474fbc8…aaec0f82`，ARead 沿用未变的 `0cb33ce1…fa60`。A 同轮另保存[ABootstrap/ARevoke 粘贴回执](evidence/a-bootstrap-revoke-remote-user-paste-20261012.txt)，两项均报告真实 MySQL PASS 和四层清理，使用相同新 DDL 指纹。原始 PowerShell transcript 对 ARevoke 输出不完整，故以该粘贴回执作为其可审阅证据。以上分段验证关闭此次 AManager 探针装配失败；D/A/Schema/ADeployment 的原始终端输出仍缺失，不能报告十项统一入口的单次 `EXIT_CODE=0`，也不代表生产接入或 B/C 真实集成完成。
