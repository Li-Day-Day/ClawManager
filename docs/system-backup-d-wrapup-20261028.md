# D 17:00 前收尾交付

本窗口收尾时间：2026-10-28 16:50 前。**真实整链未通过，未部署、未启用、未执行现场迁移或授权。** 目标仍是原公共真实链，不以以下本地结果代替。

## 可以直接交付

- 给B的完整A/B分工、准确类型/输入、实际caller、事务/异常/验收要求：`system-backup-b-implementation-instructions-20261028.md`。
- 给B可应用的7文件补丁：`evidence/d-b-task-binding-handoff-20261028.patch`；基于PR `08d15abf`，实际隔离apply-check/apply及字节核对通过，目录已清理，同名JSON保留。
- B真实公共runner九包110文件已逐blob导入，D实际NewLinuxProfile→NewPublicRunner→BindTaskRunner→TaskExecutionLoop构造与调用存在；原task/spec/config/attempt/profile/deadline外层绑定保留B原bytes。Import/修正/失败恢复记录均保留。
- Requests concrete decoder/JCS子集/closed schema/OpenAPI和server实际构造已交付，外部HTTP owner只剩Admission/CurrentFacts/Manifest；非null新任务retry与catalog_import仍准确not_ready。已接收另一个D窗口的源码/测试/清理回执。
- C/Teams `288d74a9`已只读核对：有真实Team数据/存储/gate贡献，但system_backup_v2_*、engine selector与当前unversioned链不能机械混合。接收边界见 `system-backup-d-c-teams-integration-20261028.md`，没有整支合并。

## 验证与清理

| 范围 | 结果 | 准确记录 |
| --- | --- | --- |
| B四包/D controller/dispatch/当时main | 132根/366pass，0fail/skip；Windows controller构建0 | `evidence/d-b-public-runtime-wiring-20261028.json`、3ef原生日志 |
| 同一受审D/B源码Linux交叉构建 | exit0，未执行；全树并行变动单列 | f4f原生JSON/日志 |
| Requests/API/server | 21根/86pass，server构建0，五份代码/schema精确匹配 | `evidence/d-task-requests-20261028.json`、d0a原生日志 |
| 原合同Node检查 | 70/70，旧deadline caller断言已改成AcquireWithReceipt | `evidence/d-contract-artifacts-receipt-caller-20261028.*` |
| Skill取消、清理、许可、关门重开回填 | 7/7，0fail/skip；精确worker/gate pins核验 | `evidence/d-skill-gate-acceptance-20261028.json`、922原生日志 |

上述本窗口测试/构建/导入/补丁验证的自有source/cache/tmp/telemetry/binary均已清理，失败的CRLF导入与Node沙箱spawn EPERM及原生恢复日志保留；未安装依赖。其他窗口仍运行的目录不由本窗口删除。

**后续并行新增不借旧回执**：执行记录窗口新增SQLExecutionRecords/DurableExecutionStore/ExecutionJobPorts、082候选迁移并修改main；上表旧132/366及旧构建不覆盖该新包或新main。它有实际调用代码，最终验收与清理由其owner交付；主D所见immutable记录FOR UPDATE权限问题、新main实际B caller与准确pins要求已写 `system-backup-d-execution-records-primary-review-20261028.md`。生产link保持关门，未代为签收。

## 准确剩余阻塞

1. D/A：真实业务准入/物理容量与profile/resource映射、后台ExecutionAuthorization及原用途/版本/撤销/期限来源。SQL结构守卫、hash、已有HTTP scope不能替代它们。
2. D：新执行记录增量最终验收；实际scheduler阶段CAS/续租、完整pause/ACK/resume与未知Job intent/SQL ResourceJournal、Jobs owner/worker grant、relay cursor事务/原结果引用。新桥接类不等于这些owner已生产装配。
3. A/部署owner：真实bootstrap original、全部必需槽与用途材料/原grant，task DEK和保留历史、worker身份与信任；已分配installation_dfa02579009349938c8125490d9dfd41不是已初始化。A文件custody组件已交，不等于D SQL或原key用途授权完成。
4. C：公共CurrentFacts/immutable ManifestReader、artifact/finalizer/catalog具体adapter、两份正式catalog领域合同及三canonical表。B三份候选合同尚非正式签收；pending backup consistency=NULL与完整detail schema冲突仍待唯一合同决定。
5. 原catalog/registry/policy/cross-review、实际MySQL版本/四项初次start权限差集及新增records权限、同版本部署；不改pin或扩权掩盖失败。
6. 独立observer真实只读账号/受控DSN/CA及Host等pins。旧临时账号已删除；当前MySQL Pod/UID必须复核，现场命令见主交接。新的observer改动归现场D窗口独立验收。

以上到齐后才执行真实成功轮、同键重放/冲突、权限不足/跨安装拒绝及约定失败轮；独立核对调度、公共claim receipts、attempt/Job/relay/终态和原manifest checksum。目前这些现场轮次均未发生。
