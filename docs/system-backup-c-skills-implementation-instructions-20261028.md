# 给 C / Skills 负责人的实现任务单

2026-10-28。目标是让现有 Skill Hub 数据/对象/恢复能力进入首条公共真实备份链。本文可独立转发。公共控制面固定 v12；B执行输入固定PR `08d15abf`加D的Input.Backup/计划绑定。不要另建任务、claim、scheduler或公共artifact/finalizer/catalog。

## 现成实现与统一调用

保留 `backend/internal/systembackupskillhub` 的 Rows/ValidateRows、对象版本读取/流式复制/索引、Normalizer、SQLRestorer、SQLRestoreVerifier、RestoreVerifier。不要重新实现这些算法。保留 `services/skill_package_materialize_worker.go` 的StartContext/StopAndWait、取消后等待全部子任务与清理后才释放permit、关门后延迟回填；当前七根gate测试已通过，仍不是跨进程停写证明。

D实际构造：`cmd/system-backup-controller/task_execution_live.go:composeTaskExecution` → B `NewLinuxProfile/NewPublicRunner` → D `BindTaskRunner` → TaskExecutionLoop → Dispatcher。Prepare调用 `LinuxProfileConfig.BuildParts/BuildWriters`，只冻结描述；Capture经公共Ports派发真实Job后才读源。Skills模块必须放进这条路径。**目前还没有已注册的Skills专用worker operation/domain dispatcher**；D/B负责提供并注册该入口、payload合同和生产caller，不要求你猜operation字符串或自己启动另一个worker控制面。该缺口未关闭前只能交可接纳模块，不能宣布生产已调用。

## S1：补齐八表真实捕获贡献

**位置**：`systembackupskillhub/rows.go`、`validate.go`及新增同包capture adapter；核对models与实际schema，复用B共享MySQL捕获，不另开一个独立时间点的全库dump。

**输入**：D/B提供原同一capture/checkpoint的完整表视图、registry/schema/capture-context绑定、task/attempt/config snapshot和原期限；A提供真实SELECT/read权限及来源认证。沿用 `Rows` 的八组字段：Skills、Blobs、Versions、Bindings、Scans、Jobs、Tags、SkillTags；以当前rows.go精确类型为准。空表必须有完整性证明，不能由未读取推导空。

**输出**：逐表完整列/行/引用投影、计数及内容摘要、与同一checkpoint的绑定，交领域验证及公共证据生产者；不要直接JSON序列化业务models当备份格式，ManifestJSON/FindingsJSON存在json:"-"字段。历史、removed binding、materialize jobs与关联表不得漏。

**事务/异常**：B拥有源一致快照和停写屏障；C不提交公共task事务、不更新attempt。缺表/列、schema漂移、引用不全、取消/过期/权限不足即失败，不返回空Rows伪成功。

**验收**：真实SQL同checkpoint八表，空表与未读取区分；历史/删除/JSON隐藏字段/孤儿引用/新列拒绝；与B原dump逐项比对。fixture通过与真实SQL通过分开交付。

## S2：对象与未打包workspace捕获

**位置**：`object_plan.go:PrepareObjectCapture`、`object_stream.go:CopyFrozenObject`、`object_s3.go:NewS3VersionReaderWithMetadata`、`object_index.go:WriteCapturedObjectIndex`。保留版本固定和流式实现，只补真实adapter/caller。

**输入**：完整 `[]models.SkillBlob`、受认证prefix全部冻结 `[]FrozenObject{Key,VersionID,Size,SHA256,Metadata}`、原 `ObjectCaptureLimits{MaxObjects,MaxObjectBytes,MaxTotalBytes,MaxIndexBytes}`、SELECT/GET-only确切版本reader和task-owned候选输出流。provider/bucket/root/身份/CA/版本与有效期由A/存储owner提供；C不得从浏览器请求找凭据。

**调用/输出**：注册模块后实际顺序 `PrepareObjectCapture→逐对象CopyFrozenObject→WriteCapturedObjectIndex`，返回原版本/长度/真实SHA及metadata/index证明。Frozen inventory必须覆盖未被当前blob引用的对象；不能只备份引用子集。`UnpackagedBlobIDs`交B `WorkspaceRestoreVerifier`及workspace capture/proof能力，不是可忽略的成功项。

**异常**：缺版本不回退latest，ETag不替代内容SHA；取消立即停止网络读取。部分流可能已写入，由D/B资源journal标记候选失败并回收，C不盲重试/覆盖最终对象。遗漏metadata必须保留计数并转换为disqualifying warning，不能默默删除。

**验收**：真实versioned存储、分页完整性、孤立对象、null/失效版本、同key替换、checksum/长度错、取消、容量、metadata遗漏及unpackaged workspace不足。提供不再写源的证明；不把客户端声称versioning=true当现场证据。

## S3：补齐实际writer清单和公共gate接入

**位置**：materialize worker/service、上传/删除/扫描/发布对象的实际service入口；保留已交gate代码，补完整清单和漏接路径。

**输入/调用**：D提供唯一公共gate、完整writer registry、当前generation/fence及原hold deadline；每个实际异步工作领取permit，直到子任务真正退出与ReleaseToPending等清理结束。B负责实际Pause/ACK/CheckRecovery，D持久化原intent/ACK/resume。

**输出**：逐writer身份、UID/generation、在途/停止/清理事实及未覆盖差集。nil/no-op gate、ctx.Done、StopAndWait超时均不表示停止。失claim/fence后停止新工作；恢复须新恢复scope，不能用旧forward grant。

**验收**：HTTP返回后仍运行的异步写、取消中清理阻塞、许可释放失败、停止超时、gate重开恰一次回填、外部对象writer未覆盖均有正反例；现场核对全部实际writer，不只七个本地用例。

## S4：复用恢复/独立验证，交领域合同

**位置**：`restore_module.go:Normalizer.Normalize`、`restore_write.go:SQLRestorer.Restore`、`restore_sql.go:SQLRestoreVerifier.Verify`、`verifier.go:RestoreVerifier.Verify`。

**输入**：沿用 `RestoreRequest{Binding,Source,Mapping,Limits}`。Binding精确包含RegistrySHA256、SchemaSHA256、CheckpointSHA256、CaptureContextSHA256、ArtifactSHA256、TargetIdentitySHA256、EvidenceRef；这些是比较数据，A/B原authority负责认证。restore-write与独立SELECT-only verifier分凭据；原target映射/隔离/禁止业务启动由D/B/A提供。

**输出/分工**：复用 `RestoreVerificationRequest`、`RestoreVerificationSummary`，保留ObjectsWithOmittedMetadata/UnpackagedBlobs等不合格事实；C提交skill_hub分类的closed checks、计数、expected/actual摘要、warning/failure映射和签名/认证输入要求。公共VerifierResult schema和注册由D牵头、A复核；不以自填valid授权，不直接改acceptance_ready。

**验收**：真实隔离target SQL/版本对象/workspace联合验证，目标误指源、错mapping/registry/checkpoint、撤权/过期、normalize后仍可调度、遗漏workspace与空表证明均拒绝；备份首轮接线优先，恢复验收单独标状态。

## D/B/A 同期必须提供，不能转嫁 Skills

- D：原Requests/Admission、task/attempt/claim/fence与SQL账本、模块结果/证据持久化、具体domain caller/登记及最终状态；当前生产link未绑定。
- B：冻结共享SQL视图/checkpoint、实际worker operation/调度adapter、workspace捕获及认证停止/恢复证明。新增operation的准确payload必须由D/B先交，不让C自己选。
- A：真实材料/用途授权、provider读身份/CA/撤销与期限、capture证书和证据认证；摘要/Ref字符串不是grant。
- 公共artifact/finalizer/catalog唯一owner：提供封存/提交/manifest/catalog接点。Skills只交本领域内容与证明，不重写公共基础设施。

交付准确commit/diff、构造入口/真实caller清单、同版本输入、必要测试原始日志/退出码及清理记录。不得安装依赖；测试后删自有cache/tmp/binary，保留日志。模块本地通过、真实provider通过、公共整链通过分别签收；当前不得宣称首条真实链已过。
