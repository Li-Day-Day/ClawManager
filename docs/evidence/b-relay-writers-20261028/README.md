# B relay/writer 定向隔离验证

来源：功能父版本 `08d15abf443511376bf1a0c9c9593caea8feef5c`，整合公共 `backup@8ef5fa7fd4df45f6306e910705db01f589266ba7`，加 `source-pin.json` 所列本轮源码。pin 是测试时实际 working-file SHA（含实际换行）；测试后重核 0 drift。提交准确 head 见更新后的 PR #1，不把旧父版本当本轮结果。

环境为已有 Go 1.26.1 / Windows amd64。全部设置 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`，没有下载/安装依赖。复用本聊天专用 GOCACHE/GOTMPDIR。

| 检查 | 原记录 | 结论 |
| --- | --- | --- |
| `go test -json ./internal/systembackup/publicadapter ./internal/systembackup/quiesce ./internal/systembackupdispatch -count=1` | `adapter-quiesce-dispatch-tests.jsonl` 与同名 exit | 3 包通过，194 pass event（含子测试），0 fail / 0 skip，exit 0。 |
| `go test -json ./internal/systembackupevidence -run '^Test(DispatchRelay\|RelayPeer\|SystemPeer)' -count=1` | `a-relay-tests.jsonl` 与 exit | 原 A 定向用例通过，102 pass event，0 fail / 0 skip，exit 0。没有运行该包的真实 MySQL 用例。 |
| `go test -json ./internal/services -run '^Test(BackupGatewayWriter\|UserInstanceBackupScope\|NewRuntimeConstantsRequireExplicitBackupCoverage)' -count=1` | `services-gateway-tests.jsonl` 与 exit | Gateway 及支持范围定向回归通过，21 pass event，0 fail / 0 skip，exit 0；没有运行无关业务测试。 |
| `go vet ./internal/systembackup/publicadapter ./internal/systembackupevidence` | `vet.log` / `vet-exit.txt` | exit 0，无诊断。 |
| `GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build ./internal/systembackup/publicadapter` | `linux-build.log` / `linux-build-exit.txt` | exit 0，仅库编译，不输出仓库独立 binary，不是 Linux 现场执行。 |
| `go list -deps ./internal/systembackup/publicadapter` | `dependencies.txt` / `dependencies-exit.txt` | exit 0；没有 private control/host/profile/recovery/artifact 的直接或传递依赖。 |

合计 317 个通过的 test event，包含子测试，不能称 317 个独立业务场景。摘要见 `summary.json`。原六包记录中未变化的 domain/profile/kube 等范围复用上轮有效记录，不无变化重跑全部后端；本轮没有运行全量后端、前端、真实服务或 strict 准入验收。

本轮新增验证实际执行 A 的原认证器、BindDispatch/RecheckDispatch，覆盖漏 Bind/Recheck、错 Job/fence/tx、重复 Bind、原 DB clock 回退、本地映射撤销、请求取消、TLS 版本、错决定、提交不明拒绝响应和 body 副本隔离。native loopback TLS 1.3 mTLS 使用合成 CA/证书。D 事务为 fixture/sql.Tx identity anchor，B 无 Begin/Exec/Commit，不作为原公共 SQL 提交或共享撤销证据。

writer 组合实际执行 NewLinuxDispatcher、真实 SELECT-only 发现代码（SQL driver fixture）、NewRuntimeWriterBuilder、原 RuntimeAgent HTTP client 与本地 Agent 模型、flow、Job/认证报告模型、Stop→原预留 generation 恢复。验证构造/Bind 无 I/O、Prepare 只读、全部 ACK 后派发、Stop 后才领取 restart 派发、generation 7→原预留 19 而非猜 +1、新 owner 完整 Authority、失 capture 权限后的独立 recovery、无 reservation/恢复权限拒绝、原停止状态保持、源映射/归属/冻结集合漂移拒绝和缺依赖拒绝。Pod/Deployment 构造复用原物理执行器；新增用例验证无 API 副作用和恢复 proof 路径，已有 quiesce 隔离生命周期用例也已回归。

开发日志 `development-tests.jsonl` 原样保留：首次测试 fixture 漏设 HandshakeComplete，A 正确拒绝，正例失败；修复 fixture 并要求预期事务反例必须实际到达 D 边界后通过。没有降低 A 检查。`reviewed/composed` 是较早开发迭代，不作为最终 pin 的完整结论，也没有删除失败记录。

未执行真实 MySQL/Runtime Agent/K8s Job/VolumeSnapshot/CSI/NFS/HostPath、独立 SQL observer 与 HTTP/worker 联合验收、公共成品终态或真实迁移；没有连接只读参考服务器。现场环境及 D/A/C 实际输入尚缺，详见交接文档。

清理：Go 测试自动清理其 fixture 临时文件；日志、源码 pin 与验证记录保留。本聊天专用 `.codex-temp/b-public-integration-20261028` cache/tmp 此前清理遭自动审批 `blocked by policy` 拒绝，未绕过，因此缓存清理仍未完成。未清理其他 owner 产物，未输出仓库内独立二进制。

推送后的外部 CI 单列：GitHub run `40653847616` / Frontend job `122700030915` 在清单 freshness check 失败，原日志为 `frontend-ci-job-122700030915.log`。此时 CI 测试合并 commit 为 `6eb67c6e79617259fe62c169b6e68c732571d76c`，PR head 为 `a89b7ead`。本地只读诊断确认正式清单 100 对象，而 `--write` 候选为 122，22 项未分配 owner；候选 contract 检查 exit 1，原文见 `schema-candidate-contract-rejection.txt`，候选/摘要保留为 `schema-inventory-observed-*`。正式生成文件的探索性改动已恢复，未修改 registry/枚举/owner/门禁状态，不以候选更新冒充 CI 修复。全部候选只作待各域 owner/D 复核输入。

GitHub workflow 会自行运行其既有构建/安装步骤；本聊天没有运行本地依赖安装或主动重跑全量测试。当地定向回归、GitHub 全量检查与现场验收分别记账。CI 观察详见 `ci-observation.json`，不将尚未完成的 Backend job 记为通过。
