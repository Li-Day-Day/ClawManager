# A：users / AI Gateway 备份校验交接（draft）

## 三张网关历史表的隔离 MySQL 探针（待远端回执）

新增 `backend/internal/systembackupbusinessa/history_rows_mysql_test.go`（`systembackup_mysql` 标签）及 `scripts/system-backup-a-business-history-phase.sh`。`-BusinessHistoryOnly` 档位先用本机现有 Go 依赖跑 A 包测试并编译 Linux 探针和当前迁移 CLI；`-Remote` 才会创建带 run ID/UID 的临时命名空间，在其空库重放当前迁移。探针只在该命名空间的 MySQL Pod 内创建身份标记和随机 `abiz_` 库，以 `CREATE TABLE ... LIKE` 复制三张正式迁移表，将 A 候选规范化产生的 `model_invocations`、`audit_events`、`cost_records` 完整行写入并回读脱敏字段、终态及精确金额。测试和脚本验证二进制摘要及目标身份，并在结束时清理随机库、探针文件和临时命名空间。

本轮 `powershell -NoProfile -File .\scripts\system-backup-a-evidence-validation.ps1 -BusinessHistoryOnly` 退出 0：完整 A 包测试、带 MySQL 标签的本地编译、Linux 探针与当前迁移 CLI 编译均通过，`CLEANED local-registration-build-cache=True`。另一次直接带标签的本地编译也退出 0，隔离缓存已清理。未安装依赖；真实 MySQL 探针尚未运行。

远端环境由操作员执行，建议在仓库根目录运行并保存完整回执：

```powershell
powershell -NoProfile -File .\scripts\system-backup-a-evidence-validation.ps1 -BusinessHistoryOnly -Remote *> .\docs\evidence\a-business-history-mysql-remote-20261013.txt
```

通过门槛：命令退出 0，日志同时含 `PASS fresh-migration-replay`、`PASS pinned-migration-runner`、`PASS A business history rows fit migrated MySQL columns`、`PASS a-business-history-mysql`、`CLEANED A business run-owned database`、`CLEANED namespace=`、`CLEANED remote-registration-scratch=yes` 和 `CLEANED local-registration-build-cache=True`，且没有 `CLEANUP_PENDING`。这是合成 B proof 投影的列兼容性探针；仍不能作为真实 dump 认证、B 生产写入器、跨表 FK、权限或大数据量恢复的通过证明。

日期：2026-10-13。范围是 A 拥有的 `users` 六表和 `ai_gateway` 九表。对应代码在 [`systembackupbusinessa`](../backend/internal/systembackupbusinessa/capture.go)，check ID 和 expected/actual 闭集在 [v12 verifier 合同](../contracts/system-backup/v12/verifier-contract.schema.json)。这份交接不是 P0a 完成证明。

## A 当前可交付的接口

1. `NewPinnedCaptureScope(registryJSON, expectedSHA256)` 要求独立部署侧 pin 与冻结 v12 registry 原字节相符；15 表、分类、normalizer/verifier ID、实测 schema hash evidence 和全部交叉评审必须齐全。当前 registry 仍为 draft，构造会拒绝。pin 不得从请求或待验证 JSON 自身计算。
2. `SQLCountCollector.CollectSnapshot` 在只读 RepeatableRead 事务内检查 15 张表均为 InnoDB，并一次性返回按表排序的脱敏行数。它不读取业务行，也不产生 dump、staging 或 capture certificate；任何查询/提交失败都不返回部分结果。此独立事务本身不能证明与 B 的 dump 使用同一 checkpoint。
3. `VerifyBackupSnapshot` 要求 B 的 `CaptureProofVerifier` 先认证 source/dump 的注册 evidence、dump 内容及同一 checkpoint，再输出 users 8 项、AI Gateway 11 项 v12 check；checkpoint、capture context 或计数差异会同时返回失败 check 和 `ErrSnapshotMismatch`。
4. `VerifyBusinessMetadata` 只在 proof 和全部 check 通过后给出两类的对象数/行数及 registry、schema、checkpoint、capture context、evidence ID。它没有 `PartResult.status`、staging 字节或 eligibility。`KnownVerificationFailureCategory` 把 A 可确定的备份统计/绑定错误映射为 `validation_failed`、恢复目标计数/失活状态差异及 A 的纯规范化错误映射为 `normalization_failed`、缺少 proof/evidence 映射为 `evidence_incomplete`；B 的签名、provider、权限和超时错误保留原类型。
5. [`SQLRestoreVerifier.VerifyRestoreTarget`](../backend/internal/systembackupbusinessa/restore_verify.go) 是恢复完成后的只读候选校验器。它要求 B 的 `RestoreTargetReadProofVerifier` 在同一只读 RepeatableRead 事务开始和提交前证明隔离目标身份、规范化完成、预期计数/evidence 及 SELECT-only 凭据；随后核对 15 张表的 InnoDB/行数和 9 条凭据或执行状态的失活规则，输出 users 11 项、AI Gateway 13 项脱敏 v12 draft check。SQL、proof 或提交失败不返回部分结果；完整比较出现差异时返回失败 check 和 `normalization_failed`。它不执行恢复写入，也不验证逐行业务值或 Secret/ref。

## B / D 接线前必须补齐

新增 [`model_invocations` 完整行候选规范化入口](../backend/internal/systembackupbusinessa/model_invocation_restore.go)：覆盖迁移 028 的全部 SQL 列。A 的来源投影只接收请求正文、响应正文和错误文本的 SQL 非 NULL 状态，不接收原文；目标对应字段统一写 `[REDACTED]` 或保留 NULL。用户、实例、模型、运行 Pod、gateway、会话和 trace 由 B 证明的来源→目标映射绑定，同批次拒绝重复 ID、trace 复用及映射漂移；历史 `pending` 转为 `failed` 并补终止时间。B 须用真实 dump 独立认证每行原值与 NULL 状态、共同的跨表会话/trace 映射、目标占用和写入权限；当前仅有 A 的纯转换和本地 proof 夹具，不执行 SQL。D 需交叉评审历史 request ID 保留、状态失活与流量门禁。

新增 [`audit_events` 完整行候选规范化入口](../backend/internal/systembackupbusinessa/audit_event_restore.go)：覆盖迁移 028 的全部列。来源消息和 details 原文不进入 A，目标消息固定为 `[REDACTED]`，details 依 SQL NULL 状态写 NULL 或 `[REDACTED]`；调用、会话、trace 等归属映射必须闭合且由 B 证明。该入口仅生成候选历史行，不执行 SQL，也未获得真实 B dump 证明。

新增 [`cost_records` 完整行候选规范化入口](../backend/internal/systembackupbusinessa/cost_record_restore.go)：覆盖迁移 028 的全部列，五项金额均以精确 `DECIMAL(18,8)` 字符串传入和输出，`actual_cost` 保留 SQL NULL，避免运行时 `float64` 精度丢失。A 检查同批 ID、会话、trace、用户、实例、调用、模型等映射与金额/计数格式；B 仍须证明真实来源行、目标占用及写入权限。三张表与既有聊天、风险记录必须共享同一份跨表映射，单表候选入口本身不证明整体一致。

这三张表的增量使用离线 Go 依赖和工作区隔离缓存执行完整 `go test -p=1 ./internal/systembackupbusinessa -count=1`，退出 0；新增测试覆盖原文脱敏、精确金额、空表与失败 proof、引用漂移、历史 pending 失活及零部分结果。隔离缓存已清理，未安装依赖。**A 的 15 表已有各自的候选规范化入口；跨表校验仍待编排接入，真实 B proof、隔离目标 SQL 写入和大数据量验收仍未完成。**

后续新增 [A 网关历史跨表映射校验入口](../backend/internal/systembackupbusinessa/ai_gateway_cross_table_restore.go)，要求 users、llm_models、chat_sessions、model_invocations、audit_events、cost_records、risk_hits 与 chat_messages 的来源→目标引用在同一批次中一致；同一来源 trace 只能落到一个目标 trace，目标 trace 不能复用任一来源 trace。此函数是确定性一致性检查，须在各表 B proof 验证后、目标写入前调用；目前尚未接入 B 写入器，也不代替源 dump 认证。第一次完整 A 包回归在本机 Go 标准库编译阶段遇到 `0xc0000043`，未产生业务断言结论；同一源码以 `GOMAXPROCS=1`、`-p=1` 离线重跑完整 `go test ./internal/systembackupbusinessa -count=1` 退出 0。两次隔离缓存均已清理，未安装依赖。

新增 [A 网关历史组合规范化入口](../backend/internal/systembackupbusinessa/ai_gateway_history_restore.go)：固定整批输入快照，先检查跨表映射，要求 B 对同一份封存 dump、checkpoint、evidence 与依赖映射给出整批来源证明，再逐表执行已有 B proof 和规范化器；任一项失败均不返回部分历史行。组合范围为会话、模型调用、审计事件、费用、风险命中及聊天消息六表；users、llm_models 和 risk_rules 的规范化仍由各自入口完成，组合 proof 必须认证其依赖映射。完整 `go test -p=1 ./internal/systembackupbusinessa -count=1` 离线退出 0，覆盖成功整批、整批证明缺失、跨表漂移、逐表 proof 失败零部分结果及证明器修改输入副本隔离；隔离构建缓存已清理，未安装依赖。当前无真实 B 整批证明器或目标 SQL 写入器，仍仅为本地接线候选。

- B 提供可验证的 capture certificate、准确 Job/attempt/phase identity、同一 MySQL checkpoint 与 dump 内容绑定、source/dump evidence 的登记事实和 sealed staging 的长度/摘要/所有权。若 B 不能证明 A 的来源计数事务与 dump 同一 checkpoint，不能把统计比较写成通过；应改用 B 受控的同一冻结视图重取计数。
- B 另需实现真实的 `RestoreTargetReadProofVerifier`：以独立权威证明隔离目标安装/库身份、已完成的规范化写入、与 dump 绑定的目标预期行数、准确 evidence 和只读数据库凭据，并在事务结束前复查。当前只有 A 的接口与本地夹具；不能把夹具结果当作真实恢复验收。
- D 在任务配置中固定经独立审核的 registry pin，并在捕获时复核当前 live schema hash；当前代码只验证 registry 中已登记的 observed hash，不重新测量运行库的完整 schema。
- D 只有取得 B 的 sealed staging 和证书事实、A 的两类校验结果、准确 task/attempt/config/deadline 后，才可组装 `PartResult`。A 元数据不能替代 B runner、C artifact/finalizer 或 D 的成功/eligibility 判定。
- A 仍需完整 SQL 行与 Secret/ref 的生产捕获/恢复规范化、A/B/C/D 交叉评审、真实隔离 MySQL 和大数据量验证。合成投影 fixture 不能当作生产数据行覆盖证明。

合成 `users` 恢复向量现将历史账号置为 `is_active=false`，并把 `password_hash` 设为固定的非 bcrypt 占位值 `!system-backup-password-reset-required!`。正式迁移的 `users.password_hash` 为 `VARCHAR(255) NOT NULL`，原先置 `null` 的向量无法落库；新值满足列约束且不能作为原密码凭据复用。

[Go 用户规范化入口](../backend/internal/systembackupbusinessa/users_restore.go)现在只接受不含密码、LDAP 身份或登录别名的来源投影与独立目标 ID/用户名/邮箱映射，拒绝错误源 ID、超出 MySQL `INT` 的主键、非法角色和不可落库的文本/时间；生成的完整 `models.User` 行强制停用、`auth_provider=local`、清空外部身份/别名/last_login，并写入同一不可认证占位值。这是可供后续目标写入器消费的纯转换；它不认证 B dump、不证明映射来源或唯一性，也不执行 SQL。生产写入、账号重新启用与密码重置流程仍须单独验收。

增量批处理 `NormalizeUsersForRestore` 要求每个来源用户恰有一条映射、目标 ID 无重复，按目标 ID 输出全批结果并保留不可由调用方改写的 source→target 关系；后续 FK 可通过 `TargetID` 解引用。[配额规范化入口](../backend/internal/systembackupbusinessa/quota_restore.go)仅接收该关系中的用户，要求配额 ID 映射闭合、同一用户至多一条配额及每个目标用户有独立目标容量。`max_cpu_cores` 用迁移 009 的 `DECIMAL(10,2)` 字符串精确比较，超额或非规范十进制直接失败；任一错误不返回部分配额。目标容量必须由 B/D 的隔离目标权威提供，当前代码不认证该来源，也不执行 SQL。MySQL collation 唯一性、目标库既有行和 restore-write 权限仍必须在写入前由 B 验证。

[北向认证挑战完整行规范化入口](../backend/internal/systembackupbusinessa/northbound_challenge_restore.go)覆盖正式迁移 045 的 `northbound_auth_challenges` 字段：按独立来源→目标 ID/challenge ID 映射生成可写行，保留 v12 草案要求的 nonce hash 与 key ID，但强制 `status=expired`，把 `expires_at`、`used_at` 和 `updated_at` 固定到 B 提供的目标数据库 UTC 时间之前，并清除来源 IP。批量入口拒绝映射缺失/重复、大小写冲突、非法 hash/状态/时间，任一失败不返回部分行；空批次也要求有效目标时间。生产仓库的 `ClaimChallenge` 会把 issued 行置为 `processing`，故草案来源状态闭集已补上 processing，fixture 证明其也会失活。B 仍须独立认证 dump、目标时间/映射、目标库唯一性与写权限；当前入口不执行 SQL，也不能证明历史 nonce 在源端已撤销。

[北向会话完整行规范化入口](../backend/internal/systembackupbusinessa/northbound_session_restore.go)以已规范化用户映射重建 `northbound_sessions.user_id`，保留经闭集校验的历史 refresh hash、hash history 与 scope JSON，并把 `status` 固定为 `revoked`，将 access/refresh 过期及 `revoked_at` 固定在目标数据库时间之前。批量入口拒绝来源/目标 ID、session ID 和当前 refresh hash 冲突；单行入口拒绝不合法的历史 JSON、未知/重复 scope、非法时间与未映射用户，失败不返回部分行。scope 闭集按当前 `northbound/types.go` 固定，运行时增加 scope 必须触发 A 策略复审；D 仍须交叉评审这项候选实现。B 必须独立认证 dump、目标时钟/用户映射、目标库唯一性和写权限；当前入口不执行 SQL。

B 解码正式迁移 045 的 `DATETIME(6)` 时须按 UTC 语义给 A，目标时点须由隔离目标库的 `UTC_TIMESTAMP(6)` 取得并认证；调用方传入的本机时间不能代替。SQL 写入前仍需按目标 MySQL 的 collation 与既有行重检 session ID 和 refresh hash 唯一性。

[北向调用者策略完整行规范化入口](../backend/internal/systembackupbusinessa/northbound_caller_policy_restore.go)覆盖正式迁移 057 的 `northbound_caller_policies`：主键 `user_id` 和可空 `updated_by` 均通过 A 已闭合的用户映射转换，来源 scope JSON 仅允许当前认证/管理端一致的十项生产闭集，拒绝未知或重复 scope、启用但空 scope、无效时间及重复用户；输出策略始终 `enabled=false`。SQL 列可空的 `updated_by` 在 Go 来源投影中保留 nil 区分，B dump 解码器不得把它默认为 0。用户名、邮箱和 DTO 专用 `Scopes` 不属于写入行；B 须另验目标用户占用、真实 dump 与 restore-write 授权，D 须对策略做交叉评审。

`enterprise_auth_settings` 的密码清除语义已按生产运行时代码修正：`LDAPBindPasswordCiphertext == nil` 会继承环境变量 `LDAP_BIND_PASSWORD`，非 nil 的空字符串才是明确清除。v12 合成恢复向量现在输出 `ldap_bind_password_ciphertext=""`；只读恢复校验会把 SQL `NULL` 和任何非空密文都计为失活违规。B 的正式写入器必须保留这一 `NULL`/空串区别，并验证 Secret/ref 的准确版本后才可规范化；当前向量及只读计数不证明生产密文来源、逐行数据或实际恢复写入。D 需交叉评审该语义与目标环境变量行为。

[企业认证完整行候选规范化入口](../backend/internal/systembackupbusinessa/enterprise_auth_restore.go)现覆盖迁移 050 的全部非密文 SQL 字段：来源投影将原密码列区分为 SQL NULL、明确空串和非空密文引用，只有后者携带脱敏的不可变 Secret/ref 版本；任何来源密文都不会进入输出行。批量入口要求冻结 registry 的独立 pin、已规范化用户映射、准确 evidence ref 和 B 的 `EnterpriseAuthSourceProofVerifier`，空表也必须证明；错误来源、未来 provider、重复/越界 ID、未知密码状态或版本别名、未映射 `updated_by` 均零部分结果。输出保留其余历史列并强制 `enabled=false`、`ldap_bind_password_ciphertext=""`。当前 proof 只有本地夹具，B 必须对真实 dump、SQL NULL/空串/密文状态、typed Secret/ref 的准确版本和目标写入权限实现独立证明；D 需交叉评审。单行纯转换入口本身不构成恢复授权。

该增量的完整 `go test ./internal/systembackupbusinessa -count=1 -p=1` 第一次遇到本机 Go 编译器 `0xc0000043`，在同一隔离缓存下重试相同命令后退出 0，`CLEANED a-enterprise-row-test=True`。用例覆盖全行失活输出、SQL NULL/空串/非空来源状态、更新者 FK、空表 proof、版本漂移、输入错误及 proof 失败零部分结果。未安装依赖；测试构建缓存及临时目录已清理。尚无真实 B proof 或目标 MySQL 行写入回执。

`llm_models` 还存在第二条凭据路径：运行时的 `SecretRefService.ResolveString` 在 `api_key` 为空时会解析 `api_key_secret_ref`。v12 合成向量现将两列都置为 SQL NULL，A 只读恢复校验同时拒绝两列的非 NULL 值。新增[模型完整行候选规范化入口](../backend/internal/systembackupbusinessa/llm_model_restore.go)覆盖迁移 045/056：来源直接 key 和 Secret 引用分别以 NULL/空/非空状态及不可变版本进入 B proof，不把原值传给 A；目标模型禁用并清空两列。价格使用精确 `DECIMAL(18,8)` 字符串，避免现有运行时 `float64` 模型丢失小数精度。模型列表 JSON 只允许运行时的 `id`/`display_name` 闭集，URL 禁止用户信息和查询参数，任何错误都不返回部分目标行。B 须独立实现真实 dump、两条凭据路径的 typed Secret/ref 认证、映射/目标占用和写入授权；D 须交叉评审。当前候选实现不执行 SQL。

此增量的 `node scripts/system-backup-a-object-fixtures.test.mjs` 为 3/3，共享合同测试为 70/70；完整 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次退出 0，`CLEANED a-llm-model-test=True`。Go 用例覆盖双凭据失活、精确价格、完整列、空表/失败 proof、版本漂移、URL/JSON/价格负测和重复名称零部分结果。未安装依赖，隔离构建缓存与临时目录已清理；真实 MySQL 与 B proof 仍待验证。

[Gateway token 别名完整行候选规范化入口](../backend/internal/systembackupbusinessa/gateway_alias_restore.go)覆盖迁移 038 的 BIGINT ID、B 拥有的 `instance_id`、历史 SHA-256 token hash、三个非空时间和可空 `last_used_at`。A 将目标 `expires_at` 固定为 B 提供目标数据库 UTC 时间所在整秒的前一秒，保证 MySQL `TIMESTAMP` 秒级列落库后仍早于当前目标时点；原始 token 从不进入 A。批量入口要求冻结 registry pin、来源→目标别名与实例映射，以及 B 对真实 dump、映射、目标时钟和目标 `instances.access_token` 已清除的独立 proof，空表也要证明。运行时 `GetByAccessToken` 先查 B 的 `instances.access_token`，才查 A 的过期别名；因此单靠 A 别名过期不能证明旧直连 token 失效。B 必须在实例恢复中清除直连 token，并对目标唯一键、FK 与写入权限负责；D 需交叉评审这一跨 owner 顺序。当前接口不执行 SQL，proof 只有本地夹具。

该增量完整 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次退出 0，`CLEANED a-gateway-alias-test=True`；用例从来源尚活跃的别名证明目标到期、BIGINT/实例映射、历史时间保留、空表 proof、B 直连 token/目标时钟 proof 失败零部分结果、非法 hash/孤儿实例/重复 hash 拒绝。未安装依赖，隔离构建缓存和临时目录已清理。真实目标 MySQL 写入及 B proof 仍待执行。

[风险规则完整行候选规范化入口](../backend/internal/systembackupbusinessa/risk_rule_restore.go)覆盖迁移 079 的所有列，保留通过闭集和 Go 正则校验的历史规则内容、动作、严重度、排序和审计时间，但目标 `is_enabled` 恒为 false；来源和目标规则 ID 映射须与 `risk_hits.rule_id` 字符串引用一致，内置规则身份不得改名。B proof 必须认证真实 dump、映射及隔离目标的应用启动门禁，空表同样需要证明。运行时 `NewRiskRuleRepository` 在构造时会补种缺失的内置规则，且补种值 `IsEnabled=true`；若目标应用在 A 的失活校验和 D 的放行之前启动，会重新出现启用规则。反过来，`RiskDetectionService` 在无启用规则时返回 allow，因此隔离恢复目标不能在规则重新审阅前服务用户流量。当前只有 A 候选转换和本地 proof 夹具，没有 B 启动门禁、生产 SQL 写入或 D 放行实现；D 需交叉评审启动顺序和规则重启策略。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次被本机 Go 工具 `0xc0000043` 中断；在同一隔离缓存下重试相同命令后退出 0，`CLEANED a-risk-rule-test=True`。用例覆盖完整行失活、空表和启动门禁 proof、无效动作/严重度/正则、规则 ID 冲突及内置规则映射拒绝。未安装依赖；隔离构建缓存、遥测目录和临时目录已清理。测试没有接入 B 真实 dump 或目标 MySQL。

[风险命中完整行候选规范化入口](../backend/internal/systembackupbusinessa/risk_hit_restore.go)覆盖迁移 028 的全部 SQL 列。`trace_id` 改用 B 证明的跨表映射，历史 `request_id`、规则名称/动作/等级和时间保留；`match_summary` 按 v12 合成向量统一写成 `[REDACTED]`，不把可能含敏感内容的原摘要带入目标库。可空用户、实例、运行 Pod、模型调用、会话和 gateway 归属仅在 B 提供闭合映射时重建，`rule_id` 必须命中同批风险规则映射；原 SQL NULL 保持 NULL。B 的 `RiskHitSourceProofVerifier` 必须独立认证真实 dump、跨表映射、目标占用和写入授权，空表也须证明。当前接口与本地夹具不执行 SQL，尚无隔离目标 MySQL 回执；D 需交叉评审摘要脱敏和归属映射策略。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次退出 0，`CLEANED a-risk-hit-test=True`。用例覆盖完整行脱敏、空表 proof、SQL NULL、缺失规则、引用漂移、非法字段、同一用户映射不一致和 proof 失败零部分结果。未安装依赖，隔离构建缓存、遥测目录与临时目录已清理；该结果不等于 B 真实 dump 或隔离目标 MySQL 验收。

[聊天会话完整行候选规范化入口](../backend/internal/systembackupbusinessa/chat_session_restore.go)覆盖迁移 079 的全部 SQL 列：用户/实例可空引用经 B 映射，历史标题与时间保留，目标 `session_id` 不得等于自身或本批任何来源 `session_id`，`last_trace_id` 一律写 SQL NULL。B proof 须认证 dump、目标库唯一性、用户/实例存在、与 `chat_messages`、`model_invocations`、`risk_hits` 一致的会话 ID 映射及写入权限。运行时即使无 `last_trace_id`，仍可能按会话 ID 从模型调用记录回查 trace；因此仅清空游标不足以证明来源执行不可继续。D 必须结合模型调用内容脱敏、目标会话标识发放和应用流量门禁交叉评审。当前只有纯转换和本地 proof 夹具，无真实目标 SQL 写入。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次退出 0，`CLEANED a-chat-session-test=True`。用例覆盖完整行与游标清除、空表 proof、SQL NULL、来源 ID 复用拒绝、来源集合碰撞、引用漂移、时间异常及 proof 失败零部分结果。未安装依赖，隔离构建缓存、遥测目录和临时目录已清理；B 真实 proof、隔离 MySQL 和 D 评审尚未通过。

[聊天消息完整行候选规范化入口](../backend/internal/systembackupbusinessa/chat_message_restore.go)覆盖迁移 079 的全部 SQL 列，保留历史 role、请求 ID、序号和时间，把 LONGTEXT `content` 固定为 `[REDACTED]`。每条消息须引用同一批 `chat_sessions` 来源→目标会话映射，`trace_id` 另由 B 证明跨表一致的来源→目标映射，目标 trace 不得与本批任何来源 trace 重合；可空用户、实例和模型调用引用分别映射，原 SQL NULL 保持 NULL。B proof 须独立认证真实 dump、跨表映射、目标占用和写入权限，空表也不能跳过。当前只有 A 纯转换与本地夹具，D 需联审内容脱敏后可用的历史审计范围及应用流量门禁。

`chat_messages` 首轮完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-chat-message-test=True`。发现 `risk_hits` 仍保留来源 trace 后，已把该表也改为受 B proof 约束的目标 trace 映射，并为两表补充来源 trace 重用、同源拆分与异源合并负测。最终文件状态再次运行完整包，同样首次退出 0，`CLEANED a-chat-risk-final=True`。未安装依赖，两次隔离缓存、遥测目录与临时目录均已清理；测试仍未接真实 B dump 或目标 MySQL。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 首次被本机 Go 工具 `0xc0000043` 中断；在同一隔离缓存下重试相同命令后退出 0，`CLEANED a-caller-policy-test=True`。测试覆盖禁用输出、两处用户外键、可空更新者、生产认证与管理端 scope 闭集同步、未知/重复权限及零部分批量结果。未安装依赖；临时构建缓存和遥测目录已清理。测试未接 B dump，也未写隔离 MySQL。

B 拥有的 `northbound_operations.session_id` 是字符串引用，正式迁移 045 未声明外键；B 恢复该表时仍须使用同一份来源→目标 session ID 映射，不能因为数据库没有 FK 就保留指向旧会话的字符串。A 的批量入口不代替 B 对跨域字符串引用的验证。

会话规范化及统一错误分类增量以 `go test ./internal/systembackupbusinessa -count=1 -p=1` 完整包验证，首次退出 0，`CLEANED a-session-category-test=True`；上一轮规范化入口的完整包测试同样退出 0，`CLEANED a-session-restore-test=True`。用例覆盖目标用户 FK 映射、撤销/到期、历史 JSON 与 scope 闭集、运行时 scope 漂移、批量冲突零部分结果和五类 A 恢复错误的 `normalization_failed` 映射。未安装依赖，隔离 Go 缓存与临时目录均已清理。两轮均为本地纯转换测试，不是 B dump 或真实 MySQL 恢复回执。

此增量完整包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-user-quotas-test=True`；用例覆盖批量映射闭集、不可变结果副本、孤儿/重复配额、精确 CPU 小数、目标容量不足及零部分结果。随后发现正式 SQL 配额数值列允许 `NULL`，来源投影已改为显式可空指针且规范化器拒绝 nil，避免把 `NULL` 默默解释为零。修正后的四文件定向 `go test` 再次退出 0，`CLEANED a-user-quotas-null-test=True`，覆盖 SQL NULL 拒绝；最终增量尚未重跑完整包。两轮均未安装依赖，隔离构建缓存与遥测目录已清理。B dump 解码器尚未接入，必须原样保留 SQL NULL 区分。

验证：先运行完整 `go test ./internal/systembackupbusinessa -count=1 -p=1`，退出 0，`CLEANED a-users-restore-test=True`；补上 MySQL `INT` 上限拒绝后，定向 `go test internal/systembackupbusinessa/users_restore.go internal/systembackupbusinessa/users_restore_test.go -count=1 -p=1` 再次退出 0，`CLEANED a-users-restore-final=True`。负测覆盖错误映射、越界主键、非法角色、超长/控制字符/无效 UTF-8 和非法时间；bcrypt 比对确认占位值无法认证。两轮均未安装依赖，构建缓存和遥测目录均已清理。最终增量尚未重跑完整包；较早完整包结果不覆盖之后的主键上限改动。

验收状态：A 本地包测试与共享合同测试覆盖 15 表闭集、草案拒绝、pin 漂移、SQL 原子失败、proof 缺失、结果差异、溢出、类别统计、错误分类和运行时 check ID 与合同一致。本轮 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-businessa-failure-test=True`；未安装依赖。真实 B proof 和生产 `PartResult` 尚无通过回执。

只读恢复校验增量的共享合同测试 `node scripts/system-backup-contract-artifacts.test.mjs` 为 70/70；完整 Go 包 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-restore-verify-test=True`。用例覆盖 24 个 draft check ID 与合同顺序一致、单个只读事务、B proof 前后复查、行数与失活状态差异、SQL/提交/proof 失败零部分结果。未安装依赖，隔离构建缓存与遥测目录已清理。此处的 B proof 是本地夹具，真实隔离目标 MySQL 尚无接收回执。

挑战状态合同修正后，`node scripts/system-backup-a-object-fixtures.test.mjs` 3/3 通过；新增规范化器的完整 Go 包测试退出 0，`CLEANED a-challenge-restore-test=True`。Go 测试执行期间又追加了空批次目标时间门禁和负测，因此最终文件再以相同三文件定向命令复测：第一次被本机 Go 编译器异常 `0xc0000043` 中断，构建缓存已清理；重试 `go test internal/systembackupbusinessa/northbound_challenge_restore.go internal/systembackupbusinessa/users_restore.go internal/systembackupbusinessa/northbound_challenge_restore_test.go -count=1 -p=1` 退出 0，`CLEANED a-challenge-final-retry=True`。未安装依赖，测试均不连接目标 MySQL。
