# D：系统 capability producer 授权设计提案

状态：待 A/C 交叉评审；涉及 Job 时还需 B。本文响应 `system-backup-a-capability-producer-admission-request-20260929.md`，不构成批准，不新增可执行迁移、公共枚举或生产 grant。实施前必须同步主计划、机器合同、schema inventory 和评审指纹。

## 已有接口与不能复用的边界

- `systembackupevidence.ContentAuthority.AuthorizeContent` 已提供正文读取前后复查；返回的 `ProducerIdentityHash` 必须随授权代次变化，不能只哈希证书。现有 `CapabilityContentPolicy` 可承载受审的 role/provider/version/scope/run/期限绑定，但正文自身不能提供权威。
- `SQLTaskAuthority` 的事务读取要求 active config enabled，并绑定 task/attempt/Job；不能通过加入 system 分支扩张其权限。
- `OfflineBootstrapGrant` 只授权指定管理员创建 disabled config v1；不能借用它签发系统 producer 权限。`BootstrapAdmission` 在调用者事务内复核，网络工作须提前完成。
- provider capability 的 claim 只覆盖 artifact/catalog/evidence，dependency health 没有等价租约。采用独立持久化 producer 授权域，六类角色共用授权机制，继续保留 A 对 KMS/Secret/signing 的独立评估与用途隔离。

## 拟议权威状态

持久化授权须绑定数据库 UUID/库名、installation、实际认证的工作身份、授权用途、run、唯一授权代次、claim owner/version/期限、撤销状态及不可变输入摘要。输入摘要覆盖精确 provider ref/version、scope、正文 policy、evidence ID、owner=system/installation、store/write/KEK 版本、保留策略和容量策略。表名、字段 wire shape 和迁移编号待合同修订确定，不先建私有表。

初始授权只能由独立部署准入创建；probe 的结果、健康行、提交的正文以及 caller 自报身份均不能签发授权。每次认领、续租、撤销与接管都用数据库 UTC 时间及 CAS；CAS 必须同时匹配安装、run、owner、授权代次、版本和未过期期限。已过期租约不可续活。接管产生新代次，旧进程即使还运行也不能登记结果；租约到期本身不证明旧外部请求已经停止。

有效期取数据库租约、部署授权、认证身份、依赖凭据及原始探针观察期限的最小值。续租不能延长原始观察的有效期；重复提交只能返回原有收据，不能刷新观测时间。

## 初始化前后两条路径

初始化前由单独的、可撤销的部署准入固定候选配置摘要及全部 ref/policy，不要求 active config。需要独立于 installation/config 行存在的授权记录；不能预先创建 installation 行破坏首次配置的空库条件。与 bootstrap 事务采用同一 installation 索引锁域，连同空集合的并发行为在真实 MySQL 验证。bootstrap 一旦创建配置，初始化前授权必须在同一协调锁域内失效；不得自动升级成 active-config 授权。

配置存在后重新签发绑定 config version/hash 和授权 epoch 的授权。配置切换、禁用、身份撤销或 ref/policy 变化均使旧代次失效。初始化后 disabled v1 的准入检查需求须由 A/C 明确：不能把“已有配置”误等同于“已启用配置”，也不能为执行检查擅自启用配置。

初始化前外置 evidence 的 store/write/KEK 来源必须是独立受审部署输入。若候选 evidence store 正是被验证对象，不能由它自己的成功结果建立对它的信任；优先使用独立可信的证据通道或受审 inline 路径。选用哪条路径需 A/C 明确，不能默认将任意外部证明视作受信输入。

## 事务接口与提交顺序

建议 D 提供以下内部能力，名称是设计标签而非已冻结 Go API：

| 能力 | 输入与结果 | 原子约束 |
| --- | --- | --- |
| Acquire/Renew/Revoke | 部署准入及认证身份；返回不透明授权句柄 | 数据库当前读、CAS、期限、代次；客户端字段不直接构造句柄 |
| Authorize | 句柄、具体用途、精确资源绑定 | 新事务读取权威状态，输出受审 policy 与最晚截止时间，适配 A 的 ContentAuthority/Wrap/STS |
| LockAdmission | 调用者的 SQL 事务、句柄及待登记 evidence | 不另开事务、不提交，锁内重新检查授权、容量、保留及 ref/policy |
| CommitResult | 句柄、已登记 evidence 引用、探针结果及原观察时间 | evidence 完整性、授权与目标结果行 CAS 同事务验证；成功不能只靠正文校验 |

沿用现有 installation 按 ID 排序的锁前缀，然后依次锁配置或初始化前授权域、producer grant/run、可选 Job、evidence 和 capability/health 结果。容量预留与审计的锁位必须与现有 registry/registration 路径统一后冻结；目前不能宣称全局锁序已验收。所有远程认证、KMS、STS、对象操作在事务外执行，回到事务后重新检查代次和截止时间。

遵守现有 `Prepare → Register/PersistPending → Publish` 顺序：先在有效 producer 授权下校验正文、Wrap 并生成受控临时密文及准确 manifest；登记事务重新校验授权并原子写入 pending/容量预留，随后才允许远程条件写，核验原始密文 manifest/精确对象引用并登记 ready，最后提交 capability/health 结果。不能在准确 manifest 尚未形成时用占位内容登记 pending。Prepare 后登记失败的临时密文由本 run 清理；登记成功后保留恢复所需的原始密文。每阶段发生撤销、接管或到期均拒绝成功提交。外部请求响应不明时保留 write_unknown 及准确引用；结果事务失败可留下 ready evidence，但不能产生 healthy。恢复仅核对原登记密文和原 run，不能重新加密、换 key 或用新 run 顶替。独立恢复身份权限须由 A 适配，不能复活旧 producer 租约。

## 评审与验收交付

1. D/A/C 确认初始化前授权来源、disabled v1 检查路径、完整锁序、结果提交及撤销语义；B 确认采用 Job 时 UID/generation、取消与投射凭据失效接口。
2. D 更新主计划及同版本机器合同和 schema 决议，新增持久化对象后重新生成 catalog/schema 指纹；不能复用现有 93 文件/99 表批准。当前仅补 080 的历史升级审查范围不得顺手扩大。
3. A 依据受审接口实现正文、Wrap、STS 和恢复适配器；C 提供精确 provider/ref/scope 与真实负测，D 实现数据库事务、容量和审计接点。
4. 验证六角色跨安装/用途/ref/run 凭据互换拒绝、初始化与配置切换竞争、并发认领/撤销/过期/接管，以及正文读取、Wrap、STS、条件写、登记和结果提交各阶段的撤权。
5. 真实 MySQL 验证锁与 CAS、原观察有效期不延长、重复提交、审计失败回滚及 unknown 恢复；现场验证真实身份和清理。单元测试或本文评审不能替代生产准入验收。

截至本次提案，未创建授权、未扩展任务权限、未变更迁移 catalog；A/C/B 签收均未取得。
