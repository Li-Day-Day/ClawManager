# D 集成基线 CI 修复（2026-10-29）

原始故障基于 `102928ff`。远程 Build 40804290228 的后端全量测试失败，前端、Hermes Desktop、Browser Worker 已通过，Docker job 因依赖失败被跳过。

此前 `700b92ef` 仅执行 11 个后端包回归及全量编译；`102928ff` 恢复部署清单后未重跑受影响的 Go 测试。这些记录不能证明后端全量测试通过，本次补齐验证并修正集成漂移。

## 修复范围与权威来源

| 范围 | 修复 | 保留的约束 |
| --- | --- | --- |
| 部署数据库测试 | 官方 database-only 初始化改为核验嵌入式 001/034/047 迁移中的 alias 与默认镜像种子；历史 incluster 清单仍核验内嵌 SQL。 | 官方清单不得复制迁移的镜像种子。 |
| 下载 evidence 测试 | metadata 和 retention 测试共同读取正式 117 v2 迁移，停止混用历史无版本 proposal。 | closed-reference、外键、删除限制、保留期限校验不放宽。 |
| ConfigValues 读取规则 | 源 schema 哈希改为 Git 中的 LF 字节；新增 `scripts/system-backup-d-projection-rules.mjs --check/--write`，CI 强制检查生成结果。 | 数值边界、缩放、类型、必填字段与引用枚举保持原规则；拒绝 CR 字节。 |
| resources 测试 | 使用已有、明确标记 `production_approved=false` 的历史模拟 registry；不再自动冻结当前草稿。 | 当前未审批 `execution_records` 必须被拒绝且不得执行目标 SQL；把未审批对象混入模拟 frozen registry 仍必须拒绝。 |
| 并发提交后的 124 迁移目录 | 接收已推送 `af7c3ad5` 后发现 catalog 未更新；补齐 165 文件摘要、两张控制表分类及正式 draft registry，并同步 businessa fixture。 | 新表仅为 `pending_owner_review`，不扩展 resources 的历史 35 表冻结名单、不补造审批。 |

本次不修改生产 gate、writer/relay、已记录审批或当前 Runtime 装配。历史模拟夹具的 35 个控制表不代表当前 schema 已获生产审批。正式接手接口见 `system-backup-d-unified-baseline-20261029.md`，已链接同期交付的 D→B、D→C 及公共 C crypto candidate。

## 验证记录

验证在临时隔离检出中执行，只复制本次修复，不包含共享工作区内其他 owner 尚未提交的接入修改。`102928ff` 加原始修复的完整 Go 命令已通过（66 个有测试包、14 个无测试文件包，退出码 0）。随后共享分支已推送 `f2f78aef`、`af7c3ad5`、`a7424ce1`，隔离检出同步至 `a7424ce1` 后补验；旧结果不冒充新基线结果。

- Config projection 生成检查通过，schema SHA-256：`6d1c88a46406bc4488b6c7f35545ffc4dfd286e3b020cea916e1980f07e1a865`。
- CI 工作流 5 项测试通过；Windows 使用现有 Git Bash，复用现有 `js-yaml` 依赖。首次缺依赖和误用 WSL Bash 的启动问题已纠正后重跑。
- Windows Go 1.26.1，`go test -p 2 ./...`。首次编译进程异常退出未计成功；随后发现 Windows Python 占位程序导致 ownerrecords SQLite 测试失败，改用现有真实 Python 后通过，无业务代码修改。
- `a7424ce1` 加本次修复的全量运行：其余包通过，evidence 在约 602 秒触发整包默认 10 分钟超时；当时正在执行 `TestWriteRecoveryUnknownAndConflictingObjectsRetainEvidence/null_version`（该子用例运行不足 1 秒），栈位于夹具 `os.WriteFile/CloseHandle`。未报告断言失败，但本轮整体退出码为 1，不能记为全量通过。CI 的超时和断言不作放宽，最终以该修复提交的 Linux Backend Build 结果为准。
- 新目录生成检查及两项 Python 回归通过；逐对象比较确认原有 127 项策略/审批完全不变，新增两项仍未审批，正式 registry 与 businessa fixture 字节一致。
- 远程 Linux CI 结果应按本修复提交的 Build 运行核对；本地结果不替代远程结果。

测试结束后删除本次隔离检出、编译缓存和临时日志；其他 owner 的文件及产物不属于本次清理范围。
