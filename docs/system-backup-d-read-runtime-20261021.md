# 真实读取的 UTC 连接池、游标 Secret 与部署装配

继续使用 `clawmanager-zhanghui08-system`。现场结果已经确认四个读取条件未配置；本轮不登录远端，不安装依赖，不代替 A 的有效配置 bootstrap。

## 主 API 的连接池接线

此前主 API 将普通业务数据库连接池直接交给 `SQLLoginSessions` 和真实读取。普通连接池不固定 MySQL `time_zone`，而 session recorder 会比较 `UTC_TIMESTAMP` 与 `CURRENT_TIMESTAMP`，非 UTC 连接会拒绝管理员登录／刷新。

新增 `db.OpenSystemBackupRead`，在启用 `SYSTEM_BACKUP_READ_SESSIONS_ENABLED=true` 时为备份会话和读取打开独立连接池。通过驱动 DSN 对每一条物理连接设置 `loc=UTC`、`time_zone='+00:00'`。它不运行迁移，不替换应用全局 `db.Session`，不改变业务连接池；主 API 的原登录／刷新／登出钩子和 read authorizer 共用该备份连接池。进程结束时关闭它。未启用时不创建额外连接池。

## 游标密钥文件

新增 `SYSTEM_BACKUP_READ_CURSOR_KEY_FILE`，读取挂载 Secret 内准确的 32 个原始字节，不是 64 字符十六进制文本。文件必须为绝对路径、可读普通文件，读取上限 33 字节，缺失／空／过短／超长都保持读取不可用。保留原 `SYSTEM_BACKUP_READ_CURSOR_KEY_HEX` 兼容入口，两种来源同时有值则拒绝，错误不包含路径或密钥。

部署 patch 会将 legacy hex 环境变量显式置空，覆盖可能来自 envFrom 的旧值。生成器不读取 JWT、密码或游标密钥，不在输出中创建 Secret 内容。

## 生成公开部署文件

公共模板：[system-backup-read-k8s.template.json](../deployments/k8s/system-backup-read-k8s.template.json)。namespace／数据库身份来自现有现场回执，仍需在应用前核对；安装、配置版本和 RBAC pins 故意留空。它们必须来自 A 实际建立的活动配置，不能从旧候选文件猜测为 v1。

将真实安装和配置版本、RBAC version/SHA 填入模板副本，准备相同准确字节的公开 RBAC registry 文件后，使用已有 Node：

```powershell
node .\scripts\system-backup-d-read-deployment.mjs `
  --input <已填写的公开配置.json> `
  --rbac <与活动配置摘要一致的registry.json> `
  --output <尚不存在的输出目录>
```

生成 `public.json`、`deployment-patch.json`、`report.json`。公开 ConfigMap 固定原 registry 字节和 pins 摘要，并按 `rbac_bindings/version/sha.json` 投影；patch 同时接入 session recorder、live read、安装／数据库 UUID、pins 和独立 Secret 文件。只按名称合并环境变量／挂载，不更换 image、运行迁移、写入配置或授予权限。后端仍在每次实际读取中校验数据库、活动配置、当前人员会话和 RBAC。

Secret 默认名为 `system-backup-read-cursor`，key 为 `key`，投影权限 `0400`，适用于现有以 root 运行主 API 的容器。若目标应用改为非 root，应单独核对真实 UID/GID 和投影权限，不把文件放宽为可写。独立 Secret 不复用 JWT 或下载凭据。

有效配置、包含本轮功能的已验证镜像和 schema 核对完成后，才可在测试机执行下列装配步骤。当前现场尚不满足这些前提；不要对现有 fix18 直接套用新增文件密钥入口。

```bash
set -euo pipefail
ns=clawmanager-zhanghui08-system
test "$(kubectl get ns "$ns" -o jsonpath='{.metadata.uid}')" = \
  "337cfe30-2c17-4b8e-b32a-760778b8098e"

# 在生成文件所在目录执行；校验对象与 patch，尚不更改工作负载。
kubectl -n "$ns" apply --dry-run=server -f public.json
kubectl -n "$ns" patch deployment clawmanager-app --type=strategic \
  --patch-file deployment-patch.json --dry-run=server -o name

# 首次创建；名字已存在时停止，不覆盖已有密钥。正文不会打印到终端。
openssl rand 32 | kubectl -n "$ns" create secret generic system-backup-read-cursor \
  --from-file=key=/dev/stdin
kubectl -n "$ns" apply -f public.json
kubectl -n "$ns" patch deployment clawmanager-app --type=strategic \
  --patch-file deployment-patch.json
kubectl -n "$ns" rollout status deployment/clawmanager-app --timeout=180s
```

如果配置选择了其他 Secret 名称，创建命令必须使用同名资源。中断后先检查已创建资源，不重复生成／替换同名密钥。切换密钥会使原分页游标失效，需要重启加载；不会改变人员登录 token。

装配后重新登录页面，依次验证四类列表、事件和 Operation。新登录／刷新才会记录备份 session；打开开关之前签发的 token 不会在 GET 时补登记。下载仍使用上一轮独立运行时与同源 HTTPS 代理，不能把读取部署成功当作下载成功。

## 下载代理的部署挂载

独立下载 Service 和运行时就绪后，使用 [system-backup-web-proxy.template.json](../deployments/k8s/system-backup-web-proxy.template.json) 填写证书中实际使用的 `server_name`、实际 CA 文件字节的 `ca_sha256`。默认 Service 为 A 现有生成器约定的 `system-backup-registration:9443`，不是已经部署的声明。

```powershell
node .\scripts\system-backup-d-web-proxy-deployment.mjs `
  --input <已填写的proxy公开配置.json> `
  --ca <服务实际信任根CA.pem> `
  --output <尚不存在的proxy输出目录>
```

该生成器核对 CA 准确字节摘要、PEM 证书格式、CA 标志、当前有效期和重复项，拒绝多余内容。不会获取／签发证书，也不把离线 CA 解析当作上游证书链或主机名已验证。旧 provider-lab CA 的已知过期状态仍须由服务所有者处理，不能从这条链路跳过。

输出同样是 `public.json`、`deployment-patch.json`、`report.json`。不可变 ConfigMap 只包含公开 CA，按只读完整目录挂载到 `/run/system-backup-download-proxy/ca.pem`；patch 同时设置启用开关、同 namespace Service DNS、9443 端口、证书名与 CA 文件路径，并删除旧同名 valueFrom/subPath 绑定，不修改其他业务配置。CA 摘要进入 Pod annotation，使变更触发重启。没有配置跳过 TLS、自动重试、密码、JWT、proof 或下载 DSN。

由用户核对 namespace UID、实际 Service endpoints、下载 readiness 和原始 runtime digest 后，先用上文相同方式执行 server dry-run；确认镜像包含专用 Nginx 生成器，再 apply 这个目录的 public.json 并按战略合并方式 patch。读取和下载的两个 patch 使用不同的资源／volume 名称，可分阶段合并。仍须完成实际页面登录、一次下载和最终 Operation 审计，才能称为现场接通。

## 验证边界

新增 key loader 测试验证单一来源、二进制准确长度、相对路径、缺失文件、目录、坏 hex 和错误脱敏。驱动 DSN 单元测试验证 UTC 参数没有在 upper/db 编码过程中丢失。

实际 MySQL 检查已加入既有隔离 `TestDDatabaseInvariants`：先验证 namespace/数据库 marker 和故意设置的 `+08:00` server default，再打开业务池与独立读取池；四条同时占用的物理读取连接必须为 UTC，业务池仍为 `+08:00`，全局 Session 不变。该探针只能由已有 fresh-namespace 验证链运行，不在用户现有业务数据库中造测试行或修改全局时区。

读取部署生成器 22 项、下载代理挂载生成器 15 项 Node 回归已通过，覆盖模板不可直接运行、pins/registry/Secret 挂载、轮换、安装/版本错配、同源 HTTPS 代理装配以及 CA 摘要／有效期／内容拒绝。没有安装依赖或留下测试产物。

完整读取包和主 API 包已在冻结快照 `2a5c1cb5411b4e55bed2505b5cf3f007` 的原生执行中通过（分别为 7.155s、5.742s，默认 vet 保留）。同轮 DB 包失败，因此整轮回执仍为 failed：旧迁移测试把目录最后一项当成 080，新增加的 081 使夹具偏离原场景；验证快照也遗漏了 DB 测试需要的 Nginx `.conf`／`.js` 文件。现已明确选择 080 并补齐输入，不修改 081 或实际迁移行为。

后续 `c30be0571ffd40a8ba0dccd43835688b` 未取得冻结源码摘要，未进入测试；回执为 failed、清理为 true，不能视为 DB 测试失败或通过。验证入口现记录阶段、错误和失败输出尾部，继续离线运行完整 DB 包、Linux 主 API 构建及两个隔离探针编译。读取包／主 API 的生产源码与已通过快照仍相同；同期其他对话新增／修改的 evidence 包测试不属于它们的依赖测试。最终本地范围以新回执为准。实际 MySQL、部署和授权 HTTP 尚未完成。

2026-10-22 的 `dcaa48cc072b4c0b87abd9ac73c6fa94` 已通过完整 DB 包及默认 vet（73 个根测试通过，原生 footer 3.929s），也通过完整 Linux 主 API 构建。随后发现主构建使用 `-trimpath`，探针未使用，导致探针重新编译依赖；保存本轮自有缓存后主动停止该探针。该原始回执因此保留 failed/mysql-probe-build/exit -1，但 `windows_tests`、`linux_server_build`、`cleanup_verified` 都为 true，不属于产品断言失败。入口已为两个探针统一添加 `-trimpath -buildvcs=false`，使用自有检查点重跑相同范围；未删减测试或关闭 vet。新轮结束时一并删除新轮产物及该缓存检查点。

最终[本地回执](evidence/d-read-runtime-local-0da6a5c1b59145eea3f002368a80ddb7.json)为 `local_runtime_tests_and_linux_build_passed_live_mysql_pending`，入口退出 0：完整 DB 包及默认 vet 再次通过（6.814s），Linux 主 API、`systembackup_integration` DB 探针和 `systembackup_mysql` HTTP 探针全部编译通过。1300 项冻结输入摘要为 `53aa39273c2dd66fdd918add967983ad8bd7af96496aaa751ce3f3bd9d59fe0a`；回执 SHA256 为 `1978783c6948e25d47ef9cc3d0134c5fe272b947d3b047944efde77ec879edc4`。本轮 `packages` 仅列 DB 包；读取包和主 API 的完整测试结果对应前述 2a5 快照，不将它们伪称为本轮重跑。探针仅编译，没有执行真实 MySQL。

独立核对确认本轮 `.tmp-d-index-cache-0da6a5c1b59145eea3f002368a80ddb7` 和自有 `.tmp-d-read-cache-seed-bf2583195c224908ba78020dab93e335` 均已不存在；回执的两项 cleanup 均为 true。未安装依赖，未联系远端。本轮冻结集合中的生产输入与当前目录一致；共享目录同期只有 audit-collect 和 business-a 包的两个既有测试变化、两个新增 business-a 测试，不属于本轮执行包或其依赖测试，未借本轮验收它们。公开读取／代理装配的 37 项及前端详情／下载 55 项回执的全部源码 pins 仍匹配。

旧容器接线回执的 Dockerfile pin 已变更：另一项工作新增了 audit-collect 二进制的 build/COPY。复核确认本轮两个前端 ARG、其校验与代理脚本 COPY 保持原接线；未构建或部署整个镜像，不据此验收新增二进制。旧回执保留原摘要，记录文档后续变更也不回写为旧轮结果。

## 尚未通过的现场要求

本地实现已包含四类列表、事件、Operation、一类校验记录详情及登记报告的下载入口；现场正向读取、实际页面记录展示、一次真实报告下载和同一 Operation 的最终审计仍未验证。最近操作者回传仍为 live read／session recorder 关闭、pins 和游标密钥缺失；A 的盘点还缺有效配置、独立下载运行时及 journal。当前 bootstrap 只装配 RBAC 和两类 issuer registry 校验器，剩余 27 项实际资源接线／交接材料未补齐，不能从模板或本地夹具推导为就绪。

这一资源前提已连续多轮未变化。本地可独立完成的验证及清理现已收口，继续需要 B/C 的真实资源交接文档或适配器路径，以及操作者按现有装配步骤返回的现场结果；不要发送密码、token 或私钥。按用户要求，本对话不登录服务器。目标保持未完成，等待上述材料后再生成带真实安装／版本 pins 的部署文件和可执行的启用、页面及下载验证命令。
