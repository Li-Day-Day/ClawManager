# D 离线初始化接入与 owner 边界（2026-09-28）

本轮交付 D 的部署文件加载、初始化调用入口和集成拒绝路径。**完整生产准入仍阻断；未部署服务、未执行本人 MFA、未修改实际配置。** 本轮没有实现或批准 A/B/C 的 adapter、业务 registry、typed-ref 映射或配置安全 API。

## 分工与交付边界

按主计划第 16 节：

| 责任方 | 本轮保留的交付边界 |
| --- | --- |
| D | 加载固定摘要的部署包；绑定安装 ID、数据库 UUID/库名、配置摘要和离线授权；接入已有 bootstrap 原子事务；在 owner 缺失时拒绝；提供本地验证与镜像构建入口。 |
| A | 权限配置 API、strong-auth/nonce、安全策略、Secret/KEK/签名、evidence 和 provider-proof 安全。D 复用已有接口，不另写其安全策略或代签批准。 |
| B | relay、workload/source-writer、runner/staging/restore 等实际能力及对应输入。D 不填造 relay 或 writer 映射。 |
| C | Redis/object、artifact/S3、finalizer、catalog/scan 等实际能力及对应输入。D 不把实验室 endpoint 自动认定为正式 capability。 |

九类 registry 和二十类 reference 的 adapter 接收点已经接通；具体实现仍须由相应 owner 交付并评审。组合 registry 的分项也由其 owner 提供，未分配部分不会自动归 D。当前 `linkedOwnerAdapters()` 显式为空，因此真实 CLI 报告 30 个缺失检查（9 registry + 20 reference + 1 跨资源策略），不会以 no-op 函数补齐。这个数量指未接入的检查，不表示缺少 30 个基础设施服务。实际 Windows 二进制的退出码为 2，原始脱敏输出见 [编译后接入缺项](evidence/system-backup-d-bootstrap-requirements-20260928.json)。

## D 的可执行入口

新增 `backend/cmd/system-backup-bootstrap`，与 HTTP listener 分离；两套 Dockerfile 均已纳入该二进制，但本轮不构建或推送镜像。

| 模式 | 行为与退出码 |
| --- | --- |
| `--requirements` | 不读取部署文件或凭据，列出编译时未接入的 owner adapter。当前退出 2，状态 blocked；没有数据库连接或配置写入。 |
| `--check` | 必须同时提供 `--deployment-file` 和独立的 `--deployment-sha256`。检查部署/配置/授权绑定及 registry 文件完整性；不打开 DSN、nonce、capacity 文件，不调用 provider adapter 或 SQL。缺项退出 2；inputs_checked 仅表示该输入检查完成，不是 provider 准入成功。 |
| `--apply` | 同样要求部署文件与固定摘要；只有全部 adapter 和输入齐全才能先执行 owner 准备，再复查授权和文件，然后读取 DSN 并调用既有 `ConfigBootstrapService.Bootstrap`。成功仅初始化 disabled v1；不执行 migration、不启动 HTTP、不产生本人 MFA，也不打开备份功能。 |

模式必须互斥，不支持绕过检查参数。无效/不匹配输入退出 1，且不输出原始文件、DSN 或 provider 错误。Commit 结果不明退出 3，返回 `commit_unknown` 与必须原键重试的标记；不能重新生成幂等键。一般失败也应保留原目标和原键排查，不据进程失败推断数据库一定未提交。

部署包采用 `system-backup-bootstrap-deployment.v1`，所有字段必填，拒绝大小写别名、未知/重复/null 字段。字段表如下，当前没有用 fixture 生成可执行的环境包：

| 字段 | 来源与绑定 |
| --- | --- |
| `installation_id`、`expected_server_uuid`、`expected_database` | 与独立固定的离线授权完全一致；SQL 事务仍在同一实际连接重验数据库和当前管理员。 |
| `config_file`、`config_sha256` | 完整 ConfigValues 文件及规范化 hash；只能是 disabled v1 的初始化输入，不补默认值。 |
| `grant_file`、`grant_sha256` | 已有 `BootstrapGrantFile` 格式及原始文件 bytes SHA-256；检查有效期，并在检查、准备后和事务授权时重新读取。 |
| `registry_directory` | 按 `kind/version/sha256.json` 读取固定九类 registry；公共文件完整性不替代 owner 语义验证。 |
| `nonce_directory` | 仅供事务按配置中的 identity/version 读取既有 material；D 不生成身份、不推导 secret hash。 |
| `capacity_report_file` | 接入已有数据库侧容量采集与同事务预留实现。 |
| `dsn_file` | 凭据文件路径；完整 owner 准备前不会读取。库名不匹配、multiStatements 或 allowAllFiles 设置会被拒绝；连接使用 UTC 和有界超时。 |

六个文件/目录字段要求绝对路径。文件由部署方以只读、受控权限挂载；摘要不替代文件访问控制。此包不通过 HTTP 接收，不提供运行任意外部命令或从 JSON 自报批准的机制。

## 本地验证

可执行以下完整命令，只使用本机已有依赖，不连接远程：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-d-bootstrap-validation.ps1
```

runner 禁止 Go 依赖下载，使用独立 `.tmp-d-bootstrap-entry-*` 目录并在 finally 中核对绝对路径后清理。它测试安全包和 CLI，实际运行 Windows 二进制的 `--requirements` 并要求退出 2、缺失 30 项且 SQL 未打开，再编译 Linux bootstrap 和 registration 服务。不会清理其他任务的临时目录或既有产物。

新增测试覆盖全部 30 个 owner 检查缺失时禁止打开数据库、只读检查不调用 adapter/读取凭据、三层 hash 与安装/数据库绑定、重复/未知字段、过期/未来授权、owner 错误及准备期间撤销/文件漂移/取消、提交结果未知后的原键重放、已撤销授权拒绝重试，以及 DSN 错库/危险参数。SQL 和 owner 检查使用明确的 synthetic doubles；这些结果不代替真实 MySQL 并发、provider 语义或管理员本人 MFA。

本轮 runner 退出 0：安全包及默认 vet PASS（9.563 秒），新 CLI 测试及默认 vet PASS（1.618 秒），Windows bootstrap 构建和实际 `--requirements` 执行通过，Linux bootstrap/registration 两个构建均 PASS。PowerShell 语法、gofmt 和 diff 空白检查通过。未安装依赖，专用缓存、两个平台的二进制及测试临时文件均已清理，最终 D bootstrap scratch 为 0；其他任务目录未清理。见 [本地验证记录](evidence/system-backup-d-bootstrap-entry-local-20260928.json)。SQL/provider doubles 不代表实际数据库或 owner 能力通过；源码摘要是运行结束时的本地快照，Windows binary SHA-256 不能作为部署镜像 digest。此前已通过的 93 文件远程迁移/HTTP 测试未重复运行。

## 接续条件

D 下一步接收各 owner 的真实内容与可调用 adapter，将审阅过的实现显式接入 `linkedOwnerAdapters()`；通过真实输入完整校验后，再生成绑定 namespace UID、数据库 UUID、镜像 digest、TLS 和运行身份的具体部署包。当前不提供实际 apply/激活命令，因为完整配置、runtime 和 owner 实现仍缺失。

权限配置更新/rollback 的安全 API 由 A 交付，D 只做其控制面集成。管理员本人 MFA 仍由操作者在实际 HTTPS 服务就绪后完成。初始化成功、局部 runtime check 成功或本轮本地测试成功，均不自动解除 P0 门禁。
