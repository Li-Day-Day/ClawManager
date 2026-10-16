# D 配置 writer 的隔离 MySQL 专项探针

【2026-10-15 writer 真实 MySQL 已接收】[本轮验收回执](evidence/system-backup-d-config-writer-mysql-accepted-20261015.json)核对 14:28:59 的完整日志与 1,243 文件冻结清单：8 项 writer 与 A 的 6 项安全子用例全部 PASS，94 个正式 migration 精确重放通过。writer 二进制 `70492dc3…3570`、输入 `8d60cc48…cd2f` 与本轮 marker 一致；namespace 精确 UID、远端 scratch、本地缓存报告清理，68 个日志内本地临时路径独立确认不存在。首轮 1364 失败证据保留，本轮关闭其 writer 重跑待办，不重复旧远测。当前四份 backfill 输入已变更，此回执只接收当轮冻结 writer 候选；readiness/capacity 仍为 synthetic，production_approval=no，不能关闭旧原文/运行授权、实际回填、正式 081/082 或生产接线门禁。


【首次远测失败：2026-10-15】[原始远测](evidence/d-config-writer-remote-20261015133802.txt)与[失败审计](evidence/system-backup-d-config-writer-mysql-failed-20261015.json)已接收：94 个正式 migration 精确重放 PASS，但第一个子用例在共享 `newConfigProofMySQLFixture` 中报 MySQL 1364，尚未进入 HTTP writer。夹具 installation-state INSERT 漏掉正式 065 无默认值的 `last_effective_enabled_transition_at` 和 `matrix_key`。现已显式填入合成 DB UTC 时间和 k8s-cluster matrix，补正式 schema / detached seed 必填列对照；没有改默认值或 migration。[r25 修复版本地冻结验证](evidence/system-backup-d-config-writer-fixture-fix-local-20261015-r25.json)已通过：完整安全包 195 主 / 1,293 子测试，本地及独立 seed 各两项主测试、Linux writer 与迁移工具编译均通过。1,243 输入终态无漂移，18 份重点源码匹配，69 个生成路径确认删除，未安装依赖或自动 SSH。后续修复重跑已通过，见文首本轮验收；原失败 run 不覆盖。原 namespace 精确 UID 和远端 scratch 报告清理，69 个本地生成路径已独立确认不存在，不重复该失败 run 或拼入其本地 PASS。

本探针在完整正式 migration catalog 创建的新 namespace / MySQL schema 中，显式安装 SHA 固定的 081 **候选**，执行真实 `ConfigMutationService`、JWT / SQL session、文件 RBAC、inline Operation 收据与 MySQL 事务。它没有安装正式 081、挂载生产路由、修改历史配置、授予回填权限或测量真实容量。资源 readiness、容量 reservation、原因脱敏、nonce HMAC 材料和部署开关均为合成夹具，必须保留 `production_approval=no`。

分组读取/索引远测已经接收并再次独立通过六组严格核验，记录见[分组回执](evidence/system-backup-d-index-group-accepted-20261015.json)；不重复该远测。本专项覆盖它未覆盖的 canonical writer SQL。

## 专项用例

- 通过真实 TLS / JWT HTTP PUT 把 `enabled` 从 false 改为 true，逐字段核对新 SQL 行及 canonical 原文，再 POST rollback 追加新版本恢复原值，保留 `copied_from_version=1` 和历史原文。
- 同 key / 同体返回原始 Operation 字节，零新增 SQL；同 key / 异体和陈旧版本返回 409。
- 在 Operation 插入及 result audit 插入处使用只针对该合成 installation / user 的触发器注入失败，核对配置、active CAS、收据、nonce、writer audit 全部回滚。移除触发器后同 key / 同 proof 才执行重试，验证未遗留 nonce 消耗，并检查真实 operation / audit FK。
- 两个请求都完成锁外准备后同时竞争，检查同 key 只有一次提交和一次原样重放、异 key / 同 expected version 只有一次 CAS 成功。结束前取消并等待全部并发 worker。
- 在真实驱动 COMMIT 已成功后丢弃其回复，仅用 `ObserveCommitted` 读取已提交收据，核对没有重复写入。
- 已撤销 session 与损坏的原始收据均拒绝重放。

## 执行方式

在仓库根目录运行以下 PowerShell 命令。默认只做离线本地测试、独立 seed、Linux 探针及 migration runner 编译；添加 `-Remote` 才连接操作者选定的 SSH 目标。命令会创建新的证据日志和源码清单；所有测试构建产物与该轮源码副本在 finally 中删除。没有依赖安装，Go 的 GOPROXY/GOSUMDB 均关闭，远端镜像只使用节点已缓存的镜像（Never）。

```powershell
$writerStamp = Get-Date -Format 'yyyyMMddHHmmss'
$writerManifest = Join-Path $PWD "docs/evidence/d-config-writer-remote-$writerStamp-source.json"
$writerLog = Join-Path $PWD "docs/evidence/d-config-writer-remote-$writerStamp.txt"
Start-Transcript -LiteralPath $writerLog -NoClobber
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -Remote -BuildParallelism 2 -SourceManifestPath $writerManifest
} finally {
    Stop-Transcript
}
```

源码先冻结，再执行全部后续步骤；A/D 同时开发导致复制期间文件集合或字节变化时，立即拒绝构建。JSON 输入胶囊封闭字段、完整 ledger 文件名、catalog SHA 和候选 DDL SHA 均由探针复核；候选 DDL 的 LF 摘要为 `14db3b88263f0ab3e31e293aa0351bb08da23464d4a0fee8854263d56354cce1`。正式 066 原文保持 `e5abdc933fa6cf20fe4f6d629f6e9c94bc0971460d3cecdd9a7706c812bca3ae`。

远端成功需同时具备八个子用例 PASS、`PASS d-config-writer-mysql`、namespace 精确 UID 删除、远端 scratch 和本地构建目录清理。只看到 Linux 编译或本地 seed PASS 不能登记为真实 MySQL 验收。保留任何失败原始日志及 CLEANUP_PENDING 身份，不混用不同源码/二进制的输出。

## 本地验证记录

[r21 最终本地回执](evidence/system-backup-d-config-writer-probe-local-20261015-r21.json)与[原始日志](evidence/system-backup-d-config-writer-probe-local-20261015-r21.txt)接收安全包 184 主测试 / 1,094 子测试，以及 tagged seed、空目录中的独立 Windows seed 各 1 主 / 7 子，合计 186 / 1,108 PASS。默认 vet、exit 0，无断言或工具崩溃重试；Linux writer 探针及正式 migration runner 已编译。冻结 1,235 个输入，逻辑 SHA 为 `a0e4cddd75aa0dfed8301899736e9577a7d744e21fd9be9e501e92996c78e0d7`，本次七份源码及全部输入在终态与当前仓库一致，69 个专用缓存、源码副本和测试临时路径均已确认不存在。没有安装依赖、执行 SSH 或启动真实 MySQL。

[r19 复制期间来源变化及 r20 准备轮记录](evidence/system-backup-d-config-writer-probe-local-20261015-r20.json)保留：r19 在构建前拒绝 A 新增文件造成的来源集合变化；r20 本地通过，随后为实际 enabled 变更、并发 worker 收尾及 rollback 自引用 FK 清理作了最终修订，采用新的 r21 冻结验收，没有混用两轮二进制。

**八项 writer 与六项 A 安全子用例真实 MySQL 已通过，见文首本轮验收；首轮失败与 r25 修复记录保留。** Windows 沙箱中的 Git Bash 启动因 signal pipe / Win32 error 5 失败，未执行本地 `bash -n`；远端入口在创建测试资源前对实际打包的三个 shell 文件分别执行 `bash -n`。
