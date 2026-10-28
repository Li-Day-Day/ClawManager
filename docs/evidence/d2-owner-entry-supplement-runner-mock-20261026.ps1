$ErrorActionPreference='Stop'
$mockRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$mockOwner=Join-Path $mockRoot ('.tmp-d2-owner-thin-mock-'+[guid]::NewGuid().ToString('N'))
$mockReport=[ordered]@{kind='d2_owner_entry_supplement_runner_mock.v1';cases=@();error=$null;owner=$mockOwner;owner_removed=$false;real_Go_started=$false;native_acceptance=$false;dependencies_installed=$false}
[IO.Directory]::CreateDirectory($mockOwner)|Out-Null
try {
    $mockTokens=$null;$mockErrors=$null
    $mockAst=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'd2-owner-entry-baseline-supplement-20261026.ps1'),[ref]$mockTokens,[ref]$mockErrors)
    if($mockErrors.Count){throw 'Runner parse failed'}
    $mockFunction=$mockAst.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-CloseGo'},$true)
    if($null -eq $mockFunction){throw 'Missing real runner function'}
    . ([ScriptBlock]::Create($mockFunction.Extent.Text))
    function go {
        if($script:mockMode -eq 'crash'){
            Write-Output 'compile.exe: exit status 0xc0000043';$global:LASTEXITCODE=1
        }elseif($script:mockMode -eq 'empty'){
            Write-Output '{"Action":"pass","Package":"mock/pkg"}';$global:LASTEXITCODE=0
        }else{
            Write-Output '{"Action":"run","Package":"mock/pkg","Test":"TestSyntheticMock"}'
            Write-Output '{"Action":"pass","Package":"mock/pkg","Test":"TestSyntheticMock"}'
            Write-Output '{"Action":"pass","Package":"mock/pkg"}';$global:LASTEXITCODE=0
        }
    }
    foreach($mode in @('crash','empty','valid')){
        $script:mockMode=$mode;$script:closeSteps=@();$closePrefix=Join-Path $mockOwner $mode
        $caught=$null
        try { Invoke-CloseGo -GoArguments @('test','-json','mock/pkg')|Out-Null }catch{$caught=$_.Exception.Message}
        if($script:closeSteps.Count -ne 1){throw 'A mock stage vanished instead of being recorded'}
        if($mode -eq 'valid'){if($caught){throw $caught}}elseif(-not $caught){throw 'Invalid mock stage falsely accepted'}
        $mockReport.cases+=@([ordered]@{mode=$mode;step_count=$script:closeSteps.Count;native_exit=$script:closeSteps[0].exit_code;rejected=[bool]$caught;reason=$caught})
    }
    if($mockReport.cases.Count -ne 3){throw 'Missing mock cases'}
}catch{$mockReport.error=$_.Exception.Message;throw}finally{
    if(Test-Path -LiteralPath $mockOwner){
        $resolved=(Resolve-Path -LiteralPath $mockOwner).Path
        if([IO.Path]::GetDirectoryName($resolved) -cne $mockRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d2-owner-thin-mock-[a-f0-9]{32}$' -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe mock cleanup'}
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    $mockReport.owner_removed=-not(Test-Path -LiteralPath $mockOwner)
    $mockReport|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd2-owner-entry-supplement-runner-mock-20261026.json') -Encoding utf8
}
$global:LASTEXITCODE=0
Write-Output 'PASS compiler-crash rejection, empty-test rejection, valid-event control; no real Go started; mock owner removed'
