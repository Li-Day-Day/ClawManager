# 公共 C KEK 纯候选解码 API

实现位于 [systembackupkekcandidate](../backend/internal/systembackupkekcandidate/types.go)，消费 `f079600e` 的两份闭集 schema。包不依赖 SQL、HTTP、KMS transport、执行授权或扫描器；未改 A KMS、D execution 或原 crypto bundle。生产注册与来源/fence 的准入仍待 A/D 装配，本包完成的是纯解析与可计算的一致性检查。

## A/D 可直接消费的接口

D 已在 [持久化与锁协议答复](system-backup-d-kek-persistence-locks-20261029.md) 保存四类存储、首次准入和原锁序子阶段的决定，具体 Store/组合实现尚在进行。本包不依赖其未提交中立类型；A/D 可以从下述 Input 值副本显式映射到原 Binding/Observation 比较输入，必须继续经过 D 的 Bind/Stage/最终 Recheck 与 A 独立 original mapping authority。候选 DTO 的转换不授予准入。

```go
mapping, err := systembackupkekcandidate.DecodeMapping(rawMapping)
// -> UnadmittedMapping
retained, err := systembackupkekcandidate.DecodeRetained(rawRetained)
// -> UnadmittedRetained

err = mapping.MatchObservation(installation, configSHA, sourceRevision)
err = retained.MatchObservation(installation, configSHA, scanRevision, now)
err = systembackupkekcandidate.CheckSameKeyMapping(previous, proposed)

mappingDTO := mapping.Input()   // MappingInput；全为值副本
retainedDTO := retained.Input() // RetainedInput；引用数组复制
canonical := mapping.CanonicalJSON() // 返回独立 bytes
```

`Unadmitted*` 字段私有，只能由成功解码得到非零实例；零实例的 MatchObservation/CheckSameKeyMapping 拒绝。Input 返回的 `KeyBindingInput` 是独立候选 DTO，不能直接赋给 `wire.KeyBinding` 或 `kms.Config`。没有 `Authorize`、`Complete`、`Admitted`、scanner、运行凭据或自动生产转换函数。调用方仍可手工复制 DTO 字段，因此“未准入”是显式 API 边界，不宣称 Go 类型系统可阻止恶意调用方绕过 A 的组合层。

所有函数只处理给定参数，无当前系统时钟、数据库或 provider 副作用。`MatchObservation` 比较的是调用方提供的预期值/时间；调用方必须先认证这些值的原来源，它不证明当前 SQL 快照或 grant 真实。

## 解码与转换约束

- 嵌套对象全部闭集、字段全部必填且不接受 null；拒绝重复 key、额外字段、错误类型、非法 UTF-8/孤立 surrogate、尾随 JSON。先检查原始结构，再 JCS，不通过 round-trip 修复非法数据。
- mapping 限 256 KiB，retained 限 8 MiB，嵌套深度限 32。超限拒绝整份输入，不截断或分页后自称完整；超大正式集合需另行审定读取方案。
- 计数必须为精确的 0..2^53−1 整数；允许 JCS 等价整数表示如 `0e1`，拒绝小数和不安全整数。数字词法长度限 64、指数绝对值限 400，避免任意精度指数展开占用过量资源。
- 验证原 `reference:kek` identity/version 与 KeyBinding 一致；generate/unwrap 各自固定 ref_kind、purpose、capability，其 provider_identity_hash/scope_hash 与候选 provider 一致。两用途 ref 可以有不同原 identity/version；不推导或认证它们与同一实际 key 的原 registry 关系。
- provider key ID/name、endpoint、provider version 分别保留；不剥前缀，不从 profile hash/名称生成身份。provider version 按冻结 schema 校验为最长 10 位规范正整数；A 在线 adapter 的 uint32 上界与真实 provider 能力仍在其自己的准入边界验证。
- endpoint 只按当前 schema 检查 HTTPS 前缀及长度，不实施 DNS、TLS/SSRF、hostname/端口/路径规范检查。CA/source 引用只做闭集结构，不打开文件、URL 或读取受控来源。
- 输入可以有 JSON 空白/字段顺序差异；CanonicalJSON 返回 JCS。原 SourceRecord 的 content_sha256 若覆盖原文件字节，应由原来源先验证收到的 **raw bytes**，不能拿重新编码后的 canonical hash 替换原 pin。

`CheckSameKeyMapping` 要求同 installation/config_ref 逻辑 identity+version，变化则返回 ErrMismatch，留给独立轮换准入处理。在同一逻辑 key 下，provider/key/version/CA source 或两用途原引用变化返回 ErrRebinding；config_sha256/source_revision 和 redacted description 可以改变，不阻止不同 config 复用同一不可变 key。该函数不验证实际远端 key material 或批准 provider 迁移。

## retained 集合检查与明确的不保证事项

四个 coverage 分区均必填，refs 必须按 `JCS([partition,source_record_id,source_record_version,envelope_id])` 的 UTF-16 顺序严格递增；不修复乱序、不去重。逐项检查完整 KeyBinding hash、mapping_source/expected_request_source，再检查每分区计数/过滤数组 hash 与全量数组 hash。相同 identity+registry_version 在同一输入集合中不得出现冲突 KeyBinding，即使每项 hash 都重新计算也拒绝。

observed_at/valid_until 必须能解析且区间正向；MatchObservation 按调用方当前时钟采用 `[observed_at,valid_until)`。它不能证明观察真实、snapshot/fence 有效或原 authority 未撤销。

**一个删除了引用、但重新计算了所有计数/hash 的自洽子集，仍可通过本包的结构校验。** 测试专门固定此行为：C 不能从 JSON 判断外部世界是否少了一条记录。只有 D 的权威全集/分页 EOF、原共享 fence 和 A 原授权的最终 Recheck 能判断完整性及允许退休。空数组同理，只是一个合法的未准入候选，不是“已知历史为空”。不得排除 unknown writes、复制旧 grant 或仅凭本包返回 nil 就销毁 key。

生成许可、当前独立 unwrap 许可、撤销状态和材料保护期限均不在本包推导；原 mapping/CA/完整 expectedRequest 的实际字节与对应关系由 A/D 认证。来源缺失、原记录不符、并发新增引用、过期或撤销时，生产安全 adapter 必须拒绝，不能以本包的结构成功兜底。

## 验证

`testdata/mapping.json`、`retained.json`、`retained-empty.json` 为独立 JS JCS/hash 生成的公开 synthetic 固定向量，无密钥或凭据。retained 覆盖四分区，含 `😀` 与 U+E000 的 UTF-16/UTF-8 排序差异；Go 解码须逐字节返回相同 canonical 内容。测试还覆盖逐字段缺失/null/额外成员、重复 JSON key、Unicode、数字边界、用途/版本/观察绑定、跨安装、同 key 重绑定、来源字段、计数/hash/顺序/重复引用、时限边界及副本隔离。

首轮曾有两条负例将替换值写成原 fixture 值，导致预期拒绝不成立；已修正为不同值，再针对最终源码运行完整包。最终 8 个根测试、278 个 pass events，0 fail，`go_exit=0`、`source_unchanged=True`。准确命令是在 backend 下运行 `go test -json -mod=readonly -p=2 -count=1 -timeout=120s ./internal/systembackupkekcandidate`，默认 vet；Go 1.26.1 windows/amd64、CGO=0、GOTOOLCHAIN=local、GOWORK=off、GOPROXY/GOSUMDB=off。没有安装或下载依赖。

两轮分别使用隔离 GOCACHE/GOTMPDIR：`backend/.tmp-c-kek-candidate-20261029` 和 `backend/.tmp-c-kek-candidate-final-20261029`；finally 都返回 `cleanup=True`，随后独立确认两目录不存在。临时 JSONL/编译缓存/测试文件随目录清理；保留的 testdata 是源码 golden fixtures。正式 D source/fence/SQL、provider 认证及真实 Job 均不在本轮测试范围。
