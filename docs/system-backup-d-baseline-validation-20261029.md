# D 集成验证记录（2026-10-29）

输入：本地 `4fe83bcd`，C `5874d7d7`。实际交付以本文件所在 commit 为准。未使用 C 历史真实平台回执代替本轮验证。

## 本轮命令

在仓库根目录运行；本机使用 Go 1.26.1 windows/amd64，使用项目 go.mod。缺失的锁定 `github.com/cyberphone/json-canonicalization` 依赖在用户明确允许后安装，默认代理超时后通过镜像取得并由 go.sum 校验。后续测试以 GOPROXY=off 运行。

```powershell
$env:GOPROXY='off'
$env:GOTOOLCHAIN='local'
$env:GOMAXPROCS='2'
# 将 GOCACHE/GOTMPDIR 指向本轮自有工作区临时目录，结束后清理。
go -C backend test -p 2 ./internal/systembackupdispatch ./internal/systembackupcontroller ./internal/systembackupexecution ./internal/systembackupapi ./cmd/server ./cmd/system-backup-v2-controller ./internal/backupgate ./internal/db ./internal/systembackupsecurity ./internal/systembackup/publicadapter ./internal/systembackupobserver
go -C backend build -p 2 ./...
python scripts/backup-team-catalog.py --check
python scripts/backup-team-catalog_test.py
node scripts/system-backup-d-bootstrap-rules.mjs --check
node --test frontend/src/services/systemBackupActions.test.mjs frontend/src/services/api.backup-auth.test.mjs frontend/src/pages/admin/backups/backupRecoveryNotice.test.mjs
node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.app.json --noEmit --incremental false
git diff --check
```

## 实际结果

- 迁移 catalog/分类检查通过：164 个迁移，未执行 DDL；catalog Python 回归 2 项通过。
- 前端接口/认证/取消/恢复提示回归 8 项通过；TypeScript noEmit 检查通过，无前端构建产物。
- B writers/composition/relay/relay_auth/relaywire 及原 relay evidence 接收文件，与 `4fe83bcd` 的 diff 为空。
- A/B/C 角色联审完成；A 发现 registration-only logout 撤销遗漏已恢复；B 增加恢复 barrier 顺序测试；C 确认旧导入 profile 不能冒充当前现库兼容。
- 后端验证结果：最终完整命令退出码 0，11 个定向包全部通过（dispatch/controller/execution/API/server/v2-controller/gate/db/security/publicadapter/observer）；规范 LF 字节下全后端 `go build -p 2 ./...` 退出码 0。。

初次回归暴露 Windows 工作副本 CRLF 与规范 LF 不一致：迁移 DDL 对照及精确 SQL hash 在恢复规范字节后通过。bootstrap 生成文件原 pin `5da5a1...` 经核实精确对应 CRLF 合同；使用现有生成器 `--write` 后 pin 为 Git 规范 LF 的 `6d1c88...`，diff 仅此常量，字段/范围/默认值/用途清单均不变，随后执行生成器 `--check` 和完整定向包复测。未修改合同正文或降低哈希断言。

## 证明范围

这是可复跑的本机集成源码验证，不是生产现场成功备份。未提供测试自有 MySQL/Kubernetes 环境，opt-in 平台用例的 skip 不算验收；未执行真实迁移、镜像构建、部署或原库切换。当前功能边界、现库导入缺口和所有后续接口见 [统一基线清单](system-backup-d-unified-baseline-20261029.md)。

历史现场脚本中使用 unversioned 表的 grants/pins/observer 不自动适用于本基线；只使用经过新版表名和实际环境授权复核的配置。本轮测试/编译临时目录、Python缓存均在结束后清理；持久安装的依赖保留。