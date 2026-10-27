# D：下载准入锁前缀、键锁与追加 schema 候选

承接 [r61 收尾](system-backup-d-round-closeout-20261016-r61.md)和[下载事务合同](system-backup-d-sensitive-download-admission-contract-20261016.md)。本轮恢复推进完整目标；原六项范围不缩减，也不把部分锁组件称为完整 prelocked authority。

## 已落盘的实际代码

- `systembackupsecurity.LockSensitiveDownloadNonceScope`：在调用方的准确事务连接上验证数据库身份；按共同顺序锁全部 installation 行和空区间，再锁当前 installation/config，读取持久 config 历史与保留期内 nonce ledger 的全局版本并集。版本集有上限，拒绝非法、重复、无 active 或不完整来源，不以现存密钥文件决定历史集合。
- `SensitiveDownloadNonceScope.LockCandidates`：在 D 完成当前授权、proof、Operation 键、owner/ref 锁之后执行 L5 查重。仅接受准确事务、安装、active 与完整版本集对应的 A 封闭验证结果；按实际 `(nonce_hmac,key_version)` 唯一索引键排序查全局候选，不加 installation 过滤，不因已存在行过期而放行。等待之后再用 SQL UTC 检查原 proof 期限；失败或成功尝试后均不能再次执行该方法。
- `systembackupevidence.LockDownloadAdmissionKey`：L3 准入键和 receipt 键锁。先核对 A 封闭请求与实际 actor/session、SQL UTC 和原 proof，再查准确 installation/admin/endpoint/key 的 operation、过期标记和服务端新 operation ID 的 receipt 空区间。同 key 同 hash 和异 hash 都返回 `idempotency_conflict`；有效过期标记返回 `idempotency_expired`。不读取 nonce，不重放二进制内容。

上述三个锁入口均借用外层事务，不 Begin/Commit、不写准入行，也不访问 provider。当前没有 HTTP/生产接线；它们不证明调用方已经完成声明的前置锁、当前认证、目标归属或容量检查。外层 D 事务必须从新 RepeatableRead 事务开始，在任何创建一致性快照的表读取之前取得 L0，不能在旧 evidence 锁后回调中使用。

## 同事务 Operation/receipt 存储增量

`StageDownloadAdmissionRecords` 使用原 L3 key、原审计/content binding、准确事务和 current record，向候选 schema 写一次成功 Operation 与一份独立私有/公共字节记录。operation 主键来自本次 INSERT 的实际 `LastInsertId`；evidence 数值 ID 和 installation 从准确数据库行回查，NULL/异安装、claim/期限/版本漂移、保护期不足均拒绝。不通过修改旧 evidence 归属来使 INSERT 成功。保留期须严格覆盖原 claim 和签名期限，并覆盖数据库已有 protected_until；完整 config/nonce/audit/幂等保留与真实容量仍由外层提供。

存储后及后续 `Recheck` 都独立回查准确 operation 的全部公共字段、空 external-action、NULL/同步终态字段和时间，以及 receipt 的真实字节、大小、摘要和关联。自洽替换 receipt/公共 JSON 连同摘要也不能通过独立事实核对；读取之后再检查原 audit、actor/record 和 SQL UTC。所有失败都要求外层整事务回滚，不发“失败收据”，不自动 Commit。返回的是未提交行锚点；`PendingOperationDatabaseID` 只供同一外层事务关联 nonce，不能用于开放 provider。

key 和存储锚点的状态使用共享私有指针，复制 Go 值不能绕过失败/重复使用保护；nonce scope 的单次候选锁也采用同样机制。key 同时固定原 A verification，拒绝用同 request 的另一个 nonce/proof、签名版本、验证时刻或时间策略替换。A verification 新增内部已签 payload+signature 摘要、issuer/auth-time 事实，只保留摘要与所需时间/身份，不保留原 proof/nonce，不改变签名 wire 格式或公共 DTO。签发方时间明确命名为 `SignedAuthTime`；nonce 的 `authenticated_at` 必须使用 A 的原 SQL `ProofAcceptedAt`，不能把允许正偏差的签发方时刻写入该列。

该增量仍不是完整准入：尚未写 nonce，也没有 claim CAS、真实当前 A 授权/容量、完整 L0–L10 capability 与唯一提交所有者。当前所有新增 SQL 仅在 scripted transport 中验证，没有候选表实际安装或生产接线。

## schema 候选及评审要求

[未编号追加 SQL](system-backup-d-download-admission-schema-proposal-20261019.sql)保留旧 operation/target 枚举值与序号、完整旧 target CHECK，仅追加下载类型和 evidence 分支。新增 evidence 可空 installation 归属列，不赋默认值、不反向回填；旧 NULL 行不能满足新下载的同安装 FK。新 operation 绑定 evidence 的 installation、数值 ID 和 public ID，receipt 同时绑定准确 operation/evidence/audit；nonce 的 operation FK 增加同安装约束。私有 receipt 与公共 Operation 字节分别存储长度/摘要，不能把私有表整体序列化到 API。

候选没有进入正式 migration、inventory、批准或 grants。A 的[独立词法复核](evidence/a-download-schema-review-20261019.json)修正并保留了初稿 evidence 正则字面量的闭合缺陷；当前 12 项 D 静态检查针对修正后的准确字节，A 的限定复核也不代表完整 SQL parser、实际 MySQL 或正式批准。正式化前须验证旧 ledger 的编号和实际数据，检查已有 nonce/operation 是否存在跨安装关联，并在受审维护边界完成安装；MySQL 多条 DDL 不能冒充一个可回滚业务事务。旧 evidence 只能由核验实际 owner/install 的受审 writer 建立归属，不能使用 receipt 自报的 installation 作为回填来源。

需要独立受审 admission 数据库身份：receipt、operation、nonce、intent audit 只给必要 INSERT/SELECT，不能继承其他角色或全库 UPDATE/DELETE；evidence 只给准确 claim CAS 所需的列权限。其他业务账号、维护 SQL 和 GC 对已保留 operation/audit 的修改能力也须实际审查，不能只靠新表的 FK 宣称不可变。GC 使用独立身份，按完整保留组、hold/ref 和最终 guard 处理。物理页、索引和审计开销仍需真实预留，不能按 JSON 长度换算通过。

## 验证状态

首轮 nonce scope 定向测试已 exit 0；该轮直接使用工作树，不能替代后续冻结门禁。[r1 完整包回执](evidence/d-download-admission-packages-review-20261019-r1.json)记录 security 242/1,879 通过，但 evidence 有一项旧 producer 故障夹具因初始化超过容量采样五秒而在 pending 阶段先失败，整轮 exit 1；源码 postcheck 和准确目录清理通过，未把它记成两包全绿。只在测试夹具的新 pending 准入前刷新 SQL 模型时刻，保留原 authority/owner/claim/budget 与内部六秒 guard 故障，并增加独立六秒慢初始化回归；[r2 evidence 完整包](evidence/d-download-admission-evidence-20261019-r2.jsonl)、[postcheck 与清理](evidence/d-download-admission-native-20261019-r2.txt)均 exit 0，范围限其 1,337 来源。

后续 storage 与共享状态的 [r3 定向检查](evidence/d-download-admission-focused-20261019-r3.jsonl)已通过；其后新增的原 verification 指纹绑定与独立签名替换测试进入 [r4 两包完整日志](evidence/d-download-admission-packages-20261019-r4.jsonl)，两个包、源码 postcheck 和清理均通过，native exit 0，冻结范围为 1,342 来源。为明确签发方时间与 SQL 接受时间的区别，最后调整 getter 命名及对应断言；同时落盘[可复用 native 冻结验证入口](../scripts/system-backup-d-download-admission-native-validation.ps1)。这两项后续变化由 [r5 完整日志](evidence/d-download-admission-packages-20261019-r5.jsonl)、[新输入清单](evidence/d-download-admission-packages-20261019-r5-source.json)和[运行/清理](evidence/d-download-admission-packages-20261019-r5-native.txt)验证：**两个完整包 462 主/3,548 含子项通过、无跳过、默认 vet，Go/包装 exit 0**；本轮新增及夹具回归为 12 主/127 含子项，不与前轮重复累加。新入口只允许既有离线 Go 环境，不重试 Go 断言；最多三次重试仅发生在构建前源码捕获且先清理漂移副本，r5 实际一次捕获成功。

[最终独立复核](evidence/d-download-admission-final-review-20261019-r5.json)重算 1,343 输入逻辑摘要、原日志摘要、所有主/子项及两个唯一 package 终态；当前完整输入集合及字节与冻结轮完全匹配。四份准确源码目录和初始自有编译缓存共五个专属目录均独立确认不存在；[清理记录](evidence/d-download-admission-cleanup-20261019-r5.json)另记录五份空 stderr 已删除。只保留源码、日志、输入清单和评审证据，未触碰其他任务的缓存/进程/资源。

独立复核器首轮在 Node 子进程调用 rg 时遇到 EPERM，未执行任何构建/SQL；[原记录](evidence/d-download-admission-review-failure-20261019-r1.json)保留。随后只改为现有 shell 运行 rg、捕获准确文件清单供只读 Node 复核；没有权限升级或重跑测试。该辅助工具失败不被计作原包装失败或测试通过。

[schema 12 项静态检查](evidence/d-download-admission-schema-review-20261019-r2.json)通过，范围仅为旧枚举/约束文本保留、新 FK/字段/保留边界和禁止回填；不证明 MySQL 接受 DDL 或 CHECK/FK/grants 的运行行为。首轮检查误把 `ON DELETE RESTRICT` 当作 DELETE 语句，已[保留失败记录](evidence/d-download-admission-schema-failure-20261019-r1.json)和原检查脚本；仅修正检查为语句开头匹配，SQL 未因此修改。

Docker Linux 引擎当前不可连接，本轮使用已有 Go/native 环境及缓存、`GOPROXY=off/GOSUMDB=off/GOTOOLCHAIN=local/-mod=readonly`，没有安装依赖，也没有真实 MySQL 执行或远端操作。

## 继续完成的事务工作

1. D 事务所有者在 L0/L1 后接 A 的真实当前会话、凭据、撤销、RBAC 和准确目标授权，固定 config/材料原期限并完成不消费 proof 验证。A 的材料加载器必须使用本事务的完整历史版本集。
2. L3 键锁后接实际 owner/task、hold/ref 和 L5 候选锁，随后取得真实物理容量 reservation、预选存储槽和完整前置锁能力；这些新部分组件不能签发该最终能力。
3. 把现有实际 intent audit/content binding/Operation/receipt 存储接入同一所有者，补 claim CAS、nonce 与容量计账；逐项回读准确原字节、大小、摘要和 FK，执行所有 callback/写入后的最终授权/SQL UTC/期限 guard，只有一个提交点。存储 helper 通过不关闭这一整体缺口。
4. 确认提交后才允许访问 provider 和返回成功 header/明文；提交结果不明不重试 nonce、不返回成功。新完整事务另做实际 MySQL 并发重放/回滚/未知提交/保留/容量与真实部署验收。

正式 A/B/C schema 评审、canonical 081/082、当前 server 整包、事件/详情新增实际 SQL、完整 Owner 读源、真实历史升级/激活、独立审计卷及四矩阵/大数据 E2E 继续保留。健康七项、审计四项等已接收旧专项不重复运行。
