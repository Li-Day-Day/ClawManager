# Native argument probe only. No Go binary, network, dependency or scratch.
$ErrorActionPreference='Stop'
function Test-ProbeArgv([object[]]$Actual,[object[]]$Expected){
 if($Actual.Count -ne $Expected.Count){return $false}
 for($probeIndex=0;$probeIndex -lt $Actual.Count;$probeIndex++){
  if(-not [String]::Equals([string]$Actual[$probeIndex],[string]$Expected[$probeIndex],[StringComparison]::Ordinal)){return $false}
 }
 return $true
}
$probePattern='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
$probeLiteral=& node --eval 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- -test.run $probePattern -test.v -test.count=1 -test.timeout=60s
$probeLiteralExit=$LASTEXITCODE
$probeNativeExe=(Get-Command node -CommandType Application | Select-Object -First 1).Source
& $probeNativeExe --eval 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- -test.run $probePattern -test.v -test.count=1 -test.timeout=60s | Tee-Object -Variable probePiped
$probePipedExit=$LASTEXITCODE
$probeArguments=@('-test.run',$probePattern,'-test.v','-test.count=1','-test.timeout=60s')
$probeSplat=& node --eval 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- @probeArguments
$probeSplatExit=$LASTEXITCODE
if($probeLiteralExit -ne 0 -or $probePipedExit -ne 0 -or $probeSplatExit -ne 0){throw 'Native argument probe failed'}
$probeLiteralArgv=@($probeLiteral|ConvertFrom-Json)
$probePipedArgv=@($probePiped|ConvertFrom-Json)
$probeSplatArgv=@($probeSplat|ConvertFrom-Json)
if(-not(Test-ProbeArgv -Actual $probeSplatArgv -Expected $probeArguments)){throw 'Explicit string arguments changed'}
$probeLiteralMatches=Test-ProbeArgv -Actual $probeLiteralArgv -Expected $probeArguments
$probePipedMatches=Test-ProbeArgv -Actual $probePipedArgv -Expected $probeArguments
if($probeLiteralMatches -or $probePipedMatches -or $probeLiteralArgv.Count -ne 9 -or $probePipedArgv.Count -ne 9 -or $probeLiteralArgv[0] -cne '-test' -or $probeLiteralArgv[1] -cne '.run'){throw 'Dotted-switch splitting counterexample was not reproduced'}
$probeRunner='docs/evidence/d-gc-finalizer-validation-20261026.ps1'
$probeSource=[IO.File]::ReadAllText($probeRunner)
$probeOutput='docs/evidence/a2-owner-detached-argv-observed-20261026-r2.json'
$probeReport=[ordered]@{
 kind='a2_owner_detached_native_argv_probe.v1'
 powershell_version=$PSVersionTable.PSVersion.ToString()
 execution_mode='saved_ps1_file'
 comparison='argument_count_and_each_string_ordinal'
 literal_argv=$probeLiteralArgv
 variable_executable_bare_pipeline_argv=$probePipedArgv
 explicit_string_array_argv=$probeSplatArgv
 literal_matches_expected=$probeLiteralMatches
 variable_executable_bare_pipeline_matches_expected=$probePipedMatches
 explicit_string_array_preserves_switches=$true
 literal_probe_exit=$probeLiteralExit
 string_array_probe_exit=$probeSplatExit
 variable_executable_bare_pipeline_exit=$probePipedExit
 runner=[ordered]@{path=$probeRunner;sha256=(Get-FileHash -LiteralPath $probeRunner -Algorithm SHA256).Hash.ToLowerInvariant()}
 runner_still_contains_unquoted_call=$probeSource.Contains('& $closeWindowsOwner -test.run $closeOwnerPattern -test.v -test.count=1 -test.timeout=60s')
 probe=[ordered]@{path='docs/evidence/a2-owner-detached-argv-probe-20261026.ps1';sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()}
 in_flight_peer_runner_modified=$false
 saved_runner_failure_proven=$false
 same_saved_pipeline_dotted_switch_splitting_reproduced=$true
 previous_invalid_comparison_report='docs/evidence/a2-owner-detached-argv-observed-20261026.json'
 previous_comparison_error='NUL-joined PowerShell culture comparison ignored token separators; use the raw argv and this ordinal comparison instead.'
 Go_or_test_binary_executed=$false
 scratch_created=$false
 dependencies_installed=$false
 production_approved=$false
}
$probeStream=[IO.File]::Open($probeOutput,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
try{$probeBytes=[Text.UTF8Encoding]::new($false).GetBytes(($probeReport|ConvertTo-Json -Depth 6)+[Environment]::NewLine);$probeStream.Write($probeBytes,0,$probeBytes.Length)}finally{$probeStream.Dispose()}
Write-Output ('A2_OWNER_ARGV_PROBE saved_literal_matches='+$probeLiteralMatches+' saved_pipeline_matches='+$probePipedMatches+' string_array=preserved Go_run=no peer_runner_modified=no')
