# B 统一基线适配验证记录（2026-10-29）

准确基线：`af7c3ad599195eb1a577c3e0389c55a9643d375b`，远端 `origin/codex/unified-backup-baseline` 同 SHA。本地从 `4fe83bcd` 快进，保留既有未提交 B1/B3 工作；没有新提交、暂存、推送、依赖安装或真实迁移。

## 本轮源码与接收方

接收方 D：`PublicCaptureConfig.Modules`、`PlatformWriters`、`DeploymentService.PlatformWriterGroup`、`ComposeRuntimeWriters`、`WithCaptureModules`。原 `SQLRuntimeControl.BuildWriters` 保持控制权，原平台物理停止/退出/恢复逻辑保留。接收方 C：模块目录、共享上下文字段、受限操作与结果清单合同。接收方 D/A/C：迁移 124 目录元数据及两个目标本地执行表分类复核。

完整文件清单及 LF 规范化 SHA-256 见 [source-pin.json](source-pin.json)。实际调用、材料字段和交接缺口见 [B 统一适配说明](../../system-backup-b-unified-adaptation-20261029.md)。本记录不继承旧 `b-runtime-modules-20261029` 日志的通过结论。

## 实际命令和结果

Go 使用已有工具及缓存，`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`，临时目录指向本轮专用目录。没有下载或安装模块。

| 检查 | 实际结果与证据 |
| --- | --- |
| `go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/systembackup/publicadapter ./internal/systembackupdispatch ./internal/systembackupexecution` | exit 1。前两个包通过，execution 在依赖解析阶段失败，未执行该包测试。`integration-tests.jsonl` / `.stderr.log` / `.exit.txt`。 |
| `go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/systembackup/publicadapter ./internal/systembackupdispatch` | exit 0；242 个通过测试事件（含子测试），无失败/跳过。`public-tests.jsonl` / `.stderr.log` / `.exit.txt`。 |
| `go -C backend vet ./internal/systembackup/publicadapter ./internal/systembackupdispatch` | exit 0；`vet.log` / `vet.exit.txt`。 |
| `python -B scripts/backup-team-catalog.py --check` | 初始失败日志 `catalog-check.log` 保留；同步迁移 124 后最终 exit 0，`catalog-check-final.log`。 |
| `python -B scripts/backup-team-catalog_test.py` | 3 项通过；`catalog-tests-final.log`。 |
| `go -C backend test -json -count=1 ./internal/migrationcatalog` | exit 0；3 个通过事件，`catalog-go-tests.jsonl` / `.stderr.log` / `.exit.txt`。 |
| 标准库 `go/parser` 对 9 个新增/修改 Go 文件解析 | 语法通过；`syntax-check.json`、`syntax-parser.go`。这不构成类型检查或编译。 |
| 原保护与批准字节复核 | `guard-review.json`：supportedPublicCapture、原 platformProfile 函数、deployment_service、D runtime/relay SQL、go.mod/go.sum、迁移 SQL 未变，registry.objects 的策略/审批未变。 |

汇总为 [test-summary.json](test-summary.json)。目录由 164 变为 165 个迁移文件，目录摘要及对象审批比对见 [catalog-exits.json](catalog-exits.json)。目录同步不构成新表策略批准或执行 DDL。

## 未完成验证的准确原因

本机缓存缺少 `github.com/cyberphone/json-canonicalization@v0.0.0-20261011152517-32a48195b9b2`。`GOPROXY=off` 阻止依赖查找；Go 的 downloading 提示没有带来模块内容。没有替换版本、stub、下载或安装。新增 `systembackupexecution` 接线和 `public_modules_test.go` 尚未类型检查/编译；须提供现成缓存或由 D 在已有获准构建环境补做 execution/controller 编译与针对性回归。

已执行用例属于 SQL 驱动模型、loopback HTTP、Job/evidence 模型、模块与 factory 契约。没有真实 MySQL、K8s、Runtime Agent、快照、存储或签发/撤销测试，没有执行真实迁移。正式 profile 的 workspace-only / functional_test / 零实例限制保留；本轮不能证明非空 Agent 或公共正式成品整链通过。

## 输出与清理

保留原始日志及源码记录。Go-run 没有在仓库留下独立二进制。清理本轮专用空临时目录的命令被自动审批以 `blocked by policy` 拒绝，整个命令未执行，空目录保留，不换方式重试。旧测试缓存此前也曾被拒绝删除，继续保留；未删除其他 owner 的产物。
