param([ValidateSet('baseline','candidate')][string]$Stage='baseline')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-proof-presence-ff6793bc862e434497b2dcebd96fd3a4'
$source=Join-Path $owner 'source'
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
function Get-ProofPresenceFiles([string]$Directory){
 Push-Location $Directory
 try{
  $package=@(& rg --files backend/internal/systembackupresources)
  if($LASTEXITCODE -ne 0){throw 'Cannot enumerate resources inputs'}
  return @(@('backend/go.mod','backend/go.sum','contracts/system-backup/v12/schema-registry.json','contracts/system-backup/v12/verifier-contract.schema.json')+$package|ForEach-Object {$_.Replace('\','/')}|Sort-Object -CaseSensitive)
 }finally{Pop-Location}
}
$basePath=Join-Path $PSScriptRoot 'd-resources-proof-presence-base-20261022.json'
if($Stage -eq 'baseline'){
 if(Test-Path -LiteralPath $owner){throw 'Owner already exists'}
 [IO.Directory]::CreateDirectory($owner)|Out-Null
 [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
 $files=Get-ProofPresenceFiles $root
 $pins=Get-DIndexInputPins -Root $root -Files $files
 foreach($pin in $pins){
  $target=Join-Path $source $pin.path
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
  Copy-Item -LiteralPath (Join-Path $root $pin.path) -Destination $target
  (Get-Item -LiteralPath $target).IsReadOnly=$true
 }
 $after=Get-DIndexInputPins -Root $root -Files (Get-ProofPresenceFiles $root)
 if((Get-DIndexPinDigest -Pins $pins) -cne (Get-DIndexPinDigest -Pins $after)){throw 'Source changed during copy'}
 [ordered]@{source_sha256=(Get-DIndexPinDigest -Pins $pins);files=$pins}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $basePath -Encoding utf8NoBOM
}else{
 if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong owner'}
}
$files=Get-ProofPresenceFiles $source
$before=Get-DIndexInputPins -Root $source -Files $files
$prefix=Join-Path $PSScriptRoot ('d-resources-proof-presence-20261022-'+$Stage)
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Existing stage'}
[ordered]@{source_sha256=(Get-DIndexPinDigest -Pins $before);files=$before}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-inputs.json') -Encoding utf8NoBOM
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='2';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$pattern='^TestResources(Capture|Target)ProofPresence$'
if($Stage -eq 'candidate'){$pattern='.'}
$exit=-1;$stable=$false
Push-Location (Join-Path $source 'backend')
try{
 & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=2 -count=1 -timeout=300s -json -run $pattern ./internal/systembackupresources 1> ($prefix+'.stdout') 2> ($prefix+'.stderr')
 $exit=$LASTEXITCODE
}finally{
 Pop-Location
 $afterFiles=Get-ProofPresenceFiles $source
 $after=Get-DIndexInputPins -Root $source -Files $afterFiles
 $stable=($files -join "`n") -ceq ($afterFiles -join "`n") -and (Get-DIndexPinDigest -Pins $before) -ceq (Get-DIndexPinDigest -Pins $after)
 [ordered]@{stage=$Stage;exit=$exit;source_sha256=(Get-DIndexPinDigest -Pins $before);input_count=$before.Count;input_unchanged=$stable;default_vet=$true;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false;owner=$owner}|ConvertTo-Json|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('PROOF_PRESENCE stage='+$Stage+' exit='+$exit+' stable='+$stable)
if(-not $stable){throw 'Frozen source changed'}
if($Stage -eq 'baseline'){if($exit -ne 1){throw 'Expected missing-proof assertions to fail'}}elseif($exit -ne 0){throw 'Candidate failed'}
