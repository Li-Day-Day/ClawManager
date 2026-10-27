# A：candidate 历史重试的材料边界补充

2026-10-26，A1 对 D-BOOT-REPLAY-01 的具体决定。沿用原完整请求、原幂等键和独立 bootstrap 授权，不增加读取权限或新的 grant；本条仍需以实际实现和原生回归关闭。

原 `preparedBootstrapAdmission.authorize` 每次要求当前原 grant 和 `rbac_bindings`，完整九 registry 与资源检查属于 `ValidateAndReserve` 的新写入阶段。新 candidate 路径不能把“所有九份资源文件当前可读”额外变成不可达历史成功分支的共同前置条件。

| 材料/事实 | 历史成功重试 | 首次消费 |
| --- | --- | --- |
| 完整原 grant、当前有效窗口、当前 RBAC 与 local admin | 必须成立，缺失/撤销即拒绝。 | 同样必须成立。 |
| 原独立可信选择及 provision→config/purpose/receipt 关联 | 必须还能独立认证；DTO 或相同摘要不补来源。 | 同样必须成立，并检查原当前授权/领域事实。 |
| 与上述读取授权无关的非 RBAC provider/resource registry、物理容量报告 | 可以在锁前捕获缺失/坏 hash 错误，但不在到达 L3 前仅因此拒绝原成功读取。 | 原快照错误必须在新消费的资源/容量阶段拒绝，无业务写入或新收费。 |
| 原观察/执行窗口、旧 provider 可用性 | 不重探测、不刷新观察，不因这些过期/不可用重新消费；仍按原成功和当前读授权返回。 | 使用原观察和适用当前授权，不能由保留或旧成功替代有效性。 |

这不是无条件忽略其他 registry。如果原独立授权来源确实需要其中某份材料来认证当前读取或原选择，底层真实 authority 仍必须拒绝。外层只是不把资源完整性统一解释成当前读取权限；不能传缺省/伪造的 bytes 给原 authority，也不能用原 success 自证授权。

实现要求：锁前仍尝试读取并完整校验九份 registry，立即拥有成功字节的副本；原 grant 和 RBAC 失败立即拒绝；其余错误保存在私有 prepared 状态。D 在 L3 核对相同完整请求后分支，只有新消费的 LockReferences/Reserve 等阶段强制完整资源状态。最后 Recheck 对新消费再次确认该状态；历史分支仍复查原 grant/RBAC、独立原映射和精确 config/operation。锁内不补读文件、不调用 provider，也不把错误变成 allow。

验收须覆盖：原成功存在、原可信关联和当前 grant/RBAC 有效、仅非授权资源文件消失时的只读成功；同一缺失下无原 success 的新消费拒绝且零写/零收费；原 grant、RBAC 或原映射不可认证时两分支均拒绝；新成功的引用/epoch 不因重试再次变化。容量缺报告按同一原则使用其 `PrepareAttempt`，不把零时间地址当有效样本。
