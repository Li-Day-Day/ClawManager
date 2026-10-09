[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$historyRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$historyScratch=Join-Path $historyRoot ('.tmp-d-history-'+[guid]::NewGuid().ToString('N'))
$historyNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$historySaved=@{}
foreach($name in $historyNames){$historySaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
    foreach($folder in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $historyScratch $folder))|Out-Null}
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $historyScratch 'cache';$env:GOTMPDIR=Join-Path $historyScratch 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $historyScratch 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    Push-Location (Join-Path $historyRoot 'backend')
    try {
        & go test -vet=off -count=1 ./internal/db ./cmd/system-backup-migrate
        if($LASTEXITCODE -ne 0){throw 'Migration history tests failed; dependency download disabled'}
        & go vet ./internal/db ./cmd/system-backup-migrate
        if($LASTEXITCODE -ne 0){throw 'Migration history vet failed; dependency download disabled'}
        $env:GOOS='linux'
        & go test -c -tags systembackup_integration -o (Join-Path $historyScratch 'history-mysql.test') ./internal/db
        if($LASTEXITCODE -ne 0){throw 'Linux history MySQL probe compilation failed'}
        & go build -o (Join-Path $historyScratch 'system-backup-migrate') ./cmd/system-backup-migrate
        if($LASTEXITCODE -ne 0){throw 'Linux migration build failed'}
        Write-Output ('LINUX_RUNNER_SHA256='+((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $historyScratch 'system-backup-migrate')).Hash.ToLowerInvariant()))
        Write-Output ('LINUX_PROBE_SHA256='+((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $historyScratch 'history-mysql.test')).Hash.ToLowerInvariant()))
        Write-Output 'PASS history-review-tests-and-linux-migration-build'
    } finally {Pop-Location}
} finally {
    foreach($name in $historyNames){[Environment]::SetEnvironmentVariable($name,$historySaved[$name],'Process')}
    if(Test-Path -LiteralPath $historyScratch){
        $historyResolved=(Resolve-Path -LiteralPath $historyScratch).Path
        if(-not $historyResolved.StartsWith($historyRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($historyResolved) -notmatch '^\.tmp-d-history-[a-f0-9]{32}$'){throw 'Refusing cleanup outside owned history scratch'}
        Remove-Item -LiteralPath $historyResolved -Recurse -Force
    }
    Write-Output ('CLEANED history-validation-build-cache='+(-not(Test-Path -LiteralPath $historyScratch)))
}
