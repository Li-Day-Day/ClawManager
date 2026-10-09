# D 独立数据库验证

本指南覆盖 D 的 migration exclusion、claim、gate、mutation lease 和 controller 数据库连接，不依赖 A/B/C 的 provider、participant 或备份任务实现。**fix15 migration/controller 隔离冒烟及六组数据库原语探针均已通过。** 两种验证范围不能互相替代，也不代表完整备份链路或P0验收。

2026-09-23操作者回传六组探针6/6通过，总耗时17.26秒，`d_probe_image_exit=0`。实测MySQL为8.4.8，92个migration文件名精确匹配，catalog为 `0dcb3f38ce14165504335c715bf03533e95c9d3992146769fc21dab6c59d00dd`；请求镜像和runtime imageID均为dprobe1 digest `sha256:c7cd64007531be8c29948f1bcc3f9778faf4d185fab35367cfd3977a54cf4e94`。临时namespace `sbk-mig-260923071854-23cf` 按UID `6e42e57c-ec4e-482d-8de0-2a63d6950ef3`清理，两端脚本目录报告清理。完整记录及限制见 [六组数据库探针结果](evidence/system-backup-d-database-invariants-20260923.json)。`unexpected EOF`出现在主动KILL CONNECTION的断连用例中，后续重获锁与用例均通过；本轮SSH关闭提示同样无需单独重跑。

本轮最初四项D独立工作已核对：①三个冒烟入口共用controller count/hash且fix15远程重放/就绪检查通过；②真实MySQL迁移与gate互斥、DDL/断连/不确定释放的锁行为通过；③多连接UTC、双安装隔离、真实15秒claim过期接管及旧token受保护写入拒绝通过；④candidate接收器的篡改/绑定漂移/批准边界回归通过，接收当前95表候选仍输出未批准。后续A/B/C交叉签收、schema evidence登记、真实备份/恢复和跨部署矩阵验收仍保持未完成。

2026-09-23 本地结果：`db`、`migrationcoord`、`systembackupcontroller`、`migrationcatalog` 四个 Go 包测试通过，Linux amd64 集成探针编译成功，PowerShell解析和diff检查通过。Node回归共102项通过（candidate接收5、合同检查6、SSH采集7、合同产物70、schema采集4、schema hash6、Shell合同3、执行前拒绝1）。本轮构建目录和专用缓存已删除，未安装依赖，未运行远程命令。最初完整包测试暴露的两处陈旧断言已修正：migration 068按六条CREATE语句判定新增DDL，不再把 `detail_truncated` 当作TRUNCATE；四套官方安装的默认镜像检查追踪embedded INSERT，并拒绝恢复重复init seed。

## 验证范围

探针直接调用生产代码，入口是 `backend/internal/db/d_invariants_integration_test.go`，通过 `systembackup_integration` build tag 启用。它不进入常规单元测试，也不会在缺少隔离运行身份时跳过后返回成功。

| 检查 | 判据 |
| --- | --- |
| 连接池 UTC | 临时 MySQL 的 global time_zone 为 +08:00；同时占用四条不同物理连接，逐条核对 session +00:00、数据库时差0、Go解码UTC。 |
| migration advisory lock | 在持锁连接执行真实DDL后仍拒绝另一连接抢锁；杀死该连接后可重新获得同名锁。 |
| 不确定释放 | 主动丢失锁所有权、取消释放上下文两种故障均必须报错、销毁物理连接且不遗留锁。 |
| migration/gate 互斥 | migration锁阻断生产GateCoordinator；gate acquiring后，让最后一个migration登记暂时缺失，真实migration runner必须在执行该migration前拒绝，随后恢复登记。中止gate后idle检查通过。 |
| claim 接管及安装隔离 | 两个并发执行者对同一operation只有一个成功；另一installation无法获取、续约、释放；真实15秒租约过期后接管，旧owner不能续约或释放新claim。 |
| 受保护写事务 | 正常写入提交；callback报错回滚；另一installation、旧row version和已释放lease均不能写入。 |

claim用例使用 `control_metadata_gc` 的合成operation记录，仅调用claim原语，不执行GC。该结果不能扩展为四类备份任务的完整状态转换或外部动作接管已验收。受保护写入只修改临时探针表。没有伪造B的hold/recovery证明，未测试acquiring→held。

## 本机执行

### 专用探针镜像复现入口（本轮已完成）

构建入口为仓库根目录的 `Dockerfile.system-backup-d-probe`，构建上下文为仓库根目录，平台为 `linux/amd64`。可使用独立tag，例如 `10.130.14.23:5000/clawmanager:backup-test-zh-dprobe1`；不要覆盖已通过冒烟的fix15。该Dockerfile在Linux builder内编译tagged Go测试，最终scratch镜像只包含 `/d-invariants.test`，以非root用户运行；它不继承普通业务镜像的server/nginx入口。构建由操作者执行，助手未执行Docker构建或安装依赖。这里编译测试二进制，不等于六组真实MySQL测试已通过。

需要复现时，使用操作者构建上传后的完整repo@sha256引用执行以下本机PowerShell命令；本机仅上传脚本、经SSH在远程启动测试。同一版本已经通过，无需常规重跑：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$dProbeImage = Read-Host '输入已上传的专用探针镜像完整地址（仓库@sha256:digest）'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-d-fix15-remote.ps1 -SshTarget 'root@10.130.14.23' -ProbeImage $dProbeImage
$dProbeExit = $LASTEXITCODE
Write-Output "d_probe_image_exit=$dProbeExit"
if ($dProbeExit -ne 0) { throw 'D 探针验证或清理失败，请回传上面的输出' }
```

`-ProbeImage`模式只用已验收的fix15重放临时库migration，不重复controller启用/授权漂移阶段。停止临时migration app、核对namespace UID并写入本轮数据库身份标记后，独立probe Pod通过临时MySQL Pod IPv4连接；ServiceAccount token自动挂载关闭、root filesystem只读、无额外capabilities，NetworkPolicy只允许访问本namespace的MySQL 3306。密码仅通过本轮临时Secret注入。探针内部继续核对namespace/UID/server UUID标记与空fixture，之后才执行六组数据库写入测试。终态必须退出0、日志可读且存在runtime imageID，最后由父脚本清理整个临时namespace。

上传的镜像digest可指向多平台manifest index，因此同时记录请求的不可变ref与实际runtime imageID；不把两者字符串相等作为通用条件。该路径的脚本测试使用模拟kubectl，不能代替真实镜像构建、集群准入或MySQL结果。此前Windows `asm.exe`失败入口无需为执行此镜像路径重跑。

### fix15 已构建时：只上传脚本并远程测试

2026-09-23操作者回传本轮通过，`fix15_smoke_exit=0`。92个migration精确重放、专用账号正负测、两副本leader/standby、首次启用、leader接管、同digest重启、kill switch和授权漂移检查全部通过。namespace `sbk-mig-260923065511-33ab`（UID `75d476b7-248c-4b87-b934-a1006cb60fd3`）及两端脚本目录均报告清理。归档见 [fix15隔离冒烟记录](evidence/system-backup-d-fix15-isolated-smoke-20260923.json)。授权恢复步骤包括重启，不证明无需重启自动恢复；也不代表源业务Deployment已更新到fix15。本轮SSH关闭提示不需要单独重跑。

操作者回传的fix15 digest为 `sha256:be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea`。普通业务Dockerfile没有打包 `d-invariants.test`，因此该镜像当前可做migration/controller隔离冒烟，不能宣称六组数据库探针已执行。新增入口沿用本安装仓库 `10.130.14.23:5000/clawmanager`，固定该digest，在临时namespace执行migration重放、专用账号权限正负测、controller启用/leader接管/kill switch/授权漂移验证。源app无需更新到fix15。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-d-fix15-remote.ps1 -SshTarget 'root@10.130.14.23'
$fix15Exit = $LASTEXITCODE
Write-Output "fix15_smoke_exit=$fix15Exit"
if ($fix15Exit -ne 0) { throw 'fix15 远程验证或清理失败，请回传上面的输出' }
```

该入口只打包/上传脚本与migration文件名清单，不运行本机Go编译、Docker构建或服务端编译，不安装依赖。SSH保留严格host key检查，可能多次提示密码。仅本轮临时namespace和脚本目录会被清理；已上传的fix15镜像保留。若镜像实际仓库不同，可通过 `-Image '<实际仓库>@sha256:be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea'` 修改仓库地址，digest仍被固定校验。

### 单独探针路径（此前 Windows 编译失败的入口）

从 Windows PowerShell 运行，无需进入服务器终端。脚本只使用已经安装的 Go、Node、tar、Windows OpenSSH，以及现有 Go 模块缓存；`GOPROXY=off`、`GOTOOLCHAIN=local`、`-mod=readonly` 禁止自动下载或修改依赖。

仅做本地包测试及Linux amd64探针编译：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-d-invariants.ps1
if ($LASTEXITCODE -ne 0) { throw 'D 本地验证失败，请回传错误文字' }
```

执行完整远程验证（密码由SSH交互读取，可能需要输入数次；不写入命令或文件）：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-d-invariants.ps1 -Remote -SshTarget 'root@10.130.14.23' -KubeContext 'kubernetes-admin@kubernetes' -SourceNamespace 'clawmanager-zhanghui08-system' -TestNode 'node1' -ExpectedAppDigest '1ba8cc47f468610e6875117f75fe42ce9fdb15e1cd2e6f877ac8ff2f99e2baa0'
$dProbeExit = $LASTEXITCODE
Write-Output "d_invariants_exit=$dProbeExit"
if ($dProbeExit -ne 0) { throw 'D 数据库验证或清理失败，请回传上面的错误文字' }
```

固定digest来自2026-09-23已验收的fix14记录。当前app digest若已改变，脚本会拒绝；须核对实际发布版本后显式修改参数，不能把预期值自动替换成现场值。SSH严格主机密钥校验保持开启，复用此前已核验的known_hosts。

脚本先在本机运行D包单元测试、编译当前工作树的探针，再上传带SHA-256的最小包。远程只读源namespace的镜像、MySQL版本和init SQL，创建随机 `sbk-mig-*` 临时namespace、emptyDir MySQL以及临时migration app，重放并比对当前migration文件清单。它在停止临时app后才生成合成记录，核对临时namespace UID、运行标记及MySQL server UUID。临时数据库使用单独随机密码；探针通过MySQL Pod内的127.0.0.1连接临时库。不会修改源app、源MySQL设置或生产任务。

## 回传与清理

请回传 `TestDDatabaseInvariants` 六组子测试结果、`PASS d-database-invariants`、`CLEANED namespace=... uid=...`、`CLEANED remote-probe-scratch=yes`、`CLEANED local-probe-build-cache=True` 和 `d_invariants_exit=0`。单有 `LOCAL_PASS` 只代表编译和本地测试成功。

父脚本按本轮namespace UID清理临时集群资源；PowerShell finally清理本轮随机上传目录、本地二进制及专用Go缓存。任一 `CLEANUP_PENDING`、`CLEANUP_SKIPPED` 或清理未验证都不能登记通过，应保留输出中的namespace/UID或临时路径继续核对。SSH关闭警告不能替代子测试、退出码及清理证据。

## 其他 D 工具

冒烟脚本统一从controller的 `ContractMigrationCatalogFileCount/Hash` 读取预期值，避免手写91/92及旧hash漂移。当前schema candidate可重复接收核验：

```powershell
node .\scripts\system-backup-schema-candidate-receipt.mjs --candidate .\docs\evidence\system-backup-d-schema-hash-candidate-20260923T054748Z.json --sha256 b6b39e4ccb8c94b76e3316ef6674532153f406fa665fa150c7f7aa13b3aa8779
if ($LASTEXITCODE -ne 0) { throw 'candidate 校验失败' }
```

SHA-256必须来自可信的独立交接记录。重新计算被修改文件的hash再传入，不能证明文件未被篡改。接收器校验当前SQL/inventory/migration catalog、字段闭集、计数、时间及清理报告，结果始终为candidate_received_not_approved；它不认证安装身份、不重算已删除的原始记录、不注册evidence、不补签A/B/C、不打开冻结门禁。
