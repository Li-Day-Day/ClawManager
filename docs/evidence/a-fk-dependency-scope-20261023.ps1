# Offline dependency observation only. No tests, binaries, SSH or installs.
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$fkDepRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$fkDepToken=[guid]::NewGuid().ToString('N')
$fkDepOwner=Join-Path $fkDepRoot ('.tmp-a-resource-deps-'+$fkDepToken)
$fkDepStem=Join-Path $PSScriptRoot 'a-fk-dependency-scope-20261023'
foreach($suffix in @('-windows.txt','-windows-error.txt','-linux.txt','-linux-error.txt','.json')){if(Test-Path -LiteralPath ($fkDepStem+$suffix)){throw 'Dependency observation already exists'}}
$fkDepVars=@('GO111MODULE','GOWORK','GOENV','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$fkDepSaved=@{};foreach($name in $fkDepVars){$fkDepSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$fkDepSteps=@();$fkDepError=$null
try {
 if(Test-Path -LiteralPath $fkDepOwner){throw 'Dependency owner exists'}
 foreach($dir in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $fkDepOwner $dir))|Out-Null}
 [IO.File]::WriteAllText((Join-Path $fkDepOwner '.owner'),$fkDepToken)
 $env:GO111MODULE='on';$env:GOWORK='off';$env:GOENV='off';$env:GOFLAGS='-mod=readonly';$env:GOMAXPROCS='1';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
 $env:GOCACHE=Join-Path $fkDepOwner 'cache';$env:GOTMPDIR=Join-Path $fkDepOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $fkDepOwner 'telemetry'
 [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
 foreach($platform in @('windows','linux')){
  $env:GOOS=$platform
  $out=$fkDepStem+'-'+$platform+'.txt';$err=$fkDepStem+'-'+$platform+'-error.txt'
  $proc=Start-Process -FilePath (Get-Command go).Source -ArgumentList @('list','-deps','-test','-tags','systembackup_mysql','-f','{{.ImportPath}}|{{.Dir}}','./internal/systembackupresources','./cmd/system-backup-migrate') -WorkingDirectory (Join-Path $fkDepRoot 'backend') -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -Wait -PassThru
  $fkDepSteps+=@([ordered]@{platform=$platform;exit=$proc.ExitCode;log=$out;log_sha256=(Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant();stderr=$err;stderr_sha256=(Get-FileHash -LiteralPath $err -Algorithm SHA256).Hash.ToLowerInvariant()})
  if($proc.ExitCode -ne 0){throw 'Offline FK dependency observation failed; do not install dependencies'}
 }
} catch {$fkDepError=$_.Exception.Message} finally {
 foreach($name in $fkDepVars){[Environment]::SetEnvironmentVariable($name,$fkDepSaved[$name],'Process')}
 if(Test-Path -LiteralPath $fkDepOwner){
  $resolved=(Resolve-Path -LiteralPath $fkDepOwner).Path
  if([IO.Path]::GetDirectoryName($resolved) -cne $fkDepRoot -or [IO.Path]::GetFileName($resolved) -cne ('.tmp-a-resource-deps-'+$fkDepToken) -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved '.owner')) -cne $fkDepToken){throw 'Dependency cleanup outside exact owner refused'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
 }
 $record=[ordered]@{kind='a_fk_offline_dependency_observation.v1';error=$fkDepError;roots=@('clawreef/internal/systembackupresources','clawreef/cmd/system-backup-migrate');steps=$fkDepSteps;owner=$fkDepOwner;owner_removed=(-not(Test-Path -LiteralPath $fkDepOwner));tests_executed=$false;actual_mysql=$false;dependencies_installed=$false}
 [IO.File]::WriteAllText(($fkDepStem+'.json'),($record|ConvertTo-Json -Depth 7))
 Write-Output ('A_FK_DEPENDENCY_OBSERVATION='+$fkDepStem+'.json')
}
if($fkDepError){throw $fkDepError}
