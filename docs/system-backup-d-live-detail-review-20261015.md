# D 四类真实任务详情只读入口

【后续 r31】[事件/日志只读入口](system-backup-d-live-activity-review-20261015.md)已补上按需分页、过期日志到事件的入口及取消边界，最终 101 项 Node 检查通过。以下保留 r30 详情实现及其 61 项验证范围；当时的事件/日志 UI 待办已由 r31 候选推进，完整构建/浏览器和实际 Owner 仍未完成。

本次补齐列表到详情的候选页面流程。`BackupLiveWorkspace.tsx` 中四类任务 ID 均可选择，`BackupLiveDetail.tsx` 通过现有 `systemBackupReadService` 读取备份、演练、预检和产物校验详情。继续复用应用认证传输和既有封闭 DTO 校验，不新增 endpoint、Owner 字段或写操作；原 `VITE_SYSTEM_BACKUP_LIVE_READ=1` 门禁保持不变。

`backupLiveDetail.ts` 在 await 前固定选择的 kind、任务 ID、安装 ID 和列表行版本。详情须属于所选任务及安装，行版本可以更新，不能比已选列表行更旧。列表轮询观察到该任务行版本前进时，详情重新读取并提高最小行版本；独立详情也提供刷新及准确的任务更新时间。请求前和返回后均检查取消；组件切换任务、关闭或卸载时取消当前请求，迟到结果不能覆盖新选择。刷新详情先移除旧结果，错误直接显示读取失败，不替换为 preview 或“空任务”。

页面分别显示任务执行状态、尝试/阶段/进展、配置版本、任务更新时间和验证计数。备份的执行成功、产物状态、可读性、验收准备和资格分开显示；演练的清理和资格分开显示；预检展示模式、兼容性及报告有效原因；产物校验展示前后可读性及决议。没有从 succeeded 推导 eligible、usable 或实际 B/C 健康。源可以是 backup 或 catalog import，因此使用“源产物”，不统一误标为“源备份”。五种语言的新增文案均显式登记。

[r30 Node 原始日志](evidence/system-backup-d-live-detail-local-20261015-r30.txt)和[机器回执](evidence/system-backup-d-live-detail-local-20261015-r30.json)记录以下命令 exit 0，61 项检查全部通过，无跳过或重试：

```powershell
& 'C:\Program Files\nodejs\node.exe' --test-isolation=none --test `
  frontend/scripts/system-backups.test.mjs `
  frontend/scripts/system-backups-live-detail.test.mjs `
  frontend/scripts/system-backups-i18n.test.mjs
```

新增专项有 7 个主测试、11 个子测试，验证四类准确路由/原始 DTO、行版本前进与回退、不同安装/任务拒绝、401/403/503、Owner 字段泄漏拒绝、取消前不发请求、忽略 abort 的迟到返回、await 期间选择对象变化。原 API/分页/轮询/schema 检查和五语言检查一同执行。机器回执记录 13 个运行后源码摘要，这不是冻结构建清单。

本轮没有安装依赖，也没有产生二进制、构建目录或缓存。项目的 `frontend/node_modules` 不存在；只读检查已有工作区运行时也未发现 TypeScript/React/Vite 或 TSX parser。因而没有执行完整 TypeScript/Vite 构建、React 渲染或浏览器验收。Node 测试执行读取逻辑和翻译检查，不能当作 TSX 编译或页面渲染通过；该限制明确保留，待已有依赖环境可用后完成。

事件/日志 UI、完整总览/详情的实际 Owner 来源、真实 B→A→C→D、部署矩阵与大数据量验收仍未完成。当前服务专项远测另按其准确冻结来源接收，本轮前端修改不改变正在运行的后端副本，也不要求重跑已接收的 writer/storage/index 专项。正式迁移、运行授权及生产接线仍保留原门禁，六项整体目标未完成。
