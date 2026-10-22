$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096'
$owner=Join-Path $root $name
$out=Join-Path $PSScriptRoot 'd-a-cost-aggregate-v2-base-20261021.json'
if((Test-Path -LiteralPath $owner) -or (Test-Path -LiteralPath $out)){throw 'Refusing occupied owned snapshot'}
[IO.Directory]::CreateDirectory($owner)|Out-Null
[IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),$name)
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$snapshot=New-DIndexSourceSnapshot -Root $root -Destination (Join-Path $owner 'source')
$snapshot|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
Write-Output ('COST_AGGREGATE_SNAPSHOT files='+$snapshot.files.Count+' source='+$snapshot.source_sha256)
