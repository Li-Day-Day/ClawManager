$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$rootPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ownerLeaf='.tmp-d-index-cache-c6e41c5d9a4548c1afa7b154def28ebd'
$ownedPath=Join-Path $rootPath $ownerLeaf
$prefixPath=Join-Path $PSScriptRoot 'd2-cleanup-gate-joint-c6e41-20261027'
$sourceHelper=Join-Path $PSScriptRoot 'd2-cleanup-gate-joint-20261027.mjs'
$result=[ordered]@{kind='d2_cleanup_gate_terminal_composition.v1';status='failed';owner=$ownedPath;windows=$null;steps=@();binaries=@();source_precheck=$false;source_postcheck=$false;owner_removed=$false;error=$null;Go_started=$false;actual_SQL=$false;SSH=$false;dependencies_installed=$false;production_approved=$false;ledger_schema_installed=$false;live_source_promoted=$false}
$adopted=$false
$vars=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','GOTELEMETRY','TEMP','TMP')
$prior=@{};foreach($v in $vars){$prior[$v]=[Environment]::GetEnvironmentVariable($v,'Process')}
function Run-JointGo([string[]]$Arguments,[string]$Name){
 $log=$prefixPath+'.'+$Name;[IO.File]::WriteAllText($log,'');[IO.File]::WriteAllText(($log+'.stderr'),'');$script:result.Go_started=$true
 & go @Arguments 1> $log 2> ($log+'.stderr');$code=$LASTEXITCODE
 $script:result.steps+=@([ordered]@{command=@('go')+$Arguments;platform=$env:GOOS;exit_code=$code;log=$log;sha256=(Get-FileHash -LiteralPath $log).Hash.ToLowerInvariant();stderr_sha256=(Get-FileHash -LiteralPath ($log+'.stderr')).Hash.ToLowerInvariant()})
 [IO.File]::WriteAllText(($prefixPath+'.linux.running.json'),($script:result|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
 if($code -ne 0){throw ('Joint supplement stage failed: '+($Arguments -join ' '))}
}
try{
 while(-not(Test-Path -LiteralPath ($prefixPath+'.windows.json'))){if([DateTime]::UtcNow -gt [DateTime]::Parse('2026-10-27T08:54:00Z').ToUniversalTime()){throw 'Windows phase is still running; do not clean an active owner'};Start-Sleep -Seconds 1}
 $window=Get-Content -LiteralPath ($prefixPath+'.windows.json') -Raw|ConvertFrom-Json
 if($window.error -or -not $window.source_postcheck -or $window.steps.Count -ne 3 -or @($window.steps|Where-Object exit_code -ne 0).Count){throw 'Windows phase must finish with exact successful package and real-controller build proofs'}
 $adopted=$true;$result.windows=$window
 & node $sourceHelper --check;if($LASTEXITCODE -ne 0){throw 'Joint supplement source precheck rejected'};$result.source_precheck=$true
 $env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=4';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='4';$env:GOTELEMETRY='off'
 $env:GOCACHE=Join-Path $ownedPath 'cache';$env:GOTMPDIR=Join-Path $ownedPath 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $ownedPath 'telemetry'
 $telemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR GOVERSION|Out-String|ConvertFrom-Json)
 if($LASTEXITCODE -ne 0 -or $telemetry.GOTELEMETRY -cne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Supplement private telemetry isolation failed'};$result.telemetry=$telemetry
 Push-Location (Join-Path $ownedPath 'source/backend')
 try{
  $env:GOOS='windows'
  Run-JointGo @('list','-deps','-test','-json','-tags','systembackup_mysql','./internal/systembackupsecurity') 'windows.tagged-security.list.jsonl'
  Run-JointGo @('test','-json','-count=1','-timeout=180s','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','./internal/systembackupsecurity') 'windows.tagged-security.seed.jsonl'
  $env:GOOS='linux'
  Run-JointGo @('list','-deps','-test','-json','./internal/systembackupcleanup','./internal/systembackupcontroller','./cmd/system-backup-controller') 'linux.ordinary.list.jsonl'
  Run-JointGo @('list','-deps','-test','-json','-tags','systembackup_mysql','./internal/systembackupsecurity') 'linux.tagged-security.list.jsonl'
  Run-JointGo @('test','-c','-o',(Join-Path $ownedPath 'binary/cleanup.linux.test'),'./internal/systembackupcleanup') 'linux.cleanup-compile.log'
  Run-JointGo @('test','-c','-o',(Join-Path $ownedPath 'binary/controller.linux.test'),'./internal/systembackupcontroller') 'linux.controller-compile.log'
  Run-JointGo @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $ownedPath 'binary/security.tagged.linux.test'),'./internal/systembackupsecurity') 'linux.security-compile.log'
  Run-JointGo @('build','-o',(Join-Path $ownedPath 'binary/system-backup-controller.linux'),'./cmd/system-backup-controller') 'linux.controller-build.log'
 }finally{Pop-Location}
 foreach($name in @('system-backup-controller.exe','cleanup.linux.test','controller.linux.test','security.tagged.linux.test','system-backup-controller.linux')){
  $p=Join-Path $ownedPath ('binary/'+$name);$bytes=[IO.File]::ReadAllBytes($p)
  if($name.EndsWith('.exe')){if($bytes[0] -ne 77 -or $bytes[1] -ne 90){throw 'Real Windows controller is not a PE image'};$pe=[BitConverter]::ToInt32($bytes,60);if([Text.Encoding]::ASCII.GetString($bytes,$pe,4) -cne "PE`0`0" -or [BitConverter]::ToUInt16($bytes,$pe+4) -ne 34404){throw 'Real controller PE architecture mismatch'}}else{if(($bytes[0..5]|ForEach-Object ToString x2)-join '' -cne '7f454c460201' -or [BitConverter]::ToUInt16($bytes,18) -ne 62){throw 'Linux binary is not x64 ELF64'}}
  $result.binaries+=@([ordered]@{name=$name;size=$bytes.Length;sha256=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant();header64=([BitConverter]::ToString($bytes[0..63])).Replace('-','').ToLowerInvariant();executed=$false})
 }
 $result.status='passed_exact_joint_windows_and_linux_compilation'
}catch{$result.error=$_.Exception.Message}
finally{
 if($adopted){
  try{& node $sourceHelper --check;if($LASTEXITCODE -ne 0){throw 'Joint supplement source postcheck rejected'};$result.source_postcheck=$true}catch{$result.error=[string]$result.error+'; '+$_.Exception.Message;$result.status='failed'}
  try{
   if([IO.Path]::GetDirectoryName($ownedPath) -cne $rootPath -or [IO.Path]::GetFileName($ownedPath) -cne $ownerLeaf -or (Resolve-Path -LiteralPath $ownedPath).Path -cne $ownedPath){throw 'Unsafe joint owner cleanup path'}
   foreach($entry in @((Get-Item -LiteralPath $ownedPath -Force))+@(Get-ChildItem -LiteralPath $ownedPath -Force -Recurse)){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected joint cleanup target'}}
   Remove-Item -LiteralPath $ownedPath -Recurse -Force;$result.owner_removed=(-not(Test-Path -LiteralPath $ownedPath))
  }catch{$result.error=[string]$result.error+'; '+$_.Exception.Message;$result.status='failed'}
 }
 foreach($v in $vars){[Environment]::SetEnvironmentVariable($v,$prior[$v],'Process')}
 [IO.File]::WriteAllText(($prefixPath+'.terminal.json'),($result|ConvertTo-Json -Depth 14),[Text.UTF8Encoding]::new($false))
}
$result|Select-Object status,error,source_precheck,source_postcheck,owner_removed,@{n='steps';e={$_.steps.Count}},@{n='binaries';e={$_.binaries.Count}}|ConvertTo-Json -Compress
if($result.error -or -not $result.owner_removed){exit 1}
