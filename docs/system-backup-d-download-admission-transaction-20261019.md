# D 下载原子准入事务与实际安全模块适配

承接[锁与存储候选](system-backup-d-download-admission-locks-20261019.md)。本交接记录后续代码增量；此前 r5 的两个完整包回执只证明原冻结来源，不扩大覆盖本轮新事务、claim、nonce 和环境适配。

## 当前实现

`DownloadAdmissionService.Admit` 是单一 RepeatableRead 事务所有者。它从新事务取得全局 installation/nonce 历史锁与当前完整 config，验证当前会话和原配置材料、不消费的签名 proof，然后依次取得 Operation/receipt 键、owner/ref、全部历史 HMAC 候选和容量预留。之后在同事务写入 intent audit、原 evidence 行 claim CAS、成功 Operation、私有 receipt/公共快照及 nonce；nonce 使用实际 INSERT operation/audit ID 和原 SQL proof 接受时间，不使用允许正偏差的签发方 auth_time。

所有业务写入之后重复当前授权/材料与容量检查，再独立核对原 config、claim、nonce、Operation、receipt 和审计行，最后采样 SQL UTC、检查原 proof/session/claim/authority 期限。只有一个 Commit；错误要求整事务回滚，不局部提交、不自动重试。提交结果不明或已知提交后期限已过，均不返回已提交准入对象。返回的封闭对象只是元数据，不能独立授权 provider。

原 claim 期限在键锁阶段固定为原 SQL 观察时间加 30 秒，不随锁等待刷新。完整保留组覆盖控制元数据保留、原 proof expiry、审计最低保留及 evidence 既有保护期；微秒存储精度不能延长原 proof。关键状态由共享私有状态防止 Go 值复制绕过单次调用与失败闩。

`PinnedDownloadAdmissionEnvironment` 组合已有 A 的 `SQLLoginSessions`、`ConfigMutationSecurityFiles`、实际 RBAC 文件解析与 `ConfigMutationCapacity`。完整历史 HMAC 文件集由持久 config/nonce 历史确定，不能以文件仍存在的子集缩减。最终重新加载并比对原 signer/policy/HMAC 材料，当前密码、撤销、RBAC 或材料变化要求回滚。关闭时擦除自己加载的密钥副本。

该环境仍强制要求受审 `DownloadAdmissionOwners` 实现、实际只读材料挂载、实际 DB-side 容量报告、现场大冒烟测量与下载行/索引/审计/nonce 最坏物理预留成本。没有默认 owner、内存容量或只按 JSON 长度通过的后备实现。

## 验证与已知失败

- r6 模型烟测暴露独立 config 投影遗漏 `preflight_` 前缀，原失败和超时日志保留；未当作通过。
- r7 暴露 JWT NumericDate 在本地时区下不满足 UTC 内容绑定的实际集成问题。服务在可信认证入口将原时刻转换为 UTC，不舍入、不延长期限；增加阶段见证，避免负例因提前拒绝误报通过。
- [r8 定向整链日志](evidence/d-download-admission-chain-focused-20261019-r8.jsonl)记录修复后事务与 nonce-use 定向通过。该轮是工作树定向验证，后续环境适配不在其范围。
- [r9 环境适配初测](evidence/d-download-admission-pinned-focused-20261019-r9.jsonl)失败：测试夹具使用 `kind` 而非合同的 `registry_kind`，实际磁盘 registry 未正确生成。按合同修正后另跑 [r10](evidence/d-download-admission-pinned-focused-20261019-r10.jsonl)仍在材料阶段被拒绝，容量/后期 guard 的负例因阶段见证未到达而明确失败，不能算作覆盖。[r11 查询轨迹](evidence/d-download-admission-pinned-smoke-20261019-r11.jsonl)定位到 registry 材料读取；夹具的 `IssuerPolicy.ACR` 为 nil，JSON 为 `null`，现有严格 parser 要求显式数组。当前夹具已改为 `[]`，未放宽 parser；[r12 正向烟测](evidence/d-download-admission-pinned-smoke-20261019-r12.jsonl)成功组合实际安全/容量模块并提交。该轮仍是工作树定向验证，不能替代完整包门禁。
- [r13 完整冻结日志](evidence/d-download-admission-chain-packages-20261019-r13.jsonl)、[来源](evidence/d-download-admission-chain-packages-20261019-r13-source.json)及[包装终态](evidence/d-download-admission-chain-packages-20261019-r13-native.txt)通过：security 248 主/1,913 含子项，evidence 229/1,749，当前 server 6/12；合计 **483/3,674**，无跳过、默认 vet，Go 和包装退出码均为 0。来源一次捕获成功，1,356 份输入逻辑 SHA-256 为 `65c1c7e44c69a8837bc0c29061004e5fe13e8436e8fb9a15eca6772e3728a510`。
- [独立复核](evidence/d-download-admission-chain-review-20261019-r13.json)重新计算来源/日志/文件集合摘要和唯一 package 终态；本轮选定整链、环境及 A 独立回归为 15 个主测试、114 个含子项，覆盖 14 类文件/会话/容量变化、所有原写入的回滚和最后回调后的原行替换。当前输入集合与冻结字节零漂移；准确源码/构建临时目录和外部自有 Go 缓存两个目录均确认不存在。r6/r7/r9/r10/r11 的失败历史保留且未计为通过。

复用入口现支持 `-IncludeServer`；r13 使用已有缓存及 `GOPROXY=off/GOSUMDB=off/GOTOOLCHAIN=local/-mod=readonly`。这轮结束后已删除该缓存，后续运行可省略 `-ExistingOwnedCache` 让包装自行创建并清理自有缓存。Docker Linux 引擎的本地管道当前不可连接；本轮没有执行实际 MySQL、SSH、DDL/grants 安装或生产启用。

测试执行真实 JWT/Ed25519、A 会话/RBAC/文件/容量模块和 D SQL；数据库 transport、owner 来源、报告和密钥都是 synthetic，不能证明真实 InnoDB 锁、CHECK/FK、grants、物理容量、现场 MFA 或生产启用。未安装依赖；构建和测试必须使用既有离线环境，结束清理准确自有产物。

## 后续验收边界

1. 本轮环境适配、security/evidence 和当前 server 的冻结完整本地门禁已按 r13 关闭，不重复旧输入测试。后续公共 Operation、真实 owner/SQL 或 HTTP/provider 增量需按各自实际变化重新验收，不能扩大 r13 的源码覆盖。
2. 新下载 schema、081/082、保留组/GC 与最小权限需要正式评审及真实 MySQL 增量验收；现有静态检查或旧组件回执不能替代。
3. 实现实际 owner/task/hold/ref 适配，核实安装归属及真实物理预算，补整链并发重放、锁等待、回滚和未知提交探针。
4. 原 r13 的公共 Operation 缺口已由[公共合同/读取增量](system-backup-d-download-public-read-20261019.md)按 r18 接通草案 enum/parity、严格同步成功事实、公开脱敏列表/详情和前端读取；正式共享合同/迁移与生产输入仍待受审。不得扩大 r13 私有内容测试的覆盖，公共增量使用自己的 r18 来源/日志/清理回执。
5. 现有 HTTP 敏感行回调会先锁 evidence，不能把新 nonce 写入接在那里。[提交后绑定与 SQL/provider 检查候选](system-backup-d-download-committed-binding-20261019.md)按 r22 验证后，[r27 HTTP/结果候选](system-backup-d-download-http-result-20261019.md)进一步接 runtime factory、原期限二进制响应、实际本地 TLS STS/S3/Transit 和独立结果审计/claim CAS；生产 main/现场 provider 身份、真实 owner/容量、结果保留组/GC/grants 和整链 MySQL 仍待验收。
6. [六项原始范围](system-backup-d-six-scope-readiness-20261015.md)继续保留：正式迁移/索引、完整 Owner 读源、B/A/D 恢复组合、管理认证/独立审计卷、真实历史升级激活、四矩阵/大数据 E2E。已接收旧专项按原冻结范围复用，不重复运行。
