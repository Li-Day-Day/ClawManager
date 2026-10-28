# K8s CI 安装缺项修复与验证

本文为 47f3d011 时的历史记录。此后已取消通用 CI 的必填 MinIO 仓库变量/digest 要求，安装检查改为独立手动 workflow，支持 release tag；最新行为与未验收项见 [交付说明](../../system-backup-install-smoke-and-acceptance-20261028.md)。旧日志和源码 pin 保留，不改写当时结果。

本轮功能父版本 `f53ecb1dc86d84cabf6a74871881803fb1270e03`；只读核对公共 `backup` 仍为 `8ef5fa7fd4df45f6306e910705db01f589266ba7`。本轮只修改 CI 安装准备和诊断，没有修改生产部署 YAML、公共备份 ABI、认证授权、控制面门禁或生产配置。

## 失败依据

[run 40658993198 / K8s job 122718095532](https://github.com/huihuihuizhang/ClawManager/actions/runs/40658993198/job/122718095532) 的应用等待超时不是根因。事件显示应用缺少 `clawmanager-secret-broker-ca` ConfigMap，Secret Broker 缺少 `clawmanager-secret-broker-tls` Secret；MinIO 的 `docker.io/minio/minio:latest` 拉取被拒绝。MySQL 已就绪，应用尚未完成挂载。关键事件原行见 `prior-ci-failure-excerpts.log`，完整日志仍保留在本地专用日志目录；线上原始链接可独立核对。

匿名核对官方 Quay 历史版本 `RELEASE.2025-09-07T16-13-09Z`，完成 Bearer challenge/token 流程后，manifest GET 仍返回 HTTP 401 / UNAUTHORIZED；没有拉取镜像层。未把初次正常 Bearer challenge 当成最终授权失败。MinIO 官方仓库现说明社区版本为 source-only，见 [原厂 README](https://github.com/minio/minio#source-only-distribution)。本轮未编译、安装 MinIO 或改用未审查的第三方镜像。

## 已完成

- `scripts/ci/prepare_k8s_smoke.py` 使用 Python 标准库及已有 OpenSSL 生成独立、两天有效的测试 CA/服务证书。服务证书包含原 Secret Broker 完整 DNS SAN、serverAuth、CA:FALSE；生成后实际执行 CA/用途/主机名验证。
- 临时清单新增原名称和原 key 的 ConfigMap/Secret；原 HTTPS、CA 挂载、init 主机名校验、projected ServiceAccount token 和 broker migration 开关全部保留。
- 保留原 CI 本地应用镜像、MySQL 启动顺序、MySQL/workspaces emptyDir 与前端 ClusterIP 调整。对模板的预期匹配次数检查失败即报 source drift，不再静默忽略未命中的替换。五处 workspaces 与旧 CI 处理范围一致，不代表真实共享存储验证。
- MinIO 必须由仓库变量 `K8S_SMOKE_MINIO_IMAGE` 显式提供 `registry/repository@sha256:<64 位小写十六进制>`，不接受空值、mutable tag、URL 或内嵌认证。**格式校验不证明镜像身份、审核或可拉取**；必须由部署/资源 owner 提供受审输入，并由实际 rollout 验证。
- 工作流所有集群操作显式固定 `kind-clawmanager-ci`，应用前核对当前 context。Secret Broker、MinIO 分别等待就绪，失败诊断补其 Pod/日志及应用 init 日志。原应用 300 秒超时、health/version/web 检查保留，不加入 skip/continue-on-error。
- CA 私钥/CSR 在生成器的独有临时目录退出时清理；含服务私钥的临时 manifest 为独占创建、Unix mode 0600，位于 runner 独有目录。CI always 步骤只删除该文件并 rmdir 独有目录，不输出/上传 manifest 或私钥。kind 的原后置清理仍保留。

## 本轮验证

| 范围 | 记录 | 结果与限制 |
| --- | --- | --- |
| Python 离线 fixture 回归 | `offline-tests.log`、`check-exits.json` | 6 项通过，exit 0。覆盖当前模板、漂移拒绝、非法镜像输入、验证模式不生成密钥、输出不覆盖/不泄密、真实 OpenSSL CA/用途/主机名和公私钥匹配；错误身份及不受信 CA 拒绝，两天证书寿命边界。无集群/数据库/镜像拉取。 |
| 空白存储输入拒绝 | `missing-minio.log`、`check-exits.json` | exit 2，预期拒绝，不伪造缺省镜像。 |
| 工作流/生成物解析与 Bash 语法 | `workflow-manifest-validation.log`、`workflow-validation.cjs` | 使用已有 frontend js-yaml、Node 和 Git Bash。原 39 对象 → 41 对象；未声明修改的对象逐项相等；全部 Deployment env/ServiceAccount、原应用 init 校验与其它安全卷保留。所有 k8s-smoke shell 通过 `bash -n`。 |
| 源码范围 | `source-pin.json` | 当前脚本、工作流及未修改生产 manifest 的 SHA256，可核对实际范围。 |

复现 Python 回归：`python -B -m unittest discover -s scripts/ci -p test_k8s_smoke.py -v`。使用测试专用合成 image reference 仅做离线渲染，不会 pull，也不作为 CI 镜像默认值。附带解析验证脚本需在仓库根目录运行，设置 `SMOKE_MANIFEST` 指向独有临时生成清单、`SMOKE_BASH` 指向已有 Bash，再执行 `node docs/evidence/b-k8s-ci-fixtures-20261028/workflow-validation.cjs`。使用已有 frontend/node_modules 中的解析器，不安装依赖，不输出清单内容。

初次 Python 迭代把 workspaces 的预期数写成 1，当前模板实际有 5 处，按旧 CI 原范围纠正后通过。解析验证初稿的“允许变化对象”清单错误包含 Codex/Claude，遗漏 OpenCode/DeepSeek Harness；`workflow-validation-initial-failure.log` 保留原失败，纠正检查对象后得到最终成功。没有为通过检查修改生产 YAML。

## 尚缺输入及准确验收状态

当前上游仓库尚无 `K8S_SMOKE_MINIO_IMAGE`。部署/资源 owner 需提供可供 GitHub hosted runner 匿名拉取的、受审的 MinIO registry/repository 与 digest，并在运行 PR workflow 的仓库配置此 Actions repository variable。若只有私有镜像，还需 CI registry 登录方案及 Secret **名称**；本版不接收密码、不引入隐式认证或自行发布镜像。仅有当前内网生产 registry 地址不能证明 GitHub runner 可访问。

缺少变量时，新 K8s job 在构建镜像/创建集群之前明确失败；这是一条保留的缺项门禁，不是绿色检查。准备好变量后重新运行工作流，核对 broker/MinIO/MySQL/app rollout 及 health/version/web 的实际结果。不能用本地离线 6 项成功宣称 K8s 已通过。

父版本的 Frontend、Backend（完整 Go 测试）、Browser Worker、Hermes、Docker 五项 CI 成功仅属于原 head `f53ecb1d`。本轮没有无变化重跑这些本地构建，没有安装任何依赖、没有对服务器/生产集群写入、没有真实迁移。

安装冒烟即便通过，也不证明公共 runner/claim/attempt/Job/relay、停写恢复、provider 成品或公共终态真实首链通过。A/C/D 仍缺的生产装配、真实身份/grant/撤销及现场验证输入，继续以 [B 交接记录](../../system-backup-b-relay-writers-handoff-20261028.md) 为准。本轮不合并 PR。

本轮新建测试临时目录和密钥随测试 finally 清理；使用 `-B` 未产生 Python 字节码缓存，未创建二进制。以前缓存目录的自动审批清理拒绝仍未绕过；其清理尚未完成，本轮未删除其他 owner 的产物。验证日志及源码 pin 保留。
