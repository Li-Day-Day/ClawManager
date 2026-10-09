# A 接收 provider 测试环境（2026-09-24）

已核对 [D 的实际交接](system-backup-d-a-provider-handoff-20260924.md)。交接 JSON 原始字节 SHA-256 为 `c6d15516cc4b9f32dd1f4cffaa767c050ff2f2315df4509ad086c7aa51eccf4b`；A 入口脚本固定该快照，文件变化后需先复核，不能自动追随新引用。

当前状态：操作者已完成 A 接收核验，01:36:26–01:36:29 UTC 输出通过本地闭集验证，退出 0，见 [归档记录](evidence/system-backup-a-provider-handoff-preflight-20260924T013626Z.json)。随后 Evidence 数据面第二次 run 的 18 项检查与清理通过；[KMS/signing 测试](system-backup-a-kms-signing-spike-20260924.md)的 18 项检查、三类独立验签与 Pod 清理也通过，退出 0。D 生命周期与轮换交付已由 A [限定范围签收](system-backup-a-lifecycle-acceptance-20260924.md)，下一步转向 provider-proof/evidence adapter 与正式登记接入，无需重复已完成测试。保留环境，暂不执行 D 文档末尾的整个 namespace 清理。当前记录不是 signed evidence，不等于 capability/灾备验收。

## 现在执行：只读接收核验

脚本核对源安装与测试 namespace UID、CA 与 bootstrap client ConfigMap 内容 hash、8 个不可变 Secret 的 UID/resourceVersion、工具 Pod 的固定镜像和无身份挂载状态；在现有工具 Pod 中对两个服务执行 CA/主机名 TLS 握手，并再次核对身份。Secret 输出仅选择 metadata/immutable，不提取或输出 data。不会安装依赖、创建 Pod/文件/对象、修改配置或执行 bootstrap。

本机 PowerShell 完整命令：

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    Get-Command node.exe, ssh.exe -ErrorAction Stop | Out-Null
    node .\scripts\system-backup-a-provider-handoff-preflight.mjs --ssh-host 'root@10.130.14.23' --ssh-password
    $aProviderPreflightExit = $LASTEXITCODE
    "a_provider_handoff_preflight_exit=$aProviderPreflightExit"
    if ($aProviderPreflightExit -ne 0) { throw 'A 环境接收核验失败，请回传脱敏输出' }
}
```

密码由 OpenSSH 交互读取。回传完整 JSON 和退出码；预期 `status=passed`、`identity_refs_checked=8`、`tls_verified=true`、退出 0。失败只输出固定阶段；不要通过换 namespace、放宽 TLS 或替换 key version 绕过。

通过后仍保持 `token_validity_verified=false`、`provider_capability_approved=false`、`evidence_registered=false`。TLS 握手不调用服务健康 API，也不证明 token 有效或数据面权限。KMS/签名的 8 小时 TTL 从实际签发算起，不能从 handoff 时间推算为已验证有效期。

## 后续测试顺序

1. 接收核验通过后，用各自最小权限身份安排独立探针：先验证实际 token 可用性，再执行 KMS/signing 正负测。只向各探针挂载必需身份，不挂载 recovery/root。
2. Evidence 执行独立读/写/删身份、Range、checksum、条件写、越权及 TLS 负测；使用本 run 独占对象，并在结束后验证清理。
3. 撤销/过期、轮换/历史验签另行制定身份生命周期与恢复方案。现有身份不可续期、不可管理 key，不把 bootstrap 结果冒充这些能力。
4. Provider-proof adapter、生产 task/attempt 身份、源集群之外恢复路径和 runtime evidence 登记仍未交付。局部 spike 通过不自动关闭这些门禁。

本轮仅运行本地模拟测试：Python 3 项（含 8 种失败场景），Node 3 项。使用已有 Python 3.10 的 `py -3.10 -B`，未安装依赖；不生成 pycache、构建缓存或测试文件。结果见 [本地准备记录](evidence/system-backup-a-provider-handoff-preparation-20260924.json)。按既有约定在需要远程执行处暂停，等待上述输出。
