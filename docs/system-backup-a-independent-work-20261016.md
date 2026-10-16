# A 不依赖 B/C 的工作线

本轮由用户授权推进；用户明确远测由其执行，A 只提供完整命令并核对回传证据。用户后续已允许安装依赖，本轮只补齐锁定的缺失模块；测试缓存、源码副本和二进制在该轮结束后清理。现有其他聊天的 server/前端修改不属于本轮交付。

| 事项 | 当前结果 | 完成所需证据 |
| --- | --- | --- |
| 独立复核 D 七项回填服务 | 已限定接收 | [A 机器回执](evidence/a-d-canonical-backfill-service-review-20261016.json)，七个准确 PASS、23 项核对、22 份服务重点输入、69 条路径不存在；只覆盖旧冻结轮。 |
| proof 15 项真实 MySQL | 已限定接收，专项待办关闭，无需重跑 | [11:06 完整远测验收](evidence/a-config-proof-mysql-accepted-sbk-mig-261016032334-5226.json)：15/15、95 文件迁移、两次实际行锁等待、25 项核对、exit 0 及清理齐全；254 份重点输入仍匹配，仅接收本轮冻结 proof 签发范围。 |
| 独立当前会话 holder | 私有候选及完整本地门禁已接收 | [1,912 项不同检查/默认 vet/清理回执](evidence/a-maintenance-session-holder-review-20261016.json)；实际 JWT 和 SQL session checker，SQL transport/grant 仍为模型，不提供生产路由。 |
| 完整 HTTP 本地包验证 | 缺依赖阻断已解除；五个完整包限定接收 | [1,374 项通过/7 项平台跳过回执](evidence/a-auth-http-review-20261016.json)及[入口与修订说明](system-backup-a-auth-http-validation-20261016.md)；含 30 项新 HTTP 检查、SQL 日志泄漏修复和 workspace 夹具修正，exit 0、默认 vet、准确清理齐全；真实目录和本人 MFA 仍未验收。 |
| LDAP 请求取消及真实传输 | 修复与完整 services 本地包已限定接收 | [修订说明](system-backup-a-ldap-request-cancellation-20261016.md)及[29 项独立复核](evidence/a-ldap-request-review-20261016.json)：1,330 输入、1,177 项通过（新增真实 TCP/TLS/StartTLS 24 项）、无跳过，旧源码实际反例、默认 vet、源码前后检查和 exit 0；六条准确目录、四容器、两卷确认不存在。真实企业目录/realm/MFA 仍未接收。 |
| 敏感下载合同与 A 核心 | D 语义已确认，A 共享 canonical/非消费验签候选已限定接收 | [新交接](system-backup-a-sensitive-download-candidate-20261016.md)与[3,185 项/94 项新增检查回执](evidence/a-sensitive-download-candidate-review-20261016.json)；独立审计 ID 存储另已复核，D 前置锁/收据/原子 nonce 及共享迁移仍待完成，生产消费 adapter 未启用。 |
| D 下载 intent 审计存储独立复核 | 本地与真实 MySQL 四项均限定接收，无需重跑 | [本地复核](system-backup-a-download-audit-review-20261016.md)与[实际 SQL 回执](evidence/a-download-audit-mysql-accepted-sbk-mig-261016070211-49af.json)：新轮 1,314 来源、四项/root、95 文件迁移、准确载荷绑定、fixture/namespace/两端清理、exit 0 及 17 项核对通过。389 重点输入中 388 匹配，独立 tagged D 读取探针漂移另记；完整下载准入仍待完成。 |
| 081/082 正式化评审 | A 候选已交付，D 已接收候选边界；正式化未完成 | [A 固定输入评审](evidence/a-download-and-migrations-review-20261016.json)及[D 接收与对象决议候选](system-backup-d-a-migration-review-20261016.md)；正式 ownership/inventory、历史升级、容量及审计保留仍待证据，既有 config schema 批准仍需 A/B/C。 |
| 真实授权/来源/部署 | 仓库检查后暂无可用交付 | [材料审计](evidence/a-maintenance-materials-audit-20261016.json)；现有 bootstrap/issuer 及向量均不能作为 maintenance grant/历史原文。接口和摘要不替代材料。 |

## 当前输入边界

本轮已收尾，按用户“完成这轮后暂停目标”的要求暂停推进。最新 LDAP 本地轮接收范围见上表；下载审计真实 MySQL 四项已关闭且无需重跑。后续恢复时仍需区分实际企业目录/本人 MFA、真实维护 grant/issuer/旧 canonical 来源、D 完整前置锁/operation/receipt/容量/原子 nonce 与正式共享批准，这些没有因本轮通过而完成。

最新操作者审计四项实际 MySQL 已由 A 接收，见[限定回执与范围](system-backup-a-download-audit-mysql-handoff-20261016.md)。四项/root、95 文件迁移、准确新轮载荷、四份 owned user/audit、namespace/原 UID、两端 scratch、exit 0 与 17 项独立核对齐全，准确本地 owner/container 确认不存在。只接收原冻结审计组件，389 重点 pin 中 388 匹配，一份并行 tagged D 读取探针及另一处 server wrapper 变动单列排除。下文“四项待回传”属于先前准备记录，以本段为准；D 完整前置锁/权限/容量/operation/receipt/nonce 原子提交和生产材料仍未完成。

操作者 14:42:58 的首次审计远测在源码捕获阶段失败，未进入 Go/SSH/MySQL。已按[限定修复回执](evidence/a-download-audit-source-retry-review-20261016.json)给 D 入口复用 source-only 三次捕获并提前输出 owner；其他 386 份原重点输入不变，Go/SSH/SQL 阶段不增加重试。八项捕获用例与 13 项 dispatch 绑定在 PowerShell 7/5.1 均通过，真实 1,313 项稳定副本首次捕获/postcheck 与三条准确测试目录清理通过；12 项独立复核通过，没有构建或远测。[完整命令](system-backup-a-download-audit-mysql-handoff-20261016.md)仍适用，实际四项结果待新轮回传。

最新 [D 独立勘误和审计四项远测准备](system-backup-a-download-audit-mysql-handoff-20261016.md)已由 A 接收限定边界。勘误保留原决议指纹，明确当前拒绝空内容、`0/0` 为未来纯编码、key 沿用现有闭集；此前说明冲突已澄清。准备轮与 A 审计复核同一 source，17 项独立核对、387 份重点 pin、准确 source/container 缺席通过；不重跑构建或远测。完整命令和回传标准已提供，实际 MySQL 四项当前仍为零，正式共享迁移/批准及完整 D 准入仍待完成。

最新 D 下载 intent 审计存储已由 A 独立复核：[1,420 项整包检查及 27 项新增检查回执](evidence/a-download-audit-review-20261016.json)只接收准确 `*sql.Tx` 下的真实 INSERT ID、原行/原始内容/时间锚点重验和失败关闭。四轮八条准确自有路径已删除，137 份重点来源及全部已有清单输入匹配；初次源码漂移、Windows 编译器故障及恢复捕获漂移均保留，只有最终轮执行测试。实际 operation/receipt/公共快照、前置锁、容量、原子 nonce 与最终提交点仍未装配，不能据此宣称完整下载已授权或防 replay 已验证。

最新 [D 敏感下载决议](system-backup-d-sensitive-download-admission-contract-20261016.md)已解除选方案的阻断。A 按准确决议实现共享完整 Manifest/Range canonical、严格 header 与实际 Ed25519/全部声明历史 HMAC 候选校验、原始期限重查；[新冻结门禁](system-backup-a-sensitive-download-candidate-20261016.md)为 1,302 项输入，security/evidence 两包 3,185 项不同检查通过，其中新增 94 项，无跳过，默认 vet/exit 0/源码与 D 决议 postcheck 通过。两轮四条准确 owner 已删除，278 份重点来源及全部已有清单输入匹配。已记录空内容 `0/0` 与现 parser/Manifest 不一致的边界，当前 adapter 继续拒绝空 Manifest；不以纯 canonical 向量代替生产支持或 nonce replay 防护。

用户允许安装后，12:46–12:50 的[HTTP 整包轮](system-backup-a-auth-http-validation-20261016.md)冻结 1,295 项输入，补齐依赖后的测试阶段离线、模块只读。repository/services/middleware/handlers/server 五包、1,374 项不同检查、默认 vet 和退出 0 通过，七个 Unix 权限/符号链接用例按平台条件跳过。初轮 services 的 workspace 夹具失败及 SQL 参数日志证据保留；修订后同轮五包通过，34 份重点来源及全部已有清单输入匹配，六条准确自有路径确认删除。此轮不替代真实目录、本人 MFA 或生产维护授权。

最新操作者 11:06–11:24 远测已接收，见[原日志](evidence/a-config-proof-mysql-remote-20261016-110614-b99f5f47.txt)、[1,292 项源码清单](evidence/a-config-proof-mysql-remote-source-20261016-110614-b99f5f47.json)及[验收回执](evidence/a-config-proof-mysql-accepted-sbk-mig-261016032334-5226.json)。稳定捕获第一次成功；44 项不同本地 Go 检查、11 项不同派发检查、默认 vet、Linux probe/runner、95 文件正式迁移和十五项真实 MySQL 全部通过。重复 seed/派发不重复加总。两项实际 state/config 行锁等待与十五份 owned fixture 清理可见；准确 UID namespace、远端 scratch、内层缓存报告清理，源码 owner 独立确认不存在。A 没有再次访问远端或重跑套件。

归档时 254 份 security/proof/迁移重点输入匹配；原清单 1,291 份匹配，`scripts/system-backup-d-control-health-validation.ps1` 已由并行工作改变，新增文件未纳入本轮验收。只接收冻结 proof 签发范围；合成人员/MFA/issuer/key、真实提交后合成丢失回执的边界保留，不放行真实维护 grant、配置 writer、旧行回填或生产部署。

同期 [D 对 081/082 的接收](system-backup-d-a-migration-review-20261016.md)已补对象决议候选，尚未晋升正式 inventory/registry。核对当前 `schema-registry-decisions.json`，既有 `system_backup_configs` 必须由 A、B、C 交叉评审，批准列表仍为空；本页“不依赖 B/C”只包含 A 候选评审及隔离验证准备，不包含正式共享 schema 批准。敏感下载 operation 的语义已由另一份 D 决议确认，但共享 SQL/DTO/政策及跨 owner 批准仍未完成。

历史准备记录：10:26/10:30 两次操作者尝试均在稳定源码副本生成前失败，没有 source manifest 或 SQL/SSH 阶段。A 新增仅针对源变动的最多三次捕获：不放宽任何 before/after 完整性检查，捕获成功后才编译和派发一次，不能把它扩展为 Go/SSH/MySQL 自动重试。八个场景在 PowerShell 7/5.1 分别通过；完整真实输入 1,288 项的稳定副本/postcheck 通过，全部准确本地目录清理见[准备回执](evidence/a-config-proof-source-retry-review-20261016.json)。该准备轮未执行远测；后续实际 SQL 结果以上述 11:06 轮为准。

D 早上七项服务冻结 1,265 项输入，迁移数 94；09:50 proof 门禁冻结 1,274 项输入，已经包含合并后的 `064_add_instance_browser_workers.sql`。相对旧轮新增九项输入，旧输入亦有差异。之后 server 读取与前端代码继续由其他聊天修改。A 保存原轮全部回执和当前差异，不改写旧成功结论，也不将其扩大为当前所有输入已经验收。

## 私有 holder 的使用边界

构造输入是服务端配置的稳定逻辑 issuer、现有 SQL 会话实例和实际 HTTPS 请求。JWT 校验只确定独立的 `user:<id>` 与会话摘要；在 grant 回调前后，仍使用原事务锁定用户凭据、当前 session/撤销行，并采样新数据库时钟。grant 返回的稳定 issuer/principal 必须与该身份相同，不能从 grant 中复制主体作为认证结果。请求上下文绑定拒绝其他请求和脱离原请求的 context；取消、改密、撤销、缩短和到期均不得返回 grant facts。

该组件不授予 maintenance 权限、不确认用户本人 MFA、不认证 LDAP 撤销事件、不生成 grant/provenance/schema/capacity facts，也不注册/刷新 session、写审计或提交事务。运行部署采用本地用户 ID 前还须评审 issuer/principal 生命周期与不可重分配规则；没有真实 grant/archive/target/capacity 时私有回填服务仍不能对外启用。

[最终本地原日志](evidence/a-maintenance-session-holder-local-20261016-101934.txt)冻结 1,282 项输入，source `47c6abe95b40d7572a8dc9d5ef8978ef59f3b21962242d78e12054ec2c2e1903`。定向 2 主测试/22 子用例通过；完整 security 232/1,547 与 config 20/113，共 1,912 项不同检查通过，定向重复覆盖不另加总。默认 vet、冻结副本 postcheck 和 exit 0 齐全，未安装依赖；两轮四个准确 owner 和 161 条夹具路径独立确认不存在，相关 security/config 输入归档时无漂移。

[首轮完整日志](evidence/a-maintenance-session-holder-local-20261016-100130.txt)保留 300 秒包级超时，超时前无测试断言失败；其两份 adapter Go 源码与最终轮一致。最终 wrapper 将完整包时限调整为 900 秒，未修改业务守卫或重试断言失败。此本地模型验收不作为真实 MySQL、LDAP 事件、运行授权或整个并行工作树的验收。

## 运行材料检查结果

用户要求先检查仓库，没有就记为没有，不再索要同一批路径。本轮检索源码、contracts、部署输入和文档，并对忽略文件的候选文件名补查；排除 .git、活跃测试 scratch、依赖、缓存与运行上传目录，未访问外部存储或远端环境。已有 [10 月 14 日 D 材料审计](evidence/system-backup-d-canonical-materials-audit-20261014.json)也明确同一要求和缺口。

查到的部署包是 `d_registration_public_bootstrap_candidate_v1`；两份 issuer registry 分别为 draft strong-auth 和 provider-proof 用途。它们没有维护写/观察 grant、holder 与撤销协议。原文相关交付为合成 request/row/provenance 向量及摘要合同，没有发现可接收的 installation/version-bound 旧 canonical 与独立认证的原归档证明。结论记录为“仓库未发现可用的受审运行材料”，不声称检查了远端或所有任意二进制内容；不复制这些其他用途的配置拼装维护权限。

## 完整 HTTP / 目录链路的剩余限制

历史[整包依赖预检](evidence/a-auth-full-package-dependency-preflight-20261016.txt)在当时禁止安装的条件下退出 1，未构建 server 或执行 HTTP 测试，准确 scratch 已清理。用户后续允许安装后，锁定的 `compress v1.18.0` 已补齐且模块文件未变，[最终完整本地门禁](evidence/a-auth-http-review-20261016.json)已通过，上述依赖待办关闭。仍未验收部署环境的 HTTP、独立 LDAP TLS/bind、可信目录撤销事件、本人 MFA，以及七个本轮平台跳过的检查；进程内 HTTP 和模型会话不能替代这些运行事实。
