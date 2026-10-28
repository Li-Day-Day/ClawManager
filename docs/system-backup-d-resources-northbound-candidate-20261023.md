# D 北向管理设置恢复候选

2026-10-23，继续原九表 v2。B/C 仍未交付生产输入。`restore_northbound.go` 提供私有离线 `normalizeRestoreNorthbound`，不调用北向 service、Kubernetes、SQL writer 或任何启用路径。

输入必须是 northbound_admin_settings 完整 33 列、至多一行，非空 id 必须为 1。空来源保持空，不用服务默认或迁移默认补行。来源字段按闭集检查：20 项整数使用当前服务范围，三项 CPU 从 DECIMAL(4,2) 文本精确转换为百分之一单位，再同时满足服务/SQL/目标更严限制；没有 float64、指数、舍入或补默认。Pro 的服务范围上限为 128 CPU，但 SQL 列只能表达至 99.99，候选取两者交集。目标 Limits 必须完整覆盖 23 项，拒绝未知/缺失、放宽服务/SQL范围或倒置区间。

Lite/Pro 类型必须是当前服务闭集内的非空、无重复字符串列表，并属于目标支持集合；坏 UTF-8/JSON、NULL/空数组、错类型、大小写别名、转义等价重复和尾随内容均拒绝，不借 normalizeValues 去重或降级。候选要求 B 另提供准确目标 SQL JSON 投影，解析后必须与来源的有序类型列表逐项相同，才使用该投影文本；不能扩展/重排类型，也不由 D 猜测目标版本的 JSON 文本表示。投影文本先检查容量再解析，最终整行输出另受总字段字节预算约束。

输出 api_enabled 固定为 0，require_explicit_callers 固定为 1；updated_by 按 user typed 映射，SQL NULL 保持 NULL，非 NULL 缺映射整批拒绝。created_at/updated_at 按 NOT NULL SQL 时间表示与微秒精度检查并保留。来源版本必须为规范正 BIGINT，但只保存为私有历史 SourceVersion：目标 observed version 未提供时只计算 insert 候选 version=1；提供 v 时只计算 v+1 并保存准确观察值，0/负值/MaxInt64 拒绝。来源即使为 MaxInt64 也不会成为目标版本。外层必须由 B 证明实际缺行或锁定准确 v，并执行条件更新且恰好一行，不能用这个计算函数证明 CAS 已完成。

external_node_port 只取 B 目标声明，0 表示未暴露，非零须在现有服务 30000..32767 范围；不调用 SetExternalNodePort，也不复制源端口或创建暴露。来源端口仅按规范 SQL 整数与 0..65535 结构范围校验。B 仍须认证目标安装、实际端口/规格/类型/JSON 投影、准确 source dump/checkpoint/schema、时钟/fence 与同一写事务，禁止把普通声明当成 proof。关闭行不证明旧缓存、缺行默认、环境、nil provider、读取失败或重启路径已封锁；持久启动门禁和后续启用须另行证明/授权。

源与输出分别检查行/值字节容量，映射、版本或 JSON 投影扩张不得逃逸；任何错误/取消返回零候选，错误不携带原正文或 driver 信息。输出 map、列 slice、时间、版本等指针与输入独立。私有历史版本/目标观察值应进入受控证据，公共结果只返回证据引用。本实现不认证上述输入事实，也不产生完整九表可提交批次。

新增测试覆盖完整列、目标关闭状态/端口/actor/独立版本与 NULL、全部 23 项范围的上下界与目标收紧共 69 场景、40 类缺失/非法/错绑拒绝、空表不补默认、输出扩容和取消。增量请求独立对照实际 service 的 20 项整数/3 项 CPU、类型闭集与 migration DECIMAL 列，源码变化要求重新评审。完整 resources 包的实际终态、来源和准确清理由同轮回执核对。

累计五表具有完整列离线候选，北向新增实现待 A/B 增量复审；剩余四张扫描表依赖 C 的 analyzer/timeout/能力、父子终态、结果版本与闭集 report schema。B/C 真实 proof/事务 writer、生产读回/35 控制表/启动门禁、九表实际 MySQL、freeze/完整 GC 和原六项仍未完成。未安装依赖、执行远端或修改正式 registry/批准，未向其他聊天发送请求。
