# A：日志逐行脱敏与正文分派（2026-09-29）

本次增加 `log_content.go`、`content_dispatch.go` 和本地负测。交付的是 A 的日志安全处理及正文分派组件；B/C 尚未接入，未实现真实 JobObserver、事件落库、日志索引事务或生产 producer 认证，也不更新 capability approval、配置激活及 v12 draft 状态。

## 日志安全策略

`NewLogSanitizer` 接收受审、受信 registry 提供的 `JobLogPolicy` 和任务剩余预算，复制策略形成不可变快照。策略按事件 code 定义字段，只允许有限枚举、布尔、有界无符号整数及明确删除的敏感字段；没有通用字符串类型。code、字段名和枚举值本身也必须由 owner 审核，不允许从待处理日志或 Admin 参数生成策略。

本地 profile 为一行一个 JSON 对象：`schema_version=system-backup-job-log.v1`、`level=debug|info|warn|error`、受审 `code` 和闭集 `fields`。这是待 B/D 对齐的组件输入格式，不是已经冻结的 runner/事件机器合同。任意原始 stdout/stderr、自由文本、未知字段/事件、重复或转义重复字段、大小写替代、错误类型、无效 UTF-8、超长行都丢弃。URI、密码和 provider 原始错误不能通过自由字符串字段进入输出；显式 `drop` 字段整项删除，包括其嵌套内容。

成功行重新编码为确定的 JSON 并附 LF。整数保留 uint64 精度，不经过浮点转换。单行最多 64 KiB；输入和输出 chunk 均不超过 1 MiB、1000 行。调用方必须按完整行提供有界 chunk，最后一行允许 EOF；不能把同一行拆成多个调用。超出 chunk 大小/行数返回 `capacity_exceeded`，不返回部分正文、不消耗本次预算，调用方需正确分块，不能将其当作已摄取。

预算保守计入所有已处理原始行，失败行也计数；每行字节扣减取原始和规范化输出长度的较大者。返回的 `InputLines`、`ChargedBytes` 用于持久化实际扣减量；`InputBytes` 仅是已处理原始字节数。达到预算或下一完整行无法放入预算时停止并返回 `log_truncated`，后续调用不再读 source，也不重复产生诊断。读取会有最多一个有界 chunk 的预读；Reader 的取消/超时由 observer 提供。

`LogChunk.Diagnostics` 仅含闭集 code（`redaction_failed`、`log_truncated`）和 chunk 内行序号，不含正文、字段值、原始错误或低熵秘密的摘要。失败行不改写任务终态。所有行被丢弃时正文为空，只处理诊断，不伪造 evidence。诊断持久化失败及 chunk 重试/sequence 幂等如何收敛属于 JobObserver/控制面接线，不能忽略诊断直接标记 ready。

只在内存中处理输入，不写明文临时文件；使用后的原始缓冲和 JSON RawMessage 副本清零，返回的脱敏 Content 由调用方用后清零。Go 内部字符串和扩容副本不保证完整擦除。内存预算不是跨进程的持久约束，B/D 必须从受信任务快照恢复预算，并将扣减、诊断、chunk sequence/evidence 索引在真实事务中收敛；不得重启后重置预算或重复扣减重试。

## 加密前复核与分派

脱敏先于 evidence 的 content checksum/size 计算。`JobLogRedactor` 只接受规范化后的 `job_log_chunk` / `text/plain`，重新验证每行 schema、行数/字节上限和正文摘要；即便字段在输入策略中标为 drop，若仍出现在加密前正文里也拒绝。日志永不借用 capability/verifier 校验器通过。

`ContentDispatcher` 仅支持已实现的 capability snapshot 和 job log；其余类型直接拒绝。每次调用受信 `ContentAuthority.AuthorizeContent`，要求精确绑定完整 evidence Identity、有效 producer identity hash、未过期授权和唯一适用策略。完整读取后再次获取授权，拒绝撤销、producer 改变、策略改变及到期；任何错误都归一为 `redaction_failed`。这些失败发生在 `Prepare` 调用 KEK 或写入 framing 之前。

Authority 是内部信任接口，本包没有提供生产实现。其实现必须认证真实 producer，并从 registry/任务登记检查 installation、owner、attempt、claim、配置和撤销；不能把请求的 identity 原样复制当作授权。生产装配应使用 dispatcher，不能直接把任意自定义 Redactor 当作 producer 认证。D 的登记事务仍需按数据库时间检查权限、claim、期限和配置，读取后二次检查不能替代事务准入。

现有外置 `Prepare` 仍仅接收大于 8 KiB 的内容。小日志交给后续正式 inline 路径；不填空白凑外置大小，也不因本组件增加未实现的 inline 写入。独立日志保留期、不得作为正确性 required evidence、仅 ready 索引可读等既有约束不变。

## 下一步接线

- B/D：交付认证后的 JobObserver 输入、reviewed event/field profile、完整行分块、剩余预算恢复与原子持久化、诊断事件映射及 ready 索引。
- A/D：实现生产 ContentAuthority，绑定真实 producer/attempt/claim/config/revocation；继续完成 STS/Transit 凭据授权和独立 evidence KEK。
- B/C：交付其他正文类型的闭集合同与受信 producer；A 再增对应 validator。目前保持拒绝，不能将模拟 fixture 当作交付。
- D/C：正式 GC migration、SQLPolicy、HTTP/调度与权威不存在证明仍按现有分工推进。

## 本地验证

入口为 `scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`，不带 `-Remote`，保留 vet，依赖只读、禁止下载。测试覆盖日志字段闭集、敏感字段删除、非法行丢弃、超限、跨 chunk 预算、策略快照、精确整数、错误消息脱敏、producer 撤销/策略变化、加密前拒绝，以及合法日志的 Prepare/OpenRange 往返。

最终完整运行退出 0：29 个 Go 主测试、153 个子用例通过，包耗时 2.745 秒；新增 6 个主测试、39 个子用例。Linux/MySQL 探针和 migration runner 编译通过，自有缓存、二进制及遥测目录已清理，未安装依赖。此前 keyring 回执中的 23 项 backend/scripts 源码绑定仍一致，DDL 与 migration runner 摘要未变；没有执行远程或真实 MySQL/provider 验证，不扩展历史回执范围。完整输出见 [本轮记录](evidence/system-backup-a-evidence-log-content-local-20260929.txt)，源码绑定与验收范围见 [机器记录](evidence/system-backup-a-evidence-log-content-local-20260929.json)。输出中的四条本机 TLS bad-certificate 提示来自原有预期拒绝测试。
