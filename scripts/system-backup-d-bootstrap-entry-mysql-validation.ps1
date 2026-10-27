[CmdletBinding()]
param(
    [switch]$Remote,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$bootstrapConsumerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$bootstrapConsumerToken=[guid]::NewGuid().ToString('N')
$bootstrapConsumerOwner=Join-Path $bootstrapConsumerRoot ('.tmp-d-index-cache-'+$bootstrapConsumerToken)
$bootstrapConsumerFrozen=Join-Path $bootstrapConsumerOwner 'source'
$bootstrapConsumerBundle=Join-Path $bootstrapConsumerOwner 'bundle'
$bootstrapConsumerPrefix=Join-Path $bootstrapConsumerRoot ('docs/evidence/d-bootstrap-entry-mysql-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$bootstrapConsumerToken.Substring(0,8))
$bootstrapConsumerRemote='/tmp/clawmanager-d-bootstrap-entry-'+$bootstrapConsumerToken
$bootstrapConsumerRemoteCreated=$false
$bootstrapConsumerRemoteClean=$false
$bootstrapConsumerLocalClean=$false
$bootstrapConsumerFailure=$null
$bootstrapConsumerPostcheck=$false
$bootstrapConsumerSteps=@()
$bootstrapConsumerVariables=@('GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
$bootstrapConsumerSaved=@{}
foreach($bootstrapConsumerVariable in $bootstrapConsumerVariables){$bootstrapConsumerSaved[$bootstrapConsumerVariable]=[Environment]::GetEnvironmentVariable($bootstrapConsumerVariable,'Process')}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
function Invoke-BootstrapConsumerGo([string[]]$GoArguments){
    $bootstrapConsumerStepLog=$bootstrapConsumerPrefix+'-step-'+$script:bootstrapConsumerSteps.Count+'.jsonl'
    [IO.File]::WriteAllText($bootstrapConsumerStepLog,'')
    & go @GoArguments 2>&1 | Tee-Object -FilePath $bootstrapConsumerStepLog
    $bootstrapConsumerNativeExit=$LASTEXITCODE
    $script:bootstrapConsumerSteps+=@([ordered]@{command=@('go')+$GoArguments;exit_code=$bootstrapConsumerNativeExit;platform=$env:GOOS;log=$bootstrapConsumerStepLog;log_sha256=(Get-FileHash -LiteralPath $bootstrapConsumerStepLog -Algorithm SHA256).Hash.ToLowerInvariant()})
    if($bootstrapConsumerNativeExit -ne 0){throw ('BootstrapConsumer Go step failed exit='+$bootstrapConsumerNativeExit)}
}
function Invoke-BootstrapConsumerRemote([string]$Executable,[string[]]$RemoteArguments){
    & $Executable @RemoteArguments
    if($LASTEXITCODE -ne 0){throw 'BootstrapConsumer remote step failed; retain original output and any CLEANUP_PENDING identity'}
}
$bootstrapConsumerSsh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$bootstrapConsumerScp=Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$bootstrapConsumerOptions=@('-o','StrictHostKeyChecking=yes','-o','BatchMode=no','-o','PreferredAuthentications=keyboard-interactive,password','-o','PubkeyAuthentication=no','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3')
Start-Transcript -LiteralPath ($bootstrapConsumerPrefix+'.txt') | Out-Null
try {
    if(Test-Path -LiteralPath $bootstrapConsumerOwner){throw 'BootstrapConsumer owner already exists'}
    [IO.Directory]::CreateDirectory($bootstrapConsumerOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $bootstrapConsumerOwner 'owner.txt'),[IO.Path]::GetFileName($bootstrapConsumerOwner))
    $bootstrapConsumerSnapshot=New-AConfigProofSourceSnapshot -Root $bootstrapConsumerRoot -Owner $bootstrapConsumerOwner
    [IO.File]::WriteAllText(($bootstrapConsumerPrefix+'-source.json'),($bootstrapConsumerSnapshot|ConvertTo-Json -Depth 8))
    foreach($bootstrapConsumerDirectory in @('bundle','cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $bootstrapConsumerOwner $bootstrapConsumerDirectory))|Out-Null}
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=2';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
    $env:GOCACHE=Join-Path $bootstrapConsumerOwner 'cache';$env:GOTMPDIR=Join-Path $bootstrapConsumerOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $bootstrapConsumerOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $bootstrapConsumerTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
    if($LASTEXITCODE -ne 0 -or $bootstrapConsumerTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($bootstrapConsumerTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'BootstrapConsumer telemetry isolation failed'}
    & node (Join-Path $bootstrapConsumerFrozen 'scripts/system-backup-d-bootstrap-consumer-mysql-inputs.mjs')
    if($LASTEXITCODE -ne 0){throw 'BootstrapConsumer pinned synthetic inputs drifted'}
    Push-Location (Join-Path $bootstrapConsumerFrozen 'backend')
    try {
        Invoke-BootstrapConsumerGo -GoArguments @('test','-tags','systembackup_mysql','-run','^TestDBootstrap(ConsumerMySQLSeed|ConsumerRangesMySQLSeed|EntryMySQLSeed|OriginalMaterialsMySQLSeed)$','-count=1','-timeout=180s','-json','./internal/systembackupevidence')
        $bootstrapConsumerSeedEvents=@(Get-Content -LiteralPath $bootstrapConsumerSteps[0].log | ForEach-Object {$_|ConvertFrom-Json})
        $bootstrapConsumerSeedNames=@($bootstrapConsumerSeedEvents | Where-Object {$_.Action -eq 'pass' -and $_.Test} | ForEach-Object {$_.Test} | Sort-Object -CaseSensitive)
        $materialSeeds=@('TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapEntryMySQLSeed','TestDBootstrapOriginalMaterialsMySQLSeed')
        if(($bootstrapConsumerSeedNames -join "`n") -cne ($materialSeeds -join "`n")){throw 'Exact four seed roots required; an empty selector is not validation'}
        $env:GOOS='linux'
        Invoke-BootstrapConsumerGo -GoArguments @('test','-c','-tags','systembackup_mysql','-o',(Join-Path $bootstrapConsumerBundle 'd-bootstrap-entry.test'),'./internal/systembackupevidence')
        Invoke-BootstrapConsumerGo -GoArguments @('build','-o',(Join-Path $bootstrapConsumerBundle 'system-backup-migrate'),'./cmd/system-backup-migrate')
    } finally {Pop-Location}
    $bootstrapConsumerBinaryHash=(Get-FileHash -LiteralPath (Join-Path $bootstrapConsumerBundle 'd-bootstrap-entry.test') -Algorithm SHA256).Hash.ToLowerInvariant()
    $bootstrapConsumerMigrationHash=(Get-FileHash -LiteralPath (Join-Path $bootstrapConsumerBundle 'system-backup-migrate') -Algorithm SHA256).Hash.ToLowerInvariant()
    Copy-Item -LiteralPath (Join-Path $bootstrapConsumerFrozen 'backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json') -Destination (Join-Path $bootstrapConsumerBundle 'inputs.json')
    $bootstrapConsumerInputHash=(Get-FileHash -LiteralPath (Join-Path $bootstrapConsumerBundle 'inputs.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    Test-DIndexSourceSnapshot -Root $bootstrapConsumerFrozen -Manifest $bootstrapConsumerSnapshot
    Write-Output ('LOCAL_PASS bootstrap-entry targeted_seed=yes default_vet=yes seed=yes linux_probe=yes pinned_migrations=yes binary_sha256='+$bootstrapConsumerBinaryHash+' real_mysql=not_run')
    if($Remote){
        $bootstrapConsumerFiles=@('scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-provider-registration-phase.sh','scripts/system-backup-d-migration-phase.sh','scripts/system-backup-a-business-history-phase.sh','backend/internal/systembackupcontroller/bootstrap.go')
        $bootstrapConsumerFiles+=@(Get-ChildItem -LiteralPath (Join-Path $bootstrapConsumerFrozen 'backend/internal/db/migrations') -Filter '*.sql' -File|ForEach-Object{'backend/internal/db/migrations/'+$_.Name})
        foreach($bootstrapConsumerFile in $bootstrapConsumerFiles){
            $bootstrapConsumerSourceFile=if($bootstrapConsumerFile -eq 'scripts/system-backup-d-provider-registration-phase.sh'){'scripts/system-backup-d-bootstrap-entry-phase.sh'}else{$bootstrapConsumerFile}
            $bootstrapConsumerText=[IO.File]::ReadAllText((Join-Path $bootstrapConsumerFrozen $bootstrapConsumerSourceFile)).Replace("`r`n","`n")
            if($bootstrapConsumerFile -eq 'scripts/system-backup-fresh-migration-smoke.sh'){
                if([regex]::Matches($bootstrapConsumerText,'(?m)^test_image_pull_policy=IfNotPresent$').Count -ne 1){throw 'BootstrapConsumer cached-image policy pin differs'}
                $bootstrapConsumerText=$bootstrapConsumerText.Replace('test_image_pull_policy=IfNotPresent','test_image_pull_policy=Never')
            }
            $bootstrapConsumerDestination=Join-Path $bootstrapConsumerBundle $bootstrapConsumerFile;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($bootstrapConsumerDestination))|Out-Null;[IO.File]::WriteAllText($bootstrapConsumerDestination,$bootstrapConsumerText,[Text.UTF8Encoding]::new($false))
        }
        $bootstrapConsumerArchive=Join-Path $bootstrapConsumerOwner 'bundle.tar'
        & tar.exe -cf $bootstrapConsumerArchive -C $bootstrapConsumerBundle .
        if($LASTEXITCODE -ne 0){throw 'BootstrapConsumer archive failed'}
        $bootstrapConsumerArchiveHash=(Get-FileHash -LiteralPath $bootstrapConsumerArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        Invoke-BootstrapConsumerRemote $bootstrapConsumerSsh ($bootstrapConsumerOptions+@($SshTarget,"set -eu; umask 077; mkdir '$bootstrapConsumerRemote'"));$bootstrapConsumerRemoteCreated=$true
        Invoke-BootstrapConsumerRemote $bootstrapConsumerScp ($bootstrapConsumerOptions+@($bootstrapConsumerArchive,"${SshTarget}:$bootstrapConsumerRemote/bundle.tar"))
        $bootstrapConsumerDigest='be41b024860e917705cd8ed631c78e32d49196236c5e086f43f571c8919a79ea'
        Invoke-BootstrapConsumerRemote $bootstrapConsumerSsh ($bootstrapConsumerOptions+@($SshTarget,"set -eu; cd '$bootstrapConsumerRemote'; echo '$bootstrapConsumerArchiveHash  bundle.tar' | sha256sum -c -; tar -xf bundle.tar; bash -n scripts/system-backup-fresh-migration-smoke.sh; bash -n scripts/system-backup-d-provider-registration-phase.sh; KUBE_CONTEXT='kubernetes-admin@kubernetes' SOURCE_NAMESPACE='clawmanager-zhanghui08-system' TEST_NODE='node1' TEST_APP_IMAGE='10.130.14.23:5000/clawmanager@sha256:$bootstrapConsumerDigest' EXPECTED_APP_DIGEST='$bootstrapConsumerDigest' D_MIGRATION_BINARY='$bootstrapConsumerRemote/system-backup-migrate' D_MIGRATION_BINARY_SHA256='$bootstrapConsumerMigrationHash' D_DB_INVARIANT_SMOKE=1 D_PROVIDER_REGISTRATION_SMOKE=1 D_INVARIANT_BINARY='$bootstrapConsumerRemote/d-bootstrap-entry.test' D_INVARIANT_BINARY_SHA256='$bootstrapConsumerBinaryHash' D_PROVIDER_REGISTRATION_DDL='$bootstrapConsumerRemote/inputs.json' D_PROVIDER_REGISTRATION_DDL_SHA256='$bootstrapConsumerInputHash' bash scripts/system-backup-fresh-migration-smoke.sh"))
    }
    Test-DIndexSourceSnapshot -Root $bootstrapConsumerFrozen -Manifest $bootstrapConsumerSnapshot
    $bootstrapConsumerPostcheck=$true
} catch {$bootstrapConsumerFailure=$_.Exception.Message} finally {
    if($bootstrapConsumerRemoteCreated){
        try {Invoke-BootstrapConsumerRemote $bootstrapConsumerSsh ($bootstrapConsumerOptions+@($SshTarget,"test '$bootstrapConsumerRemote' = '/tmp/clawmanager-d-bootstrap-entry-$bootstrapConsumerToken' && test ! -L '$bootstrapConsumerRemote' && rm -rf -- '$bootstrapConsumerRemote' && test ! -e '$bootstrapConsumerRemote'"));$bootstrapConsumerRemoteClean=$true;Write-Output 'CLEANED bootstrapConsumer-remote-scratch=yes'} catch {$bootstrapConsumerFailure='BootstrapConsumer remote cleanup unconfirmed';Write-Output ('CLEANUP_PENDING remote='+$bootstrapConsumerRemote)}
    }
    foreach($bootstrapConsumerVariable in $bootstrapConsumerVariables){[Environment]::SetEnvironmentVariable($bootstrapConsumerVariable,$bootstrapConsumerSaved[$bootstrapConsumerVariable],'Process')}
    if(Test-Path -LiteralPath $bootstrapConsumerOwner){
        $bootstrapConsumerResolved=(Resolve-Path -LiteralPath $bootstrapConsumerOwner).Path
        if([IO.Path]::GetDirectoryName($bootstrapConsumerResolved) -cne $bootstrapConsumerRoot -or [IO.Path]::GetFileName($bootstrapConsumerResolved) -cne ('.tmp-d-index-cache-'+$bootstrapConsumerToken) -or ((Get-Item -Force -LiteralPath $bootstrapConsumerResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $bootstrapConsumerResolved 'owner.txt')) -cne [IO.Path]::GetFileName($bootstrapConsumerResolved)){throw 'Refusing bootstrapConsumer owner cleanup outside exact run'}
        Remove-Item -LiteralPath $bootstrapConsumerResolved -Recurse -Force
    }
    $bootstrapConsumerLocalClean=-not(Test-Path -LiteralPath $bootstrapConsumerOwner)
    Write-Output ('CLEANED bootstrapConsumer-local-owner='+$bootstrapConsumerOwner+' removed='+$bootstrapConsumerLocalClean)
    $bootstrapConsumerResult=[ordered]@{kind='d_bootstrap_entry_mysql_preparation.v1';suite='bootstrap-entry';error=$bootstrapConsumerFailure;steps=$bootstrapConsumerSteps;source=($bootstrapConsumerPrefix+'-source.json');source_postcheck=$bootstrapConsumerPostcheck;owner=$bootstrapConsumerOwner;owner_removed=$bootstrapConsumerLocalClean;remote_requested=[bool]$Remote;remote_scratch_removed=$bootstrapConsumerRemoteClean;binary_sha256=$bootstrapConsumerBinaryHash;migration_binary_sha256=$bootstrapConsumerMigrationHash;inputs_sha256=$bootstrapConsumerInputHash;dependencies_installed=$false;synthetic_proofs=$true;actual_mysql_results_accepted=$false;production_approved=$false}
    [IO.File]::WriteAllText(($bootstrapConsumerPrefix+'.json'),($bootstrapConsumerResult|ConvertTo-Json -Depth 8))
    Write-Output ('BOOTSTRAP_ENTRY_MYSQL_RESULT='+$bootstrapConsumerPrefix+'.json')
    Stop-Transcript|Out-Null
}
if($bootstrapConsumerFailure){throw $bootstrapConsumerFailure}
exit 0
