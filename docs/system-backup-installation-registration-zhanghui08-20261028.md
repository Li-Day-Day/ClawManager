# 系统备份首次安装身份登记

状态：**owner 授权首次分配；待部署材料与独立授权绑定**。本登记不表示 bootstrap 已执行或备份已启用。

- Installation ID：`installation_dfa02579009349938c8125490d9dfd41`
- 分配日期：2026-10-28；以随机 UUID 生成，与 Kubernetes UID 无派生关系。此 ID 是本次为该环境分配的稳定身份，不是从旧记录恢复的身份。
- Owner 事实依据：owner 在本会话确认此环境从未为备份分配 installation ID，并授权建立首次登记。现有证据不能独立证明全部历史。
- Kubernetes context：`kubernetes-admin@kubernetes`
- Namespace：`clawmanager-zhanghui08-system`；UID：`337cfe30-2c17-4b8e-b32a-760778b8098e`
- MySQL Service：`mysql.clawmanager-zhanghui08-system.svc:3306`
- Database：`clawmanager`；server UUID：`f1f5f76a-95f5-11f1-b08e-366835b4a029`
- 数据库观察依据：D 报告以独立非 root 临时账号和 `VERIFY_IDENTITY` 核对 server UUID、database 和安装状态表行数 0；账号及探测资源已删除。此处记录用户转述，原始回执待归档核验。

此登记表达 owner 的首次身份分配及目标绑定意图；不能单独构成可执行的 offline grant、资源授权或 production link。不得从它自行签发 grant、创建配置或直接写数据库。后续部署文件、原独立 authority、grant、RBAC、registries 和 read pins 须以此 ID 及数据库身份为共同绑定，并按各自合同独立审定。若发现已有备份或冲突身份，停止并由 owner 决定处理方式，不覆盖旧记录。

受审二进制路径与摘要、部署文件、材料、原始回执、B/C 合同及签收均待交付；在前置条件齐备前不执行 `--apply`。
