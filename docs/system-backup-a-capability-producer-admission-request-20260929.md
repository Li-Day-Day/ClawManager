# A：系统 capability producer 准入交接要求（2026-09-29）

当前结论：系统级 `capability_snapshot` 已有正文校验，但还没有可用于生产写入的 producer 授权实现。本次核对的是这一接点，不能把 TaskRuntime 的任务日志权限扩展后当作完成。以下为跨 owner 的实现输入要求，**不是新增 wire schema、数据库迁移或批准记录**。

## 当前源码证明了什么

- `systembackupevidence/capability_content.go` 校验六类角色及 provider ref、scope hash、run ID、cleanup owner 和有效期；其注释明确不认证 producer、不批准 capability。
- `a-capability-role-mapping.json` 明确只有 artifact/catalog/evidence 投影到 provider capability row。KMS/Secret/signing 采用独立评估路径，不能自动生成健康结论；这是现有设计，不是漏加三个 SQL enum。
- 065 migration 的 `system_backup_provider_capabilities` 只有上述三个 provider role，并有 claim owner/expiry、row version。`system_backup_dependency_health` 没有对应的 producer claim 字段。不能直接把 dependency health 的历史结果行当作正在运行的探针租约。
- 066 migration 的 operation 闭集中没有独立的 capability producer/probe 操作。不能借用 evidence_gc、config_update 或任意已有 operation 取得全局写入权限。
- SQLTaskAuthority 仅授权指定任务/attempt/Job 的 job_log_chunk。TaskPreparer 对 capability_snapshot 的拒绝已在现有本地负测中覆盖。
- ConfigBootstrapService 的首次初始化要求安装尚无 active config/config 行。若 system producer 只接受 active-config 授权，会无法覆盖初始化前的 provider 准入；若产品选择初始化前仅使用 inline/外部证明，也必须明确该路径及可信来源。

因此，现有 provider claim 不能自然证明全部六类角色、初始化前后两种状态和某次探针运行的真实授权。

## 需要交付的具体决定与实现输入

| 负责方 | 必须明确的绑定 | 可验收的交付 |
| --- | --- | --- |
| D，A 复审 | 系统 producer 的权威持久化租约或等价可撤销 grant；installation、工作身份、run、claim/row version、期限和撤销如何关联 | 事务/锁顺序、读取及 CAS 接口、重启和接管行为；如需迁移，由 D 按既有 schema 流程交付 |
| D，A/C 复审 | 初始化前与已有 active config 两条授权路径，如何避免使用证据自身建立信任 | 首次准入流程、已有离线 bootstrap grant 的用途边界、配置/授权 epoch 变化时的失效规则；不得默认扩大现有 grant 用途 |
| C，A/D 复审 | artifact/catalog/evidence 的精确身份、版本、探针 scope、所需 capability 集合及 provider 一致性规则 | 受审 registry/ref 装载接口、探针结果与某次有效运行绑定的证明、真实 provider 负测 |
| A，D 协同 | KMS/Secret/signing 的独立运行身份、用途与三类签名材料隔离，及其与 producer 租约的连接方式 | A 根据已冻结的 D 租约接口实现授权适配器；保留现有“不自动投影为 healthy/provider row”的规则 |
| B，A/D 复审 | 若采用 Job 运行探针，准确的 Job UID/generation、终止、接管与投射凭据撤销 | producer 宿主接口、实际身份获取路径和取消/重启证据；不复用普通 capture 的权限 |
| D，A/C 复审 | evidence ID、owner=system/installation、受审正文 policy、store/write/KEK 的准确版本、保留/容量/审计 | 登记前后的复查和事务内准入；证据发布与 capability/health 结果提交的顺序及失败处置 |

上表描述必需的语义，不预先指定不存在的表名、operation enum、grant JSON 字段或签名目的。各方需明确哪项由既有接口提供、哪项需要合同修订。`approved_reviewers` 保持空；不能将本请求或源码 hash 视为交叉签收。

## 实现后必须证明的行为

1. 六类角色均有清晰授权路径；同一安装中不同用途、不同 provider ref 或不同 run 的凭据不可互换。
2. 初始化前的输入不依赖尚不存在的 active config，也不能仅靠提交者声称的 provider identity/scope/cleanup owner 获得授权。
3. 正文读取、Wrap、STS、条件写、结果登记各阶段发生撤权、配置变化、Job/claim 接管或到期时，不返回或登记伪造成功；已产生的密文及 unknown 记录仍可安全处理。
4. producer 身份独立于被验证结果；不能用“正文通过校验”或 capability 行自身的 supported 状态作为认证依据。
5. capability 检查时间、凭据/依赖期限和数据库时间共同限制有效期；重复提交不能延长原探针观察的寿命。
6. 已发布 evidence 与 capability/health 的引用、摘要、owner 和版本一致，结果提交失败不能丢失 pending/unknown 记录或制造 healthy。
7. 恢复/接管只使用原始已登记密文和准确引用，不通过重新加密、换 key 或重建 run 冒充原结果。
8. 完成真实身份/权限/撤销、数据库并发、启动前后两条路径及清理验收后，才能分别更新运行接入状态和 capability 批准状态。

## 当前处理

继续保留系统 producer 的拒绝边界；不改 provider enum、不增加私有 grant、不启用生产权限。任务写入/下载/恢复组件的已验证交付继续有效，但不扩展为系统 capability 的验收。

源码核对、角色映射、当前评审状态和文件摘要见 [机器交接记录](evidence/system-backup-a-capability-producer-admission-request-20260929.json)。该记录仅证明仓库当前缺口与输入要求，不证明生产系统不可用或某个外部服务不存在。未运行远程测试、未安装依赖、未生成构建产物。
