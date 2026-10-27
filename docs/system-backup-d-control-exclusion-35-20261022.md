# D 控制表恢复排除闭集同步到 35 表（2026-10-22）

【2026-10-22 verifier 必需检查数遗漏已修正】[合同声明与独立验收](system-backup-d-verifier-registry-counts-20261022.md)发现上一轮虽然把 runtime/registry/check ID 闭集同步到 35，机器合同 required_check_count 仍为 31，原 73 项回归未覆盖此字段。本轮同步为 35，并在共享合同命令 build/write 前校验 A/D 六份有限 ID 声明的数量、重复/非法 ID 与本地 schema 结构。隔离、写回及独立重验各 112 项通过；旧 31 声明在 --check/--write 下均按准确诊断拒绝，36 项反例恰两项失败、34 项通过。345 项限定输入与文件集合前后复核一致，DTO 49 类型/435 字段保持。第三轮包装器因三条测试自建 tmp 读取分类错误而 exit=-1，原失败及准备状态保留，由第四版独立复核接收，不声称原轮整体成功。四个准确 owner 共 4,714 份文件已清理并独立确认不存在；未安装依赖、未改 Go 运行文件或执行远端。strict 仍因 40 项 policy、60 项交叉评审、四份 missing 与 live schema-hash 阻断，B/C 未提交、真实 proof、完整 GC 和原六项继续未完成。

状态：五个候选文件已写回工作区，隔离及写回后的完整 resources 包、共享合同回归和 DTO 对照通过，本轮临时源码、缓存与测试构建产物已精确清理。本轮完成控制排除器、verifier 机器合同和当前 registry 的闭集一致性，不更改 registry 的批准、schema-hash 或合同冻结状态，不启用生产恢复。

原实现及 ControlExclusionCheck 的 ID enum 只有 31 张控制表，而当前 registry 已把以下四张正式运行表登记为 D/system_backup、metadata_only/reference_only：

- system_backup_admin_revocations
- system_backup_admin_sessions
- system_backup_metadata_reservations
- system_backup_totp_credentials

旧 ControlExclusionAllowlist 会因遇到未列入闭集的表提前报错。因此两个正常目标校验测试停在门禁前，本轮不把这描述为既有代码曾漏检放行源控制行。修复保持闭集策略：显式纳入这四张表，未知新增/缺失/归属或策略漂移仍拒绝；schema_migrations 仍是目标本地迁移元数据，不要求为空。

完整目标检查从 31 增为 35 项，每表读取 InnoDB 基表类型及 COUNT(*)，共 70 条 SELECT。在同一只读 RepeatableRead 事务中，非零行数输出对应 control_plane.empty.<table> 的 failed/integrity/normalization_failed，不读取 session、TOTP 或 reservation 内容。缺表、非 InnoDB、查询错误或提交错误不输出部分检查。B 的目标证明接口和同一事务调用位置不变；实际目标身份、normalization 完成、新 SELECT-only 凭据和写凭据销毁仍须由 B 实现并验收。

另补提交后 context 复核。驱动 Commit 在取消/到期后才返回成功时，不释放已经构造的 passed 或 failed 检查集；提交自身失败仍保留原包装错误优先级。这不撤销已完成的只读提交，也不把 context 视为可中断任意内核调用的保证。

原 resources 包的第三个既有失败是 unreviewed_other_domain 夹具：它把 required reviewer 设为已获批准的 D，没有真正移除批准。只在该负例中清空 approved_cross_reviewers，保留“缺少跨域签收必须拒绝”的断言，不改运行批准逻辑或正式 registry。

共享校验 ID 在 verifier schema 中是封闭 enum；Go/TypeScript 的通用 DTO 无需改写或生成新类型。会验证 35 表 schema/runtime/registry 完整相等及四张运行表的正式迁移/metadata-only 策略，并运行现有完整机器合同检查与 DTO 类型核对。Node 基线首次使用 --test 被环境以 spawn EPERM 拒绝，未进入任何断言；原失败保留。改为同进程执行后，原完整合同 70 项、DTO 49 类型/435 字段通过，既有四份缺失合同和 contract_frozen=false 仍如实保留。

验证先执行未修复的原完整 resources 包，核对三个既有失败；再对候选仅移除提交后 context 条件，要求恰好复现取消、deadline、非空检查集的三个迟到结果，正常及原提交错误作控制。正确候选和写回后的完整 resources 包均已通过，没有复制两个文件来代替整包。

Node 验证使用只读文件访问追踪记录真正读取的 Go、schema、TypeScript、部署和主计划文件；原快照规则之外的八份输入单独稳定复制及前后校验。完整合同/新增一致性测试/DTO 在隔离与写回后分别执行，不运行 npm、不安装依赖或声称完整前端构建。主快照、补充输入和选定当前输入分别记录，其他 Owner 的并发文件不获得整棵工作树背书。

本轮候选五个文件：control_exclusion.go、capture_scope_test.go、新 control_exclusion_runtime_test.go、verifier-contract.schema.json、新 system-backup-d-control-exclusion.test.mjs。证据前缀为 docs/evidence/d-control-exclusion-35-20261022-3ef89a46。缓存、tmp、telemetry、构建文件和隔离源码均放入准确 owner，测试结束后精确清理；最终以准备和 native 回执为准。

真实 B capture/target proof、九张资源业务表 normalization、实际 MySQL/权限、C provider、正式共享签收和完整恢复编排继续待验收。原 GC 42 项人工实测不由此次本地结果替代。

最终本地验收：原包三个既有失败（含四条根/叶 fail 事件）逐名匹配；正确代码隔离和写回后各 21 主/94 条通过事件，无失败或跳过并保留 default vet。仅移除提交后 context 条件的反例准确击中 canceled、deadline、canceled_nonempty 三项，正常与原提交错误控制通过。共享合同/新增闭集回归各 73 项通过两轮；DTO 两轮均 49 类型/435 字段、7 schema，contract_frozen=false，四份既有 missing 合同保留。

主冻结来源 1560 份，SHA-256 4c96417870a9cf7a27b38c6945a1df9f35b5590a0462e17050e3b5f183b1cfd8；另有 8 份补充 Node 输入独立冻结。实际 Node 读取 129 份项目文件，最终 271 项 Go/Node/保守运行资产及文件集合前后复核一致。[准备回执](evidence/d-control-exclusion-35-20261022-3ef89a46-preparation.json)、[native/清理结果](evidence/d-control-exclusion-35-20261022-3ef89a46-native.json)和[清理后独立复核](evidence/d-control-exclusion-35-20261022-3ef89a46-review.mjs)保留基线、反例、源码原始/测试后字节与两轮结果。

准确 owner .tmp-d-index-cache-3ef89a46567f4881b0f0cd0622dc817b 及 2827 份文件已删除，另以 stat 确认目录不存在。没有安装依赖或执行远端 SQL。现有 35 项是本地逻辑验收，不能替代真实 B 目标证明、实际 MySQL、九表 normalization 或 D 原六项整体验收。
