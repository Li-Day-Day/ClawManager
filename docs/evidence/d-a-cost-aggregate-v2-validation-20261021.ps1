param([ValidateSet('full','node','tagged','probe')][string]$Stage='full',[int]$Attempt=1)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner) -or (Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong source owner'}
$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot ('d-a-cost-aggregate-v2-20261021-r'+$Attempt+'-'+$Stage)
foreach($s in @('-source.json','-native.json','.jsonl','.tap','-stderr.txt')){if(Test-Path -LiteralPath ($prefix+$s)){throw 'Occupied evidence prefix'}}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$baseName=if($Attempt -eq 1){'d-a-cost-aggregate-v2-base-20261021.json'}else{'d-a-cost-aggregate-v3-base-20261021.json'}
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot $baseName) -Raw|ConvertFrom-Json
$draft=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-a-cost-aggregate-unverified-draft-20261021.json') -Raw|ConvertFrom-Json
$allowed=@($draft.changes|ForEach-Object path)+@('scripts/system-backup-contract-artifacts.test.mjs','backend/internal/systembackupbusinessa/cost_aggregate_test.go')
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$byPath=@{};foreach($pin in $pins){$byPath[$pin.path]=$pin}
foreach($pin in $base.files){if($allowed -contains $pin.path){continue};if(-not$byPath.ContainsKey($pin.path) -or $pin.sha256 -ne $byPath[$pin.path].sha256){throw ('Unowned source drift '+$pin.path)}}
if($pins.Count -ne $base.files.Count+2){throw 'Unexpected source set'}
foreach($p in $allowed){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
$manifest=[ordered]@{kind='d_a_cost_aggregate_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);base_source_sha256=$base.source_sha256;files=$pins;dependencies_installed=$false;production_approved=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
function CheckSource { Test-DIndexSourceSnapshot -Root $source -Manifest $manifest }
CheckSource
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$exit=-1;$post=$false;$started=(Get-Date).ToUniversalTime().ToString('o')
Push-Location $source
try{
 if($Stage -eq 'node'){
  $extraName=if($Attempt -eq 1){'d-a-cost-aggregate-v2-extra-inputs-20261021.json'}else{'d-a-cost-aggregate-v3-extra-inputs-20261021.json'}
  $extra=Get-Content -LiteralPath (Join-Path $PSScriptRoot $extraName) -Raw|ConvertFrom-Json
  $actual=Get-DIndexInputPins -Root $source -Files @($extra.files|ForEach-Object path)
  if((Get-DIndexPinDigest -Pins $actual) -ne $extra.source_sha256){throw 'Node extra inputs changed'}
  & 'C:/Program Files/nodejs/node.exe' --test-isolation=none --test-reporter=tap --test scripts/system-backup-contract-check.test.mjs scripts/system-backup-contract-artifacts.test.mjs scripts/system-backup-a-object-fixtures.test.mjs 1>($prefix+'.tap') 2>($prefix+'-stderr.txt');$exit=$LASTEXITCODE
 }else{
  Set-Location (Join-Path $source 'backend')
  if($Stage -eq 'full'){
   & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=900s -json ./internal/systembackupbusinessa ./internal/systembackupsecurity 1>($prefix+'.jsonl') 2>($prefix+'-stderr.txt');$exit=$LASTEXITCODE
  }elseif($Stage -eq 'tagged'){
   & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=900s -json -tags systembackup_mysql -run '^TestABusinessRestoreMySQLSeed$' ./internal/systembackupbusinessa 1>($prefix+'.jsonl') 2>($prefix+'-stderr.txt');$exit=$LASTEXITCODE
   if($exit -eq 0){
    & 'C:/Program Files/Go/bin/go.exe' list -mod=readonly -p=1 -deps -test -tags systembackup_mysql -f '{{if not .Standard}}{{.ImportPath}}|{{.Dir}}{{end}}' ./internal/systembackupbusinessa ./internal/systembackupsecurity 1>($prefix+'-deps.txt') 2>($prefix+'-deps-stderr.txt');$exit=$LASTEXITCODE
   }
  }else{
   $env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
   & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -c -tags systembackup_mysql -o (Join-Path $owner 'a-business-cost.test') ./internal/systembackupbusinessa 1>($prefix+'.stdout') 2>($prefix+'-stderr.txt');$exit=$LASTEXITCODE
   if($exit -eq 0){
    & 'C:/Program Files/Go/bin/go.exe' list -mod=readonly -p=1 -deps -test -tags systembackup_mysql -f '{{if not .Standard}}{{.ImportPath}}|{{.Dir}}{{end}}' ./internal/systembackupbusinessa ./internal/systembackupsecurity 1>($prefix+'-deps.txt') 2>($prefix+'-deps-stderr.txt');$exit=$LASTEXITCODE
   }
  }
 }
 CheckSource;$post=$true
}finally{
 Pop-Location
 [ordered]@{kind='d_a_cost_aggregate_local_validation';stage=$Stage;started_utc=$started;finished_utc=(Get-Date).ToUniversalTime().ToString('o');exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;source_files=$pins.Count;default_vet=($Stage -ne 'node');dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('COST_AGGREGATE stage='+$Stage+' exit='+$exit+' postcheck='+$post)
exit $exit
