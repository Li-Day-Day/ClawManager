# D 执行持久化与 Job 接线

本轮补充 `SQLExecutionRecords`、`DurableExecutionStore` 和 `ExecutionJobPorts`，并在 controller composition 中要求 Records/Jobs owner。它们是可调用实现，不代表生产 owner 已装配或真实链路通过。

## 计划与结果

迁移 082 新增 immutable `system_backup_execution_records`，按 installation/task/attempt/phase/kind 唯一。计划保存公共 task-plan 原 bytes，使用现有 staging CMSTG01 AEAD 格式加密；SQL 仅保存密文、精确原文 SHA 和 key reference。密钥由 A `ExecutionRecordKeys` 提供，返回副本由调用方清零。这里复用 staging 格式，不是 A 文件 custody 的落盘接口，也不是公共成品 envelope。

写入使用原 `SQLExecutionAuthority` 的 RR 事务与最终 guard 复查。同键同 digest 读回，不覆盖不同计划。commit 错误返回专用 unknown 错误，下一轮先查原记录。读回解密、认证并重新校验 task/config/profile/attempt 绑定；不查询当前配置重建计划。当前 read 接口仅支持 live forward authority，过期任务恢复仍须 scheduler 的独立 recovery authority。

`DurableExecutionStore` 在 Prepare 后先存计划再交 scheduler 推进阶段。Next 发现既有计划时直接交 scheduler 收敛，不再次 Prepare；Capture 从 SQL 读回计划。Capture 结果加密记录后才交 scheduler；已记录的结果先回放，不再次 Capture。错误原文不落库，结果只记录失败标记及部分观察，回放失败返回保守错误，scheduler 仍须用公共取消/失 fence 事实分类。这里的结果记录不是 C acceptance，不把 task 标成 succeeded。

## Kubernetes

`ExecutionJobPorts` 解包持久计划并调用 B `DescribePlan`，逐项匹配输入 intent 的 unit/name/namespace/generation/hash/原 bytes。通过真实 `kube.Runner.Ensure` 先建 immutable invocation ConfigMap，再建 Job；ConfigMap 保留原 invocation bytes。资源 intent、未知创建收敛和 UID 保护沿用 B runner。

`ExecutionJobOwner.Admit` 必须提供当前完整停写屏障、registry 校验和 SQL ResourceJournal；返回的 runner.CheckFence 必须在每次资源操作前复查同一权限。Bind 在取得真实 UID 后登记原 worker grant。Observe 联合 JobComplete 与认证 evidence；Stop 先以 recovery authority 读取原 UID、完成撤权，再执行 Cleanup，仍在删除时返回 pending。最后还必须由 Stopped 证明 worker/Pod 已停止，防止外部 orphan deletion 被误当成停止；全部成功前不能 Resume。

## 尚需交付与启用条件

- 生产 `systemBackupExecutionOwnerLink` 仍未赋值；实际 scheduler/claim 续约、阶段 CAS、公共 maintenance writer ports、ResourceJournal、恢复 inventory 仍须装配。新 bridge 没有用内存实现替代这些 owner。
- A 的真实 task-scoped key provider、worker grant/撤销及认证结果 reader；C 的 finalizer/catalog 最终事务。
- 082 的 registry/policy/cross-review、实际 MySQL 迁移与角色 grants 验证。迁移文件仅添加到仓库，未执行。
- 原实际 HTTP→SQL→K8s→worker→成品/终态联调尚未运行。没有安装依赖或触及现场资源。

## 验证

本地定向测试覆盖计划原 bytes/绑定、密文与错误密钥、同键冲突、未知提交读回、失 claim 回滚、失败结果回放、缺 owner 不领取，以及 Job authority/UID/撤权拒绝路径。SQL driver 与 owner 均为明确测试模型，不是实际 MySQL 或 A 授权证明。正向 Kubernetes 资源行为沿用 B runner，但本轮尚无真实集群创建验收。

最终源码的离线定向测试退出 0：`go test -mod=readonly -p=2 -count=1 -timeout=2m -run 'Test(ExecutionRecords|ExecutionJobs|TaskExecutionLoop|TaskExecutionProduction)' ./internal/systembackupcontroller ./cmd/system-backup-controller`。两包分别 4.269s / 5.829s；使用 GOTOOLCHAIN=local、GOPROXY=off、GOSUMDB=off。未安装依赖；本轮专用 cache/tmp/测试日志目录在验证结束后清理。
