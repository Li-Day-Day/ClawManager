[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prefix=Join-Path $PSScriptRoot ('a-download-k8s-'+$Run)
$owner=Join-Path $root ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $owner 'source'
foreach($suffix in @('-native.txt','-source.json','-templates.json','-download.txt','-download-stderr.txt','-base.txt','-base-stderr.txt')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing existing Kubernetes composition evidence'}}
Start-Transcript -LiteralPath ($prefix+'-native.txt') -NoClobber|Out-Null
try {
    [IO.Directory]::CreateDirectory($owner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
    Write-Output ('LOCAL_OWNER download-k8s='+$owner)
    . (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
    $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
    $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8
    Write-Output ('LOCAL_SOURCE sha256='+$manifest.source_sha256+' files='+$manifest.files.Count)
    $goManifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'a-download-process-20261020-r1-source.json') -Raw|ConvertFrom-Json
    $goPins=@{};foreach($pin in $goManifest.files){$goPins[$pin.path]=$pin}
    foreach($pin in $manifest.files|Where-Object {$_.path.StartsWith('backend/cmd/system-backup-registration/')}){if(-not $goPins.ContainsKey($pin.path) -or $goPins[$pin.path].sha256 -ne $pin.sha256){throw 'Composition command drifted from tested Go source'}}
    Write-Output ('GO_BINDING registration-command-current=yes source_sha256='+$goManifest.source_sha256)
    $files=@('deployments/k8s/system-backup-registration.template.json','deployments/k8s/system-backup-download.template.json','deployments/k8s/system-backup-download-sql-pins.template.json')
    $pins=Get-DIndexInputPins -Root $root -Files $files
    foreach($pin in $pins){$target=Join-Path $source $pin.path;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null;Copy-Item -LiteralPath (Join-Path $root $pin.path) -Destination $target;if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Composition template copy drift'};(Get-Item -LiteralPath $target).IsReadOnly=$true}
    $pins|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-templates.json') -Encoding utf8
    & node (Join-Path $source 'scripts/system-backup-a-download-deployment.test.mjs') 1>($prefix+'-download.txt') 2>($prefix+'-download-stderr.txt')
    if($LASTEXITCODE -ne 0){throw 'Download composition Node gate failed'}
    Write-Output 'PASS download-k8s-node-tests=11 actual-cli=yes no-cluster-contact=yes'
    & node (Join-Path $source 'scripts/system-backup-d-deployment.test.mjs') 1>($prefix+'-base.txt') 2>($prefix+'-base-stderr.txt')
    if($LASTEXITCODE -ne 0){throw 'Base composition Node regression failed'}
    Write-Output 'PASS base-k8s-node-tests=4'
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $source $pin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Frozen composition template drift'}}
    if(@(Get-ChildItem -LiteralPath $source -Directory -Filter '.tmp-a-download-render-*').Count -ne 0){throw 'CLI test product retained'}
    Write-Output 'LOCAL_PASS download-k8s-frozen-postcheck=yes dependencies-installed=no cluster=not-contacted'
} finally {
    if(Test-Path -LiteralPath $owner){$resolved=(Resolve-Path -LiteralPath $owner).Path;if([IO.Path]::GetDirectoryName($resolved) -ne $root -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -ne [IO.Path]::GetFileName($resolved)){throw 'Refusing unowned composition cleanup'};Remove-Item -LiteralPath $resolved -Recurse -Force}
    Write-Output ('CLEANED download-k8s-source-and-cli-products='+(-not(Test-Path -LiteralPath $owner)))
    Stop-Transcript|Out-Null
}
