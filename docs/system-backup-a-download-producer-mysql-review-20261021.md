# A：producer 下载 owner 十八项实际 MySQL 独立复核

[194 项独立回执](evidence/a-download-producer-mysql-accepted-20261021.json)接收操作者 `d-download-producer-remote-20261021-091802` 原始日志与同轮来源的准确隔离 SQL 范围。A 仅只读核对，没有重跑 Go/构建、连接服务器、安装依赖或删除 D 的资源。

| 核对范围 | 原始事实 |
| --- | --- |
| 同轮来源 | 1,455 输入，SHA `d9500684fb57a6cf658830a236f9f7e9ef8268e36aea3e156e50cb0c452f2542`；与 A 已独立接收的 D 批次 r3 逐路径/大小/字节相同。 |
| 完整本地门禁 | security 255 主/2,011 项，evidence 341 主/2,853 项，合计 596 主/4,864 项；完整 RUN/PASS 清单一致，无失败/跳过。四个准确 PowerShell 名称转码单列，原始日志不变。 |
| 独立输入与编译 | producer 三 seed/22 项，脱离源码相同 22 项；v2 胶囊 SHA `a881d2290a05b3239f9df583bfc61542907083becd0ff11ad53eb7645a841bc0`、本地/远端 probe 和 migration runner 精确匹配。 |
| 实际 SQL | MySQL 8.4.8，95 文件迁移及 catalog pin；准确十八叶子及一个 root 全部 RUN/PASS。 |
| 真实锁 | run、history 行锁与 receipt、hold 空范围四处，在各自用例记录准确不同 holder/writer connection ID；源 helper 实际关联 requesting/blocking locks 与两连接，释放后写事务完成并回滚。 |
| 清理与结束 | 十八不同 `amfa_` 子库 DROP/缺席由各自叶子日志报告；namespace `sbk-mig-261021015533-01f1` / UID `73689a41-d102-4274-b8a8-067a36ab3fe5`、远端 scratch 和本地 build cache 清理齐全，最终冻结 postcheck/default vet 与 `download_producer_exit=0`。原 snapshot 目录另外独立确认不存在。 |

代码复核确认：三个正常 HTTP/结果场景检查准确解密正文、结果关联和原 C1 行未变；七个损坏/缺失场景在 Admit 拒绝后核对零准入写入；foreign reference 在具体 owner 锁读取中拒绝；两个行锁与两个空范围使用真实事务；撤权仍停止 provider 授权，结果关联触发器失败回滚，intent 后历史投影变化回滚并复核原记录。这些断言来自本轮冻结来源对应的 actual probe 与共享锁观察 helper。

该接收只关闭这十八项隔离 producer owner 下载链。数据、issuer、物理容量、密钥服务和 provider transport 仍为测试输入，不能据此接收生产历史来源、实际账号/完整元数据、真实卷/容量、人员 MFA、完整 GC 或部署。后续普通 GC/producer eligibility 文件及 A 的 tagged owner 修订均按当前漂移明确单列；当前整个工作树未验收。

A 的四任务 owner 十一项仍为今天原轮七过四败，修订后的准备已通过，继续按[原完整入口](system-backup-a-download-sql-owner-mysql-handoff-20261019.md)新轮执行。D GC task 十八项与受限角色十项保持各自独立范围；已有 MFA 九项、准入/结果二十四项和本次 producer 十八项不重复混跑。
