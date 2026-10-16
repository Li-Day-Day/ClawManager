# A evidence 只读校验：固定输入、取消与 reader 清理

日期：2026-10-14。范围为 A 已有 `VerifyDetachedEvidence` / `OpenRange` 及共用 envelope reader 的本地安全边界；不依赖 B/C 生产接入，不新增公共合同、读取权限或恢复执行入口。完整 evidence 包与默认 vet 已通过，本地专项已收口；真实 artifact/生产接线仍按下方范围单独验收。

## 问题与修订

原入口接收 `Manifest` 值，但其中 `Chunks` 切片仍由调用方持有。验证 `ChunkRoot` 后，provider 的同步回调可以改动同一切片：既可以破坏一份最初有效的索引，也可以把一份具有错误 chunk hash、但结构和 root 自洽的索引改回正确 hash。原读循环会使用回调后的字段，未重新绑定已验证的 root。

新增内部 `snapshotReadManifest`：先拒绝超出 1–1024 项的索引，再复制所有 chunk 值并验证完整 manifest。两个入口只使用这份独立快照；回调修改调用方字段不会改变正在验证的索引。回归同时覆盖“有效输入在回调中被破坏”和“错误输入在回调中被修正”，对 detached 与 Range 两种路径分别验证。调用方仍不得在复制期间并发修改输入，这不是允许数据竞争的 API。

| 边界 | 修订后的行为 |
| --- | --- |
| provider 回调改动调用方 chunk 索引 | 固定已验证快照；最初错误的 hash 仍返回 `checksum_mismatch`，不被回调修正为成功 |
| detached 最终 Stat 忽略取消并返回匹配元数据 | Stat 前后检查当前 context，取消返回 `artifact_unavailable`，不报告验证成功 |
| KMS Unwrap 成功时取消当前请求 | 擦除临时 DEK，停止后续 frame 请求；不返回明文 |
| Range/reader 已取消 | 在 provider 调用前拒绝；返回前再次检查取消，失败路径擦除已聚合的明文 |
| Range 返回 typed nil reader | 返回 `artifact_unavailable`，不调用 nil receiver 的 Read/Close |
| Range 同时返回 reader 与 error | 关闭已打开的 reader，返回脱敏的 `artifact_unavailable` |

正式类型、对象版本绑定、store/KEK 身份、framing、checksum 和错误类别均沿用原实现。DEK/provider 凭据和明文不进入本次交接记录。

## 本地验证

使用现有依赖、`GOPROXY=off` / `GOSUMDB=off` / `GOTOOLCHAIN=local`、只读 module、低并发隔离缓存，在 `backend` 运行 `go test -count=1 -v -p=1 ./internal/systembackupevidence`，默认 vet 保持开启。本轮只运行 Windows 本地包测试，不重复 Linux 编译或远端 MySQL。

新增回归入口：

- `TestVerifiedReadsFreezeManifestBeforeProviderCallbacks`：两种 reader 各验证有效/错误输入的同步回调修改。
- `TestVerifyDetachedEvidenceRejectsCancellationDuringFinalStat`：最终 provider 观察取消不得报告成功。
- `TestVerifiedReadsRejectCanceledUnwrapAndEraseDEK`：取消后不继续读 frame，DEK 被擦除且没有明文结果。
- `TestReadExactRejectsTypedNilAndClosesErrorReader`：typed nil、错误附带 reader 的关闭，以及取消后的零 provider 调用。

[机器记录](evidence/a-evidence-read-boundary-local-20261014.json)与[完整本地输出](evidence/a-evidence-read-boundary-local-20261014.txt)记录 169 个主测试、1240 个子测试全部 PASS，默认 vet 开启，包运行 166.904 秒，最终测试/外层退出均为 0。本轮未遇工具崩溃。Go helper 使用 host stream 的完整输出已从无截断的本地执行捕获分段合并归档，不是远程 transcript。

六份相关 core/helper/fixture 源码在门禁中采样与结束核对时摘要一致；不声称冻结整个依赖图。准确本轮 `.tmp-a-evidence-72bc2d4eaea7479fa796d6f8f3ed689d`、缓存和二进制均已删除，清理标记为 true，并独立确认该目录不存在。未安装依赖、未执行 SSH 或真实 MySQL；Linux 交叉编译未在本轮重复执行。

## 接收范围

这是现有 A 只读验证组件的安全修订，不完成 committed artifact 来源认证、签名 profile 的跨 Owner 评审、灾备 bootstrap/真实 provider 准入或完整 P0b 验收。十五表远测继续等待操作者通知，不在这轮读取或重跑。B/C 实际来源和 D 生产编排仍按原交接门禁处理。
