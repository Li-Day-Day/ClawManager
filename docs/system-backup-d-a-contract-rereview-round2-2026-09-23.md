# D 对 A 第二轮修订的复审（2026-09-23）

结论：**本轮修订复审通过，D-A-R1、D-A-R2 关闭；未发现新的可复现问题。** 此结论限于当前指纹对应的本地合同/校验修订，v12 仍为 draft，不代表真实 provider、事务接入或整个 P0-0a 已验收。

评审输入：[A 第二轮修订](system-backup-a-rereview-revision-2026-09-23.md)。独立运行结果与33个输入文件的 SHA-256 见[本轮复审快照](evidence/system-backup-d-a-contract-rereview-round2-20260923.json)。[上一轮报告](system-backup-d-a-contract-rereview-2026-09-23.md)及其失败证据保留为历史，不覆盖、不移作本版本结论。

## 修订验收

| 问题 | D 核对与独立验证 | 结论 |
| --- | --- | --- |
| D-A-R1：Unicode 签名 metadata 被误拒绝 | `Verify` 对 algorithm/key ID/version 显式验证 UTF-8，并使用 Unicode scalar 数对齐 schema。未改变公开字符集或长度上限。未修改的 D 真实 Ed25519 反例现已通过；A 新增测试覆盖最小值、中文/补充平面字符上限、超限、空值、无效 UTF-8 与 schema 允许的空白字符。 | 关闭。 |
| D-A-R2：临时 capability 故障被接受为 unsupported | A Go、A evidence schema、D `ProviderCapabilityRecord` schema 和 handoff mapping 已同步：supported→none，unsupported→unsupported_api，其余7类原因只接受 degraded。版本漂移本身不等于确定不支持。未修改的 D Go/schema 反例现已通过；D 另按独立期望枚举27种组合，确认9种合法、18种拒绝，向量无重复，A schema 与三类 D provider record 一致。 | 关闭；D 接受本次 D provider record schema 的对应修订。C adapter 的实际判定事实仍需其 owner 验收。 |

原 D-A-01～06 的既有探针及相关安全回归本轮仍通过。没有修改 A 的实现、原 D 探针或本轮验收预期以使测试通过。

## 实际验证

| 命令/范围 | 本轮结果 |
| --- | --- |
| `powershell -NoProfile -File scripts/system-backup-d-a-revision-review.ps1` | 退出0，25个 Go 顶层测试通过：18个 A 测试、5个原 D 探针、2个 D revision 探针（含原6个叶级反例）。 |
| `node scripts/system-backup-d-a-revision-schema.test.mjs` | 2/2通过。 |
| `node scripts/system-backup-a-security.test.mjs` | 6/6通过；覆盖签名边界、27组状态/原因、provider parity、Secret ref 与 role/code 映射。 |
| 对象 fixture / contract artifacts / contract gate 测试 | 分别3/3、70/70、6/6通过。 |
| D 独立 status/reason 矩阵检查 | 27个唯一组合；9合法、18拒绝；A/D schema 与向量一致。 |
| inventory `--check` / contract `--check` | 均退出0。 |
| contract `--check --strict` | 退出1，既有冻结门禁仍阻断；不计作通过。 |

全量 Go 已包含本轮涉及的 A 测试，无需重复编译 A runner。未安装依赖、未连接远程。Go runner 使用隔离 scratch 并禁止依赖/工具链下载，最终返回 `D review scratch removed: True`；测试源码副本、build cache、测试二进制均已删除。保留的文档和证据是审查交付。

## 后续边界

- R1/R2 不再作为当前返工项。B/C 的接口签收、C 对确定不支持的 probe 事实证明仍需独立完成。
- D 后续仍需接入历史 nonce-HMAC 完整版本清单、nonce/audit/mutation 同事务，以及 provider 登记的 DB time、CAS 和证据绑定；本轮纯校验测试不证明这些集成已实现。
- strict gate 仍显示4份缺失合同、3张 catalog 控制表 inventory 缺口、39项策略与56项交叉评审待完成，schema evidence 未注册。平台实际 provider handoff 与 A 的真实能力验收仍按各自交接推进。
- 本次记录的是修订范围的 D 验收，不改 `approved_reviewers`、`approved_cross_reviewers` 或 freeze gate，也不代替其他 owner 的完整合同签收。
