# D 配置历史与单版本只读入口

本轮在真实工作区的当前配置卡片中加入“查看配置历史”。关闭时不读取历史；打开后通过已有 `systemBackupReadService.configVersions` 分页，点击某版本再通过 `configVersion` 获取单版本详情。没有写请求、回滚/激活按钮或新的路由；原 live-read build-time 门禁保持不变。

每页请求 50 项，不自动下载全部历史。`backupLiveConfig.ts` 在 await 前固定工作区的安装 ID、当前版本、当前行版本和 effective_enabled，每次历史页/单版本读取的前后均重读当前配置，要求这四项仍一致且当前配置 active。续页绑定相同基准，拒绝游标循环、跨页重复/逆序、不同安装和不匹配的 active/effective 标记；当前版本资源的行版本必须与基准一致。单版本还须准确匹配选择的版本，并且不低于列表中已选行版本。末页 next_cursor=null 后不再请求。

当前配置已读取成功时，未过滤的第一历史页为空是不一致结果，不能显示成“暂无配置”。401/403/503、分页错误、当前配置变化或数据校验失败均显示读取失败，不生成空历史或 preview。刷新会移除旧历史/单版本结果并重新开始第一页。切换选择、收起历史、刷新、卸载或父工作区观察到当前配置基准改变时，旧请求被取消；迟到结果不能覆盖新选择。

后端 `config_list.go` 每页以准确安装作用域、版本截止和 before-version 排序；投影的 active/effective 是读取时的状态。前端因此不将它们当作版本创建时的运行状态。页面显示当前激活标记、创建时间/原因、选中版本的配置开关、最低恢复点、告警 profile、创建者及折叠的只读参数。配置开关 `config.enabled` 与当前生效状态保持各自语义，不把历史版本的 inactive 解释为当时功能关闭。

参数区以 React 文本展示已有封闭、脱敏的 ConfigValues；没有 HTML 解释、秘密引用展开或外部读取。`JSON.stringify` 只用于展示结构化读取投影，不保留或证明原 canonical 字节，不能作为旧原文、hash 等价、来源认证或回填写授权材料。

[r32 机器回执](evidence/system-backup-d-live-config-local-20261015-r32.json)及[原始日志](evidence/system-backup-d-live-config-local-20261015-r32.txt)记录一次正常执行、exit 0、140 项 Node 检查全部通过，无跳过或重试：

```powershell
& 'C:\Program Files\nodejs\node.exe' --test-isolation=none --test `
  frontend/scripts/system-backups.test.mjs `
  frontend/scripts/system-backups-live-detail.test.mjs `
  frontend/scripts/system-backups-live-activity.test.mjs `
  frontend/scripts/system-backups-live-config.test.mjs `
  frontend/scripts/system-backups-i18n.test.mjs
```

新配置专项有 12 主测试、27 子测试：120 个合成版本按 50/50/20 三页读取及特殊 cursor、精确单版本路由、四项续页基准、跨页重复/游标循环/跨安装、active/effective/当前行版本核对、页前/页后变化、空第一页拒绝、单版本身份/版本回退、两种读取各四个取消阶段、无效选择、认证/就绪/未审字段拒绝及 await 前基准固定。既有任务详情、事件/日志、API/schema、分页、轮询和五语言检查一起通过。27 个运行后摘要记录当前源码、合同及已复核后端参考，不是冻结构建清单，也不意味着本轮执行后端/MySQL。

未安装依赖，未产生构建产物。项目 `frontend/node_modules` 仍不存在；完整 TSX/TypeScript/Vite 构建、React 渲染、浏览器交互及真实 API 未执行。前后读取是观察边界，不是跨 HTTP 请求的原子数据库快照。本轮不升级运行写授权、原始 canonical 来源、正式迁移、B/C Owner、生产接线或远测结论；原六项整体目标仍未完成，已接收的 index/writer/storage 专项无需重复。
