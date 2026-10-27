# D 已提交下载准入的绑定与 SQL/provider 检查

【后续 r27】[HTTP/runtime 与结果候选](system-backup-d-download-http-result-20261019.md)已接 runtime factory 的实际分流、二进制响应和独立结果审计；四完整包 592/4,493 与 native 缓冲/擦除检查通过，六个自有目录清理。下文 HTTP 待实现为本交接形成时状态；生产 main、真实 owner/容量、正式 schema/grants/结果 GC 与完整 MySQL 仍未完成。

承接[原子准入事务](system-backup-d-download-admission-transaction-20261019.md)及[公共 Operation 读取](system-backup-d-download-public-read-20261019.md)。本轮增量仍是候选；此前 r13/r18 仅覆盖各自冻结来源，不能为新代码背书。

## 实现边界

- 只有已知成功且未超时的准入提交会生成封闭凭据；原 Operation/receipt/nonce/intent 行身份、原接受时间、保留时间和所有历史 HMAC 摘要封存在对象内，不保留 pending SQL transaction 或原始 proof/nonce/bearer。原准入期限通过提交前 SQL 采样之前的单调时钟计算，不因绑定、重读或 provider 请求延长。
- `BindCommittedDownload` 绑定到准确数据库、安装、JWT/config pin 和实际 authority 实例，单次尝试/失败状态由 Go 值复制共享。绑定不消费新 nonce、不创建新 Operation/审计或 claim，也不直接授予 provider 权限；Range 使用原签名的规范范围，后续可变 HTTP 头不参与解释。
- `CheckCommittedDownload` 是 provider 前以及首次响应头/明文前的显式检查接点。真实 SQL authority 重新读取当前完整 canonical/materialized config、历史版本集合、当前用户/密码/session/account revocation/RBAC、原 Operation/私有 receipt、全部历史 nonce 候选、原 nonce 与 intent audit、准确 evidence installation/owner、Manifest/ref/claim/row_version。实际 NULL/外安装归属必须在 `SQLRegistry.load` 赋予 registry installation 之前拒绝。
- S3 只能 Stat 或读取原范围相交的完整加密帧及准确 envelope header。局部帧、其他帧、其他 immutable ref 和写操作拒绝。Transit/DEK unwrap 沿用真实 SQL authority 的前后检查；provider/caller/解密边界失败会使同一准入永久失败，不能通过复制对象或修复外部行再次使用。
- 部署 owner 授权回调之后，独立重读当前会话/撤销、原准入组、evidence 和完整 config，再检查 SQL UTC 与原单调期限。最终 Manifest 解码不再次调用 owner 回调，不能用回调返回成功掩盖其对同事务原行的修改。
- legacy unbound public/internal 下载上下文仍使用原路径。后续 r27 已在 runtime factory 中明确分流并禁止私有 evidence 回落到旧行回调；生产 main 仍未启用，不能称作现场敏感下载已经验收。

## 验证

1. [r20 工作树定向日志](evidence/d-download-committed-focused-20261019-r20.jsonl)通过 5 个主测试/52 个含子项，Go 退出 0；只覆盖当时的 smoke，后续独立最终复查和正常 provider/解密用例使用新回执。
2. [r21 冻结完整轮](evidence/d-download-committed-packages-20261019-r21-native.txt)通过 security/evidence/read **569 主/4,362 含子项**，默认 vet、无跳过、Go/包装退出 0，冻结来源 postcheck 和准确快照清理通过。它不覆盖随后新增的正常 provider/解密、历史集合变化和重复读取收敛。
3. [r22 最终完整日志](evidence/d-download-committed-packages-20261019-r22.jsonl)、[来源](evidence/d-download-committed-packages-20261019-r22-source.json)及[包装终态](evidence/d-download-committed-packages-20261019-r22-native.txt)通过：security **253/1,985**、evidence **242/1,861**、read **75/519**，合计 **570/4,365**；默认 vet、无跳过，Go 和包装退出 0。本轮 D 新增八个主测试/72 个含子项，其他 A 并行增量只按其实际冻结来源计入整包。
4. [独立复核](evidence/d-download-committed-packages-20261019-r22-review.json)重新计算唯一 package 终态、主/子项、选定新用例、按原记录次序的来源摘要、当前文件集合/字节及准确目录缺席。1,374 份输入逻辑 SHA-256 为 `40c5a657682fb5f68221922768938ce2e637f8be3fb9214355c6a8b0ee2f59ff`，当前零漂移；两轮准确源码快照和外部自有编译缓存共三个目录均已删除，[清理回执](evidence/d-download-committed-cleanup-20261019-r22.json)保留原 marker 与终态。未安装依赖。

正常用例执行实际加密对象的准入、S3 grant、准确 header/选中 frame 读取、真实 envelope/DEK 解密和最终 guard；投射 token、对象传输及 KEK 底层均为测试材料，没有请求真实 STS/KMS。反例包括会话/密码/角色/全局撤销、完整配置、原 nonce/Operation/receipt/intent、NULL/外安装归属、owner/ref/claim、历史 HMAC 集合、回调后原行修改、复制/取消/期限与范围越界；负例有实际阶段见证，provider 范围反例提供有效测试 token，避免因缺文件而提前拒绝。

本轮只修改 Go 候选与验证/交接，没有新增前端变更；未重复前端构建或当前 `cmd/server` 全包。r13 server 与 r18 公共读取/前端仍各自限于原冻结范围。没有执行正式 DDL/grants、真实 MySQL、SSH 或生产启用。

SQL 传输、owner 和容量仍为 synthetic；真实 JWT/EdDSA、A 配置/会话/RBAC 解析、D 原子准入和 SQL/provider authorization 代码执行，不等于实际 InnoDB、真实 provider 网络/投射 token、现场物理预算或生产授权验收。

## 后续工作

1. 完成实际 HTTP/runtime 的唯一原子准入入口、确认提交后 provider 接线、首次头/明文 guard，以及独立结果审计和准确 claim CAS 释放。已发送响应后失败只能终止流并写结果，不补 JSON；本地写完成不表示客户端收到文件。
2. 交付实际 owner/task/hold/ref 适配与物理容量/材料来源；正式 schema/grants/保留组评审及完整 MySQL 并发、锁等待、回滚和未知提交探针。
3. 保留[六项原始范围](system-backup-d-six-scope-readiness-20261015.md)：正式迁移/索引、完整 Owner 读源、B/A/D 恢复组合、管理认证/独立审计卷、实际历史升级激活、四矩阵/大数据 E2E。已接收旧专项按原冻结范围复用，不重复运行。
