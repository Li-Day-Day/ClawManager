[CmdletBinding()]
param([string]$CompilationCacheSeed,[ValidatePattern('^[a-f0-9]{32}$')][string]$PriorSupplementID,[string]$WaitForSourceReadyFile)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$entryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entryDriverHash=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$entryID=[guid]::NewGuid().ToString('N')
$entryOwner=Join-Path $entryRoot ('.tmp-d-bootstrap-entry-'+$entryID)
$entrySource=Join-Path $entryOwner 'source'
$entryPrefix=Join-Path $entryRoot ('docs/evidence/d-bootstrap-entry-native-'+$entryID)
$entryNames=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$entrySaved=@{};foreach($name in $entryNames){$entrySaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$entryReport=[ordered]@{kind='d_bootstrap_entry_native.v1';status='failed';tests_started=$false;dependencies_installed=$false;actual_mysql_executed=$false;actual_sql_cases_executed=0;production_approved=$false;cleaned=$false;driver_sha256=$entryDriverHash}
function Get-EntryFiles {
    $paths=@(& rg --files --hidden backend contracts scripts)
    if($LASTEXITCODE -ne 0){throw 'Cannot enumerate entry source closure'}
    $paths+=@('docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/system-backup-d-config-maintenance-082-proposal-20261015.sql','docs/system-backup-d-admin-read-index-candidate-20261012.sql','docs/system-backup-d-download-admission-schema-proposal-20261019.sql')
    return @($paths|ForEach-Object {$_.Replace('\','/')}|Sort-Object -Unique)
}
function Get-EntryPins([string]$base,[string[]]$paths){
    return @($paths|ForEach-Object {$file=Get-Item -LiteralPath (Join-Path $base $_);if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected source input'};[ordered]@{path=$_;size=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
}
function Read-EntryEvents([string]$file){return @(Get-Content -LiteralPath $file|Where-Object {$_.StartsWith('{')}|ForEach-Object {$_|ConvertFrom-Json})}
function Assert-EntryCleanEvents($events){if(@($events|Where-Object {$_.Action -in @('fail','build-fail','skip')}).Count){throw 'Native failure or skipped coverage; inspect exact stage log'}}
function Assert-EntryRequiredRoots($events,[string[]]$roots){foreach($root in $roots){if(@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test -ceq $root}).Count -ne 1){throw ('Missing exact native test root: '+$root)}}}
function Clear-EntrySource {
    if(Test-Path -LiteralPath $entrySource){
        $resolvedSource=(Resolve-Path -LiteralPath $entrySource).Path
        if([IO.Path]::GetDirectoryName($resolvedSource) -cne $entryOwner -or [IO.Path]::GetDirectoryName($entryOwner) -cne $entryRoot -or [IO.Path]::GetFileName($resolvedSource) -cne 'source' -or ((Get-Item -LiteralPath $resolvedSource).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe entry source retry cleanup'}
        Remove-Item -LiteralPath $resolvedSource -Recurse -Force
    }
}
function Copy-EntryNewCompilerCache([string]$source){
    # Go's completed content-addressed files are copied read-only; test results
    # are never accepted as evidence. Native execution below always uses count=1.
    if(-not $source -or -not [IO.Directory]::Exists($source)){return}
    try{
        foreach($directory in [IO.Directory]::EnumerateDirectories($source)){
            $name=[IO.Path]::GetFileName($directory)
            if($name -cnotmatch '^[a-f0-9]{2}$'){continue}
            if([IO.File]::GetAttributes($directory) -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected compiler cache directory'}
            $destination=Join-Path (Join-Path $entryOwner 'cache') $name
            [IO.Directory]::CreateDirectory($destination)|Out-Null
            if([IO.File]::GetAttributes($destination) -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owned compiler cache'}
            foreach($file in [IO.Directory]::EnumerateFiles($directory)){
                $fileName=[IO.Path]::GetFileName($file)
                if($fileName -cnotmatch '^[a-f0-9]{64}-[ad]$'){continue}
                $target=Join-Path $destination $fileName
                if([IO.File]::Exists($target)){continue}
                try{
                    if([IO.File]::GetAttributes($file) -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected compiler cache file'}
                    [IO.File]::Copy($file,$target,$false)
                    $entryReport.additional_compile_cache_files++
                }catch [IO.IOException]{if([IO.File]::Exists($target)){[IO.File]::Delete($target)};$entryReport.cache_copy_races++}
            }
        }
    }catch [IO.IOException]{$entryReport.cache_copy_races++} # prior owner may now be cleaning
}
try{
    [IO.Directory]::CreateDirectory($entryOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $entryOwner 'owner.txt'),[IO.Path]::GetFileName($entryOwner))
    [IO.Directory]::CreateDirectory((Join-Path $entryOwner 'cache'))|Out-Null
    if($CompilationCacheSeed){
        if(Test-Path -LiteralPath $CompilationCacheSeed){
            $seed=(Resolve-Path -LiteralPath $CompilationCacheSeed).Path;$seedOwner=[IO.Path]::GetDirectoryName($seed)
            if([IO.Path]::GetDirectoryName($seedOwner) -cne $entryRoot -or [IO.Path]::GetFileName($seedOwner) -cnotmatch '^\.tmp-d-(index-cache|bootstrap-entry)-[a-f0-9]{32}$' -or [IO.Path]::GetFileName($seed) -cne 'cache' -or ((Get-Item -LiteralPath $seedOwner).Attributes -band [IO.FileAttributes]::ReparsePoint) -or ((Get-Item -LiteralPath $seed).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Cache source is not an exact plain workspace owner'}
            if([IO.File]::ReadAllText((Join-Path $seedOwner 'owner.txt')) -cne [IO.Path]::GetFileName($seedOwner)){throw 'Cache owner marker mismatch'}
            if(@(Get-ChildItem -LiteralPath $seed -Recurse -Force|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Redirected compiler cache rejected'}
            try{Get-ChildItem -LiteralPath $seed -Force|Copy-Item -Destination (Join-Path $entryOwner 'cache') -Recurse -Force;$entryReport.cache_seed_status='copied_compile_cache_only';$entryReport.cache_seed=[IO.Path]::GetRelativePath($entryRoot,$seed).Replace('\','/')}
            catch{
                $entryReport.cache_seed_status='copy_failed_cold_fallback';$entryReport.cache_seed_error=$_.Exception.Message
                $partialCache=Join-Path $entryOwner 'cache'
                if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($partialCache)) -cne $entryOwner -or [IO.Path]::GetDirectoryName($entryOwner) -cne $entryRoot){throw 'Unsafe partial cache cleanup'}
                Remove-Item -LiteralPath $partialCache -Recurse -Force
                [IO.Directory]::CreateDirectory($partialCache)|Out-Null
            }
        }else{$entryReport.cache_seed_status='missing_optional_seed_cold_fallback'}
    }
    if($PriorSupplementID){
        $priorReceipt=Join-Path $entryRoot ('docs/evidence/d-gc-full-supplement-'+$PriorSupplementID+'.json')
        Write-Output ('ENTRY_WAIT prior supplement='+$PriorSupplementID)
        $until=[DateTime]::UtcNow.AddMinutes(180)
        $entryReport.additional_compile_cache_files=0;$entryReport.cache_copy_races=0;$refreshAt=[DateTime]::UtcNow
        while(-not(Test-Path -LiteralPath $priorReceipt)){
            if([DateTime]::UtcNow -ge $until){throw 'Prior supplement terminal wait expired'}
            if($seed -and [DateTime]::UtcNow -ge $refreshAt){Copy-EntryNewCompilerCache $seed;$refreshAt=[DateTime]::UtcNow.AddSeconds(60)}
            Start-Sleep -Milliseconds 250
        }
        $prior=Get-Content -Raw -LiteralPath $priorReceipt|ConvertFrom-Json
        if($prior.owner_removed -ne $true -or ($prior.staging_cleanup_requested -eq $true -and $prior.staging_owner_removed -ne $true)){throw 'Prior supplement products not cleaned'}
        $entryReport.prior_supplement=$PriorSupplementID;$entryReport.prior_error=$prior.error
    }
    $entryCaptureUntil=[DateTime]::UtcNow.AddMinutes(180);$entryReport.capture_drift_retries=0
    while($true){
    if([DateTime]::UtcNow -ge $entryCaptureUntil){throw 'Stable entry capture wait expired'}
    if($WaitForSourceReadyFile){
        $readyPath=[IO.Path]::GetFullPath((Join-Path $entryRoot $WaitForSourceReadyFile))
        if(-not $readyPath.StartsWith((Join-Path $entryRoot 'docs/evidence')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Source scheduling marker must be in workspace evidence'}
        Write-Output ('ENTRY_WAIT source ready='+$WaitForSourceReadyFile)
        while(-not(Test-Path -LiteralPath $readyPath)){if([DateTime]::UtcNow -ge $entryCaptureUntil){throw 'Entry source readiness wait expired'};Start-Sleep -Milliseconds 250}
        $ready=Get-Content -Raw -LiteralPath $readyPath|ConvertFrom-Json
        if($ready.kind -ne 'd_bootstrap_entry_source_ready.v1' -or $ready.source_ready -ne $true -or $ready.production_approved -ne $false -or $null -eq $ready.files -or @($ready.files).Count -eq 0){throw 'Invalid source-only scheduling marker'}
        $entryReport.source_ready_marker=$WaitForSourceReadyFile
        $entryReport.source_ready_sha256=(Get-FileHash -LiteralPath $readyPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $entryReadyMatches=$true
        foreach($pin in $ready.files){
            $inputPath=[IO.Path]::GetFullPath((Join-Path $entryRoot $pin.path))
            if(-not $inputPath.StartsWith($entryRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Source-ready path outside workspace'}
            if(-not(Test-Path -LiteralPath $inputPath) -or (Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){$entryReadyMatches=$false;break}
        }
        if(-not $entryReadyMatches){Start-Sleep -Milliseconds 500;continue}
    }
    if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entryDriverHash){throw 'Entry driver changed while queued; native not started'}
    Clear-EntrySource
    $paths=Get-EntryFiles;$pins=Get-EntryPins $entryRoot $paths
    foreach($p in $paths){$target=Join-Path $entrySource $p;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null;Copy-Item -LiteralPath (Join-Path $entryRoot $p) -Destination $target}
    $snapshot=Get-EntryPins $entrySource $paths;$sourceAfter=Get-EntryPins $entryRoot (Get-EntryFiles)
    $entryCaptureChanged=(($pins|ConvertTo-Json -Depth 5 -Compress) -cne ($snapshot|ConvertTo-Json -Depth 5 -Compress) -or ($pins|ConvertTo-Json -Depth 5 -Compress) -cne ($sourceAfter|ConvertTo-Json -Depth 5 -Compress))
    if($WaitForSourceReadyFile){if(-not(Test-Path -LiteralPath $readyPath) -or (Get-FileHash -LiteralPath $readyPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entryReport.source_ready_sha256){$entryCaptureChanged=$true}}
    if($entryCaptureChanged){$entryReport.capture_drift_retries++;Clear-EntrySource;Write-Output 'ENTRY_CAPTURE_CHANGED native_not_started; waiting for current source readiness';Start-Sleep -Milliseconds 500;continue}
    break
    }
    $entryReport.files=$pins;$entryReport.snapshot_verified=$true
    $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=2';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS='2'
    $env:GOCACHE=Join-Path $entryOwner 'cache';$env:GOTMPDIR=Join-Path $entryOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $entryOwner 'telemetry';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
    [IO.Directory]::CreateDirectory($env:GOTMPDIR)|Out-Null;[IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR)|Out-Null
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $telemetryJSON=@(& go env -json GOTELEMETRY GOTELEMETRYDIR);if($LASTEXITCODE -ne 0){throw 'Cannot verify private telemetry'};$telemetry=($telemetryJSON -join "`n")|ConvertFrom-Json
    if($telemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Private telemetry not honored'}
    $entryReport.telemetry='off_owned_directory_verified';Write-Output ('ENTRY_FROZEN='+$entryID)
    Push-Location (Join-Path $entrySource 'backend')
    try{
        $entryReport.tests_started=$true
        & go test -json -count=1 -timeout=2700s -run '^Test(BootstrapInline|BootstrapCandidateAttempt|BootstrapDeploymentCandidates|DeploymentLegacy|BootstrapIndependent|BootstrapCandidateServiceConsumerIntegration|RequirementsReport|CommandRejects)' ./internal/systembackupproducer ./internal/systembackupsecurity ./cmd/system-backup-bootstrap 2>&1|Tee-Object -FilePath ($entryPrefix+'.targeted.jsonl')|Out-Null
        $entryReport.targeted_exit=$LASTEXITCODE;if($LASTEXITCODE -ne 0){throw 'Entry targeted native tests failed'}
        $events=Read-EntryEvents ($entryPrefix+'.targeted.jsonl');Assert-EntryCleanEvents $events
        $required=@('TestBootstrapInlineDomainFenceLegacyAndHistoricalBranches','TestBootstrapInlineDomainFenceRejectsPartialUnknownAndDrift','TestBootstrapInlineDomainFenceBindingAndRedaction','TestBootstrapInlineCannotInitializeAfterC1StorageExists','TestBootstrapInlineExactHistoryMayReadWithoutDomainButNeverWriteAgain','TestBootstrapInlineLateAuthorizationAndFixedChecksRollback','TestBootstrapInlineUsesFreshSQLTimeAfterInstallationWait','TestBootstrapInlinePreparedKeepsOriginalBoundedContext','TestBootstrapCandidateAttemptPreparesBeforeDatabaseAndDoesNotRenew','TestBootstrapCandidateAttemptPreparationFailureNeverNeedsDatabase','TestBootstrapCandidateAttemptCancellationAndConcurrentCopies','TestBootstrapCandidateAttemptOpenerFailureClosesDatabaseAndSealsCopies','TestBootstrapDeploymentCandidatesImmutableComposition','TestBootstrapDeploymentCandidatesApplyConsumerAndHistoricalRetry','TestBootstrapDeploymentCandidatesPreparationAndLateFilesBeforeCredentials','TestDeploymentLegacyAttemptKeepsPreparationContextThroughSQL','TestDeploymentLegacyRejectsTypedNilOwnersBeforeCredentials','TestBootstrapCandidateServiceConsumerIntegration')
        $required+=@('TestRequirementsReportDoesNotPretendOwnersAreDelivered','TestCommandRejectsMixedModesBypassFlagsAndUnpinnedFiles')
        if($WaitForSourceReadyFile){$required=@($required+@($ready.required_test_roots)|Sort-Object -Unique)}
        Assert-EntryRequiredRoots $events $required;$entryReport.required_roots=$required;$entryReport.targeted_pass_events=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test}).Count
        $entryPackages=@('./internal/systembackupproducer','./internal/systembackupsecurity','./internal/systembackupbootstrapsecurity','./internal/systembackupevidence','./internal/systembackupresources','./internal/systembackupread','./cmd/server','./internal/systembackupnoncebootstrap','./internal/systembackupcatrust','./cmd/system-backup-bootstrap')
        & go test -json -count=1 -timeout=2700s @entryPackages 2>&1|Tee-Object -FilePath ($entryPrefix+'.full.jsonl')|Out-Null
        $entryReport.full_exit=$LASTEXITCODE;if($LASTEXITCODE -ne 0){throw 'Entry affected complete packages failed'}
        $events=Read-EntryEvents ($entryPrefix+'.full.jsonl');Assert-EntryCleanEvents $events
        $passes=@($events|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}|ForEach-Object Package)
        if($passes.Count -ne $entryPackages.Count){throw 'Missing nine joint package passes or bootstrap CLI pass'};$entryReport.package_passes=$passes;$entryReport.full_pass_events=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test}).Count
        $seedRoots=@('TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapOriginalMaterialsMySQLSeed','TestDBootstrapEntryMySQLSeed')
        & go test -json -count=1 -timeout=2700s -tags systembackup_mysql -run '^TestDBootstrap(ConsumerMySQLSeed|ConsumerRangesMySQLSeed|OriginalMaterialsMySQLSeed|EntryMySQLSeed)$' ./internal/systembackupevidence 2>&1|Tee-Object -FilePath ($entryPrefix+'.seeds.jsonl')|Out-Null
        $entryReport.seeds_exit=$LASTEXITCODE;if($LASTEXITCODE -ne 0){throw 'Entry local-only seeds failed'}
        $events=Read-EntryEvents ($entryPrefix+'.seeds.jsonl');Assert-EntryCleanEvents $events;Assert-EntryRequiredRoots $events $seedRoots;$entryReport.local_seed_roots=$seedRoots
        $env:GOOS='linux';$entryReport.linux_steps=@()
        foreach($build in @(@{name='server';mode='build';package='./cmd/server'},@{name='bootstrap';mode='build';package='./cmd/system-backup-bootstrap'},@{name='migration-runner';mode='build';package='./cmd/system-backup-migrate'},@{name='tagged-evidence-test-compile-only';mode='test';package='./internal/systembackupevidence'})){
            $output=Join-Path $entryOwner ('linux-'+$build.name)
            $buildArguments=@('build','-o',$output,$build.package);if($build.mode -eq 'test'){$buildArguments=@('test','-tags','systembackup_mysql','-c','-o',$output,$build.package)}
            & go @buildArguments 2>&1|Set-Content -LiteralPath ($entryPrefix+'.linux-'+$build.name+'.txt') -Encoding UTF8
            if($LASTEXITCODE -ne 0){throw ('Entry Linux build/compile failed: '+$build.name)}
            $entryReport.linux_steps+=@([ordered]@{name=$build.name;exit_code=0;binary_sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()})
        }
    }finally{Pop-Location}
    $after=Get-EntryPins $entrySource $paths
    if(($snapshot|ConvertTo-Json -Depth 5 -Compress) -cne ($after|ConvertTo-Json -Depth 5 -Compress)){throw 'Entry snapshot changed during native tests'}
    $entryReport.snapshot_unchanged=$true;$current=Get-EntryPins $entryRoot (Get-EntryFiles)
    $entryReport.current_source_matches_snapshot=(($pins|ConvertTo-Json -Depth 5 -Compress) -ceq ($current|ConvertTo-Json -Depth 5 -Compress))
    if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entryDriverHash){throw 'Entry validation driver changed while running'}
    $entryReport.status='passed_exact_entry_snapshot'
}catch{$entryReport.error=$_.Exception.Message;throw}finally{
    foreach($name in $entryNames){[Environment]::SetEnvironmentVariable($name,$entrySaved[$name],'Process')}
    if(Test-Path -LiteralPath $entryOwner){$resolved=(Resolve-Path -LiteralPath $entryOwner).Path;if([IO.Path]::GetDirectoryName($resolved) -cne $entryRoot -or [IO.Path]::GetFileName($resolved) -cne ('.tmp-d-bootstrap-entry-'+$entryID) -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne [IO.Path]::GetFileName($resolved)){throw 'Unsafe entry owner cleanup'};Remove-Item -LiteralPath $resolved -Recurse -Force}
    $entryReport.cleaned=-not(Test-Path -LiteralPath $entryOwner);$entryReport|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($entryPrefix+'.json') -Encoding UTF8
    Write-Output ('ENTRY_CLEANED='+$entryReport.cleaned+' receipt='+$entryPrefix+'.json')
}
