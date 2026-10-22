$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e';$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot 'd-gc-freeze-probe-output-diagnostic-20261021'
if(Test-Path -LiteralPath ($prefix+'-source.json')){throw 'Diagnostic evidence occupied'}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong diagnostic owner'}
$native=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r4-native.json') -Raw|ConvertFrom-Json
if(($native.stages|Where-Object stage -CEQ 'full').exit -ne 1){throw 'Original failed gate must be terminal'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$prior=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r4-source.json') -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $prior
[ordered]@{kind='d_gc_freeze_r4_failed_gate_source_postcheck';source_sha256=$prior.source_sha256;source_postcheck=$true;gate_passed=$false;known_assertion='TestADownloadNativeBufferedOutputKeepsOriginalDeadline/http2/result_crosses_deadline';framework_timeout_seconds=900;security_package_pass_retained=$true;actual_mysql=$false;production_approved=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-r4-failed-source-postcheck-20261021.json') -Encoding utf8NoBOM
& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-freeze-probe-output-deadline-edit-20261021.mjs') diagnostic
if($LASTEXITCODE -ne 0){throw 'Diagnostic edit failed'}
$changed='backend/internal/systembackupevidence/download_output_deadline_a_test.go'
& 'C:/Program Files/Go/bin/gofmt.exe' -w (Join-Path $source $changed)
if($LASTEXITCODE -ne 0){throw 'Diagnostic format failed'}
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$map=@{};foreach($pin in $pins){$map[$pin.path]=$pin}
foreach($pin in $prior.files){if($pin.path -cne $changed -and $pin.sha256 -cne $map[$pin.path].sha256){throw 'Unrelated diagnostic source changed'}}
(Get-Item -LiteralPath (Join-Path $source $changed)).IsReadOnly=$true
$manifest=[ordered]@{kind='d_gc_freeze_native_deadline_diagnostic_source';source_sha256=(Get-DIndexPinDigest -Pins $pins);parent_source_sha256=$prior.source_sha256;files=$pins;only_changed_file=$changed;diagnostic_only=$true;production_approved=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$exit=-1;$post=$false
Push-Location (Join-Path $source 'backend')
try{
 & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=3 -timeout=120s -json -run '^TestADownloadNativeBufferedOutputKeepsOriginalDeadline$/^http2$/^result_crosses_deadline$' ./internal/systembackupevidence 1>($prefix+'.stdout') 2>($prefix+'.stderr')
 $exit=$LASTEXITCODE
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;$post=$true
}finally{
 Pop-Location
 [ordered]@{kind='d_gc_freeze_native_deadline_diagnostic';exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;repeat_count=3;diagnostic_only=$true;gate_passed=$false;production_budget_changed=$false;dependencies_installed=$false;actual_mysql=$false;remote=$false}|ConvertTo-Json|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('DEADLINE_DIAGNOSTIC observed-exit='+$exit+' source-postcheck='+$post+' not-a-gate=yes')
