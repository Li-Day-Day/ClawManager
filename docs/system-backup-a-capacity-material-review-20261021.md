# A：容量材料离线预检与精确时间边界

本项独立于另一 A 对话的 owner／角色实际 SQL 接收和 081 普通来源基线工作。交付为 `scripts/system-backup-a-capacity-material-review.mjs`，并将现有 `system-backup-d-runtime-preflight.mjs` 的容量报告校验接到同一实现；没有修改 owner／角色探针、接收器、业务恢复或详情读取。

## 已完成的行为

工具直接读取既有四份公共材料，不增加部署配置格式：容量部署 input、原始 `source.json`、原始 `report.json`，以及现有预检 identity SQL 的 JSON 输出。它用当前生成器检查部署输入与 migration catalog，核对 registry 中完整的容量表集合（含 `system_backups`）、生成器预期的原始 source 字节 SHA、server UUID、database 和 datadir。

报告只接受原五个字段。容量字节从 JSON 原始数值解析成 BigInt，允许完整非负 int64，拒绝溢出、浮点、指数、字符串、NULL、重复字段及未知字段。CLI 限制 input/source 各 64 KiB，report/SQL identity 各 4 KiB，拒绝非法 UTF-8；错误输出不会回显材料内容。source 必须保留生成器原始字节，包括最后换行，不能用重新序列化或修改换行的副本替代固定 SHA 的配置。

时间按 Go UTC RFC3339 格式保留纳秒。消费者原规则为报告不在 SQL 时间之后且年龄不超过五秒，故恰好五秒允许，超过一纳秒拒绝。既有预检使用 `Date.parse` 的毫秒差：`05.000001 - 00.000000` 会被截成 5000ms，同一毫秒内的未来时间也会被截成零；现在这两种情况都阻断。采集器自身要求测量结束严格早于五秒，其生产规则未修改。

回归发现容量空模板还保留 95 迁移摘要，已将 `deployments/k8s/system-backup-capacity.template.json` 同步至 96 文件的 `0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`。现场历史候选和旧实测回执未改写。模板的运行身份仍为空，未启用采集器。

## 使用

在仓库根目录使用现有 Node 24 运行，路径替换为操作者保存的原始公共文件：

```powershell
node .\scripts\system-backup-a-capacity-material-review.mjs `
  --input C:\evidence\capacity-input.json `
  --source C:\evidence\source.json `
  --report C:\evidence\report.json `
  --sql-identity C:\evidence\capacity-sql-identity.json
```

SQL identity 复用现有预检四字段：`server_uuid`、`database`、`data_directory`、`now`。`now` 必须来自原观察轮的数据库 UTC 查询；不能用本机当前时间、文件时间或新造的 TTL 代替。所有时间采用 `Z`，保留原有小数精度。

成功输出 `PASS_OFFLINE_CAPACITY_MATERIALS`、四材料摘要、catalog 摘要、表数、精确年龄和十进制容量字符串，退出 0；材料不一致退出 1。工具只读本地文件，不调用 Go、kubectl、SSH、SQL，不写配置或接收文件。

## 验证与边界

最终执行：

```powershell
node --test scripts/system-backup-a-capacity-material-review.test.mjs scripts/system-backup-d-capacity-deployment.test.mjs
```

两文件合计 **20 项通过，零失败、零跳过，退出 0**：新增离线工具 9 项、既有容量套件 9 项、实际调用预检的时间/int64 集成回归 2 项。包含真实 CLI 子进程成功和拒绝、同数量错表、原始配置字节、旧 catalog、身份/目录、纳秒边界、完整 int64、重复键、未知字段及无内容回显。所有 SQL/集群响应由假 transport 提供。

第一次调用被沙箱的子进程创建权限阻断，未执行测试；允许本地子进程后，首轮 18 项中 17 过、1 项因上述旧容量模板摘要失败。修订模板并加入两项集成回归后的完整 20 项全部通过。未安装依赖；CLI 测试的专用临时目录在 finally 中守卫校验路径后删除，最终另行核对无 `.tmp-a-capacity-material-review-*` 残留，无构建产物。

离线通过只说明所提交文件在原 SQL 时点的一致性，不证明 SQL 输出的可信来源、实际权限、物理 statfs、PVC/PV 隔离、报告卷权限、跨 Pod 原子可见性、测量总时长或当前仍然新鲜。输出将这些现场结论明确保持为 false；实际容量材料接收、生产启用与 E2E 继续按原计划完成。
