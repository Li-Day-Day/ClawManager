# A：补测前的准确目标与独立接收接口

2026-10-27 GC 精确组件 r2 已限定复核，见 `a-gc-tagged-component-reviewed-20261027-r2.json`：仅把新增 lifecycle 中两个与旧 owner 测试重名的私有 helper 改名；14 处逆变换准确重现旧 cac6c2bc…/32901，旧 owner 文件及 cold 文件不变。新 lifecycle 为 c0571470…/32957，仍待当前 tagged seed/Linux 原生补证。旧 r1/原失败记录保留。新候选捕获可以显式选择这份组件回执：

```powershell
node docs/evidence/a-owner-pre-thin-target-20261026.mjs --capture docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.json docs/evidence/a-owner-pre-thin-target-NEW-REV.json docs/evidence/a-gc-tagged-component-reviewed-20261027-r2.json
```

未给第四参数时仍使用旧 r1，当前 lifecycle 已变则必须拒绝；不会自动挑“最新”文件。每个候选绑定显式组件的准确 pin；未知组件不能靠文件名或形状自行启动补测，仍受独立 scope 整文件登记约束。

2026-10-27 接口 r2 明确支持范围的例外，避免把未执行脚本的 pin 误当 Go 测试要求：`support_input_delta` 可以 `native_receipts=[]`、`dependency_closure_review=null`，但必须有登记锚定的独立 `a_owner_pre_thin_support_scope_proof.v1`。它只承接经过逐项 before/after 复核的目标选择差异、未被执行的支持文件，或已做实际接收器检查且待十五阶段执行的控制脚本；禁止覆盖 ordinary Go、go.mod/go.sum 或任何 contracts 变化。该 review 固定完整 native_execution_inputs、executed_input_inventory_complete=true、not_functional_acceptance=true、review_validator、receiver_test_logs；状态只允许 byte_bound_outside_native_execution_scope 或 source_control_prepared_for_pending_native_execution。前者所有差分都必须不在已审执行输入中；后者新增控制文件必须在执行输入中并有真实 receiver test log。它不声称未来 Go 已执行，不消除十五阶段，不认证未纳入的部署路径，且仍须 A 的准确 scope SHA 登记。其他原生 proof 仍要求四项真实 go-list 闭包及完整准确来源证据。

2026-10-27 可接入的严格 scope CLI 已交付：

```powershell
node docs/evidence/a-owner-pre-thin-scope-review-20261027.mjs --check --target docs/evidence/a-owner-pre-thin-target-REV.json --scope docs/evidence/a-owner-pre-thin-scope-reviewed-REV.json --source-root '本工作区或本工作区内的准确冻结source目录'
```

只有成功退出 0 才输出 `a_owner_pre_thin_scope_check.v1` / `ready_for_fifteen_stage_local_supplement_only`，并返回 target_manifest、scope_review 两份完整 pin、target_sha256、native_start_authorized=true、current_baseline_ready=false、actual_sql_authorized=false。异常退出不构成许可，不得只取最后一行或忽略退出码。源码中的 `approvedScopePins` 初始为空；只有 A 独立复核真实 native、准确来源稳定性及闭包后才追加具体 scope artifact 的 path/size/SHA。形状、未知 checker、自填 passed 字段都不能注册自身。登记不依赖未来十五阶段结果；登记后 Root 应刷新并固定 checker 自身 pin，结束时后检。

该 CLI 实际核对完整 source-root 枚举、目标摘要、父/选择器/组件字节、每项差分的唯一 before/after→proof、无悬空或未使用 proof、父完整范围证明、GC 不能覆盖 ordinary、全部原生/独立回执及日志 pin、四个真实 Windows/Linux 普通/tagged go-list closure 的命令/退出/输出 pin 与全部声明依赖字节。scope 的已登记准确 hash 是 A 的独立证据复核锚点；CLI 不执行未知 verifier，不根据任意 JSON 的 green 字段获取权限。`validateScopeStructure` 仅供合成负例测试，不能作为 driver 的启动入口。

非 GC leaf 的独立 review 使用 `a_owner_pre_thin_native_scope_proof.v1` / `accepted_exact_scope_for_local_supplement`，含 profile、source_role(parent/target)、native_source_stability_verified、cleanup_verified、actual_sql=false、production_authorized=false、native_receipts、native_logs、review_validator；删除/排除目标项另列 explicit_removed_target_paths。父完整范围 leaf 还须 complete_parent_packages 与 complete_parent_obligations_verified。依赖闭包 review 使用 `a_owner_pre_thin_dependency_closure_review.v1` / `complete_exact_native_dependency_scope`，含 profile、source_role、排序 source_files、source_sha256、四项 variants，每项为 goos、tags（空串或 systembackup_mysql）、command、root_packages、exit_code、log pin。事实必须由真实 raw native/closure 复核生成；这些字段不是新的业务授权。

目标清单在补测前固定，补测结果在补测后接收，两者分开交付。Root 可以现在实现新 runner 的输入、冻结和拒绝逻辑；不需要等待自己的十五阶段结果来确定输入。本文不放行 Go、实际 SQL、远端或当前基线。

## 两个不可互换的输入

1. `a_owner_pre_thin_target.v1`：候选目标。准确列出所有目标文件、相对原 entry 的新增/删除/变更；状态始终 `pending_native_scope_review`，不能启动测试。A1 的 `a-owner-pre-thin-target-20261026.mjs` 可 CreateNew 捕获并只读检查目标字节。
2. `a_owner_pre_thin_scope_review.v1`：后续由 A 独立复核生成的放行输入。绑定第一份清单的完整 path/size/SHA、target SHA、每项差分的准确 before/after 和 proof IDs。只有全部父范围及普通差分的证据闭合，才生成 `ready_for_fifteen_stage_local_supplement_only`。当前尚无这份接收；不能由 runner 自己填布尔值代替。

机器接口见 `docs/evidence/a-owner-pre-thin-target-20261026.schema.json`。Schema 只规定形状；校验通过不等于独立接收。当前 byte checker 只接候选清单，输出固定 `native_start_authorized=false`，不实现或伪造尚未完成的原生证据接收。

## 目标字节与差分

文件选择严格沿原 `d-local-closeout-snapshot-20261023.mjs` 的 `d_local_closeout_snapshot.v1`：backend/contracts/scripts 的原扩展名/排除目录、顶层 docs SQL 和五个原 docs 夹具。枚举先拒绝重定向；按相对路径 ASCII 排序，拒绝重复、大小写冲突和路径穿越。每项固定 `{path,size,sha256}`；摘要是 UTF-8 的 `path + NUL + sha256 + NUL + size`，逐行连接并保留末尾换行，随后 SHA256。Root 原 snapshot 文件选择/摘要必须相同；选择器字节本身也固定。

差分是父文件表和目标文件表的完整并集，必须含删除；不能只检查 Go 文件、只检查当前存在的项或复用“旧七个 API 文件”名单。目录中新增文件也算漂移。两份 GC 文件只是准确组件分类，其余 backend/contracts 差分一律需要普通/合同范围证明；任意新 MySQL tagged 文件不自动获得 GC 白名单。scripts/SQL/夹具差分也逐项给出用途/验证证明。

`after=null` 表示该项不在补测目标文件集合中；不必然表示 live 文件被删除。例如父 entry 枚举过 Makefile、Dockerfile、CSV 等，而原 thin 选择器没有选择这些扩展名。必须明确复核这种选择差异及适用范围，不能把它说成对原文件的代码删除，也不能据此验收未纳入的部署/构建路径。目标外的 frontend/native smoke 等变化不能被这份 Go 补测清单认证。

候选 capture 会再次枚举目标文件表并核对父回执/选择器/GC 回执未变，CreateNew 写入，不覆盖历史。若 live 仍在改，捕获可以拒绝；稍后新建一个 revision，不能修改已固定清单。Root 应从清单复制到自有 owner，复制前、复制后、Go 前分别核对全表和摘要；后续执行只读冻结来源，结束后后检并清理自己的产物。清单不要求 live 在整个测试期间不变化；live 变化不能被计入冻结结果或当前 baseline。

## 每项 proof 的实际含义

`proofs[]` 固定原生回执、独立接收回执、实际接收器的文件 pin，以及普通范围的依赖闭包复核 pin。proof ID 不从文件名、构造成功或任意 passed 字段推导。接收器必须读取原生日志、命令/平台、准确 run/pass/skip/fail/包与根清单、冻结来源、后检和准确 owner 清理。失败轮的部分成功不能改成整轮通过；如允许组合，独立 review 必须列出保留的失败、可复用的阶段及同源补证逐项替换关系。

普通/合同 proof 的 closure review 必须包含实际 Windows/Linux、普通/systembackup_mysql 四种 `go list -deps -test` 的命令、退出码、原始输出 pin；固定 root packages、普通/测试/外部测试依赖和实际选中的本地文件（含 go:embed、go.mod/go.sum、原合同/夹具）。比较的是目标中该验证闭包的全部字节，不是只看被改的文件；不要求无关脚本/包在不同验证轮里整树相同。凡闭包内任一依赖在 proof 冻结来源与目标不同，该 proof 不能覆盖它，必须再验证或另有经复核的准确阶段组合。静态 rg/import 枚举不能替代此闭包。

API A 的 native 只覆盖其 security/materials 范围；API D 的传输旧轮不能覆盖后加 SQLApplication 事务。A2 的修复还需原四项反例、固定后 Schema 八项、普通包与真实 caller 范围、同平台 Linux 证据。contract/fixture 删除须由新范围中的读取/枚举及负例证明，不能用删除前 native 文件表充数。独立材料原 authority、M1–M10 typed 决定和生产 slot 验收仍另有原合同，不被此本地补测接口批准。

## 父范围及 GC 的边界

2026-10-26 当前实际终态：ae7af 的 targeted/full/seeds 退出均为 0，但整轮 `failed`，Linux server 失败，未完成全部 Linux/最终后检；A API 148b 的 targeted/full 退出 0，但 Linux security 失败。D391 旧 transport/composition passed，D643 后加 task 轮 failed/steps 空。保留这些原记录，均不能单独充作完整范围证明。

父 proof 需完整 entry 接收，或独立复核的准确阶段组合。若失败轮缺最终冻结来源后检且 owner 已删除，不能用现在的 live 字节补称当时完成后检；必须有真实可验证的同轮稳定性证据或重新跑适用范围。Linux 同源补证不自动修复缺失的源后检。Root 不应继续沿旧 `passed_exact_entry_snapshot` 单字段检查假设本轮已经完成。

GC 组件准确引用 `a-gc-tagged-component-reviewed-20261026-r1.json`：cold e9806c48…/23173，lifecycle cac6c2bc…/32901。它只证明两文件源码组件复核，不证明 Go 或实际 SQL。`gc_two_tagged_components_only` 可以没有 native_receipts/closure（null），但不能覆盖任何普通差分；仍必须排入以下十五阶段的前两项。

## Root 新 runner 的消费顺序

1. 读取两个 artifact，核对彼此 pin、目标摘要、完整差分、所有 proof 的真实接收及 closure；`parent_scope_proof_ids` 必须实际关闭父范围，coverage 恰好逐项覆盖全部差分，禁止遗漏、多余路径、重复或未解析 ID。候选单独存在一律拒绝 Go。
2. 固定接口 schema、byte checker、runner、接收器及 inventory helper 的当前字节；从准确目标创建 Root 自有快照，Go 前重验，不能读取 live 源码代替被冻结的文件。
3. stage 0：当前三 GC seed 根 `TestDDownloadGCFullProfileMySQLSeed` / `TestDDownloadGCFullCollectMySQLSeed` / `TestDDownloadGCFullLifecycleMySQLSeed`，准确 run/pass 无 skip/fail。stage 1：当前 tagged evidence Linux test compile，保存退出与二进制摘要。二者均不是实际 SQL。
4. stage 2–14：保留原十三阶段及精确 inventory/两个预期失败反例，不删除、替换或合并以凑数。资源、HTTP、Admin、owner、detached、standalone、Windows/Linux 和两个不安全提交反例的原语义不变。
5. 记录冻结来源最终后检、全部脚本后检、二进制 hash 和准确 owner 清理。父 Linux server/migration 等仅在实际闭包与目标相等、该项证据完整受审时复用；否则另补，不默默沿用。

十五阶段完成后的独立接收另行产生，不回写 pre-thin 候选、proof 或旧 r1。只有之后的来源登记/原接收器回归及当前预检成功，才能交付 owner 十一项远测入口。此接口不批准全树、B/C 服务、生产启用、真实材料或完整恢复链。
