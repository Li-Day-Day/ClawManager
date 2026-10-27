# A：GC 三个入口拒绝带类型的 nil 依赖

本次修复三个接口依赖只比较 `== nil` 的缺口。Go 接口装入 nil 指针或 nil 函数后，接口本身不为 nil；旧构造器因此可能接收无效依赖，证明包装器也可能先执行 SQL，再调用无效 verifier，导致 panic 或接受 nil receiver 返回的结果。

复用现有 `nilSystemAdapter`，生产代码仅改变三个判断：

| 入口 | 拒绝的依赖 | 既有错误语义 |
| --- | --- | --- |
| NewSQLGCAuthority | Registry.Policy，包括带类型的 nil 指针 | nil 实例 / ErrInvalid |
| NewGCRuntime | Absence，包括带类型的 nil 指针、nil 函数 | nil 实例 / ErrInvalid |
| GCAbsenceVerifier.VerifyAbsent | Verifier，包括带类型的 nil 指针、nil 函数 | 空证明 / ErrDenied，进入 SQL 和 provider 前拒绝 |

没有改变有效证书、claim、租约、保留期限、原始 proof 或 SQL/provider 的授权规则。

## 反例与完整回归

[独立回执](evidence/a-gc-nil-adapters-20261020-r1-accepted.json)核对 1,451 份冻结输入，SHA `b77311e720d6e77f7258276b797574a2dba6e724e2d906b6e6dcaa4c703ece0e`。

新增三个测试根、含根共 11 项。每项要求错误和返回值正确，且无效依赖不能产生 SQL transaction、凭据交换、对象操作或证明回调。测试包含普通 nil、nil 指针和 nil 函数；一个 nil receiver 容忍型 verifier 证明包装器必须自己拒绝依赖，不能依赖下层一定 panic。

在同一冻结副本上，以 overlay 仅恢复三个旧判断：三个普通 nil 叶子仍通过，其余五个指针/函数叶子及三个根恰好失败，原 exit 1 保留。nil 函数造成的 panic 在该反例测试中转为明确失败，让其他用例继续执行；没有将 panic 当作安全拒绝。

修复版单次完整 security/evidence 两包 **590 主/4,822 含子项**通过，无失败/跳过，默认 vet、`-count=1`、GOMAXPROCS=1/-p=1。原 D r4 两包全部准确测试名称保留，只新增本轮 11 项；现有十二项证书过期、worker/claim/lease/deadline、provider 调用前后撤权和结果阶段过期回归逐名通过。冻结副本 postcheck、整体 exit 0 与准确 owner 缺席确认齐全。

编译缓存只从 D 既有目录只读复制 2,024 个文件到 A 自有目录，未移动、修改或清理原目录；所有测试重新执行。A 的源码副本、复制的缓存、Go 临时目录和 overlay 在 finally 全部删除。未安装依赖、执行远端/实际 SQL或批准生产 GC。核对时三个修复/测试文件仍匹配冻结字节；D 后来变化的 startup diagnostic 脚本明确排除，不声称当前整个工作树通过。

## 对十一项回执工具的影响

本轮新增了普通 Go 测试，旧 owner 接收工具的受审基线必须更新。[新版准备记录](evidence/a-download-owners-actual-review-cli-checks-20261020-r2.json)固定本轮源码和完整两包原始 JSONL 的 SHA，保留完整预期测试清单，没有减少门禁。37 项解析器反例和三份真实未完成日志的 CLI 拒绝重新通过；零份实际 SQL 验收文件产生。

实际 owner 十一项、GC 角色十项、完整 metadata GC policy、生产材料/物理容量及正式批准继续独立验收。本次只关闭三个 nil 依赖缺口及其本地回归。
