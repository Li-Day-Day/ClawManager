# A：bootstrap 全局资源锁与下一阶段适配

2026-10-26。下一阶段合同；在 `88b2cfd9f32b454183e60d9f0f1259ec` 联合原生运行冻结后提出，不属于该运行的覆盖。A1 已在 live 工作树实现全局 L1、唯一 attempt context 及对应 stage 测试，gofmt 通过、原生测试待运行；未改正在测试的冻结副本。原可信部署/用途映射仍是强制授权来源，本文不产生授权。

## 完整全局配置范围

nonce 原检查使用所有安装的配置及全局保留账本。只锁目标 installation 的配置范围不能保证它的全局事实。A1 在全 installation L0 之后、D producer domain L1 之前锁完整配置索引，包括空集合和插入 gap：

```sql
SELECT id,origin_installation_id,version,config_sha256,enabled,
       nonce_hmac_ref_version,nonce_hmac_identity_hash
FROM system_backup_configs FORCE INDEX(uk_sb_config_version)
ORDER BY origin_installation_id,version FOR UPDATE
```

既有 migration 066 声明 `uk_sb_config_version(origin_installation_id,version)`。逐行流式读取，不增加原 `UNION` 去重结果 20,000 上限以外的原始行数限制。L1 只保存目标安装的配置数量、版本、摘要、enabled，供 L3 判断精确历史结果或新初始化；其他安装的 nonce 资源错误不能在历史分支之前变成新消费的资源准入。

A2 在 L5 读取上述已经锁定的配置范围，并用同一次共享 SQL 样本作为保留账本 cutoff：

```sql
SELECT id,nonce_hmac_key_version,retain_until
FROM system_backup_strong_auth_nonces
FORCE INDEX(idx_sb_auth_nonce_retention)
WHERE retain_until>?
ORDER BY retain_until,id FOR UPDATE
```

migration 075 声明该索引。不能用 `UNION/GROUP BY/MAX` 语句本身声称取得底层行与 gap 锁。后置检查沿用原 cutoff 与已锁范围，不换更晚谓词缩小观察集合；不按当前安装或活动 key 缩减全局历史材料要求。允许的配置后状态只能是原全局 tuples，加本次原 installation 的 disabled-v1 tuple；bootstrap 不修改 nonce 账本。缺 key、同版本冲突身份、原保护期限不足、材料错误均拒绝新消费。

D1 独立 tagged 实际探针另覆盖：其他 origin 的 nonce 元数据 UPDATE、新 origin/v1 插入、既有 origin/v2 gap 插入。直接写者不配合 installation 锁；须从 `performance_schema.data_lock_waits` 核对准确 blocking/requesting 会话和配置索引，再验证原事务回滚后写者完成。合成 SQL trace 不证明这些 InnoDB 性质。

## 单次 attempt 的 context

A1 在全部原授权、资源及容量 Prepare **之前**，从原 caller context 派生一次 `context.WithTimeout`，预算使用准确配置的 `operation_deadline_seconds`；较早 caller deadline 自动保留。所有 Prepare、Begin、Consume、callback、Commit 前检查使用这一份 context，结束时取消。不在消费后重绑或续期，不调整原 grant、SQL 观察、TLS、材料保护或五秒容量报告期限。该 host context 预算也不代替 D 最终共享 SQL 时钟和原授权截止。

## 保留原文件变化拒绝

[原 C1 transactions](../contracts/system-backup/v12/producer-authority-transactions.json) 的 L10 禁止新的业务锁与外部 I/O，FinalGuard 规定全部 callback/audit/write 之后，Guard 后不得 network/file/audit/new lock。[A2 原文核对](evidence/a2-bootstrap-material-IO-contract-reviewed-20261026.json)没有找到整个事务一概禁止本地文件读取的同等条款。旧 nonce/CA 的 Recheck 实际重新读取固定本地材料。

A1/D2 已核对具体阶段：D2 将 bootstrap session 的 Recheck callback 放在 **Work 末尾**，全部写入、审计和原后状态 snapshot 完成后。具体实现先关闭公开 write 能力，再提供受限私有 read view 完成 source callback，避免回调期间保留的 write 指针继续修改。这里保留有界受控本地文件复查：只读原 exact 路径及摘要，保留原 nonce 材料擦除、CA/descriptor/历史 key 变化或删除拒绝。前后使用共同 `SampleTime`、原期限及唯一 attempt context；不做 TLS、网络/provider 调用，不刷新观察，不取得新的业务范围。source callback 与 read view 结束后，固定 Policy.Recheck 仅检查原 SQL/已锁后状态，最终共享时钟及 context 检查后由 A 唯一提交；固定 Guard 内/后仍不得文件 I/O 或 callback。generic Policy.Recheck 的原 no-file 合同不放宽。此前 A1 interface comment 中整个锁段 no-file 的表述过强，下一阶段须与准确合同一起调整，不能借此删掉旧安全检查或发明替代 grant。

同样保留旧 `preparedBootstrapAdmission.authorize` 的当前 grant/RBAC 来源检查。现有快照 wrapper 仅在 Prepare 调用一次原读取，不能证明准备后删除 grant 或更改 RBAC 的拒绝。A2 用已有 `BootstrapDeploymentConfig` 的原 GrantFile/SHA 与 `RegistrationFiles` 具体受控路径构造独立文件 adapter：L2 重新验证当前原 grant/RBAC，新消费验证全部九 registry 字节，Work 末重新验证适用原授权与资源。不能把任意 `ReadGrant`/`RegistryBytes` 回调默认当成锁内安全的本地文件实现，也不增加授权格式或 approved 布尔。

原 legacy validator 保留。A2 新增独立 candidate API/测试；物理读取失败只可按原历史重试合同留到 L3 后的新消费分支拒绝，当前 grant/RBAC/可信原映射失败不能延期放行。nonce/CA 的原观察截止须进入 D 最终 deadline，避免最后一个回调之后的 SQL 等待越期。

## 本地验收边界

`88b2` 已稳定复制，GC 权限修复已使其 current-source 比较必然不同，因此只保留短 capture 互斥，不把它扩大为整个七包运行期间禁止 live 编辑。各 owner 可以实现下一阶段自有 live 文件，不改冻结副本或重启原运行。A1 两文件的准确字节见机器进度；其新增两根测试尚未运行。当前 `88b2` 收齐原准确终态和清理后，再对下一阶段源码统一冻结验证，避免新增并行编译。

当前普通 source gate 仍为 not_ready；旧 `2099`、本轮 `88b2` 或原 nonce/CA r2 都不覆盖新增适配。27 个资源槽、真实部署权威映射、完整 GC 公链和实际远测分别保留，不能用局部通过关闭它们。
