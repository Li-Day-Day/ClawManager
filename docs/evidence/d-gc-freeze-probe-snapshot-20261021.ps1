$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
$owner=Join-Path $root $name
$out=Join-Path $PSScriptRoot 'd-gc-freeze-probe-base-20261021.json'
if((Test-Path -LiteralPath $owner) -or (Test-Path -LiteralPath $out)){throw 'Owned freeze source already exists'}
[IO.Directory]::CreateDirectory($owner)|Out-Null
[IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),$name)
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$snapshot=New-DIndexSourceSnapshot -Root $root -Destination (Join-Path $owner 'source')
$snapshot|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
Write-Output ('FREEZE_PROBE_SNAPSHOT files='+$snapshot.files.Count+' source='+$snapshot.source_sha256)
