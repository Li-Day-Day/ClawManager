# A → D：canonical 回填的行指纹与来源摘要

> 更正 A-BACKFILL-SCHEMA-01：原合同把 VARCHAR 的字符容量当成有效上限，漏看 066 的 `OCTET_LENGTH` CHECK。当前以[合同修订 2](evidence/a-config-backfill-identity-contract-20261015-r2.json)及[纠正审计](evidence/a-config-backfill-identity-schema-audit-20261015.json)为准：created_by 为 1..128 UTF-8 字节；change_reason 为 NULL 或 1..512 UTF-8 字节，空非 NULL 原因拒绝。先前 Go/Node 通过只证明旧输入上的表示 parity，不能支持旧 SQL 字符预算结论；旧合同/回执保留历史原字节。当前实现与固定副本验证已完成，见下方 r4 限定验收。

本项补充 [A 维护摘要合同](system-backup-a-canonical-maintenance-digest-handoff-20261015.md)中的 `expected_row_sha256` 与 `source_provenance_sha256` 派生算法。当前规范见[机器合同修订 2](evidence/a-config-backfill-identity-contract-20261015-r2.json)，实现见 [config_backfill_identity.go](../backend/internal/systembackupsecurity/config_backfill_identity.go)。接受范围是供 D 实现的表示和绑定算法；来源认证、运行授权、正式迁移及真实回填仍分别验证。

## 行指纹

`CanonicalConfigBackfillRowIdentity` 接收调用者从事务内锁定行独立扫描的事实与已冻结的原文字节，先核对准确 JCS、存储 hash/size 和全部 materialized 列，再计算 `a-config-canonical-backfill-row.v1` JCS/SHA-256。不能从原文构造一个“正确 SQL row”跳过实际列比较。

指纹包含准确 server/database、installation、完整 unsigned-64 行 ID（十进制字符串）、schema/version/row_version、nullable copied_from_version、原 hash/size、created_by、nullable change_reason、原 DATETIME(6) 和全部展开列。SQL booleans 使用 `0`/`1` 文本，整数使用十进制，DECIMAL 使用准确两位小数，不经过 float64。保留 NULL 原因、大小写、Unicode 和合法空白；非 NULL 空原因拒绝。时间必须原样为 UTC 微秒，不舍入。

完整指纹 JSON 仅供内部比较，可能包含旧元数据；持久化收据/审计只记录摘要及另外审核的脱敏事实，不能将该 JSON 当作 Admin 响应或直接写日志。

`canonical_config_json` 不进入不可变指纹，因为 NULL→准确原文是唯一允许变化；writer 仍须在同一锁内单独检查该列的 NULL/same/different，并在写后再次核对全部原列。active pointer、有效启用、监控历史不属于这张配置行，也不因这个摘要而获准改变。

正式 066 还显式规定 `chk_sb_config_created_by` 和 `chk_sb_config_reason`：有效上限为 128/512 UTF-8 字节，非 NULL 原因为空也不合法。先前“按 SQL 字符上限”修订不正确，已收回。新的正向检查保留准确 128/512 字节的 ASCII 和多字节文本；反例将字节上界错改为字符上界时，129/513 字节的多字节值必须在指定断言失败。合法既有行的 JCS/domain/摘要算法保持不变。

另外补正实际 SQL 的固定小数位：新行 INSERT 的参数可以使用最短十进制 `1.5`，读取 DECIMAL(4,2) 的独立事实却是 `1.50`。行指纹现在从已验证的整数百分位推导预期 `1.00`/`1.50`/`2.00`，不使用 float64，也不篡改或 trim 实际扫描列。新增三项独立向量和拒绝非 SQL scale 的检查；先前默认 1.25 向量未覆盖这些合法值。当前合计七项向量、四项 Node 检查及 Go r4 冻结验证已通过，见[Node 输出](evidence/a-config-backfill-identity-vectors-local-20261015-r4.txt)和[限定接收](evidence/a-config-backfill-identity-review-20261015-r4.json)。

## 来源摘要

`CanonicalConfigBackfillProvenance` 使用 `a-config-canonical-backfill-provenance.v1`，绑定相同 target/version/原 hash/size，以及受信原归档 authority、不可变 record ID/version 和准确已认证 manifest 原文摘要。这里的 record ID 不是工作目录中当前可变路径；新生成的配置或事后重建再签名的文件不因此成为历史原文。

它是摘要表示，不验证 source signature，也不批准新的来源 issuer/manifest 协议。writer 必须先从独立受审来源验证完整原文和 manifest 的准确目标绑定，最后再次检查相同 source pin。原文缺失时继续保留 NULL/读取 503。

## 实现与验证范围

[独立 Node 检查](../scripts/system-backup-a-config-backfill-identity.test.mjs)从原已签收的合成 ConfigValues 向量自行展开全部 SQL 列，不调用 Go projection；逐项比较 066 列清单，确认没有漏列，并生成四项 JCS/SHA-256 向量。首次测试脚本误将已有 `capacity` 分组写为 `capacities`，在生成文件前失败；原始日志保留。修正测试分组名后，三项 Node 检查通过，见[r2 输出](evidence/a-config-backfill-identity-vectors-local-20261015-r2.txt)。公开 schema 和原向量未改动。

[Go 检查](../backend/internal/systembackupsecurity/config_backfill_identity_a_test.go)覆盖全部展开列的逐列漂移/遗漏、目标及不可变元数据、原文及字节/字符预算、NULL/空值、最大 unsigned ID、准确微秒和 provenance 每个字段的变化。专用[冻结验证入口](../scripts/system-backup-a-config-backfill-identity-validation.ps1)默认 vet、离线只读依赖，最后删除本轮源码副本、cache/tmp/telemetry 与产物。Unicode 修订还增加临时 overlay 反例，只把两个 SQL 字符谓词退回字节谓词，两个合法多字节用例必须在指定断言失败。

## r4 更正后限定验收

[r4 接收](evidence/a-config-backfill-identity-review-20261015-r4.json)与[完整输出](evidence/a-config-backfill-identity-local-20261015-r4.txt)固定 1,243 项输入，摘要 `4b260ea10349f623c795d7b19b812ed55ffdfb052300728d37b31bcf304fd63e`。定向 9 主测试/192 子用例，正常源码完整 security/config 两包 216 主测试/1,412 子用例（1,628 项）通过；security 为 196/1,299、63.490 秒，config 为 20/113、28.157 秒。默认 vet、进程 exit 0，无工具崩溃重试；定向重复覆盖不叠加。

两个只撤掉字节上界的反例均在指定断言失败，exit 1；不是完整回归失败。最终六项新实现/向量/工具和全部已有 1,243 项 live 输入匹配。期间 D 新增三份 maintenance receipt 实现/测试不在副本内，不能据本轮接收它们或最新整个工作树。

准确目录 `.tmp-a-evidence-9d1e4378fef34ec3bd20400a703bca17`、`.tmp-d-index-cache-1caa97c1da26460ea056a3d5de258728`、其 cache/tmp/telemetry/overlay 与产物均删除并独立确认；92 个 fixture 目录也确认不存在。原 A 写/维护摘要合同、066 和初版身份合同原字节保持不变。旧三个合法向量的 hash 保持一致；旧空原因向量对应不可能的正式 SQL 状态，原文已归档，现明确拒绝。

当前合同修订 2 SHA-256 为 `d9f7ac1916a2a7441594cd42ec6bf755c1036a2a2270f99ae312ce8efac1e6cb`。本轮更正验证只接收表示/原文与锁定行一致性，不接收实际来源认证、运行 grant、维护收据或真实回填。

## 历史固定副本表示验收（SQL 字符预算结论已撤回）

[最终接收记录](evidence/a-config-backfill-identity-review-20261015.json)绑定[新固定副本](evidence/a-config-backfill-identity-source-20261015-r2.json)的 1,235 项输入，摘要 `a0e4cddd75aa0dfed8301899736e9577a7d744e21fd9be9e501e92996c78e0d7`；[r2 原始输出](evidence/a-config-backfill-identity-local-20261015-r2.txt)确认：

- 定向 7 主测试/182 子用例通过，包含 126 个展开列各自的错误值/遗漏、完整 row 元数据和来源绑定、合法 SQL 多字节字符边界。
- 只撤掉两个 SQL 字符上界的临时 overlay，让两个合法多字节子用例在指定断言失败、exit 1；正常冻结源码不变。该预期失败与完整回归分段核验。
- 正常源码完整 security/config 两包 204 主测试/1,207 子用例，共 1,411 项检查通过；security 为 184/1,094、68.404 秒，config 为 20/113、11.104 秒。定向重复覆盖不叠加到完整包计数。
- 默认 vet，进程 exit 0，无工具崩溃重试，离线只读 module/local toolchain；未安装依赖。
- 测试后固定副本复核通过；归档时已有 1,235 项 live 输入全部匹配，没有新增未纳入文件。五项新实现/测试/向量/工具均匹配，原 A 写合同、维护摘要合同和 066 原字节保持不变。
- 精确拥有目录 `.tmp-a-evidence-46b03b14348740489fd49085ce781f12`、`.tmp-d-index-cache-3f7f0ebbc13d4b03b92382c5f3237c60` 的源码、overlay、cache/tmp/telemetry 与产物均删除并独立确认；日志中的 92 个不同 fixture 目录也确认不存在。

[首轮记录](evidence/a-config-backfill-identity-superseded-20261015.json)保留较早 1,235 项输入、定向 6/180、完整 203/1,205、默认 vet/exit 0 和准确产物清理。该副本冻结于 SQL 字符预算修订之前，只说明其当时已覆盖用例通过，不作为当前候选接收，也不与最终轮重复累计。

机器合同 SHA-256 为 `712c8206d7408872c35ce882f5310530c10fc9e646203f389011fe05cb39f5d4`。本次接收两个算法供 D 使用，不改变原维护 actor/grant/request 摘要 profile，也不批准真实来源或运行材料。

该交付不执行 SQL、签发写 grant、交付历史原文、提升 081/082 或启用 HTTP。D 可组合这两个摘要与原维护 actor/grant/request 摘要；正式 writer、当前授权/观察协议、来源认证和安装材料仍须完成。
