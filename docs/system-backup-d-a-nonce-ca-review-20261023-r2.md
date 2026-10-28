# D 对 nonce/CA r2 的增量非实现者复审

本轮绑定 A 的 `a-nonce-ca-peer-review-request-20261023-r2.json`，source SHA `3f10b7cb687f2ecb666b428600b44850436afb051b72673d7d0a30aa604710bb`、385 份输入。请求原生检查退出 0，D 逐项核对其准确源码/证据摘要，并将 D1 的独立本地接收与 A 的 r2 接收对照。没有修改原请求、r1 回执或 D 原评审，也没有重跑 Go、安装依赖或运行实际 SQL。

**D-A-CA-01 在此准确 r2 上关闭。** `systembackupcatrust.Binding` 新增值接收者 `String`、`GoString`，统一只返回 `BootstrapCATrustBinding`；`MarshalJSON` 返回统一拒绝，不输出部署字段。值接收者也覆盖指针方法集。新增测试把原安装、数据库、文件路径、endpoint/provider/scope/config/CA pin 均设为 sentinel，检查值/指针的 `%v`、`%+v`、`%#v` 六项及 JSON 两项。原 Go overlay 八个叶子及父测试真实失败，新两完整包 9 根/63 条事件全部通过，原 54 条逐名保留；默认 vet、两份 Linux 程序、来源后检和准确清理由原始日志及独立接收证明。D 没有把静态源码意见写成新一轮 Go 运行。

可选编译缓存没有使用：本轮审计明确 `source_available=false`、零 entries。相应接收器分支绑定 JSON 与冻结 runner/helper，只处理这个零复制事实；正常可用/非零复制分支仍要求原生输出。此前该字段的严格接收失败保留，未补造 transcript，也没有因接收器日志分支问题重复完整 Go 构建。D1 的再次严格接收为独立交叉证据，不代替 D 的源码复审。

首次评审中 nonce 原绑定、材料副本/擦除、全局 config/nonce 历史版本/身份及最大保留期、同事务时限、CA 固定 IP/hostname/TLS 和无 provider 网络事务复查等边界继续按原准确实现意见接收。此次运行事实只覆盖本地候选与合成 SQL/本机 TLS 测试。原受控映射是谁提供、真实挂载/在线权限/历史密钥生命周期、完整 CrossResources、实际 MySQL、实际 provider 和生产装配仍未批准；构造器、hash 或本地测试成功不能生成授权。

新机器结论为 `evidence/d-a-nonce-ca-reviewed-20261023-r2.json`：`finding_closed_for_exact_r2=true`、`production_approved=false`。后续源码变化不自动继承本结论；原 D-A-CA-01 及 r1 `changes_requested` 记录保留历史含义。
