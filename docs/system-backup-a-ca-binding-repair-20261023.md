# A：CA Binding 输出保护修复

2026-10-23，针对 D 非实现者评审的 `D-A-CA-01`。原 `Binding` 的值/指针被 `%v`、`%+v`、`%#v` 或 JSON 直接输出时，可带出部署映射；原有防护只覆盖 validator/check。当前为 Binding 增加值接收者的常量 String/GoString 和拒绝 JSON，值与指针均受保护。

新增 `TestCATrustBindingNeverFormatsOrSerializesDeploymentPins`，覆盖值/指针各三种格式和 JSON，共八个 sentinel 边界。原 CA 两份源码逐字节保存于 `evidence/a-ca-binding-original-source-20261023.json`，与 D 原评审摘要一致。使用只替换原 `ca.go` 的 Go overlay 加新测试，八个子项及父测试真实失败；原始失败日志单独保存，没有混入修复后成功用例。

修复后的准确轮次为 `evidence/a-nonce-ca-r2-candidate-20261023-164639-61dbbaab.json`，source SHA `3f10b7cb687f2ecb666b428600b44850436afb051b72673d7d0a30aa604710bb`，385 份输入。两完整候选包 9 根/63 条通过事件，原 54 条逐名保留；默认 vet、两份 Linux 测试程序、冻结/当前集合和字节后检、退出 0 及准确 owner 清理已由 `evidence/a-nonce-ca-r2-local-accepted-20261023.json` 独立接收。接收器回归覆盖两个合成完整场景与十九个拒绝场景，不是实际 SQL。

原始完整日志为 `evidence/a-nonce-ca-r2-local-20261023-164638.txt`；旧源码反例为同候选前缀的 `.old.jsonl`。可选编译缓存来源已被其 owner 删除，`.cache-seed.json` 明确 `source_available=false`、`entries=[]`；本轮没有复制或使用任何共享缓存条目。PowerShell transcript 未捕获缓存助手的原生 stdout。零复制分支以准确 JSON、冻结助手/入口及原生退出检查核对，并拒绝日志中任何非零复制宣称；没有补造成功输出，也没有重跑已通过的 Go 来修补日志。

较早两次预热分别因源文件锁和源 owner 已删除，在任何测试启动前退出；两轮自有目录均已删除，原失败保持。原 r1 接收和 D 的修改意见均不改写；当前源码的新评审请求须另存 r2，并由原非实现者复审。

本修复不装配生产，不减少入口 27 项真实资源缺口，不批准原受控映射、文件挂载权限、实际 MySQL、跨资源政策或生产恢复/GC。原 owner 全量门禁的 HTTP/容量失败及超时仍由 A1/D2 定位，本候选通过不替代那些门禁。
