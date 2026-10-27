# D：producer 四命令生命周期事务

日期：2026-09-30。承接 [事务内锁定读取与 CAS](system-backup-d-producer-sql-20260930.md)。新增可执行的 Acquire/Renew/Revoke/Takeover 事务服务；生产环境认证、容量和审计适配仍未落地，服务没有 HTTP/controller/worker 启用入口。整体 producer 目标继续推进，不能将本轮视为生产验收。

## 实现

[lifecycle.go](../backend/internal/systembackupproducer/lifecycle.go) 提供 `NewLifecycle` 和 `Execute`，复用已有事务执行器和八表存储层。每次请求先校验并深拷贝；事务 scope 固定。按安装/config 前缀、domain、当前身份、command receipt、排序的 grant/run、host、target/ref、容量、intent audit、状态写入、receipt、result audit、最终复查顺序推进。最终复查之后再次检查数据库时间，提交确认之后才可能返回私有执行句柄。

| 命令 | 数据行为 |
| --- | --- |
| Acquire | 只消费已有有效域；锁定新 grant/run 和不存在的 target，创建 generation=1 的目标及 acquired run，观察时间保持 null。不创建 installation/config/domain。已有目标必须使用带原 grant/run 的显式 Takeover。 |
| Renew | 要求本服务签发的原执行句柄、相同主体、当前 grant 版本与 target/admission，以及未到期的原租约。即使请求相同租期也增加 grant row_version；不改 run 写截止、观察时间或历史密文。 |
| Revoke | 要求独立管理权限和精确版本；允许租约或原授权已过期。只撤销 grant，不修改 run 历史或删除 evidence。资源耗尽时的独立紧急 domain 撤销通道仍待部署适配实现。 |
| Takeover | 要求旧租约已过期，或当前独立认证过的终止决定摘要精确匹配。使用新 grant/run/evidence，目标代次严格加一、结果版本保留；旧 run 仅标记 superseded，不刷新其写截止/观察时间。已提交的旧 run 保留历史状态。 |

收据保存完整请求和 outcome，完整请求摘要不匹配的同键调用拒绝。重放要求独立的精确历史收据读取授权，不能只使用旧句柄或匹配的 actor hash；只返回原收据，不增加租约/代次、不重复收费、不生成句柄。这一路仍要求当前请求 domain/epoch 适用；跨配置/关闭域的独立 `ReadReceipt` 恢复入口尚未实现。

`ExecutionHandle` 字段私有、不可 JSON 编解码，绑定服务实例、scope、主体、grant/generation/version/run。它是进程内已提交身份，不是 provider 令牌。提交不明返回空结果和 `ErrCommitUnknown`，不重试；已知提交但返回时过期只返回历史收据和 `ErrCommittedExpired`，不返回句柄。

## 必需的生产环境边界

`CommandEnvironment` 是服务端受信接线，不是请求 DTO。构造拒绝 nil/typed-nil 实现，没有通用成功实现。生产实现必须完成：

先在 BEGIN 之前执行 `Prepare`，为每次调用建立独立 `CommandSession`，固定容量报告和部署身份输入。服务复制原报告时间；事务内 Reserve 只能使用该报告，不能返回替代时间。缺报告仅允许独立授权的精确收据重放，新分配拒绝。安装/身份锁等待也计入原报告的五秒窗口。

- 安装/config 存在与空范围的完整前缀锁；domain 由服务自行读取。
- 当前主体、撤销、部署 issuer、三场景 admission、完整 evaluator/profile/槽、host 与请求上限认证；绑定完整请求摘要。管理撤销、精确历史收据读取和终止决定各自独立授权。
- L4 host、L5 projection/ref/hold、L6 固定容量报告与 reservation、L7/L9 原子审计，以及 L10 已锁权威的 current read 复查。回调不得重新取更早层锁、调用远端或刷新报告。

`CommandAdmission` 是该环境返回的数据，不是可由请求字段构造的授权凭据。环境收到的请求、domain 和最终 facts 都是副本。固定期限在环境返回后复制，不能通过共享对象延长。

新增行收费按 C1 的 64 KiB 固定事务成本、各表记录上限/4 KiB 取整及每行 64 KiB 成本计算，再加环境证明的现有审计等成本一次。算术拒绝 uint64/int64 溢出，重放不调用 Reserve；固定报告在等待之后和最终 Guard 复查。收据保留期限至少覆盖已知原授权/写截止/观察期，额外配置保留规则仍由环境核验。收据 `CommittedAt` 是该提交事务内采样的数据库时间，最终授权检查及实际 commit 在其后；不能拿它声称磁盘提交精确发生于该微秒。

## 验证与未完成项

最终脚本退出码为 0：Windows 25 个顶层测试、含子测试共 348 项通过，默认 Go vet 通过；Linux 测试二进制交叉编译通过，未执行 Linux 二进制。缓存与构建产物已清理。migration catalog 仍为 94 文件，hash 为 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。

[lifecycle_test.go](../backend/internal/systembackupproducer/lifecycle_test.go) 使用支持 BEGIN 快照/rollback 的标准库测试 driver，执行申请→重放→续租→重放→撤销、过期/终止接管、profile 换版、精确成本、身份/权限/版本/容量/审计失败、commit 不明和返回跨期等场景。它验证本地事务决策和 SQL 参数，不证明实际部署认证、真实 InnoDB FK/gap locks、provider 或跨进程行为。

验证沿用禁止依赖下载并自动清理产物的 [脚本](../scripts/system-backup-d-producer-validation.ps1)。最终结果和源码指纹见 [机器记录](evidence/system-backup-d-producer-lifecycle-20260930.json)。旧文档和机器记录保留历史范围，不重写旧指纹。

仍须实现生产 `CommandEnvironment`、独立域 provisioning/紧急撤销、BindObservation、固定调用快照、pending/claim/发布/结果事务、跨配置历史收据与恢复、A 实际适配、C 独立证据通道和真实 MySQL V01–V10。八表 DDL 尚未执行或纳入正式 migration/catalog/inventory；C1 评审门槛保持。Acquire 已有目标走 Takeover、重放的独立读取授权和收据时间语义应随具体接线交由 A/C 复核，不能代填批准。
