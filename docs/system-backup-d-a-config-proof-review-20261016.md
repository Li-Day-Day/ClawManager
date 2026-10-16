# D 对 A 配置 proof 十五项真实 MySQL 的独立接收

[D 复核回执](evidence/system-backup-d-a-config-proof-review-20261016-r42.json)与[只读复核器](evidence/system-backup-d-a-config-proof-review-20261016-r42.mjs)接收操作者 [11:06 冻结轮原日志](evidence/a-config-proof-mysql-remote-20261016-110614-b99f5f47.txt)及[源码清单](evidence/a-config-proof-mysql-remote-source-20261016-110614-b99f5f47.json)。日志已在 11:24:52 结束，`a_config_proof_mysql_exit=0`；不再把它当成 seed 阶段尚未结束或待执行的十五项专项。

## 独立核对的证据

- 1,292 项输入及有序逻辑 SHA `476a88c5f3b645b66ac604f1e69f6ea7f26a5820e699886a711d2376dc98e36b`；112 项 proof、SQL helper、派发和正式 migration 重点来源与该冻结轮匹配。当前另有一项 D 健康 wrapper 的已记录日志改动，不据此批准整个当前树。
- Linux proof binary `4f358d577b790830bb4269d5285ef581805b396e8ca09e72a4e29695a791646e`、实际 capsule `459b6d30c893e2073461a66dbc15d716b9450531559f3fe427fa7bd1639e3e65`、runner `2a13a296e533b09a5aa297b014cf01a77bda7df37dc5fc93fd1890566207135d` 在本地准备与实际 SQL marker 一致。
- MySQL 8.4.8，当前完整 95 文件 catalog `2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237` fresh replay 与准确 ledger 校验通过；没有激活配置、验证实际历史等价或本人 MFA。
- `TestAConfigProofMySQL` 的十五个准确叶子各一次 PASS，root PASS；涵盖两个实际 HTTPS/JWT proof 请求、同一 TOTP 并发一次签发、当前用户/凭据/会话与 RBAC 拒绝、审计回滚、提交成功后合成丢失回复，以及 signer 中由数据库时间观测到会话过期。
- installation-state 与 config 两次实际行锁等待均有 OBSERVED marker；冻结的 SQL helper 按 worker CONNECTION_ID 和 performance_schema 验证等待。十五项准确 fixture 清理 marker 齐全。
- namespace `sbk-mig-261016032334-5226` / UID `87f15bb5-1b91-40c1-8479-a13a7ec785c7` 的原 UID 清理、远端 scratch、本地 cache、冻结副本 postcheck、准确源码 owner 删除和最终 exit 0 齐全。本地准确 owner 当前独立确认不存在；没有由 reviewer 查询远端。

原日志四条 socket close diagnostics 保留；后续全部准确结果、清理与终态都齐全，不能仅凭这些诊断否定本轮成功，也不能据此保证其他中断轮已清理。D 没有重新执行 SQL、Go、SSH 或安装依赖。

## 接收范围

关闭的是 **A 配置 proof 十五项原冻结轮的实际 SQL 待办**。它不执行配置 update/rollback writer、081/082、旧 canonical 回填、D 新健康七项 root 或真实维护 holder 生产入口。测试使用合成管理员、密码、MFA seed、issuer 和 key；真实算法与 SQL 会话校验不证明管理员本人 MFA、目录撤销事件或生产运行 grant。

不将此结果移植给 D 的 `TestDControlHealthMySQL`，也不把它与旧 94 文件的 writer/storage/service 回执合成一轮成功。D 健康七项实际 SQL、当前 schema/权限/TTL 评审和正式接线、真实原文/授权/物理容量/审计卷、实际历史升级与完整前端构建/浏览器继续待交付。正式 config 的 A/B/C 交叉评审要求保持。
