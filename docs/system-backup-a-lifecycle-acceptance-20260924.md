# A 对 D 生命周期与轮换结果的限定范围签收

2026-09-24，A 已复核并接收 D run `d-lc-387dab09ff2a1367ca4b5b56`，结论为：**隔离环境的五类身份撤销/自然过期，以及 KMS/三类 signer 的新旧 named-ref 切换与历史验证通过。** 本结论不批准整体 provider capability 或灾备资格，不修改正式 evidence registry。

机器记录：[A 签收记录](evidence/system-backup-a-lifecycle-acceptance-387dab09ff2a1367ca4b5b56.json)。原始结果 SHA-256 为 `99fc68a174daa0785fbbb9b552f7f2fe05432daa284b8aad8d3123a9625fdcd9`，原文件与 D 的交接/接收记录未改写；D 文档中的“待 A 签收”是其交付时状态，以本记录补充。

## 已复核的证据

| 项目 | A 复核结果 |
| --- | --- |
| 固定输入 | 原 handoff hash、四份 Python 源码规范化 hash、namespace UID、CA、endpoint、工具镜像与结果绑定一致 |
| 生命周期 | 五类身份各有独立 revoke/expire/control 会话，共 15 个身份；十组正向→拒绝序列完整，拒绝前后控制调用均为 200 |
| 撤销 | 成功调用之后、拒绝之前存在对应身份的成功撤销审计；拒绝发生在原到期时间之前，不能由自然过期解释 |
| 自然过期 | 五次拒绝均晚于 provider 到期点加 10 秒；最小实际间隔约 15.709 秒；对应自然过期身份没有人工撤销审计 |
| 新旧引用切换 | 完整检查 194 条调用的路径、角色、方法、状态和顺序，包括 KMS 旧/新生成与解包、旧 ref 禁止新生成、错误 ref/context 拒绝和三用途签名切换 |
| 六份历史/新签名 | 重新执行 Ed25519 验签及错公钥、错用途、篡改负测；六把公钥不同，payload 绑定 run、用途和完整 ref |
| 审计 | 388 条投影组成 194 个不同 request/response 对；逐条核对路径、方法、时间、错误状态、可解析身份与调用顺序，拒绝重复或缺失记录 |
| 清理 | 8 把测试 key 和 5 个 policy 的删除后 GET 404 均存在；五个控制身份清理撤销晚于全部数据面测试。接受 runner 对 Pod/Secret/检查点/intent 清理完成的报告，未重新点查集群 |

对于没有返回 request_id 的调用，审计关联依据串行顺序、路径、方法和一秒内时间窗口；失效 token 的审计身份为 unresolved，不能声称 provider 审计独立识别了已失效 token。KMS 明文一致性由绑定源码的远程断言证明，未保存 DEK/密文，A 不假装从归档重新解密。

原始远程结果为未签名操作者证据。操作者未另行回传进程退出码，因此继续记为 `null`；本地离线 verifier 退出 0 不替代远程退出码。此次签收依据完整输出、固定输入、源码审阅及离线复核，不因 SSH 关闭提示要求重复测试。

本轮轮换是独立 old/new named key/ref、各自内部版本 1，符合本 lab 交接约定；不覆盖同一 key 内部 v1→v2。保存的公钥与签名支持历史离线验签，不证明外部可信公钥发布或长期保留系统已实现。

## 本地复核与复现

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    node .\scripts\system-backup-a-lifecycle-review.mjs
    $aReviewExit = $LASTEXITCODE
    "a_lifecycle_review_exit=$aReviewExit"
    if ($aReviewExit -ne 0) { throw 'A 生命周期离线复核未通过' }
}
```

A 复核器额外检查完整调用序列、逐条审计及控制/到期/清理时序。A 10 项、D Node 21 项、D Python 11 项本地测试通过。首次 A 测试的 Node 子进程被沙箱以 `spawn EPERM` 拒绝，测试未执行；使用 `--test-isolation=none` 后通过。没有安装依赖、构建或生成测试产物，没有远程调用。

## 当前下一步

A 的上一份生命周期补充输入请求已满足，不再等待 D 重交或重跑。后续 A 的验签与 inline SQL 登记组件已完成本地实现，见 [组件交付与接线清单](system-backup-a-provider-proof-adapter-20260924.md)；当前待 D 事务接线、C/D 复审真实 issuer/profile 和 MySQL 集成验证。以下为完整登记链路的原计划：

1. 先对接现有 v12 provider-proof registration 和 capability-evidence 草案，明确可信 issuer/key ref、签名输入、被注册对象与服务端状态/时间/大小绑定；不得直接把这份未签名 JSON 标成已注册 evidence。
2. 实现并测试 provider-proof 验签 adapter 与登记接入，覆盖未知 issuer/ref、签名篡改、错对象/状态、过期、重放与失败关闭；跨 owner 事务/API 接口按 A/C/D 分工对接。
3. 再补生产 task/attempt scoped grant、Evidence 内容/长度/到期绑定，以及源集群外恢复证据。当前无 active config，不能把隔离 lab 成功当成应用备份/恢复集成测试通过。

本 run 无需 RECOVERY。原 provider lab 暂保留，当前五类基线 token 不应被假定仍有效；后续真实远程测试应重新核对有效输入。全部 A 远程测试结束后按 D 原清理入口绑定 namespace UID 删除 lab；不能把清理本 run 与删除整个环境混为一谈。
