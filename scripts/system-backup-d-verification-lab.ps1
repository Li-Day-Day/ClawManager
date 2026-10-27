param([switch]$Smoke)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$owned = Join-Path $repo ('.verification-lab-' + [guid]::NewGuid().ToString('N'))
$backendProcess = $null
$webProcess = $null
$saved = @{}
$names = @('GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','VERIFICATION_LAB_CACHE','VERIFICATION_LAB_URL')
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
try {
    $vite = Join-Path $repo 'frontend/node_modules/vite/bin/vite.js'
    if (!(Test-Path -LiteralPath $vite)) { throw '缺少已有前端依赖；请由环境负责人准备。本脚本不会安装依赖。' }
    # Fail before building if either fixed demo port already belongs to another process.
    foreach ($port in @(19031,19032)) {
        $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
        try { $probe.Start() } finally { $probe.Stop() }
    }
    New-Item -ItemType Directory -Path $owned | Out-Null
    $env:GOTOOLCHAIN='local'; $env:GOPROXY='off'; $env:GOSUMDB='off'
    $env:GOCACHE=Join-Path $owned 'go-cache'; $env:GOTMPDIR=Join-Path $owned 'go-tmp'
    $env:VERIFICATION_LAB_CACHE=Join-Path $owned 'vite-cache'
    New-Item -ItemType Directory -Path $env:GOTMPDIR | Out-Null
    $binary = Join-Path $owned 'verification-lab.exe'
    Write-Host '正在使用已有依赖编译本地 A 校验服务；本次构建和缓存将在停止后清理。'
    Push-Location (Join-Path $repo 'backend')
    try {
        & go build -mod=readonly -o $binary ./cmd/system-backup-verification-lab
        if ($LASTEXITCODE -ne 0) { throw '测试服务构建失败。需要已有 Go 工具链和模块缓存；未安装或下载依赖。' }
    } finally { Pop-Location }
    $registry = Join-Path $repo 'contracts/system-backup/v12/schema-registry.json'
    $backendProcess = Start-Process -FilePath $binary -ArgumentList @('-registry',('"' + $registry + '"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $owned 'backend.out') -RedirectStandardError (Join-Path $owned 'backend.err')
    $webProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList @(('"' + $vite + '"'),'--config','vite.verification-lab.config.ts','--configLoader','native') -WorkingDirectory (Join-Path $repo 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $owned 'web.out') -RedirectStandardError (Join-Path $owned 'web.err')
    $ready = $false
    for ($attempt=0; $attempt -lt 80; $attempt++) {
        if ($backendProcess.HasExited -or $webProcess.HasExited) { throw ('测试进程退出。' + (Get-Content -LiteralPath (Join-Path $owned 'backend.err'),(Join-Path $owned 'web.err') -Raw)) }
        try { $null = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:19032/verification-lab/state' -TimeoutSec 1; $ready=$true; break } catch { Start-Sleep -Milliseconds 250 }
    }
    if (!$ready) { throw '测试服务未在限定时间内就绪。' }
    if ($Smoke) {
        $null = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:19032/verification-lab.html' -TimeoutSec 5
        $env:VERIFICATION_LAB_URL='http://127.0.0.1:19031'
        & node --test (Join-Path $repo 'frontend/scripts/system-backups-verification-lab.test.mjs')
        if ($LASTEXITCODE -ne 0) { throw '独立入口 HTTP/合同/下载回归失败。' }
        return
    }
    Write-Host '打开 http://127.0.0.1:19032/verification-lab.html'
    Write-Host '准备数据 → 执行校验 → 任务详情/检查项 → 下载并保存报告 → 重置演示。'
    Write-Host '仅本机合成数据，A 校验代码真实执行。按 Ctrl+C 停止并清理本次构建及缓存。'
    while (!$backendProcess.HasExited -and !$webProcess.HasExited) { Start-Sleep -Milliseconds 500 }
} finally {
    foreach ($process in @($webProcess,$backendProcess)) { if ($null -ne $process -and !$process.HasExited) { Stop-Process -Id $process.Id -Force; $process.WaitForExit() } }
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
    $resolved = [IO.Path]::GetFullPath($owned)
    if ([IO.Path]::GetDirectoryName($resolved) -ne $repo -or [IO.Path]::GetFileName($resolved) -notmatch '^\.verification-lab-[0-9a-f]{32}$') { throw '拒绝清理非本次测试目录。' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
