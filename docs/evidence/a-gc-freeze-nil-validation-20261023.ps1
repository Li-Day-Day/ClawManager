$ErrorActionPreference='Stop'
$gcRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$gcOwner=Join-Path $gcRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$gcStem=Join-Path $PSScriptRoot ('a-gc-freeze-nil-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$gcNames=@('GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS')
$gcPrior=@{};foreach($k in $gcNames){$gcPrior[$k]=[Environment]::GetEnvironmentVariable($k,'Process')}
$gcResult=[ordered]@{kind='a_gc_freeze_typed_nil_candidate_validation.v1';passed=$false;owner=$gcOwner;cleanup=$false;old_exit=$null;fixed_exit=$null;workspace_patch_applied=$false;workspace_matches_candidate=$false;dependencies_installed=$false;actual_SQL=$false;production_approved=$false}
function Read-GCEvents([string]$File){return @(Get-Content -LiteralPath $File|ForEach-Object{$line=$_.TrimStart([char]0xfeff);if($line.StartsWith('{')){$line|ConvertFrom-Json}})}
function Run-GCUnit([string]$Phase,[string]$Pattern){
    $ErrorActionPreference='Continue';$PSNativeCommandUseErrorActionPreference=$false
    Push-Location (Join-Path $gcOwner 'source/backend')
    try {& go test -json -count=1 -timeout=2m -run $Pattern ./internal/systembackupevidence 2>&1 | Tee-Object -FilePath ($gcStem+'-'+$Phase+'.jsonl') | ForEach-Object {Write-Host $_.ToString()};return $LASTEXITCODE}finally{Pop-Location}
}
. (Join-Path $gcRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
. (Join-Path $gcRoot 'scripts/system-backup-a-config-proof-source.ps1')
Start-Transcript -LiteralPath ($gcStem+'.txt') -NoClobber|Out-Null
try {
    [IO.Directory]::CreateDirectory($gcOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $gcOwner 'owner.txt'),[IO.Path]::GetFileName($gcOwner))
    $gcSnapshot=New-AConfigProofSourceSnapshot -Root $gcRoot -Owner $gcOwner -MaxAttempts 3
    $gcResult.source=$gcSnapshot
    $gcRelative='backend/internal/systembackupevidence/download_retention_gc_freeze.go'
    $gcTarget=Join-Path (Join-Path $gcOwner 'source') $gcRelative
    $gcOld=[IO.File]::ReadAllText($gcTarget)
    $gcBefore='if (v.Kind() == reflect.Ptr || v.Kind() == reflect.Interface) && v.IsNil() {'
    $gcAfter='if (v.Kind() == reflect.Ptr || v.Kind() == reflect.Interface || v.Kind() == reflect.Map || v.Kind() == reflect.Slice || v.Kind() == reflect.Func || v.Kind() == reflect.Chan) && v.IsNil() {'
    if(($gcOld.Split(@($gcBefore),[StringSplitOptions]::None)).Count -ne 2){throw 'Expected unique old typed-nil guard is absent; do not alter another version'}
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $gcOwner 'cache';$env:GOTMPDIR=Join-Path $gcOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $gcOwner 'telemetry'
    [IO.Directory]::CreateDirectory($env:GOTMPDIR)|Out-Null;[IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR)|Out-Null
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off 2026-10-23')
    $gcResult.old_exit=Run-GCUnit 'old' '^TestAFreezeTypedNilConnectorBoundary$'
    $gcOldEvents=Read-GCEvents ($gcStem+'-old.jsonl')
    $gcFailures=@($gcOldEvents|Where-Object {$_.Test -and $_.Action -eq 'fail'}|ForEach-Object {$_.Test}|Sort-Object)
    $gcExpected=@('TestAFreezeTypedNilConnectorBoundary','TestAFreezeTypedNilConnectorBoundary/map_nil','TestAFreezeTypedNilConnectorBoundary/slice_nil','TestAFreezeTypedNilConnectorBoundary/func_nil','TestAFreezeTypedNilConnectorBoundary/chan_nil')|Sort-Object
    if($gcResult.old_exit -eq 0 -or @((Compare-Object $gcExpected $gcFailures)).Count -ne 0){throw 'Old run did not prove the exact four typed-nil counterexamples'}
    $gcResult.old_failed_tests=$gcFailures
    $gcNew=$gcOld.Replace($gcBefore,$gcAfter)
    (Get-Item -LiteralPath $gcTarget).IsReadOnly=$false
    [IO.File]::WriteAllText($gcTarget,$gcNew,[Text.UTF8Encoding]::new($false))
    $gcResult.fixed_exit=Run-GCUnit 'fixed' '^(TestAFreezeTypedNilConnectorBoundary|TestDownloadGCFreezeCandidate)'
    $gcEvents=Read-GCEvents ($gcStem+'-fixed.jsonl')
    if($gcResult.fixed_exit -ne 0 -or @($gcEvents|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -ne 0){throw 'Candidate GC unit validation failed'}
    foreach($test in @('TestAFreezeTypedNilConnectorBoundary','TestDownloadGCFreezeCandidateOrderAndFreshDisposal','TestDownloadGCFreezeCandidateFailures','TestDownloadGCFreezeCandidateClosedPreflight')){if(@($gcEvents|Where-Object {$_.Test -eq $test -and $_.Action -eq 'pass'}).Count -ne 1){throw 'Required candidate root did not pass'}}
    $gcResult.fixed_pass_events=@($gcEvents|Where-Object {$_.Test -and $_.Action -eq 'pass'}).Count
    $gcPins=@(Get-DIndexInputPins -Root (Join-Path $gcOwner 'source') -Files @($gcSnapshot.files|ForEach-Object {$_.path}))
    foreach($p in $gcSnapshot.files|Where-Object {$_.path -ne $gcRelative}){$q=$gcPins|Where-Object {$_.path -eq $p.path};if($q.sha256 -ne $p.sha256 -or $q.size -ne $p.size){throw 'Unrelated frozen validation source changed'}}
    $gcResult.original_candidate=$gcSnapshot.files|Where-Object {$_.path -eq $gcRelative}
    $gcResult.fixed_candidate=$gcPins|Where-Object {$_.path -eq $gcRelative}
    $gcResult.fixed_candidate.bytes_base64=[Convert]::ToBase64String([IO.File]::ReadAllBytes($gcTarget))
    $gcLive=Join-Path $gcRoot $gcRelative
    if((Get-FileHash -Algorithm SHA256 -LiteralPath $gcLive).Hash.ToLowerInvariant() -eq $gcResult.original_candidate.sha256){[IO.File]::WriteAllText($gcLive,$gcNew,[Text.UTF8Encoding]::new($false));$gcResult.workspace_patch_applied=$true}
    $gcResult.workspace_matches_candidate=(Get-FileHash -Algorithm SHA256 -LiteralPath $gcLive).Hash.ToLowerInvariant() -eq $gcResult.fixed_candidate.sha256
    $gcResult.passed=$true
} finally {
    foreach($k in $gcNames){[Environment]::SetEnvironmentVariable($k,$gcPrior[$k],'Process')}
    if(Test-Path -LiteralPath $gcOwner){$gcResolved=(Resolve-Path -LiteralPath $gcOwner).Path;if([IO.Path]::GetDirectoryName($gcResolved) -ne $gcRoot -or [IO.Path]::GetFileName($gcResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or (Get-Item -LiteralPath $gcResolved).Attributes -band [IO.FileAttributes]::ReparsePoint -or [IO.File]::ReadAllText((Join-Path $gcResolved 'owner.txt')) -ne [IO.Path]::GetFileName($gcResolved)){throw 'Unsafe GC validation cleanup target'};Remove-Item -LiteralPath $gcResolved -Recurse -Force}
    $gcResult.cleanup= -not (Test-Path -LiteralPath $gcOwner)
    [IO.File]::WriteAllText(($gcStem+'.json'),($gcResult|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
    Stop-Transcript|Out-Null
}
