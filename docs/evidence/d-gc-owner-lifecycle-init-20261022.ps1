$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$owner=Join-Path $root '.tmp-d-index-cache-3d426c330a554ab298d97639612abb42'
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=New-DIndexSourceSnapshot -Root $root -Destination (Join-Path $owner 'source')
$manifest|Add-Member -NotePropertyName owner -NotePropertyValue $owner
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-base-20261022.json') -Encoding utf8NoBOM
Write-Output ('GC_OWNER_LIFECYCLE_BASE files='+$manifest.files.Count+' sha256='+$manifest.source_sha256)
