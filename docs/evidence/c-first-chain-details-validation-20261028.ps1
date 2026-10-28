$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backend = Join-Path $repo 'backend'
$owner = [System.IO.Path]::GetFullPath((Join-Path $backend '.tmp-c-first-chain-20261028'))
$expected = Join-Path $repo 'backend\.tmp-c-first-chain-20261028'
if ($owner -ne $expected -or -not $owner.StartsWith($repo + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup target' }
$record = [ordered]@{ schema_version='c-first-chain-details-validation.v1'; started_at=[DateTime]::UtcNow.ToString('o'); tests_exit=$null; source_unchanged=$false; owner_removed=$false; error=$null }
function SourceSnapshot {
  $paths = @('backend\go.mod','backend\go.sum')
  foreach ($directory in @('backend\internal\systembackupread','backend\internal\systembackupcontract')) {
    $paths += Get-ChildItem -LiteralPath (Join-Path $repo $directory) -File -Filter '*.go' | ForEach-Object { [System.IO.Path]::GetRelativePath($repo,$_.FullName) }
  }
  @($paths | Sort-Object | ForEach-Object {
    $path = Join-Path $repo $_
    [ordered]@{ path=$_; size=(Get-Item -LiteralPath $path).Length; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
  })
}
$pre = SourceSnapshot
$record.source_before=$pre
try {
  New-Item -ItemType Directory -Force -Path (Join-Path $owner 'gocache'),(Join-Path $owner 'tmp') | Out-Null
  $env:GOTOOLCHAIN='local'; $env:GOPROXY='off'; $env:GOSUMDB='off'
  $env:GOCACHE=Join-Path $owner 'gocache'; $env:GOTMPDIR=Join-Path $owner 'tmp'
  Push-Location $backend
  try {
    & go test -json -count=1 ./internal/systembackupread > (Join-Path $PSScriptRoot 'c-first-chain-details-20261028.final.tests.jsonl') 2> (Join-Path $PSScriptRoot 'c-first-chain-details-20261028.final.tests.stderr')
    $record.tests_exit=$LASTEXITCODE
  } finally { Pop-Location }
  $post=SourceSnapshot
  $record.source_after=$post
  $record.source_unchanged=(($pre | ConvertTo-Json -Depth 5 -Compress) -eq ($post | ConvertTo-Json -Depth 5 -Compress))
} catch { $record.error=$_.Exception.GetType().FullName }
finally {
  if (Test-Path -LiteralPath $owner) { Remove-Item -LiteralPath $owner -Recurse -Force }
  $record.owner_removed= -not (Test-Path -LiteralPath $owner)
  $record.finished_at=[DateTime]::UtcNow.ToString('o')
  $record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'c-first-chain-details-20261028.final.json') -Encoding utf8
}
if ($record.tests_exit -ne 0 -or -not $record.source_unchanged -or -not $record.owner_removed -or $null -ne $record.error) { exit 1 }
exit 0
