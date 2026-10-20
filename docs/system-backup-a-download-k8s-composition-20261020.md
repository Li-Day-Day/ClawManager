# A：下载 SQL 隔离与 Kubernetes 组合

当前状态：[本地回执](evidence/a-download-process-k8s-accepted-20261020-r1.json)接收主入口完整包 14 主/49 含子项、默认 vet、Linux 编译及冻结复查；新增六根/28 项包含独立连接池、凭据别名拒绝、实际 TLS 客户端/服务端和在线 journal 检查。离线组合器 11 项、原 D 组合器 4 项回归通过，真实 CLI 文件生成/拒绝覆盖与清理通过。未安装依赖、连接 Kubernetes/实际 SQL/provider、授予权限或部署资源。

Go 来源 1,433 项，SHA `bbacafe4c886ad01a6862101780b5a3018ce07af4cd742152fe0e633236e10b7`；Node 来源另冻 1,437 项，SHA `8bab0c41906a653a7e243e5dbdfdd71e5f9048ef9b26bd51543997acbf9dc5dc`。两份快照的全部主入口文件集合和字节相同。Linux 二进制 SHA `1cbdabf0f10407514f4758b9852ed829748d880a7b0fb49621ebe0ecaa6d5a57`，已删除；两个源码/缓存 owner 和探索性 CLI 临时目录均独立确认不存在。此回执覆盖本次主入口及组合器，不扩为整个业务包或生产验收。

## 两个 SQL 账号

启用 `--download-runtime` 时，主进程分别读取既有 `SYSTEM_BACKUP_REGISTRATION_DSN_FILE` 和新增 `SYSTEM_BACKUP_DOWNLOAD_DSN_FILE`。下载使用自己的连接池；注册/TOTP API 保持原连接池。两个凭据文件不能是同一文件或硬链接，用户名必须不同且非空、非 root；库名必须一致，多语句连接被拒绝。下载启动仍对照实际 server UUID、数据库、CURRENT_USER/CURRENT_ROLE 与固定的完整 SHOW GRANTS。

两套 authority 共享安装/数据库事实和既有 JWT、RBAC、材料、owner 来源。MFA 目标继续借用注册 API 的原事务，按数据库 UUID/库名核对逻辑范围；实际下载准入/结果事务由下载池执行。没有把注册写权限添加到下载闭集，也没有从下载池回退到注册池。两个实际账号的权限、全部引用列可见性和跨账号实际 MFA/下载仍需现场验证。

## readiness 使用现有进程

现有进程提供 `/internal/system-backup-download/ready`：仅接受无 body/query 的 HTTPS GET，检查自己已经打开的 journal，并以 204 与部署文件 SHA header 返回状态。此 HTTP 入口不查询 SQL、不装载材料、不签发 proof、不打开第二个 journal。

受信任的 exec 探针先运行已有 `--check-activation`，包括原有会回滚的容量预留检查，再以 `--check-live-url` 和 `--probe-server-name` 请求现有进程。URL 仅接受固定路径的 HTTPS `127.0.0.1`/`::1` 与明确端口；禁用代理和重定向。客户端使用挂载的服务器证书链和明确的证书名称做正常 TLS 验证，核对当前进程返回的准确部署 SHA。它不接收 `--download-runtime`，也不读取下载 DSN 内容、构造下载 authority 或打开 journal。

配置/SQL 检查及 journal 健康只是 readiness 的本地范围，provider admission、人员 MFA 与真实材料证明继续是独立门禁。

## 离线清单

[组合器](../scripts/system-backup-a-download-deployment.mjs)复用 D 的原部署生成器，保留暂停的 migration/bootstrap Job、零副本 Deployment 和 Recreate 策略。新增挂载如下：

| 挂载 | 来源与用途 | 模式 |
| --- | --- | --- |
| `/run/system-backup/download` | 不可变 ConfigMap，包含准确 SHA 对应的 runtime.json/grants.json | 只读 |
| `/run/system-backup/download-credentials` | 与其余凭据 Secret 分离，只投影 dsn 一键 | 只读 |
| `/run/system-backup/download-journal` | 预置的独立持久卷与 failure.jsonl | 唯一可写挂载 |
| `/run/system-backup/download-oidc` | S3 与每个 Transit 映射显式投影各自 audience 的 token | 只读 |

不生成 Secret、PVC、Role 或 journal 文件；默认 ServiceAccount token 自动挂载保持关闭。Transit 支持最多 128 个历史 key 映射，保留独立 key/role/policy 和投影路径；原 authority、材料与审计保留期限逐字节保留，不以当前时间补 TTL。CA 文件必须位于已有 CA ConfigMap 的平面键路径，同路径的 SHA 必须一致；实际 CA 字节与 OIDC/provider ACL 尚未读取或验证。

下载 SQL pins 只接收候选闭集内的准确 grants，检查所有任务表的必需读取权限。期望语句来自操作者的实际记录；生成器不会执行或批准它们。公共 JSON 拒绝重复键、未知字段、无效 UTF-8、孤立 surrogate 和不安全挂载路径。输出以独占创建方式写入，已有文件不会覆盖。

### journal 卷仍需现场验收

清单要求 journal PVC 与容量 PVC 名称不同，并声明需使用 ReadWriteOncePod；这些离线名称和注解不证明两个 PVC 的物理来源不同，也不证明实际单写者约束已成立。应核对 PVC/PV/CSI、控制器副本与挂载后权限，并验证独立预留空间。

Pod 沿用 UID/GID/fsGroup 65532，并请求 `fsGroupChangePolicy: OnRootMismatch`。该字段依赖卷根目录的实际所有权/权限；支持 `VOLUME_MOUNT_GROUP` 的 CSI 驱动会自行处理 fsGroup，字段不一定生效。因此必须检查真实 Pod 挂载后的 journal 所有者及 `0600`/`0640` 模式，不能据清单字段放行。[Kubernetes 官方权限说明](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/#configure-volume-permission-and-ownership-change-policy-for-pods)

## 准备公共输入与渲染

[空模板](../deployments/k8s/system-backup-download-k8s.template.json)没有真实身份、材料或授权，故意不可运行。只在补齐原始事实、测量预算、实际 grants 和资源引用后渲染；凭据内容不放进此公共 JSON。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$composeRun = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$composeInput = "docs/evidence/a-download-public-$composeRun.json"
$composeManifest = "docs/evidence/a-download-manifest-$composeRun.json"
node .\scripts\system-backup-a-download-deployment.mjs --template --output $composeInput
# 编辑 $composeInput，填写已核对的公共部署输入；上述空模板不能通过下一条。
node .\scripts\system-backup-a-download-deployment.mjs --input $composeInput --output $composeManifest
```

生成报告仍明确 `production_approval=false`、实际 storage/OIDC/账号未验收；清单保持零副本与暂停 Job。实际镜像必须包含新命令及匹配的 catalog。SQL task owner 十一项、正式共享 schema/角色批准、真实材料/容量/存储、本人 MFA、provider 与恢复矩阵 E2E 均继续。

## 失败记录

首次未冻结的 Node 探索检查，十项内存检查通过，CLI 因本机子进程 `spawnSync EPERM` 未执行，临时目录已删除；该结果不计为通过。完整冻结门禁在允许子进程执行的本地环境重跑，十一项全部通过。源码捕获第一次检测到并行变化，只丢弃准确的部分副本后在第二次捕获成功，没有重复执行构建或外部动作。最终 Go/Node 两进程退出 0，源码 postcheck 与全部本轮产物清理齐全。
