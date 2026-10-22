# 测试 namespace 的真实页面与服务接线

目标固定为 `clawmanager-zhanghui08-system`，UID 为 `337cfe30-2c17-4b8e-b32a-760778b8098e`。现场操作由用户执行；本轮不再登录测试机，也没有修改集群、数据库或安装依赖。

## 用户提供的现场结果

2026-10-21 的只读输出确认应用 Deployment 为 `clawmanager-app`，镜像 tag 为 `backup-test-zh-fix18`，页面 Service 为 `clawmanager-frontend`，HTTPS NodePort 为 `32643`；该 namespace 的查询结果没有 Ingress。`clawmanager-gateway` 的端口为 `9001`。

四项读取条件均未配置：`LIVE_READ=false`、`SESSION_RECORDER=false`、`READ_PINS=missing`、`CURSOR_KEY=missing`。这说明当前运行应用不能展示新的真实读取结果，不能把 Deployment Ready 当成系统备份链路可用。

另见 A 的[定向状态核对](evidence/a-live-chain-state-review-20261021.json)：安装和 config 为零行，现场 bootstrap 缺 30 个适配器，旧注册二进制未显示下载参数，迁移账本与当前源码也有待核对的差异。本轮不执行初始化 SQL、迁移或整体镜像更新。A 本地正在补 RBAC 适配器，其余资源仍须提供真实接线。

## 本轮完成的容器接线

根 Dockerfile 增加两个构建参数，默认均为 `0`，仅接受 `0/1`：

```text
VITE_SYSTEM_BACKUP_LIVE_READ=1
VITE_SYSTEM_BACKUP_EVIDENCE_DOWNLOAD=1
```

它们在 Vite 构建时生效。在 Deployment 中添加同名运行环境变量不会改变已经编译的页面。没有执行 Docker 构建或安装依赖；前一轮已使用现有依赖验证过前端生产构建。

`start.sh` 在启动主 API 和 Nginx 前生成专用 locations 文件，并执行 `nginx -t`。生成失败或 Nginx 配置无效时容器启动失败。只有以下两个路径使用独立下载运行时：

```text
POST /api/v1/admin/system-backup-strong-auth/proof
GET  /api/v1/admin/system-backup-evidence/{id}
```

任务列表、事件、Operation 及登录继续走主 API。默认专用路径返回带 `no-store` 的 503，不把密码或 proof 转发给没有下载能力的主 API。

独立服务、证书和 CA 已实际就绪后，在应用容器中设置以下运行变量，并将真实 CA 只读挂载到指定路径：

| 变量 | 必须来自的真实配置 |
| --- | --- |
| `SYSTEM_BACKUP_DOWNLOAD_PROXY_ENABLED` | 显式 `true`；默认 `false` |
| `SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST` | 下载 Service 的 DNS 名称，不含协议、路径或端口 |
| `SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT` | Service HTTPS 端口，默认 `9443` |
| `SYSTEM_BACKUP_DOWNLOAD_PROXY_SERVER_NAME` | 下载服务证书中实际匹配的名称，用于 SNI 和证书校验 |
| `SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE` | 应用容器内可读、非空的绝对 CA 文件路径 |

现有下载部署生成器约定 Service 为 `system-backup-registration:9443`；用户现场列表中尚不存在这个 Service，不据此声称它已经部署。代理通过现有集群 resolver 在请求时解析该 Service，避免暂缺下载 Service 使整个主应用无法启动。

代理使用 HTTPS 并强制校验证书链及名称，不提供关闭验证的开关。保留请求 URI、Authorization、Idempotency-Key 和 proof；传递正文与 ETag、长度、附件名称、Operation ID 等响应头。关闭压缩、代理重试、缓存、正文临时文件和重定向改写，保留上游错误状态；所有响应强制 `no-store`。沿用主站不记录 query 的访问日志。普通 API 的反向代理保持原有规则。

## 启用顺序与当前阻塞

1. A 完成真实 bootstrap owner 接线并核对现场 schema，建立受审的安装与有效配置。不得用空配置、假批准或跳过 authorizer 代替。
2. 为主 API 配置同一安装的 session recorder、读取 pins、固定摘要 RBAC registry 和独立游标密钥，再启用 live read。session recorder 只登记实际登录／刷新产生的 token，因此启用后需要重新登录。
3. 先验证四类列表、任务事件、Operation 列表／详情；空记录必须来自授权成功后的真实查询。503 不是空列表。后续增量已接入一类[校验记录详情](system-backup-d-verification-detail-20261021.md)，其字段来自保存的历史校验投影和登记报告引用；其他三类详情仍未就绪。
4. A 部署可用的独立下载运行时及其 SQL、provider、个人 MFA、journal 卷与容量，再打开同源下载代理。CA 和证书名称必须取自该服务的真实配置。
5. 在同一 HTTPS 页面完成证据选择、proof、下载及保存，并按 A 的工具核对同一个 Operation 的最终审计。

步骤 1 当前阻止真实读取的正向验证；独立下载运行时也尚不存在。本轮完成的是可供镜像使用的容器接线，现场列表／事件／Operation／下载均未验收成功。不要只执行 `kubectl set env ...=true` 就更新正在运行的实例。当前迁移差异尚未核对，不提供全仓新镜像的直接 rollout 命令。

新接线镜像及上述配置真正部署后，由用户在测试机执行以下只读检查；当前旧镜像不存在新生成文件，因此不要求现在执行：

```bash
ns=clawmanager-zhanghui08-system
test "$(kubectl get ns "$ns" -o jsonpath='{.metadata.uid}')" = \
  "337cfe30-2c17-4b8e-b32a-760778b8098e" || exit 1
kubectl -n "$ns" exec deploy/clawmanager-app -c clawmanager-app -- nginx -t
kubectl -n "$ns" exec deploy/clawmanager-app -c clawmanager-app -- \
  cat /etc/nginx/system-backup-download.locations.conf
```

该输出只核对路由装配和 Nginx 语法，不能代替真实 TLS、权限和下载审计验证。运行时开关回退为 `false` 会关闭这两个下载入口；若需要恢复整个旧代理行为，应回滚到变更前的配置／镜像。

## 本地验证和清理

`node --test --test-isolation=none scripts/system-backup-download-proxy.test.mjs`：25 项通过，零失败／跳过。使用现有 Git POSIX shell 实际运行生成器，覆盖默认 503、启用后两条路由、TLS 指令、原 URI、无代理重试及错误配置注入／缺参／端口／CA 文件等拒绝边界。

`node --test --test-isolation=none frontend/scripts/system-backups-evidence-download.test.mjs`：原有 37 项下载回归通过，零失败／跳过。本轮没有改动前端、后端和数据库契约。

首次测试被沙箱阻止启动 shell；改用现有 Git `sh.exe` 后，Windows 子进程未带 Git 工具 PATH 导致 `awk/cat` 不可用。测试仅在子 shell 中补充已有工具路径后全部通过，没有安装依赖。中断轮准确临时目录已守卫删除，最终轮由清理钩子删除全部夹具。没有留下测试 CA、构建目录或运行服务。

本机没有运行 Nginx／Docker，故尚未实际执行新配置的 `nginx -t`、镜像构建或上游 TLS 请求；启动时的 `nginx -t` 和上述现场命令负责下一阶段解析检查。
