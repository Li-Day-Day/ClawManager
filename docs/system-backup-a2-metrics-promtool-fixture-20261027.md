# A2：原始时序 PromQL fixture（未执行）

按[官方 promtool 格式](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/)准备 59 组原始时序、117 个表达式检查，精确绑定九式组合候选及原表达式负控，另保留合法 task status="failed"。包含跨标签阈值边界、低于阈值、单序列、counter reset、空 series、存在但全零 series，以及六种合法 metric_result。

本地只完成既有 js-yaml 的结构往返检查，未执行 promtool、PromQL、真实 increase 或规则加载；所有 exp_samples 仍是待实际 evaluator 验证的预期，不记 PASS。原始 reset 数据含明确下降，前两分钟为零以避免依赖左边界外推；increase 的去名/重置预期参考 Prometheus 原测试，不以本地算术代替执行。

具备受控 promtool 后可运行：`promtool test rules docs/evidence/a2-metrics-promtool-raw-series-20261027-r2.yml`。届时记录实际二进制版本/SHA、完整 stdout/stderr 与退出码，修正不成立的预期后重新评审；不得把本 source-ready 记录当成运行回执。fixture 的 rule_files 为空，只评估表达式，不装载候选生产 YAML。

准确原输入、候选 SHA、每组表达式绑定及未执行标记见[机器清单](evidence/a2-metrics-promtool-fixture-source-ready-20261027-r2.json)。复核：`node docs/evidence/a2-metrics-promtool-fixture-20261027.mjs --check`；此命令仍只核源码、YAML结构和绑定。

2026-10-27：用户自行在 `root@10.130.14.23` 执行，A2 不连接远程机。新增 split fixture 为 38 组/114 项，两份合计 97 组/231 项待执行检查。小包在 `docs/evidence/a2-promql-remote-bundle-20261027/`，含 thresholds.yml、split.yml、run.sh、SHA256SUMS；上传后先核 SHA 和 Bash 语法，再执行已有 promtool 或已缓存的官方 Prometheus 镜像。脚本不安装、不拉取、不启动 daemon；容器 network=none、只读根文件系统，临时目录和本次命名容器退出时清理。

在本机 PowerShell 执行：

```powershell
cd 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$d = "/tmp/cm-promql-$([guid]::NewGuid().ToString('N'))"
$out = ".\docs\evidence\promql-remote-results-$($d.Split('-')[-1])"

scp -r .\docs\evidence\a2-promql-remote-bundle-20261027 "root@10.130.14.23:$d"
if ($LASTEXITCODE -ne 0) { throw '上传失败' }

ssh root@10.130.14.23 "chmod 700 '$d' && cd '$d' && sha256sum -c SHA256SUMS && bash -n run.sh && bash run.sh"
$testExit = $LASTEXITCODE

scp -r "root@10.130.14.23:$d/results" $out
if ($LASTEXITCODE -eq 0 -and $d -match '^/tmp/cm-promql-[0-9a-f]{32}$') {
    ssh root@10.130.14.23 "rm -rf -- '$d'"
}
"测试退出码：$testExit；日志目录：$out"
```

请回传 results 的原始文件：summary.txt、version.log、runtime.txt、payload.sha256、thresholds.yml.log、split.yml.log。`NEED_RUNTIME`/退出3表示未找到已有工具或缓存镜像，不是用例通过；先回传该输出，不安装依赖。

本机沙箱首次 Bash -n 因 signal pipe/Win32 error 5 未完成解析；D1 随后以允许的只读语法执行方式实际得到0，见[独立语法回执](evidence/d1-promql-bundle-bash-syntax-20261027.json)。它没有执行脚本、SSH 或 PromQL，不覆盖任何远程预期。

上文 r2 builder 的 --check 锁定原始99条来源及原note完整字节；新增本段后该历史命令不作为新bundle的当前检查。原note已精确保存在[历史note](evidence/a2-metrics-promtool-fixture-original-note-20261027-r2.md.txt)，旧fixture/builder/source-ready均未改写。新bundle按SHA256SUMS及[handoff记录](evidence/a2-promql-human-remote-handoff-20261027.json)绑定，仍是 prepared、不是执行PASS。
