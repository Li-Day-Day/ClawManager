# 用户和实例备份恢复：完整改动清单

生成日期：2026-10-27（提交前快照）。范围为当前工作区相对 `main` 的全部已修改及未跟踪文件；不只统计 `git diff --stat`，后者不会包含未跟踪的新模块。提交后 A/M 和数量仍描述本次提交前的状态。

基线：`576e4bb5440d453fd25300586e57ce81cb616f31`；目标为本地缓存 `origin/backup`：`52117deea14df5a3a8dcceb8abed5b9c7cada17e`。本清单没有应用合并结果，也没有修改 Git index。

共 **295 个文件**：**13 个原有文件修改、282 个新增文件**，其中 **102 个 Go 测试文件**。实验日志、密文、临时账号配置、二进制、node_modules 和 dist 位于忽略目录，未列入。

审查发现、修复内容、验证结果和合入阻塞项见[合并前审查报告](users-instances-backup-premerge-review.zh-CN.md)；提交详细说明见[实现与验证说明](users-instances-backup-implementation-notes.zh-CN.md)。以下是全部累计开发改动，本次审查修复仅为其中一部分。

## 功能清单

| 范围 | 已实现内容 |
| --- | --- |
| 领域数据 | users/instances 表登记、只读 Catalog/Capture、精确行编码、用户归属/配额/admin 替换、配置归一化、目标停止与任务禁用、隔离事务恢复及独立校验 |
| WorkBuddy Lite | 固定身份 DDL/唯一索引、历史 UID 占用、allocator 高水位、marker 与 HOME 属主联合验证、实例根/Wine/DOS 属性适配 |
| 文件和密文 | 完整登记根、会话/SQLite/WAL/Skill/任务文件；路径、链接、UID/GID/mode/xattr 检查；流式压缩、AES-GCM staging、签名和封装 |
| 暂停和资源 | 全部 writer 屏障、pause intent、源状态恢复、取消补偿、Job/VolumeSnapshot/PVC/NetworkPolicy、资源 UID/journal/fence、节点和运行时证明接口 |
| 控制器和 worker | 内部任务状态机、幂等、接管/恢复、mTLS 授权、凭据撤销、工作空间和数据库 worker；默认缺少依赖拒绝执行 |
| 六域及跨域 | dependencies/Team placement、assets、六域合同和 acceptance、catalog scan/import/actions、provider gateway；真实 owner 合同仍需接线 |
| 应用接入 | server 管理 API 和 opt-in 控制库、HTTP gate、后台调度/同步/Skill/扫描/PVC/Team/北向写操作登记 |
| 管理界面 | 独立备份任务页、状态/取消、结果与目录分页、详情和脱敏报告下载、导航/路由/API service |
| 交付和实验 | 7 个备份相关命令、3 个镜像 Dockerfile、控制器示例/SQL/部署说明、Agent/Wine/混合身份隔离实验脚本和 fixture |
| 测试与文档 | 各包隔离回归、真实 Linux/MySQL 合成数据实验、开发/参考结构/审查/完整文件清单 |

## 文件数量分布

| 目录或模块 | 文件数 |
| --- | ---: |
| `backend/cmd/backup-contract-schema` | 1 |
| `backend/cmd/backup-controller` | 2 |
| `backend/cmd/backup-inventory` | 2 |
| `backend/cmd/backup-lab` | 5 |
| `backend/cmd/backup-node-proof` | 1 |
| `backend/cmd/backup-provider-gateway` | 2 |
| `backend/cmd/backup-worker` | 2 |
| `backend/cmd/server` | 1 |
| `backend/deployments/docker` | 3 |
| `backend/internal/handlers` | 3 |
| `backend/internal/middleware` | 2 |
| `backend/internal/northbound` | 1 |
| `backend/internal/services` | 12 |
| `backend/internal/services/k8s` | 2 |
| `backend/internal/systembackup (说明)` | 1 |
| `backend/internal/systembackup/artifact` | 6 |
| `backend/internal/systembackup/assets` | 4 |
| `backend/internal/systembackup/control` | 61 |
| `backend/internal/systembackup/domain` | 31 |
| `backend/internal/systembackup/flow` | 4 |
| `backend/internal/systembackup/host` | 11 |
| `backend/internal/systembackup/kube` | 15 |
| `backend/internal/systembackup/mutation` | 2 |
| `backend/internal/systembackup/profile` | 23 |
| `backend/internal/systembackup/quiesce` | 9 |
| `backend/internal/systembackup/recovery` | 23 |
| `backend/internal/systembackup/scope` | 8 |
| `backend/internal/systembackup/staging` | 7 |
| `backend/internal/systembackup/worker` | 13 |
| `backend/internal/systembackup/workspace` | 8 |
| `docs` | 5 |
| `examples/backup-controller` | 19 |
| `examples/backup-inventory` | 1 |
| `frontend/src/components` | 1 |
| `frontend/src/pages/admin` | 2 |
| `frontend/src/router` | 1 |
| `frontend/src/services` | 1 |

## 逐文件清单

M 表示相对基线修改原有文件，A 表示相对基线新增文件。M 的增删数来自 Git diff；A 的增行数是当前文件总行数。清单自身不计算行数，避免递归变化。

### backend/cmd/backup-contract-schema

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/cmd/backup-contract-schema/main.go](../backend/cmd/backup-contract-schema/main.go) | +16 / -0 |

### backend/cmd/backup-controller

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/cmd/backup-controller/main.go](../backend/cmd/backup-controller/main.go) | +76 / -0 |
| A | [backend/cmd/backup-controller/main_test.go](../backend/cmd/backup-controller/main_test.go) | +29 / -0 |

### backend/cmd/backup-inventory

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/cmd/backup-inventory/main.go](../backend/cmd/backup-inventory/main.go) | +67 / -0 |
| A | [backend/cmd/backup-inventory/main_test.go](../backend/cmd/backup-inventory/main_test.go) | +48 / -0 |

### backend/cmd/backup-lab

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/cmd/backup-lab/identity.go](../backend/cmd/backup-lab/identity.go) | +123 / -0 |
| A | [backend/cmd/backup-lab/main.go](../backend/cmd/backup-lab/main.go) | +703 / -0 |
| A | [backend/cmd/backup-lab/matrix.go](../backend/cmd/backup-lab/matrix.go) | +164 / -0 |
| A | [backend/cmd/backup-lab/mixed.go](../backend/cmd/backup-lab/mixed.go) | +378 / -0 |
| A | [backend/cmd/backup-lab/wine.go](../backend/cmd/backup-lab/wine.go) | +157 / -0 |

### backend/cmd/backup-node-proof

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/cmd/backup-node-proof/main.go](../backend/cmd/backup-node-proof/main.go) | +52 / -0 |

### backend/cmd/backup-provider-gateway

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/cmd/backup-provider-gateway/main.go](../backend/cmd/backup-provider-gateway/main.go) | +41 / -0 |
| A | [backend/cmd/backup-provider-gateway/main_test.go](../backend/cmd/backup-provider-gateway/main_test.go) | +31 / -0 |

### backend/cmd/backup-worker

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/cmd/backup-worker/main.go](../backend/cmd/backup-worker/main.go) | +145 / -0 |
| A | [backend/cmd/backup-worker/main_test.go](../backend/cmd/backup-worker/main_test.go) | +20 / -0 |

### backend/cmd/server

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| M | [backend/cmd/server/main.go](../backend/cmd/server/main.go) | +49 / -0 |

### backend/deployments/docker

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/deployments/docker/Dockerfile.backup-controller](../backend/deployments/docker/Dockerfile.backup-controller) | +8 / -0 |
| A | [backend/deployments/docker/Dockerfile.backup-node-proof](../backend/deployments/docker/Dockerfile.backup-node-proof) | +7 / -0 |
| A | [backend/deployments/docker/Dockerfile.backup-worker](../backend/deployments/docker/Dockerfile.backup-worker) | +9 / -0 |

### backend/internal/handlers

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/handlers/system_backup_handler.go](../backend/internal/handlers/system_backup_handler.go) | +192 / -0 |
| A | [backend/internal/handlers/system_backup_handler_test.go](../backend/internal/handlers/system_backup_handler_test.go) | +98 / -0 |
| A | [backend/internal/handlers/system_backup_results_test.go](../backend/internal/handlers/system_backup_results_test.go) | +55 / -0 |

### backend/internal/middleware

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/middleware/system_backup_gate.go](../backend/internal/middleware/system_backup_gate.go) | +34 / -0 |
| A | [backend/internal/middleware/system_backup_gate_test.go](../backend/internal/middleware/system_backup_gate_test.go) | +57 / -0 |

### backend/internal/northbound

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| M | [backend/internal/northbound/core_service.go](../backend/internal/northbound/core_service.go) | +11 / -1 |

### backend/internal/services

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/services/backup_mutation_gate.go](../backend/internal/services/backup_mutation_gate.go) | +19 / -0 |
| M | [backend/internal/services/instance_service.go](../backend/internal/services/instance_service.go) | +11 / -0 |
| M | [backend/internal/services/openclaw_config_service.go](../backend/internal/services/openclaw_config_service.go) | +6 / -0 |
| M | [backend/internal/services/runtime_scheduler.go](../backend/internal/services/runtime_scheduler.go) | +6 / -0 |
| M | [backend/internal/services/security_scan_service.go](../backend/internal/services/security_scan_service.go) | +6 / -0 |
| M | [backend/internal/services/skill_package_materialize_worker.go](../backend/internal/services/skill_package_materialize_worker.go) | +27 / -12 |
| M | [backend/internal/services/sync_service.go](../backend/internal/services/sync_service.go) | +6 / -0 |
| M | [backend/internal/services/team_service.go](../backend/internal/services/team_service.go) | +31 / -0 |
| A | [backend/internal/services/user_instance_backup_gateway.go](../backend/internal/services/user_instance_backup_gateway.go) | +299 / -0 |
| A | [backend/internal/services/user_instance_backup_gateway_test.go](../backend/internal/services/user_instance_backup_gateway_test.go) | +275 / -0 |
| A | [backend/internal/services/user_instance_backup_scope.go](../backend/internal/services/user_instance_backup_scope.go) | +44 / -0 |
| A | [backend/internal/services/user_instance_backup_scope_test.go](../backend/internal/services/user_instance_backup_scope_test.go) | +90 / -0 |

### backend/internal/services/k8s

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| M | [backend/internal/services/k8s/pvc_service.go](../backend/internal/services/k8s/pvc_service.go) | +11 / -0 |
| M | [backend/internal/services/k8s/workbuddy_prewarm.go](../backend/internal/services/k8s/workbuddy_prewarm.go) | +6 / -0 |

### backend/internal/systembackup (说明)

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/README.md](../backend/internal/systembackup/README.md) | +251 / -0 |

### backend/internal/systembackup/artifact

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/artifact/bundle.go](../backend/internal/systembackup/artifact/bundle.go) | +385 / -0 |
| A | [backend/internal/systembackup/artifact/bundle_test.go](../backend/internal/systembackup/artifact/bundle_test.go) | +131 / -0 |
| A | [backend/internal/systembackup/artifact/catalog.go](../backend/internal/systembackup/artifact/catalog.go) | +119 / -0 |
| A | [backend/internal/systembackup/artifact/catalog_test.go](../backend/internal/systembackup/artifact/catalog_test.go) | +45 / -0 |
| A | [backend/internal/systembackup/artifact/sync_unix.go](../backend/internal/systembackup/artifact/sync_unix.go) | +14 / -0 |
| A | [backend/internal/systembackup/artifact/sync_windows.go](../backend/internal/systembackup/artifact/sync_windows.go) | +8 / -0 |

### backend/internal/systembackup/assets

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/assets/assets.go](../backend/internal/systembackup/assets/assets.go) | +309 / -0 |
| A | [backend/internal/systembackup/assets/assets_test.go](../backend/internal/systembackup/assets/assets_test.go) | +78 / -0 |
| A | [backend/internal/systembackup/assets/configmaps.go](../backend/internal/systembackup/assets/configmaps.go) | +141 / -0 |
| A | [backend/internal/systembackup/assets/configmaps_test.go](../backend/internal/systembackup/assets/configmaps_test.go) | +41 / -0 |

### backend/internal/systembackup/control

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/control/acceptance.go](../backend/internal/systembackup/control/acceptance.go) | +201 / -0 |
| A | [backend/internal/systembackup/control/acceptance_test.go](../backend/internal/systembackup/control/acceptance_test.go) | +329 / -0 |
| A | [backend/internal/systembackup/control/app_process.go](../backend/internal/systembackup/control/app_process.go) | +188 / -0 |
| A | [backend/internal/systembackup/control/app_process_test.go](../backend/internal/systembackup/control/app_process_test.go) | +115 / -0 |
| A | [backend/internal/systembackup/control/application_start.go](../backend/internal/systembackup/control/application_start.go) | +48 / -0 |
| A | [backend/internal/systembackup/control/catalog_actions.go](../backend/internal/systembackup/control/catalog_actions.go) | +151 / -0 |
| A | [backend/internal/systembackup/control/catalog_actions_test.go](../backend/internal/systembackup/control/catalog_actions_test.go) | +89 / -0 |
| A | [backend/internal/systembackup/control/catalog_admission.go](../backend/internal/systembackup/control/catalog_admission.go) | +290 / -0 |
| A | [backend/internal/systembackup/control/catalog_admission_test.go](../backend/internal/systembackup/control/catalog_admission_test.go) | +177 / -0 |
| A | [backend/internal/systembackup/control/catalog_executor.go](../backend/internal/systembackup/control/catalog_executor.go) | +213 / -0 |
| A | [backend/internal/systembackup/control/catalog_executor_test.go](../backend/internal/systembackup/control/catalog_executor_test.go) | +146 / -0 |
| A | [backend/internal/systembackup/control/catalog_scans.go](../backend/internal/systembackup/control/catalog_scans.go) | +176 / -0 |
| A | [backend/internal/systembackup/control/catalog_scans_test.go](../backend/internal/systembackup/control/catalog_scans_test.go) | +64 / -0 |
| A | [backend/internal/systembackup/control/catalog_view.go](../backend/internal/systembackup/control/catalog_view.go) | +273 / -0 |
| A | [backend/internal/systembackup/control/catalog_view_test.go](../backend/internal/systembackup/control/catalog_view_test.go) | +103 / -0 |
| A | [backend/internal/systembackup/control/collector.go](../backend/internal/systembackup/control/collector.go) | +188 / -0 |
| A | [backend/internal/systembackup/control/collector_test.go](../backend/internal/systembackup/control/collector_test.go) | +74 / -0 |
| A | [backend/internal/systembackup/control/config.go](../backend/internal/systembackup/control/config.go) | +79 / -0 |
| A | [backend/internal/systembackup/control/credentials.go](../backend/internal/systembackup/control/credentials.go) | +399 / -0 |
| A | [backend/internal/systembackup/control/credentials_test.go](../backend/internal/systembackup/control/credentials_test.go) | +91 / -0 |
| A | [backend/internal/systembackup/control/gate.go](../backend/internal/systembackup/control/gate.go) | +386 / -0 |
| A | [backend/internal/systembackup/control/gateway_dispatch.go](../backend/internal/systembackup/control/gateway_dispatch.go) | +58 / -0 |
| A | [backend/internal/systembackup/control/gateway_dispatch_test.go](../backend/internal/systembackup/control/gateway_dispatch_test.go) | +50 / -0 |
| A | [backend/internal/systembackup/control/identity.go](../backend/internal/systembackup/control/identity.go) | +301 / -0 |
| A | [backend/internal/systembackup/control/identity_test.go](../backend/internal/systembackup/control/identity_test.go) | +80 / -0 |
| A | [backend/internal/systembackup/control/legacy_mutation.go](../backend/internal/systembackup/control/legacy_mutation.go) | +58 / -0 |
| A | [backend/internal/systembackup/control/live_worker.go](../backend/internal/systembackup/control/live_worker.go) | +119 / -0 |
| A | [backend/internal/systembackup/control/live_worker_test.go](../backend/internal/systembackup/control/live_worker_test.go) | +48 / -0 |
| A | [backend/internal/systembackup/control/never_granted.go](../backend/internal/systembackup/control/never_granted.go) | +54 / -0 |
| A | [backend/internal/systembackup/control/never_granted_test.go](../backend/internal/systembackup/control/never_granted_test.go) | +39 / -0 |
| A | [backend/internal/systembackup/control/pipeline.go](../backend/internal/systembackup/control/pipeline.go) | +461 / -0 |
| A | [backend/internal/systembackup/control/pipeline_test.go](../backend/internal/systembackup/control/pipeline_test.go) | +85 / -0 |
| A | [backend/internal/systembackup/control/profiles.go](../backend/internal/systembackup/control/profiles.go) | +85 / -0 |
| A | [backend/internal/systembackup/control/protected_collector.go](../backend/internal/systembackup/control/protected_collector.go) | +136 / -0 |
| A | [backend/internal/systembackup/control/protected_collector_test.go](../backend/internal/systembackup/control/protected_collector_test.go) | +59 / -0 |
| A | [backend/internal/systembackup/control/publication.go](../backend/internal/systembackup/control/publication.go) | +215 / -0 |
| A | [backend/internal/systembackup/control/publication_test.go](../backend/internal/systembackup/control/publication_test.go) | +142 / -0 |
| A | [backend/internal/systembackup/control/recovery_guards.go](../backend/internal/systembackup/control/recovery_guards.go) | +601 / -0 |
| A | [backend/internal/systembackup/control/recovery_guards_test.go](../backend/internal/systembackup/control/recovery_guards_test.go) | +200 / -0 |
| A | [backend/internal/systembackup/control/recovery_schema_test.go](../backend/internal/systembackup/control/recovery_schema_test.go) | +33 / -0 |
| A | [backend/internal/systembackup/control/redis_journal.go](../backend/internal/systembackup/control/redis_journal.go) | +245 / -0 |
| A | [backend/internal/systembackup/control/redis_journal_test.go](../backend/internal/systembackup/control/redis_journal_test.go) | +95 / -0 |
| A | [backend/internal/systembackup/control/resources.go](../backend/internal/systembackup/control/resources.go) | +58 / -0 |
| A | [backend/internal/systembackup/control/schema.sql](../backend/internal/systembackup/control/schema.sql) | +226 / -0 |
| A | [backend/internal/systembackup/control/service.go](../backend/internal/systembackup/control/service.go) | +147 / -0 |
| A | [backend/internal/systembackup/control/source_restart.go](../backend/internal/systembackup/control/source_restart.go) | +181 / -0 |
| A | [backend/internal/systembackup/control/source_restart_test.go](../backend/internal/systembackup/control/source_restart_test.go) | +142 / -0 |
| A | [backend/internal/systembackup/control/sql.go](../backend/internal/systembackup/control/sql.go) | +384 / -0 |
| A | [backend/internal/systembackup/control/sql_test.go](../backend/internal/systembackup/control/sql_test.go) | +199 / -0 |
| A | [backend/internal/systembackup/control/task.go](../backend/internal/systembackup/control/task.go) | +332 / -0 |
| A | [backend/internal/systembackup/control/task_test.go](../backend/internal/systembackup/control/task_test.go) | +222 / -0 |
| A | [backend/internal/systembackup/control/upgrade-app-processes.sql](../backend/internal/systembackup/control/upgrade-app-processes.sql) | +18 / -0 |
| A | [backend/internal/systembackup/control/upgrade-catalog.sql](../backend/internal/systembackup/control/upgrade-catalog.sql) | +32 / -0 |
| A | [backend/internal/systembackup/control/upgrade-provider-gateway.sql](../backend/internal/systembackup/control/upgrade-provider-gateway.sql) | +13 / -0 |
| A | [backend/internal/systembackup/control/upgrade-recovery-operations.sql](../backend/internal/systembackup/control/upgrade-recovery-operations.sql) | +48 / -0 |
| A | [backend/internal/systembackup/control/upgrade-restart-result.sql](../backend/internal/systembackup/control/upgrade-restart-result.sql) | +4 / -0 |
| A | [backend/internal/systembackup/control/vault.go](../backend/internal/systembackup/control/vault.go) | +136 / -0 |
| A | [backend/internal/systembackup/control/vault_test.go](../backend/internal/systembackup/control/vault_test.go) | +81 / -0 |
| A | [backend/internal/systembackup/control/worker.go](../backend/internal/systembackup/control/worker.go) | +296 / -0 |
| A | [backend/internal/systembackup/control/worker_status.go](../backend/internal/systembackup/control/worker_status.go) | +86 / -0 |
| A | [backend/internal/systembackup/control/worker_test.go](../backend/internal/systembackup/control/worker_test.go) | +169 / -0 |

### backend/internal/systembackup/domain

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/domain/codec.go](../backend/internal/systembackup/domain/codec.go) | +114 / -0 |
| A | [backend/internal/systembackup/domain/config.go](../backend/internal/systembackup/domain/config.go) | +195 / -0 |
| A | [backend/internal/systembackup/domain/config_test.go](../backend/internal/systembackup/domain/config_test.go) | +33 / -0 |
| A | [backend/internal/systembackup/domain/crossdomain.go](../backend/internal/systembackup/domain/crossdomain.go) | +37 / -0 |
| A | [backend/internal/systembackup/domain/crossdomain_test.go](../backend/internal/systembackup/domain/crossdomain_test.go) | +92 / -0 |
| A | [backend/internal/systembackup/domain/data.go](../backend/internal/systembackup/domain/data.go) | +146 / -0 |
| A | [backend/internal/systembackup/domain/dependencies.go](../backend/internal/systembackup/domain/dependencies.go) | +169 / -0 |
| A | [backend/internal/systembackup/domain/dependencies_test.go](../backend/internal/systembackup/domain/dependencies_test.go) | +74 / -0 |
| A | [backend/internal/systembackup/domain/export_test.go](../backend/internal/systembackup/domain/export_test.go) | +29 / -0 |
| A | [backend/internal/systembackup/domain/formats.go](../backend/internal/systembackup/domain/formats.go) | +250 / -0 |
| A | [backend/internal/systembackup/domain/formats_test.go](../backend/internal/systembackup/domain/formats_test.go) | +63 / -0 |
| A | [backend/internal/systembackup/domain/grants.go](../backend/internal/systembackup/domain/grants.go) | +27 / -0 |
| A | [backend/internal/systembackup/domain/grants_test.go](../backend/internal/systembackup/domain/grants_test.go) | +30 / -0 |
| A | [backend/internal/systembackup/domain/mysql.go](../backend/internal/systembackup/domain/mysql.go) | +297 / -0 |
| A | [backend/internal/systembackup/domain/mysql_test.go](../backend/internal/systembackup/domain/mysql_test.go) | +390 / -0 |
| A | [backend/internal/systembackup/domain/normalize.go](../backend/internal/systembackup/domain/normalize.go) | +446 / -0 |
| A | [backend/internal/systembackup/domain/normalize_test.go](../backend/internal/systembackup/domain/normalize_test.go) | +194 / -0 |
| A | [backend/internal/systembackup/domain/preflight.go](../backend/internal/systembackup/domain/preflight.go) | +74 / -0 |
| A | [backend/internal/systembackup/domain/preflight_test.go](../backend/internal/systembackup/domain/preflight_test.go) | +43 / -0 |
| A | [backend/internal/systembackup/domain/restore.go](../backend/internal/systembackup/domain/restore.go) | +371 / -0 |
| A | [backend/internal/systembackup/domain/roundtrip_test.go](../backend/internal/systembackup/domain/roundtrip_test.go) | +108 / -0 |
| A | [backend/internal/systembackup/domain/teams.go](../backend/internal/systembackup/domain/teams.go) | +76 / -0 |
| A | [backend/internal/systembackup/domain/workbuddy.go](../backend/internal/systembackup/domain/workbuddy.go) | +112 / -0 |
| A | [backend/internal/systembackup/domain/workbuddy_observed_test.go](../backend/internal/systembackup/domain/workbuddy_observed_test.go) | +98 / -0 |
| A | [backend/internal/systembackup/domain/workbuddy_uid.go](../backend/internal/systembackup/domain/workbuddy_uid.go) | +137 / -0 |
| A | [backend/internal/systembackup/domain/workbuddy_uid_test.go](../backend/internal/systembackup/domain/workbuddy_uid_test.go) | +154 / -0 |
| A | [backend/internal/systembackup/domain/workbuddy_workspace.go](../backend/internal/systembackup/domain/workbuddy_workspace.go) | +91 / -0 |
| A | [backend/internal/systembackup/domain/workbuddy_workspace_linux.go](../backend/internal/systembackup/domain/workbuddy_workspace_linux.go) | +16 / -0 |
| A | [backend/internal/systembackup/domain/workbuddy_workspace_linux_test.go](../backend/internal/systembackup/domain/workbuddy_workspace_linux_test.go) | +89 / -0 |
| A | [backend/internal/systembackup/domain/workbuddy_workspace_other.go](../backend/internal/systembackup/domain/workbuddy_workspace_other.go) | +7 / -0 |
| A | [backend/internal/systembackup/domain/worker_integration_test.go](../backend/internal/systembackup/domain/worker_integration_test.go) | +180 / -0 |

### backend/internal/systembackup/flow

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/flow/capture.go](../backend/internal/systembackup/flow/capture.go) | +204 / -0 |
| A | [backend/internal/systembackup/flow/capture_test.go](../backend/internal/systembackup/flow/capture_test.go) | +204 / -0 |
| A | [backend/internal/systembackup/flow/recovery.go](../backend/internal/systembackup/flow/recovery.go) | +67 / -0 |
| A | [backend/internal/systembackup/flow/recovery_test.go](../backend/internal/systembackup/flow/recovery_test.go) | +131 / -0 |

### backend/internal/systembackup/host

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/host/catalog.go](../backend/internal/systembackup/host/catalog.go) | +254 / -0 |
| A | [backend/internal/systembackup/host/catalog_test.go](../backend/internal/systembackup/host/catalog_test.go) | +91 / -0 |
| A | [backend/internal/systembackup/host/config.go](../backend/internal/systembackup/host/config.go) | +232 / -0 |
| A | [backend/internal/systembackup/host/config_test.go](../backend/internal/systembackup/host/config_test.go) | +74 / -0 |
| A | [backend/internal/systembackup/host/diagnostics.go](../backend/internal/systembackup/host/diagnostics.go) | +150 / -0 |
| A | [backend/internal/systembackup/host/diagnostics_test.go](../backend/internal/systembackup/host/diagnostics_test.go) | +52 / -0 |
| A | [backend/internal/systembackup/host/objects.go](../backend/internal/systembackup/host/objects.go) | +44 / -0 |
| A | [backend/internal/systembackup/host/provider_gateway.go](../backend/internal/systembackup/host/provider_gateway.go) | +152 / -0 |
| A | [backend/internal/systembackup/host/provider_gateway_test.go](../backend/internal/systembackup/host/provider_gateway_test.go) | +48 / -0 |
| A | [backend/internal/systembackup/host/run.go](../backend/internal/systembackup/host/run.go) | +283 / -0 |
| A | [backend/internal/systembackup/host/templates_test.go](../backend/internal/systembackup/host/templates_test.go) | +58 / -0 |

### backend/internal/systembackup/kube

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/kube/database_job.go](../backend/internal/systembackup/kube/database_job.go) | +44 / -0 |
| A | [backend/internal/systembackup/kube/database_job_test.go](../backend/internal/systembackup/kube/database_job_test.go) | +66 / -0 |
| A | [backend/internal/systembackup/kube/journal.go](../backend/internal/systembackup/kube/journal.go) | +177 / -0 |
| A | [backend/internal/systembackup/kube/journal_rows.go](../backend/internal/systembackup/kube/journal_rows.go) | +127 / -0 |
| A | [backend/internal/systembackup/kube/journal_test.go](../backend/internal/systembackup/kube/journal_test.go) | +272 / -0 |
| A | [backend/internal/systembackup/kube/resources.go](../backend/internal/systembackup/kube/resources.go) | +253 / -0 |
| A | [backend/internal/systembackup/kube/resources_test.go](../backend/internal/systembackup/kube/resources_test.go) | +92 / -0 |
| A | [backend/internal/systembackup/kube/runner.go](../backend/internal/systembackup/kube/runner.go) | +394 / -0 |
| A | [backend/internal/systembackup/kube/runner_test.go](../backend/internal/systembackup/kube/runner_test.go) | +351 / -0 |
| A | [backend/internal/systembackup/kube/worker_config.go](../backend/internal/systembackup/kube/worker_config.go) | +43 / -0 |
| A | [backend/internal/systembackup/kube/worker_config_test.go](../backend/internal/systembackup/kube/worker_config_test.go) | +65 / -0 |
| A | [backend/internal/systembackup/kube/worker_network.go](../backend/internal/systembackup/kube/worker_network.go) | +72 / -0 |
| A | [backend/internal/systembackup/kube/worker_network_test.go](../backend/internal/systembackup/kube/worker_network_test.go) | +32 / -0 |
| A | [backend/internal/systembackup/kube/worker_observer.go](../backend/internal/systembackup/kube/worker_observer.go) | +244 / -0 |
| A | [backend/internal/systembackup/kube/worker_observer_test.go](../backend/internal/systembackup/kube/worker_observer_test.go) | +108 / -0 |

### backend/internal/systembackup/mutation

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/mutation/gate.go](../backend/internal/systembackup/mutation/gate.go) | +47 / -0 |
| A | [backend/internal/systembackup/mutation/gate_test.go](../backend/internal/systembackup/mutation/gate_test.go) | +63 / -0 |

### backend/internal/systembackup/profile

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/profile/applications.go](../backend/internal/systembackup/profile/applications.go) | +222 / -0 |
| A | [backend/internal/systembackup/profile/applications_test.go](../backend/internal/systembackup/profile/applications_test.go) | +68 / -0 |
| A | [backend/internal/systembackup/profile/assets.go](../backend/internal/systembackup/profile/assets.go) | +89 / -0 |
| A | [backend/internal/systembackup/profile/capabilities.go](../backend/internal/systembackup/profile/capabilities.go) | +117 / -0 |
| A | [backend/internal/systembackup/profile/collector.go](../backend/internal/systembackup/profile/collector.go) | +464 / -0 |
| A | [backend/internal/systembackup/profile/config.go](../backend/internal/systembackup/profile/config.go) | +271 / -0 |
| A | [backend/internal/systembackup/profile/discovery.go](../backend/internal/systembackup/profile/discovery.go) | +486 / -0 |
| A | [backend/internal/systembackup/profile/discovery_test.go](../backend/internal/systembackup/profile/discovery_test.go) | +127 / -0 |
| A | [backend/internal/systembackup/profile/execution.go](../backend/internal/systembackup/profile/execution.go) | +276 / -0 |
| A | [backend/internal/systembackup/profile/frozen.go](../backend/internal/systembackup/profile/frozen.go) | +100 / -0 |
| A | [backend/internal/systembackup/profile/preflight_test.go](../backend/internal/systembackup/profile/preflight_test.go) | +38 / -0 |
| A | [backend/internal/systembackup/profile/profile_test.go](../backend/internal/systembackup/profile/profile_test.go) | +255 / -0 |
| A | [backend/internal/systembackup/profile/roots.go](../backend/internal/systembackup/profile/roots.go) | +92 / -0 |
| A | [backend/internal/systembackup/profile/runtime_policy_test.go](../backend/internal/systembackup/profile/runtime_policy_test.go) | +47 / -0 |
| A | [backend/internal/systembackup/profile/shared_workspace.go](../backend/internal/systembackup/profile/shared_workspace.go) | +60 / -0 |
| A | [backend/internal/systembackup/profile/shared_workspace_test.go](../backend/internal/systembackup/profile/shared_workspace_test.go) | +51 / -0 |
| A | [backend/internal/systembackup/profile/six_domain.go](../backend/internal/systembackup/profile/six_domain.go) | +146 / -0 |
| A | [backend/internal/systembackup/profile/six_domain_test.go](../backend/internal/systembackup/profile/six_domain_test.go) | +109 / -0 |
| A | [backend/internal/systembackup/profile/target.go](../backend/internal/systembackup/profile/target.go) | +392 / -0 |
| A | [backend/internal/systembackup/profile/workbuddy.go](../backend/internal/systembackup/profile/workbuddy.go) | +93 / -0 |
| A | [backend/internal/systembackup/profile/workbuddy_test.go](../backend/internal/systembackup/profile/workbuddy_test.go) | +114 / -0 |
| A | [backend/internal/systembackup/profile/writer_proof_test.go](../backend/internal/systembackup/profile/writer_proof_test.go) | +54 / -0 |
| A | [backend/internal/systembackup/profile/writers.go](../backend/internal/systembackup/profile/writers.go) | +319 / -0 |

### backend/internal/systembackup/quiesce

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/quiesce/capture_test.go](../backend/internal/systembackup/quiesce/capture_test.go) | +107 / -0 |
| A | [backend/internal/systembackup/quiesce/cri.go](../backend/internal/systembackup/quiesce/cri.go) | +121 / -0 |
| A | [backend/internal/systembackup/quiesce/cri_test.go](../backend/internal/systembackup/quiesce/cri_test.go) | +52 / -0 |
| A | [backend/internal/systembackup/quiesce/deployment.go](../backend/internal/systembackup/quiesce/deployment.go) | +394 / -0 |
| A | [backend/internal/systembackup/quiesce/deployment_test.go](../backend/internal/systembackup/quiesce/deployment_test.go) | +263 / -0 |
| A | [backend/internal/systembackup/quiesce/pod.go](../backend/internal/systembackup/quiesce/pod.go) | +325 / -0 |
| A | [backend/internal/systembackup/quiesce/pod_test.go](../backend/internal/systembackup/quiesce/pod_test.go) | +308 / -0 |
| A | [backend/internal/systembackup/quiesce/proof_transport.go](../backend/internal/systembackup/quiesce/proof_transport.go) | +239 / -0 |
| A | [backend/internal/systembackup/quiesce/proof_transport_test.go](../backend/internal/systembackup/quiesce/proof_transport_test.go) | +108 / -0 |

### backend/internal/systembackup/recovery

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/recovery/README.md](../backend/internal/systembackup/recovery/README.md) | +197 / -0 |
| A | [backend/internal/systembackup/recovery/adapters_test.go](../backend/internal/systembackup/recovery/adapters_test.go) | +119 / -0 |
| A | [backend/internal/systembackup/recovery/boundaries_test.go](../backend/internal/systembackup/recovery/boundaries_test.go) | +277 / -0 |
| A | [backend/internal/systembackup/recovery/canonical.go](../backend/internal/systembackup/recovery/canonical.go) | +253 / -0 |
| A | [backend/internal/systembackup/recovery/codec.go](../backend/internal/systembackup/recovery/codec.go) | +79 / -0 |
| A | [backend/internal/systembackup/recovery/contracts.go](../backend/internal/systembackup/recovery/contracts.go) | +372 / -0 |
| A | [backend/internal/systembackup/recovery/contracts.schema.json](../backend/internal/systembackup/recovery/contracts.schema.json) | +1637 / -0 |
| A | [backend/internal/systembackup/recovery/finalize.go](../backend/internal/systembackup/recovery/finalize.go) | +173 / -0 |
| A | [backend/internal/systembackup/recovery/gateway.go](../backend/internal/systembackup/recovery/gateway.go) | +231 / -0 |
| A | [backend/internal/systembackup/recovery/gateway_server.go](../backend/internal/systembackup/recovery/gateway_server.go) | +323 / -0 |
| A | [backend/internal/systembackup/recovery/gateway_server_test.go](../backend/internal/systembackup/recovery/gateway_server_test.go) | +305 / -0 |
| A | [backend/internal/systembackup/recovery/gateway_test.go](../backend/internal/systembackup/recovery/gateway_test.go) | +205 / -0 |
| A | [backend/internal/systembackup/recovery/import.go](../backend/internal/systembackup/recovery/import.go) | +209 / -0 |
| A | [backend/internal/systembackup/recovery/provider.go](../backend/internal/systembackup/recovery/provider.go) | +222 / -0 |
| A | [backend/internal/systembackup/recovery/publish.go](../backend/internal/systembackup/recovery/publish.go) | +143 / -0 |
| A | [backend/internal/systembackup/recovery/recovery_test.go](../backend/internal/systembackup/recovery/recovery_test.go) | +415 / -0 |
| A | [backend/internal/systembackup/recovery/redis.go](../backend/internal/systembackup/recovery/redis.go) | +124 / -0 |
| A | [backend/internal/systembackup/recovery/redis_adapter.go](../backend/internal/systembackup/recovery/redis_adapter.go) | +131 / -0 |
| A | [backend/internal/systembackup/recovery/retention.go](../backend/internal/systembackup/recovery/retention.go) | +105 / -0 |
| A | [backend/internal/systembackup/recovery/scan.go](../backend/internal/systembackup/recovery/scan.go) | +209 / -0 |
| A | [backend/internal/systembackup/recovery/schema.go](../backend/internal/systembackup/recovery/schema.go) | +94 / -0 |
| A | [backend/internal/systembackup/recovery/signature.go](../backend/internal/systembackup/recovery/signature.go) | +121 / -0 |
| A | [backend/internal/systembackup/recovery/sources.go](../backend/internal/systembackup/recovery/sources.go) | +228 / -0 |

### backend/internal/systembackup/scope

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/scope/inventory.go](../backend/internal/systembackup/scope/inventory.go) | +229 / -0 |
| A | [backend/internal/systembackup/scope/inventory_test.go](../backend/internal/systembackup/scope/inventory_test.go) | +172 / -0 |
| A | [backend/internal/systembackup/scope/registry.go](../backend/internal/systembackup/scope/registry.go) | +120 / -0 |
| A | [backend/internal/systembackup/scope/registry_test.go](../backend/internal/systembackup/scope/registry_test.go) | +80 / -0 |
| A | [backend/internal/systembackup/scope/runtime.go](../backend/internal/systembackup/scope/runtime.go) | +120 / -0 |
| A | [backend/internal/systembackup/scope/runtime_test.go](../backend/internal/systembackup/scope/runtime_test.go) | +65 / -0 |
| A | [backend/internal/systembackup/scope/storage.go](../backend/internal/systembackup/scope/storage.go) | +130 / -0 |
| A | [backend/internal/systembackup/scope/storage_test.go](../backend/internal/systembackup/scope/storage_test.go) | +89 / -0 |

### backend/internal/systembackup/staging

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/staging/compression.go](../backend/internal/systembackup/staging/compression.go) | +57 / -0 |
| A | [backend/internal/systembackup/staging/file.go](../backend/internal/systembackup/staging/file.go) | +151 / -0 |
| A | [backend/internal/systembackup/staging/file_test.go](../backend/internal/systembackup/staging/file_test.go) | +105 / -0 |
| A | [backend/internal/systembackup/staging/stream.go](../backend/internal/systembackup/staging/stream.go) | +225 / -0 |
| A | [backend/internal/systembackup/staging/stream_test.go](../backend/internal/systembackup/staging/stream_test.go) | +75 / -0 |
| A | [backend/internal/systembackup/staging/sync_unix.go](../backend/internal/systembackup/staging/sync_unix.go) | +14 / -0 |
| A | [backend/internal/systembackup/staging/sync_windows.go](../backend/internal/systembackup/staging/sync_windows.go) | +9 / -0 |

### backend/internal/systembackup/worker

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/worker/assets.go](../backend/internal/systembackup/worker/assets.go) | +180 / -0 |
| A | [backend/internal/systembackup/worker/assets_test.go](../backend/internal/systembackup/worker/assets_test.go) | +87 / -0 |
| A | [backend/internal/systembackup/worker/control.go](../backend/internal/systembackup/worker/control.go) | +335 / -0 |
| A | [backend/internal/systembackup/worker/control_test.go](../backend/internal/systembackup/worker/control_test.go) | +191 / -0 |
| A | [backend/internal/systembackup/worker/database.go](../backend/internal/systembackup/worker/database.go) | +283 / -0 |
| A | [backend/internal/systembackup/worker/database_test.go](../backend/internal/systembackup/worker/database_test.go) | +118 / -0 |
| A | [backend/internal/systembackup/worker/runtime_policy.go](../backend/internal/systembackup/worker/runtime_policy.go) | +108 / -0 |
| A | [backend/internal/systembackup/worker/runtime_policy_test.go](../backend/internal/systembackup/worker/runtime_policy_test.go) | +114 / -0 |
| A | [backend/internal/systembackup/worker/server.go](../backend/internal/systembackup/worker/server.go) | +59 / -0 |
| A | [backend/internal/systembackup/worker/wine_linux_test.go](../backend/internal/systembackup/worker/wine_linux_test.go) | +75 / -0 |
| A | [backend/internal/systembackup/worker/workbuddy_linux_test.go](../backend/internal/systembackup/worker/workbuddy_linux_test.go) | +61 / -0 |
| A | [backend/internal/systembackup/worker/workspace.go](../backend/internal/systembackup/worker/workspace.go) | +320 / -0 |
| A | [backend/internal/systembackup/worker/workspace_test.go](../backend/internal/systembackup/worker/workspace_test.go) | +127 / -0 |

### backend/internal/systembackup/workspace

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [backend/internal/systembackup/workspace/archive.go](../backend/internal/systembackup/workspace/archive.go) | +279 / -0 |
| A | [backend/internal/systembackup/workspace/archive_test.go](../backend/internal/systembackup/workspace/archive_test.go) | +125 / -0 |
| A | [backend/internal/systembackup/workspace/deepseek_linux_test.go](../backend/internal/systembackup/workspace/deepseek_linux_test.go) | +144 / -0 |
| A | [backend/internal/systembackup/workspace/instance_wine_linux_test.go](../backend/internal/systembackup/workspace/instance_wine_linux_test.go) | +86 / -0 |
| A | [backend/internal/systembackup/workspace/layout.go](../backend/internal/systembackup/workspace/layout.go) | +172 / -0 |
| A | [backend/internal/systembackup/workspace/layout_linux_test.go](../backend/internal/systembackup/workspace/layout_linux_test.go) | +244 / -0 |
| A | [backend/internal/systembackup/workspace/metadata_linux.go](../backend/internal/systembackup/workspace/metadata_linux.go) | +84 / -0 |
| A | [backend/internal/systembackup/workspace/metadata_other.go](../backend/internal/systembackup/workspace/metadata_other.go) | +24 / -0 |

### docs

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [docs/users-instances-backup-change-list.md](../docs/users-instances-backup-change-list.md) | — |
| A | [docs/users-instances-backup-development-plan.zh-CN.md](../docs/users-instances-backup-development-plan.zh-CN.md) | +558 / -0 |
| A | [docs/users-instances-backup-implementation-notes.zh-CN.md](../docs/users-instances-backup-implementation-notes.zh-CN.md) | +140 / -0 |
| A | [docs/users-instances-backup-premerge-review.zh-CN.md](../docs/users-instances-backup-premerge-review.zh-CN.md) | +104 / -0 |
| A | [docs/users-instances-backup-source-inspection.zh-CN.md](../docs/users-instances-backup-source-inspection.zh-CN.md) | +170 / -0 |

### examples/backup-controller

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [examples/backup-controller/README.md](../examples/backup-controller/README.md) | +292 / -0 |
| A | [examples/backup-controller/agent-matrix-fixtures.py](../examples/backup-controller/agent-matrix-fixtures.py) | +368 / -0 |
| A | [examples/backup-controller/application-identity.patch.yaml](../examples/backup-controller/application-identity.patch.yaml) | +24 / -0 |
| A | [examples/backup-controller/catalog.example.json](../examples/backup-controller/catalog.example.json) | +48 / -0 |
| A | [examples/backup-controller/controller.example.json](../examples/backup-controller/controller.example.json) | +116 / -0 |
| A | [examples/backup-controller/controller.yaml](../examples/backup-controller/controller.yaml) | +128 / -0 |
| A | [examples/backup-controller/mixed-agent-verify.py](../examples/backup-controller/mixed-agent-verify.py) | +45 / -0 |
| A | [examples/backup-controller/node-proof.pod.yaml](../examples/backup-controller/node-proof.pod.yaml) | +79 / -0 |
| A | [examples/backup-controller/provider-gateway.example.json](../examples/backup-controller/provider-gateway.example.json) | +24 / -0 |
| A | [examples/backup-controller/quarantine.yaml](../examples/backup-controller/quarantine.yaml) | +24 / -0 |
| A | [examples/backup-controller/run-agent-matrix-lab.ps1](../examples/backup-controller/run-agent-matrix-lab.ps1) | +87 / -0 |
| A | [examples/backup-controller/run-local-lab.ps1](../examples/backup-controller/run-local-lab.ps1) | +97 / -0 |
| A | [examples/backup-controller/run-mixed-agent-lab.ps1](../examples/backup-controller/run-mixed-agent-lab.ps1) | +121 / -0 |
| A | [examples/backup-controller/run-workbuddy-lab.ps1](../examples/backup-controller/run-workbuddy-lab.ps1) | +93 / -0 |
| A | [examples/backup-controller/run-workbuddy-wine-lab.ps1](../examples/backup-controller/run-workbuddy-wine-lab.ps1) | +50 / -0 |
| A | [examples/backup-controller/workbuddy-identity-fixtures.py](../examples/backup-controller/workbuddy-identity-fixtures.py) | +111 / -0 |
| A | [examples/backup-controller/workbuddy-lab-fixtures.py](../examples/backup-controller/workbuddy-lab-fixtures.py) | +333 / -0 |
| A | [examples/backup-controller/workbuddy-observed-schema-20261026.sql](../examples/backup-controller/workbuddy-observed-schema-20261026.sql) | +17 / -0 |
| A | [examples/backup-controller/workbuddy-uid-contract.v1.json](../examples/backup-controller/workbuddy-uid-contract.v1.json) | +10 / -0 |

### examples/backup-inventory

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [examples/backup-inventory/linux-agents.json](../examples/backup-inventory/linux-agents.json) | +53 / -0 |

### frontend/src/components

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| M | [frontend/src/components/AdminLayout.tsx](../frontend/src/components/AdminLayout.tsx) | +1 / -0 |

### frontend/src/pages/admin

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [frontend/src/pages/admin/BackupResults.tsx](../frontend/src/pages/admin/BackupResults.tsx) | +76 / -0 |
| A | [frontend/src/pages/admin/SystemBackupPage.tsx](../frontend/src/pages/admin/SystemBackupPage.tsx) | +118 / -0 |

### frontend/src/router

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| M | [frontend/src/router/index.tsx](../frontend/src/router/index.tsx) | +2 / -0 |

### frontend/src/services

| 状态 | 文件 | 增 / 删行 |
| --- | --- | ---: |
| A | [frontend/src/services/systemBackupService.ts](../frontend/src/services/systemBackupService.ts) | +28 / -0 |
