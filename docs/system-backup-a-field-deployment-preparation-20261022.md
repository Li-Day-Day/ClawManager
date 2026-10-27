# A：现场采集前的部署输入修正与真实资源前提

本轮修正两份空模板的旧迁移目录摘要，并复用已有 bootstrap 交接核对剩余 27 个资源准入槽位。没有生成可启用的 apply 包，也没有用模板通过代替真实权限、授权材料或运行卷证据。

## 已修正的输入

`system-backup-registration.template.json` 的 `migration_catalog_sha256` 和 `system-backup-download-k8s.template.json` 的 `registration.migration_catalog_sha256` 原为 `2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237`，与当前生成器不符。现均改为当前 **96 文件**目录的 `0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`。

[限定复核记录](evidence/a-field-deployment-template-reviewed-20261022.json)通过原文件 SHA 重建，确认每个模板只变更该摘要的字节；两个完整 JSON 均与当前生成器的空模板一致。镜像、运行材料和账号字段仍为空，缺项时仍拒绝生成可用部署。

既有两套组合器共 **15 项通过、0 失败/跳过**，含原模板一致性、独立凭据/卷、原期限、完整 SQL pins、readiness、OIDC、真实 CLI 防覆盖及临时文件清理。原沙箱测试启动被 `spawn EPERM` 阻断，测试体未执行；同一命令在允许子进程后全部通过，原失败保留。没有新增测试或安装依赖，没有 Go 构建；CLI 自有临时目录已删除并独立确认。

原 `system-backup-capacity.zh-fix16.candidate.json` 保留不动：其镜像/目录是历史候选，collector 用户与凭据引用仍为空，不能直接当作当前现场输入。当前空容量模板已有 96 文件摘要，不重复修改；本轮新观察到的 MySQL/PVC/PV 引用沿用[公共引用记录](evidence/a-field-observed-references-20261022.json)。

## 为什么现在还不能只换镜像后采集

已对照当前 `linkedOwnerAdapters()`、registry/reference 闭集和 `MissingBootstrapOwnerAdapters()`，并核对[已有交接清单](system-backup-a-bootstrap-resource-handoff-20261022.md)及其相关源码摘要。当前源码仅显式接入 3 个 registry 校验器，仍缺 **6 个 registry、20 个 reference、1 个跨资源校验，共 27 个槽位**。这不是 27 个必须新建的服务；应先复用已有合同和受控资源实现。

这些槽位需要原资源的准确身份/版本/用途、可信解析、原授权/期限及真实 `Prepare/Recheck` 实现和交叉评审，不能由 endpoint 连通、Secret 名、布尔 approval、示例 allowlist 或下载专项通过代替。新镜像可以携带当前源码，但不会自动补齐这些原始材料和具体校验器。当前源码的 27 项静态缺口也不刷新原现场旧镜像报告的 30 项。

本轮只读查看相关 A/D 对话的现有交付状态，没有发送消息、分派工作或将其他正在编译的业务/读取候选当成新的部署镜像、资源准入或实际材料证明。

## 当前执行顺序

| 顺序 | 工作 | 当前结果 |
| --- | --- | --- |
| 1 | 修正当前空部署模板的迁移目录 | 两个字段已修正，15 项组合器测试通过；这是本地格式准备。 |
| 2 | 按已有交接补真实资源合同、受控映射、原授权及具体准入实现 | 剩余 27 个槽位；原 config/grant、registry/ref 材料和适用版本仍需真实来源，不构造替代材料。 |
| 3 | 用受审目标镜像和原材料完成运行装配 | registration/download/collector 连接、collector 的只读 data/可写 report 及独立 journal 均需真实装配；本轮未部署。 |
| 4 | 取得实际权限、材料、容量和运行卷证据 | [统一采集入口](system-backup-a-field-evidence-handoff-20261021.md)本地已准备；[现场公共盘点](system-backup-a-field-inventory-review-20261022.md)已复核，但完整计划仍未齐备。 |

本轮不新增 owner 普通来源基线，不借用旧 5,019 项或命令包 84 项检查放行新 source。已接收角色十项、D GC 十八项和这份公共盘点无需重复。正式角色批准、物理隔离/预留、卷原子可见性/fencing、人员 MFA/provider 与恢复 E2E 保持独立。

本地复核命令：

```powershell
node .\docs\evidence\a-field-deployment-template-review-20261022.mjs --check
```

状态为 `TEMPLATE_CATALOG_REPAIRED_RESOURCE_ADMISSION_AND_FIELD_EVIDENCE_PENDING`；`production_approved=false`、`complete_field_acceptance=false`。本轮没有创建账号/凭据、续造授权期限、修改数据库或联系集群。
