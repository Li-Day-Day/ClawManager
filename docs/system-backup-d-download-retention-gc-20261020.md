# D 下载保留组 metadata GC 候选

【r87 直接引用守卫收尾，按用户要求暂停】[必需 References 组件](system-backup-d-download-gc-direct-references-20261020.md)由 collector 固定执行已发布 Operation/audit/nonce/收据关联范围及闭合列/FK 校验；原组准确主键排除、迟到引用回滚、metadata 漂移和共享失败状态均有回归。全部 GC 24/308 加 A 独立对照 1/4、producer seed/脱离各 22、跨平台 probe/runner、默认 vet、两次 postcheck/退出 0 通过。[独立回执](evidence/d-download-gc-direct-20261020-r87-review.json)接收分轮测试集合 729/5,925，保留此前整体失败，未称为单次完整四包通过；1,445 输入接收时零漂移，十个自有目录及二进制已清理，无依赖安装或远端执行。完整 policy、其他逻辑/evidence/artifact 依赖、system 原绑定、实际 InnoDB/受限角色/DDL freeze、物理容量、批次与墓碑二次回收及原六项仍未完成。阶段 1/3/5/7 是候选调用位置，尚无全局锁序批准或生产启用。

【r78 任务资格组件本地接收】[具体四任务/local backup 资格](system-backup-d-download-gc-task-eligibility-20261020.md)新增原任务期限/终态、artifact/hold、收敛 inventory、过期 lease/state、保留 promotion/retry 与原事实复核。新六根/117、全部 GC 十八根/242；r77 四完整包 **722/5,855**及普通包 postcheck 通过，后续 Linux 编译的 Windows vet 异常和整体 exit 1 保留。r78 准确同源补齐三 seed/脱离各 22、Windows/Linux probe/runner、最终 postcheck/退出 0，未重复四包或关闭 vet。[独立回执](evidence/d-download-gc-task-20261020-r78-review.json)接收 1,442 输入、接收时零漂移和六自有目录清理。该组件不能单独实现完整 policy；其他 Operation/audit/nonce/evidence/FK/逻辑引用、artifact 的其他任务/导入依赖、system 原绑定、实际锁与角色/DDL freeze、物理容量、批次及墓碑二次回收仍缺，没有生产启用。

【r73 前置守卫增量接收】[L1 审计引用/当前直接授权与结构指纹](system-backup-d-download-gc-early-references-20261020.md)新增必需 `Early` 阶段和提示独立重读，补四个早期审计引用范围、当前账号/角色/grants、结构漂移/危险 FK 与晚写回滚。r72 定向十二根/125，r73 四完整包 **716/5,738**、producer 三 seed/脱离各 22、Windows/Linux probe、Linux runner、冻结 postcheck/退出 0 全通过，1,437 输入接收时零漂移；两个快照/一个缓存及七份暂存草稿均已清理，没有安装依赖或执行远端。该前置 phase 保留 A 的 config→receipt 次序，但完整跨 owner 锁序尚无实际并发证明；结构指纹不代替触发器/存储程序审查与 DDL freeze。实际 owner/artifact/ref/hold、受限账号/完整 schema 权限、物理材料及生产 GC 仍未完成。下方 r71 为该增量之前的原冻结范围。

【r71 最终本地接收】[独立复核](evidence/d-download-retention-gc-20261020-r71-review.json)接收 r70 security/evidence 两完整包 **561 主/4,383 含子项**，GC 七根/73 和原生 HTTP/1/HTTP/2 一根/5 均通过，默认 vet、无测试失败/跳过；普通包来源 postcheck 通过。r70 后续 Linux 编译器 `0xc0000043` 和整体 exit 1、缺最终 postcheck 保留。r71 使用完全相同的 **1,429 来源** SHA `8d772a3c0a6845433e765f52e7e0e39854d162cc1cb323574f06d9327755bdcf` 与自有缓存，完成小型 tagged-only 补证：producer 三 seed/22、tagged seed/22、脱离源码/22、Windows/Linux probe、Linux runner、最终 postcheck/退出 0。未重复完整包或关闭 vet。[清理回执](evidence/d-download-retention-gc-cleanup-20261020.json)确认九个准确快照和一个自有缓存共十目录均不存在；全部二进制已清理，未安装依赖或执行远端。接收时当前 1,429 输入集合及字节零漂移。r68 四包尝试仍为失败轮，不能改记成单次四包整轮成功；read/producer 的独立组件通过及三份 evidence 来源差异在复核中明确列出。

本轮在持久保留组读取之上增加 `SQLDownloadRetentionGC` 的单组事务：先建立 compact tombstone，再按 FK 顺序删除结果关联、nonce、准入收据、Operation 和两条审计，最后只提交一次。这里只回收下载元数据，保留已删除的 evidence envelope；不调用 provider，不删除证据对象或续原下载期限。

## 授权与删除条件

必须显式提供当前部署的 `DownloadRetentionGCPolicy`，没有默认放行实现。该策略须核对当前 GC 授权/撤权、完整 schema 与元数据可见性，并按 L3/L4/L5 锁住实际 owner、artifact、全部逻辑/FK 引用、hold 和 lease 范围，包括空范围。接口不是生产验收：当前尚无完整的实际部署适配器，已有只读 owner policy 不能自动承担 GC 授权。

collector 绑定独立 mTLS 证书、准确的 running `control_metadata_gc` Operation、claim、schema、row version、lease/deadline、数据库及安装身份。L0/L1 当前配置、L2 原审计 user FK、原 Operation/receipt/result、L5 nonce、L6 实测容量预留、L7 两份审计均在同一个事务复核。保留截止取原持久保留期限与准入时间加当前 control retention 的较大值，不能缩短旧保护。

目标 evidence 必须已经是 `deleted`，没有 provider locator、claim、inline payload 或 chunks，并且 row version 严格晚于原收据；到期及 protected_until 均须满足。collector 锁住并保留 envelope，避免把其他下载组共享同一 evidence 身份误当作必须同时删除的条件。实际策略仍须保护其他组对原 Operation/audit/nonce 的直接引用。

墓碑完整回读 23 个投影，保留原请求、公开摘要 hash、组明细 rolling hash、原时间及准确 GC batch；不写入私有正文、HMAC、proof 或 provider locator。standard 墓碑的到期日从 GC 时间加当前 retention 计算。每次 DELETE 前重新核对准确原行，防止前一次触发器悄悄改写后续审计或收据。所有写入及外部 guard/capacity 回调后，再独立复核 worker/config、保留 envelope、墓碑和六类原键缺失；Operation 同时检查原数字 ID、公开 ID 和原完整幂等键，拒绝后续触发器以新数字 ID 复活任一原唯一键。

任一检查或写入失败回滚整组。Commit 返回错误一律为 `ErrDownloadRetentionGCCommitUnknown`，不重试、不宣称成功，也不另行释放容量。专用授权不包含下载、签发 proof、provider 删除或墓碑二次到期删除。

## 本地证据与剩余工作

新增七个测试根覆盖完整单事务、十二类写入故障、worker/证书边界、23 项墓碑回读、最终 guard/迟到修改、未知提交不重试以及到期等值。测试执行真实 collector 与现有安全容量代码，但 SQL transport、owner/ref policy、物理容量和证书材料仍为模型输入，不能当成实际 InnoDB 或生产授权。

r63 定向七根/69 含子项通过；随后补 worker schema 与 typed-nil guard 后，r64 完整包中的 GC 七根/71 通过，但整轮因原 HTTP/2 成功对照的三秒夹具期限耗尽而失败。r65 的新断言错误地比较 SQL 墙钟截止与本地单调时钟截止，四叶子均失败；改为分别与封存凭据比较后，r66 两个成功对照和 HTTP/2 跨期通过，HTTP/1 的三秒反例仍在原生写之前耗尽。所有失败日志保留。最终夹具让成功对照保留原正常预算，故意跨期反例在准入前选定四秒，为独立五秒结果事务留出一秒；不改变生产期限、原生最终 flush 拒绝或完成结果/准确 claim 释放断言。最终完整包、来源和清理证据以随后独立复核回执为准；未执行远端、未安装依赖。

r67 原生 HTTP/1、HTTP/2 四场景及 root（1/5）通过。r68 对同一来源运行四完整包，security/read/producer 各自通过，evidence 仅 `TestSQLTaskDownloadRealPinnedAdmissionAndPostCommitPolicy` 失败：文件/registry 准备耗时后，原 synthetic capacity report 已老化，post-commit 检查在 7.83 秒时拒绝。修正仅在准入之前采样 synthetic SQL 时间、重新核对同一个已签名 proof，并写入此时的新 capacity observation；不改原签名/材料过期时间，不在准入后刷新报告或返回的截止。r68 exit 1 保留，probe 阶段没有运行。

r69 固定 1,429 来源 SHA `8d772a3c0a6845433e765f52e7e0e39854d162cc1cb323574f06d9327755bdcf`，GC 新唯一键复活反例合计七根/73，与上述 pinned-owner 根共八根/74 全通过，默认 vet、两次 postcheck/退出 0 和快照清理齐全。相对 r68 仅两份 GC 文件和该 owner 测试夹具变化。r70 同来源两完整包通过，后续探针因 Windows 编译器异常退出；r71 同来源补全构建及最终 postcheck，准确终态见页首，不把 r68 或 r70 的整体 exit 1 改为 0。

尚需：实际 owner/ref/hold/当前授权适配器、实际 InnoDB 的 FK/锁等待/触发器回滚验证、经评审的最小权限及元数据可见性、独立物理容量材料、批次扫描/统计和 standard 墓碑二次回收。原 user 硬删除会令现有审计 FK/严格组校验无法满足，需单独评审关联保留方案；不能退化成匿名审计。证据对象 GC 也须正确处理已过期的完成下载引用，才能进入此 collector 所要求的 deleted 状态。没有安装正式 schema/grants 或启用生产路由/调度，原六项保持未完成。
