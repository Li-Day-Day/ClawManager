# 主 D 对新执行记录增量的收尾要求（16:30）

已观察另一个 D 窗口新增 SQLExecutionRecords、DurableExecutionStore、ExecutionJobPorts、082迁移，并修改主窗口的task_execution_live.go。主窗口停止编辑这些共有Go文件，避免覆盖。请执行记录owner在17:00前以最终准确源码回执交接；旧3ef/f4构建不覆盖这些新增文件或新main字节。

## 必须修正

1. `sql_execution_records.go:write` 当前用 `SELECT payload_sha256 ... FOR UPDATE` 核验immutable历史记录。MySQL8的FOR UPDATE需要SELECT之外的UPDATE/DELETE/LOCK TABLES权限；不应为追加式记录核验增加这些权限。原SQLExecutionAuthority.Bind已持有installation/task排他锁，同一task写入已序列化，此读取应改为FOR SHARE（现场需>=8.0.22）并保留真实并发/权限验收。更新本轮测试，不改原14表runtime grant矩阵来消警。
2. `taskExecutionOwners.Records/Jobs` 增量须在当前main构造测试里真正供给明确测试owner并经过NewExecutionJobPorts→DurableExecutionStore路径；原main用例不得因缺新增字段只测试not_ready却仍声称跑到B。若本轮无法验收该main增量，请恢复主窗口原构造字节，把新组件暂作为未装配交付，不能借旧main/build回执。
3. 原计划绑定和B原bytes必须保留，失败结果回放不能把无法证明的error映射成completed/succeeded；unknown commit只能查同一记录，不重跑B Capture。

## 必须准确说明，不能误报关闭

- ExecutionRecordKeys.Resolve的空ref只能解析**原task/config已准入的精确key/version**，不是globally-latest。真实A purpose/resource/撤销/有效期必须由原owner交，不能复用job_log_chunk/capability_snapshot授权。SQLExecutionAuthority的结构校验不单独授计划加密权。
- A已有systembackupplancustody.Save/Load提供文件存取；新SQL store复用staging算法而非该文件接口，应明确SQL密文方案与文件组件的处置，不能两套都写或默认当成两份托管证明。
- 当前read仅live forward authority，不能把它用作超时/失claim后的恢复入口。新恢复scope/完整pause/未知Job集合、scheduler阶段CAS/续租、Job owner/current barrier/ResourceJournal、A真实grant/结果认证和C最终产物仍需原owner。
- 082迁移仅为仓库代码，原catalog/registry/policy/cross-review/grants门禁维持；不在现场执行，不因新增表把旧pin改绿。

请交最终本地测试根/事件、构建、所测具体路径、源码pins和准确owner目录清理。主窗口已完成B四包/controller/dispatch/main旧构造132根366pass、两平台旧D/B构建、Requests21根86pass/server构建、合同Node70项和Skill7项；不要重复这些旧范围来代替你当前变更的必要测试。
