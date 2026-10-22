# D verifier 必需检查数与封闭 ID 列表一致性（2026-10-22）

【A 后续交叉评审补充】A 发现原有限结构门禁仍接受 owner definition 或公共 Check 引用旁的附加 schema 约束，以及未处理的分支属性，可能把被额外约束排除的 ID 继续计数。修复仅收紧已支持的外层/引用/属性形状，保留文本注解及当前六份 A/D 声明；不是任意 JSON Schema 可满足性求解。七个新拒绝断言在原代码全部失败，候选及写回后各 120 项完整共享回归通过，六个新增 check/write 拒绝均保持 registry 字节不变，strict 仍按原缺口拒绝。[A 新限定验收](evidence/a-d-verifier-security-published-review-20261022.json)固定 346 项新输入、原失败与精确清理。下方原 112 项/345 项回执保持历史含义，其“当前来源”检查会因后续 A 工具和本门禁修改而拒绝；不更新原 pin 或伪称旧整个来源仍匹配。

状态：四份文件已写回，隔离/写回回归及独立重验通过，准确自有目录已清理。第三轮包装器的最终复核分类错误保留为失败，由第四版独立复核限定接收，未把原 native 退出码改成成功。

控制排除运行闭集和 ControlExclusionCheck 已包含 35 个 ID，但 x-owner-check-registries.D.control_plane_restore_validate.required_check_count 仍为 31。上一轮 35 表回归只核对 runtime/registry/ID 集合，没有核对这个声明字段。旧合同命令与 79 项原有合同测试接受了这一矛盾；旧日志仍是真实的原限定结果，不能证明当时已覆盖整个声明一致性。

本轮把 D 的必需计数同步为 35，并让 system-backup-contract-check.mjs 在 buildRegistry 和任何 --write 操作之前验证已提交 Owner 的有限检查声明。校验范围是现有“共同 Check + const/enum ID 分支”这一明确结构，不声称实现任意 JSON Schema 的等价性推理或完整报告验收。缺失本地 schema、非法/重复 ID、开放/混合 ID 约束、空分支、无效计数或声明数量不一致都拒绝。A 已提交的四份声明及 D 两份声明一起核对；B/C 仍为 pending_owner_submission，正式批准、草案和 schema-hash 状态不变。

命令的 JSON 输出增加 verifier_check_registries，显示六份声明各自的 schema 与计数。它只汇报机器合同中的必需数量，不生成验证报告、不认证 B target proof，也不让缺少交叉评审的 registry 变为 frozen。

新增回归覆盖旧计数 31、少/多一项、零/负数/小数/字符串/null/不安全整数、缺失 schema、外部引用、空/重复/非法 ID、混合分支、其他 Owner 计数漂移及未计数的新声明。原 D 闭集回归另直接交叉核对声明计数、ID 数、registry 控制表数与运行 map 数。各个畸形输入测试从明确的有效 35 项 fixture 起步；实际当前文档在验收测试中未经修正地读取，仍须拒绝旧声明。

验证使用原快照脚本创建只读源码副本，另稳定复制共享合同测试需要的八份部署/前端/主计划输入；没有 npm 或依赖安装。反例只把 schema 换回精确的原始 31 声明，其余新门禁及回归保留：--check 和 --write 必须按准确的计数诊断退出 1，schema registry 文件必须未改；36 项测试应准确命中两项预期失败，34 项其余验证通过，不能把编译、导入或命令错误算作反例。随后恢复 35 声明，完整共享合同/原 checker/D 闭集/新有限声明回归、普通 CLI、strict CLI 及 DTO 均在隔离与写回后执行；strict 继续按真实缺失合同、未完成评审和 live schema-hash 阻断。

首轮 d-verifier-registry-counts-20261022-f44373d8 的正确候选隔离 112 项及 CLI/DTO 通过，两个 CLI 旧计数反例按预期拒绝；包装脚本把 counter-tests 参数误拼成一个模块路径，出现 ERR_MODULE_NOT_FOUND。独立复核器因缺少测试摘要拒绝准备，未发布。第二轮 d-verifier-registry-counts-20261022-r2-ce23f83d 修复参数后，旧计数使 36 项测试出现三项失败；其中“未计数的新声明”负例尚未执行到自身断言目标，先被旧计数拒绝，导致错误诊断不匹配。复核器拒绝这轮非预期失败集合，未发布。第三轮只把负例 fixture 与真实文档验收分开，保留门禁及两项验收断言。两个失败 owner 各 1,571 份文件已清理并独立确认不存在，原始日志/native 结果保留。

本轮不改 Go 运行文件，因此不重跑 Go 包或产生 Go 编译缓存；原 Go 验收仍只覆盖其对应历史来源。本轮只修正合同声明和 Node 门禁，不验收实际 MySQL、真实 B capture/target proof、九表 normalization、完整 GC 或 D 原六项。

第三轮 d-verifier-registry-counts-20261022-r3-83ec9750 完成了 112 项隔离测试、112 项写回测试、两轮普通 CLI/strict CLI/DTO 与旧计数反例，并写回四份文件。其 --validate 复核误把工作区内自建 tmp 文件当作未归档项目输入，包装器最终 exit=-1，source_postcheck=false；原 native 和准备回执状态均保留，不声称该轮整体退出成功或以 native 证明整个冻结源码的最终复核。准确 owner 清理了 1,571 份文件。

独立版本 d-verifier-registry-counts-20261022-r4-audit 对原日志和 345 项限定输入重新核对：额外三条读取只来自原准确 owner/tmp，分别是同一测试 SQL 的 LF/CRLF 版本和一份 synthetic reviewed-evidence.json；SQL 大小/摘要按固定测试字面量独立重算，JSON 读取路径、大小/摘要及创建代码固定关联。这些都属于测试生成夹具，不是未记录的外部输入或现场批准。新的准确 owner 中重新执行完整 112 项回归及 DTO，源输入/文件集合前后核对通过，native exit=0，清理后独立确认目录不存在。原冻结主来源 1562 份，SHA-256 为 c401b705b9cf3ef9df1df3ac238628d0745a8bff4177eba03a88d6cc0814319d，另有八份补充输入；本次验收限定 345 项 Node/保守合同与脚本输入，不为整个当前工作树背书。

最终结果为隔离、写回、独立重验各 112 项，无失败、取消、跳过或 todo；36 项旧计数反例准确两项失败，其余 34 项通过。两轮 DTO 及独立重验均为 49 类型/435 字段/7 schema、contract_frozen=false；strict 两轮保持退出 1，当前 policy_pending=40、cross_review_pending=60，四份缺失合同为 recovery_catalog_records、restore_target、status_relay、catalog_scan_record，现场 schema-hash 仍待验。四个自有目录累计 4,714 份文件已清理，分别为前三轮各 1,571 份及独立重验的 owner marker 一份；临时 SQL/JSON 由各测试 finally 自行清理，未安装依赖或留下构建产物。

[最终独立验收](evidence/d-verifier-registry-counts-20261022-r4-audit-accepted.json)、[独立原生命令及清理](evidence/d-verifier-registry-counts-20261022-r4-audit-native.json)、[保留的第三轮包装失败](evidence/d-verifier-registry-counts-20261022-r3-83ec9750-native.json)、[清理后可重复复核](evidence/d-verifier-registry-counts-20261022-r4-audit-review.mjs)。运行 node docs/evidence/d-verifier-registry-counts-20261022-r4-audit-review.mjs --check 可复核；后续限定输入变化应保留原证据并重新验证。
