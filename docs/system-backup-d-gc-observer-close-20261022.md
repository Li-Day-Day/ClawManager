# D 程序元数据观察器关闭后的取消保护

`Source.Read` 已补上连接归还后的 context 检查。此前，最后一次身份和 grants 复核通过后，如果 `sql.Conn.Close()` 等待期间请求取消或到期，函数仍返回完整观察摘要。现在这两条路径返回 `ErrUnavailable` 和零值 `Observation`，正常有效请求继续返回原摘要。

改动仅为 `backend/internal/systembackupgcmetadata/catalog.go` 的最终返回边界和新增 `connection_close_test.go`。不改变目录查询、摘要格式、权限校验或原五秒读取预算。新测试通过真实 `database/sql` 池归还路径，让驱动 Close 在全部 SQL 检查结束后触发取消或等待读取 context 到期；没有安装驱动、依赖或启动数据库。

| 场景 | 原代码的有效对照 | 修复后 |
| --- | --- | --- |
| 正常关闭 | 返回观察结果 | 保持 |
| 关闭期间取消 | 错误地返回观察结果，用例失败 | 拒绝并返回零值 |
| 关闭期间到期 | 错误地返回观察结果，用例失败 | 拒绝并返回零值 |
| 底层驱动 Close 返回错误，context 仍有效 | `sql.Conn.Close` 不向上传递该错误 | 同样不把池归还当作物理释放证明 |

标准库 `Conn.Close` 调用 `close(nil)`，池归还时的物理驱动 Close 错误不沿此返回值传递。因此最后一项只核对现有观察 API 行为；它不证明远端连接关闭、事务回滚或 backup lock 释放。本轮也没有让阻塞中的驱动 Close 变成可中断操作。

首轮夹具错误地要求最后一项拒绝，原日志和 exit 1 保留且不接收。修正此预期后，有效旧代码对照恰好在取消、到期两个叶子失败，另两项通过。候选源码和合入源码分别运行完整元数据包：每轮 **13 个主测试、281 项含子测试**，无失败或跳过，default vet、源码前后复核及退出 0 均通过。

[准备与发布回执](evidence/d-gc-observer-close-preparation-20261022.json)记录六份既有模块/包输入及一份新测试，保存两份改动文件的已测字节与生产文件原字节；发布前核对共享文件未变，并只写入这两份文件。[复核入口](evidence/d-gc-observer-close-review-20261022.mjs)再次检查有效反例、两轮完整包、当前七份输入及[精确清理回执](evidence/d-gc-observer-close-cleanup-20261022.json)。本轮源码、缓存、tmp、telemetry 与二进制只在独立 owner 目录内产生，验证结束后删除。

此结果只覆盖该观察器关闭边界。未运行实际 MySQL、未启用 freeze 或完整 GC，未签收生产角色，也未扩大为整棵工作树测试通过。[34 项 freeze 前置实验](system-backup-d-download-gc-freeze-mysql-20261021.md)及完整 D 六项范围仍按各自条件继续验收。
