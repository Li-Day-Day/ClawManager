# A2：告警 selector 闭集独立核对（A-METRICS-03）

原计划第15节的 metric_result 闭集是 success/failure/rejected/timeout/conflict/canceled。扫描全部95条 PromQL，覆盖9组 selector、10个匹配器，仅 signature-or-checksum-failure 的 metric_result="failed" 越闭集；它无法匹配合规的 metric_result 值。其余当前 selector 按各自原 enum/metric 名称核对，未发现同类越界。四条 controller-state 不作为 PromQL 解析，整个核对也不等于运行 PromQL parser/evaluator。

已分别暂存单独一式修正和与原八式总量修正组合后的九式候选（generator/JSON/YAML）。原八式候选原字节保留，单独修正可精确逆变换回原输入，组合修正可精确逆变换回原八式候选。合法的 status="failed" 选择器保留，未做全局 failed→failure 替换。

signature 分支缺少原去重键字段的问题仍单独保留，不擅改标签、去重键、告警数量或生产加载状态。精确表达式、闭集、扫描记录、六份候选和输入摘要见[机器记录](evidence/a2-metrics-selector-enum-reviewed-20261027.json)。复核：`node docs/evidence/a2-metrics-selector-enum-review-20261027.mjs --check`。
