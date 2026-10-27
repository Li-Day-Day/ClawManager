# A 对 D 复审的第二轮修订（2026-09-23）

状态：本地返工与验收通过，待 D/C 按修订后指纹复核；v12 保持 draft。D 的[独立复审](system-backup-d-a-contract-rereview-2026-09-23.md)关闭原 D-A-01～06，但结论仍为 changes_requested。本交付回应新增 R1/R2，不覆盖或改写 D 的历史结论。

## 修订内容

| 问题 | 修订 | 验证边界 |
| --- | --- | --- |
| D-A-R1 | `Verify` 按 Unicode scalar 数校验 signature key ID/version 的 256/128 上限，显式拒绝无效 UTF-8；algorithm 同步使用 schema 字符长度语义。保留公开 schema 的字符集，不引入 ASCII 限制。 | 完整入口使用内存中合成 Ed25519 key 签名，覆盖最小长度、中文/补充平面字符恰到上限、超限、空串、无效 UTF-8 和 schema 允许的空白字符。有效字符串先经过真实 adapter 正向对照；无效 UTF-8 在入口拒绝。私钥不落盘。 |
| D-A-R2 | A capability schema、Go validator、handoff mapping 与 D `ProviderCapabilityRecord` 同步限制合法 status/reason 组合；不会悄悄改写上报状态。 | 共享 27 组完整枚举组合用于 A schema、Go 和 D 的三类 provider record；原 D 复现探针保持不变。没有认证远程 probe 或写入真实记录。 |

状态/原因闭集如下，待 C adapter 和 D persistence owner 复核：

| status | 合法 reason |
| --- | --- |
| supported | none |
| unsupported | unsupported_api |
| degraded | probe_failed、provider_unavailable、credential_unavailable、permission_denied、response_invalid、version_drift、internal |

`unsupported_api` 只表示已确认的 API/版本不支持；版本发生变化但尚未证明不兼容时使用 `degraded/version_drift`。这个映射落实主计划第 9.1 节的确定性不支持与暂时故障区分，不新增 reason code。C 仍需提供确定性判断所依据的 probe 事实。D 的派生 projection 仍须按精确 identity/ref、DB time 与记录有效期生成，schema 合法不等于派生事实正确。

## 验收与交接

本轮运行结果与修订后文件 SHA-256 记录在 [A 第二轮本地验收](evidence/system-backup-a-rereview-revision-20260923.json)。本地验收不是 D 签收，也不是 C 对 adapter 行为的批准。D 的原始 review/evidence/probe 均保留。

- A 完整验收退出 0：23 个 Go 顶层测试（18 个 A 测试、5 个原 D 探针），Node 安全 6、对象 3、SSH transport 5、artifact 70、gate 6 项通过；inventory 和非 strict check 通过。
- D Go 验收重跑退出 0：25 个顶层测试，包含未修改的两项 D revision 测试及 6 个叶级反例。D schema 探针 2 项通过。
- 首次 D Go 验收在编译 `unicode` 时出现 Windows compiler `0xc0000043`，退出 1，scratch 已清理；它不计为通过。结束其他运行后，在子进程设置 `GOFLAGS=-p=1`、`GOMAXPROCS=2` 重跑成功。测试源码未改动，也未安装依赖。
- 两轮 D scratch 和 A scratch 均已清理。strict check 仍退出 1：4 份缺失合同、3 张 catalog 表 inventory 缺口、39 项策略与 56 项交叉评审待完成，schema evidence 仍未注册。

复核命令（仓库根目录、本机 PowerShell；不安装依赖，Go runner 在 finally 清理独立 scratch）：

```powershell
powershell -NoProfile -File scripts/system-backup-a-local-validation.ps1
powershell -NoProfile -File scripts/system-backup-d-a-revision-review.ps1
node scripts/system-backup-d-a-revision-schema.test.mjs
node scripts/system-backup-contract-check.mjs --check --strict
```

最后一条是冻结门禁检查，当前 draft 的既有缺口仍会返回 1；不能把它列为通过。没有修改 approval 或 freeze gate。

当前远程身份预检已有退出 0 的记录，无需重跑。D 的 [provider lab](system-backup-d-provider-lab.md)已准备脚本，但文档仍标记待操作者部署，实际 key ref/测试身份/独立 bucket 尚无成功交接证据。远程阶段继续暂停；只有取得成功部署的实际 handoff 后才安排 A capability spike。本轮没有连接远程、部署资源或创建 active config。
