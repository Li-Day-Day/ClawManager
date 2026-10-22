param(
    [Parameter(Mandatory=$true)][ValidatePattern('^r[0-9]+$')][string]$Attempt,
    [ValidateSet('isolated','published')][string]$Mode='isolated'
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-bcc4806d310745c0a7d7ed661688cc4c'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -ne [IO.Path]::GetFileName($owner) -or (Get-Item -LiteralPath $owner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Wrong observer source owner'}
$source=Join-Path $owner 'source'
$prefix=Join-Path $PSScriptRoot ('d-gc-view-create-20261021-'+$Attempt+'-'+$Mode)
foreach($suffix in @('-source.json','.jsonl','-stderr.txt','-native.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing to overwrite evidence'}}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$files=Get-DIndexSourceFiles -Root $source
$pins=Get-DIndexInputPins -Root $source -Files $files
$base=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-gc-view-create-base-20261021.json') | ConvertFrom-Json
$byPath=@{}; foreach($pin in $pins){$byPath[$pin.path]=$pin}
foreach($pin in $base.files){if($pin.path -in @('backend/internal/systembackupgcmetadata/catalog.go','backend/internal/systembackupgcmetadata/catalog_test.go','backend/internal/systembackupgcmetadata/views.go','backend/internal/systembackupgcmetadata/views_test.go')){continue};if(-not $byPath.ContainsKey($pin.path) -or $byPath[$pin.path].sha256 -ne $pin.sha256){throw ('Base snapshot changed: '+$pin.path)}}
if($pins.Count -ne $base.files.Count+2){throw 'Unexpected candidate source set'}
$manifest=[ordered]@{kind='d_gc_view_create_candidate';version=1;source_sha256=(Get-DIndexPinDigest -Pins $pins);files=$pins;base_source_sha256=$base.source_sha256;dependencies_installed=$false;production_approved=$false}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8NoBOM
foreach($name in @('catalog.go','catalog_test.go','views.go','views_test.go')){(Get-Item -LiteralPath (Join-Path $source ('backend/internal/systembackupgcmetadata/'+$name))).IsReadOnly=$true}
$runRoot=$source
if($Mode -eq 'published'){$runRoot=$root}
function Test-ModuleAndPackage {
    foreach($p in @('backend/go.mod','backend/go.sum','backend/internal/systembackupgcmetadata/catalog.go','backend/internal/systembackupgcmetadata/catalog_test.go','backend/internal/systembackupgcmetadata/views.go','backend/internal/systembackupgcmetadata/views_test.go')){
        if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $runRoot $p)).Hash.ToLowerInvariant() -ne $byPath[$p].sha256){throw ('Published input drift: '+$p)}
    }
}
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
Test-ModuleAndPackage
foreach($name in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $name)) | Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'; $env:GOENV='off'; $env:GOFLAGS=''; $env:GOMAXPROCS='1'
$env:GOCACHE=Join-Path $owner 'cache'; $env:GOTMPDIR=Join-Path $owner 'tmp'; $env:TMP=$env:GOTMPDIR; $env:TEMP=$env:GOTMPDIR; $env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'; $env:GOTELEMETRY='off'
$exit=-1; $postcheck=$false; $started=(Get-Date).ToUniversalTime().ToString('o')
Push-Location (Join-Path $runRoot 'backend')
try {
    & 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=120s -json ./internal/systembackupgcmetadata 1> ($prefix+'.jsonl') 2> ($prefix+'-stderr.txt')
    $exit=$LASTEXITCODE
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    Test-ModuleAndPackage
    $postcheck=$true
} finally {
    Pop-Location
    [ordered]@{kind='d_gc_view_create_local_run';mode=$Mode;attempt=$Attempt;started_utc=$started;finished_utc=(Get-Date).ToUniversalTime().ToString('o');exit=$exit;postcheck=$postcheck;source_sha256=$manifest.source_sha256;files=$pins.Count;default_vet=$true;dependencies_installed=$false;remote=$false;package='clawreef/internal/systembackupgcmetadata';owner=$owner} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('OBSERVER_TEST mode='+$Mode+' exit='+$exit+' source_postcheck='+$postcheck+' files='+$pins.Count+' source='+$manifest.source_sha256)
exit $exit
