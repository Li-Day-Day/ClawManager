# D 敏感下载 HTTP/runtime 与独立结果审计候选

【结果保留后续 r47】[独立结果 receipt 与原准入组外键](system-backup-d-download-result-retention-20261019.md)已补实际 audit ID 关联、首次/最终回读及原子回滚，避免只由正文关联而缺少删除保护；正式部署后仍需单独评审最小权限和组 GC。五完整包含当前 server 692/5,435、seed/脱离 checkout/Windows/Linux 构建和本轮三目录清理均有原冻结回执；1,397 来源中原 Go/SQL/胶囊当前匹配，A 三份并发启动诊断脚本单列，不据此扩大成当前全来源或真实 MySQL 接收。

【最新 r45】[producer 历史 owner 与公开下载结束事务](system-backup-d-download-producer-owner-20261019.md)已接四任务之外的 system/capability_snapshot 原始绑定，并按原对象、owner/ref 和准确 claim CAS 在用户撤权/请求取消后独立完成公开清理；失败 sink 使用新的独立预算。r45 接收 security/evidence/read/producer 四完整包 682/5,387，其中 D 新十根/50；1,394 来源接收时零漂移和累计十五个自有目录清理齐全，无依赖安装。当前 server/前端/浏览器未重跑，真实 InnoDB/运行材料/物理容量、其他 owner、正式 schema/grants/GC 和生产启用仍缺；下文历史范围不扩大。

【后续 owner/ref 更新】[四类任务适配与 r32 回执](system-backup-d-download-task-owner-20261019.md)已补实际任务 SQL/原 deadline/hold、23 列引用前缀和当前授权策略，并验证与准入、提交后及撤权后结果事务组合。下文 owners synthetic 描述 r27 原冻结范围；新适配的 SQL transport/行数据及容量仍为夹具，其他 owner 与实际 InnoDB/现场容量、GC/grants、生产装配继续未验收。

承接[已提交准入绑定](system-backup-d-download-committed-binding-20261019.md)。本轮把实际 `DownloadAdmissionService`、`SQLDownloadAuthority`、S3/Transit 读取和独立 `SQLDownloadResults` 接入 runtime factory；没有启用生产 main 或安装正式 schema/grants。

## 请求与响应

- `DownloadRuntimeConfig` 可提供配套的具体 Admission/Results。两者必须同数据库/安装，Admission 与 authority 必须同 JWT secret；缺任一配套适配器即拒绝构造。无配套适配器的 runtime 只接受 public/internal，私有 evidence 在实际行锁下拒绝，不进入旧行锁后 proof 回调。
- 入口克隆原请求，在全新准入事务中认证、授权并分类。私有请求只通过新原子准入；public/internal 不要求 key/proof，不读取强认证材料或消费 nonce，随后由原读取路径独立核对当前权限和实际分类。预读 public、实际行变成私有时必须拒绝。
- 确认提交后只绑定一次，沿用原 Range、Operation/claim 和原期限；Stat、完整 envelope/准确加密帧及 DEK unwrap 都使用同一个实际 SQL authority。输出 `200/206` 二进制、原媒体类型、规范 Content-Range、`X-System-Backup-Operation-Id` 与 `no-store`；不把公共 Operation JSON 当下载响应。
- 输出前设置原单调期限的响应写 deadline。HTTP 中间件须支持 `SetWriteDeadline` 或 `Unwrap`，不支持时在响应头之前拒绝。该期限一直保留到 native server 的最终 flush，不能在独立结果事务之前清零。设置全部响应元数据之后、发送成功头之前再次检查；头发送后、首次明文之前再检查。已发头后失败只能结束响应，不能追加 JSON；本地写完成只说明 `Write` 返回完整字节且无错误。
- 错误码按原[机器决议](evidence/system-backup-d-sensitive-download-contract-20261016.json)逐项回归。格式错误 proof 为 400，签名/绑定错误为 401；容量耗尽为 422，provider 读取失败为 `503 artifact_unavailable`，审计/内部完整性失败为 `500 internal_error`，缺材料/适配器/未知提交为 `503 not_ready`。不会把 private cause 直接序列化。

## 结果事务

`SQLDownloadResults.Finish` 独立拥有一个 RepeatableRead 事务和唯一提交点。一次尝试状态与原凭据共享，开始记录结果即永久关闭 provider 权限；已撤权、绑定失败或下载期限已过不妨碍记录已发生事实。客户端取消与结果事务耗尽各自预算，都不能取消独立持久故障报告预算。

按 L0/L1 锁当前安装/config/持久历史，L2 锁原 actor 用户行作为 audit FK 目标（不检查 active/role、不授予权限），再核对原 Operation/receipt，锁原 owner/ref、原 nonce，取得真实容量预留，核对原 intent 后插入一次结果审计。这避免 INSERT 到 L7 时才反向取得隐式用户 FK 锁。使用本次 INSERT 的实际 INT ID，独立回读准确 actor/action/关闭字段正文/秒精度 created_at，再执行原 evidence ID、安装/owner、claim、claim_until 和 row_version 的 CAS 释放。CAS 0 不清除别人的 claim；行版本达到安全整数上限时不递增。其他失败整事务回滚，提交不明不重试。

结果正文闭集关联原 Operation、intent ID、evidence/row_version、claim digest、request hash、原 Range、保留期限、SQL result time、bytes_written 和 `rejected|interrupted|local_write_complete`。不保存 raw claim/proof/nonce/bearer、provider locator 或明文，不修改成功的 Operation/receipt/nonce/intent。

结果或释放失败通过 mandatory `Service.Failure` 持久路径报告。该回调可用 `DownloadFailureReferenceFrom(ctx)` 取得只含 Operation public ID、intent audit ID、claim SHA-256 的有界关联信息；需要真实部署侧 durable sink，当前测试不把计数 callback 视为现场持久存储证明。

## 验证记录

- r23 首轮为编译失败：测试 SQL 的写入分支放错到查询方法、旧 Handler positional literal 与未用 import。没有执行测试，失败日志保留。
- r24 定向轮执行了 HTTP/public/结果与 TLS runtime；只在 malformed proof 的测试预期失败，原 A 严格 decoder 正确返回 400。测试已拆成格式错误 400 和有效格式的坏签名 401；未放宽 decoder。该轮整体不记为通过。
- [r25](evidence/d-download-http-packages-20261019-r25-native.txt)四个完整包按原冻结来源通过；它未覆盖随后新增的机器错误映射、L2 actor FK 锁、TLS after-header 和 native 缓冲最终 flush 边界，不能为这些安全增量背书。
- [r26 定向轮](evidence/d-download-http-focused-20261019-r26-native.txt)通过 15 主/106 含子项，默认 vet/无跳过/Go 与包装退出 0。它只执行选定根，虽捕获了新增 A 文件，但没有执行其 native 缓冲/擦除根。
- A 并行新增的 [native 输出回归](../backend/internal/systembackupevidence/download_output_deadline_a_test.go)指出原 deferred 清零会使小响应在结果事务之后、原期限之外才 flush；A 已移除清零，D 保留共享修正并补普通成功路径期限不被清零断言。[A 独立回执](evidence/a-download-output-deadline-review-20261019.json)保持其自身范围，最终 D 轮另实际执行 A 的 HTTP/1+HTTP/2 四个 native 场景和完成/短写/abort 三个擦除场景；没有把它们记作 D 新编写的用例。
- [r27 最终完整 Go 日志](evidence/d-download-http-packages-20261019-r27.jsonl)、[来源](evidence/d-download-http-packages-20261019-r27-source.json)及[包装终态](evidence/d-download-http-packages-20261019-r27-native.txt)接收 security **253 主/1,985 含子项**、evidence **258/1,977**、read **75/519**、当前 server **6/12**，合计 **592/4,493**。默认 vet、无跳过，Go 与包装退出 0；D 新选定十三个根/91 项，A 新 native 两个根/9 项及其他并行增量按各自实际冻结来源计入整包。
- [独立复核](evidence/d-download-http-packages-20261019-r27-review.json)重算唯一 package 终态、全部主/子项、D/A 选定根、原记录次序摘要及当前完整文件集合/字节：**1,380 输入当前零漂移**，逻辑 SHA-256 为 `eba7fcb21aa7afb00062f8e9b81d7822d85a6cb2cd4dcc73ffca5fb2f29e58fb`。五轮准确源码快照及外部自有缓存六个目录均确认不存在，[清理回执](evidence/d-download-http-cleanup-20261019-r27.json)保留 marker 和终态。首个清理调用因自动审批模型容量不足未执行；原受审命令重试后完成，没有换工具或绕过审批。未安装依赖。

本轮未修改前端或重复前端构建。SQL transport、owners、容量报告与密钥仍 synthetic；native TLS STS/S3/Transit、HTTP/1/HTTP/2 和真实加密对象/DEK 代码执行不等于现场身份、物理容量或 InnoDB 验收。

## 剩余验收

1. 实际 owner/task/hold/ref 适配、现场物理容量/报告/投射材料与运行身份；结果账户必须只具有准确 audit INSERT/SELECT、reservation 计账与 claim/row_version/updated_at 的必要权限。receipt/nonce/Operation/intent 不因结果而获得可变权限。
2. 结果审计必须随原准入保留组一起接受正式 GC/保留/grants 评审：按准确 action、installation/Operation/intent/claim digest 关联，保留到原 retain_until，检查所有 hold/ref 后清理，不能由通用 audit GC 提前删除。当前原 receipt 的 intent FK 并不自动保护新 result audit，不据本轮关闭这一缺口。
3. 整链真实 MySQL 的原子回滚、跨 HMAC 并发、实际行锁/权限、未知提交、容量与保留；正式迁移和 main/deployment 启用仍待验收。SQL transport、owners、容量报告与密钥是 synthetic；局部 TLS STS/S3/Transit 测试不是现场服务。
4. [六项原始范围](system-backup-d-six-scope-readiness-20261015.md)继续保留：正式迁移/索引、完整 Owner 读源、B/A/D 恢复组合、管理认证/独立审计卷、实际历史升级激活、四矩阵/大数据 E2E。
