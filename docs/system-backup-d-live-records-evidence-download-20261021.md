# D 真实记录页与证据下载接线

本轮负责前端，与另一个 D 的 prune/成本汇总、A 的现场登录/MFA/下载审计验证并行。没有修改 backend、正式迁移、共享机器合同、角色批准或部署开关；只使用仓库已有依赖。

## 已完成的页面流程

真实记录工作区继续独立读取配置、四类任务及 Operation，不依赖总览成功，不把 503 当作空记录。任务列表增加真实配置版本与更新时间。

以下入口可打开证据下载表单：

1. 任务详情的“事件”中，带有 `evidence_public_id` 的记录。事件读取独立于完整详情，因此完整详情未就绪时仍可使用已返回的事件证据。
2. Operation 详情中的 evidence 目标。
3. 完整任务详情的 verifier report 引用。
4. 工作区独立表单中手动填写已有记录中的证据 ID。

记录入口固定原证据 ID 与安装身份，工作区手动入口不从未知状态推断安装或健康。示例页面没有下载入口。

默认勾选密码/TOTP 二次验证。管理员填写当前账户密码和已绑定的六位验证码后，客户端先调用已有的 `POST /api/v1/admin/system-backup-strong-auth/proof`，再用原 evidence ID、同一 Idempotency-Key 和返回的 `X-Strong-Auth-Proof` 调用 `GET /api/v1/admin/system-backup-evidence/{id}`。只下载完整、最多 8 MiB 的响应，不做 Range 分段、自动重试或静默刷新会话。public/internal 证据可由用户显式取消二次验证选项，敏感证据仍由服务端拒绝无 proof 请求。

客户端核对响应 no-store、attachment、允许的媒体类型、完整长度、强 ETag SHA-256、敏感准入 Operation ID，并对有界接收的实际正文重新计算 SHA-256。通过后显示文件大小、摘要、关联 Operation ID 和“保存文件”。文件名由所选 evidence ID 生成，Blob 按附件处理（`application/octet-stream`），不直接渲染正文。Operation ID 表示下载准入关联，不据此宣称服务端最终审计或客户端持久保存已经完成。

密码、验证码和 proof 不新增持久化，不放入 URL 或错误文案；登录 token 仅沿用应用现有存储。请求失败、会话变化、取消和迟到响应不会释放可保存文件。关闭/换记录/清除结果会取消请求并撤销 Blob URL；45 秒后停止本次等待。收到文件后保存前再次检查登录会话。失败须由用户重新发起并使用新的验证码。

## 在真实安装中使用

前端构建须同时设置：

```text
VITE_SYSTEM_BACKUP_LIVE_READ=1
VITE_SYSTEM_BACKUP_EVIDENCE_DOWNLOAD=1
```

开关均保持显式 opt-in，本轮没有为任何部署启用它们。管理页面必须通过 HTTPS 访问；`VITE_API_URL` 必须与页面同源，默认 `/api/v1`。将既有 read 路由接到已授权读取服务，将 strong-auth proof/evidence 路由接到 A 受审的下载运行时；上游 TLS、实际账号/session、已绑定人员 TOTP、SQL 权限、provider、密钥、独立审计卷和容量仍由对应运行时配置。代理须保留 no-store、Content-Length、ETag、Content-Disposition、Operation ID 和原始响应内容，不能把缺失能力改成伪成功。

现场操作顺序：登录管理页面 → 在真实任务事件或 evidence Operation 中选择证据 → 填写密码与新动态验证码 → 请求下载 → 核对文件就绪状态、摘要和 Operation ID → 保存文件 → 按 A 的现场工具核对同一 Operation 的 intent/result 审计。

如果 read 或下载运行时未就绪，页面保留对应 unavailable/错误提示；不得据本轮前端构建或本地夹具声称现场已部署。当前 A 的现场盘点仍在推进，独立下载服务/journal 卷及真实审计链路没有由本轮验收。

## 验证

- 新增 37 项下载测试；系统备份相关前端测试合计 **286 项通过，零失败、零跳过**。覆盖精确请求、MFA/普通模式、会话变化、取消、迟到结果、错误脱敏、响应头、截断/超限、摘要、Operation ID、同源 HTTPS 和五语言。
- 应用与 Vite 配置 TypeScript 检查通过；新增三个生产文件 ESLint 通过。使用原有依赖和项目配置完成最终 Vite 生产构建，保留既有大 chunk 提示。
- 本地 IAB 浏览器使用明确标识的 synthetic harness 验证 MFA、普通模式、服务未就绪、坏摘要、实际 HTTP 拒绝、取消、清除结果、五语言及 375 px 无横向溢出。最终版本实际点击“保存文件”，得到 35 字节测试 JSON，文件摘要与页面一致；该下载文件已独立核对并删除。未使用真实密码/OTP，没有连接现场运行时。
- 初次 Node 子进程入口 EPERM、Vite runner 的 CJS 格式错误，以及错误工作目录造成的 Tailwind content 警告保留。分别改用 Node 进程内测试、native config loader 和正确 frontend 工作目录后通过，没有安装或修改依赖。

见[本轮限定回执](evidence/d-evidence-download-frontend-accepted-20261021.json)、[浏览器验证记录](evidence/d-evidence-download-browser-20261021.json)、[实际保存文件清理](evidence/d-evidence-download-browser-file-cleanup-20261021.json)和[构建/服务清理](evidence/d-evidence-download-frontend-cleanup-20261021.json)。本轮临时服务器、浏览器页、产物、缓存、tsbuildinfo 与 harness 全部清理，仅保留实现、测试源码和验证记录。
