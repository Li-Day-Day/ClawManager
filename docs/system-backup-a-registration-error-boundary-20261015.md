# A：强认证与 provider 注册错误边界

本项修订 `registrationBoundaryError`、`registrationHTTPError` 及 `VerificationError.Unwrap`。配置 mutation 和 provider registration 复用前一边界，因此需要在部署接线前确保上游失败只能产生闭集、可安全遍历的错误。

后续[公开合同对齐](system-backup-a-registration-contract-alignment-20261015.md)发现本页当时保留的 403/409 强认证映射与 v12 不一致，已改为合同规定的 401，并补 required、provider 409 及机器 JSON parity。本页计数和代码指纹仍保留其历史范围；下方旧状态码不再代表当前公开接收结论。

## 修订

代码检查发现两处未闭合行为：

- `registrationBoundaryError` 原来仅凭 `errors.As` 取得 `*VerificationError`，就复制其任意 `Code`；类型化错误没有证明字符串属于合同闭集。现在只保留四种已定义代码，其余返回固定 unavailable，并丢弃上游 cause。
- 类型存在但值为空的 `*VerificationError` 或 `*ProviderProofError` 也可以装入非 nil 的 error interface。`errors.As` 可能成功却返回 nil 指针；旧边界直接读 Code 会 panic，`errors.Is` 遍历 nil VerificationError 时也可能通过 Unwrap panic。现在 nil Unwrap 返回 nil，两个边界都在解引用前检查指针。

现有 HTTP mapper 原本就没有公开未知强认证代码；本次补齐更早的内部错误收敛和 nil 遍历，保持其闭集语义：invalid/invalid_issuer/expired 为 403，replayed 为 409，权限拒绝为 403。未知强认证分类、普通私有错误及 typed nil 为 503，对外沿用 `not_ready` 与固定 `provider_registration_unavailable` reason、`Retry-After: 1`。provider 校验错误的既有映射保持不变，包括未知 provider code 收敛为 `signature_invalid`。

## 验证

新测试包括 17 项内部边界场景、相同 17 项实际 HTTP + registration service 场景，以及一个标准 error traversal 用例。场景覆盖四种已知强认证代码及其 wrapped 形式、空/私有文本/64KiB/非法 UTF-8 未知代码、typed nil 与 wrapped nil、普通私有错误和权限拒绝。HTTP 用例由真实服务在当前 authority 回调处失败，要求零提交、无持久化结果、`no-store` 与准确 JSON/状态码，不能仅测一个重复实现的转换器。

本轮使用[专用冻结入口](../scripts/system-backup-a-registration-error-boundary-validation.ps1)，先跑新增定向，再运行完整 security/config 两包，保留默认 vet，禁止依赖下载，结束后删除本轮源码副本、cache/tmp/telemetry 和产物。SQL 与认证主体是模型，不证明实际 provider、生产权限或真实数据库锁。

本地门禁已通过，见[完整输出](evidence/a-registration-error-boundary-local-20261015.txt)、[固定输入](evidence/a-registration-error-boundary-source-20261015.json)及[增量接收记录](evidence/a-registration-error-boundary-review-20261015.json)。1,204 项输入摘要为 `5dd44a332d7b5f817a45f0db05f2f09904afc5c8a981e33297d7e63387b33304`；定向 3 主测试/34 子用例（1.758 秒）通过。完整 security 为 148/757（39.445 秒）、config 为 15/84（4.734 秒），合计 163 个主测试、841 个子用例（1,004 项）全部通过，默认 vet、退出 0、无工具重试。定向重复覆盖不另加总。

冻结源码测试后复核通过，五项本轮实现/测试/入口仍匹配。D 后续 preparation、transaction 与 transaction test 三项漂移不据本轮冻结回归接收。准确目录 `.tmp-a-evidence-56f62c9db45b47bf9aedc7fdc7560aac` 和 `.tmp-d-index-cache-05cbfbf305124b9da4d495f2d4cf41a5` 及源码、cache/tmp/telemetry、产物已删除，并独立确认不存在。

本轮三份生产源码使用新指纹作增量接收，不修改原 A 合同或历史签收指纹，不构成人工/部署批准。未安装依赖、执行远测或真实 SQL；没有签发实际安装写授权、部署配置 HTTP 或完成旧 canonical 回填。此前 proof MySQL 专项仍待操作者回传。
