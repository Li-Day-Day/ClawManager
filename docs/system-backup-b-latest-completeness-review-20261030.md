# B：最新统一分支完整性核对（2026-10-30）

本地 `codex/users-instances-backup` 从 `baa175cac31adfd86c0ac9daf575e533bbb6d0f0` 快进到 `origin/codex/unified-backup-baseline@d94e22102f0dc6279522c6a7487156370bd90f4a`，新增 102 个提交。结束前已核对远端仍为该 SHA；`origin/backup` 仍为 `4fe83bcd`，没有改用旧 backup 基线。保留本地未提交 B 代码、测试及历史日志，没有创建提交、stash、暂存内容或推送。

## 结论

**未补齐全部内容，且不只是环境验收问题。** Native Runtime 控制、relay、私有 staging seal、KEK/签名基础组件有实质新交付，但正式 capture writer、KEK 独立来源/完整扫描、三用途业务授权 caller、正式成品发布与独立还原仍有生产代码缺口。

最新 C50 来源交接本身也明确 A～D 部分完成，E 未完整开展。D 的采纳范围与 C 分支来源状态不同，不能直接将 C 文档中每个“已完成”当作 D 已接收或现场通过。应优先读 D 的 `system-backup-d-c50-integration-20261030.md` 及 A 的同日复审。

## 原缺口与最新实际状态

| 项目 | 已新增/接通 | 仍缺或尚未验证 |
| --- | --- | --- |
| Native Agent writer | `services/runtime_agent_backup.go` 与 `RuntimeControl.GatewayControl`，v2 locator、task/attempt 原停止/恢复回执持久化、ClaimRestart 正向证明、恢复 PID/generation CAS/complete 已接原生产 caller。 | 共享 Runtime 仍为旧单容器拓扑，新 endpoint 404；独立 native Pod 的正向停止/恢复已取证，但不是 controller/真实用户/SQL 证明表整链。pool/slot 管理路径、原创建收据、真实 NFS 归属等尚需完成。Agent 自重启自动接管仍不支持。 |
| Worker relay | 原 mTLS/Pod 工作身份下 ready/running；随后闭集内部结果的 inline 登记、稳定 UUID、completed/3 同一结果字节与 SQL 绑定已接。 | completed 仅是 functional 内部诊断完成观察，不是正式 artifact/KEK/签名发布。实际镜像、SQL 授权、撤销/重试和 reader 可见范围待现场验证。不能沿用早期“完全没有 completed sender”的说法。 |
| 私有 staging 封存 | controller sibling `.controller-seals` 的独立复制/AEAD/长度/SHA/帧检查、create-only 版本、重启读回、容量/孤儿维护及锁已实现。 | 不是 C 最终对象版本/envelope/capture certificate。跨节点探针已有失败回执，最新固定时长锁重叠问题已改握手，但没有该修订的现场通过证据；不能拼接多轮通过结果。 |
| B 正式 capture | 已有模块/结果校验与 A `NewCaptureKeyJob` 接口。 | 非测试源码未找到 `NewCaptureKeyJob` 生产调用、ProviderKey 实际赋值或正式流式 writer/cmd；C 冻结 context、最终 framing/envelope/checkpoint/capture_certificate 的业务出口未闭合。 |
| B WorkBuddy/配置诊断 | 本地 `WithWorkBuddyIdentities`、`DiagnoseUsersInstancesConfig` 和用户/实例具体模块注册均保留。 | 非测试源码只有定义，D 尚未消费这些 helper 并提供原认证 SQL 快照与完整模板；本地旧 runtime profile 测试 fixture 仍是旧 gateway spec，需适配新 GatewayControl/locator v2/native request binding 及 VerifySource 源认证。本轮未修改功能或假造适配通过。 |
| KEK 正式准入 | C candidate parser、D registry Store/migration127/事务接点、A admission/adapter 等基础代码到齐。 | `Bound.CompleteScan` 当前仍直接返回 ErrKEKCoverage；原独立 mapping reader、四分区扫描/adoption/writer hooks，以及 bootstrap/config mutation 的生产 composition 注入未闭合。这是代码缺口，不只是用户材料。 |
| 三用途签名 | `NewOriginalSigningResolver`、JWT 短期 token source、独立 binding 与历史公钥基础组件已实现。 | capture/acceptance/catalog 的 OriginalSigningAuthority 业务 reader 及生产 caller 尚无实现；正式三用途 role/policy/permit/读回也未齐，不能只给 resolver 接口宣称已能签发。 |
| C50 / 恢复 | 普通 TeamData best-effort 链与 retry、共享 gate、独立 Recovery.CheckTx 库存及释放证明已有更新。 | TeamData 独立任务不等于公共 v2 全域成品。五张新增执行控制表仍 pending_owner_review，35→40 排除闭包与 verifier 扩展未签收；正式目标恢复与历史 key/provider/signature 接线未完成。 |
| 旧库/部署 | 现场只读 inventory、隔离 MySQL 副本数据流往返与身份复查已有证据。 | 旧→新语义映射、080→目标 catalog 隔离升级/重跑/部分失败恢复、apply/回退步骤仍未交付。副本数据流相等不是停写完整备份，亦不授权升级原库。正式 App/Worker/Runtime 同版本镜像、最小权限、实际 NFS 子树和 UI 出口仍待完成。 |

## 对 B 下一步的影响

1. **不能重复开发已到齐的 GatewayControl 和 relay。** 以 D 最新实际 callback 和 worker control 为入口；先将本地旧 gateway fixture 与新 ABI 对齐。现有低层 factory 的源码保留新字段，但旧测试数据并未自动变成 native 协议测试。
2. **B 重点仍是正式 capture writer。** 与 C 固定真实冻结 context/AAD/framing/完成事实，用 A 原 CaptureKeyJob、原 Job 身份及 permit 接生产 worker 命令，不以 functional DEK/旧 framing 代替。capture 专用 signer 的业务事实由 B/D 提供。
3. **D 接收本地模块与身份/诊断 helper。** 指定原认证 SQL 捕获点/持有位置、完整 mount/writer 清单和实际生产 caller；纯 helper 不认证快照来源。
4. **A/C/D 补 KEK 与签名原来源。** 原 mapping reader、四分区 CompleteScan、生产 bootstrap/config composition、历史恢复与三用途业务授权不能靠候选 JSON、自洽 hash 或 synthetic fixture 补齐。
5. **再做明确范围的同版本隔离验收。** 先解决真实 topology/NFS/旧库/权限与镜像依赖，覆盖原 task/attempt/Job、独立 SQL observer、停写、恢复、relay、成品与目标还原；不以独立 Agent 或普通 TeamData 子链替代全链。

## 本轮准确验证与保护

- 原 catalog `--check` 和 Python catalog 3 项通过；迁移目录当前 168 文件（具体摘要以生成物为准）。`git diff --check` 通过。
- Go 在 GOPROXY/GOSUMDB=off、-mod=readonly 下尝试 B/domain/execution 定向测试，仍因缺失 `github.com/cyberphone/json-canonicalization@v0.0.0-20261011152517-32a48195b9b2` setup 失败，实际执行用例为 0。没有下载、替换依赖或 stub。不能继承 10 月 29 日旧基线的通过结论，也不能把其他 owner 的本地结果记成本机验证。
- 实际原始输出和源码 pin 位于 [本轮证据](evidence/b-upstream-review-20261030/README.md)。本轮没有连接服务器、Kubernetes、真实 SQL/provider 或执行迁移；现场事实仅引用已提交记录。
- 整合前保存本地恢复副本于 `.codex-temp/b-upstream-refresh-20261030-150950`。本次唯一源码重叠为 deployment_platform.go，三方合并无文本冲突；EOL-only catalog 脚本交由 Git 按原属性处理。其他未提交改动和 untracked 文件均保留，没有删除旧空目录或其他 owner 产物。

## 优先核对来源

- `docs/system-backup-d-c50-integration-20261030.md`
- `docs/system-backup-a-integration-review-20261030.md`
- `docs/system-backup-a-result-evidence-review-20261030.md`（以后续接收/容量复审为准，早期缺口描述保留作历史）
- `docs/system-backup-d-native-gateway-handoff-20261029.md`、`system-backup-d-native-cutover-20261030.md`
- `docs/system-backup-a-kek-admission-handoff-20261029.md`、`system-backup-a-signing-credentials-handoff-20261029.md`
- `docs/system-backup-a-c50-control-exclusion-review-20261030.md`
