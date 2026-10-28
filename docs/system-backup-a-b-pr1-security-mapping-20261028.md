# A：B PR #1 安全映射核对

只读核对已获取的 `origin/pr-1`，固定提交 **14768599f30846e9cfe22c121059ecf698e1b048**。未 checkout/merge、未抽取私钥或现场材料、未构建或重跑 Owners。本文是源码接点评审，不能接收 PR 的历史测试为当前 v12/现场通过，也不代签 B/C 合同。

结论：交付中有可复用的 worker 身份、撤销和 Job 关联实现；**没有因此关闭任何 v12 bootstrap 槽位，也没有取得 production link、独立原 bootstrap authority 或准确 C1 selections**。不能将其独立控制面启用，作为 v12 缺项的替代。

## 可复用实现与必须明确的桥接

| 领域 | B 准确源码与已有能力 | 现有 v12 边界 / 下一 owner 交付 |
|---|---|---|
| relay 身份 | `worker/control.go:80` Authorizer；`:91` 要求真实 verified TLS chain，`:96` 单一 SPIFFE URI；`:220` NewControlClient 固定 CA、mTLS、无 proxy/redirect。`control/worker.go:16` WorkerGrant 含 SPIFFE、Job UID；`:90` 锁内比对资源账本 Job UID/created/dispatched；`:108` WorkerAuthorizer；`:282` RevokeWorkers。 | B/D 把真实公共 installation/task/attempt、Job UID/generation、relay ref/version/期限、sequence/body hash/撤销绑定到 v12 job-observation cursor 和原 claim/fence，同事务持久化。内部 `system_backup_workers` / `system_backup_resources` 不能自行冒充公共账本。A 复核原证书/信任和当前工作身份，不从 SPIFFE 外观推导授权。 |
| KEK / 私有记录 | `control/vault.go` Vault 使用 mounted key version、AES-GCM/AAD 保存内部任务 plan/identity；`host/config.go:43` Keys 提供 Vault/Wrapping 的本地 key maps。README 明确 staging 不实现 KEK/KMS 权限或撤销、不能冒充最终 envelope_v1。 | A/B/C 仍须提供 backup/evidence 的原 generate/wrap/unwrap 生产 variant、provider key/ref/version、调用授权和全 retained 引用。内部 Vault key 不是 bootstrap `kek` 或 `evidence_kek` 的原可信授权来源，不能直接取 map 填槽。 |
| 三用途签名 | `recovery/signature.go:14` 定义 `manifest / acceptance_record / catalog_record`；Trust 检查用途/公钥隔离及 compromised；`:87` 使用 `clawmanager/system-backup/v1/<purpose>` + protected header 的签名 framing；`host/config.go:45` 是本地 Ed25519 private-key maps。 | 现有 A 三用途是 `capture_certificate / acceptance_record / catalog_record`，精确 domain/JCS/payload 与原 key/version 不得改写。B 的 manifest 不能别名为 capture certificate；相同 acceptance/catalog 名称也不证明正文和签名输入兼容。B/C 提交准确 payload/domain/版本映射与原调用身份后，A 沿现有 signer/key-history 接入；需改合同必须标明 breaking 依据。 |
| Secret allowlist / 数据库凭据 | `control/credentials.go` 通过任务 Vault、实际数据库 UUID、worker grant 管理内部采集/恢复短期账号及撤销。 | 不是本安装 namespace/Secret UID/resourceVersion/key/purpose/workload allowlist。A/B/C 仍需当前完整使用方与受审 JSON registry→broker 转换，不能把内部 credential ref 或备份动态建账号当作 Secret 原授权。 |
| artifact/evidence/catalog 凭据与信任 | `host/config.go` 有独立 staging/evidence/artifact 路径、Relay/NodeProof TLS、KeysFile、CatalogProfiles；`control/config.go` 控制库要求 `cm_backup_control_*`。 | C/A 仍需原 typed store/root/provider/scope、三精确 evidence 凭据、artifact 上传 issuer、catalog append/read/discovery 和各自 trust。内部路径/配置成功不能批准这些资源。原 v12 当前 config/SQL session/HTTPS/pins 及独立 bootstrap authority 不因新增控制库而成立。 |

## 原兼容性依据

`docs/users-instances-backup-branch-integration.zh-CN.md` 的“仍需单独完成”明确说明：文本冲突/编译通过不代表控制面整合，`/admin/backups` 与内部 `/admin/system-backup` 仍分别存在，公共 task/claim/fence、gate、resource/evidence ledger、artifact/provider/catalog 合同还需统一，不能证明两套控制器可同时启用。

`backend/internal/systembackup/README.md` 的公共控制面接入顺序要求 D 提供冻结任务/完整 writer registry/Journal/fencing/watchdog，A 提供任务 DEK/envelope identity，C 接最终 artifact/signature/catalog；内部 staging 不能替代最终 envelope_v1/manifest。此边界继续适用，不将各模块自己的 grant/receipt/hash 视为原 v12 bootstrap 授权。

## 交给 D/B/C 的最小下一输入

1. B 提供“公共 task/attempt/claim/fence → WorkerGrant/SPIFFE/Job/relay cursor”的精确桥接，以及完整实际 writer inventory。沿公共唯一事务/锁序接入，不并行启动内部控制器。
2. B/C 提供三用途 unsigned payload、canonicalization/domain/key-version 与当前 A 合同的逐项对应；capture certificate 不做 manifest 别名。A 负责实际 signer、权限/历史检查与资源适配。
3. A/B/C 固定两个 KEK 的生产操作组合/variant/原 provider；C 给 artifact/evidence/catalog 最小凭据、根、trust/discovery；实际部署提供 Secret UID/version/workload、原授权期限/撤销及受控挂载。
4. 原独立 bootstrap authority 认证上述全部关系和 C1 selection，而不是从这个 PR 的新 SQL/control JSON 生成许可。当前 production link 继续未装配，默认 27 / 真三材料装配后结构 24 的口径不变。

本核对新增的只有 Markdown/JSON 源码记录，没有测试缓存、临时目录或二进制；未安装依赖。具体 Git blob pins 见 `evidence/a-b-pr1-security-mapping-20261028.json`。D 已对上一轮五份 A Go 源码做 source-only 非实现者复核并反馈未发现绕过；正式准确回执由 D 保存，本核对不替代该回执。
