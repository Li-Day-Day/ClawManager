# WorkBuddy 身份输入与配置诊断：隔离验证

基线 `af7c3ad599195eb1a577c3e0389c55a9643d375b`，日期 2026-10-29。本轮实现与接收清单见 [交接说明](../../system-backup-b-workbuddy-input-diagnostics-20261029.md)，源码范围和规范化摘要见 [source-pin.json](source-pin.json)。保留既有未提交工作，不提交、推送、暂存或部署。

## 环境与命令

仅使用已存在的 Go 和缓存：`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`；复用 `.codex-temp/b-direct-backup-integration-20261028/cache`。没有下载或安装依赖，没有访问服务器或集群。

| 命令 | 结果/日志 |
| --- | --- |
| `go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/systembackup/publicadapter ./internal/systembackup/domain -run 'TestWorkBuddyInput\|TestModuleDiagnostics\|TestWorkBuddyBatch'` | 初步定向测试 exit 0，22 个通过事件；`targeted-tests.jsonl` / `.stderr.log` / `.exit.txt`。随后补多实例顺序/幂等用例，以完整测试为最终结果。竖线是 Markdown 表格转义，原命令为正则 OR。 |
| `go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/systembackup/publicadapter ./internal/systembackup/domain` | exit 0；adapter 288、domain 96，共 384 个通过事件（包含子测试），无失败或跳过。`full-tests.jsonl` / `.stderr.log` / `.exit.txt`。 |
| `go -C backend vet ./internal/systembackup/publicadapter ./internal/systembackup/domain` | exit 0；`vet.log` / `vet.exit.txt`。 |
| `git diff --check` | exit 0；该命令不包含 untracked 文件，新增 Go 源码另经 gofmt、实际编译及上述测试验证。 |

[test-summary.json](test-summary.json) 保存准确计数。日志均为实际输出，不包含源快照或源行摘要。测试身份/密码字符串、数据库行和挂载配置均为合成；快照只在内存中构造，没有将含密码/配置的快照写成明文文件。

## 新增覆盖与既有回归

- 从通过原 schema/关系/UID allocator 校验的快照批量读取活动 WorkBuddy 身份，原单实例 API 兼容；不选择历史预留或重复/未知 ID；按请求顺序返回。
- 身份装配后进入 `NewUsersInstancesModule → NewCaptureModules → BuildCapturePart` 的实际本地 Job 工厂；没有向 Kubernetes 派发 Job。
- 源 users/owner/generation/workspace 漂移、缺 schema/列、allocator 回退、重复 UID、缺活动身份、预填冲突和不完整挂载全部拒绝，返回零配置。
- 多用户、多实例、反复装配相同身份、输入快照/模板不变、输出/输入及各实例身份不共享可变对象；非 WorkBuddy 路径仍做复制和严格模块校验。
- 诊断同时报告多项缺失；固定字段/错误码和实例/下标定位；含模拟私密值的输入不会进入 JSON 输出；最多 128 项、截断、容量和确定性检查。
- 配置严格构造失败仍返回固定 fallback issue；诊断不会放松原 schema 或 policy 校验；支持 PVC/NFS/固定节点 hostPath 的本地形状；输出路径冲突给定点提示。
- 两包完整回归保留原 WorkBuddy 恢复/allocator/历史身份及原模块失败路径检查。

## 不能外推的结论

纯 `domain.Snapshot` 无 task/database/installation 的认证元数据，装配器不负责认证来源；D/A 必须绑定原任务/捕获点/权限。诊断为空不代表通过完整 inventory、认证授权、六域或生产准入。没有真实 MySQL、Agent 服务端、K8s、快照/实际存储、密钥发放或迁移验证。

`systembackupexecution` 装配包仍缺现成 `github.com/cyberphone/json-canonicalization@v0.0.0-20261011152517-32a48195b9b2`，本轮没有重复必然失败的构建。该包未编译的限制保留；当前两包通过不等于公共整链通过。未修改原零实例/workspace-only/functional_test 准入。

Go 测试自身清理其临时目录；没有在仓库产生独立二进制。按用户要求不处理旧空目录和旧缓存，没有删除其他 owner 的产物。保留本轮日志与源码记录。
