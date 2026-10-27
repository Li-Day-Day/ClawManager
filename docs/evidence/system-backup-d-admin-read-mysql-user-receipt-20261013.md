# D 真实读路隔离 MySQL 回执（用户提供）

2026-10-13 收到操作者粘贴的 `scripts/system-backup-a-evidence-validation.ps1 -AdminReadOnly -Remote` 输出。以下为回执中的验收字段；此记录是用户提供的终端输出摘录，未独立连接远端复查，也没有完整 transcript 文件或显式的最终进程退出码。

| 项目 | 回执 |
| --- | --- |
| 隔离运行 | `namespace=sbk-mig-261013004934-3542`，`uid=1f4be457-683e-405a-abf8-771406ad1bec` |
| MySQL | `8.4.8`；镜像 `10.130.14.23:5000/mysql@sha256:5ea882b1859d3a61814e527215563d809a9f2bf70ffa24c9280f2ff6798f1977` |
| bundle | `bundle.tar: OK` |
| 迁移 | `result=PASS`，`migration_count=94`，`fresh-migration-replay=001..080 applied=94 exact_filenames=yes d_columns=blob/blob/blob/char` |
| A 授权 | `--- PASS: TestAAdminReadAuthorityMySQL (0.32s)`；`CLEANED admin-read run-owned database` |
| D 全 schema | `--- PASS: TestDAdminReadFullSchemaMySQL (0.48s)`；测试日志报告 `PASS full 066/067/080 schema, real rows, pagination, cross-install cursor, revocation lock` |
| 远端门禁 | `PASS a-admin-read-mysql` |
| 清理 | `CLEANED namespace=sbk-mig-261013004934-3542 uid=1f4be457-683e-405a-abf8-771406ad1bec`；`CLEANED remote-registration-scratch=yes`；`CLEANED local-registration-build-cache=True` |

本轮探针 `binary_sha256=11a7a55ece089fb29f0ce40375f3ed3b299d78c62966c7e607ddb69343aeec70`；专用 DDL `ddl_sha256=1a6abd1c8d01155184b8fa8c7cc8d6527201ed157cba1f80b4ccefc6218483f2`；迁移工具 `migration_binary_sha256=70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`；catalog `migration_catalog_sha256=0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。回执的本地、远端探针摘要和迁移工具摘要一致；本地按脚本相同的 CRLF→LF 规则重算 DDL 摘要，与回执一致。

本地编译阶段一次 `vet.exe` 退出 `0xc0000043`，脚本报告重试同一命令，随后报告本地测试与 Linux 探针编译通过。远端 SSH 密码提示附近出现 Windows `close - IO is still pending on closed socket` 文本；其后 bundle 校验、两项 MySQL 测试、最终门禁及清理均继续输出通过。回执没有 `CLEANUP_PENDING`。

开头的 `VALIDATION_SCOPE admin-read-authority-only=yes full-task-query=no real_mysql=not_run` 和 `LOCAL_PASS ... real_mysql=not_run` 属于远程执行前的本地阶段；随后独立命名空间中出现 D 全 schema MySQL 测试通过，不能用开头标记否定后续远端结果。

**判定：** D 的真实完整 schema、真实行与 A 事务授权协同的 MySQL 专项功能测试通过。贴出的内容没有 `A_ADMIN_READ_REMOTE_EXIT=0` 或等价的进程退出码，因此按 [A 的正式远端证据门禁](../system-backup-a-admin-read-scope-20261012.md)仍缺这一项；不把这份摘录记作完整 A 远端证据闭环。该专项也没有执行真实 HTTP 请求、`EXPLAIN ANALYZE` 或读写成本测量，不能据此宣称页面端到端或索引方案验收完成。
