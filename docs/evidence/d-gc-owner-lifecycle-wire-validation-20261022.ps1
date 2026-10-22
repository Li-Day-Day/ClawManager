$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-base-20261022.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner)
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong lifecycle source owner'}
foreach($dir in @('cache','tmp','telemetry/local')){[IO.Directory]::CreateDirectory((Join-Path $owner $dir))|Out-Null}
[IO.File]::WriteAllText((Join-Path $owner 'telemetry/mode'),'off')
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$target=Join-Path $owner 'candidate/download_gc_owner_lifecycle_wire_test.go'
$before=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
$prefix=Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-wire-20261022'
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Existing wire result'}
Push-Location (Join-Path $owner 'source/backend')
try{& 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=120s -json $target 1> ($prefix+'.stdout') 2> ($prefix+'.stderr');$exit=$LASTEXITCODE}finally{Pop-Location}
$after=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
[ordered]@{kind='d_gc_lifecycle_wire_unit';exit=$exit;before_sha256=$before;after_sha256=$after;default_vet=$true;dependencies_installed=$false;actual_mysql=$false;remote_executed=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
if($exit -ne 0 -or $before -cne $after){throw 'Wire fault unit failed'}
Write-Output 'GC_OWNER_LIFECYCLE_WIRE exit=0 stable-source=yes actual-mysql=not-run'
