# D 真实配置准入与部署缺项（2026-09-28）

后续 D-only 增量见 [离线初始化接入与 owner 边界](system-backup-d-bootstrap-entry-20260928.md)：已补部署文件加载与可执行调用入口，真实 owner adapter 仍未接入。下文“部署调用入口未接线”保留为本次增量前的状态；权限配置安全 API 属于 A，D 只做其集成，不代实现。

当前结论为 **BLOCKED**：已补充准入编排和公开输入核验代码，但真实资源适配器、完整配置和部署输入未齐。HTTP 服务尚未部署，管理员本人 MFA 与实际配置激活尚未执行。目标仍为 `root@10.130.14.23` / `clawmanager-zhanghui08-system`；操作者确认交互 SSH 和本人 MFA 由本人在终端完成。

## 搜索与输入核验

本轮检索了仓库的部署、脚本、合同、交接和 evidence 文件；机器核验另扫描 `docs/evidence` 与 `deployments/k8s/system-backup-provider-lab` 的公开 JSON。找到版本化 provider issuer、strong-auth issuer 和 RBAC 三类输入，原始 bytes SHA-256、immutable ConfigMap、精确 volume 路径与配置 schema pin 均匹配。只把它们计为公开输入完整性通过，不据此认定其当前有效、已激活或已获跨 owner 批准。

结果见 [机器缺项记录](evidence/system-backup-d-activation-inputs-20260928.json)。未找到下列真实交付：

| 缺项 | 需要交付的内容 |
| --- | --- |
| 六类 registry | `parts`、`redis_sources`、`failure_domains`、`disaster_identity_mapping`、`source_writers`、`secret_allowlist` 的实际版本化内容、对应 profile/schema 与审阅结论。合同样例不作为环境输入。 |
| 二十类 ConfigReference | `artifact_write/read/delete/upload_issuer/ca`、`evidence_store/write/read/delete/ca/kek`、`kek`、`capture_signing`、`acceptance_signing`、`catalog_signing/read/append/snapshot`、`nonce_hmac`、`status_relay` 的逐项实际 identity/version 和 typed-ref/provider/Secret 映射。这里不表示底层二十种服务全部不存在。 |
| 完整配置与 runtime | 候选包中没有完整 `bootstrap-config.json` 或 `runtime.json`。须按完整 ConfigValues 和 RegistrationRuntimeConfig 提供实际配置，不能把三个 registry 的输入包直接用于激活。 |
| 尚缺的相关机器合同 | 当前 manifest 将 `recovery_catalog_records`、`restore_target`、`status_relay`、`catalog_scan_record` 标为 missing；尤其不能自行猜测 status relay 或 catalog 的配置映射与能力语义。 |
| 运行条件 | 实际库迁移/管理员重验、最小权限数据库与 provider 身份、TLS、容量 collector 和 core logout 接线。已有 lab handoff/历史签名回执不能替代当前凭据有效性与实际部署验证。 |

本地可重复核验命令：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
node .\scripts\system-backup-d-activation-inputs.mjs
Write-Output "activation_inputs_exit=$LASTEXITCODE"
```

退出 `2` 表示输入可核验但仍阻断；退出 `1` 表示输入损坏、不匹配或读取失败。该命令没有放行模式，不连接远程、不修改文件、不读取凭据。`--bundle <目录>` 可检查同格式的另一个公开候选包。其 JSON 解析仅用于公开输入完整性盘点，不能替代服务端严格解码或生产准入。候选自行填入 `ready_for_activation=true` 不会改变结论。

## 本轮代码增量

- `bootstrap_admission.go` 实现 `BootstrapAdmission` 的强制编排：九类 registry 与二十类 ref 的适配器必须全部存在，另必须提供跨资源策略、live offline grant、nonce material 和容量预留。缺失在 provider 准备调用前拒绝；适配器预检在 SQL 事务外执行，事务内重新核对绑定配置、当前离线授权/RBAC、registry 原始 hash、各资源观察及 nonce，并在同一事务中预留容量。错误不回传原始 provider/Secret 诊断。
- `bootstrap_grant.go` 提供部署文件的精确 hash/严格结构读取。每次授权重新读取，文件移除、字节变化、有效期过期、授权字段变化均不能沿用旧回执；文件必须由部署侧控制，不能从 HTTP 请求接收。
- registry 文件读取范围扩展至合同中的九类，保留 kind 闭集、版本路径与 hash 校验。未放开任意文件读取。
- 独立 registration CLI 增加 `-check-bootstrap-config <文件>`：在读取 DSN 前调用完整 ConfigValues 解码器，只输出配置摘要与“结构通过”，明确 provider admission 和本人 MFA 未运行。旧 `-check-activation` 输出改称 `registration-runtime-check`，避免把其局部检查误称完整配置准入。
- 两个现有 Dockerfile 增加 registration HTTPS 服务和独立 migration 二进制的构建/复制。未构建镜像、安装依赖、推送 registry 或 apply Deployment。

**实际 registry/ref 适配器和部署调用入口仍未接线。** 本轮编排接口要求各 adapter 验证 schema、不可变身份、用途、TLS/SSRF、权限和 capability；这些要求不能靠返回 nil 的适配器或公开 JSON 中的布尔值实现。跨资源的用途隔离、灾备映射、allowlist 和保留策略也必须由真实实现检查。因此本轮不是“完整生产 BootstrapAdmission 已完成”，也不是正式 config_update/rollback 的交付。

## 验证与下一步

新增测试覆盖逐项缺失的 29 个 adapter、配置/授权/registry 漂移、失效的资源观察、nonce 长度、容量拒绝、提交后撤销授权的幂等重试，以及 nonce 临时副本清零。公开输入测试覆盖 hash、重复 registry、挂载路径、可变 ConfigMap、schema 漂移和自填批准不能绕过。所有 adapter/provider 测试使用明确的 synthetic doubles，不能作为本人 MFA 或现场服务验收证据。

本轮验证通过：安全包全量测试及默认 vet PASS（3.404 秒），registration CLI 编译与 Linux amd64 服务构建 PASS，runner 退出 0；公开输入测试 7/7 PASS，实际核验 CLI 退出 2（预期 BLOCKED），gofmt 与 diff 空白检查通过。Node 的 worker 子进程曾被沙箱以 EPERM 拒绝，改为直接运行测试文件后七项全部通过。全程未安装依赖，专用 Go 缓存、Linux 二进制和输入测试临时目录均已清理。详见 [本地验证记录](evidence/system-backup-d-real-admission-local-20260928.json)。此前已成功的 93 文件远程迁移和隔离 HTTP/MySQL 套件无需重跑。

下一步需补齐上述真实输入及对应适配器，生成绑定实际 namespace UID、数据库 UUID、镜像 digest、运行身份和 TLS 的部署包并完成审阅，然后由操作者在终端执行部署。服务就绪后才进行本人登录、TOTP 登记/确认及完整配置事务验证。首次 bootstrap 只创建 `enabled=false` 的 v1 配置；不能把该提交或 `-check-activation` 通过描述为备份功能已启用。当前没有可安全执行的完整激活命令，也未要求操作者重复运行旧探针。
