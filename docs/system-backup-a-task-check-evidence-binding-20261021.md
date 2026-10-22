# A：任务检查 evidence owner 与摘要绑定

本轮已独立复核 D 的检查元数据贡献，[限定回执](evidence/a-task-check-control-accepted-20261021.json)核对 read/security 两完整包 339 根/2,764 项，原同范围 2,691 项逐名保留，新增八根/73 项；准确自有产物缺席，无依赖安装或新增构建。它保留所有原 attempt、状态和 evidence 引用，不选择 expected/actual 正文，不生成当前报告或公开 VerifierSummary。

A 继续补充该贡献缺少的数据库绑定核对：`ReadTaskCheckEvidenceControl` 在原 Task → execution → detail → checks 事务中，将每个非空检查引用与 evidence 行的 schema、public ID、owner type、owner public ID 和存储内容摘要比较。原检查 ID/引用/摘要集合也逐行匹配，拒绝漏行、额外行、重排及同 ID 不同摘要。已有正式 evidence public ID 全局唯一约束与原 task 安装隔离共同确定 owner，没有新增共享 schema 或授权。

非空引用使用一次有界 LEFT JOIN，最多 10,001 行作为原 10,000 检查预算的溢出探针。LEFT JOIN 保留缺失 evidence 的 NULL 结果并拒绝，避免 inner join 隐藏缺行；不按每个引用逐次查询。空引用集合直接保留空贡献，重复引用仅在返回快照中去重，不删除历史检查。所有查询均在最终授权复查与唯一 Commit 前，后续 owner builder 失败仍返回零值；提交内取消继承已修订的结果交付边界。

返回类型是不可直接 JSON 序列化的内部快照，引用/检查访问器返回副本。这里只比较数据库记录的 owner 与存储摘要，不读取正文、provider locator、密钥或对象，不证明内容字节完整性、provider 当前可用、下载授权或完整 Detail/HTTP 已启用。

新增五根/36 项测试覆盖四任务类型、引用复制/去重、错 owner/摘要/schema/引用、NULL 缺失/少行/多行/重排、读取/游标关闭错误、撤权、取消、提交错误及后续 builder 回滚。r1 已在完整 read 包内通过全部 36 项，但标准库 `crypto/sha1` 的 Windows `asm.exe` 以 `0xc0000043` 失败，使 security/evidence 构建失败、整轮退出 1；业务断言失败为零。原失败日志/来源保留，来源前后校验通过，自有源码/缓存/产物已删除并独立确认；没有进入探针构建或实际 SQL。

r2 使用相同 1,472 输入及相同逻辑 SHA `ef79f3d263602eb668ccacb8e148c2394db42f538db2c88a803c1ed162dcc59a`，Go 参数和所有断言保持。[完整限定回执](evidence/a-check-evidence-binding-accepted-20261021-r2.json)现已接收五包 796 根/6,868 项，旧 6,759、D 新 73 与 A 新 36 项逐名保留；owner 两包仍为 620 根/5,019 项。包内/脱离 seed 各 22 项、Windows/Linux probe、迁移工具、默认 vet、来源 postcheck、最终 exit 0 均通过，原 r1/r2 与 D 自有目录独立确认缺席，产物已删除。

本回执登记为第八份固定 SHA 普通基线，原七份完整清单保留。冻结后的 owner tagged 缺列夹具修订与 D 三份业务读取修订另行准备/复核，不由本轮扩大为当前整树放行。实际 MySQL、当前 provider、完整详情来源与生产 GC 仍各自待验收。

后续[owner 限定准备](evidence/a-download-owners-inplace-fixture-accepted-20261021.json)已逐项核对 D 三份业务修订与其完整两包 2,346 项、旧取消结果的七处失败复现及两处准确 Commit 后检查，登记第九份组合普通来源，owner inventory 仍为 5,019。角色 1146 修订随后由[新准备](evidence/a-download-gc-role-drift-fixture-accepted-20261021.json)完成 seed/跨平台及合并 owner seed 验证，产物已清理。[接收器同步](evidence/a-check-evidence-binding-receipt-readers-preparation-20261021.json)通过 59/43 项解析器与十五真实 CLI 拒绝；这些均不将原 owner 十过一败、角色九过一败或 D task 十五过三败改判成功。
