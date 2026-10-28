# B public runner 验证记录

来源：功能分支原 HEAD `1e678b097ff8d7fd3c975183515d9e09af92f138` 加本目录 `source-pin.json` 所列源码；公共 ABI 基线 `backup@d3c5715a05a80c1134edd3ad0132a6c292ee1672`。raw working-file SHA 包含当时实际换行；提交号由交接/PR 更新说明指向，不能把旧 HEAD 单独当本轮源码。

最终有效检查（原生 Windows，Go 1.26.1，`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`）：

| 检查 | 原记录 | 结果及边界 |
| --- | --- | --- |
| 六包隔离回归 | `accepted-tests.jsonl` / `accepted-tests-exit.txt` / `test-summary.json` | publicadapter、domain、profile、flow、systembackupdispatch、kube 全通过；280 个通过的 test event（包含子测试，不是 280 个独立场景），0 fail / 0 skip，exit 0。 |
| 同六包 go vet | `vet.log` / `vet-exit.txt` | exit 0，无诊断。 |
| Linux 库编译 | `linux-build.log` / `linux-build-exit.txt` | GOOS=linux GOARCH=amd64 CGO_ENABLED=0，go build publicadapter 与 profile，exit 0；仅编译，不是 Linux 现场执行，不输出独立二进制。 |
| 合同普通检查 | `current-contract-check.json` / `current-contract-check-exit.txt` | node scripts/system-backup-contract-check.mjs --check，exit 0。原报告仍为 draft，含未关闭 policy/cross-review 与 restore_target/status_relay 等缺口；未宣称 strict/准入通过。 |
| 依赖检查 | `dependencies.txt` / `dependencies-exit.txt` | go list -deps publicadapter，exit 0；无 control/host/profile/artifact/recovery 的直接或传递依赖。AST 测试另查直接 imports。 |
| 源码范围 | `source-pin.json` | 测试前记录 source/profile/flow/kube/worker/shared ABI/候选 schema 与 go.mod/go.sum；测试后重新 SHA 核对，0 drift。 |

随后补齐 B relay 进度闭集：首次 ready、running 不回退 ready、终态只接受原序原 body replay，不能以新序覆盖终态。该增量仅改变 relay.go/relay_test.go，准确差异为 `relay-progress-source-overlay.json`。只重跑 publicadapter：`relay-final-tests.jsonl` / `relay-final-summary.json` 为 88 个 pass event、0 fail / 0 skip，exit 0；`relay-final-vet.log` 与 `relay-final-linux-build.log` 对应 exit 0。其它五包沿用上表有效回归，没有无变化重跑。最终 baseline + overlay 全部源码再核 0 drift，最终范围同时采用这两份 source pin；不能单用较早 source-pin 声称覆盖 relay 最后增量。

fixture SQL driver 运行真实 SELECT-only RR discovery，但不是 MySQL server；Ports、Agent、Job 和 C seal 均为隔离模型。loopback 测试实际建立 Go TLS 1.3 mTLS 会话，使用内存合成 CA/证书；它不证明 A 生产 trust/revocation/SQL 授权。

补充的正反例包括 Job 仅在全部停写 ACK/CheckPaused 后派发、运行中取消后先停止 Job 再恢复原状态、未派发/未知派发范围的完整性、错 UID/结果 hash/checkpoint、部分暂停/fence/Stop/Resume 失败、sealed 接管不重读源、错误 profile/配置/attempt、Job 和认证结果双条件、relay 原 bytes/重放/乱序/冲突/字段别名拒绝、缺失 owner 输入拒绝及目标隔离 proof 校验。

早期 `runner-tests-expanded.jsonl` 保留发现失败的原记录（preflight RawMessage null/空表示不一致，随后修复）。其它 initial/reviewed/final/current 等日志是开发阶段记录，可能对应较早源码；最终结论采用上表 pin 下的 accepted/vet/linux/current-contract/dependencies 加 relay-final 增量。没有删除或覆盖旧失败记录。

未执行：真实 MySQL、Runtime Agent 停写/恢复、K8s Job/VolumeSnapshot、CSI/NFS/HostPath、独立 SQL observer 与真实 HTTP/worker 联合核对、公共成品/终态验收、真实迁移。用户确认没有可写的隔离现场。未连接参考服务器，未安装依赖。

清理：日志保留；专用 GOCACHE/GOTMPDIR 为 `.codex-temp/b-public-integration-20261028/cache` 与 `tmp`。此前清理该目录遭自动审批 `blocked by policy` 拒绝，本轮未绕过或删除其他 owner 产物，因此缓存清理尚未完成。未产生仓库内独立 binary。
