# A 远程 K8s 能力验证手册（2026-09-23）

**2026-09-24 更新：** D 已交付实际 OpenBao/MinIO 隔离环境。[A 环境接收核验](system-backup-a-provider-handoff-receipt-20260924.md)、Evidence 限定范围测试及 KMS/signing 限定范围测试均已由操作者执行通过。D 生命周期与轮换交付已由 A [限定范围签收](system-backup-a-lifecycle-acceptance-20260924.md)，当前下一步为 provider-proof/evidence adapter 与正式登记接入；保留测试环境，无需重复成功 run。下文第 3/4 节占位示例及早期“下一步”叙述保留为历史参考，不使用 AWS 占位命令或业务 MinIO；完整 capability 和正式 evidence 登记仍未通过。

本手册用于 `clawmanager-zhanghui08-system` 测试安装。除特别说明外，在已具备 `kubernetes-admin@kubernetes` context 的 Linux 运维机上、从本仓库根目录执行。命令不安装依赖；仅在确知本次 run 创建的临时对象时清理。不得输出 Secret data、KMS 明文、token、私钥、原始 provider 响应或未脱敏日志。本机 Windows `kubectl config current-context` 当前为 `current-context is not set`，本机未直接执行远程测试；操作者已完成第 1 节只读 RBAC 复测。

## 0. 只读前置核对

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export KUBE_CONTEXT='kubernetes-admin@kubernetes'
export SOURCE_NAMESPACE='clawmanager-zhanghui08-system'
export EXPECTED_NAMESPACE_UID='337cfe30-2c17-4b8e-b32a-760778b8098e'
test "$(kubectl --context="$KUBE_CONTEXT" config current-context)" = "$KUBE_CONTEXT"
test "$(kubectl --context="$KUBE_CONTEXT" get namespace "$SOURCE_NAMESPACE" -o jsonpath='{.metadata.uid}')" = "$EXPECTED_NAMESPACE_UID"
kubectl --context="$KUBE_CONTEXT" -n "$SOURCE_NAMESPACE" get deploy clawmanager-app clawmanager-secret-broker \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,SA:.spec.template.spec.serviceAccountName'
kubectl --context="$KUBE_CONTEXT" -n "$SOURCE_NAMESPACE" get serviceaccount \
  clawmanager-app clawmanager-system-backup-secret-capture -o name
```

任何 context、namespace UID 或身份不匹配都停止，不要把命令改指向其他安装。瞬时 `etcd timeout` 只算未得出结论，重试只读命令即可。

## 0.1 安装身份与 active config 只读预检【已通过】

2026-09-23 08:24:54–08:24:55 UTC，操作者使用 Node 字节传输重跑成功，完整输出通过本地闭集验证，退出码 0。TLS 校验、当前主体和前后 namespace 身份核对通过；config_rows=0、active_installations=0，无临时产物。归档见 [成功预检记录](evidence/system-backup-a-identity-preflight-20260923T082454Z.json)，文件 SHA-256 为 `99cccc8bd6babb93617ba1a6188bdf0c111152ffcdfdcd575eb65e475cfe161b`。08:11 的退出 127 记录保留为失败历史。

当前无需重复运行下方命令，保留作后续复测。下一步先取得第 3 节列出的平台 provider 测试输入，再制定对应的完整远程能力命令。D-A-01～06 本地修正见 [返工交付](system-backup-a-contract-revision-2026-09-23.md)；独立复审与真实 provider 能力仍未完成。

**运行位置：本机普通 PowerShell，目标为 `root@10.130.14.23`，使用密码交互认证。** 远程需要现有 Bash、kubectl、sha256sum 和 deploy/mysql 中已有的 mysql 客户端；不安装依赖，不上传文件、不建 Job，不修改配置或 RBAC，不重复采集 schema。SSH 必须已有可用认证与 known_hosts。脚本验证 TLS/context、SelfSubjectReview 返回的当前主体、前后 namespace UID，并查询两个 active-config 计数。输出只包含时间、hash、计数和布尔值。

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    Get-Command node.exe, ssh.exe -ErrorAction Stop | Out-Null

    node scripts/system-backup-schema-candidate-receipt.mjs --candidate docs/evidence/system-backup-d-schema-hash-candidate-20260923T054748Z.json --sha256 b6b39e4ccb8c94b76e3316ef6674532153f406fa665fa150c7f7aa13b3aa8779
    if ($LASTEXITCODE -ne 0) { throw 'Candidate 文件或当前仓库绑定不一致，停止' }

    node scripts/system-backup-a-identity-ssh.mjs --ssh-host 'root@10.130.14.23' --ssh-password
    $aRemoteExit = $LASTEXITCODE
    "a_remote_preflight_exit=$aRemoteExit"
    if ($aRemoteExit -ne 0) { throw '远程预检未通过，请回传输出；不要改权限或换安装绕过检查' }
}
```

2026-09-23 08:11 UTC 操作者回传了完整 PASS 输出，但随后 Bash 报尾部回车字符命令不存在，整次退出 127；详见 [该次未成功验收记录](evidence/system-backup-a-identity-preflight-20260923T081158Z.json)。检查输出支持当前安装 identity/TLS 和 config 计数均为 0 的观察，但非零退出不能登记为整次预检成功。

旧版 PowerShell 字符串管道已停用：即便内容替换为 LF，管道仍可能附加 CRLF。现在本机 Node 对脚本解码后统一 LF，直接把 Buffer 写入 SSH stdin，不经 PowerShell 文本管道、不创建临时文件。Transport 同时校验 SSH/远程退出码为 0 与完整闭集输出；打印 PASS 但退出非零、超时或缺字段均拒绝。`IO is still pending` 提示本身不作为成功依据。

密码由 OpenSSH 控制台直接读取，输入不回显；不要把密码填进命令、变量或聊天。此前 `BatchMode=yes` 禁止密码交互，与本安装已确认的密码登录方式不符；本版已修正。地址中的 `@` 前不加反斜杠。若本版在输入正确密码后仍报认证失败，请先用 `ssh.exe -o StrictHostKeyChecking=yes root@10.130.14.23` 检查普通交互登录，不自动修改服务端 SSH 配置。

此次已收到 `PASS: A current-context identity and active-config read-only preflight` 和 `a_remote_preflight_exit=0`。后续若确需复测，仍须完整脱敏输出且退出 0；不要回传 kubeconfig、密码、Secret data 或 token。SelfSubjectReview 不可用时先回传失败，不自动授予权限。

即使成功，也只证明当前认证访问与 namespace identity；输出固定 `historical_candidate_authenticated=false`、`evidence_registered=false`，不能据此批准历史 candidate。若仍为 `config_rows=0/active_installations=0`，依赖 active config 的集成测试继续阻塞；独立 spike 仍可进行，但先需平台提供第 3 节列出的 provider 类型、版本化 ref、task-scoped 身份、专用测试资源和现有工具信息，不能猜测 AWS/MinIO 或使用业务 bucket。

## 1. Secret collector RBAC 与去权终态【已完成】只读复测

2026-09-23 的正式 cutover evidence 已记录 collector 精确读、未登记 Secret 拒绝、list/watch/write 拒绝，以及 app Secret 拒绝。下面仅复测，不 `apply` manifest、不读取 Secret data、不删 binding：

【已完成】修正只读脚本对 `kubectl auth can-i` 拒绝结果的处理：输出精确为 `no` 且退出码为 1 是预期拒绝；其他错误仍失败关闭。此前在未登记 Secret 上报 `SubjectAccessReview failed` 的结果是脚本误判。操作者用修正版重跑后，21 项访问断言及最终检查均通过；脱敏记录见 [`system-backup-a-rbac-readonly-zhanghui08-20260923.txt`](evidence/system-backup-a-rbac-readonly-zhanghui08-20260923.txt)。

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
KUBE_CONTEXT='kubernetes-admin@kubernetes' \
SOURCE_NAMESPACE='clawmanager-zhanghui08-system' \
EXPECTED_NAMESPACE_UID='337cfe30-2c17-4b8e-b32a-760778b8098e' \
bash scripts/system-backup-a-rbac-readonly-probe.sh
```

脚本逐项输出 `PASS`，结尾出现 `PASS: A functional-test collector RBAC and app post-cutover denial` 才算通过。它还检查目标宽权限 binding 不存在、另一 namespace 的受保护 binding 保持原样。此证明只覆盖空的 functional-test Secret；业务 Secret bundle Job、业务 allowlist 和 UID/resourceVersion 漂移仍待单独验证。

## 2. Live schema hash candidate【已采集，待来源认证与登记签收】

操作者于 2026-09-23 05:47 UTC 完成采集，D 已归档 candidate，A 本轮核对其文件 SHA-256、SQL/inventory/migration catalog 绑定通过。见 [D 交接](system-backup-d-schema-hash-handoff-2026-09-23.md) 与 [A 安全审阅](system-backup-a-schema-candidate-review-2026-09-23.md)。

本轮安全模块与 fixture 修正没有改变 schema 绑定，当前不要重复运行旧的采集命令。Candidate 仍缺可信来源认证、真实 evidence 注册与 A/B/C 批准；`schema_hash_evidence_present` 保持 false。只有在 schema/SQL/inventory/migration catalog 改变，或确定需要重新进行受认证采集时，才重新判断是否采集。

## 3. KMS/KEK 与三类签名 key【待远程执行，依 provider 选择】

先只读发现 workload 和身份，不显示环境变量值：

```bash
set -euo pipefail
CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
kubectl --context="$CTX" -n "$NS" get deploy,job,serviceaccount \
  -o custom-columns='KIND:.kind,NAME:.metadata.name,SA:.spec.template.spec.serviceAccountName'
kubectl --context="$CTX" -n "$NS" get configmap \
  -o custom-columns='NAME:.metadata.name' 
```

【已完成】操作者的 `deploy,job,serviceaccount` 只读清单显示本 namespace 有 MinIO Deployment、独立 functional-test secret-capture ServiceAccount，但未列出 Secret 捕获 Job 或 KMS/签名 workload。见 [`system-backup-a-provider-inventory-zhanghui08-20260923.txt`](evidence/system-backup-a-provider-inventory-zhanghui08-20260923.txt)。外部 provider 可能不运行在本 namespace，清单不能证明它不存在。

下一步只读检查当前数据库是否存在 active system-backup config。查询只输出两个计数，不输出配置、身份 hash 或凭据：

```bash
set -euo pipefail
CTX='kubernetes-admin@kubernetes'
NS='clawmanager-zhanghui08-system'
test "$(kubectl --context="$CTX" get namespace "$NS" -o jsonpath='{.metadata.uid}')" = \
  '337cfe30-2c17-4b8e-b32a-760778b8098e'
QUERY='SELECT (SELECT COUNT(*) FROM system_backup_configs) AS config_rows, (SELECT COUNT(*) FROM system_backup_installation_state WHERE active_config_version IS NOT NULL) AS active_installations'
kubectl --context="$CTX" -n "$NS" exec deploy/mysql -- sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names --execute="$1"' \
  a-config-inventory "$QUERY"
```

【已完成】操作者返回 `0  0`：本安装没有 config 行或 active installation 行。脱敏记录见 [`system-backup-a-active-config-inventory-zhanghui08-20260923.txt`](evidence/system-backup-a-active-config-inventory-zhanghui08-20260923.txt)。这阻止在本安装执行依赖 active config 的系统备份集成测试，但不阻止 P0-0a 的独立 provider capability spike。下一步由 D/平台按下表提供测试输入，再按下节做能力探针。`scripts/system-backup-controller-enabled-fixture.mysql.sql` 明确只用于隔离测试，不能导入此 live 安装。

| 测试对象 | D/平台需提供的输入（仅标识、版本和权限范围） |
| --- | --- |
| KMS/KEK | KMS provider 类型、版本化 key ref、专用测试身份、该身份允许与拒绝的操作范围，以及已可用的 provider CLI。 |
| 三类签名 key | `capture_certificate`、`acceptance_record`、`catalog_record` 各自的版本化 key ref/version、测试身份及其用途权限范围。 |
| Evidence store | 专用测试 bucket/prefix、最小权限测试身份及其读/写/删除范围、TLS/CA 信息；同时标明 provider 类型与可用的测试工具或 adapter。 |

这些输入不得包含密钥值、私钥、访问凭据或 token。测试身份通过平台预配置的短期会话或别名使用；记录到仓库的结果只保留脱敏标识、版本、权限判定和证据摘要。任一必要输入缺失时，对应远程 capability spike 保持待执行，不用本 namespace 的业务 MinIO 或本地 fixture 代替。

若 provider 是 AWS KMS，且运维机已预装并配置 `aws` CLI 与专用短期测试身份，可按 A 步骤 8.6 执行 `GenerateDataKey` 正向探针。三类签名 key 先做不产生签名的 metadata 核对；把三个变量填为平台提供的**版本化 key ID/ARN**，不要用 Secret 值代替：

```bash
set -euo pipefail
command -v aws >/dev/null
export AWS_PAGER=''
AWS_REGION='REPLACE_WITH_REGION'
CAPTURE_KEY='REPLACE_WITH_CAPTURE_CERTIFICATE_KEY_ID'
ACCEPTANCE_KEY='REPLACE_WITH_ACCEPTANCE_RECORD_KEY_ID'
CATALOG_KEY='REPLACE_WITH_CATALOG_RECORD_KEY_ID'
test "$AWS_REGION" != REPLACE_WITH_REGION
test "$CAPTURE_KEY" != REPLACE_WITH_CAPTURE_CERTIFICATE_KEY_ID
test "$ACCEPTANCE_KEY" != REPLACE_WITH_ACCEPTANCE_RECORD_KEY_ID
test "$CATALOG_KEY" != REPLACE_WITH_CATALOG_RECORD_KEY_ID
aws sts get-caller-identity --query '{account:Account,arn:Arn}' --output json
KEY_IDS=()
for key in "$CAPTURE_KEY" "$ACCEPTANCE_KEY" "$CATALOG_KEY"; do
  KEY_IDS+=("$(aws kms describe-key --region "$AWS_REGION" --key-id "$key" --query 'KeyMetadata.KeyId' --output text)")
  aws kms describe-key --region "$AWS_REGION" --key-id "$key" \
    --query '{key_id:KeyMetadata.KeyId,key_usage:KeyMetadata.KeyUsage,state:KeyMetadata.KeyState,origin:KeyMetadata.Origin}' --output json
done
test "${KEY_IDS[0]}" != "${KEY_IDS[1]}"
test "${KEY_IDS[0]}" != "${KEY_IDS[2]}"
test "${KEY_IDS[1]}" != "${KEY_IDS[2]}"
echo 'PASS: three distinct KMS key IDs; verify SIGN_VERIFY and Enabled in metadata above'
```

判定需要三个**不同的实际 KeyId**，各自 `SIGN_VERIFY`，并由平台按 task-scoped identity 补充用途交叉拒绝、IAM/audit policy 差异、历史 key 验签与轮换证据。`describe-key` 本身不能证明这些权限。若不是 AWS KMS，平台需按 `capability-evidence.schema.json` 提供等价命令和脱敏结果；不得假造 AWS 结果。secret 型 KEK 的 `resourceVersion` 漂移和 AES-256-KW 需要实际 adapter/functional-test Job，当前仓库没有可安全执行的远程通用命令。

## 4. Evidence store【待远程执行，依 provider 选择】

现有 MinIO Deployment 不能直接当作系统备份 evidence store。仓库的 app `OBJECT_STORAGE_BUCKET` 默认是 `clawmanager-skills`，`OBJECT_STORAGE_BASE_PATH` 是 `skills`；不得向该业务 bucket 做本节探针。先确认 active system-backup config 及由平台指定的 evidence provider、专用测试 bucket/prefix 和最小权限身份。若确认该 provider 是 MinIO/S3，运维机已有 `mc` 和**仅限该测试 bucket/prefix**的 alias，且该 alias 的 TLS/CA 配置与平台提供的信息一致并启用证书校验，才执行写、读、删探针。不要输出 credential：

```bash
set -euo pipefail
command -v mc >/dev/null
MC_ALIAS='REPLACE_WITH_TEST_ALIAS'
EVIDENCE_BUCKET='REPLACE_WITH_TEST_BUCKET'
EVIDENCE_PREFIX='REPLACE_WITH_TEST_PREFIX'
test "$MC_ALIAS" != REPLACE_WITH_TEST_ALIAS
test "$EVIDENCE_BUCKET" != REPLACE_WITH_TEST_BUCKET
test "$EVIDENCE_PREFIX" != REPLACE_WITH_TEST_PREFIX
test -n "${EVIDENCE_PREFIX%/}"
RUN_ID="a-evidence-$(date -u +%Y%m%dT%H%M%SZ)"
KEY="${EVIDENCE_PREFIX%/}/${RUN_ID}/sev_probe_object"
PAYLOAD="/tmp/${RUN_ID}-payload"
REMOTE_OBJECT="${MC_ALIAS}/${EVIDENCE_BUCKET}/${KEY}"
CREATED=0
cleanup() {
  if [ "$CREATED" = 1 ]; then
    mc --quiet rm "$REMOTE_OBJECT" || echo 'INCOMPLETE: run-owned remote object cleanup failed' >&2
  fi
  rm -f -- "$PAYLOAD"
}
trap cleanup EXIT
printf 'system-backup-capability-probe:%s\n' "$RUN_ID" > "$PAYLOAD"
CREATED=1
mc --quiet cp "$PAYLOAD" "$REMOTE_OBJECT"
mc --quiet cat "$REMOTE_OBJECT" | cmp -s - "$PAYLOAD"
mc --quiet rm "$REMOTE_OBJECT"
CREATED=0
if mc --json stat "$REMOTE_OBJECT" >/dev/null 2>&1; then
  echo 'FAIL: run-owned evidence object remains' >&2
  exit 1
fi
cleanup
trap - EXIT
test ! -e "$PAYLOAD"
echo "PASS: evidence write/read/delete and run-owned cleanup; run_id=$RUN_ID"
```

此探针只覆盖基本读写删。Range、checksum、TLS/CA、大小上限、`write_unknown`、敏感下载二次鉴权和 provider-proof issuer，需要平台提供真实 evidence adapter/probe image 后再测。不要把测试对象路径推广到生产前缀。

## 5. P0-0b 事务与故障验证【待实现后远程执行】

当前 `systembackupsecurity.Verify` 只返回签名校验及 nonce-HMAC 候选，数据库 nonce 消费、redacted audit intent 和目标 mutation 尚未接成同一事务。此时运行 API 重放测试不能证明原子性。接入后由 D 提供测试安装的具体 Admin endpoint、独立测试 actor 和 fixture，再执行并发同 nonce、旧 key version、错误签名、audit 写失败、controller 重启的正负测；只登记状态码、operation ID、脱敏 audit ID 和行数，不打印 proof/credential。

## 6. 证据归档与状态

每项结果按 `contracts/system-backup/v12/capability-evidence.schema.json` 记录 provider role、版本、身份与范围 hash、每个 capability 的结果/失败类别、run ID 和清理证明。只在真实命令成功、相关负测通过、清理核实且非实现 owner 复核后，将对应项标【已完成】。现有 functional-test RBAC 与 app 去权证据见 `docs/evidence/secret-broker-rbac-cutover-zhanghui08-20260923.txt`；其他远程项目仍为【待远程执行】。
