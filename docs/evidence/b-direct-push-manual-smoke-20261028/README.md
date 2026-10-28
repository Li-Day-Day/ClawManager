# 直接整合与手动安装冒烟拆分验证

父版本：功能 `47f3d0114a898c6446e9b04a3ffd54d6ae50b9e7` 与公共 `2ed5e284eb8b0e73fdb286b0dff9eb217b6f5c5b`。用户已重新授权直接提交、普通 push 到原仓库 backup，不经 PR 合入；本轮不修改保护设置、不强推。

本轮仅增量调整安装检查：从通用 Build 拆出独立手动 workflow，保留通用构建和离线测试；TLS 准备不变，镜像由每次手动输入的 release tag 或可选 digest 提供，实际拉取失败不部署，不引入全仓库必填变量。

| 验证 | 原始日志 | 结果 |
| --- | --- | --- |
| Python/OpenSSL fixture | fixture-tests.log | 7 项通过；测试使用合成镜像引用离线渲染，没有镜像拉取、数据库或集群。 |
| 工作流边界/YAML/Bash | workflow-tests.log | 3 项通过；复用已有 frontend js-yaml 和 Git Bash，无依赖安装。通用 Build 不含 K8s/MinIO 输入，手动 job 无通用构建依赖，先 pull 后建集群、清理和原健康检查保留。 |

准确命令与退出码见 check-exits.json；源码 pin 见 source-pin.json；上一轮受测 Go 源码的逐文件 hash 复核见 reused-go-source-check.json。原 A/B 全包和 D controller 定向测试结果只在对应源码不变时复用，不据此推导全量后端或 CI 成功。

上一轮最初 13 包中 4 包因循环依赖失败，修复后受影响范围通过；Node 清单同步迭代后来按收窄范围撤回，所有这些原始记录仍保留，不作为当前 freshness 成功证据。本轮公共 inventory/registry/catalog 的已知同步缺口未更改，普通 freshness 仍失败。准确安装与功能边界及后续集群清单见 [交付说明](../../system-backup-install-smoke-and-acceptance-20261028.md)。

**目前完成了测试环境准备代码和离线验证，尚未证明 K8s 部署成功，更没有证明公共备份恢复整链通过。** 未执行手动 workflow、真实迁移、生产写入或依赖安装。新 Python 测试临时目录及证书由其 finally 清理，使用 -B 未产出 pycache。本轮未新建 Go cache/binary；此前清理被自动审批以 blocked by policy 拒绝的旧 cache/tmp 保持原状，没有换工具绕过，也未删除其他 owner 产物。
