[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prefix=Join-Path $PSScriptRoot ('a-download-runtime-journal-'+$Run)
$owner=Join-Path $root ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $owner 'source'
$names=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$saved=@{}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
foreach($suffix in @('-native.txt','-source.json','-packages.jsonl','-packages-stderr.txt','-linux-build.txt','-linux-build-stderr.txt')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing to overwrite evidence'}}
Start-Transcript -LiteralPath ($prefix+'-native.txt') -NoClobber | Out-Null
try {
    [IO.Directory]::CreateDirectory($owner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
    Write-Output ('LOCAL_OWNER download-runtime-journal='+$owner)
    . (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
    $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8
    Write-Output ('LOCAL_SOURCE sha256='+$manifest.source_sha256+' files='+$manifest.files.Count)
    foreach($dir in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    Push-Location (Join-Path $source 'backend')
    try {
        Write-Output 'START security-evidence default-vet=yes dependencies-installed=no'
        & 'C:/Program Files/Go/bin/go.exe' test -json -count=1 -timeout=900s ./internal/systembackupsecurity ./internal/systembackupevidence 1>($prefix+'-packages.jsonl') 2>($prefix+'-packages-stderr.txt')
        if($LASTEXITCODE -ne 0){throw 'Security/evidence gate failed'}
        Write-Output 'PASS security-evidence'
        $env:GOOS='linux'
        & 'C:/Program Files/Go/bin/go.exe' test -c -o (Join-Path $owner 'download-runtime.test') ./internal/systembackupevidence 1>($prefix+'-linux-build.txt') 2>($prefix+'-linux-build-stderr.txt')
        if($LASTEXITCODE -ne 0){throw 'Linux download runtime compilation failed'}
        Write-Output ('PASS linux-download-runtime-build sha256='+(Get-FileHash -LiteralPath (Join-Path $owner 'download-runtime.test') -Algorithm SHA256).Hash.ToLowerInvariant())
    } finally {Pop-Location}
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    Write-Output 'LOCAL_PASS download-runtime-journal-frozen-postcheck=yes remote=not-run default-vet=yes dependencies-installed=no'
} finally {
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    if(Test-Path -LiteralPath $owner){
        $resolved=(Resolve-Path -LiteralPath $owner).Path
        if([IO.Path]::GetDirectoryName($resolved) -ne $root -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -ne [IO.Path]::GetFileName($resolved)){throw 'Refusing unowned validation cleanup'}
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Write-Output ('CLEANED download-runtime-journal-source-cache-binary='+(-not(Test-Path -LiteralPath $owner)))
    Stop-Transcript | Out-Null
}
