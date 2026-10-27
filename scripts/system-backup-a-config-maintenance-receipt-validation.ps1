[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1,[Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$receiptReviewRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$receiptReviewScratch=Join-Path $receiptReviewRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$receiptReviewSourceOwner=Join-Path $receiptReviewRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$receiptReviewFrozen=Join-Path $receiptReviewSourceOwner 'source'
$receiptReviewEnvironment=@('PATH','GOFLAGS','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','GOMAXPROCS','GO111MODULE','GOWORK','GOOS','GOARCH','CGO_ENABLED')
$receiptReviewPrevious=@{}
foreach($receiptReviewName in $receiptReviewEnvironment){$receiptReviewPrevious[$receiptReviewName]=[Environment]::GetEnvironmentVariable($receiptReviewName,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$receiptReviewManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($receiptReviewManifest) -ne [IO.Path]::GetFullPath((Join-Path $receiptReviewRoot 'docs/evidence')) -or (Test-Path -LiteralPath $receiptReviewManifest)){throw 'Manifest must be a new docs/evidence file'}
try {
    [IO.Directory]::CreateDirectory($receiptReviewSourceOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $receiptReviewSourceOwner 'owner.txt'),[IO.Path]::GetFileName($receiptReviewSourceOwner))
    $receiptReviewSnapshot=New-DIndexSourceSnapshot -Root $receiptReviewRoot -Destination $receiptReviewFrozen
    $receiptReviewStream=[IO.File]::Open($receiptReviewManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$receiptReviewBytes=[Text.Encoding]::UTF8.GetBytes(($receiptReviewSnapshot|ConvertTo-Json -Depth 6));$receiptReviewStream.Write($receiptReviewBytes,0,$receiptReviewBytes.Length)}finally{$receiptReviewStream.Dispose()}
    Write-Output ('LOCAL_SOURCE config-maintenance-receipt-frozen=yes source_sha256='+$receiptReviewSnapshot.source_sha256+' files='+$receiptReviewSnapshot.files.Count)
    foreach($receiptReviewFolder in @('cache','tmp')){[IO.Directory]::CreateDirectory((Join-Path $receiptReviewScratch $receiptReviewFolder))|Out-Null}
    $env:PATH='C:\Program Files\Go\bin;'+$env:PATH
    $env:GOFLAGS='-mod=readonly -buildvcs=false -trimpath';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local'
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $receiptReviewScratch 'cache';$env:GOTMPDIR=Join-Path $receiptReviewScratch 'tmp';$env:GOMAXPROCS=[string]$BuildParallelism
    Initialize-AEvidenceTelemetry -Scratch $receiptReviewScratch
    Push-Location (Join-Path $receiptReviewFrozen 'backend')
    try {
        Write-Output 'LOCAL_STAGE config-maintenance-receipt-targeted'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfigMaintenance','./internal/systembackupsecurity') -Stage 'test-vet'
        Write-Output 'LOCAL_STAGE config-maintenance-receipt-counterfactual'
        $receiptReviewSQL=Join-Path $receiptReviewFrozen 'backend/internal/systembackupsecurity/config_maintenance_receipt_sql.go'
        $receiptReviewControl=Join-Path $receiptReviewScratch 'audit-times-control.go'
        $receiptReviewOverlay=Join-Path $receiptReviewScratch 'audit-times-overlay.json'
        $receiptReviewSource=[IO.File]::ReadAllText($receiptReviewSQL)
        $receiptReviewGuards=@('!loaded.audits.same(audits)','!actual.audits.same(r.audits)')
        foreach($receiptReviewGuard in $receiptReviewGuards){
            if($receiptReviewSource.Split([string[]]@($receiptReviewGuard),[StringSplitOptions]::None).Count -ne 2){throw 'Cannot isolate exact audit-time binding guard'}
            $receiptReviewSource=$receiptReviewSource.Replace($receiptReviewGuard,('('+$receiptReviewGuard+' && false)'))
        }
        [IO.File]::WriteAllText($receiptReviewControl,$receiptReviewSource,[Text.UTF8Encoding]::new($false))
        $receiptReviewOverlayMap=[ordered]@{};$receiptReviewOverlayMap[$receiptReviewSQL]=$receiptReviewControl
        [IO.File]::WriteAllText($receiptReviewOverlay,([ordered]@{Replace=$receiptReviewOverlayMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
        $receiptReviewLines=[Collections.Generic.List[string]]::new()
        $receiptReviewSavedNative=$PSNativeCommandUseErrorActionPreference
        try {
            $PSNativeCommandUseErrorActionPreference=$false
            & go test -overlay $receiptReviewOverlay -count=1 -v ('-p='+$BuildParallelism) -run '^TestConfigMaintenanceAAuditTimesStayBoundAcrossStageAndRecheck$' ./internal/systembackupsecurity 2>&1 | ForEach-Object {$receiptReviewLine=$_.ToString();$receiptReviewLines.Add($receiptReviewLine);Write-Host $receiptReviewLine}
            $receiptReviewControlExit=$LASTEXITCODE
        } finally {$PSNativeCommandUseErrorActionPreference=$receiptReviewSavedNative}
        $receiptReviewControlText=$receiptReviewLines -join "`n"
        $receiptReviewFailureCount=[regex]::Matches($receiptReviewControlText,'(?m)^\s+--- FAIL: TestConfigMaintenanceAAuditTimesStayBoundAcrossStageAndRecheck/(?:stage-reload|final-recheck)/(?:intent|result)-(?:earlier|later) ').Count
        $receiptReviewStageCount=[regex]::Matches($receiptReviewControlText,'Stage accepted replacement audit times with unchanged IDs, bodies and valid ordering').Count
        $receiptReviewFinalCount=[regex]::Matches($receiptReviewControlText,'Recheck accepted replacement audit times with unchanged IDs, bodies and valid ordering').Count
        if($receiptReviewControlExit -ne 1 -or $receiptReviewFailureCount -ne 8 -or $receiptReviewStageCount -ne 4 -or $receiptReviewFinalCount -ne 4){throw 'Counterfactual did not prove eight exact audit-time replacement failures'}
        Write-Output ('LOCAL_PASS expected-audit-time-rejections=8 actual-exit=1 default-vet=yes original-source-unchanged=yes control_source_sha256='+(Get-FileHash -LiteralPath $receiptReviewControl -Algorithm SHA256).Hash.ToLowerInvariant())
        Write-Output 'LOCAL_STAGE config-maintenance-receipt-full'
        Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'./internal/systembackupsecurity','./internal/systembackupconfig') -Stage 'test-vet'
        Test-DIndexSourceSnapshot -Root $receiptReviewFrozen -Manifest $receiptReviewSnapshot
        Write-Output 'LOCAL_PASS config-maintenance-receipt-content=yes security-config-regressions=yes default-vet=yes production-adapters=no real-mysql=no dependencies-installed=no'
    } finally {Pop-Location}
} finally {
    foreach($receiptReviewName in $receiptReviewEnvironment){[Environment]::SetEnvironmentVariable($receiptReviewName,$receiptReviewPrevious[$receiptReviewName],'Process')}
    foreach($receiptReviewOwned in @($receiptReviewScratch,$receiptReviewSourceOwner)){
        if(Test-Path -LiteralPath $receiptReviewOwned){
            $receiptReviewResolved=(Resolve-Path -LiteralPath $receiptReviewOwned).Path
            if([IO.Path]::GetDirectoryName($receiptReviewResolved) -ne $receiptReviewRoot -or [IO.Path]::GetFileName($receiptReviewResolved) -notmatch '^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$' -or
                ((Get-Item -Force -LiteralPath $receiptReviewResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing backfill identity cleanup outside owned workspace directory'}
            Remove-Item -Recurse -Force -LiteralPath $receiptReviewResolved
        }
        Write-Output ('LOCAL_CLEANUP config-maintenance-receipt-owned='+$receiptReviewOwned+' removed='+(-not(Test-Path -LiteralPath $receiptReviewOwned)))
    }
}
