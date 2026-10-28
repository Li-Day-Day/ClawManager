# D：15 项 GC operator 源码材料与准确复审

当前已更新为 **D r5／A r4（dc79 → f3ed）**：修复了用户 `5c1c...` 本地 standalone gate 的 checkout 依赖，A 已接受准确新源码；同一新 binary 的 source GC3 和真正 empty cwd GC3 于 16:31 全部实际通过，临时副本已清理。当前完整证明、正式 `ReviewedSourcePath` 与带窗口前置检查的人类重试命令见 [本次 standalone 修复交接](system-backup-d-gc-detached-seed-fix-20261027.md)。后续旧 r4／A r3 材料仅保留历史，不能用于修复后的源。本聊天未启动重试／远测，实际 GC SQL 仍未接收。

## 历史准确来源：D r4／A r3

A 已正式接收 [当前 operator source review](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json)，SHA `7425805a56e061e999956777845c472eb330b89b3cbf7981f9bf95237255fc2b`，664,726 字节。原始完整来源为 1,720 / `6bf973bd11709b14fa04c13175aadfbd126020be3a10a8c514596b5dd29cb9ca`，operator overlay 为 1,721 / `46bcb2758c1aabb0839f2b6452aec53c2642b136d1f0f55601ef31118b4156f5`。D-GC 已读回并运行 `node docs/evidence/a-gc-lifecycle-operator-source-review-20261027-r3.mjs --check`，退出 0；五个 capture 字段与 D r4 候选完全一致，capsule 仍为 `d9c5e055...`。

| 当前材料 | SHA-256 |
| --- | --- |
| [D r4 候选](evidence/d-gc-full-lifecycle-source-candidate-20261027-r4.json) | `cbbd28eb2c925d5134fe89d7717e0e0378ecc4b38ed006adf7bee52a51c70faa` |
| [D r4 请求](evidence/d-gc-full-lifecycle-review-request-20261027-r4.json) | `643a8b0f06e0c84f0ff43742f13353dcbda93657dce03196cb0fcd26af74a583` |
| [D r4 渲染 harness](evidence/d-gc-full-lifecycle-rendered-harness-20261027-r4.ps1) | `d94305ae3e06fbb2903717bbd6db5e663c28032bccb097e45302b00e8fa45f3b` |

r4 相对 7c4288 的 r3 原始输入仅增加两份已由 A source／mock 接收的 PromQL 准备支持脚本；旧 1,718 份输入逐字节不变，五份 origin harness、七处 literal overlay、phase 和已修正的 Writer＋FullCollect 参数不变。A 另行核对了完整来源、703 根／5,530 事件的 owner 基线登记及 Node／parser／CLI 准备。没有把支持脚本的 mock 接收记为真实 Docker 或 PromQL 执行。

这次是源码复审，不调度执行。操作者在具备原远测执行权限且来源仍准确匹配时，`ReviewedSourcePath` 必须使用上述 A r3 文件；旧 A r1／r2 或任一 candidate／request 都不能替代。Root 已停在剩余输入缺口，D-GC 未启动 operator／Go／SSH；实际 SQL 为零、PromQL 为零、production approval 为 false，真实域 authority、collector／自动起点／生产 freeze 不因此被接收。任何后续源或 harness 漂移都需要新的排他版本和 A 准确复核。

## 历史：4003 来源与 D r2 准备过程

准确 `4003...` / `44a3...` 来源现已获得 [A 正式 operator 源码复审](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r1.json)，SHA `554a500d7ae5cf71a2bb2f073315536bfe909e2840d0509ebeab991ab4547600`。D-GC 已读回并重放 `node docs/evidence/a-gc-lifecycle-operator-source-review-20261027.mjs --check`，退出 0；回执 kind 为 `d_gc_full_lifecycle_source_review.v1`，reviewer 为 A，status 为 `accepted_exact_lifecycle_candidate_inputs`，五个 capture 字段逐项匹配下表 r2 候选，capsule SHA 为 `d9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0`。此处 A 回执的 r1 是其独立版本号，对应的是 D 候选 r2。

这份接收不调度运行、不接收实际 SQL。收到复审通知时 Root controller r2 / exec29342 独占 Go，D-GC 未启动 operator、Go 或 SSH。metrics 八文件如随后进入 live，必须重新生成候选和新的准确 A review；旧 `4003...` review 不能复用。以下“待审”字段是排他保存的候选生成时状态，不回写已被 A 固定 hash 的 candidate／request。

当前版本 `20261027-r2`，状态 `source_only_native_and_global_review_pending`。本轮只修正独立 operator 的一处参数、盘点源码和固定哈希，并用 A 的无执行 AST 前缀检查核对选择器；未运行 Go、native 测试、SSH、kubectl 或 SQL，未修改 live backend／contracts／中央 scripts，也未修改 Root 正在执行的冻结副本。旧 20261026 r3、20261027 r1 和选择器拒绝证据均原样保留。

A 静态发现 r1 的 operator 同时传入互斥的 `-ConfigProofOnly -ConfigWriterOnly`，准确的参数 guard 会拒绝启动。现仅移除冗余 `-ConfigProofOnly`，保留 Writer 与 FullCollect；加回该参数能精确恢复旧 operator 字节。operator SHA 从 `455cc824...` / 3,054 变为 `cd6451a1ddeeb6eb74a99b730107bccd495cf3298daf8c6774ab83a981b4b9d4` / 3,037。A 的 [before 前缀拒绝记录](evidence/a-gc-lifecycle-selector-before-20261027.json) 保留，[r2 after 记录](evidence/a-gc-lifecycle-selector-after-20261027-r2.json) SHA 为 `fb72fa73ef397565b2307144763b3158c414d5bb326f7905638122bfc7a9a114`，确认前缀接受且 operator／Go／SSH／SQL／capture 均未启动。该检查没有执行完整 operator。

| 材料 | SHA-256 |
| --- | --- |
| [当前候选 inventory](evidence/d-gc-full-lifecycle-source-candidate-20261027-r2.json) | `955b7d7fc9b61280693ce50fee6fb3bcaea1032a525617c1d32c24507f6083c8` |
| [完整待审请求](evidence/d-gc-full-lifecycle-review-request-20261027-r2.json) | `6a49320833855a54f36ff20ed336ac81b42bff03172454a653a00c750ea2b267` |
| [渲染后的 harness 供复核](evidence/d-gc-full-lifecycle-rendered-harness-20261027-r2.ps1) | `d94305ae3e06fbb2903717bbd6db5e663c28032bccb097e45302b00e8fa45f3b` |

原始 inventory 为 1,718 份输入，摘要 `4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964`。operator inventory 为 1,719 份输入，摘要 `44a3bca859a3da2b199bc8348234ad68c8be912f04924dc29b90b5deb7037e1d`；差异是准确的七处 runner selector／scope 替换及注入独立 lifecycle phase。渲染文件只供源码复核，本轮没有执行它。

D1 已就 r1 出具 [活动来源匹配复核](evidence/d1-gc-lifecycle-current-source-reviewed-20261027-r1.json)，SHA `72e08f0fa565a7b015f2bdeb5c25b147d8cad49b4e69caa72fc08bf84c501b20`。D-GC 读回核对了其中六份引用材料的 hash，并直接比较候选的 1,718 份 original tuple 与 Root `01cb9a3a3e1d48d7b56da8ffa138bc9b.source.json`，每份 path／size／hash 完全一致。r2 的 original／operator source 摘要和 rendered runner 字节不变，但 `origin_harness_pins` 中的 operator 已变，因此不能复用 r1 的 harness 审批。这项来源匹配本身不接收 native、Root 十五阶段、正式 A operator source review 或执行批准。

后续 Root `2d061b75213d45d1af1b29acfda4ee95` 的十五阶段已实际终态，D1 出具 [准确 native 补验证据复核](evidence/d1-current-fifteen-stage-reviewed-20261027-2d061.json)，状态 `accepted_exact_native_fifteen_stage_supplement_only`，SHA `0a1866235611a7563349a7e7130e0ae2f7673f475e8c0f3c57b4a87714de085b`。D-GC 已读回并运行其同名 `review` 脚本 `--check`，退出 0：原始 1,718 / `4003...` 与普通八阶段同源，三根 GC seed 全部通过，当前 Linux tagged evidence 编译退出 0，记录 SHA `f2649a0f5b560e72bdc0703e40d101ecaa4461d176bd04c20d155619c0bd6e25` 后产物已清理，源码后检通过且准确 owner 缺席。

十五阶段包括十三个成功阶段和两个必须触发断言失败的独立反例；后者不是构建失败，不把它们改记为普通通过。GC seed 阶段保留默认 vet，Linux evidence 的单独仅编译阶段明确使用 `-vet=off`；没有运行该 Linux binary，也没有执行实际 SQL。该准确本地补验不能签成整个当前基线、生产域或 operator 正式批准；私有 metrics 等剩余当前门禁仍由 Root 闭合，r2 仍保持待审。

当前 life 为 `c0571470...` / 32,957 字节，已含两个 helper 的纯重命名。当前 live parser 为 `bf76dcb6...` / 7,736 字节，parity 测试为 `6c7e3e9a...` / 3,372 字节；均与独立 promotion 读回匹配。待审请求列出相对旧 r3 的全部 19 处原始 inventory 差异，包含普通 API／TLS／materials／parser 和脚本变化，不把全树称为只有 tagged 变化。

独立准备与只读重放入口为：

```powershell
node docs/evidence/d-gc-full-lifecycle-source-preparation-20261027.mjs --check-version r2
```

该命令已退出 0，只重算当前源码和材料字节，不运行测试。若源或 harness 再变化，应以 `--write-version r3` 等新版本排他生成新包；禁止覆写旧版本，也禁止把旧批准回执视为自动适用于新源。

实际 operator 仍为 `docs/evidence/d-gc-full-lifecycle-operator-20261026.ps1`，其运行依赖、phase、receiver、capsule 和准备工具的当前 pin 已固定。候选保留 capture 兼容的五个准确字段及原 `origin_harness_pins`；新增审阅材料另列，不改变现有执行接口。它要求未来由 A 实际创建的 `d_gc_full_lifecycle_source_review.v1`，本待审包并非该批准回执。

A2 b53 的准确 parser 组合接收、promotion、A 的 tagged 组件 r2、准确 native 补验及上述 A 正式源码复审均保留各自作用。执行仍受当前单一窗口协调约束，且任何源或 harness 漂移都须另出新版本和新 A review。正式复审仅接收准确 `4003...` 来源，不宣称当前整个项目或实际 15 项 SQL／生产 GC 已验收；candidate／request 仍不能充当 `ReviewedSourcePath`，该参数必须是与届时准确来源匹配的正式 A 文件。
