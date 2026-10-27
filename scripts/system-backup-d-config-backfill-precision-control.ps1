param([Parameter(Mandatory=$true)][string]$FrozenRoot,[Parameter(Mandatory=$true)][string]$Scratch,[ValidateRange(1,4)][int]$BuildParallelism=1)
$ErrorActionPreference='Stop'
$precisionRoot=[IO.Path]::GetFullPath($FrozenRoot)
$precisionScratch=[IO.Path]::GetFullPath($Scratch)
if([IO.Path]::GetDirectoryName($precisionScratch) -ne $precisionRoot -or [IO.Path]::GetFileName($precisionScratch) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Get-Item -LiteralPath $precisionScratch -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Precision control needs the current run-owned scratch'}
Write-Output 'LOCAL_STAGE backfill-audit-precision-focused'
Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v',('-p='+$BuildParallelism),'-run','^TestConfigBackfill(ServiceAuditSecondPrecision|AuditPrecisionMatchesPublishedSchema)$','./internal/systembackupsecurity') -Stage 'test-vet'
$precisionSource=Join-Path $precisionRoot 'backend/internal/systembackupsecurity/config_canonical_backfill.go'
$precisionOriginal=[IO.File]::ReadAllText($precisionSource)
$precisionNeedle='UTC_TIMESTAMP())"'
if($precisionOriginal.Split([string[]]@($precisionNeedle),[StringSplitOptions]::None).Count -ne 2){throw 'Could not isolate exact audit precision expression'}
$precisionBefore=(Get-FileHash -LiteralPath $precisionSource -Algorithm SHA256).Hash
$precisionOverlaySource=Join-Path $precisionScratch 'audit-fractional-control.go'
$precisionOverlay=Join-Path $precisionScratch 'audit-fractional-overlay.json'
[IO.File]::WriteAllText($precisionOverlaySource,$precisionOriginal.Replace($precisionNeedle,'UTC_TIMESTAMP(6))"'),[Text.UTF8Encoding]::new($false))
$precisionMap=[ordered]@{};$precisionMap[$precisionSource]=$precisionOverlaySource
[IO.File]::WriteAllText($precisionOverlay,([ordered]@{Replace=$precisionMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
Write-Output 'LOCAL_STAGE backfill-audit-precision-counterfactual'
$precisionLines=[Collections.Generic.List[string]]::new()
$precisionSavedNative=$PSNativeCommandUseErrorActionPreference
try{
    $PSNativeCommandUseErrorActionPreference=$false
    & go test -overlay $precisionOverlay -count=1 -v ('-p='+$BuildParallelism) -run '^TestConfigBackfillServiceAuditSecondPrecision$' ./internal/systembackupsecurity 2>&1 | ForEach-Object {$precisionLine=$_.ToString();$precisionLines.Add($precisionLine);Write-Host $precisionLine}
    $precisionExit=$LASTEXITCODE
}finally{$PSNativeCommandUseErrorActionPreference=$precisionSavedNative}
$precisionText=$precisionLines -join "`n"
$precisionLeaves=[regex]::Matches($precisionText,'(?m)^\s+--- FAIL: TestConfigBackfillServiceAuditSecondPrecision/(?:half-second|second-end|midnight-end) ').Count
$precisionMessages=[regex]::Matches($precisionText,'whole-second audit input must not round past receipt').Count
if($precisionExit -ne 1 -or $precisionLeaves -ne 3 -or $precisionMessages -ne 3 -or $precisionText -notmatch '--- PASS: TestConfigBackfillServiceAuditSecondPrecision/first-half ' -or (Get-FileHash -LiteralPath $precisionSource -Algorithm SHA256).Hash -ne $precisionBefore){throw 'Fractional counterfactual did not prove three exact failures with unchanged real source'}
Write-Output 'LOCAL_PASS expected-audit-rounding-rejections=3 actual-exit=1 original-source-unchanged=yes default-vet=yes'
