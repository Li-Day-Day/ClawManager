# D：首条 API 链接线与合并入口（2026-10-26）

本轮已实际交付 HTTP 路由、A action/read 装配、创建事务编排、CLI 材料组合、前端创建调用封装及可执行冒烟入口。**首条真实链仍未跑通**：现有 v12 backup/preflight POST 没有 requestBody/schema/defaults 合同，生产 TaskWriter/TaskDetails、B 执行/relay 和 C provider/catalog 尚未交付。生产构造明确保留 nil，不创建假任务、不启动假执行器、不返回虚构 ID。没有安装依赖、提交、部署或连接真实 MySQL/provider。

## 已固定的路径与实际调用点

所有 URL 复用 `contracts/system-backup/v12/admin.openapi.json`，不增加自创领取或状态上报 HTTP URL。

| 链路 | 路由 / 调用 | 当前实际状态 |
|---|---|---|
| 登录 / 当前 session | `POST /api/v1/auth/login`、`GET /api/v1/auth/me`；main 的 `backupSessionRecorder` → `AuthService.WithSystemBackupSessions` | 原实现存在；必须启用原 SQL session 记录并使用同一个 recorder，只有普通 JWT 验签不够 |
| 有效配置 | `GET /api/v1/admin/system-backup-config` → `liveBackupRead.service` → `ReadActiveConfigDTO` | 原真实 SQL/read scope 路由存在；仍需要真实 deployment pins/session/配置 |
| 创建备份 | `POST /api/v1/admin/system-backups` → `registerBackupTaskMutations` → `systembackupapi.Handler.Create(BackupTask)` | 本轮真实注册；当前生产 `not_ready` |
| 创建预检 | `POST /api/v1/admin/system-backup-preflights` → 同一个 Handler/Create(PreflightTask) | 本轮真实注册；当前生产 `not_ready` |
| 创建服务 / 幂等调度 | `SQLApplication.CreateAndEnqueue` → A `SystemBackupActionAuthorizer.Scope` → local `TaskWriter.Prepare` → 单一 RR → `AuthorizeAction` → `PreparedTaskWrite.Stage` → 关闭 SQL 能力 → `RecheckAction` → 唯一 commit | 本轮事务编排已实现；领域 Stage 尚无生产实现，不能只返回 ID。Stage 必须同事务写 task/config snapshot/原 `next_reconcile_at` 调度及审计，并实现原 scope/key/hash 历史重放 |
| 执行端领取 | `systembackupcontroller.ClaimCoordinator.Acquire/Renew/Release` | 原安装内 DB-time CAS 存在；候选选择、状态推进、B runner/Job/relay 的完整生产组合仍缺。没有新增浏览器可调用的 claim/status URL |
| 备份 / 预检详情 | `GET /api/v1/admin/system-backups/:id`、`GET /api/v1/admin/system-backup-preflights/:id` → Handler.Detail → SQLApplication.Read* → A 原 read scope → TaskDetails | 本轮已从固定 unavailable 分支改成 typed adapter 接点；生产 adapters 未装配时仍 `not_ready`。禁止将 `GetTaskBase` 伪装成完整 DetailResource |
| 列表 / 事件 / operation | 原 `ListTaskDTO`、`ListTaskEventsDTO`、`GetOperationDTO` / `ListOperationDTO` | 原真实路由保持；依赖同安装、当前权限及 SQL 来源 |
| 结果 | 预检完整 detail/report reference；备份完整 detail + `GET /system-backups/:id/manifest` | 后者仍明确 unavailable；必须取得真实 C provider/artifact 与受审 manifest reader 才可启用 |
| overview/catalog/prune/promotions/logs | 原显式 unavailable 路由 | 本轮未用部分 control 投影冒充完整当前事实；不属于可虚构补齐的依赖 |

`main.go` 以独立 `/admin` group 注册创建路由，避免继承只读 fixture admission。唯一生产链接位置是 `backend/cmd/server/system_backup_tasks_live.go:linkedSystemBackupTaskApplication`：给 `writer`、`details` 提供经过评审的真实实现即可进入 `composeSystemBackupTaskApplication`。它直接加载 A 的 action/read authorizer，使用同一 SQLLoginSessions 与原 `SYSTEM_BACKUP_READ_PINS_PATH/SHA256`，并构造 30 秒上界的 SQLApplication，不增加新的角色、pin 格式或 MFA。

本轮还修复首链的传输装配缺口：A action scope 要求 `Request.TLS != nil`，原 main 只调用 ListenAndServe。现在可通过挂载的绝对路径 `SYSTEM_BACKUP_API_TLS_CERT_FILE` / `SYSTEM_BACKUP_API_TLS_KEY_FILE` 启用同一监听地址的真实 HTTPS；两者缺一、非绝对路径或 key pair 不合法会在启动时准确拒绝，不输出私钥或路径诊断。未设置时保留原 HTTP 服务，此时真实创建授权仍会拒绝明文。现有 ingress 应使用 TLS passthrough 或到此 listener 的真实 TLS 重加密；`X-Forwarded-Proto` 不建立 TLS，也没有用头字段修改 Request.TLS。新增测试使用临时 Ed25519 证书和实际 loopback TLS handshake，文件由原测试 owner 清理。

传输只做现有 Idempotency-Key 单值/文法、JSON media/syntax、无 query、64 KiB 上限和 closed Task 响应适配；**JSON syntax 通过不是业务准入**。请求 DTO/defaults/JCS 完全留给待审 TaskWriter，Prepare 只做本地确定性解析，不读凭据、不接触 provider。错误 code/status 逐项对原 `error_status_map` 校验，包含 capacity 422、isolation 409、idempotency_expired 410、rate_limited 429 与 Retry-After；未就绪 503，未分类内部错误 500，不返回原始 SQL/provider 诊断。异步执行失败仍由 GET 200 的 task.status/failure_category 表达。

SQL 能力保留原 context/事务，不暴露 DB/Tx/Commit/Rollback，关闭时清理未消费 rows；保留句柄、反射整值副本及 Row 在最后授权阶段都不能发出 SQL。吞掉的执行/扫描/非法控制语句错误锁存并阻止提交。提交不明不补偿、不自动重建；原 body/key 后续进入授权的幂等历史分支。

## bootstrap 的真实构造组合

`backend/cmd/system-backup-bootstrap/materials.go` 的 `bootstrapMaterialInputs` 是显式 Go 参数，接收 A 的原 `BootstrapCandidateAuthority`、`nonce.Binding`、两个各自 purpose 的 `ca.Binding` 和 `BootstrapCandidateSelection`。`composeBootstrapMaterials` 实际调用 `systembackupbootstrapmaterials.New` → `Materials.Owners` → `NewBootstrapDeploymentCandidates`；`runWithBootstrapMaterials` 继续走原 `run/LoadBootstrapDeployment/Apply`，不另开 credential/SQL 通道，不新增 bypass flag。

当前 main 没有原受控 mapping/authority，仍调用原 `linkedOwnerAdapters`，**默认依旧缺 27 槽**。构造模型证明三个材料 owner 只能将结构缺口从 27 降到 24，其余必需检查保持；缺 selection 或原 authority 必须拒绝。不能把该组合 helper 当成已部署，不能把 receipt/hash/文件相等当授权。所有原期限、全局 retained nonce 范围、锁序与事务消费由 A 原构造和 D 原 consumer 保留。

A 的独立交接入口为 `system-backup-a-api-readiness-20261026.md`；未修改 A 专属安全包，也未向其他聊天发送消息。现有通用 `backend/internal/middleware/cors_middleware.go` 的 Allow-Headers 只包含 Content-Type/Authorization/X-Requested-With；本轮首链可经同源前端或直接 API 运行。若部署采用跨源前端，需由共同中间件 owner 明确放行 `Idempotency-Key`（以及需要的响应暴露头），否则浏览器 preflight 会先拒绝；本轮没有并发改写 A 的安全中间件。

## 冒烟：模型与真实环境共用同一入口

```powershell
node --test --test-isolation=none scripts/system-backup-d-api-smoke.test.mjs
& .\scripts\system-backup-d-api-validation.ps1
node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.app.json --noEmit --incremental false
```

Node 的普通 child-process test 模式在本环境被 EPERM 拒绝，同进程模式已实际运行。模型结果只能是 `model_chain_passed`。模型同时覆盖 preflight 与 backup/manifest、登录、配置、同键重试、两个拒绝会话、轮询与失败终态；负例拒绝 fixture、未装配、重复入队、hash 漂移、跨安装可见、没有 claim、结果引用漂移、未装配 manifest、无界 pending/observer 等。

真实入口是 `node scripts/system-backup-d-api-smoke.mjs`，仅从现有受控环境读取：

| 输入 | 说明 |
|---|---|
| `SBK_SMOKE_BASE_URL` | 实际 HTTPS origin；HTTP 仅允许 localhost/loopback |
| `SBK_SMOKE_KIND` | `preflight` 或 `backup` |
| `SBK_SMOKE_REQUEST_FILE` / `SBK_SMOKE_KEY` | 合同到齐后的真实请求文件与原幂等 key；未知提交保留原值，不生成新 key |
| `SBK_SMOKE_ACCESS_TOKEN` 或 `SBK_SMOKE_USERNAME/PASSWORD` | 使用当前 session 或真实登录；不要把值写到命令/日志 |
| `SBK_SMOKE_DENIED_TOKEN` / `SBK_SMOKE_FOREIGN_TOKEN` | 实际权限不足、外安装会话；既验证读取拒绝，也验证创建拒绝 |
| `SBK_SMOKE_OBSERVER` | 原部署只读 SQL/执行端观察模块的绝对路径，导出 `observeTask(input)`；没有 observer 时在发起任务前拒绝 |
| `SBK_SMOKE_TIMEOUT_MS` | 默认 120000，最多 600000；单次请求/observer 默认最多 10000ms |
| `SBK_SMOKE_EXPECT_STATUS/EXPECT_FAILURE` | 成功演练默认 succeeded；现场注入已约定执行失败后用 failed + 准确 failure_category 再跑一轮 |

observer 接收 stage/mode/kind/publicID/installationID/configVersion/AbortSignal，不接收 bearer/密码。它应从独立原 SQL/执行端读取并返回 `{publicID, installationID, configVersion, taskCount, enqueueCount, claimCount, attemptCount, status, failureCategory}`。`enqueueCount` 是原任务 `next_reconcile_at` 或正式调度机制的准确唯一计数，不要求创建新 queue 表。成功预检还返回 `{resultPublicID,resultSHA256}` 与 report reference 对照；备份返回 `{manifestSHA256}` 与原 manifest checksum 对照。after-replay 检查一条 task/一条 durable enqueue，terminal 检查真实 claim、attempt、终态和结果绑定。

脚本不打印 response/body/observer 错误，最终输出只含模式、阶段、closed code、结果与验证标志。会话/配置失败或非 live 来源立即停止；没有无界等待，不刷新/自动改变幂等 key。真实 observer/现场失败注入未提供，因此本轮没有执行真实冒烟，也没有声称看到数据库或 B 执行器完成。

## B/C 合入当天逐项核对

1. **请求合同**：补入 `admin.openapi.json` 两个 create operation 的 requestBody；附 owner closed schema、缺省/null 规则、JCS/hash 向量及同键冲突/过期策略。当前不能用 `{}` 作为生产 DTO。
2. **D writer/事务**：实现 TaskWriter/PreparedTaskWrite，核对 migration 065/066/067 的原复合幂等约束、完整必需 task/config 字段、原 deadline、queue/capacity/kill-switch、审计和同 key 未知提交读回；不可复用 C1 producer Register 充当业务 task INSERT。
3. **B 执行**：接原 ClaimCoordinator 与受审 target/claim/fence/lease；核对 BackupStatuses 与 SimpleTaskStatuses、attempt/phase/Job UID+generation、relay 序列/撤销、超时/取消/failed 分类及真实权限；`status_relay` 合同仍必须补齐。
4. **C facts/结果**：提供当前 provider/artifact/secret/KEK/签名、preflight freshness、report evidence 与 manifest reader，明确静态未就绪和执行失败的分类。详情必须在原 read snapshot/recheck 内组合，不把历史 valid/control hint 当当前健康。
5. **迁移与领域缺口**：`system_backup_catalog_imports/records/scan_states` 三张计划表与 `recovery_catalog_records/restore_target/status_relay/catalog_scan_record` 四份合同按原交接逐项核实；未交付不可推导 schema/default/provider。
6. **安全/现场**：全部 30 owner 实际装配（当前缺 27）、原 grant/RBAC/registry/ref/materials/retained 范围/容量、真实 SQL UTC/read identity、登录 session、配置启用的原风险/MFA要求与 provider scopes 必须齐备。bootstrap disabled-v1 不等于业务 effective_enabled。
7. **真实执行**：先 preflight 再 backup（按最终请求合同决定是否依赖前一 report），运行真实成功轮与约定失败轮、同键重试及两个拒绝会话，保留同轮源码/迁移/hash/SQL/执行端/HTTP 观察与最终退出码。模型/handler 单测不计真实链通过。

完整 GC 的当前受审公开 Collect、原 33+7 准备及生产材料缺口保持 `system-backup-d-gc-full-wiring-20261026.md` 原边界，本轮未并发改写 GC/producer/security 的共同文件。

## 当前验证终态

2026-10-27 收尾：`f0e09233447a4d9a86ce614b31fd8431` 在保留首轮中断日志后，使用原独立快照/缓存重跑成功。原生 Go 默认 vet 保持开启，task-http 5 个根测试、server-composition 4 个根测试（含实际 TLS 握手）、bootstrap-requirements 3 个根测试均 PASS，三个原生退出码均为 0；冻结字节未变、当前 backend/contracts 文件集及字节与快照一致、cleanup_verified=true，全部四个本轮 D API 临时目录均不存在。该结果限定于三个指定包/测试范围，不是全仓测试、Linux 构建、真实 MySQL 或生产启动验收。

最终 Node 同进程模型 14/14 PASS，TypeScript noEmit/incremental=false 退出 0；schema/contract strict 最新退出码仍分别为 1/1，缺口保持三张表、四份合同。源码与日志 SHA256、原生回执链接及准确边界写入 `docs/evidence/d-api-readiness-closeout-20261026.json`；最终模型/类型检查/严格门禁日志使用 `-final.txt` 后缀。真实冒烟、原 provider/SQL/执行器观察及安全批准均未执行或替代，生产 writer/details 继续显式 nil，CLI 默认 27 槽保持。

详细同源回执在 `docs/evidence/d-api-native-*.json`，本轮日志和源码 pins保留，独立 `.tmp-d-api-<id>` 在每次测试 finally 中删除；不删除 ae7af 或 A 的目录。最终限定接收与各轮差异由同目录的 API closeout JSON 补充，不能用首轮传输通过背书随后新增事务代码。

ae7af383 的最终 receipt 现已核实为 **failed**，不是完整接收：targeted_exit/full_exit/seeds_exit 均为 0，full 十包均有原生 package PASS（最后 17:10:39），但 Linux server 编译因 `There is not enough space on the disk` 原生失败，后续完整构建/source postcheck 未完成；准确 owner 已清理（cleaned=true）。其原日志与失败历史保留，本轮没有重跑这组联合长测。其冻结来源亦不包含本轮 API/action/materials 新字节。

A 新材料轮 `148b2d3547074f7ca4c4a046f19be373` 的原 receipt 也保持 failed：targeted/full exit 0，首个 Linux security 编译 exit 1，cleanup=true。不能执行其要求 passed receipt 的接收器来登记整轮通过；具体安全批准仍待 A/原 owner，D 的 adapter 接线和本地模型不替代它。

A 后续 `60108f6ccafb47069d9557edcb92fd01` 回执也为 failed：targeted_exit=0、full_exit=1、cleanup=true；失败阶段是 full，不能沿用前轮 full 通过或登记安全接收。本轮 D 的 `f0e09233447a4d9a86ce614b31fd8431` 首次进程中断时出现 `vet.exe exit status 0xc000026b`，原始日志保存在 `.task-http.interrupted.txt`，重跑记录单独保留，不把中断当 PASS。
