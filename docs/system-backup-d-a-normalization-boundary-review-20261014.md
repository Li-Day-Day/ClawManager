# D 对 A 恢复规范化边界的限定评审

日期：2026-10-14。结论：下列纯转换语义与已核对运行时代码一致，可作为 B/D 接线输入；真实恢复写入与放行继续未通过。本次不批准 object registry 的交叉评审列表或 schema 冻结，不把 A 本地 proof 夹具当作 B 的独立证明。

## 已核对的语义

| A 候选行为 | D 代码核对 | 接入时仍须证明 |
| --- | --- | --- |
| users 停用、非可认证密码占位值、local provider、清除登录别名/外部身份 | `users_restore.go` 输出强制 `IsActive=false` 和 `DisabledUserPasswordHash`；来源密码不作为转换输入 | B 证明 dump、目标用户映射、collation/占用和写权限；D 不能把保留的历史角色当作目标账号启用批准 |
| 企业认证密码输出明确空串而非 NULL | `enterprise_auth_restore.go` 输出非 nil 空串；`EnterpriseAuthManager.configFromSetting` 在 NULL 时继承 baseConfig 密码，在空串时明确 override/clear | B 保留来源 NULL/空串/密文分类并认证准确 Secret/ref；目标完整设置行须 disabled，不能仅删除密码列而触发环境继承 |
| 模型同时清空直接 key 与 Secret ref 并停用 | `llm_model_restore.go` 输出两列 nil、`IsActive=false`，价格保留精确十进制字符串 | B 认证两条凭据来源和目标占用；实际 writer 必须写 SQL NULL，不能遗漏第二列或通过运行时 float64 写金额 |
| Gateway 别名到期 | `gateway_alias_restore.go` 将目标期限置为目标库时点整秒前一秒；`instanceRepository.GetByAccessToken` 先读 `instances.access_token`，再查询未过期别名 | B 必须同时清除实例直接 token，并证明目标时点/统一实例映射；A 的别名到期不单独构成旧 token 已失效证据 |
| risk_rules 全部停用 | `risk_rule_restore.go` 输出 `IsEnabled=false`；运行时 repository 构造会 normalize action 并补种缺失内置规则，补种为 enabled；risk detection 在无 enabled 规则时 allow | B 的应用启动门禁持续到规范化和只读失活检查完成；之后由 D 明确规则重新评阅与流量放行，不能把“全部 disabled”当成安全服务用户流量的理由。内置身份保护仍依赖真实 B proof，当前测试替身不能代替 |
| 网关历史统一映射、整批失败零结果 | `ai_gateway_history_restore.go` 固定输入副本，在共同 B proof 和逐表 proof 后返回六表行；`ai_gateway_cross_table_restore.go` 检查共享引用和 trace 映射 | B 必须把共同 proof 绑定同一封存 dump/checkpoint/evidence，并在真实写事务重新核对目标权限/占用；A 返回行不是 COMMIT 收据或资格判定 |

`SQLRestoreVerifier` 用同一只读 RepeatableRead 事务做 15 表计数和九条失活计数，并在提交前复查 B proof。D 接受它作为只读校验接口；它不是完整逐行业务比对、Secret/ref 认证或 B 写事务的替代。只有 B 的 SELECT-only 目标凭据和独立目标 proof 实现后才能进入真实恢复验收。

## D/B 接线的关闭条件

1. B 提供实际源 dump/checkpoint/evidence、全部映射、目标数据库 UTC 时间、目标占用/写权限和启动门禁的独立实现；空表也必须证明，不能只校验调用方填写的 hash。
2. B 真实写入器在同一准确隔离目标中消费整批行，按目标 MySQL 类型/NULL/collation/FK 验证，写事务失败不留部分数据；A 事务外 final proof 不覆盖之后的目标变更。
3. Gateway 实例直接 token 清除、risk 内置规则/启动策略、北向字符串引用和共同 trace/session 映射纳入跨 Owner 验收。A 拥有的表通过失活计数不能替代 B 拥有的实例或资源事实。
4. D 先取得 B 完成/停止/隔离与资源 inventory 事实，再组织 A 只读校验和 Owner 报告。真实结果、授权、schema pin 和审计齐全后才按主计划推进状态；应用启动与用户流量放行分别处理，保持恢复目标隔离。
5. 完整 15 表逐列 MySQL 写回/回读、跨表 FK、真实证明失败回滚与大数据量回执完成后，再做完整 D 签收。现有 A 三张历史表探针和纯转换回归不能扩大为这一范围。

本次没有修改 A/B 业务代码或运行新的 A 包测试。输入原字节 SHA-256 见[机器记录](evidence/system-backup-d-a-normalization-boundary-review-20261014.json)；后续源码变化须重新核对对应项，不沿用此限定结论作为新快照的批准。
