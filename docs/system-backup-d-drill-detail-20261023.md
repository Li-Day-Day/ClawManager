# D 演练历史详情接线

【2026-10-26 修复后实际十九项已限定接收】[D 实际验收回执](evidence/d-drill-http-actual-accepted-20261026-c5f6a4a2.json)绑定唯一新轮 `sbk-mig-261026022412-229b` / UID `5ef5cdba-24f1-4cf0-b579-04ef0ac53e5d`。十九个子项（含原失败跨安装项）、根测试、native PASS 和最终 phase PASS 全部通过；操作者终端 exit 0、包装器 child_exit=0/error=null、source_postcheck=true。MySQL 8.4.8 / 96 份迁移、固定镜像 digest、HTTP binary `a0d3575f7e9dea08eb8b302b1427d202bb84bdff7e0bd86a55e7a2526db618dd` 和 migration binary `b4de6c83fb74e3c9e079353b16eefddd0d5b05888cfd7478441a11a9102d035f` 均由同轮 native 与[操作者输出](evidence/d-drill-http-operator-20261026-c5f6a4a2.txt)准确匹配。来源 b267397… / 1,629 份输入与本地修复版完全相同，当前全部匹配，无漂移。

[现有接收器复核](evidence/d-drill-http-actual-reviewed-20261026-c5f6a4a2.json)原生 exit 0，新增[离线接收程序](evidence/d-drill-http-actual-intake-20261026.mjs)逐行比对 native/操作者远端实质输出、终端退出、迁移状态和外层清理；既有 58 项接收检查与当前代码按准确字节复用，本次未重复测试/构建/远测或安装依赖。namespace 同 UID、scratch、内层 cache 清理由日志确认；外层准确 owner `.tmp-d-index-cache-0c4e8294037d492b8e5e44708ad891b5` / 1,630 份文件据回执清理并独立核验目录缺席。未独立查询远端，两条 SSH socket 提示保留。原包装器 `actual_mysql_results_accepted=false` 保持预评审原义，独立 D 回执承载本次限定接收；旧 044e5eed 的 18/19 FAIL 与后检 false 保留，不改写为成功。

本次关闭“修复后十九项实际 HTTP/MySQL 历史查询待验收”，该专项无需重跑。合成数据/登录角色 pin 不证明实际 provider、B 目标/物理清理、真人 MFA 或当前 source freshness；配置启用、历史迁移等价和 human MFA 仍为 false。完整恢复/GC、生产批准及原六项整体继续分别处理，不代签 A/B/C。下方“待新同轮”均保留其此前阶段含义。重放本次限定接收：

```powershell
node docs/evidence/d-drill-http-actual-intake-20261026.mjs docs/evidence/d-drill-http-repaired-20261026-100156-c5f6a4a2-source.json docs/evidence/d-drill-http-operator-20261026-c5f6a4a2.txt docs/evidence/d-drill-http-actual-reviewed-20261026-c5f6a4a2.json docs/evidence/d-drill-http-actual-accepted-20261026-c5f6a4a2.json --check
```

【2026-10-26 跨安装夹具修复与本地准备通过】[修复回执](evidence/d-drill-http-foreign-fixture-repair-20261026.json)及[当前本地接收](evidence/d-drill-http-repair-local-reviewed-20261026.json)绑定来源 `b267397adc7696879a17a32a39f2637ebaf046f00a92c285a3b92ed2ea9c6348`。夹具在插入前选择 origin，父 drill、check rows 和 Job 始终使用相同归属，不再修改已被引用的父键；跨安装请求前读回 foreign 归属及三条关联 checks，仍要求 HTTP 404/no-store/无历史泄漏。新增不连接 MySQL 的存储模型回归实际调用同一构造路径，确认完整父行/两次 attempt/三份 evidence/三条 checks 到达 HTTP 回调。它只证明合成夹具行为，不替代实际 SQL/路由验收。

实际十九项 helper 改为仅在子项均无失败时打印整组语义 PASS。D 接收器同时接受 Go 子项即时输出和根 PASS 之后、native package PASS 之前的合法汇总，仍拒绝缺项、越界、根/子项失败；新增回归确认原 044e5eed 失败日志继续被拒绝。接收器 **58/58** 通过。现有本地准备入口原生 exit 0：A read-scope、完整 read、live/cursor、含新回归的 drill seed、原 SQL seed 和三份 Linux 构建均通过；source postcheck=true、error=null，1,629 份当前来源匹配。与原失败轮比较仅 tagged `system_backup_read_drill_history_mysql_test.go` 改动，普通六包/GC 来源未变化。

准确 owner `.tmp-d-index-cache-71541119ce3c4e208eb2120f908c4b1e` 及 1,630 份文件已清理并独立确认不存在，内层 cache/源码/二进制同时清理，未安装依赖或执行远端。旧失败结果、原日志及 source_postcheck=false 保持原义；旧失败复核程序要求原冻结来源，当前修复后不能把其原成功复核改写为新远测通过。修复后实际十九项仍待新同轮运行，使用新输出名：

```powershell
& pwsh -NoProfile -File .\scripts\system-backup-d-drill-detail-validation.ps1 -Remote -BuildParallelism 2 -SourceManifestPath "docs/evidence/d-drill-http-remote-repaired-$(Get-Date -Format yyyyMMdd-HHmmss).json"
```

原失败轮仍为 18/19；这次只接收本地准备，未接收实际 provider、human MFA、生产授权、完整恢复/GC 或六项整体完成。

【2026-10-26 实际十九项验收未通过】[D 失败回执](evidence/d-drill-http-actual-rejected-20261026-044e5eed.json)及[操作者输出](evidence/d-drill-http-operator-20261026-044e5eed.txt)绑定 `sbk-mig-261026012249-32ca` / UID `b1ccc8fa-4e64-4981-be31-6d7634ced000`：MySQL 8.4.8、96 份迁移完成，但十九个子项只有十八项通过，`drill_history_foreign_installation` 在新夹具第 181 行执行 SQL 时失败，尚未请求 HTTP；根测试 FAIL、远端 exit 1、包装器 child_exit=1、终端 exit 1。函数尾部打印的 `PASS drill-history-http-mysql synthetic_cases=19` 不是测试成功；最终 `PASS d-drill-detail-http-mysql` 不存在，不能接收为十九项通过。

静态推断指向夹具 FK 冲突：用例先向 `system_backup_check_results` 写入原 installation 的关联行，再单独 UPDATE 父 `system_restore_drills.origin_installation_id`；migration 072 的 `fk_sb_check_result_drill` 复合外键不允许这种父键更新。实际错误详情已遮蔽，未认定具体 MySQL 错误号。后续应从插入开始构造安装归属一致的跨安装夹具，并以新名字重跑完整十九项；不关闭外键、不用十八项替代十九项，本次原始失败永久保留。本轮验收只记录失败，没有修改测试/生产代码或重跑远测。

同轮原日志 SHA 与包装器一致，1,629 份冻结输入当前摘要均匹配；原 `source_postcheck=false` 继续保留，没有把事后字节核对伪称为原成功后检。namespace UID、远端 scratch、内层 cache 及外层源码清理由日志记录，本地准确 owner 已独立核验缺席，1,630 份自有文件据回执删除。没有独立查询远端；两条 SSH socket 提示保留。成功接收器对 metadata 和原日志均拒绝，[失败复核程序](evidence/d-drill-http-failure-review-20261026.mjs)可加 `--check` 重放。未安装依赖，本轮没有产生测试构建产物；实际十九项、生产部署、完整恢复/GC 及原六项仍未验收通过。

依据 `admin-task-detail-resources.schema.json` 的 DrillDetailResource，详情只暴露目标配置 hash、清理汇总和已登记证据引用，目标内容及资源清单仍归 B。本轮为真实 `GET /admin/system-restore-drills/{id}` 增加持久化历史投影，不把历史 eligibility 或 cleanup 状态解释为当前 source/provider 可用、物理清理已重新验收或允许 promotion。

`ReadDrillDetail` 复用原 Task → attempts/jobs → 类型控制字段 → check rows → check evidence 绑定的单一 RepeatableRead 授权事务。在最终授权复查之前补齐任务时间和三个报告的 owner/hash/创建时间核对。缺行经过最终授权后才返回 404；结构、引用、计数或权限失败返回零结果。提交后请求已取消也不返回详情。

执行投影选最高 attempt number，排除旧重试检查和 Job 进度。该 number 下存在多个阶段时，current_phase 保留 null；存在多个 Job unit 或阶段歧义时不组合单一 generation。last_business_progress_at 只来自该 attempt 的持久 Job 业务进度或 check 时间，不使用 heartbeat。摘要从当前 attempt 的实际 check rows 计算，并与保存的汇总计数逐项一致。

preflight/diff 是任务绑定的历史引用，可以早于当前恢复重试，但不能早于任务创建；当前 verifier 报告不能早于该 attempt 的阶段创建时间上界。同一引用多处使用时 hash 必须相同，创建时间使用最严格边界。只检查登记元数据，不读取报告正文、不发起 provider 操作、不宣称当前可下载。未保存的 index/marker/source 字段保持 null，不从其他任务猜测补齐。

HTTP 入口继续使用真实部署 pin、当前登录会话和 A 的授权器，拒绝任意 query 参数，并返回 live、installation 和 row-version 响应头。前端既有 DrillDetailResource 解析和详情组件可消费该响应。backup/preflight 的当前事实缺口、logs/manifest/provider/catalog、完整恢复与 GC 继续保持原依赖。

前端演练详情补充目标部署与清理策略，复用五语言既有文案。[本轮前端回执](evidence/d-backups-ui-local-dee3e2a8c83a4159adad5d659b190f82.json)确认 10 个既有测试文件的 286 项全部通过，完整应用 TypeScript、验收配置严格 TypeScript 和正式 Vite 构建共 13 步均 exit 0。输入字节稳定，准确自有目录和构建产物已删除并另核验不存在。原 chunk size 警告保留，没有调整阈值；未安装依赖、开启浏览器服务或连接业务后端。

本地验证入口使用已有依赖并自行清理源码副本、cache/tmp/telemetry 与二进制：

```powershell
& .\scripts\system-backup-d-read-runtime-validation.ps1 -BuildParallelism 2 -TestPackages @('./internal/systembackupread','./cmd/server')
```

验证结果以本轮原生日志和 receipt 为准；合成 SQL driver 和匿名 HTTP 拒绝检查不替代实际部署、真实登录详情 HTTP/MySQL、报告内容验证或 B 的清理执行证明。

首轮[失败回执](evidence/d-read-runtime-local-51ac3947a30a4ac3903779a3422e8a98.json)及[原日志](evidence/d-drill-detail-native-validation-20261023-r1.txt)保留新增夹具把演练状态写成 `running` 的错误。演练合法执行状态为 `restoring` 等专属枚举，原门禁在构造器前正确拒绝；另一缺行断言误用了 page fixture 不记录的提交计数。修复仅涉及新夹具/断言，不修改状态枚举或授权门禁。读取包既已失败，准确本轮 Go 进程树停止后外层完成 finally，server 检查未完成；该轮没有重试为成功，准确 owner 已独立核验不存在。第二轮重新运行完整包，读取包现已通过 102 主/976 条通过事件，新增演练五主/33 条；其余门禁结果仍以最终回执为准。

第二轮[最终原生回执](evidence/d-read-runtime-local-ff5d9766e6114da4af0467119fbe0c13.json)及[完整日志](evidence/d-drill-detail-native-validation-20261023-r2.txt)确认：读取包 **102 主/976 条**、server 包 **7 主/22 条**全部通过，无失败或跳过，保留 default vet；Linux server、db MySQL probe 和 server HTTP/MySQL probe 三份二进制构建成功。1,358 份冻结输入最终核对通过，当前对应文件逐字节摘要复核无变化。准确 owner `.tmp-d-index-cache-ff5d9766e6114da4af0467119fbe0c13`、源码副本、cache/tmp/telemetry 与全部二进制已删除，另核验目录不存在。没有安装依赖、连接远端或运行实际 SQL。

本轮完成的是演练历史 DTO、真实路由、前端字段与本地门禁。带真实登录的演练详情 HTTP/MySQL、生产部署及 A/B 同版本增量评审仍待完成；旧历史详情十六项的实际接收不扩大到这个新入口。B/C 未交付状态保持，完整恢复、完整 GC 和其余当前事实详情仍未完成。

## 独立 HTTP/MySQL 十九项专项

新增 `system_backup_read_drill_history_mysql_test.go`，在已有 fresh-migration namespace、原 UID/server 标记、完整配置夹具及真实 SQL 登录会话/授权器中运行实际 Gin 路由。新 `AdminReadDrillHistoryOnly` 档位与 config/index 档位互斥；只运行十九个演练历史用例，跳过已接收的旧十六项 verification history 和旧 authority/full-schema 测试，不将其重新记为新通过。默认旧档位不变。

十九项覆盖：无 attempt 的 pending、当前重试、catalog-import 来源、多 Job、多阶段、单 Job、纯 heartbeat、保存摘要漂移、报告 hash/owner/时间漂移、重试前历史 preflight/diff、重复引用的最严格时间边界、过期证据的历史引用、跨安装、缺行、未知 query、缺登录及撤权。正文、目标配置 ref 和检查 expected/actual 中放入私有哨兵，响应必须不泄漏；所有成功还核对 live/installation/row-version/no-store 头。用例数据和角色 pin 均为合成夹具，不认证 B 目标、物理清理、真实人员登录/MFA 或 C provider。

本地准备（新输出文件名不可复用）：

```powershell
& .\scripts\system-backup-d-drill-detail-validation.ps1 -BuildParallelism 2 -SourceManifestPath "docs/evidence/d-drill-http-local-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
```

操作者执行实际专项时使用另一个新名字：

```powershell
& .\scripts\system-backup-d-drill-detail-validation.ps1 -BuildParallelism 2 -Remote -SourceManifestPath "docs/evidence/d-drill-http-remote-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
```

新档位只允许既有缓存镜像，缺少即失败，不拉取镜像或安装依赖。必须收到 `TestDAdminReadLiveHTTPMySQL/drill_history_*` 十九项及根通过、最终 `PASS d-drill-detail-http-mysql synthetic_cases=19`、同轮来源/二进制/迁移及 namespace 与本地/远端准确清理，才能接收实际 SQL。仅 seed、编译或 wrapper exit 0 不表示十九项已执行。

[七项本地调度回归](evidence/d-drill-http-dispatch-20261023.json)执行真实 phase 内层 shell，模拟所有 kubectl/MySQL 与测试二进制；默认档位保持三个旧根调用，仅演练档位只有一个新 HTTP 调用。HTTP 非零、config 冲突、非法档位、错误 UID 和缺根测试均拒绝，失败不打印新成功标记。测试 source 在[本地调度脚本](evidence/d-drill-http-dispatch-20261023.sh)，[原输出](evidence/d-drill-http-dispatch-20261023.txt)七项通过，准确 owner 和 12 份生成文件已清理。另有两项 PowerShell 档位互斥拒绝及 Bash/PowerShell 语法检查通过；这些都没有调用真实 kubectl 或 MySQL。

本地准备[冻结来源](evidence/d-drill-http-source-20261023-r1.json)、[完整日志](evidence/d-drill-http-preparation-20261023-r1.txt)与[外层回执](evidence/d-drill-http-source-20261023-r1.json.result.json)确认 child exit 0、source postcheck 通过，1,615 份当前对应输入摘要无变化。A read-scope、完整 read 包、live/cursor HTTP、本轮十九项 seed 及原 MySQL seed 通过；Linux SQL/HTTP 探针和 pinned migration runner 编译成功，保留默认 vet。内层自有 cache 已清理；外层准确源码 owner 及 1,616 份文件已删除，另行核验不存在。HTTP 二进制 SHA256 为 `d73e7e151b3182c03122c5e02b5405f33d43dbb0c31aafb40c43e5cbe8085c94`，仅用于绑定本轮准备，不作为实际十九项 SQL 的接收。

最终[剩余范围审计](evidence/d-remaining-scope-dependencies-20261023.json)按实际代码与原生 strict gate 保持三个目标未完成：九表完整转换/生产写入、完整 GC、其余当前事实详情。inventory strict 和 contract strict 原生均 exit 1；三张 catalog 计划表、四份合同、40 项 policy、60 项交叉评审及现场 schema hash 仍缺。已完成的 D 本地交付不替代 B/C 领域规则、真实 proof/读源及受审 GC 权限/物理材料。
