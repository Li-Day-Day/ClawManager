$ErrorActionPreference='Stop'
$pathRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pathTokens=$null;$pathErrors=$null
$pathAST=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'system-backup-d-config-writer-validation.ps1'),[ref]$pathTokens,[ref]$pathErrors)
if($pathErrors.Count){throw 'Config writer entry parse errors'}
$pathFunctions=@($pathAST.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Resolve-ConfigWriterManifestPath'},$true))
if($pathFunctions.Count -ne 1){throw 'Expected one manifest resolver'}
. ([scriptblock]::Create($pathFunctions[0].Extent.Text))
$pathBinding=@($pathAST.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq '$writerManifest'},$true))
if($pathBinding.Count -ne 1){throw 'Expected one entry manifest binding'}
$pathName='a-manifest-path-test-'+[guid]::NewGuid().ToString('N')+'.json'
$pathExpected=Join-Path $pathRoot ('docs/evidence/'+$pathName)
$pathProcessDirectory=[Environment]::CurrentDirectory
$pathCases=0
function Assert-ManifestRejected {
    param([string]$Value,[string]$Message)
    $caught=$false
    try{Resolve-ConfigWriterManifestPath -Path $Value -Root $pathRoot | Out-Null}catch{
        if($_.Exception.Message -notlike ('*'+$Message+'*')){throw}
        $caught=$true
    }
    if(-not $caught){throw ('Manifest accepted invalid input: '+$Value)}
}
Push-Location $pathRoot
try {
    [Environment]::CurrentDirectory=[IO.Path]::GetDirectoryName($pathRoot)
    $pathRelative='docs/evidence/'+$pathName
    if([IO.Path]::GetFullPath($pathRelative) -eq $pathExpected){throw 'Regression setup did not separate process and PowerShell locations'}
    if((Resolve-ConfigWriterManifestPath -Path $pathRelative -Root $pathRoot) -ne $pathExpected){throw 'Relative path ignored caller location'};$pathCases++
    if((Resolve-ConfigWriterManifestPath -Path $pathExpected -Root $pathRoot) -ne $pathExpected){throw 'Absolute path changed'};$pathCases++
    $writerRoot=$pathRoot;$SourceManifestPath=$pathRelative
    . ([scriptblock]::Create($pathBinding[0].Extent.Text))
    if($writerManifest -ne $pathExpected){throw 'Entry does not use resolver'};$pathCases++
    Push-Location (Join-Path $pathRoot 'docs')
    try{if((Resolve-ConfigWriterManifestPath -Path ('evidence/'+$pathName) -Root $pathRoot) -ne $pathExpected){throw 'Nested caller path changed'};$pathCases++}finally{Pop-Location}
    Assert-ManifestRejected -Value 'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json' -Message 'already exists';$pathCases++
    Assert-ManifestRejected -Value ('docs/'+$pathName) -Message 'directly inside';$pathCases++
    Assert-ManifestRejected -Value ('docs/evidence/../'+$pathName) -Message 'directly inside';$pathCases++
    Assert-ManifestRejected -Value ('docs/evidence/nested/'+$pathName) -Message 'directly inside';$pathCases++
    Assert-ManifestRejected -Value ('Env:'+ $pathName) -Message 'FileSystem';$pathCases++
    Assert-ManifestRejected -Value '' -Message 'must not be empty';$pathCases++
    Assert-ManifestRejected -Value '   ' -Message 'must not be empty';$pathCases++
    if(Test-Path -LiteralPath $pathExpected){throw 'Path-only checks created an output'}
    Write-Output ('PASS manifest-path cases='+$pathCases+' process-directory-differs=yes entry-binding=yes outputs-created=no build=no remote=no')
} finally {
    [Environment]::CurrentDirectory=$pathProcessDirectory
    Pop-Location
}
