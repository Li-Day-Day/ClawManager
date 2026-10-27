$ErrorActionPreference='Stop'
$cancelRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$cancelPrefix='a-journal-cancel-20261021-r1'
$cancelCacheOwner=Join-Path $cancelRoot '.tmp-d-admission-a-journal-cancel-20261021-r1'
$cancelOwner=Join-Path $cancelRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$cancelCleanup=Join-Path $PSScriptRoot ($cancelPrefix+'-cleanup.json')
$cancelTranscript=Join-Path $PSScriptRoot ($cancelPrefix+'-counters-native.txt')
foreach($p in @($cancelCacheOwner,$cancelOwner,$cancelCleanup,$cancelTranscript)){if(Test-Path -LiteralPath $p){throw 'Refusing to replace journal cancellation evidence'}}
$cancelExit=1
[IO.Directory]::CreateDirectory((Join-Path $cancelCacheOwner 'cache'))|Out-Null
[IO.File]::WriteAllText((Join-Path $cancelCacheOwner 'owner.txt'),$cancelPrefix)
try {
    Start-Transcript -LiteralPath $cancelTranscript -NoClobber|Out-Null
    try {
        [IO.Directory]::CreateDirectory($cancelOwner)|Out-Null
        [IO.File]::WriteAllText((Join-Path $cancelOwner 'owner.txt'),[IO.Path]::GetFileName($cancelOwner))
        . (Join-Path $cancelRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
        . (Join-Path $cancelRoot 'scripts/system-backup-a-config-proof-source.ps1')
        $cancelSnapshot=New-AConfigProofSourceSnapshot -Root $cancelRoot -Owner $cancelOwner -MaxAttempts 3
        [IO.File]::WriteAllText((Join-Path $PSScriptRoot ($cancelPrefix+'-counters-source.json')),($cancelSnapshot|ConvertTo-Json -Depth 8))
        Write-Host ('FROZEN files='+$cancelSnapshot.files.Count+' sha256='+$cancelSnapshot.source_sha256+' owner='+$cancelOwner)
        $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='';$env:GOENV='off';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOMAXPROCS='1'
        $env:GOCACHE=Join-Path $cancelCacheOwner 'cache';$env:GOTMPDIR=$cancelOwner;$env:TEST_TELEMETRY_DIR=Join-Path $cancelOwner 'telemetry'
        [IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR)|Out-Null
        [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off 2026-10-21')
        $cancelSource=Join-Path $cancelOwner 'source/backend'
        $cancelRecoveryPath=Join-Path $cancelSource 'internal/systembackupevidence/system_recovery_audit_journal.go'
        $cancelDownloadPath=Join-Path $cancelSource 'internal/systembackupevidence/download_failure_journal.go'
        $cancelRecovery=[IO.File]::ReadAllText($cancelRecoveryPath).Replace("`r`n","`n")
        $cancelDownload=[IO.File]::ReadAllText($cancelDownloadPath).Replace("`r`n","`n")
        $cancelFrom="`tif !j.mu.LockContext(ctx) {`n`t`treturn ErrUnavailable`n`t}`n"
        $cancelTo="`tj.mu.Lock()`n"
        if(([regex]::Matches($cancelRecovery,[regex]::Escape($cancelFrom))).Count -ne 1){throw 'Cancellation overlay target not unique'}
        $poisonPattern='(?s)func \(j \*DownloadFailureJournal\) poison\(\) \{.*?\n\}'
        $poisonMatches=[regex]::Matches($cancelDownload,$poisonPattern)
        if($poisonMatches.Count -ne 1){throw 'Poison overlay target not unique'}
        $poisonFrom=$poisonMatches[0].Value
        $poisonTo="func (j *DownloadFailureJournal) poison() {`n`tif j != nil && j.journal != nil {`n`t`tj.journal.mu.Lock()`n`t`tj.journal.poisoned.Store(true)`n`t`tj.journal.mu.Unlock()`n`t}`n}"
        $cancelOverlayDirectory=Join-Path $cancelOwner 'overlays'
        [IO.Directory]::CreateDirectory($cancelOverlayDirectory)|Out-Null
        $overlayRecords=@()
        foreach($definition in @(
            @{name='cancel';original=$cancelRecovery;source=$cancelRecoveryPath;from=$cancelFrom;to=$cancelTo},
            @{name='poison';original=$cancelDownload;source=$cancelDownloadPath;from=$poisonFrom;to=$poisonTo}
        )){
            $changed=$definition.original.Replace($definition.from,$definition.to)
            $overlayFile=Join-Path $cancelOverlayDirectory ($definition.name+'.go')
            [IO.File]::WriteAllText($overlayFile,$changed,[Text.UTF8Encoding]::new($false))
            $mapping=@{};$mapping[$definition.source]=$overlayFile
            [IO.File]::WriteAllText((Join-Path $cancelOverlayDirectory ($definition.name+'.json')),(@{Replace=$mapping}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
            $overlayRecords += [ordered]@{name=$definition.name;source=$definition.source.Substring((Join-Path $cancelOwner 'source').Length+1).Replace('\','/');source_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $definition.source).Hash.ToLowerInvariant();injected_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $overlayFile).Hash.ToLowerInvariant();from=$definition.from;to=$definition.to}
        }
        [IO.File]::WriteAllText((Join-Path $PSScriptRoot ($cancelPrefix+'-overlays.json')),($overlayRecords|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
        foreach($stage in @(
            @{name='cancel';expected=1;pattern='^Test(RecoveryAuditJournalCanceledQueue|RecoveryAuditJournalConcurrentCompleteRecords)$'},
            @{name='poison';expected=1;pattern='^TestFailureJournalsPoisonWithoutWaiting$'},
            @{name='focused';expected=0;pattern='^Test(RecoveryAuditJournal|DownloadFailureJournal|FailureJournals|JournaledGC|GCRuntime|GCAuthority)'}
        )){
            $goArgs=@('test','-mod=readonly','-p=1','-count=1','-timeout=900s','-json','-run',$stage.pattern)
            if($stage.name -ne 'focused'){$goArgs+=@('-overlay',(Join-Path $cancelOverlayDirectory ($stage.name+'.json')))}
            $goArgs+='./internal/systembackupevidence'
            $goProcess=Start-Process -FilePath (Get-Command go).Source -ArgumentList $goArgs -WorkingDirectory $cancelSource -RedirectStandardOutput (Join-Path $PSScriptRoot ($cancelPrefix+'-'+$stage.name+'.jsonl')) -RedirectStandardError (Join-Path $PSScriptRoot ($cancelPrefix+'-'+$stage.name+'-stderr.txt')) -WindowStyle Hidden -PassThru -Wait
            Write-Host ('JOURNAL_STAGE name='+$stage.name+' exit='+$goProcess.ExitCode+' expected='+$stage.expected+' default_vet=yes dependencies-installed=no')
            if($goProcess.ExitCode -ne $stage.expected){throw ('Unexpected journal stage result: '+$stage.name)}
        }
        Test-DIndexSourceSnapshot -Root (Join-Path $cancelOwner 'source') -Manifest $cancelSnapshot
        Write-Host 'FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'
    } finally {
        if(Test-Path -LiteralPath $cancelOwner){
            $resolved=(Resolve-Path -LiteralPath $cancelOwner).Path
            if([IO.Path]::GetDirectoryName($resolved) -cne $cancelRoot -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne [IO.Path]::GetFileName($resolved) -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Journal counter snapshot escaped ownership'}
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
        Write-Host ('CLEANED counter_snapshot='+(-not(Test-Path -LiteralPath $cancelOwner)))
        Stop-Transcript|Out-Null
    }
    Push-Location $cancelRoot
    try {
        & powershell -NoProfile -File scripts/system-backup-d-download-admission-native-validation.ps1 `
            -EvidencePrefix ($cancelPrefix+'-full') -ExistingOwnedCache (Join-Path $cancelCacheOwner 'cache') `
            -BuildParallelism 1 -IncludeRead -IncludeProducer -IncludeProducerOwnerProbe
        if($LASTEXITCODE -ne 0){throw 'Final journal cancellation full validation failed'}
        $cancelExit=0
    } finally {Pop-Location}
} finally {
    $cacheResolved=(Resolve-Path -LiteralPath $cancelCacheOwner).Path
    if([IO.Path]::GetDirectoryName($cacheResolved) -cne $cancelRoot -or [IO.Path]::GetFileName($cacheResolved) -cne '.tmp-d-admission-a-journal-cancel-20261021-r1' -or [IO.File]::ReadAllText((Join-Path $cacheResolved 'owner.txt')) -cne $cancelPrefix){throw 'Cancellation cache escaped ownership'}
    foreach($item in @((Get-Item -Force -LiteralPath $cacheResolved))+@(Get-ChildItem -Force -LiteralPath $cacheResolved -Recurse)){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cancellation cache child'}}
    Remove-Item -LiteralPath $cacheResolved -Recurse -Force
    [IO.File]::WriteAllText($cancelCleanup,([ordered]@{kind='a_journal_cancellation_owned_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');counter_owner=$cancelOwner;counter_exists=(Test-Path -LiteralPath $cancelOwner);cache_owner=$cacheResolved;cache_exists=(Test-Path -LiteralPath $cacheResolved);validation_exit=$cancelExit;dependencies_installed=$false;remote_executed=$false}|ConvertTo-Json)+"`n")
    Write-Output ('JOURNAL_CANCELLATION_EXIT='+$cancelExit+' CACHE_REMOVED='+(-not(Test-Path -LiteralPath $cacheResolved)))
}
