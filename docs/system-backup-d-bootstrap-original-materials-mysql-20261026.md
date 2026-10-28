# D bootstrap 原文件、nonce、CA 组合专项

本专项在 evidence 包组合真实 `ConfigBootstrapService`、D 消费事务、原文件 authority、nonce/CA candidate API 和容量 helper。新的完整配置及原材料摘要先于 producer Acquire 固定，再完成新的 manifest/publication/result 生命周期；不修改已提交的旧 dummy-hash 历史。

当前有 22 个待执行的隔离 MySQL 场景和 40 项通过的接收器检查（r4 日志）。GC `2775832f` 的准确冻结 `aeb5bd66…` / 1679 输入已执行本材料 seed，并成功构建 Linux tagged probe；原 nonce/两 CA 的 deadline 均准备成功，真实 loopback TLS 两次。D1 独立接收及 `--check` 通过，见 `evidence/d-bootstrap-original-materials-local-supplement-reviewed-20261026.json`；八个原生步骤均 exit 0，冻结后检通过，运行 owner 和 staging owner 均已删除并独立核对缺席。该补证仅将 `19b1c831…` 原材料 tagged 文件叠加到旧 A/D 依赖，不能记作当前新增 beforeDDL/entry 的验证，也没有执行独立 wrapper 全套或迁移 runner 新构建。真实 22 项 SQL 仍为零。

第一次本地 native 准备 `3ff8211f` 在编译时遇到 GC 测试的未使用导入，尚未执行 seed；失败及清理保留在 `evidence/d-bootstrap-original-materials-local-rejected-20261026-3ff8211f.json`，不改判。新入口的当前来源将统一执行消费、范围、入口与材料四根 seed、当前联合包及 Linux 构建，仍待其准确回执。

22 项覆盖首次提交、提交确认丢失、原 grant/RBAC 撤销与字节变化、历史读取时非授权资源缺失、新消费时材料缺失、Work-end nonce/CA/registry 原文件变化、真实保留 nonce 行的已知/未知/晚变版本，以及原资源期限耗尽。每个实际用例要求正式 96 份迁移、完整规范 A 表、启用 FK、真实 nonce/CA 文件 API、实际 loopback TLS、容量 SQL/ledger 和 owned DB 清理。负例比较事务前后全表快照；成功只能产生一次 73728 charge、disabled-v1 配置及关闭的 epoch，精确重试不得再写。

TLS 计数有明确范围：每次 attempt 都在 BEGIN 前真实调用 nonce 和两 CA 的 `PrepareCandidateAttempt`，不作额外无锁历史提示。正常历史重试会在锁前新增两次 TLS；缺失其中 CA 材料时只新增一次；grant/RBAC 在准备前拒绝时为零。物理准备失败返回的 closed 对象不会抢先否定合法历史，只有新消费要求成功材料。真正授权始终是锁内 L3 exact history，历史分支不得重复执行 producer、刷新原 receipt 观察或收费。Work-end 相对原准备计数禁止重拨，最终固定 guard 后禁止文件、资源 callback 或网络。

原 nonce 是 owned 随机 32 字节，读后由原 API 擦除；CA 使用 owned 合成证书和 loopback TLS，无 HTTP 请求。当前 grant、RBAC 与非 RBAC 文件确实按原始 exact SHA 读取，但 deployment/purpose/provider mapping、其他 registry 内容和物理容量报告仍是明确合成夹具。它不证明生产授权、provider 权限、物理 I/O/容量、MFA 或正式部署装配，也不覆盖 BM1–BM10 的所有反例。

本地准备入口默认不远测、不安装依赖，准确删除本次源码副本、缓存与二进制，保留来源和日志：

```powershell
pwsh -NoProfile -File .\scripts\system-backup-d-bootstrap-original-materials-mysql-validation.ps1
```

待本地准备通过及 A/D 新来源联合复核完成，操作者单独执行：

```powershell
$operatorLog = '.\docs\evidence\d-bootstrap-original-materials-operator-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'
& pwsh -NoProfile -File .\scripts\system-backup-d-bootstrap-original-materials-mysql-validation.ps1 -Remote 2>&1 | Tee-Object -FilePath $operatorLog
$originalMaterialsExit = $LASTEXITCODE
"bootstrap_original_materials_exit=$originalMaterialsExit" | Tee-Object -FilePath $operatorLog -Append
```

独立接收器是 `docs/evidence/d-bootstrap-original-materials-mysql-review-20261026.mjs`，参数依次为本次包装器结果 JSON、操作者日志和要新建的 `docs/evidence` 接收文件。它不联网，核对准确来源、三根 seed、Linux 构建、22 个实际场景、真实 TLS/文件变化/容量标记、原生退出 0、namespace UID 与清理。接收器正例是合成日志 fixture；40 项通过不能替代实际 22 项 SQL。原 wrapper 的预接收 false 保持原样。
