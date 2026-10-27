# D 接收 A 六表评审与修订清单（2026-10-22）

D 已核对并接收 [A 六表安全评审](system-backup-a-resources-normalization-review-20261022.md)及其机器回执。六表结论均为 changes_required；这是评审意见到达，不是规则、实现或恢复写入获批。原九表提案、原二十五份输入摘要和 A 的三十一份历史来源 capsule 保持原样，正式 registry 和批准字段不变。

A 的回执绑定原 request SHA256 de28bc5bd7369d3df9f6382f42701f510b5c0b22c50fc030b7769887b137daf3、原 source_digest 8f6e932251521fe0774b100f34495b79a695515bb27006448a771a9be784f335 与规则版本 a.resources.restore-security.v1。历史 capsule 的全部字节和 A 原复核程序均已验证。当前 control_exclusion.go 与 verifier.go 已有后续 typed-nil 检查修复，不能把历史评审写成对新字节的实现签收。

## D 下一版提案必须写明的六组修改

| 表 | D 应提交的明确规则与验收 | 仍需对方提供的输入 |
| --- | --- | --- |
| audit_logs | 给出 resource_type 闭集和每类 typed 映射；未知非 NULL 引用整批拒绝，或另提历史命名空间重审。保留原审计身份、时间和 cutoff 的可追溯性，明确目标已有审计时的冲突处理。details 非 NULL 统一为合法 JSON 字符串 `"[REDACTED]"`，NULL 保持 NULL；ip_address 按自由文本规则遮蔽。 | B：来源、目标占用、映射和事务证明；A：修订后的闭集/冲突与脱敏规则复审。 |
| egress_private_exceptions | scope_type 仅 user/instance，并使用对应映射；created_by 映射，enabled=false，description 遮蔽。验证整个 CIDR 和端口，不只验证起始地址属于私网；拒绝覆盖公网或目标禁止地址的宽前缀。 | B：完整目标网络策略、身份存在性、启动门禁及后续独立启用授权；A/B 复审。 |
| northbound_admin_settings | id=1 的完整关闭候选、显式 callers；目标 NodePort 作为 B 认证事实，不因恢复开放端口。version 绑定目标 observed CAS，明确初始化、递增和溢出拒绝；来源 version 只留历史。DECIMAL 不经过 float64；补无缓存失败、旧缓存、缺行默认、环境配置、nil provider 与重启的门禁场景。 | B：目标规格、端口、observed version、目标占用及启动门禁；A/B 复审。 |
| northbound_settings_audit | actor、时间、原身份和冲突采用共同历史规则；before_json/after_json 非 NULL 整体遮蔽为合法 JSON 字符串，NULL 保持 NULL。不得回放 settings/caller/port 变更；若要结构化历史差异，另提按 action 分型的闭集 schema 升版本重审。 | A/B：历史 ID 冲突和分型方案（如确需保留结构）；不复用历史 caller 资格。 |
| security_scan_configs | 明确配置行基数与选行规则；default_mode、analyzer、timeout 采用 C 的闭集和当前能力，allow_fallback=false。坏 JSON、未知 analyzer 和能力缺失整批拒绝，不借用服务默认补全。 | C：行基数、准确 analyzer/能力版本和目标策略；B：ensureConfig/扫描服务启动门禁；A/C 复审。 |
| security_scan_jobs | scope_json 只用 C 确认的 scan_scope/可选 asset_id 结构；拒绝重复键、未知键、坏类型/JSON，不走默认 incremental。current_item_name 遮蔽。pending/running 不续跑，终态/计数/时间须与 items/report 一致，不能直接把全部旧任务标 failed。 | C：资产映射、合法终态与父子汇总语义；B：目标处理时间和门禁；A/C 复审。 |

共同修订要求：user/instance/job/asset/scan_result 使用独立 typed 映射，缺失、歧义、错类型或合并身份整批拒绝；非 NULL 来源 actor 不因缺映射被清空。空表也须认证，证明绑定同一 dump/checkpoint/schema/cutoff、目标、映射、处理时间和写事务。审计和自由正文不能通过少数关键词替换证明安全；可选文本按 NULL 或 `[REDACTED]` 处理，非空必需资产名称须 C 提供受审非敏感投影。现有数量/cutoff verifier 不能替代逐字段、映射和脱敏验证。

## 接收状态与下一步

本轮将 A 从“尚未收到意见”更新为“六表意见已收到、全部需修改”。原请求 review_receipts 仍为空是旧请求的历史状态，本轮以独立 [D 接收回执](evidence/d-a-resources-review-intake-20261022.json)记录到达，不就地改写 A 已绑定的原 request。B/C 对应意见和真实适配器仍需分别提供；此处不以目录里没有文件推断远端交付状态。

D 接下来据此形成下一版提案，关闭资源引用闭集、目标 ID 冲突、北向 CAS、扫描配置基数及扫描终态五类开放决策；绑定更新后的实际代码和全部 helper/测试输入，再向对应角色提交同版本复审。收到必需结论后再实现可提交的九表候选、逐字段 verifier 和 B writer 集成。此次不虚构 B/C 材料，不生成恢复写入候选，不把 A 的“需修改”转换成任何 approved_cross_reviewers。

原 A 复核命令 node docs/evidence/a-resources-normalization-review-20261022.mjs --check 验证历史意见；D 接收材料由 node docs/evidence/d-a-resources-review-intake-20261022.mjs --check 复核。没有发送消息、安装依赖、运行测试构建或执行远端命令。
