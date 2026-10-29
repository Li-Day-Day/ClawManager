# D → 公共 C 当前事实合同修正

基线 `102928ff`。2026-10-28 first-chain 文档列出的接口在该基线不存在；该文档的实现与测试结论不能用于当前树。以本文件和 `backend/internal/systembackupread/current_facts_v1.go` 为新版交接；这不是 C provider 实现或 C 已签收声明。

共享定义：`CurrentTaskFacts.Backup/Preflight`、`CurrentFactsSQL.QueryRow(...).Scan(...)`、`ManifestReader.Read`。事实携带 `CurrentFactsIdentity`，`SchemaVersion` 必须为 `CurrentFactsVersion` (`system-backup-current-facts.v1`)，原 installation/task/row-version 和严格 SQL observation/expiry 开区间必须匹配。完整字段以 Go 定义为准。

D caller 使用 `Reader.ReadBackupDetailCurrentV1(ctx,id,facts)`、`ReadPreflightDetailCurrentV1(ctx,id,facts)`、`ReadBackupManifestCurrentV1(ctx,id,facts,manifest)`。原二参数历史详情方法不变，不能声称它们自动变成当前资格查询。新入口尚未替换 HTTP 装配；C 提供实际 adapter 后由 D 装配。

三种新入口进入原 `readTaskCheckEvidenceControlInTransaction`，同一个 RepeatableRead 事务和 A scope，最后原 `RecheckRead` 与 commit 仍由 D 执行。C 不得另开详情事务、不接收客户端 SQL、不恢复旧未版本化表。SQL capability 固定原 context；延迟 Scan、保留 capability 在 callback 返回后均失败；不暴露 Tx、Begin、Commit 或写 API。它面向受信任内部 SQL adapter，数据库只读权限仍须部署保证。

Backup 当前事实必须逐项匹配原 checksum/registration。当前 usability/reason 必须符合已有枚举与一致性；acceptance-ready 还要求 succeeded/eligible/usable/registration/acceptance digest。Preflight 当前结果仍须原 report/evidence/attempt 检查；functional_test 不得宣称 valid。没有新造 TTL 或成功默认值。

Manifest C reader 负责原 task immutable locator/version、凭据权限、完整 closed schema；D 负责 UTF-8、大小上界、schema/installation/backup_public_id、committed/succeeded 与原字节 SHA256。返回复制的原字节，不重编码。读取前后检查同快照事实有效期，最终再执行 A 复查。8 MiB 为实现上界，不是领域合同新增大小承诺。

已实现：可编译共享定义、D 同事务入口、callback 生命周期和身份/摘要边界。待 C：真实当前 provider/catalog/evidence freshness adapter 和 immutable manifest reader；待 D：其生产装配。六域/finalizer/catalog 正式成品不在本轮范围。

A 协调反馈：本项未修改 `execution_identity.go` 或 `public_jobs.go`，继续复用原 key/authority 链。撤销锁和 DEK 交付应由 A 明确原 grant 的线性化点及 lease 语义；D 不以复制 authority 或新 key 服务替代这一决定。

独立后续交付归 D：`4fe83bcd` 现库导入 profile。须分别提供空测试环境初始化（固定基线 migration、显式 installation/engine/registry/credential fixture，不能伪造生产导入成功）和现库升级（先探测版本与 source inventory、备份和回滚计划、增量迁移/校验、显式 profile 注册、重跑幂等与失败恢复验证）。只改 source SHA 不构成交付；尚未实施或验收该升级路径。

验证：2026-10-29，原生 go test ./internal/systembackupread 通过（34.593s）；GOTOOLCHAIN=local，依赖下载关闭。新增测试覆盖同授权事务、最终撤权/提交失败、跨安装/版本/时限/摘要/非法 acceptance、callback 失效和 manifest 原字节身份摘要。属于 SQL-driver 模型测试，不声称真实 MySQL/provider 已通过。
