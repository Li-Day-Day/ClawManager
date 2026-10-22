$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-rollback-outcome-base-20261022.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner);$source=Join-Path $owner 'source'
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-rollback-outcome-candidate-20261022-source.json') -Raw|ConvertFrom-Json
$prefix=Join-Path $PSScriptRoot 'd-gc-rollback-outcome-dependencies-20261022'
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Existing dependency evidence'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$template='{{.ImportPath}}'+[char]9+'{{.Dir}}'+[char]9+'{{join .GoFiles "|"}}'+[char]9+'{{join .CgoFiles "|"}}'+[char]9+'{{join .EmbedFiles "|"}}'
$exit=-1;$post=$false
Push-Location (Join-Path $source 'backend')
try{
 & 'C:/Program Files/Go/bin/go.exe' list -mod=readonly -deps -test -f $template ./internal/systembackupevidence 1> ($prefix+'.txt') 2> ($prefix+'.stderr')
 $exit=$LASTEXITCODE
 if($exit -ne 0){throw 'Dependency listing failed'}
 Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
 $post=$true
}finally{
 Pop-Location
 [ordered]@{kind='d_gc_rollback_outcome_dependencies';exit=$exit;source_postcheck=$post;source_sha256=$manifest.source_sha256;dependencies_installed=$false;actual_mysql=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
}
Write-Output ('GC_ROLLBACK_DEPENDENCIES exit='+$exit+' postcheck='+$post)
