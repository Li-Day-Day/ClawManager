# D 对 A 合同交付的交叉评审（2026-09-23）

合同版本：`system-backup-plan.v12`。结论：**changes requested，未签收，保持 draft**。

本次是 D 的接口验收与交接记录，不修改 A/B/C 的实现或代替它们交付。评审对象的 SHA-256、本地验证摘要见 [评审快照](evidence/system-backup-d-a-contract-review-20260923.json)。文件改变后必须重新评审，不能把此记录移作新版本批准。

## 1. 已复现、退回 A 的问题

| 编号 | 级别 | 证据与影响 | A 返工后的验收要求 |
| --- | --- | --- | --- |
| D-A-01 | P1 | `strongauth.go:CanonicalPayload` 使用 `json.Marshal`，会将合法 subject 中的 `<>&`、U+2028/U+2029 转义；`strong-auth-proof-nonce.schema.json` 声明签名输入为 JCS。合法 issuer 按合同生成的签名因此可能无法通过，现有 ASCII fixture 没有覆盖该差异。 | 固定同一 canonicalization；加入特殊字符的跨语言字节/签名向量。不仅检查字段排序。 |
| D-A-02 | P1 | `strongauth.go:Verify` 对 `NonceHMACKeys` 中空的历史 key 执行 `continue`；active key 可用时依旧返回成功，历史版本从候选集中消失。主计划 6.2、15、17.2 和 D nonce ledger 要求保留期内全部版本查重且 key 缺失失败关闭。 | 缺任一应保留 key 时拒绝验证；还需明确由谁从持久化 registry/ledger 验证完整 key 集合，避免整个版本从 map 消失。D 后续负责事务查重/唯一约束，不能补算缺失 key。 |
| D-A-03 | P1 | `providerproof.go:VerifyProviderProof` 用 `maxAge+clockSkew` 限制 proof lifetime，并允许 `expiresAt >= now-clockSkew`。反例：now=01:02、expiry=01:01:50 被接受；issued=01:01、expiry=01:06:20、maxAge=5m、skew=30s 也被接受。主计划 14.2 要求 expiry 覆盖当前事务，且不晚于 issued+maxAge。 | A 修正验证边界并提供过期/上限反例；D 接入时再使用数据库时间在事务内复核，不能把事务外验证当作提交时有效。 |
| D-A-04 | P1 | provider verifier 用 `fmt.Errorf(... %w, err)` 返回 adapter 原始错误；合成私有错误标记出现在对 D 返回的 `Error()` 中。合同禁止 provider 自由错误文本。此处证明安全模块边界未脱敏，不宣称当前 HTTP 路由已发生泄露。 | 提供稳定、脱敏且有类型的失败结果，能区分主计划的 validation/signature/checksum/version 错误；不得依赖 D 对 provider 文本做关键词清洗。 |
| D-A-05 | P2 | provider target 接受 `sxa_x`，不满足主计划 14.2 的前缀+UUID；`resource_version` 257 字符也能通过 Go verifier，而 schema 上限为256。 | schema/Go/fixture 对齐 public ID、长度和合法 target/proof/state 组合；补 schema 接受而 runtime 拒绝（presence/absence 矛盾等）与相反方向的 parity 检查。 |
| D-A-06 | P1 | `secret-ref.schema.json` 的公共 purpose 包含 `strong_auth_nonce_hmac`，但五个具体分支的 purpose 都排除了它。没有合法 nonce-HMAC ref 可供 D config/历史 key registry 使用。 | A 补齐该用途的明确 variant、版本语义与正负例，并由 D 复审；D 不自行造私有 ref。CA、catalog read、独立 delete 等主计划 ref 如何由该合同或其他合同覆盖，也需 A/C 给出引用映射。 |

复现命令（本机 PowerShell，仓库根目录）：

```powershell
powershell -NoProfile -File scripts/system-backup-d-a-review.ps1
```

该脚本只把 A 的两个源码文件和两个既有测试文件复制到本次唯一 scratch 目录，再加入 D 的验收探针。`GO111MODULE/GOPROXY/GOSUMDB/GOTOOLCHAIN` 禁止依赖或工具链下载。当前退出码 **1 是实际验收失败**，不是通过；修复后应为0。9个既有顶层测试通过，5个 D 顶层测试失败（7个叶级反例）；finally 已确认 `D review scratch removed: True`，临时源码、Go build cache、测试二进制均已清理。

签名 adapter 使用合成 stub，只隔离复现 wire/policy 校验，不证明密码学验签、真实 issuer、KMS 或跨进程 nonce 原子消费。

## 2. 其他交付的评审状态

| 交付 | D 结论 | 需要的补充 |
| --- | --- | --- |
| A 的15个对象 registry | 策略已记录，交叉签收 pending | 每项已有 classification、策略、normalizer/verifier ID 和依赖，但 `a-owned-object-fixtures.json` 只有 `empty_rows/redacted_rows/abnormal_case` 描述，没有可执行的输入行、规范化预期、hash/校验结果。请 A 补合成向量和字段边界，D 再逐表签收。 |
| strong-auth proof/nonce | changes requested | D-A-01/02；issuer ACR/AMR allowlist、签名 protected header/key purpose 和历史 key 完整性须有明确 adapter/registry 保证及测试，不能以始终成功的 stub 签收。 |
| provider-proof registration | changes requested | D-A-03/04/05；明确 audience/目标绑定和固定错误映射如何从 A 交给 D。 |
| Secret ref | changes requested | D-A-06；其他所需 ref 的闭集覆盖和用途/能力组合映射待 owner 回答。 |
| capability evidence | integration review pending | A 使用自由格式 `capability_code`，D 的 artifact/catalog/evidence 投影使用按 role 闭集；A spike 没有 `expires_at`，D 权威 row 要求有效期。请 A/C 提交显式映射、过期策略、重复 code/错误 role 的拒绝规则和实际 probe evidence。不能直接将 spike `supported` 写成长期健康。KMS/Secret/signing 是其他 dependency 类别，不能当作 D 三类 provider row。 |

上述后续问题不等于要求 A 现在开发 D controller 或 D API；A 交付安全边界，D 留待合同通过后实现事务、CAS、幂等与编排。

`approved_reviewers`、`approved_cross_reviewers` 和冻结 gate 本轮均未置真。D 也不能替 B/C 签收 A，或替 A/B/C 评审 D 自己的产物。

## 3. D 当前看板与交接

| 工作项 | Owner / 评审方 | 当前状态 / 下一步 |
| --- | --- | --- |
| A 安全与对象策略交叉评审 | A 修订，D 复审；Secret ref/capability 另需 B/C | 本报告已交付；未批准。 |
| B 的23项对象策略、restore target、status relay | B，D 接口验收 | 待 B 交付，不由 D 开发。 |
| C 的16项对象策略、recovery catalog / catalog scan-record 合同 | C，D 接口验收 | 待 C 交付。 |
| 三张 catalog 控制表 | D 组织归属/migration，依赖 C 冻结字段，A/B/C 交叉评审 | `system_backup_catalog_imports/records/scan_states` 仍缺 inventory；本轮不猜字段建表。 |
| live schema-hash | D 采集/计算，A/B/C 评审 | 本机 SSH 入口与本地反例测试完成，等待操作者远程执行下节命令。 |
| DTO parity、capability、完整 freeze | D 汇总，A/B/C 各交付自己的证据 | 保持 draft；95对象中56项策略已记录，39项待提交，56项待交叉评审；4份合同缺失。 |

仅 app RBAC cutover 已关闭，不能推导 P0-0b 全部通过。已有测试安装的 cluster 声明与 HostPath 源卷/缺失 VolumeSnapshot API 的矛盾仍存在；本轮 schema 采集不变更部署或证明 checkpoint 能力。

## 4. 下一项远程验证：live schema-hash candidate

按用户要求，到此需要远程验证时暂停目标。**运行位置是本机普通 PowerShell，不是远程 k8s-master shell。** 本机已有 Node.js 和 OpenSSH；SSH 目标是你平时登录、有 `kubernetes-admin@kubernetes` context 的机器。需要已配置可用 SSH 身份及 known_hosts；脚本使用 `BatchMode=yes`、`StrictHostKeyChecking=yes`，不会安装组件或改变 SSH 配置。

执行前确保本机工作树就是本评审版本；远程无需 Node.js 或同步仓库。SQL 从本机 stdin 发往 SSH，再发往现有 `deploy/mysql` 的 mysql 客户端。只查询 namespace UID 和 information_schema，不创建集群资源，不执行 migration、业务写入或去权。数据库连接复用既有 Pod `MYSQL_USER/MYSQL_PASSWORD`；**只读 SQL 不等于已验证该账号是 SELECT-only**，本脚本不作为权限负测证据。

完整命令：

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
Get-Command node.exe, ssh.exe -ErrorAction Stop | Out-Null
$schemaSshTarget = Read-Host '输入平时登录 k8s-master 的 SSH 别名或 用户名@主机'

node scripts/system-backup-schema-inventory.mjs --check
if ($LASTEXITCODE -ne 0) { throw '本地 inventory 不一致，停止采集' }
node scripts/system-backup-contract-check.mjs --check
if ($LASTEXITCODE -ne 0) { throw '本地合同快照不一致，停止采集' }

$schemaCandidateLines = & node scripts/system-backup-schema-hash-ssh.mjs `
  --ssh-host "$schemaSshTarget" `
  --kubectl-context 'kubernetes-admin@kubernetes' `
  --namespace 'clawmanager-zhanghui08-system' `
  --database 'clawmanager'
$schemaCaptureExit = $LASTEXITCODE
if ($schemaCaptureExit -eq 1) { throw 'SSH、远程查询或规范化失败；未生成有效 candidate' }
if ($schemaCaptureExit -notin @(0, 2)) { throw "采集异常退出：$schemaCaptureExit" }
$schemaCandidateText = $schemaCandidateLines -join "`n"
$schemaCandidate = $schemaCandidateText | ConvertFrom-Json
if ($schemaCandidate.status -ne 'candidate' -or
    $schemaCandidate.records_cleanup.verified_absent -ne $true -or
    $null -ne $schemaCandidate.registered_evidence -or
    @($schemaCandidate.approved_reviewers).Count -ne 0) {
    throw 'candidate 状态或清理证明不符合要求'
}
$schemaCandidateText
"schema_capture_exit=$schemaCaptureExit"
if ($schemaCaptureExit -eq 2) {
    Write-Warning '真实对象集合与 inventory 不一致，请回传 missing/unexpected，不要标记通过'
}
Remove-Variable schemaCandidateLines, schemaCandidateText, schemaCandidate
```

请回传最后打印的**完整脱敏 candidate JSON 和 `schema_capture_exit`**，不要回传账号口令或原始 TSV。原始结构记录只在本机私有临时目录处理，返回结果前自动删除；远程不写临时采集文件，命令也不保存本地结果文件。Namespace UID 在前后各核对一次，变化则拒绝 candidate。

退出0表示本次采集和对象名覆盖通过，2表示已生成 candidate 但对象集合存在差异，1表示失败。即使返回0，也只是候选证据：尚未比较 schema 的预期结构、证明历史额外 migration 等价、注册 evidence 或获得 A/B/C 批准，不能直接将 `schema_hash_evidence_present` 改为 true。

## 5. 本地验证

- 新 SSH transport：5/5；原 capture：4/4；schema hash：6/6。
- 既有合同 artifacts：70/70；contract check tests：6/6；inventory `--check` 与合同 `--check` 通过。
- `--check --strict` 仍退出1，冻结门禁未通过，属于真实阻断。
- Node `--test` 多文件进程模式在本沙箱遇到 `spawn EPERM`，随后直接逐个运行 `.test.mjs` 完成上述验证，没有安装依赖。
- D 对 A 的 Go 反例保持失败，不能用其他绿色测试覆盖评审结论。没有远程执行，没有测试构建残留。
