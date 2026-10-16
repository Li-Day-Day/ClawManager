# D 六项原始范围的当前验收审计

【2026-10-16 r39 更新】[七项私有服务实际 MySQL](evidence/system-backup-d-canonical-backfill-service-mysql-accepted-20261016.json)已按同轮来源、逐项结果及清理限定接收，授权/容量仍为 synthetic，A 八项具体组合层及生产输入仍缺。用户[中文桌面示例截图](evidence/system-backup-d-preview-screenshot-review-20261016.json)验证主要布局；按钮间距已修正，完整构建、改后渲染和真实端到端尚未验证。下文旧回执保持历史范围，不能据这些新增子项关闭六项整体目标。

【r37 后续修复】[独立记录视图](system-backup-d-live-records-review-20261015.md)已解除本审计发现的 overview-first 前端阻断：总览未就绪时，配置及列表按实际可用性显示。180 项 Node 检查通过；未执行完整前端构建/浏览器验收。下文 r36 为当时快照，完整总览/详情/活动的后台 Owner 来源及六项整体缺口继续保留。

本次继续保留最初六项工作，不将近期配置、授权或页面子项作为整体完成。[r36 机器审计](evidence/system-backup-d-goal-readiness-audit-20261015-r36.json)记录当前代码、原始门禁输出及准确来源。没有安装依赖、构建、执行 SSH 或改写 registry/正式 migration，前端 r33 保持用户待测版本。

## 当前门禁

- `system-backup-schema-inventory.mjs --check` native exit 0：99 个现有对象清单自洽，98 个 migration 对象，无未归属、runtime CREATE/ALTER 或缺迁移。计划的三张 C catalog 表仍不在清单，不能证明完整 schema。
- `system-backup-contract-check.mjs --check --strict` native exit 1：39 项 policy、60 项交叉评审未完成，34 draft/4 missing，现场 schema evidence 未就绪。四份 missing 仍是 recovery_catalog_records、restore_target、status_relay、catalog_scan_record。registry 本身没有 stale 错误。
- 正式 catalog 仍为 94 文件，SHA `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。本轮只读取，不更新批准状态。

原始输出见 [inventory](evidence/system-backup-d-schema-readiness-20261015-r36.txt) 和 [strict contract](evidence/system-backup-d-contract-readiness-20261015-r36.txt)。包装命令正常结束不改变其中记录的真实 native exit 1。

## 六项范围逐项结论

| 原始范围 | 当前已有的限定证据 | 仍未完成/未证明 | 后续动作 |
| --- | --- | --- | --- |
| canonical 正式迁移与索引取舍 | writer、收据存储、六轮 synthetic 索引和七项私有服务实际 MySQL 各有冻结回执；具体 authority 已实现 | A 八项具体 authority 实际 MySQL、原 canonical 文件、安装写/观察授权、真实 target/容量/保留适配、正式 081/082、代表性生产负载/索引决定 | 新 authority 按自身同轮来源接收；服务/writer/storage/index 无需重跑，实际材料到位后再装配 |
| 完整总览与四类详情 | SQL 配置、四类列表、Operation 读取及若干控制/执行/promotion 组件已验收 | 当前 Owner 健康、writer/backlog/domain 权威；公共完整总览/详情/活动仍显式 unavailable；完整 HTTP/browser | 按真实 Owner 组合完整读源；已接线记录可另作明确的独立读取视图，不能生成替代总览事实 |
| A 规范化与 D 恢复编排 | A 十五表隔离 MySQL 已通过，详见下节 | B 真实 dump/target/clock/fence/事务 writer，D 生产调用、live schema freeze 和集成大冒烟 | 旧 BusinessRestoreOnly 不再请求；需要实际 B proof/writer 后接入 D 原事务 |
| 恢复管理生产入口/审计存储 | 既有限定 authority/journal、PVC/PV 预检候选 | 真实管理 mTLS/上级授权、独立物理审计卷和预留容量、单写者接管及 I/O 故障证据 | 使用受审部署/卷/容量和认证适配；不将本地预检或内存容量当现场证明 |
| 实际历史升级与激活 | 94 文件 fresh replay、synthetic history 及历史只读结果 | 实际旧 SQL/ledger、新 catalog review、现场升级/部署、本人 MFA 与激活事务证据 | 保留旧 review pin；fresh replay 不替代实际历史，不能只换 hash 扩大旧批准 |
| 前端与真实端到端 | r30–r37 UI 候选、180 项 Node 检查、中文桌面“有数据”示例截图，关注按钮间距修正 | 完整 TSX/TypeScript/Vite 构建输出、改后/窄屏/禁用空态/多语言浏览器、真实读取与 B→A→C→D、四矩阵/大数据 | 用户重建并继续验证；本地不安装。截图只覆盖所见示例布局，实际链仍待接线 |

## 校正 A 十五表的旧待办

[A 十五表隔离 MySQL 回执](evidence/a-business-restore-mysql-accepted-sbk-mig-261014083514-40ca.json)已经存在。本轮重新核对其原日志 SHA，45 项 A 来源当前无漂移。它覆盖完整列 roundtrip/rollback、正式 FK/collation 拒绝、SELECT-only/NULL mismatch/最终 proof 回滚、NULL/decimal 保留及 users=1001、quotas=1001 的有界量场景。准确 namespace/UID 和两端清理在该回执中报告。

这些 source/target proof 和 writer 仍是 synthetic test fixtures，不是 B 的生产实现。当前非测试 backend 搜索只找到 `NormalizeBusinessForRestore` 的声明，以及 Batch proof 的接口/内部调用，没有找到 D 生产调用或 B 的这两个具体 proof 方法。因此原六项表中的“跑 BusinessRestoreOnly”旧建议已经过期；真实生产接线缺口仍保留。本轮没有重新执行该远测。

## 当前真实页面的具体限制

`backend/cmd/server/system_backup_read_live.go` 已接入 active config、配置历史/单版本、四类任务列表与 Operation 列表/详情；总览、四类详情、任务 events/logs 和 catalog/prune/promotion 仍直接注册为 `503 not_ready`。

前端 `createBackupLiveSource` 先读取总览，随后才读取配置和四类列表。因此在当前后台实现下，整个真实工作区先遇到总览 503，新配置历史和任务详情 UI 也不能由该工作区到达。构建开关不会实现这些后台路由；显式示例截图只证明共享总览布局。此项作为实际未完成记录保留，不能因 Node 检查或既有 task-list HTTP PASS 关闭前端端到端。

可独立推进的方向是将“已接线记录读取”和“完整总览不可用”作为明确不同状态处理，使用当前配置/安装和分页绑定核对记录，保留缺失总览/Owner 的真实缺口。实现时不能填造健康、就绪或计数，也不能把该记录视图作为完整总览完成。

## 新授权探针及等待范围

【r38 更新】A 的最终本地准备回执已交付，[D 独立接收](system-backup-d-a-authority-preparation-review-20261015.md)逐项核对 1,265 文件及完整输入集合无漂移、原日志/清单摘要、230 主测试/1,525 子测试、三次各 3/22 seed，以及 69 本地路径当前不存在。D 的前置拒绝日志修正已进入 tagged 编译。只接收本地准备，八项实际 MySQL 执行仍为 0；未重跑 Go 或发消息给其他对话。

这不是实际 MySQL，也不是旧 generic admission 七组的替代回执。操作者 16:33 服务日志已于 17:23:39 中断，没有实际 SQL root、namespace 或远端退出/清理证明；本地 69 路径不存在，远端候选 scratch 状态未知。不将日志终止当作远端清理，也不继续按活进程等待。未执行 SSH 或自动重启。六项整体目标继续 active、未完成。
