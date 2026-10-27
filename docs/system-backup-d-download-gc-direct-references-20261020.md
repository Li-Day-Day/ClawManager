# D：下载组 GC 的必需直接引用守卫

新增 `SQLDownloadGCDirectReferences`，并将它作为 `DownloadRetentionGCConfig.References` 的必需配置。构造器拒绝缺组件、其他数据库/安装或未明确指定 maintenance receipts 为 absent/installed 的配置。它由 collector 固定调用，不交给 owner callback 选择是否执行；仍不能单独代替完整 `DownloadRetentionGCPolicy`。

## 范围和阶段

下列 1/3/5/7 是组件在 collector 中的候选阶段，描述实际调用位置，不代表已批准的全局锁等级或死锁自由证明。

| 阶段 | 固定调用位置 | 直接引用 |
| --- | --- | --- |
| 1 | 当前配置之后，原 actor/worker/group 之前 | installation matrix Operation、maintenance mutation lease 的 operation_identity；明确 installed 时还有 maintenance receipts 对两个 audit ID 的四个范围 |
| 3 | 原组独立重建并比较提示后，owner 之前 | Operation retry、compact tombstone 的 gc_batch_id、其他 admission/result 收据的公开 Operation ID、两个 audit ID 的全部收据关联 |
| 5 | owner 之后，原 nonce 十九字段核验之后 | event/prune run/prune item/external action/check cleanup 公开 Operation ID；staging/restore resource 两类数字 Operation ID；artifact lease holder；其他 nonce 对原两条 audit 的引用 |
| 7 | 容量和原两条 audit 核验之后，deleted evidence 之前 | 所有 audit details 根字段 operation_public_id、intent_audit_id、result_audit_id、audit_log_id、nonce_id |

查询不按安装、状态、是否过期、actor 或 action 缩小范围。保留的外国引用均阻断，组件不替它们删除、解除或推断保护期限。`audit_logs.resource_id` 在正式 001 中是通用 nullable INT，不能拿 SOP 字符串比较，也不能把不同资源恰好相同的数字视为 Operation 引用；系统备份审计的明确关系来自上述 JSON 字段及实际 FK。

只有原组独立核验的准确主键可以排除：原 operation_id 对应的 admission/result 收据、原十九字段 nonce 的准确数字主键、原两条 audit。原 nonce ID 在实际 `LockNonce` 成功后取得，不从 actor、安装、过期状态或不可信提示猜测。core 继续在每个 DELETE 前复核整份原组，并在最终阶段独立检查原主键/公开键/幂等键缺失；组件的主键排除不能代替这些原事实检查。

每阶段初次锁定的 SQL 与参数保存在事务绑定 guard 内。删除前及所有删除/其他 callback 后复查完全相同的范围，并重核数据库和原 metadata 摘要；不刷新提示，不加入新的范围，不依赖 RR 的旧一致性快照。失败状态由值副本共享，阶段必须按顺序推进，复查时间不能倒退。

## 闭合目录

代码关闭列目录、SQL 标识符和 JSON 根字段集合。metadata 只用于比对，不产生 SQL。必需表须是完整可见的 InnoDB 基表，缺表、视图、列缺失/重复/类型错误、未分类的 system operation/audit/nonce 列均拒绝。每类 metadata 最多 10,000 项，每字段最多 512 字节。

同时读取所有库对当前库 Operation、audit、nonce、admission/result 收据的入站 FK。仅允许已分类的本库 source-column→target-column 组合及 RESTRICT/NO ACTION；跨库、未知列/目标及目前没有数据守卫的 nonce/result PK 入站引用均拒绝，即使外层重新固定了它们的 hash。后续即使增加一条仍属允许组合的 FK，原 metadata 摘要变化也使 guard 失效。

独立声明对照测试读取正式 migration 目录和现有 producer 胶囊中的 admission/result 候选 DDL，核对公开列类型及每条入站 FK 的分类。它不执行 DDL、不证明历史升级，也不能代替实际 MySQL metadata。maintenance 082 仍按原候选与明确安装状态处理，未加入正式 migration。

## 剩余门禁

这不是任意文本/嵌套 JSON 的引用发现器，也没有替完整 policy 审查所有业务语义。其他 evidence/logical 引用、artifact 的其他 task/import 依赖、system 原始绑定、当前工作授权/撤权、完整特权 metadata 可见性、trigger/program 定义和 DDL freeze 继续必需。不得把命名列目录或模型 metadata 当成全库引用为空的生产证明。

部分空范围查询在当前索引上可能扫描/锁住较宽范围。实际 EXPLAIN、索引选择、InnoDB 空范围覆盖、跨参与者次序/死锁、受限角色和物理容量仍待验证；没有擅自新增索引、GRANT、依赖、生产路由或调度。

## 本地验证

r79 首次冻结后，Windows compile 在标准库 internal/runtime/maps 以 `0xc0000043` 退出，未执行测试。失败及普通/最终源码 postcheck、准确快照清理记录保留。随后修正审计通用整数的分类，并加入独立声明对照，按新来源执行 r80；不把它称为 r79 的同源恢复。

r80 独立声明测试发现候选 admission/result 的公开 Operation 列实际为 `VARCHAR(128)`，修正原先错误的 CHAR 预期；声明解析器改为保留首次列声明，避免把 CHECK 内的同名列覆盖成 REGEXP。r81 该独立声明测试通过，但 SQL transport 的旧占位符计数把 metadata 查询字符串常量里的两个正则 `?` 当成参数，在进入列目录 callback 前就拒绝。修正仅让这条固定无参数 metadata 查询按零参数计数，生产 SQL 不改成迎合模型。否定测试补“确实到达目标范围”和“删除后注入确实执行”断言，防止其他早期拒绝造成假阳性。两轮断言失败和源码差异均保留，不改为无修改重试。

r82 在新冻结 1,445 输入 SHA `127d371dc42775d86afd33603106372f24f1f7c115578fbbffd710a4b64caafc` 上通过全部 GC **24 个主测试/308 个含子测试**，其中新增直接引用六根/66；默认 vet、普通及最终源码 postcheck、退出 0 和准确快照清理齐全。

r83 四包尝试中 security/read/producer 各自通过，evidence 三个引用反例没有到达目标范围；它们准备耗时 5.76/6.41/9.76 秒，与原夹具提前采样 SQL 时间、collector 五秒时钟限制相符。新 worker 和 synthetic 容量报告改在准备完成、首次 GC 事务之前采样，不刷新旧下载组。r84 全部直接引用六根/66 已通过，但准确到期夹具因平移后审计时间的小数秒而失败；r85 将共享时钟向下取整，又触发了“容量报告早于已有 sample”的正确拒绝。r86 恢复微秒共享时钟后，其余 GC 与 A 独立对照通过，准确到期仍需对齐原收据的微秒相位。最终只有该边界场景选择下一个相同相位的 SQL 时间，并断言原组平移差值为整秒，保留原 audit.created_at 合同。r83/r84/r85/r86 整体 exit 1 与各次源码差异均保留，生产约束、范围到达断言及默认 vet 未放宽。

r87 最终冻结 **1,445 输入** SHA `9b06627f12efd485430da3c44fa4b41724d071ed22b8aa1ac70f46f43dfdd878`，所有 GC **24/308** 加 A 独立整数列/FK 对照 **1/4**，合计 **25/312** 全通过；新增直接引用仍为六根/66。准确到期、三个原未到达反例、迟到引用回滚及所有夹具使用者均执行，默认 vet 与普通/最终源码 postcheck、退出 0 齐全。producer 三 seed/22、脱离源码/22、Windows/Linux probe、Linux migration runner 均通过；正式 catalog 保持 95 文件，v2 胶囊未变，没有实际 MySQL/SSH、依赖安装或生产启用。

[独立复核回执](evidence/d-download-gc-direct-20261020-r87-review.json)按准确来源差异接收分轮测试集合 **729 主/5,925 含子项**：r83 三个完整包、r84 未受改动影响的 evidence 299/2,299，以及 r87 当前全部 GC/独立 A 夹具使用者 25/312。r83 后仅两份 GC 测试文件的夹具/诊断变化，r84 后仅 GC 测试夹具变化，所有生产输入相同；集合与原四包测试逐项覆盖一致。它不是单次完整四包或当前 evidence 整包调用通过，不把 r83/r84/r85/r86 的整体失败改为成功。接收时当前输入集合和字节均零漂移。

[清理回执](evidence/d-download-gc-direct-cleanup-20261020.json)确认 r79—r87 九个准确快照及一个自有缓存，共 **10 个目录**均不存在，全部构建二进制随之删除。日志、来源 manifest 和复核脚本保留用于复现。

按用户“做完这轮先停一下”的要求，本轮收尾后暂停，不开始下一项。恢复后仍优先接收 producer 十八项实际回执，再补完整 GC policy、实际锁/角色/DDL freeze 等剩余门禁；已接收四任务十二项不重跑。原六项保持未完成。
