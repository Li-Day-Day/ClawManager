# D：producer 授权域开通与轮转

日期：2026-10-09。D 新增 [DomainOpener](../backend/internal/systembackupproducer/domain_open.go)。请求只携带作用域、操作、期望 epoch/row version 和部署摘要；签发身份、部署准入、权限有效期和容量报告必须由受信适配提供。`provision` 要求域不存在并以 0/0 为期望值，插入 open 域的 epoch/version 1/1；`rotate` 对已存在域做精确 CAS，epoch/version 各加一。已撤销域只能通过新的受信准入轮转重新打开。两种操作均不得隐式建立安装、配置、grant 或命令收据。

事务先执行安装/配置锁前缀，再锁域和验证受信准入；容量预留、intent audit、数据库 UTC 写入、result audit 与最终复查在同一事务内完成。任何错误回滚，提交结果不明时不返回成功域。锁前缀、身份/撤权、部署准入和容量的生产适配仍待 A/C 接口与评审，不在 D 的测试替身中推导。

[本地单元测试](../backend/internal/systembackupproducer/domain_open_test.go) 覆盖开通、正常轮转、已撤销域轮转、旧 CAS 重放和各失败阶段的回滚。`system-backup-d-producer-validation.ps1 -TestPattern 'TestDomainOpen|TestHistoricalCommandReceipt'` 合计 4 个顶层、含子测试 26 项通过（包括独立命令历史收据读取）；默认 vet 与 Linux 测试二进制编译通过，测试构建缓存已清理，未连接真实 MySQL。

[隔离 MySQL 测试](../backend/internal/systembackupevidence/d_producer_mysql_test.go) 新增 `domain_provision_and_rotate` 和 `independent_command_receipt_closed_domain`。前者检查真实 SQL 的审计失败回滚、开通、轮转及旧 CAS；后者检查关闭域后原命令收据仍可经独立当前管理授权读取，且不会修改旧记录。[2026-10-09 后续远端日志](evidence/a-d-producer-history-remote-20261009-100227.txt)逐项记录两项 PASS，整个 `TestDProducerMySQL` PASS，二进制摘要为 `f16f311e2c1c96c2ed703cca1aa97c48bd90333fd546b18732f5d0c0af59689d`、DDL 摘要为 `70d001e7cfc465f8098dc037fd932a6d76647629561e2e8be91decbdf75df016`，namespace 与临时缓存均报告清理。早先 26/26 回执仍保持其原始范围；本回执不覆盖后来新增的历史恢复接口。

正式 producer migration 仍须 A/C 对 C1 的评审；当前 `approved_reviewers` 为空。
