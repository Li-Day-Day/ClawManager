# D：独立存储能力验收（不启用生产备份）

现场只读输出确认：`clawmanager-app` 使用 `backup-test-zh-fix18`，不存在 `/usr/local/bin/system-backup-seal-custody` 和 `/usr/local/bin/system-backup-v2-controller`；当前 Deployment 没有 `SYSTEM_BACKUP_*` 配置或 staging 挂载。不能在该 App 上直接执行生产 seal 探针。此记录不推断镜像是否包含其他备份实现。

`scripts/system-backup-seal-isolated-probe.py` 复用正式 PVC 探针，但只创建随机 `seal-capability-*` namespace、独立 ServiceAccount、两个 1Gi RWX PVC 及临时 Pod。默认打印方案，`--execute` 才执行。默认存储类 `longhorn-rwx`，controller 在 `k8s-master`，worker 在 `node1`；要求两个不同 Linux/amd64 节点、Immediate 绑定及 Delete 回收策略。无业务卷、业务凭据、数据库连接或生产 Deployment 修改。

工具镜像的 Go 二进制来自精确提交 `e1baddbad220174cbf5660754b1f8852b6b703a1`，不是持续变化的工作区。镜像用 `deployments/backup-seal-probe.Dockerfile` 构建，只包含 Alpine 和维护 CLI。此镜像有 shell，专用于验收，不是正式 worker 镜像。

## 执行

将两个脚本放在远端同一目录。镜像必须使用构建推送后得到的准确 digest：

```sh
python3 -B system-backup-seal-isolated-probe.py \
  --context kubernetes-admin@kubernetes \
  --image '10.130.14.23:5000/backup-seal-probe@sha256:<实际推送摘要>' \
  --execute
```

保留完整 JSON 和退出码。外层 `passed=true`、`cleaned=true` 且退出 0 才是本轮成功；内层输出保存 namespace/PVC/PV/Pod/image/node 绑定与跨节点结果。外层 `production_accepted` 始终为 false。

退出路径使用 namespace UID precondition 删除本轮独占 namespace，再等待 namespace 及已绑定 PV 消失。Delete 策略交由存储 provisioner 回收实际卷，不直接递归删除主机路径。清理超时或身份不明会明确失败，并输出可追踪名称；不能把资源删除请求已提交视为已清理完成。

该结果只证明本轮临时卷和节点组合的 hardlink、chmod、fsync、跨 Pod flock 及 subPath 隔离行为。不能证明断电耐久性，不能替代真实 staging PVC、正式 controller/worker 镜像、原配置、工作区挂载组合的再次验收，也不能证明 MySQL 清理引用判定已在现场通过。后续正式部署仍按 `system-backup-d-seal-custody-operations-20261030.md` 执行。
