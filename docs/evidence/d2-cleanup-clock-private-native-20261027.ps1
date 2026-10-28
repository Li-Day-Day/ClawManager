[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$Token)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$clockRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$clockOwner=Join-Path $clockRoot ('.tmp-d-cleanup-clock-'+$Token)
$clockPrefix=Join-Path $PSScriptRoot ('d2-cleanup-clock-native-'+$Token)
$clockManifest='docs/evidence/d2-cleanup-clock-native-'+$Token+'.source.json'
$clockHelper=Join-Path $PSScriptRoot 'd2-cleanup-clock-private-native-20261027.mjs'
$clockAdopted=$false
$clockResult=[ordered]@{kind='d2_cleanup_clock_private_native.v1';status='failed';owner=$clockOwner;source_manifest=$clockManifest;Go_started=$false;tests_started=$false;source_precheck=$false;source_postcheck=$false;steps=@();inventory=$null;error=$null;owner_removed=$false;SQL=$false;SSH=$false;dependencies_installed=$false;live_source_changed=$false;production_approved=$false}
$clockVars=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','GOTELEMETRY','TEMP','TMP')
$clockPrior=@{};foreach($clockVar in $clockVars){$clockPrior[$clockVar]=[Environment]::GetEnvironmentVariable($clockVar,'Process')}
function Invoke-ClockGo([string[]]$Arguments,[string]$LogName) {
 [IO.File]::WriteAllText($LogName,'')
 $clockErr=$LogName+'.stderr.txt';[IO.File]::WriteAllText($clockErr,'')
 $script:clockResult.Go_started=$true
 if($Arguments -contains '-json') {& go @Arguments 1> $LogName 2> $clockErr} else {& go @Arguments 1> $LogName 2> $clockErr}
 $clockExit=$LASTEXITCODE
 $script:clockResult.steps+=@([ordered]@{command=@('go')+$Arguments;platform=$env:GOOS;exit_code=$clockExit;log=$LogName;sha256=(Get-FileHash -LiteralPath $LogName -Algorithm SHA256).Hash.ToLowerInvariant();stderr=$clockErr;stderr_sha256=(Get-FileHash -LiteralPath $clockErr -Algorithm SHA256).Hash.ToLowerInvariant()})
 if($clockExit -ne 0){throw ('cleanup clock native stage failed: '+($Arguments -join ' '))}
}
try {
 if(-not(Test-Path -LiteralPath $clockOwner -PathType Container)){throw 'Prepared exact owner missing'}
 if((Resolve-Path -LiteralPath $clockOwner).Path -cne $clockOwner -or (Get-Item -LiteralPath $clockOwner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner'}
 $clockAdopted=$true
 if(@(Get-Process go -ErrorAction SilentlyContinue).Count){throw 'Another Go process is active; no duplicate native window'}
 if(([IO.DriveInfo]::new([IO.Path]::GetPathRoot($clockRoot))).AvailableFreeSpace -lt 8GB){throw 'Insufficient free disk'}
 & node $clockHelper --check $clockManifest
 if($LASTEXITCODE -ne 0){throw 'Private source precheck rejected'}
 $clockResult.source_precheck=$true
 foreach($clockDir in @('cache','tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $clockOwner $clockDir))|Out-Null}
 $env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='2';$env:GOTELEMETRY='off'
 $env:GOCACHE=Join-Path $clockOwner 'cache';$env:GOTMPDIR=Join-Path $clockOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR
 $env:TEST_TELEMETRY_DIR=Join-Path $clockOwner 'telemetry'
 [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
 $clockResult.Go_started=$true
 $clockTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR GOVERSION|Out-String|ConvertFrom-Json)
 if($LASTEXITCODE -ne 0 -or $clockTelemetry.GOTELEMETRY -cne 'off' -or [IO.Path]::GetFullPath($clockTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Private telemetry isolation failed'}
 $clockResult.telemetry=$clockTelemetry
 Push-Location (Join-Path $clockOwner 'source/backend')
 try {
  foreach($clockPlatform in @('windows','linux')){
   $env:GOOS=$clockPlatform
   Invoke-ClockGo -Arguments @('list','-deps','-test','-json','./internal/systembackupcleanup') -LogName ($clockPrefix+'.'+$clockPlatform+'.go-list.jsonl')
  }
  $env:GOOS='windows';$clockResult.tests_started=$true
  Invoke-ClockGo -Arguments @('test','-json','-count=1','-timeout=300s','./internal/systembackupcleanup') -LogName ($clockPrefix+'.test.jsonl')
  $env:GOOS='linux'
  Invoke-ClockGo -Arguments @('test','-c','-o',(Join-Path $clockOwner 'binary/cleanup-clock.linux.test'),'./internal/systembackupcleanup') -LogName ($clockPrefix+'.linux-compile.log')
 } finally {Pop-Location}
 $clockInventory=(& node $clockHelper --inventory $clockManifest|Out-String)
 if($LASTEXITCODE -ne 0){throw 'Native inventory rejected'}
 $clockResult.inventory=$clockInventory|ConvertFrom-Json
 $clockResult.status='passed_private_clock_component_only'
} catch {$clockResult.error=$_.Exception.Message}
finally {
 if($clockAdopted){
  try {& node $clockHelper --check $clockManifest;if($LASTEXITCODE -ne 0){throw 'Private source postcheck rejected'};$clockResult.source_postcheck=$true} catch {$clockResult.error=[string]$clockResult.error+'; '+$_.Exception.Message;$clockResult.status='failed'}
  try {
   if([IO.Path]::GetDirectoryName($clockOwner) -cne $clockRoot -or [IO.Path]::GetFileName($clockOwner) -cne ('.tmp-d-cleanup-clock-'+$Token) -or (Resolve-Path -LiteralPath $clockOwner).Path -cne $clockOwner){throw 'Unsafe exact-owner cleanup target'}
   foreach($clockItem in @((Get-Item -LiteralPath $clockOwner -Force))+@(Get-ChildItem -LiteralPath $clockOwner -Recurse -Force)){if($clockItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected exact-owner cleanup'}}
   Remove-Item -LiteralPath $clockOwner -Recurse -Force
   $clockResult.owner_removed=(-not(Test-Path -LiteralPath $clockOwner))
  } catch {$clockResult.error=[string]$clockResult.error+'; '+$_.Exception.Message;$clockResult.status='failed'}
 }
 foreach($clockVar in $clockVars){[Environment]::SetEnvironmentVariable($clockVar,$clockPrior[$clockVar],'Process')}
 [IO.File]::WriteAllText($clockPrefix+'.json',($clockResult|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
}
$clockResult|ConvertTo-Json -Depth 12
if($clockResult.error -or -not $clockResult.source_postcheck -or -not $clockResult.owner_removed){exit 1}
