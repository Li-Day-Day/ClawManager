# A2：六类 bootstrap registry 的现有合同覆盖

已逐项读取现有 schema、原分工计划和 broker parser。下表把可引用的结果合同与尚需原 owner 提供的 registry 正文分开；CLI 仍缺 27 槽，本轮清槽 0。准确字段、JSON pointer、合同状态、全文摘要和 schema 目录盘点见[机器记录](evidence/a2-bootstrap-registry-contract-coverage-20261027.json)。

| Registry | 现有可引用合同 | 仍需固定的正文/准入决定 |
| --- | --- | --- |
| parts；A/B/C 分项；D 合同/组合 | [manifest-system-backup-v1.schema.json](../contracts/system-backup/v12/manifest-system-backup-v1.schema.json) `/properties/parts`；[artifact-common.schema.json](../contracts/system-backup/v12/artifact-common.schema.json) `/$defs/PartSummary`；[runner-data-interfaces.schema.json](../contracts/system-backup/v12/runner-data-interfaces.schema.json) `/x-interfaces/1` | 部署/profile 至必选集合、各 part 源身份/owner、collector 实现和 depends_on 的原 registry 正文及准入规则。六种允许名称和完成声明不能推导每个部署的完整必选清单。 |
| redis_sources；C 资源；B 关联 workload | [artifact-common.schema.json](../contracts/system-backup/v12/artifact-common.schema.json) `/$defs/PartSummary/properties/checkpoint_type`；[runner-data-interfaces.schema.json](../contracts/system-backup/v12/runner-data-interfaces.schema.json) `/$defs/RequestContext` | 源 registry 中 topology/实例身份/连接引用/TTL 与一致性策略、collector 支持矩阵的正式字段与原观察来源。结果支持 RDB/scan-window 不证明具体部署能使用这些 profile。 |
| failure_domains；A/B/C 事实；D 合同 | [manifest-system-backup-v1.schema.json](../contracts/system-backup/v12/manifest-system-backup-v1.schema.json) `/properties/target` | 稳定域 ID 的原身份定义、源/目标全关系、append-only 历史及 attestation 绑定/到期/撤销的 registry 正文。名称或 target 摘要不能证明物理隔离。 |
| disaster_identity_mapping；A 安全映射；B/C 恢复语义 | [manifest-system-backup-v1.schema.json](../contracts/system-backup/v12/manifest-system-backup-v1.schema.json) `/properties/config_recovery`；[secret-ref.schema.json](../contracts/system-backup/v12/secret-ref.schema.json) `/$defs` | 原身份到灾难身份的受控版本化 typed 映射、安装/用途/权限/期限和覆盖/歧义规则。config_recovery 的 redacted_parameters 仍有明确 freeze blocker，不能当完整恢复映射 schema。 |
| source_writers；B 主 writer 清单；A/C 提供各源 writer | [source-writer-check-state.schema.json](../contracts/system-backup/v12/source-writer-check-state.schema.json) `/properties/observed_inventory_hashes`；[source-writer-check-state.schema.json](../contracts/system-backup/v12/source-writer-check-state.schema.json) `/properties/check_state`；[source-writer-check-state.schema.json](../contracts/system-backup/v12/source-writer-check-state.schema.json) `/properties/reason_code` | 完整实际 writer inventory 的 typed 正文和稳定身份、各 writer 的 lease/participant/拒绝/恢复策略及差集观察来源。五个 hash 与 clean 状态是结果，不能证明实际 writer 集合完整。 |
| secret_allowlist；A；B/C 实际使用方 | [secret-broker-read-allowlist.json](../contracts/system-backup/v12/secret-broker-read-allowlist.json) ；[secret-allowlist-functional-test.json](../contracts/system-backup/v12/secret-allowlist-functional-test.json) ；[secret_broker_server.go](../backend/internal/services/k8s/secret_broker_server.go) `ParseSecretBrokerReadAllowlist` | 当前安装准确 namespace/Secret UID/版本、用途/工作身份授权，以及原 JSON registry 至 broker 字符串的受审 typed 转换。两个不同 schema_version、空 staging 与单条 functional-test 不能相互替代。 |

manifest 允许六种 part 名称、最少出现一项；每个已出现 part 要求 required/completed，这不能推导任一部署的必选集合。source-writer check state 固定五类 inventory hash 与 clean/drift/unknown，但仍要求真实 inventory 和完整差集。secret allowlist 两个 JSON 的 schema_version 不同，broker parser 又是字符串格式；目前没有把示例视为当前安装的 UID/版本/用途授权。

`manifest-system-backup-v1.schema.json#/properties/config_recovery/properties/redacted_parameters/x-freeze-blocker` 明确要求在 freeze 前替换为闭集恢复参数 schema。完整目录中的其他明确 freeze blocker 也按原文列入机器记录；本次没有替原 owner 作合同决定。

复核：`node docs/evidence/a2-bootstrap-registry-contract-coverage-20261027.mjs --check`。此命令只读受控合同和本地源码，不读取凭据或现场材料，不运行 Go 或访问 SQL。
