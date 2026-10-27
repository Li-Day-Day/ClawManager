# A：系统 evidence/chunks 加入 D pending 事务

日期：2026-10-08。承接 [D pending 原子事务](system-backup-d-producer-pending-20260930.md)及 [A 固定调用准备链](system-backup-a-system-execution-20260930.md)。本轮提供 A 的实际 registry/chunks SQL 适配，外层 BEGIN、最终 Guard 和提交仍由 D 负责。生产部署认证、容量/审计/引用环境、完整现场联调及后续发布并未完成。

## 构造与接线

[NewSystemPendingEnvironment](../backend/internal/systembackupevidence/system_pending.go) 接受 A 已成功返回的私有 Prepared、独立证据通道、原 HistoricalBindingRecord 及必需的 SystemPendingAuthority。不能通过普通 Manifest、请求 JSON 或空 Prepared 制造准备结果。构造时经过 D 的严格历史记录解码，随后用 A 的完整 C1 映射比较 manifest/content/object/store/key/write/recovery 摘要、大小、分类和相对路径；要求 pending 的 immutable_version 为空。

环境固定完整历史摘要。每次 PreparePending 验证原历史及绑定，生成独立会话，复制容量报告和向 authority 传出的分块数组，避免被后续修改。保留截止同时写入 expires_at/protected_until，原 owner 写截止来自已绑定的历史，不通过 L8 再次查询 grant/owner。

接线顺序为：独立部署环境实现 SystemPendingAuthority；以原 Prepared/channel/history 构造本环境；把它传入 D NewPending；对原 ExecutionHandle 调用 AdmitPending。不能在这些回调中调用旧 SQLRegistry.PersistPending、重新 Wrap、另开事务或访问 provider。

**SystemPendingAuthority 没有生产成功实现或默认放行。** 它仍须核验实际部署/身份/撤销/host/ref、原 evaluator 与准备来源、完整历史和保留策略，在 L6 收取包含 A registry/chunks/legacy refs/audits 的准确费用，并在最终 Guard 中验证原权威状态。调用者历史 hash 或一个 Prepared 本身不授予权限。此组件只补上实际 A 行的写入与回读；它不替代这些生产检查。

## 同事务 SQL 行为

- L8 按 public_id 锁 evidence 行或缺席范围。已有记录逐项核对全部 29 项不可变字段（含 schema、owner、正文/密文/分块摘要、准确 store/KEK、NULL 字段、创建及保留期），再按 chunk_index 锁并核对全部分块字段和 nonce/tag 原始字节。重复行、少块、多块、字段不符、读取/迭代/关闭失败均拒绝。
- 首次登记只能来自已锁定缺席的会话，SQL 参数只取原准备产物，不取调用者 DTO。使用具体 D Transaction 的 CAS 插入 evidence 和每个 chunk，要求每次影响恰好一行；插入后按 public_id 读取准确内部 id，不依赖 LastInsertId。
- 该组件不暴露 BEGIN/Commit。D 可在同一事务写历史绑定、hold、run 状态与审计。适配失败被会话记住，SQL/CAS 失败另由 D 锁存；重复 lock/insert、错误绑定、错误事务或忽略错误均不能通过最终检查。
- 最终 Guard 先调用实际 authority.Recheck，再对 L8 已锁的准确行作 current read，核对原不可变字段、完整 chunks 以及本次预期的 state/version/claim/health/reconcile 时间。它不新增业务锁、不写审计、不执行网络或文件 I/O。result audit 意外改变 evidence/chunks 时也会导致整笔回滚。

首次新写固定 pending/none、row_version=1、unknown health，无 immutable version、inline payload、claim 或 reconcile 记录。完全相同的重放只允许 pending/write_unknown；保留既有版本、claim 和原观察元数据，不重新插入或更新。ready、缺失 evidence/chunks、变化的历史或任意原字节不同均拒绝。是否授予 ReadExisting、是否重复收费、D 原 run/hold 是否精确匹配仍由 D pending 与生产 authority 决定。

没有 evidence 内部 id 的缺席路径只锁父表 public_id 范围；子表 FK 禁止插入不存在父行的 orphan。新写先创建父行，随后插入确定分块。真实 MySQL 的 FK/unique/gap lock 效果仍需独立验证，不能由本地模拟 driver 的结果宣称已证实。

## 本轮验证范围

[新增测试](../backend/internal/systembackupevidence/system_pending_test.go) 使用 D 的真实 Transactions 执行器、A 的实际 SQL 和带 BEGIN/rollback 快照的标准库 driver。evidence/chunks 与模拟的 D/审计参与行共享同一事务；测试检查一次提交、只读重放、write_unknown/claim 保持、提交不明、分块/父行/CAS 失败、结果审计失败、最终 authority 拒绝、最终行/分块变化、等待跨过预算或容量窗口，以及错误被调用者忽略后的回滚。

其他拒绝测试覆盖 owner、manifest、retention、准确路径、ready、缺行/缺块/多块、nonce、分块序号、inline、claim 配对、错误版本/失败码、重复 evidence 行、列数错误、迭代和关闭失败。PreparePending 测试验证策略副本与容量采样隔离，并拒绝空准备结果、缺失 authority/session、变更历史及取消上下文。最终 Guard 还要求 Evidence.Existing 与实际已写入或重放状态一致；SQL 读取失败保持 ErrUnavailable，不将暂时不可用误报为证据损坏。

测试没有从真实 Lifecycle/Execution 生产环境成功签发句柄后贯通 AdmitPending；D 自己的 pending 编排用例在完整两包回归中一同执行。这两部分证据不能替代完整生产环境联调、真实 MySQL 的 FK/gap locks、跨进程并发、provider 或生产审计收费验证。

运行 [冻结源码验证脚本](../scripts/system-backup-a-producer-adapter-validation.ps1)，禁止依赖下载、保留默认 vet，结束后删除本轮源码副本、缓存、遥测目录和 Linux 测试二进制；Linux 二进制仅编译、不执行。准确结果见 [机器记录](evidence/system-backup-a-system-pending-local-20261008.json)。此前已成功的远程 MySQL 登录状态套件未重跑。

首次日志 `system-backup-a-system-pending-local-20261008.txt` 保留失败历史：模拟审计参与方直接返回内部 SQL 错误，导致 audit 子用例的脱敏断言失败；该用例的整笔回滚断言已通过。修正模拟回调的错误边界后，另补真实加载器的不可用分类与最终存在标记检查，用新的冻结快照重新运行并写入 `system-backup-a-system-pending-local-20261008-r2.txt`。第一轮退出 1 并完成清理，不计为成功；最终状态以机器记录为准。

修正版 Windows 两包回归通过 150 个主测试、1489 项含子测试记录，其中本轮新增 SystemPending 的 6 个主测试、46 项含子测试记录全部通过。修正版输入冻结为 219 个文件；总数包括既有 A/D 用例，不等于新增用例数。

修正版 Linux evidence 测试二进制交叉编译和默认 vet 通过，进程退出 0；未执行 Linux 二进制。修正版无断言失败、编译器故障或工具重试。全部 A evidence 源码保持与已测快照一致；验证期间新增的 D finish.go、finish_test.go 不在本轮最终版本验收范围。两轮本地缓存、源码副本、遥测目录和测试二进制均已删除，未安装依赖。

## 剩余工作

生产 SystemPendingAuthority 必须与 Command/Execution 环境共享部署、引用、审计及容量的完整锁计划。还需真实生命周期到 pending 的集成验证、现场 MySQL 事务/竞争验收、A 对 D 新增 ClaimPublication 的实际适配、FinishPublication、A 系统 STS/发布/恢复及 C 的独立证据通道。D 的 claim 实现及测试正在并行变化，准确已测范围以本轮快照为准。当前 pending 结果仍是历史数据，不能作为 STS/PUT 凭证。本轮没有修改公共合同、DDL、生产路由或启用开关，不构成系统全流程完成或 V01–V10 通过。
