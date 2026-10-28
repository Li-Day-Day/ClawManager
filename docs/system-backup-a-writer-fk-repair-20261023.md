# A：扫描任务 writer 外键排程修复

2026-10-23。A-WRITER-FK-01 的本地实现与 Go 回归已完成；真实 MySQL 外键观察及生产恢复资格仍未接收。[限定验收记录](evidence/a-writer-fk-repair-accepted-20261023.json)可用 `node docs/evidence/a-writer-fk-repair-review-20261023.mjs --check` 重放；加 `--check-current` 还要求当前源码匹配冻结版本。

## 实现

`restore_write.go` 将不再保留的 `security_scan_jobs` 父行删除推迟至其余插入/更新之后。仍先显式删除不保留的子行，再依原表顺序插入新父行、更新保留子行的 job_id，最后删除旧任务父行并完成原九表读回、控制表检查、最终权限及取消检查。

该调整只针对 migration 063 的 job_items/reports → jobs 两条 `ON DELETE CASCADE`。没有关闭 FK、加入 REPLACE/IGNORE/upsert、放宽恰一行检查或改变调用方事务的提交/回滚所有权。Candidate 的领域证明仍必需，不因关系转换可执行而认证 B/C 业务合法性。

## 验证

新增 `restore_write_fk_a_test.go` 通过原存储型 driver 调用实际 Go writer，额外模拟两条 FK、级联删除、缺失 UPDATE 目标返回零行。它不证明实际 MySQL 行为。

- 保存的旧生产字节运行四个改挂场景全部失败：只迁移 item、只迁移 report、同时迁移两者、迁移至已有父任务；原根测试及四个失败叶子均保留。
- 修复后四个场景全部成功，无保留子行被级联删除；显式删除子行的对照通过。四个变更位置各自 SQL/影响行数失败的八个分支、末次权限失败及取消共十个失败分支均由共同事务恢复原完整行集。
- 完整普通 resources 包为 71 根/843 条通过事件，旧 826 条逐名保留，新增三根/17 条；默认 vet、43 份冻结输入及当前集合/字节后检、退出 0 均通过。
- 准确自有目录 `.tmp-a-writer-fk-75d1f5258459401aa2d7c6f1fca1069a` 已删除并独立核验不存在。源码副本、缓存、临时文件及构建产物随目录清理；日志和源码胶囊保留用于复核。未安装依赖或连接远端。

原始运行是 `evidence/a-writer-fk-20261023-134215-75d1f525.*`。旧/新生产 SHA、原/新测试事件、完整冻结字节及独立复核程序均由限定验收记录绑定。

## 仍未覆盖

这不是通用 FK/UNIQUE 排程器。保留行之间交换唯一键、其他 FK、触发器及 C 四张扫描表语义仍需各自证明；不满足 SQL 约束的计划继续失败并回滚。实际服务器须带真实 FK 运行改挂、晚失败和共同回滚回归，不能拿 CREATE TABLE LIKE 无 FK 的原九项专项替代。

新旧任务父行在事务中会短暂并存。Rows/Bytes 仍限制各个写前/写后行集，实际物理容量准入必须计算这段重叠及事务写入开销，不能把端点行数预算当成物理预留已足够。原授权期限和 reservation 不续期。

D 在旧普通包运行之后加入的 tagged `restore_write_mysql_test.go` 本轮只做来源绑定，未编译或执行；它没有继承本轮普通包或真实 FK 的通过结论。正式 registry、生产装配、B/C 真实 proof 和启动门禁均未批准。
