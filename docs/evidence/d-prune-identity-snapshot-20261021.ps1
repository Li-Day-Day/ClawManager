$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-index-cache-388c60c7adbe40a1b7fc0d6a71cf8e61'
$owner=Join-Path $root $name
$out=Join-Path $PSScriptRoot 'd-prune-identity-base-20261021.json'
if((Test-Path -LiteralPath $owner) -or (Test-Path -LiteralPath $out)){throw 'Refusing occupied owned snapshot'}
[IO.Directory]::CreateDirectory($owner)|Out-Null
[IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),$name)
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$snapshot=New-DIndexSourceSnapshot -Root $root -Destination (Join-Path $owner 'source')
$snapshot|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $out -Encoding utf8NoBOM
Write-Output ('PRUNE_IDENTITY_SNAPSHOT files='+$snapshot.files.Count+' source='+$snapshot.source_sha256)
