# D 真实任务事件与日志只读入口

本轮在 r30 四类详情入口上接入“事件”和“日志”视图，复用已有 `systemBackupReadService.activity`、认证传输、准确类型化路由和封闭 DTO 校验。只有用户打开相应视图或点击加载更多才发起该频道读取，每页请求 50 项，不自动遍历历史页或轮询过期日志。读取功能的原 build-time opt-in 和生产门禁保持不变。

`backupLiveActivity.ts` 为每次请求固定选择身份。由于 EventResource/LogEntryResource 没有安装 ID，每页前后各读取一次所选任务详情，核对任务 ID、安装 ID 和不低于所选列表行的版本。页前核对失败不读取活动，页后核对失败不发布该页。这是两个请求边界上的观察核对，不是跨请求 SQL 快照；每页包含两次额外详情读取及一次活动读取，延迟成本明确保留。

续页只能用于同一 task kind、ID、安装、最小行版本和频道，保持初始 consistency，并拒绝重复游标。opaque cursor 经既有客户端 URL 编码传递，不解析或改写。最后一页的 next_cursor=null 后不再发请求。追加成功创建新页对象；失败不会返回部分成功的空集合。UI 在读取失败时显示错误并移除旧活动视图，手动刷新从第一页开始，不把 401/403/503 当作无事件。

事件 DTO 没有唯一事件 ID；本实现保留完全相同的合法事件，不以时间/文案自行定义去重键。展示使用有序列表位置作为 React key，刷新/切换视图重新挂载。事件仅显示脱敏消息、时间、级别和明确的截断提示，不用事件重建任务状态、资格或生命周期权威。日志以 React 文本展示，不解释为 HTML，不读取日志消息中的链接或 Owner 载荷。

`logs_expired` 仅在日志频道且返回非认证的 4xx 时呈现为过期；401/403、服务器错误或其他 code 继续显示读取失败。过期后移除日志和该视图的刷新/续页入口，提供“查看持久化事件”按钮；这是用户主动切换到独立事件读取，不把事件合成为日志。关闭详情、切换任务/频道、刷新或卸载时取消请求，忽略 abort 的迟到结果也不能发布。

[r31 机器回执](evidence/system-backup-d-live-activity-local-20261015-r31.json)与[最终原始日志](evidence/system-backup-d-live-activity-local-20261015-r31.txt)记录以下命令 exit 0，101 项 Node 检查全通过，无跳过、无失败断言重试：

```powershell
& 'C:\Program Files\nodejs\node.exe' --test-isolation=none --test `
  frontend/scripts/system-backups.test.mjs `
  frontend/scripts/system-backups-live-detail.test.mjs `
  frontend/scripts/system-backups-live-activity.test.mjs `
  frontend/scripts/system-backups-i18n.test.mjs
```

新增 activity 专项为 11 主测试、29 子测试。覆盖四类任务 × 两频道、含特殊字符的 cursor、重复事件保留、末页不请求、续页身份/版本/频道绑定、游标循环/consistency 改变、前后安装/行版本核对、四个取消阶段、认证/就绪/过期错误、续页失败、页尾撤权和原 DTO/Owner 字段拒绝。既有详情、API、分页、轮询、schema 及五语言检查一同执行。先前 98 项准备轮正常通过；增加续页/页尾权限测试后以最终 101 项计数，不将两轮相加。20 个运行后输入摘要只记录当前文件，不能代替冻结构建证据。

未安装依赖，未产生需要删除的构建产物。`frontend/node_modules` 仍不存在，因此没有执行 TSX/TypeScript/Vite 构建、React 渲染或浏览器交互。Node 执行逻辑/翻译测试并读取 TSX 源码，不能证明页面编译或真实 API 可用。实际活动生产 adapter、Owner 来源、B→A→C→D、矩阵/大数据量与前端构建/浏览器仍待验证；六项整体目标未完成。该前端增量不升级任何后端远测或生产批准，也不要求重跑已接收的 index/writer/storage 专项。
