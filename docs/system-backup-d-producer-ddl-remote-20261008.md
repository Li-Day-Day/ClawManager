# D producer 候选 DDL：隔离 MySQL 验收通过

日期：2026-10-08。操作者回传的 MySQL 8.4.8 候选 DDL 验证已通过 **27/27 项**，退出码 0，namespace 和两端传输目录均报告清理完成。DDL/探针指纹与当前源码一致，全部预期检查名称逐项匹配；本固定输入无需重跑。依据为[完整控制台原文](evidence/system-backup-d-producer-ddl-console-20261008.txt)及[结构化回执](evidence/system-backup-d-producer-ddl-mysql-20261008.json)，代理未独立连接远端复查。后续推进真实数据库服务联调及正式迁移评审；需要新的远程测试时仍按用户要求暂停目标并提供完整命令。

## 范围

[PowerShell 入口](../scripts/system-backup-d-producer-ddl-remote.ps1)将准确字节和 SHA-256 绑定的候选 SQL、[Python 探针](../scripts/system-backup-d-producer-ddl-probe.py)传到远端专属目录。探针创建独有 namespace 和单个临时 MySQL Pod，数据库为 `producer_validation`，数据只在 emptyDir 内。已有业务 namespace、数据库、配置、migration ledger 和正式报告 PVC 均不作为写入目标。

固定目标沿用既有隔离测试环境：`root@10.130.14.23`、context `kubernetes-admin@kubernetes`、节点 `node1`。MySQL 镜像固定为 `10.130.14.23:5000/mysql@sha256:5ea882b1859d3a61814e527215563d809a9f2bf70ffa24c9280f2ff6798f1977`，要求 MySQL 8.4。使用 `imagePullPolicy: Never`，只使用节点已缓存镜像；缺少镜像或工具即失败，不安装依赖或自动拉取。临时 MySQL 仅绑定 Pod 内 `127.0.0.1`，没有 Service、hostNetwork 或挂载业务卷；测试 root 空密码仅用于该独立 loopback 实例。

本轮执行 27 项检查，包括环境前置、八表/四个 FK/全部 CHECK、重复键、记录大小与非空、grant/run/history FK、观察时间成对约束、结果版本唯一性、引用主键、限制删除、事务回滚、grant 主键执行计划，以及实际双连接行锁和缺失收据键 gap lock。锁持有者确认取得锁后，竞争者必须返回 MySQL 1205；释放缺席范围锁后插入应成功。其他命令失败不能冒充预期约束拒绝。原准备文档/回执的“26 项”为计数笔误；探针未修改，历史准备回执保留原字节。

这里的 record bytes 是专门用于物理 DDL 检查的 synthetic 最小载荷，不代表合法 C1 canonical record、A evidence 或生产授权。没有运行完整 producer 服务、真实鉴权/provider、GC、V01–V10，不能据此关闭完整运行验收或将候选 SQL 放入正式 migration。

## 完整命令

以下保留复现命令，本固定输入已通过，无需再次执行。需要复现时在本机 PowerShell 中执行整段。SSH 密码仅在终端提示中输入；不要写入脚本或回传内容。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$ErrorActionPreference = 'Stop'
$producerDdlLog = Join-Path $PWD ('docs\evidence\system-backup-d-producer-ddl-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -Path $producerDdlLog -NoClobber
try {
    .\scripts\system-backup-d-producer-ddl-remote.ps1 -CheckOnly
    .\scripts\system-backup-d-producer-ddl-remote.ps1 `
        -SshTarget 'root@10.130.14.23' `
        -KubeContext 'kubernetes-admin@kubernetes' `
        -TestNode 'node1'
} finally {
    Stop-Transcript
    Write-Host "结果日志：$producerDdlLog"
}
```

需要现有 Windows OpenSSH；远端需现有 Python 3、kubectl、sha256sum/cmp，且指定 Kubernetes context 能创建和清理测试 namespace。首次未知或变更的 SSH 主机密钥按现有 StrictHostKeyChecking 策略拒绝，不自动放行。

## 回传与清理

请回传完整日志，至少保留以下输出：

- `D_PRODUCER_DDL_PLAN`：本轮 DDL/探针 SHA、目标与 Never 拉取策略。
- `D_PRODUCER_DDL_STARTED`：独有 namespace、UID 和 owner，供异常时准确定位。
- `D_PRODUCER_DDL_RESULT`：全部检查、MySQL 版本、锁等待与执行计划；只有 status=PASS、cleanup=true 才通过。
- `D_PRODUCER_DDL_EXIT=0` 和 `CLEANED producer-ddl-local=True remote-transfer=True`。

探针 finally 核验 namespace 名称、owner、标签及已知 UID 后清理整个本轮 namespace，确认其消失才报告 cleanup=true；wrapper 清理独有两端传输目录。若连接中断或任一清理未确认，保留原始输出中的名称/UID/owner，先回传核对，不能用通配符清理其他任务资源。最终日志和源码指纹属于交付证据，继续保留。

## 当前验证状态

远程 run `sbk-prod-ddl-53df88906278bd6cb5f408cf`，UID `6e8e62df-9dab-45b5-bcb2-2ae49d990ef5`，完成于 `2026-10-08T02:26:07.717244+00:00`。27 项全部 PASS；已有行锁等待 1.241 秒、缺失收据 gap lock 等待 1.215 秒，grant 执行计划使用完整主键 `PRIMARY(scope_key, grant_id)`、访问类型 `const`、扫描 1 行。回执确认 cleanup=true、wrapper 退出 0、两端传输目录 CLEANED；SSH 的 pending socket 关闭提示未影响本轮成功及清理，无需因此重跑。

Windows PowerShell 5.1 的原 [transcript](evidence/system-backup-d-producer-ddl-remote-20261008-102446.log)未收全原生 SSH 输出，只作为 wrapper 退出/清理的旁证；完整结果以操作者粘贴原文为准。入口现将原生命令两个输出流转入 host 供 transcript 捕获，并保留退出码；PowerShell 7 和 Windows PowerShell 5.1 本地验证均确认两个流及退出 7/0 正确。初次 PS5.1 测试夹具的 node 内联引号被剥离，改为临时 JS 文件后通过；临时文件均清理。此日志修正尚未远程重跑，不扩张本轮 DDL/探针验收范围。

准备阶段的 8 个 Python 安全检查通过，覆盖候选字节指纹、附加非建表 SQL 拒绝、清理身份变化时拒绝删除、删除后存在性确认，以及 MySQL 预期错误码不能由任意进程失败代替；Python `--check` 与 PowerShell parser/`-CheckOnly` 通过。

首次本地测试用 TemporaryDirectory 创建目录后遇到 Windows 权限拒绝，未完成该项断言；后改用内存文件输入检查，8 项重新通过。首次临时目录已按固定工作区路径验证并清理；没有安装依赖、没有保留 pycache 或构建文件。准确指纹见 [准备记录](evidence/system-backup-d-producer-ddl-remote-ready-20261008.json)。
