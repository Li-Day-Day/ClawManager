[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$FrozenRoot,[Parameter(Mandatory=$true)][string]$Scratch,[ValidateRange(1,4)][int]$BuildParallelism=1)
$ErrorActionPreference='Stop'
# Called inside the frozen runner, after its isolated offline Go environment.
# Temporary overlay controls never edit the source and are removed with Scratch.
$rowControlFile=Join-Path $FrozenRoot 'backend/internal/systembackupsecurity/config_canonical_backfill_row.go'
$rowControlOriginal=[IO.File]::ReadAllText($rowControlFile).Replace("`r`n","`n")
$rowControlOriginalSHA=(Get-FileHash -LiteralPath $rowControlFile).Hash.ToLowerInvariant()
Write-Output 'LOCAL_STAGE config-backfill-row-focused'
Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfigBackfillLocked','./internal/systembackupsecurity') -Stage 'test-vet'
$rowControls=@(
    [pscustomobject]@{name='driver-column-copy';remove="`tcolumns = append([]string(nil), columns...)`n";pattern='^TestConfigBackfillLockedRowOwnsColumnNamesAndDriverBytesAfterClose$';failure='--- FAIL: TestConfigBackfillLockedRowOwnsColumnNamesAndDriverBytesAfterClose ';message='driver Close changed validated scan mapping/bytes'},
    [pscustomobject]@{name='final-database-tuple';remove='server != database.ServerUUID || databaseName != database.Database || ';pattern='^TestConfigBackfillLockedRowMalformedAndMissingFacts$/^database-at-clock$';failure='--- FAIL: TestConfigBackfillLockedRowMalformedAndMissingFacts/database-at-clock ';message='failed scan disclosed usable row observation'}
)
foreach($rowControl in $rowControls){
    if($rowControlOriginal.Split([string[]]@($rowControl.remove),[StringSplitOptions]::None).Count -ne 2){throw ('Cannot isolate backfill guard: '+$rowControl.name)}
    $rowControlPath=Join-Path $Scratch ('backfill-control-'+$rowControl.name+'.go')
    $rowOverlayPath=Join-Path $Scratch ('backfill-overlay-'+$rowControl.name+'.json')
    [IO.File]::WriteAllText($rowControlPath,$rowControlOriginal.Replace($rowControl.remove,''),[Text.UTF8Encoding]::new($false))
    $rowOverlayMap=[ordered]@{};$rowOverlayMap[$rowControlFile]=$rowControlPath
    [IO.File]::WriteAllText($rowOverlayPath,([ordered]@{Replace=$rowOverlayMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
    Write-Output ('LOCAL_STAGE expected-backfill-control-rejection='+$rowControl.name)
    $rowControlLines=[Collections.Generic.List[string]]::new()
    $rowControlSavedNative=$PSNativeCommandUseErrorActionPreference
    try {
        $PSNativeCommandUseErrorActionPreference=$false
        & go test -overlay $rowOverlayPath -count=1 -v ('-p='+$BuildParallelism) -run $rowControl.pattern ./internal/systembackupsecurity 2>&1 | ForEach-Object {$rowLine=$_.ToString();$rowControlLines.Add($rowLine);Write-Host $rowLine}
        $rowControlExit=$LASTEXITCODE
    } finally {$PSNativeCommandUseErrorActionPreference=$rowControlSavedNative}
    $rowControlText=$rowControlLines -join "`n"
    if($rowControlExit -ne 1 -or -not $rowControlText.Contains($rowControl.failure) -or -not $rowControlText.Contains($rowControl.message) -or $rowControlText -match '(?m)^panic:|^fatal error:') {throw ('Counterfactual did not prove the backfill guard: '+$rowControl.name)}
    if((Get-FileHash -LiteralPath $rowControlFile).Hash.ToLowerInvariant() -cne $rowControlOriginalSHA){throw 'Counterfactual changed the real source'}
    Write-Output ('LOCAL_PASS expected-backfill-control-rejection='+$rowControl.name+' actual-exit=1 original-source-unchanged=yes')
}
Write-Output 'LOCAL_PASS config-backfill-row-focused-and-two-counterfactuals=yes real-mysql=no grant-authentication=no'
