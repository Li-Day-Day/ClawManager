param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._-]{1,100}$')][string]$EvidencePrefix)
$ErrorActionPreference='Stop'
$publicRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publicID=[guid]::NewGuid().ToString('N')
$publicOwner=Join-Path $publicRoot ('.tmp-d-index-cache-'+$publicID)
$publicSource=Join-Path $publicOwner 'source'
$publicLog=Join-Path $publicRoot ('docs/evidence/'+$EvidencePrefix+'.tap')
$publicErr=Join-Path $publicRoot ('docs/evidence/'+$EvidencePrefix+'-stderr.txt')
$publicManifest=Join-Path $publicRoot ('docs/evidence/'+$EvidencePrefix+'-source.json')
$publicNative=Join-Path $publicRoot ('docs/evidence/'+$EvidencePrefix+'-native.txt')
foreach($publicOutput in @($publicLog,$publicErr,$publicManifest,$publicNative)){
    if(Test-Path -LiteralPath $publicOutput){throw 'Refusing to replace existing public-contract evidence'}
}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
function Get-PublicFrontendFiles {
    $publicFiles=@(& rg --files --hidden frontend)
    if($LASTEXITCODE -ne 0){throw 'Cannot enumerate frontend inputs'}
    return @($publicFiles | ForEach-Object {$_.Replace('\','/')} | Where-Object {
        $_ -notmatch '(?:^|/)(?:node_modules|dist|build|cache|\.git|\.tmp[^/]*)(?:/|$)' -and
        ($_ -match '^frontend/(?:src|scripts|public)/' -or $_ -match '^frontend/[^/]+\.(?:json|js|ts|mjs|cjs|html)$')
    } | Sort-Object -CaseSensitive)
}
function Get-PublicSupportFiles {
    $publicSupport=@(& rg --files --hidden deployments)
    if($LASTEXITCODE -ne 0){throw 'Cannot enumerate deployment source inputs'}
    return @(@($publicSupport | ForEach-Object {$_.Replace('\','/')} | Where-Object {
        $_ -notmatch '(?:^|/)(?:node_modules|dist|build|cache|\.git|\.tmp[^/]*)(?:/|$)' -and $_ -match '\.(?:yaml|yml|json|sh|sql|tmpl|conf|txt|md)$'
    })+@('docs/system-backup-restore-division-plan.md','Dockerfile') | Sort-Object -CaseSensitive)
}
$publicResult=1
Start-Transcript -LiteralPath $publicNative -NoClobber|Out-Null
Push-Location $publicRoot
try {
    [IO.Directory]::CreateDirectory($publicOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $publicOwner 'owner.txt'),[IO.Path]::GetFileName($publicOwner))
    $publicSnapshot=New-AConfigProofSourceSnapshot -Root $publicRoot -Owner $publicOwner -MaxAttempts 3
    $publicFrontendFiles=Get-PublicFrontendFiles
    $publicFrontendPins=Get-DIndexInputPins -Root $publicRoot -Files $publicFrontendFiles
    $publicSupportFiles=Get-PublicSupportFiles
    $publicSupportPins=Get-DIndexInputPins -Root $publicRoot -Files $publicSupportFiles
    foreach($publicPin in @($publicFrontendPins)+@($publicSupportPins)){
        $publicTarget=Join-Path $publicSource $publicPin.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($publicTarget))|Out-Null
        Copy-Item -LiteralPath (Join-Path $publicRoot $publicPin.path) -Destination $publicTarget
        if((Get-FileHash -Algorithm SHA256 -LiteralPath $publicTarget).Hash.ToLowerInvariant() -ne $publicPin.sha256){throw 'Frontend source drift during capture'}
        (Get-Item -Force -LiteralPath $publicTarget).IsReadOnly=$true
    }
    $publicAfter=Get-PublicFrontendFiles
    if(($publicAfter -join "`n") -ne ($publicFrontendFiles -join "`n")){throw 'Frontend file set drift during capture'}
    $publicFrontendSHA=Get-DIndexPinDigest -Pins $publicFrontendPins
    if((Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $publicRoot -Files $publicAfter)) -ne $publicFrontendSHA){throw 'Frontend bytes drift during capture'}
    $publicSupportAfter=Get-PublicSupportFiles
    $publicSupportSHA=Get-DIndexPinDigest -Pins $publicSupportPins
    if(($publicSupportAfter -join "`n") -ne ($publicSupportFiles -join "`n") -or (Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $publicRoot -Files $publicSupportAfter)) -ne $publicSupportSHA){throw 'Support inputs drift during capture'}
    $publicTests=@('scripts/system-backup-contract-artifacts.test.mjs','scripts/system-backup-contract-check.test.mjs','scripts/system-backup-d-dto-check.test.mjs','scripts/system-backup-a-config-operation-response.test.mjs','scripts/system-backup-d-download-public-contract.test.mjs')
    $publicTests+=@($publicFrontendFiles | Where-Object {$_ -match '^frontend/scripts/system-backups[^/]*\.test\.mjs$'})
    $publicRecord=[ordered]@{kind='d_download_public_node_frozen_source';backend_contract=$publicSnapshot;frontend=[ordered]@{files=$publicFrontendPins;source_sha256=$publicFrontendSHA};support=[ordered]@{files=$publicSupportPins;source_sha256=$publicSupportSHA};tests=$publicTests;test_isolation='none';installed_dependencies=$false;actual_mysql=$false}
    [IO.File]::WriteAllText($publicManifest,($publicRecord|ConvertTo-Json -Depth 9))
    Write-Host ('FROZEN public-node files='+$publicSnapshot.files.Count+' frontend_files='+$publicFrontendPins.Count+' frontend_sha256='+$publicFrontendSHA+' owner='+$publicOwner)
    # The sandbox does not permit Node test-worker spawn. Keep all assertions
    # and use Node's supported in-process test isolation mode, never escalation.
    $publicArguments=@('--test','--test-isolation=none','--test-reporter=tap')+$publicTests
    $publicProcess=Start-Process -FilePath (Get-Command node).Source -ArgumentList $publicArguments -WorkingDirectory $publicSource -RedirectStandardOutput $publicLog -RedirectStandardError $publicErr -WindowStyle Hidden -PassThru -Wait
    Write-Host ('NATIVE_EXIT public-node='+$publicProcess.ExitCode+' dependency_installation=no actual_mysql=no')
    Test-DIndexSourceSnapshot -Root $publicSource -Manifest $publicSnapshot
    if((Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $publicSource -Files $publicFrontendFiles)) -ne $publicFrontendSHA){throw 'Frozen frontend source drift after Node tests'}
    if((Get-DIndexPinDigest -Pins (Get-DIndexInputPins -Root $publicSource -Files $publicSupportFiles)) -ne $publicSupportSHA){throw 'Frozen support source drift after Node tests'}
    Write-Host 'FROZEN_POSTCHECK public-node=yes frontend=yes'
    $publicResult=$publicProcess.ExitCode
} finally {
    try {
        if(Test-Path -LiteralPath $publicOwner){
            $publicResolved=(Resolve-Path -LiteralPath $publicOwner).Path
            if([IO.Path]::GetDirectoryName($publicResolved) -ne $publicRoot -or [IO.Path]::GetFileName($publicResolved) -ne ('.tmp-d-index-cache-'+$publicID) -or
                ((Get-Item -Force -LiteralPath $publicResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $publicResolved 'owner.txt')) -ne [IO.Path]::GetFileName($publicResolved)){throw 'Refusing public cleanup outside exact owned directory'}
            Remove-Item -LiteralPath $publicResolved -Recurse -Force
        }
        Write-Host ('CLEANED public-node='+(-not(Test-Path -LiteralPath $publicOwner)))
    } finally {Pop-Location;Write-Host ('d_public_node_exit='+$publicResult);Stop-Transcript|Out-Null}
}
exit $publicResult
