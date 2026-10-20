$ErrorActionPreference='Stop'
$frozenRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$frozenEntry=Join-Path $frozenRoot 'scripts/system-backup-d-config-writer-validation.ps1'
$frozenTokens=$null;$frozenErrors=$null
$frozenAST=[Management.Automation.Language.Parser]::ParseFile($frozenEntry,[ref]$frozenTokens,[ref]$frozenErrors)
if($frozenErrors.Count){throw 'Frozen wrapper parse errors'}
foreach($frozenName in @('DownloadTaskChainOnly','DownloadProducerOnly')){
    if($frozenAST.ParamBlock.Parameters.Name.VariablePath.UserPath -notcontains $frozenName){throw 'Missing frozen profile parameter'}
}
$frozenChild=@($frozenAST.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.InvocationOperator -eq [Management.Automation.Language.TokenKind]::Ampersand -and $n.Extent.Text.Contains("'scripts/system-backup-a-evidence-validation.ps1'")},$true))
if($frozenChild.Count -ne 1 -or -not $frozenChild[0].Extent.Text.StartsWith("& (Join-Path `$writerFrozen 'scripts/system-backup-a-evidence-validation.ps1')")){throw 'Child must execute only inside the frozen copy'}
foreach($frozenPart in @('-ConfigWriterOnly','-ConfigDownloadTaskChainOnly:$DownloadTaskChainOnly','-ConfigDownloadProducerOnly:$DownloadProducerOnly','-Remote:$Remote','-BuildParallelism $BuildParallelism')){
    if(-not $frozenChild[0].Extent.Text.Contains($frozenPart)){throw ('Frozen child lost '+$frozenPart)}
}
$frozenCapture=@($frozenAST.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'New-AConfigProofSourceSnapshot'},$true))
$frozenPost=@($frozenAST.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Test-DIndexSourceSnapshot'},$true))
if($frozenCapture.Count -ne 1 -or $frozenPost.Count -ne 1 -or $frozenCapture[0].Extent.StartOffset -ge $frozenChild[0].Extent.StartOffset -or $frozenPost[0].Extent.StartOffset -le $frozenChild[0].Extent.StartOffset){throw 'Frozen source must surround the entire child invocation'}
$frozenBranches=@($frozenAST.FindAll({param($n)$n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith('if($DownloadProducerOnly){')},$true))
if($frozenBranches.Count -ne 1){throw 'Ambiguous frozen download dispatcher'}
$frozenGuards=@($frozenAST.FindAll({param($n)$n -is [Management.Automation.Language.IfStatementAst] -and ($n.Extent.Text.StartsWith('if($DownloadProducerOnly -and') -or $n.Extent.Text.StartsWith('if($DownloadTaskChainOnly -and'))},$true))
if($frozenGuards.Count -ne 2){throw 'Missing frozen profile exclusivity'}
$writerFrozen=$frozenRoot
$frozenOtherNames=@('DownloadOwnersOnly','DownloadAdmissionOnly','DownloadMFAOnly','NonceTimeOnly','SecurityOnly','MaintenanceReceiptsOnly','BackfillServiceOnly','BackfillRowGuards')
foreach($frozenMode in @('TaskChain','Producer')){
    $DownloadTaskChainOnly=$frozenMode -eq 'TaskChain';$DownloadProducerOnly=$frozenMode -eq 'Producer'
    foreach($frozenOther in $frozenOtherNames){Set-Variable -Name $frozenOther -Value $false}
    foreach($frozenGuard in $frozenGuards){. ([scriptblock]::Create($frozenGuard.Extent.Text))}
    $frozenOutput=@(. ([scriptblock]::Create($frozenBranches[0].Extent.Text))) -join "`n"
    $frozenWanted=if($frozenMode -eq 'TaskChain'){'exact twelve-case root'}else{'exact eighteen-case root'}
    if(-not $frozenOutput.Contains($frozenWanted)){throw 'Frozen profile selected the wrong real dispatcher'}
    foreach($frozenOther in $frozenOtherNames){
        Set-Variable -Name $frozenOther -Value $true
        $frozenRejected=$false
        try{foreach($frozenGuard in $frozenGuards){. ([scriptblock]::Create($frozenGuard.Extent.Text))}}catch{if($_.Exception.Message -match 'requires an exclusive validation profile'){$frozenRejected=$true}else{throw}}
        if(-not $frozenRejected){throw ('Mixed frozen profile accepted '+$frozenMode+'/'+$frozenOther)}
        Set-Variable -Name $frozenOther -Value $false
    }
    Write-Output ('PASS frozen profile='+$frozenMode+' real-dispatch=yes exclusive-counterexamples=8')
}
$DownloadTaskChainOnly=$true;$DownloadProducerOnly=$true
$frozenRejected=$false
try{foreach($frozenGuard in $frozenGuards){. ([scriptblock]::Create($frozenGuard.Extent.Text))}}catch{if($_.Exception.Message -match 'requires an exclusive validation profile'){$frozenRejected=$true}else{throw}}
if(-not $frozenRejected){throw 'Combined task and producer profile accepted'}
Write-Output 'PASS frozen-download-dispatch source-before-child=yes child-root=frozen postcheck-after-child=yes mixed-task-producer=rejected build=no remote=no dependencies=no'
