[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$Out)
$ErrorActionPreference='Stop'
$prefRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prefPath=[IO.Path]::GetFullPath((Join-Path $prefRoot $Path))
$prefOut=[IO.Path]::GetFullPath((Join-Path $prefRoot $Out))
if(-not $prefPath.StartsWith($prefRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($prefPath) -cne '.ps1'){throw 'Expected a workspace PowerShell runner'}
if([IO.Path]::GetDirectoryName($prefOut) -cne $PSScriptRoot -or (Test-Path -LiteralPath $prefOut)){throw 'Use a new evidence output file'}
$prefSource=[IO.File]::ReadAllText($prefPath)
$prefHash=(Get-FileHash -LiteralPath $prefPath -Algorithm SHA256).Hash.ToLowerInvariant()
$prefTokens=$null;$prefErrors=$null
[System.Management.Automation.Language.Parser]::ParseFile($prefPath,[ref]$prefTokens,[ref]$prefErrors)|Out-Null
$prefUnsafe=@()
foreach($prefToken in $prefTokens){
    if($prefToken.Kind -eq 'Parameter' -and $prefToken.Text -ceq '-test' -and $prefSource.Substring($prefToken.Extent.EndOffset).StartsWith('.')){
        $prefSuffix=[regex]::Match($prefSource.Substring($prefToken.Extent.EndOffset),'^\.[^\s|;]+').Value
        $prefUnsafe+=@([ordered]@{line=$prefToken.Extent.StartLineNumber;column=$prefToken.Extent.StartColumnNumber;raw_flag=('-test'+$prefSuffix)})
    }
}
# Exercise the actual PowerShell native argument parser without running Go,
# creating a test binary, or evaluating any code from the inspected runner.
$prefProbe='console.log(JSON.stringify(process.argv.slice(2)))'
$prefBroken=@($prefProbe | & node - -test.run SeedPattern -test.v -test.count=1 -test.timeout=60s | ConvertFrom-Json)
$prefBrokenExit=$LASTEXITCODE
$prefArguments=@('-test.run','SeedPattern','-test.v','-test.count=1','-test.timeout=60s')
$prefQuoted=@($prefProbe | & node - @prefArguments | ConvertFrom-Json)
$prefQuotedExit=$LASTEXITCODE
$prefBrokenExpected=@('-test','.run','SeedPattern','-test','.v','-test','.count=1','-test','.timeout=60s')
$prefProbeValid=$prefBrokenExit -eq 0 -and $prefQuotedExit -eq 0 -and ($prefBroken -join "`n") -ceq ($prefBrokenExpected -join "`n") -and ($prefQuoted -join "`n") -ceq ($prefArguments -join "`n")
$prefStable=(Get-FileHash -LiteralPath $prefPath -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $prefHash
$prefPass=@($prefErrors).Count -eq 0 -and $prefUnsafe.Count -eq 0 -and $prefProbeValid -and $prefStable
$prefReport=[ordered]@{
    kind='d_native_test_argv_preflight.v1'
    scope='syntax_and_raw_dot_flags_only_not_backend_or_full_runtime_acceptance'
    runner=[IO.Path]::GetRelativePath($prefRoot,$prefPath).Replace('\','/')
    runner_sha256=$prefHash
    runner_stable=$prefStable
    ast_errors=@($prefErrors|ForEach-Object{[ordered]@{line=$_.Extent.StartLineNumber;message=$_.Message}})
    unsafe_dot_flags=$prefUnsafe
    actual_unquoted_arguments=$prefBroken
    actual_quoted_arguments=$prefQuoted
    native_parser_probe_passed=[bool]$prefProbeValid
    checks_passed=[bool]$prefPass
    Go_executed=$false
    runner_executed=$false
    dependencies_installed=$false
    build_artifacts_created=$false
    preflight_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
[IO.File]::WriteAllText($prefOut,($prefReport|ConvertTo-Json -Depth 8)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
Write-Output ('NATIVE_ARGV_PREFLIGHT checks_passed='+$prefPass+' unsafe_flags='+$prefUnsafe.Count+' Go_executed=no')
if(-not $prefPass){exit 1}
