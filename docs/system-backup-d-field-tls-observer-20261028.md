# D 现场 TLS 与 observer 准备（2026-10-28）

本记录依据用户提供的命令输出，供现场交接；不是自动采集或独立签收。目标为测试环境，不代表真实备份已启用。

## 已观察事实

- namespace `clawmanager-zhanghui08-system` UID `337cfe30-2c17-4b8e-b32a-760778b8098e`。应用仍使用 `backup-test-zh-fix18`，原镜像 digest `sha256:c16f07c25c6dc8362aa09b7a1e81f5d1204f2812ae542bbcb21a3946975c6c9d`。
- MySQL server UUID `f1f5f76a-95f5-11f1-b08e-366835b4a029`，数据库 `clawmanager`。独立临时非 root 账号通过 `VERIFY_IDENTITY` 查询确认身份，安装状态表行数为 0、角色 NONE，仅拥有该表 SELECT。账号和其临时 CA 文件已删除；空表不证明没有历史安装登记。
- MySQL Deployment UID `27916932-fc61-432c-b515-081f18db34a8` 已更新至测试 TLS，rollout 成功，新 Pod `mysql-74bd777b8-j85z7` UID `6d314752-86e1-41ce-9831-af03179dcf3b`。重建后 UID 必须重新获取。应用与 MySQL 当时均 1/1。
- 测试 CA SHA-256 指纹 `3FFBE72AC1B0C14CF7BEA27364B3B840738652205143E2067CF046C5C707E32F`，服务器证书到期 2027-01-26 03:59:24 UTC，SAN 含 `mysql.clawmanager-zhanghui08-system.svc`、完整 cluster.local 和 `mysql`。root 通过服务名 `VERIFY_IDENTITY` 连接，协商 `TLS_AES_128_GCM_SHA256`；这不是独立 observer 验收。
- CA 与私钥的现场受控目录 `/root/system-backup-test-tls.8najDckN`；不要输出或分发私钥。Secret `system-backup-test-mysql-tls-20261028` UID `a02df05b-7ae7-4280-b6c6-aacc4e933082` 只包含 CA 证书、服务器证书和服务器私钥，不包含 CA 私钥。Deployment 使用 init 容器复制到独立临时卷，私钥 owner 999:999、mode 0600；保留原数据卷证书，策略改为 Recreate，可能产生中断。
- 当前会话中五个被观察的连接显示明文；仅为当时快照，不证明客户端不会在其他时间使用 TLS 或校验原 CA。`require_secure_transport=OFF`，不可视为全局强制 TLS。
- 探测 Pod UID `0b2317ae-021e-4b0d-bf47-0c77021814db` 实测 MySQL 来源 `10.244.235.224`；专用锁定账号的六张 SELECT grants 和 REQUIRE SSL 已验证。该 Pod 与账号均已删除，不能复用其 IP 作为未来生产 pin。`skip_name_resolve=ON`。

## 后续执行

1. 部署 owner 与 A 交付可信 installation ID、原登记和数据库绑定证据，以及受审 bootstrap 和真实材料；未齐前不执行 apply 或写安装状态表。
2. A/B/C/D 完成生产 API 和执行 owner link、后台授权、B runner 与 C artifact 等真实适配。换镜像不能补足空 link。
3. 选定真实 observer 执行位置，重新验证 MySQL 看到的源地址，配置独立 SQL 用户与精确六表 SELECT、受控 DSN、server UUID/database/installation pins 和 `SBK_OBSERVER_CA_FILE`。短命 Pod 地址必须在失效时撤销对应账号；不要沿用本轮地址。
4. 新代码构建、部署和准入完成后，依次跑成功轮、同键重试、权限/跨安装拒绝和约定失败轮；联合独立 SQL receipts、attempt、终态及 checksum 核对。模型测试不能代替现场结果。
5. 测试证书与 CA 应在到期前轮换，并确认所有客户端的信任配置。若需回退 MySQL Deployment，先核对当前 revision、所有客户端与数据卷状态，再评估 `rollout undo`；回退会重建单副本 MySQL，可能中断连接，且不自动清理 Secret 或 CA 私钥。

## 新 observer 查询的现场只读预检

`scripts/system-backup-d-observer-sql-preflight.sh` 校验 namespace/Pod UID、数据库 UUID/name 后，以现有 Pod 内 DBA 身份和只读事务执行与 observer 相同的最新 capture 查询。使用固定探针 task ID，**只验证现场 MySQL 能解析并访问该查询，不验证真实任务、observer 账号权限或备份结果**。预检完成后确认原 Pod UID；若 UID 或数据库身份变化立即停止。实际现场观察和退出码需单独记录，不可用 Node 模型测试替代。

```powershell
Get-Content -Raw .\scripts\system-backup-d-observer-sql-preflight.sh |
  ssh root@10.130.14.23 'export KUBE_CONTEXT=kubernetes-admin@kubernetes SOURCE_NAMESPACE=clawmanager-zhanghui08-system SBK_EXPECTED_NAMESPACE_UID=337cfe30-2c17-4b8e-b32a-760778b8098e SBK_MYSQL_POD=mysql-74bd777b8-j85z7 SBK_EXPECTED_MYSQL_POD_UID=6d314752-86e1-41ce-9831-af03179dcf3b SBK_EXPECTED_SERVER_UUID=f1f5f76a-95f5-11f1-b08e-366835b4a029 SBK_EXPECTED_DATABASE=clawmanager SBK_OBSERVER_INSTALLATION_ID=installation_dfa02579009349938c8125490d9dfd41; tr -d ''\r'' | bash -s'
$LASTEXITCODE
```

本地 `system-backup-d-observer-sql-preflight.test.mjs` 机械对照预检 SQL 与 observer 查询谓词；它不运行 Bash 或数据库。现场运行应看到 `READ_ONLY_SCHEMA_PROBE_ONLY_NOT_ACCEPTANCE` 和退出码 0；探针结果不应记为真实成功轮。

操作者随后报告现场执行退出码 0，返回 `latest_capture_jobs=0`、`completed_relays=0` 和上述 marker；kubectl 两次选择 mysql 主容器并提示存在 init 容器。此为固定探针上的真实 SQL 语法/表访问结果，不能证明新 observer 独立账号 grants、真实任务或任意 Job 的运行；本记录转述操作者输出，未独立存储原始回执。

该次现场执行后，预检新增了 `installation_key_count` 的同安装同接口同键查询，用于验证负权限请求是否留下其他 actor 的同键任务。**该新增查询尚未现场执行**；重新运行上述命令可同时验证它的现场 SQL 兼容性，依旧不是 observer 权限或真实链验收。
