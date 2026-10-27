# D resources 证明适配器缺失检查（2026-10-22）

本轮修复两个 D 侧证明入口的接口 nil 检查：VerifyBackupSnapshot 的 CaptureProofVerifier，以及 SQLControlExclusionVerifier 的 TargetReadProofVerifier。原来的 interface == nil 不能识别接口内的空指针、空函数或其他可为 nil 的动态值。如果这类值实现了返回 nil 的方法，捕获比较或三十五表目标检查可能把缺失适配器当作成功证明；直接调用空函数也可能 panic。

新增私有 missingProofVerifier，只检查接口及其动态值是否缺失；两个调用点复用现有错误和原检查位置。缺少捕获证明时，不执行外部 proof；缺少目标证明时，不开启 SQL 事务。有效适配器仍负责真实捕获/目标认证，辅助检查不把非 nil、返回 nil 或合成夹具升级为生产证明，不检查适配器内部授权，也不代替 B 的实际实现和验收。

新增两个根测试，以 nil-safe 但会记录调用的方法证明必须由调用方拒绝缺失适配器。每个入口覆盖普通 nil、空指针、空函数、空 map、空 slice、空 channel，以及对应五种非 nil 对照；空但非 nil 的 map/slice 继续可用。目标负例同时要求零 SQL、无事务开始/提交/回滚；有效目标对照仍使用只读 RR、七十条查询和一次提交，捕获对照仍输出原十二项检查。

本轮只变更两处原有条件并新增私有辅助函数和测试；没有更改公共接口、检查 ID、registry、批准、migration 或远测入口。测试只冻结 resources 包、夹具、Go module 文件及实际读取的 schema-registry/verifier 合同；没有复制其他 Owner 的整个源码。关闭 Go proxy/sumdb 和自动工具链下载，不安装依赖或执行远端。

旧实现对照准确命中十个 typed-nil 失败叶子，普通 nil 拒绝和非 nil 对照共十二项通过；两个根测试因这些叶子失败，原生退出 1。修复后完整 systembackupresources 包通过 27 个根测试、139 条通过事件，新增两个根测试及二十二个场景全部通过，无失败或跳过，保留 default vet，原生退出 0。隔离候选的十八份输入和文件集合在测试前后保持不变，并逐字节匹配当前限定工作区输入；没有对同一候选重复跑完整包。

对两份原运行文件分别反向恢复本轮那一个条件后，字节 SHA256 精确匹配旧快照，原有 proof 隔离、三十五表闭集和取消处理保持原字节。旧实现快照十七份输入，SHA256 a7c98f933a28bfb5cce470a710baf30a855c64a64451b835772ec4d4074f7153；候选新增私有 helper 后十八份输入，SHA256 355c1b52df374ef743ef3c2a218bff73e831f567eff68ca1690533d8ea0671d6。输入范围不覆盖其他 Owner 或整棵工作树。

准确自有目录 .tmp-d-proof-presence-ff6793bc862e434497b2dcebd96fd3a4 下 1,125 份文件已删除，含临时源码、缓存、tmp、telemetry 及测试构建产物；清理后独立确认目录不存在。未安装依赖或执行远端命令。

[最终限定验收](evidence/d-resources-proof-presence-accepted-20261022.json)、[清理回执](evidence/d-resources-proof-presence-cleanup-20261022.json)、[验证脚本](evidence/d-resources-proof-presence-validation-20261022.ps1)和[独立复核脚本](evidence/d-resources-proof-presence-review-20261022.mjs)保存反例、完整包结果及限定输入摘要。清理后执行 node docs/evidence/d-resources-proof-presence-review-20261022.mjs --check 可复核历史结果、当前限定字节和清理状态；相关输入变化时需重新验证。真实 B capture/target proof、九表规范化、完整 freeze/GC 及 D 原六项继续分别验收。
