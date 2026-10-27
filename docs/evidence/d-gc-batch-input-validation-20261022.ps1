param([ValidateSet('baseline','candidate')][string]$Stage='baseline')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-8c8aef13409a46bb8d9a4b1fe0c425de'
$source=Join-Path $owner 'source'
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
. (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
$basePath=Join-Path $PSScriptRoot 'd-gc-batch-input-base-20261022.json'
if($Stage -eq 'baseline'){
 if(Test-Path -LiteralPath $owner){throw 'Owner already exists'}
 [IO.Directory]::CreateDirectory($owner)|Out-Null
 [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
 $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
 $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $basePath -Encoding utf8NoBOM
}else{
 if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong owner'}
}
$files=Get-DIndexSourceFiles -Root $source
$before=Get-DIndexInputPins -Root $source -Files $files
$prefix=Join-Path $PSScriptRoot ('d-gc-batch-input-20261022-'+$Stage)
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Stage already recorded'}
[ordered]@{source_sha256=(Get-DIndexPinDigest -Pins $before);files=$before}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-inputs.json') -Encoding utf8NoBOM
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='2';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$pattern='^TestGCRuntime(FreezesBatchInputs|FailureCallbackCannotReplaceLaterSignal)$'
if($Stage -eq 'candidate'){$pattern='^Test(GCRuntime|JournaledGC|AGCRuntime|AGCAuthority|AGCAbsence)'}
$exit=-1;$stable=$false
Push-Location (Join-Path $source 'backend')
try{
 & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=2 -count=1 -timeout=1200s -json -run $pattern ./internal/systembackupevidence 1> ($prefix+'.stdout') 2> ($prefix+'.stderr')
 $exit=$LASTEXITCODE
}finally{
 Pop-Location
 $afterFiles=Get-DIndexSourceFiles -Root $source
 $after=Get-DIndexInputPins -Root $source -Files $afterFiles
 $stable=($files -join "`n") -ceq ($afterFiles -join "`n") -and (Get-DIndexPinDigest -Pins $before) -ceq (Get-DIndexPinDigest -Pins $after)
 [ordered]@{stage=$Stage;exit=$exit;pattern=$pattern;source_sha256=(Get-DIndexPinDigest -Pins $before);input_count=$before.Count;input_unchanged=$stable;default_vet=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false;owner=$owner}|ConvertTo-Json|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('GC_BATCH_INPUT stage='+$Stage+' exit='+$exit+' stable='+$stable)
if(-not $stable){throw 'Frozen source changed'}
if($Stage -eq 'baseline'){if($exit -ne 1){throw 'Expected input isolation assertions to fail'}}elseif($exit -ne 0){throw 'Candidate failed'}
