# A KMS 与三类签名身份测试（2026-09-24）

前置 Evidence run `a-ev-7b1a56dbc722a6e70b0dc4f0` 已由操作者回传成功：18 项检查、22 条观察、对象/Pod 清理完成，退出 0。完整输出通过本地闭集校验，见 [归档](evidence/system-backup-a-evidence-spike-7b1a56dbc722a6e70b0dc4f0.json)。它是操作者提供的未签名记录，不是正式 evidence 登记。

当前状态：操作者回传 run `a-ks-fb61b8d528bd3b052b5ecbdc` 于 02:31:16–02:35:16 UTC 完成，退出 0。18 项检查通过，22 条 HTTP 观察与正负测一致，三类本机独立 Ed25519 验签通过，Pod 已清理、恢复 intent 未保留。见 [成功归档](evidence/system-backup-a-kms-signing-spike-fb61b8d528bd3b052b5ecbdc.json)。无需重跑或执行本轮 RECOVERY；A 未自行连接远程。

归档核对了交接身份、检查列表及最终报告内容。Node 入口在操作者机器上验签后剥离 `public_proofs`，所以此次回传摘要不能在归档时再次独立验签；不得描述为已收到签名原始证据或已登记正式 evidence。SSH pending IO 提示伴随完整成功摘要及退出 0，未导致本轮失败。

D 的生命周期与轮换交付也已由 A [限定范围签收](system-backup-a-lifecycle-acceptance-20260924.md)；下一步转向 provider-proof/evidence adapter 与正式登记接入。下方命令保留为本轮复现入口，不是当前待执行任务。

## 范围

- 固定原 D 交接文件 hash、namespace UID、CA、镜像 digest 和身份 Secret UID/resourceVersion。复用 Evidence 的 SSH 字节传输、Pod 所有权检查和 Kubernetes UID 条件删除；新增单 token 客户端。
- 创建一个不可变 run intent ConfigMap 和五个临时 Pod，分别仅挂载 generate、unwrap、capture、acceptance、catalog 身份及 CA。无 ServiceAccount token，不挂载管理员/recovery 凭据。
- KMS 正常生成 32 字节 DEK、固定 `vault:v1:` 包装及解包一致性；generate 不可解包、unwrap 不可生成、错误 context 与 bits 被拒绝。使用已交接的字符串参数 `bits="256"`，不修改 key、policy 或 token。
- 三类 signer 各自读取固定版本/public key/不可导出 metadata，签署含 run ID 和用途的合成 payload；错误版本与六项跨用途签名要求 403。各身份先有正常调用作为控制，不能把失效 token 的一串 403 当成功。
- 本机 Node 内置 crypto 按交接中的三个公钥独立 Ed25519 验签，并确认篡改 payload 验签失败。远程返回的公共签名只供本机验证，最终摘要输出验证用途列表。
- KMS 明文仅存在对应 Pod 的 Python 进程内存；密文和明文 SHA-256 只在远程进程间传递，不写文件、不进入最终输出。HTTP 客户端不开代理、不跟随重定向，校验 CA/hostname；原始响应错误和凭据不输出。

这轮有 18 项远程检查，以及三类本机独立验签。只证明执行时固定测试身份可用及所列操作，不测撤销/过期、轮换/历史验签、生产 task/attempt grant、provider-proof adapter 或异地恢复。相应批准/登记/生命周期字段保持 false。8 小时 TTL 从实际签发时刻起算；若已失效，应由 D 提供复核后的新交接，不能绕过快照 hash 自动更换身份。

## 完整 PowerShell 命令

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    Get-Command node.exe, ssh.exe -ErrorAction Stop | Out-Null
    node .\scripts\system-backup-a-kms-signing-spike.mjs run --ssh-host 'root@10.130.14.23' --ssh-password
    $aKmsSigningExit = $LASTEXITCODE
    "a_kms_signing_spike_exit=$aKmsSigningExit"
    if ($aKmsSigningExit -ne 0) { throw 'KMS/signing 测试或清理未通过，请回传完整脱敏输出' }
}
```

密码只输入 OpenSSH 提示。登录前会打印 run ID 和已填入 ID 的 `RECOVERY` 命令，请保留。预期退出 0、`status=passed`、18 项 `checks_passed`、三个 `independent_ed25519_verified` 用途、`pods_removed=true`、`recovery_intent_retained=false`。回传完整摘要即可，无需 Secret 或原始 Pod 日志。

## 清理与恢复

正常/异常均进入 finally，精确删除本 run 五个 Pod，再删除 intent ConfigMap；使用 UID precondition，不删除 D provider、密钥、身份或 namespace。没有新建持久化密钥或 Evidence 对象；provider 自身审计记录保留。

SSH 中断或报告缺失时，执行打印出的 `RECOVERY` 命令。cleanup 只检查并删除本 run 资源，不重新生成 DEK、签名或创建 Pod。缺失 intent、namespace/身份漂移、Pod 所有权异常均失败关闭；不要通过手工删除未知对象或另开 run 掩盖问题。若本机验签失败但远程已清理，恢复可能因 intent 已删除而拒绝，需回传摘要分析。

本地验证：Python 6 项（请求绑定、明文脱敏、单身份挂载、正向控制、异常清理与清理失败保留 intent），Node 3 项（真实合成 Ed25519 签名、篡改/重放/公钥用途错配、输出与退出码校验）。使用已有 Python/Node，无安装、构建或测试文件产物。
