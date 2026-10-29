# D：Agent 备份协议交付与现场边界（2026-10-29）

本项是 Agent 侧协议增量，尚未接通 ClawManager 的完整执行链，也不是现场备份成功证明。

## 现场输入

`clawmanager-zhanghui08-system` 的 OpenClaw、Hermes Runtime 对
`GET /v1/stop-capabilities` 均返回 404。原始摘要已保存于
[`evidence/d-runtime-agent-capabilities-20261029.json`](evidence/d-runtime-agent-capabilities-20261029.json)。
`mutation_sent=false`、`backup_ready=false`。404 只说明这个接口不可用；不能据此推断镜像的准确源码版本。
SSH 结束时的 socket 提示不改变已返回的 HTTP 结果。

现场 App/Runtime 的 `/workspaces` 实际挂到 `10.107.165.245:/`；它与本 namespace 的
hostPath PVC 不是同一存储来源。后续备份仍限定当前安装、当前 namespace 及其有权拥有的目录，
不会扩大为整个 NFS export，也不会停止其他 namespace 的使用者。

## 可审查的 Agent 源码

- 仓库：`https://github.com/Yuan-lab-LLM/AgentsRuntime`。
- 固定基线：`8a0dddbf53f6199a2ff221c2a7d58b8b82ad9fe7`。
- 本地提交：`ac9079ce58c954c9ea93f45e640f628d9a6c21fb`，分支 `codex/runtime-backup-proof`。
- 上游 push 返回 403，当前账号没有该仓库写权限；**该提交没有推到 Agent 上游**。
- 为便于复现与接手，将完整源码补丁交付在本 ClawManager 仓库：
  [`patches/agentsruntime/0001-feat-agent-persist-isolated-backup-stop-and-resume-r.patch`](patches/agentsruntime/0001-feat-agent-persist-isolated-backup-stop-and-resume-r.patch)。
- 补丁 SHA-256：`6d6498efc5eb900937f0bcd6ed0a07cfd51d6d94458d021a6885aefe14179ea7`。

补丁包含版本化 `BackupRequest`、`BackupResumeRequest`、`BackupReceipt`、摘要函数、
native `slots.Worker`/`slots.Pool` 的真实路由、共享实例写入账本及测试，另附
`docs/isolated-backup-protocol.md` 的完整协议说明。不是只修改源码 SHA 或探测结果。

## 已实现

新路由为 `/v1/backup/capabilities`、`stop`、`resume`、`state`、`complete`。
能力查询必须指定实际 slot 主端口；它始终只是元数据。

停止请求绑定 namespace、Pod UID、slot Agent epoch、operation ID、用户/实例、
原 generation、gateway ID/端口、期望 PID、预留恢复 generation 和恢复配置摘要。
Agent 在实际停止前同步保存 intent，并保留稳定 flock 及共享写入账本。
只有隔离生命周期完成辅助命令、进程树和执行挂载清理后才持久化停止回执。
未知 gateway 或 404 不能生成证明。

备份期间普通创建、删除、维护和 pending cancellation 被拒绝；其他 slot/Pod 即使在
原进程崩溃释放 flock 后，也不能越过账本中的备份预留。
恢复只接受预留的配置和 generation，先持久化派发，再调用真实 CreateGateway。
重复请求只能核对已有派发，不能再次启动。恢复后，必须由控制器完成原绑定 CAS，
再调用 `complete` 解除备份预留。账本与回执不保存原配置明文。

## 本地验证及限制

Go 1.26 Linux/amd64 测试二进制在本机 Docker Desktop WSL Linux 下执行：

- `slots` 完整测试通过：包含身份漂移、停止失败、持久化失败、跨槽抢占、配置摘要、
  未知派发不重发、恢复完成、Agent 重启隔离，以及回执不泄露配置等新增用例。
- `gateway` 完整测试通过：包含实际 PID 固定后才取消生命周期、缺失 gateway 不造证明。
- `git diff --check`、补丁反向应用校验通过。
- 本次 `.tmp-d-backup` 二进制、Go 缓存及临时构建目录已删除。

新增用例使用模拟进程启动器和真实临时文件/flock。环境开关控制的内核/容器验收没有开启。
这些结果没有证明现场 MySQL、Kubernetes、真实 sandbox 或 NFS 联调。

Agent 自身重启后的自动接管尚未实现，能力字段明确为
`agent_restart_reconciliation=false`。重启保留账本和历史证据，但当前操作进入隔离状态，
不能把旧回执当作当前停止证明。控制器重启且 Agent 不变时，可以用原请求查询已有状态。

## D 的下一批接入责任

1. 新能力接口及 native 原始配置 DTO/加密 custody 兼容；当前现场没有历史 generation 的
   原始请求证明，不能从现在的 env 反推。
2. 将请求、原始回执字节及摘要绑定原任务/attempt，持久化到 D 的 SQL 控制记录；
   保留同一授权快照和最终复查。
3. 用真实停止/状态/恢复回调替换现有 `BackupGatewayWriter` 的 DELETE/404 流程，
   `ClaimRestart` 必须核验正向停止证明，`CompleteRestart` 还须 CAS 更新新 PID。
4. 给 B 提供更新后的构造参数及 caller，不让 B 编写公共控制 SQL。
5. 接通单 namespace 的全部 participants、真实 NFS 子目录归属与部署入口，再提供完整的
   本地 PowerShell 远程验证命令。旧镜像不能只换 tag 就视为兼容 native slot 协议。
6. `4fe83bcd` 的现库导入 profile、现场 080 初始化/升级路径仍为 D 的独立交付；
   不能把现场库直接迁到最新或只改 profile 的 source SHA。

在这些接入与真实多用户备份/恢复验收完成前，维持 `backup_ready=false`。
