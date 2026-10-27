# D 下载准入公共 Operation 与 GET 合同接线

承接[原子准入事务](system-backup-d-download-admission-transaction-20261019.md)的公共读取缺口。原 r13 回执覆盖当轮 security/evidence/server；它不覆盖本轮后续的 schema、公共读取和前端变化，也不是 HTTP 下载的生产启用证明。

## 实现

- 草案 `OperationType` 追加 `evidence_download_admission`，`OperationTargetType` 追加 `evidence`；Go/TypeScript DTO 和主计划枚举同步。发布过的 066/075 及正式 migration catalog 没有改写；公共合同与未编号追加 SQL 的完整新枚举逐项比对，旧 enum 的值和顺序独立保留。合同、registry 和批准状态仍为 draft/pending。
- Operation schema、后端公共 SQL 读取和前端客户端共同约束新类型与 evidence 目标双向绑定、准确 `sev_` ID、admin/规范 actor ID、`getSystemBackupEvidence`、同步 `succeeded`/HTTP 200、无重试/失败/两个 result。后端与前端校验四个原 SQL 时间相同，deadline 严格较晚；历史准入记录不会因为下载期限已过而从只读列表消失。公共 HTTP 200 是准入结果，不能用 Range 响应 206 替代，更不表示客户端收到文件。
- 前端使用纳秒整数比较该类记录的时间，不通过 `Date.parse` 截断微秒来接受不同原时刻。SQL 读取仍使用原 scope/installation 授权和最终复查、原 keyset 分页与脱敏 DTO，不读取私有 receipt、claim/provider locator 或原 proof。
- 同一个 synthetic 公共向量分别由实际准入公共内容生产器、SQL 读取模型、JSON Schema 和前端真实读取客户端校验；列表/详情只走 Operation GET，不执行下载或重试。新增五语言操作类型文案。
- 下载 GET 的草案 OpenAPI 声明无正文、单一 Range、条件 key/proof、原 Manifest media_type 的二进制 200/206、条件 `X-System-Backup-Operation-Id`、`Cache-Control: no-store` 和 206 的 Content-Range。policy 新增 `idempotency_condition`，与 confidential/sensitive 的强认证条件一致；条件不可删除或改回 none，也不能被其他操作静默使用。错误 profile 包含强认证、幂等/版本冲突及 not_ready。

## 验证历史

- r14 首次 Node runner 因 sandbox 禁止 test-worker spawn 而 `EPERM`，未执行断言。没有提升权限；改用现有 Node 支持的 `--test-isolation=none`。[r15 定向日志](evidence/d-download-public-focused-20261019-r15.txt)的 51 项通过。
- r16 Go 发现测试包导入环：read 的内部测试引入 evidence，而 evidence→security→read。已将生产器对同一向量的断言移回 evidence 测试，read 只验证公共读取；没有改生产包依赖。该轮另有标准库 `crypto/sha256` 的 `compile.exe 0xc0000043` 退出，完整轮失败，不能接收为测试通过。
- r16 Node 冻结范围漏部署 YAML/主计划，r17 又漏根 Dockerfile，分别 4/1 项失败。已把这些实际依赖也纳入独立 pin/只读复制/前后检查；没有删除旧断言或把缺失输入当跳过。
- [r18 Node](evidence/d-download-public-node-20261019-r18.tap)完整 **355 项通过，无跳过**，覆盖 1,365 backend/contract/script 输入、277 frontend 输入和 49 部署/主计划/Dockerfile 输入；准确快照目录已清理。
- [r17 TypeScript](evidence/d-download-public-frontend-20261019-r17-native.txt)构建退出 0，但随后 Vite runner loader 对现有 CommonJS picomatch 报 `require is not defined`，整轮保留为失败。[r18 Vite](evidence/d-download-public-vite-20261019-r18.json)只改用现有 Node 的 native config loader、原项目配置和同一 277 输入，生产构建退出 0、产出 39 文件、来源复查和准确产物目录清理通过。没有重复安装依赖，也不把失败的 r17 整轮标成通过。
- [普通合同检查](evidence/d-download-public-contract-check-20261019-r17.json)退出 0；[strict](evidence/d-download-public-contract-strict-20261019-r17.json)仍退出 1，保留 40 policy、60 交叉评审、34 draft/4 missing、三项未入 inventory 的控制表和现场 schema hash 门禁。没有登记他人批准。

修正后的 [r18 Go 完整日志](evidence/d-download-public-go-20261019-r18.jsonl)、[来源](evidence/d-download-public-go-20261019-r18-source.json)及[终态](evidence/d-download-public-go-20261019-r18-native.txt)通过：security **253 主/1,985 含子项**、evidence **232/1,771**、read **75/519**，合计 **560/4,275**，无跳过、默认 vet，Go/包装均退出 0。选定本轮共享向量与读取增量为 4 主/27 含子项；独立 A 增量保留在完整包的实际冻结范围内，不算作 D 新增用例。

[独立复核](evidence/d-download-public-review-20261019-r18.json)重新计算唯一 package 终态、所有主/子项、Node 355 项及其中新增 51 项、三个输入组和当前文件集合：1,365 backend/contract/script、277 frontend、49 support，共 1,691 份输入当前零漂移，Go/Node 的 backend/contract/script 来源完全一致。该组逻辑 SHA-256 为 `f6443142de48b93364fabec5ad89952f67179c96bba6527f4ed104d6791c6c01`；前端组为 `86886574c967e9b2673daf7dceb6fc8648a9f79cfb328c5c0b9d5306097ba372`。五份准确 Go/Node 快照、TypeScript/Vite 两份准确产物目录及本轮外部 Go 缓存共八个自有目录均确认不存在。失败历史完整保留；没有把 r14/r16/r17 的失败整轮改写成通过。

收尾的一次辅助检查把记录路径在另一 PowerShell runtime 重新排序，导致有序清单摘要不同；[r19 诊断](evidence/d-download-public-postreview-drift-20261019-r19.json)确认文件集合/字节均未改变，按原记录次序复算的 SHA 完全一致。后续最终检查分别比较三个准确集合、沿记录次序计算字节摘要，再确认八个目录缺席；没有因排序差异重跑测试或改写原 r18 回执。

## 继续推进

公共读取和 GET 声明只是候选接线。后续[提交后绑定与 SQL/provider 检查](system-backup-d-download-committed-binding-20261019.md)按 r22 接收后，[r27 HTTP/结果候选](system-backup-d-download-http-result-20261019.md)已接 runtime factory 和独立结果审计/claim CAS，并验证本地 TLS provider、头前/头后检查和 native 最终 flush 原期限。实际 owner/task/hold/ref、现场物理容量/材料、正式 schema/grants/结果 GC、整链真实 MySQL 和生产 main/部署仍待完成。没有把新服务挂到旧 evidence 行锁后回调，也没有启用生产下载。

[六项原始范围](system-backup-d-six-scope-readiness-20261015.md)继续保持：正式迁移/索引取舍、完整 Owner 读源、B/A/D 恢复组合、恢复管理与独立审计卷、真实历史升级/激活及四矩阵/大数据 E2E。本轮未重跑旧专项或当前 cmd/server 全包；r13 server 回执只保留原冻结范围。
