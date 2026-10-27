# D 独立收敛与部署预检（2026-09-29）

本轮范围是 D 的部署初始化、现有 DTO 校验、controller 恢复和离线部署组合。没有生成 A/B/C 的 registry、typed ref、adapter 或评审结论，也没有连接目标集群、执行真实 MFA 或激活配置。

用户已确认“尚未构建，先交付本地结果和脚本”。因此本轮完成判据是以下代码/模板及本地验证，不包含新镜像发布或远端无重启恢复验收。

后续进展（2026-09-29）：操作者已构建 fix16 并回传隔离现场输出，93 文件重放及 SELECT/UPDATE 两轮无重启恢复通过，清理报告完整。见 [fix16 回执](evidence/system-backup-d-fix16-isolated-smoke-20260929.json)。上文是原本地交付范围；后续回执不代表实际应用 HTTP、容量 collector、本人 MFA 或配置激活已完成。

## 初始化只有一个表结构来源

四个官方部署 profile 及 nine-node-production 的 `clawmanager-mysql-init` 现在从 `deployments/mysql/000_database.sql` 生成，只创建数据库。删除原来的独立建表、ALTER 和种子 SQL；应用 `db.Initialize` 在开始服务前执行 embedded migration，独立 `system-backup-migrate` 也使用同一 runner 和 ledger。没有修改任何既有 migration。

```powershell
node scripts/system-backup-d-init-check.mjs
node scripts/system-backup-d-init-check.mjs --write
```

检查禁止部署清单重新引入业务建表/写用户 SQL，检查数据库目标和 init 挂载。生成器只替换该 ConfigMap 的 data，其他资源语义保持原样，输出统一使用 LF。inventory 已重生成：deployment bootstrap create 从 22 降至 0，99 个对象及 93 文件 migration catalog 不变；schema registry 保持 draft 和原有待评审状态。

这改变全新数据卷的初始化路径。默认管理员、邮箱、索引和配额均取 embedded migration，不再取旧 YAML 的种子/索引定义。已有 MySQL 数据卷不会重新执行 entrypoint init，修改 YAML 不会修复既有库的 schema 差异，也不会重置用户。实际旧库升级和四矩阵现场验收仍需独立证据；原 93 文件隔离重放回执继续保留，不改写为本次部署验收。

## 49 种 DTO 的字段类型门禁

```powershell
node scripts/system-backup-d-dto-check.mjs
node scripts/system-backup-d-dto-check.test.mjs
```

遍历 `dto-parity.json` 已列出的所有对象定义，共 49 种、435 个字段。检查 Go/TS 覆盖、字段集合、整数/浮点 Go 类型、可空性、数组与嵌套引用、TS 字面量及已引用文档的合同版本；不支持的声明直接报错。补齐 `ConfigResourceList`、`PruneRunResourceList`，收紧 eligibility reason、target risk、verification unusable reason 的 TS 类型。

这是 wire shape 检查。范围、正则、条件约束和跨字段不变量仍由 JSON Schema/运行时 validator 验证；Go string 不因此获得运行时枚举检查。现有四份缺失合同仍明确报缺，未宣称完整合同冻结。CI 在安装前端依赖之前执行这些纯 Node 门禁。

## Controller 恢复与失败重试

`BootstrapSupervisor` 的 worker 异常退出后按下一个 bootstrap tick 重试，修复读 bootstrap 仍成功、worker 权限失败时的忙循环。新测试通过真实 `SQLControllerGrantProbe` 加可变的测试 SQL transport 覆盖撤权、同一 supervisor 内恢复、重复失败限速、关停无残留 worker；另覆盖数据库 bootstrap 读故障恢复，以及旧 worker 不退出时禁止启动替代 worker。

这些是本地进程组件测试，未声称真实 MySQL/Kubernetes 无重启验收。`scripts/system-backup-controller-grant-drift-phase.sh` 已改为分别撤销配置 SELECT 和任务 UPDATE，恢复权限后等待自动恢复，不调用 rollout restart；必须保持两副本 Pod UID、container ID、restartCount 和安装状态投影不变。仍只允许在既有隔离 smoke 的临时 namespace 内执行，先核对 namespace UID，最终清理由原 harness 完成。旧 fix15 回执仍代表“恢复时有重启”。现场运行还需包含新源码的固定摘要镜像；旧 fix15 镜像不能证明本次修复。

## 离线 HTTP 部署组合

```powershell
node scripts/system-backup-d-deployment.mjs --requirements
node scripts/system-backup-d-deployment.mjs --input <正式公开输入.json>
node scripts/system-backup-d-deployment.mjs --input <正式公开输入.json> --output <新的清单.json>
```

第一条退出 2，列出缺项和运行顺序；后两条只读取公开组合输入，不读取 Secret、不访问 Kubernetes。参考 `deployments/k8s/system-backup-registration.template.json`，目标 namespace 默认为 `clawmanager-zhanghui08-system`。空值必须用正式交付填入，空模板不能通过预检；不使用测试 fixture 作为部署输入。

预检检查：摘要固定的镜像、当前源码 catalog、runtime/bootstrap 数据库和 installation 一致、固定绝对挂载路径、HTTPS endpoint 无内嵌凭据、三种数据库凭据分别引用、全部九类 registry projection，以及 runtime 三项 registry pin 确实有对应路径。registry 项路径是 `kind/version/sha256.json`，nonce 项路径是 `identity_hash/version`，不能用平铺 ConfigMap/Secret 代替。

成功输出 ServiceAccount、两份 immutable ConfigMap、两个 Job、HTTPS Deployment 和 ClusterIP Service。runtime/bootstrap 原始 JSON 字节与进程参数/env 中的 SHA-256 一致；不向该 ServiceAccount 赋 Kubernetes API 权限。挂载只读，容器 non-root、只读根文件系统、drop ALL capabilities。初始 Job suspend=true、HTTP replicas=0，用于按顺序部署；生成不代表输入资源已存在或 provider admission 通过。

外部挂载内容由正式交付提供：

| 引用 | 必需内容 |
| --- | --- |
| runtime credentials Secret | `dsn`、`provider-token`、`strong-token`、`jwt`、`totp-key`、`s3-access-key`、`s3-secret-key` |
| bootstrap / migration credentials Secret | 各自独立的 `dsn`，按该阶段最小权限配置 |
| TLS Secret | `tls.crt`、`tls.key`，SAN 与实际访问地址一致 |
| CA ConfigMap | `transit.crt`、`s3.crt` |
| bootstrap data ConfigMap | `config.json`、`grant.json`，摘要与 bootstrap 描述一致 |
| registries ConfigMap / nonce Secret | 显式 `registry_items` / `nonce_items` 映射；内容和版本由 owner 提供 |
| capacity PVC | `report.json`；可信采集器在真实 MySQL 数据卷旁更新，报告必须新鲜且 server UUID/库名匹配 |

capacity 不能复制一次性静态样例：事务要求 5 秒内报告。PVC 的访问模式、调度拓扑和读写共享必须与采集器匹配；HTTP 组合工具不创建采集器或填健康值。后续 D 第二项已补独立的 [容量采集器部署模板与只读现场预检](system-backup-d-capacity-deployment-20260929.md)，生成的 collector 初始仍为 0 副本，现场接线尚未验收。runtime probes 不替代这种准入。

运行顺序：核对实际数据库 UUID/库名与镜像内 `system-backup-migrate --catalog-only` → 运行固定 catalog 的 migration Job → 用同镜像 `system-backup-bootstrap --requirements`、`--check` 确认 adapter/输入 → 运行 bootstrap Job 写入 disabled v1 → 启动 HTTP → `--check-activation` readiness → 管理员本人 MFA → 已评审配置 mutation/激活流程。Job 自动重试为 0，提交结果不明时只允许相同目标与幂等键重试。两个 Job 不能同时解除暂停。

readiness 使用现有 `--check-activation`，验证的是 registration runtime 与 active config 一致，不代表完整 provider admission 或 backup enabled。liveness/startup 只探测 TLS listener 端口，避免外部服务故障触发无意义的容器重启。

回滚前检查目标 namespace、installation、数据库 UUID/库名、镜像 digest 与 runtime/config pins。可停止 HTTP 并恢复已验证匹配 active config 的旧镜像与 immutable runtime ConfigMap；不删除表、回退 migration ledger、直接改 active config 指针或删除共享 Secret/PVC。若旧 runtime 与当前 active config 不匹配，保持不就绪，按正式 config rollback 流程处理。core logout hook 和本人 MFA 仍是实际验收前置。

## 本地验证

统一离线入口：`scripts/system-backup-d-independent-validation.ps1`。设置 GOPROXY/GOSUMDB=off、GOTOOLCHAIN=local、readonly modules，测试 Go controller/DTO/db/cmd，构建 Linux controller；自有缓存和二进制在 finally 中按绝对路径校验后删除。Node 测试仅使用内存 fixture。

最终测试结果和范围见 `docs/evidence/system-backup-d-independent-local-20260929.json`。没有执行 Docker 镜像构建、前端完整构建或远端 smoke；未安装依赖。

本轮结果：96 项 Node 测试通过；controller、db、controller command 的 Go 测试和默认 vet 通过，DTO 包编译通过。本地 shell 模拟通过两轮正常撤权/恢复，并拒绝 namespace 变化、容器重启和容器替换。Linux controller 交叉构建首次遭遇 Windows 编译器启动错误 `0xc0000043`，随后用 `-BuildOnly` 单独串行复验，退出 0；没有重复运行已通过的 Go 测试。各轮自有构建目录均由 finally 清理，最终剩余 0。

`-BuildOnly` 用于只复验 Linux 构建。runner 的 Go telemetry mode 位于自有临时目录并设为 off，不修改用户全局设置。证据保存初次失败与重试结果，不把这些检查解释为真实集群或镜像发布验收。
