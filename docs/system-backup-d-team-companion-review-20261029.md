# Team 剩余配套审查与补齐（2026-10-29）

本补充基于统一基线 `700b92ef`，继续核对 Team `5874d7d7`。前一次已接收业务代码，但未完整检查配套文件；本轮补齐 E2E/接口说明，并纠正部署清单回退。后续接手应使用包含本文件的最新集成提交。

后续发现：本提交 `102928ff` 的远程后端全量测试失败。下文仅记录当时实际执行的检查，不能作为全量 Go 测试通过的证明；原因、修复及补验见 [CI 修复记录](system-backup-d-ci-repair-20261029.md)。

## 接收和保留决定

| 差异 | 决定 | 原因与验证边界 |
| --- | --- | --- |
| `e2e/` 新增九文件及 OpenClaw access 增量 | 接收 | 包含 owner Teams、workbench、Runtime pool、presence、workspace、K8s fixture、backup integration/storage harness；OpenClaw 移除作者机器绝对路径并保留明确 legacy 模式。新增/修改 JS 通过语法检查，两个 Python harness 通过 AST 检查。需要 Docker/浏览器/自有数据库的真实执行未在本轮运行。 |
| `backup-integration-pages.test.mjs` | 接收并适配 | 默认路由按当前公共 records 页面，不再将已停用的 Team 独立任务入口视为验收目标；仍明确是 HTTP fixture 的 UI 验证，不是后端成功备份。 |
| northbound owner Teams 指南/OpenAPI、Runtime recovery 指南 | 接收 | 与此前接收的实际业务/API 配套；OpenAPI YAML 解析通过。 |
| Team 备份实现/计划说明 | 保留为标记后的历史来源 | 当前入口、控制器和验收范围以 D 统一清单为准，原 Team 日志不能充当本提交实测。 |
| C `build.yml` 覆盖本地、删除手动安装 smoke 的变化 | 不原样接收 | C 会取消本地已有隔离安装准备及 TLS 检查，并把普通 CI 绑定到旧 kind 安装脚本。本轮保留独立手动安装工作流、固定测试集群及清理规则。 |
| 本地 CI 的 unversioned schema/controller 源码检查 | 对齐当前 v2 自动门禁 | 原 inventory/contract/init-controller/DTO/metrics 生成检查仍硬编码旧表、旧文件与旧数量，不能把其失败当新合同通过。当前 CI 使用 164 迁移 catalog/分类、bootstrap 生成规则、Skill policy、五套初始化一致性、实际 API/恢复提示测试及后端全包测试/编译。旧脚本留作历史，后续正式领域/metrics 合同验收仍须按新权威逐项迁移；没有补造 registry 审批。 |
| CI 入口 | 更新 | push 覆盖 `backup`、`codex/**`；修复 frontend job 中 root Python 测试路径；前端 build 显式 LIVE_READ=1；后端编译全部命令。 |
| C 五套部署 profile 中旧内嵌建表 SQL、Secret Broker TLS/RBAC 删除 | 恢复本地 `4fe83bcd` 较新实现 | 保留 database-only init、独立 broker、app 等待 TLS 验证、最小权限及 token/CA 挂载。首次 smoke 检查实际发现 image/工作负载数量漂移，不通过放宽断言绕过。 |
| 下载代理/启动脚本、独立 broker 清单、部署说明 | 恢复本地较新实现 | 默认未配置拒绝，授权下载走独立 HTTPS runtime；保留 C 的 `/index.html` SPA 缓存/Referrer 策略。Docker 补回代理脚本及 broker 的 `clawreef-secret-broker` 命令别名，仍为同一 broker 二进制。 |
| `.gitignore` 中本地 `.tmp-*` 规则 | 保留 | C 删除这一规则不适合本轮自有临时产物管理。 |
| C 历史验收日志、清理回执和 image 状态报告 | 不批量搬入或改写当前结论 | 来源固定在 `5874d7d7`，它们证明的是当时的环境和字节。Git 历史保留，不能当作当前版本现场成功。 |

## 本轮验证

- Python 隔离安装/TLS夹具 7 项通过（使用现有 OpenSSL，临时证书不入库）。
- 数据库初始化一致性检查通过：5 套部署；对应 4 项回归通过。
- Skill policy 25 项回归通过，保留未审批拒绝语义。
- CI 工作流、镜像命令对应和下载代理共 30 项测试通过；恢复初始化后 catalog 与 bootstrap 生成检查仍通过。
- 新增/修改 E2E JavaScript 语法检查、两个 Python harness AST、northbound OpenAPI YAML 解析通过。
- 未运行 Docker build、kind 安装或真实 E2E，不用源码/语法通过声称现场验收。没有修改后端 Go 代码，上一提交的全量编译及 11 包回归结论仍按其记录保留。

可复跑入口：`scripts/ci/test_k8s_smoke.py`、`scripts/ci/k8s-install-workflow.test.mjs`、`scripts/system-backup-d-init-check{,.test}.mjs`、`scripts/system-backup-download-proxy.test.mjs`。Windows 使用现有 Git Bash/OpenSSL；CI 在 Ubuntu 运行。实际 Kubernetes 仍只能显式运行 `K8s Installation Smoke (Manual)`，不是普通 CI 隐式部署。
