# A 下载 HTTP 输出期限与空请求体独立复查

A 已关闭冻结候选中的两处实际 HTTP 边界问题，见 [43 项独立回执](evidence/a-download-output-deadline-review-20261019.json)和[可复算验证器](evidence/a-download-output-deadline-review-20261019.mjs)。代码位于 [admitted HTTP handler](../backend/internal/systembackupevidence/download_admitted_http.go)，独立用例位于 [A 输出边界测试](../backend/internal/systembackupevidence/download_output_deadline_a_test.go)。

1. 原 handler 在独立结果审计开始前清除了响应写期限。Go 的小响应可能仍在服务端缓冲区中；原始真实 TLS HTTP/1 回归显示，审计越过原准入期限之后，服务器仍把缓冲明文发送出去。现在保留原写期限，覆盖结果事务和 native server 的最终 flush，由 HTTP server 清理 connection/stream。`local_write_complete` 继续准确表示本地 `Write` 返回，不据此宣称客户端收到文件；新测试明确覆盖本地写完成但网络最终输出被期限阻止的情形。
2. 原严格 `Body != http.NoBody` 比较拒绝了正常的 native HTTP/2 空 GET。现在在 SQL 前以 native read deadline 约束一次最多一字节的 EOF 校验，拒绝实际正文、未知或正长度、transfer/trailer、迟到 EOF、读取/期限错误和取消；读取完成后再次检查实际 trailer，只给传入 admission 的 clone 设置 `http.NoBody`，保留原 request Body。没有受支持的读取期限时不开始读取。

[r1 原始失败日志](evidence/a-download-output-deadline-20261019-r1.jsonl)及[原生终态](evidence/a-download-output-deadline-20261019-r1-native.txt)保留 exit 1：HTTP/1 正向控制已取得正确正文，随后在“提前清除期限”断言失败；HTTP/1 越期用例实际收到明文。两个 HTTP/2 叶子当时在空请求体上返回 validation_failed，未据此声称复现 HTTP/2 越期输出。[r2 定向日志](evidence/a-download-output-deadline-20261019-r2.jsonl)修复后 9 项通过，随后补齐的 trailer/原 request 隔离和十三项请求体检查由最终完整轮覆盖。

[r3 完整日志](evidence/a-download-output-deadline-20261019-r3.jsonl)、[冻结来源](evidence/a-download-output-deadline-20261019-r3-source.json)与[原生终态](evidence/a-download-output-deadline-20261019-r3-native.txt)固定 1,380 输入，逻辑 SHA-256 为 `eba7fcb21aa7afb00062f8e9b81d7822d85a6cb2cd4dcc73ffca5fb2f29e58fb`。security 为 253 主/1,985 含子项，evidence 为 258 主/1,977 含子项，合计 511 主/3,962 含子项，无失败或跳过；新增 A 三个主测试/23 个含子项全部通过，覆盖真实 TLS HTTP/1 与 HTTP/2 的正常/越期输出、完整/短写/异常退出后的原缓冲擦除与结果/claim 收尾，以及十三项 SQL 前请求体边界。完整轮默认 vet、冻结 postcheck、实际 Go/包装 exit 0 齐全，没有测试断言重试；构建前一次共享源码变化只丢弃未开始构建的副本，再冻结成功。接收时所有原输入零漂移，后续共享工作树变化须另验。

本轮三个准确源码/构建快照已清理；仅供本轮使用、从本轮 r1 自有缓存复制的共享编译缓存也已守卫删除，见[原 owner 记录](evidence/a-download-output-cache-owner-20261019.json)和[清理记录](evidence/a-download-output-cache-cleanup-20261019.json)。四条准确外层路径均独立确认不存在，其嵌套构建、缓存和测试临时文件随外层删除。未安装依赖，也未启动 SSH、MySQL 或真实 STS/KMS。

本次实际网络证据限于本地 native TLS HTTP/1、HTTP/2；JWT/Ed25519、envelope/range、准入、最终 SQL authority 和结果事务执行真实候选代码，SQL 传输、owner、容量与 provider 底层仍为合成输入。已有 D 模型回归验证当前会话和原 nonce/Operation/receipt/intent、完整 Manifest/config 的最终复查与失败收尾；本回执不替代完整准入的实际 InnoDB、生产 owner/materials、本人 MFA、真实 provider、正式 schema/grants 或部署验收。

当前仓库已定位并验收的远测仍包括 nonce 八项，按其原回执复用，无需重跑。操作者已反馈远测完成，但当前未找到下载 MFA 九项的新 transcript/source；应先定位同轮日志、载荷 pin、九项结果及清理证据，再记入远测验收。本次本地 HTTP 修复不把这项待回执状态改写为通过或失败。后续继续完成实际 owner/材料/容量接线、完整下载准入 MySQL 与正式共享评审、部署/E2E。
