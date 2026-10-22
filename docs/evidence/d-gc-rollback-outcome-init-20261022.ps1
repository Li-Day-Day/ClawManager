$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$owner=Join-Path $root '.tmp-d-index-cache-819b69041cdc49eab9eb6c9230caa77f'
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=New-DIndexSourceSnapshot -Root $root -Destination (Join-Path $owner 'source')
$manifest|Add-Member -NotePropertyName owner -NotePropertyValue $owner
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-rollback-outcome-base-20261022.json') -Encoding utf8NoBOM
Write-Output ('GC_ROLLBACK_BASE files='+$manifest.files.Count+' sha256='+$manifest.source_sha256)
