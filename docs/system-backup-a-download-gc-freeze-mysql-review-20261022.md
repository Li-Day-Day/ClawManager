# A：GC freeze 前置实验 34 项实际回执独立复核

已限定接收 D 的新实际回执：MySQL 8.4.8 上 34 项全部通过，包含 25 类 DDL 的精确 backup-lock 等待凭据及 9 项权限/事务/会话控制。该专项无需重跑。它是合成夹具中的前置实验，生产 freeze adapter 仍未接线，也没有执行完整 GC。

[A 独立记录](evidence/a-download-gc-freeze-actual-accepted-20261022.json)直接核对[原完整日志](evidence/d-download-gc-freeze-remote-20261022-084739-1604f031.txt)和[原来源清单](evidence/d-download-gc-freeze-remote-20261022-084739-1604f031-source.json)，并与[D 接收记录](evidence/d-download-gc-freeze-actual-accepted-20261022.json)逐项比较。A 未重新登录服务器、执行 SQL、测试或构建，也未安装依赖。

## 固定来源和完整门禁

原日志为带 BOM 的 UTF-16LE，1,720,772 字节，SHA-256 为 `76071f8c77782f8eecbba2745061fc639ff0c563295dafc2bc6b57a2a8b70309`。复核严格解码，ANSI 仅用于解析时移除，原始字节没有改写。来源清单 1,519 项，逻辑 SHA-256 为 `b2557fd28e16cbb419be616164d33123cfc473dfdc0c317d098311c0f85f8b8d`；已重算摘要、核对闭集路径及大小/摘要形状、stable-copy 和禁止安装/生产批准标志。

六份已准备探针/派发文件与本轮来源清单和当前文件逐一相同。完整原正式迁移 96 份 SQL 也逐字节匹配；本轮 fresh replay 为 001..081、96 个准确文件名，目录 SHA 为 `0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`。这不证明历史数据库升级等价性。

| 本轮原日志中的本地门禁 | 已核对结果 |
| --- | --- |
| security 完整包 | 255 根/2,011 项，全部 run/pass 一一对应；根名称与已准备范围相同。 |
| evidence 完整包 | 365 根/3,008 项，全部 run/pass 一一对应；两包合计 620 根/5,019 项。 |
| tagged seed | 两个根、12 项通过。 |
| 脱离源码 seed | 相同 12 项逐名匹配；`checkout-fixtures=absent`。 |
| 终态门禁 | 默认 vet、冻结来源 postcheck、无依赖安装、最终退出 0。 |

这是操作者在本轮冻结来源上实际执行的门禁，A 本次只复核记录。未把全部 1,519 份输入或并发变化的当前整树宣称为完整测试通过，也没有据此修改 owner 十一项的接收器或新增 owner 来源基线。

日志保留首次源码捕获变化：`scripts/system-backup-a-field-inventory.test.ps1` 在复制期间变化，部分副本在任何构建/远端动作前丢弃，第二次捕获才得到正式来源。A 核对两次 attempt 标记、清单中的准确失败原因及顺序。它不是一次测试重试；原失败警告没有删除或改判。整份日志未出现测试 FAIL/SKIP、panic、门禁失败或 `CLEANUP_PENDING`。

## 34 项实测覆盖

25 类 DDL 包括表 create/alter/drop/rename、跨 schema 入向 FK，procedure/function 的 create/alter/drop，trigger 的 create/drop，event 的 create/alter/drop，view 的 create/alter/algorithm/drop，以及账户 create/alter/drop/grant/revoke。

A 不只核对 PASS 数量：每条 `FREEZE_WAIT` 都位于其对应子测试的运行区间内，holder/waiter 的 connection ID、thread ID 均为正且彼此不同，跨记录的 connection→thread 映射一致；两种 ticket 必须准确为 `SHARED/EXPLICIT/GRANTED` 和 `INTENTION_EXCLUSIVE/PENDING`。固定源码先在连接存活时取得 thread ID，后续直接按 `OWNER_THREAD_ID` 观察 ticket，不用等待时间或活跃线程行消失替代锁证据。明确解锁后仍要等 DDL 成功，并核对预期元数据/账户变化。

另 9 项为：

| 控制 | 本次通过的限定断言 |
| --- | --- |
| privilege_deny | 缺 BACKUP_ADMIN 的合成账号得到原生 1227。 |
| transaction_commit / transaction_rollback | 同一持有连接的事务结束后锁仍在；canary 的提交/回滚结果正确。 |
| unlock_no_commit | 解锁后再回滚，canary 仍为原值，未将解锁当作事务提交。 |
| legal_dml | 该夹具中持锁期间的指定 DML 可执行。 |
| multiple_holders | 两个不同物理连接可持有锁，释放一个后另一个仍持有。 |
| killed_holder | 杀死准确持有连接后，按原 thread ID 有界观察 ticket 消失，未提交 canary 回滚。 |
| pool_reuse | 明确解锁后，池归还能复用同一物理会话，且该会话无残留 backup ticket。 |
| temporary_shadow_and_fresh_session | 池归还后临时表、会话变量及 timeout 保留；明确物理丢弃后取得不同连接和干净状态。 |

最后两项不能批准生产代码直接归还池或把 `sql.Conn.Close()==nil` 当作会话已清洁/远端资源已释放的证明。显式解锁、强制终止及物理丢弃控制的成功，也不代替取消、失败和丢失 COMMIT 回包时的完整生产状态机。

## 二进制、环境和清理

- 探针原记录 SHA：`6fe2bdf93660958dbea2506844ea2859bfbda5575928995a0873befc06d35852`；输入 SHA：`d9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0`。本地编译标记、远端 phase 的实际文件 hash 检查和最终限定 PASS 保持绑定；A 未重建已删除二进制。
- namespace：`sbk-mig-261022013337-65ef`，原 UID：`081b70f6-ce4a-42e8-a672-49847e31324e`。RUN 与准确 CLEANED 身份相同，清理在根测试及限定 PASS 后报告。
- namespace、远端 scratch 和本地缓存清理均已报告；准确本地 owner `.tmp-d-index-cache-08a0e70a4b674d02818199ad97cbbf39` 由 A 另行确认缺席。远端清理未重新登录独立复查。
- 原日志四条 socket close 消息完整保留。接收依据完整用例/锁凭据/准确清理及最终 exit 0，没有把这些消息删除或改写。

RUN 的 `be41...` app image 是隔离探针夹具的底座，不是新生产备份运行时部署或 inspector 能力交付；本次不能关闭另一条现场权限/材料/容量/运行卷的前置缺口。

## 接收边界与下一步

本次不批准生产角色、额外权限或完整 DDL 元数据期望值，不启用 freeze adapter，不验证完整 collector 的 owner/capacity/nonce/audit 原子性，也不验证人员 MFA/provider 或恢复 E2E。

下一步按[原十二组协议要求](evidence/d-gc-backup-lock-protocol-requirements-20261021.json)补同连接锁获取、事务结束、有界释放/物理丢弃及未知结果分类；再完成角色漂移、metadata/expected digests、全局锁顺序和规模干扰实验，最后接入 Collect 并验完整 GC。不得将这 34 项整体挪作十二组协议、原 D 六项或生产批准。

本地只读复核命令：

```powershell
node .\docs\evidence\a-download-gc-freeze-actual-review-20261022.mjs --check
```

状态为 `accepted_34_synthetic_backup_lock_prerequisites_only`，原始日志/清单保留，所有生产批准标志保持 false。
