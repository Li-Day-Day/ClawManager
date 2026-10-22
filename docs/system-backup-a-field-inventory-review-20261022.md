# A：10 月 22 日现场公共盘点复核

结论：盘点成功，实际权限、原材料、容量和运行卷的完整采集仍缺运行前提。本轮不是测试失败，也没有完成生产验收。无需重跑角色十项、D GC 十八项或同一份公共盘点。

[操作者原回执](evidence/a-field-public-inventory-20261022-085642-cb639159.json)的原始字节 SHA-256 为 `07a599af6c63e4bd02105dae0f7592997580f811928127a83367a9253fba9e8d`。原 Python 脚本及实际 LF payload 摘要均为 `d02c03c1b840bc6c0244aba17ecf93f4c39602b411e5a89232fb2d77c388c35e`，与本地已验证脚本一致，SSH 退出 0。namespace 前后 UID 均为 `337cfe30-2c17-4b8e-b32a-760778b8098e`。独立复核未重新连接服务器。

已生成[限定观察记录](evidence/a-field-public-inventory-reviewed-20261022.json)和[可复用的公共引用](evidence/a-field-observed-references-20261022.json)。后者只保存观测引用，不是可以执行的完整 field plan；没有自动填写 SQL 账号、DSN、socket 路径、有效期、预算或新镜像。

| 项目 | 本轮证据 | 对下一步的影响 |
| --- | --- | --- |
| 范围 | 同一 namespace 的 9 个 Pod、9 个容器、5 个 PVC；所有 PVC/PV 的 claim UID 对应 | 仅证明该轮公共引用，不证明跨资源原子快照或其他 namespace/Deployment/Job 的状态。 |
| 主应用镜像 | `backup-test-zh-fix18`，实际 imageID 仍为 `clawmanager@sha256:c16f07c25c6dc8362aa09b7a1e81f5d1204f2812ae542bbcb21a3946975c6c9d`，与原观察一致 | 未执行实际二进制检查，不据此认定新 inspector/生产装配已部署。 |
| 运行身份引用 | 9 个容器的显式 `env` 中没有三个受支持的 DSN 变量引用 | registration/download/collector 的真实连接仍未取得。未采 `envFrom` 和进程环境，不能将“显式引用未观测到”升级为“任何 DSN 配置均不存在”。 |
| MySQL 数据 | `mysql-66496b8965-d6tsl` / UID `dab1cbf6-ca49-4e16-bd2d-27e70da52004`，节点 `k8s-master`；`/var/lib/mysql` 声明挂载 `mysql-data` PVC | MySQL Pod、PVC、PV 引用可以复用。该挂载属于 MySQL 写进程，不是 collector 只读挂载；本轮未查询 SQL identity/datadir。 |
| 容量报告 | `system-backup-capacity-report`，PVC UID `d9452769-2406-4437-8dab-775f2de7bf13`；PV UID `85c6c189-a646-4031-8e59-de26f8a45ed6`；Bound / RWX / 声明 16Mi | 该轮没有 Pod 挂载这个 PVC；不能提供 collector 原报告、实际 Unix 权限或五秒容量证据。 |
| journal | 没有 RWOP PVC，也没有 `/run/system-backup/download-journal` 容器挂载 | 尚无符合当前验收要求的 journal 运行卷证据；不能挪用容量报告 PVC 充当 journal。 |
| 材料与容量 | 本轮不查询 SQL、不读容器文件或原授权材料 | 原材料摘要/期限、真实 SQL 用户/grants、statfs、预算、物理预留、原子可见性和 fencing 均未补齐。PVC 的 5Gi/16Mi 等是声明容量，不是实测余量。 |

## 下一步顺序

补充：[部署前准备](system-backup-a-field-deployment-preparation-20261022.md)已修正两份空模板的旧目录摘要并通过 15 项原组合器检查。已有 bootstrap 交接的 27 个具体准入槽位仍缺实现/原材料，需与受审镜像一起准备；“准备新镜像”不代表仅换镜像即可完成运行前提。

1. 准备带受审 inspector/运行装配的目标镜像和原 runtime/bootstrap/material 输入。镜像须有自己的来源、digest 和二进制摘要；本地构建成功不等于已部署，旧 fix18 镜像也不能替代新证明。原 config=0、安装未配置和 bootstrap 缺适配器是 10 月 21 日 SQL/能力观察，本轮未重查或关闭这些问题。
2. 以真实已有授权和原材料装配 registration/download/collector 的独立连接，保留原 DSN 引用；collector 在 MySQL 同节点挂载 data 为只读、report 为可写。补独立 journal 卷及实际权限/预算/单写者证据。不能为通过采集而捏造账号、复制新凭据、创建假 config 或续造旧授权期限。
3. 用本轮公共引用补[完整采集计划](evidence/a-field-evidence-plan-20261021.json)，缺项准备好后按[统一交接](system-backup-a-field-evidence-handoff-20261021.md)执行一次完整采集和离线复核。正式角色批准、物理预留/隔离、跨 Pod 原子可见性/fencing、人员 MFA/provider 和恢复 E2E 仍分别需要实际证据。

这三步中的部署/授权材料目前不在回执内，不能仅凭公共盘点生成可启用的生产部署。先完成受审部署前提，再做完整采集；不要求操作者凭记忆填写 Pod/PVC UID，也不要求再次运行已接收专项。

复核命令（只读本地文件，不重新盘点）：

```powershell
node .\docs\evidence\a-field-public-inventory-review-20261022.mjs --check
```

状态为 `PUBLIC_INVENTORY_REVIEWED_FIELD_PREREQUISITES_MISSING`；`complete_field_acceptance=false`、`production_approved=false`。所有原始回执完整保留，本轮未安装依赖、生成测试构建产物、部署资源或改变数据库。
