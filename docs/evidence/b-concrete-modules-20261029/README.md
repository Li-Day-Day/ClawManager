# B2 盘点、具体模块注册与失败路径验证

日期：2026-10-29。准确基线：`af7c3ad599195eb1a577c3e0389c55a9643d375b`。源码、调用示例、B2 实际协议字段和 D/A/C 缺项见 [本轮交接](../../system-backup-b2-capability-and-module-registration-20261029.md)。本轮触及文件的 LF 规范化摘要见 [source-pin.json](source-pin.json)。其他既有未提交改动保留，不视为本轮新实现。

## 已执行命令

使用现有 Go 和原缓存，环境为 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`，没有安装或下载依赖。

| 检查 | 结果 |
| --- | --- |
| `go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/systembackup/publicadapter` | 最终 exit 0；266 个通过事件（包含子测试），无失败/跳过。日志 `public-tests-complete.jsonl` / `.stderr.log` / `.exit.txt`。 |
| `go -C backend vet ./internal/systembackup/publicadapter` | 最终 exit 0，`vet-complete.log` / `vet-complete.exit.txt`。 |
| `go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/services -run 'TestBackupGatewayWriter\|TestRuntimeAgentStop'` | exit 0；33 个通过事件（含子测试），无失败/跳过。日志 `runtime-client-tests.jsonl` / `.stderr.log` / `.exit.txt`。 |
| `git diff --check` | exit 0。该命令不检查 untracked 文件；本轮新增 Go 文件已由 gofmt 与上述实际编译/测试验证。 |

原始命令中 services 的 `-run` 参数是 `TestBackupGatewayWriter|TestRuntimeAgentStop`（表格中的竖线因 Markdown 转义）。整体摘要见 [test-summary.json](test-summary.json)。

## 初次失败与修复轨迹

`targeted-tests.jsonl` 保留最初 exit 1：新注册的配置冻结逻辑在原结构上反序列化，复用了嵌套指针/切片，调用者修改后改变已注册配置。改成反序列化到全新结构后，`targeted-tests-final` exit 0。随后增加 WorkBuddy 绑定、额外挂载、取消分类和跨模块输出碰撞等检查，每次源码变化后的回归分别保留为 `public-tests`、`public-tests-final`、`public-tests-complete`；最终结果以 complete 为准。未删除或改写初次失败记录。

## 准确覆盖

- 真实 `NewUsersInstancesModule → NewCaptureModules → BuildCapturePart` 构造链，包含联合数据库 part、多用户、多种 Lite 实例、原运行/停止实例、每实例 workspace、额外 documents 挂载、全局 PartIndex、零实例用户捕获。
- 不可变嵌套配置、owner/generation/workspace 漂移、旧 task/attempt、错误捕获点/deadline、缺失/重复/外来挂载、Windows/过渡状态、release policy、WorkBuddy 原 instance/user 绑定、无效 Pod-bound Job。
- 任一组构造失败或模拟 fence 丢失，不返回部分 writer；进入 runtime builder 前/返回组合前取消，停止继续构造，并保留取消或 coordination_invalid 分类。
- 同 B 模块以及 B/C 模块之间在同 namespace/staging PVC/task 子目录的输出文件名冲突，派发前拒绝整个计划。
- 复用现有 loopback Runtime 客户端测试，检查停止回执的错误 generation/operation/Pod/epoch/PID、缺确认、不支持 endpoint 不退回 DELETE、原代数停止/新代数恢复、未知创建结果不盲重发等。

这里只验证模型和客户端/计划构造：Job 对象是原 Kubernetes 工厂生成，但没有向集群派发。测试中的身份、CA、策略和 PVC 都是 synthetic，不能作为现场能力/身份/布局证明。

## 未验证范围

- Agent 服务端源码未在本仓库，部署脚本引用的外部默认目录也不存在。未证明服务端 task/fence 约束、旧请求撤销、操作持久化重放、detached 工具树退出或安全恢复。
- 公共 `systembackupexecution` 装配在上轮因缺少 `json-canonicalization@v0.0.0-20261011152517-32a48195b9b2` 而未完成编译验证，本轮未安装依赖或重复失败构建。B 包通过不代表该装配包已通过。
- 未运行真实 MySQL/K8s/Agent/快照/实际存储、密钥发放、真实迁移或正式成品恢复；现有非空实例/acceptance 门禁保留。

没有提交、推送、暂存或部署。按用户要求不处理上轮两个空临时目录；本轮无仓库内独立二进制，没有删除其他 owner 的产物。
