$ErrorActionPreference='Stop'
$closeTestRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$closeTestToken=[guid]::NewGuid().ToString('N')
$closeTestOwner=Join-Path $closeTestRoot ('.tmp-d-log-sink-'+$closeTestToken)
$closeTestOut=Join-Path $PSScriptRoot ('d-local-closeout-log-sink-test-'+$closeTestToken+'.json')
$closeTestCases=@();$closeTestError=$null
try {
    [IO.Directory]::CreateDirectory($closeTestOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $closeTestOwner '.owner'),$closeTestToken)
    $closeTestTokens=$null;$closeTestErrors=$null
    $closeTestAST=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'd-local-closeout-validation-r3-20261023.ps1'),[ref]$closeTestTokens,[ref]$closeTestErrors)
    if($closeTestErrors.Count){throw 'Future wrapper has syntax errors'}
    $closeTestFunction=$closeTestAST.Find({param($n)$n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Invoke-CloseGo'},$true)
    if(-not $closeTestFunction){throw 'Missing actual logging function'}
    . ([ScriptBlock]::Create($closeTestFunction.Extent.Text))
    $closePrefix=Join-Path $closeTestOwner 'synthetic-silent-native'
    $script:closeSteps=@()
    # Synthetic native status seam only. No Go compilation/test/network occurs.
    function go { $global:LASTEXITCODE=$script:closeSyntheticExit }
    foreach($closeStatus in @(0,9)){
        $script:closeSyntheticExit=$closeStatus;$closeThrew=$false
        try{Invoke-CloseGo -GoArguments @('synthetic-silent-command')}catch{$closeThrew=$true}
        if($closeThrew -ne ($closeStatus -ne 0)){throw 'Silent native failure/success status lost'}
        $closeStep=$script:closeSteps[-1]
        if($closeStep.exit_code -ne $closeStatus -or -not(Test-Path -LiteralPath $closeStep.log) -or (Get-Item -LiteralPath $closeStep.log).Length -ne 0 -or $closeStep.sha256 -cne 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'){throw 'Silent native log sink absent or not empty'}
        $closeTestCases+=@{synthetic_exit=$closeStatus;threw=$closeThrew;empty_log_created=$true;sha256=$closeStep.sha256}
    }
}catch{$closeTestError=$_.Exception.Message;throw}finally{
    if(Test-Path -LiteralPath $closeTestOwner){
        $closeTestResolved=(Resolve-Path -LiteralPath $closeTestOwner).Path
        if($closeTestResolved -cne $closeTestOwner -or [IO.Path]::GetDirectoryName($closeTestResolved) -cne $closeTestRoot -or [IO.File]::ReadAllText((Join-Path $closeTestResolved '.owner')) -cne $closeTestToken){throw 'Wrong log-sink test cleanup owner'}
        foreach($closeTestEntry in @((Get-Item -LiteralPath $closeTestResolved -Force))+@(Get-ChildItem -LiteralPath $closeTestResolved -Recurse -Force)){if($closeTestEntry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected log-sink test owner'}}
        Remove-Item -LiteralPath $closeTestResolved -Recurse -Force
    }
    [ordered]@{kind='d_local_closeout_log_sink_regression.v1';error=$closeTestError;cases=$closeTestCases;owner=$closeTestOwner;owner_removed=(-not(Test-Path -LiteralPath $closeTestOwner));Go_executed=$false;synthetic_status_seam=$true;dependencies_installed=$false;runner_sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'd-local-closeout-validation-r3-20261023.ps1') -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $closeTestOut -Encoding UTF8
    Write-Output ('LOG_SINK_REGRESSION_RESULT='+$closeTestOut)
}
