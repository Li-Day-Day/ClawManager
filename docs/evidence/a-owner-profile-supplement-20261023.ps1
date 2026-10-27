# Only the original owner seed/standalone/Linux probe stages. Full ordinary
# packages and migration runner must be received separately at identical source.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ExpectedSource,[Parameter(Mandatory=$true)][string]$CacheSource)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$suppRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$suppToken=[guid]::NewGuid().ToString('N')
$suppOwner=Join-Path $suppRoot ('.tmp-d-index-cache-'+$suppToken)
$suppStem=Join-Path $PSScriptRoot ('a-owner-profile-supplement-'+$suppToken)
$suppManifest=$suppStem+'-source.json'
$suppRunner=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$suppVariables=@('GO111MODULE','GOWORK','GOENV','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TEMP','TMP')
$suppPrevious=@{};foreach($name in $suppVariables){$suppPrevious[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$suppSteps=@();$suppError=$null;$suppPost=$false;$suppCopied=0;$suppBinaries=@()
function Invoke-SuppGo([string[]]$GoArguments){
 $stepLog=$suppStem+'-step-'+$script:suppSteps.Count+'.txt'
 [IO.File]::WriteAllText($stepLog,'')
 & go @GoArguments 2>&1|Tee-Object -FilePath $stepLog
 $stepExit=$LASTEXITCODE
 $script:suppSteps+=@{command=@('go')+$GoArguments;platform=$env:GOOS;exit_code=$stepExit;log=$stepLog;sha256=(Get-FileHash -LiteralPath $stepLog -Algorithm SHA256).Hash.ToLowerInvariant()}
 if($stepExit -ne 0){throw 'Owner supplement Go stage failed'}
}
try {
 $suppExpectedPath=[IO.Path]::GetFullPath((Join-Path $suppRoot $ExpectedSource))
 if([IO.Path]::GetDirectoryName($suppExpectedPath) -cne (Join-Path $suppRoot 'docs/evidence')){throw 'Expected source must be evidence manifest'}
 $suppExpected=Get-Content -LiteralPath $suppExpectedPath -Raw|ConvertFrom-Json
 $suppCache=[IO.Path]::GetFullPath($CacheSource);$suppPeer=[IO.Path]::GetDirectoryName($suppCache)
 if([IO.Path]::GetDirectoryName($suppPeer) -cne $suppRoot -or [IO.Path]::GetFileName($suppPeer) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or [IO.Path]::GetFileName($suppCache) -cne 'cache' -or [IO.File]::ReadAllText((Join-Path $suppPeer 'owner.txt')) -cne [IO.Path]::GetFileName($suppPeer)){throw 'Existing cache owner identity differs'}
 foreach($p in @($suppPeer,$suppCache)){if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache refused'}}
 if(Test-Path -LiteralPath $suppOwner){throw 'Supplement owner exists'}
 [IO.Directory]::CreateDirectory($suppOwner)|Out-Null
 [IO.File]::WriteAllText((Join-Path $suppOwner 'owner.txt'),[IO.Path]::GetFileName($suppOwner))
 & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') create $suppOwner $suppManifest
 if($LASTEXITCODE -ne 0){throw 'Supplement snapshot failed'}
 $suppSource=Get-Content -LiteralPath $suppManifest -Raw|ConvertFrom-Json
 $expectedOrdinary=@($suppExpected.files|Where-Object {$_.path -match '^(backend|contracts)/' -and -not $_.path.EndsWith('_mysql_test.go')}|ForEach-Object {$_.path+'|'+$_.size+'|'+$_.sha256}|Sort-Object)
 $currentOrdinary=@($suppSource.files|Where-Object {$_.path -match '^(backend|contracts)/' -and -not $_.path.EndsWith('_mysql_test.go')}|ForEach-Object {$_.path+'|'+$_.size+'|'+$_.sha256}|Sort-Object)
 if(($expectedOrdinary -join "`n") -cne ($currentOrdinary -join "`n")){throw 'Current ordinary source differs from full package run; no supplement test started'}
 foreach($dir in @('cache','tmp','telemetry','binary','detached/work/probe')){[IO.Directory]::CreateDirectory((Join-Path $suppOwner $dir))|Out-Null}
 foreach($dir in Get-ChildItem -LiteralPath $suppCache -Directory){
  if($dir.Name -notmatch '^[a-f0-9]{2}$'){continue};if($dir.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache child'}
  $target=Join-Path $suppOwner ('cache/'+$dir.Name);[IO.Directory]::CreateDirectory($target)|Out-Null
  foreach($file in Get-ChildItem -LiteralPath $dir.FullName -File){if($file.Name -notmatch '^[a-f0-9]{64}-[ad]$'){continue};if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache file'};[IO.File]::Copy($file.FullName,(Join-Path $target $file.Name));$suppCopied++}
 }
 $env:GO111MODULE='on';$env:GOWORK='off';$env:GOENV='off';$env:GOFLAGS='-mod=readonly -p=2';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
 $env:GOCACHE=Join-Path $suppOwner 'cache';$env:GOTMPDIR=Join-Path $suppOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $suppOwner 'telemetry'
 [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
 $suppPattern='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'
 Push-Location (Join-Path $suppOwner 'source/backend')
 try {
  Invoke-SuppGo -GoArguments @('test','-json','-tags','systembackup_mysql','-run',$suppPattern,'-count=1','-timeout=180s','./internal/systembackupevidence')
  $winBinary=Join-Path $suppOwner 'binary/owner-seeds.exe'
  Invoke-SuppGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',$winBinary,'./internal/systembackupevidence')
  Push-Location (Join-Path $suppOwner 'detached/work/probe')
  try {
   if(@(Get-ChildItem -LiteralPath . -Force).Count -ne 0){throw 'Detached seed directory not empty'}
   $detachedLog=$suppStem+'-detached.txt'
   $detachedArguments=@('-test.run',$suppPattern,'-test.v','-test.count=1','-test.timeout=60s')
   & $winBinary @detachedArguments 2>&1|Tee-Object -FilePath $detachedLog
   $detachedExit=$LASTEXITCODE
   if($detachedExit -ne 0){throw 'Detached original seed failed'}
  } finally {Pop-Location}
  $env:GOOS='linux';$linuxBinary=Join-Path $suppOwner 'binary/owners.test'
  Invoke-SuppGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',$linuxBinary,'./internal/systembackupevidence')
  foreach($binary in @($winBinary,$linuxBinary)){$suppBinaries+=@{name=[IO.Path]::GetFileName($binary);sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()}}
 } finally {Pop-Location}
 & node (Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs') check $suppOwner $suppManifest
 if($LASTEXITCODE -ne 0){throw 'Supplement frozen source postcheck failed'};$suppPost=$true
} catch {$suppError=$_.Exception.Message} finally {
 foreach($name in $suppVariables){[Environment]::SetEnvironmentVariable($name,$suppPrevious[$name],'Process')}
 if(Test-Path -LiteralPath $suppOwner){
  $resolved=(Resolve-Path -LiteralPath $suppOwner).Path
  if($resolved -cne $suppOwner -or [IO.Path]::GetDirectoryName($resolved) -cne $suppRoot -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne ('.tmp-d-index-cache-'+$suppToken)){throw 'Supplement cleanup outside exact owner refused'}
  foreach($entry in @((Get-Item -LiteralPath $resolved -Force))+@(Get-ChildItem -LiteralPath $resolved -Recurse -Force)){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Supplement redirected cleanup refused'}}
  Remove-Item -LiteralPath $resolved -Recurse -Force
 }
 $record=[ordered]@{kind='a_owner_profile_supplement.v1';error=$suppError;source=$suppManifest;expected_full_package_source=$suppExpectedPath;expected_full_package_source_sha256=$suppExpected.source_sha256;steps=$suppSteps;detached_log=$detachedLog;detached_exit=$detachedExit;binaries=$suppBinaries;frozen_postcheck=$suppPost;ordinary_source_identical_before_tests=($null -ne $currentOrdinary -and ($expectedOrdinary -join "`n") -ceq ($currentOrdinary -join "`n"));copied_existing_cache_files=$suppCopied;peer_cache_read_only=$true;test_result_reused=$false;owner=$suppOwner;owner_removed=(-not(Test-Path -LiteralPath $suppOwner));runner_sha256=$suppRunner;full_package_gate_approved=$false;actual_mysql=$false;dependencies_installed=$false;production_approved=$false}
 [IO.File]::WriteAllText(($suppStem+'.json'),($record|ConvertTo-Json -Depth 9))
 Write-Output ('OWNER_PROFILE_SUPPLEMENT='+$suppStem+'.json')
}
if($suppError){throw $suppError}
