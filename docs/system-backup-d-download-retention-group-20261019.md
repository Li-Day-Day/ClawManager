# D 下载保留组的持久读取

【r52 最终本地接收】[独立回执](evidence/d-download-retention-group-packages-20261019-r52-review.json)接收 security/evidence/read/producer 四完整包 **693 主/5,532 含子项**，新增七根/109；默认 vet、无失败/跳过、Go/native/包装退出 0，两个 tagged seed 及脱离 checkout 各 12 项、Windows/Linux probe、Linux runner 和冻结 postcheck 全通过。1,402 输入 SHA `64a5641c8e0eb9d0f788054e80685739e49dfa8b6a0596a78d92a5eab8552b3f`，当前完整文件集合和字节零漂移；[清理回执](evidence/d-download-retention-group-cleanup-20261019.json)确认五个快照及一个自有缓存六目录均不存在，测试临时目录及二进制随 owner 清理。没有安装依赖，D 没有发起远端操作；MFA 九项实际 SQL 的独立接收见下节。

【二十四项实际 MySQL 已独立接收】[D 原始日志/来源复核](evidence/d-download-admission-actual-accepted-20261019.json)接收操作者 16:16 的 A 十三项加 D 十一项、两个 root，24 个不同子库、原 namespace UID、95 文件、binary/胶囊/runner pin、两端清理和退出 0 全部齐全。其 1,402 来源为 F8 冻结，当前生产及 SQL probe 字节匹配；仅普通测试三处异常返回不同，已精确反向重建旧文件 hash，且 r52 另行完整验证。该专项不再待跑；实际 task/producer owner/ref 的完整 InnoDB 范围、现场身份/容量、正式 grants/组 GC 和生产 main 仍缺。

承接 [r47 结果审计关联](system-backup-d-download-result-retention-20261019.md)。原结果事务依赖进程内 `CommittedDownloadAdmission` 的已知事实；重启后的 metadata GC 还需要从 SQL 重建原 Operation、准入收据、nonce、intent 和 result 关联，并验证缺失、歧义或自洽重算后的单表替换。本轮新增 `LockDownloadRetentionGroup` 与封闭的 `DownloadRetentionGroup`，并让现有结果事务实际使用这套读取和最终复查。

## 分层读取

调用者借出已取得当前 L0/L1 scope 的同一个事务，明确传入受审 server UUID/database 和原 Operation public ID。L3 首先读取真实 Operation 投影，再使用原完整 SQL 条件验证 schema、类型、actor、endpoint、状态、空结果、请求 hash、行版本及全部时间；收据的 private/public 正文在 SQL 侧限制为 2..8192 字节，逐列比对 SQL scope/ID/intent/时间和 canonical bytes/长度/hash。private receipt 的解码值只用于表示检查，归属、Operation 与 nonce/audit 都有独立 SQL 来源。

结果唯一键及现有结果关联仍在 L3 锁定。后续由调用者取得原 owner/ref 前缀，再调用 `LockNonce` 取得 L5 原 operation_id 的 nonce 范围；LIMIT 2 检出歧义，包括未知 schema 的第二行。nonce 的十九投影包含实际 schema，不以 WHERE 过滤未知行；安装、subject/session、请求/key、Operation/intent、保留和全部时间关系逐项核对。历史读取使用保留行，不加载已过期原 session、proof、执行 lease 或 HMAC secret，也不续原期限。

L6 以后 `VerifyAudits` 读取有界 intent/result audit；SQL 侧最多返回 8192 字节，result 另按 2048 字节 profile 检查。MySQL JSON 的空白与 key 顺序可规范化，重复 key、嵌套值、额外字段、尾随正文、非原整数表示和非原时间表示拒绝。actor/action/resource、原 scope/对象/claim/request/range、精确微秒正文与 TIMESTAMP(0) 投影、原 result INSERT ID 和关联的 size/hash 都须匹配。缺结果的组保持 pending，不给出完整明细摘要。

`DetailRollingHash` 只为完整核对的组生成带版本域的摘要，覆盖两份原 canonical frame、nonce、intent/result 正文、实际数据库 ID 与原保留期限。它是持久事实的摘要；组 GC 的 owner/artifact 状态、后来 hold/ref、原及延长保留、当前 worker 授权、容量和同事务 compact tombstone 仍须另行完成。当前没有新增删除、墓碑写入或生产调度。

每个分层读取前后核对同一 server UUID/database，最终 `Recheck` 只重读原来持有的 L3/L5/L7 键和范围。任何失败污染共享状态，恢复行内容后也不能复用值复制的快照。JSON 与普通/Go 格式化在指针及值复制上均屏蔽私有收据/HMAC。

## 已接入结果事务

`SQLDownloadResults.Finish` 在原 actor FK 和 Operation/receipt 锁后重建保留组，并与原已提交凭据独立比对；随后锁 owner/ref 和 nonce，取得容量再读 intent。真实 result audit/关联写入后，将准确结果投影绑定到原组，最后复查完整组及数据库身份，再做原 reservation/retention 时间 guard 和唯一提交。任一新读取失败均使结果审计、结果关联、claim 释放和容量记账一起回滚；原准入行保持不变，未知提交不重试。

## 本地验证

r48 首轮失败只出现在“旧授权过期”夹具：结果已释放 claim 后读取零 `ClaimUntil`，将模拟 SQL 当前时间倒退到公元一年。r48 原日志/exit 1 保留，源码快照已自动清理；修正为从原 SQL 时刻向前推进一小时，不改原 session/claim/proof/保留期限。

r49 [定向原始日志](evidence/d-download-retention-group-focused-20261019-r49.jsonl)与 [native 终态](evidence/d-download-retention-group-focused-20261019-r49-native.txt)通过 **36 主/299 含子项**，新增七根/109；包括重启后读取、原授权/保留已过、当前配置变化、L3 投影/重算 claim、十九 nonce 关联与歧义、严格 audit、数据库漂移、恢复后共享失败闩，以及独立结果的最终回滚。默认 vet、无失败/跳过、冻结 postcheck/退出 0，1,402 输入 SHA `f8b279bbe42889b3594349d975a701db55c6b818c975060be020b9217d85b11e`。

r50 evidence/read/producer 三包通过；security test binary 在编译时出现 Windows `compile.exe: exit status 0xc0000043`，没有运行测试。原 build-fail/exit 1、三包通过和冻结 postcheck/自动源码清理均保留；不接收为完整成功。r51 使用相同来源/参数/自有缓存重试四包和 probe，四完整包 **693 主/5,532 含子项**、tagged/脱离 checkout seed 各 12 项、Windows/Linux probe、Linux runner、冻结 postcheck/退出 0 均通过。

复核另外将新测试 SQL driver 回调中三处 parse/encode 异常分支改为 `t.Error` 后返回无行，让驱动正常归还连接锁；异常仍使测试失败，避免 Goexit 在 database/sql 锁内阻止清理。该修改只涉及 `download_retention_group_test.go`，生产输入保持 r51 原字节。r52 按当前完整来源复验同一四包/probe并通过，原始失败轮不改写；最终源集复核及清理见页首。默认 vet、原业务期限及离线约束保持，未安装依赖或启动远端。

实际 SQL 探针 `TestDDownloadResultRetentionMySQL` 从 r47 八项扩为十一项，增加 `cold_group_after_revocation`、`cold_group_duplicate_nonce`、`cold_group_corrupt_intent`。完整准入阶段只选原 A 十三项根与 D 结果十一项根，共二十四个独立子库，现已通过下节的真实 SQL 接收。共享 DDL/嵌入胶囊和正式 95 文件 catalog 未改；本地构建/seed 与实际回执分别保留。当前 server 的上一轮完整验证为 r47，本轮未重跑；前端/浏览器也未重跑。

## MFA 九项实际 SQL 已独立接收

[D 独立接收](evidence/d-download-mfa-actual-accepted-20261019.json)重新核对操作者 15:32 的原日志、1,399 来源摘要 `47a48cc3b11db4cebc3abbefbc17f3596c27a5dd378b3be91e5fa9289d103002`、逐项 RUN/PASS、实际 binary/胶囊/runner pin、95 文件迁移、原 namespace UID、九个不同子库的 guarded DROP/缺席和两端清理/退出 0。MFA 重点来源当前无漂移；本轮 D 的持久读取及结果/派发变化明确排除，不用旧回执覆盖新代码。

该回执关闭原冻结九项签发专项的待跑项；实际环境是隔离 MySQL 8.4.8，issuer/owner/material 仍为夹具，没有人员 MFA 或 provider read，也没有消费下载准入 nonce。完整准入/新结果读取由下节二十四项实际回执单独接收，不重跑已接收的旧 nonce/审计/config-proof 或这九项。

15:48 完整准入操作者轮在本地 test-vet gate 退出 1、未开始远测；其失败与本轮过期夹具同名，保留原日志及准确来源，r49 已验证修正。该失败由 16:16 新冻结轮替代，不改写原失败记录。

## 完整准入十三项与结果/组十一项实际 SQL

16:16 操作者轮的 [D 独立回执](evidence/d-download-admission-actual-accepted-20261019.json)重新解析普通两包 543 主/4,229 项、两个 tagged seed 和脱离 checkout 各 12 项，以及远端两个 root/24 叶子的唯一 RUN/PASS 配对。严格检查原始来源逻辑摘要 F8、胶囊与 probe 两侧 hash、95 文件 replay、原 namespace `sbk-mig-261019082949-1133`/UID、24 个不同子库的 guarded DROP/缺席及两端清理、冻结 postcheck 和 `a_download_admission_mysql_remote_exit=0`。

该轮实际验证了准入/SQL provider/结果链、并发 key、历史 HMAC replay、owner/manifest/nonce 最终回滚、intent/result 写失败、实际已提交但丢失/延迟 ACK、原 L0 等待期限、撤权后结果，以及结果 audit/父收据删除限制、原保留/intent/安装复合 FK、结果关联失败回滚、重复结果拒绝、撤权后冷重建、重复 nonce 与损坏 intent 拒绝。原生产及 tagged SQL probe 当前与 F8 完全匹配；普通测试文件的三处 Error/返回分支被独立反向替换后准确恢复 F8 hash，不将未执行的新测试字节冒充远端来源。

MySQL 是实际隔离实例，owner/issuer/material/capacity 和 provider transport 仍是合成夹具。该回执不包含真实四任务/producer 的完整引用空区间/所有参与者锁序、现场 STS/KMS/物理预算/独立审计卷、人员 MFA、有效最小权限或组 GC/墓碑删除。已接收的原二十四项无需重复；这些生产接入缺口继续单独推进。

其余 owner 的原始绑定、正式 schema/grants、完整分组 GC/墓碑与指标、物理容量/运行材料、B→A→D 恢复、真实历史升级激活和[原六项](system-backup-d-six-scope-readiness-20261015.md)仍未完成。
