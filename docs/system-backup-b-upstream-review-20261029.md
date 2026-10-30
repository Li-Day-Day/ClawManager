# B 核对最新统一集成分支：baa175ca

已 fetch origin，将本地 `codex/users-instances-backup` 从 `af7c3ad599195eb1a577c3e0389c55a9643d375b` 快进到 `origin/codex/unified-backup-baseline@74ee6146959456a084fd8ed681b485152c8e05a0`（第一轮新增 19 提交），结束复查又接收 `baa175cac31adfd86c0ac9daf575e533bbb6d0f0`，本地最终 HEAD 为该提交（合计 20 提交）。最后一项仅修改 KMS 精确版本校验、对应测试及 A 记录，不与本地 B 增量重叠。本次 fetch 的 `origin/backup` 仍为 `4fe83bcd`；按用户此前指定的统一分支继续核对。没有创建提交、stash、暂存内容或推送。

## 本地改动保护与整合

本地未提交 B 源码/测试/文档保留。整合前保存 tracked 工作文件的原始字节、三方输入和解析结果于 `.codex-temp/b-upstream-refresh-20261029-151126`，作为恢复副本保留，不是新控制状态或生产备份。

六处重叠来自 migration catalog、生成 registry 和原控制表分类。远端现已包含本地此前补的 runtime_controls/relay_receipts，同时新增 migration 125；保留最新上游生成物和审批策略，不回退旧 124 摘要。目录脚本仅有注释/同一表顺序差异，使用上游版本。其他 tracked 改动三方重放，无 untracked 路径覆盖。Windows autocrlf 导致前两次快进被 Git 拒绝，均恢复本地原字节；最终由 Git checkout-index 应用原属性后快进成功，原本地增量再恢复。没有以 force/reset 丢弃本地代码。

此前各轮证据仍属于它们各自固定 SHA。本记录不把旧版的 B 测试通过当成新基线通过。

## 哪些原缺口已有新交付

| 项目 | 最新实际交付 | 仍未关闭的部分 |
| --- | --- | --- |
| D Runtime 生产 caller | `NewDeploymentService → attachRuntimeSources` 已实际构造 SQLRuntimeControl、原配置留存、participants/deployment probes、独立 locator、平台和 Runtime writers。 | 当前仍是 runtime-workspace/functional_test 路径；原 generation 收据、完整覆盖、真实存储与现场输入缺失不能放行。D 的生产组合已有自己的分组，B 的可选 ComposeRuntimeWriters 不应再叠加一次。 |
| D relay | 生产 controlHandler 注册 `/relay`，原 WorkloadIdentity/Job process/证书 pin 与 SQL 接收器接入；独立 receipt 游标。 | worker 尚未自动发送 B relay；需在原 worker 身份登记后接 sender，不能把消息落库当成成品或任务成功。 |
| 实例 nullable location | `RuntimeLocator` 将原 SQL Source 与 runtime binding/实际 Pod 定位分离，保留原 Source/hash 并复查。 | Agent 真实停止回执和现场重启/恢复仍未闭合；不能用 locator 替代停止证明。 |
| Agent B2 协议 | 已交完整 Agent 源码补丁，固定 AgentsRuntime 基线与本地交付 SHA；新 capabilities/stop/resume/state/complete、持久 intent/隔离账本/回执及模型测试。 | 补丁未推 Agent 上游、未部署现场；ClawManager 尚未消费新 native DTO/路由及 D task/attempt/回执 SQL。Agent 自重启自动接管明确未实现，agent_restart_reconciliation=false。旧实验 profile 的 capabilities 调用不是新正式协议接线。 |
| A 在线 key-use | `systembackupkms` 在线 Generate/Unwrap、`worker.NewCaptureKeyJob`、原 Job reserve/begin/end、migration 125、SQL/worker 接点、JWT trust 和 key 属性读回已有交付。 | B 的 C 冻结 capture context 真实来源、最终 writer/cmd 及新 framing 接线仍未交付；不能用 functional Lease.DEK 或旧 staging 格式代替。policy/role/permit 和真实并发验收也未完成。 |
| 公共 C 加密合同 | public-c-crypto.v1 的 envelope/AAD/三用途签名、闭集 schema 和向量已有；KEK mapping/retained 输入提案已列出精确字段。 | KEK 原注册→准入→kms.Config 的生产转换/validator、retained 完整扫描、三用途 ResolveSigning、正式 finalizer/catalog 接线仍有代码缺口，不能只要求操作者补材料。 |
| B 身份/诊断 helper | 本地 `WithWorkBuddyIdentities`、`DiagnoseUsersInstancesConfig` 和具体模块注册保留。 | D 新 caller 尚未消费这些 helper，也未提供原认证 SQL 快照/共同捕获点的实际构造；当前只有 B 可调用组件与例子。 |

## 更新后的接收责任

- **B 可推进**：按已到齐 C 字节合同与 A CaptureKeyJob 接点实现正式流式 writer/worker 命令消费，产出 C 需要的 envelope/chunk 事实；冻结 capture context 的业务字段需先与 C/D 签收，不能用任意 hash 或旧 CMBKENC1 代替。接 worker relay sender 时复用已登记的原工作身份，不另签身份。当前任务只拉取和核对，未实施这些新增功能。
- **D → B**：新 native Agent DTO/请求、原 task/attempt/operation 与回执原字节的持久绑定；更新 Guard/ClaimRestart/CompleteRestart、原 PID CAS、恢复/complete 顺序及实际 caller。Agent 补丁不能直接让旧 DELETE/404 writer 成为安全停止能力。
- **D/B**：指定原认证 SQL 捕获快照及完整 mount/writer 的持有位置，把本地用户/实例与 WorkBuddy helper 接到生产构造。nullable SQL 字段保持原样，不靠回填修复。
- **A/C/D**：完成 KEK mapping 准入与历史引用扫描的原来源、fence/最终复查；A 的真实 policy/permit/用途授权及 C 三用途 signing resolver/成品出口。代码缺口、部署材料、现场验证分别关闭。
- **操作者/Runtime owner**：先审查并交付匹配的新 Agent 镜像/源码版本，再在获准隔离环境中验证；现有已保存能力探测为 404/backup_ready=false。现场是共享直接 NFS，不能拿不同 hostPath PVC 冒充来源；namespace/安装子树所有权与外部 writer 差集仍需落实。

详见 D [协议交接](system-backup-d-agent-protocol-20261029.md)、[生产装配](system-backup-d-runtime-deployment-20261029.md)、A [在线 KEK](system-backup-a-online-kek-20261029.md)、公共 C [来源核对](system-backup-c-crypto-sources-20261029.md)。本轮未重新访问现场，现场事实仅引用这些已提交证据。

## 本轮验证与最终基线边界

记录目录 [b-upstream-refresh-20261029](evidence/b-upstream-refresh-20261029/README.md)。命令执行时 HEAD 为 74ee6146；最终 baa175ca 的 KMS 校验增量已读源码，未在本机编译/执行，不能引用上游 owner 的测试作为本机通过结果。

- 原 catalog `--check` 通过，Python catalog 3 项测试通过；公共 C 的离线 Node crypto 向量测试通过。
- Go 首次测试 adapter/domain/execution，随后单独 adapter/domain，均在依赖解析阶段被 `github.com/cyberphone/json-canonicalization@v0.0.0-20261011152517-32a48195b9b2` 缺失阻断；没有执行测试用例或完成编译。新 worker 引入 KMS 后，该依赖也传播到 B 包，不能沿用此前两包通过结论。
- `GOPROXY=off`、`GOSUMDB=off`、`-mod=readonly`，没有下载/安装依赖、替换版本或 stub。需要现成准确缓存或已有获准构建环境补做新基线编译/回归。
- 最终 baa175ca 补充拒绝 KEK registry 的 latest/current/default 等别名，并保持 provider numeric version 独立固定；这不补齐正式 KEK 准入来源或 B 最终 writer。
- 没有真实数据库/K8s/Agent/provider 调用、迁移或恢复。尚不能宣布整链补全或验证通过。
