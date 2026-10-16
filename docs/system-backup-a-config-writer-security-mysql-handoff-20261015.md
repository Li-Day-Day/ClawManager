# A：配置 writer 的 MySQL 安全竞态专项

【2026-10-15 操作者远测已接收，无需重跑】14:28:59 的[原始日志](evidence/d-config-writer-remote-20261015142859.txt)及[D 限定验收](evidence/system-backup-d-config-writer-mysql-accepted-20261015.json)已核对：原八项与本页六项叶子用例各自 PASS，完整 94 文件 catalog 重放成功，冻结输入为 1,243 项、摘要 `228ded21baa0e4132a9dc3694db934de5bb69fb96231b11d29c1a522fc1af07e`。本轮 namespace `sbk-mig-261015064313-7655` / UID `7b0728b7-88a4-4cb8-aedc-5f1baf79a289`、远端 scratch 和本地缓存均报告清理；68 个本地生成路径另经 A 确认不存在。日志及 manifest SHA 与验收记录一致。此项关闭以下历史“待远测”状态及旧夹具失败的重跑待办；不覆盖后续 backfill/maintenance 新代码，不批准实际 grant、081/082 正式迁移或生产接线。readiness/capacity 仍为 synthetic。下面本地准备、失败历史与命令保留原轮次范围，当前不要求再次执行。

本项在 D 的 [writer 候选入口](system-backup-d-config-writer-mysql-candidate-20261015.md)增加六项 A 安全检查。新的 [Go 场景](../backend/internal/systembackupsecurity/config_writer_security_a_mysql_test.go)复用准确 run namespace/UID/server UUID、完整正式 catalog、隔离候选 canonical 列和真实 JWT/SQL 会话/file RBAC/Operation adapter；资源 readiness、容量和安装/密钥材料仍为明确合成夹具。不是生产授权、HTTP 路由启用或历史 canonical 回填。

## 六项新增真实数据库场景

| 场景 | 必须观察的事实和结果 |
| --- | --- |
| session 行锁期间撤销 | 独立 worker 固定真实 CONNECTION_ID，从 performance_schema 确认它在准确 session 表上等待 InnoDB 行锁，再提交撤销；返回 permission，零 mutation 副作用。 |
| session 行锁期间到期 | 开始时 JWT/session 尚有效，观察同一真实行锁等待后，读取数据库 UTC 达到原截止再解锁；不以宿主机 sleep 作为到期证明。 |
| config CAS 后 session 到期 | 同一调用者事务可见新 active version，确认 SQL 写入阶段已发生；在最终 authority 回调内等到数据库截止，要求最终新时钟拒绝并整笔回滚。 |
| config CAS 后 proof 到期 | 使用实际 TOTP issuer 的一分钟 proof，保持 synthetic capacity 更长，等待数据库观察 proof 过期；要求 expired，而不是旧时间通过或返回部分结果。 |
| 锁外 preparation 撤权 | 实际初次事务已释放，在准备回调通过独立连接提交 session 撤销；新事务必须拒绝。 |
| rollback 降低保留期 | 先合法增加 artifact/evidence retention，再 rollback 到较低原值；缺 proof 拒绝且不占 key，真实 MFA proof 后追加新版本/nonce/审计，已提交重放不需新 proof、不重写 SQL。 |

负测均比较 active pointer/state row version/config/operation/evidence/nonce/config audit 的前后数量，并要求空 mutation 结果。worker 通过独立清理 context 取消、排空并关闭连接；夹具仍按准确安装和外键顺序清理。

`waitConfigWriterADBExpiry` 只接受当前数据库样本达到固定 UTC 截止；取消、查询错误、零/倒退时钟或没有进展不能冒充成功观察。九项无数据库 seed 覆盖该辅助检查及合法的保留期夹具；它们不是上述六项真实 MySQL 已通过的证据。

## 派发与独立运行

原 D root 增加 `a_security` 子组，默认完整 writer 套件包含原八项加新六项。新增 `-SecurityOnly` 使用严格的 Go 子测试筛选 `^TestDConfigWriterMySQL$/^a_security$`，仍执行完整隔离 schema/候选准入，但跳过原八项场景；当原八项已单独验收时可只执行新增部分。派发选择当前 SHA 固定 binary/inputs 与 [A 专用 phase](../scripts/system-backup-a-config-writer-security-phase.sh)，不通过任意用户 test regex 改写覆盖。

本地 seed 同时运行 D capsule 检查与 A clock/rollback fixture 检查，并从空 CWD 执行独立 Windows binary；随后构建 Linux 探针和 migration runner。全部使用现有依赖、只读 module/local toolchain，结束清理拥有目录。首轮 PowerShell 派发通过；Git Bash 在 sandbox 内因 signal pipe 权限失败，未完成语法检查；使用现有 Git Bash 的只读 `-n` 检查后已通过，见[语法回执](evidence/a-config-writer-security-shell-local-20261015-r2.txt)。没有执行脚本体或远端动作。

## 已观察的旧远测失败与后续修订

操作者 [13:38 transcript](evidence/d-config-writer-remote-20261015133802.txt)在 `sbk-mig-261015054957-2b5a` / UID `4e9846f8-1d8b-4aa4-9047-968b1e73a571` 上通过完整 94 文件迁移，但首个 writer 子项在初始化夹具时返回 MySQL 1364，未进入 mutation；不能视为八项已通过。D 的[失败记录](evidence/system-backup-d-config-writer-mysql-failed-20261015.json)保留该范围和清理结果。

当前共享夹具已由 D 补齐 065 要求的 `last_effective_enabled_transition_at`、`matrix_key`，并增加真实 DDL/独立 seed 对照。A 保留该修订，不改变正式 065/066 或为生产表增加默认值。远测失败发生在 A 六项加入之前；新六项仍等待操作者实际执行。

另 A 核对完整 066 后发现此前 [行指纹合同](system-backup-a-config-backfill-identity-handoff-20261015.md)的字符预算结论错误：实际 CHECK 是 UTF-8 字节预算，并禁止空非 NULL 原因。[纠正审计](evidence/a-config-backfill-identity-schema-audit-20261015.json)与[合同修订 2](evidence/a-config-backfill-identity-contract-20261015-r2.json)收回该结论，合法行的原 JCS/domain/hash 不变。新门禁还用临时 Go overlay 把字节上界错改为字符上界，必须检出两个多字节溢出；旧向量和回执保留历史范围。

远测签收必须看到 `TestDConfigWriterMySQL/a_security/` 下六个指定叶子用例分别 PASS、进程成功和准确清理；只有 root PASS、phase 打印或本地 seed 通过均不充分。proof 到期项会实际等待约一分钟的数据库截止，这不是本机人为推进时钟。

## 本地准备验收与准确范围

[r3 接收记录](evidence/a-config-writer-security-review-20261015.json)固定 1,243 项输入，摘要 `bd35ae7fc7330407bfb51c64df742d87be74b6096fdd9ab2db34a619b4dcd787`。完整 security 包 195 主测试/1,293 子用例通过，tagged seed 2/16 通过；相同 2/16 又从空 CWD 的独立 Windows executable 通过，重复覆盖不叠加。默认 vet、进程 exit 0；一次 test-vet 和一次 Linux 编译的已知 Windows 工具故障各重试一次，没有断言失败重试。完整日志见[r3 输出](evidence/a-config-writer-security-local-20261015-r3.txt)。

Linux probe SHA-256 为 `03b896c363b8b874ed84c44f6144c9d655b62eb87abe15be2ab26a17f657bb6d`，inputs capsule 为 `f5f9eaef4e20b3620caf48304154705f4ae27a0adfa37a7e6f0b06b9f408a999`，migration runner 为 `caf766a72e57b0b8956653387c15ba9109efc329cf10a5b20e88352adf54f978`。六项真实 MySQL 场景已编译、实际执行 0 项。

源码副本和嵌套构建 cache/tmp/telemetry/独立 executable、overlay 均清理；准确 owner `.tmp-d-index-cache-1ca906fb721e45c3a125c40a5ab84819` 和日志的 67 个不同 fixture 路径已独立确认不存在。首轮旧候选通过但被后续修订替代；r2 的两个旧 D 正向夹具与正式字节约束不符而失败，两轮记录均保留，未放松生产检查，准确产物均已清理。

writer 探针 r3 与后续纯行指纹 DECIMAL 修订分别固定验证。四项后续行指纹输入漂移不据本 Linux probe 接收；它们由[行指纹 r4](evidence/a-config-backfill-identity-review-20261015-r4.json)的完整 security/config 216/1,412 检查单独接收。D 后续新增维护收据文件另审，不能把这两份回执写成最新整个工作树已验收。新的操作者命令会重新冻结和验证当时全部输入，任何本地失败都在 SSH 前停止。

## 操作者下一次命令

当前原八项在夹具初始化失败，尚未验收，因此建议在仓库根目录 PowerShell 使用默认完整 writer profile，一次运行原八项与新六项。无需重跑已经接收的业务十五表或管理读取专项；fresh catalog replay 是这个隔离 writer namespace 的建库前置。

```powershell
$writerStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$writerExit = 1
Start-Transcript -Path ".\docs\evidence\a-config-writer-security-remote-$writerStamp.txt" -NoClobber
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 -Remote -BuildParallelism 1 `
        -SourceManifestPath ".\docs\evidence\a-config-writer-security-remote-source-$writerStamp.json"
    $writerExit = 0
} finally {
    Write-Host "a_config_writer_security_exit=$writerExit"
    Stop-Transcript
}
```

只有原八项已另行验收、现在只补 A 六项时，才在同一 wrapper 命令额外加 `-SecurityOnly`。本轮 A 没有执行上述远测命令，没有安装依赖、签发实际 grant、启用生产路由或执行历史回填。
