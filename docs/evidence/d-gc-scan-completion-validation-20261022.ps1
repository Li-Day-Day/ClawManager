param([ValidateSet('baseline','focused','published')][string]$Stage='baseline')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-91d7897bdfb34761ad4adce2669bb651'
$source=Join-Path $owner 'source'
$basePath=Join-Path $PSScriptRoot 'd-gc-scan-completion-base-20261022.json'
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
. (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
if($Stage -eq 'baseline'){
 if(Test-Path -LiteralPath $owner){throw 'Owner already exists'}
 [IO.Directory]::CreateDirectory($owner)|Out-Null
 [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
 $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
 $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $basePath -Encoding utf8NoBOM
}else{$manifest=Get-Content -LiteralPath $basePath -Raw|ConvertFrom-Json}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong owner'}
$runtime='backend/internal/systembackupevidence/download_retention_gc_batch.go'
$test='backend/internal/systembackupevidence/download_retention_gc_scan_completion_test.go'
if($Stage -ne 'baseline'){
 $files=Get-DIndexSourceFiles -Root $source
 $pins=Get-DIndexInputPins -Root $source -Files $files
 if(($files -join "`n") -cne (@($manifest.files.path) -join "`n")){throw 'Frozen source set changed'}
 foreach($pin in $pins){
  $original=@($manifest.files|Where-Object path -CEQ $pin.path)[0]
  if($pin.path -cne $runtime -and $pin.sha256 -cne $original.sha256){throw ('Unrelated frozen source drift: '+$pin.path)}
 }
 $manifest=[ordered]@{source_sha256=(Get-DIndexPinDigest -Pins $pins);files=$pins}
 $candidatePath=Join-Path $PSScriptRoot 'd-gc-scan-completion-candidate-20261022.json'
 if(Test-Path -LiteralPath $candidatePath){
  $candidate=Get-Content -LiteralPath $candidatePath -Raw|ConvertFrom-Json
  if($candidate.source_sha256 -cne $manifest.source_sha256){throw 'Candidate drift'}
 }else{$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $candidatePath -Encoding utf8NoBOM}
}
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$runRoot=$source
$pattern='^TestDownloadRetentionGC(BatchScanRollbackFailure|ScanCompletion)$'
if($Stage -eq 'published'){$pattern='.'}
if($Stage -eq 'published'){$runRoot=$root}
$inputFiles=Get-DIndexSourceFiles -Root $runRoot
$inputBefore=Get-DIndexInputPins -Root $runRoot -Files $inputFiles
if($Stage -eq 'published'){
 foreach($file in @($runtime,$test)){
  if((Get-FileHash -LiteralPath (Join-Path $root $file)).Hash -cne (Get-FileHash -LiteralPath (Join-Path $source $file)).Hash){throw 'Published candidate mismatch'}
 }
}
$prefix=Join-Path $PSScriptRoot ('d-gc-scan-completion-20261022-'+$Stage)
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Stage already recorded'}
$exit=-1;$post=$false
Push-Location (Join-Path $runRoot 'backend')
try{
 & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=1200s -json -run $pattern ./internal/systembackupevidence 1> ($prefix+'.stdout') 2> ($prefix+'.stderr')
 $exit=$LASTEXITCODE
}finally{
 Pop-Location
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 $inputAfterFiles=Get-DIndexSourceFiles -Root $runRoot
 $inputAfter=Get-DIndexInputPins -Root $runRoot -Files $inputAfterFiles
 $post=($inputFiles -join "`n") -ceq ($inputAfterFiles -join "`n") -and (Get-DIndexPinDigest -Pins $inputBefore) -ceq (Get-DIndexPinDigest -Pins $inputAfter)
 [ordered]@{stage=$Stage;exit=$exit;frozen_source_sha256=$manifest.source_sha256;input_before_sha256=(Get-DIndexPinDigest -Pins $inputBefore);input_after_sha256=(Get-DIndexPinDigest -Pins $inputAfter);input_count=$inputBefore.Count;input_unchanged=$post;owner=$owner;default_vet=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false}|ConvertTo-Json|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('GC_SCAN stage='+$Stage+' exit='+$exit+' input_unchanged='+$post)
if(-not $post){throw 'Validation inputs changed'}
if($Stage -eq 'baseline'){if($exit -ne 1){throw 'Baseline must fail assertions'}}elseif($exit -ne 0){throw 'Candidate validation failed'}
