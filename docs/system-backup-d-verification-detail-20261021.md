# D：校验记录详情与报告下载入口

【2026-10-22 校验历史详情的矛盾字段保护已接收】[实现与验证](system-backup-d-verification-consistency-20261022.md)在共同控制读取层拒绝非 committed backup 被标为可用，并要求 restored_usable 对应 full 的 false→true；health 升级拒绝也纳入共同边界。合法 catalog-import null 状态和原始可用性观察保持。旧代码对照准确击中 44 叶子，24 项合法/既有拒绝控制通过；隔离及写回后 read 完整包各 97 主/943 条通过事件、default vet、268 项输入及集合复核通过。准确 owner 及 2,915 份文件已清理，无依赖安装或远端。当前 artifact-verification 历史详情已有真实只读代码入口，本轮补字段一致性；不据此证明 C 同版本实际验证、当前 provider/下载、其余三类详情或原六项整体完成。

新增真实只读入口：`GET /api/v1/admin/system-backup-artifact-verifications/{id}`。它使用现有安装／配置／人员 session／RBAC 授权；原三个任务详情暂时继续保持未就绪。没有修改公共机器合同、业务状态、迁移或生产准入。

## 本次选择这一类详情的依据

机器权威 [ArtifactVerificationDetailResource](../contracts/system-backup/v12/admin-task-detail-resources.schema.json) 定义的是本次校验的 `artifact_state_before/after`、`usable_before/after`、观测 checksum 和 decision reason。该文件的 owner boundary 明确 D 暴露 lifecycle projections 和登记引用，A 的检查正文及 C 的 locator／签名正文在这个视图之外；主计划第 6 节也将这些历史字段列在 verification 任务表中。

因此本接口呈现控制库中保存的校验记录，不将历史的 after 状态称为今天的 provider 可用性。它支持记录中的 backup 和 catalog-import 两种历史来源引用，不尝试读取当前 catalog body、对象或 provider。其他三类任务含有当前资格／可用性或报告有效性要求，不能由本轮推导为已就绪。

## 字段来源和一致性

所有查询沿用原 `readTaskInTransaction` 的 RepeatableRead 事务、安装绑定及最终授权复查，成功提交后若请求已经取消也只返回零结果。

| 详情字段 | 实际来源与核对 |
| --- | --- |
| Task 公共头、安装、配置版本及 row version | 原受信安装限定的任务投影；仅转换合同允许的字段 |
| Task 的 heartbeat、next reconcile、started、finished 时间 | 同一任务行的单独固定列查询，再核对原 row version；failure message 明确置 null，不选择原始错误正文 |
| 当前 attempt／phase | 完整 attempt 行中最高代次；artifact verification 只有 verify phase |
| Job generation | 当前 attempt 只有一个 Job unit 时返回其 generation；多个 unit 保留 null，避免拼成一个不存在的 Job |
| 最后业务进度 | 当前 attempt 的已接受 Job business-progress 时间和 owner 检查时间的最大值；不使用 Task heartbeat，也不借用旧 attempt |
| verifier aggregate／计数 | 当前 attempt 的 owner-submitted check rows，按 failed > warning > passed > skipped；同时核对任务保存的汇总，拒绝漂移，不把旧 attempt 累加为当前结果 |
| source／observed checksum／前后状态与原因 | 原 verification 任务行中保存的历史投影，沿用已有控制字段闭集和组合校验；health 检查不能把 false 恢复为 true |
| 检查证据引用 | 复用 A 的同事务 check/evidence owner 与 checksum 绑定读取 |
| health report 和 verifier report | 追加核对登记 evidence 的 schema、准确任务 owner type／ID、content checksum 和创建时间；报告不得早于当前 attempt，无 attempt 的记录不能携带当前报告 |

不会读取 config snapshot、failure message、check expected/actual body、provider locator、密钥或报告正文。不把报告引用存在当作对象当前可下载；实际下载仍由既有下载运行时重新准入、验证并审计。

缺行经过最终授权复查后为 404；撤权、坏记录、缺失报告、摘要或 owner 不符、汇总漂移、查询／提交失败都不返回部分详情。HTTP 返回 `live` 来源、安装和 Task row-version 头，供既有页面校对所选记录。未知 query 直接拒绝。

## 页面和下载

已有真实记录页选择 artifact-verification 后可读取本接口，展示状态、执行、检查计数、来源和前后可读性。报告下载入口优先使用 verifier report；不存在时使用该记录的 health report。入口固定证据 ID 和安装，沿用已有密码／TOTP、同一幂等键、SHA-256 核对与保存流程。

2026-10-22 复核修正：导入来源可以没有校验前／后的可读性结论，`usable_before/after=null` 现显示已有本地化的“未知”，不再由 JavaScript 的 falsy 分支显示成“不可读”；明确的 false 仍为不可读。详情／下载 55 项回归和应用 TypeScript 检查通过，临时 tsbuildinfo 及目录已清理。[限定回执](evidence/d-verification-detail-nullability-20261022.json)不声明浏览器渲染或现场成功。

这不是一条成功的现场下载回执：用户选定 namespace 的有效配置和独立下载运行时仍待建立。详见 [读取与运行装配](system-backup-d-read-runtime-20261021.md)。

## 验证状态

完整读取包的当前轮执行已通过；新增四个根测试及其子场景通过，覆盖两类历史来源、当前 attempt 计数、并行 Job、业务进度、登记引用、坏来源／撤权／取消／提交失败。前端 TypeScript 与原 37 项下载回归通过，前端临时产物已清理。

已有 UID-pinned `TestDAdminReadLiveHTTPMySQL` 增加详情 200、未知 query 400、跨安装 404、撤权 403、安装／row-version 头及失败正文脱敏断言。只修改既有隔离夹具，不在用户业务 namespace 中造记录。主 API 包完整测试已在 `2a5c1cb5411b4e55bed2505b5cf3f007` 原生执行中通过；同轮 DB 包失败，不能把多包总状态当成通过。DB 夹具／快照输入修复后的重跑及 Linux 编译结果见[运行装配记录](system-backup-d-read-runtime-20261021.md)。真实 SQL 尚未执行。

最终[本地运行回执](evidence/d-read-runtime-local-0da6a5c1b59145eea3f002368a80ddb7.json)已确认完整 DB 测试及默认 vet、Linux 主 API 和两个隔离探针编译通过。探针没有执行实际 SQL；现场详情与下载尚未验收。旧 UTC 快照不含本次详情，没有沿用其通过结论；新旧自有冻结源码、缓存、检查点和二进制均已清理并独立核对，未安装依赖。
