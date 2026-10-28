# Schema 清单 CI 修复验证

来源：功能父版本 `bfdb2917`、公共 `backup@8ef5fa7f`；准确 final source pin 见 `source-pin.json`。本轮未修改 migration SQL、原 contract checker/strict gate、registry enums、schema policy decisions 或生产 collector allowlist。

| 检查 | 原记录 | 结果 |
| --- | --- | --- |
| Inventory / contract 普通 `--check` | `inventory-check.json`、`contract-check.json` | exit 0。122 对象，68 policy recorded / 54 pending / 68 cross-review pending。 |
| 新 scanner + CI 主合同测试组 | `final-contracts-tests.tap` / exit | 162 项通过，0 fail/skip；包含生产 DDL 仍被发现、测试 DDL 被排除、新增 22 项保持 pending 的反例。 |
| A 原采集器与同步 fixture 回归 | `a-capture-tests.jsonl` / exit | exit 0；canonical fixture 与新 registry 原 bytes 相等，既有 15 表正例及新扩展范围拒绝反例通过。不接 MySQL。 |
| 最终 registry 使用方 | `registry-consumer-tests.jsonl` / exit、`evidence-report-tests.jsonl` / exit | A、resources、隔离 lab 全包及 evidence 直接受影响交付用例通过。成功用例显式用历史 fixture，完整 canonical 拒绝反例保留；未扩大生产 reader 白名单。此组覆盖 A fixture 最后调整，较早 a-capture 日志仅为开发迭代。 |
| Skill、D init/DTO、metrics、Prometheus 普通检查 | `ci-parity-exits.json` 对应五份 `.log` | 全部 exit 0。 |
| CI 附加 Node 测试 | `ci-parity-tests.tap` + `d-template-final-tests.tap` | 初测 48 项中 46 通过，2 项暴露空白模板旧 catalog pin；只修原模板的该 digest 后，重跑受影响的 15 项全通过，复用其它 33 项有效结果。未隐藏初次失败。 |
| grant drift shell | `grant-drift-shell.log` / exit | Git for Windows 已有 bash；stable 两项通过、namespace/restart/replacement 拒绝。脚本 mock SQL/kubectl，无网络/集群/临时文件。 |
| 前端构建 | `frontend-build.log` / exit | `npm run build` exit 0，复用已有 node_modules，没有 npm ci/install。 |
| 严格检查拒绝 | `inventory-strict.json`、`contract-strict.json`、`strict-exits.json` | 均 exit 1，符合预期。原 3 个 catalog 控制对象缺失、54 pending policies、68 cross reviews、draft/missing artifacts 和现场 schema hash 仍阻断 P0。 |

`check-exits.json/contracts-tests.tap` 是开发中初次结果：跨 owner 策略提交请求未随新增对象同步、Windows CRLF 导致 Prometheus exact-byte 比较失败。分别补请求清单、恢复 canonical LF 后得到最终 162 项成功。审批数组、原 hash、PromQL 与门禁未被修改。日志是 Node/Go 原输出；pass event 包含子测试，不冒充现场独立场景。

前端在 Windows 上使用既有依赖，Go 使用 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`。测试 fixture 仅写独有的本地临时目录；其清理按测试自身 finally 完成。无真实数据库、K8s/Runtime Agent、凭据签发、真实迁移或 PR 合并。未重跑无变化的 runner 六包或全部后端。

专用 cache/tmp `.codex-temp/b-public-integration-20261028` 的此前自动审批清理拒绝仍未绕过；缓存清理尚未完成。前端默认 build 输出为工作区已有 `frontend/dist`，未递归删除该共享生成目录；日志和验证记录保留，没有清理其他 owner 的产物。

源码/文档 `git diff --check` 通过；初次失败的原生 TAP 保留诊断空行缩进，因此全量包含 evidence 的 diff 检查会报告这些原日志的 trailing whitespace。没有为消除该提示而改写原生失败记录。
