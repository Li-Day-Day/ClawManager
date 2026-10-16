# A 接收 D 敏感下载决议与共享 canonical/proof 候选

[D 机器决议](evidence/system-backup-d-sensitive-download-contract-20261016.json)的原始 SHA-256 为 `8b14d0804e9bfb4b5169bc585fd1aa50d38877b61b228984184c7427d73d8eac`。A 已核对其引用的原 A 候选指纹，接收单阶段 GET、claim 的事务内间接绑定、operation 锚点、同 key 不重新发送和全部历史 HMAC 候选规则。此前“等待 D 选择方案”的待办关闭；共享 schema/OpenAPI/DTO、前置锁和运行适配仍未批准或完成。

## 已实现的 A 候选

[security 核心](../backend/internal/systembackupsecurity/sensitive_download_request.go)构造不可变闭集请求：domain、endpoint、installation、evidence ID、认证 subject/session、完整 Manifest SHA、规范 Range 及其存在位。幂等键另绑定到原 ProofPayload，claim 不进入预先签名的请求。所有整数限制在 JCS 安全范围；沿用当前 proof 的 `[A-Za-z0-9._:-]{16,128}` key 规则。

[evidence 准备器](../backend/internal/systembackupevidence/sensitive_download_request.go)先冻结并验证完整 Manifest，计算现有 Manifest canonical 的 SHA，再使用既有 Range parser 规范化 closed/open/suffix；无 Range 与显式完整 Range 仍区分。它遍历所有大小写形式的 Range、key、proof 头，拒绝重复/空值及不安全的原始数字，不能让巨大的 end/suffix 经过 clamp 后绕过整数限制。签发准备与消费验签共用同一输入构造器，不接受客户端提供的 manifest/request hash。

`ProofBinding` 供未来 MFA 签发路径取得准确 binding；`VerifySensitiveDownloadRequestHeader` 使用既有严格 proof decoder、实际 Ed25519 验签和全部声明的历史 HMAC 材料。缺失、重复、未解析或长度错误的 key 集，以及 nil/typed-nil 的受信签名适配器都失败关闭。HMAC 材料在验证 callback 前复制，结束后只擦除自有副本；返回结果不持有原始 nonce、proof 或密钥，不能序列化成收据。`RecheckProofAt` 使用 D 提供的新 SQL UTC 检查原期限，并拒绝零时间和时间回退，不回落到本机时间。

这些函数不执行 SQL、消费 nonce、创建 operation/receipt 或访问 provider；验证结果不是 prelocked context 或下载权限。当前会话/凭据/撤销、owner/RBAC、真实完整历史版本来源和最终物理容量仍必须由 D 的准确事务提供并重验。现有 `SensitiveDownloadProof` 与生产路由没有接入本候选。

## 已核对的合同边界

| 边界 | 当前实际情况与处理 |
| --- | --- |
| 空内容 | [D 独立勘误](evidence/system-backup-d-sensitive-download-erratum-20261016-r47.json)已确认实际 `parseRange("", 0)` 返回 `0/-1`，当前 Manifest 拒绝 size=0。`0/0` 只保留为未来纯 canonical 编码，当前运行不支持空内容。原说明冲突已澄清；启用仍须联合修改并评审 envelope/Manifest/parser。 |
| key 字符集 | D 勘误已澄清“ASCII”不代表任意 ASCII；当前 proof schema 的 `[A-Za-z0-9._:-]{16,128}` 闭集继续生效。 |
| 大整数 clamp | 既有 reader 可以 clamp 很大的 suffix/end；新候选在 clamp 前拒绝大于 `2^53-1` 的数字，签发与验签两侧使用同一规则。 |
| 当前回调锁序 | 当前敏感回调已在 evidence 锁后，不能再在里面倒序取 nonce/operation 锁。本组件不添加独立 nonce 事务来绕过该问题。 |

## 本地验收

[最终回执](evidence/a-sensitive-download-candidate-review-20261016.json)、[完整日志](evidence/a-sensitive-download-local-20261016-132339-d6243082.txt)与[源码清单](evidence/a-sensitive-download-source-20261016-132339-d6243082.json)限定接收 1,302 项冻结输入，source `3bd096fb3f192ad493d5ed1947b4f20d4f1db430dbd3ec081c0c94555a83dcbf`。security/evidence 两个完整包的 426 主测试/2,759 子用例，共 **3,185 项不同检查通过**，无跳过；其中新候选 13 主测试/81 子用例，共 94 项，已包含在总数中。覆盖真实签名头往返、Manifest/evidence/installation/session/Range/key 替换、未知 proof 字段、历史 HMAC 集、材料回调漂移与原始期限。

[独立复核器](evidence/a-sensitive-download-review-20261016.mjs)核对五组 Node JCS/request SHA 向量和一组完整 Manifest 向量、D 决议 pin、准确 Go 结果及清理。16 项核对通过；默认 vet、离线只读模块、源码与 D 决议 postcheck、最终 exit 0 齐全，278 份重点输入及全部已有清单输入匹配。两轮四个准确 source/cache owner 独立确认删除；日志、清单与向量保留，未安装新依赖或执行远测。

[初轮失败记录](evidence/a-sensitive-download-initial-failure-review-20261016.json)保留测试 proof 漏填 AMR 数组导致 CanonicalPayload 拒绝的结果。修订只补齐 `pwd/otp` 和受信 AMR allowlist，未放宽校验；另补签名适配器缺失检查及往返用例后按新冻结轮验收。首次启动 shell 的 `0xc0000043` 没有建立 transcript/source/scratch 或进入 Go；该启动故障与真正的夹具失败分别记录，不算 Go 自动重试。

## 后续接线所需交付

D 已提供独立的实际 INSERT ID 存储组件，见 [A 审计存储复核](system-backup-a-download-audit-review-20261016.md)和[限定回执](evidence/a-download-audit-review-20261016.json)：完整 evidence 包 1,420 项通过，其中新增 A 检查 27 项，无跳过；默认 vet、exit 0、源码 postcheck 和八条准确路径清理均通过。该组件绑定借用事务和原审计行，支持 callback 后重验；仅接收本地模型下的存储候选，尚未接入完整准入事务。

D 的四项审计存储 MySQL 准备也已由 A 独立核对，见[完整操作者命令与接收标准](system-backup-a-download-audit-mysql-handoff-20261016.md)；实际结果仍待操作者回传，不能以准备轮或本地模型替代。

D 仍须提供绑定准确 `*sql.Tx`、请求和锁前缀的封闭 preparation，将审计锚点与 operation/私有 receipt/公共快照、容量与保留计账、历史候选查重及唯一提交点装配。A 再将本候选与实际 MFA 签发、当前 SQL 会话/撤销和 owner/RBAC 装配；在此前不增加可以成功的消费适配器。共享政策/枚举/schema 交叉评审、真实 MySQL 原子回滚/跨版本并发/未知提交及生产材料仍待完成，本轮不证明 replay 已被阻止或管理员本人 MFA。

## 本地复现（已通过，无需重跑）

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$ErrorActionPreference = 'Stop'
$downloadStamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$downloadLog = Join-Path $PWD.Path "docs/evidence/a-sensitive-download-local-$downloadStamp.txt"
$downloadSource = Join-Path $PWD.Path "docs/evidence/a-sensitive-download-source-$downloadStamp.json"
$downloadExit = 1
Start-Transcript -Path $downloadLog -NoClobber
try {
    & .\scripts\system-backup-a-sensitive-download-validation.ps1 `
        -BuildParallelism 2 -SourceManifestPath $downloadSource
    $downloadExit = 0
} finally {
    Write-Host "a_sensitive_download_exit=$downloadExit"
    Write-Host "download_log=$downloadLog"
    Write-Host "download_source=$downloadSource"
    Stop-Transcript
}
```
