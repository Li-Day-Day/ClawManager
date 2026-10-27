[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23',
    [ValidatePattern('^[A-Za-z0-9@._:-]+$')][string]$KubeContext='kubernetes-admin@kubernetes',
    [ValidatePattern('^[a-z0-9][a-z0-9.-]+$')][string]$TestNode='node1'
)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
function Invoke-ProducerDDLNative {
    param([string]$FilePath,[string[]]$Arguments)
    # Windows PowerShell 5.1 does not reliably transcribe native stdout.
    # Forward both streams through the host, preserving the native exit code.
    $ErrorActionPreference='Continue'
    $PSNativeCommandUseErrorActionPreference=$false
    $global:LASTEXITCODE=$null
    & $FilePath @Arguments 2>&1 | ForEach-Object { Write-Host $_.ToString() }
    if($null -eq $global:LASTEXITCODE){return 1}
    return $global:LASTEXITCODE
}
$ddlRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ddlSource=Join-Path $ddlRoot 'contracts/system-backup/v12/producer-authority-candidate.sql'
$ddlProbe=Join-Path $PSScriptRoot 'system-backup-d-producer-ddl-probe.py'
$ddlHash=(Get-FileHash -LiteralPath $ddlSource -Algorithm SHA256).Hash.ToLowerInvariant()
$ddlProbeHash=(Get-FileHash -LiteralPath $ddlProbe -Algorithm SHA256).Hash.ToLowerInvariant()
$ddlSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$ddlScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
foreach($tool in @($ddlSource,$ddlProbe,$ddlSsh,$ddlScp)){if(-not(Test-Path -LiteralPath $tool -PathType Leaf)){throw "Required existing file/tool missing: $tool"}}
Write-Output "D_PRODUCER_DDL_PLAN target=$SshTarget context=$KubeContext node=$TestNode ddl_sha256=$ddlHash probe_sha256=$ddlProbeHash image_pull=Never production_mutation=false"
if($CheckOnly){Write-Output 'PASS local-input-check=true remote-contacted=false';return}
$ddlID=[guid]::NewGuid().ToString('N')
$ddlScratch=Join-Path $ddlRoot ('.tmp-d-producer-ddl-'+$ddlID)
$ddlRemote='/tmp/clawmanager-d-producer-ddl-'+$ddlID
$ddlOptions=@('-T','-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','NumberOfPasswordPrompts=1','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
$ddlScpOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','NumberOfPasswordPrompts=1','-o','ConnectTimeout=15')
$ddlAttempted=$false
$ddlExit=$null
try {
    [IO.Directory]::CreateDirectory($ddlScratch)|Out-Null
    # Preserve exact file bytes; the remote verifies both fingerprints before use.
    Copy-Item -LiteralPath $ddlSource -Destination (Join-Path $ddlScratch 'candidate.sql')
    Copy-Item -LiteralPath $ddlProbe -Destination (Join-Path $ddlScratch 'probe.py')
    $ddlAttempted=$true
    $ddlExit=Invoke-ProducerDDLNative -FilePath $ddlSsh -Arguments ($ddlOptions+@($SshTarget,"set -eu; command -v python3 >/dev/null; command -v kubectl >/dev/null; command -v sha256sum >/dev/null; umask 077; mkdir '$ddlRemote'; printf '%s\n' '$ddlID' > '$ddlRemote/.owner'"))
    if($ddlExit -ne 0){throw 'Remote scratch unconfirmed; no test started'}
    $ddlExit=Invoke-ProducerDDLNative -FilePath $ddlScp -Arguments ($ddlScpOptions+@((Join-Path $ddlScratch 'candidate.sql'),(Join-Path $ddlScratch 'probe.py'),"${SshTarget}:$ddlRemote/"))
    if($ddlExit -ne 0){throw 'Transfer failed; no test started'}
    $ddlExit=Invoke-ProducerDDLNative -FilePath $ddlSsh -Arguments ($ddlOptions+@($SshTarget,"set -eu; cd '$ddlRemote'; printf '%s\n' '$ddlHash  candidate.sql' '$ddlProbeHash  probe.py' | sha256sum -c -; python3 -B probe.py --ddl candidate.sql --sha256 '$ddlHash' --context '$KubeContext' --node '$TestNode'"))
    Write-Output "D_PRODUCER_DDL_EXIT=$ddlExit"
    if($ddlExit -ne 0){throw 'Candidate DDL test did not pass; retain full output and cleanup status'}
} finally {
    $ddlRemoteClean=$true
    if($ddlAttempted){
        $ddlCleanupExit=Invoke-ProducerDDLNative -FilePath $ddlSsh -Arguments ($ddlOptions+@($SshTarget,"set -eu; test '$ddlRemote' = '/tmp/clawmanager-d-producer-ddl-$ddlID'; if test -e '$ddlRemote'; then test ! -L '$ddlRemote'; test -f '$ddlRemote/.owner'; test ! -L '$ddlRemote/.owner'; printf '%s\n' '$ddlID' | cmp -s - '$ddlRemote/.owner'; rm -rf -- '$ddlRemote'; fi; test ! -e '$ddlRemote'"))
        $ddlRemoteClean=$ddlCleanupExit -eq 0
    }
    if(Test-Path -LiteralPath $ddlScratch){
        $ddlResolved=(Resolve-Path -LiteralPath $ddlScratch).Path
        if([IO.Path]::GetDirectoryName($ddlResolved) -ne $ddlRoot -or [IO.Path]::GetFileName($ddlResolved) -notmatch '^\.tmp-d-producer-ddl-[a-f0-9]{32}$' -or (Get-Item -LiteralPath $ddlResolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing cleanup outside owned scratch'}
        Remove-Item -LiteralPath $ddlResolved -Recurse -Force
    }
    Write-Output ('CLEANED producer-ddl-local='+(-not(Test-Path -LiteralPath $ddlScratch))+' remote-transfer='+$ddlRemoteClean)
    if(-not $ddlRemoteClean){throw "Remote transfer cleanup unconfirmed: $ddlRemote"}
}
