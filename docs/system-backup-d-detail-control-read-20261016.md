# D 四类任务详情控制字段读取

日期：2026-10-16。补齐 D 可独立完成的四类详情固定字段读取，复用既有任务和执行记录贡献。

入口为 `Reader.ReadTaskDetailControl`，源码在 [task_detail_control.go](../backend/internal/systembackupread/task_detail_control.go)。完整详情组装须使用内部 `readTaskDetailControlInTransaction`，在同一个 RepeatableRead 事务内读取 Task、全部 attempt、Job observation、各类型字段，并在组装后复查授权、确认提交。不能先提交该入口再拼接另一个时点的 Owner 事实。

| 类型 | 本轮新增的 D 数据库贡献 |
| --- | --- |
| 备份 | 目的、部署矩阵/runner/parts、目标风险/失败域、保存的产物状态与校验和/注册、历史资格、hold 标记/时间、字节数与 prune guard |
| 演练 | 来源及校验和、目标配置摘要、清理状态/失败码、证据引用、保存的 verifier 汇总、consistency 和历史资格 |
| 预检 | 来源、只读/测试模式、目标配置摘要、兼容性、保存的报告有效原因/引用和 verifier 汇总 |
| 校验 | 来源、范围、观测校验和、报告引用、前后状态/可用性、决议原因和 verifier 汇总 |

每次附加查询都用已授权的安装和准确任务 ID，并复核 schema、任务类型、配置版本、行版本和状态与本轮 Task 一致。固定列 SELECT 不读取配置正文、失败原文、manual hold 原因/actor、provider locator/version、restore target ref、check expected/actual 或资源 inventory。证据 ID/hash 必须成对且格式正确；SET 字段拒绝未知/重复值；部署矩阵与 runner、清理失败码、资格决议和来源类型遵循现有合同/067 约束。

保存的 artifact/verifier/cleanup 字段只是数据库贡献，不替代 A 的证据有效性、B 的实际恢复/清理证明或 C 的 provider/catalog 当前事实。Backup SQL 中不存在的 catalog checksum、nullable consistency、artifact_bytes 不补默认值；catalog-import 校验保留空本地产物状态，即使保存的 usable 为真。历史 eligible 不因产物后续删除而被改写。

快照及嵌套贡献全部拒绝 JSON 序列化，getter 复制可变切片。尚未定义多 unit 的公共单一 phase/generation，也未生成完整四类 DetailResource；真实详情、events/logs、manifest 和总览 HTTP 仍保持原未就绪边界。无 migration/grant/生产开关修改。

本轮 [整包原始 JSONL](evidence/system-backup-d-detail-control-local-20261016.jsonl) 为 Windows Go 1.26.1、默认 vet、正常 exit 0：62 个主测试/含子测试 413 项，无跳过；新增 7 个主测试/含子测试 101 项。覆盖四类绑定/损坏/不可序列化、slice 副本、历史资格与 uint64、catalog-import 空状态、撤权/取消/提交失败及同事务未来组装接点。所有 SQL 选择列另与实际 067 文本核对。首次单行流错误夹具失败原因及 44 项本地来源摘要见 [机器回执](evidence/system-backup-d-detail-control-review-20261016.json)；最终整包运行前已修正，期间源码未变化。

本地模型驱动及 DDL 静态检查不代表真实 MySQL。后续在经授权的隔离数据库运行四类实际 SELECT、双连接快照/撤权竞争，再接 A/B/C Owner 来源及公共 DTO。当前不重复已接收的旧专项，也不把此轮当作完整详情上线。测试缓存/临时目录清理结果记录于机器回执 cleanup。
