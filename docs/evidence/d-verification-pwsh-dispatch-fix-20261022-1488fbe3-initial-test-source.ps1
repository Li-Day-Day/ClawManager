# Exercise the real wrapper, snapshot helper and PowerShell child with a synthetic
# child profile. No Go build, SSH, dependency installation or MySQL is performed.
[CmdletBinding()]
param([string]$WrapperPath)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$dvtRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if([string]::IsNullOrWhiteSpace($WrapperPath)){$WrapperPath=Join-Path $PSScriptRoot 'system-backup-d-verification-detail-validation.ps1'}
$dvtWrapper=(Resolve-Path -LiteralPath $WrapperPath).Path
$dvtHostName=if($IsWindows){'pwsh.exe'}else{'pwsh'}
$dvtHost=Join-Path $PSHOME $dvtHostName
$dvtName='.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N')
$dvtOwner=Join-Path $dvtRoot $dvtName
$dvtOwned=$false;$dvtCleanup=$null;$dvtFatal=$null
$dvtResults=[Collections.Generic.List[object]]::new()
$dvtEnvNames=@('PATH','TMP','TEMP','D_VERIFY_WRAPPER_TEST_OBSERVATION','D_VERIFY_WRAPPER_TEST_EXIT','POWERSHELL_TELEMETRY_OPTOUT')
$dvtEnv=@{};foreach($dvtEnvName in $dvtEnvNames){$dvtEnv[$dvtEnvName]=[Environment]::GetEnvironmentVariable($dvtEnvName,'Process')}
function Assert-DVT([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Write-DVTFile([string]$File,[string]$Text){[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($File))|Out-Null;[IO.File]::WriteAllText($File,$Text,[Text.UTF8Encoding]::new($false))}
$dvtChild=@'
[CmdletBinding()]
param([switch]$AdminReadOnly,[switch]$Remote,[int]$BuildParallelism,[string]$SshTarget)
$ErrorActionPreference='Stop'
$observation=[ordered]@{synthetic_child=$true;actual_mysql=$false;remote_executed=$false;admin_read_only=[bool]$AdminReadOnly;remote_requested=[bool]$Remote;build_parallelism=$BuildParallelism;ssh_target=$SshTarget;script=$PSCommandPath;cwd=(Get-Location).Path;pshome=$PSHOME;pid=$PID}
$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($observation|ConvertTo-Json -Depth 4))
$stream=[IO.File]::Open($env:D_VERIFY_WRAPPER_TEST_OBSERVATION,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
exit ([int]$env:D_VERIFY_WRAPPER_TEST_EXIT)
'@
try{
 Assert-DVT (-not (Test-Path -LiteralPath $dvtOwner)) 'Test owner already exists'
 [IO.Directory]::CreateDirectory($dvtOwner)|Out-Null
 Write-DVTFile (Join-Path $dvtOwner 'owner.txt') $dvtName;$dvtOwned=$true
 foreach($directory in @('path-one','path-two','tmp')){[IO.Directory]::CreateDirectory((Join-Path $dvtOwner $directory))|Out-Null}
 foreach($directory in @('path-one','path-two')){Copy-Item -LiteralPath $dvtHost -Destination (Join-Path (Join-Path $dvtOwner $directory) $dvtHostName)}
 $env:PATH=(Join-Path $dvtOwner 'path-one')+[IO.Path]::PathSeparator+(Join-Path $dvtOwner 'path-two')+[IO.Path]::PathSeparator+$dvtEnv.PATH
 $env:TMP=Join-Path $dvtOwner 'tmp';$env:TEMP=$env:TMP;$env:POWERSHELL_TELEMETRY_OPTOUT='1'
 $dvtCandidates=@(Get-Command pwsh -CommandType Application -ErrorAction Stop)
 Assert-DVT ($dvtCandidates.Count -ge 2) 'Duplicate executable discovery fixture was not established'
 foreach($case in @(@{name='remote_dispatch';remote=$true;parallel=2;exit=0;freeze=$false},@{name='local_dispatch';remote=$false;parallel=3;exit=0;freeze=$false},@{name='child_failure';remote=$true;parallel=1;exit=37;freeze=$false},@{name='freeze_only';remote=$false;parallel=1;exit=0;freeze=$true})){
  $fixture=Join-Path $dvtOwner $case.name
  $result=$null;$observation=$null;$failure=$null;$invokeError=$null
  try{
   foreach($directory in @('backend/cmd/server','contracts','scripts','docs/evidence')){[IO.Directory]::CreateDirectory((Join-Path $fixture $directory))|Out-Null}
   Copy-Item -LiteralPath $dvtWrapper -Destination (Join-Path $fixture 'scripts/system-backup-d-verification-detail-validation.ps1')
   Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1') -Destination (Join-Path $fixture 'scripts/system-backup-d-index-source-snapshot.ps1')
   Write-DVTFile (Join-Path $fixture 'scripts/system-backup-a-evidence-validation.ps1') $dvtChild
   Write-DVTFile (Join-Path $fixture 'scripts/system-backup-d-index-group-report.mjs') '// Synthetic snapshot fixture; never executed.'
   Write-DVTFile (Join-Path $fixture 'backend/go.mod') ('module synthetic_wrapper_fixture'+[Environment]::NewLine)
   Write-DVTFile (Join-Path $fixture 'backend/go.sum') ''
   Write-DVTFile (Join-Path $fixture 'backend/cmd/server/system_backup_read_live_mysql_test.go') '// Synthetic marker only: testDVerificationDetailHTTPHistoryMySQL(t, db, ctx,'
   Write-DVTFile (Join-Path $fixture 'backend/cmd/server/system_backup_read_verification_history_mysql_test.go') '// Synthetic marker only: synthetic_cases=16 actual_provider=no production_approval=no'
   $manifest=Join-Path $fixture 'docs/evidence/source.json';$observationPath=Join-Path $fixture 'child-observation.json'
   $env:D_VERIFY_WRAPPER_TEST_OBSERVATION=$observationPath;$env:D_VERIFY_WRAPPER_TEST_EXIT=[string]$case.exit
   $parameters=@{SourceManifestPath=$manifest;BuildParallelism=$case.parallel;SshTarget='fixture@127.0.0.1'}
   if($case.remote){$parameters.Remote=$true};if($case.freeze){$parameters.FreezeOnly=$true}
   try{$null=& (Join-Path $fixture 'scripts/system-backup-d-verification-detail-validation.ps1') @parameters}catch{$invokeError=$_.Exception.Message}
   Assert-DVT (Test-Path -LiteralPath ($manifest+'.result.json')) 'Wrapper result receipt missing'
   $result=Get-Content -LiteralPath ($manifest+'.result.json') -Raw|ConvertFrom-Json
   Assert-DVT ($result.cleanup.removed -and -not (Test-Path -LiteralPath $result.cleanup.owner)) 'Inner wrapper owner was not cleaned'
   Assert-DVT (-not $result.actual_mysql_results_accepted -and -not $result.dependencies_installed) 'Fixture became an actual result or dependency claim'
   if($case.freeze){
    Assert-DVT ($null -eq $invokeError -and $result.status -ceq 'snapshot_only_verified' -and $result.source_postcheck -and $null -eq $result.child_exit) 'FreezeOnly behavior changed'
    Assert-DVT (-not (Test-Path -LiteralPath $observationPath)) 'FreezeOnly dispatched a child'
   }else{
    Assert-DVT (Test-Path -LiteralPath $observationPath) ('Real PowerShell child did not start: '+$invokeError)
    $observation=Get-Content -LiteralPath $observationPath -Raw|ConvertFrom-Json
    Assert-DVT ($observation.synthetic_child -and -not $observation.actual_mysql -and -not $observation.remote_executed) 'Synthetic child scope changed'
    Assert-DVT ($observation.admin_read_only -and $observation.remote_requested -eq $case.remote -and $observation.build_parallelism -eq $case.parallel -and $observation.ssh_target -ceq 'fixture@127.0.0.1') 'Child arguments changed'
    Assert-DVT ([IO.Path]::GetFullPath($observation.pshome) -ceq [IO.Path]::GetFullPath($PSHOME)) 'Child did not use the current PowerShell runtime'
    Assert-DVT ($observation.pid -ne $PID -and $observation.cwd -ceq (Join-Path $result.cleanup.owner 'source') -and $observation.script -ceq (Join-Path $result.cleanup.owner 'source/scripts/system-backup-a-evidence-validation.ps1')) 'Child process or frozen working directory changed'
    Assert-DVT ($result.child_exit -eq $case.exit -and $result.remote_requested -eq $case.remote) 'Native child exit or remote flag was lost'
    if($case.exit -eq 0){Assert-DVT ($null -eq $invokeError -and $result.status -ceq 'profile_completed_actual_results_require_review' -and $result.source_postcheck) 'Successful child did not complete the wrapper'}
    else{Assert-DVT ($null -ne $invokeError -and $result.status -ceq 'failed' -and -not $result.source_postcheck -and $result.error.Contains('exit=37')) 'Child failure was hidden'}
   }
  }catch{$failure=$_.Exception.Message}
  $dvtResults.Add([ordered]@{name=$case.name;passed=($null -eq $failure);failure=$failure;wrapper_error=$invokeError;result=$result;child_observation=$observation})
  $caseMarker=if($null -eq $failure){'PASS '}else{'FAIL '}
  Write-Output ($caseMarker+$case.name)
 }
}catch{$dvtFatal=$_.Exception.Message}finally{
 foreach($dvtEnvName in $dvtEnvNames){[Environment]::SetEnvironmentVariable($dvtEnvName,$dvtEnv[$dvtEnvName],'Process')}
 if($dvtOwned -and (Test-Path -LiteralPath $dvtOwner)){
  $resolved=(Resolve-Path -LiteralPath $dvtOwner).Path
  if($resolved -cne $dvtOwner -or [IO.Path]::GetDirectoryName($resolved) -cne $dvtRoot -or [IO.File]::ReadAllText((Join-Path $dvtOwner 'owner.txt')) -cne $dvtName){throw 'Wrong test cleanup owner'}
  $children=@(Get-ChildItem -LiteralPath $dvtOwner -Recurse -Force)
  foreach($entry in @((Get-Item -LiteralPath $dvtOwner -Force))+$children){if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($entry.FullName -cne $dvtOwner -and -not $entry.FullName.StartsWith($dvtOwner+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))){throw 'Redirected test cleanup entry'}}
  $count=@($children|Where-Object{-not $_.PSIsContainer}).Count
  Remove-Item -LiteralPath $dvtOwner -Recurse -Force
  Assert-DVT (-not (Test-Path -LiteralPath $dvtOwner)) 'Test cleanup incomplete'
  $dvtCleanup=[ordered]@{owner=$dvtOwner;removed=$true;files_removed=$count}
 }
}
$dvtFailed=@($dvtResults|Where-Object{-not $_.passed}).Count
[ordered]@{kind='d_verification_wrapper_dispatch_test';cases=$dvtResults;failed=$dvtFailed;fatal=$dvtFatal;discovery_matches=$dvtCandidates.Count;cleanup=$dvtCleanup;actual_mysql=$false;remote_executed=$false;dependencies_installed=$false}|ConvertTo-Json -Depth 10
if($dvtFailed -ne 0 -or $null -ne $dvtFatal -or $dvtResults.Count -ne 4){exit 1}
