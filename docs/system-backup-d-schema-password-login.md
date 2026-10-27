# D live schema-hash：Windows 密码登录补充步骤

最新状态：2026-09-23T05:47:48Z 采集已成功，退出0，95个对象完整匹配。候选文件与下一步 owner 签收见 [D schema-hash 交接](system-backup-d-schema-hash-handoff-2026-09-23.md)。下方步骤保留作复测 runbook，本版本无需重复执行。

2026-09-23：操作者回传 `No ED25519 host key is known ... strict checking`，并确认使用密码登录。此前未生成 candidate，不能登记为 schema 验证通过。原 D→A 评审快照保留为历史记录；本次仅修订 D 的 SSH transport，不修改 A/B/C 实现或合同。

## 1. 首次主机身份确认

在已经可信登录的服务器终端或服务器管理控制台查看 ED25519 指纹：

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

在 Windows 普通 PowerShell 执行：

```powershell
ssh.exe -o StrictHostKeyChecking=ask -o HostKeyAlgorithms=ssh-ed25519 root@10.130.14.23 exit
```

将提示中的 SHA256 指纹与服务器端结果核对；一致才输入 `yes`，然后在 SSH 的 password 提示中输入密码。密码输入不回显。成功后会自动退出远程连接，本机 known_hosts 留存经核对的主机公钥。指纹不一致时停止，不删除已有记录或关闭检查。

## 2. 密码模式采集

在本机 PowerShell 整块执行，避免将 `if` 拼成 Node 参数：

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    Get-Command node.exe, ssh.exe -ErrorAction Stop | Out-Null
    node scripts/system-backup-schema-inventory.mjs --check
    if ($LASTEXITCODE -ne 0) { throw 'inventory 检查失败，停止' }
    node scripts/system-backup-contract-check.mjs --check
    if ($LASTEXITCODE -ne 0) { throw '合同快照检查失败，停止' }
    node scripts/system-backup-schema-hash-ssh.mjs --ssh-host 'root@10.130.14.23' --kubectl-context 'kubernetes-admin@kubernetes' --namespace 'clawmanager-zhanghui08-system' --database 'clawmanager' --ssh-password
    "schema_capture_exit=$LASTEXITCODE"
}
```

采集前 namespace UID、只读 SQL、采集后 namespace UID 各建立一次 SSH 连接，通常提示三次密码。每次连接最多一次密码提示、总执行预算120秒；密码输错/超时则失败，重新运行即可。Node 不接收、存储或通过参数/环境传递 SSH 密码；密码由 OpenSSH 控制台读取。不要把密码填进 `Read-Host`、命令行或聊天输出。

`--ssh-password` 仅开启交互认证，仍使用 `StrictHostKeyChecking=yes`。SSH 的本地认证诊断可显示在终端，远程 kubectl/mysql stderr 在远程被抑制；SQL 和结构记录保持独立管道。远程无需 Node，也不创建临时文件或集群资源；本机原始记录返回前删除。

请回传完整脱敏 candidate JSON 和 `schema_capture_exit`，不要回传密码或原始 TSV。退出0是采集及对象名覆盖通过，2是对象集合有差异，1是失败。Candidate 尚须结构预期比较、evidence 登记和 A/B/C 交叉评审，不能直接打开 freeze gate。此步骤不证明现有 MySQL 账号为 SELECT-only。

## 3. 本地验证与暂停状态

- `node scripts/system-backup-schema-hash-ssh.test.mjs`：7/7，通过免交互/密码模式、严格主机检查、stdin SQL、stderr 隔离、namespace 更换与失败拒绝、临时记录清理。
- `node scripts/system-backup-schema-hash-capture.test.mjs`：4/4。
- 上述测试为本地 fake transport 测试；后续操作者已完成真实 Windows OpenSSH 密码交互及远程查询，结果见顶部交接链接。未安装依赖、未生成构建产物。
- 本轮远程输出已接收，candidate 仍待 A/B/C 签收和 evidence 登记，未完成合同冻结。
