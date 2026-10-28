# C 接点核对与 D 完整详情组合交接（2026-10-28）

当前新增代码补齐了完整 backup/preflight DTO 和原始 manifest 的事务内组合。它没有提供缺失的 C artifact/catalog/health 执行实现，也不构成 C 领域签收或真实链成功。本轮使用现有依赖，没有安装工具，没有连接或改动 `zhanghui08` 现场。

新增生产候选位于 `backend/internal/systembackupread/backup_preflight_detail.go`，父 D 负责在 `systembackupapi` 和 server 中接入。准确公开接点为：

```go
type CurrentTaskFacts interface {
    Backup(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (BackupCurrentFacts, error)
    Preflight(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) (PreflightCurrentFacts, error)
}
type CurrentFactsSQL interface { QueryRow(string, ...any) CurrentFactsRow }
type CurrentFactsRow interface { Scan(...any) error }
type ManifestReader interface {
    Read(context.Context, CurrentFactsSQL, TaskCheckEvidenceControlSnapshot) ([]byte, error)
}

reader, err := systembackupread.NewReader(db, originalAReadScope)
backup, err := reader.ReadBackupDetail(ctx, publicID, currentFacts)
preflight, err := reader.ReadPreflightDetail(ctx, publicID, currentFacts)
rawManifest, err := reader.ReadBackupManifest(ctx, publicID, currentFacts, manifestReader)
```

三种读取均进入原 `readTaskCheckEvidenceControlInTransaction`，task、attempt、Job observations、check/evidence bindings、owner contribution、SQL clock、最后 A authority recheck 和 commit 共用原 RepeatableRead 事务。`CurrentFactsSQL` 没有 Begin/Commit/写方法，固定使用原 context；未消费的 row 在 owner 返回后关闭，保留的 capability 不能在最后授权之后补查。它是可信内部 adapter 的受限接点，生产 SQL 仍须原身份和权限门禁；它不授予新的 SQL 权限，也不接受客户端 SQL。

必须由真实 C adapter 提供的 `BackupCurrentFacts` 包含原 installation/task/row-version、原 observation/expiry、当前 artifact usability/reason、acceptance readiness、相同不可变 checksums/registration、可选 verifier report，以及已按受审策略脱敏的 hold reason/actor。`PreflightCurrentFacts` 同样绑定原 task/version/时限，提供由当前 source、ref/schema/capability freshness 和 evidence availability 得出的 compatibility/validity。原 SQL clock 必须处于 observation/expiry 开区间内，不创建默认 TTL，不用 saved hint 生成当前成功。父 D 必须把缺失或 typed-nil adapter 视为 unavailable。

DTO 逐项组合真实持久事实；当前 attempt 统计排除旧重试，不把 heartbeat 当进度，多个 phase/Job 不虚构单一 generation。backup 当前 checksum/registration 必须与同 snapshot 的控制列一致，acceptance-ready 要求 succeeded、eligible、usable、registration 和 acceptance checksum。preflight 验证保存 aggregate 与当前 attempt 的 owner check 行一致；报告必须属于同 task、相同 checksum 且不早于该 attempt。functional_test 不能成为 valid 报告。raw failure text、config snapshot 和 raw expected/actual 从未进入响应。

Manifest reader 必须使用该 task 固定 locator/immutable-version/credential authority 并验证 C 的完整 closed schema。D 组合层另外验证 UTF-8 JSON object、`system-backup.v1`、原安装/backup ID、原始字节 SHA256、同 snapshot 的 row-version/status/committed/checksum，并在读取前后检查原 SQL 时限；输出是冻结的原始字节，不重编码、不注入资格或当前 health。8 MiB 是读接口的内存上界，不声称它是已冻结的 C manifest 大小合同。A 的 encrypted-evidence `Manifest` 不是该 `system-backup.v1` artifact manifest。

当前必须保留的合同阻塞：backup detail 的 `consistency` 在机器 schema 是必填非 null 的 strong/bounded/weak，而任务 SQL 在 capture 前允许 NULL。因此创建后的某些 pending backup 暂时无法返回符合现有 schema 的完整详情；本实现返回 unavailable，不自造 weak 或把数据库 NULL 转成成功。须由 D/B/C 同版本决定并补齐机器合同与 parity。manual_hold=true 的 schema 要求 reason/actor/at，必须有受审 redaction adapter；不拿原始 reason 或随意字符串填补。

按主计划第 16 节的既有职责核对，交付归属如下；“待交付”是当前缺口，不是本子任务代签的完成结论。

| 项目 | 负责交付 | 本轮核对与需要内容 |
| --- | --- | --- |
| S3 artifact、manifest candidate/finalizer grant、external-action adapter、artifact health/prune provider | C；A 复核安全绑定；D 装配持久化和 API | 未找到可装配的完整 artifact/catalog 生产 reader。现有 `systembackupevidence.SystemPublisher` 和 `systembackupproducer.Finalizer` 面向 A evidence/producer 协议，不能当作 C 系统备份 artifact finalizer。需同版本 concrete adapter、构造参数和受控 provider 输入。 |
| recovery_catalog_records | C 定义签名记录/判等；A 复核签名和 bootstrap；D 机器合同/落盘 | `contract-manifest.json` 仍 missing/path=null。须交付 artifact_registered/artifact_deleted closed payload、canonical/signature purpose/version、重复冲突和不存在性语义。 |
| catalog_scan_record | C 提供 provider snapshot/inventory 及完整 scan/record 领域合同；D 合同和持久化 | 同上 missing。须给出完整分页/EOF、原 snapshot deadline、排序 hash/count、registration/tombstone 关联与 unknown 策略。 |
| restore_target | B 提供隔离目标/typed refs/schema/capability；A 权限；D 机器合同/API | 仍 missing，不能用模型目标替代真实 preflight 输入。 |
| status_relay | B 提供 Job-set/relay 身份/sequence/command wire；A 复核身份；D controller/持久化/路由 | 仍 missing，不能由现有 observation 表推断执行端已交付。 |
| system_backup_catalog_imports/records/scan_states 三表 | D 系统表/migration；C 提供上两项 catalog 原始领域输入；A/B/C 按原交叉评审门禁 | 当前 schema inventory 将三表明确列为 plan_control_without_inventory，未找到 migration；不自行定 schema 或以空表绕门禁。 |

本轮完整 read 包验证实际通过：107 根、1,039 条 pass events，0 fail、0 skip；新增五根覆盖完整 DTO/原快照、跨安装/version/时限、非法当前事实、report owner/hash/attempt、原始 manifest checksum/identity/大小/失效期间读取、最后撤权和 commit 失败。它们是 Go SQL-driver/adaptor 模型验证，不称为真实 SQL/provider/整链通过。准确命令为：

```powershell
& .\docs\evidence\c-first-chain-details-validation-20261028.ps1
```

脚本固定 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off`，记录 read/contract/模块文件 62 项的前后字节一致，保留 `c-first-chain-details-20261028.final.tests.jsonl`、stderr 和 `c-first-chain-details-20261028.final.json`。原首轮 helper 类型编译失败和修正后的 r2 成功日志均保留。最终完整轮原生 exit=0、source_unchanged=true、owner_removed=true；测试缓存/临时/二进制只在已核对的 `backend/.tmp-c-first-chain-20261028`，现已全部删除。
