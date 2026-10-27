# A：GC 程序元数据观察器关闭边界独立复核

已限定接收 D 的关闭后 context 检查。它修复一个具体晚返回：最终 SQL 身份和 grants 检查已经通过，但 `sql.Conn.Close()` 等待期间请求取消或到期，旧代码仍交付完整 `Observation`。修订后，这两种情况返回 `ErrUnavailable` 和零值观察，正常请求保持原结果。

[A 独立记录](evidence/a-gc-observer-close-accepted-20261022.json)核对 [D 原交付](evidence/d-gc-observer-close-preparation-20261022.json)的源码、反例、两轮完整测试事件和清理。A 本轮没有重跑已成功的测试/构建，也没有安装依赖或生成测试构建产物。

## 代码与验证范围

生产变更仅为 `backend/internal/systembackupgcmetadata/catalog.go` 最终 `c.Close()` 条件增加 `ctx.Err()`，另加解释注释。A 将这段改回原条件后，完整字节 SHA 与原文件相同；SQL 查询、权限核对、摘要格式和原五秒读取预算没有变更。新增测试为同包的 `connection_close_test.go`。

| 核对项 | 证据 |
| --- | --- |
| 原完整包保留 | 前一轮 view-create 完整包 12 根/276 项，均逐名保留；更早程序元数据观察器的 243 项也全部保留。 |
| 有效反例 | 使用相同新测试和旧生产文件，正常/物理 Close 错误控制通过，恰好取消、到期两个叶子失败；原 exit 1 保留。 |
| 修订和发布验证 | 候选与发布各 13 根/281 项，零失败/跳过；实际 run/pass 集合相同，覆盖当前测试文件声明的全部 13 个根。新增为一个根和四个场景，共 5 项。 |
| 时间/关闭触发 | 测试走真实 `database/sql` 池归还路径，以零空闲连接触发物理 Close；先确认所有 SQL 检查结束且 rows 已关闭，再取消或等待 context 到期。 |
| 固定输入 | 五份包内 Go 源码/测试加 go.mod/go.sum，共 7 份，逻辑摘要 `badc6447fde3a145d14ecab958078ed2dc589db8660845ba98102a546f4ce6ec`；当前大小/字节摘要及完整文件集合匹配。包内依赖均为已有标准库。 |
| 默认门禁 | 原验证脚本保留默认 vet、`-mod=readonly`、`-count=1`、前后来源核对；工具链固定 local，GOPROXY/GOSUMDB 关闭，telemetry/cache/tmp 使用准确自有路径。 |
| 清理 | D 的准确 owner 目录 `.tmp-d-index-cache-d8299479984a4e9bbd38d90d5761c67d` 已删除，A 另行确认缺席；未触及其他任务的目录或全局缓存。 |

原 view-create 的 33 项属于前一轮 276 项基线，不计作本次关闭修订新增。本轮接收范围是关闭边界及其完整包回归，不能扩展为其他元数据组件的生产批准。

## 首次夹具失败与物理关闭语义

首轮测试曾错误地要求底层 driver `Close` 返回错误时，`sql.Conn.Close` 也必须向上传递该错误。A 核对了本机原 Go 标准库源码：`Conn.Close()` 调用 `close(nil)`，内部池归还不把物理 Close 错误作为该返回值传回。该首轮三个失败中的 `close_error` 不是有效缺陷反例，原日志和失败继续保留，不纳入接收。

修正后的控制只说明原观察 API 在 context 仍有效时交付观察；不证明底层资源已物理释放。新增取消/到期反例仍使用相同的真实池归还路径，准确区分旧生产代码和修订代码。

## 保留的边界

本轮没有把阻塞中的 driver Close 变成可中断操作；不证明服务端连接/事务/锁已释放或释放时长有上界。元数据观察仍是顺序读取，不是原子目录、DDL freeze、GC 权限或 collector 提交许可。

实际 MySQL、生产最小角色、完整 freeze、provider/卷以及完整 GC 继续按原门禁验收。本轮不修改 owner 十一项的来源接收器，不登记新的 owner 普通来源基线，也不要求重跑已接收角色十项或 D GC 十八项。真实材料线继续等待原交付；这项本地交叉复核已完成。

本地只读复核命令：

```powershell
node .\docs\evidence\a-gc-observer-close-review-20261022.mjs --check
```

状态为 `accepted_scoped_post_close_context_boundary_only`，完整生产 GC 与现场验收均未由此批准。
