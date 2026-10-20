# D 历史 producer capability 下载 owner

【r47 后续】[结果审计保留关联](system-backup-d-download-result-retention-20261019.md)新增结果 receipt/FK 及 L3 引用，封闭目录由本页 r45 的 23 列增至 25 列；原任务/producer/公开清理随五完整包含当前 server 692/5,435 回归通过。tagged/脱离 checkout seed 各 12、Windows/Linux 构建和本轮三个自有目录清理齐全。当前 A 三份启动诊断脚本并发差异单列，r47 只按原 1,397 来源接收；正式 schema/grants/组 GC、实际 SQL及原六项仍缺。

【r45 最终接收】[独立回执](evidence/d-download-producer-owner-packages-20261019-r45-review.json)接收 security/evidence/read/producer 四完整包 **682 主/5,387 含子项**，D 新 producer/公开清理十根/50 项，A 原绑定变更一根/6 项及 native/body/输出三根/23 项；默认 vet、无跳过、Go/native/包装退出 0。冻结 1,394 输入，SHA `2289da2fd399741232619698d8decd972d959d08335fabae8aa56f06a762032b`，接收时当前来源零漂移。[清理回执](evidence/d-download-producer-owner-cleanup-20261019-r45.json)确认累计十五个准确自有目录不存在；两个 PowerShell 的路径检查各十一项通过。未安装依赖、未延长请求/proof/claim/provider/结果事务期限。实际 InnoDB/物理容量/部署 provider、正式 schema/grants/GC、其他 owner 与原六项继续未完成；未重跑当前 server、前端或浏览器。

在[四任务 owner 适配](system-backup-d-download-task-owner-20261019.md)之上新增 `NewSQLDownloadOwners`，明确配置逻辑存储 Root；旧 `NewSQLTaskDownloadOwners` 保持只接受四任务 owner。新构造器额外接受有真实 producer 历史绑定的 system/capability_snapshot，不为其他 system 类型或其他 owner 猜测期限。本轮没有启用生产 main 或安装正式迁移/grants。

## 原始绑定与当前授权

当前 session/credential/revocation、分类所需 RBAC 和 actor context 继续使用四任务适配的实际实现。原 owner 依据 `system_backup_producer_runs` 与 `system_backup_producer_evidence_bindings` 的真实 C1 行：按连接的 server UUID/database/installation 解码完整 canonical frame、record digest 和所有 SQL 投影，检查唯一 run/history、run/grant/generation/target/input/observation、原 owner 写入截止时间及 evidence 身份。仅有 JSON 或一个投影 deadline 不授权下载。

完整 manifest 解码后，按历史 store/write/KEK/recovery profile、content/object/manifest hash、字节数和精确 relative key 比对。pending 历史绑定通过 detached copy 比较，实际 ready 行的 immutable version 不被清空或改写。存储 Root 必须来自构造配置，不能从请求或历史路径猜测。

保留期限不得短于原 history retention，证据创建时刻必须准确等于原 history created_at，原写入 deadline 必须大于原创建时间。原写期限、观察期限已过或 run 已 superseded，不自动撤销仍在保留期内的读取权限；它仍要求当前用户权限，但不要求已终止/轮换的 producer 执行租约重新有效。

## 引用与结果事务

producer result receipts 在 L3、run/history 在 L4、producer evidence_refs/hold 在 L5；标准 Operation/receipt、四任务持有者和其他逻辑引用保持原顺序。包括 producer 安装存在但本次下载属于 task owner 的空区间，均按该层级锁定。**r32 的 optional producer 空区间曾集中在 L5，本轮已修正**；不以当轮未执行的新安装场景扩大旧回执。

四种 producer 引用表的 schema 仍须完整可见。结果 receipt 必须通过严格 decoder 与原历史 evidence/精确对象版本、run/grant/domain/admission/target/input/observation 比对。所有引用共享原 10,000 行预算，排序/重复/跨 scope/损坏投影均拒绝；reference_kind 依实际 MySQL ENUM 顺序检查。SQL 在读取正文之前按各表 8/16/32/96 KiB 上限截断非法值为 NULL 并拒绝。receipt/ref 逐行检查，不累计完整 canonical 正文；run/history 只允许一个唯一行。

独立结果事务使用同一个 source 锁住原 owner/ref，并按已知提交凭据再次检查原 manifest、期限和绑定。用户撤权不阻止记录事实；历史绑定漂移则回滚结果审计和原 claim 释放。最终复查只读取已经取得的前缀，不新取 L3+ 锁，provider 仍使用原 claim/Range/期限。

## 验证

- r33 首轮定向通过其原冻结来源；后续增加显式 Root、receipt/hold 和原对象比对。
- r34 定向通过 17 主/96 含子项，其中新增 producer 七根/30；包含原十根/66 的四任务回归，默认 vet、无跳过、native/包装 exit 0。
- r35 首轮 security/evidence/read/producer 四完整包通过，仅覆盖当轮冻结来源；之后新增正文 streaming 和独立结果锁阶段的原 manifest 检查。
- r36 整轮未通过。三个坏 receipt 已在新 owner 锁阶段提前拒绝，测试仍期待到 Preview 才失败；原 deadline 的 +1µs 测试又超过夹具自身 retention，严格 C1 编码器在目标 SQL 前拒绝。已更新提前拒绝断言并使用保留期内的 -1µs 原期限漂移，失败日志保留。
- r37 四完整包通过 **679 主/5,365 含子项**，其中本轮新增 producer 八根/34；默认 vet、无跳过、native/包装退出 0，五个快照与自有缓存六个准确目录清理。其 1,390 来源冻结版 SHA `a33c3334f36b74d23331f4add24d10d2f7e838ee1c4871dd07fcc25bc8430a31`；[原复核](evidence/d-download-producer-owner-packages-20261019-r37-review.json)记录随后两项并发脚本漂移，未声称当前全来源匹配。
- r38 原拟仅复核两份未被 Go 调用的 PowerShell 路径脚本；捕获时又新增 `download_producer_owner_a_test.go`，闭集检查正确拒绝并清理源目录，没有把旧 Go 回执扩大到新测试。
- 新 A 回归额外覆盖成功准入后，原 receipt manifest/版本/grant 或 owner deadline 被重新编码成有效 C1 行时，提交后授权和独立结果/claim 释放都须拒绝。D 将其结果事务提交次数断言改为相对于 `beforeResultCommits` 的增量，保留全部失败、零结果与不释放 claim 的断言；授权检查自身正常提交只读事务，不能漏计或误当成结果写入。
- r39 冻结 1,392 来源，包含新 A 回归及并发路径脚本；新脚本在同一冻结源码的 Windows PowerShell / PowerShell Core 下各 **11 项**通过、无输出产物。新 A 根通过六项，但 evidence 整包在 300 秒 watchdog 处超时；当时 `TestSystemPublicationClaimAfterSlowLocalSetup` 才运行五秒，仍在原六秒慢设置验证中。其余三包终态 PASS；不接收 r39 为完整通过，原日志保留。
- 后续仅将外层 package timeout 改为可配置 300..1800 秒、默认 900 秒。请求/proof/claim/provider/结果事务预算不延长，默认 vet、不跳过测试及离线依赖约束保持。r40 开始复验下节公开下载清理与已有 owner 回归；其失败和后续修复分别保留，最终接收见 r45。
- r40 测试模型在公开清理时仍要求私有 intent/reservation，并在 SQL driver 内 Fatal，形成已确认清理等待。D 核对 PID 42928 的 exe 完整路径位于该轮准确 source owner 后，只终止了这个测试 exe；native exit 1/完整日志/自动快照清理保留。模型将公开清理与私有准入区分，非法顺序返回 driver error，避免 Goexit 占住 database/sql 锁。
- r41 公开清理十六项通过；新增 A 采样测试的 nonce 预期时间未同步，整轮仍失败。r42 同步预期 `ProofAcceptedAt` 后通过 21 主/122 含子项，不更改签名 auth_time/expiry 或准入后的限期。
- r43 整包未接收：并发 native 测试先采用了较早版本的采样 helper；公开 HTTP 测试固定 SQL 假时钟，在稍慢宿主超过五秒观察新鲜度后被正确拒绝。当前 helper 同步验证结果；公开 HTTP 夹具在 SQL 查询时采样实际时刻，claim/session/config 原限期不更新。r44 扩展定向通过 **27 主/169 含子项**，包含 A native/body/输出回归；该轮与 r45 分别按自己的冻结输入计数，不把跨包同名测试混算为 A 文件的根数。r45 四包全部通过，逐包为 security 253/1,985、evidence 279/2,099、read 75/519、producer 75/784；最终回执及清理见页首。

## 公开下载的独立 claim 清理

补查真实 SQLPolicy 接线发现，旧 public/internal HTTP 的结束事务使用 Background context；新的用途受限策略要求已验证 actor context，因此可能在正文已经返回后无法释放 claim。不能通过给 Background context 授予读权限来补这个缺口。

新增 package-private `SQLRegistry.finishPublicDownload`，只由 HTTP 结束路径调用，接受服务器在成功 claim 事务后持有的原公开 Record。它使用同数据库/安装的具体 owner 实现，按当前 L0/L1 与原 owner/ref 前缀锁定，复查实际 origin、完整原 manifest/ref/期限及精确 claim/row_version，然后使用原释放 CAS 清理 claim 并回读；不授予读/provider/audit/producer/GC 权限，不产生 Operation/nonce/审计或新 reservation。已撤权、请求取消或原 claim 期限已过，都不阻止清理仍然准确属于本请求的公开 claim。私有分类、另一个 claim/row_version、变更的 owner 和版本上限拒绝，commit 不明不重试。

该边界对两种具体 owner 构造器生效；其他已有策略维持自己的旧结束路径。清理失败使用另一个独立五秒 failure context，不把耗尽的结束事务预算传给故障 sink。新增实际 HTTP 公开/内部 Range、撤权/取消、释放失败，以及独立 CAS、私有拒绝和 unknown commit 回归，已由 r45 冻结回执接收两根/16 项；不据此扩大为真实 MySQL 验收。

本轮 SQL transport、行数据、容量报告、身份材料与 provider token 都是本地夹具。新增路径执行真实原子准入、当前 SQL provider/frame/unwrap 检查、实际密文/明文解码以及撤权后的独立结果 SQL；不代表实际 InnoDB、部署的 STS/KMS、物理容量或生产运行材料已经验收。未重跑当前 server、前端构建或浏览器，未安装依赖。

## 后续来源缺口

- system 的其他 evidence 类型不自动具备上述 producer history，仍拒绝。
- staging/restore resource/promotion 的已发布行没有本次外置证据原始写入截止时间；清理/人工证明可发生在 parent task deadline 之后，不能直接借用父任务期限。
- prune run 的 070 行没有独立 deadline_at；confirmation/candidate expiry 或可变化的 last_operation 不是原证据截止时间。external-action 的 dispatch_deadline 也不等于所有后续 evidence 的不可变写期限。
- catalog scan/record/import 仍需正式 C schema 与原 owner 绑定来源。这些类型需要在原生产/登记事务中持久保存可复查的不可变绑定，不能通过现在补 `now+TTL` 回填旧行。
- 正式 owner schema/grants/元数据可见性、实际物理预算与 durable failure sink、结果审计保留组 GC、整链真实 MySQL、生产 main/部署和[原六项](system-backup-d-six-scope-readiness-20261015.md)继续未完成。
