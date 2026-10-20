[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run,[switch]$PublicationFixtureRepairOnly)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prefix=Join-Path $PSScriptRoot ('a-download-deployment-'+$Run)
$owner=Join-Path $root ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $owner 'source'
$names=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS','PYTHONDONTWRITEBYTECODE');$saved=@{}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
foreach($suffix in @('-native.txt','-source.json','-templates.json','-packages.jsonl','-packages-stderr.txt','-linux-build.txt','-linux-build-stderr.txt')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing existing deployment evidence'}}
Start-Transcript -LiteralPath ($prefix+'-native.txt') -NoClobber|Out-Null
try {
    foreach($dir in @($owner,(Join-Path $owner 'cache'),(Join-Path $owner 'tmp'),(Join-Path $owner 'telemetry'))){[IO.Directory]::CreateDirectory($dir)|Out-Null}
    [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
    Write-Output ('LOCAL_OWNER download-deployment='+$owner)
    . (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
    $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
    $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8
    Write-Output ('LOCAL_SOURCE sha256='+$manifest.source_sha256+' files='+$manifest.files.Count)
    $templates=@('deployments/k8s/system-backup-capacity.template.json','deployments/k8s/system-backup-registration.template.json','deployments/k8s/system-backup-download.template.json','deployments/k8s/system-backup-download-sql-pins.template.json','scripts/system-backup-d-capacity-account.py','scripts/system-backup-d-capacity-account_test.py')
    $pins=Get-DIndexInputPins -Root $root -Files $templates
    foreach($pin in $pins){$target=Join-Path $source $pin.path;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null;Copy-Item -LiteralPath (Join-Path $root $pin.path) -Destination $target;if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Template copy drift'};(Get-Item -LiteralPath $target).IsReadOnly=$true}
    $pins|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-templates.json') -Encoding utf8
    if($PublicationFixtureRepairOnly){
        $baseline=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'a-download-deployment-20261020-r2-source.json') -Raw|ConvertFrom-Json
        if($manifest.files.Count -ne $baseline.files.Count){throw 'Repair source set changed; full gate required'}
        $old=@{};foreach($pin in $baseline.files){$old[$pin.path]=$pin}
        $changed=@()
        foreach($pin in $manifest.files){if(-not $old.ContainsKey($pin.path)){throw 'Repair input added; full gate required'};if($old[$pin.path].sha256 -ne $pin.sha256 -or $old[$pin.path].size -ne $pin.size){$changed+=$pin.path}}
        $expectedChanges=@('backend/internal/systembackupevidence/download_output_deadline_a_test.go','backend/internal/systembackupevidence/system_publication_test.go')
        if($changed.Count -ne $expectedChanges.Count -or @(Compare-Object $changed $expectedChanges).Count -ne 0){throw 'Repair changed beyond reviewed evidence tests; full gate required'}
        $oldPins=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'a-download-deployment-20261020-r2-templates.json') -Raw|ConvertFrom-Json
        if($pins.Count -ne $oldPins.Count){throw 'Repair extra input set changed; full gate required'}
        foreach($pin in $pins){$oldPin=@($oldPins|Where-Object path -eq $pin.path);if($oldPin.Count -ne 1 -or $oldPin[0].sha256 -ne $pin.sha256 -or $oldPin[0].size -ne $pin.size){throw 'Repair extra input changed; full gate required'}}
        Write-Output ('BASELINE retained-passing-packages=registration,security node=16 python=4 source_sha256='+$baseline.source_sha256+' only-changes=publication,download-output-deadline-tests')
    }
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64';$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry';$env:PYTHONDONTWRITEBYTECODE='1'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    if(-not $PublicationFixtureRepairOnly){foreach($file in @('system-backup-d-capacity-deployment.test.mjs','system-backup-d-deployment.test.mjs','system-backup-schema-diff.test.mjs')){
        & node (Join-Path $source ('scripts/'+$file)) 1>($prefix+'-'+$file+'.txt') 2>($prefix+'-'+$file+'-stderr.txt')
        if($LASTEXITCODE -ne 0){throw ('Node gate failed: '+$file)}
        Write-Output ('PASS node-suite='+$file)
    }
    & 'C:/Users/zhanghui08/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -B (Join-Path $source 'scripts/system-backup-d-capacity-account_test.py') 1>($prefix+'-python.txt') 2>($prefix+'-python-stderr.txt')
    if($LASTEXITCODE -ne 0){throw 'Capacity account unit gate failed; no actual account command invoked'}
    Write-Output 'PASS capacity-account-mocked-tests no-cluster-contact=yes'
    }
    Push-Location (Join-Path $source 'backend')
    try {
        $scope=if($PublicationFixtureRepairOnly){'evidence-publication-fixture-repair'}else{'registration-security-evidence'}
        [string[]]$packages=if($PublicationFixtureRepairOnly){@('./internal/systembackupevidence')}else{@('./cmd/system-backup-registration','./internal/systembackupsecurity','./internal/systembackupevidence')}
        Write-Output ('START '+$scope+' default-vet=yes dependencies-installed=no')
        & 'C:/Program Files/Go/bin/go.exe' test -json -count=1 -timeout=900s @packages 1>($prefix+'-packages.jsonl') 2>($prefix+'-packages-stderr.txt')
        if($LASTEXITCODE -ne 0){throw 'Registration/security/evidence deployment gate failed'}
        Write-Output ('PASS '+$scope)
        $env:GOOS='linux'
        & 'C:/Program Files/Go/bin/go.exe' build -o (Join-Path $owner 'download-registration') ./cmd/system-backup-registration 1>($prefix+'-linux-build.txt') 2>($prefix+'-linux-build-stderr.txt')
        if($LASTEXITCODE -ne 0){throw 'Linux download-enabled registration build failed'}
        Write-Output ('PASS linux-download-deployment-build sha256='+(Get-FileHash -LiteralPath (Join-Path $owner 'download-registration') -Algorithm SHA256).Hash.ToLowerInvariant())
    } finally {Pop-Location}
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $source $pin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Frozen deployment template drift'}}
    Write-Output 'LOCAL_PASS download-deployment-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote=not-run'
} finally {
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    if(Test-Path -LiteralPath $owner){$resolved=(Resolve-Path -LiteralPath $owner).Path;if([IO.Path]::GetDirectoryName($resolved) -ne $root -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -ne [IO.Path]::GetFileName($resolved)){throw 'Refusing unowned deployment cleanup'};Remove-Item -LiteralPath $resolved -Recurse -Force}
    Write-Output ('CLEANED download-deployment-source-cache-binary='+(-not(Test-Path -LiteralPath $owner)))
    Stop-Transcript|Out-Null
}
