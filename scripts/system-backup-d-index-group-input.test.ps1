$ErrorActionPreference='Stop'
$groupFixtureScriptRoot=$PSScriptRoot
$groupFixtureRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$groupFixtureSource=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-a-evidence-validation.ps1'))
$groupFixtureEnd=$groupFixtureSource.IndexOf('if ($Remote) {')
if($groupFixtureEnd -lt 0){throw 'Profile input boundary missing'}
# Evaluate the actual parameter block and input guards only. A dynamic block
# has no PSScriptRoot; supply the source script's directory explicitly.
$groupFixtureGuards=[scriptblock]::Create($groupFixtureSource.Substring(0,$groupFixtureEnd).Replace('$PSScriptRoot','$groupFixtureScriptRoot'))
$groupFixtureOwned=Join-Path $groupFixtureRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$groupFixtureCache=Join-Path $groupFixtureOwned 'cache'
try{
    [IO.Directory]::CreateDirectory($groupFixtureCache) | Out-Null
    [IO.File]::WriteAllText((Join-Path $groupFixtureOwned 'owner.txt'),[IO.Path]::GetFileName($groupFixtureOwned))
    & $groupFixtureGuards -AdminReadOnly -AdminReadIndexCandidate -IndexSuiteCache $groupFixtureCache
    Write-Output 'PASS valid run-owned shared cache input'
    [IO.File]::WriteAllText((Join-Path $groupFixtureOwned 'owner.txt'),'wrong-owner')
    foreach($groupFixtureArgs in @(
        @{AdminReadOnly=$true;AdminReadIndexCandidate=$true;IndexSuiteCache=$groupFixtureCache},
        @{AdminReadOnly=$true;AdminReadIndexCandidate=$true;IndexSuiteCache=(Join-Path $groupFixtureRoot 'cache')},
        @{IndexSuiteCache=$groupFixtureCache},
        @{AdminReadIndexVariant='page'},
        @{AdminReadOnly=$true;AdminReadIndexCandidate=$true;AdminReadIndexVariant='unsafe'}
    )){
        $groupFixtureRejected=$false
        try{& $groupFixtureGuards @groupFixtureArgs}catch{$groupFixtureRejected=$true}
        if(-not $groupFixtureRejected){throw 'Invalid profile/cache input accepted'}
        Write-Output ('PASS rejected input '+($groupFixtureArgs.Keys -join ','))
    }
}finally{
    $groupFixtureResolved=[IO.Path]::GetFullPath($groupFixtureOwned)
    if([IO.Path]::GetDirectoryName($groupFixtureResolved) -ne $groupFixtureRoot -or [IO.Path]::GetFileName($groupFixtureResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Unsafe fixture cleanup'}
    if(Test-Path -LiteralPath $groupFixtureResolved){Remove-Item -LiteralPath $groupFixtureResolved -Recurse -Force}
    Write-Output ('CLEANED grouped cache input fixture='+(-not(Test-Path -LiteralPath $groupFixtureResolved)))
}
$groupFixtureTokens=$null;$groupFixtureErrors=$null
$groupFixtureAst=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'system-backup-d-index-group-validation.ps1'),[ref]$groupFixtureTokens,[ref]$groupFixtureErrors)
if($groupFixtureErrors.Count){throw 'Grouped wrapper syntax errors'}
$groupFixturePlans=@($groupFixtureAst.FindAll({param($node)$node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -eq '$groupPlan'},$true))
if($groupFixturePlans.Count -ne 1){throw 'Grouped plan missing'}
. ([scriptblock]::Create($groupFixturePlans[0].Extent.Text))
$groupFixtureOrder=($groupPlan | ForEach-Object {'r'+$_[0]+'-'+$_[1]}) -join ','
if($groupFixtureOrder -ne 'r1-page,r1-status,r1-all,r2-all,r2-status,r2-page'){throw 'Grouped plan drift'}
Write-Output 'PASS exact forward/reverse group plan and wrapper syntax'
$groupFixtureFinalizers=@($groupFixtureAst.FindAll({param($node)
    $node -is [Management.Automation.Language.TryStatementAst] -and $null -ne $node.Finally -and
    $node.Finally.Extent.Text.Contains('CLEANED grouped-index-build-cache=True')
},$true))
if($groupFixtureFinalizers.Count -ne 1){throw 'Expected one owned-cache finalizer'}
$groupFixtureCleanupCode=$groupFixtureFinalizers[0].Finally.Extent.Text
foreach($groupFixtureFail in @($false,$true)){
    $groupRoot=$groupFixtureRoot
    $groupCacheRoot=Join-Path $groupRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory((Join-Path $groupCacheRoot 'cache')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $groupCacheRoot 'cache/probe.bin'),'synthetic test product')
    $groupFixtureError=$false
    try{
        & ([scriptblock]::Create('try { if($groupFixtureFail){throw "synthetic measurement failure"} } finally '+$groupFixtureCleanupCode))
    }catch{
        if($_.Exception.Message -ne 'synthetic measurement failure'){throw}
        $groupFixtureError=$true
    }finally{
        if(Test-Path -LiteralPath $groupCacheRoot){
            $groupFixtureResolved=[IO.Path]::GetFullPath($groupCacheRoot)
            if([IO.Path]::GetDirectoryName($groupFixtureResolved) -ne $groupFixtureRoot -or [IO.Path]::GetFileName($groupFixtureResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Unsafe failed-finalizer fixture cleanup'}
            Remove-Item -LiteralPath $groupFixtureResolved -Recurse -Force
            throw 'Production finalizer did not remove test products'
        }
    }
    if($groupFixtureError -ne $groupFixtureFail){throw 'Finalizer masked measurement failure'}
    Write-Output "PASS actual suite finalizer cleanup failure=$groupFixtureFail"
}
Write-Output 'PASS grouped inputs; no Go, SSH, dependency installation or retained build products'
