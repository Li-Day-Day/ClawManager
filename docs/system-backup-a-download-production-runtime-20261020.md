# A：下载生产运行时接线

【当前接线增量】[SQL 隔离与 Kubernetes 组合](system-backup-a-download-k8s-composition-20261020.md)及[新回执](evidence/a-download-process-k8s-accepted-20261020-r1.json)已接收：下载独立连接池、复用现有 journal 的 TLS readiness、离线挂载/投影组合、主入口 14 主/49 含子项与 Node 15 项、默认 vet、Linux 编译和准确产物清理。原共享连接池候选已由独立 `SYSTEM_BACKUP_DOWNLOAD_DSN_FILE` 取代；新主入口来源不再沿用下方旧 r5 的当前匹配结论。实际账号、PVC/CA/OIDC、正式批准与现场 E2E 仍待完成。

前序 r5 验证：[下载装载增量回执](evidence/a-download-deployment-accepted-20261020-r5.json)接收当轮 SHA 固定配置、实际 grants 对照、下载/MFA 同源挂载和私有 session 关闭增量。主入口 8 主/21 含子项、security 255 主/2,011 含子项沿用输入相同的 r2 通过记录；evidence 在修订夹具后以 r5 完整重测，306 主/2,370 含子项通过，共 4,402 项，含新增五根/18 项。Node 16 项和 Python 4 项模拟测试通过，Linux 编译、r5 冻结复查、进程退出 0 及五轮准确产物缺席已核对。两份来源和原失败分别保留；r2 因 evidence 失败未走到末尾 postcheck，该限制已入回执。后续主入口与组合增量以上方新回执为准。MFA 九项、准入/结果二十四项保持原冻结范围；SQL task owner 十一项待操作者回执。

journal 来源 1,420 项，SHA `b7a0c14718b6422d2411df095723bda2ba0a2218688e9666f5ec5354b6431b09`；Linux probe SHA `604c1dc7d1392756f904d51c10174e0afbebd52eeccfc5097f9bd1cd2ebc75ed`。其九份当前 Go 来源匹配；后续 main 和共享 config-writer 派发脚本变化明确排除。关闭顺序来源另冻 1,422 项，SHA `da7f69cf55aa6423e721aa3bfd85b4e011c712855f793915780308d95606e462`；Linux command SHA `defb60c0a10938f356ed12dd944041f3b98592aabc4839dba506d39f4dfda63e`。该旧回执包含的 main 已在新装载增量中变化，不再声称当前整个主入口与旧冻结相同。两个旧二进制及源码/编译缓存均已删除，不安装依赖，不执行远端 SQL 或部署。

## 故障持久路径

`DownloadFailureJournal` 沿用既有 `RecoveryAuditJournal` 的单写者、预置常规文件、O_APPEND、写后 fsync、容量上限和 sticky poison 语义。配置要求绝对规范路径、安装/数据库 UUID/库名及有界容量，不创建缺失文件或存储。检查尾部换行，拒绝继续写入上次崩溃留下的半行。Unix 文件只接受 `0600`/`0640`，其模式判定另有不依赖宿主权限语义的单测；Windows 模型不证明现场 Unix 权限。

正文只有固定 schema、部署身份、证据 public ID、关闭故障码、诊断主机 UTC，以及已有服务器 context 中的 Operation public ID、intent audit ID 和 claim SHA。不接受原始 claim、请求、proof、token、provider locator 或原始错误。主机 UTC 仅为诊断时间，不作为 SQL 审计、原始期限或授权来源。私有结果故障必须保留已有 Operation/intent/claim 摘要关联。

文件关闭、容量不足、外部截断/追加/替换、非法故障字段或失败写入后，journal 不自动恢复；修复和重启由操作者处理。健康检查不等待另一个写入者的 fsync，忙碌时拒绝新授权，不能用新健康样例重置状态。真实挂载、独立容量、单写者和 fsync 的平台行为仍需现场验收；context 检查不使操作系统文件 I/O 变为可中断操作。

`NewJournaledDownloadRuntime` 独占该 journal，拒绝同时传入任意 Failure callback。HTTP 入口、JWT 认证和每次实时 SQL/provider 授权都核对同一个 journal；既有 STS/Transit 后置授权及发送明文前的复查沿用该健康守卫。故障结果的 SQL 记录仍由原结果事务独立尝试，journal 不伪造业务成功或补写未知提交。

## 具体装配

`NewDownloadApplication` 自己构造 `SQLDownloadOwners`，支持正式四任务及已有 producer history 读源；不接收任意 owner policy 或旧私有下载 proof callback。其 Registry、准入 environment、Admission、Results、MFA ProofTargets 与下载 authority 共用同一数据库/安装及具体 owner。

真实 session、材料和物理容量源仍为必填部署输入。原 MaterialsUntil、AuditMinimumRetainUntil 和两种测量预留预算原样传递；不使用 `now+TTL` 补造历史期限。强认证 proof issuer 与 STS/OIDC issuer 分开提供。authority/admission 分别持有 JWT secret 的副本，主机 drain 请求后统一 Close 擦除副本并关闭 journal。

## 主入口与现场剩余工作

首轮仅 `TamperAndCapacity/replace` 因 Windows 禁止重命名已打开文件失败，整轮 exit 1，源码/缓存已清理。修订夹具先关闭并重开原旧文件身份，在原路径建立同尺寸的新文件，断言旧 descriptor 的 `os.SameFile` 身份保持、原路径身份不同、大小相同且未预先 poison；再分别验证 Check 和不先 Check 的 Append 都拒绝且两文件字节不变。这检验真实文件身份比较，不把 Windows 夹具操作失败当作安全成功，也不证明 Linux rename 挂载行为。新轮连同八种权限模式已重新冻结并验证通过；首轮失败保留。

新增 `--download-runtime` 可选参数把下载部署输入装载到已有 `cmd/system-backup-registration` HTTPS listener，并将 ProofTargets 接到同一个 TOTP API。必须同时提供基础 `--runtime` 和环境变量 `SYSTEM_BACKUP_DOWNLOAD_RUNTIME_SHA256`；文件内还固定基础配置摘要、部署/数据库/账号、配置版本及实际 grants 文件摘要。JSON 拒绝重复键、大小写别名、未知字段、无效 Unicode 和尾随文档。CA 逐份固定摘要；JWT 文件须与基础 API 已载入的密钥逐字节一致，避免挂载轮换中混用两代密钥。

该入口检查实际 `r.TLS`，不以转发头补造 TLS；下载和 MFA 目标共用具体装配。journal 不健康时拒绝控制面请求，响应不包含底层错误。主入口消费 `drained` 结果；成功排空后才擦除下载和私有 session 密钥，强制关闭且仍有 handler 时返回失败，由进程退出结束其生命周期。配置、凭据和路径均不从 HTTP 请求读取。

关闭顺序的代码增量已接到现有 main，单独门禁已接收：`serveRegistrationHTTP` 等待 Shutdown 完成后才返回。启动/监听失败也停止 shutdown watcher；正常取消且排空成功才按正常退出处理。排空超时会关闭连接并返回 `drained=false` 和错误，不能据连接关闭推定 handler 已停止，更不能据此提前擦除下载密钥。新增下载装载已消费该结果。CLI 失败提示也不再把运行期间的监听/关闭错误描述成“未发生激活”。

独立门禁使用四项实际 TLS/监听回归，验证活跃 handler 结束前不返回、超时不冒称排空、监听失败无残留 watcher、取消启动不打开 listener。它等待 journal 门禁的准确进程结束后才运行 Go；只把 3,472 份前轮只读编译缓存复制到自己的验证目录，使用 `-count=1` 重新执行测试，finally 删除全部自有产物。两个进程最终均退出 0，两个源码 owner 与首轮失败 owner 均独立确认不存在。journal 门禁的冻结范围不包含这次主入口增量。

两份底层空模板为 `deployments/k8s/system-backup-download.template.json` 和 `system-backup-download-sql-pins.template.json`，缺省摘要、身份和原始期限故意不可加载。后续新增的 A 组合器及完整 `system-backup-download-k8s.template.json` 已补下载配置、独立 DSN、journal 和投影 OIDC 挂载。readiness 使用现有进程的 journal；旧 D 清单仍不直接开启下载，新的离线清单也需现场输入与验收后使用。

新 journal 要求独立预留的持久卷和受控单写者，不能复用容量报告卷、投影 Secret 或临时目录来声称部署已就绪。当前没有创建现场文件、授予 SQL 权限、部署 workload 或开启现场下载路由。真实材料/身份/物理容量、正式 schema/grants、其他 owner/GC/墓碑、人员 MFA、实际 provider 和恢复矩阵继续保留。

## 下载 SQL 身份需要独立评审

2026-10-20 核对 [MySQL 8.4 锁定读取文档](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)：`FOR UPDATE` 除 SELECT 外，还需要 DELETE、LOCK TABLES 或 UPDATE 中至少一种权限；`FOR SHARE` 仅要求 SELECT。因此不能用仅接受逐表 SELECT 的容量采集账号校验器放行下载身份。

当前代码的 `download_result.go` 对 `users` 和 `audit_logs`、`download_admission_audit.go` 对 intent audit、`sensitive_download_nonce_scope.go` 对安装/config/nonce，以及 task/reference/producer reader 均有 `FOR UPDATE`。这里既有真实写入目标，也有只用于保持原事实不变的 owner/audit 来源。D 的角色方案必须明确这些锁定读取所需的额外权限及审计不可篡改约束，并以实际受限账号验证；隔离子库中的 root SQL 通过不证明此身份已可部署。

这不是一次允许自动 GRANT 或替换锁模式的决定。改为共享锁涉及所有参与者锁序、间隙范围、幂等键竞争和结果保留组，需要独立并发评审及实际 SQL 证据；本轮保持原锁实现。不能仅为让启动检查通过而授予库级 ALL、扩大 audit 写权限或移除锁。

身份检查也须使用实际连接的 CURRENT_USER/CURRENT_ROLE 与完整 grants；[MySQL 8.4 SHOW GRANTS 文档](https://dev.mysql.com/doc/refman/8.4/en/show-grants.html)区分了不带 FOR 的当前用户输出和指定用户输出对 mandatory roles 的包含行为。当前没有批准好的下载角色 profile，不以容量账号、用户名字符串或 `CURRENT_ROLE=NONE` 单独代替该批准。

候选启动校验在一个专用 SQL connection 内对照 server UUID、数据库、CURRENT_USER、CURRENT_ROLE 与不带 FOR 的 SHOW GRANTS；要求与部署 SHA 固定的期望语句完全一致。语法闭集只识别 USAGE、准确库的 LOCK TABLES、逐表 SELECT 和有界业务写入，拒绝 root、角色、全局/库级 CRUD、GRANT OPTION、DELETE、DDL 及 users/audit 的 UPDATE。它不执行任何 GRANT 或 LOCK TABLES。这个结构候选不等于最小权限已批准；全部 owner/reference 可见性和真实受限账号并发仍需验证。

现有主入口还承载配置注册等 API；候选下载写表闭集没有因此扩成整个配置控制面的写权限。新增实现已将下载账号/连接池与注册池分离，保留各自写边界；实际两个角色 profile 及跨账号 MFA/下载仍需独立批准和现场验证。当前不声明该下载账号能够执行所有已有注册/配置变更。

## 装载增量的本地门禁记录

`a-download-deployment-20261020-r2` 固定 1,429 输入，SHA `23d31811cc484e61ea3ccbb61f7f9305f17cbae8f9645ad25aec59f65fa09544`。Node 16 项、Python 4 项模拟测试、主入口 8 主/21 含子项和 security 255 主/2,011 含子项通过。evidence 的 `TestSystemPublicationClaimFinalGuard/readback_mode` 在创建夹具时返回 `producer_committed_but_execution_expired`，整包和本轮按 exit 1 保留，未进入 Linux 编译。

夹具初始化事务已经产生已知提交的历史行；其执行许可可能因繁忙宿主超过原五秒窗口。测试现在仅在初始化历史状态时接受“已提交且仅执行许可过期”这一准确组合，未知提交、未提交和其他错误继续拒绝，不授予 provider 权限。实际 claim 的十二个反例新增 `mutated` 断言，确保都进入被测试的修改，而非因更早错误碰巧通过。没有改动生产 executor、容量窗口或期限规则。

补测冻结 SHA `bb502ba3c5d588510e8d79f233db50901b9b55b9517d0ec2c001ed49a43a1e7a`，仍为 1,429 输入；与 r2 仅两份 evidence 测试变化：上述 publication 夹具和共享工作树中并行修订的 `download_output_deadline_a_test.go`。其余输入及六份额外模板/Python pin 必须逐项一致，才沿用 r2 的主入口、security、Node 和 Python 通过记录；evidence 整包使用 `-count=1` 重新执行，Linux 主入口另行编译。

先前 r1 漏复制 Python 文件，停在 Go 前；r3 因发现第二份并行测试变化而按来源守卫停止；r4 因 PowerShell 单元素字符串 splat 被拆成字符而在业务测试前失败。三轮都保留原失败与准确清理记录；参数已用显式字符串数组修正并核对原生 argv。

r5 evidence 全包通过，零失败/跳过，原 publication 十二反例及根、HTTP/1 与 HTTP/2 的四个实际缓冲输出用例均通过。Linux 主入口 SHA 为 `c63098f182e079fe51de3b0a81f778671fe16d0e71c84d8e68bcdbe7069219b9`，二进制已删除。r5 冻结 postcheck、最终退出 0、四轮旧 owner 和本轮 owner 缺席逐项核对完成。当前装载/容量/journal 重点来源匹配；后续并行变化的 `download_retention_gc.go`、其测试和 `download_task_owner_test.go` 明确排除，回执限定于冻结来源。各轮源码、缓存、临时文件和二进制均清理，不安装依赖或执行远端 SQL。
