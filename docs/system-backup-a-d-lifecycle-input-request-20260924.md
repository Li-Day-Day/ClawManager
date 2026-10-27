# A → D：生命周期与轮换测试补充输入（2026-09-24）

**已完成：** D 已交付并执行 run `d-lc-387dab09ff2a1367ca4b5b56`，A 已完成 [限定范围复核签收](system-backup-a-lifecycle-acceptance-20260924.md)。本请求不再是待 D 处理的阻塞项，无需重复执行；下文保留为原始需求与验收边界。

## 已完成与当前边界

- Evidence run `a-ev-7b1a56dbc722a6e70b0dc4f0`：18 项数据面检查通过，22 条观察，退出 0，对象/Pod 清理完成。见 [记录](evidence/system-backup-a-evidence-spike-7b1a56dbc722a6e70b0dc4f0.json)。
- KMS/signing run `a-ks-fb61b8d528bd3b052b5ecbdc`：KMS v1 生成/解包与隔离、三类 signer 固定 ref/public key、版本/用途拒绝及三类本机独立验签通过；18 项检查、22 条观察、退出 0、Pod 清理完成。见 [记录](evidence/system-backup-a-kms-signing-spike-fb61b8d528bd3b052b5ecbdc.json)。
- 这些是操作者回传的未签名摘要。KMS/signing 公共签名已由入口剥离，归档阶段不能重做验签。正式登记需另行生成可审查、可验签且绑定输入版本的证据。

现有交接身份仅允许各自数据面操作，没有提供生命周期管理入口；8 小时 TTL 的声明不等于实际过期/撤销负测。现有 named v1 key 也未提供轮换验证方案。A 暂不撤销当前五个身份，不修改现有 key，不挂载 `lab-recovery` 给普通探针。

## 请 D 补充的具体输入

| 范围 | 交接内容 | A 后续验收 |
| --- | --- | --- |
| 撤销 | 独立可丢弃的 KMS generate/unwrap 和三用途 signer 会话；对应只含引用的撤销目标；由 D 执行或提供限定这些目标的控制入口 | 撤销前正常调用成功；撤销后相同身份受保护调用被拒绝；另一个有效控制身份同时正常，区分服务故障与撤销生效 |
| 自然过期 | 独立短 TTL、不可续期会话；签发时刻、有效期/到期依据、时钟来源、Secret 名称/UID/resourceVersion，以及可覆盖测试窗口的有效控制身份 | 到期前成功；经过到期及约定传播容差后拒绝；不能通过临时 revoke 冒充自然到期 |
| KMS 轮换 | 与已验证 v1 基线分离的测试 key 集；显式旧/新完整 ref、context、版本选择规则、切换步骤和历史解包权限 | 切换后新数据只用指定新 ref；旧密文仍按旧 ref 解包；错误 ref/context 被拒绝，禁止静默 latest |
| 三类签名轮换 | 三用途各自独立旧/新测试 key、公钥、完整版本引用；明确签名切换和历史公钥保留规则 | 新签名绑定新 ref；轮换前合成签名仍可用旧公钥离线验签；错公钥、错用途绑定、篡改内容被拒绝 |
| 审计与清理 | 以上控制动作的脱敏审计关联、run 所有权、精确资源清单、失败恢复步骤及清理后的验证方式 | 不输出 token/DEK/私钥；临时 Pod、身份、测试 key 及可丢弃记录按约定清理；保留非敏感验收记录 |

普通测试 Pod 每次仅挂载对应身份及 CA。涉及签发、撤销、轮换的控制动作须与数据面探针分离；不以扩大当前五个身份权限替代专用测试输入。测试会话有效期由 D 结合启动时间制定；不要让 A 为等待自然过期而依赖现有八小时会话。

补充交接应作为新文件提供，保留原交接及其 hash，包含 namespace UID、endpoint/CA hash、digest 镜像、所有新 Secret 的非敏感不可变引用、key/public-key/ref 映射、操作顺序、清理边界与未覆盖项。A 收到后复核新快照，生成完整 PowerShell 探针命令，再由操作者远程执行。不得把 Secret/token 值写入交接文档或聊天。

## 其余尚未关闭的能力

生产 task/attempt scoped grant、Evidence grant 内容/长度/到期绑定、provider-proof adapter 与正式 evidence registry、源集群之外恢复仍需独立实现和证据。本轮不把这些能力或整个 capability matrix 标记为通过。

当前无需重跑上述成功 run，也无需执行其 RECOVERY。暂保留 D provider 环境供后续测试；全部 A 测试完成后，按原 D 文档精确绑定 namespace UID 做整体清理。
