param([ValidateSet('focused','full','published','counterfactual-propagation','counterfactual-batch')][string]$Stage='focused')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-rollback-outcome-base-20261022.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner);$source=Join-Path $owner 'source'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong source owner'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifestPath=Join-Path $PSScriptRoot 'd-gc-rollback-outcome-candidate-20261022-source.json'
$targets=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-rollback-outcome-targets-20261022.json') -Raw|ConvertFrom-Json
if(-not(Test-Path -LiteralPath $manifestPath)){
 $pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
 if($pins.Count -ne $base.files.Count+1){throw 'Unexpected source set'}
 foreach($p in $base.files){if($p.path -cnotin $targets.changes.path -and (@($pins|Where-Object path -CEQ $p.path)[0].sha256 -cne $p.sha256)){throw ('Unrelated source change '+$p.path)}}
 [ordered]@{kind='d_gc_rollback_outcome_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);files=$pins;dependencies_installed=$false;actual_mysql=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
}
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
$prefix=Join-Path $PSScriptRoot ('d-gc-rollback-outcome-20261022-'+$Stage)
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Existing validation stage'}
foreach($d in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $d))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$changedPath=$null;$saved=$null;$exit=-1;$post=$false;$completed=$false
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
foreach($p in $targets.changes){(Get-Item -LiteralPath (Join-Path $source $p.path)).IsReadOnly=$true}
$runRoot=$source
$pattern='^TestDownload(GCConnection|RetentionGCConnection|RetentionGCRollback|RetentionGCBatchRollback|GCBatchRollback)'
if($Stage -eq 'full' -or $Stage -eq 'published'){$pattern='.'}
if($Stage -eq 'published'){$runRoot=$root}
$tab=[string][char]9
if($Stage -eq 'counterfactual-propagation'){
 $changedPath=Join-Path $source 'backend/internal/systembackupevidence/download_retention_gc.go'
 $saved=[IO.File]::ReadAllBytes($changedPath);$candidate=[Text.Encoding]::UTF8.GetString($saved)
 $from=[string]::Join([char]10,@(($tab+'defer func() {'),($tab+$tab+'if closeErr := owned.close(); closeErr != nil {'),($tab+$tab+$tab+'collectErr = closeErr'),($tab+$tab+'}'),($tab+'}()')))
 if($candidate.Split(@($from),[StringSplitOptions]::None).Count -ne 2){throw 'Counterfactual propagation anchor'}
 (Get-Item -LiteralPath $changedPath).IsReadOnly=$false
 [IO.File]::WriteAllText($changedPath,$candidate.Replace($from,($tab+'defer owned.close()')),[Text.UTF8Encoding]::new($false))
 $pattern='^TestDownloadRetentionGC(Batch)?RollbackOutcome$'
}
if($Stage -eq 'counterfactual-batch'){
 $changedPath=Join-Path $source 'backend/internal/systembackupevidence/download_retention_gc_batch.go'
 $saved=[IO.File]::ReadAllBytes($changedPath);$candidate=[Text.Encoding]::UTF8.GetString($saved)
 $from=[string]::Join([char]10,@(($tab+$tab+'if errors.Is(err, ErrDownloadRetentionGCRollbackUnknown) {'),($tab+$tab+$tab+'result.RollbackUnknown = true'),($tab+$tab+$tab+'return result, ErrDownloadRetentionGCRollbackUnknown'),($tab+$tab+'}'),''))
 if($candidate.Split(@($from),[StringSplitOptions]::None).Count -ne 2){throw 'Counterfactual batch anchor'}
 (Get-Item -LiteralPath $changedPath).IsReadOnly=$false
 [IO.File]::WriteAllText($changedPath,$candidate.Replace($from,''),[Text.UTF8Encoding]::new($false))
 $pattern='^TestDownloadGCBatchRollbackUnknownBeforeCancellation$'
}
function Test-PublishedInputs {
 if($Stage -ne 'published'){return}
 & 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'd-gc-rollback-outcome-review-20261022.mjs') --current
 if($LASTEXITCODE -ne 0){throw 'Published input scope drift'}
}
Push-Location (Join-Path $runRoot 'backend')
try{
 Test-PublishedInputs
 & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=2700s -json -run $pattern ./internal/systembackupevidence 1> ($prefix+'.stdout') 2> ($prefix+'.stderr')
 $exit=$LASTEXITCODE;$completed=$true
}finally{
 Pop-Location
 if($changedPath -and $null -ne $saved){[IO.File]::WriteAllBytes($changedPath,$saved);(Get-Item -LiteralPath $changedPath).IsReadOnly=$true}
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 Test-PublishedInputs
 $post=$true
 [ordered]@{kind='d_gc_rollback_outcome_validation';stage=$Stage;exit=$exit;completed=$completed;source_postcheck=$post;source_sha256=$manifest.source_sha256;default_vet=$true;pattern=$pattern;counterfactual=($Stage.StartsWith('counterfactual'));restored_candidate=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('GC_ROLLBACK stage='+$Stage+' exit='+$exit+' postcheck='+$post)
if($Stage.StartsWith('counterfactual')){if($exit -ne 1){throw 'Counterfactual did not fail tests'}}elseif($exit -ne 0){throw 'Rollback outcome validation failed'}
