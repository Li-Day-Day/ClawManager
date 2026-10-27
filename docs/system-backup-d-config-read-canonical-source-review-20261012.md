# D：Admin 配置真实读源的 canonical 快照缺口

日期：2026-10-12。此页是 D 的 schema/读源评审输入，不是已批准 migration，也不启用生产配置读接口。

## 已核对的当前状态

`admin-control-resources.schema.json` 的 `ConfigResource.config` 要求完整 `ConfigValues`，其中 `registries` 恰有九项、`references` 恰有二十项。`DecodeBootstrapConfig` 计算 `config_sha256` 时保留两个数组的输入顺序，并明确不排序。`BootstrapConfig.sqlValues` 则把每项展开写入 `system_backup_configs` 的各个固定列。`066_add_system_backup_config_and_operations.sql` 存储 hash、字节数和展开列，没有保存 canonical JSON，也没有保存两个数组的顺序。

因此，同一组展开列可对应多个数组顺序和不同的 canonical hash。现有表无法仅凭自身重建原始 canonical 字节并验证 `config_sha256`。使用任务表的 `config_snapshot_json` 也不成立：任务可能不存在、属于旧版本，且原始任务快照不应被 Admin 配置读端点直接序列化。当前真实配置资源必须保持 `not_ready`，不能以猜测的数组顺序或示例配置返回 200。

## D 候选收敛方式

1. 通过独立追加 migration，为每个配置版本保存**准确的 canonical ConfigValues 字节**，同时约束长度、JSON 有效性与现有 `config_size_bytes`；读端重新计算 SHA-256 并与 `config_sha256` 比较。读端只从受信安装和准确版本读取该快照，在同一事务内完成 A 的读授权与最终复查，并按 ConfigValues 闭集解码，不回传其他原始列。
2. 新配置写路径在写入展开列的同一事务写入同一份 canonical 字节；hash、size、快照和展开列都从同一已验证 ConfigValues 对象计算。针对启用/更新、未知提交和回滚分别验证没有“展开列已提交、快照缺席”状态，并核对快照与展开列逐字段一致。
3. 现存版本需要从其原始受审配置材料找回准确字节，逐条验证 hash/size 及与全部展开列一致后回填。若无法证明准确原文或列一致性，该版本的 Admin 配置详情保持未就绪；不得重排数组、改写旧 hash 或拿任务快照回填。
4. 在隔离 MySQL 验证版本切换、旧版本读取、缺快照/损坏/跨安装、读授权撤销竞争和数据库错误失败关闭；经 A 与合同评审后再编号 migration、更新 inventory/schema hash，并接 HTTP 路由。

这项候选只处理 D 配置读源，不代替 A 的 `system_backup.read` 授权，也不改变 B/C 的资源事实或既有任务状态。

## 本地候选进度

[候选 DDL](system-backup-d-config-canonical-candidate-20261012.sql)以可空 `canonical_config_json` 保留旧行失败关闭状态；仅在准确原文经 hash/size 核对后才可回填。它尚未编号、执行或纳入 inventory/catalog，现有 bootstrap 写路径也尚未改为同事务写快照。

[内部读取器](../backend/internal/systembackupread/config_snapshot.go)已经按当前受信安装及 active version 读取该候选列，并在同一事务中完成授权前置和最终复查；长度、UTF-8/JSON、SHA-256、版本与元数据异常均失败关闭。它返回禁止直接 JSON 序列化的内部类型。现有 schema 因缺列返回 `ErrUnavailable`，现有旧行即使完成候选 migration 也因快照为空而返回 `ErrUnavailable`。本地包测试覆盖正常行、hash 不符、缺快照、跨安装、撤权、缺行和 SQL 错误，`go test ./internal/systembackupread -count=1` 离线通过，专用缓存已清理。

后续本地增量：[ConfigResource 投影](../backend/internal/systembackupread/config_projection.go)已加入合同闭集字段、数值范围/跨字段关系、九类 registry、二十类 ref、签名身份隔离、重复 JSON 键和额外字段拒绝；[规则快照](../backend/internal/systembackupread/config_projection_rules.go)固定当前 schema SHA-256，变更合同需重新生成并评审。服务现在可把已授权且 hash/size 正确的内部快照投影为 v12 `ConfigResource`，仍未注册 HTTP。包测试以完整 redacted 配置 fixture 覆盖正常投影和越界/多余字段/撤权拒绝，离线 `go test ./internal/systembackupread -count=1` 通过，专用缓存已清理。候选迁移、同事务新写、旧行回填、A 生产授权与真实 MySQL 尚未完成，默认读源仍关闭。

再后续 D 本地加固：内部 active-config 查询在同一受信安装事务中固定投影全部展开列，并用共享锁保持安装指针与配置行到提交；[逐字段比对](../backend/internal/systembackupread/config_materialized.go)要求 canonical 配置与 enabled/profile、所有数值、九类 registry 和二十类 ref 完全一致。任何一列漂移都返回 `ErrUnavailable`，不会在页面与 controller 之间给出两份不同配置。静态检查确认投影列均存在于 `066` migration；本地 fake-driver 分别注入整数、DECIMAL、registry hash 和 ref identity 漂移，均被拒绝。整包 Go 测试通过，专用缓存已清理；真实 MySQL 的列类型、锁竞争和写入成本仍待操作者在候选 migration 评审后验证。

写入准备又增加了 [bootstrap canonical 参数候选](../backend/internal/systembackupsecurity/config_bootstrap_canonical_candidate.go)：同一已验证 `BootstrapConfig` 产生展开列、hash、size 和不别名的 canonical 字节。现有 `Bootstrap` 入口仍使用旧 `sqlValues`，候选列未获 migration/inventory 评审前不会改变当前运行时写入。定向 Go 测试证明候选参数保留原有 132 列及其值，并追加准确 canonical 字节；离线 `go test -p=1 ./internal/systembackupsecurity -run '^TestBootstrapCanonicalCandidateInsertUsesOneValidatedConfig$' -count=1` 通过，专用缓存已清理。这不是同事务写入的生产回执；正式接线须与批准的 migration 同步，并在隔离 MySQL 验证 COMMIT/回滚和旧行回填。

旧行回填准备增加 [只读原文核对器](../backend/internal/systembackupread/config_backfill_source.go)：它在现有 `066` 表上按当前授权安装与准确版本读取原行，核对操作者提供的原始 canonical 字节、存储 hash/size 和全部展开列，最终复查授权后只返回禁止 JSON 序列化的内部回执。它不需要候选列，也不执行 UPDATE。fake-driver 覆盖正确原文、不同但合法的配置、registry 漂移、撤权、缺行和数据库失败；首次离线包测试遇 Windows 编译器 `0xc0000043` 后清理，单进程同源码重试通过且缓存清理。正式回填仍需原始受审材料、A 权限适配、候选 migration 与真实 MySQL 验收。

内部读取器现在也支持按准确版本读取历史配置，供 v12 `GET /admin/system-backup-config/versions/{version}` 的后续接线使用。查询在同一安装状态行上读取 active 指针并对配置行加共享锁；只有所选版本与 active 指针一致才标记 `active=true`，历史版本始终输出 `effective_enabled=false`。本地包测试覆盖精确版本、历史版本禁用生效标记、缺版本、撤权竞争和跨安装异常，离线通过且临时 Go 缓存已清理。HTTP 路由仍未启用，候选列和旧行回填仍需正式评审与隔离 MySQL 验收。

v12 `GET /admin/system-backup-config/versions` 的内部列表链路也已补齐：[固定投影查询](../backend/internal/systembackupread/config_list.go)在同一授权事务中按版本倒序读取，每行复用 canonical、hash/size、展开列及 active 指针校验；[配置专用游标](../backend/internal/systembackupread/config_list_cursor.go)以独立 HMAC 域绑定安装、limit、最高版本和位置；[列表 DTO](../backend/internal/systembackupread/config_list_dto.go)只输出合同字段及 `stable_cutoff`。本地假驱动验证多页、更新后新增版本不进入旧游标、坏行不返回部分结果、篡改和跨安装游标拒绝、撤权与查询失败关闭。这个一致性标签只约束版本集合及分页上界；每页的 `active`/`effective_enabled` 反映该页读取时的安装状态，跨页可随正式配置切换变化。生产 HTTP 接线、真实 MySQL 查询计划与权限适配仍待前述门禁。

## 2026-10-13 隔离 MySQL 候选探针

[候选专项](../backend/internal/systembackupsecurity/read_config_candidate_mysql_test.go)只在 UID 固定、全量迁移后的临时命名空间执行未编号 DDL。它用现有 A 读授权与 D 配置读取器验证旧行缺 canonical 时失败关闭、同事务插入新版本并切换 active 指针、旧 deployment pin 失效、新 pin 读取准确版本、hash/展开列漂移及会话撤权。`-AdminReadOnly -AdminReadConfigCandidate` 是独立开关；普通 AdminReadOnly 流程不会执行候选 DDL。专项脚本对候选文件和 Linux 测试二进制校验 SHA-256，远端 `-test.list` 确认准确测试名后运行，最终由原 UID 命名空间清理流程回收。

配置读取器、版本列表和回填原文核对器已对齐任务读取的授权错误保留方式：内部仍是拒绝错误，同时保留 A 返回的部署不可用或权限撤销原因，供后续 HTTP 正确区分 `503` 与 `403`。本地 `-AdminReadOnly -AdminReadConfigCandidate -BuildParallelism 1` 在该改动后退出 0：A 授权与 D 读取包测试、HTTP 本地测试、MySQL seed 和 Linux 探针编译通过；候选所在二进制 `sha256=bec0a11c0e017be3bfd92ca7a5a432ea9f51d6e00babf7a984f8bca8a8f86ceb`，HTTP 探针 `sha256=d6ae1b49686b353c8cb8c53c894b3b1c7d4325e92cbedd6c2bfd856074f41691`，`CLEANED local-registration-build-cache=True`。首轮本地编译有一次 Windows Go 工具进程 `0xc0000043`，同命令重试通过；最终改动后的本地门禁无重试。本地没有运行真实 MySQL；远端回执见下。即使候选专项通过，也只证明隔离环境中的 DDL/读取行为，不批准正式 migration、历史回填或生产配置 HTTP。

2026-10-13 收到[远端完整 transcript](evidence/d-config-canonical-candidate-mysql-remote-20261013.txt)：MySQL 8.4.8 的全量 94 条迁移后，同轮 A 授权、D 全 schema、D live HTTP 和 `TestDConfigCanonicalCandidateMySQL` 均 PASS。候选测试验证旧行失败关闭、配置版本与部署 pin 同步切换、hash/展开列漂移拒绝和会话撤权；本地/远端测试二进制摘要均为 `bec0a11c0e017be3bfd92ca7a5a432ea9f51d6e00babf7a984f8bca8a8f86ceb`，候选 DDL 摘要为 `2a4ee20f3a7f9ed50f5f402165345ec8e4cfc1cdeaa25d8eda3464e1e0567fe9`。运行身份 namespace `sbk-mig-261013061113-2539`、UID `eaa8215d-3281-4c07-9118-363a24168488` 与清理身份一致；远端 scratch、本地构建缓存清理和 `D_CONFIG_CANONICAL_CANDIDATE_REMOTE_EXIT=0` 均在该 transcript。**候选列及内部读路的限定范围隔离 MySQL 专项通过。** 正式 migration、写入口切换、旧行准确原文回填、配置 HTTP 和完整页面仍未验收。

远程环境从仓库根目录运行以下命令，保留完整 transcript。验收需同轮看到 `TestDConfigCanonicalCandidateMySQL` 的 `--- PASS`、`PASS d-config-canonical-candidate-mysql`、候选 DDL/二进制摘要、准确命名空间及 UID 的 `CLEANED`、远端 scratch/本地缓存清理与最终退出标记；缺少其中一项不得记为真实 MySQL 通过。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-config-canonical-candidate-mysql-remote-20261013.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -AdminReadConfigCandidate -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D config canonical candidate MySQL validation failed' }
  Write-Output 'D_CONFIG_CANONICAL_CANDIDATE_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```
