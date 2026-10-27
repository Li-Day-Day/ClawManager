# A：只读恢复运行装配（2026-09-29）

`NewRecoveryRuntime` 将已有 `SQLWriteRecovery`、S3 STS 临时凭据交换和 HTTPS S3 Stat 客户端接在一起。恢复事务、扫描、STS 交换前后检查使用同一个授权实例。构造时校验 installation、store identity/version、root、issuer 和 audience 完全一致，必须提供 SQLPolicy、Failure 回调、固定客户端证书和投射 token 文件。

宿主通过 `AuthenticateRequest` 验证独立恢复工作身份的真实 mTLS 请求，再把返回的 context 传给 `Reconcile` 或 `ReconcileBatch`。其它授权实例产生的 context 不可代用。批次沿用最多 100 条、30 秒总预算和数值游标；每条恢复沿用 20 秒预算、逐条实时授权和事务内 claim/审计。批次结束后按 `More`/`AfterID` 继续，完成一轮后下一轮从零扫描。宿主负责调度、持久化 checkpoint、取消和排空后关闭。

恢复只对原登记路径做 HEAD，检查原密文摘要、长度和返回的不可变版本。它不接 KEK，也不提供 PUT、DELETE、正文 Range 或不存在证明。使用不嵌入完整 Store 的窄适配器，避免通过接口断言扩大能力。404 仍保留 `write_unknown` 并登记重试；摘要不符进入 `write_failed`。配置撤销或 claim 接管后不提交成功结果，不改变 owner 终态，也不重建密文。

测试使用本机 TLS STS/S3、独立 SigV4 检查和既有事务式 SQL transport fixture，执行真实恢复扫描、claim、CAS、审计和 HTTP 客户端代码。覆盖匹配对象、404、摘要错误、HEAD 后配置撤销、批次装配、构造映射和 mTLS/context 边界、关闭后拒绝执行。SQL transport、owner policy、Failure sink、OIDC 和对象服务均为测试替身，不是实际 MySQL 并发或 provider ACL 验收。

本轮验证完成：82 个主测试、586 个子测试通过（21.329 秒），vet 开启；Linux MySQL 探针和迁移工具编译通过，wrapper 退出 0。106 项源码摘要前后不变，隔离 cache/tmp/二进制已清理并独立确认目录不存在。见 [机器记录](evidence/system-backup-a-evidence-recovery-runtime-local-20260929.json) 和 [完整输出](evidence/system-backup-a-evidence-recovery-runtime-local-20260929.txt)。命令：`pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`。

首轮测试桩错误地要求 HEAD 查询参数为空，误拒绝 SigV4 预签名参数；修正为禁止 `versionId` 并继续独立校验签名后重跑通过。首轮失败记录与其源码摘要保留在 [初次记录](evidence/system-backup-a-evidence-recovery-runtime-initial-local-20260929.json)，临时产物已清理。生产实现未为通过此断言放宽授权。

仍需 D 提供正式 SQLPolicy、审计和 Failure 持久化、工作进程/调度及真实 mTLS 入口；A/C 对齐真实 OIDC/STS 角色、只读权限和 provider 现场验证。历史 store 映射、GC 运行事务装配、系统 capability producer 和完整备份恢复验收仍待完成。本变更没有启用生产部署或执行远程测试。
