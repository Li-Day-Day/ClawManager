# D 四类任务事件只读 API

日期：2026-10-16。

备份、演练、预检和 artifact verification 的 events 路由已接到真实读取服务；前端事件视图可独立于完整详情使用。因此完整详情暂时返回 503 时，管理员仍可从任务列表选择任务并打开事件页。真实部署沿用既有 live-read 开关、A 的权限与安装 pin，不增加授权或默认开启生产。

## 规范依据与旧结论更正

主分工文档第 6.2 节定义 system_backup_events 的 message/details 为已脱敏字段。机器合同 contracts/system-backup/v12/admin-activity-resources.schema.json 的 EventResource.message 标记 x-redacted-before-persist=true。D 可以读取已持久化正文，脱敏是写入路径的职责。旧交接把“A 再提供读时脱敏”作为事件接口前提，现予更正；这不意味着完整详情的报告、恢复、清理和 artifact/catalog 事实已具备。

## 服务端行为

Service.ListTaskEventsDTO 复用现有事件控制分页，先在 RepeatableRead 事务中用 A 当前 scope 读取准确任务，再固定 event ID cutoff 并按 created_at/id 倒序分页。正文仅用本页绑定的事件 ID、受信安装和目标查询；必须完整返回所选 ID，重复、缺失、越界身份、读取或关闭失败均拒绝整页。message 保持公共 schema 的 UTF-8/2,048 字符上限，允许 schema 合法的空字符串；details 保留 nullable 语义，拒绝 JavaScript 无法精确表示的数字。

公共 EventResourceList JSON 不变；内部 ID、安装和版本不写入 DTO。返回前必须通过最终权限复查并确认事务提交，取消、撤销、提交失败时不发布部分响应。四类事件 HTTP 与现有列表使用相同的严格 limit/cursor 校验、no-store 和统一错误映射。

成功响应增加三个传输上下文 header，并以 Access-Control-Expose-Headers 追加公开，支持跨域 API 配置：

| Header | 值与用途 |
| --- | --- |
| X-System-Backup-Data-Source | live；拒绝 fixture 或未知来源 |
| X-System-Backup-Origin-Installation-ID | 来自本事务已授权 Task 的安装 |
| X-System-Backup-Task-Row-Version | 同一 Task 的正整数 row version |

游标继续绑定安装、种类、准确任务 ID、limit、cutoff 和微秒时间/ID keyset；新插入的回溯事件不会进入旧页。

## 页面行为

Axios adapter 保留上述 header。独立事件 reader 对照列表选中任务校验安装和最低 row version；不接受缺失、非规范数字、版本倒退或不匹配响应。错误响应不要求成功 header，因此 401/403/503 保持原错误语义。续页固定选中身份，拒绝跨任务/安装/版本续用、游标回环和一致性变化；相同内容的不同事件不去重。

详情导航始终提供状态与事件入口；详情未就绪时日志入口禁用。事件有自己的加载、刷新、错误、空列表和加载更多状态。切换任务或失败后不会保留旧事件为新结果。日志仍使用原有详情前后核对路径，未在本轮开放日志正文 API。

## 验证边界

- 前端 221 项 Node 测试通过，包含新增事件绑定与独立分页测试；最终 TypeScript/Vite 构建日志单独保存。大主包体提示仍存在。
- 浏览器使用真实 React 组件与 Axios service、模拟 adapter；完整详情始终 503。四类任务、分页、空数据、403、跨安装响应、五种语言及 375px 无水平溢出均已检查。它不计作真实业务 E2E。
- 后端冻结源码后，先使用现有 Go 镜像与依赖离线验证：两轮读取包 72/493 与 MySQL-tag 编译通过，HTTP 阶段遇到容器读取 Windows 共享目录的长时间磁盘等待，两个自有容器主动终止，exit 137，日志保留。随后改用本机 Go 1.26.1 和现有依赖：读取包 72 个主测试/493 含子项、MySQL-tag 编译、2 项 focused HTTP 测试及默认 vet 全部通过。补齐跨域 expose-header 后，复用自有缓存对最终处理器再跑 2 项 HTTP 测试，通过；两轮冻结复查与清理均成功，进程 exit 0。读取包和安全包在这两轮间的所有源码摘要完全一致。此处只检查 focused HTTP 文件集，不代替整个 server 包或真实数据库 E2E。首次本机辅助脚本因 telemetry scratch 目录命名检查提前退出，修正后使用单独的具名目录重跑。
- 真实 MySQL 新增四类事件的消息映射、稳定截止/同时间 ID 排序、跨安装与会话撤销断言，挂载在既有隔离父测试内；本轮只编译，未执行真实 SQL。
- 本轮未安装依赖。测试日志、源清单与截图为验收证据；临时页面、服务、dist 和构建缓存测试后删除。

[本机读取与标签编译日志](evidence/system-backup-d-event-api-native-local-20261016-r2.txt) · [最终 HTTP 日志](evidence/system-backup-d-event-api-native-local-20261016-r3.txt) · [最终冻结清单](evidence/system-backup-d-event-api-native-source-20261016-r3.json) · [机器回执](evidence/system-backup-d-event-api-review-20261016.json) · [浏览器检查](evidence/system-backup-d-event-api-browser-20261016.json) · [前端测试](evidence/system-backup-d-event-api-frontend-tests-20261016.txt) · [最终构建](evidence/system-backup-d-event-api-frontend-build-20261016-r2.txt)

按用户指示，本轮验收和清理完成后暂停目标。恢复时优先取得新增事件/详情断言的真实 MySQL 回执，再接完整详情的 A/B/C 权威来源；总览、日志、manifest 和写操作保持各自独立待办。
