# D live schema-hash candidate 交接（2026-09-23）

本次操作者远程采集成功，`schema_capture_exit=0`。D 已完成候选文件归档和本地绑定核对，**没有批准、注册为 sev_ evidence 或打开合同冻结门禁**。

- [原 candidate](evidence/system-backup-d-schema-hash-candidate-20260923T054748Z.json)：完整保留操作者回传的 JSON 字段和值，文件以 UTF-8/LF 重新序列化；文件 SHA-256 为 `b6b39e4ccb8c94b76e3316ef6674532153f406fa665fa150c7f7aa13b3aa8779`。
- [D 接收核对记录](evidence/system-backup-d-schema-hash-receipt-20260923.json)：记录本地核对结果、证据限制和各 owner 的后续职责。

## 本次结果

| 项目 | 结果 |
| --- | --- |
| 采集时间 UTC | 2026-09-23 05:47:48.342 至 05:47:51.322 |
| 结构记录 | 3092 条；canonical bytes 为607262 |
| 实测对象 | 95张表，view/trigger/routine/mysql_event均为0 |
| inventory 对照 | expected=95、observed=95，missing/unexpected均为空 |
| canonical schema hash | `a0cea874cd2c1dddb0740c7bfd066954e70e400fa38251f145aa2006711907e3` |
| migration catalog hash | `0dcb3f38ce14165504335c715bf03533e95c9d3992146769fc21dab6c59d00dd` |
| 原始记录清理 | 操作者脚本报告 verified/verified_absent=true，时间05:47:51.449Z |
| 审批/注册 | candidate、registered_evidence=null、approved_reviewers=[] |

D 本地复核了 envelope 字段闭集、hash 形状、时间顺序、对象计数，以及采集 SQL 原始字节 hash、inventory snapshot hash、当前 embedded migration catalog hash 和完整对象名集合 hash。它们与当前工作树一致。把该 candidate 交给 reviewed 验证器及 registry 输入时均被拒绝，确认它不能绕过审批；manifest 中 `schema_hash_evidence_present` 保持 false。

本次保留的是操作者回传的脱敏结果。原始记录已经由采集端删除，D 没有独立重算结果 hash，也未现场复核临时文件不存在。当前 catalog hash 绑定本机脚本版本，不证明远程所有历史 migration 内容一致；95个对象名匹配也不证明其结构与全新库/期望结构一致。安装身份的 hash 不是认证签名。本次不证明 SELECT-only 数据库账号、CSI/checkpoint、KMS 或真实备份能力。

三次 SSH 结束时虽出现 Windows 客户端 `IO is still pending` 提示，但本轮返回完整 candidate，采集脚本退出0。仅据这一轮结果接收 candidate，不将其他非零退出或不完整输出视作成功。

## 下一步交接

| Owner | 需要签收或补交的内容 |
| --- | --- |
| A | 认证安装/evidence 身份、评审安全登记；继续处理 [D→A 合同评审](system-backup-d-a-contract-review-2026-09-23.md) 的六项问题。 |
| B | 审核 workload/database 采集来源及覆盖边界；历史 migration 等价性、期望结构对比不能仅凭本 candidate 判定。继续提交23项对象策略与 restore target/status relay 合同。 |
| C | 审核 evidence 登记/保留流程；继续提交16项对象策略及 catalog 合同。 |
| D | 汇总真实批准与登记信息后重新核验对应版本，再接入 registry。公共合同仍缺4份、3张 catalog 控制表仍缺 inventory，不能用本轮采集覆盖这些缺口。 |

此处仓库文件归档不等于运行时 evidence store 注册。不得自行构造 `sev_` ID、批准人或将 status 改为 reviewed。相同版本无需为本次 SSH 提示重复采集；schema、SQL、inventory 或 migration catalog 改变后，需重新判断候选证据是否仍适用。

本轮新增可重复执行的 D 接收核验工具 `scripts/system-backup-schema-candidate-receipt.mjs`，完整命令见 [D 独立数据库验证](system-backup-d-independent-db-validation.md)。工具必须使用上方独立交接的文件 SHA-256，并核对当前仓库绑定；输出固定为未批准候选，不修改本页历史回执或批准信息。
