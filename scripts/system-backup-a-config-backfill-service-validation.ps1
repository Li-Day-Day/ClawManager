[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$backfillServiceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backfillServiceScratch=Join-Path $backfillServiceRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$backfillServiceSourceOwner=Join-Path $backfillServiceRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$backfillServiceFrozen=Join-Path $backfillServiceSourceOwner 'source'
$backfillServiceEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$backfillServicePrevious=@{}
foreach($backfillServiceName in $backfillServiceEnvironment){$backfillServicePrevious[$backfillServiceName]=[Environment]::GetEnvironmentVariable($backfillServiceName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$backfillServiceManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($backfillServiceManifest) -ne [IO.Path]::GetFullPath((Join-Path $backfillServiceRoot 'docs/evidence')) -or (Test-Path -LiteralPath $backfillServiceManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($backfillServiceSourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $backfillServiceSourceOwner 'owner.txt'),[IO.Path]::GetFileName($backfillServiceSourceOwner))
    $backfillServiceSnapshot=New-DIndexSourceSnapshot -Root $backfillServiceRoot -Destination $backfillServiceFrozen
    $backfillServiceStream=[IO.File]::Open($backfillServiceManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$backfillServiceBytes=[Text.Encoding]::UTF8.GetBytes(($backfillServiceSnapshot|ConvertTo-Json -Depth 6));$backfillServiceStream.Write($backfillServiceBytes,0,$backfillServiceBytes.Length)}finally{$backfillServiceStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-backfill-service-frozen=yes source_sha256='+$backfillServiceSnapshot.source_sha256+' files='+$backfillServiceSnapshot.files.Count)
    foreach($backfillServiceFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $backfillServiceScratch $backfillServiceFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $backfillServiceScratch 'cache';$env:GOTMPDIR=Join-Path $backfillServiceScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $backfillServiceScratch
    Push-Location (Join-Path $backfillServiceFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE config-backfill-service-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfigBackfillService','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE config-backfill-service-counterfactual'
        $backfillServiceSQL=Join-Path $backfillServiceFrozen 'backend/internal/systembackupsecurity/config_canonical_backfill.go'
        $backfillServiceControl=Join-Path $backfillServiceScratch 'final-deadline-control.go'
        $backfillServiceOverlay=Join-Path $backfillServiceScratch 'final-deadline-overlay.json'
        $backfillServiceSource=[IO.File]::ReadAllText($backfillServiceSQL)
        $backfillServiceGuards=@('!last.Before(until)','!last.Before(capacityUntil)')
        foreach($backfillServiceGuard in $backfillServiceGuards){
            if($backfillServiceSource.Split([string[]]@($backfillServiceGuard),[StringSplitOptions]::None).Count -ne 2){throw 'Cannot isolate exact final-deadline guard'}
            $backfillServiceSource=$backfillServiceSource.Replace($backfillServiceGuard,('('+$backfillServiceGuard+' && false)'))
        }
        [IO.File]::WriteAllText($backfillServiceControl,$backfillServiceSource,[Text.UTF8Encoding]::new($false))
        $backfillServiceOverlayMap=[ordered]@{};$backfillServiceOverlayMap[$backfillServiceSQL]=$backfillServiceControl
        [IO.File]::WriteAllText($backfillServiceOverlay,([ordered]@{Replace=$backfillServiceOverlayMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
        $backfillServiceLines=[Collections.Generic.List[string]]::new()
        $backfillServiceSavedNative=$PSNativeCommandUseErrorActionPreference
        try {
            $PSNativeCommandUseErrorActionPreference=$false
            & go test -overlay $backfillServiceOverlay -count=1 -v ('-p='+$BuildParallelism) -run '^TestConfigBackfillServiceFailureRollsBackWholeAttempt$/^(grant-expiry-after-callback|capacity-expiry-after-callback|grant-extension-does-not-renew|capacity-extension-does-not-renew)$' ./internal/systembackupsecurity 2>&1 | ForEach-Object {$backfillServiceLine=$_.ToString();$backfillServiceLines.Add($backfillServiceLine);Write-Host $backfillServiceLine}
            $backfillServiceControlExit=$LASTEXITCODE
        } finally {$PSNativeCommandUseErrorActionPreference=$backfillServiceSavedNative}
        $backfillServiceControlText=$backfillServiceLines -join "`n"
        $backfillServiceFailureCount=[regex]::Matches($backfillServiceControlText,'(?m)^\s+--- FAIL: TestConfigBackfillServiceFailureRollsBackWholeAttempt/(?:grant-expiry-after-callback|capacity-expiry-after-callback|grant-extension-does-not-renew|capacity-extension-does-not-renew) ').Count
        $backfillServiceAssertionCount=[regex]::Matches($backfillServiceControlText,'failure released maintenance result').Count
        if($backfillServiceControlExit -ne 1 -or $backfillServiceFailureCount -ne 4 -or $backfillServiceAssertionCount -ne 4){throw 'Counterfactual did not prove four exact final-deadline failures'}
        Write-Output ('LOCAL_PASS expected-final-deadline-rejections=4 actual-exit=1 default-vet=yes original-source-unchanged=yes control_source_sha256='+(Get-FileHash -LiteralPath $backfillServiceControl -Algorithm SHA256).Hash.ToLowerInvariant())
        Write-Output 'LOCAL_STAGE config-backfill-service-clock-observation-counterfactual'
        $backfillServiceClockControl=Join-Path $backfillServiceScratch 'latest-observation-control.go'
        $backfillServiceClockOverlay=Join-Path $backfillServiceScratch 'latest-observation-overlay.json'
        $backfillServiceClockCode=[IO.File]::ReadAllText($backfillServiceSQL)
        if($backfillServiceClockCode.Split([string[]]@('observedAt.After(now)'),[StringSplitOptions]::None).Count -ne 2 -or $backfillServiceClockCode.Split([string[]]@('row.observedAt = absence.observedAt'),[StringSplitOptions]::None).Count -ne 3){throw 'Cannot isolate latest SQL observation clock bindings'}
        $backfillServiceClockCode=$backfillServiceClockCode.Replace('observedAt.After(now)','(observedAt.After(now) && false)').Replace('row.observedAt = absence.observedAt','if false { row.observedAt = absence.observedAt }')
        [IO.File]::WriteAllText($backfillServiceClockControl,$backfillServiceClockCode,[Text.UTF8Encoding]::new($false))
        $backfillServiceClockMap=[ordered]@{};$backfillServiceClockMap[$backfillServiceSQL]=$backfillServiceClockControl
        [IO.File]::WriteAllText($backfillServiceClockOverlay,([ordered]@{Replace=$backfillServiceClockMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
        $backfillServiceClockLines=[Collections.Generic.List[string]]::new()
        try {
            $PSNativeCommandUseErrorActionPreference=$false
            & go test -overlay $backfillServiceClockOverlay -count=1 -v ('-p='+$BuildParallelism) -run '^TestConfigBackfillService(FinalClockUsesLatestSQLObservation|MissingReceiptClockCannotRegress)$/^(regression-after-final-receipt-scan|missing-scan-clock-regression)$' ./internal/systembackupsecurity 2>&1 | ForEach-Object {$backfillServiceClockLine=$_.ToString();$backfillServiceClockLines.Add($backfillServiceClockLine);Write-Host $backfillServiceClockLine}
            $backfillServiceClockExit=$LASTEXITCODE
        } finally {$PSNativeCommandUseErrorActionPreference=$backfillServiceSavedNative}
        $backfillServiceClockText=$backfillServiceClockLines -join "`n"
        $backfillServiceClockFailures=[regex]::Matches($backfillServiceClockText,'(?m)^\s+--- FAIL: TestConfigBackfillService(?:FinalClockUsesLatestSQLObservation/regression-after-final-receipt-scan|MissingReceiptClockCannotRegress/missing-scan-clock-regression) ').Count
        if($backfillServiceClockExit -ne 1 -or $backfillServiceClockFailures -ne 2 -or [regex]::Matches($backfillServiceClockText,'failure released maintenance result').Count -ne 1 -or [regex]::Matches($backfillServiceClockText,'negative observation forgot its newer SQL clock').Count -ne 1){throw 'Counterfactual did not prove both latest-observation clock failures'}
        Write-Output ('LOCAL_PASS expected-latest-observation-rejections=2 actual-exit=1 default-vet=yes original-source-unchanged=yes control_source_sha256='+(Get-FileHash -LiteralPath $backfillServiceClockControl -Algorithm SHA256).Hash.ToLowerInvariant())
        Write-Output 'LOCAL_STAGE config-backfill-service-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $backfillServiceFrozen -Manifest $backfillServiceSnapshot
        Write-Output 'LOCAL_PASS config-backfill-service-content=yes security-config-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($backfillServiceName in $backfillServiceEnvironment){[Environment]::SetEnvironmentVariable($backfillServiceName,$backfillServicePrevious[$backfillServiceName],'Process')}
    foreach($backfillServiceOwned in @($backfillServiceScratch,$backfillServiceSourceOwner)){
        if(Test-Path -LiteralPath $backfillServiceOwned){
            $backfillServiceResolved=(Resolve-Path -LiteralPath $backfillServiceOwned).Path
            if([IO.Path]::GetDirectoryName($backfillServiceResolved) -ne $backfillServiceRoot -or [IO.Path]::GetFileName($backfillServiceResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $backfillServiceResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing backfill service cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $backfillServiceResolved
        }
        Write-Output ('LOCAL_CLEANUP config-backfill-service-owned='+$backfillServiceOwned+' removed='+(-not(Test-Path -LiteralPath $backfillServiceOwned)))
    }
}
