# A nonce HMAC bootstrap 资源候选

2026-10-23。接续 A 在 B/C 介入前的安全资源实现。代码位于 `backend/internal/systembackupnoncebootstrap`；目前是未装配候选，真实部署、非实现 owner 交叉评审及实际 MySQL 未验收，27 个入口缺项保持。

## 受控材料和用途

`New(Binding)` 只接收部署组合代码提供的原安装、数据库、配置摘要、有效期与逐版本原映射；不从 HTTP、环境任意路径或 approval JSON 构造授权。映射必须由部署负责人提供并评审，构造器成功不证明其来源可信。

候选支持已有 SecretRef 合同的 `external_secret / strong_auth_nonce_hmac / exact_version_only` 本地挂载。每个版本固定 identity、provider、scope、描述文件完整摘要、原材料文件完整摘要和保留期限。材料摘要只用于固定字节，不作为资源 identity，也不输出到日志。32 字节原材料读入后擦除；准备结果不缓存密钥。映射、validator 和 check 拒绝 JSON 序列化，默认格式化不显示路径或摘要。

Kubernetes Secret 的 namespace/UID/resourceVersion、在线外部 Secret ACL 和跨资源用途隔离不能从本地文件推断，仍由对应实际 adapter、原部署映射和 CrossResources 负责。该候选不伪造这些事实。

## Prepare 与事务内 Recheck

Prepare 在 SQL 锁之前核对原 grant 的安装/数据库/配置绑定、唯一活动 nonce 引用和全部声明的当前/历史文件。观察期限取原映射期限与准备开始后 30 秒的较早者，准备中时钟倒退或越期拒绝。

Recheck 使用调用方的同一事务，先核对 `@@server_uuid,DATABASE()`，再读取全部 config 的版本/identity，以及未过保留期的全局 nonce 台账各版本最大 `retain_until`。活动配置尚未入库的首次 bootstrap 可读到空集合，但 Prepare 仍必须具有精确活动原映射。任一历史版本缺失、同版本身份冲突或保留期不足都会拒绝；不根据仍有文件的子集缩小历史集合。最后重新核对全部文件与时间，不联网、不写 SQL、不提交或回滚调用方事务。

`Material(identity, version)` 只读取固定映射，返回调用方拥有的副本；可供已有 `NonceMaterial` 接口使用，调用方负责擦除。它不签发 proof、不消费 nonce，也不替代现有每次授权、同事务审计与容量检查。

## 验证与剩余交付

运行 `scripts/system-backup-a-nonce-bootstrap-validation.ps1`：冻结既有 bootstrap 依赖、nonce/CA 两包与验证脚本，关闭依赖下载，默认 vet 下运行两包完整测试并分别编译 Linux 测试程序，前后核对来源，finally 清理准确自有源码/缓存/临时文件/二进制。结果以脚本本轮实际退出和 `NONCE_RECEIPT` 为准，本文不预填通过结论。

CA 原回执的 376 份输入字节仍匹配、旧 owner 目录已缺席，但完整集合复查发现新增依赖 `systembackupread/drill_detail.go`。因此原 CA 回执保留历史范围，最终轮将 CA 与 nonce 合并验证并复用本轮自有缓存，仍分别构建两份 Linux 测试程序；不以旧文件逐项相同推导当前集合完全相同。

负例覆盖当前与历史材料变更/缺失、错误描述、短长密钥、错误安装/数据库/服务器、未知历史版本、身份冲突、保留期限不足、到期/时钟回退/慢读取、取消及输出保护。SQL 使用拒绝其他语句的合成 driver；不将它登记为真实 SQL 或生产批准。

后续仍须原受控材料、安装映射/权限与挂载审查、非实现 owner 交叉评审、同轮实际 SQL/历史保留验收及显式装配。CA 的非实现 owner 评审、A/D GC 共同协议和 owner 十一项实际 SQL 同样没有因本候选完成。
