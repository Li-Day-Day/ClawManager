# A2：指标与安全告警的非实现者源码评审

当前 210 指标、99 告警的声明标签均在原闭集内，未发现 user/session/public-ID 等敏感标签名。实际 emitter 的标签值约束和生产执行未由此证明。

A-METRICS-01：四类带声明分组标签的 rejection 共八个告警直接比较每条 `increase(...[5m])` 序列，而其 aggregation 为 sum、dedupe_key 为空。模型示例 4+4 在阈值5、12+12在阈值20时会出现总量达到阈值但各序列均未达到的差异。已暂存按现有标签声明增加 `sum(...)` 的生成器/JSON/YAML候选，逆变换精确恢复原生成器；idempotency_conflicts 没有声明标签，两条表达式保持原值，其他 registry 字段不变。[Prometheus 官方说明](https://prometheus.io/docs/prometheus/latest/querying/operators/)定义 vector/scalar 比较逐样本进行。

A-METRICS-02：signature-or-checksum-failure 的去重键要求 task_type/failure_category；signature_operations_total 分支只有 key_purpose/metric_result，不能从声明标签得到前两项。须由原 owner 明确兼容分组或受审映射，本候选没有添加标签、拆规则或删去原去重要求。

原生成器/rules --check 与现有两条 Node 测试通过，但只证明生成一致性/拒绝逻辑；24条 post-increase 算术模型也不等于 PromQL parser、真实 increase、missing-series 或生产规则执行。候选 YAML 的 DO NOT LOAD 原声明保留，生产 evaluator 与 B 侧交叉评审仍需各自准确证据。

准确原输入、十条差异、模型和三个候选摘要见[评审记录](evidence/a2-metrics-security-source-reviewed-20261027.json)。原合同/脚本未动，没有 Go、依赖安装、现场材料或 SQL 操作。复核：`node docs/evidence/a2-metrics-security-source-review-20261027.mjs --check`。
