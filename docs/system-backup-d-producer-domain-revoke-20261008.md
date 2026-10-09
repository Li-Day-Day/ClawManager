# D：producer 授权域紧急撤销事务

日期：2026-10-08。D 新增 [DomainRevoker](../backend/internal/systembackupproducer/domain_revoke.go)，只处理已存在 domain 的紧急撤销；不建立新 domain、不创建配置、grant 或命令收据。它要求独立受信管理授权、原 epoch/row version 和 redacted reason hash，不把调用者输入当作身份或签发证明。

事务先取得部署安装/配置锁前缀，再锁 domain，验证精确 CAS 期望和当前管理权限。intent audit 成功后以数据库 UTC 更新 `state=revoked`、`epoch+1`、`row_version+1`，在同一事务写 result audit 并执行最终权限复查。失败全部回滚；提交不明不返回成功 domain。旧 grant/run/evidence/历史记录不被批量改写，后续原 grant 因 domain epoch 不匹配而失效。紧急撤销不分配新 producer 命令收据，受信 audit 适配仍须证明有独立保留容量和真实撤权来源。

[本地用例](../backend/internal/systembackupproducer/domain_revoke_test.go) 2 个顶层、含子用例 14 项通过，覆盖成功 fence、旧 CAS 拒绝、权限/摘要/审计/最终复查/CAS 失败的回滚。Linux 测试二进制编译在 Windows `compile.exe` 进程异常 `0xc0000043` 处失败，脚本报告本轮缓存和二进制已清理；这不是断言失败，也不算 Linux 编译通过。

[隔离 MySQL 用例](../backend/internal/systembackupevidence/d_producer_mysql_test.go) 已新增 `domain_emergency_revoke`，用于检查真实 SQL 回滚、成功 fence、旧 epoch 拒绝与旧 grant 保留。它的 authority 是显式测试替身，不代表生产身份、审计容量或 A/C 签收。初始 24/24 回执不覆盖本次源码；后续远端通过记录见下。正式 producer migration 仍须 A/C 对 C1 的评审，当前 `approved_reviewers` 为空。

操作者首次运行新的本地冻结门禁时，测试、默认 vet、Linux MySQL probe 和 migration runner 编译均通过，构建缓存已清理；但 A 在运行期间新增 `system_historical_original.go` 及其测试，快照结束检测到 `live-drift-files=2`。包装脚本按预期输出 `STOPPED`，没有连接远程。该轮固定快照只证明其拷贝的旧源码，不能代替包含这两份新文件的重新冻结或 MySQL 验收；记录见 [快照](evidence/system-backup-a-producer-snapshot-20261008-091041-8d70942b.json)及[本地日志](evidence/a-d-producer-history-local-20261008-171021.txt)。

2026-10-09 操作者完成重新冻结与远程复测：[本地日志](evidence/a-d-producer-history-local-20261009-084850.txt)、[远程日志](evidence/a-d-producer-history-remote-20261009-084850.txt)和[远程快照](evidence/system-backup-a-producer-snapshot-20261009-010019-676e26d1.json)记录 867 个输入文件、最终漂移 0，本地测试/vet/Linux probe/migration runner 编译通过；远端 migration replay 通过，`TestDProducerMySQL` **26/26** 个子用例通过，包括 `domain_emergency_revoke`。本地与远端测试二进制摘要均为 `bb658b4a651acc088cb377278e67d4591baadd0e6a6a83c87011dfa4cfaf376b`，DDL 摘要为 `70d001e7cfc465f8098dc037fd932a6d76647629561e2e8be91decbdf75df016`。日志记录 26 次专属数据库清理，以及 namespace `sbk-mig-261009011457-693b`、UID `7ddf4ff3-242a-4542-bbe9-aa615bc272b7`、远端 scratch 和本地缓存清理；无 `CLEANUP_PENDING`。该验收关闭本次 D-only SQL 撤销检查，不扩大到生产管理身份、保留审计容量或 A/C C1 签收。
