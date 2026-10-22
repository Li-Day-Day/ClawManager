$ErrorActionPreference='Stop'
$batchInterruptedRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$batchInterruptedOwner=Join-Path $batchInterruptedRoot '.tmp-d-index-cache-da377e2376d64843911cfa2a247b47a7'
$batchInterruptedOutput=Join-Path $PSScriptRoot 'd-download-gc-batch-r2-interruption-20261021.json'
if(Test-Path -LiteralPath $batchInterruptedOutput){throw 'Refusing to overwrite interruption evidence'}
$batchQueryPid=$PID
$batchActive=@(Get-CimInstance Win32_Process -Filter "Name='go.exe' OR Name='pwsh.exe' OR Name='download-admission.test.exe'" | Where-Object {$_.ProcessId -ne $batchQueryPid -and $_.CommandLine -and ($_.CommandLine.Contains('d-download-gc-batch-20261020-r2') -or $_.CommandLine.Contains('.tmp-d-index-cache-da377e2376d64843911cfa2a247b47a7'))} | Select-Object ProcessId,Name)
if($batchActive.Count){throw 'Interrupted batch still has a matching process; do not clean or restart'}
& node (Join-Path $PSScriptRoot 'd-download-gc-batch-r2-interruption-preflight-20261021.mjs')
if($LASTEXITCODE -ne 0){throw 'Interrupted source/evidence verification failed'}
$batchPreflight=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-gc-batch-r2-interruption-preflight-20261021.json') -Raw | ConvertFrom-Json
if($batchPreflight.owner -cne $batchInterruptedOwner -or -not $batchPreflight.owned_source_all_pins_match){throw 'Interrupted owner pin mismatch'}
$batchResolved=(Resolve-Path -LiteralPath $batchInterruptedOwner).Path
if([IO.Path]::GetDirectoryName($batchResolved) -cne $batchInterruptedRoot -or [IO.Path]::GetFileName($batchResolved) -cne '.tmp-d-index-cache-da377e2376d64843911cfa2a247b47a7' -or ((Get-Item -Force -LiteralPath $batchResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $batchResolved 'owner.txt')) -cne [IO.Path]::GetFileName($batchResolved)){throw 'Unsafe interrupted source cleanup path or marker'}
Remove-Item -LiteralPath $batchResolved -Recurse -Force
if(Test-Path -LiteralPath $batchResolved){throw 'Interrupted source artifacts remain'}
$batchInterruptedRecord=@{kind='d_gc_batch_interrupted_owned_cleanup';recorded_at=(Get-Date).ToUniversalTime().ToString('o');status='interrupted_after_focused_and_windows_probe';tool_handle='11354';tool_handle_missing=$true;matching_processes=$batchActive;owner=$batchResolved;exists=$false;preflight='docs/evidence/d-download-gc-batch-r2-interruption-preflight-20261021.json';preflight_sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-download-gc-batch-r2-interruption-preflight-20261021.json') -Algorithm SHA256).Hash.ToLowerInvariant();original_final_exit=$null;original_final_postcheck=$false;source_rechecked_after_interruption=$true;dependencies_installed=$false;remote_run=$false;shared_cache_retained_for_planned_full_run=$true}
$batchStream=[IO.File]::Open($batchInterruptedOutput,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$batchBytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($batchInterruptedRecord|ConvertTo-Json -Depth 8)+"`n");$batchStream.Write($batchBytes,0,$batchBytes.Length)}finally{$batchStream.Dispose()}
Write-Output 'PASS interrupted-r2-cleanup source-pins=1455 source-absent=yes active-matches=0 original-final-exit=unknown cache=retained-for-full-run'
