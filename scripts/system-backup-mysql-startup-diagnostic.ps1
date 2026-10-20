[CmdletBinding()]
param([switch]$Remote)
$ErrorActionPreference='Stop'
$diagnosticRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$diagnosticID=[guid]::NewGuid().ToString('N')
$diagnosticScratch=Join-Path $diagnosticRoot ('.tmp-a-mysql-startup-'+$diagnosticID)
$diagnosticRemote='/tmp/clawmanager-mysql-startup-'+$diagnosticID
$diagnosticHost='root@10.130.14.23'
$diagnosticSSH=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$diagnosticSCP=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$diagnosticSSHOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
$diagnosticRemoteAttempted=$false
$diagnosticUTF8=New-Object Text.UTF8Encoding($false)
$diagnosticStatus=1
$diagnosticCleanupFailed=$false
try {
    if(Test-Path -LiteralPath $diagnosticScratch){throw 'Diagnostic scratch already exists'}
    $diagnosticPayload=Join-Path $diagnosticScratch 'payload'
    [IO.Directory]::CreateDirectory($diagnosticPayload)|Out-Null
    $diagnosticFiles=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','backend/internal/systembackupcontroller/bootstrap.go')
    $diagnosticFiles+=@(Get-ChildItem -LiteralPath (Join-Path $diagnosticRoot 'backend/internal/db/migrations') -Filter '*.sql' -File | Sort-Object Name | ForEach-Object{'backend/internal/db/migrations/'+$_.Name})
    $diagnosticPins=@(foreach($diagnosticFile in $diagnosticFiles){
        $diagnosticDestination=Join-Path $diagnosticPayload $diagnosticFile
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($diagnosticDestination))|Out-Null
        $diagnosticText=[IO.File]::ReadAllText((Join-Path $diagnosticRoot $diagnosticFile)).Replace("`r`n","`n")
        [IO.File]::WriteAllText($diagnosticDestination,$diagnosticText,$diagnosticUTF8)
        (Get-FileHash -LiteralPath $diagnosticDestination -Algorithm SHA256).Hash.ToLowerInvariant()+'  '+$diagnosticFile
    })
    [IO.File]::WriteAllText((Join-Path $diagnosticPayload 'sources.sha256'),($diagnosticPins -join "`n")+"`n",$diagnosticUTF8)
    $diagnosticBash=Join-Path $env:ProgramFiles 'Git/bin/bash.exe'
    if(-not (Test-Path -LiteralPath $diagnosticBash)){throw 'Existing Git Bash required; no dependencies will be installed'}
    foreach($diagnosticScript in @('system-backup-fresh-migration-smoke.sh','system-backup-smoke-contract.sh')){
        & $diagnosticBash -n ((Join-Path $diagnosticPayload ('scripts/'+$diagnosticScript)).Replace('\','/'))
        if($LASTEXITCODE -ne 0){throw 'Diagnostic shell parse failed'}
    }
    & tar.exe -cf (Join-Path $diagnosticScratch 'bundle.tar') -C $diagnosticScratch payload
    if($LASTEXITCODE -ne 0){throw 'Diagnostic archive failed'}
    $diagnosticHash=(Get-FileHash -LiteralPath (Join-Path $diagnosticScratch 'bundle.tar') -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output "MYSQL_STARTUP_PREPARED files=$($diagnosticFiles.Count) bundle_sha256=$diagnosticHash build=not_run sql_cases=not_run"
    if($Remote){
        $diagnosticRemoteAttempted=$true
        & $diagnosticSSH @diagnosticSSHOptions $diagnosticHost "umask 077; mkdir '$diagnosticRemote' && printf '%s' '$diagnosticID' > '$diagnosticRemote/owner'"
        if($LASTEXITCODE -ne 0){throw 'Remote diagnostic directory creation failed'}
        & $diagnosticSCP @diagnosticSSHOptions (Join-Path $diagnosticScratch 'bundle.tar') ($diagnosticHost+':'+$diagnosticRemote+'/bundle.tar')
        if($LASTEXITCODE -ne 0){throw 'Remote diagnostic copy failed'}
        $diagnosticCommand="set -eu; cd '$diagnosticRemote'; printf '%s  bundle.tar\n' '$diagnosticHash' | sha256sum -c -; tar -xf bundle.tar; cd payload; sha256sum -c sources.sha256 >/dev/null; bash -n scripts/system-backup-fresh-migration-smoke.sh; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' MYSQL_STARTUP_ONLY=1 TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea' EXPECTED_APP_DIGEST='be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea' bash scripts/system-backup-fresh-migration-smoke.sh"
        & $diagnosticSSH @diagnosticSSHOptions $diagnosticHost $diagnosticCommand
        if($LASTEXITCODE -ne 0){throw 'MySQL startup diagnostic failed; inspect MYSQL_STARTUP_DIAGNOSTIC and cleanup lines above'}
    }
    $diagnosticStatus=0
} finally {
    if($diagnosticRemoteAttempted){
        & $diagnosticSSH @diagnosticSSHOptions $diagnosticHost "if test ! -e '$diagnosticRemote'; then echo 'CLEANED mysql-startup-remote=absent'; elif test ! -L '$diagnosticRemote' && test `"`$(cat '$diagnosticRemote/owner')`" = '$diagnosticID'; then rm -rf -- '$diagnosticRemote' && echo 'CLEANED mysql-startup-remote=yes'; else echo 'CLEANUP_PENDING mysql-startup-remote=$diagnosticRemote'; exit 1; fi"
        if($LASTEXITCODE -ne 0){
            $diagnosticStatus=1
            $diagnosticCleanupFailed=$true
            Write-Warning "CLEANUP_PENDING mysql-startup-remote=$diagnosticRemote"
        }
    }
    if(([IO.Path]::GetDirectoryName($diagnosticScratch) -cne $diagnosticRoot) -or ([IO.Path]::GetFileName($diagnosticScratch) -cne ('.tmp-a-mysql-startup-'+$diagnosticID))){throw 'Unsafe diagnostic cleanup path'}
    if(Test-Path -LiteralPath $diagnosticScratch){Remove-Item -LiteralPath $diagnosticScratch -Recurse -Force}
    Write-Output "CLEANED mysql-startup-local=$(-not (Test-Path -LiteralPath $diagnosticScratch))"
    Write-Output "mysql_startup_diagnostic_exit=$diagnosticStatus sql_cases=not_run"
    if($diagnosticCleanupFailed){throw 'Remote diagnostic cleanup pending; retain the exact directory identity above'}
}
