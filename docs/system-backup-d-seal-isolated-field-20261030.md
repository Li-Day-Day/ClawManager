# D：独立存储能力验收（不启用生产备份）

现场只读输出确认：`clawmanager-app` 使用 `backup-test-zh-fix18`，不存在 `/usr/local/bin/system-backup-seal-custody` 和 `/usr/local/bin/system-backup-v2-controller`；当前 Deployment 没有 `SYSTEM_BACKUP_*` 配置或 staging 挂载。不能在该 App 上直接执行生产 seal 探针。此记录不推断镜像是否包含其他备份实现。

`scripts/system-backup-seal-isolated-probe.py` 复用正式 PVC 探针，但只创建随机 `seal-capability-*` namespace、独立 ServiceAccount、两个 1Gi RWX PVC 及临时 Pod。默认打印方案，`--execute` 才执行。默认存储类 `longhorn-rwx`，controller 在 `k8s-master`，worker 在 `node1`；要求两个不同 Linux/amd64 节点、Immediate 绑定及 Delete 回收策略。无业务卷、业务凭据、数据库连接或生产 Deployment 修改。

当前诊断镜像的 Go 二进制来自精确提交 `39265b45ef414c76ef46153de34b83e8392571f3`，不是持续变化的工作区（初版来自 `e1baddba`）。镜像用 `deployments/backup-seal-probe.Dockerfile` 构建，只包含 Alpine 和维护 CLI。此镜像有 shell，专用于验收，不是正式 worker 镜像。

## 执行

将两个脚本放在远端同一目录。已推送的准确镜像 digest：

```sh
python3 -B system-backup-seal-isolated-probe.py \
  --context kubernetes-admin@kubernetes \
  --image '10.130.14.23:5000/backup-seal-probe@sha256:fbd2fe4a84256354a3a142cb42f64cefe458f137e3af528379bee89f47efdcd6' \
  --execute
```

保留完整 JSON 和退出码。外层 `passed=true`、`cleaned=true` 且退出 0 才是本轮成功；内层输出保存 namespace/PVC/PV/Pod/image/node 绑定与跨节点结果。外层 `production_accepted` 始终为 false。

退出路径使用 namespace UID precondition 删除本轮独占 namespace，再等待 namespace 及已绑定 PV 消失。Delete 策略交由存储 provisioner 回收实际卷，不直接递归删除主机路径。清理超时或身份不明会明确失败，并输出可追踪名称；不能把资源删除请求已提交视为已清理完成。

该结果只证明本轮临时卷和节点组合的 hardlink、chmod、fsync、跨 Pod flock 及 subPath 隔离行为。不能证明断电耐久性，不能替代真实 staging PVC、正式 controller/worker 镜像、原配置、工作区挂载组合的再次验收，也不能证明 MySQL 清理引用判定已在现场通过。后续正式部署仍按 `system-backup-d-seal-custody-operations-20261030.md` 执行。

## 本轮本地回执

独立编排 Python 5 项测试及原 PVC 探针 3 项测试通过。Linux/amd64 工具从上述固定提交编译成功；Docker Hub 超时后使用本地已存在的 `alpine@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b` 构建。

初版本地 Linux Docker 临时卷运行 `probe-init`、跨容器 `probe-hold`/`probe-worker`、`probe-verify`、`probe-clean` 全部退出 0，worker 报告 `cross_process_lock=true`、`worker_isolation=true`；临时容器和卷已删除。运行 ID 为 `sbk_ff132f15-8b81-41ab-afa4-62769748b5ac`。此为本地 Docker 结果，不是 Kubernetes/Longhorn 现场成功回执。

## 首轮现场失败与诊断修正

用户回传运行 `sbk_bac4fd17-7520-4b72-b21f-e1a8e5f4c28f`：跨节点 true，worker isolation/locking 阶段失败，退出 1；内外两层 cleaned=true。结构化摘要保存在 `docs/evidence/d-seal-capability-failed-20261030.json`。原脚本清理前没有保存 worker 状态和日志，无法据此判定是隔离、锁、等待超时或存储驱动问题。

诊断版保留原成功判定和安全上下文，仅增加 worker 失败步骤、容器状态/退出码、有界日志及 holder 输出。日志采集前后校验原 Pod UID。Go staging 全包 7.515s 通过，两个 Python 测试文件各 5 项通过；尚待诊断版现场复测，不能将初版失败改记为通过。
