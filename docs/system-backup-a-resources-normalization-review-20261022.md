# A 对 D 六张资源表恢复方案的安全评审

评审日期：2026-10-22。评审角色：A（本对话代码评审）；对象为 D 的九表方案中要求 A 评审的六表。方案和二十五份来源由 `docs/evidence/d-resources-review-request-20261022.json` 固定，原 `source_digest=8f6e932251521fe0774b100f34495b79a695515bb27006448a771a9be784f335`。逐字节匹配和补充源码、本文的摘要见 `docs/evidence/a-resources-normalization-review-20261022.json`。

结论：**六表均已完成方案安全评审，结论为需修改；不批准当前方案直接用于恢复写入。** 下列规则版本为 `a.resources.restore-security.v1`。这份评审给出 A 的约束和 D 应提交的实现验收条件；它不证明 B 的来源/目标真实性、C 的资产能力，也不更新正式 registry 的 approved_cross_reviewers、冻结状态或 schema hash。

## 共同规则

1. user、instance、job、asset 和 scan_result 使用不同 typed 映射。源非 NULL actor 必须有同一恢复批次的 B 认证映射和目标存在/占用证明，缺失、歧义、同一源映射不一致或不同源合并为同一身份均整批拒绝。源 SQL NULL 保持 NULL；不得因 ON DELETE SET NULL 或找不到用户而把非 NULL 来源清空。历史 actor 映射不赋予登录、角色、caller、外部身份或恢复操作权限。
2. 空表也须 B 认证；认证绑定准确 source installation、封存 dump/checkpoint、schema、capture cutoff、目标 installation、共同映射、目标处理时间和写事务。proof 回调只能拿独立副本，不能改写已校验输入。候选仍须事务内当前权限、版本/占用、隔离和取消复查，提交结果不确定不能报成功。
3. 历史 ID、原始时间、原引用身份和 capture cutoff 必须能从受认证来源及版本化映射追溯。目标 ID 冲突不得清表、覆盖目标历史或抹掉本轮恢复审计。原 cutoff 不得替换为重编号后的 MAX(id)。现有 verifier 主要验证行数/cutoff，不证明行转换、正文脱敏或目标授权，需补逐字段与映射验证。
4. 自由正文不使用正则替换少数 password/token 字段作为安全证明。版本 v1 对审计 `details`、`before_json/after_json` 采用完整正文遮蔽：SQL NULL 保持 NULL，非 NULL 输出合法 JSON 字符串 `"[REDACTED]"`。记录正文存在性和受认证来源绑定；不把原正文、哈希猜测、网络地址、凭据或原错误写入公共报告。若 D/B 需要结构化历史差异，必须另提按 action 分型的闭集 schema、明确 JSON 路径和测试，升版本后重审，不能擅自恢复任意原 JSON。
5. 非 JSON 文本中的 description、IP、当前项目名、摘要和错误消息同样可能携带秘密。v1 的可选自由文本保持 NULL 或输出 `[REDACTED]`；非空必需名称由 C 提供已批准的非敏感投影。不得把整份服务响应视为安全正文，扫描配置 API 响应还包含 LLM 配置结构。

## 逐表结论与修改要求

| 表 / normalizer_id / verifier_id | 结论 | A 确认的行为及实现前必须关闭的问题 |
| --- | --- | --- |
| audit_logs / resources.audit_logs.normalize.v1 / resources.audit_logs.verify.v1 | 需修改 | 保留 action、resource_type 的受认证历史语义、原 created_at 及原审计身份的可追溯关系；user_id 按共同规则映射。resource_id 不能按任意整数映射：D 需给出 resource_type 闭集及每类来源/目标映射；system_backup 等安装本地控制引用不得被伪装为目标当前对象。未知非 NULL 资源引用整批拒绝，或另提明确的历史命名空间方案重审。details 按规则 4；ip_address 按规则 5。D/B 需交付非空目标的 ID 冲突及来源 cutoff 追溯方案。原 ID 数值能保留只适用于已证明无冲突的目标，不是清除目标审计的许可。 |
| egress_private_exceptions / resources.egress_private_exceptions.normalize.v1 / resources.egress_private_exceptions.verify.v1 | 需修改 | scope_type 仅允许准确 user/instance，scope_id 使用对应映射；created_by 按共同规则；恢复输出 enabled=false，description 遮蔽。目标策略认证 CIDR/port；不能只判断网络起始地址为私网，宽前缀可能覆盖公网或目标禁止地址，须验证整个前缀及端口范围，不能恢复对 metadata/control/provider 的例外。没有数据库 FK 也必须验证身份存在。启动门禁及独立后续启用授权由 B 证明，不能复用来源 enabled 或源管理员授权。 |
| northbound_admin_settings / resources.northbound_admin_settings.normalize.v1 / resources.northbound_admin_settings.verify.v1 | 需修改 | id 必须为 1，完整候选 api_enabled=false、require_explicit_callers=true，updated_by 按共同规则。TTL/限流/规格/类型/operation 参数必须通过现有服务范围和目标更严策略，CPU DECIMAL 不经 float64 往返决定值。external_node_port 是目标部署事实，由 B 认证，恢复不得创建/开放 NodePort。version 是目标 CAS 世代：来源值只保留在历史证明，写入必须绑定目标 observed version，由 D/B 明确初始化/递增及溢出拒绝规则。禁止来源 caller policies、会话、挑战、刷新凭据给目标授权；本表关闭不替代这些控制表的排除。必须测试无缓存读取失败、旧缓存、缺行补默认、nil provider、环境配置和进程重启下门禁仍关闭。 |
| northbound_settings_audit / resources.northbound_settings_audit.normalize.v1 / resources.northbound_settings_audit.verify.v1 | 需修改 | actor_user_id 按共同规则；action、created_at、原审计身份及目标 ID 冲突按历史规则处理。before_json/after_json 按规则 4 整体遮蔽，不能把所有整数当作 user/instance ID，也不能回放 settings.update/caller_policy.update/external_node_port.update。现有写入包含完整 settings、caller policy 和 port 三种形状；若需保留字段差异，须按 action 单独评审。任何历史条目均不产生配置更新或当前 caller 资格。 |
| security_scan_configs / resources.security_scan_configs.normalize.v1 / resources.security_scan_configs.verify.v1 | 需修改 | updated_by 按共同规则，allow_fallback=false。default_mode、两组 analyzer 列表、timeout 需要 C 的闭集版本/当前 capability 和目标策略；缺失/未知 analyzer、无能力、无效 JSON 拒绝，不走服务默认值/normalize 补全。该表没有 enabled，且 UNIQUE(id) 不能证明全表只有一行；D/C 须定义并验证配置行基数和选行语义。B 门禁覆盖 ensureConfig 自动建默认、工作进程/手工启动与扫描服务访问。来源配置不能携带 scanner 凭据或直接变成当前能力证明。 |
| security_scan_jobs / resources.security_scan_jobs.normalize.v1 / resources.security_scan_jobs.verify.v1 | 需修改 | requested_by 按共同规则，current_item_name 按规则 5。scope_json 只接受 C 确认的闭集结构；当前实现结构为 scan_scope 和可选 asset_id，后者必须用准确资产映射，未知键、重复键、非法类型/JSON 均拒绝，不能使用 parseSecurityScanScope 的静默 incremental 默认。pending/running 不续跑；C 必须明确与 items/report 一致的合法失败终态、计数/进度/started_at/finished_at，B 提供目标处理时间。A 接受“终止且无当前安全资格”的方向，未批准把所有旧任务直接标 failed：现有服务遍历完成后也可能在 failed_items>0 时写 completed，不能凭状态名猜测汇总语义。历史 completed 不证明当前资产安全或结果新鲜。 |

## 代码核对发现

- `northbound/runtime_settings.go::defaultRuntimeSettings` 设置 APIEnabled=true，未显式设置 RequireExplicitCallers；`Current` 在无缓存读取失败时返回 fallback，已有缓存时继续返回缓存。仅恢复一行 disabled 无法证明整个进程启动/异常路径关闭。
- `services/northbound_admin_service.go` 的 settings.update 保存完整前后模型，caller_policy.update 保存 caller 模型，external_node_port.update 保存 port 对象；共享整数替换无法正确区分它们，完整模型序列化也不等于脱敏。
- `egresspolicy/private_exception.go::IsEligiblePrivateExceptionPrefix` 只看前缀地址的 private/link-local 属性。恢复验收需要更强的完整目标网段策略，不能把这个函数单独当成目标网络准入。
- `services/security_scan_service.go::ensureConfig` 会补默认配置，`parseSecurityScanScope` 对空白/坏 JSON 回落默认，analyzer 转换也有默认补全；恢复校验不能借用这些宽松转换。任务结束逻辑需要 C 结合 items/report 决定历史一致性。
- `systembackupresources` 当前有捕获范围、数量/cutoff 和控制表排除检查，未发现上述六表 normalization 的可提交实现。因此本评审不把“方案已审”记成“实现已通过”。

## D 修订后验收清单

同版本认证空表/非空表；NULL actor 与缺映射区分；重复/冲突/错类型映射；目标已有审计与 ID 冲突；非法/未知资源引用；嵌套敏感正文和三类北向审计形状；过宽网段/禁止地址/端口与禁用状态；原 version 冒充目标 CAS；DECIMAL 精度；无缓存/旧缓存/配置缺失/环境默认与重启；坏 scope JSON/未知键/未知 analyzer；pending/running 与父子计数/时间/report；proof 改写输入；撤权、取消、提交结果不确定。实际 SQL/启动门禁/当前 provider 的验证分别记录，模型结果不覆盖现场。

交付给 D 的结论是上述六份“需修改”评审。B/C 仍需各自提供真实映射/目标/能力和逐表意见；全部实现、相关交叉评审及实际验证完成前，保持正式批准和恢复写入门禁关闭。
