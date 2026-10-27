# A 对 D schema-hash candidate 的安全审阅（2026-09-23）

结论：**本地文件与仓库绑定通过；当前仅可保留为 candidate，未批准登记或冻结。**

对象是 [D 交接](system-backup-d-schema-hash-handoff-2026-09-23.md) 中的原 candidate，其 SHA-256 固定为 `b6b39e4ccb8c94b76e3316ef6674532153f406fa665fa150c7f7aa13b3aa8779`。本轮只读执行：

```powershell
node scripts/system-backup-schema-candidate-receipt.mjs --candidate docs/evidence/system-backup-d-schema-hash-candidate-20260923T054748Z.json --sha256 b6b39e4ccb8c94b76e3316ef6674532153f406fa665fa150c7f7aa13b3aa8779
```

退出 0，95 个对象、3092 条结构记录的 candidate 与当前 SQL/inventory/migration catalog 绑定一致。schema hash 为 `a0cea874cd2c1dddb0740c7bfd066954e70e400fa38251f145aa2006711907e3`。本轮 A 安全模块/fixture 修改没有改变这些绑定，无需为本轮修改重复采集 schema。

安全判定：

1. `installation_identity_hash=a88b9dcf73776853ff36887f705a156b3ffdf4db12ab2497c614ffa6f814079b` 与已知 namespace UID 的域分离 hash 一致，但 hash 不是认证签名。
2. Candidate 未提供可信签发方对采集时刻/安装/结果的认证 envelope；本地 receipt 明确 `installation_identity_authenticated=false`。08:24 UTC [只读预检](evidence/system-backup-a-identity-preflight-20260923T082454Z.json)已由操作者执行且退出 0，验证了**当前** TLS/context/主体和 namespace；它不会追溯认证历史采集。
3. 原始结构记录已由采集端报告删除，A 无法独立重算 schema hash或证明现场清理；现有对象名匹配也不能证明期望结构或历史 migration 内容等价。
4. `registered_evidence=null`、`approved_reviewers=[]`，仓库归档不等于 evidence store 登记。当前没有可安全推导的真实 `sev_` ID/保留策略/owner 绑定。

当前身份预检已完成。后续所需：平台/D 提交能将采集结果绑定到安装及受信来源的认证记录，C/A 评审真实 evidence 登记和保留方案，B 完成采集来源/覆盖与期望结构审核，随后由各 owner 明确签收对应版本。若保留的来源证明无法补齐，再决定是否需要受认证的重新采集；不要仅为获得另一份相同的未认证 hash 重跑。

本轮没有写入 A/B/C 批准，没有构造 `sev_`，没有修改历史 candidate/receipt，也没有打开 `schema_hash_evidence_present`。
