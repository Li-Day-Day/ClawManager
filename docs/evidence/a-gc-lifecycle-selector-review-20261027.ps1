[CmdletBinding()]
param([ValidateSet('blocked','ready')][string]$ExpectedResult='blocked')
$ErrorActionPreference='Stop'
$selectorRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$selectorOperator=Join-Path $PSScriptRoot 'd-gc-full-lifecycle-operator-20261026.ps1'
$selectorRendered=Join-Path $PSScriptRoot 'd-gc-full-lifecycle-rendered-harness-20261027-r1.ps1'
$selectorSource=[IO.File]::ReadAllText($selectorOperator)
$selectorText=[IO.File]::ReadAllText($selectorRendered)
$selectorTokens=$null;$selectorErrors=$null
$selectorOperatorAST=[System.Management.Automation.Language.Parser]::ParseInput($selectorSource,[ref]$selectorTokens,[ref]$selectorErrors)
if(@($selectorErrors).Count){throw 'Operator parse failed'}
$selectorCalls=@($selectorOperatorAST.FindAll({param($ast)
    $ast -is [System.Management.Automation.Language.CommandAst] -and
    $ast.Extent.Text.Contains('system-backup-a-evidence-validation.ps1') -and
    $ast.Extent.Text.Contains('-ConfigDownloadGCFullCollectOnly')
},$true))
if($selectorCalls.Count -ne 1){throw 'Expected one exact operator dispatch'}
$selectorActual=@{}
foreach($selectorElement in $selectorCalls[0].CommandElements){
    if($selectorElement -is [System.Management.Automation.Language.CommandParameterAst] -and
       $selectorElement.ParameterName -in @('ConfigProofOnly','ConfigWriterOnly','ConfigDownloadGCFullCollectOnly')){
        if($selectorActual.ContainsKey($selectorElement.ParameterName)){throw 'Duplicate operator selector'}
        $selectorActual[$selectorElement.ParameterName]=$true
    }
}
if(-not $selectorActual.ConfigWriterOnly -or -not $selectorActual.ConfigDownloadGCFullCollectOnly){throw 'Missing lifecycle writer selectors'}
$selectorRenderedAST=[System.Management.Automation.Language.Parser]::ParseInput($selectorText,[ref]$selectorTokens,[ref]$selectorErrors)
if(@($selectorErrors).Count){throw 'Rendered harness parse failed'}
$selectorGuards=@($selectorRenderedAST.EndBlock.Statements|Where-Object {
    $_ -is [System.Management.Automation.Language.IfStatementAst] -and
    $_.Extent.Text -cmatch '^if \(\$ConfigWriterOnly\) \{'
})
if($selectorGuards.Count -ne 1){throw 'Expected one exact writer exclusivity guard'}
$selectorPrefix=$selectorText.Substring(0,$selectorGuards[0].Extent.EndOffset)
$selectorPrefixAST=[System.Management.Automation.Language.Parser]::ParseInput($selectorPrefix,[ref]$selectorTokens,[ref]$selectorErrors)
if(@($selectorErrors).Count -or @($selectorPrefixAST.FindAll({param($ast) $ast -is [System.Management.Automation.Language.CommandAst]},$true)).Count){throw 'Parameter-only prefix contains a command; refusing execution'}
# The verified prefix has only parameter declarations, assignments, if and
# throw statements. The operator, Go, SSH, SQL and all harness bodies are never
# invoked by this check.
$selectorActualError=$null
try{& ([scriptblock]::Create($selectorPrefix)) @selectorActual}catch{$selectorActualError=$_.Exception.Message}
$selectorReduced=@{ConfigWriterOnly=$true;ConfigDownloadGCFullCollectOnly=$true}
& ([scriptblock]::Create($selectorPrefix)) @selectorReduced
if($ExpectedResult -eq 'blocked'){
    if($selectorActualError -cne 'Choose the config proof or writer profile separately'){throw 'Expected selector conflict not reproduced'}
}elseif($null -ne $selectorActualError){throw ('Operator selector is still rejected: '+$selectorActualError)}
if([IO.File]::ReadAllText($selectorOperator) -cne $selectorSource -or [IO.File]::ReadAllText($selectorRendered) -cne $selectorText){throw 'Selector inputs changed during review'}
[ordered]@{
    kind='a_gc_lifecycle_operator_selector_prefix_review.v1'
    expected_result=$ExpectedResult
    actual_operator_selectors=@($selectorActual.Keys|Sort-Object)
    actual_prefix_accepted=($null -eq $selectorActualError)
    actual_prefix_error=$selectorActualError
    writer_and_full_collect_prefix_accepted=$true
    operator_sha256=(Get-FileHash -LiteralPath $selectorOperator -Algorithm SHA256).Hash.ToLowerInvariant()
    rendered_harness_sha256=(Get-FileHash -LiteralPath $selectorRendered -Algorithm SHA256).Hash.ToLowerInvariant()
    invoked_operator=$false
    Go_started=$false
    SSH=$false
    SQL=$false
    source_capture=$false
    formal_operator_source_accepted=$false
    production_approved=$false
}|ConvertTo-Json -Depth 4
