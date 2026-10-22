param([switch]$ValidationSessionTerminal)
$ErrorActionPreference='Stop'
if(-not $ValidationSessionTerminal){throw 'Confirm experiment tool handle terminal before cleanup'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$name='.tmp-d-freeze-session-311d089307e9450dbad54d82c453cbe4'
$target=(Resolve-Path -LiteralPath (Join-Path $root $name)).Path
$out=Join-Path $PSScriptRoot 'd-gc-freeze-session-cleanup-20261021.json'
if(Test-Path -LiteralPath $out){throw 'Refusing existing cleanup receipt'}
if([IO.Path]::GetDirectoryName($target) -ne $root -or [IO.Path]::GetFileName($target) -ne $name -or [IO.File]::ReadAllText((Join-Path $target 'owner.txt')) -ne $name){throw 'Wrong exact experiment owner'}
if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
if(@(Get-ChildItem -LiteralPath $target -Force -Recurse | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint} | Select-Object -First 1).Count){throw 'Redirected child'}
$source=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-session-20261021-r1-source.json')|ConvertFrom-Json
$native=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-gc-freeze-session-20261021-r1-native.json')|ConvertFrom-Json
if($native.exit -ne 0 -or -not $native.source_postcheck -or $native.owner -ne $name){throw 'Successful terminal experiment receipt missing'}
if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $target 'source/session_test.go')).Hash.ToLowerInvariant() -ne $source.model_sha256 -or (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $target 'source/go.mod')).Hash.ToLowerInvariant() -ne $source.module_sha256){throw 'Experiment source drift'}
foreach($pin in $source.audit_inputs){$p=$pin.path;if(-not[IO.Path]::IsPathRooted($p)){$p=Join-Path $root $p};if((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant() -ne $pin.sha256){throw ('Audited source drift: '+$pin.path)}}
Remove-Item -LiteralPath $target -Recurse -Force
if(Test-Path -LiteralPath $target){throw 'Experiment artifacts remain'}
[ordered]@{kind='d_gc_freeze_session_cleanup';owner=$name;absolute_owner=$target;process_terminal=$true;source_postcheck=$true;removed=$true;dependencies_installed=$false;runtime_changed=$false;retained='experiment source, logs, manifests, protocol requirements and review evidence';recorded_utc=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $out -Encoding utf8NoBOM
Write-Output ('CLEANED session-experiment-source-cache-tmp-telemetry='+$name)
