# D resources capture proof 的输入隔离（2026-10-22）

状态：运行修复和新回归测试已写回，隔离与写回后完整包验证通过，准确自有目录已清理。当前仓库搜索仍只有 B proof 接口和 lab/test synthetic 实现，没有可接入的 B 生产 capture/隔离目标证明；本轮不以 lab fixture 代替真实恢复装配。

VerifyBackupSnapshot 的 CaptureSnapshotEvidence 虽按值传递，但 SourceSnapshot.Tables 是切片、AuditMaxID 是指针。原实现验证它们后，把同一底层存储直接交给外部 proof，再读取它们形成比较结果。proof 若修写参数，会污染调用者数据，也会改变已经通过结构校验的比较依据。把 dump 的行数或 audit cutoff 改成 source 值，能让原始差异在旧比较中消失。

修复先完成 registry 和两侧九表结构校验，只有合法且有界的输入才分配副本。之后形成两层独立视图：

- 内部 source/dump 比较视图分别复制 Tables 和 AuditMaxID。
- proof 的两个参数再分别复制，既不与内部比较视图共享存储，也不因调用者两侧原本共用存储而互相影响。

checkpoint/capture-context/evidence ID 和 TableCount 的字符串是 Go 值语义，标量随结构复制；nil audit cutoff 保留 nil，不制造零值。现有 proof 调用一次、原 proof 错误优先级、proof 后 context 检查、12 项检查 ID 和 redacted expected/actual 输出保持。这里不改变 B 的证明接口，不在回调外加入新的授权或假的证明。

新回归覆盖参数行数、表身份、audit 指针修改，proof 返回错误/取消的调用者隔离，两侧共享输入、返回后保留参数再修改，以及原始行数/cutoff 差异不能被参数修改抹平。另有两项通过闭包直接修改调用者存储的测试：verifier 不能阻止外部自行写调用者，但内部比较仍须保留调用开始时校验的原始值。这些都是同一 goroutine 的顺序修改；本实现不宣称调用者并发读写 Go 切片/指针是 race-safe。

旧运行文件配新测试准确命中 16 个修改相关失败（另计三个父测试失败），原样输入和空审计 nil 两项对照通过；反例退出 1，未用编译或基础设施失败代替。正确代码在隔离与写回后均通过完整 systembackupresources 包，各 25 个主测试、115 条测试通过事件，没有跳过；保留 default vet，并核对 224 项实际 Go/嵌入输入、保守运行资产和文件集合。

B 返回 nil 仍须意味着真实证书、dump 内容和共同 checkpoint 已由可信实现验证。输入复制只保证 D 比较的对象稳定，不会认证 synthetic proof 或代替真实 B 实现，也不会赋予备份资格或生产批准。35 表控制排除、实际 target proof、九表 normalization、真实 MySQL 和原六项仍按各自证据验收。

证据前缀：docs/evidence/d-resources-proof-isolation-20261022-fc8cb8e5。候选只写一份运行文件及一份新测试。所有临时源码、缓存、tmp、telemetry 和测试构建输出统一放在准确 owner 下，结束后精确清理，不安装依赖或执行远端命令；最终以准备/native 回执为准。

冻结来源共 1561 份，SHA-256 为 `2ea77b6a30fac14aa5d2b9bc410c70d296d0b439b5789a917d16b61ea71defa4`。只发布 `backend/internal/systembackupresources/verifier.go` 与新增 `verifier_input_isolation_test.go`；准确 owner `.tmp-d-index-cache-fc8cb8e5215e4764b578d9b4a2276ef6` 及 2,806 份文件已清理，清理后独立确认目录不存在。未安装依赖，未执行实际 MySQL 或远端命令，也不声称整个当前工作树均已测试。

[准备与最终验收回执](evidence/d-resources-proof-isolation-20261022-fc8cb8e5-preparation.json)、[原生命令与清理回执](evidence/d-resources-proof-isolation-20261022-fc8cb8e5-native.json)、[可重复证据复核](evidence/d-resources-proof-isolation-20261022-fc8cb8e5-review.mjs)。清理后的 `node docs/evidence/d-resources-proof-isolation-20261022-fc8cb8e5-review.mjs --check` 可复核当前限定输入和历史结果；后续限定输入若变化，应保留原历史证据并重新验证。
