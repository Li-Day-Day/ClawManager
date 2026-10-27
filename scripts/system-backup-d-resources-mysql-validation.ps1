[CmdletBinding()]
param(
    [switch]$Remote,
    [switch]$WriterOnly,
    [switch]$WriterFKOnly,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
if($WriterOnly -and $WriterFKOnly){throw 'Choose exactly one writer suite'}
$PSNativeCommandUseErrorActionPreference=$false
$resourcesRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resourcesToken=[guid]::NewGuid().ToString('N')
$resourcesOwner=Join-Path $resourcesRoot ('.tmp-d-index-cache-'+$resourcesToken)
$resourcesFrozen=Join-Path $resourcesOwner 'source'
$resourcesBundle=Join-Path $resourcesOwner 'bundle'
$resourcesPrefix=Join-Path $resourcesRoot ('docs/evidence/d-resources-mysql-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$resourcesToken.Substring(0,8))
$resourcesRemote='/tmp/clawmanager-d-resources-'+$resourcesToken
$resourcesRemoteCreated=$false
$resourcesRemoteClean=$false
$resourcesLocalClean=$false
$resourcesFailure=$null
$resourcesSteps=@()
$resourcesVariables=@('GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$resourcesSaved=@{}
foreach($resourcesVariable in $resourcesVariables){$resourcesSaved[$resourcesVariable]=[Environment]::GetEnvironmentVariable($resourcesVariable,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
function Invoke-ResourcesGo([string[]]$GoArguments){
    $resourcesStepLog=$resourcesPrefix+'-step-'+$script:resourcesSteps.Count+'.jsonl'
    [IO.File]::WriteAllText($resourcesStepLog,'')
    & go @GoArguments 2>&1 | Tee-Object -FilePath $resourcesStepLog
    $resourcesNativeExit=$LASTEXITCODE
    $script:resourcesSteps+=@([ordered]@{command=@('go')+$GoArguments;exit_code=$resourcesNativeExit;platform=$env:GOOS;log=$resourcesStepLog;log_sha256=(Get-FileHash -LiteralPath $resourcesStepLog -Algorithm SHA256).Hash.ToLowerInvariant()})
    if($resourcesNativeExit -ne 0){throw ('Resources Go step failed exit='+$resourcesNativeExit)}
}
function Invoke-ResourcesRemote([string]$Executable,[string[]]$RemoteArguments){
    & $Executable @RemoteArguments
    if($LASTEXITCODE -ne 0){throw 'Resources remote step failed; retain original output and any CLEANUP_PENDING identity'}
}
$resourcesSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$resourcesScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$resourcesOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
Start-Transcript -LiteralPath ($resourcesPrefix+'.txt') | Out-Null
try {
    if(Test-Path -LiteralPath $resourcesOwner){throw 'Resources owner already exists'}
    [IO.Directory]::CreateDirectory($resourcesOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $resourcesOwner 'owner.txt'),[IO.Path]::GetFileName($resourcesOwner))
    $resourcesSnapshot=New-AConfigProofSourceSnapshot -Root $resourcesRoot -Owner $resourcesOwner
    [IO.File]::WriteAllText(($resourcesPrefix+'-source.json'),($resourcesSnapshot|ConvertTo-Json -Depth 8))
    foreach($resourcesDirectory in @('bundle','cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $resourcesOwner $resourcesDirectory))|Out-Null}
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=2';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
    $env:GOCACHE=Join-Path $resourcesOwner 'cache';$env:GOTMPDIR=Join-Path $resourcesOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $resourcesOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $resourcesTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $resourcesTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($resourcesTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Resources telemetry isolation failed'}
    & node (Join-Path $resourcesFrozen 'scripts/system-backup-d-resources-mysql-inputs.mjs')
    if($LASTEXITCODE -ne 0){throw 'Resources pinned synthetic inputs drifted'}
    Push-Location (Join-Path $resourcesFrozen 'backend')
    try {
        Invoke-ResourcesGo -GoArguments @('test','-count=1','-timeout=180s','-json','./internal/systembackupresources')
        Invoke-ResourcesGo -GoArguments @('test','-tags','systembackup_mysql','-run','^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$','-count=1','-json','./internal/systembackupresources')
        $resourcesSeedEvents=@(Get-Content -LiteralPath $resourcesSteps[1].log | ForEach-Object {$_|ConvertFrom-Json})
        $resourcesSeedNames=@($resourcesSeedEvents | Where-Object {$_.Action -eq 'pass' -and $_.Test} | ForEach-Object {$_.Test} | Sort-Object -CaseSensitive)
        $resourcesExpectedSeeds=@('TestAResourcesWriteFKMySQLSeed','TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed')
        if(($resourcesSeedNames -join "`n") -cne ($resourcesExpectedSeeds -join "`n")){throw 'Resources exact three seed roots required; an empty regex match is not validation'}
        $env:GOOS='linux'
        Invoke-ResourcesGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $resourcesBundle 'd-resources-readback.test'),'./internal/systembackupresources')
        Invoke-ResourcesGo -GoArguments @('build','-o',(Join-Path $resourcesBundle 'system-backup-migrate'),'./cmd/system-backup-migrate')
    } finally {Pop-Location}
    $resourcesBinaryHash=(Get-FileHash -LiteralPath (Join-Path $resourcesBundle 'd-resources-readback.test') -Algorithm SHA256).Hash.ToLowerInvariant()
    $resourcesMigrationHash=(Get-FileHash -LiteralPath (Join-Path $resourcesBundle 'system-backup-migrate') -Algorithm SHA256).Hash.ToLowerInvariant()
    Copy-Item -LiteralPath (Join-Path $resourcesFrozen 'backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json') -Destination (Join-Path $resourcesBundle 'inputs.json')
    $resourcesInputHash=(Get-FileHash -LiteralPath (Join-Path $resourcesBundle 'inputs.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    Test-DIndexSourceSnapshot -Root $resourcesFrozen -Manifest $resourcesSnapshot
    Write-Output ('LOCAL_PASS resources-readback complete_package=yes default_vet=yes seed=yes linux_probe=yes pinned_migrations=yes binary_sha256='+$resourcesBinaryHash+' real_mysql=not_run')
    if($Remote){
        $resourcesFiles=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-provider-registration-phase.sh','scripts/system-backup-d-migration-phase.sh','scripts/system-backup-a-business-history-phase.sh','backend/internal/systembackupcontroller/bootstrap.go')
        $resourcesFiles+=@(Get-ChildItem -LiteralPath (Join-Path $resourcesFrozen 'backend/internal/db/migrations') -Filter '*.sql' -File|ForEach-Object{'backend/internal/db/migrations/'+$_.Name})
        foreach($resourcesFile in $resourcesFiles){
            $resourcesSourceFile=if($resourcesFile -eq 'scripts/system-backup-d-provider-registration-phase.sh'){'scripts/system-backup-d-resources-readback-phase.sh'}else{$resourcesFile}
            $resourcesText=[IO.File]::ReadAllText((Join-Path $resourcesFrozen $resourcesSourceFile)).Replace("`r`n","`n")
            if($resourcesSourceFile -eq 'scripts/system-backup-d-resources-readback-phase.sh' -and ($WriterOnly -or $WriterFKOnly)){
                if([regex]::Matches($resourcesText,'(?m)^resources_mysql_suite=readback$').Count -ne 1){throw 'Resources suite dispatch pin differs'}
                $resourcesSuite=if($WriterFKOnly){'writer-fk'}else{'writer'}
                $resourcesText=$resourcesText.Replace('resources_mysql_suite=readback',('resources_mysql_suite='+$resourcesSuite))
            }
            if($resourcesFile -eq 'scripts/system-backup-fresh-migration-smoke.sh'){
                if([regex]::Matches($resourcesText,'(?m)^test_image_pull_policy=IfNotPresent$').Count -ne 1){throw 'Resources cached-image policy pin differs'}
                $resourcesText=$resourcesText.Replace('test_image_pull_policy=IfNotPresent','test_image_pull_policy=Never')
            }
            $resourcesDestination=Join-Path $resourcesBundle $resourcesFile;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resourcesDestination))|Out-Null;[IO.File]::WriteAllText($resourcesDestination,$resourcesText,[Text.UTF8Encoding]::new($false))
        }
        $resourcesArchive=Join-Path $resourcesOwner 'bundle.tar'
        & tar.exe -cf $resourcesArchive -C $resourcesBundle .
        if($LASTEXITCODE -ne 0){throw 'Resources archive failed'}
        $resourcesArchiveHash=(Get-FileHash -LiteralPath $resourcesArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        Invoke-ResourcesRemote $resourcesSsh ($resourcesOptions+@($SshTarget,"set -eu; umask 077; mkdir '$resourcesRemote'"));$resourcesRemoteCreated=$true
        Invoke-ResourcesRemote $resourcesScp ($resourcesOptions+@($resourcesArchive,"${SshTarget}:$resourcesRemote/bundle.tar"))
        $resourcesDigest='be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea'
        Invoke-ResourcesRemote $resourcesSsh ($resourcesOptions+@($SshTarget,"set -eu; cd '$resourcesRemote'; echo '$resourcesArchiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; bash -n scripts/system-backup-fresh-migration-smoke.sh; bash -n scripts/system-backup-d-provider-registration-phase.sh; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:$resourcesDigest' EXPECTED_APP_DIGEST='$resourcesDigest' D_MIGRATION_BINARY='$resourcesRemote/system-backup-migrate' D_MIGRATION_BINARY_SHA256='$resourcesMigrationHash' D_DB_INVARIANT_SMOKE=1 D_PROVIDER_REGISTRATION_SMOKE=1 D_INVARIANT_BINARY='$resourcesRemote/d-resources-readback.test' D_INVARIANT_BINARY_SHA256='$resourcesBinaryHash' D_PROVIDER_REGISTRATION_DDL='$resourcesRemote/inputs.json' D_PROVIDER_REGISTRATION_DDL_SHA256='$resourcesInputHash' bash scripts/system-backup-fresh-migration-smoke.sh"))
    }
    Test-DIndexSourceSnapshot -Root $resourcesFrozen -Manifest $resourcesSnapshot
} catch {$resourcesFailure=$_.Exception.Message} finally {
    if($resourcesRemoteCreated){
        try {Invoke-ResourcesRemote $resourcesSsh ($resourcesOptions+@($SshTarget,"test '$resourcesRemote' = '/tmp/clawmanager-d-resources-$resourcesToken' && test ! -L '$resourcesRemote' && rm -rf -- '$resourcesRemote' && test ! -e '$resourcesRemote'"));$resourcesRemoteClean=$true;Write-Output 'CLEANED resources-remote-scratch=yes'} catch {$resourcesFailure='Resources remote cleanup unconfirmed';Write-Output ('CLEANUP_PENDING remote='+$resourcesRemote)}
    }
    foreach($resourcesVariable in $resourcesVariables){[Environment]::SetEnvironmentVariable($resourcesVariable,$resourcesSaved[$resourcesVariable],'Process')}
    if(Test-Path -LiteralPath $resourcesOwner){
        $resourcesResolved=(Resolve-Path -LiteralPath $resourcesOwner).Path
        if([IO.Path]::GetDirectoryName($resourcesResolved) -cne $resourcesRoot -or [IO.Path]::GetFileName($resourcesResolved) -cne ('.tmp-d-index-cache-'+$resourcesToken) -or ((Get-Item -Force -LiteralPath $resourcesResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resourcesResolved 'owner.txt')) -cne [IO.Path]::GetFileName($resourcesResolved)){throw 'Refusing resources owner cleanup outside exact run'}
        Remove-Item -LiteralPath $resourcesResolved -Recurse -Force
    }
    $resourcesLocalClean=-not(Test-Path -LiteralPath $resourcesOwner)
    Write-Output ('CLEANED resources-local-owner='+$resourcesOwner+' removed='+$resourcesLocalClean)
    $resourcesResult=[ordered]@{kind='d_resources_mysql_preparation.v1';suite=$(if($WriterFKOnly){'writer-fk'}elseif($WriterOnly){'writer'}else{'readback'});error=$resourcesFailure;steps=$resourcesSteps;source=($resourcesPrefix+'-source.json');owner=$resourcesOwner;owner_removed=$resourcesLocalClean;remote_requested=[bool]$Remote;remote_scratch_removed=$resourcesRemoteClean;binary_sha256=$resourcesBinaryHash;migration_binary_sha256=$resourcesMigrationHash;inputs_sha256=$resourcesInputHash;dependencies_installed=$false;synthetic_proofs=$true;production_approved=$false}
    [IO.File]::WriteAllText(($resourcesPrefix+'.json'),($resourcesResult|ConvertTo-Json -Depth 8))
    Write-Output ('RESOURCES_MYSQL_RESULT='+$resourcesPrefix+'.json')
    Stop-Transcript|Out-Null
}
if($resourcesFailure){throw $resourcesFailure}
