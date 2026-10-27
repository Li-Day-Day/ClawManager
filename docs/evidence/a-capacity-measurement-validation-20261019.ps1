[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prefix=Join-Path $PSScriptRoot ('a-capacity-measurement-'+$Run)
$owner=Join-Path $root ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $owner 'source'
$names=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$saved=@{}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
foreach($suffix in @('-native.txt','-source.json','-templates.json','-packages.jsonl','-packages-stderr.txt','-linux-build.txt','-linux-build-stderr.txt')){
    if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing to overwrite validation evidence'}
}
Start-Transcript -LiteralPath ($prefix+'-native.txt') -NoClobber | Out-Null
try {
    [IO.Directory]::CreateDirectory($owner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
    Write-Output ('LOCAL_OWNER capacity-measurement='+$owner)
    . (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
    $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8
    Write-Output ('LOCAL_SOURCE sha256='+$manifest.source_sha256+' files='+$manifest.files.Count)
    $templates=@('deployments/k8s/system-backup-capacity.template.json','deployments/k8s/system-backup-registration.template.json')
    $pins=Get-DIndexInputPins -Root $root -Files $templates
    foreach($pin in $pins){
        $target=Join-Path $source $pin.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        Copy-Item -LiteralPath (Join-Path $root $pin.path) -Destination $target
        if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Template copy drift'}
        (Get-Item -LiteralPath $target).IsReadOnly=$true
    }
    $pins | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ($prefix+'-templates.json') -Encoding utf8
    foreach($dir in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64'
    $env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    foreach($file in @('system-backup-d-capacity-deployment.test.mjs','system-backup-d-deployment.test.mjs','system-backup-schema-diff.test.mjs')){
        $nodeLog=$prefix+'-'+$file+'.txt'
        $nodeErr=$prefix+'-'+$file+'-stderr.txt'
        if((Test-Path -LiteralPath $nodeLog) -or (Test-Path -LiteralPath $nodeErr)){throw 'Refusing Node evidence overwrite'}
        & node (Join-Path $source ('scripts/'+$file)) 1>$nodeLog 2>$nodeErr
        if($LASTEXITCODE -ne 0){throw ('Node gate failed: '+$file)}
        Write-Output ('PASS node-suite='+$file+' exit=0')
    }
    Push-Location (Join-Path $source 'backend')
    try {
        Write-Output 'START full-security-registration default-vet=yes dependencies-installed=no'
        & 'C:/Program Files/Go/bin/go.exe' test -json -count=1 ./internal/systembackupsecurity ./cmd/system-backup-registration 1>($prefix+'-packages.jsonl') 2>($prefix+'-packages-stderr.txt')
        if($LASTEXITCODE -ne 0){throw 'Full security/registration gate failed'}
        Write-Output 'PASS full-security-registration'
        $env:GOOS='linux'
        & 'C:/Program Files/Go/bin/go.exe' build -o (Join-Path $owner 'capacity-registration') ./cmd/system-backup-registration 1>($prefix+'-linux-build.txt') 2>($prefix+'-linux-build-stderr.txt')
        if($LASTEXITCODE -ne 0){throw 'Linux collector build failed'}
        Write-Output ('PASS linux-collector-build sha256='+(Get-FileHash -LiteralPath (Join-Path $owner 'capacity-registration') -Algorithm SHA256).Hash.ToLowerInvariant())
    } finally {Pop-Location}
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $source $pin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Frozen template drift'}}
    Write-Output 'LOCAL_PASS capacity-measurement-frozen-postcheck=yes remote=not-run default-vet=yes dependencies-installed=no'
} finally {
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    if(Test-Path -LiteralPath $owner){
        $resolved=(Resolve-Path -LiteralPath $owner).Path
        if([IO.Path]::GetDirectoryName($resolved) -ne $root -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
            ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -ne [IO.Path]::GetFileName($resolved)){throw 'Refusing unowned validation cleanup'}
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Write-Output ('CLEANED capacity-measurement-source-cache-binary='+(-not(Test-Path -LiteralPath $owner)))
    Stop-Transcript | Out-Null
}
