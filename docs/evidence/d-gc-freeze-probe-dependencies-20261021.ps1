param([ValidateSet(2,4,5,6,7,8,9)][int]$Revision=2)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong dependency owner'}
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$prefix=Join-Path $PSScriptRoot 'd-gc-freeze-probe-dependencies-20261021'
if($Revision -ge 4){$prefix+=('-r'+$Revision)}
if(Test-Path -LiteralPath ($prefix+'.txt')){throw 'Dependency evidence occupied'}
Push-Location (Join-Path $owner 'source/backend')
try{
 & 'C:/Program Files/Go/bin/go.exe' list -mod=readonly -p=1 -deps -test -tags systembackup_mysql -f '{{.ImportPath}}|{{.Dir}}|{{join .GoFiles ","}}|{{join .TestGoFiles ","}}|{{join .XTestGoFiles ","}}|{{join .EmbedFiles ","}}|{{join .TestEmbedFiles ","}}|{{join .XTestEmbedFiles ","}}' ./internal/systembackupevidence ./internal/systembackupsecurity ./cmd/system-backup-migrate 1>($prefix+'.txt') 2>($prefix+'-stderr.txt')
 $code=$LASTEXITCODE
}finally{Pop-Location}
[ordered]@{kind='d_gc_freeze_dependency_listing';exit=$code;source_manifest=('d-gc-freeze-probe-20261021-r'+$Revision+'-source.json');dependencies_installed=$false;actual_mysql=$false;remote=$false}|ConvertTo-Json|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
exit $code
