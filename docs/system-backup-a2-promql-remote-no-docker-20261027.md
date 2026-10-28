# A2 PromQL 远测：远程无 Docker、无 promtool

本流程在本地从已有镜像提取 Linux `promtool`，连同原来的两份 fixture 上传。远程直接执行二进制，不需要 Docker、Prometheus 服务或联网。仍为 97 组、231 项检查，准备完成不表示测试通过。旧版交接记录保持其原来的输入和执行状态，本版入口如下。

## 1. 确认远程架构

由你在远程执行 `uname -s; uname -m`。本流程支持 Linux：`x86_64` 选 `amd64`，`aarch64` 选 `arm64`。镜像和二进制必须匹配远程架构。

## 2. 在本地准备测试包

本地 Docker 需要已启动，镜像需要由你提前准备好，建议版本与目标 Prometheus 一致。下面的脚本只使用已有镜像，不安装、不拉取、不启动 Docker，也不连接远程。镜像来源应为官方 `prom/prometheus` 或 `quay.io/prometheus/prometheus`；可传固定版本或本地镜像 ID，不建议用浮动的 `latest`。

本机 PowerShell：

```powershell
cd 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$image = Read-Host '输入本地已准备好的官方 Prometheus 镜像版本或 ID'
$prepared = .\scripts\system-backup-promql-prepare.ps1 -Image $image -Architecture amd64
```

如果已经从官方发行包或镜像中取出了 Linux `promtool`，本机也可以完全不用 Docker：

```powershell
$prepared = .\scripts\system-backup-promql-prepare.ps1 -PromtoolPath 'C:\Temp\promtool' -Architecture amd64
```

两种方式二选一；ARM64 远程机改用 `-Architecture arm64`。脚本检查 ELF 架构，创建唯一的 `outputs/cm-promql-<32位hex>` 目录，包含 `promtool`、`tool-origin.json`、`thresholds.yml`、`split.yml`、`run.sh`、`SHA256SUMS`。二进制 SHA256、镜像 ID/RepoDigests（镜像方式）写入来源记录。用于提取的容器不会启动，提取结束用 `docker rm -v` 清理容器和匿名卷。

## 3. 上传、执行、取回日志

继续在同一个本机 PowerShell 窗口执行：

```powershell
$d = $prepared.RemoteDirectory
$out = Join-Path (Get-Location) ('outputs/promql-results-' + ($d.Split('-')[-1]))
scp -r $prepared.BundlePath "root@10.130.14.23:$d"
if ($LASTEXITCODE -ne 0) { throw '上传失败，停止执行' }

ssh root@10.130.14.23 "chmod 700 '$d' && cd '$d' && sha256sum -c SHA256SUMS && bash -n run.sh && chmod u+x promtool && bash run.sh"
$testExit = $LASTEXITCODE

scp -r "root@10.130.14.23:$d/results" $out
if ($LASTEXITCODE -ne 0) { throw '日志取回失败，保留远程目录供排查' }
"测试退出码：$testExit；日志目录：$out"

# 日志取回成功后，只清理本次唯一远程测试目录。
if ($d -match '^/tmp/cm-promql-[0-9a-f]{32}$') {
    ssh root@10.130.14.23 "rm -rf -- '$d'"
    if ($LASTEXITCODE -ne 0) { throw '远程目录清理失败' }
}

# 清理本地准备包，包括提取出的工具；保留上面 $out 中的测试日志。
$localBundle = [IO.Path]::GetFullPath($prepared.BundlePath)
$expectedParent = [IO.Path]::GetFullPath((Join-Path (Get-Location) 'outputs'))
if ([IO.Path]::GetDirectoryName($localBundle) -ne $expectedParent -or [IO.Path]::GetFileName($localBundle) -notmatch '^cm-promql-[0-9a-f]{32}$') { throw '拒绝清理非本次准备包路径' }
foreach ($item in @((Get-Item -LiteralPath $localBundle -Force)) + @(Get-ChildItem -LiteralPath $localBundle -Recurse -Force)) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '拒绝清理重定向路径' }
}
Remove-Item -LiteralPath $localBundle -Recurse -Force
```

每次重新准备会生成新目录，避免覆盖已有 `results/`。远程临时工作目录在脚本退出时清理；日志先取回，再清理远程目录和本地准备包。手动准备的 Docker 镜像保留，由你按需管理。

回传 `$out` 下的原始日志：`summary.txt`、`version.log`、`runtime.txt`、`payload.sha256`、`checksums.log`、`tool-origin.json`、`thresholds.yml.log`、`split.yml.log`。只有两份 fixture 的退出码均为 0、日志保存成功且最终 `RESULT=PASS` 才表示本次表达式检查通过；工具缺失、架构错误、校验失败及运行失败均不能算 PASS。这里不加载生产规则、不连接业务服务。

官方依据：[镜像中的 /bin/promtool](https://github.com/prometheus/prometheus/blob/main/Dockerfile)、[从未启动的容器复制文件](https://docs.docker.com/reference/cli/docker/container/cp/)、[promtool 规则单元测试](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/)。
