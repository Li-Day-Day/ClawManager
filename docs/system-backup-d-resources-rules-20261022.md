# D 九表 v2 离线规则本轮验证与暂停交接

2026-10-22，本轮已形成 [九表 v2 确定提案](system-backup-d-resources-revision-v2-20261022.md)及[47 份输入绑定请求](evidence/d-resources-review-request-v2-20261022.json)。原 A 六表 changes_required 仍有效，新请求不伪造同版本批准；原提案及历史回执未改写。

新 `normalization_rules.go` 提供尚未接入 writer 的私有 helper：七个身份命名空间的独立映射/冲突检查、两类审计 ID 占用检查、audit resource_type 闭集、NULL 与整段文本/JSON 遮蔽、北向目标 CAS 版本计算、DECIMAL(4,2) 精确单位转换、完整 CIDR/端口/禁止范围校验、严格 scope JSON。新增六个主测试覆盖重复/缺失/错域/溢出、源/返回值别名、宽前缀/嵌套禁止范围、未知/转义重复键/尾随内容和非法值。它们不生成完整九表批次，不认证 B/C proof，也不执行 SQL。

冻结完整 `systembackupresources` 包、全部测试/fixture 及两份读取 schema，进行两轮无依赖完整包验证；第二轮额外冻结验证入口脚本并确认 Go telemetry 位于准确自有目录且 off。两轮各 33 个主测试、228 条通过事件，无失败或跳过，保留 default vet；冻结字节、当前输入与文件集合前后一致。[独立复核回执](evidence/d-resources-rules-reviewed-20261022.json)及[可重复复核程序](evidence/d-resources-rules-review-20261022.mjs)保留完整日志、源码 capsule、原始退出和清理信息。

首轮误把只读的 GOTELEMETRY 当作环境覆盖，Go 在启动时尝试访问原 telemetry token 路径并被拒绝；该原始诊断保留，首轮实际测试仍退出 0。验证入口随后改用已有工具链支持的 TEST_TELEMETRY_DIR，先写本轮 mode=off，再检查 go env，第二轮没有该诊断。两次准确 owner 均独立确认不存在，分别删除 871 和 873 份文件，共 1,744 份；临时源码、缓存、tmp、telemetry 和测试二进制全部清理。未安装依赖、执行远端或改变正式 registry/批准。

同轮另接收 [GC 42 项真实 MySQL 结果](system-backup-d-gc-owner-lifecycle-actual-accepted-20261022.md)，仅限合成前置及连接所有者生命周期，不代表 freeze adapter 或完整 GC。历史详情十六项的已有运行未被重复启动；截至本轮收尾可见日志仍未给出远端专项及最终回执，本轮不接收为成功，也不取消其他操作者已有进程。

用户要求“做完这轮后先暂停”。本轮结束后暂停，不启动新测试/远测或下一阶段实现。恢复工作时依次核对已有十六项运行的真实终态，取得 A/B/C 对 v2 的逐表意见及生产 proof/能力/report schema，再实现九表完整候选与逐字段 verifier、B writer 集成、受审 freeze 接线和原六项整链验收。当前完整目标未完成。
