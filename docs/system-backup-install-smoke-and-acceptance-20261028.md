# 代码整合、安装冒烟与备份恢复验收

**目前完成了测试环境准备代码和离线验证，尚未证明 K8s 部署成功，更没有证明公共备份恢复整链通过。**

本次按用户授权解决 `47f3d011` 与公共 `backup@2ed5e284` 的冲突，通过普通 fast-forward push 将合并结果直接交付到原仓库 `backup`。不调用 PR merge、不 force push、不调整仓库保护规则。准确交付 commit 以实际 push 回执为准；本文件不把待执行动作写成已验收结果。

## 通用 CI 与独立安装冒烟

原 `.github/workflows/build.yml` 保留前后端、Hermes、Browser Worker、Docker 构建和既有触发范围。离线 TLS/清单 fixture 测试和新的工作流边界测试仍参与通用 CI，不依赖 MinIO 镜像源、K8s 安装或仓库变量。原 schema freshness 和公共合同门禁继续执行，不因直接 push 或拆分安装冒烟而放行。

`.github/workflows/k8s-install-smoke.yml` 只接受手动 `workflow_dispatch`，独立记录安装结果，不依赖通用 Build 的 job。操作者每次输入一个可访问的 MinIO 镜像引用即可：固定 release 标签可用，digest 可选，不再要求全仓库配置 `K8S_SMOKE_MINIO_IMAGE`。该名称仅作为手动 job 的进程环境变量和本地 CLI 兼容入口。

引用示例 `minio/minio:RELEASE.2025-09-07T16-13-09Z` 仅说明输入格式，**不是可拉取证明或默认镜像源**。当前 Docker Hub/Quay 的实际匿名核对曾被拒绝，不能仅换标签后宣布解决；先由维护者/部署 owner 给出 GitHub runner 能访问的镜像源。手动 job 实际执行 `docker pull` 并记录 RepoDigests，成功后才构建应用、创建临时 kind 和等待部署。拉取或就绪失败仍使该独立检查失败。若选 release tag，记录当次实际 digest 便于复现；需要严格固定内容时可直接输入 digest。

本版手动 runner 使用公开可拉取的镜像源，不包含 registry 登录/生产凭据。若只有内网或私有 registry，需要部署 owner 落实可达性、runner 选择和 CI Secret 登录方案；不要把密码写进镜像引用、命令行或日志。

TLS 准备保持：每轮自动生成两天有效的独立测试 CA 和原服务 DNS SAN 证书，补齐原 ConfigMap/Secret；HTTPS、CA、主机名、projected token 和原授权逻辑不变。仅向临时 kind 写入；生产 manifest 未修改。原应用 timeout 和 health/version/web 检查保留，测试私钥不输出、不上传，原清理步骤保留。

GitHub 手动入口需维护者先将该 workflow 定义登记到默认分支，然后才能选择 `backup` 等 ref 执行，见 [GitHub 官方手动工作流说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)。本次仅获准推送 `backup`，不擅自改默认分支或推送 main。定义登记后可执行：

```sh
gh workflow run k8s-install-smoke.yml --repo huihuihuizhang/ClawManager --ref backup -f minio_image='<可访问镜像源>/<仓库>:RELEASE.2025-09-07T16-13-09Z'
```

不要原样运行占位地址。支持本地 CLI 显式输入 `python -B scripts/ci/prepare_k8s_smoke.py --minio-image '<镜像引用>' --output '<独有临时目录>/install.yaml'`；生成物包含测试私钥，不应展示或提交。

拆分 workflow 不自动修改 branch protection/rulesets。如果维护者已把旧 K8s check 设为必需，应按仓库规则另行确认。当前保护查询返回 404、branch rules 查询无记录，不能据此承诺没有限制；普通 push 仍接受服务端规则检查，遇到拒绝不强推。

## 这次具体验证了什么

- 冲突解决与原 A/B、D 执行桥接验证见 [上一轮本地记录](evidence/b-direct-backup-integration-20261028/README.md)。其源码 pin 经逐文件核对，不变的 Go 范围复用原有效结果，不重新跑数千个相同测试。
- 本轮实际运行 Python/OpenSSL fixture 回归 7 项、工作流 YAML/边界和 Bash 语法回归 3 项，均通过。覆盖无需仓库变量的 release tag/digest、拒绝浮动/非法引用、证书信任/身份/密钥匹配、模板漂移、手动与自动检查分离、先拉取后部署及只操作临时 context。
- 当前公共 082 migration 已到，而 inventory/registry/bootstrap catalog pin 的同步尚未完成；普通 freshness 检查仍失败。原目录为 136 文件，实际新增后为 137。上一轮按“只解决冲突”撤回了额外策略补登，本轮没有伪造 D 策略/审批或改变原门禁，不能宣称全部 CI 通过。
- 本轮未实际调用手动 workflow、未 pull 本地镜像、未安装依赖、未连接真实数据库/Agent/存储、未执行真实迁移。通用 Build 原 push 过滤仍是 main/feature/fix，直接推送 backup 不等于取得绿色 Build 结果。

本轮原生日志、退出码、源码 pin 和既有 Go pin 复核见 [交付验证记录](evidence/b-direct-push-manual-smoke-20261028/README.md)。此前 cache/tmp 清理被自动审批拒绝的记录保留，不换方式绕过。

## 后续集群验证清单

安装冒烟只核对空白临时安装的镜像拉取、Secret Broker/MinIO/MySQL/app 就绪、health/version/web 和安装资源清理。它不创建备份任务，不证明用户/实例数据可恢复，也不证明生产存储、暂停协议或终态正确。

部署前需在获准写入的隔离安装完成下列独立备份功能验收，保留同一源码/镜像版本、task/attempt/Job 标识、脱敏日志和清理记录：

1. 提供精确 context/namespace、空白目标、受控 MySQL/Agent/存储与最小授权；先同步并核对真实 schema/catalog/registry、A/C/D 接口和生产装配门禁。不能用本次离线模型替代。
2. 公共控制面创建真实任务，独立 SQL observer、HTTP 和执行端核对同一安装/task。claim CAS 与领取回执原子提交，核对真实 attempt、Job UID/generation、认证 relay sequence/body hash、取消/超时/失 fence/接管与未知结果收敛，不能由当前 lease 或 row_version 推算历史。
3. 验证完整 writer 关门、Agent 暂停与 ACK、采集前停写屏障、完成/失败后源状态恢复；物理 collector 和子任务未退出前不得释放许可或恢复源写入。
4. 使用合成多用户、支持矩阵内的多类型 Linux Lite 实例，核对账号登录、源 admin 覆盖目标 bootstrap admin、配额/归属、配置/文件/Skill/会话/任务及安全材料。包括 WorkBuddy Lite 身份/UID/历史/Wine；恢复后实例停止、任务配置保留但禁用，用户自行启动。Windows 与原约定排除的 Pro 实镜像不算已支持验证。
5. 验证实际 K8s Job、快照与安装支持的 CSI/PVC、NFS、HostPath 等存储组合，核对对象/文件/数据库一致性及权限；接 A/C 原签名、成品/finalizer/catalog 和权威终态，明确失败、重放、重复提交及结果不明路径。
6. 分别出具安装冒烟结果、用户/实例数据恢复结果、公共整链结果与现场清理记录。任何一项未跑或缺输入，都按未验证记录，不用“已 push”或其它局部测试代替。
