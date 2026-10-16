# D 不依赖 B/C 的推进记录

【r61 收尾】[本轮交接与验证边界](system-backup-d-round-closeout-20261016-r61.md)记录 r57 完整包与旧发布夹具修复已接收，新绑定 4/46、相关定向 19/190 通过；r60 原 wrapper 枚举失败仍保留，r61 同来源独立 postcheck 通过。旧 server 基线测试/构建及所有本轮准确资源清理已结束；当前 server 新增/漂移、完整 nonce 准入及原六项缺口未据此关闭。用户已要求本轮后暂停，不扩展新任务。

【r55/r56/r57】[审计四项实际 SQL 已由 D 接收](evidence/system-backup-d-download-audit-remote-review-20261016-r55.json)，17 项核对、载荷与准确清理齐全，不重复远测。新增[收据/公共 Operation 内容组件](system-backup-d-download-admission-content-20261016.md)，4 主/80 含子项通过；r56 完整门禁一项既有发布夹具时钟失败已保留并清理，测试夹具修复及六秒慢设置回归进入 r57 复验。尚未接收整包或完成持久化/nonce/真实授权与容量组合，原六项范围继续保留。

【r50/r51/r53 新增实物进展】[审计 INSERT-ID/原行锚点候选与新四项 SQL 交接](system-backup-d-download-admission-audit-20261016.md)已完成：1,310 冻结来源，两个完整包 434 主/3,246 含子项、seed 和 Linux 探针编译通过，387 重点来源匹配并清理；实际四项尚待操作者，不重复健康七项。前端现有依赖已到位，D 另跑 [240 来源完整 TypeScript/Vite 构建](evidence/system-backup-d-frontend-build-20261016-r51.json)，通过并清理产物；[已有组件浏览器回执的限定复核](evidence/system-backup-d-frontend-receipt-review-20261016-r53.json)记录 53 项自报、20 项 DOM 和桌面/375px 五语言范围，未扩大为真实后端 E2E。D 本轮未安装依赖。当前 inventory 为 100 对象/99 migration 对象、exit 0；strict 仍 40 policy/60 交叉评审/4 missing，exit 1；原六项未完成，下文“缺前端依赖”仅作历史。

【r46 健康实际 MySQL 已接收】[七项/root 与清理的独立复核](system-backup-d-control-health-mysql-handoff-20261016.md)确认 13:35 新回执：1,302 来源无漂移、214 重点 pin、修复后探针、95 文件 fresh replay、七个夹具/候选表/原 namespace UID 与两端清理齐全，exit 0。关闭健康七项待测，不重复远测。下方 r42 的无回执判断为历史；main/正式 schema/grants/真实运行材料和六项整体目标仍未完成。另 [D 已确定敏感下载 operation/nonce 事务合同](system-backup-d-sensitive-download-admission-contract-20261016.md)，A 可据此实现候选，共享 schema 正式评审仍保留。

本轮保留配置迁移/回填、D 自有读源与 HTTP、恢复管理审计、历史升级/激活、前端自身验收的完整范围。生产接线和实际环境验收仍需真实 A/部署材料；不把新增内部候选算作六项整体完成。

【r42 剩余目标阻塞审计】[逐项当前审计](evidence/system-backup-d-remaining-goal-audit-20261016-r42.json)确认 A 新 proof 十五项已接收，但 D 健康七项仍无实际回执/运行进程，main 未启用；本机仍无 MySQL、Kubernetes context 或 frontend/node_modules。真实维护材料、独立审计卷/容量、历史升级输入和正式 A/B/C 评审仍缺。相同外部条件已连续多轮存在，不能用重复 seed/编译或新增替身解除；完整目标保留未完成，等待操作者专项与真实输入后继续。

【r42 新回执接收】[D 已独立接收 A 配置 proof 十五项实际 MySQL](system-backup-d-a-config-proof-review-20261016.md)：1,292 来源、112 个重点 pin、十五叶子/root、两次实际行锁等待、95 文件 fresh replay、准确 namespace/UID 与两端清理、终态 exit 0 均齐全，关闭这一专项待办，不重复运行。D 新健康七项没有被该 root 执行；本机仍无 MySQL/Kubernetes context/前端依赖，真实运行材料、现场卷及历史输入仍缺，主目标未完成。

【r41 继续推进】[控制循环接点与独立 SQL 专项](system-backup-d-control-health-mysql-handoff-20261016.md)已通过 1,292 输入冻结门禁：198 主/483 含子项、实际 capsule 的 tagged/脱离 CWD seed、Linux 探针和 95 文件 runner 编译及清理。新增 observer 在完成 pass 后记录、失败停止，token 不跨 DB pool，提交回复不明后该实例不再写；main 尚未启用。七项真实 MySQL 未执行，专用操作者命令已备好。另已[接收 A 的 11 份 081/082 候选评审输入](system-backup-d-a-migration-review-20261016.md)；现有 config 正式策略明确要求 A/B/C 交叉评审，纠正“正式晋升可完全不依赖 B/C”的判断，候选代码/SQL 准备仍可由 A/D 独立推进。

## Operation 独立读取

`BackupLiveOperations.tsx` 接入已存在的 Operation 列表及详情，只在用户展开后读取。总览和配置/四类列表全部未就绪时，仍可展开这个独立读取入口；正常记录工作区将它绑定当前安装。分页保留 opaque cursor、稳定性、安装和去重检查；详情绑定所选 ID/安装和最小行版本。关闭、刷新、换安装、卸载和新选择会取消旧请求；迟到结果不显示。列表或权限失败不会变成空列表。没有添加 mutation、重试操作按钮、全局计数或健康事实。

新增五语言操作类型及记录文案。Node 检查覆盖实际 API read client、分页/详情身份、游标循环、跨安装、权限、未就绪、取消及 await 前固定选择。完整 TSX/TypeScript/Vite 构建已执行，但当前没有 frontend/node_modules，`tsc` 不存在，exit 1；没有安装依赖。Node 结果不能替代 React 生命周期、窄屏或浏览器验收。

后台列表参数改为检查 `url.ParseQuery` 的错误，拒绝无效百分号转义及未转义分号；此前 `URL.Query` 会静默丢弃这些参数，随后按默认列表读取。定向 HTTP 用例覆盖四类相关入口中的畸形 limit/status/cursor/未知参数。整包 server 测试因缓存缺少 `klauspost/compress v1.18.0` 被阻断，代理和自动 toolchain 均关闭；保留原失败日志，另外验证实际 handler 源文件，不将其称作 server 整包通过。

## D 自有健康持久化候选

[未编号 SQL 提案](system-backup-d-control-health-proposal-20261016.sql)新增独立 `system_backup_control_health`，只保存安装/config、写者 epoch/owner、观察序号、两个结果和数据库观察/到期时间。不写原始错误、敏感来源、B/C artifact/writer/backlog 信息，也不修改旧 migration、安装投影或现有合同。

`ControlHealthStore.BeginWriter` 使用单条 SQL 初建或 epoch CAS 接管；每个新 epoch 先记录 unknown。`Observe` 分别使用实际控制循环结果和独立 DB readiness probe，按准确安装/config/owner/epoch/sequence CAS 更新，拒绝过期写者、时间倒退和非 UTC session。旧 token 在成功写入后失效，SQL 错误或提交回复不明不返回下一 token。DB 不能写时，旧记录自然过期，不能伪造新鲜失败/成功记录。

`Reader.ReadControlHealth` 在现有 A 授权、安装/config 共享锁、RepeatableRead 和最终授权复查/确认 COMMIT 的同一边界读取。缺 schema/行、旧 config、坏身份/结果/时间或撤权均返回零结果；初始化 unknown、实际 healthy/degraded 与到期 stale 分开。内部快照禁止直接序列化成公共 Overview。

到期预算暂按 `3 * controller_reconcile_interval_seconds` 提案，与 controller 长时间无成功的既有门槛对齐；数据库健康采用相同预算仍须作为 D/A 规则输入审查，未修改合同批准状态。模型 SQL executor 只验证实际发送的 SQL、参数和错误/零行处理，不证明 InnoDB 并发 CAS。

**尚未生产启用。** 后续必须完成该 schema、最小权限和 TTL 语义评审，取得同轮真实 MySQL 的并发/提交不明/时间与重启证据，并将 BeginWriter/Observe 接到真实 leader-start 和控制循环；需要可信固定数据库身份及现有 UTC/grant/claim/alert readiness set。单次 Ping/SELECT、进程本地 Prometheus 值或 Pod Running 均不能作这些来源。上述材料未齐前不更新 controller grant 矩阵，不开放完整总览，也不由 fixture 填值。

## 恢复管理审计

部署预检新增模板及实际 Pod 的有效非 root UID/GID 校验，处理 container 覆盖，并拒绝 privileged、提权、未 drop ALL、新增 capability 及正在删除的存储对象。完整管理预检新增 ExpectedJournalUID/ExpectedJournalGID 两个必填输入，须与初始化器和实际文件身份一致；存储-only 入口不宣称已验证管理进程。

已有 Python 3.13 镜像在非 root、断网、只读源码与容器临时文件系统下执行初始化器八项测试，全部通过。覆盖真实 Linux 的普通文件创建、保留旧内容、符号链接、身份/路径拒绝、fsync 失败、目录换绑及同步后权限漂移。它解决此前七项平台跳过，仍不是 CSI 独立物理容量、持久卷故障、运行 journal 或跨节点围栏验收。未创建 PVC/PV 或修改现有集群。

## A 八项新回执独立接收

[D 复核](evidence/system-backup-d-a-authority-review-20261016-r40.json)及[只读复核器](evidence/system-backup-d-a-authority-review-20261016-r40.mjs)核对原始日志/清单字节摘要、1,265 项有序逻辑摘要、八个唯一叶子 PASS、六项真实暂存回滚 marker、独立观察、原 namespace/UID 清理、两端目录及 69 条本地产物不存在。12 项重点来源仍匹配。

关闭“八项实际 MySQL 尚未执行”的旧待办，不重跑。原轮为 94 文件 catalog；当前目录已为 95 文件，原冻结集合另有当前变化，复核报告逐项保留差异。此接收不批准当前整个工作树或新 catalog，不把 synthetic grant/source/capacity 当真实认证/原归档/物理容量，也不将八项和 D 七项服务合并成同一轮证据。

## 本轮验证结果

| 范围 | 结果与证据 |
| --- | --- |
| 前端读取逻辑、五语言及部署计划 | [最终 Node 日志](evidence/system-backup-d-independent-node-20261016-r40-final.txt)：211 项通过，无跳过 |
| controller/read 两包完整 Linux 回归 | [完整日志](evidence/system-backup-d-control-health-linux-20261016-r40-fix.txt)：194 主测试/479 含子测试，两个 package PASS，默认 vet；未运行 tagged MySQL |
| 最后自动提交边界修正 | [定向日志](evidence/system-backup-d-control-health-linux-20261016-r40-final.txt)：写入器仅接受 sql.DB 后，三项健康测试通过；不重复累加进完整回归计数 |
| HTTP handler 实际源文件 | [定向日志](evidence/system-backup-d-independent-go-focused-20261016-r40.txt)：两项通过，含新增畸形 query；该 wrapper 后续读取包运行/缓存清理失败并终止，不能标为整体成功；相关包由上述 Linux 完整回归验证 |
| 审计卷/管理部署预检 | [最终日志](evidence/system-backup-d-audit-preflight-20261016-r40-final.txt)：42 项快照检查通过，包含正常省略 capabilities.add；未联系集群 |
| Linux 初始化器 | 本机已有 Python 镜像 `sha256:8d9d0b8bcf6506481eae4907c18f5e3e7902e629f5f6d684f9e7c32e85e3ddf0`，八项真实文件系统测试通过；输出在本轮工具记录，未声称有独立远端 transcript |
| schema inventory / 严格合同 | [inventory](evidence/system-backup-d-independent-inventory-20261016-r40.txt) exit 0；[strict](evidence/system-backup-d-independent-contract-20261016-r40.txt) exit 1，当前 95 文件 catalog、100 inventory 对象，40 policy/60 交叉评审/四份 missing/现场 schema 未完成 |
| 完整构建及浏览器 | 前端缺 tsc；[server 整包日志](evidence/system-backup-d-independent-go-20261016-r40.txt)因未缓存的 compress 依赖失败。两项均未通过，未安装依赖。当前 kubectl 没有 current-context；未部署或读取真实卷 |

首轮 Linux Go 容器的临时目录为 noexec，测试二进制未启动，[失败日志](evidence/system-backup-d-control-health-linux-20261016-r40.txt)保留。后续仅修正 tmpfs exec 和只读合同挂载，未修改断言以绕过失败。最终写入器又收紧为 sql.DB 自动提交，避免允许 sql.Tx 提前产生 token。Windows 失败 wrapper 的准确自有 Go 进程和子进程已核对/终止，遗留 `.tmp-a-evidence-66065c2a47994b3caf1b08076b4253dc` 已删除并确认不存在；未终止其他 A 测试。全部本轮标签的容器已自动删除，容器 cache/tmpfs 随之释放，无 frontend dist/node_modules/tsbuildinfo、pycache 或保留的本轮构建缓存。

## 仍需真实输入的工作

- 配置：真实 holder/grant/archive/target/capacity、逐版本 canonical 原文、lifetime receipt/audit 保留与正式 081/082。
- 管理：固定部署镜像/身份、独立审计 PVC/PV/CSI 后端预留、真实管理 mTLS/上级授权、围栏及 I/O 故障证据。
- 历史：真实旧 SQL/ledger、当前 catalog 的评审与 live schema evidence、本人 MFA 和真实激活事务。
- 前端：现有可用依赖环境中的完整构建，以及真实 API、布局/交互、窄屏和五语言浏览器验收。
- B/C 相关完整总览、详情、恢复和端到端缺口仍按原六项审计保留；本轮不填造替代事实。
