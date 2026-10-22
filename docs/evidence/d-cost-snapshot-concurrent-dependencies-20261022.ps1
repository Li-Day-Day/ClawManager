$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-base-20261022.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner)
$source=Join-Path $owner 'source'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong owner'}
$prefix=Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-dependencies-20261022'
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Existing dependency evidence'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-20261022-isolated-source.json') -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$env:GOARCH='amd64';$env:CGO_ENABLED='0'
$template='{{.ImportPath}}'+"`t"+'{{.Dir}}'+"`t"+'{{join .GoFiles "|"}}'+"`t"+'{{join .CgoFiles "|"}}'+"`t"+'{{join .EmbedFiles "|"}}'
$stages=@();$exit=-1;$post=$false
Push-Location (Join-Path $source 'backend')
try{
 foreach($platform in @('windows','linux')){
  $env:GOOS=$platform
  & 'C:/Program Files/Go/bin/go.exe' list -mod=readonly -deps -test -tags systembackup_mysql -f $template ./internal/systembackupbusinessa 1> ($prefix+'-'+$platform+'.txt') 2> ($prefix+'-'+$platform+'.stderr')
  $code=$LASTEXITCODE;$stages+=@([pscustomobject]@{platform=$platform;exit=$code})
  if($code -ne 0){throw 'Dependency listing failed'}
 }
 & 'C:/Program Files/Go/bin/go.exe' list -mod=readonly -deps -f $template ./cmd/system-backup-migrate 1> ($prefix+'-migration.txt') 2> ($prefix+'-migration.stderr')
 $code=$LASTEXITCODE;$stages+=@([pscustomobject]@{platform='linux-migration-dependencies';exit=$code})
 if($code -ne 0){throw 'Migration dependency listing failed'}
 & 'C:/Program Files/Go/bin/go.exe' build -mod=readonly -p=1 -o (Join-Path $owner 'system-backup-migrate') ./cmd/system-backup-migrate 1> ($prefix+'-migration-build.stdout') 2> ($prefix+'-migration-build.stderr')
 $code=$LASTEXITCODE;$stages+=@([pscustomobject]@{platform='linux-migration-build';exit=$code})
 if($code -ne 0){throw 'Migration runner build failed'}
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 $post=$true;$exit=0
}finally{
 Pop-Location
 [ordered]@{kind='d_cost_snapshot_concurrent_dependencies';stages=$stages;exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;dependencies_installed=$false;remote_executed=$false;actual_mysql=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('COST_SNAPSHOT_DEPENDENCIES exit='+$exit+' postcheck='+$post)
