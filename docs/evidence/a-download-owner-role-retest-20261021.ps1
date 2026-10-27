# Operator entry: original remote profiles and gates, with unique evidence.
# Both runs owner eleven first, then role ten; any failure stops the sequence.
[CmdletBinding()]
param([ValidateSet('Owners','Role','Both')][string]$Mode='Both')
$ErrorActionPreference='Stop'
$aRetestRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$aRetestModes=if($Mode -eq 'Both'){@('owners','gc-role')}elseif($Mode -eq 'Owners'){@('owners')}else{@('gc-role')}
Push-Location $aRetestRoot
try {
    foreach($aRetestMode in $aRetestModes){
        # Detect concurrent ordinary edits before an expensive full gate or SSH.
        # The original runner still performs its own stable copy and postcheck.
        . (Join-Path $aRetestRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
        $aRetestFiles=@(Get-DIndexSourceFiles -Root $aRetestRoot|Where-Object {$_ -match '^(backend|contracts)/'})
        $aRetestPins=Get-DIndexInputPins -Root $aRetestRoot -Files $aRetestFiles
        $aRetestInventory=[ordered]@{kind='a_retest_read_only_input_inventory';files=$aRetestPins}
        $aRetestOutputEncoding=$OutputEncoding
        try {
            $OutputEncoding=[Text.UTF8Encoding]::new($false)
            ($aRetestInventory|ConvertTo-Json -Depth 8 -Compress)|& node (Join-Path $PSScriptRoot 'a-download-retest-source-preflight-20261021.mjs')
            $aRetestPreflightExit=$LASTEXITCODE
        } finally {$OutputEncoding=$aRetestOutputEncoding}
        if($aRetestPreflightExit -ne 0){throw 'Ordinary source changed; no test or SSH started. Obtain a reviewed baseline before retrying.'}
        $aRetestID=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
        $aRetestLog=Join-Path $aRetestRoot ('docs/evidence/a-download-'+$aRetestMode+'-mysql-remote-'+$aRetestID+'.txt')
        $aRetestSource=Join-Path $aRetestRoot ('docs/evidence/a-download-'+$aRetestMode+'-mysql-remote-source-'+$aRetestID+'.json')
        $aRetestArgs=@{Remote=$true;RequireReviewedOwnerBaseline=$true;BuildParallelism=1;SshTarget='root@10.130.14.23';SourceManifestPath=$aRetestSource}
        if($aRetestMode -eq 'owners'){$aRetestArgs.DownloadOwnersOnly=$true}else{$aRetestArgs.DownloadGCRoleOnly=$true}
        $aRetestExit=1
        Start-Transcript -LiteralPath $aRetestLog -NoClobber|Out-Null
        try {
            & (Join-Path $aRetestRoot 'scripts/system-backup-d-config-writer-validation.ps1') @aRetestArgs
            $aRetestExit=0
        } finally {
            Write-Host ('a_download_'+$aRetestMode.Replace('-','_')+'_mysql_remote_exit='+$aRetestExit)
            Write-Host ('日志='+$aRetestLog)
            Write-Host ('来源清单='+$aRetestSource)
            Stop-Transcript|Out-Null
        }
        $aRetestReviewer=if($aRetestMode -eq 'owners'){'a-download-owners-actual-review-20261020.mjs'}else{'a-download-gc-role-actual-review-20261021.mjs'}
        & node (Join-Path $PSScriptRoot $aRetestReviewer) --log ([IO.Path]::GetFileName($aRetestLog)) --source ([IO.Path]::GetFileName($aRetestSource)) --write
        if($LASTEXITCODE -ne 0){throw ('Actual evidence rejected: '+$aRetestMode+'; retain original log and source')}
    }
} finally {Pop-Location}
