[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=4,[Parameter(Mandatory=$true)][string]$SeedCacheOwner)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$nonceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $nonceRoot 'scripts/system-backup-a-bootstrap-source.ps1')
. (Join-Path $nonceRoot 'scripts/system-backup-a-evidence-go-step.ps1')
function Get-NonceBootstrapSource([string]$Root){
 $base=Get-ABootstrapSourceState -Root $Root
 if($base.missing_required.Count){throw 'Missing base security input'}
 Push-Location $Root
 try{$nonceFiles=@(& rg --files --hidden --no-ignore backend/internal/systembackupnoncebootstrap backend/internal/systembackupcatrust | Where-Object {$_ -match '\.go$'} | ForEach-Object {$_.Replace('\','/')});if($LASTEXITCODE -ne 0){throw 'Cannot enumerate nonce/CA adapter inputs'}}finally{Pop-Location}
 foreach($required in @('backend/internal/systembackupnoncebootstrap/nonce.go','backend/internal/systembackupnoncebootstrap/nonce_test.go','backend/internal/systembackupcatrust/ca.go','backend/internal/systembackupcatrust/ca_test.go')){if($required -cnotin $nonceFiles){throw 'Nonce/CA adapter or regression tests missing'}}
 $validation=@('scripts/system-backup-a-nonce-ca-r2-validation.ps1','scripts/system-backup-a-bootstrap-source.ps1','scripts/system-backup-a-evidence-go-step.ps1','scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-compilation-cache-seed.mjs','docs/evidence/a-ca-binding-original-source-20261023.json')
 $files=@(@($base.files|ForEach-Object {$_.path})+$nonceFiles+$validation|Sort-Object -CaseSensitive -Unique)
 $pins=@(Get-DIndexInputPins -Root $Root -Files $files)
 return [ordered]@{files=$pins;source_sha256=(Get-DIndexPinDigest -Pins $pins)}
}
$nonceOwner=Join-Path $nonceRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$nonceFrozen=Join-Path $nonceOwner 'source'
$nonceOutput=Join-Path $nonceRoot ('docs/evidence/a-nonce-ca-r2-candidate-'+(Get-Date -Format yyyyMMdd-HHmmss)+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')
$nonceVariables=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$noncePrior=@{};foreach($name in $nonceVariables){$noncePrior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$nonceResult=[ordered]@{kind='a_nonce_bootstrap_candidate_validation.v2';status='failed';packages=@('clawreef/internal/systembackupnoncebootstrap','clawreef/internal/systembackupcatrust');files=@();source_sha256='';owner=$nonceOwner;test_exit=$null;linux_build=$false;frozen_inputs_match=$false;current_inputs_match=$false;cleanup_verified=$false;default_vet=$true;dependencies_installed=$false;external_provider_contacted=$false;synthetic_SQL_driver=$true;synthetic_loopback_TLS=$true;production_linked=$false;production_approved=$false}
$nonceResult.original_counterexample_verified=$false
$nonceResult.counterexample_exit=$null
$nonceResult.counterexample_log=[IO.Path]::ChangeExtension($nonceOutput,'old.jsonl')
$nonceResult.cache_seed_audit=[IO.Path]::ChangeExtension($nonceOutput,'cache-seed.json')
try{
 foreach($directory in @('source','cache','tmp','binary')){[IO.Directory]::CreateDirectory((Join-Path $nonceOwner $directory))|Out-Null}
 [IO.File]::WriteAllText((Join-Path $nonceOwner '.nonce-ca-owner'),[IO.Path]::GetFileName($nonceOwner))
 $nonceBaseline=Get-NonceBootstrapSource -Root $nonceRoot
 $nonceResult.files=$nonceBaseline.files;$nonceResult.source_sha256=$nonceBaseline.source_sha256
 foreach($pin in $nonceBaseline.files){
  $target=Join-Path $nonceFrozen $pin.path;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
  Copy-Item -LiteralPath (Join-Path $nonceRoot $pin.path) -Destination $target
  if((Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Source changed during nonce freeze'}
  (Get-Item -LiteralPath $target).IsReadOnly=$true
 }
 if((Get-NonceBootstrapSource -Root $nonceRoot).source_sha256 -cne $nonceBaseline.source_sha256){throw 'Nonce source/file set changed during freeze'}
 $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS=('-mod=readonly -p='+$BuildParallelism);$env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS=[string]$BuildParallelism
 $env:GOCACHE=Join-Path $nonceOwner 'cache';$env:GOTMPDIR=Join-Path $nonceOwner 'tmp'
 Initialize-AEvidenceTelemetry -Scratch $nonceOwner
 & node (Join-Path $nonceFrozen 'scripts/system-backup-a-compilation-cache-seed.mjs') $nonceRoot $SeedCacheOwner $nonceOwner $nonceResult.cache_seed_audit
 if($LASTEXITCODE -ne 0){throw 'Read-only compilation cache seed failed'}
 Write-Output ('NONCE_FROZEN source_sha256='+$nonceBaseline.source_sha256+' files='+$nonceBaseline.files.Count+' owner='+$nonceOwner)
 Push-Location (Join-Path $nonceFrozen 'backend')
 try{
  $nonceOriginal=Get-Content -Raw -LiteralPath (Join-Path $nonceFrozen 'docs/evidence/a-ca-binding-original-source-20261023.json')|ConvertFrom-Json
  if($nonceOriginal.kind -cne 'a_ca_binding_original_source.v1' -or $nonceOriginal.finding -cne 'D-A-CA-01'){throw 'Original source capsule differs'}
  $nonceOriginalCA=@($nonceOriginal.files | Where-Object path -CEQ 'backend/internal/systembackupcatrust/ca.go')
  if($nonceOriginalCA.Count -ne 1){throw 'Original exact CA source required'}
  $nonceOldSource=Join-Path $nonceOwner 'original-ca.go'
  [IO.File]::WriteAllBytes($nonceOldSource,[Convert]::FromBase64String($nonceOriginalCA[0].bytes_base64))
  if((Get-FileHash -LiteralPath $nonceOldSource -Algorithm SHA256).Hash.ToLowerInvariant() -cne $nonceOriginalCA[0].sha256){throw 'Original CA source digest differs'}
  $nonceOverlayMap=@{};$nonceOverlayMap[(Join-Path $nonceFrozen 'backend/internal/systembackupcatrust/ca.go')]=$nonceOldSource
  $nonceOverlay=Join-Path $nonceOwner 'original-overlay.json'
  [IO.File]::WriteAllText($nonceOverlay,(@{Replace=$nonceOverlayMap}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  & go test -overlay $nonceOverlay -run '^TestCATrustBindingNeverFormatsOrSerializesDeploymentPins$' -count=1 -json ./internal/systembackupcatrust 2>&1 | Set-Content -LiteralPath $nonceResult.counterexample_log -Encoding utf8
  $nonceResult.counterexample_exit=$LASTEXITCODE
  $nonceOldEvents=@(Get-Content -LiteralPath $nonceResult.counterexample_log | ForEach-Object {$_|ConvertFrom-Json})
  $nonceExpectedFailures=@('TestCATrustBindingNeverFormatsOrSerializesDeploymentPins')
  foreach($representation in @('value','pointer')){foreach($caseName in @('default','detailed','Go','json')){$nonceExpectedFailures+=('TestCATrustBindingNeverFormatsOrSerializesDeploymentPins/'+$representation+'/'+$caseName)}}
  $nonceActualFailures=@($nonceOldEvents | Where-Object {$_.Action -ceq 'fail' -and $_.Test} | ForEach-Object {$_.Test} | Sort-Object -CaseSensitive)
  if($nonceResult.counterexample_exit -ne 1 -or ($nonceActualFailures -join "`n") -cne (@($nonceExpectedFailures | Sort-Object -CaseSensitive) -join "`n") -or @($nonceOldEvents | Where-Object {$_.Action -ceq 'fail' -and -not $_.Test}).Count -ne 1 -or @($nonceOldEvents | Where-Object {$_.Action -in @('skip','build-fail')}).Count){throw 'Original CA output counterexample did not reach all eight expected failures'}
  $nonceResult.original_counterexample_verified=$true
  Write-Output ('ORIGINAL_CA_COUNTEREXAMPLE expected_failures=8 native_exit=1 log='+$nonceResult.counterexample_log)
  Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','-timeout=5m','./internal/systembackupnoncebootstrap','./internal/systembackupcatrust') -Stage 'test-vet'
  $nonceResult.test_exit=0;$env:GOOS='linux'
  Invoke-AEvidenceGoStep -Arguments @('test','-c','-o',(Join-Path $nonceOwner 'binary/nonce-bootstrap.test'),'./internal/systembackupnoncebootstrap') -Stage 'mysql-probe-build'
  Invoke-AEvidenceGoStep -Arguments @('test','-c','-o',(Join-Path $nonceOwner 'binary/ca-trust.test'),'./internal/systembackupcatrust') -Stage 'mysql-probe-build'
  $nonceResult.linux_build=$true
 }finally{Pop-Location}
 $nonceResult.frozen_inputs_match=(Get-NonceBootstrapSource -Root $nonceFrozen).source_sha256 -ceq $nonceBaseline.source_sha256
 $nonceResult.current_inputs_match=(Get-NonceBootstrapSource -Root $nonceRoot).source_sha256 -ceq $nonceBaseline.source_sha256
 if(-not $nonceResult.frozen_inputs_match -or -not $nonceResult.current_inputs_match){throw 'Nonce tested inputs drifted; retain the frozen result only'}
 $nonceResult.status='candidate_tests_and_linux_compile_passed_actual_materials_and_review_pending'
}finally{
 foreach($name in $nonceVariables){[Environment]::SetEnvironmentVariable($name,$noncePrior[$name],'Process')}
 if(Test-Path -LiteralPath $nonceOwner){
  $resolved=(Resolve-Path -LiteralPath $nonceOwner).Path
  if($resolved -cne $nonceOwner -or [IO.Path]::GetDirectoryName($resolved) -cne $nonceRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe nonce cleanup owner'}
  foreach($entry in @(Get-ChildItem -LiteralPath $resolved -Recurse -Force)){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected nonce cleanup child'}}
  Remove-Item -LiteralPath $resolved -Recurse -Force
 }
 $nonceResult.cleanup_verified=-not(Test-Path -LiteralPath $nonceOwner)
 if(Test-Path -LiteralPath $nonceOutput){throw 'Nonce receipt already exists'}
 [IO.File]::WriteAllText($nonceOutput,($nonceResult|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
 Write-Output ('NONCE_CLEANUP verified='+$nonceResult.cleanup_verified+' owner='+$nonceOwner)
 Write-Output ('NONCE_RECEIPT '+$nonceOutput)
}
