$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
$source=Join-Path $owner 'source'
$out=Join-Path $PSScriptRoot 'd-gc-freeze-probe-base-v4-20261021.json'
if(Test-Path -LiteralPath $out){throw 'Refresh evidence occupied'}
$native=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r3-native.json') -Raw|ConvertFrom-Json
if($native.exit -ne 0 -or -not $native.source_postcheck){throw 'Revision must be terminal and passed before refresh'}
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong refresh owner'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$prior=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-probe-20261021-r3-source.json') -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $prior
$owned=@('backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go','scripts/system-backup-d-download-gc-freeze-phase.sh','scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1','scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-config-writer-validation.ps1')
$files=Get-DIndexSourceFiles -Root $root
$before=Get-DIndexInputPins -Root $root -Files $files
$changes=[Collections.Generic.List[string]]::new()
foreach($pin in $before){
 if($pin.path -cin $owned){continue}
 $target=Join-Path $source $pin.path
 if((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $pin.sha256){continue}
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
 if(Test-Path -LiteralPath $target){(Get-Item -LiteralPath $target).IsReadOnly=$false}
 Copy-Item -LiteralPath (Join-Path $root $pin.path) -Destination $target
 if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Concurrent refresh changed during copy'}
 (Get-Item -LiteralPath $target).IsReadOnly=$true;$changes.Add($pin.path)
}
foreach($pin in $prior.files){if($pin.path -cin $owned){continue};if($files -cnotcontains $pin.path){throw 'Concurrent removal requires an explicit source review'}}
$afterFiles=Get-DIndexSourceFiles -Root $root
$after=Get-DIndexInputPins -Root $root -Files $afterFiles
if(($files -join "`n") -cne ($afterFiles -join "`n") -or (Get-DIndexPinDigest -Pins $before) -cne (Get-DIndexPinDigest -Pins $after)){throw 'Root changed during refresh; do not validate an unreviewed copy'}
foreach($pin in $prior.files|Where-Object{$_.path -cin $owned}){if((Get-FileHash -LiteralPath (Join-Path $source $pin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Owned patch changed during refresh'}}
[ordered]@{kind='d_gc_freeze_refreshed_live_base';source_sha256=(Get-DIndexPinDigest -Pins $before);files=$before;stable_copy_verified=$true;refreshed_unowned_paths=$changes;prior_source_sha256=$prior.source_sha256;dependencies_installed=$false;production_approved=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
Write-Output ('FREEZE_REFRESH root-files='+$before.Count+' updated-unowned='+$changes.Count+' owned-preserved=5')
