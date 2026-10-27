# D：producer 持久化校验与八表 DDL 候选

日期：2026-09-30。承接 [Go 合同与事务基础](system-backup-d-producer-go-foundation-20260930.md)。本轮推进 C1 数据字典到可执行的存储校验和具体 SQL 候选。生产 Policy、生命周期服务及 A 接线尚未完成，整个 producer 运行目标仍在进行。

## 交付

- [storage.go](../backend/internal/systembackupproducer/storage.go) 为八类记录提供 `EncodeStoredRecord` / `DecodeStoredRecord`。先做完整 C1 校验，再派生 typed-frame、SHA-256、scope key、scope bytes 和全部 SQL 投影。读取要求表名、完整字段集合、摘要、规范记录字节、所有索引列和调用者 scope 全部匹配；失败不修改目标对象。`StoredRecord` 是不可信数据，不是授权或锁证明。
- [frame_decode.go](../backend/internal/systembackupproducer/frame_decode.go) 实现 typed-frame 反解。长度检查先于分配，限制记录大小与递归深度，拒绝截断、未知 tag、非法 UTF-8、重复或未排序的对象键及尾随数据。解码后再次应用闭集 C1 字段与语义验证。
- [producer-authority-candidate.sql](../contracts/system-backup/v12/producer-authority-candidate.sql) 含八张 InnoDB 表的明确列类型、主键、唯一键、扫描索引、RESTRICT 外键和可由数据库执行的 CHECK。没有 `IF NOT EXISTS`，避免用已有不兼容表掩盖错误；没有迁移编号，也没有加入自动启动迁移、inventory 或现行升级包。
- [storage_test.go](../backend/internal/systembackupproducer/storage_test.go) 覆盖八记录往返、每个投影单独篡改、缺列/多列、跨 scope/表读取、驱动整数转换、全部截断位置、恶意容器长度及字典/DDL 字段和键对应关系。

SQL 调用方须使用 UTC 会话与 `parseTime=true`，将 DATETIME(6) 读为 UTC `time.Time`；uint64 可接受驱动返回的规范十进制 bytes，不经过 float64 或有符号强转。摘要仅用于一致性检查：攻击者能同时改整行和摘要时，当前认证、撤销、scope 和锁定状态仍必须由生产 Policy 独立验证。

## 验证边界

本轮最终脚本退出码 0：Windows 15 个顶层测试、含子测试共 232 个通过项，默认 Go vet 通过；Linux 测试二进制交叉编译通过，未执行该 Linux 二进制。脚本确认缓存与编译产物已清理。migration catalog 仍为 94 个文件，hash 为 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。

使用已有 [验证脚本](../scripts/system-backup-d-producer-validation.ps1)，禁用依赖下载，在本轮专属 cache/tmp/telemetry 目录内运行 Go 测试和 Linux 交叉编译，完成后删除缓存及二进制。结果和本轮源码指纹记录在 [机器记录](evidence/system-backup-d-producer-storage-20260930.json)。旧 C1 和上一轮 Go 记录保留为历史证据，不覆盖其指纹。

本机只发现 Docker CLI，没有 mysql/mysqld 命令。读取本机已有镜像列表后未发现 MySQL 镜像，未拉取镜像、安装依赖或连接外部数据库。静态 DDL 对应关系不证明 SQL 执行成功、CHECK 实际执行、外键兼容性或 InnoDB 锁行为。尚不能把本轮记作 V01–V10 运行验收。

## 后续落实

下一步在同一事务中实现使用闭集表/列名的锁定读取与精确 CAS，然后把它接入认证/撤销、L0–L6 锁序、容量及审计的具体 Policy，完成 Acquire/Renew/Revoke/Takeover 等生命周期方法。不得从通过 `DecodeStoredRecord` 推导授权；不可用无锁读取判断幂等请求缺失。

DDL 进入正式 migration 前仍需 C1 A/C 评审（Job 时含 B）、真实 MySQL 的语法/CHECK/FK/空范围竞争/执行计划验证及 catalog/inventory 同步。历史 binding/receipt 不可变、target/current_run 逻辑关系和引用/GC 检查属于事务不变量，不能声称 DDL 已独立保证它们。
