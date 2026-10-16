function Invoke-AConfigBackfillByteBudgetControl {
    param([string]$Root,[string]$Scratch,[ValidateRange(1,4)][int]$BuildParallelism=1)
    Write-Output 'LOCAL_STAGE config-backfill-byte-budget-control'
    $byteOriginal=Join-Path $Root 'backend/internal/systembackupsecurity/config_backfill_identity.go'
    $byteControl=Join-Path $Scratch 'config-backfill-byte-control.go'
    $byteOverlay=Join-Path $Scratch 'config-backfill-byte-overlay.json'
    $byteCode=[IO.File]::ReadAllText($byteOriginal)
    foreach($bytePredicate in @('len(f.CreatedBy) > 128','len(*f.ChangeReason) > 512')){
        if($byteCode.Split([string[]]@($bytePredicate),[StringSplitOptions]::None).Count -ne 2){throw 'Cannot isolate the SQL OCTET_LENGTH upper bound'}
        $byteCode=$byteCode.Replace($bytePredicate,$bytePredicate.Replace('len(','utf8.RuneCountInString('))
    }
    [IO.File]::WriteAllText($byteControl,$byteCode,[Text.UTF8Encoding]::new($false))
    $byteMap=[ordered]@{};$byteMap[$byteOriginal]=$byteControl
    [IO.File]::WriteAllText($byteOverlay,([ordered]@{Replace=$byteMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
    $byteLines=[Collections.Generic.List[string]]::new()
    $byteSavedNative=$PSNativeCommandUseErrorActionPreference
    try {
        $PSNativeCommandUseErrorActionPreference=$false
        & go test -overlay $byteOverlay -count=1 -v ('-p='+$BuildParallelism) -run '^TestConfigBackfillIdentityRejectsSQLByteBudgetOverflow$' ./internal/systembackupsecurity 2>&1 | ForEach-Object {$byteLine=$_.ToString();$byteLines.Add($byteLine);Write-Host $byteLine}
        $byteExit=$LASTEXITCODE
    } finally {$PSNativeCommandUseErrorActionPreference=$byteSavedNative}
    $byteText=$byteLines -join "`n"
    $byteExpected=[regex]::Matches($byteText,'(?m)^[ \t]+--- FAIL: TestConfigBackfillIdentityRejectsSQLByteBudgetOverflow/(?:creator-129-utf8-bytes|reason-513-utf8-bytes) ').Count
    if($byteExit -ne 1 -or $byteExpected -ne 2 -or [regex]::Matches($byteText,'SQL OCTET_LENGTH overflow accepted as character count').Count -ne 2){throw 'Counterfactual did not prove both SQL OCTET_LENGTH boundaries'}
    Write-Output ('LOCAL_PASS expected-octet-budget-rejections=2 actual-exit=1 default-vet=yes original-source-unchanged=yes control_source_sha256='+(Get-FileHash -LiteralPath $byteControl -Algorithm SHA256).Hash.ToLowerInvariant())
}
