$ErrorActionPreference='Stop';$PSNativeCommandUseErrorActionPreference=$false
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-base-20261022.json') -Raw|ConvertFrom-Json
$owner=[IO.Path]::GetFullPath($base.owner)
$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOWORK='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
$target=Join-Path $owner 'counterfactual/download_gc_owner_lifecycle_wire_test.go'
$prefix=Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-wire-counterfactual-20261022'
if(Test-Path -LiteralPath ($prefix+'-native.json')){throw 'Existing counterfactual'}
$before=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
Push-Location (Join-Path $owner 'source/backend')
try{& 'C:/Program Files/Go/bin/go.exe' test -mod=readonly -p=1 -count=1 -timeout=120s -json -run '^TestDDownloadGCLifecycleWireResponseLoss/(error_packet|still_in_transaction|more_results)$' $target 1> ($prefix+'.stdout') 2> ($prefix+'.stderr');$exit=$LASTEXITCODE}finally{Pop-Location}
$after=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
[ordered]@{kind='d_gc_lifecycle_wire_counterfactual';exit=$exit;before_sha256=$before;after_sha256=$after;default_vet=$true;production_files_changed=0;dependencies_installed=$false;actual_mysql=$false;remote_executed=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath ($prefix+'-native.json') -Encoding utf8NoBOM
if($exit -ne 1 -or $before -cne $after){throw 'Wire response counterfactual did not fail'}
Write-Output 'GC_OWNER_LIFECYCLE_WIRE_COUNTERFACTUAL expected-failure=1 stable-source=yes'
