# D 分组索引对照与下一轮验收

日期：2026-10-14。承接 [v2-r2 联合验收](system-backup-d-admin-read-index-v2-r2-remote-20261014.md)：九条一起加入时 MAX(id) 有收益，但分页与写入并无普遍改善。本轮将归因范围拆为三组，并准备两轮反向次序的独立隔离测量。远程阶段由操作者执行；当前不分配 migration 或批准生产索引。

【最终本地验收已通过】[完整本地回执](evidence/system-backup-d-index-group-final-local-20261014.json)接收同一 session 53443 的终态：2026-10-14 16:09:27（北京时间）结束，退出 0，A/D/HTTP Windows 测试、两种 tagged seed、默认 vet 和 Linux 探针/迁移 CLI 编译通过。79 项报告/完成回执检查、8 项派发及缓存归属/成功失败清理检查已分别通过。helper 报告清理后另查准确 `.tmp-a-evidence-50adccc934c44779b9e81f0c10f5f0f9` 目录不存在，未保留测试构建产物；没有安装依赖或运行远程动作。下方 pending/进度段保持其历史范围，不再重启或等待该 session。新的分组真实 MySQL 尚待操作者执行。

新的分组索引 Linux 探针 SHA-256 为 `8f45b751582221e187c7a847725da323a279902cda4a89b93193543be8cf9c2c`；A/D full-schema、HTTP 和 migration runner 与 v2-r2 的对应摘要相同。新探针没有远程执行回执，不能用旧 v2-r2 或本地编译替代其分组验收。

## 候选与对照

| 分组 | 从同一受审九条 DDL 选择的内容 | 索引数 |
| --- | --- | ---: |
| page | 五表 `(origin_installation_id,id)` | 5 |
| status | 四张任务表 `(origin_installation_id,status,id)`；operations 不改变 | 4 |
| all | 完整九条 | 9 |

Go 探针先验证输入 DDL 的固定摘要和完整九条结构，再从闭集生成 page/status 子集。每份 scope 登记实际分组、实际执行 SQL 和其 SHA-256；汇总器独立核对表、名称、列顺序及实际摘要。未知分组、多余 SQL、缺字段或伪造子集均拒绝；生产查询不使用 FORCE INDEX。

第一轮为 page→status→all，第二轮为 all→status→page。每项重新生成准确探针、重放 94 个正式迁移、创建独立 namespace/随机测量库，分别完成无候选索引的 before 与本组 after。六项复用本轮新建、带 ownership marker 的私有 Go 编译缓存；成功或失败都在外层 finally 清理，不使用其他会话或全局缓存。每项二进制和临时目录仍独立清理，汇总要求二进制一致。两段无 DDL 写流基线、DDL 重叠子集、171 对完整行结果一致性、A 授权/full-schema/HTTP、输入摘要及清理要求沿用严格档位。status 分组的 operations 不加索引，是本组观察对照，不作为状态索引收益。

每项五表各 12,000 行，保持 20%/70%/10% 安装分布、pending/failed 及非单调时间列。LIKE 仍不复制 FK，仍是合成、热缓存、单条并发写流；反向两轮不会消除宿主负载、缓存或独立实例差异。跨轮只核对 schema、分布、SQL/参数/返回数量和 binary/catalog 指纹；含动态时间列的完整结果摘要只在各自 before/after 内比较。

## 本地验证

不带 `-Remote` 只运行一次共享 A/D/HTTP 测试、带标签的 seed/vet 和 Linux 探针/迁移 CLI 编译；seed 覆盖三组基数、状态组不改 operations、任意 SQL/列顺序/名称漂移与未知分组拒绝。结束清理专用缓存和二进制，不安装依赖。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-d-index-group-validation.ps1 -BuildParallelism 1
```

本轮 [本地进度记录](evidence/system-backup-d-index-group-local-progress-20261014.json)已核对报告测试 64/64、派发 8 项、共享缓存输入/归属拒绝与夹具清理、PowerShell 语法和正反序计划。A 读授权、D 读取包、带标签索引 seed 和 HTTP Windows 测试通过；security tagged seed/Linux 探针及迁移 CLI 编译还在同一 session 53443 执行，尚无最终本地 PASS/缓存清理，不重启该运行。[Go 原始输出](evidence/system-backup-d-index-group-local-20261014.txt)在运行中仍会增长。早先脚本 r2 检查因动态 scriptblock 缺少源目录失败，固定测试显式提供源目录后 [r3](evidence/system-backup-d-index-group-script-local-20261014-r3.txt)通过，原失败记录保留。

本机 Git Bash 因信号管道 Win32 error 5 无法启动，未把本地 Bash 语法记作通过；索引远测入口已加入针对实际上传 smoke/provider-registration/migration 脚本的 `bash -n` 前置检查。最终本地编译/清理结果须补新机器回执；编译不是远程 MySQL 通过。

进度记录之后，同一 session 的 `TestAAdminReadMySQLSeed` 已 PASS 并输出 `LOCAL_PASS admin-read-seed=yes real_mysql=not_run`；现在继续 Linux 编译。上方 JSON 保留其记录时快照。

后续验收入口增量：[新版报告检查](evidence/system-backup-d-index-group-node-local-20261014-r2.txt)为 79/79；逐轮入口已改用完整 group-run 检查，A/D/HTTP 的实际 PASS 行及指纹不完整时在下一轮开始前停止，拒绝仅打印命令与重复 PASS。新增完成回执校验器从固定六份原文重新计算全部测量，核对报告/原文摘要、退出码、清理状态和当前工作区的准确缓存目录不存在；不能通过只改 ratio 再重写报告 hash 蒙混通过。[脚本 r5](evidence/system-backup-d-index-group-script-local-20261014-r5.txt)覆盖实际外层 finally 的成功/失败清理，失败仍向上传递，夹具产物均删除。这里没有运行新远程测试，也未重启同一 Go 编译进程。

## 操作者完整远测命令

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-d-index-group-validation.ps1 -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
```

入口自动创建新的 `docs/evidence/d-index-groups-*` 目录，保存 `r1-page.txt`、`r1-status.txt`、`r1-all.txt`、`r2-all.txt`、`r2-status.txt`、`r2-page.txt`。每项先通过严格单项回执检查才继续；任一失败停止后续，不覆盖旧回执、不自动重试远程动作。六项完整后生成 `report.json`，同时输出 `PASS grouped-index-report runs=6 production_approval=no` 和 `PASS grouped-index-remote rounds=2 runs=6 ...`。缺项、次序错、重复 run/UID/测量库、A/HTTP 缺 PASS、任何 binary/schema/distribution 漂移或清理不明均拒绝。

六项各自会提示远程认证；这是六个独立隔离环境，运行时间长于一次 v2-r2，首项之后复用私有编译缓存以减少重复冷编译。结束还须看到 `CLEANED grouped-index-build-cache=True`。`report.json` 汇总六项数据库测量；只有汇总成功及共享缓存确认清理后才生成 `suite-complete.json`，绑定报告和六份原始 transcript 的摘要、最终退出 0 与缓存清理。缺少该文件或摘要不匹配不算整个入口已验收。失败时保留整个证据目录及准确清理状态，由回执定位原因后另起新目录。不把不同代码快照的零散旧成功拼成完整本轮。

入口写入完成回执后会自动运行 `system-backup-d-index-group-verify.mjs`，只有它输出 `PASS grouped-index-suite-verification runs=6 local_cache_absent=yes production_approval=no` 后才打印外层成功。接收证据时也可独立执行：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
node .\scripts\system-backup-d-index-group-verify.mjs '<实际 docs/evidence/d-index-groups-* 目录>'
```

校验器只从该目录的六个固定文件名读取原文，不使用报告提供的路径去打开其他文件；缓存不存在检查限定于当前源码工作区，不能扩展为另一台主机的清理证明。

## 正式取舍仍需的输入

分组回执可回答哪组在当前合成分布下取得相近读收益、减少空间/写入成本；不能直接关闭代表性生产负载缺口。正式决议还需受审安装/状态分布、数据量与行宽、真实 FK、并发读写速率及事务长度、读写 P50/P95 预算、DDL 锁等待预算和重复/交错测量。没有这些输入前不凭一轮耗时挑选正式 migration。

canonical 配置读写闭环与此项独立；完整 Owner 来源、生产恢复、实际升级/激活和端到端仍有各自门禁。
