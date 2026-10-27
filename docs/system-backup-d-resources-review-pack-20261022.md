# D 九表恢复规范化待评审方案与回执清单

日期：2026-10-22。D 负责组织九表规范化方案、实现和结果接收；A/B/C 按各自领域交叉评审。以下转换为 D 提出的待审方案，需绑定同版本输入和明确评审结论后实施。当前九表均为 owner_recorded，已登记交叉评审均为空；B/C 生产适配器由操作者确认为未交付。

## 分工与交付顺序

| 材料 | 提供方 | D 的接收条件 |
| --- | --- | --- |
| 新增十六项历史详情和整个四十二项 GC 专项 | 有权限的服务器操作者 | 完整日志、同轮来源清单、逐项结果、退出码、namespace UID、两端清理记录 |
| 捕获与隔离目标证明、目标时钟、启动门禁和事务 writer | B | 可定位实现与版本，证明绑定准确源/目标及真实事务，失败路径和实际验证证据齐全 |
| artifact/catalog 当前事实、provider/capability 读取与扫描资产/能力策略 | C | 可定位实现与版本，精确对象/引用版本和当前有效期、可用性、撤销规则明确 |
| 九表规范化及候选批次 | D | 整理字段转换和映射，处理跨表一致性，接收必需评审后实现并组织集成验收 |

A 评审六张表，B 评审四张表，C 评审四张表，共十四个表与角色的评审组合。这个数量只覆盖本方案的九表，不能替代全局 strict 门禁的交叉评审。实测通过与恢复策略评审分别接收。

## 九表规范化方案

| 表 | D 提出的恢复行为 | 必需评审 |
| --- | --- | --- |
| audit_logs | 保留捕获 cutoff 内的历史；按 A 确认的规则处理 user_id、resource_type/resource_id 和 details。空 actor 保持 NULL；原始审计 ID、时间及来源关联可追溯。目标已有审计不得通过清空表解决冲突。 | A |
| egress_private_exceptions | 依据 scope_type 将 scope_id 映射到目标 user 或 instance，created_by 使用共同 actor 映射。建议恢复时 enabled=false；CIDR/port 重新通过目标策略校验，后续启用单独批准。 | A、B |
| northbound_admin_settings | 保留 id=1 的完整单例候选，建议 api_enabled=false、require_explicit_callers=true。TTL、限流、allowed types、资源规格和 operation 参数按目标策略校验；不以来源 version 充当目标当前授权。 | A、B |
| northbound_settings_audit | 保留历史 action/created_at，映射 actor_user_id；before_json/after_json 仅按 A/B 明确的路径做映射及脱敏，不能把任意整数都替换成目标 ID，也不回放配置变更。 | A、B |
| security_scan_configs | 映射 updated_by；校验 quick/deep analyzer、mode、超时和目标能力。建议 allow_fallback=false；能力不满足时阻断候选，不静默删 analyzer 或降级。该表无全局 enabled 字段，扫描停机由启动门禁保证。 | A、C |
| security_scan_jobs | 映射 requested_by、scope_json 内已定义的资产引用；保留已确认终态的历史。对 pending/running，D 建议转换为失败终态并清除运行中标记，使用 B 认证的归一化时间；具体合法状态、计数和时间组合待 C 确认，确认前不生成可提交候选。 | A、C |
| security_scan_job_items | 使用同一 job 映射和 C 的 asset 映射；scan_result_id 必须绑定同一资产与结果版本。非终态与父 Job 一起归一化；progress_pct、cached_result、summary/error_message 按 C 确认的历史语义处理，不把旧缓存变成当前扫描成功。 | C |
| security_scan_reports | 映射 job_id，按批准的结构重写 summary_json 中 Job/asset/result 引用，保持报告与 items/父 Job 汇总一致。恢复后的报告代表历史观察，不能直接授予当前资产可用或安全结论。 | C |
| system_image_settings | 保留合法 instance_type/runtime_type/runtime_variant，image 仅接受 B 认证的目标镜像映射与可用性结果，建议 is_enabled=false。默认预设、环境配置及后续启用一并纳入目标启动门禁验收。 | B |

审计 ID 冲突、缺失 actor 的处理、北向 version 迁移规则，以及扫描失败终态和汇总计数都属于待确认决策。本方案不把这些选择预填成已批准规则。

## 共同输入与事务边界

1. B 提供同一封存 dump/checkpoint/capture context 的真实性证明，九表空表也需认证；来源证据、目标身份、schema 版本、目标 UTC 时间、映射及门禁绑定在同一次恢复中。参考现有 [捕获校验](../backend/internal/systembackupresources/verifier.go) 和 [只读目标控制排除校验](../backend/internal/systembackupresources/control_exclusion.go) 的证明边界。
2. D 冻结输入副本，先检查完整表集、NULL、类型、范围和共同映射，再生成候选。非 NULL 引用缺映射、重复映射/占用冲突或不支持的 JSON 结构均阻断该批次；不以 SET FOREIGN_KEY_CHECKS=0 或丢行掩盖错误。
3. A 确认 actor/redaction 语义；B 认证用户映射的目标占用及 instance/目标镜像映射；C 认证 asset、scan result 和 analyzer 能力。SQL 的 ON DELETE SET NULL 不等于许可把未映射的非空来源引用直接改为 NULL。
4. B/D 需确认 D 候选与其他 Owner 批次的写入契约和共同事务范围。真实 writer 使用明确列、参数化 SQL 和完整 FK 校验；写入前与提交边界复查同一目标/权限/门禁。失败或提交结果不确定时，不生成恢复成功或资格结论。
5. 历史时间与恢复处理时间区分记录；DECIMAL 保持数据库精度，例如北向 CPU 规格不能经 float64 往返决定规范化值。capture cutoff 保留来源含义，不能用重编号后的目标 MAX(id) 冒充原 cutoff。
6. 规范化与只读校验完成后仍保持目标隔离，写凭据销毁和独立 SELECT-only 连接由 B 证明。服务启动、镜像启用、网络例外和用户流量放行分别依受审规则推进。

当前实现有三处需要集成验证的默认行为：北向 [RuntimeSettings](../backend/internal/northbound/runtime_settings.go) 的 fallback 默认 APIEnabled=true，读取失败且无缓存时可返回 fallback；[镜像服务](../backend/internal/services/system_image_setting_service.go) 在缺行时可补默认预设；[扫描服务](../backend/internal/services/security_scan_service.go) 在配置缺失时会创建默认配置。因此删行、只检查数据库开关或只检查单个服务的缓存，都不能替代 B 的启动门禁。

## 发给 A 的评审请求

请 A 评审 audit_logs、egress_private_exceptions、northbound_admin_settings、northbound_settings_audit、security_scan_configs、security_scan_jobs 六张表，并逐项回复：

- 确认 actor 映射的真实性与 NULL 规则、审计原 ID/资源引用的历史语义，以及缺映射时整批阻断是否充分。
- 给出 details、before_json/after_json 和扫描相关历史正文的脱敏规则/接口版本，明确保留、重写和拒绝的字段；报告与日志不得包含未脱敏正文或凭据。
- 确认北向 API 停用、显式 caller、TTL/限流及 caller policies 的恢复边界；是否存在环境继承或配置读取失败后的重新启用路径。
- 给出通过或需修改的具体表和规则，绑定下方文档 SHA 与来源基线；A 的表语义评审不替代 B 的源/目标真实性证明。

## 发给 B 的评审与交付请求

请 B 评审 egress_private_exceptions、northbound_admin_settings、northbound_settings_audit、system_image_settings 四张表，并交付：

- 明确 user/instance/镜像映射、目标已占用 ID/单例的处理；scope_type 现有值为 user/instance，未知类型应拒绝；CIDR/port 必须符合目标网络政策。
- 确认北向目标端口、allowed types、CPU/内存/磁盘、operation 参数及来源/目标 version 的处理，不把恢复前配置授权直接继承到新目标。
- 确认镜像精确版本/可用性和 runtime variant；说明 disabled 行、缺行默认预设、环境 fallback 和激活之间的门禁。
- 提供生产 capture/target/clock/fence/事务 writer 的代码路径、分支或 commit、适配接口及实际验证证据；共同 proof 要覆盖九表（含空表）、映射、目标 schema/占用、当前写权限和准确恢复事务。

## 发给 C 的评审与交付请求

请 C 评审 security_scan_configs、security_scan_jobs、security_scan_job_items、security_scan_reports 四张表，并交付：

- 确认 pending/running 如何转换到现有合法终态，给出 Job/items 的 finished_at、计数、progress、cached_result、错误摘要和 report 的一致规则；不允许隐式续跑。
- 提供资产与 scan_result_id 的准确映射，列出 scope_json/summary_json 中需要转换的结构与字段、不可识别输入的拒绝规则。
- 给出目标 analyzer/capability 的版本、有效期与可用性、mode/超时/fallback 规则；历史报告不得直接升级为当前资产的验证结论。
- 提供 artifact/catalog/provider/capability 当前事实适配器的实现路径和 commit，明确精确版本/checksum、引用漂移、过期、不可读和撤销时的返回语义，供 D 接入 preflight 等当前事实读取。

## 评审回执格式

每个角色可以一次评审多张表，但必须逐表说明结论。请按下面格式填写，未评审的项保持待审；这里的模板不写入正式 registry 的 approved_cross_reviewers。

```text
评审角色与评审人：
方案文档路径及 SHA256：
来源基线 source_digest：
评审对象及 normalizer_id/verifier_id：
逐项结论：通过 / 需修改 / 不具备评审条件
确认的映射、转换、目标策略及事务边界：
要求修改或仍缺的输入：
对应代码/合同版本及证据路径、SHA256：
评审时间：
```

同版本文档与源码基线在 [待评审机器清单](evidence/d-resources-review-request-20261022.json) 中。它记录九表、必需评审者和本次二十五份输入摘要，review_receipts 初始为空。后续方案或相关输入变化时重新绑定评审版本，不沿用旧结论覆盖新字节。

## 实测回执与完整命令

由有权限的操作者在本机 PowerShell 顺序执行下面两个专项，SSH 密码按提示输入。它们各自冻结新来源并保存日志。第一项是已有 AdminReadOnly profile 内的十六项增量历史详情场景；第二项是原三十四项前置加八项连接生命周期，共四十二项合成实测，freeze_adapter 仍为 not_wired。

### 历史详情专项

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$PSNativeCommandUseErrorActionPreference = $false
$detailRun = Join-Path (Get-Location) ('docs\evidence\d-verification-detail-remote-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$detailLog = $detailRun + '.txt'
$detailSource = $detailRun + '-source.json'
& pwsh -NoProfile -File .\scripts\system-backup-d-verification-detail-validation.ps1 -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23' -SourceManifestPath $detailSource *>&1 | Tee-Object -FilePath $detailLog
$detailExit = $LASTEXITCODE
"verification_detail_http_exit=$detailExit" | Tee-Object -FilePath $detailLog -Append
Write-Host "日志=$detailLog"
Write-Host "来源清单=$detailSource"
Write-Host "本轮结果=$($detailSource).result.json"
```

### GC 连接生命周期专项

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$PSNativeCommandUseErrorActionPreference = $false
$lifecycleRun = Join-Path (Get-Location) ('docs\evidence\d-download-gc-owner-lifecycle-remote-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$lifecycleLog = $lifecycleRun + '.txt'
$lifecycleSource = $lifecycleRun + '-source.json'
& pwsh -NoProfile -File .\scripts\system-backup-d-config-writer-validation.ps1 -DownloadGCFreezeOnly -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23' -SourceManifestPath $lifecycleSource *>&1 | Tee-Object -FilePath $lifecycleLog
$lifecycleExit = $LASTEXITCODE
"download_gc_owner_lifecycle_exit=$lifecycleExit" | Tee-Object -FilePath $lifecycleLog -Append
Write-Host "日志=$lifecycleLog"
Write-Host "来源清单=$lifecycleSource"
```

实测回传内容：两个完整日志、两个来源清单、第一项的 result.json；同时保留退出码、父/子测试结果、binary/input SHA256、准确 namespace/UID、remote scratch/local owner 清理与任何 CLEANUP_PENDING 身份。十六项需逐个 verification_history_ 子项和 synthetic_cases=16 标记；四十二项需两个根测试和 new_cases=42 prerequisite_cases=34 lifecycle_cases=8 标记。退出 0 与末尾 PASS 需结合完整日志核验，实测回执不代表九表策略已获评审。详细接收条件分别见 [历史详情交付](system-backup-d-verification-http-history-20261022.md) 和 [GC 生命周期交付](system-backup-d-gc-owner-lifecycle-20261022.md)。

## D 后续实现与验收顺序

先接收 A/B/C 逐表意见，关闭上面列出的状态/映射/version 决策，再形成受审的 normalization 与 verifier 输入规则。D 依据规则实现九表候选生成与跨表检查，由 B 的真实目标 writer 组合写入。随后组织空表、映射冲突、NULL/DECIMAL、敏感正文、非终态、fallback/默认配置、权限撤销、取消和不确定提交等实际场景，再核对只读结果、写凭据销毁、目标隔离及启动/流量放行。

完成这些步骤后再接收完整资源恢复与 D 原六项整体验收。本清单整理阶段不改运行时代码、正式 registry、合同批准或迁移。
