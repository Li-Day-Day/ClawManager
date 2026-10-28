# D bootstrap 候选消费 MySQL 专项

本轮冻结来源 `4a5f56e4…` 的真实 SQL 已核验：`72b5ae6d…` 消费 26/26、同源 `f0f6587b…` 范围锁 3/3 均通过；原生准备、操作者终端退出码均为 0，96 份固定迁移、探针/迁移程序/inputs 哈希、每个用例数据库与 namespace/UID 清理、远端 scratch 和本地 owner 缺席均已核对。`late_operation` 现在有真实 `rows=1` 篡改及随后拒绝/回滚的通过证据。用户两份粘贴附件与仓库原始 operator 日志均经过相同严格语义验证，结果一致。准确接收为 `evidence/d-bootstrap-actual-frozen-reviewed-20261026.json`，可用 `node docs/evidence/d-bootstrap-actual-frozen-review-20261026.mjs --check` 重算。

此次接收仅对应上述冻结来源。验收期间 `backend/internal/systembackupevidence/bootstrap_entry_mysql_test.go`、`backend/internal/systembackupproducer/bootstrap_inline_domain_test.go` 出现后续字节变化，清单与旧/新哈希均记录在汇总中；严格当前来源接收器仍拒绝当前源码匹配，未生成全当前来源通过回执，未改写原包装器预接收 false。不能将本轮 29 项推广到这些后续修改、其他专项或完整 A/D 完成。原授权与物理报告仍为合成，生产批准、provider 权限及人工 MFA 不在证明范围。

本次修正接收器对 Windows PowerShell UTF-16LE BOM 日志及 Go 集中式子用例 PASS 汇总的解析：逐个实际执行区间验证容量、篡改、锚点、等待/释放及独立数据库清理，原始日志字节与哈希不变；范围锁接收器也对齐 96 文件/081 尾编号。两接收器共 78 项回归通过，无失败/跳过，包括错误编码、截断、跨用例挪用证明和清理的拒绝。本次未安装依赖、未运行新的远测或 Go 构建。

后续真实远测 `49e264a6…`、`4b3f3d85…` 均为 25/26 子用例通过，仅 `late_operation` 失败。其原始错误是 MySQL 3819：夹具将 system operation 的 `target_public_id` 改为其他 installation，违反正式 `chk_sb_operation_target_id` 对 target=origin 的约束，实际未存入篡改。已将该攻击改为把新 operation 的 `http_status` 从 201 更新为 202；202 满足正式 100..599 CHECK，但必须被原 201 结果的固定末尾读回拒绝。仍要求 `bootstrap_mutate()` 实际返回改动一行、随后服务拒绝且全表回滚；没有修改正式迁移或生产守卫。独立回归增加 `late_operation_http_status`，原 target 篡改回归也保留。两轮原失败回执及 operator 日志保留，不改判为完整真实 SQL 通过。

同时修复消费接收器的迁移尾编号误判：固定目录为 96 份文件、最后编号 081，因此匹配真实脚本的 `001..081 applied=96`；仍要求固定 catalog、96 次应用与 exact filenames。新增 SQL 拦截 operation 篡改、错把数量 96 当作尾编号两项拒绝测试，接收器 34 项通过，准确日志为 `evidence/d-bootstrap-late-operation-receiver-tests-20261026-r3.txt`。首次 Node 测试因子进程 EPERM 未执行，原记录保留；随后使用无子进程隔离的标准 test runner 参数完成验证，未安装依赖。

本次修复已在冻结来源 `40364cd5…` 上完成本地验证：消费 seed、Linux 探针、迁移程序及包装器终态均 exit 0；独立消费回归 11 根、57 个子用例通过，无失败/跳过，包含新增的 201→202 末尾读回拒绝与回滚。来源后检通过，四份关键源码与冻结输入一致；固定读回守卫和正式表定义的哈希与两轮失败来源一致。临时 owner 已独立确认不存在，源码副本、缓存和二进制均已清理。汇总见 `evidence/d-bootstrap-late-operation-fix-20261026.json`，原生准备回执为 `evidence/d-bootstrap-consumer-mysql-20261026-152248-d727652a.json`。本轮未重跑真实 MySQL，修复后的 26 项仍需重新远测接收。

真实远测 `537e083b…` 的 26 个用例与范围锁远测 `2a2a4104…` 的 3 个用例均在共享 producer 夹具的 claim 初始化处返回 `producer_authority_expired`，未进入各自目标场景。根因为短 owner-write 模式只允许 12 秒，夹具却固定请求 45 秒 claim；`claim.go` 要求 claim 不超过原先全部期限中的最早值，因此正确拒绝了该请求。修复将夹具 claim 窗口设为 `min(45 秒, owner-write 窗口)`，没有修改生产守卫或延长已签发期限。seed 同步使用真实 SQL 夹具的短窗口，并先验证 45 秒 claim 仍被拒绝，再执行合法 claim/finish/result。两个原失败回执与操作者日志均保留，不能记为实际场景通过；本轮 namespace、各用例数据库、远端 scratch 与本地 owner 的清理均有原始日志。

修复后的冻结来源 `b4a90dad…` 已通过本地范围专项包装器 `f69fd7c3…`：两根精确 seed、Linux 探针和迁移程序及包装器终态均 exit 0，来源后检通过，owner 独立缺席，临时源码、缓存和二进制均已清理。同源常规生命周期与 14 个原子失败子用例也全部通过，无失败/跳过。当前四份关键源码与冻结输入一致；生产 `claim.go` 哈希与上述两轮失败来源一致。汇总见 `evidence/d-bootstrap-claim-window-fix-20261026.json`，原生准备回执为 `evidence/d-bootstrap-config-ranges-mysql-20261026-144036-f69fd7c3.json`。未安装依赖；修复后的真实 MySQL 26 项及范围锁 3 项仍需操作者分别重跑，不能用本地结果代替。

`02214f3f…` 远测入口在本地编译阶段因 `download_gc_full_collect_mysql_test.go` 未使用的 `mysql` 导入失败，尚未启动远端操作。复核时工作区已删除该导入；只将这一行加回即可重建失败快照中的文件 SHA-256，确认该文件修复范围仅此一行。随后本地准备在冻结来源 `740aa20b…` 上复测通过：精确 Windows seed、Linux 探针和迁移程序三个步骤均 exit 0，包装脚本终态 exit 0，来源后检通过，临时 owner 已独立确认不存在，源码副本、缓存和二进制均已清理。新回执为 `evidence/d-bootstrap-consumer-mysql-20261026-135644-b391ee9f.json`；原失败记录保留。本轮未安装依赖、未执行远端 MySQL。该编译阻塞已消除；本轮只证明上述冻结来源的专项本地准备通过。

该冻结来源中的 `systembackupnoncebootstrap/candidate_adapter.go` 为 `e0f0c70d…`，随后工作区已更新为 `0ccfbd5a…`，将标准库 `hash` 导入别名修为 `stdhash`，避免与该包测试函数同名。本轮 seed/探针不运行依赖包自身的测试，不能覆盖这项变更或替代九包联合门禁；远测前仍按下文要求接收当前 core/A/D 联合回归的确切来源。

本专项调用真实 `ConfigBootstrapService` 与 `BootstrapCandidateConsumer`，在隔离 MySQL 8 中验证同事务消费。它是新增路径，不能由此前 owner、GC、资源或演练结果替代。

当前版本已从 18 项扩展为 26 项：容量改为真实 `BootstrapCandidateCapacity` 的 PrepareAttempt、Reserve/CAS、Recheck 和正式 ledger 表；报告依旧合成，不能证明物理容量。新增历史重放时 admin/独立授权撤销、缺报告的新消费拒绝/历史重放允许、过期报告、容量时限 SQL 等待、ledger 末尾篡改和不重置原预留。接收器的 32 项检查通过；新版本地冻结 `6a77993b…` / 1657 份输入已完成 seed、Linux probe/migration 编译，三个原生步骤和终端均 exit 0，来源后检通过，`bb2dfe39…` owner 独立缺席。准确回执为 `evidence/d-bootstrap-consumer-mysql-local-reviewed-20261026-v2.json`，对应 `local-review-20261026-v2.mjs --check` 已重算通过。未跑真实 SQL，未安装依赖。下段 `df9344fa…` 只记录旧 18 项准备，不覆盖这次升级。

本地准备已在 `df9344fa…` 的 1653 份来源快照上通过：seed 一根、Linux 探针与迁移程序两次编译均 exit 0；接收器 25 项通过，PowerShell/Bash 语法通过，原生终态 exit 0，临时 owner 独立确认不存在。正式范围见 `evidence/d-bootstrap-consumer-mysql-local-reviewed-20261026.json`，可用同名 local-review `.mjs` 的 `--check` 重算。首次 `75e285e0` 冻结因未使用导入编译失败，原记录保留，未改判。

该快照之后 D 又修复了导出 Transaction 结构值复制可逃逸已关闭 Work 的问题；具体授权来源、容量、nonce/CA 适配也在联合验证。因此下述远测命令先作为已准备的操作者入口，待新 core/A/D 联合回归的确切来源接收后执行。本地专项结果不覆盖这些后续改动，也不表示 D 所有本地工作完成。

`scripts/system-backup-d-bootstrap-consumer-mysql-validation.ps1` 默认只做本地准备：稳定来源快照、离线只读模块、精确 seed 根测试、Linux 探针及迁移程序编译、来源后置复核，最后删除本轮源码副本、Go cache、临时文件和二进制。没有安装依赖。每轮原生日志、快照和结果 JSON 留作证据；失败轮次保留。

探针嵌入固定 inputs 胶囊。它用原 C1 向量与 A 的完整加密 Manifest，从新的 producer 生命周期开始选择兼容 disabled-config 的摘要，不重写已提交的历史。远端先执行完整 96 份正式迁移，再在每个用例独有的数据库中应用八表 C1 草案，使用 `SHOW CREATE TABLE` 复制完整的八张 A 表（含 metadata reservation ledger）；要求外键检查开启。每个数据库均验证隔离 namespace、UID、server UUID、迁移文件名集合并在结束后删除。

26 个场景包含首次 disabled-v1 与 epoch 同事务提交、COMMIT 已成功但回执丢失后的同键读取、旧观察到期后的历史重放、当前 admin/合成授权拒绝、intent/config/state/operation/result-audit 五处写入失败回滚、config/operation/audit/chunk/ledger 五类末尾篡改、原授权期限在 SQL 等待期间到期、旧 owner-write 截止到期仍可消费、并发同键以及孤立配置拒绝。回滚比较全部表内容；成功和重放保留原 receipt/history、三类证据引用。真实 ledger 必须只增加原费用 73728，保留原 outstanding；重放不得再收费。

五类末尾篡改使用本轮独有 schema 的受控 SQL 函数，必须先证明实际改动了一行，随后由最终 guard 拦截。仅有 SQL 错误不能算通过。等待由数据库时间确认，单次 SQL 等待低于连接超时。

授权来源、用途映射、provider 观察和物理容量报告明确为合成夹具；本专项不证明现场 grant、物理容量、provider 权限、人工 MFA、完整恢复或完整 GC。具体授权/nonce/CA 来源另有 A/D 联合验证；本专项对容量 helper 的真实 SQL 准备，也不等于其物理报告获得现场批准。

本地准备：

```powershell
pwsh -NoProfile -File .\scripts\system-backup-d-bootstrap-consumer-mysql-validation.ps1
```

需要操作者执行远测时，在仓库根目录运行一次，并保留终端退出码：

```powershell
$operatorLog = '.\docs\evidence\d-bootstrap-consumer-operator-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'
& pwsh -NoProfile -File .\scripts\system-backup-d-bootstrap-consumer-mysql-validation.ps1 -Remote 2>&1 | Tee-Object -FilePath $operatorLog
$bootstrapExit = $LASTEXITCODE
"bootstrap_consumer_exit=$bootstrapExit" | Tee-Object -FilePath $operatorLog -Append
```

包装脚本输出 `BOOTSTRAP_CONSUMER_MYSQL_RESULT=...json`。其 `actual_mysql_results_accepted` 始终保留为 false，待独立接收；不改写原回执。将结果 JSON 和上述 operatorLog 交给接收器：

```powershell
node .\docs\evidence\d-bootstrap-consumer-mysql-review-20261026.mjs <结果JSON> <操作者日志> .\docs\evidence\d-bootstrap-consumer-mysql-actual-reviewed-20261026.json
```

接收器要求 26 个精确子用例、完整迁移、各用例准确的容量预留次数、五类真实篡改证明、原生 PASS、namespace/UID 一致、26 个数据库清理、远端 scratch 和本地 owner 清理及退出码 0。它核对当前关键文件集合与原快照；漂移必须重新复核。接收器自身不连接远端。
