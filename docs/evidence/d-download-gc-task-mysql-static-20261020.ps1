[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
$gcTaskStaticRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$gcTaskStaticOutput=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
if([IO.Path]::GetDirectoryName($gcTaskStaticOutput) -ne (Join-Path $gcTaskStaticRoot 'docs/evidence') -or (Test-Path -LiteralPath $gcTaskStaticOutput)){throw 'Static log must be a fresh repository evidence file'}
$gcTaskStaticScripts=@('system-backup-a-evidence-dispatch.test.ps1','system-backup-a-download-mfa-dispatch.test.ps1','system-backup-a-download-admission-dispatch.test.ps1','system-backup-a-download-owners-dispatch.test.ps1','system-backup-d-download-task-chain-dispatch.test.ps1','system-backup-d-download-producer-dispatch.test.ps1','system-backup-a-download-gc-role-dispatch.test.ps1','system-backup-d-download-gc-task-dispatch.test.ps1')
$gcTaskStaticPins=@{}
foreach($gcTaskStaticName in $gcTaskStaticScripts){$gcTaskStaticPins[$gcTaskStaticName]=(Get-FileHash -LiteralPath (Join-Path $gcTaskStaticRoot ('scripts/'+$gcTaskStaticName)) -Algorithm SHA256).Hash}
Start-Transcript -LiteralPath $gcTaskStaticOutput -NoClobber|Out-Null
try{
    Write-Output ('STATIC_RUNTIME powershell='+$PSVersionTable.PSVersion.ToString())
    foreach($gcTaskStaticName in $gcTaskStaticScripts){
        & (Join-Path $gcTaskStaticRoot ('scripts/'+$gcTaskStaticName))
        Write-Output ('STATIC_PASS script='+$gcTaskStaticName+' sha256='+$gcTaskStaticPins[$gcTaskStaticName].ToLowerInvariant())
    }
    & node (Join-Path $gcTaskStaticRoot 'scripts/system-backup-a-download-mfa-inputs.mjs')
    if($LASTEXITCODE -ne 0){throw 'GC task capsule mirror check failed'}
    foreach($gcTaskStaticName in $gcTaskStaticScripts){if((Get-FileHash -LiteralPath (Join-Path $gcTaskStaticRoot ('scripts/'+$gcTaskStaticName)) -Algorithm SHA256).Hash -ne $gcTaskStaticPins[$gcTaskStaticName]){throw 'Dispatch source changed during static validation'}}
    Write-Output ('STATIC_EXIT=0 profiles='+$gcTaskStaticScripts.Count+' build=no remote=no dependencies-installed=no')
}finally{Stop-Transcript|Out-Null}
