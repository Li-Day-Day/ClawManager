# A：canonical mutation RBAC 比较候选评审

日期：2026-10-15。A 本地接收范围为 `accepted_local_comparison_with_runtime_gates`，见[机器评审记录](evidence/a-config-rbac-local-review-20261015.json)。这是 Codex A 角色对比较规则与运行边界的评审，不是人工/部署签名或实际写授权，不放行 HTTP、SQL 生产写入或旧行回填。

## 已核对的行为

`VerifyConfigMutationRBAC` 对照 current/proposed ConfigValues 中准确的 registry version/hash、installation 和注册 wire profile，先复制原始 bytes 再解析。它比较绑定内容，忽略数组顺序；仅 version/hash/排列变化不自行构成安全变更。固定角色权限沿用 v12 `admin-operation-policy.json`，额外角色定义/字段、未知角色、重复或非规范 actor ID、外安装、错误主体与 pin 不符均拒绝。

| 情况 | 结果 |
| --- | --- |
| viewer/operator 请求配置变更 | 当前 configure 权限检查拒绝 |
| config_admin 普通配置、绑定内容相同 | 要求 configure；metadata/数组顺序变化不误加 MFA 风险 |
| 绑定实际变化或 resolver 提供安全风险 | 要求 security_configure；service 还必须执行 fresh MFA/nonce |
| 保留期等降低保护或 resolver 提供降低保护风险 | 要求 destructive；service 还必须执行 fresh MFA/nonce/非空原因 |
| 按稳定 actor ID 给自己增加 security_admin，包括同时改变 subject | 拒绝，不能通过新 subject 绕过自我提权规则 |
| 删除最后一个 security_admin 绑定 | 拒绝；有另一个绑定时允许有权调用者自我降级 |
| 比较结果对外序列化 | 拒绝；RequiredPermissions 返回独立副本，不是可执行 grant |

## 主体边界回归与并行修订

A 新增[表示域回归](../backend/internal/systembackupsecurity/config_mutation_rbac_a_contract_test.go)，验证“被计为管理员的 subject 至少必须能由执行器的 actor 输入表示”。[修订前固定输入](evidence/a-config-rbac-baseline-source-snapshot-20261015.json)下，[原始输出](evidence/a-config-rbac-repro-20261015.txt)确认 257 字节 ASCII 和 258 字节中文 subject 都被比较器接受，但写入器明确拒绝；两项恰好 256 字节的对照正常通过。复现退出 1，没有 Go 工具故障。

并行 D 实现随后已补充 current actor 和所有 binding 的 256 字节/有效 UTF-8 检查，A 保留并审查该修订，没有覆盖其改动。超预算字段现在在计数与权限决策前拒绝；合法 256 字节的 ASCII/中文边界保留。此规则只保证表示域一致，不能单凭字面绑定计数证明该 principal 存在、活动或能够登录。

## 本地验证

同一验证套件依次运行 baseline、固定修订副本的 RBAC 定向与完整 security/read 两包；缓存只在活跃套件内部复用，最终统一删除。默认 vet 开启，依赖下载关闭，所有阶段使用现有 Go 1.26.1 / Windows amd64。修订后定向 6 个主测试、26 个子用例通过；全包 163 个主测试、712 个子用例，共 875 项检查通过，无工具故障重试。

- security：113 个主测试、506 个子用例，54.410 秒。
- read：50 个主测试、206 个子用例，3.241 秒。

见[定向输出](evidence/a-config-rbac-targeted-20261015.txt)、[完整输出](evidence/a-config-rbac-full-20261015.txt)与[套件终态](evidence/a-config-rbac-suite-state-20261015.json)。定向/全包重复的用例不叠加计为独立通过项。

[最终副本](evidence/a-config-rbac-final-source-snapshot-20261015.json)有 985 项输入，测试后副本哈希核对零变化，接收时已有 live 输入零漂移。baseline 为 983 项，期间只有 RBAC 文件修订，另新增 session helper 与其测试；它们进入全包编译/测试图，但本 RBAC 评审不等于完整 session/runtime authority 的独立签收。

准确目录 `.tmp-a-rbac-review-165b26f50a274bcaac3d1f0f2fd52140`、两份测试源码副本、cache/tmp/telemetry 和二进制均已删除，并独立确认不存在。未安装依赖、未执行 SSH、真实 MySQL 或迁移。

## 必须保留的运行门禁

1. readiness/final recheck 必须从同一准确 registry 内容派生并传递 RBAC 风险，合并其他 registry 的风险。不能只在 Authorize 中查当前权限，却让 service 因风险漏传跳过 MFA/nonce；Authority 应拒绝低报风险。
2. 生产边界独立验证用户存在/活动、稳定 actor/subject 映射、当前 session/撤销和可用管理员。比较结果不证明这些事实，也不包含运行写权限。
3. fresh MFA、nonce、审计、容量、完整响应 evidence 与同事务 commit 仍由已评审的具体适配和 service 完成；实际 MySQL 的并发/锁等待/回滚/未知提交仍需验收。
4. 维护回填使用独立主体与授权，不借用该 Admin 比较器；其[摘要格式补充](system-backup-a-canonical-maintenance-digest-handoff-20261015.md)也不生成 grant。具体运行授权和旧 canonical 原文仍未交付。
