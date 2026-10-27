[CmdletBinding()]
param([ValidateRange(1,4)][int]$BuildParallelism=1)
$ErrorActionPreference='Stop'
$caRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $caRoot 'scripts/system-backup-a-bootstrap-source.ps1')
. (Join-Path $caRoot 'scripts/system-backup-a-evidence-go-step.ps1')
function Get-CATrustSource([string]$Root){
 $base=Get-ABootstrapSourceState -Root $Root
 if($base.missing_required.Count){throw 'Missing base security input'}
 Push-Location $Root
 try{$caFiles=@(& rg --files --hidden --no-ignore backend/internal/systembackupcatrust | Where-Object {$_ -match '\.go$'} | ForEach-Object {$_.Replace('\','/')});if($LASTEXITCODE -ne 0){throw 'Cannot enumerate CA adapter inputs'}}finally{Pop-Location}
 if($caFiles.Count -lt 2){throw 'CA adapter or its regression tests missing'}
 $files=@(@($base.files|ForEach-Object {$_.path})+$caFiles|Sort-Object -CaseSensitive -Unique)
 $pins=@(Get-DIndexInputPins -Root $Root -Files $files)
 return [ordered]@{files=$pins;source_sha256=(Get-DIndexPinDigest -Pins $pins)}
}
$caOwner=Join-Path $caRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$caFrozen=Join-Path $caOwner 'source'
$caOutput=Join-Path $PSScriptRoot ('a-ca-trust-candidate-'+(Get-Date -Format yyyyMMdd-HHmmss)+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')
$caVariables=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$caPrior=@{};foreach($name in $caVariables){$caPrior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$caResult=[ordered]@{kind='a_ca_trust_candidate_validation.v1';status='failed';files=@();source_sha256='';owner=$caOwner;test_exit=$null;linux_build=$false;frozen_inputs_match=$false;current_inputs_match=$false;cleanup_verified=$false;default_vet=$true;dependencies_installed=$false;external_provider_contacted=$false;synthetic_loopback_TLS=$true;production_linked=$false;production_approved=$false}
try{
 foreach($directory in @('source','cache','tmp','binary')){[IO.Directory]::CreateDirectory((Join-Path $caOwner $directory))|Out-Null}
 $caBaseline=Get-CATrustSource -Root $caRoot
 $caResult.files=$caBaseline.files;$caResult.source_sha256=$caBaseline.source_sha256
 foreach($pin in $caBaseline.files){
  $target=Join-Path $caFrozen $pin.path;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
  Copy-Item -LiteralPath (Join-Path $caRoot $pin.path) -Destination $target
  if((Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Source changed during CA freeze'}
  (Get-Item -LiteralPath $target).IsReadOnly=$true
 }
 if((Get-CATrustSource -Root $caRoot).source_sha256 -cne $caBaseline.source_sha256){throw 'CA source/file set changed during freeze'}
 $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS=('-mod=readonly -p='+$BuildParallelism);$env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS=[string]$BuildParallelism
 $env:GOCACHE=Join-Path $caOwner 'cache';$env:GOTMPDIR=Join-Path $caOwner 'tmp'
 Initialize-AEvidenceTelemetry -Scratch $caOwner
 Write-Output ('CA_FROZEN source_sha256='+$caBaseline.source_sha256+' files='+$caBaseline.files.Count+' owner='+$caOwner)
 Push-Location (Join-Path $caFrozen 'backend')
 try{
  Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','-timeout=5m','./internal/systembackupcatrust') -Stage 'test-vet'
  $caResult.test_exit=0;$env:GOOS='linux'
  Invoke-AEvidenceGoStep -Arguments @('test','-c','-o',(Join-Path $caOwner 'binary/ca-trust.test'),'./internal/systembackupcatrust') -Stage 'mysql-probe-build'
  $caResult.linux_build=$true
 }finally{Pop-Location}
 $caResult.frozen_inputs_match=(Get-CATrustSource -Root $caFrozen).source_sha256 -ceq $caBaseline.source_sha256
 $caResult.current_inputs_match=(Get-CATrustSource -Root $caRoot).source_sha256 -ceq $caBaseline.source_sha256
 if(-not $caResult.frozen_inputs_match -or -not $caResult.current_inputs_match){throw 'CA tested inputs drifted; retain the frozen result only'}
 $caResult.status='candidate_tests_and_linux_compile_passed_actual_materials_and_review_pending'
}finally{
 foreach($name in $caVariables){[Environment]::SetEnvironmentVariable($name,$caPrior[$name],'Process')}
 if(Test-Path -LiteralPath $caOwner){
  $resolved=(Resolve-Path -LiteralPath $caOwner).Path
  if($resolved -cne $caOwner -or [IO.Path]::GetDirectoryName($resolved) -cne $caRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe CA cleanup owner'}
  foreach($entry in @(Get-ChildItem -LiteralPath $resolved -Recurse -Force)){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected CA cleanup child'}}
  Remove-Item -LiteralPath $resolved -Recurse -Force
 }
 $caResult.cleanup_verified=-not(Test-Path -LiteralPath $caOwner)
 if(Test-Path -LiteralPath $caOutput){throw 'CA receipt already exists'}
 [IO.File]::WriteAllText($caOutput,($caResult|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))
 Write-Output ('CA_CLEANUP verified='+$caResult.cleanup_verified+' owner='+$caOwner)
 Write-Output ('CA_RECEIPT '+$caOutput)
}
