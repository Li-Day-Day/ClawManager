# D 不依赖 B/C 的四项交付

【2026-10-26 当前入口】准确 GC 实现、23项冻结原生验证、演练 tagged 修复及 A owner 本地最终签收已完成，原测试/构建产物已清理；修复后实际演练十九项由另一路限定接收。阶段来源为原2099，随后新增的 bootstrap candidate 消费代码仍须完成接线、测试和独立复核。准确边界见 [10月26日本地收尾](system-backup-d-local-closeout-20261026.md)。以下原轮次记录保持历史含义。

【readback 已接收】[最新协调](evidence/d-readback-coordination-20261023.json)与[十二项实际接收](evidence/d-resources-readback-actual-accepted-20261023.json)已覆盖原隔离 readback 及同源 843 条补证，`remote_rerun_required=false`。下文“默认十二项待远测”仅保留旧轮历史含义，不再作为新操作要求。当前四接收器的 157 项准确版本证明见 `evidence/d-readiness-receivers-8ebd755ee44f4c4caa08f2ec05b0047a.json`；旧 153 项是历史来源。

【后续本地收尾】用户要求“做除了远测的部分”，当前实现、GC 装配提案及新同版本验证入口见[本地收尾](system-backup-d-local-closeout-20261023.md)。GC 私有验证已纳入 A typed nil 回归，工作阶段拆分另有完整包验证；下文两文件/旧 seed 数及测试计数只描述各自历史来源。现有 `-WriterFKOnly` 为单独真实 FK 专项，不能与原无 FK 的 readback/writer 结果混用，实际运行均留待远测。

本次范围是四项 D 开发和验证准备：真实 MySQL 专项、五表组合验证、GC freeze 私有协议候选、前端实际浏览器验收。原九表完整业务恢复、完整 GC、B/C 生产适配和原六项整体验收仍单独保持未完成。

## 1. 九表存储与五表转换的 MySQL 专项

入口为 `scripts/system-backup-d-resources-mysql-validation.ps1`，不带参数只运行本地准备。使用现有依赖、禁止下载、冻结来源，执行完整 resources 包及 tagged seed、编译 Linux 探针和本轮 embedded migration runner；保留逐步骤原生日志、来源、二进制摘要和准确清理回执。

操作者在仓库根目录执行新专项：

```powershell
& .\scripts\system-backup-d-resources-mysql-validation.ps1 -Remote
```

默认使用既有交接目标 `root@10.130.14.23`，可用 `-SshTarget` 指定已批准的测试入口。脚本先重新完成本地准备，再调用既有 fresh-migration 隔离框架；固定已有测试镜像及其 digest，不拉取镜像。它按 namespace 原 UID 核对、重放准确迁移、传输同轮探针/输入，再清理 run-owned 数据库、临时账号、namespace、远端 scratch 和本地产物。不在聊天或证据文件中收集密码/DSN。保留原始输出，不用仅保留末几行的管道替代完整回执。

并行交付后来增加了事务 writer 候选及 `-WriterOnly` 独立九项模式。本次命令不带该开关，仍只派发默认十二项 readback。两模式的本地完整包/两份 seed/同一 Linux 探针和迁移编译路径相同；最终复核会核对该分支边界。新候选使完整当前包集合发生变化，原 65/750 及旧单 seed 回执只保留历史范围，不能自动覆盖新文件或脚本。writer 的业务授权及真实事务资格不由本次交付批准。

十二个实际用例：

1. 五表 normalizer 结果加四张显式扫描存储夹具，完成九表逐字段 SQL 读回。
2. SQL NULL 与空串不相等。
3. DECIMAL 精确 scale 与 DATETIME(6) 微秒。
4. 新建 SELECT-only 账号的 UPDATE 返回 1142。
5. 有写权限账号在只读事务中的 UPDATE 返回 1792。
6. 九表合计行预算超限不返回部分结果。
7. 合计字段字节预算超限不返回部分结果。
8. 独立写连接提交变化，原 RR 快照不变，新快照拒绝旧预期。
9. 非显式 UTC 会话拒绝。
10. 完整列集发生变化时拒绝。
11. 九张完整空表可比较，不补默认业务行。
12. 合法控制行使只读验收拒绝，且确认已到达控制表检查。

只有 `TestDResourcesReadbackMySQL` 的十二个子项及根通过、`PASS d-resources-readback-mysql cases=12`、最终无错误及全部准确清理齐全，才接收这项实际专项。旧历史详情 16 项及 GC 前置/生命周期 42 项无需重跑。

范围限制：九表及 35 控制表以完整迁移后的表执行 CREATE TABLE LIKE，保留实际列/索引/check，但不复制 FK。测试 registry 和业务 proof 明确为合成夹具；四张扫描表仅验证存储类型，未实现或认证 C 规则。测试不证明 FK 恢复、完整 schema/DDL freeze、写凭据销毁、业务归一化合法性、真实启动门禁或生产恢复。

## 2. 五表组合候选

`backend/internal/systembackupresources/restore_five.go` 组合双审计、egress、image、northbound 五表；使用一个总输入/输出预算，并检查同一 typed source identity 在所有表中映射到同一目标，不合并不同来源身份。任一阶段失败不交付部分候选。

输出保留受保护的历史审计关联、源 audit cutoff、源北向版本与目标观察版本。五表以稳定表名顺序交付；不为 C 的四张扫描表填默认值，不分配实际 ID、不执行 SQL/CAS、不启用服务。组合回归把真实候选输出送入 SQL reader/readback 比较，并逐列变异五表输出；实际落库行为由上面的新 MySQL 专项验证。

## 3. GC freeze 私有候选及 A/D 评审边界

`backend/internal/systembackupevidence/download_retention_gc_freeze.go` 新建私有、单连接、禁止 idle 复用的池，校验 server/database/account/role/UTC 和准确 connection ID。受限原 context、1..5 秒锁等待、锁前/后 admission、准确本会话 BACKUP LOCK 观察，均在工作事务之前。工作使用唯一 RR 事务，提交前复查自己的锁。

事务已知结束后，在同一连接显式 UNLOCK 并查询自己的 ticket 已为零；提交、回滚、获取、解锁、取消或释放观察不确定分别如实失败。每条路径请求物理 discard；不把 Conn.Close、ErrTxDone 或丢失回复解释成服务器已释放，也不在新连接上补解锁或自动重试提交。会话设置和临时表不依靠共享池重用或 reset 清理。

标准库单独候选测试与 Linux 编译入口：

```powershell
& .\scripts\system-backup-d-gc-freeze-candidate-validation.ps1
```

A 并行新增 `download_retention_gc_freeze_a_test.go`，证明原 guard 对 map/slice/func/chan 四种 typed nil 未在连接前拒绝，并已修复该一行。其旧四失败和新完整 4 根/33 条通过由 `a-gc-freeze-nil-reviewed-20261023.json` 独立保留；D 不回退这处修正，当前候选另行完成标准库测试/Linux 编译。协议评审请求由 `scripts/system-backup-d-gc-freeze-review-request.mjs --write` 绑定当前来源生成，随后 `--check` 复核；它只是本地交接文件，没有向其他聊天发送消息或写入正式批准。

该回执只覆盖两个私有协议文件，不是整个 evidence 包或实际 MySQL/完整 Collect。Admit/Work 是受信接线缝隙，未提供生产授权实现；锁前检查不认证最终 schema，完整 metadata/schema/引用、worker/时钟/fence/容量和原有末次守卫必须在受保护的实际工作中完成。

A/D 后续评审需要回答：新增 BACKUP_ADMIN 和精确观察权限、全局锁与既有 L0/L1/L2/L3 前缀顺序、工作及清理预算、取消后的独立观察、完整 Collect 晚失败回滚与接管。此候选未接入 Collect，没有修改原 Early 权限白名单，没有批准账号/全局权限或生产启用。

## 4. 前端代码、构建与浏览器

`frontend/backups-ui-lab.html` 使用正式 BackupLiveWorkspace、详情和下载 React 组件；loopback Vite 中间件只返回固定合成 HTTP，不代理业务后端。下载传输为合成 Blob；不认证真实 MFA、provider 或端到端下载。

可重复验证入口：

```powershell
& .\scripts\system-backup-d-backups-ui-validation.ps1
# 完成本地验证后保留本机服务供交互，Ctrl+C 清理本轮服务和产物：
& .\scripts\system-backup-d-backups-ui-validation.ps1 -Serve
```

本地已通过 10 个既有 Node 测试文件共 286 项、完整应用 TypeScript、验收 Vite 配置严格类型检查、正式前端 Vite build。初轮 node --test 子进程 EPERM 保持失败回执；新轮由 PowerShell 逐文件直接启动 Node，保留全部原断言，没有跳过或降级断言。构建的 chunk size 警告仍保留，没有改变告警阈值。

实际浏览器记录在 `docs/evidence/d-backups-ui-browser-20261023.json`，截图在同名前缀 JPG。观察覆盖四类详情、过期预检、events 未就绪、总览 503 下独立列表、权限错误、迟到详情取消、旧版本/跨安装/不完整详情拒绝、原轮询收到撤权后清除旧记录，以及下载就绪、会话改变阻止保存、权限错误和卸载取消。样式查找已改用配置文件相对的绝对源码路径，仓库根目录启动也能生成正确样式。

本轮浏览器标签与服务已关闭，测试端口重新可绑定，手工目录的 39 份产物已删除；独立本地验证目录和正式 build 产物也已删除。来源/测试日志/截图作为交付证据保留，未安装依赖。

## 远测结果接收

用户执行远测期间，新增接收器 `docs/evidence/d-resources-mysql-actual-review-20261023.mjs`；它位于远测源码枚举排除的 evidence 目录，不修改后端、contracts 或远测脚本，不连接服务器。

远测完成后，明确指定本轮结果 JSON，避免从多个同时运行的 readback/writer 轮次中自动挑选。默认读取同前缀 `.txt`；若 PowerShell transcript 没有记录完整原生输出，可用 `--transcript <本轮完整控制台日志.txt>` 指定保留的原始日志，缺失证据时保持拒绝。可选 `--out docs/evidence/<新文件名>.json` 仅在校验成功后创建新的限定评审回执，不覆盖旧文件。

```powershell
node docs/evidence/d-resources-mysql-actual-review-20261023.mjs docs/evidence/d-resources-mysql-<本轮时间>-<本轮标识>.json
node docs/evidence/d-resources-mysql-actual-review-20261023.test.mjs
```

校验包括四个原生本地步骤、678 条历史用例保留、两个 seed、准确 12 个真实 readback 子用例、根测试及原生 PASS、迁移文件列表和 catalog、同轮二进制与输入 SHA、数据库/账号清理、同 namespace/UID 清理、远端 scratch 清理和本地 owner 实际缺席。关键源码有漂移时拒绝；其他冻结输入变化单独列出，不把旧回执宣称为当前全树通过。接收器只核对日志中的远端清理，不独立查询集群。

本地 57 项接收器测试通过，覆盖缺例、重复、跳过、失败、JSON 包装的伪原生 PASS、轮次指纹混用、部分迁移、清理缺失/身份不符、日志篡改及文件级组合校验。输入为明确合成日志，未发布真实 MySQL 通过回执，未替代 C 的扫描语义、外键、DDL freeze、完整恢复或生产批准。测试临时文件已清理，没有安装依赖或生成构建产物；验证证据见 `docs/evidence/d-resources-mysql-actual-receiver-validation-20261023.json`。

## 汇总复核

`scripts/system-backup-d-independent-work-review.mjs --write` 从实际原生日志、当前对应源码、保留旧用例、二进制/输入摘要、浏览器观察和准确 owner 缺席重新生成限定回执。随后 `--check` 核对发布结果。汇总不替代 A/B/C 交叉签收，也不把本地准备记为真实 SQL 已运行。

最新四项复核见 `docs/evidence/d-independent-work-reviewed-20261023.json`。B/C 仍未交付时，这四项限定准备可交接；完整业务恢复/GC 和原六项继续等待原始依赖。
