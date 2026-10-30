# B 最新统一基线拉取与核对

基线由 af7c3ad5 快进到 74ee6146，最后复查又快进到 `baa175cac31adfd86c0ac9daf575e533bbb6d0f0`。测试命令执行于 74ee6146；最终 KMS 版本别名修复只核对源码，未本机编译/执行。保留本地未提交改动，没有创建提交、stash、暂存内容或推送；无依赖安装或真实迁移。具体缺口关闭表见 [核对说明](../../system-backup-b-upstream-review-20261029.md)。

- `tests.jsonl`：新基线 adapter/domain/execution 测试在精确依赖缺失时 setup 失败，exit 1，没有运行用例。
- `b-tests.jsonl`：单独 adapter/domain 仍受同一依赖阻断，exit 1，没有运行用例。旧版通过记录不能套用。
- `catalog-check.log`：原 catalog --check exit 0；`catalog-tests.log`：Python catalog 3 项 exit 0。
- `c-crypto-tests.log`：公共 C 原 Node 离线向量测试 exit 0，85 项通过；没有重建 golden、没有调用 provider。
- `summary.json` 保存退出码及 Agent 补丁 SHA-256（与交付文档一致）。`source-pin.json` 固定当前未提交 B 源码与 tracked 增量。
- `git diff --check` 通过；不构成新增生产接线编译或现场验收。配置 Windows LF/CRLF 警告不改变文件的规范化摘要。

Go 使用已有 cache、GOTOOLCHAIN=local、GOPROXY/GOSUMDB=off、GOFLAGS=-mod=readonly。缺少 github.com/cyberphone/json-canonicalization@v0.0.0-20261011152517-32a48195b9b2，未下载、替换或使用 stub。本轮保存的本地恢复副本位于 .codex-temp/b-upstream-refresh-20261029-151126，供恢复未提交工作使用；原空目录按用户要求不处理。没有在仓库新增独立二进制或删除其他 owner 产物。
