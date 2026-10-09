# A Evidence 数据面测试（2026-09-24）

接收核验已通过：操作者回传 01:36:26–01:36:29 UTC 的完整 JSON 与退出码 0，已通过本地闭集验证并归档于 [接收记录](evidence/system-backup-a-provider-handoff-preflight-20260924T013626Z.json)。它只证明当时的身份引用与 TLS；不是 token 有效性或数据面能力证明。

当前状态：第二次远程 run `a-ev-7b1a56dbc722a6e70b0dc4f0` 于 02:08:46–02:11:27 UTC 通过，18 项检查、22 条观察、退出 0，对象/Pod 已移除、恢复 intent 未保留。操作者输出通过本地闭集验证，见 [成功记录](evidence/system-backup-a-evidence-spike-7b1a56dbc722a6e70b0dc4f0.json)。实际 checksum 响应为 `400/XAmzContentChecksumMismatch`。随后 [KMS/signing 测试](system-backup-a-kms-signing-spike-20260924.md)也已通过；D 生命周期与轮换交付已由 A [限定范围签收](system-backup-a-lifecycle-acceptance-20260924.md)，下一步转向 provider-proof/evidence adapter 与正式登记接入。成功 run 无需重跑或执行 RECOVERY；A 没有自行连接远程。

首次 run `a-ev-94791c5de83fadbfdd2a02de` 在 `probe_write_put-bad-checksum` 失败，退出 1；对象/Pod 已移除、恢复 intent 未保留。[原始失败记录](evidence/system-backup-a-evidence-spike-94791c5de83fadbfdd2a02de.json)继续保留，不因重跑通过而改判。

原探针只接受 `400/BadDigest`；[MinIO 官方错误映射](https://github.com/minio/minio/blob/master/cmd/api-errors.go)将 `hash.ChecksumMismatch` 映射为 `400/XAmzContentChecksumMismatch`。现在只接受这两个明确 checksum 拒绝码，不把通用 400、签名错误、payload hash 错误或鉴权失败当成通过。该兼容性缺口是可能原因，旧报告没有保存实际响应码，不能据此改判历史 run 成功。

原实现还在整段 matrix 返回后才保存 `checks_passed`，中途异常导致已经完成的检查丢失。新版实时保留检查进度，输出版本为 `a_evidence_spike_v2`，增加闭集 `observations`：只记录 role/action/object、HTTP 状态和允许的错误码；原始 XML、header、异常文本和凭据均不输出。cleanup 的 observations 也保留，供区分原测试失败与清理过程。退出非零仍不能因 stdout 含成功字样而转成通过。

## 本次范围

- 使用交接中的独立 MinIO、`d-provider-evidence` bucket 和 `a-spike/` prefix。
- 每次随机生成 96-bit run ID；创建一个不可变 ConfigMap 记录两条精确对象 intent，创建三个临时 Pod，分别只挂载 `d-evidence-read/write/delete`。使用已有 digest 固定工具镜像及已有 Python 标准库，不安装依赖、不构建镜像；不挂载 admin/recovery、KMS 或 signer 身份。
- 对象仅为几百字节合成内容。写入均带 `If-None-Match: *`；检查首次写入、冲突拒绝、SHA-256 回读一致、16 字节 Range 和错误 checksum 拒绝；再检查六项跨角色操作拒绝、三种身份的 List/前缀外 GET 响应、错误 CA 与错误主机名拒绝。正常输出包含 18 个检查名及清理结果。
- 所有写/删负测也只针对本 run 已写入的合成对象。前缀外仅 GET 一个随机未创建的键：其拒绝响应不独立证明“已存在的前缀外对象”隔离，不能据此签收完整 IAM 范围。

SigV4 实现用 [AWS 官方固定向量](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html)核对；条件写行为参考 [PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)。这些是请求构造与预期值的依据，真实 MinIO 是否满足仍由本轮远程响应决定。

## 完整运行命令

在本机 PowerShell 执行。入口固定 D 交接快照 SHA-256，不接受替换 endpoint/bucket/prefix。

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    Get-Command node.exe, ssh.exe -ErrorAction Stop | Out-Null
    node .\scripts\system-backup-a-evidence-spike.mjs run --ssh-host 'root@10.130.14.23' --ssh-password
    $aEvidenceSpikeExit = $LASTEXITCODE
    "a_evidence_spike_exit=$aEvidenceSpikeExit"
    if ($aEvidenceSpikeExit -ne 0) { throw 'Evidence 测试或清理未通过，请保留并回传完整脱敏输出' }
}
```

入口在登录前打印 `run_id` 和已填入该 ID 的 `RECOVERY` 命令。请保留这两行；密码只输入 OpenSSH 提示。执行期间可能等待 Pod Ready，不需要打开其他终端安装工具。

通过条件：远程与本机退出均为 0、`status=passed`、18 项检查完整、`objects_removed=true`、`pods_removed=true`、`recovery_intent_retained=false`。回传完整脱敏输出即可，不回传 Secret、原始 provider 响应或 Pod 日志。

## 清理与失败恢复

正常或测试失败均进入 finally：对两条 intent 精确读取，只有 run marker 匹配且对象未启用版本标识时才 DELETE；随后要求精确 GET 返回 `404/NoSuchKey`。403、网络失败、单独 DELETE 204 都不能视为已清理。若发现版本化对象，停止删除，不用普通 DELETE 冒充删除全部历史版本。

Pod 删除使用 Kubernetes UID precondition；本 run 的 Pod 全部清理后，只有对象清理已验证，才删除本 run ConfigMap。对象清理不确定时保留该非敏感 intent。SSH 中断无法保证 finally 完成，此时使用本次输出中完整的 `RECOVERY` 命令；它只恢复本 run 的必要读/删 Pod 和清理，不重新运行写入测试。不得启动一个新 run 来掩盖旧 run 的残留。

若 intent 也不存在或 namespace/身份已漂移，恢复会拒绝而非猜测删除对象；先回传固定阶段信息。始终保留 D 的 namespace、provider、PVC、密钥及身份，供后续 KMS/signing 测试；当前不执行 D 的全环境清理。

## 验证范围与剩余项

当前本地测试：`py -3.10 -B scripts/system-backup-a-evidence-spike.test.py` 14 项；`node scripts/system-backup-a-evidence-spike.test.mjs` 4 项。包含官方签名向量、只操作 run-owned key、单身份挂载、身份漂移、未知写入结果的清理、UID 删除、输出脱敏，以及两种 checksum 拒绝码、六种不能误判通过的响应、部分进度保留与非零子进程退出处理。均为本地合成/模拟，无真实远程请求、依赖安装或测试产物。首次 [13 项准备记录](evidence/system-backup-a-evidence-spike-preparation-20260924.json)作为历史保留；当前见 [诊断与兼容性修订验收](evidence/system-backup-a-evidence-spike-diagnostics-20260924.json)。

即使本轮通过，输出也保持 `provider_capability_approved=false`、`evidence_registered=false`、`production_scoped_grant_verified=false`。这是静态测试身份的数据面 spike，不证明生产短期 grant 的 key/checksum/content-length/expiry 绑定、签名 provider-proof、服务端下载鉴权、完整版本化不存在性证明或灾备验收。结果须复核后再映射到正式 capability evidence。

后续 KMS/signing run 已证明当次执行时身份可用；后续 D 生命周期 run 的撤销/自然过期与 named-ref 轮换/历史验签已由 A 限定范围签收。本 Evidence run 不消耗或撤销 KMS/signing token。
