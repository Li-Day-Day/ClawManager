# A：首条 API 链与材料装配接点（2026-10-26）

本轮使用当前 checkout，保留 A/D 已有修改；不修改 D 的 server、handler、CLI 或前端，不安装依赖、不提交、不部署。新增代码的准确原生验证由 `scripts/system-backup-a-api-readiness-validation.ps1` 记录。2026-10-27 更新：修正轮 148b 的六包定向 47 根/276 条及五包完整回归 342 根/2,637 条全部通过，无失败或跳过；原轮 Linux 编译因磁盘空间失败，整轮仍保持 failed。四包 Linux 补证 `4428875c...` 已成功，测试/编译的 401 项依赖输入完全一致，所有本轮临时产物均已清理。限定[机械接收](evidence/a-api-readiness-native-148b2d3547074f7ca4c4a046f19be373.reviewed.json)的 write/check 均退出 0；边界见末节，不登记整轮或当前完整 checkout 通过。

旧 ae7af383 的[最初观察](evidence/a-api-readiness-prior-entry-observation-20261026.json)仅记录当时看到的日志；其后原 terminal receipt 已出现，状态为 failed/cleaned，targeted/full/seeds 退出 0，Linux server 构建失败。旧字节不包含本轮 action/materials，且 read_scope 与当前不同，不能接收为当前来源通过。

## D 接入首条 HTTP / service 链

公开构造：`systembackupsecurity.LoadSystemBackupActionAuthorizer(sessions, pinsPath, pinsSHA256)`。`sessions` 必须是应用登录/刷新已实际调用 `RecordPair` 的同一个 `*SQLLoginSessions`；现有 JWT 中间件单独验签不建立 SQL session。pin 文件直接复用 `SystemBackupReadPins`，含 installation、config version、RBAC version/SHA 和 registry directory。构造不打开数据库，不读取新凭据，不引入新的角色或 grant。

disabled-v1 初始化后若启用产生新 config version，pin 必须更新为真实当前 active version，重算文件 SHA 并重载 authorizer；不能继续沿用 v1 或回退旧 pin。只读观察到 D 的 SQLApplication/server 已调用上述 action scope、同事务授权和最终复查；这不是 D 新源码的测试接收。真实 TaskWriter/details 当前仍未装配，入口保留 not_ready。

HTTP handler 用固定 operation 常量调用 `authorizer.Scope(request, CreateSystemBackupPreflight)` 或 `CreateSystemBackup`，再把返回 scope 交给真实业务 service。只接受准确 HTTPS POST 路径、无 query/encoded path、单一合法 Idempotency-Key 及现有 access bearer。D 负责 Content-Type/body/schema、请求 hash 和 HTTP envelope。scope 不是业务批准，不应在 HTTP middleware 中开短事务授权后丢弃。

业务 service 的准确调用顺序：

```go
ctx := scope.Context() // 可以派生 timeout，但必须保留此 context 的值和取消链
tx, err := db.BeginTx(ctx, businessTxOptions)
// err => 原合同错误；defer tx.Rollback()
installation, err := scope.AuthorizeAction(ctx, tx)
// err => 必须回滚；接着才可获取业务/operation/target 锁
actor := scope.Actor()
key := scope.IdempotencyKey()
// 在同一 tx 检查 effective_enabled（部署开关 AND 当前 enabled）、
// 完整业务准入、幂等/容量/任务/operation/evidence/audit；首次与历史重放均授权。
err = scope.RecheckAction(ctx, tx, installation)
// err => 必须回滚；再检查业务 guard/context 并执行唯一 commit。
```

授权检查复用原 installation/config → user/session → RBAC 顺序，检查真实 DB identity、当前 active config 与 pin、当前 user credential/session/撤销、原 RBAC 的 `system_backup.operate`。scope 及其值副本绑定同一事务，任何失败锁存，后续检查不能恢复。D 必须在创建入口前完成其余完整锁协议的核对；该适配不替代 B 的任务状态机或 C1 producer authority，不替代业务的 kill-switch、请求幂等持久化或提交不明恢复。

错误：`ErrSystemBackupReadAuthentication` → 401 authentication_required；`ErrSystemBackupActionValidation` → 400 validation_failed；`ErrRegistrationPermission` → 403 permission_denied；`ErrRegistrationUnavailable` / `ErrProviderEvidenceStorage` → 503 not_ready。session storage 错误保留 unavailable 原因，不能降格为用户无权限。所有错误均按 D 原统一 envelope 输出，禁止返回原始 SQL/provider 诊断。

GET operation、backup/preflight task/detail/events/logs/result 继续用现有 `LoadSystemBackupReadAuthorizer` 和每请求 `SystemBackupReadScope`，不可用 action scope 扩张读取分类权限。合同 `admin-operation-policy.json` 中 create backup/preflight 及普通任务读取的 `recent_strong_auth=none`，本轮未增加 MFA。敏感 evidence 走现有 `SensitiveDownload`、强认证 proof/nonce；provider proof 总是 recent MFA；配置 security-boundary/protection-reduction 条件 MFA，均保持原 API/service。bootstrap 离线 grant 不是人类 MFA，也不能直接开启业务链。

## D 显式装配三项已有材料

新独立包 `internal/systembackupbootstrapmaterials` 避免 `security → nonce/ca → security` 的 import cycle。`New(originalAuthority, nonce.Binding, artifactCABinding, evidenceCABinding)` 返回 `*Materials`。bindings 来自原受控映射：安装、DB UUID/database、canonical config SHA 必须一致；CA purpose 必须各自准确。构造只检查一致性，不能批准 mapping。每项完整参数保留在原 `nonce.Binding/Key` 与 `ca.Binding`，没有 JSON approval bool 或额外授权机制。

```go
materials, err := systembackupbootstrapmaterials.New(originalAuthority, nonceBinding, artifactCA, evidenceCA)
owners, err := materials.Owners(existingOwners) // 复制 maps，仅增加 nonce_hmac/artifact_ca/evidence_ca
// 任何同名槽（含 typed nil）或已有 Candidates 均拒绝，避免静默替换。
candidateRoute, err := systembackupsecurity.NewBootstrapDeploymentCandidates(selections, materials)
owners.Candidates = candidateRoute
deployment, err := systembackupsecurity.LoadBootstrapDeployment(deploymentPath, deploymentSHA256, owners)
result, err := deployment.Apply(boundedContext)
```

`existingOwners` 仍必须包含另外全部 owner；没有假 validator/default。原 CLI 当前只接三 registry，本轮没有擅自修改 CLI：在 D 显式接这三材料且原映射成立后，结构上仍有 **24** 槽未装配；当前 CLI 自身仍缺 **27**。不能把新包存在当作生产已清三槽。

最终只读观察还发现 D 新增了 `cmd/system-backup-bootstrap/materials.go` 的显式 Go 装配 helper；main 仍调用原 `linkedOwnerAdapters`，该 helper 没有被默认入口调用。此新增文件及其测试均位于本轮原生来源之外，由 D 自行验证和签收。

candidate prepare 在同一有界 context 锁前运行 nonce 原文件/32 字节校验和两个原 CA/TLS 校验，保留原最多 30 秒 observation；任何物理失败只令新消费失败，当前原 grant/RBAC/mapping 与准确历史重放仍交原 authority/D L3 判断。Authorize 仅把材料期限缩入 dependency（不缩 identity）；L5 调原 authority，再进行原全局 nonce retention/config 与 CA 检查；Reserve 前必须全材料成功。最终回调在 D 固定 SQL FinalGuard 前复读受控文件及原已锁范围，不再 TLS/网络，不更新 observation。D 的最终 SQL clock 继续覆盖材料期限。历史成功不重新预留、不要求旧物理材料存在，但始终调用原当前 authority 的 Authorize/Recheck。

此组合不认证其余 registry/provider 或签名用途，不创建 receipt、producer handle、scope 许可或 capacity；原 authority 的所有方法仍必需。原 authority 须包含完整 grant→admission→registry/ref/policy/profile/candidate 可信关联及已审锁序；构造参数、匹配 hash 和 receipt 本身都不能自证授权。

本地输入检查：`materials.InspectInputs(ctx, grant, bootstrapConfig)` 返回三个固定槽名及 `inputs_checked/not_ready`。nonce 使用原 helper 读并擦除实际材料，CA 只读并校验原精确 descriptor/公共 PEM，不 TLS、SQL或返回路径/材料/pin/provider 错误。该报告不可作为 Apply 输入，后续真实 Prepare 不能省略。部署 DSN/JWT/TOTP/provider token 挂载仍沿各原 loader，不把敏感值放日志或诊断 DTO。

## 27 槽逐项结论与首链阻塞

完整首链仍要求 30 槽（9 registry、20 reference、cross_resources），不存在“只创建备份可跳过 bootstrap 必需槽”的简化。下表覆盖旧未装配的全部 27 项；原三项 RBAC / strong_auth_issuers / provider_proof_issuers 也需真实当前输入。

| 槽位 | 本轮可独立完成的代码 / 当前结论 | B/C 必须确认的合同 | 操作者原受控输入 |
|---|---|---|---|
| registry:parts | 原 config/ref 字节闭集保留；不能臆造 registry 业务 schema | B collector 与 C source 必选覆盖/支持矩阵 | 全量 parts 与不可变源/owner |
| registry:redis_sources | 原结构 pin 检查保留，业务 schema 未定义 | C topology/TTL/一致性，B collector 支持 | 源身份、拓扑、连接 ref/权限 |
| registry:failure_domains | 不把 manifest risk/attestation 当 registry 授权 | B/C 源目标域、完整历史/同源排斥 | 稳定域 ID、隔离事实、attestation/期限 |
| registry:disaster_identity_mapping | 原 purpose/ref helper 保留；缺受审 typed registry | B/C 灾难身份种类、恢复覆盖/撤销 | 版本化原→灾难身份映射/权限/期限 |
| registry:source_writers | 不以 check-state 结果证明 inventory 完整 | B 全 writer/quiesce/resume 清单，C 源事实 | 每源实际 writer 不可变身份和策略 |
| registry:secret_allowlist | 原 broker parser 非 JSON registry validator；保持拒绝 | B/C 使用方、UID/version/workload 绑定 | 当前安装 namespace/Secret UID/version/purpose |
| reference:artifact_write | 原 descriptor/capability helper；不能用 evidence S3 代填 | C artifact 写入、conditional create/checksum | 精确 provider/root/scope/credential/version/观察 |
| reference:artifact_read | 原 exact-ref helper；不可由读成功反推授权 | C 精确历史版本与只读准入 | 只读身份、对象/version/checksum/撤销 |
| reference:artifact_delete | 原 Delete/Absent 保留 unknown；无准入默认 | C exact-version/delete-marker/absence | 受限删除身份、精确 scope、真实缺失证明 |
| reference:artifact_upload_issuer | 原 STS 工作客户端不能产生 bootstrap issuer 许可 | C issuer/subject/audience/policy/lifecycle | 原 issuer 与精确短凭据授权/期限 |
| reference:artifact_ca | **新增真实 owner/candidate 组合、输入检查** | C provider/transport 原绑定签收 | 原 CA descriptor/PEM pins、固定 IP/hostname、安装/provider/scope/期限 |
| reference:evidence_store | 原 S3/system execution helper 非 store authority | 原 C1 channel profile/typed store identity 确认 | 独立 store/root/provider、不可变版本/保留/隔离 |
| reference:evidence_write | 原条件创建/checksum/STS 执行保留 | 原 provider 权限 verifier 与 C1 channel 关联 | exact write scope/version、真实能力/观察期限 |
| reference:evidence_read | 原 Stat/Range/exact version 校验保留 | 原历史读取/撤销边界 | 受控 locator、对象/version/checksum、只读身份 |
| reference:evidence_delete | 原 GC/lease/hold 不能代替首次准入 | 原版本删除/缺失 verifier 语义 | 精确受限身份、absence/unknown/retention 事实 |
| reference:evidence_ca | **新增真实 owner/candidate 组合、输入检查** | 原 evidence provider/transport mapping | 原 descriptor/PEM pins、固定 IP/hostname、范围/期限 |
| reference:evidence_kek | 原 TransitKeyring 消费已准入 mapping，不反证许可 | 原 wrap/unwrap variants 与完整 retained 引用扫描 | 原 KEK identity/ref/version、工作身份/权限、历史映射 |
| reference:kek | 原 Transit runtime 保留，不能推导 variant | B/C backup generate/wrap/unwrap 与保留关系 | 原 backup KEK/provider/ref/version/精确权限 |
| reference:capture_signing | 原 capture candidate relation 与三用途 key history 保留 | B capture payload/domain 与 signer 调用语义 | 原专用 key/version、公钥、mapping/许可/完整历史 |
| reference:acceptance_signing | 原 acceptance 验签候选不授予 signer 调用权 | D 业务 acceptance 与原 payload/domain 合同 | 原 acceptance 专用 key/version/调用身份/历史 |
| reference:catalog_signing | 原用途隔离/retention helper，不代填 signer 准入 | C catalog record/domain/签名语义 | 原 catalog 专用 key/version/公钥/调用范围 |
| reference:catalog_read | 原 exact-ref/S3 helper 非 catalog authority | C exact record/version/完整性/签名/发现边界 | 原 provider/root、只读 ref/version/权限 |
| reference:catalog_append | 不用 evidence Put 证明 catalog 不可覆盖 | C append/conditional-create/conflict/checksum 协议 | 原 append 身份/version/root 和真实能力 |
| reference:catalog_snapshot | draft metadata 不选择 discovery 模式 | C snapshot_list/inventory_read、完整覆盖/冲突 | 原 manifest/version/checksum/范围/期限/来源 |
| reference:nonce_hmac | **新增真实 owner/candidate 组合、输入检查**，保留全局 retained key 范围 | 原 external_secret profile；不推导 Kubernetes UID/API 许可 | 原 32-byte exact-version 文件/descriptor pins、安装/provider/scope、所有 retained key/ProtectedUntil |
| reference:status_relay | generic capability 非 relay 身份/attempt 认证 | B mTLS/workload/Job UID/generation/task/attempt/撤销 | 原服务/客户端身份与真实 Job/终止/接管事实 |
| cross_resources | 同安装/config 基本一致性新增；原全组合仍必需 | B/C 同版本事实、故障域/灾难身份/allowlist/用途/保留总规则 | 完整独立原 authority、全部 trusted mapping、容量/全历史引用 |

对缺少独立业务 schema、原 verifier 或真实授权来源的项，本轮没有编造 JSON/schema、bool validator 或 grant。现有 runtime helper 的用途与缺口仍按 A2 原矩阵，不改写为“只缺操作者输入”。首条真实链目前不具备完整初始化/授权条件：还需全部 owner 正式装配、原映射/受控输入、配置启用的真实风险与合同要求 MFA、B/C 业务 service，以及相应真实 SQL/provider/任务链回执。

## 验证入口和接收边界

```powershell
& .\scripts\system-backup-a-api-readiness-validation.ps1
```

只用已有 Go/toolchain/module cache，GOPROXY/GOSUMDB 禁网、readonly modules、私有 telemetry/cache/tmp。复制并 pin 当前 backend/contracts 后执行新 action/materials、read、bootstrap 集成/入口、nonce/CA 定向；五安全/材料包普通回归；四包 Linux test 编译。日志和准确来源 receipt 保留在 docs/evidence，finally 只删除本轮 `.tmp-a-api-readiness-<id>`，不清理 ae7af 或 D 其他 owner。源码后续漂移单独记录，不借旧 snapshot 宣称新字节通过。该命令不执行实际 MySQL/provider 或部署。

来源闭集还包括 D 原入口已有的 scripts 和七份 docs 测试夹具。首轮 `60108f6ccafb47069d9557edcb92fd01` 六包定向通过，普通回归因 runner 漏带旧 maintenance/registration docs 夹具失败，`cleanup=true`，不能接收整轮。修正轮 `148b2d3547074f7ca4c4a046f19be373` 的两段原生测试均退出 0，但原 Linux security 阶段因磁盘空间退出 1，`cleanup=true`。只读复用现有 D compiler cache 的增量记录另存 `a-api-readiness-cache-refresh-148b2d3547074f7ca4c4a046f19be373.json`，原 cache 未修改，原生测试始终 count=1。

Linux 补证单独运行，不能覆盖原失败 receipt。首次 `55bb2302...` 在编译前因 D 的 server/API/smoke 源码变化正确拒绝复用并清理。随后补证用 `go list -deps -test` 收集四包真实依赖目录，要求目录全部输入、module/contracts/七份 docs 夹具与原生测试逐字节一致，且复制冻结来源一致；D 变化逐项记为 uncovered，不宣称被本轮测试覆盖。`7435d248...` 没有 terminal receipt，日志出现多个 host vet.exe 的 `0xc000026b`；其 owner 已按准确 marker 恢复清理，失败和日志摘要保留在独立 recovery JSON。后续补证采用单并发冷 Linux cache，仅 `go test -vet=off -c` 生成四份 ELF；原生两阶段已执行普通 go test/vet，本补证不重复 host vet，不执行 Linux 二进制，也不重跑或借用其他测试结果。

```powershell
& .\scripts\system-backup-a-api-linux-supplement.ps1 -NativeReceipt docs/evidence/a-api-readiness-native-148b2d3547074f7ca4c4a046f19be373.json
```

接收器命令（只核对原始日志、来源/二进制摘要、必需测试根与准确清理，不执行 Go/SQL）：

```powershell
node docs/evidence/a-api-readiness-review-20261026.mjs --write docs/evidence/a-api-readiness-native-148b2d3547074f7ca4c4a046f19be373.json docs/evidence/a-api-linux-native-4428875c0b734a4ea952580fb2c71680.json
node docs/evidence/a-api-readiness-review-20261026.mjs --check docs/evidence/a-api-readiness-native-148b2d3547074f7ca4c4a046f19be373.json docs/evidence/a-api-linux-native-4428875c0b734a4ea952580fb2c71680.json
```

上述两条已实际退出 0。补证 native receipt 状态 `passed_for_exact_native_test_bytes`、四项编译 exit=0/ELF 摘要齐备、source_unchanged=true、cleanup=true；接收器核对 1,758 项旧冻结输入和其中 401 项测试依赖闭集，当前这 401 项仍准确匹配。D server/API/smoke 和新增 CLI/TLS 文件不在该通过范围：current_source_matches_all_recorded_bytes=false，变化与新增逐项保留。静默成功的编译没有 Tee 输出文件，接收器明确记为 output_file_present=false，不补造成功日志；编译退出码、ELF size/SHA 和清理来自原补证 receipt。没有执行实际 SQL、生产 provider、Linux 测试二进制或授予生产权限。原 148b 缺失的最终完整树后检不补写；补证只建立相同依赖字节与本次最终后检。

非实现者安全签收仍须由 D/原 owner 执行；本轮没有借其他聊天身份或机械 checker 自签。准确复核接点为 `action_scope.go` 的 Scope/AuthorizeAction/RecheckAction 与共享 `read_scope.go` helper；`systembackupbootstrapmaterials/materials.go` 的原 authority 全阶段委托、same-context/transaction、历史分支、dependency deadline、L5 全局 retention 与 Work-end 受控文件复查；`inputs.go` 的本地检查无 TLS/SQL及固定诊断。新包的 synthetic SQL/authority 测试不证明真实 grants、C1 InnoDB ranges 或生产映射；相应实际探针沿 D 原合同，不能用本轮本地通过替代。
