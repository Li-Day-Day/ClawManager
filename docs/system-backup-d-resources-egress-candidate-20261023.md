# D 出站网络例外恢复候选

2026-10-23，继续原九表 v2。用户明确 B/C 仍未交付。A 已新增 SQL reader 候选/冻结合成测试接收与双审计候选静态安全意见；本轮分别复核原程序，原请求和回执保持不变，不把它们用于新增 egress 文件的批准。

`restore_egress.go` 新增私有离线 `normalizeRestoreEgress`，输出 egress_private_exceptions 的完整十列候选：

- 必须声明准确表名、完整列集及容量，空表也不省略列或策略输入。拒绝缺/额外列、重复/非法 ID；目标提供的 occupied IDs 不得重复或非法，与来源 ID 冲突则整批拒绝。新候选保留源行 ID，不自行分配新 ID，不清表或覆盖目标；目标有冲突时需 B 另行版本化分配方案，不借用 user/instance ID 当作本表 ID。
- scope_type 精确为 user/instance，必需 scope_id 使用相应 typed 映射；非 NULL created_by 使用 user 映射。同数值不同域不能混用，缺失引用/映射拒绝；SQL NULL actor 保持 NULL。
- 输入开关只接受 SQL 文本 0/1；输出 enabled 固定为 0。非 NULL description（包括空串）整体遮蔽，SQL NULL 保留。created_at/updated_at 只验证 SQL 时间表示后保留，不用本机时间补值，nullable 语义仍需实际目标 schema 证明。
- CIDR 必须为无主机位的完整私有前缀，拒绝 link-local/mapped IPv4/非私有/过宽网段；完整前缀与准确端口须被目标允许项包含，与任何禁止网段重叠即拒绝。输出用 netip 的规范前缀文本，不改变网络范围。端口必须为规范整数且在 1..65535。任何坏 allowance/exclusion 都拒绝，包括空表时；允许范围与禁止子网相交本身可以存在，候选必须避开禁止部分。
- 源与输出分别检查行/字段值字节预算，遮蔽和映射的扩容不能逃逸输出预算。任何失败或取消返回零候选；错误固定，不包含源正文；输出列、map、指针与输入独立。

本候选只执行离线结构及值规则。Policy 指针、occupied 数组和映射都不认证其完整性或真实性；空 occupied 不证明目标为空，空 denied 不证明目标没有控制/metadata/provider 地址。B 必须认证准确来源/目标/完整策略/真实引用、共同写事务中的 ID 占用与权限，以及恢复后的持久启动门禁。disabled 行不能替代阻止旧缓存、环境默认和失败回退路径的启动门禁；后续启用需另行授权。本函数不访问 SQL、网络、业务 service 或生产入口。

## 验证与后续

新增测试覆盖完整候选/不同 ID 命名空间、占用冲突、完整前缀/子网禁止/准确端口、坏策略/坏源、SQL NULL、空表、IPv6 规范输出、遮蔽扩容、返回值隔离和取消。完整 resources 包采用既有隔离入口，default vet 保留；实际结果和准确清理另由本轮回执验证，不由本文代替测试终态。

本轮累计三表有完整列离线候选，仍不是完整九表 normalization。新 egress 候选需 A/B 同版本增量评审；B/C 生产 proof、事务 writer、启动门禁、其余六表候选、真实读写/九表 MySQL、freeze/完整 GC 和原六项均继续待完成。没有安装依赖、执行远端或改正式 registry/批准，也没有向其他聊天发送请求。
