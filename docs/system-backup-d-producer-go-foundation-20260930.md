# D：producer Go 合同与事务执行基础

日期：2026-09-30。承接 [C1 合同交付](system-backup-d-producer-authority-contract-20260930.md)及 [A 系统适配设计](system-backup-a-system-producer-adaptation-20260930.md)。本轮交付可编译的 Go 数据合同和强制最终检查的事务执行基础，供 D/A 后续实现接线。**没有 producer 签发/续租服务、生产 SQL Policy、正式新表迁移或 runtime 启用。** C1 的 A/C 签收及采用 Job 时的 B 签收仍待完成。

## 交付代码

新增标准库包 [systembackupproducer](../backend/internal/systembackupproducer/types.go)：

- `types.go`：ResultRequest/CommandRequest、三场景 Admission、两种 Host、两类 Results 和全部 8 类记录。uint64 用规范十进制字符串保存；转换到旧 SQL int64 显式检查溢出。Timestamp 精确到 UTC 微秒。
- `decode.go`：`DecodeResult`、`DecodeCommand`、`DecodeRecord`。严格检查完整对象字段、必填 nullable、重复键（含转义后重复）、大小写别名、无效 UTF-8/未配对 surrogate、尾随第二个 JSON 值、深度和大小。验证失败不修改调用者原对象。原始 JSON 最多 1 MiB，canonical request 仍受 C1 的 32/64 KiB 上限约束。
- `codec.go`：typed-frame 编码与域分离 hash，与已交付 C1 golden vectors 按字节比较。完整请求和幂等键分开，Target 的 profile 更新不改变同一逻辑目标 fence。
- `validate.go`：六角色/evaluator、完整有序结果槽、时间、nullable、结果/命令/历史收据绑定等语义验证。数据通过校验不代表主体已认证或当前授权仍有效。
- `transaction.go`：必须注入 Policy 的事务拥有者；同连接校验 DB UUID、库名、UTC；固定 RepeatableRead；在 Work 的全部写入/审计后强制当前权威复查和新鲜 DB 时间检查；任何 CAS 非一行使整笔事务不可提交。

该包只使用 Go 标准库，不引入依赖。它尚未被 controller/HTTP/worker 导入，不能通过构造 schema-valid 数据获得权限。

## 事务接线要求

`NewTransactions(db, scope, policy)` 拒绝 nil/typed-nil Policy。`Policy.LockAndAuthorize` 必须由受信实现取得已评审 L0–L6 锁、认证主体并验证 scope/config/grant/run/ref/目标绑定；返回绑定 hash、完整 deadline 集合及本次原容量报告时间。缺身份、证明或锁事实就返回错误。该接口没有通用成功实现。

`Run` 取得锁后再次读数据库时间；只有全部截止与原报告新鲜度通过才调用 Work。Work 负责本次业务写入、chunks、引用/收据、容量与审计，最终 CAS 必须使用 `Transaction.CAS` 精确断言一行。失败会记录在事务内，即便 Work 错误地忽略返回值也不能提交。

Work 结束后关闭其 SQL 操作能力，阻止保留的引用继续写入。包装器只接收带参数的单条 SELECT/DML；拒绝 COMMIT/ROLLBACK、DDL、CALL、注释和语句分隔符，避免适配器在 Guard 前意外提交。随后先读取 UTC、复核固定期限，再调用必需的 `Policy.Recheck`，最后再次读取 UTC，覆盖复查 SQL 等待跨期。Recheck 只能读取已经锁住的行，不能新取业务锁、调用网络/文件、补审计或延长原报告时间。GuardPlan 的 slice/时间指针会复制，Work/Recheck 不能通过改共享对象刷新截止。

此执行器是集成边界，不是 SQL 授权证明：它无法从一个 callback 推断调用者是否真的取得所有业务锁，也不能证明适配器提供的 deadline 集完整。必须在下一轮具体 Policy 中落实 producer 域、身份、grant、run、目标、引用及 claim 的 SQL 检查，再在真实 MySQL 中验证。不得用测试 fakePolicy 代替生产 Policy。

## 三种提交结果

| 返回 | 调用者动作 |
| --- | --- |
| 无错误且 `CommitReceipt.Committed()` | 本笔提交已确认；该对象只是本地提交元数据，不是 producer 执行句柄或数据库 C1 结果收据。后续外部调用仍需独立授权。 |
| `ErrCommitUnknown`、无 committed receipt | 提交结果不明；重新认证，使用原幂等键和锁定读确认。执行器不自动重试，不分配新 run/evidence。 |
| `ErrCommittedExpired`、带 committed receipt | 已知提交完成，但返回时截止/报告条件已失效。仅保留历史事实，不能据此继续 provider 动作或续活原授权。 |

`CommitReceipt` 字段私有、零值无效、JSON 编解码拒绝；它不等于合同中的持久化 `ReceiptRecord`。后者继续是普通数据类型，需要独立授权读取。

## 测试与边界

[Go 合同测试](../backend/internal/systembackupproducer/contract_test.go)消费原 C1 的 18 份结果、4 份命令、8 份记录、35 个拒绝及编码向量；另测原始 JSON 重复/转义/非法字节、失败不污染输出、整数/时间转换和 Go 字段对应关系。

[事务测试](../backend/internal/systembackupproducer/transaction_test.go)使用标准库模拟 driver，记录 begin→身份→锁→时间→业务/审计→时间→复查→时间→commit 的顺序，注入截止、容量、CAS、提交断连和延迟。它证明执行器的调用/拒绝边界，**不证明真实 InnoDB 行锁、gap lock、FK、认证或 provider 行为**；V01–V10 的运行状态保持未验收。

验证入口：[system-backup-d-producer-validation.ps1](../scripts/system-backup-d-producer-validation.ps1)。固定 `GOPROXY=off`、`GOSUMDB=off`、`GOTOOLCHAIN=local` 和仓库内一次性 Go cache/tmp/telemetry 目录，运行 Windows Go 测试/vet 及 Linux 测试二进制交叉编译。首次运行虽通过，但工具尝试写用户目录的 telemetry token 被 sandbox 拒绝；根据本机工具链源码，最终脚本改用 `TEST_TELEMETRY_DIR` 指向自有 scratch 并在其中设置 off，没有修改用户全局 Go 设置。finally 验证清理路径仍在 workspace 后删除所有缓存/二进制并恢复环境变量。测试结果和指纹见 [机器记录](evidence/system-backup-d-producer-go-foundation-20260930.json)。现有 CI `go test ./...` 会包含该包。

本轮最终验证通过：Windows 下 11 个顶层测试、含子测试共 126 个通过项；默认 `go test` vet 检查及 Linux 测试二进制交叉编译通过。Linux 二进制未执行，未进行真实 MySQL 验收。验证脚本退出码为 0，确认本轮临时缓存和编译产物已清理。

## 下一步

D 根据 C1 评审落实 8 表正式 DDL 和生产 Policy，再接 Acquire/Renew/Revoke/Takeover、BindObservation、CommitResult、历史读取与结果槽唯一映射；A 对接独立正文/Wrap/STS/发布/恢复。C 提供独立通道、准确对象证明及实际 ACL，选择 Job 后 B 提供宿主/取消/身份边界。当前 94 文件 migration catalog、inventory 与现行 only-080 升级包保持原范围。
