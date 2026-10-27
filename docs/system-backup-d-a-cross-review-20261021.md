# D 对 A 十五表与四组公共合同的实质复核

本轮复核以 `d-a-business-review-base-20261021.json` 的冻结来源及 `d-owner-review-queue-20261021.json` 的评审输入为起点。下面记录逐项源码结论、发现的问题和仍需提供的集成证据；它没有填写 registry 或合同中的批准字段。最终测试与发布摘要见同目录 evidence 下的 `d-a-business-review-preparation-20261021.json`。

## 发现与处理

`SQLCountCollector.CollectSnapshot` 与 `SQLRestoreVerifier.VerifyRestoreTarget` 原先只检查 `Commit` 的返回错误。当驱动在提交期间取消调用上下文、随后报告提交成功时，前者仍返回计数，后者仍返回检查结果（包括不一致结果）。新增驱动边界回归在取消发生于实际 `Commit` 内部时复现这两条路径；修正仅在成功提交后检查 `ctx.Err()`，取消时返回零值及原取消原因。正常数据不一致仍返回原有有界检查及 `ErrRestoreNormalizationMismatch`，提交错误仍保留原包装错误。

该修正不改变 SQL、只读 RR、原有 proof 调用或提交次数，也不声称能撤销已提交事务。它解决请求完成边界，不能替代真实 MySQL、dump 来源认证或目标写入的验证。

旧代码对照共 12 项，五个正常/提交错误/有效不一致对照通过，三个取消叶子及其四个父级失败，原日志保留。修正后定向 2 个主用例/12 项和业务、安全两完整包 **333 个主用例/2,346 项**通过，无失败或跳过，默认 vet 与来源前后复核通过。冻结 1,472 输入摘要为 `c5faafbe0468c67537746a76c3237400a7bd72fe18a3e2857d6c3d923e51e4c4`；反向移除两个新增分支后，两份生产文件与基线摘要完全匹配。没有安装依赖或执行远端。

旧实测 fixture 的准确 Git 字节与原回执摘要匹配。相较当前 fixture，仅增加 B 的 `instance_browser_workers`，catalog 从 94 增至 95，summary 相应变化；共同对象和 A 的十五条 policy 均未变化。`northbound_operations` 已存在于旧基线。原误判保留并由 `d-six-scope-audit-correction-20261021.json` 明确更正。旧实测仍只覆盖其原冻结版本。

## 十五表的源码复核

下表中的入口均位于 `backend/internal/systembackupbusinessa/`。这些函数产生候选行；真实目标事务的权限、占用、校验、写入和提交由 B 的认证适配器负责。

| 表 | 主要入口 | 已核对的恢复行为 |
| --- | --- | --- |
| users | users_restore.go | 用户与目标 ID 映射；禁用用户、改为 local、密码为重置哨兵；不恢复目录凭据、登录别名或上次登录状态。 |
| user_quotas | quota_restore.go | 用户与 quota ID 映射；目标容量独立输入；超限拒绝；CPU 使用定点表示，整数非负且有界。 |
| enterprise_auth_settings | enterprise_auth_restore.go | 版本化 Secret 证明及 UpdatedBy 映射；LDAP 配置保留但禁用；bind 密码写显式空字符串，避免 NULL 继承环境密码。 |
| northbound_auth_challenges | northbound_challenge_restore.go | challenge 映射及历史 hash 校验；以认证目标时钟置 expired，失效/使用/更新时间落在目标时钟之前。 |
| northbound_sessions | northbound_session_restore.go | session、用户映射与重复值拒绝；历史 hash 保留，状态 revoked，access/refresh 期限和撤销时间失效。 |
| northbound_caller_policies | northbound_caller_policy_restore.go | 用户及 UpdatedBy 映射、scope 规范化；Enabled=false。 |
| llm_models | llm_model_restore.go | ID 映射；非空凭据要求不可变版本证明；APIKey 和 SecretRef 清空、模型禁用；价格定点校验，URL 拒绝 userinfo/query/fragment。 |
| risk_rules | risk_rule_restore.go | rule 映射、正则编译、severity/action 闭集；规则禁用，不恢复执行状态。 |
| instance_gateway_token_aliases | gateway_alias_restore.go | alias 与历史 instance 映射；仅保留 token hash，期限按认证目标时钟失效。 |
| chat_sessions | chat_session_restore.go | 新 session ID 与原 ID 区分；可空用户/实例映射；保留历史时间，LastTraceID 清空。 |
| chat_messages | chat_message_restore.go | session/trace/user/instance/invocation 引用一致；正文固定脱敏，历史 role/sequence/time 保留。 |
| model_invocations | model_invocation_restore.go | 引用统一映射；计数非负有界；请求/响应/错误按可空性脱敏；pending 转 failed，不能恢复执行。 |
| audit_events | audit_event_restore.go | actor/invocation/trace 等引用映射；Message 和存在的 Details 脱敏；只作为历史记录。 |
| cost_records | cost_record_restore.go | 统一引用映射、定点价格/成本/currency 与 NULL 区分；仅保留历史账目，不据此重新计费。 |
| risk_hits | risk_hit_restore.go | 已批准 rule 及可空引用映射；MatchSummary 脱敏；历史 severity/action 保留，不执行规则。 |

`ai_gateway_cross_table_restore.go` 核对共享引用映射，防止同一 trace 分叉、不同 trace 合并及 invocation/trace 不一致；它不证明 dump 的真实性，也不检查历史账目的跨行金额总和。`business_restore.go` 克隆输入、校验完整十五表及共同映射，执行 B 的初始证明和最终重核，取消时拒绝输出。

`capture.go` 的 pin 必须匹配可信期望值、完整 frozen registry、schema 与 review 约束；测试构造的 frozen fixture 不能冻结真实 registry。计数采集有 30 次查询；恢复只读验证有 39 次查询，产生十五个计数和九个安全检查。计数相等不能证明所有恢复列逐字段正确，不能替代目标凭据清除、目标占用/排序规则和实际写入证明。

## 四组公共合同

| 合同 | 实质复核结论 | 仍需的集成证据 |
| --- | --- | --- |
| strong-auth-proof-nonce | 关闭的 payload/signature；本地 Ed25519 JWS profile、精确 protected header、request/subject/session/时间绑定；nonce 历史 HMAC 版本由配置和保留账本决定，须与变更及审计原子消费。 | 实际管理身份、人员 MFA、版本保留与原子事务；其他签名格式须有独立评审适配器。 |
| provider-proof-registration | 三种目标的条件字段关闭；expected row version、幂等、签名覆盖目标和 installation/audience；canonical base64 与大小限制；独立时间/用途/权限复核。登记不等于目标成功。 | 可信 issuer、实际 provider 操作、DB 时钟及 CAS/审计/nonce 原子提交。 |
| secret-ref | 六种关闭的用途受限身份；hash/不可变版本，禁止原始 locator/key/token；Kubernetes 精确 name/UID/key；删除、发现、CA 等用途隔离。 | 实际 resolver 的身份认证、脱敏输出、版本和历史保留；schema 注释本身不能实施脱敏。 |
| capability-evidence | 六类 role、code/status/reason 组合关闭；强制脱敏和 cleanup marker；probe/cleanup/TTL 顺序与可信 policy 时界，不因持久化延长有效期。缺失/过期保持 unknown。 | 可信提交者、实际 probe/cleanup、provider 能力真实性；结构有效不等于操作成功。 |

本轮针对这四组的 schema 用例 4 项及签名/issuer 用例 10 项通过。它们验证既定结构和本地密码学候选边界；没有提供这四组完整 Go/TypeScript wire parity、在线 provider 能力或人员 MFA 的证明。D 的既有 DTO parity 范围也不能自动扩展为这些 A 合同。

## 待收敛项

提交后的取消问题由本轮代码和回归处理。其余需分开推进：D 对 policy/公共合同的正式签收应明确签收范围和证据；A/B/C 的签收不得代填；B 仍需交付可信 dump/source、目标时钟/占用、fence、真实单事务 writer 与完整 readback 的接线。全局冻结、当前 migration 的实际 SQL、生产身份与卷以及原六项验收没有由本轮局部测试完成。
