# `clawmanager-zhanghui08-system` app/Secret RBAC 安全收敛

## 当前状态（2026-09-23）

- 【已完成】D 侧预切换实现、业务 smoke 和脱敏证据登记。已登记 evidence SHA-256 `419852166e49be4f6aa4f66bf26b8b9980cb5cff77e5f4cb98722a213eb4b991` 是本轮 A 退回前的历史现场快照，不是 cutover 授权。
- 【已完成】A 侧安全签收。2026-09-23，A 已复核原三项 P0 修正、五套 `wait-secret-broker` standalone `+` 修复、manifest/源码/脚本指纹和现场 app-init 终态；v3 evidence SHA-256 `fd8588ed96a93c30c7ac1ac96d9d9f77d78fb2c9388d9f344d986ca355d136c5` 与仓库文件及现场输出一致。
- 【已完成正式 RBAC cutover】2026-09-23，操作者显式批准后，SHA-256 为 `1be4f57b562439eddd310db46d05cdd34be976392635b22c16b0a92147a0bb4d` 的 reviewed 脚本绑定 v3 evidence `fd8588ed96a93c30c7ac1ac96d9d9f77d78fb2c9388d9f344d986ca355d136c5` 执行成功，`script_status=0`。删除前后 app、OpenClaw/Hermes runtime、计划 sync、collector 和 broker gate 均通过；两个 app Pod 继续运行 fix14 digest、Ready 且零重启。
- 【已完成终态权限复核】目标 `clawmanager-zhanghui08-app-cluster-admin` 查询返回 `NotFound`；受保护的 `clawmanager-app-cluster-admin` 仍精确绑定 `clawmanager-system/clawmanager-app` 到 `cluster-admin`。本安装 app SA 的 `list secrets` 返回 `no`，`get deployments.apps` 返回 `yes`。脱敏终态记录见 [`docs/evidence/secret-broker-rbac-cutover-zhanghui08-20260923.txt`](evidence/secret-broker-rbac-cutover-zhanghui08-20260923.txt)，文件 SHA-256 为 `c4e6bcbc0cb1d8c836a05fa13c4e9849a5a9e82e8fb8843460b237c993349bc1`。该结果只关闭 P0-0b 的 app RBAC 去权工作项，不代表 P0-0b 整体通过。
- 【继续保护】`clawmanager-app-cluster-admin` 属另一 namespace 的受保护绑定，任何后续工作仍不得删除。本文后续历史命令中关于“等待 cutover”或“两条 binding 未变”的描述只记录当时状态，均由本节最新终态覆盖。

- 【已完成】五套官方安装清单已补齐经过代码调用点审计的 `clawmanager-runtime-manager`。权限覆盖 Lease、Deployment、Pod/exec、Service、Endpoint、ConfigMap、PVC/PV、Namespace、Node、NetworkPolicy 与 StorageClass；每类只保留代码实际使用的 verbs，不包含 Secret、RBAC、Job 或通配符。
- 【已完成声明式修正、A 签收及现场去权】五套正式安装清单均已移除兼容性 `clawmanager-app-cluster-admin` 声明并固定 migration=true，同时内置 HTTPS broker 的独立 SA/RBAC/Deployment/Service/NetworkPolicy；app 所需 CA ConfigMap 不再可选。安装 PKI 必须先提供 broker TLS Secret 和 CA，缺失时明确保持未就绪。现场目标 binding 已按 reviewed 流程删除，后续重新 `kubectl apply` 不会恢复该宽权限、关闭迁移或回退 HTTP。
- 【已完成安全门禁】远程脚本默认 `SECRET_BROKER_CUTOVER_APPROVED=false`。它会完成 runtime 权限 probe、现有 app/runtime/sync smoke 和 collector 正负测，但随后以 `BLOCKED`/退出码 3 停止，绝不删除 `clawmanager-zhanghui08-app-cluster-admin`。只有独立 broker Deployment/ServiceAccount 就绪、app 显式声明迁移完成，并提供64位 reviewed functional-smoke evidence hash 后，删除路径才可到达。
- 【已完成】新增独立 `clawmanager-system-backup-secret-capture` ServiceAccount 的 functional-test 清单；Role 仅允许 `get resourceNames=clawmanager-system-backup-functional-test-allowlisted`。测试 Secret 是空对象，不包含业务 secret data。
- 【已完成】functional-test allowlist registry version 为 `functional-test-2026-09-20`，SHA-256 为 `4966a40bc8e3b948d29ac79cb3514a2955ec47a4186aa2eee14b07cbec4242b5`。
- 【已完成首轮远程 smoke 与兼容修正】首轮 runtime 权限 probe、app rollout、OpenClaw/Hermes runtime rollout、计划 sync 均通过，app Pod 为 2/2 Ready、零重启；collector 正测因远端 `kubectl auth can-i` 不支持 `--resource-name` 而在删除门禁前退出。具名 Secret 检查随后改用兼容语法 `TYPE/NAME`，并严格区分 `yes`、`no` 与命令错误。
- 【已完成远程安全阶段复测】2026-09-21 在 `kubernetes-admin@kubernetes` 对 `clawmanager-zhanghui08-system` 重跑：隔离 runtime 权限矩阵及 Secret 拒绝通过；app 2/2 Ready、零重启，OpenClaw/Hermes rollout 与计划 sync 通过；collector 对登记 Secret 的 get 通过，对未登记 Secret 和 list/watch/create/update/patch/delete 的拒绝通过；registry version/hash 与仓库一致。脚本按设计输出 `BLOCKED`、退出码 3，未到达删除语句；现场复核目标 binding 仍精确指向 `cluster-admin|clawmanager-app|clawmanager-zhanghui08-system`，受保护 binding 的 baseline 仍精确指向 `clawmanager-system`，临时证据日志已清理。
- 【已完成 broker 代码迁移】新增独立 `clawreef-secret-broker` 二进制、audience 为 `clawmanager-secret-broker` 的 app 投影 token、TokenReview 精确 app SA 认证、独立 broker SA/RBAC/NetworkPolicy 以及 namespace/name/operation/label/key 的闭集策略。Codex/OpenClaw bootstrap、Team token/Redis、通用 Secret ref、北向证书和两条实例清理路径均已收口到统一 `SecretStore`；静态门禁禁止这些 app 代码重新直接调用 Kubernetes Secret API。
- 【已完成 post-cutover 清单修正】五套官方 app 清单保留 HTTPS broker URL/token/CA volume，并固定 `CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=true`；正式 broker 清单强制 TLS。只有合成 HTTP staging 脚本显式设置 `CLAWMANAGER_SECRET_BROKER_ALLOW_INSECURE_HTTP_FOR_TESTS=true`，TLS staging 会显式覆盖为 false。外部 Secret ref registry 当前为空，version/hash 保持不变；未登记引用继续失败关闭。
- 【已完成 broker 本地回归】`internal/services/k8s` 完整 Go 包测试通过，broker 命令入口编译通过，无依赖静态 RBAC 测试 6/6 及两份 shell `bash -n` 通过。未安装依赖，专用 Go build cache 已清理。`internal/services` 整包因本机离线 module cache 缺少既有 `github.com/klauspost/compress` 而未编译，不能把该缺口记为通过。
- 【已完成新镜像构建及 app rollout】测试镜像 tag 为 `backup-test-zh-fix10`，构建返回不可变 digest `sha256:99d10f0932702f9dc82b37e32d86783c2cbefcd8c1116a30bfd6903ec4903c9b`。用户回传 app 两个 Pod 分别运行于 node1/k8s-master，均 1/1 Running、零重启；本次输出未包含 Pod `imageID`，因此 digest 与运行中 app Pod 的绑定仍由下方命令补验。
- 【已完成首次 rollout 根因修复与诊断加固】首次 broker staging 的两个副本在 180 秒内均未 Available。现场证明镜像 digest、binary 路径及跨节点调度正常；根因为 Kubernetes 根据同名 Service 自动注入 `CLAWMANAGER_SECRET_BROKER_PORT=tcp://...`，而 broker 要求该变量为数字。broker Pod 模板现显式固定该变量为 `9444` 并设置 `enableServiceLinks: false`，属于部署配置修复，不需重建 fix10 镜像。脚本还会在后续 rollout 超时后自动输出 Deployment/Pod 状态、describe、当前及 previous logs 和最近事件。失败现场同时确认 app migration 为空、目标 cluster-admin binding 未变；该次尝试不能标记为灰度通过。
- 【已完成新镜像远程灰度】修复 Pod Service 环境变量冲突后，以 fix10 不可变 digest 重跑成功：Deployment 2/2 Ready/Available，Pod 分布于 node1/k8s-master、零重启且 imageID 精确匹配；`enableServiceLinks=false`、监听端口为 `9444`。精确 app SA/audience 正向身份、错误 SA 拒绝、functional Secret upsert/get-value/filtered-delete、未登记名称拒绝全部通过；read allowlist version/hash 为 `staging-2026-09-21`/`57f8cc8e82e2f0a3d2ac893d792b49f1a4449e29100cfe25f16e6060d5a9428e`。临时 Pod、拒绝用 SA、临时 namespace 及日志已清理；app migration 仍为空，目标 cluster-admin binding 未删除。
- 【已完成 TLS 远程灰度】broker 使用 TLS 1.3 服务端证书，app 的 HTTPS client 显式固定 CA；五套官方 app 清单已改为 HTTPS URL、CA 文件和只读 CA ConfigMap 挂载。现场证书 CA SHA-256 为 `bacce361acffc8bec342ef5f637ceed45500c996daf47a12808962f88e815003`，截止 `2026-10-21 03:06:41 UTC`；broker/app 均 2/2 rollout。OpenSSL 探针通过 CA 链、SAN hostname、HTTPS health、认证 upsert/get-value/filtered-delete，并确认明文 HTTP 被拒绝；临时证书文件、Pod、namespace 和日志均已清理。migration=false 且绑定保留。正式轮换仍须使用先扩展信任、再换服务证书、最后收窄信任的独立评审流程。
- 【已完成现场 Secret ref 盘点】只读查询返回 `REFERENCE_COUNT=0`，因此 `secret-broker-read-allowlist.json` 保持空 entries，version/hash 继续为 `staging-2026-09-21`/`57f8cc8e82e2f0a3d2ac893d792b49f1a4449e29100cfe25f16e6060d5a9428e`，无需把任何业务 Secret 登记到 Deployment。现场同时再次确认 app migration 为空、目标 cluster-admin binding 未变。
- 【已完成首次 TLS 预检故障修复】首次 TLS staging 在生成 CSR 时因把超过 64 字符的完整 Service FQDN 写入 Subject CN 而被 OpenSSL 拒绝；失败发生在创建 TLS Secret/CA ConfigMap 和修改 Deployment 之前，现场 broker 仍为原 2/2 staging。证书 Subject CN 现改为短 Service 名，完整 FQDN 仅保留在允许更长名称的 SAN 中，并以静态测试防止回归；不需重建 fix10。
- 【已完成第二次 TLS patch 故障修复】CSR 与签名已成功，TLS Secret/CA ConfigMap 已创建且 CA SHA-256 同为 `bacce361acffc8bec342ef5f637ceed45500c996daf47a12808962f88e815003`，证书截止 `2026-10-21 03:06:41 UTC`；随后因两个 strategic-merge JSON 末尾各多一个 `}`，API Server 在修改 broker Deployment 前拒绝。现场 broker/app 仍为原 2/2、零重启，app broker 配置为空。JSON 已修正，并新增抽取两个 heredoc 后实际 `JSON.parse` 的回归测试；重跑会校验证书/CA 后复用，不重新生成或覆盖。
- 【已完成第三次 TLS probe 兼容修复及闭环】修正 JSON 后 broker 与 app 均成功 rollout 到 2/2；app 已取得 HTTPS URL 和 CA 文件路径，但 migration 仍为 false。原探针因镜像内 BusyBox `wget` 不支持 `--ca-certificate` 而退出，不代表 TLS 服务失败；改用镜像已有 `openssl s_client` 后，CA 链、SAN hostname、HTTPS 功能请求和明文拒绝均已通过。未安装依赖、不需重建镜像。
- 【已完成 app migration canary】2026-09-21 现场将 `CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE` 从 `false` 切换为 `true`：app、OpenClaw runtime、Hermes runtime rollout 和计划 sync 均通过，app 日志未出现 broker/TLS/policy 错误，迁移前后 app 总重启数均为 0。app/broker 各 2/2 Ready/Available，四个 Pod 的运行中 imageID 均精确匹配 fix10 digest。目标 `clawmanager-zhanghui08-app-cluster-admin` 与受保护的 `clawmanager-app-cluster-admin` 均保持原绑定；临时证据日志已清理。下一步是可回收实例/Team/清理业务 smoke，northbound 证书 activate 须单独维护窗口，完成前不得删除目标 binding。
- 【已完成 Team 业务 smoke 阻断定位及代码修复，待新镜像复测】OpenClaw Lite 测试实例 `d-broker-smoke-09211330`（user 1、instance 6）已成功运行；随后 Team 创建在 upsert `clawmanager-zhanghui08-system-user-1/clawreef-team-1-bus` 时被 broker 以 `policy_denied` 拒绝。根因为 app 的 `Client.GetNamespace` 从 system namespace 生成租户 namespace，而 broker 错按基础安装前缀匹配。策略现严格改为只接受 `<system-namespace>-user-<positive-id>`，并新增真实生成规则正测及旧错误形式拒绝测试；定向 Go 测试通过。部署修复镜像前应把现场 migration 回滚为 false，目标 cluster-admin binding 必须保留。
- 【已完成 fix11 构建、app rollout、现场回滚及 smoke 加固，待 broker 复测】fix11 digest 为 `sha256:10125e2bf46da1d1ac163a937b8bddb1b5dbc43edf82af789b2f7fd75fa59418`；app 两副本跨 node1/k8s-master 1/1 Running、零重启。现场已回滚为 migration=false，目标 cluster-admin binding 保留，失败 Team 1 未残留 Secret/PVC/ConfigMap。HTTP/TLS broker staging 的临时 namespace 已同步改为真实 `<system-namespace>-user-*`，新增 Team bus Secret upsert/get/delete及旧错误 namespace 拒绝，静态测试和 shell 语法检查通过。下一步只滚动 broker 到 fix11 digest 并在 migration=false 下执行 TLS smoke。
- 【已完成 fix11 broker TLS/Team namespace 远程复测】broker 已滚动至 fix11 不可变 digest；app/broker 各 2/2、零重启，四个 Pod 的 imageID 均精确匹配 fix11 digest并跨 node1/k8s-master。真实 `<system-namespace>-user-*` 下的实例与 Team Secret 生命周期、旧基础前缀拒绝、TLS CA/SAN 和明文拒绝全部通过，CA hash 保持 `bacce361acffc8bec342ef5f637ceed45500c996daf47a12808962f88e815003`；临时证书文件、probe Pod、namespace 和日志均已清理。migration=false，两条 cluster-admin binding 均未改变。下一步重新执行 fix11 migration canary，再重试真实 Team 创建/删除。
- 【已完成 fix11 migration canary】首次重试因固定 12 秒窗口短于 leader lease 默认 15 秒而误判并安全回滚；修正版先等待当前 revision 精确收敛、只读取 `pod-template-hash=75c5f76fbd` 的新 Pod 日志，并在 120 秒内捕获 `[SyncService] Sync complete`。现场最终 `script_status=0`、migration=true，app/runtime rollout、日志和重启数检查通过；app/broker 各 2/2，四个 Pod imageID 均为 fix11 digest、零重启并跨 node1/k8s-master。两条 binding 未改变，证据日志已清理。Team #3 `research-team` 创建于此前 migration=false 阶段，只能证明旧直连路径；须另建可回收 Team 验证 broker create/delete。
- 【已完成聊天链路根因定位及代码修复，待 fix12 远程复测】现场 app 的 `K8S_NAMESPACE=clawmanager-zhanghui08-system` 已是完整 system namespace，而 `CLAWMANAGER_SYSTEM_NAMESPACE` 与显式 LLM Gateway URL 均为空；旧代码再次追加 `-system`，使实例生成的 LLM/agent control 地址可能指向不存在的 `clawmanager-zhanghui08-system-system`。共享 runtime 的 `CLAWMANAGER_BACKEND_URL` 是独立控制链路且已正确，不能据此证明实例 LLM 地址正确。代码现对基础 namespace 和已带 `-system` 的完整 namespace 做幂等归一化，并覆盖 LLM Gateway、agent control、NO_PROXY、Team Redis 及 K8s client 共用推导；标准 `K8S_NAMESPACE=clawmanager` 行为不变。该缺陷位于既有 namespace 推导，D 的 Secret broker/PV 修改未改动模型转发、Gateway 鉴权或 provider 调用代码；现场 `invalid agent bootstrap token` 来自与当前 Pro Pod 不同的 `10.244.235.224`，而当前 runtime heartbeat/report 为 200，需先定位该 IP 对应的工作负载；不得据此提前删除任一 binding。
- 【已完成 fix12 远程 rollout、基础门禁及双路径聊天】app 与 broker 已固定到不可变 digest `sha256:d900fa0b4396a792c30bbcf5d3e01fc75f54cb8b66bbfae6e909f3632b1ce522`；旧 fix11 broker Pod 已自然退出，app/broker 各 2/2 Ready/Available、四个活动 Pod 零重启且 imageID 一致。broker TLS/CA、实例及 Team Secret 生命周期、namespace policy 拒绝、明文拒绝全部通过；migration canary 的当前 revision 收敛、OpenClaw/Hermes rollout、leader sync、日志及重启数检查均通过，`MIGRATION_AFTER=true`。Lite `111` 与 Pro `222` 已完成双路径对话 smoke。实例删除在只读盘点中发现 Lite workspace 清理缺口，须先完成下述 fix13 rollout；在 northbound 证书阶段和最终证据评审完成前仍不得移除 RBAC。
- 【已完成 Pro `222` 启动阶段诊断】Pro Deployment/ReplicaSet/Pod 均为 1/1 Ready，Pod `10.244.235.227` 零重启；OpenClaw gateway 在 25.2 秒后进入 `ready`，models warmup 在 3.509 秒内完成，Pod 内使用修复后的 `clawmanager-zhanghui08-system` Gateway URL 做鉴权请求返回 HTTP 200，`/readyz`、`/openclaw-wait/ready` 及本地 18789 均返回 200。最新截图已从“正在启动”进入完整远程 Linux 桌面，因此不是 OpenClaw 或模型 Gateway 卡住，而是自动启动的 Chromium 窗口未在前台；应先从底部 Chromium 图标恢复窗口，无需改动 app/broker/RBAC。Selkies 同时记录“new primary client”顶掉旧连接，必须只保留一个门户页。当前 Pro agent 的 heartbeat/state/report/commands 均为 HTTP 200。
- 【已完成旧 bootstrap 错误来源定位】`10.244.235.224` 对应旧 namespace `clawmanager-zhanghui08-user-1` 下的 `clawreef-4-deployment-76ff5b757b-vjvqn`，标签为 instance-id `4`、instance-name `testpro`；它不是当前 Pro `222`，也不能作为 fix12 聊天回归的失败证据。未确认该旧实例的业务归属前不手工删除。
- 【已完成远程探针脱敏修正】首次 Pro readiness 指令错误打印了 `/healthz` JSON body，其中包含 agent 会话 token；后续指令只读 HTTP status，禁止再打印 `/healthz`、`/debug/state` 或 `/debug/runtime` body。已暴露的 Pro agent 会话必须通过一次受控 Deployment rollout 轮换，并在新 Pod Ready 后继续聊天 smoke；该轮换不改动 app/broker 镜像、migration 或 RBAC binding。
- 【已完成 Pro 对话故障分层定位】从 Pro 发起对话后，模型 APIServer 对同一来源先返回 `GET /v1/models` 200，随后对 `POST /v1/chat/completions` 返回 400。这证明 Pro→ClawManager Gateway→模型端的 DNS、网络、认证和基础路由已打通；当前失败位于模型端对 chat request 的语义/协议校验，不是 Secret broker、RBAC、namespace 归一化或桌面启动导致。在读取 `model_invocations` 中已持久化的脱敏错误响应、actual provider model 和 request 顶层字段前，不修改模型配置或 Gateway 转换逻辑。
- 【已完成 Pro 模型端 400 根因定位】`model_invocations` 记录证明 invocation `20` 已正确解析 `auto` 并转发到活动模型 `qwen3.6-27b`，actual provider model 为 `/home/workspace/model/qwen/Qwen3.6-27B`，流式请求含 3 条 messages 和 36 个 tools。模型端明确返回 `"auto" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set`。因此需修改 vLLM/APIServer 启动参数以启用自动工具选择和与 Qwen3.6/现场 vLLM 版本匹配的 tool parser；不应在 ClawManager Gateway 丢弃 `tools`、强制 `tool_choice=none` 或修改 Secret/RBAC，否则会隐藏配置错误并破坏 OpenClaw 工具能力。
- 【已完成 Pro 暴露会话轮换及桌面恢复】受控 rollout 已把旧 Pro Pod `clawreef-12-deployment-c4f6b674b-7dqt7` 替换为 `clawreef-12-deployment-7f44d99b7b-7vnrp`，新 Pod Ready、零重启且 OpenClaw 两个状态探针均为 HTTP 200，因此先前从 `/healthz` 暴露的 agent 会话已完成轮换。rollout 后黑屏定位为 PVC 中失效的 `/config/.XDG/wayland-1` 运行时 socket；在证明无内核监听者后只清理该 socket/lock，并定向恢复 Selkies compositor 与 KDE `svc-de`，未再次替换 Pod、未读取健康正文、未改 migration 或 RBAC。
- 【已完成 Lite/Pro 双路径对话门禁】2026-09-22，Pro `222`（instance ID `12`）产生 invocation `28`，Lite `111`（instance ID `11`）产生 invocation `29`；两者均为 streaming `completed`，`failed_or_blocked=0`，actual provider model 均为 `Qwen3.6-27B`。最终复核 app/broker 各 2/2 Ready/Available、均固定 fix12 digest、`MIGRATION_AFTER=true`，目标与受保护 ClusterRoleBinding 精确保持原值。聊天门禁已解除，但实例 #6 的实际删除仍被 fix13 发布门禁阻止，任何 binding 均不得删除。
- 【已完成实例删除 smoke 外层命令容器名修正】首次执行在启动 smoke 脚本前安全退出，因为外层 JSONPath 错把 Deployment `clawmanager-secret-broker` 的容器名写成同名；实际经清单核对为 `secret-broker`，因此镜像引用为空。该次未进入脚本、未出现 `ACTION`，没有删除实例或修改集群资源。留档命令已改为精确读取 `secret-broker` 容器并在进入 smoke 前校验 fix12 digest。
- 【已完成实例 #6 只读归类，删除未发生】修正容器名后，旧 smoke 又在 `ACTION` 前安全退出：它错误要求每个实例必须有独占 K8s 资源。数据库仍精确存在 `#6 / user 1 / d-broker-smoke-09211330 / openclaw / lite / gateway / running` 一行；当前安装和全 namespace 均无该 ID/名称的 namespaced 资源或 PV，tenant namespace 仍 Active。该证据符合共享 gateway 的 Lite 形态，不代表实例不存在，现场未修改任何资源。
- 【已完成 Lite 删除持久数据修复及 smoke 重构，待 fix13 远程 rollout】静态复核发现旧 `deleteV2Instance` 只停止 gateway、释放 binding 并删除数据库行，未擦除 `/workspaces/<type>/user-<id>/instance-<id>`，若直接删除 #6 会遗留持久数据。代码现按“gateway cleanup → binding release → 精确路径安全校验及 workspace 擦除 → 数据库行删除”执行；路径缺失可幂等重试，路径不匹配/root/symlink 则失败关闭并保留 `deleting` 行。smoke 现以前置 DB 行、单一 binding、两个 app Pod 均可见的精确 workspace 为基线，删除后同时要求 DB/binding/workspace 全部消失，并继续确认无意外 per-instance K8s 资源、跨安装同 ID PV、migration 和两条 binding 未变。Bash 语法及静态回归 8/8 通过；`internal/services` Go 包仍因本机离线 module cache 缺少既有 `github.com/klauspost/compress v1.18.0` 无法完整编译，未下载依赖、专用临时 Go cache 已清理。
- 【已完成 fix13 远程 rollout 与删除前门禁】registry digest 为 `sha256:de5c357b884c392c74e10347aec7269692047f1927de6b4f565450c7d9fcb037`；app/broker Deployment 均固定到该不可变引用并为 2/2 Ready/Available，四个活动 Pod 的 imageID 全部精确匹配、零重启。broker TLS/CA、实例及 Team Secret 生命周期、namespace-policy denial、明文拒绝全部通过；migration canary 的 app/runtime rollout、leader sync、日志与重启检查通过，`MIGRATION=true`。目标与受保护 ClusterRoleBinding 精确保持原值。可以执行下述实例 #6 UI 删除 smoke，但仍不得删除任一 binding。
- 【已完成实例 #6 删除 smoke】reviewed 脚本 SHA-256 `550bff08a7f4a92e2a08d479b3f7f19ad2089af494e7bef69d079c4bda596b2b` 在 `ACTION` 前确认数据库行 1、runtime binding 1、两个 app Pod 均可见精确 Lite workspace、per-instance K8s 资源 0；操作者随后在 UI 删除且只删除 `#6 / d-broker-smoke-09211330`。终态确认数据库行、binding 和 `/workspaces/openclaw/user-1/instance-6` 全部清理，`script_status=0`，migration=true，app/broker 2/2 且仍固定 fix13 digest，两条 binding 未变，临时证据日志已删除。
- 【已完成 Northbound 隔离证书 prepare/activate smoke】只读盘点先确认目标安装未部署 Northbound workload 或五个证书 Secret；随后以 reviewed 脚本 SHA-256 `e1292e4aeedcf685ec20c2f5961328e03802619afb79a219b50cf93721cee1e9` 执行获授权的 ClusterIP-only staging。run-id `d-northbound-cert-20260922T061608Z` 经真实管理页完成 prepare/activate：暂存叶证书 SHA-256 `45cc4fb582f7d10211595ca33dcecdf859a6279b3717b805ae59d28585289293`，托管 CA SHA-256 `1689cd699404db9c1367adcee95b8c5eba344dffe30acb4f6ddf953ec0bb5d37`；激活后活动指纹精确匹配，旧 CA/叶证书已切换，Gateway rollout、TLS hostname/CA 握手及两条审计各一次均通过。脚本未创建 NodePort、真实 Northbound API、DB 账号或 token；合成 Deployment/Service/NetworkPolicy、五个 run-id Secret 和本地证书 scratch 均已清理。`script_status=0`，app/broker 仍 2/2 固定 fix13 digest，migration=true，两条 binding 未变。下一步仅为最终脱敏证据登记/评审，评审完成前不得删除 binding。
- 【历史 fix14 v2 evidence 已登记但被 A 复审退回】2026-09-22T09:16:21Z 的 v2 evidence 位于 `docs/evidence/secret-broker-cutover-zhanghui08-20260922T091621Z.txt`，SHA-256 为 `6f11632410858a0e68f31e9b85f49846dfbe2bd64ae3353428371c4902d455e3`。其现场状态、源码和当时文件指纹一致，但绑定的五套 manifest 含无效 standalone `+`，不得用作 cutover 授权；修复后必须生成新的 v3 evidence。
- 【已完成 P1 修复后的 v3 evidence 登记、A 签收及正式去权】2026-09-23T01:16:25Z 的 `docs/evidence/secret-broker-cutover-zhanghui08-20260923T011625Z.txt` 文件 SHA-256 精确等于现场输出 `fd8588ed96a93c30c7ac1ac96d9d9f77d78fb2c9388d9f344d986ca355d136c5`。它绑定修正后的五套 manifest、新 app-init smoke、live 两个 init completed/exit0/restarts0、app/broker 2/2、fix14、migration=true、HTTPS/RBAC/历史业务 smoke 与当时两条未变 binding；文件内 `review_state=pending_cross_owner_review` 是采集时状态，A 已于 2026-09-23 完成外部复审签收。随后操作者使用该 hash 完成正式 cutover，终态另见 post-cutover evidence。
- 【已完成 Team 证据语义修正】首次只读 evidence 版本 `b03b65eec1171cea920f3c559ea38713503bd83e25a5fce7bbb16bcb6cb6c2a5` 错把 Team 删除要求成数据库物理行消失，因此在任何集群写操作前以 `deleted Team #4 database row returned` 安全退出。代码复核确认 `DeleteTeam` 的设计是保留历史行、将名称改为 `__deleted_<id>` 后缀、状态设为 `deleted`，成员也保留为 `deleted` 并清空 `instance_id`；原 Team smoke 通过项是 Secret/ConfigMap/PVC/PV 清理。修正版改为精确验证 Team #4 单一 tombstone、所有成员 deleted 且 detached，以及目标安装 K8s 资源/PV 为零；该失败不表示业务残留，未修改任何资源或 binding。
- 【历史证据已登记、A 复审退回】2026-09-22T06:40:20Z 的只读快照 SHA-256 为 `419852166e49be4f6aa4f66bf26b8b9980cb5cff77e5f4cb98722a213eb4b991`，其脱敏与现场一致性仍成立；但 A 随后发现三项安全缺口，因此该 hash 不得作为 `SECRET_BROKER_EVIDENCE_SHA256` 执行 cutover。须在修正版镜像、标签拒绝远程负测及声明式复核后生成新 evidence，并由 A 明确签收。
- 【已完成 fix14 rollout 与标签归属远程负测】`backup-test-zh-fix14` 的不可变 digest 为 `sha256:1ba8cc47f468610e6875117f75fe42ce9fdb15e1cd2e6f877ac8ff2f99e2baa0`；app/broker 均为 2/2 Updated/Ready/Available，四个活动 Pod 零重启且 imageID 精确匹配，migration=true。兼容旧版 kubectl 的 reviewed smoke 脚本 SHA-256 为 `aedcbeb09c3cbd0bdbe90b992fc1f8b05b4fd72c74a1f2d4d88af8079201e852`：缺失标签与错误 team-id 标签的 get/get-value/delete 共六项均返回 403，被拒绝的点删没有删除对象，正确标签的 upsert/get/get-value/delete 生命周期分别返回 204/200/200/204；run-owned namespace、probe 与日志均清理，两条 binding 未变。首次仅测试夹具 `--labels` 不兼容的退出不计 broker 失败。下一步生成绑定 fix14、正式清单指纹和生产 HTTPS 现场状态的新脱敏 evidence，并提交 A 复审；仍不得去权。
- 【已完成 P1 init 命令修复及远程 rollout】五套正式清单已将 `openssl s_client + -connect ...` 修正为真实 shell `\` 续行；逐套 YAML 解析和 token 检查确认无 standalone `+`，静态门禁新增相同拒绝并保持 8/8。新 manifest SHA-256 依次为 k8s cluster `0d2feeb6e663c7357e5103e9af959c2c49e3ef1ebcd9aee384b71da54a3d54d1`、k3s cluster `71087377b110036bc1a42db4526431871f812b4c6442c6816e8471aa826fb7cb`、k8s single-node `dc0b28c075567e350b2e5780734995b6d5a378508291a3d8f901e1ba514ab900`、k3s single-node `bbe0ad4748f31425ce436c6b1733ee07a0ed0d53567643ff15ad80df44b5fcb2`、nine-node `7526fccd38e719b127f77a3b5d0f7d950128721ddf4ffed3a22d3e2e1dfe2447`。reviewed smoke `0bebb1eae6aee27403dc25334fe866eb2a6697721975aa83c8a39c41736dd6b8` 已滚动 app：两个 init container 均 exit 0/restarts 0，app 2/2 Ready、主容器零重启，broker 2/2，migration=true 且两条 binding 未变。

## 已确认的 Secret 依赖

| 功能 | 当前直接调用 |
| --- | --- |
| Codex Windows bootstrap | app 创建/更新实例 bootstrap Secret |
| OpenClaw 配置注入 | app 创建/更新 OpenClaw bootstrap Secret |
| Team 创建与 Redis bus | app 写 Team token/Redis Secret，并在运行时读取 |
| 通用 Secret ref | app 按 namespace/name/key 读取 Secret |
| 北向证书管理 | app 读取、创建、更新、删除固定证书 Secret |
| 实例/Team 清理 | app list/delete 带受管 label 的 Secret |

这些路径迁移到独立、经过策略约束和身份认证的 Secret broker，并分别完成创建、读取、轮换、删除及拒绝越权 smoke 前，不得设置 `SECRET_BROKER_CUTOVER_APPROVED=true`。

## Broker 新镜像远程灰度（已完成，命令留档）

【已完成镜像构建】现使用 `backup-test-zh-fix10` 对应的 registry digest 执行 broker staging。下方 `SECRET_BROKER_IMAGE` 已固定为不可变引用；不得改回可变 tag。该阶段只验证新镜像内 broker binary、独立身份和闭集策略，不打开 app migration，也不删除任何 `cluster-admin` binding。

```bash
(
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

test -f scripts/secret-broker-stage-zhanghui08.sh
test -f deployments/k8s/secret-broker.yaml
kubectl --context=kubernetes-admin@kubernetes config current-context

export SECRET_BROKER_IMAGE='10.130.14.23:5000/clawmanager@sha256:99d10f0932702f9dc82b37e32d86783c2cbefcd8c1116a30bfd6903ec4903c9b'
[[ "$SECRET_BROKER_IMAGE" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]]

RUN_ID="d-secret-broker-stage-$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="/tmp/${RUN_ID}.log"
trap 'rm -f -- "$EVIDENCE"' EXIT

KUBE_CONTEXT='kubernetes-admin@kubernetes' \
SOURCE_NAMESPACE='clawmanager-zhanghui08-system' \
SECRET_BROKER_IMAGE="$SECRET_BROKER_IMAGE" \
bash scripts/secret-broker-stage-zhanghui08.sh 2>&1 | tee "$EVIDENCE"

grep -E '^(PASS|STAGED|CLEANED|FAIL)' "$EVIDENCE" || true
kubectl --context=kubernetes-admin@kubernetes --namespace=clawmanager-zhanghui08-system \
  get deployment clawmanager-secret-broker \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,IMAGE:.spec.template.spec.containers[0].image,SA:.spec.template.spec.serviceAccountName'
kubectl --context=kubernetes-admin@kubernetes --namespace=clawmanager-zhanghui08-system \
  get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{"\n"}{end}'
kubectl --context=kubernetes-admin@kubernetes --namespace=clawmanager-zhanghui08-system \
  get pods -l app=clawmanager-app \
  -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,SPEC_IMAGE:.spec.containers[0].image,IMAGE_ID:.status.containerStatuses[0].imageID,NODE:.spec.nodeName'
kubectl --context=kubernetes-admin@kubernetes get clusterrolebinding \
  clawmanager-zhanghui08-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'

rm -f -- "$EVIDENCE"
trap - EXIT
test ! -e "$EVIDENCE"
echo 'CLEANED: broker staging evidence log removed after terminal output was retained'
)
```

【已完成】现场结果包含 broker functional Secret 的 upsert/get-value/filtered-delete、未登记名称拒绝、错误 SA 拒绝及临时 Pod/SA/namespace 清理；`script_status=0`，app migration 为空，目标 cluster-admin binding 仍存在。下一步须先登记现场 `llm_models.api_key_secret_ref` 的非空引用；在 TLS、app 迁移和业务 smoke 完成前不得删除绑定。

## 现场 Secret ref 只读盘点（已完成，命令留档）

【已完成】命令只从 `llm_models` 读取非空 `api_key_secret_ref`，按应用同一规则规范化为 `namespace/name:key`，并只核对 Secret 对象的 metadata；不读取或打印 Secret data。现场输出 `REFERENCE_COUNT=0`、migration 为空、目标 binding 保留，因此空 registry/hash 不变。

```bash
(
set -euo pipefail

CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
QUERY="SELECT DISTINCT TRIM(api_key_secret_ref) FROM llm_models WHERE api_key_secret_ref IS NOT NULL AND TRIM(api_key_secret_ref) <> '' ORDER BY 1"

REF_OUTPUT="$(
  kubectl --context="$CTX" --namespace="$NS" exec deploy/mysql -- sh -c \
    'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names --execute="$1"' \
    secret-ref-inventory "$QUERY"
)"
REFS=()
if [[ -n "$REF_OUTPUT" ]]; then
  mapfile -t REFS <<<"$REF_OUTPUT"
fi

echo "REFERENCE_COUNT=${#REFS[@]}"
for ref in "${REFS[@]}"; do
  ref="${ref%$'\r'}"
  normalized="${ref#k8s-secret/}"
  [[ "$normalized" == *:* ]] || { echo "INVALID_REF=$ref" >&2; exit 1; }
  path_part="${normalized%%:*}"
  key_part="${normalized#*:}"
  [[ -n "$path_part" && "$key_part" =~ ^[A-Za-z0-9._-]{1,253}$ ]] || {
    echo "INVALID_REF=$ref" >&2
    exit 1
  }
  if [[ "$path_part" == */* ]]; then
    ref_namespace="${path_part%%/*}"
    ref_name="${path_part#*/}"
    [[ "$ref_name" != */* ]] || { echo "INVALID_REF=$ref" >&2; exit 1; }
  else
    ref_namespace="$NS"
    ref_name="$path_part"
  fi
  [[ -n "$ref_namespace" && -n "$ref_name" ]] || { echo "INVALID_REF=$ref" >&2; exit 1; }
  kubectl --context="$CTX" --namespace="$ref_namespace" get secret "$ref_name" \
    -o custom-columns='SECRET:.metadata.name,NAMESPACE:.metadata.namespace' --no-headers
  echo "REGISTERED_CANDIDATE=${ref_namespace}/${ref_name}:${key_part}"
done

migration_flag="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{end}')"
[[ "$migration_flag" != "true" ]]
echo "APP_MIGRATION_FLAG=${migration_flag:-<empty>}"
echo 'TARGET_BINDING='
kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'
)
```

## TLS 远程灰度（已完成，命令留档）

使用已验证的 fix10 digest 执行 `scripts/secret-broker-tls-stage-zhanghui08.sh`。该阶段会持久化 broker TLS Secret 和公开 CA ConfigMap，并滚动 broker/app；app 仍使用原直接 Secret 路径，因为 migration 明确保持 `false`。脚本不会删除任一 ClusterRoleBinding；失败时不得手工开启 migration。

```bash
(
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

test -f scripts/secret-broker-tls-stage-zhanghui08.sh
grep -q 'migration remains false; cluster-admin bindings were not deleted' \
  scripts/secret-broker-tls-stage-zhanghui08.sh
grep -Fq 'CN = ${service_name}' scripts/secret-broker-tls-stage-zhanghui08.sh
if grep -Fq 'CN = ${service_fqdn}' scripts/secret-broker-tls-stage-zhanghui08.sh; then
  echo 'FAIL: stale overlong certificate CN is still present' >&2
  exit 1
fi

CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
SECRET_BROKER_IMAGE='10.130.14.23:5000/clawmanager@sha256:99d10f0932702f9dc82b37e32d86783c2cbefcd8c1116a30bfd6903ec4903c9b'
RUN_ID="d-secret-broker-tls-$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="/tmp/${RUN_ID}.log"
trap 'rm -f -- "$EVIDENCE"' EXIT

set +e
KUBE_CONTEXT="$CTX" \
SOURCE_NAMESPACE="$NS" \
SECRET_BROKER_IMAGE="$SECRET_BROKER_IMAGE" \
bash scripts/secret-broker-tls-stage-zhanghui08.sh 2>&1 | tee "$EVIDENCE"
status="${PIPESTATUS[0]}"
set -e

echo "script_status=$status"
grep -E '^(PASS|STAGED|CLEANED|FAIL)' "$EVIDENCE" || true

kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-secret-broker \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image,CA_SHA256:.spec.template.metadata.annotations.clawmanager\.io/secret-broker-ca-sha256'
kubectl --context="$CTX" --namespace="$NS" get secret clawmanager-secret-broker-tls \
  -o custom-columns='SECRET:.metadata.name,TYPE:.type,CA_SHA256:.metadata.annotations.clawmanager\.io/ca-sha256,CERT_NOT_AFTER:.metadata.annotations.clawmanager\.io/cert-not-after'
kubectl --context="$CTX" --namespace="$NS" get configmap clawmanager-secret-broker-ca \
  -o custom-columns='CONFIGMAP:.metadata.name,CA_SHA256:.metadata.annotations.clawmanager\.io/ca-sha256'
kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_URL")]}URL={.value}{"\n"}{end}{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_CA_FILE")]}CA_FILE={.value}{"\n"}{end}{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}MIGRATION={.value}{"\n"}{end}'
kubectl --context="$CTX" --namespace="$NS" get pods -l app=clawmanager-app \
  -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,IMAGE_ID:.status.containerStatuses[0].imageID,NODE:.spec.nodeName'
kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'

rm -f -- "$EVIDENCE"
trap - EXIT
test ! -e "$EVIDENCE"
echo 'CLEANED: TLS staging evidence log removed after terminal output was retained'

if [[ "$status" -ne 0 ]]; then
  echo 'FAILED: do not enable migration or remove RBAC bindings; paste the complete output back to D.'
  exit "$status"
fi
)
```

## Broker app 迁移 canary（fix10/fix11 均已完成，命令留档）

【已完成 fix11 canary】修正版现场输出 `script_status=0`、`MIGRATION=true`，当前 revision 的 leader sync、app/runtime rollout、日志和重启数检查通过；app/broker 各 2/2、零重启且 imageID 匹配 fix11 digest。目标及受保护 binding 均未改变。下列命令作为已验证留档；它不会删除任何 ClusterRoleBinding。migration 现保持 `true`，仍须完成真实业务 smoke 才能进入删除评审。

```bash
(
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SCRIPT='scripts/secret-broker-migration-canary-zhanghui08.sh'
EXPECTED_SCRIPT_SHA256='a8820256e17963bc110ed2b2d3419adfe6feb6367b8b5a52929d4141ccebd5eb'
ACTUAL_SCRIPT_SHA256="$(sha256sum "$SCRIPT" | awk '{print $1}')"
echo "migration_canary_script_sha256=$ACTUAL_SCRIPT_SHA256"
if [[ "$ACTUAL_SCRIPT_SHA256" != "$EXPECTED_SCRIPT_SHA256" ]]; then
  echo 'FAIL: migration canary script hash differs from the reviewed version' >&2
  exit 1
fi

CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
SECRET_BROKER_IMAGE='10.130.14.23:5000/clawmanager@sha256:10125e2bf46da1d1ac163a937b8bddb1b5dbc43edf82af789b2f7fd75fa59418'
SECRET_BROKER_CA_SHA256='bacce361acffc8bec342ef5f637ceed45500c996daf47a12808962f88e815003'
RUN_ID="d-secret-broker-migration-$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="/tmp/${RUN_ID}.log"
trap 'rm -f -- "$EVIDENCE"' EXIT

kubectl --context="$CTX" config current-context

set +e
KUBE_CONTEXT="$CTX" \
SOURCE_NAMESPACE="$NS" \
SECRET_BROKER_IMAGE="$SECRET_BROKER_IMAGE" \
SECRET_BROKER_CA_SHA256="$SECRET_BROKER_CA_SHA256" \
SECRET_BROKER_SYNC_WAIT_SECONDS=120 \
CONFIRM_SECRET_BROKER_MIGRATION=true \
bash "$SCRIPT" 2>&1 | tee "$EVIDENCE"
status="${PIPESTATUS[0]}"
set -e

echo "script_status=$status"
grep -E '^(BASELINE|PASS|CANARY|NEXT|ROLLBACK|FAIL)' "$EVIDENCE" || true

migration="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")].value}')"
echo "MIGRATION=${migration:-<empty>}"

echo '===== DEPLOYMENTS ====='
kubectl --context="$CTX" --namespace="$NS" get deployments \
  clawmanager-secret-broker clawmanager-app \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image'

echo '===== PODS ====='
kubectl --context="$CTX" --namespace="$NS" get pods \
  -l 'app in (clawmanager-app,clawmanager-secret-broker)' \
  -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,IMAGE_ID:.status.containerStatuses[0].imageID,NODE:.spec.nodeName'

echo '===== TARGET BINDING (MUST STILL EXIST) ====='
kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'

echo '===== PROTECTED BINDING (MUST BE UNCHANGED) ====='
kubectl --context="$CTX" get clusterrolebinding clawmanager-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'

rm -f -- "$EVIDENCE"
trap - EXIT
test ! -e "$EVIDENCE"
echo 'CLEANED: migration canary evidence log removed after terminal output was retained'

if [[ "$status" -ne 0 ]]; then
  [[ "$migration" == false ]] || {
    echo 'FAIL: canary failed and migration did not roll back to false; run the rollback command below immediately' >&2
    exit 1
  }
  echo 'FAILED BUT ROLLED BACK: do not run business smoke or remove RBAC; paste the complete output back to D.'
  exit "$status"
fi

[[ "$migration" == true ]] || {
  echo 'FAIL: canary returned success but migration is not true' >&2
  exit 1
}
echo 'CANARY READY: run real business smoke next; do not remove the target binding yet.'
)
```

如脚本报告回滚失败，仅执行下列恢复命令；不要删除任何 binding：

```bash
CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
kubectl --context="$CTX" --namespace="$NS" set env deployment/clawmanager-app \
  CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=false
kubectl --context="$CTX" --namespace="$NS" rollout status deployment/clawmanager-app --timeout=300s
```

## 真实 Team broker create/delete smoke（已完成）

【已完成本地脚本与门禁】该脚本要求 migration=true，固定 user 1 的真实租户 namespace，校验 app/broker 2/2、fix11 imageID、零重启和两条 binding baseline；它只观察新增 Team，不会自行删除资源，也不会触碰现有 Team #3。执行期间按终端提示在 UI 新建一个名字以 `d-broker-team-smoke-` 开头的一次性 Team，等待 Running；脚本验证 Secret 仅含预期 key 名、ConfigMap/PVC 和无 broker 错误后，再由操作者在 UI 删除同一个新 Team并按回车。最终脚本验证 Team Secret/ConfigMap/PVC/PV 清理、migration=true 和 binding 不变。不要读取或粘贴 Secret 值。

【已完成首次远程 create/delete、清理与跨安装隔离复核】Team #4 在 migration=true 下成功 Running；broker Secret `clawreef-team-4-bus` 标签及两个预期 key 名、ConfigMap、Bound PVC 均通过，随后 UI 删除已使目标 namespace 的 Secret/ConfigMap/PVC/PV 消失。最终只读复核确认 app 总重启为 0、migration=true、目标及受保护 binding 均未变化，日志无 Team #4 broker/TLS 清理错误。集群中同 `team-id=4` 的 `clawreef-pv-user-1-team-4-shared` 明确 claim `clawmanager-ltt-user-1`，属于另一安装并按设计忽略和保留。脚本现记录目标 PVC 实际绑定的 PV，并按精确 claim namespace/name 等待和校验，避免跨安装误删。

【已完成 gawk 兼容修复】首次最终复核已正确列出另一安装 PV，但 `awk -v namespace=...` 因 `namespace` 是现场 gawk 内建名称而在只读筛选阶段退出，没有修改任何资源。脚本和留档命令统一改用 `target_ns`，并新增静态禁止旧写法的回归断言。

【已完成最终远程复核】现场输出 `PASS[team-business-smoke:delete]`、`IGNORED[foreign-installation]` 和 `DONE[team-business-smoke]`；Team #4 broker create/delete smoke 完整通过，另一安装 PV 未受影响。

```bash
(
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SCRIPT='scripts/secret-broker-team-business-smoke-zhanghui08.sh'
EXPECTED_SCRIPT_SHA256='a21e47429593489d3cffbd0cf9cbaee3959d8b286bf527e6d523b1273e107e32'
ACTUAL_SCRIPT_SHA256="$(sha256sum "$SCRIPT" | awk '{print $1}')"
echo "team_business_smoke_script_sha256=$ACTUAL_SCRIPT_SHA256"
if [[ "$ACTUAL_SCRIPT_SHA256" != "$EXPECTED_SCRIPT_SHA256" ]]; then
  echo 'FAIL: Team business smoke script hash differs from the reviewed version' >&2
  exit 1
fi

KUBE_CONTEXT='kubernetes-admin@kubernetes' \
SOURCE_NAMESPACE='clawmanager-zhanghui08-system' \
SMOKE_USER_ID=1 \
TEAM_SMOKE_WAIT_SECONDS=900 \
SECRET_BROKER_IMAGE_DIGEST='sha256:10125e2bf46da1d1ac163a937b8bddb1b5dbc43edf82af789b2f7fd75fa59418' \
CONFIRM_SECRET_BROKER_TEAM_SMOKE=true \
bash "$SCRIPT"
)
```

【已完成历史现场快照与 D 复核，A 已退回】成功输出的 `evidence_sha256` 为 `419852166e49be4f6aa4f66bf26b8b9980cb5cff77e5f4cb98722a213eb4b991`；规范正文已原样登记为 `docs/evidence/secret-broker-cutover-zhanghui08-20260922T064020Z.txt`，仓库侧复算得到相同 hash。A 随后发现三项安全缺口，该 hash 已失去 cutover 资格；修正版须重新做远程标签负测、生成新 evidence 并取得 A 签收。

远程成功终态必须同时出现：

```text
PASS[team-business-smoke:create]: team_id=<new-id> ...
PASS[team-business-smoke:delete]: team_id=<same-id> ...
DONE[team-business-smoke]: migration remains true; both cluster-admin bindings remain unchanged
```

如创建失败，脚本会保留现场并退出，不要手工删除 binding；粘贴从 `READY`/`ACTION` 开始的完整输出。如 UI 创建已报错但脚本仍在等待，可按 `Ctrl+C` 停止，现有 Team #3 不受影响。

### Team #4 跨安装 PV 归属最终只读复核

该命令不会删除 PV 或修改 finalizer。它列出同 `team-id=4` 的 PV，但只把 claim namespace 精确等于目标租户的 PV 计为残留；`clawmanager-ltt-user-1` 的 PV 会作为另一安装资源显示并忽略。

```bash
(
set -euo pipefail
CTX='kubernetes-admin@kubernetes'
SYSTEM_NS='clawmanager-zhanghui08-system'
TENANT_NS='clawmanager-zhanghui08-system-user-1'

kubectl --context="$CTX" config current-context

echo '===== TEAM-ID 4 PV INVENTORY (CROSS-INSTALLATION) ====='
pv_inventory="$(kubectl --context="$CTX" get persistentvolumes -l team-id=4 \
  -o custom-columns='NAME:.metadata.name,PHASE:.status.phase,CLAIM_NAMESPACE:.spec.claimRef.namespace,CLAIM_NAME:.spec.claimRef.name,RECLAIM:.spec.persistentVolumeReclaimPolicy' \
  --no-headers 2>/dev/null || true)"
printf '%s\n' "${pv_inventory:-<none>}"

remaining_namespaced="$(kubectl --context="$CTX" --namespace="$TENANT_NS" get \
  secrets,configmaps,persistentvolumeclaims -l team-id=4 -o name 2>/dev/null || true)"
target_pvs="$(printf '%s\n' "$pv_inventory" | awk -v target_ns="$TENANT_NS" '$3 == target_ns { print $1 }')"

[[ -z "$remaining_namespaced" ]] || {
  printf '%s\n' "$remaining_namespaced" >&2
  echo 'FAIL: Team #4 resources remain in the target tenant namespace' >&2
  exit 1
}
[[ -z "$target_pvs" ]] || {
  printf '%s\n' "$target_pvs" >&2
  echo 'FAIL: Team #4 PV still claims the target tenant namespace' >&2
  exit 1
}

migration="$(kubectl --context="$CTX" --namespace="$SYSTEM_NS" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")].value}')"
[[ "$migration" == true ]]

restart_total="$(kubectl --context="$CTX" --namespace="$SYSTEM_NS" get pods -l app=clawmanager-app \
  -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.restartCount}{"\n"}{end}{end}' | \
  awk '{ total += $1 } END { print total + 0 }')"
[[ "$restart_total" == 0 ]]

target_binding="$(kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{.subjects[0].kind}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}')"
protected_binding="$(kubectl --context="$CTX" get clusterrolebinding clawmanager-app-cluster-admin \
  -o jsonpath='{.roleRef.kind}{"|"}{.roleRef.name}{"|"}{.subjects[0].kind}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}')"
[[ "$target_binding" == 'ClusterRole|cluster-admin|ServiceAccount|clawmanager-app|clawmanager-zhanghui08-system' ]]
[[ "$protected_binding" == 'ClusterRole|cluster-admin|ServiceAccount|clawmanager-app|clawmanager-system' ]]

app_logs="$(kubectl --context="$CTX" --namespace="$SYSTEM_NS" logs \
  -l app=clawmanager-app --all-containers=true --prefix=true --since=60m)"
if printf '%s\n' "$app_logs" | grep -Eiq \
  'policy_denied|token_review_failed|caller_forbidden|failed to delete Team 4 secret|x509:|certificate signed by unknown authority'; then
  printf '%s\n' "$app_logs" >&2
  echo 'FAIL: app logs contain a Team #4 broker/TLS cleanup failure' >&2
  exit 1
fi

echo "MIGRATION=$migration"
echo "APP_RESTART_TOTAL=$restart_total"
echo "TARGET_BINDING=$target_binding"
echo "PROTECTED_BINDING=$protected_binding"
echo 'PASS[team-business-smoke:delete]: team_id=4 Secret/ConfigMap/PVC/PV cleanup complete'
echo 'IGNORED[foreign-installation]: team-id=4 PVs whose claim namespace is not clawmanager-zhanghui08-system-user-1'
echo 'DONE[team-business-smoke]: migration remains true; both bindings remain unchanged'
)
```

## 实例删除/清理 smoke（已完成）

【已完成风险修复】在删除一次性实例 #6 前发现旧实例清理会按集群全局 `instance-id` 枚举并删除 PV；共享集群中另一安装可能复用相同数据库 ID。现在 PV 删除和等待收敛均要求当前安装 tenant namespace、`user-id`、`instance-id`、`managed-by` 四项归属证明；无 claim、错误 user 或另一安装 claim 的 PV 一律保留。namespace 搜索也只接受当前安装的 `<system-namespace>-user-<positive-id>`。本地 K8s 包测试已通过，回归用例明确保留 `clawmanager-ltt-user-1` 的同 ID PV；专用 Go cache 已清理。

【已完成 Lite 专用安全 smoke、前置聊天及 fix13 门禁】`scripts/secret-broker-instance-delete-smoke-zhanghui08.sh` 只观察操作者在 UI 删除已登记的一次性实例，不含 `kubectl delete`。脚本会在删除前核对数据库中的精确 ID/user/name、`lite|gateway` 形态、单一 runtime binding、严格等于 `/workspaces/openclaw/user-1/instance-6` 的 workspace、两个 app Pod 的共享挂载可见性、零 per-instance K8s 资源、reviewed imageID、migration、零重启和两条 binding；删除后要求数据库行、binding 和 workspace 全部消失，同时验证另一安装同 ID PV 的 UID 未改变。fix13 rollout、TLS/migration canary 与 digest 登记均已完成，现在只允许执行下述一次性实例 #6 UI 删除；不得手工删除任何 workspace、PV、Secret 或 binding。

### 先构建、滚动 fix13 并恢复 migration canary

以下命令完整执行静态门禁、构建/推送、临时回到 migration=false、app/broker fix13 rollout、TLS 合成正负测和 migration canary。它不会删除实例或 binding。任何一步失败都停止；把完整输出回传 D，待 D 将实际 digest 写入下一段删除命令后再继续。

```bash
(
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
IMAGE_REPOSITORY='10.130.14.23:5000/clawmanager'
IMAGE_TAG="${IMAGE_REPOSITORY}:backup-test-zh-fix13"
TLS_SCRIPT='scripts/secret-broker-tls-stage-zhanghui08.sh'
MIGRATION_SCRIPT='scripts/secret-broker-migration-canary-zhanghui08.sh'
TLS_SCRIPT_SHA256='ef58f4892ba3636b7c04969517200f9627df84214a3589fd196d3edd5f2d6668'
MIGRATION_SCRIPT_SHA256='a8820256e17963bc110ed2b2d3419adfe6feb6367b8b5a52929d4141ccebd5eb'
RUN_ID="d-fix13-rollout-$(date -u +%Y%m%dT%H%M%SZ)"
PUSH_LOG="/tmp/${RUN_ID}-push.log"
VERIFY_IMAGE="clawmanager-backend-verify:${RUN_ID}"
cleanup() {
  rm -f -- "$PUSH_LOG"
  docker image rm -f "$VERIFY_IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

[[ "$(sha256sum "$TLS_SCRIPT" | awk '{print $1}')" == "$TLS_SCRIPT_SHA256" ]]
[[ "$(sha256sum "$MIGRATION_SCRIPT" | awk '{print $1}')" == "$MIGRATION_SCRIPT_SHA256" ]]
[[ "$(kubectl --context="$CTX" config current-context)" == "$CTX" ]]
bash -n scripts/secret-broker-instance-delete-smoke-zhanghui08.sh
docker run --rm --volume "$PWD:/work:ro" --workdir /work \
  node:24-alpine node --test scripts/system-backup-rbac-manifests.test.mjs

docker build --pull --target backend-builder -t "$VERIFY_IMAGE" .
docker run --rm --entrypoint go "$VERIFY_IMAGE" test ./internal/services
docker image rm "$VERIFY_IMAGE"

docker build --pull -t "$IMAGE_TAG" .
docker push "$IMAGE_TAG" 2>&1 | tee "$PUSH_LOG"
FIX13_DIGEST="$(sed -nE 's/.*digest: (sha256:[0-9a-f]{64}).*/\1/p' "$PUSH_LOG" | tail -n 1)"
[[ "$FIX13_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  echo 'FAIL: could not parse the immutable fix13 digest from docker push output' >&2
  exit 1
}
FIX13_REF="${IMAGE_REPOSITORY}@${FIX13_DIGEST}"
echo "FIX13_IMAGE=$IMAGE_TAG"
echo "FIX13_REF=$FIX13_REF"

kubectl --context="$CTX" --namespace="$NS" set env deployment/clawmanager-app \
  CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=false
kubectl --context="$CTX" --namespace="$NS" rollout status deployment/clawmanager-app --timeout=300s

kubectl --context="$CTX" --namespace="$NS" set image deployment/clawmanager-app \
  clawmanager-app="$FIX13_REF"
kubectl --context="$CTX" --namespace="$NS" set image deployment/clawmanager-secret-broker \
  secret-broker="$FIX13_REF"
kubectl --context="$CTX" --namespace="$NS" rollout status deployment/clawmanager-app --timeout=600s
kubectl --context="$CTX" --namespace="$NS" rollout status deployment/clawmanager-secret-broker --timeout=600s

KUBE_CONTEXT="$CTX" \
SOURCE_NAMESPACE="$NS" \
SECRET_BROKER_IMAGE="$FIX13_REF" \
bash "$TLS_SCRIPT"

CA_SHA256="$(kubectl --context="$CTX" --namespace="$NS" get configmap clawmanager-secret-broker-ca \
  -o jsonpath='{.metadata.annotations.clawmanager\.io/ca-sha256}')"
[[ "$CA_SHA256" =~ ^[0-9a-f]{64}$ ]]

KUBE_CONTEXT="$CTX" \
SOURCE_NAMESPACE="$NS" \
SECRET_BROKER_IMAGE="$FIX13_REF" \
SECRET_BROKER_CA_SHA256="$CA_SHA256" \
SECRET_BROKER_SYNC_WAIT_SECONDS=120 \
CONFIRM_SECRET_BROKER_MIGRATION=true \
bash "$MIGRATION_SCRIPT"

APP_REF="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].image}')"
BROKER_REF="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].image}')"
[[ "$APP_REF" == "$FIX13_REF" && "$BROKER_REF" == "$FIX13_REF" ]]
for selector in app=clawmanager-app app=clawmanager-secret-broker; do
  image_ids="$(kubectl --context="$CTX" --namespace="$NS" get pods -l "$selector" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.imageID}{"\n"}{end}{end}')"
  [[ "$(printf '%s\n' "$image_ids" | sed '/^$/d' | wc -l | tr -d '[:space:]')" == 2 ]]
  ! printf '%s\n' "$image_ids" | grep -Fv "$FIX13_DIGEST" >/dev/null
done
MIGRATION="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{end}')"
[[ "$MIGRATION" == true ]]
TARGET_BINDING="$(kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o jsonpath='{.roleRef.name}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}')"
PROTECTED_BINDING="$(kubectl --context="$CTX" get clusterrolebinding clawmanager-app-cluster-admin \
  -o jsonpath='{.roleRef.name}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}')"
[[ "$TARGET_BINDING" == 'cluster-admin|clawmanager-app|clawmanager-zhanghui08-system' ]]
[[ "$PROTECTED_BINDING" == 'cluster-admin|clawmanager-app|clawmanager-system' ]]

echo '===== FIX13 DEPLOYMENTS ====='
kubectl --context="$CTX" --namespace="$NS" get deployments clawmanager-app clawmanager-secret-broker \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image'
echo '===== FIX13 PODS ====='
kubectl --context="$CTX" --namespace="$NS" get pods \
  -l 'app in (clawmanager-app,clawmanager-secret-broker)' \
  -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,IMAGE_ID:.status.containerStatuses[0].imageID,NODE:.spec.nodeName'
echo '===== MIGRATION ====='
kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{"\n"}{end}'
echo '===== TARGET BINDING — MUST REMAIN ====='
kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'
echo '===== PROTECTED BINDING — MUST REMAIN UNCHANGED ====='
kubectl --context="$CTX" get clusterrolebinding clawmanager-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'

rm -f -- "$PUSH_LOG"
trap - EXIT
test ! -e "$PUSH_LOG"
! docker image inspect "$VERIFY_IMAGE" >/dev/null 2>&1
echo 'CLEANED: fix13 docker-push scratch log removed'
echo 'CLEANED: fix13 backend verification image removed'
echo "READY[fix13]: digest=$FIX13_DIGEST migration=true; do not delete either binding"
)
```

### fix13 上传后的纯 Kubernetes 续跑命令（当前下一步）

当前 kubectl 节点没有 Node 或 Docker；静态回归已在 D 的本地工作区通过 8/8，fix13 镜像成功构建则证明 Go 代码已编译。已知 digest 后不再构建或 push；该命令显式把 app/broker 固定到 reviewed fix13 digest，完成 TLS/migration canary，并 fail-closed 核对副本、imageID、零重启和两条 binding。它不删除实例或 binding。

```bash
(
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
FIX13_DIGEST='sha256:de5c357b884c392c74e10347aec7269692047f1927de6b4f565450c7d9fcb037'
FIX13_REF="10.130.14.23:5000/clawmanager@${FIX13_DIGEST}"
TLS_SCRIPT='scripts/secret-broker-tls-stage-zhanghui08.sh'
MIGRATION_SCRIPT='scripts/secret-broker-migration-canary-zhanghui08.sh'
INSTANCE_DELETE_SCRIPT='scripts/secret-broker-instance-delete-smoke-zhanghui08.sh'
TLS_SCRIPT_SHA256='ef58f4892ba3636b7c04969517200f9627df84214a3589fd196d3edd5f2d6668'
MIGRATION_SCRIPT_SHA256='a8820256e17963bc110ed2b2d3419adfe6feb6367b8b5a52929d4141ccebd5eb'
INSTANCE_DELETE_SCRIPT_SHA256='550bff08a7f4a92e2a08d479b3f7f19ad2089af494e7bef69d079c4bda596b2b'

[[ "$(kubectl --context="$CTX" config current-context)" == "$CTX" ]]
[[ "$(sha256sum "$TLS_SCRIPT" | awk '{print $1}')" == "$TLS_SCRIPT_SHA256" ]]
[[ "$(sha256sum "$MIGRATION_SCRIPT" | awk '{print $1}')" == "$MIGRATION_SCRIPT_SHA256" ]]
[[ "$(sha256sum "$INSTANCE_DELETE_SCRIPT" | awk '{print $1}')" == "$INSTANCE_DELETE_SCRIPT_SHA256" ]]
bash -n "$INSTANCE_DELETE_SCRIPT"

kubectl --context="$CTX" --namespace="$NS" set env deployment/clawmanager-app \
  CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE=false
kubectl --context="$CTX" --namespace="$NS" rollout status deployment/clawmanager-app --timeout=300s

kubectl --context="$CTX" --namespace="$NS" set image deployment/clawmanager-app \
  clawmanager-app="$FIX13_REF"
kubectl --context="$CTX" --namespace="$NS" set image deployment/clawmanager-secret-broker \
  secret-broker="$FIX13_REF"
kubectl --context="$CTX" --namespace="$NS" rollout status deployment/clawmanager-app --timeout=600s
kubectl --context="$CTX" --namespace="$NS" rollout status deployment/clawmanager-secret-broker --timeout=600s

KUBE_CONTEXT="$CTX" \
SOURCE_NAMESPACE="$NS" \
SECRET_BROKER_IMAGE="$FIX13_REF" \
bash "$TLS_SCRIPT"

CA_SHA256="$(kubectl --context="$CTX" --namespace="$NS" get configmap clawmanager-secret-broker-ca \
  -o jsonpath='{.metadata.annotations.clawmanager\.io/ca-sha256}')"
[[ "$CA_SHA256" =~ ^[0-9a-f]{64}$ ]]

KUBE_CONTEXT="$CTX" \
SOURCE_NAMESPACE="$NS" \
SECRET_BROKER_IMAGE="$FIX13_REF" \
SECRET_BROKER_CA_SHA256="$CA_SHA256" \
SECRET_BROKER_SYNC_WAIT_SECONDS=120 \
CONFIRM_SECRET_BROKER_MIGRATION=true \
bash "$MIGRATION_SCRIPT"

APP_REF="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].image}')"
BROKER_REF="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].image}')"
[[ "$APP_REF" == "$FIX13_REF" && "$BROKER_REF" == "$FIX13_REF" ]]

for deployment in clawmanager-app clawmanager-secret-broker; do
  state="$(kubectl --context="$CTX" --namespace="$NS" get deployment "$deployment" \
    -o jsonpath='{.spec.replicas}{"|"}{.status.readyReplicas}{"|"}{.status.availableReplicas}')"
  [[ "$state" == '2|2|2' ]]
done
for selector in app=clawmanager-app app=clawmanager-secret-broker; do
  image_ids="$(kubectl --context="$CTX" --namespace="$NS" get pods -l "$selector" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.imageID}{"\n"}{end}{end}')"
  [[ "$(printf '%s\n' "$image_ids" | sed '/^$/d' | wc -l | tr -d '[:space:]')" == 2 ]]
  ! printf '%s\n' "$image_ids" | grep -Fv "$FIX13_DIGEST" >/dev/null
  restarts="$(kubectl --context="$CTX" --namespace="$NS" get pods -l "$selector" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.restartCount}{"\n"}{end}{end}' | \
    awk '{ total += $1 } END { print total + 0 }')"
  [[ "$restarts" == 0 ]]
done

MIGRATION="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{end}')"
TARGET_BINDING="$(kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o jsonpath='{.roleRef.name}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}')"
PROTECTED_BINDING="$(kubectl --context="$CTX" get clusterrolebinding clawmanager-app-cluster-admin \
  -o jsonpath='{.roleRef.name}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}')"
[[ "$MIGRATION" == true ]]
[[ "$TARGET_BINDING" == 'cluster-admin|clawmanager-app|clawmanager-zhanghui08-system' ]]
[[ "$PROTECTED_BINDING" == 'cluster-admin|clawmanager-app|clawmanager-system' ]]

echo '===== FIX13 DEPLOYMENTS ====='
kubectl --context="$CTX" --namespace="$NS" get deployments clawmanager-app clawmanager-secret-broker \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image'
echo '===== FIX13 PODS ====='
kubectl --context="$CTX" --namespace="$NS" get pods \
  -l 'app in (clawmanager-app,clawmanager-secret-broker)' \
  -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,IMAGE_ID:.status.containerStatuses[0].imageID,NODE:.spec.nodeName'
echo "MIGRATION=$MIGRATION"
echo "TARGET_BINDING=$TARGET_BINDING"
echo "PROTECTED_BINDING=$PROTECTED_BINDING"

echo "READY[fix13]: digest=$FIX13_DIGEST migration=true; do not delete either binding"
)
```

### fix13 digest 登记后执行实例 #6 UI 删除 smoke（已完成命令留档）

【已完成】fix13 完整输出 `READY[fix13]` 后，reviewed smoke 在 `ACTION` 前锁定一次性实例 `#6 / d-broker-smoke-09211330`；操作者只删除该实例并取得 DB/binding/workspace 三项清理成功、`script_status=0`、migration/binding 不变的完整证据。下述命令仅作留档，不得重跑，因为 #6 已不存在；不要手工删除 workspace、PV、Secret 或任何 binding。

```bash
(
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
SCRIPT='scripts/secret-broker-instance-delete-smoke-zhanghui08.sh'
EXPECTED_SCRIPT_SHA256='550bff08a7f4a92e2a08d479b3f7f19ad2089af494e7bef69d079c4bda596b2b'
EXPECTED_FIX13_DIGEST='sha256:de5c357b884c392c74e10347aec7269692047f1927de6b4f565450c7d9fcb037'
EXPECTED_FIX13_REF="10.130.14.23:5000/clawmanager@${EXPECTED_FIX13_DIGEST}"

[[ "$(kubectl --context="$CTX" config current-context)" == "$CTX" ]]
ACTUAL_SCRIPT_SHA256="$(sha256sum "$SCRIPT" | awk '{print $1}')"
echo "instance_delete_smoke_script_sha256=$ACTUAL_SCRIPT_SHA256"
[[ "$ACTUAL_SCRIPT_SHA256" == "$EXPECTED_SCRIPT_SHA256" ]] || {
  echo 'FAIL: instance deletion smoke script differs from the reviewed version' >&2
  exit 1
}
bash -n "$SCRIPT"

APP_REF="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="clawmanager-app")].image}')"
BROKER_REF="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-secret-broker \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="secret-broker")].image}')"
[[ "$APP_REF" == "$EXPECTED_FIX13_REF" && "$BROKER_REF" == "$EXPECTED_FIX13_REF" ]] || {
  echo "FAIL: app/broker is not pinned to the reviewed fix13 reference" >&2
  exit 1
}

RUN_ID="d-instance-delete-smoke-$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="/tmp/${RUN_ID}.log"
trap 'rm -f -- "$EVIDENCE"' EXIT

set +e
KUBE_CONTEXT="$CTX" \
SOURCE_NAMESPACE="$NS" \
SMOKE_USER_ID=1 \
SMOKE_INSTANCE_ID=6 \
SMOKE_INSTANCE_NAME='d-broker-smoke-09211330' \
INSTANCE_DELETE_SMOKE_WAIT_SECONDS=900 \
SECRET_BROKER_IMAGE_DIGEST="$EXPECTED_FIX13_DIGEST" \
CONFIRM_SECRET_BROKER_INSTANCE_DELETE_SMOKE=true \
bash "$SCRIPT" 2>&1 | tee "$EVIDENCE"
status="${PIPESTATUS[0]}"
set -e

echo "script_status=$status"
kubectl --context="$CTX" --namespace="$NS" get deployments clawmanager-app clawmanager-secret-broker \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image'
kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'
kubectl --context="$CTX" get clusterrolebinding clawmanager-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'

rm -f -- "$EVIDENCE"
trap - EXIT
test ! -e "$EVIDENCE"
echo 'CLEANED: instance deletion smoke evidence log removed after terminal output was retained'

if [[ "$status" -ne 0 ]]; then
  echo 'FAILED: do not remove either binding; paste the complete output back to D.' >&2
  exit "$status"
fi
echo 'INSTANCE DELETE SMOKE PASSED: paste the complete output back to D; do not remove either binding.'
)
```

成功终态必须同时包含：

```text
PASS[instance-delete-smoke:delete]: instance_id=6 database row, runtime binding, and exact Lite workspace cleanup complete
DONE[instance-delete-smoke]: migration remains true; foreign-installation PVs and both cluster-admin bindings remain unchanged
```

## 已完成的 RBAC 安全预检（命令留档）

该指令会应用显式 runtime role、创建并清理临时 probe、应用独立 collector 清单并做正负测。它不会删除目标 cluster-admin；当前预期退出码为 3。

```bash
(
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

test -f scripts/system-backup-rbac-cutover-zhanghui08.sh
test -f deployments/k8s/system-backup-secret-capture-functional-test.yaml
kubectl --context=kubernetes-admin@kubernetes config current-context

RUN_ID="d-rbac-preflight-$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="/tmp/${RUN_ID}.log"
trap 'rm -f -- "$EVIDENCE"' EXIT

set +e
KUBE_CONTEXT='kubernetes-admin@kubernetes' \
SOURCE_NAMESPACE='clawmanager-zhanghui08-system' \
bash scripts/system-backup-rbac-cutover-zhanghui08.sh 2>&1 | tee "$EVIDENCE"
status="${PIPESTATUS[0]}"
set -e

echo "script_status=$status"
grep -E '^(BASELINE|PASS|BLOCKED|FAIL|ROLLBACK|DONE)' "$EVIDENCE" || true

kubectl --context=kubernetes-admin@kubernetes get clusterrolebinding \
  clawmanager-zhanghui08-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'

rm -f -- "$EVIDENCE"
trap - EXIT
test ! -e "$EVIDENCE"
echo 'CLEANED: remote scratch log removed after terminal output was retained'

if [[ "$status" -ne 3 ]]; then
  echo 'UNEXPECTED: current safe stage must stop at the Secret broker gate with status 3.'
  echo 'Paste the complete output back to D; do not continue manually.'
  exit 1
fi
)
```

预期至少出现：

```text
PASS[pre-cutover]: isolated runtime role matrix; probe has no Secret verbs
PASS[pre-cutover]: app rollout, runtime rollouts, and scheduled sync
PASS[collector]: registered_secret=clawmanager-system-backup-functional-test-allowlisted
PASS[collector]: unregistered_secret=clawmanager-system-backup-functional-test-unregistered
PASS[collector]: allowlist_registry_version=functional-test-2026-09-20
PASS[collector]: allowlist_registry_sha256=4966a40bc8e3b948d29ac79cb3514a2955ec47a4186aa2eee14b07cbec4242b5
BLOCKED: Secret broker cutover is not approved; cluster-admin was not deleted
```

最后的只读 ClusterRoleBinding 查询必须仍显示：

```text
clawmanager-zhanghui08-app-cluster-admin  cluster-admin  clawmanager-app  clawmanager-zhanghui08-system
```

## Northbound 证书业务 smoke（先只读盘点）

实例、Team、聊天与清理业务 smoke 均已完成。Northbound `prepare/activate` 会修改证书 Secret 并重启 Gateway，必须独立维护窗口执行；先运行下述只读盘点。命令只输出 workload/Service 状态、精确 Secret 的名称/type/key 名和证书公开元数据，不输出 Secret data、私钥、token 或接口正文，也不修改资源。

```bash
(
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
FIX13_DIGEST='sha256:de5c357b884c392c74e10347aec7269692047f1927de6b4f565450c7d9fcb037'

[[ "$(kubectl --context="$CTX" config current-context)" == "$CTX" ]]

mysql_query() {
  kubectl --context="$CTX" --namespace="$NS" exec deploy/mysql -- sh -c \
    'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names --execute="$1"' \
    sh "$1"
}

echo '===== PLATFORM SAFETY ====='
kubectl --context="$CTX" --namespace="$NS" get deployments clawmanager-app clawmanager-secret-broker \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image'
MIGRATION="$(kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-app \
  -o jsonpath='{range .spec.template.spec.containers[?(@.name=="clawmanager-app")].env[?(@.name=="CLAWMANAGER_SECRET_BROKER_MIGRATION_COMPLETE")]}{.value}{end}')"
TARGET_BINDING="$(kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o jsonpath='{.roleRef.name}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}')"
PROTECTED_BINDING="$(kubectl --context="$CTX" get clusterrolebinding clawmanager-app-cluster-admin \
  -o jsonpath='{.roleRef.name}{"|"}{.subjects[0].name}{"|"}{.subjects[0].namespace}')"
[[ "$MIGRATION" == true ]]
[[ "$TARGET_BINDING" == 'cluster-admin|clawmanager-app|clawmanager-zhanghui08-system' ]]
[[ "$PROTECTED_BINDING" == 'cluster-admin|clawmanager-app|clawmanager-system' ]]
for selector in app=clawmanager-app app=clawmanager-secret-broker; do
  image_ids="$(kubectl --context="$CTX" --namespace="$NS" get pods -l "$selector" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.imageID}{"\n"}{end}{end}')"
  [[ "$(printf '%s\n' "$image_ids" | sed '/^$/d' | wc -l | tr -d '[:space:]')" == 2 ]]
  ! printf '%s\n' "$image_ids" | grep -Fv "$FIX13_DIGEST" >/dev/null
done
echo "MIGRATION=$MIGRATION"
echo "TARGET_BINDING=$TARGET_BINDING"
echo "PROTECTED_BINDING=$PROTECTED_BINDING"

echo '===== NORTHBOUND WORKLOAD AND SERVICE ====='
kubectl --context="$CTX" --namespace="$NS" get deployment clawmanager-northbound-gateway \
  --ignore-not-found \
  -o custom-columns='NAME:.metadata.name,DESIRED:.spec.replicas,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image'
kubectl --context="$CTX" --namespace="$NS" get service clawmanager-northbound-gateway clawmanager-northbound-core \
  --ignore-not-found \
  -o custom-columns='NAME:.metadata.name,TYPE:.spec.type,CLUSTER_IP:.spec.clusterIP,PORTS:.spec.ports[*].port,NODE_PORTS:.spec.ports[*].nodePort'
kubectl --context="$CTX" --namespace="$NS" get pods -l app=clawmanager-northbound-gateway \
  -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,IMAGE_ID:.status.containerStatuses[0].imageID,NODE:.spec.nodeName' \
  --no-headers 2>/dev/null || true

echo '===== EXACT NORTHBOUND SECRET METADATA — NO DATA ====='
for name in \
  clawmanager-northbound-gateway-tls \
  clawmanager-northbound-gateway-ca \
  clawmanager-northbound-managed-ca \
  clawmanager-northbound-gateway-tls-next \
  clawmanager-northbound-gateway-ca-next; do
  if kubectl --context="$CTX" --namespace="$NS" get secret "$name" >/dev/null 2>&1; then
    kubectl --context="$CTX" --namespace="$NS" get secret "$name" \
      -o go-template='SECRET={{.metadata.name}} TYPE={{.type}} MANAGED_BY={{index .metadata.labels "app.kubernetes.io/managed-by"}} STAGE={{index .metadata.labels "clawmanager.io/northbound-certificate"}} KEYS={{range $key,$unused := .data}}{{$key}},{{end}}{{"\n"}}'
  else
    echo "SECRET=$name STATE=MISSING"
  fi
done

echo '===== NORTHBOUND DATABASE SETTINGS AND CERTIFICATE AUDIT ====='
mysql_query 'SELECT api_enabled,external_node_port,require_explicit_callers,version FROM northbound_admin_settings WHERE id=1'
mysql_query "SELECT action,COUNT(*),COALESCE(MAX(created_at),'never') FROM northbound_settings_audit WHERE action IN ('certificate.prepare','certificate.activate') GROUP BY action ORDER BY action"

echo '===== ACTIVE CERTIFICATE PUBLIC METADATA — NO PEM/KEY OUTPUT ====='
mapfile -t GATEWAY_PODS < <(kubectl --context="$CTX" --namespace="$NS" get pods \
  -l app=clawmanager-northbound-gateway --field-selector=status.phase=Running \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | sed '/^$/d' | sort)
echo "GATEWAY_RUNNING_POD_COUNT=${#GATEWAY_PODS[@]}"
for pod in "${GATEWAY_PODS[@]}"; do
  kubectl --context="$CTX" --namespace="$NS" exec "$pod" -c gateway -- sh -c '
    set -eu
    cert="${NORTHBOUND_GATEWAY_TLS_CERT_FILE:-/etc/clawmanager/northbound/server/tls.crt}"
    key="${NORTHBOUND_GATEWAY_TLS_KEY_FILE:-/etc/clawmanager/northbound/server/tls.key}"
    test -s "$cert"
    test -s "$key"
    cert_pub="$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk "{print \$1}")"
    key_pub="$(openssl pkey -in "$key" -pubout -outform DER 2>/dev/null | sha256sum | awk "{print \$1}")"
    test "$cert_pub" = "$key_pub"
    echo KEYPAIR_MATCH=YES
    openssl x509 -in "$cert" -noout -sha256 -fingerprint -subject -issuer -startdate -enddate -ext subjectAltName
  '
done

if [[ "${#GATEWAY_PODS[@]}" -eq 0 ]]; then
  echo 'BLOCKED[northbound-readonly-preflight]: no running northbound Gateway Pod; no resources were modified'
else
  echo 'DONE[northbound-readonly-preflight]: public metadata only; no resources were modified'
fi
)
```

### 已完成的隔离 Northbound 证书 prepare/activate smoke（命令留档）

【已完成，禁止重跑】该脚本没有部署真实 Northbound API，也未创建 NodePort、DB 账号、调用方授权或 token。它先证明固定名称资源均不存在，再用 fix13 不可变镜像创建一个 ClusterIP-only、无 ServiceAccount token、只运行 `openssl s_server` 的合成 Gateway；旧活动 CA 与新托管 CA 相互独立，五个证书 Secret 和三个临时资源都带唯一 run-id。操作者通过真实管理页依次执行 prepare 与 activate；脚本验证 broker 保留所有权标签、暂存证书确实被替换、prepare/activate 审计各增加一次、活动 CA/叶证书指纹发生切换、Gateway Pod 被 rollout、TLS hostname/CA 校验通过、Northbound settings 未变，随后只删除本次 run-id 精确资源并复核 app/broker、migration 与两条 binding。最终输出 `DONE[northbound-certificate-smoke]`、`script_status=0`，下述命令仅作留档。

执行期间不要打开第二个管理页，也不要修改北向设置、NodePort 或调用方权限。看到第一个 `ACTION` 时打开“管理后台 → 北向接口”，按命令打印的三个 DNS SAN 填写、清空 IP SAN、有效期填 `30`，点击“准备托管证书”，等绿色成功提示后回终端按 Enter；看到第二个 `ACTION` 后点击“已分发 CA，确认激活”并确认浏览器弹窗，等绿色成功提示后再回终端按 Enter。完整执行：

```bash
(
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
FIX13_DIGEST='sha256:de5c357b884c392c74e10347aec7269692047f1927de6b4f565450c7d9fcb037'
FIX13_IMAGE='10.130.14.23:5000/clawmanager@sha256:de5c357b884c392c74e10347aec7269692047f1927de6b4f565450c7d9fcb037'
EXPECTED_SCRIPT_SHA256='e1292e4aeedcf685ec20c2f5961328e03802619afb79a219b50cf93721cee1e9'
SCRIPT='scripts/secret-broker-northbound-certificate-smoke-zhanghui08.sh'
EVIDENCE_LOG="$(mktemp)"

cleanup_evidence() {
  rm -f -- "$EVIDENCE_LOG"
}
trap cleanup_evidence EXIT

[[ "$(kubectl --context="$CTX" config current-context)" == "$CTX" ]]
ACTUAL_SCRIPT_SHA256="$(sha256sum "$SCRIPT" | awk '{print $1}')"
echo "northbound_certificate_smoke_script_sha256=$ACTUAL_SCRIPT_SHA256"
[[ "$ACTUAL_SCRIPT_SHA256" == "$EXPECTED_SCRIPT_SHA256" ]] || {
  echo 'FAIL: Northbound certificate smoke script hash is not the reviewed value' >&2
  exit 1
}

set +e
KUBE_CONTEXT="$CTX" \
SOURCE_NAMESPACE="$NS" \
CONFIRM_SECRET_BROKER_NORTHBOUND_CERTIFICATE_SMOKE=true \
NORTHBOUND_SMOKE_IMAGE_REF="$FIX13_IMAGE" \
SECRET_BROKER_IMAGE_DIGEST="$FIX13_DIGEST" \
bash "$SCRIPT" 2>&1 | tee "$EVIDENCE_LOG"
script_status=${PIPESTATUS[0]}
set -e

echo "script_status=$script_status"
echo '===== FINAL PLATFORM SAFETY ====='
kubectl --context="$CTX" --namespace="$NS" get deployments clawmanager-app clawmanager-secret-broker \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image'
kubectl --context="$CTX" get clusterrolebinding clawmanager-zhanghui08-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'
kubectl --context="$CTX" get clusterrolebinding clawmanager-app-cluster-admin \
  -o custom-columns='NAME:.metadata.name,ROLE:.roleRef.name,SUBJECT:.subjects[0].name,NAMESPACE:.subjects[0].namespace'

cleanup_evidence
trap - EXIT
echo 'CLEANED: Northbound certificate smoke evidence log removed after terminal output was retained'
if [[ "$script_status" -ne 0 ]]; then
  echo 'FAILED: do not remove either binding; paste the complete output back to D.' >&2
  exit "$script_status"
fi
echo 'NORTHBOUND CERTIFICATE SMOKE PASSED: paste the complete output back to D; do not remove either binding.'
)
```

## 最终脱敏证据快照与评审（历史 fix13 命令，禁止作为当前批准）

以下命令严格只读，不会删除目标 binding，也不会修改任何 Kubernetes 或数据库对象。它不会打印 Secret data、API key、session token、健康接口正文或聊天正文。该命令固定检查旧 fix13，仅为历史留档；在修正版镜像发布后必须更新 reviewed digest/脚本并重新采集，旧 hash 不得传给 cutover 脚本。

```bash
(
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

SCRIPT='scripts/secret-broker-final-evidence-zhanghui08.sh'
EXPECTED_SCRIPT_SHA256='f05680cefe8f4247080638f4cd0de33ac62d46f6dd4243d283b32ac99e40677e'
FIX13_DIGEST='sha256:de5c357b884c392c74e10347aec7269692047f1927de6b4f565450c7d9fcb037'
FIX13_IMAGE='10.130.14.23:5000/clawmanager@sha256:de5c357b884c392c74e10347aec7269692047f1927de6b4f565450c7d9fcb037'

ACTUAL_SCRIPT_SHA256="$(sha256sum "$SCRIPT" | awk '{print $1}')"
echo "final_evidence_script_sha256=$ACTUAL_SCRIPT_SHA256"
[[ "$ACTUAL_SCRIPT_SHA256" == "$EXPECTED_SCRIPT_SHA256" ]] || {
  echo 'FAIL: final evidence script hash is not the reviewed value' >&2
  exit 1
}
bash -n "$SCRIPT"

KUBE_CONTEXT='kubernetes-admin@kubernetes' \
SOURCE_NAMESPACE='clawmanager-zhanghui08-system' \
SECRET_BROKER_IMAGE_DIGEST="$FIX13_DIGEST" \
SECRET_BROKER_IMAGE_REF="$FIX13_IMAGE" \
bash "$SCRIPT"
)
```

## 后续解除门禁的完成条件

1. 【已完成】独立 `clawmanager-secret-broker` Deployment 使用独立同名 ServiceAccount；现场目标 binding 仍保留且禁止删除。
2. 【已完成】broker 除 namespace/name/operation/key 闭集外，点查、取值、点删会校验存量 Secret 的实际归属标签；fix14 下缺失/错误标签六项远程负测均为 403，拒绝点删保留对象，正确标签生命周期通过。
3. 【声明式修正已完成】五套正式 profile 固定 migration=true、不再声明 app `cluster-admin`，并各自包含与 app 相同镜像的 HTTPS broker 全套非敏感资源；TLS Secret/CA ConfigMap 为外部 PKI 前置条件且 app CA 不可选。HTTP 只可由合成测试开关显式启用。重复 apply、对象唯一性及 YAML 解析回归已通过。
4. 【历史业务 smoke 已完成】fix13 下的 Team、Lite/Pro、实例删除与 Northbound 证书业务 smoke 仍是有效历史事实，但不能覆盖 A 新发现的三项安全缺口；修正版至少须补标签拒绝远程负测和回归 smoke。
5. 【已完成 A 安全签收与正式去权】P1 修复后的 v3 hash 为 `fd8588ed96a93c30c7ac1ac96d9d9f77d78fb2c9388d9f344d986ca355d136c5`；v2 与更早 hash 均作废。操作者已用 reviewed cutover 脚本完成目标 binding 删除，post-cutover smoke 和终态权限查询通过。

## 远程验收结论

【已完成历史阶段】fix10/fix11 staging、TLS、migration canary、Team #4，fix12 双路径聊天，以及 fix13 实例删除、Northbound 证书阶段均已完成，现场两条 binding 在预切换阶段始终未变。【已完成 A 退回项修正、远程负测、v3 evidence 与 A 安全签收】fix14 已完成 app/broker rollout，存量 Secret 缺失/错误标签六项远程拒绝、拒绝点删保留与正确标签生命周期全部通过；五套正式清单、app-init 现场终态和生产 HTTPS 门禁已绑定到 v3 evidence `fd8588ed96a93c30c7ac1ac96d9d9f77d78fb2c9388d9f344d986ca355d136c5`。【已完成正式 cutover】操作者显式批准后，reviewed 脚本返回0，目标 `clawmanager-zhanghui08-app-cluster-admin` 已删除且终态查询为 `NotFound`；app Secret list 为 `no`、Deployment get 为 `yes`，受保护的 `clawmanager-app-cluster-admin` 保持不变。该结论只表示 app RBAC 去权工作项通过，不宣称 P0-0b 整体通过。
