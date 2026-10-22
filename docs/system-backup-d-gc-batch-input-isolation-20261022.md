# D evidence GC 批次输入隔离（2026-10-22）

本轮处理 GCRuntime.GC 对调用者 ID 切片的别名引用。原运行时把同一切片交给 Service.GC，再用 ids[n] 关联失败上报；持久化 journal 路径也逐项读取同一底层切片。执行期间的外部回调若通过闭包修改调用者切片，可能替换后续候选、把错误关联到其他证据，或用非法 ID 抑制失败记录。原有逐项授权仍独立生效，本缺陷不等于可以越过 SQL/provider 权限。

候选在原有 nil/closed/context 和一百项容量检查之后，复制这一份有界 ID 清单，再进入批次 context、Service 或 journal 分支。字符串按值复制，两条路径使用相同冻结清单；不复制或改变授权、retention、claim、配置、事务或 provider 证明。非法输入和超量调用保持原返回行为，不因复制而授予工作权限。

新增测试经过实际 GCRuntime.GC、Service.GC/collect 和原 journal append；仅以明确拒绝工作的 Registry 回调观察选中对象，不执行 SQL 或 provider。普通上报与真实文件日志各覆盖原样输入、回调替换合法 ID、回调改成非法 ID，另验证第一个 Failure 回调不能重绑第二个错误。所有 mutation 在同一 goroutine 顺序发生，不宣称调用者并发写原切片是 race-safe。原权限、失败、取消和持久化行为另用现有 GC 运行时、journal 和 nil-adapter 回归核对，不声明本轮重新执行整个 evidence 包。

本轮只修改 D 的运行时入口并新增回归测试，不修改 A 的通用 Service、远测入口、角色批准、机器合同或 migration；不接入 backup lock。初始来源与候选在专属目录中冻结，Go proxy/sumdb 和自动工具链下载关闭，无依赖安装或远端操作。

旧实现对照准确命中五个预期失败场景（另计父测试失败），普通上报和 journal 的两个原样输入对照通过。候选新增七个场景及已有运行时、journal 和缺失适配器回归共 12 个根测试、70 条通过事件全部通过，无失败或跳过，保留 default vet，原生退出 0。覆盖既有精确版本删除、事务结果、存储故障、工作关闭和准入拒绝，不声称重跑整个 evidence 包、真实 MySQL 或生产 provider。

冻结来源 1,576 份，初始 SHA256 为 4f19e789bc8991a025c35605c7022a6a121cd610d19336198f8c69eedcacf1c2，候选为 8b8789b9ab9aeca34559f23c6ed2e05837b45e3c6e815351e3e3df056aee1a25。候选前后摘要与文件集合一致，只替换运行时入口中的复制代码；当前两份候选字节匹配受测副本，反向移除三行复制/注释后原运行文件精确匹配原快照。其他 Owner 的并发工作不获得本轮当前整树验收。

第一次复制因并发源码变化在任何构建前失败，工具丢弃副本并在第二次取得稳定来源；原捕获回执保留这一过程。准确 owner .tmp-d-index-cache-8c8aef13409a46bb8d9a4b1fe0c425de 的 3,679 份文件已删除，含临时源码、缓存、tmp、telemetry 和测试构建产物，并独立确认目录不存在。没有安装依赖、修改远测入口或执行远端命令。

[限定验收](evidence/d-gc-batch-input-accepted-20261022.json)、[清理回执](evidence/d-gc-batch-input-cleanup-20261022.json)、[实际命令](evidence/d-gc-batch-input-validation-20261022.ps1)和[独立复核程序](evidence/d-gc-batch-input-review-20261022.mjs)保存本轮范围。清理后运行 node docs/evidence/d-gc-batch-input-review-20261022.mjs --check 可复核测试、当前两份候选和清理状态；相关字节变化时需重新验证。真实 B/C 交付、九表 normalization、完整 freeze/GC 及 D 原六项继续分别验收。
