$ErrorActionPreference='Stop'
$checkpointRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$checkpointToken='a9b3f627a8134e5798ca12b34880d1af'
$checkpointOwner=Join-Path $checkpointRoot ('.tmp-d-index-cache-'+$checkpointToken)
$checkpointStem=Join-Path $PSScriptRoot ('d-local-closeout-'+$checkpointToken)
$checkpointLog=Join-Path $PSScriptRoot 'd-gc-finalizer-first-segment-checkpoint-20261026.log'
# Stage 11 is the first Windows probe build. Its log is opened only AFTER
# diagnostic + six ordinary packages + three domain seeds + packaged owners.
# No Go subprocess or source mutation is performed by this read-only checkpoint.
while(-not(Test-Path -LiteralPath ($checkpointStem+'-step-11-attempt-1.log'))){
 if(Test-Path -LiteralPath ($checkpointStem+'.json')){throw 'First segment ended before its required source checkpoint'}
 Start-Sleep -Seconds 2
}
& node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') check $checkpointOwner ($checkpointStem+'-source.json') *> $checkpointLog
$checkpointExit=$LASTEXITCODE
$record=[ordered]@{kind='d_gc_finalizer_source_checkpoint.v1';after_completed_stages=@(0..10);before_probe_stage=11;source=($checkpointStem+'-source.json');owner=$checkpointOwner;native_exit=$checkpointExit;log=$checkpointLog;log_sha256=(Get-FileHash -LiteralPath $checkpointLog -Algorithm SHA256).Hash.ToLowerInvariant();source_read_only=$true;Go_executed=$false;dependencies_installed=$false;verified_at=[DateTime]::UtcNow.ToString('o')}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'd-gc-finalizer-first-segment-checkpoint-20261026.json'),($record|ConvertTo-Json -Depth 5))
if($checkpointExit -ne 0){throw 'First completed segment source postcheck failed'}
Write-Output 'FIRST_SEGMENT_POSTCHECK=passed'
