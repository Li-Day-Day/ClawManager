# A：准确下载请求的 MFA 签发候选

【2026-10-19 实际 SQL 九项入口已准备】[完整命令和接收标准](system-backup-a-download-mfa-mysql-handoff-20261019.md)及[58 项准备复核](evidence/a-download-mfa-mysql-preparation-review-20261019.json)固定 1,374 输入：两个完整包 3,846 项、只读 SQL 预览新增 18 项、包内/脱离 checkout seed 各 8 项、Linux 探针与迁移 runner、postcheck/exit 0 和两轮清理通过。首轮 checkout 依赖失败及一次 Windows 工具失败/同源重试保留；D 并行 8 份变化及新增文件排除。九项实际 SQL 尚待操作者执行，旧 nonce 八项无需重跑；本人 MFA 和正式运行接线仍未接收。

2026-10-19，A 增加 `VerifySensitiveDownloadAndIssue`、HTTP `/api/v1/admin/system-backup-strong-auth/proof` 的下载分支，以及复用 D 固定会话/RBAC/材料/owner-preview 来源的 `PinnedSensitiveDownloadProofTargets`。[独立回执](evidence/a-download-mfa-review-20261019.json)接收最终 r2 的本地候选：1,365 固定输入，security/evidence 两个完整包 3,756 项通过（含新增 93 项）、无失败或跳过；48 项核对、默认 vet、源码 postcheck、Go/包装 exit 0 和两轮准确 source/build/cache 目录独立缺席通过，未安装依赖。运行环境尚未配置真实 owner 来源，本人 MFA、完整准入实际 MySQL 和生产下载路由未由本候选验收。

最终来源摘要为 `f6443142de48b93364fabec5ad89952f67179c96bba6527f4ed104d6791c6c01`；[原始 Go JSON](evidence/a-download-mfa-packages-20261019-r2.jsonl)、[来源清单](evidence/a-download-mfa-packages-20261019-r2-source.json)及[原生日志](evidence/a-download-mfa-packages-20261019-r2-native.txt)保留。security 为 253 主/1,732 子，evidence 为 232 主/1,539 子。接收时 22 份重点 pin 及原输入均匹配；不扩大为整个工作树或后加来源已验收。

首轮 [r1](evidence/a-download-mfa-packages-20261019-r1-native.txt)保持失败：虽有三包合计 3,732 项测试通过，Go JSON 另记 `vendor/golang.org/x/net/http/httpproxy` 的 `vet.exe: exit status 0xc0000043`，实际 Go/包装均 exit 1。未推断更具体的操作系统原因，也未将首轮 server 的 passing events 记为成功整包门禁。首轮捕获因来源变化丢弃一次 partial copy 后固定第二次来源；属于构建前捕获，不是测试重试。r2 验证后续输入/回调边界增量的两个受影响完整包，并明确拒绝任何 `build-fail` 事件。

请求示例：

```json
{
  "password": "<current password>",
  "code": "<fresh six-digit TOTP>",
  "endpoint": "getSystemBackupEvidence",
  "idempotency_key": "<same key used for the later GET>",
  "request": {
    "evidence_id": "sev_11111111-2222-4333-8444-555555555555",
    "range": "bytes=2-5"
  }
}
```

`range` 可省略，表示完整内容；存在时不能为 null、空串或多段。它按后续 GET 的同一 parser 及服务器实际 content size 规范化。外层及内层拒绝重复、未知或大小写别名字段，拒绝客户端提交 request/Manifest 摘要、actor/session/issuer/auth_time 或 MFA 断言。响应沿用现有 `header_name`/`header_value`，后续 GET 使用相同 evidence、规范 Range 和幂等键；proof 不授予下载权限。

签发在唯一 RepeatableRead 事务中执行：

1. 核对数据库身份，取得 L0/L1 installation/config/持久历史 nonce 版本范围；从可信 owner-preview 加载当前已授权、可读取的完整 Manifest。用当前 session、固定 SHA 的 RBAC/issuer/历史 HMAC 文件建立原始来源快照。不能用 legacy evidence-row 回调替代此前缀。
2. 复用当前用户密码哈希、已记录登录会话/撤销行及已确认的 TOTP 密钥，真实 bcrypt/AES-GCM/TOTP 校验。下载权限按 evidence classification 检查；现有 MFA enrollment/security_admin 策略未因此扩大。
3. 用同一个 `BindSensitiveDownloadRequest` 构造 GET 和签发的 JCS/hash；实际 Ed25519 签发后，使用当前固定 registry 独立验签，服务端 signer 配置不一致按 not_ready 处理。
4. 记录一次 TOTP step 和原有布尔审计；重读当前 target/Manifest、RBAC、会话、config/history 和原始材料，与原快照比较。MFA 没有 L4 owner 锁，故采用同一来源的 Preview，不能调用假定已持有 L4 的 Owners.Recheck。
5. 最后回调之后采集 SQL UTC，保留原始 issuer/会话/材料/proof 期限；只有已知成功、且返回时仍未超过期限才返回 proof。未知或迟到提交不返回 proof、不自动重试已可能消费的 TOTP 步。

签发不保留下载 key、owner/reference 或 provider 访问权限，不执行 admission nonce 消费、容量预留、下载 intent/operation/receipt/claim，也不读取 provider/plaintext。真实下载仍需 D 完整当前授权与原子准入，不能拿签发成功替代这些检查。

部署只在真实材料与 owner 来源接收后显式配置 `RegistrationAPI.DownloadProofTargets`；缺省 nil 返回 not_ready。`LoadRegistrationApplication` 没有被接入合成 owner 或测试 registry。公共合同/正式 schema 的共享批准仍独立进行，本示例不代表已批准修改公共 schema。

本地验证分开覆盖真实密码/TOTP/JWT/Ed25519 与 HTTP；另一组借用原 D SQL 模型和真实固定文件 loader 检查同一 GET canonical、历史 key/RBAC/Manifest/config/session 变化，以及签发期间零下载副作用。SQL transport、owner 事实和文件内容是合成测试输入，不冒充实际人员 MFA 或 InnoDB 锁验收。
