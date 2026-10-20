# A：下载 owner 与远测入口增量复核

## D r45 公共 claim 释放增量接收

[A 新独立回执](evidence/a-download-owner-r45-independent-review-20261019.json)重算 D r45 的原始 JSONL、逐测试 run/pass 唯一终态、四包终态、来源逻辑摘要与当前文件集合/字节。1,394 输入，摘要 `2289da2fd399741232619698d8decd972d959d08335fabae8aa56f06a762032b`；四包共 682 主/5,387 含子项通过，无失败或跳过，默认 vet、postcheck、native/包装 exit 0 和十五条准确自有目录独立缺席齐全。本次未重跑 Go 或构建，也未安装依赖。

其中公共释放两个根/16 项、A 提交后绑定根/6 项及 native 期限根/5 项均确实通过。复核时当前 1,394 项集合与字节零漂移，因此上一节本地准备回执中排除的 D 公共释放测试变化，现由此新回执在 r45 范围单独接收；不改写旧准备回执的原始来源或范围。

逐段检查 `finishPublicDownload` 及 HTTP 调用点：仅接受服务端已提交的 public/internal 原记录；SQLPolicy/DB 指针及 installation/server/database 必须一致；先取得原 owner/ref 锁，再锁 evidence，核对完整不可变内容及准确 claim/期限/row_version 后执行唯一 CAS。结果事务使用独立预算，不因撤权、取消或原 claim 已过期而重新授权用户；private、其他 claim、row_version/owner 漂移均拒绝。失败整事务回滚，提交不明不重试，公共释放不产生私有准入、nonce、审计或容量预留。失败报告取得独立的新预算。没有发现本增量需要新增的代码修订。

这仍是脚本化 SQL/行数据与本地 HTTP 回归，不覆盖真实 InnoDB、正式 grants/GC、实际 provider/物理容量或部署。MFA 九项没有新的操作者成功日志，完整准入十三项亦未实际执行；继续使用后文交接，不重跑已接收旧专项。

## 最终本地接收

[独立回执](evidence/a-download-admission-final-preparation-review-20261019.json)接收[最终原始日志](evidence/a-download-admission-proof-time-local-20261019-142248-5dd661da.txt)与[1,394 项冻结来源](evidence/a-download-admission-proof-time-source-20261019-142248-5dd661da.json)，来源摘要 `19ae7f1811c323d8f6e72b4a86a75ff96fb830256093e4ff431a6bbbf617f88a`。

security 253 主/1,985 含子项、evidence 279 主/2,099 含子项，共 532 主/4,084 项全部通过，无跳过，默认 vet 保留。新五个提交后绑定用例、两协议四个 native 期限用例、legacy TLS 正反例及 D producer 提交后路径均实际通过。MFA/Admission 两个 tagged seed 在包内及脱离 checkout 各 12 项通过；Linux SQL 探针与迁移 runner 构建、冻结 postcheck、最终 exit 0、源码/内层构建缓存清理与准确 owner 独立缺席均通过。六条先前失败/操作者临时目录也已独立确认不存在，未安装依赖或连接远端。

复核时 A 五份重点实现/测试/包装源码仍与冻结输入匹配；D 的 `download_public_release_test.go` 后续并行变化单列排除，新增输入也不据此接收为当前整个工作树。旧失败轮原样保留，不修改为成功。MFA 九项按[新命令](system-backup-a-download-mfa-mysql-handoff-20261019.md)由操作者重试，完整准入十三项见[后续独立交接](system-backup-a-download-admission-mysql-handoff-20261019.md)，两者实际 SQL 均尚未接收。以下“当前重跑”描述保留各失败轮的历史范围，以本节最终接收为准。

## D r37 的限定接收

[A 独立回执](evidence/a-download-owner-independent-review-20261019.json)直接重算 D r37 的原始 Go JSONL、来源摘要、逐文件 pin、包终态、全部测试的 run/pass 配对与准确目录缺席；没有仅依据 D 的汇总判定成功。

固定 1,390 输入，security/evidence/read/producer 四包共 679 主测试、5,365 含子项，默认 vet、无失败或跳过、native/包装退出 0、冻结副本 postcheck 及六条准确目录缺席均通过。复查时原 pin 仅 config-writer 包装脚本因 A 路径修订发生变化；当前新增文件不在 r37 范围。该轮没有编译 `systembackup_mysql` tagged 源码，不能据此接收新的实际 SQL 探针。

r36 整轮失败保留。实际原因为坏 receipt 已在更早的 owner 锁阶段拒绝，而测试仍期待在 Preview 拒绝；原 deadline 的 +1µs 夹具又超过自身 retention，严格编码器先拒绝。r37 更新阶段断言并使用 retention 内的 -1µs 漂移后通过。A 独立确认源码包含原 receipt 与 manifest/version/grant 比对、原 owner deadline 和创建时间检查，以及撤权后结果事务的原始绑定检查。

## A 新增验证与入口修订

- `download_producer_owner_a_test.go` 在成功准入与初次提交后授权之后，替换已重新计算摘要的 receipt manifest/version/grant 或 owner 原写期限；分别检查后续 committed authority 与独立结果事务拒绝、没有结果审计提交且没有释放原 claim。正常对照要求撤权后仍能记录已发生的中断并释放 claim。新五例单独随当前四包门禁验证，不能计入旧 r37。
- config-writer 包装脚本使用 PowerShell provider API 解析调用者路径，避免 Windows PowerShell `Set-Location` 与 .NET 进程目录分离时误解析相对 manifest。仍要求本仓库 `docs/evidence` 的新文件，并区分已有文件与位置错误。11 项路径边界及既有 MFA 派发在 PowerShell 7/5.1 都通过，无构建或远端操作。
- 13:30 MFA 操作者日志只有 manifest 检查失败与 exit 1，没有进入构建或 SSH/MySQL。旧泛化错误不能单独证明原调用到底是路径错位还是重用了文件名。交接命令同时使用绝对路径和每次新 GUID，覆盖两种情况。
- A 首轮重新准备已通过两普通完整包，但在 tagged 编译被 `download_admission_a_mysql_test.go` 的未使用 import 阻止；整个准备轮保持失败，准确临时 owner 已删除。已移除该 import，当前完整准入准备重新验证两普通包、MFA/Admission 两个 tagged seed、脱离 checkout 的 seed、Linux 探针和迁移 runner。没有把普通包成功记为整轮准备成功。
- A 四包 r1 冻结在新增断言修订前，原提交计数断言把成功只读授权事务也计入结果事务，五个新用例均因错误的固定总数断言失败；当前改为采样进入结果事务前的提交数，要求结果成功只增加一次、失败不增加。原 r1 不能计为成功。该轮还出现既有 native HTTP 测试的 1.5 秒原期限包含 TLS/夹具准备时间而提前过期；新测试在原请求进入、Admit 之前一次固定 SQL 时间与三秒 reservation，绝不在准入后刷新。实际期限、缓冲明文、独立结果审计和两协议断言保留，生产代码未改。
- 定向 r2 保留 exit 1：五个 producer 提交后用例通过，但 A 调整 native 计时起点时遗漏同步测试 `ProofConfig.Now`，四个 native 用例在准入前被正确拒绝为 not_ready。当前已同时采样这两个测试时间，未修改签名 auth_time/expiry。旧整包准备还因 legacy TLS 链复用 fixture 创建时的静止 SQL 时钟超过生产五秒新鲜度而失败；现在该网络测试仅让每个新事务的 SQL 时钟自然前进，session/owner/material/claim 的原期限不变。新增 A 绑定测试也按事务采样模拟 SQL 时间，并在准入前固定二十秒原容量期限，避免把与绑定无关的短租期误当绑定失败。当前重新执行完整普通包、tagged seed/独立二进制及 Linux 构建，不接受任一旧失败轮。
- 14:11 冻结准备的两个新根仍失败：A 同步 SQL/ProofConfig 时间后未同步严格 SQL transport 中原 proof 的预期接收时间，nonce INSERT oracle 正确拒绝不一致。保留原 exit 1、源码和日志；该轮没有进入 tagged 构建/SSH。现增加仅限准入前的 `sampleAAdmissionProofTime`，在新 SQL 时间重新验证同一原始签名，更新严格 oracle 的预期验证对象；不改请求头、不重签、不延长 auth_time/expiry，不放宽 nonce 时间/issuer/ID 断言。准入后只推进模拟 SQL 时钟，原验证对象和所有原期限保持不变。当前使用新冻结来源重跑整包与探针准备。

## 未关闭范围

实际 MFA 九项由操作者交互 SSH 执行；[13:47 新轮](evidence/a-download-mfa-mysql-remote-20261019-134749-41871015.txt)已经越过原 manifest 检查，但 14:08 在本地测试门禁退出 1，未进入 SSH/MySQL。三个失败根分别是 native 原期限、A 提交后检查与 D producer 提交后检查，均需保留原失败并验证修订；不能计为远端 SQL 成功。收到同轮九叶子/root、来源/载荷 pin、九子库及原 namespace UID/两端清理、postcheck 和退出 0 后才接收。整链 13 项实际 SQL 仍需独立派发，不用 MFA 九项替代。

四任务与 producer capability 之外的 owner 原始期限来源、真实人员 MFA/部署材料、现场物理容量、持久故障 sink、结果保留组 GC/grants、正式共享 schema 和生产装配/四矩阵 E2E 仍未关闭。脚本化 SQL 与密钥/容量夹具不证明这些现场事实。已接收 nonce 八项、下载审计四项、config-proof 十五项不重跑。
