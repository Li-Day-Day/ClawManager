# A evidence 正文准备：取消、两遍关闭和 DEK 边界

日期：2026-10-14。范围为通用 `Prepare` / `prepareExternal`，以及任务、系统 capability 准备入口。本轮修订 A 既有组件，不要求 B/C 生产接入，不新增 framing、公共权限、数据库写入口或远程动作。后续 registry/发布仍必须独立授权和验证。

## 修订前的可复现问题

[修订前故障注入输出](evidence/a-evidence-prepare-boundary-repro-20261014.txt)测试退出 1：13 个取消时点中，12 个继续触发后续适配器或错误地产生成功 `Prepared`；第二次 source 回调期间取消已能拒绝。第二遍 reader 的 `Close` 错误被忽略，读取期间、最终 EOF 或关闭期间取消也可能被接受。Wrap 直接借用随后用于 AES 的 DEK，适配器完成包装后擦除输入会导致正文加密使用另一把 key，却仍返回成功。

原路径还只检查普通 nil：typed nil redactor/keys/writer/reader 可能导致 panic，source 同时返回 reader 与 error 时会漏关资源。这些情况均在本轮测试中覆盖。复现阶段仅运行三个故障测试入口，没有真实 SQL/provider；隔离编译缓存已清理。

## 修订后的行为

| 边界 | 行为 |
| --- | --- |
| 已取消请求、source/read/redaction/close/Wrap/staging 回调期间取消 | 返回既有 unavailable；不进行后续 I/O，不返回可登记的 Prepared |
| 第二遍 Close 延迟报告失败 | 与第一遍一致返回 integrity；两个已打开 reader 均只关闭一次 |
| source 返回 reader + error | 关闭附带 reader，返回脱敏 unavailable |
| typed nil 适配器或空 context | 入口拒绝；任务/系统入口在授权、SQL、JWT、Wrap 之前拒绝无效 context/writer |
| Wrap 改动借用的 DEK 副本 | 返回 key 错误，不写入 header/ciphertext |
| Wrap 输入生命周期 | 私有 AES DEK 不交给回调；借用副本在 Wrap 返回后立即擦除，并在 Prepare 结束时再次擦除；后续回调改动借用副本不改变 AES key |
| 第二遍失败后的明文缓冲区 | 擦除；所有错误返回空 Prepared |

Source、Keys 和暂存 writer 仍须是受信同步适配器。Wrap 必须只读借用输入、不保留或返回输入别名，并擦除自己生成的明文副本；本地检查不能证明一个任意 KMS 适配器正确实施密码包装。context 检查可以阻止返回后的后续调用，不能强行中断一个忽略取消并永久阻塞的适配器。

失败时 dst 可能已有部分或完整密文，调用者必须丢弃它。成功 Prepared 只证明准确身份、两遍正文/hash、envelope/chunk/object 完整性和准备生命周期，不授予登记、STS、provider PUT 或恢复写入权限。

## 本地验证与交付

本轮定向测试与完整两包均退出 0，默认 vet 开启，无 Go 工具崩溃或重试。见[限定接收记录](evidence/a-evidence-prepare-boundary-local-20261014.json)、[阶段退出/清理记录](evidence/a-evidence-prepare-boundary-run-20261014.json)与[完整输出](evidence/a-evidence-prepare-boundary-local-20261014.txt)。定向门禁通过 9 个主测试、37 个子用例；完整两包通过 252 个主测试、1817 个子用例，共 2069 项检查。evidence 包为 177/1108，运行 93.553 秒；producer 包为 75/709，运行 44.892 秒。定向和全包重复覆盖的用例不叠加计为独立通过项。

验证先运行准备边界定向测试，再运行完整 `systembackupevidence` 和 `systembackupproducer` 两包及默认 vet。973 份 backend Go/module/SQL/JSON、v12 JSON/SQL 输入先复制为固定字节，见[源码快照](evidence/a-evidence-prepare-boundary-source-snapshot-20261014.json)；两步均从该副本运行。[定向测试后的核对](evidence/a-evidence-prepare-boundary-snapshot-check-20261014.json)确认副本所有输入摘要匹配。最终比较的已有 973 项 live input 零漂移，另发现工作线新增 `backend/internal/systembackupsecurity/config_mutation_transaction.go`：它不在本轮副本内，本轮不验收这份新配置 writer，也不声称冻结当前整个工作树。

准确临时目录 `.tmp-a-prepare-gate-5f5f88fa3918419499a7c98bd8afd65c`、源码副本、缓存及二进制均已清理，并独立确认目录不存在；修订前复现的隔离目录也已清理。外部依赖沿用既有 module cache，由 go.mod/go.sum 绑定，`GOPROXY=off`、`GOSUMDB=off`、`GOTOOLCHAIN=local`、`-mod=readonly`。未安装依赖，没有 SSH、真实 MySQL 或 Linux 交叉编译。通过仅适用于这轮固定输入下的本地组件与适配；真实生产授权/provider 仍待另行验收。

测试覆盖 13 个同步取消时点、两遍关闭失败、两遍 nil/typed nil/错误附带 reader、DEK 变更与擦除、保留借用副本的后续修改，以及任务/系统准备入口的零授权/SQL/JWT/Wrap/source 调用。现有本地 TLS 和 D 服务适配测试也随完整两包运行；这些夹具不能替代真实部署/provider/MySQL 验收。

本轮不重跑已接收的十五表 MySQL 或其他远程套件；生产主体/Wrap、B 宿主、C capability/profile、D 权限与发布事务以及完整 P0a/P0b 仍按原跨角色交接推进。
