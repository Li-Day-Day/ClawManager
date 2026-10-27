# D：producer 事务内锁定读取与精确 CAS

日期：2026-09-30。承接 [持久化校验与八表候选](system-backup-d-producer-storage-20260930.md)，继续推进 producer 生产实现。状态为事务存储层已实现、待生产 Policy 与生命周期服务接线；不是运行准入或全部 D 工作完成。

## 代码与保证范围

[record_sql.go](../backend/internal/systembackupproducer/record_sql.go) 为已有 `Transaction` 增加三个方法：

- `LockRecord`：scope 固定为事务构造时的 scope，主键形状由八种 Go 记录类型选定；拒绝多余键、无效键和调用方表名。使用完整主键 `SELECT … FOR UPDATE`，检查返回列名和行数，消费并关闭结果集，验证全部记录/投影/摘要以及请求键，之后才修改输出。不存在的记录也返回事务内私有句柄，但保持输出不变。
- `InsertRecord`：只接受本事务取得的不存在记录句柄，所有字段一次写入；没有 INSERT IGNORE、upsert 或隐式重放。每次插入必须恰好影响一行。
- `ReplaceRecord`：只接受本事务已存在记录的句柄，将全部旧列作为 null-safe 比较条件，在一条 UPDATE 中同步全部投影、canonical bytes 与 digest；必须恰好影响一行。Domain/Grant/Run/Target 要求 row_version 严格加一且不溢出；历史 binding、两类 receipt 和 reference 没有改写接口，reference 的独立管理/hold 更新后续另行实现。

存储层另行固定结构约束：Grant 主体、宿主和原准入不可改变；Run 原输入、写截止及已经绑定的观察时间不可改变，状态不得倒退；Target 接管必须推进一代、换 run 且保持结果版本，结果提交只能推进结果版本；Domain epoch 不能回退/跳号，同 epoch 的关闭/撤销不能重新开启。这些检查不代替当前身份、权限、租约、evaluator、跨记录关系或业务状态机决策。

`LockedRecord` 没有导出字段或构造函数，也不能 JSON 导入。其归属、当前存在状态、旧记录及 CAS 基准只由事务维护。调用方修改读取出来的 Go 记录不会改写旧 CAS 基准。它不是 producer execution handle，不授予外部调用权限。事务结束或进入最终复查后，保留的读取/写入入口拒绝使用。

SQL 错误、读取/关闭错误、记录不一致、版本冲突和 CAS 行数异常会写入事务失败状态；即使 callback 忽略错误也不能提交。完整主键/空范围锁、真实 MySQL NULL/二进制比较及索引执行计划仍须实测。此层不自动推导全局 L0–L10 顺序，完整 lock plan 和最终权威复查仍由强制 Policy 负责。

## 验证

最终脚本退出码 0：Windows 20 个顶层测试、含子测试共 296 项通过，默认 Go vet 通过；Linux 测试二进制交叉编译通过，未执行 Linux 二进制。确认本轮缓存和编译产物已清理。migration catalog 保持 94 个文件，hash 仍为 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。

[record_sql_test.go](../backend/internal/systembackupproducer/record_sql_test.go) 通过标准库 driver 检查真实传给 database/sql 的查询和参数，覆盖八表已存在/不存在、四类可变记录、只读收据/历史、错误被忽略时的回滚、跨事务/零值/已关闭句柄、读取结果篡改、CAS 零行/多行/行数获取失败、整数参数不截断及结构不变量。

沿用 [本地验证脚本](../scripts/system-backup-d-producer-validation.ps1)，不安装依赖、不下载工具链，完成后删除本轮缓存与二进制。最终结果和源码指纹见 [机器记录](evidence/system-backup-d-producer-sql-20260930.json)。本轮不执行 DDL，不连接远端，不将 mock driver 检查登记成 V01–V10 的真实 MySQL/provider 验收。

## 当前接线输入与未完成项

当前工作树中 A 已新增 `PrepareSystemCapability` 和 `PendingProducerBinding` / `MatchProducerBinding`，可准备小正文并桥接原 Manifest 摘要。本轮只读取这些接线输入，没有修改 A 文件；它们仍要求受信授权和持锁读取，不能用调用方的普通数据代替。

下一步用本事务存储层实现生命周期决策与生产 Policy，包括 deployment/principal 认证、安装/config 空范围、domain 与 grant/run、目标/projection/ref、固定容量报告和审计锁序；再实现 Acquire/Renew/Revoke/Takeover、BindObservation、调用快照、发布和结果提交。A 的 prepare/STS/发布/恢复适配仍需接入，C 的真实独立通道和可选 B Job 身份仍需评审。八表 SQL 保持候选，未加入正式 migration/catalog/inventory；旧报告保留原历史指纹。
