# D 镜像设置恢复候选

2026-10-23，继续原九表 v2。B/C 生产材料仍未交付。A 已另存双审计候选静态及 46 主/421 条冻结测试接收，本轮执行其原复核程序确认；该接收不覆盖后续 egress/image 文件，也不批准生产写入。

`restore_images.go` 新增私有离线 `normalizeRestoreImages`，输出 system_image_settings 完整九列候选：

- 要求准确表名、完整列集、合法唯一源 ID 和显式行/值字节预算。保留源行 ID，仅当提供的目标 ID 占用清单没有冲突时继续；不重编号、不清表或覆盖目标。
- 每个来源 ID 恰好对应一份目标声明，声明必须准确绑定原 instance_type/runtime_type/runtime_variant；缺失、额外、重复或错绑拒绝。输出 image 与 display_name 只来自该目标声明，源名称/镜像不复制。输出 is_enabled 固定为 0，来源 0/1 不赋予目标资格。时间和原键保持历史值，SQL NULL 时间及空 variant 保留。
- runtime_type 必须是迁移中的 desktop/shell/gateway 精确值，不调用服务把 shell 推断成 gateway 或补默认 variant。原 instance_type/runtime_variant 按实际迁移字符上限检查，不替 B 决定支持类型或别名。目标名称要求非空、UTF-8、255 字符以内且无控制字符；目标镜像要求非空、500 字符以内且无空白、控制字符或 URL scheme。这里只是结构检查，不是完整 OCI reference parser、非敏感性或镜像可用性证明。
- 同一个原始三元组不得有多个候选；同时要求每行提供独立的 B logical identity 声明，重复 identity 或与目标 occupied logical identity 相交时拒绝。声明暂按 64 位小写 SHA-256 文本校验，绝不由 D 用小写/去空格代替实际数据库 collation 或业务别名。
- 源与输出分别检查容量；较长目标镜像、名称或返回值不能绕过预算。任一失败或取消返回零候选，固定错误不包含原镜像、名称或 driver 错误；输出列、map、指针与输入独立。空表保持空，不生成默认预设、镜像或开关。

## B 必须认证和复审的事实

当前表只有普通 instance_type 索引，没有三列唯一保证；数据库 utf8mb4_unicode_ci 与服务 normalizeSystemImageRuntimeType/Variant 的别名或推断还会影响实际选择。私有候选只比较原始键和调用方声明的 identity，不能证明两个不同原始键在数据库/服务下真正不同。B 必须定义并复审 identity 的版本、域隔离摘要输入、准确目标 collation、runtime alias/variant 规则和同事务绑定；认证每份声明确实对应原三元组和目标身份。同一等价类必须使用同一 identity，不能靠任意不同 hash 绕过冲突。新私有字段不是已冻结共享合同。

B 还须认证准确来源行集/目标 schema、目标镜像精确映射与可用性、名称非敏感投影、当前占用和共同事务中的保留/权限/隔离，以及默认镜像/环境配置/旧缓存/读取失败/nil provider/重启的持久启动门禁。空 occupancy 不证明目标为空；合法 hash 不证明逻辑身份；disabled 行也不证明运行路径被封锁。后续启用另授权。没有这些事实，不能把离线候选作为恢复写入资格。

本实现不连接 registry、不拉镜像、不执行 SQL、业务服务或环境回退。新增测试覆盖完整九列、逐行投影/源值不泄露、原键/声明等价类重复、目标 ID/逻辑键占用、错绑/缺失/坏投影、NULL/空表、不补默认、容量扩张及取消。完整 resources 包实际结果、来源和准确清理另由同轮回执确认。

累计四表有完整列离线候选；新增镜像实现待 B 同版本增量复审，另外五表、真实 B/C proof/事务 writer、独立读回/35 控制表/启动门禁、九表实际 MySQL、freeze/完整 GC 和原六项仍未完成。未安装依赖、执行远端或改写正式 registry/批准，未向其他聊天发送消息。
