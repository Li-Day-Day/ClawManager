param([ValidatePattern('^r[0-9]+$')][string]$Attempt='r1')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ownerName='.tmp-d-freeze-session-311d089307e9450dbad54d82c453cbe4'
$owner=Join-Path $root $ownerName
if([IO.Path]::GetDirectoryName($owner) -ne $root -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne $ownerName -or (Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong session-experiment owner'}
$prefix=Join-Path $PSScriptRoot ('d-gc-freeze-session-20261021-'+$Attempt)
foreach($suffix in @('-source.json','.jsonl','-stderr.txt','-native.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing to replace evidence'}}
$source=Join-Path $owner 'source'
if(-not(Test-Path -LiteralPath $source)){
    [IO.Directory]::CreateDirectory($source)|Out-Null
    [IO.File]::WriteAllText((Join-Path $source 'go.mod'),"module freeze-session-experiment`n`ngo 1.26.1`n")
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-session-model-20261021.go') -Destination (Join-Path $source 'session_test.go')
}
$auditPaths=@('backend/go.mod','backend/internal/systembackupevidence/sql.go','backend/internal/systembackupevidence/download_retention_gc.go','backend/internal/systembackupevidence/download_retention_gc_early.go','backend/internal/systembackupgcmetadata/catalog.go','backend/internal/systembackupgcmetadata/views.go','C:/Program Files/Go/VERSION','C:/Program Files/Go/src/database/sql/sql.go','C:/Users/zhanghui08/go/pkg/mod/github.com/go-sql-driver/mysql@v1.9.0/connection.go')
function Get-AuditPins {
    return @(foreach($item in $auditPaths){$p=$item;if(-not[IO.Path]::IsPathRooted($p)){$p=Join-Path $root $p};[ordered]@{path=$item;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant()}})
}
$before=Get-AuditPins
$modelHash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $source 'session_test.go')).Hash.ToLowerInvariant()
if($modelHash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-session-model-20261021.go')).Hash.ToLowerInvariant()){throw 'Model copy drift'}
$modHash=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $source 'go.mod')).Hash.ToLowerInvariant()
foreach($file in @('go.mod','session_test.go')){(Get-Item -LiteralPath (Join-Path $source $file)).IsReadOnly=$true}
[ordered]@{kind='d_gc_freeze_session_experiment_source';owner=$ownerName;model_sha256=$modelHash;module_sha256=$modHash;audit_inputs=$before;sql_transport='in-process fake driver';mysql_executed=$false;runtime_changed=$false} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$exit=-1;$postcheck=$false
Push-Location $source
try{
    & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=30s -json ./ 1>($prefix+'.jsonl') 2>($prefix+'-stderr.txt')
    $exit=$LASTEXITCODE
    if(($before | ConvertTo-Json -Depth 6 -Compress) -ne ((Get-AuditPins)|ConvertTo-Json -Depth 6 -Compress)){throw 'Audited source changed during experiment'}
    if($modelHash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $source 'session_test.go')).Hash.ToLowerInvariant() -or $modHash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $source 'go.mod')).Hash.ToLowerInvariant()){throw 'Experiment source changed'}
    $postcheck=$true
}finally{
    Pop-Location
    [ordered]@{kind='d_gc_freeze_session_go_experiment';attempt=$Attempt;owner=$ownerName;exit=$exit;source_postcheck=$postcheck;default_vet=$true;dependencies_installed=$false;mysql_executed=$false;runtime_changed=$false} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('SESSION_EXPERIMENT exit='+$exit+' source_postcheck='+$postcheck)
exit $exit
