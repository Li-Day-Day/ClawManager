param([ValidateSet('node','full','controller','probe')][string]$Stage='node',[ValidateRange(1,9)][int]$Attempt=1)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-388c60c7adbe40a1b7fc0d6a71cf8e61'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner) -or (Get-Item -Force -LiteralPath $owner).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong owned prune repair source'}
$source=Join-Path $owner 'source';$prefix=Join-Path $PSScriptRoot ('d-prune-identity-20261021-r'+$Attempt+'-'+$Stage)
foreach($s in @('-source.json','-native.json','.jsonl','.tap','-stderr.txt')){if(Test-Path -LiteralPath ($prefix+$s)){throw 'Evidence exists'}}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$base=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-prune-identity-base-20261021.json')|ConvertFrom-Json
$extraName=if($Stage -eq 'node' -and $Attempt -ge 2){'d-prune-identity-extra-inputs-v2-20261021.json'}else{'d-prune-identity-extra-inputs-20261021.json'}
$extra=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot $extraName)|ConvertFrom-Json
$allowed=@('backend/internal/systembackupcontroller/bootstrap.go','backend/internal/migrationcatalog/catalog_test.go','backend/internal/systembackupevidence/sensitive_download_mfa_mysql_test.go','backend/internal/systembackupevidence/download_producer_owner_mysql_test.go','backend/internal/systembackupevidence/download_gc_task_mysql_test.go','backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json','backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json','scripts/system-backup-d-download-producer-inputs.mjs','scripts/system-backup-d-download-producer-dispatch.test.ps1','scripts/system-backup-d-download-audit-bundle.mjs','contracts/system-backup/v12/schema-registry.json','backend/internal/systembackupbusinessa/testdata/schema-registry.json','docs/system-backup-restore-schema-inventory.json')
$new=@('backend/internal/db/migrations/081_fix_system_backup_prune_item_identity.sql','scripts/system-backup-prune-identity.test.mjs')
if($Stage -in @('probe','controller') -or $Attempt -ge 2){$allowed+=@('backend/internal/systembackupevidence/download_admission_audit_mysql_test.go','backend/internal/systembackupcontroller/metrics_http_test.go','backend/internal/systembackupcontroller/sql_queue_budget_test.go')}
$pins=Get-DIndexInputPins -Root $source -Files (Get-DIndexSourceFiles -Root $source)
$byPath=@{};foreach($p in $pins){$byPath[$p.path]=$p}
foreach($p in $base.files){if($allowed -contains $p.path){continue};if(-not $byPath.ContainsKey($p.path) -or $byPath[$p.path].sha256 -ne $p.sha256){throw ('Unowned source drift: '+$p.path)}}
if($pins.Count -ne $base.files.Count+$new.Count){throw 'Unexpected source file set'}
foreach($p in @($allowed)+@($new)){(Get-Item -LiteralPath (Join-Path $source $p)).IsReadOnly=$true}
$manifest=[ordered]@{kind='d_prune_identity_candidate';source_sha256=(Get-DIndexPinDigest -Pins $pins);base_source_sha256=$base.source_sha256;files=$pins;extra_source_sha256=$extra.source_sha256;dependencies_installed=$false;production_approved=$false}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
function CheckSource {
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 $actual=Get-DIndexInputPins -Root $source -Files @($extra.files|ForEach-Object path)
 if((Get-DIndexPinDigest -Pins $actual) -ne $extra.source_sha256){throw 'Extra contract inputs changed'}
}
CheckSource
foreach($d in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $d))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$exit=-1;$post=$false;$started=(Get-Date).ToUniversalTime().ToString('o');$steps=@()
Push-Location $source
try {
 if($Stage -eq 'node'){
  $tests=@('scripts/system-backup-prune-identity.test.mjs','scripts/system-backup-contract-check.test.mjs','scripts/system-backup-contract-artifacts.test.mjs','scripts/system-backup-a-object-fixtures.test.mjs')
  & 'C:/Program Files/nodejs/node.exe' --test-isolation=none --test-reporter=tap --test @tests 1>($prefix+'.tap') 2>($prefix+'-stderr.txt');$exit=$LASTEXITCODE
 } elseif($Stage -in @('full','controller')){
  Set-Location (Join-Path $source 'backend')
  $packages=@('./internal/migrationcatalog','./internal/systembackupcontroller','./internal/systembackupbusinessa','./internal/systembackupsecurity','./internal/systembackupevidence','./internal/systembackupproducer')
  if($Stage -eq 'controller'){$packages=@('./internal/systembackupcontroller')}
  & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=900s -json @packages 1>($prefix+'.jsonl') 2>($prefix+'-stderr.txt');$exit=$LASTEXITCODE
 }else{
  Set-Location (Join-Path $source 'backend')
  $env:D_DOWNLOAD_AUDIT_INPUTS=Join-Path $owner ('audit-inputs-r'+$Attempt+'.json')
  & 'C:/Program Files/nodejs/node.exe' (Join-Path $source 'scripts/system-backup-d-download-audit-bundle.mjs') inputs $env:D_DOWNLOAD_AUDIT_INPUTS 1>($prefix+'-audit-inputs.stdout') 2>($prefix+'-audit-inputs.stderr')
  if($LASTEXITCODE -ne 0){throw 'Audit capsule generation failed'}
  $env:D_DOWNLOAD_AUDIT_INPUTS_SHA256=(Get-FileHash -Algorithm SHA256 -LiteralPath $env:D_DOWNLOAD_AUDIT_INPUTS).Hash.ToLowerInvariant()
  $pattern='^Test(DDownloadGCTaskMySQLSeed|ASensitiveDownloadMFAMySQLSeed|DProducerDownloadOwnersMySQLSeed|DDownloadAdmissionAuditMySQLSeed)$'
  & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=900s -json -tags systembackup_mysql -run $pattern ./internal/systembackupevidence 1>($prefix+'.jsonl') 2>($prefix+'-stderr.txt');$exit=$LASTEXITCODE
  if($exit -eq 0){
   $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
   $exe=Join-Path $owner 'gc-task.test.exe'
   & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -c -tags systembackup_mysql -o $exe ./internal/systembackupevidence 1>($prefix+'-windows.stdout') 2>($prefix+'-windows.stderr');$exit=$LASTEXITCODE
   if($exit -eq 0){Set-Location $owner;$detachedArgs=@(('-test.run='+$pattern),'-test.v','-test.count=1','-test.timeout=60s');& $exe @detachedArgs 1>($prefix+'-detached.txt') 2>($prefix+'-detached.stderr');$exit=$LASTEXITCODE}
   if($exit -eq 0){Set-Location (Join-Path $source 'backend');$env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0'; & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -c -tags systembackup_mysql -o (Join-Path $owner 'gc-task.test') ./internal/systembackupevidence 1>($prefix+'-linux.stdout') 2>($prefix+'-linux.stderr');$exit=$LASTEXITCODE}
   if($exit -eq 0){& 'C:/Program Files/Go/bin/go.exe' build -mod=readonly -p=1 -o (Join-Path $owner 'system-backup-migrate') ./cmd/system-backup-migrate 1>($prefix+'-migration.stdout') 2>($prefix+'-migration.stderr');$exit=$LASTEXITCODE}
  }
 }
 CheckSource;$post=$true
}finally{
 Pop-Location
 $built=@();if($Stage -eq 'probe'){foreach($name in @('gc-task.test.exe','gc-task.test','system-backup-migrate',('audit-inputs-r'+$Attempt+'.json'))){$p=Join-Path $owner $name;if(Test-Path -LiteralPath $p){$built+=@{name=$name;bytes=(Get-Item -LiteralPath $p).Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant()}}}}
 [ordered]@{kind='d_prune_identity_local_validation';stage=$Stage;started_utc=$started;finished_utc=(Get-Date).ToUniversalTime().ToString('o');exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;source_files=$pins.Count;extra_source_sha256=$extra.source_sha256;default_vet=($Stage -ne 'node');built=$built;dependencies_installed=$false;remote=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('PRUNE_IDENTITY stage='+$Stage+' exit='+$exit+' postcheck='+$post)
exit $exit
