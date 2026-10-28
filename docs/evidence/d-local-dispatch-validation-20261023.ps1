[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$dispatchRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$dispatchToken=[guid]::NewGuid().ToString('N')
$dispatchOwner=Join-Path $dispatchRoot ('.tmp-d-dispatch-'+$dispatchToken)
$dispatchPrefix=Join-Path $PSScriptRoot ('d-local-dispatch-'+$dispatchToken)
$dispatchBash='C:/Program Files/Git/bin/bash.exe'
$dispatchInputs=@('scripts/system-backup-d-resources-readback-phase.sh','scripts/system-backup-a-admin-read-phase.sh','scripts/system-backup-controller-enabled-fixture.mysql.sql','docs/evidence/d-resources-dispatch-20261023.sh','docs/evidence/d-drill-http-dispatch-20261023.sh','docs/evidence/d-local-dispatch-validation-20261023.ps1')
$dispatchPins=@();$dispatchSteps=@();$dispatchError=$null
try{
 if(Test-Path -LiteralPath $dispatchOwner){throw 'Dispatch owner exists'}
 [IO.Directory]::CreateDirectory($dispatchOwner)|Out-Null
 [IO.File]::WriteAllText((Join-Path $dispatchOwner '.owner'),$dispatchToken)
 foreach($dispatchInput in $dispatchInputs){$dispatchPins+=@{path=$dispatchInput;sha256=(Get-FileHash -LiteralPath (Join-Path $dispatchRoot $dispatchInput) -Algorithm SHA256).Hash.ToLowerInvariant()}}
 foreach($dispatchSuite in @('resources','drill')){
  $dispatchSub=Join-Path $dispatchOwner $dispatchSuite
  [IO.Directory]::CreateDirectory($dispatchSub)|Out-Null
  $dispatchScript=if($dispatchSuite -eq 'resources'){'docs/evidence/d-resources-dispatch-20261023.sh'}else{'docs/evidence/d-drill-http-dispatch-20261023.sh'}
  $dispatchLog=$dispatchPrefix+'-'+$dispatchSuite+'.txt'
  & $dispatchBash (Join-Path $dispatchRoot $dispatchScript).Replace('\','/') $dispatchRoot.Replace('\','/') $dispatchSub.Replace('\','/') 2>&1 | Tee-Object -FilePath $dispatchLog
  $dispatchExit=$LASTEXITCODE
  $dispatchSteps+=@{suite=$dispatchSuite;exit_code=$dispatchExit;log=$dispatchLog;log_sha256=(Get-FileHash -LiteralPath $dispatchLog -Algorithm SHA256).Hash.ToLowerInvariant()}
  if($dispatchExit -ne 0){throw ('Mocked dispatch failed: '+$dispatchSuite)}
 }
 foreach($dispatchPin in $dispatchPins){if((Get-FileHash -LiteralPath (Join-Path $dispatchRoot $dispatchPin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $dispatchPin.sha256){throw 'Dispatch source changed'}}
}catch{$dispatchError=$_.Exception.Message}finally{
 if(Test-Path -LiteralPath $dispatchOwner){
  $dispatchResolved=(Resolve-Path -LiteralPath $dispatchOwner).Path
  if([IO.Path]::GetDirectoryName($dispatchResolved) -cne $dispatchRoot -or [IO.Path]::GetFileName($dispatchResolved) -cne ('.tmp-d-dispatch-'+$dispatchToken) -or [IO.File]::ReadAllText((Join-Path $dispatchResolved '.owner')) -cne $dispatchToken){throw 'Refusing dispatch cleanup outside exact owner'}
  foreach($dispatchChild in @(Get-Item -LiteralPath $dispatchResolved -Force)+@(Get-ChildItem -LiteralPath $dispatchResolved -Recurse -Force)){if($dispatchChild.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing redirected dispatch cleanup'}}
  Remove-Item -LiteralPath $dispatchResolved -Recurse -Force
 }
 $dispatchResult=@{kind='d_local_dispatch_validation.v1';error=$dispatchError;inputs=$dispatchPins;steps=$dispatchSteps;owner=$dispatchOwner;owner_removed=(-not(Test-Path -LiteralPath $dispatchOwner));actual_mysql=$false;actual_kubectl=$false;dependencies_installed=$false}
 [IO.File]::WriteAllText(($dispatchPrefix+'.json'),($dispatchResult|ConvertTo-Json -Depth 8))
 Write-Output ('DISPATCH_RESULT='+$dispatchPrefix+'.json')
}
if($dispatchError){throw $dispatchError}
