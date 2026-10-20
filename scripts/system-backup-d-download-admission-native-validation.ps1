[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._-]{1,100}$')][string]$EvidencePrefix,
    [string]$ExistingOwnedCache = '',
    [switch]$IncludeServer,
    [switch]$IncludeRead,
    [switch]$IncludeProducer,
    [switch]$IncludeDownloadProbe,
    [switch]$TaggedOwnerSeedsOnly,
    [switch]$IncludeTaskOwnerProbe,
    [switch]$IncludeProducerOwnerProbe,
    [ValidateRange(300,1800)][int]$TestTimeoutSeconds = 900,
    [ValidateLength(0,512)][string]$TestRunPattern = ''
)
$ErrorActionPreference='Stop'
if($IncludeTaskOwnerProbe -and $IncludeProducerOwnerProbe){throw 'Choose the task or producer owner probe separately'}
if($IncludeTaskOwnerProbe -or $IncludeProducerOwnerProbe){$IncludeDownloadProbe=$true}
$nativeAllowedOwnerSeedPattern=if($IncludeProducerOwnerProbe){'^Test(DProducerDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}elseif($IncludeTaskOwnerProbe){'^Test(ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed|ASQLTaskDownloadOwnersMySQLSeed|DTaskOwnerDownloadChainMySQLSeed)$'}else{'^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}
if($TaggedOwnerSeedsOnly -and (-not $IncludeDownloadProbe -or $TestRunPattern -cne $nativeAllowedOwnerSeedPattern)){throw 'TaggedOwnerSeedsOnly requires its exact local-only seed pattern and probe builds'}
$nativeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nativeID=[guid]::NewGuid().ToString('N')
$nativeOwner=Join-Path $nativeRoot ('.tmp-d-index-cache-'+$nativeID)
$nativeLog=Join-Path $nativeRoot ('docs/evidence/'+$EvidencePrefix+'.jsonl')
$nativeErr=Join-Path $nativeRoot ('docs/evidence/'+$EvidencePrefix+'-stderr.txt')
$nativeManifest=Join-Path $nativeRoot ('docs/evidence/'+$EvidencePrefix+'-source.json')
$nativeTranscript=Join-Path $nativeRoot ('docs/evidence/'+$EvidencePrefix+'-native.txt')
foreach($nativeOutput in @($nativeLog,$nativeErr,$nativeManifest,$nativeTranscript)){
    if(Test-Path -LiteralPath $nativeOutput){throw 'Refusing to replace existing evidence'}
}
$nativeCache=Join-Path $nativeOwner 'cache'
if($ExistingOwnedCache){
    $nativeCache=(Resolve-Path -LiteralPath $ExistingOwnedCache).Path
    $nativeCacheOwner=[IO.Path]::GetDirectoryName($nativeCache)
    if([IO.Path]::GetDirectoryName($nativeCacheOwner) -ne $nativeRoot -or
        [IO.Path]::GetFileName($nativeCacheOwner) -notmatch '^\.tmp-d-admission-[A-Za-z0-9-]+$' -or
        [IO.Path]::GetFileName($nativeCache) -ne 'cache' -or
        ((Get-Item -Force -LiteralPath $nativeCacheOwner).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        ((Get-Item -Force -LiteralPath $nativeCache).Attributes -band [IO.FileAttributes]::ReparsePoint)){
        throw 'Existing cache must be an accurate non-redirected D run-owned workspace cache'
    }
}
$nativeResult=1
Start-Transcript -LiteralPath $nativeTranscript -NoClobber|Out-Null
try{
    [IO.Directory]::CreateDirectory($nativeOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $nativeOwner 'owner.txt'),[IO.Path]::GetFileName($nativeOwner))
    . (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
    $nativeSnapshot=New-AConfigProofSourceSnapshot -Root $nativeRoot -Owner $nativeOwner -MaxAttempts 3
    [IO.File]::WriteAllText($nativeManifest,($nativeSnapshot|ConvertTo-Json -Depth 8))
    Write-Host ('FROZEN files='+$nativeSnapshot.files.Count+' sha256='+$nativeSnapshot.source_sha256+' owner='+$nativeOwner)
    # Offline, fixed existing toolchain; never install modules or use the
    # user's inherited GOFLAGS to turn vet off. Temp/cache stays run-owned.
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS=''
    $env:GOCACHE=$nativeCache;$env:GOTMPDIR=$nativeOwner
    $env:TEST_TELEMETRY_DIR=Join-Path $nativeOwner 'telemetry'
    [IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR)|Out-Null
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off 2026-10-19')
    $nativePackages=@('./internal/systembackupsecurity','./internal/systembackupevidence')
    if($IncludeRead){$nativePackages+=@('./internal/systembackupread')}
    if($IncludeProducer){$nativePackages+=@('./internal/systembackupproducer')}
    if($IncludeServer){$nativePackages+=@('./cmd/server')}
    if($TestRunPattern){$nativePackages=@('./internal/systembackupevidence')}
    $nativeArguments=@('test','-mod=readonly','-p=2','-count=1',('-timeout='+$TestTimeoutSeconds+'s'),'-json')+$nativePackages
    Write-Host ('NATIVE_TIME_BUDGET package_timeout_seconds='+$TestTimeoutSeconds+' request_deadlines_unchanged=yes')
    if($TestRunPattern){$nativeArguments+=@('-run',$TestRunPattern)}
    if($TaggedOwnerSeedsOnly){$nativeArguments+=@('-tags','systembackup_mysql')}
    $nativeProcess=Start-Process -FilePath (Get-Command go).Source -ArgumentList $nativeArguments -WorkingDirectory (Join-Path $nativeOwner 'source/backend') -RedirectStandardOutput $nativeLog -RedirectStandardError $nativeErr -WindowStyle Hidden -PassThru -Wait
    $nativeScope='full_packages';if($TestRunPattern){$nativeScope='focused_packages'}
    Write-Host ('NATIVE_EXIT '+$nativeScope+'='+$nativeProcess.ExitCode+' packages='+($nativePackages -join ',')+' default_vet=yes')
    if(-not $TestRunPattern -and -not $IncludeServer -and -not $IncludeRead -and -not $IncludeProducer){Write-Host ('NATIVE_EXIT full_two_packages='+$nativeProcess.ExitCode)}
    # Preserve ordinary-package provenance even if a later detached/probe
    # stage fails. The final postcheck below still covers all probe stages.
    Test-DIndexSourceSnapshot -Root (Join-Path $nativeOwner 'source') -Manifest $nativeSnapshot
    Write-Host 'FROZEN_UNIT_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'
    if($IncludeDownloadProbe -and $nativeProcess.ExitCode -eq 0){
        # The exact same frozen source supplies the embedded SQL capsule,
        # standalone seed and Linux probe. None of these stages connects SQL.
        $nativeSeedPattern=if($TaggedOwnerSeedsOnly){'^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}else{'^Test(ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}
        if($IncludeTaskOwnerProbe){$nativeSeedPattern='^Test(ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed|ASQLTaskDownloadOwnersMySQLSeed|DTaskOwnerDownloadChainMySQLSeed)$'}
        if($IncludeProducerOwnerProbe){$nativeSeedPattern='^Test(DProducerDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}
        $nativeProbePackage='./internal/systembackupevidence'
        $nativePreviousPlatform=@{}
        foreach($nativeName in @('GOOS','GOARCH','CGO_ENABLED')){$nativePreviousPlatform[$nativeName]=[Environment]::GetEnvironmentVariable($nativeName,'Process')}
        try{
            $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
            $nativeProbeStages=@(
                @{name='tagged-seed';file=(Get-Command go).Source;arguments=@('test','-mod=readonly','-p=2','-count=1','-timeout=900s','-json','-tags','systembackup_mysql','-run',$nativeSeedPattern,$nativeProbePackage);directory=(Join-Path $nativeOwner 'source/backend')},
                @{name='windows-probe';file=(Get-Command go).Source;arguments=@('test','-mod=readonly','-p=2','-c','-tags','systembackup_mysql','-o',(Join-Path $nativeOwner 'download-admission.test.exe'),$nativeProbePackage);directory=(Join-Path $nativeOwner 'source/backend')},
                @{name='detached-seed';file=(Join-Path $nativeOwner 'download-admission.test.exe');arguments=@('-test.run',$nativeSeedPattern,'-test.v','-test.count=1','-test.timeout=60s');directory=$nativeOwner},
                @{name='linux-probe';file=(Get-Command go).Source;arguments=@('test','-mod=readonly','-p=2','-c','-tags','systembackup_mysql','-o',(Join-Path $nativeOwner 'download-admission.test'),$nativeProbePackage);directory=(Join-Path $nativeOwner 'source/backend')},
                @{name='linux-migration';file=(Get-Command go).Source;arguments=@('build','-mod=readonly','-p=2','-o',(Join-Path $nativeOwner 'system-backup-migrate'),'./cmd/system-backup-migrate');directory=(Join-Path $nativeOwner 'source/backend')}
            )
            foreach($nativeStage in $nativeProbeStages){
                if($nativeStage.name -eq 'linux-probe'){$env:GOOS='linux'}
                $nativeStageLog=Join-Path $nativeRoot ('docs/evidence/'+$EvidencePrefix+'-'+$nativeStage.name+'.txt')
                $nativeStageErr=Join-Path $nativeRoot ('docs/evidence/'+$EvidencePrefix+'-'+$nativeStage.name+'-stderr.txt')
                if((Test-Path -LiteralPath $nativeStageLog) -or (Test-Path -LiteralPath $nativeStageErr)){throw 'Refusing to replace probe evidence'}
                $nativeStageProcess=Start-Process -FilePath $nativeStage.file -ArgumentList $nativeStage.arguments -WorkingDirectory $nativeStage.directory -RedirectStandardOutput $nativeStageLog -RedirectStandardError $nativeStageErr -WindowStyle Hidden -PassThru -Wait
                Write-Host ('NATIVE_PROBE stage='+$nativeStage.name+' exit='+$nativeStageProcess.ExitCode+' actual_mysql=no')
                if($nativeStageProcess.ExitCode -ne 0){throw ('Download probe stage failed: '+$nativeStage.name)}
            }
            foreach($nativeBinary in @('download-admission.test.exe','download-admission.test','system-backup-migrate')){
                Write-Host ('NATIVE_PROBE_BINARY name='+$nativeBinary+' sha256='+(Get-FileHash -LiteralPath (Join-Path $nativeOwner $nativeBinary) -Algorithm SHA256).Hash.ToLowerInvariant())
            }
        }finally{
            foreach($nativeName in $nativePreviousPlatform.Keys){[Environment]::SetEnvironmentVariable($nativeName,$nativePreviousPlatform[$nativeName],'Process')}
        }
    }
    Test-DIndexSourceSnapshot -Root (Join-Path $nativeOwner 'source') -Manifest $nativeSnapshot
    Write-Host 'FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'
    $nativeResult=$nativeProcess.ExitCode
}catch{
    $nativeResult=1
    throw
}finally{
    try{
        if(Test-Path -LiteralPath $nativeOwner){
            $nativeResolved=(Resolve-Path -LiteralPath $nativeOwner).Path
            if([IO.Path]::GetDirectoryName($nativeResolved) -ne $nativeRoot -or
                [IO.Path]::GetFileName($nativeResolved) -ne ('.tmp-d-index-cache-'+$nativeID) -or
                ((Get-Item -Force -LiteralPath $nativeResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                [IO.File]::ReadAllText((Join-Path $nativeResolved 'owner.txt')) -ne [IO.Path]::GetFileName($nativeResolved)){
                throw 'Refusing cleanup outside this exact run-owned directory'
            }
            Remove-Item -LiteralPath $nativeResolved -Recurse -Force
        }
        Write-Host ('CLEANED snapshot='+(-not(Test-Path -LiteralPath $nativeOwner)))
        if($ExistingOwnedCache){Write-Host ('EXTERNAL_OWNED_CACHE caller_cleanup_required='+$nativeCache)}
    }catch{
        $nativeResult=1
        throw
    }finally{
        Write-Host ('d_admission_native_exit='+$nativeResult)
        Stop-Transcript|Out-Null
    }
}
exit $nativeResult
