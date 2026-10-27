# D：分组索引远测的源码冻结修订

2026-10-15。操作者交付的六组原始回执保存在 `docs/evidence/d-index-groups-20261014082443-8b4f65ad`。[失败审计](evidence/system-backup-d-index-group-failed-20261015.json)逐组重新运行严格解析器：六组各自的 A/D/HTTP、索引测量和清理回执通过；跨组汇总仍拒绝 `Grouped A/HTTP binary drift`，没有生成成功 suite receipt。

| 分组 | A authority 指纹前缀 | HTTP 指纹前缀 |
| --- | --- | --- |
| r1-page | c4ba30b52786 | 2adc8f11dfef |
| r1-status / r1-all / r2-all / r2-status | 006d543f069c | 1e454d343170 |
| r2-page | 3fea74415632 | 978b282ec6c0 |

六组 D 索引探针始终为 `8f45b751582221e187c7a847725da323a279902cda4a89b93193543be8cf9c2c`。用户说明期间 A/D 都在开发，指纹变化与这类并发修改相符；原回执未记录源码快照，不能精确反推每次二进制对应的全部源码。共享编译缓存不能冻结源码，这轮混合版本不能改判为完整比较通过。

## 修订后的执行边界

[分组入口](../scripts/system-backup-d-index-group-validation.ps1)在首次编译/SSH 前，用 [快照 helper](../scripts/system-backup-d-index-source-snapshot.ps1)复制一次 backend、contracts、scripts 构建输入、docs SQL 和明确需要的 JSON fixture。动态测试回执和非构建文档不属于输入。复制前后核对文件集合和每个文件 SHA-256，拒绝复制期间的变化、路径换绑和重定向；每个复制文件设为只读。

六组随后全部从同一临时源码根目录运行，包括编译、迁移/DDL 打包和报告解析；后续工作区开发不会改变它们。每组前后再检查快照文件集合及内容，原始 transcript 记录 `D_INDEX_GROUP_SOURCE_SHA256`。共享缓存放在这个冻结根目录内；Go 使用 `-buildvcs=false -trimpath`，避免原工作区 Git 元数据与临时目录路径进入二进制身份。

每组完成后仍执行严格单组门禁，并与第一组核对 A/HTTP/index 二进制；漂移立即停止剩余组。六组最终汇总仍要求全部二进制、catalog、DDL、schema、MySQL 及数据/查询分布一致，没有放宽原规则。新的 suite completion 额外绑定 `source-snapshot.json` 的文件摘要；verifier 重新计算清单整体摘要并匹配六份原始 source marker。

`finally` 删除本轮拥有的整个源码快照与缓存。留存的 source-snapshot JSON 仅有输入路径、size、SHA-256，不保留临时源码树、二进制或 cache。原失败轮的 transcript、独立单组结果与失败审计保留。

## 本地证据与后续运行

[脚本回归](evidence/system-backup-d-index-snapshot-local-20261015-r2.txt)包含 41 项 Node 通过、原有输入/清理门禁以及源码后续修改隔离、拒绝覆盖/新增输入/内容变更。优化目录核对并限定实际构建输入后，[真实工作区复制校验](evidence/system-backup-d-index-snapshot-copy-local-20261015.json)完成 1,151 个输入的准确复制、完整核对和删除。最初一次复制时输入集合变化，helper 正确拒绝并清理；没有为它执行 SSH 或安装依赖。

本地门禁之后由操作者运行同一命令，入口自动创建新 evidence 目录；运行期间 A/D 可以继续修改原工作区：

```powershell
& .\scripts\system-backup-d-index-group-validation.ps1 -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
```

## 冻结入口远测已接收

操作者完成 [六组报告](evidence/d-index-groups-20261015003501-c2d5ec5c/report.json)，D 使用当前严格 verifier 独立复核完成收据、六份原始输出、原始报告重建、source manifest 与 marker、二进制/DDL/catalog/分布一致性及准确本地目录不存在，exit 0。汇总接收记录见 [机器回执](evidence/system-backup-d-index-group-accepted-20261015.json)。本轮一共 1,026 组查询前后配对，A SQL、D HTTP 与 index 单组门禁全部通过；两轮顺序反转，六组均 exit 0 并报告准确 namespace UID 清理。

冻结输入 1,152 项，整体摘要 `594cf6595174949428f16e04d9166882ad165e2f7412ac0c900a222e411ec84c`。六组 index 二进制均为 `a2f1dfce272f4850930b8784f8ec545eab639fa11d2ef85d4a11ad859938ae15`，HTTP 为 `8bf7ade3a83d8680a14f3943892eaba0fd34c2bb0f803812e4a812a335e4aa59`，A 为 `c939cd18f490ee17041a245f9be345b76c867e72871161552973fccd2ff1e254`。本轮源码快照与缓存拥有目录 `.tmp-d-index-cache-23e56d031ac14841850605991e164689` 已删除，独立 verifier 确认不存在。原失败轮仍保留，未把其六组拼入此次通过轮。

| variant | 两轮新增索引总量 bytes | cutoff p95 比率汇总 | page p95 比率汇总 | status-page p95 比率汇总 |
| --- | --- | --- | --- | --- |
| page | 2,473,984 / 2,457,600 | 0.1466 | 1.0758 | 1.0333 |
| status | 4,030,464 / 4,063,232 | 0.9724 | 1.0044 | 0.9771 |
| all | 6,602,752 / 8,650,752 | 0.1113 | 1.0479 | 1.0935 |

上表比率先在每张表/每轮内取查询配对的 after/before p95 比率中位数，再跨表/轮取中位数；不是合并总体 p95，也不是生产延迟预测，越小表示该指标越好。page/all 对 cutoff 的收益在本合成分布下明显；普通 page 和状态分页没有显示稳定的整体改善，status 的 cutoff 也存在较大波动。因此本轮可支持继续评估空间较小的 page 候选，不能据此把全部候选索引自动提升为正式迁移。

本轮仍是 synthetic 分组比较，表各 12,000 行、FK 未克隆且使用 warm cache；没有建立代表性生产负载或明确生产预算。它验收读取/索引的冻结比较入口，不覆盖后续 canonical writer、生产索引迁移或 B/C 生产接入。
