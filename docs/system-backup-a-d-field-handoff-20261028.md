# A → D：现场初始化前置条件交接（2026-10-28）

状态：**阻塞，禁止初始化**。本记录汇总用户转述的现场结果和仓库历史证据；它不是现场签收或授权，也不包含凭据。

## 已观察与边界

- D 报告 context 为 `kubernetes-admin@kubernetes`，namespace `clawmanager-zhanghui08-system` UID 为 `337cfe30-2c17-4b8e-b32a-760778b8098e`；应用镜像标签为 `10.130.14.23:5000/clawmanager:backup-test-zh-fix18`。
- D 报告原 MySQL Pod UID `dab1cbf6-ca49-4e16-bd2d-27e70da52004` 和应用 Pod UID `aabba383-5db9-48a7-a3b7-2b92624c2f3a` 与原盘点一致。随后 [D 的 TLS 记录](system-backup-d-field-tls-observer-20261028.md)报告 MySQL Deployment 更新并重建，新 Pod UID 为 `6d314752-86e1-41ce-9831-af03179dcf3b`；该值是历史观察，下一次操作前须重新获取并核对，不能复用旧 Pod UID。
- D 后续报告：独立非 root 临时账号通过 `VERIFY_IDENTITY` 连接，确认 server UUID `f1f5f76a-95f5-11f1-b08e-366835b4a029`、database `clawmanager`，安装状态表计数 0；该账号仅有该表 SELECT、active role 为 NONE，核验后已删除。observer 探测账号及临时 Pod 也已删除。MySQL 测试 TLS 已完成真实主机名验证，应用和 MySQL 均为 1/1。以上为用户转述的 D 结果，本记录未独立检查原始回执。
- [10 月 21 日历史状态回执](evidence/a-live-chain-state-review-20261021.json)记录当时安装和配置各 0 行，属于操作者历史回执，不证明更早历史。空表不能证明从未初始化或推导安装身份。

## 本次为联调准备的候选材料

- owner 已分配 `installation_dfa02579009349938c8125490d9dfd41`，与上列数据库的绑定意图见[登记](system-backup-installation-registration-zhanghui08-20261028.md)。
- 测试 Bao 与 MinIO 已恢复，操作者分别报告服务名 TLS 验证通过；两个服务、证书和存储均属于同集群 lab，不是生产灾备资源。实际 Pod、CA 文件 SHA、证书期限、密钥与 Secret UID 等见[现场材料记录](system-backup-site-provider-choice-20261028.md)。原旧 MinIO bucket 未启用版本控制；尚无本安装专用的受限存储身份和正式存储准入。
- 新安装候选 Transit 两把 KEK 和三把用途隔离的签名 key 为不可导出 version 1；三把公钥在[签名候选记录](evidence/a-site-signing-key-candidates-20261028.json)。Secret `system-backup-nonce-dfa02579-v1` 已创建，UID 和长度见材料记录；已有 nonce validator 需要 external_secret 文件 profile 的可信映射，不能将 Secret UID 自动转换为受审 descriptor。
- 上述为操作者转述与候选材料，不是实际工作身份、adapter、可信 original authority、C1 selections、bootstrap 授权或签收。CA 将于 2026-11-27 到期；现场使用前重核当前引用、期限、TLS 和权限，不暴露密钥。
- 连接门槛：原 [provider lab 创建脚本](../scripts/system-backup-d-provider-lab.py)为 lab 创建只允许 namespace 内入站的 `lab-isolation` NetworkPolicy；本次未验证该策略是否仍存在或由 CNI 执行。Bao→MinIO 的同 namespace TLS 成功不证明 `clawmanager-zhanghui08-system` 的实际工作 Pod 能访问 lab。D 在选定实际工作 Pod/ServiceAccount 与可信用途后，须核对现存策略，并从该真实工作身份做带 CA/主机名验证的连通测试；需要放通时按最小来源、目标和端口审定，不能直接关闭隔离。
- C/Team 本地远端引用 `origin/codex/backup-team-integration` 当前为 `288d74a92c37c6432ebb3dcdd6fd7c2afd837675`。其 README 自述是未发布的 Team 集成工作台，默认选择 legacy，v2 task writer、完整详情和 capture runner 未完成装配；其 versioned schema 与独立导入路径不能直接替换本现场数据库。D 正在评估可复用实现；此处只记录本地引用及项目自述，不代表远端实时 HEAD 或交叉签收。
- D 当前源码已把 `NewTaskRequestContract()` 接到 server writer，闭集请求解码不再是外部 owner 空槽；具体测试回执见 [D 接线记录](system-backup-d-first-chain-20261028.md)。这不关闭尚未绑定的 `Admission`、`CurrentFacts`、`Manifest`、执行 WorkStore/Ports 或 A 的原始 authority，也不表示现场镜像已部署或真实任务通过。

## 必须由原 owner 补交

1. Owner 确认此前未分配备份 installation ID，并授权首次登记；新分配的 ID 及数据库绑定意图见[首次安装身份登记](system-backup-installation-registration-zhanghui08-20261028.md)。原始只读回执、部署版本和独立授权绑定仍待核验；禁止从 namespace/Pod UID 或请求推导身份。
2. DBA/部署 owner：D 的临时只读账号已删除；后续若需重复查询，须另行提供受控连接引用和权限证据，不交付凭据内容。现有[公共引用记录](evidence/a-field-observed-references-20261022.json)的连接项为 null。DSN 文件接入字段及角色变量见[现场采集交接](system-backup-a-field-evidence-handoff-20261021.md)，变量名是方案而非现场凭据证明。
3. 部署 owner：受审 bootstrap 二进制绝对路径、字节 SHA-256、构建来源、镜像 digest、production link 和签收；目前均待确认。不得将本地已清理的测试构建或 fix18 标签视为受审二进制。
4. A/B/C/D 各 owner：部署文件、canonical config、离线 grant、九份 registry 的原正文/版本/原字节 pins，二十用途资源的 provider/root/scope/身份/权限/准确版本及原授权、有效期和撤销，全部 retained nonce/KEK/signing 引用，独立 artifact/evidence CA，容量报告和受控挂载；逐项提供来源、版本、签收与现场回执，不输出秘密。准确缺项与责任见[A 首条备份交接](system-backup-a-first-chain-20261028.md)。
5. B/C 和 D：交付并交叉签收真实 owner adapters、writer/relay 与 provider/catalog 合同、C1 精确 selections；A 及部署 owner 提供独立原 authority 和跨资源检查，部署专属 production link 完成组合。当前没有证据证明这些现场前提齐备。

## D 的只读判定

固定上述 context、namespace UID 和实际当前 Pod UID；身份变化即停止并重新固定。D 已报告一次独立只读连接通过并清理；需要重新查询时，使用新的受控独立连接查询 `SELECT @@server_uuid, DATABASE();`、`SELECT COUNT(*) FROM system_backup_installation_state;`；只在 UUID/database 精确匹配后解释结果，并核对该账号实际权限。账号、连接、权限或查询失败均为未验收，不回显凭据。

收到受审二进制后，由部署 owner 独立提供预期摘要；在受控主机对其运行 `sha256sum /受控路径/system-backup-bootstrap` 并比较，再运行该二进制的 `--requirements`。只有 `adapters_linked` 和退出 0 表示结构项齐；它不证明真实材料、授权、TLS 或 SQL 已准入。实际路径和摘要未交付前不得运行假定路径。

全部原始身份、材料、真实实现、授权、准入和签收齐备后，按照[入口源码](../backend/cmd/system-backup-bootstrap/main.go)先用受审部署文件及独立审核的 SHA 执行 `--check --deployment-file <受控绝对路径> --deployment-sha256 <原文件SHA256>`。其成功仅代表输入检查。正式初始化须经过原离线流程；禁止直接插入状态行。若出现 `commit_unknown`，保留原目标与幂等键按原规则查回或精确重试。

初始化成功仅创建 disabled v1；之后以独立只读身份重新核对 DB 身份、状态行、可信 ID、配置版本及受审 pins。不能将状态行存在等同于备份启用或端到端验收。
