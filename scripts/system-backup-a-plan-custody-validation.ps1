$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskID = [Guid]::NewGuid().ToString('N')
$taskOwner = Join-Path $taskRoot ('.tmp-a-plan-custody-' + $taskID)
$taskLog = Join-Path $taskRoot ('docs/evidence/a-plan-custody-' + $taskID)
$taskVars = @('GOCACHE','GOTMPDIR','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOFLAGS','GOWORK','GOOS','GOARCH','CGO_ENABLED','GOMAXPROCS','TMP','TEMP','TEST_TELEMETRY_DIR')
$taskSaved = @{}
foreach ($name in $taskVars) { $taskSaved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$report = [ordered]@{status='running';cleanup=$false;dependencies_installed=$false;actual_sql=$false;actual_provider=$false}
try {
    New-Item -ItemType Directory -Path $taskOwner | Out-Null
    [IO.File]::WriteAllText((Join-Path $taskOwner 'owner.txt'), $taskID)
    $paths = @('backend/go.mod','backend/go.sum')
    foreach ($package in @('systembackupplancustody','systembackup/staging','systembackupdispatch')) {
        $paths += @(Get-ChildItem -LiteralPath (Join-Path $taskRoot ('backend/internal/' + $package)) -Filter '*.go' -File | ForEach-Object { [IO.Path]::GetRelativePath($taskRoot, $_.FullName) })
    }
    $report.inputs = @($paths | ForEach-Object {
        $source = Join-Path $taskRoot $_
        $target = Join-Path (Join-Path $taskOwner 'source') $_
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        Copy-Item -LiteralPath $source -Destination $target
        $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
        if ($hash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) { throw 'Source changed during snapshot' }
        @{path=$_;sha256=$hash}
    })
    $env:GOCACHE = Join-Path $taskOwner 'cache'
    $env:GOTMPDIR = Join-Path $taskOwner 'tmp'
    $env:TMP = $env:GOTMPDIR; $env:TEMP = $env:GOTMPDIR
    $env:TEST_TELEMETRY_DIR = Join-Path $taskOwner 'telemetry'
    foreach ($dir in @($env:GOCACHE,$env:GOTMPDIR,$env:TEST_TELEMETRY_DIR)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'), 'off')
    $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOWORK='off'
    $env:GOFLAGS='-mod=readonly -p=2'; $env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'; $env:GOMAXPROCS='2'
    Push-Location (Join-Path $taskOwner 'source/backend')
    try {
        & go test -json -count=1 -timeout=120s ./internal/systembackupplancustody *> ($taskLog + '.jsonl')
        $report.native_exit = $LASTEXITCODE
        if ($LASTEXITCODE -ne 0) { throw 'Plan custody tests failed' }
        $env:GOOS='linux'
        & go test -c -o (Join-Path $taskOwner 'plan-custody.test') ./internal/systembackupplancustody *> ($taskLog + '.linux.log')
        $report.linux_compile_exit = $LASTEXITCODE
        if ($LASTEXITCODE -ne 0) { throw 'Linux compilation failed' }
    } finally { Pop-Location }
    $report.changed_inputs = @($report.inputs | Where-Object { (Get-FileHash -LiteralPath (Join-Path $taskRoot $_.path) -Algorithm SHA256).Hash -ne $_.sha256 } | ForEach-Object { $_.path })
    $report.status = 'passed_for_snapshot'
} catch {
    $report.status='failed'; $report.failure=$_.Exception.Message
} finally {
    foreach ($name in $taskVars) { [Environment]::SetEnvironmentVariable($name, $taskSaved[$name], 'Process') }
    $absolute = [IO.Path]::GetFullPath($taskOwner)
    if ([IO.Path]::GetDirectoryName($absolute) -cne $taskRoot -or [IO.Path]::GetFileName($absolute) -cne ('.tmp-a-plan-custody-' + $taskID)) { throw 'Cleanup boundary mismatch' }
    if (Test-Path -LiteralPath $absolute) {
        if ((Get-Item -LiteralPath $absolute).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected owner' }
        if ([IO.File]::ReadAllText((Join-Path $absolute 'owner.txt')) -cne $taskID) { throw 'Owner mismatch' }
        Remove-Item -LiteralPath $absolute -Recurse -Force
    }
    $report.cleanup = -not (Test-Path -LiteralPath $absolute)
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($taskLog + '.json') -Encoding utf8
    Write-Output ($taskLog + '.json')
}
if ($report.status -ne 'passed_for_snapshot' -or -not $report.cleanup) { exit 1 }
