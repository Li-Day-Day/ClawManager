# A 登录目录连接的请求取消修复

实际 HTTP 已把请求 context 传到 AuthService 和 LDAP，但旧 [LDAP 客户端](../backend/internal/services/ldap_auth.go)只在连接开始前检查 `ctx.Err()`。`ldap.DialURL`、TLS/StartTLS、Bind 和 Search 继续使用与请求取消无关的连接；目录不响应时，取消的请求仍可能等待。已有目录身份模型用例不能验证这个真实传输缺口。

[新连接实现](../backend/internal/services/ldap_request_connection.go)通过 `DialContext` 建立 TCP，连接与 TLS/StartTLS 升级共享原有五秒 setup 预算。整个连接绑定原请求取消：取消时直接关闭底层 transport，打断 TLS、LDAP 读写；正常 LDAP Close 注销取消回调，避免在长寿命 context 中保留已完成的连接。没有从取消回调调用 LDAP 的高层 Close，以免与该库的 reader/process 或 StartTLS 阶段相互等待。

setup 结束后清除 setup 网络 deadline，保留请求取消钩子和十秒 LDAP 响应超时；服务端不执行 Search timeLimit 或不回复 Bind 时，响应等待仍有上限。这个单次 LDAP 请求超时不声明任意尺寸的 Background-context 写入具有端到端十秒上限。认证和目录列表在返回前再次检查原 context；取消不返回认证身份或部分列表，保留 `context.Canceled/DeadlineExceeded`。当前 service/user bind、配置 CA 与服务器名、显式 TLS 选择、预配身份、角色同步、登录 CAS 和会话登记要求保持。

## 验证范围

[受控协议端用例](../backend/internal/services/ldap_request_connection_a_test.go)使用本机真实 TCP、真实 go-ldap BER 编解码、临时 CA/证书、TLS 与 StartTLS。它不替换 LDAP 连接或认证器的方法，也不是企业目录部署。

| 范围 | 新增检查 |
| --- | --- |
| 成功路径 | plain、LDAPS、StartTLS 的 service bind、身份搜索和 user bind，准确返回 DN/用户名/email/角色，并关闭连接 |
| 取消时刻 | plain service bind/search/user bind，LDAPS handshake/service bind/user bind，StartTLS upgrade response/handshake，共八项 |
| TLS 拒绝 | LDAPS 错服务器名/未知 CA，StartTLS 错服务器名/升级拒绝；失败不认证或降级 |
| 请求边界 | nil/已取消 context 不连接；原请求 deadline 关闭 Bind；取消列表不返回行 |
| 无请求 deadline | 不响应的 Bind 由十秒 LDAP 响应超时拒绝并关闭连接 |

验证分两段：从 Git `6537750f9623a673562651ba640376cf983ede4a` 保存的[原始实现](evidence/a-ldap-auth-before-cancellation-20261016.go)先在独立副本执行准确取消用例，必须在“取消后仍等待”的断言失败；随后在冻结修订版执行全部既有 LDAP 用例和新增七主测试/十七子用例（24 项）。预期旧失败和修订版结果分段计数，不把反例当作通过，也不把它混成修订版失败。

首轮选定文件门禁在编译时发现遗漏包内共享 `firstNonEmpty`，没有执行测试或反例；[原始失败日志](evidence/a-ldap-request-local-20261016-151830-413d4e5a.txt)保留，准确源码 owner 已删除。入口已改为真实完整 services 包，将该 helper 与全部包内依赖纳入编译/默认 vet；旧源码只通过 Go overlay 注入反例，正常轮使用原冻结修订版。LDAP 生产修订和传输测试文件没有为了这次入口修复而改变。

第二轮[完整包入口日志](evidence/a-ldap-request-local-20261016-153910-4062e7d6.txt)在 Go 加载模块阶段阻塞，尚未开始测试。容器内主 Go 线程观察为 `p9_client_rpc`，没有编译子进程；诊断 SIGQUIT 保留模块加载栈后退出 1，准确 source owner 已删除。这轮不记作 LDAP 测试失败或通过。

第一次本地卷恢复保持上述 1,325 项源码，归档摘要通过，但模块目录继承的只读权限导致非 root 解包失败，仍未进入测试；[原日志](evidence/a-ldap-request-native-fs-local-20261016-162154.txt)、专用卷及准备目录的准确清理记录保留。之后[准备入口名校验失败](evidence/a-ldap-request-native-fs-local-20261016-163047.txt)也在捕获/测试前结束，自有准备目录已清理。

最终恢复重新冻结 1,330 项输入，source 摘要 `3a48c5d6b0829fda649ecfd5395acf1ec95328fa836bc6127ee4299977d4fac7`；LDAP 三份生产/协议测试文件及原完整包命令与前轮相同，其他并行源码不冒称与旧快照整体相同。[恢复入口](evidence/a-ldap-native-fs-validation-20261016.ps1)把新冻结源码和现有 74 个依赖模块目录归档到专用 Linux 本地卷。[准备入口](evidence/a-ldap-prepare-native-fs-20261016.ps1)先以 `go list -deps -test` 离线枚举模块，并[仅调整归档 header 的 owner 读写/目录权限](evidence/a-ldap-normalize-tar-20261016.mjs)，不更改成员内容；归档摘要通过后执行[全量输入检查](evidence/a-ldap-linux-source-check-20261016.go)，测试后再次核对完整源码集合、每个文件、原清单和 checker 字节。模块来自已有缓存，断网、无下载；宿主 Go cache/temp 与归档均属于准确临时目录，结束后删除。原始[离线依赖枚举记录](evidence/a-ldap-native-module-resolution-20261016.txt)单列保留，不计作测试。

最终[原日志](evidence/a-ldap-request-native-fs-local-20261016-163159.txt)、[源码清单](evidence/a-ldap-request-native-fs-source-20261016-163159.json)及[独立回执](evidence/a-ldap-request-review-20261016.json)已限定接收：Linux/amd64、Go 1.26.1、完整 services 包 **866 主测试/311 子用例，共 1,177 项不同检查通过，无跳过**。新增七主测试/十七子用例共 **24 项**全部通过；全部既有及新增 LDAP 18 个主测试均执行成功，包含八个取消阶段、三种协议成功路径、四个 TLS/升级拒绝、请求 deadline、列表取消及实际十秒响应超时。正常包执行约 36.156 秒，默认 vet 开启，Go/容器/外层退出均为 0，没有测试断言重试。

旧源码准确反例 `TestLDAPRequestACancelClosesTransport/plain/service-bind` 在取消两秒后仍未返回，实际命中取消上界断言，旧包预期退出 1；随后修订版才执行完整包，不把这两个阶段混计。29 项独立复核通过，1,330 项冻结源码在测试前后均完整重验，11 份重点 pin 及当前全部既有清单输入一致；新增输入不据此接收。此前四次未执行测试的失败均保留。归档权限命令的单行原生 stdout 出现在工具 session，但没有进入 PowerShell transcript；回执单列这处捕获限制，接收依据为原清单 pin、实际解包、完整 Go 结果，不补写不存在的日志行，也未重跑测试。

已有固定 Linux Go 镜像、`--pull=never`、断网、非 root 测试与默认 vet 均保留，没有安装依赖或远测。六条准确临时目录独立确认不存在；[只读 Docker 核对](evidence/a-ldap-owned-container-volume-check-20261016.json)确认四个准确自有容器和两个准确专用卷均不存在，源码副本、归档、模块镜像、构建缓存及二进制已经删除。gofmt 与修改文件的 diff whitespace 检查通过。正常轮执行完整 services 包（不包含其子包的独立测试），不是五包 HTTP 的新轮接收。

## 仍需真实环境的部分

本轮不证明实际企业目录配置、生产 CA/网络、realm 撤销事件、现有 token 的目录生命周期或本人 MFA。配置 proof 十五项和下载审计四项各自保留其已接收 MySQL 范围；此修复不签发维护 grant，不装配 D 的下载 nonce/operation/receipt，也不改变正式共享批准状态。
