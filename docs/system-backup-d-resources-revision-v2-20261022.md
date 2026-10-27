# D 九表恢复规则第二版提案

日期：2026-10-22。规则版本 `d.resources.restore.v2`，状态为待 A/B/C 同版本复审。依据 [A 六表意见](system-backup-a-resources-normalization-review-20261022.md)修订；原提案、原请求及历史回执保持原字节。本版提出确定的规则供评审，不填写任何正式批准，不接入恢复 writer。新离线 helper 只能检查值，不能证明来源、目标存在性、能力或权限。

## 共同身份、正文与写入规则

1. user、instance、scan_job、skill、skill_scan_result、audit_log、northbound_settings_audit 为不同映射命名空间。同数值的 user/instance 不能互借；不使用无类型的 asset/result 整数。当前扫描实现只支持 skill，未来资产类型须另升版本。拒绝未知类型、非正值、超过实际 SQL 列范围、重复源（包括相同重复项）、一源多目标或同类型多源合并。SQL NULL 保持 NULL；非 NULL 缺映射整批拒绝，不清空 actor。映射只表达历史关联，不赋予任何目标权限。
2. B 必须认证九表全部来源（包括空表），绑定 source installation、准确 dump/checkpoint/schema/cutoff、目标 installation/schema、各 owner 映射版本、目标处理 UTC 时间、隔离门禁与同一写事务。skill/result/版本关联和非敏感名称另由 C 认证。所有回调收到独立副本；离线 helper 的成功不代替 proof。
3. 两张审计表采用显式目标 ID 映射。可以保留源数值，但必须证明其未占用；冲突时使用 B 在共同写事务内保留的新 ID 并绑定新映射，或整批拒绝。禁止清表、覆盖、INSERT IGNORE、REPLACE 或覆盖本轮恢复审计。源 ID、created_at、源引用和原 cutoff 保存在受认证、受控的历史映射证据中；重编号后的 MAX(id) 不能替代源 cutoff。公共结果只引用证据 ID，不携带原正文。
4. 所有可选自由文本均采用 SQL NULL→NULL，非 NULL（含空串）→`[REDACTED]`。JSON 正文字段的非 NULL 输出为合法 JSON 字符串 `"[REDACTED]"`，包括来源 JSON 值 null；不以少量关键词替换、原正文摘要或原错误作为脱敏证明。必需 asset_name 必须为 C 认证的非敏感投影；缺失则拒绝。
5. B 事务 writer 采用显式列与参数化 SQL，保留 FK，并在实际事务内锁定/复查目标 ID 占用、目标 CAS、当前权限和隔离门禁。失败、撤权、取消、提交未知均不得生成成功资格。写后由 B 销毁写凭据，另建 SELECT-only 会话进行逐字段检查；35 张控制表排除与原数量/cutoff 检查继续独立执行。

## 九表的确定提案与未交付事实

| 表 | v2 提案 | 必需复审/事实 |
| --- | --- | --- |
| audit_logs | resource_type 精确闭集为 user、instance、system_backup。前两者非 NULL resource_id 使用对应 typed 映射；system_backup 仅允许 NULL，安装本地控制 ID 不重绑定。其他类型即使引用为 NULL 也整批拒绝，不静默丢历史；如真实历史超出闭集，另提版本化扩展。user_id 按 user 映射，details 整体 JSON 遮蔽，ip_address 整体文本遮蔽；action 与 created_at 作为认证历史保存。ID 按共同占用规则处理。 | A 复审闭集/正文/冲突；B 来源、真实引用、ID 保留与事务事实。 |
| egress_private_exceptions | scope_type 精确为 user 或 instance，scope_id 及非 NULL created_by 必须映射；enabled=false，description 整体遮蔽。CIDR 必须为规范网络地址，整个前缀处于 RFC1918 或 fc00::/7，且整个前缀与准确端口被 B 目标白名单包含；与任意目标禁止网段相交即拒绝。拒绝 link-local、IPv4-mapped IPv6、主机位、过宽前缀、0/越界端口及任何坏策略条目。后续启用另授权。 | A/B 复审；B 完整控制/metadata/provider 禁止范围、目标身份和启动门禁。前缀检查不认证策略完整性。 |
| northbound_admin_settings | 来源至多一行且 id=1；无行不得由 D 补默认。非空候选完整列集，api_enabled=false、require_explicit_callers=true；updated_by 用 user 映射，external_node_port 只取 B 认证目标事实，不创建或开放端口。全部 TTL、限流、规格、类型、operation 参数同时满足现有服务与目标更严限制。CPU 从 SQL DECIMAL(4,2) 精确字符串转百分之一单位，不经过当前 float64 model。来源 version 仅为历史；目标缺行经 B 认证时 INSERT version=1，否则锁定目标 observed version=v，条件更新为 v+1 且恰好一行。v<=0、MaxInt64、CAS 失败均整批拒绝。禁止 upsert 吞并发与回放 caller policy。 | A/B 复审；B 目标规格/端口、缺行或准确 observed version、完整候选/启动门禁。纯版本计算不证明缺行或已完成 CAS。 |
| northbound_settings_audit | actor_user_id 映射；action、created_at 和原身份按共同历史规则保存。before_json/after_json 非 NULL 一律整体 JSON 遮蔽。settings.update、caller_policy.update、external_node_port.update 都仅作为历史，不触发配置/caller/端口更新。ID 独立于 audit_logs 分配；禁止覆盖。 | A/B 复审历史冲突、来源绑定和整体遮蔽；不保留任意结构化旧配置。 |
| security_scan_configs | D 提议完整表基数为 0 或 1；非空必须 id=1，不取 MAX(id)/最新行、不丢多余行。空配置只在同批 jobs/items/reports 全空且 C 明确认可该缺省状态时允许，B 仍封锁 ensureConfig。default_mode 精确 quick/deep；analyzer JSON 必须为非空、无重复字符串数组，各项属于 C 同版本闭集及当前能力，timeout 通过 C 目标范围，allow_fallback=false，updated_by 映射。任何未知/坏 JSON/能力缺失整批拒绝，不借服务默认补全。 | A/C 复审基数、analyzer 闭集/最少项/timeout/当前能力；B ensureConfig、手动启动和 worker 门禁。当前没有这些实际 C 事实，不生成完整配置候选。 |
| security_scan_jobs | D 提议 scope_json 为必需 JSON 对象，准确键 scan_scope（full/incremental）及可选正整数 asset_id（skill 映射）；拒绝 NULL/缺失/重复键（含转义等价）、大小写别名、未知键、坏类型、尾随内容和超 4096 字节，不回落 incremental。requested_by 映射；current_item_name 整体遮蔽。下节提出明确的父子终态方案，必须由 C 复审后才能实现写入。 | A/C 复审 scope 与终态；C 资产/结果版本与真实汇总语义；B 认证处理时刻/门禁。 |
| security_scan_job_items | job_id、asset_id、scan_result_id 分别使用 scan_job/skill/skill_scan_result 映射；result 必须与同一来源 skill 和版本一致。asset_type 仅 skill；asset_name 使用 C 非敏感投影，summary/error_message 整体遮蔽。不把 cached_result 当作当前新鲜结果或恢复资格。父子集合、计数、进度和时间按下节共同处理。 | C 复审结果/版本关系、名称投影、风险闭集和缓存语义；B 真实行集与事务。 |
| security_scan_reports | 每个来源 job 至多一份报告，job_id 使用同一映射。禁止复制服务生成的完整 summary_json：当前 generateReport 内嵌 Config，而该配置含 LLMAPIKey/MetaLLMAPIKey/URL。拟从已脱敏父子行重新生成 C 评审的闭集历史 summary，排除 Config、scanner 响应、任意原正文/URL和凭据。没有受审 report schema 就整批拒绝，不调用当前 generateReport 补齐。报告不给当前安全/可用资格。 | C 提供并复审准确闭集 schema、计数/风险/引用语义；A 对嵌套正文边界复审；B 报告/父子完整性。 |
| system_image_settings | 每行 id、instance_type、runtime_type、runtime_variant、display_name、image、is_enabled、created_at、updated_at 完整核对；D 提议同一 instance_type/runtime_type/runtime_variant 不得有多个候选，目标已占用时整批拒绝，不能把现有非唯一索引误当作数据库已保证唯一。display_name 采用 B 受审非敏感投影。image 只取 B 认证的目标精确镜像映射与可用性事实，is_enabled=false；来源开关不继承。缺行不触发默认预设；环境默认、默认镜像及后续启用均受目标门禁约束。 | B 复审完整迁移列、逻辑键、目标镜像/默认/环境/启动路径及后续激活。 |

表内涉及服务范围/列集的原有合同继续适用；本提案不以未列出的字段为可丢弃字段，也不拿 D 自拟 analyzer/report schema 代替 C 的领域决定。

## 扫描父子终态的具体复审提案

源码实际创建 Job.status=queued、item.status=pending；原清单只写 pending/running 不充分。runJob 最终将父 Job 写成 completed，即使 failed_items>0；markJobItemFailed 同时递增 CompletedItems 和 FailedItems。因此不能把 completed_items 理解成“成功数”。

D 提议如下同版本规则，C 需逐条认可或给出替代规则；当前 helper 未生成这类行：

- 父 Job 的 accepted source status 为 queued/running/completed/failed，item 为 pending/running/completed/failed；未知状态拒绝。C 必须确认父 failed 的历史来源合法性，不能仅凭 VARCHAR 可存就接受。
- total_items 等于完整 item 集合大小；completed_items 表示 completed 或 failed 的终态 item 数，failed_items 为 failed 数；不得靠截断行集补齐，源终态计数不一致拒绝。
- 已完成父 Job 必须所有 item 终态；父 completed 可包含失败 item。原始终态/时间/统计先验证，再保留历史，不提升当前资格。
- queued/running 父 Job 视为“恢复中止”：D 提议父转换 failed；仅其 pending/running items 转 failed、progress_pct=100、cached_result=false、error_message=`[REDACTED]`、finished_at/updated_at=认证目标处理时刻。既有 terminal items 保留其经验证的历史终态、计数和时刻，不全部改 failed。父 current_item_name 清为 NULL，finished_at/updated_at=同一处理时刻，started_at 保留来源 NULL/有效值，按完整处理后集合重算计数。
- 要求 source created/started/finished 时序合法且不晚于认证处理时刻；中断转换的时间必须不早于任何相关历史时刻。超前/损坏时间拒绝，不用本机 time.Now 修复。
- 报告应与同一处理后父子集合一致；是否为中断 Job 生成历史报告、允许哪些风险字段及如何保留 cached_result 的历史事实，必须由 C 闭集 schema 决定。无该决定不输出完整可提交批次。

这关闭了 D 提案中的选项，未将 C 的确认或实际处理事实视为已经存在。旧“把所有任务标 failed”的建议作废。

## 必须交付的复审与验收

新机器请求同时绑定原 A 意见、原请求、当前完整 resources 包（含全部测试/fixture）、相关 migration/model/service/repository、schema 和本版文档；检查程序校验文件集合和摘要。历史回执不继承到新 helper，任何正式 approved_cross_reviewers 保持原值。

| 验收组 | 必须证明的行为 | 当前交付边界 |
| --- | --- | --- |
| 离线公共规则 | typed/缺失/冲突/NULL/别名、ID 占用、深层正文遮蔽、宽网段/重叠禁止范围、CAS 溢出、DECIMAL 精度、严格 scope | 新 helper 与完整 resources 包验证；不含真实 proof、SQL 或启动门禁。 |
| 九表逐字段 | 认证空/非空表、每列/映射/NULL/时间/自然键/父子/report/默认规则及完整候选集 | 受审规则和 B/C 输入到齐后实现，现有 count/cutoff 不能代替。 |
| 服务启动 | 无缓存读取失败、旧 enabled 缓存、缺行默认、nil provider、环境配置、重启；扫描手动启动/worker/ensureConfig；默认镜像 | B 提供持久安装门禁与实际证明；不把 disabled 数据行当作门禁。 |
| 事务及恢复后 | 目标占用/CAS、撤权、取消、proof 改写、未知提交、写凭据销毁、独立只读逐字段/35 控制表校验、隔离后放行 | B/D 真实 MySQL 与恢复整链，待交付。 |
| 专项运行 | 历史详情 16 项、GC 完整 42 项的同轮来源/日志/实际结果/退出/清理 | 现有运行单独接收；不重复启动、不用本版离线测试替代。 |

A 需复审原六表加 report 正文边界；B/C 按原各四表提供逐表意见与上述实际输入。此文件是可供评审的确定提案，未向其他聊天或外部渠道发送。
