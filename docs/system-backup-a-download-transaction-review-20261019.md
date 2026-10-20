# A：下载原子准入的独立本地接收

2026-10-19，A 接收 D 的 r13 冻结本地事务模型；[独立回执](evidence/a-download-transaction-review-20261019.json)记录 76 项核对。[原始 Go JSON](evidence/d-download-admission-chain-packages-20261019-r13.jsonl)、[原始执行日志](evidence/d-download-admission-chain-packages-20261019-r13-native.txt)和[1,356 文件来源清单](evidence/d-download-admission-chain-packages-20261019-r13-source.json)保持原样，来源逻辑摘要为 `65c1c7e44c69a8837bc0c29061004e5fe13e8436e8fb9a15eca6772e3728a510`。执行者是 D 的原生门禁，A 独立审计原件，没有把它改记为 A 重跑。

security 包 248 主测试、1,665 子测试；evidence 包 229 主、1,520 子；server 包 6 主、6 子，共 3,674 项通过，无失败或跳过。默认 vet、冻结源码 postcheck、Go 和包装退出码 0 齐全。准确六条 source/cache 路径独立确认不存在，没有安装依赖。

A 新增四个根、合计 29 项检查，覆盖最终授权回调替换 nonce 原接受时间/消费时刻/subject/历史版本、审计摘要、claim owner/version、evidence locator、operation key/time、receipt 保留期、config active/cell，以及 HTTP transport 预检、错误 proof/history 在 key/nonce 效果前拒绝。SQL JSON 空白等价格式有成功对照，不被误判为篡改。

本轮验证 L0/L1 到 key、owner/reference、所有历史 HMAC、容量预留、审计、claim CAS、operation/private receipt/public snapshot 和 nonce 的同事务装配及单次提交。真实 JWT/Ed25519、A 当前会话、RBAC、固定文件材料和容量模块参与；SQL transport、owner facts 与容量输入仍是模型/合成夹具。

两轮 A 失败原件保留：第一轮误将等价 JSON 空白当作攻击，已改为实际 claim 摘要替换并增加成功对照；第二轮 D 夹具把 ACR 编码为 null，修正为空数组，生产 registry 解析未放宽。第二轮另有 `system_publication_test.go:404: producer_committed_but_execution_expired`，原失败保留；该根在最终整包通过。失败轮未声称具有成功后的 postcheck。

回执只覆盖原冻结字节。接收时重点来源匹配；此后 A 的下载 MFA 修改和 D 的公共读取/合同修改属于后续增量，不能据此扩展为当前整个工作树通过。

后续优先级：

1. A 补准确下载 MFA 签发入口：只接收 evidence ID、Range、幂等键，从同事务已授权 Manifest 生成 canonical/hash，并复用真实密码/TOTP、已记录会话与原始期限。
2. D 的真实 owner/hold/reference 与物理容量来源、完整准入真实 MySQL 的回滚/并发重放/未知提交验收；既有 nonce 八项及审计四项已接收，无需重跑。
3. 已知成功提交后的 provider/plaintext 路径、重新授权、运行材料与部署/E2E。
4. 正式 ownership/inventory、历史升级、保留及最小数据库权限的共享 schema 评审。SQL 提案或本地模型不替代正式批准。

本人 MFA、真实 owner/authority/capacity、完整准入实际 MySQL、正式迁移和生产下载路由均未由本回执验收。整体目标继续。
