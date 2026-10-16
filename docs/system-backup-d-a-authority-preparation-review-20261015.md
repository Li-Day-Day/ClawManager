# D 对 A 维护授权 MySQL 本地准备的独立接收

A 的[本地准备回执](evidence/a-maintenance-authority-mysql-local-review-20261015.json)现已交付。D 重新读取原始日志及冻结清单，接收范围为本地准备，不接收八项实际 MySQL 或生产认证。[D r38 回执](evidence/system-backup-d-a-authority-preparation-review-20261015-r38.json)、[来源复算](evidence/system-backup-d-a-authority-preparation-check-20261015-r38.json)及[终态核对](evidence/system-backup-d-a-authority-terminal-check-20261015-r38.json)记录本轮独立结果；未重跑构建或远测。

清单的 1,265 个文件逐项 SHA/大小与当前输入一致，文件集合没有增减，逻辑 SHA 为 `35214503498b44f472823f2340e8f8dbcf6e18f9d0c1d0e71ca69d86a3ae5d09`。原日志、清单和 shell 语法日志的 SHA 均与 A 回执一致。原写入合同、维护摘要合同及正式 066 的原字节匹配；D r35 的前置错绑日志修正也已进入这次 tagged 编译输入。

从原日志分别复算四段 Go PASS：完整 security 为 230 主测试/1,525 子测试；三个 seed 在 checkout、空 CWD executable 和实际胶囊下各为 3 主测试/22 子测试。这些 seed 是重复覆盖，不累加成不同 SQL 场景。原日志终态为 `a_maintenance_authority_mysql_local_exit=0`，没有 FAIL/panic 标记；默认 vet 和冻结后检查标记存在。D 未独立重新执行这些测试。

Linux probe 为 `aec66bf5d43e5bce2bbf946ba9d3ba2084476fdbfa765c0f4bb77b198b5d8860`，实际 inputs 为 `4480d7e0f017f87ba22c38a76c89212f922f6b408149f2dfd3b8967a544fd3a3`，migration runner 为 `7b3689676deceb159de2ed0ee5181c28fe03f6361b9db9f825de841911fd54c6`。此前 sandbox 内 Git Bash signal-pipe 失败保留；后续仅 `bash -n` 通过的独立日志已核对，不能视为脚本体或远端执行。外层源码目录、内层构建目录及日志中的 67 个 fixture 路径共 69 项，当前全部不存在。

当前探针确实把具体 `pinnedConfigMaintenanceAuthority` 接到私有 apply/observe。错绑 grant 必须在 archive/capacity 前拒绝；另外六个负场景要求先看到同事务 canonical/双审计/收据，再验证最终回滚。独立观察另行验证写拒绝后用不同 observation grant 读取原字节且不重复预留容量。grant/source/capacity 的到期测试使用数据库 UTC 截止观察，capacity 内层延长截止不能续期。完整 installation_state 必须不变。这是对被编译源码的复核，实际八个叶子执行数仍为 0；实际身份、归档、schema/ledger 和物理容量来源仍是 synthetic。

## 16:33 服务远测的准确终态

[操作者原日志](evidence/d-canonical-backfill-remote-20261015163349.txt)已在北京时间 17:23:39 以“管道已被停止”结束，原因无法由现有证据确定。D 独立核对了日志/清单 SHA、1,261 项冻结清单逻辑 SHA、终止文字与结束时间。没有 `TestDConfigCanonicalBackfillMySQL` 启动、namespace 身份、服务 phase PASS 或远端清理标记。因此它既不是七项 SQL 断言失败，也不是成功回执；不能继续描述为日志尚未结束或确认进程仍在运行。

其外层/内层临时目录及 67 个日志 fixture 共 69 项当前不存在。按原 harness 的随机 ID 只能推导候选远端目录 `/tmp/clawmanager-a-evidence-f2dd505dc118443f93ae8b601f91a8a1`；没有远端查询，无法证明该目录是否曾建立、当前是否存在，也没有远端最终退出/清理证据。终止本地管道不能替代这些证明。本轮没有 SSH、重启或删除其他任务目录。

七项私有服务与八项具体授权组合层仍各需完整同轮远测及精确清理证据，不能互相替代；[A 八项操作者入口](system-backup-a-maintenance-authority-mysql-handoff-20261015.md)与 [D 七项服务入口](system-backup-d-config-maintenance-receipt-review-20261015.md)保留各自范围。已接收的 writer、纯收据存储、分组索引和业务十五表无需重复。正式迁移、真实授权/旧 canonical 原文、生产适配及六项整体目标仍未完成。前端保持 r37 待用户构建截图，本轮没有依赖安装或测试构建产物。
