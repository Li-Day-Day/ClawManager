# A：公开错误合同对齐与配置响应接线待决

2026-10-15。本轮把实际 registration/strong-auth 错误行为与 v12 `admin-operation-policy.json`、`admin-operation-errors.json` 对照，补齐前一轮只验证“既有映射保持不变”留下的语义偏差。原[错误边界回执](evidence/a-registration-error-boundary-review-20261015.json)保留为其固定源码的历史结果；其中 403/409 强认证状态不再作为后续公开 API 接收依据。

## 已实施的错误行为修订

- `strong_auth_required|invalid|invalid_issuer|expired|replayed` 统一按既有机器状态表返回 401，权限拒绝继续 403。TOTP 凭据错误也为 401。
- provider validation 为 400，签名、checksum 与版本冲突为 409；未知 provider code 仍收敛成固定 `signature_invalid`。真正未经分类的 HTTP service 错误返回 500 `internal_error`，已分类依赖/存储失败继续 503 `not_ready`。
- malformed/重复 strong-auth header 为 400 `validation_failed`，不混用认证失败代码。
- 新增 `FailureRequired`。新 provider 请求先完成当前权限和幂等查找；确无已提交收据且 proof 完全缺失时返回 required，不加载 nonce/强认证材料，不占 key。既有成功重放仍可不提交新 proof。配置安全变更缺 proof 同样使用 required。
- provider error profile 补入实际 version conflict 和依赖 not-ready；config mutation profile 补入 body size 与依赖 not-ready。这是 draft profile 的 A 增量，未改变既有状态映射表、响应字段或任何 reviewer/freeze 标志。

新增测试从准确机器 JSON 读取状态映射与 provider profile，再与真实 HTTP 错误返回比较；另覆盖先缺 proof 被拒绝、随后同 key 合法提交、最后无 proof 精确重放，以及配置 missing-proof 和实际 JWT/密码/TOTP HTTP 错误。旧 nil/未知代码回归保留，并按新的合同状态验证。

机器合同测试首次 `node --test` 因沙箱 `spawn EPERM` 未启动实际用例，保留[失败尝试 transcript](evidence/a-registration-contract-artifacts-20261015.txt)，该具体环境错误来自工具结果观察。改用同一文件的进程内 `node scripts/system-backup-contract-artifacts.test.mjs` 后，控制台显示 70 项通过，但 [r2 transcript](evidence/a-registration-contract-artifacts-20261015-r2.txt)没有原生 stdout。发现记录缺口后，以既有 native host-forwarding helper 再跑相同检查，[r3 完整记录](evidence/a-registration-contract-artifacts-20261015-r3.txt)已包含 70 pass、0 fail、退出 0。以 r3 为落盘依据，不叠加重复计数；未安装依赖或修改机器环境。

Go 门禁已通过，见[完整输出](evidence/a-registration-contract-local-20261015.txt)、[1,211 项固定输入](evidence/a-registration-contract-source-20261015.json)与[增量接收记录](evidence/a-registration-contract-review-20261015.json)。输入摘要为 `866a867325db2171830aadb589b998b74e6197d10532b969fe36fa0b681249fb`；定向 8 主测试/59 子用例（1.160 秒），完整 security/config 两包 177 主测试/911 子用例（1,088 项）全部通过。security 为 157/798、18.674 秒，config 为 20/113、3.616 秒。默认 vet、退出 0、无工具重试；定向重复覆盖不另加总。

[专用入口](../scripts/system-backup-a-registration-contract-validation.ps1)随后编译全部 tagged security 测试，且只运行无数据库 seed 1/6（1.094 秒），没有执行真实 MySQL 或旧远测套件。冻结副本复核通过，10 项本轮源码/测试/合同/入口仍匹配；两项并行 D response binding 文件的后续漂移不据本轮冻结回归接收。准确目录 `.tmp-a-evidence-5d8ce7cdd39048b491b8ad131411d5b7` 与 `.tmp-d-index-cache-895be79a14ac4cf8aaa994d894303208`、源码/cache/tmp/telemetry 和产物均删除，并独立确认不存在。原状态映射表、A canonical 写入合同及 066 hash 不变；本轮仅修订实现与 draft profile 成员，未变更 reviewer/freeze 标志或授予生产权限。

## 配置成功响应尚未对齐：A-CONFIG-WIRE-01

当前 OpenAPI 中 update/rollback 的 200 均引用 `#/components/responses/Operation`，准确解析为 `task-operation.schema.json#/$defs/Operation`；当前 mutation writer 与完整响应内容链构建的是 `system-backup-config.v1` ConfigResource。两种对象的字段、语义和 response hash 不同。此前针对 ConfigResource 内容、加密及重放的本地回执，只能证明该候选内容链，不能证明符合公开成功响应合同。

在 HTTP 部署前，D 的响应/receipt 设计与 A 审计、幂等策略必须统一：按既有公开合同返回完整 Operation，并让保存/重放的原始响应准确对应实际发送字节；若拟改变公开合同，应先显式评审机器 schema/示例/客户端及原响应收据语义，不能仅改路由 `$ref` 绕过。不得以当前状态查询后临时包装或重建一个不同于原 response hash 的对象来宣称原样重放。

该 finding 保持 open，未为此打开配置写 HTTP、迁移候选或签发部署写权限。具体原文、维护 writer/运行授权、proof MySQL 回执及 B/C 生产来源仍按各自门禁推进。

[机器审计记录](evidence/a-config-success-wire-audit-20261015.json)保存准确 OpenAPI/schema/candidate 指纹，确认 ConfigResource 缺少 Operation 的 14 个必需字段，并含六个 Operation 禁止的字段；schema_version 常量本身也不同。下一步先提供准确 Operation canonical builder，再统一 D writer、内容策略和收据重放；不得将既有 ConfigResource 本地回归解释为已经关闭本 finding。
