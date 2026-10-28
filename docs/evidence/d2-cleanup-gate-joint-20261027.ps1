$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$jointRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$jointLeaf='.tmp-d-index-cache-c6e41c5d9a4548c1afa7b154def28ebd'
$jointOwner=Join-Path $jointRoot $jointLeaf
$jointPrefix=Join-Path $PSScriptRoot 'd2-cleanup-gate-joint-c6e41-20261027'
$jointHelper=Join-Path $PSScriptRoot 'd2-cleanup-gate-joint-20261027.mjs'
$jointResult=[ordered]@{kind='d2_cleanup_gate_private_joint_native.v1';status='failed';owner=$jointOwner;Go_started=$false;tests_started=$false;source_precheck=$false;source_postcheck=$false;windows_inventory=$null;steps=@();error=$null;owner_removed=$false;actual_SQL=$false;SSH=$false;dependencies_installed=$false;production_approved=$false}
$jointVars=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','GOTELEMETRY','TEMP','TMP')
$jointPrior=@{};foreach($v in $jointVars){$jointPrior[$v]=[Environment]::GetEnvironmentVariable($v,'Process')}
function Invoke-JointGo([string[]]$Arguments,[string]$Log){
 [IO.File]::WriteAllText($Log,'');[IO.File]::WriteAllText(($Log+'.stderr'),'')
 $script:jointResult.Go_started=$true
 & go @Arguments 1> $Log 2> ($Log+'.stderr')
 $code=$LASTEXITCODE
 $script:jointResult.steps+=@([ordered]@{command=@('go')+$Arguments;platform=$env:GOOS;exit_code=$code;log=$Log;sha256=(Get-FileHash -LiteralPath $Log).Hash.ToLowerInvariant();stderr_sha256=(Get-FileHash -LiteralPath ($Log+'.stderr')).Hash.ToLowerInvariant()})
 [IO.File]::WriteAllText(($jointPrefix+'.running.json'),($script:jointResult|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 if($code -ne 0){throw ('Joint native stage failed: '+($Arguments -join ' '))}
}
try{
 & node $jointHelper --check;if($LASTEXITCODE -ne 0){throw 'Joint source precheck rejected'};$jointResult.source_precheck=$true
 foreach($d in @('tmp','binary','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $jointOwner $d))|Out-Null}
 $env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='1';$env:GOTELEMETRY='off'
 $env:GOCACHE=Join-Path $jointOwner 'cache';$env:GOTMPDIR=Join-Path $jointOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $jointOwner 'telemetry'
 [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
 $jointTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR GOVERSION|Out-String|ConvertFrom-Json)
 if($LASTEXITCODE -ne 0 -or $jointTelemetry.GOTELEMETRY -cne 'off' -or [IO.Path]::GetFullPath($jointTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Joint private telemetry isolation failed'}
 $jointResult.telemetry=$jointTelemetry
 Push-Location (Join-Path $jointOwner 'source/backend')
 try{
  Invoke-JointGo @('list','-deps','-test','-json','./internal/systembackupcleanup','./internal/systembackupcontroller') ($jointPrefix+'.windows.list.jsonl')
  $jointResult.tests_started=$true
  Invoke-JointGo @('test','-json','-count=1','-timeout=300s','./internal/systembackupcleanup','./internal/systembackupcontroller') ($jointPrefix+'.windows.tests.jsonl')
  $inventory=(& node $jointHelper --windows-inventory|Out-String);if($LASTEXITCODE -ne 0){throw 'Joint Windows inventory rejected'};$jointResult.windows_inventory=$inventory|ConvertFrom-Json
  $jointResult.status='passed_windows_joint_packages_linux_pending'
  Invoke-JointGo @('build','-o',(Join-Path $jointOwner 'binary/system-backup-controller.exe'),'./cmd/system-backup-controller') ($jointPrefix+'.windows.controller-build.log')
 }finally{Pop-Location}
}catch{$jointResult.error=$_.Exception.Message}
finally{
 try{& node $jointHelper --check;if($LASTEXITCODE -ne 0){throw 'Joint source postcheck rejected'};$jointResult.source_postcheck=$true}catch{$jointResult.error=[string]$jointResult.error+'; '+$_.Exception.Message;$jointResult.status='failed'}
 foreach($v in $jointVars){[Environment]::SetEnvironmentVariable($v,$jointPrior[$v],'Process')}
 [IO.File]::WriteAllText(($jointPrefix+'.windows.json'),($jointResult|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
}
$jointResult|Select-Object status,error,Go_started,tests_started,source_precheck,source_postcheck,@{n='steps';e={$_.steps.Count}}|ConvertTo-Json -Compress
# Overall joint verification continues in the same owned source/cache. A
# terminal supplement must record Linux proofs and exact-owner cleanup.
if($jointResult.error){exit 1}
