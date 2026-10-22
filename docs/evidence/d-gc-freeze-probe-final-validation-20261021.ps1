param([ValidateSet(5,6,7,8)][int]$Revision=5)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e';$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot ('d-gc-freeze-probe-20261021-r'+$Revision)
if(Test-Path -LiteralPath ($prefix+'-source.json')){throw 'Final validation evidence occupied'}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong final owner'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
if($Revision -ge 6){
 $failedRevision=$Revision-1
 $failed=Get-Content -LiteralPath (Join-Path $PSScriptRoot ('d-gc-freeze-probe-20261021-r'+$failedRevision+'-native.json')) -Raw|ConvertFrom-Json
 if(($failed.stages|Where-Object stage -CEQ 'deadline-focused').exit -ne 1){throw 'Focused failure must be terminal'}
 $diagSource=Get-Content -LiteralPath (Join-Path $PSScriptRoot ('d-gc-freeze-probe-20261021-r'+$failedRevision+'-source.json')) -Raw|ConvertFrom-Json
 Test-DIndexSourceSnapshot -Root $source -Manifest $diagSource
 $observation=if($Revision -eq 6){'audit committed but zero bytes and interrupted outcome with two-second fixture'}else{'three legitimate post-release clocks; tighten final-clock selector'}
 [ordered]@{kind='d_gc_freeze_failed_source_postcheck';source_sha256=$diagSource.source_sha256;source_postcheck=$true;gate_passed=$false;observed=$observation;production_approved=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot ('d-gc-freeze-probe-r'+$failedRevision+'-failed-source-postcheck-20261021.json')) -Encoding utf8NoBOM
 $clockHelper=if($Revision -eq 6){'d-gc-freeze-probe-late-clock-20261021.mjs'}elseif($Revision -eq 7){'d-gc-freeze-probe-final-clock-20261021.mjs'}else{'d-gc-freeze-probe-clock-boundary-20261021.mjs'}
 & 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot $clockHelper)
 if($LASTEXITCODE -ne 0){throw 'Late clock fixture edit failed'}
}else{
 $diagnostic=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-output-diagnostic-20261021-native.json') -Raw|ConvertFrom-Json
 if(-not $diagnostic.source_postcheck){throw 'Diagnostic must be terminal and source checked'}
 $diagSource=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-output-diagnostic-20261021-source.json') -Raw|ConvertFrom-Json
 Test-DIndexSourceSnapshot -Root $source -Manifest $diagSource
 foreach($mode in @('repair','suite')){
 $helper=if($mode -eq 'repair'){'d-gc-freeze-probe-output-deadline-edit-20261021.mjs'}else{'d-gc-freeze-probe-suite-budget-20261021.mjs'}
 if($mode -eq 'repair'){& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot $helper) repair}else{& 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot $helper)}
 if($LASTEXITCODE -ne 0){throw ('Final preparation failed '+$mode)}
 }
}
$fixture='backend/internal/systembackupevidence/download_output_deadline_a_test.go'
& 'C:/Program Files/Go/bin/gofmt.exe' -w (Join-Path $source $fixture)
if($LASTEXITCODE -ne 0){throw 'Fixture format failed'}
$parentRevision=if($Revision -ge 6){$Revision-1}else{4}
$prior=Get-Content -LiteralPath (Join-Path $PSScriptRoot ('d-gc-freeze-probe-20261021-r'+$parentRevision+'-source.json')) -Raw|ConvertFrom-Json
$allowed=if($Revision -ge 6){@($fixture)}else{@($fixture,'scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1')}
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$map=@{};foreach($pin in $pins){$map[$pin.path]=$pin}
if($pins.Count -ne $prior.files.Count){throw 'Final source set changed'}
foreach($pin in $prior.files){if($pin.path -cnotin $allowed -and $pin.sha256 -cne $map[$pin.path].sha256){throw ('Unexpected final source change '+$pin.path)}}
foreach($p in $allowed){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
$manifest=[ordered]@{kind='d_gc_freeze_prerequisite_final_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);parent_source_sha256=$prior.source_sha256;files=$pins;changed_from_parent=$allowed;production_approved=$false;actual_mysql=$false;dependencies_installed=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$env:PATH='C:/Program Files/nodejs;C:/Program Files/Go/bin;'+$env:PATH
$results=[Collections.Generic.List[object]]::new();$exit=-1;$post=$false;$cfRestored=$false
function RunFinal {
 param([string]$Name,[string]$File,[string[]]$Arguments,[int]$ExpectedExit=0)
 Write-Output ('FREEZE_FINAL started='+$Name)
 & $File @Arguments 1>($prefix+'-'+$Name+'.stdout') 2>($prefix+'-'+$Name+'.stderr')
 $code=$LASTEXITCODE;$results.Add([ordered]@{stage=$Name;exit=$code;expected_exit=$ExpectedExit})
 if($code -ne $ExpectedExit){throw ('Final validation failed '+$Name+' exit='+$code)}
 Write-Output ('FREEZE_FINAL passed='+$Name)
}
Push-Location $source
try{
 if($Revision -eq 5){foreach($ps in @(@('ps7','C:/Users/zhanghui08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'),@('ps5','C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'))){foreach($name in @('d-download-gc-freeze','d-download-gc-task','d-download-producer','a-download-gc-role','a-evidence')){RunFinal -Name ($ps[0]+'-'+$name) -File $ps[1] -Arguments @('-NoProfile','-File',(Join-Path $source ('scripts/system-backup-'+$name+'-dispatch.test.ps1')))}}}
 Set-Location (Join-Path $source 'backend');$go='C:/Program Files/Go/bin/go.exe';$focus='^TestADownloadNativeBufferedOutputKeepsOriginalDeadline$'
 RunFinal -Name 'deadline-focused' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=3','-timeout=180s','-json','-run',$focus,'./internal/systembackupevidence')
 & 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-freeze-probe-output-deadline-edit-20261021.mjs') counterfactual
 if($LASTEXITCODE -ne 0){throw 'Counterfactual setup failed'}
 try{
  RunFinal -Name 'deadline-counterfactual' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=1','-timeout=120s','-json','-run',$focus,'./internal/systembackupevidence') -ExpectedExit 1
  $counterText=[IO.File]::ReadAllText($prefix+'-deadline-counterfactual.stdout')
  if([regex]::Matches($counterText,'buffered plaintext flushed after original deadline').Count -ne 2 -or $counterText.Contains('native response did not reach independent result/release')){throw 'Counterfactual failed for an unrelated reason'}
 }finally{
  & 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-freeze-probe-output-deadline-edit-20261021.mjs') restore
  if($LASTEXITCODE -ne 0){throw 'Counterfactual restore failed'}
  (Get-Item -LiteralPath (Join-Path $source $fixture)).IsReadOnly=$true
  Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;$cfRestored=$true
 }
 # The r4 security package passed and all its Go/fixture inputs are unchanged.
 # Re-run the complete affected evidence package, never just a pass-until-green subset.
 RunFinal -Name 'full-evidence' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=1','-timeout=2700s','-json','./internal/systembackupevidence')
 $seed='^Test(DDownloadGCFreezeMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
 RunFinal -Name 'tagged-seed' -File $go -Arguments @('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','-tags','systembackup_mysql','-run',$seed,'./internal/systembackupevidence')
 $windows=Join-Path $owner 'd-download-gc-freeze.exe'
 RunFinal -Name 'windows-build' -File $go -Arguments @('test','-mod=readonly','-p=1','-c','-tags','systembackup_mysql','-o',$windows,'./internal/systembackupevidence')
 Set-Location (Join-Path $owner 'detached/work/probe')
 RunFinal -Name 'detached-seed' -File $windows -Arguments @('-test.run',$seed,'-test.v','-test.count=1','-test.timeout=60s')
 RunFinal -Name 'unowned-deny' -File 'C:/Users/zhanghui08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe' -Arguments @('-NoProfile','-File',(Join-Path $PSScriptRoot 'd-gc-freeze-probe-unowned-deny-20261021.ps1'),'-Revision',([string]$Revision))
 Set-Location (Join-Path $source 'backend');$env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
 RunFinal -Name 'linux-build' -File $go -Arguments @('test','-mod=readonly','-p=1','-c','-tags','systembackup_mysql','-o',(Join-Path $owner 'd-download-gc-freeze.test'),'./internal/systembackupevidence')
 RunFinal -Name 'linux-migration' -File $go -Arguments @('build','-mod=readonly','-p=1','-o',(Join-Path $owner 'system-backup-migrate'),'./cmd/system-backup-migrate')
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest;$post=$true;$exit=0
}finally{
 Pop-Location
 [ordered]@{kind='d_gc_freeze_prerequisite_final_validation';exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;parent_source_sha256=$prior.source_sha256;counterfactual_restored=$cfRestored;stages=$results;evidence_framework_timeout_seconds=2700;all_evidence_tests=$true;security_pass_reused_from_unchanged_r4=$true;default_vet=$true;dependencies_installed=$false;remote=$false;actual_mysql=$false;full_gc=$false;freeze_adapter_wired=$false;production_approved=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('FREEZE_FINAL exit='+$exit+' source-postcheck='+$post)
exit $exit
