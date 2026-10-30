# 最新统一分支拉取与完整性核对（2026-10-30）

准确基线：`d94e22102f0dc6279522c6a7487156370bd90f4a`，从 baa175ca 快进 102 提交，最后远端核对仍为该 SHA。未提交、暂存、推送或部署；本地 B 未提交代码保留。完整关闭表见 [核对说明](../../system-backup-b-latest-completeness-review-20261030.md)。

## 本机实际验证

- `python -B scripts/backup-team-catalog.py --check`：exit 0，`catalog-check.log` / `.exit.txt`。
- `python -B scripts/backup-team-catalog_test.py`：3 项通过，exit 0，`catalog-tests.log` / `.exit.txt`。
- `go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/systembackup/publicadapter ./internal/systembackup/domain ./internal/systembackupexecution -run 'TestWorkBuddyInput|TestWorkBuddyBatch|TestModuleDiagnostics|TestUsersInstances|TestPublicCapture|TestWorkerRelay'`：exit 1，依赖 setup 阻断，实际用例数 0；`go-tests.jsonl` / `.stderr.log` / `.exit.txt`。
- Go 环境 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`，复用既有 cache；缺少精确 json-canonicalization@v0.0.0-20261011152517-32a48195b9b2，没有下载、安装、改版本或 stub。Go 的 downloading 提示不是下载成功。
- `git diff --check`：exit 0；不覆盖 untracked，不能替代编译。新 native ABI/VerifySource 下，本地旧 fixture 仍须适配复验，未运行失败用例不能记作已通过。

summary.json 保留退出码；source-pin.json 固定当前 B 本地增量和核对说明。其他 owner 的测试/现场回执只引用其已提交证据，不能列为本机运行；未访问服务器、SQL、Kubernetes 或 provider，没有真实迁移。

本地恢复副本位于 `.codex-temp/b-upstream-refresh-20261030-150950`，保留以保护未提交工作。没有删除旧空目录、其他 owner 产物或生成仓库内独立二进制。原工作区缓存继续保留。
