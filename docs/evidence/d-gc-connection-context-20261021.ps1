$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$out=Join-Path $PSScriptRoot 'd-gc-connection-published-context-20261021.json'
if(Test-Path -LiteralPath $out){throw 'Refusing to replace published context'}
$native=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-gc-connection-20261021-r2-published-native.json')|ConvertFrom-Json
if($native.exit -ne 0 -or -not$native.source_postcheck){throw 'Published verification not complete'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$files=Get-DIndexSourceFiles -Root $root
$pins=Get-DIndexInputPins -Root $root -Files $files
$digest=Get-DIndexPinDigest -Pins $pins
$againFiles=Get-DIndexSourceFiles -Root $root
$again=Get-DIndexInputPins -Root $root -Files $againFiles
if($digest -ne (Get-DIndexPinDigest -Pins $again)){throw 'Current source changed during context capture; no result written'}
[ordered]@{kind='d_gc_connection_published_input_context';version=1;source_sha256=$digest;files=$pins;tested_source_sha256=$native.source_sha256;full_source_matches_tested=($digest -eq $native.source_sha256);recorded_utc=(Get-Date).ToUniversalTime().ToString('o');scope='enumerated backend/contracts/scripts/selected documentation build inputs; not frontend or every workspace file'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
Write-Output ('PUBLISHED_CONTEXT files='+$pins.Count+' full_source_matches_tested='+($digest -eq $native.source_sha256)+' source='+$digest)
