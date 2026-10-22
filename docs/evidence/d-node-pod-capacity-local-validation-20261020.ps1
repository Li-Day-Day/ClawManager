$ErrorActionPreference='Stop'
$capacityRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$capacityExecutions=@(
    @{name='pwsh5-capacity';exe=(Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe');capacity=$true},
    @{name='pwsh7-capacity';exe='C:\Users\zhanghui08\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe';capacity=$true},
    @{name='pwsh7-original-startup';exe='C:\Users\zhanghui08\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe';capacity=$false}
)
foreach($capacityExecution in $capacityExecutions){
    $capacityLog=Join-Path $PSScriptRoot ('d-node-pod-capacity-local-'+$capacityExecution.name+'-20261020-r1.txt')
    if(Test-Path -LiteralPath $capacityLog){throw 'Evidence already exists'}
    $capacityArgs=@('-NoProfile','-File',(Join-Path $capacityRoot 'scripts/system-backup-mysql-startup-diagnostic.ps1'))
    if($capacityExecution.capacity){$capacityArgs+='-NodeCapacityOnly'}
    # No -Remote: this harness may parse Bash and build an archive, but cannot
    # invoke SSH, create a Kubernetes object, install dependencies or run Go.
    $capacityOutput=@(& $capacityExecution.exe @capacityArgs 2>&1)
    $capacityExit=$LASTEXITCODE
    $capacityOutput | Tee-Object -FilePath $capacityLog
    if($capacityExit -ne 0){throw ('Offline wrapper failed: '+$capacityExecution.name)}
    $capacityJoined=$capacityOutput -join "`n"
    $capacityOwnerMatch=[regex]::Matches($capacityJoined,'(?m)^LOCAL_OWNER mysql-startup-source=(.+)\r?$')
    if($capacityOwnerMatch.Count -ne 1){throw 'Missing unique local scratch identity'}
    $capacityOwner=$capacityOwnerMatch[0].Groups[1].Value.Trim()
    if([IO.Path]::GetDirectoryName($capacityOwner) -cne $capacityRoot -or [IO.Path]::GetFileName($capacityOwner) -notmatch '^\.tmp-a-mysql-startup-[a-f0-9]{32}$'){throw 'Unexpected scratch ownership path'}
    if(Test-Path -LiteralPath $capacityOwner){throw 'Offline wrapper left its scratch'}
    if($capacityJoined -notmatch 'CLEANED mysql-startup-local=True' -or $capacityJoined -notmatch 'mysql_startup_diagnostic_exit=0 sql_cases=not_run'){throw 'Missing successful cleanup/exit'}
    if($capacityExecution.capacity){
        if($capacityJoined -notmatch 'NODE_POD_CAPACITY_PREPARED files=1 source_sha256=[a-f0-9]{64} build=not_run sql_cases=not_run cluster_writes=no scheduler_fit=not_verified' -or $capacityJoined -match 'MYSQL_STARTUP_PREPARED|NODE_POD_CAPACITY context='){throw 'Wrong offline capacity mode'}
    }elseif($capacityJoined -notmatch 'MYSQL_STARTUP_PREPARED files=98 bundle_sha256=[a-f0-9]{64} build=not_run sql_cases=not_run'){throw 'Original startup payload changed'}
    Write-Output ('PASS offline-wrapper '+$capacityExecution.name+' native_exit=0 owned_scratch_absent=yes remote=no')
}
