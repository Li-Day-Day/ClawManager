# A：真实任务计划加密存储交付

本窗口独立实现 `backend/internal/systembackupplancustody`，不修改另一 A 窗口的 relay、现场材料、signer/KEK 文件，也不修改 D 的 WorkStore/main。复用 B 已导入的 `staging.SealFile/OpenFile/Seal/Open`，实际写入和读取加密文件；没有新建一套密码算法、发布格式或授权机制。

## D 的接入位置

- `ExecutionWorkStore.Record` 收到成功的 prepare outcome 后，先用原授权及事务协议持久化 plan intent（安装/task/attempt、目标文件名、准确 DEK 引用），再在事务外调用 `systembackupplancustody.Save(ctx, root, name, taskDEK, work.Input, outcome.Plan, "system-backup-b-plan.v1")`。将返回 Record 与原 intent/任务版本以原 CAS 保存，才允许调度 capture。
- `ExecutionWorkStore.Next` 在加载已持久计划时，从同一任务账本读取 Record 和准确 key reference，经原 key owner 获得 DEK，再调用 `systembackupplancustody.Load(ctx, root, taskDEK, currentInput, record, "system-backup-b-plan.v1")`。成功结果可直接填入现有 `ExecutionWork.Plan`。当前 Input 必须来自 D 的已授权公共事实。
- root 是调用者独占、受控持久卷的 `*os.Root`；名字是原 journal 中的单文件名。该包不自行创建根目录、找凭据、签发权限、提交 SQL 或派发 Job。DEK 仅借用，调用者负责擦除自己的 key 和返回 plan 字节。不得明文保存 DEK 或计划。
- Save 失败可能已经留下最终密文（如目录同步或后续取消失败）；必须按原 intent 查回，不盲目重复、覆盖或删除。返回成功表明本地密文已封存，不代表 task CAS 已提交。密文回收仍由原资源 journal 的归属/引用检查负责。

## 实际行为

Save 在写入前使用 `UnwrapTaskPlan` 检查完整 task/config/profile/spec/attempt 和内外两层 hash，冻结原计划字节，以任务 DEK 加密，原子 create-if-absent，并沿已有 Linux staging 实现同步文件和目录。

Load 限制文件与明文大小，固定同一文件句柄，核对密文摘要、所有 AEAD 帧及末帧，再检查公共 task-plan 绑定。全部通过后才返回明文；失败不返回部分计划。内存隔离缓冲与借用 key 副本在函数退出时擦除。

claim owner/row-version 续租或接管不改变原计划字节；当前执行/恢复授权仍由原 guard 决定。不会因任务 deadline 已过而阻止有独立授权的恢复读取，也不会据此许可继续 capture。返回统一错误，不泄露 key、文件路径或 plan 内容。

## 本轮验证

验证入口 `scripts/system-backup-a-plan-custody-validation.ps1`：仅使用现有工具链，模块下载关闭，冻结本包与原 staging/dispatch 源码，执行本包实际临时文件正反用例及 Linux 编译；最后删除本轮独占目录内的冻结源码、缓存和二进制。准确结果以 `docs/evidence/a-plan-custody-*.json` 及对应原始日志为准。编译不算 Linux 现场运行。

此实现关闭计划密文本地存取组件的代码缺口；真实 WorkStore 的 intent/CAS 接入、原 task DEK 授权与托管、Job ledger、bootstrap 材料和 provider 发布链仍分别由原 owner 接通。本包不会把缺少这些来源的部署变成 ready。

验证已完成：`evidence/a-plan-custody-652d1a42caa745e0b68167d13fe78ec0.json` 记录原生测试 exit=0、Linux 编译 exit=0、cleanup=true。原生日志含 3 组测试、21 个子用例，0 fail/skip；使用真实临时密文文件测试保存/读回、原对象不覆盖、接管、错误密钥、任务/config/profile/parts 改变、末帧篡改、截断、尾随字节、路径/容量及取消拒绝。没有执行 Linux 二进制、SQL 或现场备份，也没有安装依赖。未实施之前考虑的 nonce/CA 候选校验补强。
