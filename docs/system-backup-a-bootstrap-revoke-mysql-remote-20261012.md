# A 首位恢复管理者与离线撤权：增量 MySQL 远测记录

日期：2026-10-12。用户选择在 A 全部计划收口前，先运行 `ABootstrap`、`ARevoke` 两个未做过真实 MySQL 验证的 profile；已接收的 `ARead` 没有重跑。

## 证据来源

- 用户粘贴的两项完整终端输出已按原文保存为 [本轮输出](evidence/a-bootstrap-revoke-remote-user-paste-20261012.txt)，SHA-256 `4f8e0ee3eea4cbff0e0fa70d24f10b1f3a45a7a03fc2c802b1f950db8b600f74`。
- 仓库落盘的 [PowerShell transcript](evidence/a-bootstrap-revoke-remote-20261012-152634.txt)只包含 `ABootstrap`，未覆盖随后执行的 `ARevoke`。因此 `ARevoke` 的接收依据是用户粘贴的终端输出，不能称为独立落盘 transcript。
- [首次失败 transcript](evidence/a-bootstrap-revoke-remote-20261012-134721.txt)显示 Windows Go `compile.exe 0xc0000043` 后，Linux 探针编译期间临时 `$WORK` 路径消失；脚本在 `mysql-probe-build` 停止，未启动远端。该次不计入通过结果。

## 核对结果

| Profile | namespace / UID | 真实 MySQL 测试 | 指纹和清理 |
| --- | --- | --- | --- |
| `ABootstrap` | `sbk-mig-261012073839-3121` / `72c392b5-09b1-4000-85ce-20fff877e57b` | `TestRecoveryManagerBootstrapMySQL` 和 `PASS a-recovery-manager-bootstrap-mysql` | 探针 `b5f0d2822c6aa0e426243dd914733a1bd48dc4aceec6f1b90c1b69f1120d0355`；DDL `2474fbc894ada0607ec88e5a2a0d9056a249798d8e07e48d76f7e090aaec0f82`；专属数据库、准确 namespace/UID、远端 scratch、本地 cache 均有 `CLEANED`。 |
| `ARevoke` | `sbk-mig-261012075004-30ff` / `f51d83b1-fcee-4955-8c81-fc4a42571357` | `TestRecoveryManagerRevocationMySQL` 和 `PASS a-recovery-manager-revocation-mysql` | 同轮探针和 DDL 摘要与上项相同；专属数据库、准确 namespace/UID、远端 scratch、本地 cache 均有 `CLEANED`。 |

两轮均输出 MySQL 8.4.8、`migration_count=94`、`result=PASS`、`PASS pinned-migration-runner`、`PASS fresh-migration-replay=001..080 applied=94`；迁移工具摘要 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。粘贴输出中无 `CLEANUP_PENDING`、测试 `FAIL` 或外层抛错，末尾回到 PowerShell 提示符。原命令没有另印显式 `REMOTE_EXIT=0` 标记，因此只能按上述正向结果与无抛错判断该批顺序运行成功。

这只限定接收两个 A 候选的隔离 MySQL 行为。正式编号 migration、可信离线授权文件/管理证书来源、独立 journal 持久化与容量、B/C/D 生产接线和完整恢复验收仍需完成；成功的这两个 profile 无需重复运行。
