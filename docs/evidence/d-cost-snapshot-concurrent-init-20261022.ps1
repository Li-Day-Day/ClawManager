$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$owner=Join-Path $root '.tmp-d-index-cache-8155571ac24945128752f25b204346f0'
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$manifest=New-DIndexSourceSnapshot -Root $root -Destination (Join-Path $owner 'source')
$manifest|Add-Member -NotePropertyName owner -NotePropertyValue $owner
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-cost-snapshot-concurrent-base-20261022.json') -Encoding utf8NoBOM
Write-Output ('COST_SNAPSHOT_BASE files='+$manifest.files.Count+' sha256='+$manifest.source_sha256)
