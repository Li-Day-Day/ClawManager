当前任务提交封装原先只核 schema、kind、key 和 config version，会把缺少 public ID、状态或行版本的 live 202 响应当作完整任务返回；非法运行时 kind 也会先发 preflight 请求再拒绝。

Root 在 API D 聊天完成后窄补前端两处：从原 `backupApiRead.ts` 导出完整任务 DTO typeguard，原读校验规则没有改变；`systemBackupTaskService.ts` 复用它并绑定 create endpoint/key，在请求前拒绝非法 kind、key 和 JSON。函数保留原 body/key/signal 参数，未知传输结果只传播一次，不新增自动重试、请求 DTO 或页面操作入口。

[准确增量记录](evidence/d2-task-submit-increment-current-20261027.json)保存原实现 20 项测试中的 11 个断言失败、修复后 20 项全部通过，以及当前 335 份输入的完整 UI 验证：306 项 Node 检查、两项类型检查和构建全部通过，源码字节及文件集匹配，准确临时 owner 已删除。测试执行真实 TS service，只替换应用 HTTP 边界；没有连接业务后端、SQL、provider 或执行器。旧 UI 333 份记录和 API D 原 16 文件交接保留其历史来源，本增量替换其中前端部分的当前证明，不改写原 Go 回执。

当前生产 writer/details 仍未接通；请求合同、B/C 适配和真实链继续按原 API 交接处理。本增量不批准当前后端基线或生产使用。
