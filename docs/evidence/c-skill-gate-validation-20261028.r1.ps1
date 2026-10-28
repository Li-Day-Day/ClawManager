$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backend = Join-Path $repo 'backend'
$owner = [System.IO.Path]::GetFullPath((Join-Path $repo '.tmp-c-skill-gate-20261028-56d0f9'))
$expectedOwner = Join-Path $repo '.tmp-c-skill-gate-20261028-56d0f9'
if ($owner -ne $expectedOwner -or -not $owner.StartsWith($repo + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup target' }
$record=[ordered]@{schema_version='c-skill-gate-validation.v1';started_at=[DateTime]::UtcNow.ToString('o');go_list_before_exit=$null;services_exit=$null;registry_exit=$null;go_list_after_exit=$null;source_unchanged=$false;owner_removed=$false;error=$null;real_capture=$false}
$template='{{.ImportPath}}|{{.Dir}}|{{join .GoFiles ","}}|{{join .CgoFiles ","}}|{{join .EmbedFiles ","}}'
$pattern='^Test(NewSkillPackageMaterializeWorker|SkillPackageMaterializeWorker|MaterializeBackupGate|MaterializeWorker|MaterializeProcess|MaterializeBackfill|MaterializeScan|MaterializeUpload|MaterializeEnqueue)'
function Snapshot([string]$list) {
  $sources=@((Join-Path $backend 'go.mod'),(Join-Path $backend 'go.sum'))
  foreach($line in (Get-Content -LiteralPath $list)) {
    $parts=$line -split '\|'
    if($parts.Length -ne 5 -or $parts[1] -eq '') { continue }
    foreach($field in $parts[2..4]) {
      foreach($file in ($field -split ',')) {
        if($file -eq '') {continue}
        $full=if([System.IO.Path]::IsPathRooted($file)){[System.IO.Path]::GetFullPath($file)}else{[System.IO.Path]::GetFullPath((Join-Path $parts[1] $file))}
        if($full.StartsWith($backend+[System.IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){$sources+=$full}
      }
    }
  }
  @($sources | Sort-Object -Unique | ForEach-Object {[ordered]@{path=[System.IO.Path]::GetRelativePath($repo,$_);size=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})
}
try {
  New-Item -ItemType Directory -Force -Path (Join-Path $owner 'cache'),(Join-Path $owner 'tmp') | Out-Null
  $env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTELEMETRY='off';$env:GOFLAGS=''
  $env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp'
  Push-Location $backend
  try {
    & go env -json GOOS GOARCH GOVERSION CGO_ENABLED GOFLAGS > (Join-Path $PSScriptRoot 'c-skill-gate-20261028.environment.json')
    if($LASTEXITCODE -ne 0){throw 'Go environment failed'}
    & go list -deps -test -f $template ./internal/services ./internal/systembackup/mutation > (Join-Path $PSScriptRoot 'c-skill-gate-20261028.deps.before.list') 2> (Join-Path $PSScriptRoot 'c-skill-gate-20261028.deps.before.stderr')
    $record.go_list_before_exit=$LASTEXITCODE
    if($record.go_list_before_exit -ne 0){throw 'Go list failed'}
    $record.source_before=Snapshot (Join-Path $PSScriptRoot 'c-skill-gate-20261028.deps.before.list')
    & go test -p 2 -json -count=1 -run $pattern ./internal/services > (Join-Path $PSScriptRoot 'c-skill-gate-20261028.services.jsonl') 2> (Join-Path $PSScriptRoot 'c-skill-gate-20261028.services.stderr')
    $record.services_exit=$LASTEXITCODE
    & go test -p 2 -json -count=1 ./internal/systembackup/mutation > (Join-Path $PSScriptRoot 'c-skill-gate-20261028.registry.jsonl') 2> (Join-Path $PSScriptRoot 'c-skill-gate-20261028.registry.stderr')
    $record.registry_exit=$LASTEXITCODE
    & go list -deps -test -f $template ./internal/services ./internal/systembackup/mutation > (Join-Path $PSScriptRoot 'c-skill-gate-20261028.deps.after.list') 2> (Join-Path $PSScriptRoot 'c-skill-gate-20261028.deps.after.stderr')
    $record.go_list_after_exit=$LASTEXITCODE
    if($record.go_list_after_exit -ne 0){throw 'Go list postcheck failed'}
    $record.source_after=Snapshot (Join-Path $PSScriptRoot 'c-skill-gate-20261028.deps.after.list')
    $record.source_unchanged=(($record.source_before | ConvertTo-Json -Depth 5 -Compress) -eq ($record.source_after | ConvertTo-Json -Depth 5 -Compress))
  } finally {Pop-Location}
  $expectedRoots=@()
  foreach($file in @('skill_package_materialize_worker_test.go','skill_package_materialize_lifecycle_test.go','skill_package_materialize_service_test.go','skill_package_materialize_backup_gate_test.go')) {
    foreach($line in (Get-Content -LiteralPath (Join-Path $backend "internal\services\$file"))) {
      if($line -match '^func (Test[A-Za-z0-9_]+)\(' -and $Matches[1] -match $pattern){$expectedRoots+=$Matches[1]}
    }
  }
  $events=@(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'c-skill-gate-20261028.services.jsonl') | ForEach-Object {$_|ConvertFrom-Json})
  $passes=@($events | Where-Object {$_.Action -eq 'pass' -and $_.Test})
  $actualRoots=@($passes | Where-Object {$_.Test -notmatch '/'} | ForEach-Object {$_.Test})
  $record.expected_services_roots=@($expectedRoots|Sort-Object)
  $record.actual_services_roots=@($actualRoots|Sort-Object)
  $record.services_roots_match=(($record.expected_services_roots|ConvertTo-Json -Compress) -eq ($record.actual_services_roots|ConvertTo-Json -Compress))
  $record.services_pass_events=$passes.Count
  $record.services_fail_or_skip=@($events|Where-Object {$_.Action -in @('fail','build-fail','skip')}).Count
  $events=@(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'c-skill-gate-20261028.registry.jsonl')|ForEach-Object {$_|ConvertFrom-Json})
  $record.registry_pass_events=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test}).Count
  $record.registry_fail_or_skip=@($events|Where-Object {$_.Action -in @('fail','build-fail','skip')}).Count
} catch {$record.error=$_.Exception.GetType().FullName}
finally {
  if(Test-Path -LiteralPath $owner){Remove-Item -LiteralPath $owner -Recurse -Force}
  $record.owner_removed= -not (Test-Path -LiteralPath $owner)
  $record.finished_at=[DateTime]::UtcNow.ToString('o')
  $record|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'c-skill-gate-validation-20261028.json') -Encoding utf8
}
if($record.go_list_before_exit -ne 0 -or $record.services_exit -ne 0 -or $record.registry_exit -ne 0 -or $record.go_list_after_exit -ne 0 -or -not $record.source_unchanged -or -not $record.services_roots_match -or $record.services_fail_or_skip -ne 0 -or $record.registry_fail_or_skip -ne 0 -or $record.registry_pass_events -ne 2 -or -not $record.owner_removed -or $null -ne $record.error){exit 1}
exit 0
