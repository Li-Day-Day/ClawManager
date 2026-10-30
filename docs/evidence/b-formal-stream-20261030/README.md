# B 流式 writer / native ABI：本轮隔离验证

基线 `d94e22102f0dc6279522c6a7487156370bd90f4a`；本轮源码仍未提交、未推送。实现与 D/A/C 输入见 [交接](../../system-backup-b-formal-stream-writer-20261030.md)，本轮触及文件及 LF 规范化 SHA-256 见 source-pin.json。

## 实际通过范围

使用已有 Go，`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`，复用原缓存，没有下载/安装依赖。

| 命令 | 真实结果 |
| --- | --- |
| `go -C backend test -json -count=1 ./internal/systembackupwire` | 最终 exit 0；11 个通过事件（含子测试），`wire-final-tests.jsonl` / `.stderr.log` / `.exit.txt`。 |
| `go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/systembackupwire ./internal/systembackup/staging` | exit 0；wire 11 + staging 34 个通过事件，无失败；`stream-staging-tests.jsonl` 等。 |
| `go -C backend vet ./internal/systembackupwire ./internal/systembackup/staging` | exit 0，`vet.log` / `vet.exit.txt`。 |
| `git diff --check` | exit 0，不覆盖 untracked 文件；新增源码另经 gofmt/语法解析。 |

已实际执行：C 公共固定向量的完整 frame 和 envelope 逐字节对照、独立 AES-GCM 解密、多帧/空输入/EOF/连续索引、密文摘要、晚到 Write 拒绝、预算/取消/短写/持续重复 nonce/源错误失败无 seal、错 wrapped request、Unicode/路径限制、原 staging 旧格式回归与新候选文件只创建/外来文件保留/本调用 partial 清理。

旧的 wire-tests 和中间记录保留，最终 wire 以 wire-final-tests 为准。没有重建 C golden，也没有用 synthetic 私钥/permit 去现场调用 provider。core 的测试随机源注入为包内私有测试接点，生产使用 crypto/rand。

## 编译阻断范围

`go -C backend test -json -p=2 -count=1 -timeout=3m ./internal/systembackup/worker ./cmd/backup-worker ./internal/systembackup/publicadapter -run 'TestFormal|TestOriginalKeyAuthority|TestRuntimeProfile|TestRuntimeModuleSourceAuthentication|TestLinuxSourceAuthentication'` 在依赖 setup 失败，exit 1，实际用例数 0。

缺少 `github.com/cyberphone/json-canonicalization@v0.0.0-20261011152517-32a48195b9b2`；`GOPROXY=off`，Go 的 downloading 文本不表示成功下载。未替换版本、实现通用 JCS 替身或通过 stub 绕过。原始输出为 worker-native-tests / worker-native-final-tests，test-summary.json 汇总。

**新 worker/CLI、native ABI 回调与源认证测试没有完成类型检查、编译或执行。** 本轮在途迭代后的最终 17 个 Go 文件仅由标准库 go/parser 做语法复核，syntax-check.json / syntax_check.go 保留；这不代替编译。待有现成准确缓存后，必须执行上述包及原 main/控制回归，再处理实际编译/行为问题。

已写但未执行的测试包括：workspace 候选与原 key-use fixture、同 nonce 的使用期复查（防本地 mutex 重入）、unknown key-end 分类、撤权/部分输出/现有候选不重写、映射 SHA/重复/未知字段/缺 permit、native GatewayControl v2/HTTPS/不使用 DELETE POST、源认证同事务首检/末检拒绝，以及新 envelope 名与其他 part 碰撞。未把这些源码当作已通过。

## 交付限制与产物

候选 receipt 不是旧 Result/Complete、正式 artifact、签名或 task 成功；当前 D seal observer 是旧格式，正式模式还需 D/C 接收。provider-mode CLI 暂不接受数据库任务，缺独立 SELECT-only 原凭据 lease 时拒绝；库层已复用原 CaptureSource，但未完成该生产装配/运行验证。

没有真实数据库/Agent/K8s/存储/provider 访问、密钥发放或迁移。当前 acceptance/readiness 与原门禁未放宽。Go 自身临时构建目录由工具收尾，未生成仓库内独立二进制；复用的旧缓存及用户要求保留的空目录未处理，其他 owner 产物未删除。证据和测试源保留。
