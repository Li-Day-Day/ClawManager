[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run)
$ErrorActionPreference='Stop'
$gcRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$gcLog=Join-Path $PSScriptRoot ('a-download-gc-role-transport-'+$Run+'.txt')
if(Test-Path -LiteralPath $gcLog){throw 'Refusing existing transport log'}
$gcProfiles=@('system-backup-a-download-gc-role-dispatch.test.ps1','system-backup-a-download-owners-dispatch.test.ps1','system-backup-a-download-admission-dispatch.test.ps1','system-backup-a-download-mfa-dispatch.test.ps1','system-backup-d-download-task-chain-dispatch.test.ps1','system-backup-d-download-producer-dispatch.test.ps1')
$gcPaths=@('scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-config-writer-validation.ps1','scripts/system-backup-a-download-gc-role-phase.sh','scripts/system-backup-fresh-migration-smoke.sh')+@($gcProfiles|ForEach-Object{'scripts/'+$_})
$gcPins=@{};foreach($gcPath in $gcPaths){$gcPins[$gcPath]=(Get-FileHash -LiteralPath (Join-Path $gcRoot $gcPath) -Algorithm SHA256).Hash.ToLowerInvariant()}
Start-Transcript -LiteralPath $gcLog -NoClobber|Out-Null
try {
    Push-Location $gcRoot
    try {
        foreach($gcShell in @('C:/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe','C:/Users/zhanghui08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe')){
            $gcCommand='$ErrorActionPreference=''Stop''; foreach($p in @('+(@($gcProfiles|ForEach-Object{"'"+$_+"'"}) -join ',')+')){ & (Join-Path (Join-Path (Get-Location).Path ''scripts'') $p) }'
            & $gcShell -NoProfile -Command $gcCommand 2>&1|ForEach-Object{Write-Host $_.ToString()}
            if($LASTEXITCODE -ne 0){throw 'Transport PowerShell profile checks failed'}
            Write-Output ('TRANSPORT_SHELL_PASS '+$gcShell)
        }
        foreach($gcBash in @('scripts/system-backup-a-download-gc-role-phase.sh','scripts/system-backup-fresh-migration-smoke.sh')){
            & 'C:/Program Files/Git/bin/bash.exe' -n $gcBash
            if($LASTEXITCODE -ne 0){throw 'Transport Bash syntax failed'}
        }
    } finally {Pop-Location}
    foreach($gcPath in $gcPaths){if((Get-FileHash -LiteralPath (Join-Path $gcRoot $gcPath) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $gcPins[$gcPath]){throw 'Transport source changed'};Write-Output ('TRANSPORT_PIN path='+$gcPath+' sha256='+$gcPins[$gcPath])}
    Write-Output 'TRANSPORT_PASS powershell_versions=2 profiles_each=6 bash_syntax=2 postcheck=yes remote=no build=no'
} finally {Stop-Transcript|Out-Null}
