# B1/B3 本地开发与隔离验证

基线 `4fe83bcde5a8a693dddb2635e9a3e397d6e3472e`；本轮再次 fetch/ls-remote 确认 D 公开 backup 未更新，负责人第①项统一基线尚未到齐。只读核对 C `50b27d7763d545a7905862fa1a1e544a5e14235e`，其祖先含 `5874d7d7fba480fcefbd8ae6e9a3ef22d61442d3`，没有合入其 controller、schema 或配置。精确 C blob 见 baseline-observation.json。

本轮没有提交 SHA：用户要求保留本地、禁止提交/推送。未修改现有公共 ABI、控制 SQL、迁移、正式 registry/合同批准状态、生产 owner link、安装检查或 readiness。

## 文件及接收人

| 文件 | 交付 |
| --- | --- |
| backend/internal/systembackup/publicadapter/runtime_profile.go | 给 D：NewRuntimeLinuxProfileConfig 实际填充原 profile hooks，调用既有 RuntimeWriterBuilder；接受原 task runtime mapping/participants/platform writer，不遗漏 stopped 实例或 C 的物理平台 writer。 |
| backend/internal/systembackup/publicadapter/modules.go | 给 D/Teams/Skills：候选 typed module catalog、上下文绑定、确定性选择/index、实际 BuildCapturePart materializer。缺模块/未知 operation/异源数据库/不一致上下文/重复 Job 准确拒绝，不造新的 collector 或控制面。 |
| runtime_profile_test.go、modules_test.go | 本地隔离组合及拒绝回归，非现场证明。 |
| docs/system-backup-b-runtime-profile-module-contract-20261029.md | 真实构造/调用位置、输入输出、操作和错误边界、C 分支已实现差异、D/A/C 逐接口缺口及接收后的下一步。 |

## 最终结果

| 范围 | 记录 | 结果 |
| --- | --- | --- |
| publicadapter + 原 shared dispatch 全包 | final-public-tests.jsonl、stderr/exit | exit 0，223 个 pass test event（含子测试），0 fail / 0 skip。 |
| D 原生产组合定向测试 | d-composition-tests.jsonl、stderr/exit | TestTaskExecutionProduction 两项通过，exit 0。不是 D controller 全包或新 C/D 组合验收。 |
| go vet publicadapter | vet.log / exit | exit 0。 |
| 完整源码 pin | source-pin.json | 最终四份 Go、既有调用依赖、共享 ABI/main 和交付文档的 normalized-LF SHA256。 |

实际组合覆盖 `SELECT-only RR source driver → NewRuntimeLinuxProfileConfig → NewLinuxDispatcher → 原 D BindTaskRunner/UnwrapTaskPlan → NewRuntimeWriterBuilder → 真实 HTTP loopback RuntimeAgentClient → flow.Capture → 模型 Job/result → collector Stop → 原 reservation 恢复`。合成 inventory 有两个用户，一个运行实例、一个原本停止实例，另有公共 gate participant。Job 在三个 writer ACK/CheckPaused 后才 Ensure；仅运行实例被删除并以原预留代数恢复，停止实例不启动；构造无 IO，Prepare 无写入，Bind 使用冻结数据，secret-bearing 原材料不进 Plan。

其它覆盖：D/C platform writer 句柄保留及组合清单完整性；缺实例/participant/platform、重复或 nil writer、缺 owner/覆盖 hook/空目录拒绝；模块目录排序/防御复制；真实 workspace/database 两种 Job 工厂；未请求模块不调用；缺公共 storage part/不完整 acceptance 不返回部分成功；跨 task/config/profile/attempt/inventory/catalog/hold 的 context 拒绝；错误操作、payload、索引、共同 hash、数据库 UUID、任意命令、浮动 worker 镜像、重复 Job 及模块错误拒绝。非法 UTF-8 revision 拒绝，避免目录 JSON 归一化造成不同原值相同摘要。

上述 SQL 是 SELECT-only driver 模型；HTTP 服务是合成 Agent；Job/grant/认证结果/seal/SQL 恢复回调是模型。没有真实 MySQL、Runtime Agent 进程树、K8s Job/卷/快照、实际 signer/provider/Catalog、正式成品或隔离还原，因此不宣称非空 Agent 实链或公共整链通过。没有提供真实 A 密钥或生产 D callback。

## 原始迭代和命令

- targeted-tests 是较早版本定向 45 pass 的开发记录；final-public 才覆盖最终新增平台句柄、数据库绑定、零值目录和 UTF-8 拒绝逻辑。
- iteration-public-tests 保留一次 212 pass / 1 fail：新增测试 helper 把逻辑 part 的下划线直接用于 Kubernetes 名称，被原校验拒绝。只修测试 helper 的合法名称，保留生产命名校验；最终真实 DB/workspace factory 用例成功。
- initial-cwd-targeted-tests 保留首次执行的原生记录：命令起始目录误为 backend，gofmt 路径失败并误建 backend 下专用日志/cache；随即纠正到仓库根目录，旧日志逐文件移到此目录，未覆盖失败记录。有效最终命令是从根目录运行 `go -C backend ...`，不是首次位置误差输出。
- 其余中间成功结果仅按实际变化范围重跑；未重跑无变化的整个 A evidence（含长时 deadline 测试）、前端、镜像或部署。

环境仅使用已有 Go 和模块缓存：GOTOOLCHAIN=local、GOPROXY=off、GOSUMDB=off、GOFLAGS=-mod=readonly；测试 `-p=2 -count=1 -timeout=2m`。最终两包为 `go -C backend test -json ... ./internal/systembackup/publicadapter ./internal/systembackupdispatch`；D 为同参数加 `-run '^TestTaskExecutionProduction' ./cmd/system-backup-controller`；vet 为 `go -C backend vet ./internal/systembackup/publicadapter`。未安装依赖或输出独立仓库二进制。

## 清理与待接入项

Go 自身测试工作子目录已随命令退出清理，原生日志与验证记录保留。原根目录 `.codex-temp/b-direct-backup-integration-20261028/cache` 按此前拒绝记录未删除，本轮复用其缓存。首次目录误差产生的 `backend/.codex-temp/b-direct-backup-integration-20261028/cache` 已只读核对绝对路径和范围；native PowerShell 递归清理命令再次在执行前被自动审批以 `blocked by policy` 拒绝，没有改用其它工具/路径绕过，缓存清理不计完成。空白 task tmp 目录暂留。未删除其他 owner 的产物。

生产接收仍缺 D 新统一 SHA/Source→runtime 原映射/Platform+participant 全集/原加密材料与恢复 CAS、公用 CaptureContext 的真实原始事实、A 当前与历史用途/最小 worker 授权、C 实际 SQL/Redis/对象模块和 seal/finalizer 输入。C 已存在源码的 RecoveryOnly、BoundPodIdentity、平台停止证明等不再列成“没有实现”，但须 D 统一合入并签收后再复核本轮 factory。不能删除 C 零实例限制、改 capability 布尔值、复用旧 shadow controller 或伪造 ready 来填补缺口。

准确字段、各接收人及其下一步见 [完整 B1/B3 交接](../../system-backup-b-runtime-profile-module-contract-20261029.md)。本轮所有结果均属于未提交候选源码，不代表正式合同接受、生产能力启用或现场迁移。
