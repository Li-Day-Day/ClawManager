# A：GC 运行入口与事务授权（2026-09-29）

`NewGCRuntime` 将独立 mTLS GC 身份、系统 `evidence_gc` 操作租约、证据 claim、S3 STS/精确版本删除和 C 提供的权威不存在证明接到同一授权实例。必须提供正式 SQLPolicy、Failure 持久化回调和 C verifier；构造时精确匹配 installation、store identity/version、root、issuer、audience。不提供默认权限、静态凭据或合成证明。

宿主通过 `AuthenticateRequest` 校验真实 mTLS 请求，再调用 `GC(ctx, ids)`。输入最多 100 个候选 ID，30 秒批次预算；ID 只是扫描提示，每条重新检查授权、owner 引用和保留。宿主负责建立/续租系统操作、调度与取消，claim 或 row version 变化后重新创建对应 runtime，并在关闭前排空请求。本入口不自行创建系统操作、注册后台 goroutine 或挂载 HTTP 路由。

原先 `SQLGCAuthority` 的配置锁和操作锁抽为共享内部函数，原 provider 授权顺序不变。新的私有 `gcRegistry` 把这些检查放入领取和结果提交事务：安装/配置 → owner/reference scope → 系统操作 → evidence/chunks。必须同时满足精确 operation type、target、actor、running 状态、claim、row version 和 deadline。不得仅通过 provider 授权就认为数据库变更也得到授权。

领取和结果均调用已有 lifecycle 的保留/Deletable 校验。审计和状态 CAS 共用事务，GC 审计补上工作身份摘要。提交前重新读取数据库时间，检查操作、工作身份和相关 evidence claim 是否仍有效；等待审计、策略或写入期间过期，会回滚本事务的审计、chunk 删除和引用清除。对象存储调用在事务外。已经删除的 tombstone 可以幂等返回，但仍须通过当前安装、owner 和系统操作授权。

运行入口拒绝登记新证据、PUT、读取正文和密钥操作，只允许现有 Stat/Delete/Absent 流程。DELETE 确认本身不足以删除数据库引用；必须有经过前后授权复查的 C 权威不存在证明。摘要不符不删除远端对象；无证明则保留引用并记录失败；结果事务撤权/失败时保留已有 deleting claim 和引用，供后续受权重试。GC 错误通过独立且整个批次共用的 3 秒 Failure 回调预算登记 `evidence_incomplete`，不输出原始 provider 错误。

本地验证使用实际 SQL scan/CAS/审计代码和本机 TLS STS/S3 客户端、独立 SigV4 校验。SQL transport、owner policy、Failure、provider 和 C verifier 均为测试替身，不证明实际 MySQL 并发或生产 ACL/不存在语义。覆盖精确版本删除、重复 tombstone、无证明、摘要不符、证明期间撤权、最终数据库事务前 operation 接管、claim/result 审计失败、审计后操作过期、chunk 清理失败及构造/context/关闭边界。

本轮验证完成：84 个主测试、607 个子测试通过（29.334 秒），vet 开启；Linux MySQL 探针和迁移工具编译通过，wrapper 退出 0。110 项源码摘要前后不变，隔离 cache/tmp/二进制已清理，并独立确认目录不存在。见 [机器记录](evidence/system-backup-a-evidence-gc-runtime-local-20260929.json) 和 [完整输出](evidence/system-backup-a-evidence-gc-runtime-local-20260929.txt)。命令：`pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`。本轮未安装依赖、未执行远程测试、未构建完整 server。

仍待 D 交付正式 tombstone 迁移、SQLPolicy/审计/Failure、GC operation/expiry scanner/worker 接入；C 交付真实权威不存在证明和 provider 准入；A/C/D 完成真实身份、权限、保留/引用并发、失败接管和清理验收。历史 store 路由、GC 健康/重试调度、系统 capability producer 和完整备份恢复链路仍未完成。此入口不等于生产 GC 已启用。
