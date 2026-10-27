# No dependencies are installed. All copied source/cache/binaries are owned and
# removed in finally. Evidence logs and their exact source manifest are retained.
param([ValidatePattern('^a-field-dsn-native-20261021-r[1-9][0-9]*$')][string]$EvidencePrefix='a-field-dsn-native-20261021-r2')
$ErrorActionPreference='Stop'
$fieldRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$fieldStem=Join-Path $PSScriptRoot $EvidencePrefix
foreach($fieldSuffix in @('-source.json','-native.json','-tests-attempt1.jsonl')){if(Test-Path -LiteralPath ($fieldStem+$fieldSuffix)){throw 'Refusing evidence overwrite'}}
$fieldOwned=Join-Path $fieldRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fieldOwned)|Out-Null
[IO.File]::WriteAllText((Join-Path $fieldOwned 'owner.txt'),[IO.Path]::GetFileName($fieldOwned))
$fieldExit=1;$fieldSource=$null;$fieldStages=@();$fieldBinaries=@();$fieldCopied=0;$fieldCopiedBytes=0
$fieldStarted=[DateTime]::UtcNow.ToString('o')
$fieldEnvNames=@('GOPROXY','GOSUMDB','GOTOOLCHAIN','GOENV','GOFLAGS','GOMAXPROCS','GOOS','GOARCH','CGO_ENABLED','GOCACHE','GOTMPDIR','TEST_TELEMETRY_DIR','TEMP','TMP')
$fieldSaved=@{};foreach($fieldEnvName in $fieldEnvNames){$fieldSaved[$fieldEnvName]=[Environment]::GetEnvironmentVariable($fieldEnvName,'Process')}
function Invoke-FieldGoStage([string]$Name,[string[]]$Arguments,[string]$Extension='txt'){
    for($fieldAttempt=1;$fieldAttempt -le 3;$fieldAttempt++){
        $fieldOut=$fieldStem+'-'+$Name+'-attempt'+$fieldAttempt+'.'+$Extension
        $fieldErr=$fieldStem+'-'+$Name+'-attempt'+$fieldAttempt+'-stderr.txt'
        if((Test-Path -LiteralPath $fieldOut) -or (Test-Path -LiteralPath $fieldErr)){throw 'Stage output exists'}
        Write-Output ('FIELD_GO_STAGE stage='+$Name+' attempt='+$fieldAttempt+' default-vet=yes dependencies-installed=no')
        $fieldProcess=Start-Process -FilePath (Get-Command go).Source -ArgumentList $Arguments -WorkingDirectory (Join-Path $fieldOwned 'source/backend') -RedirectStandardOutput $fieldOut -RedirectStandardError $fieldErr -WindowStyle Hidden -PassThru -Wait
        $fieldStageExit=$fieldProcess.ExitCode
        $fieldStageRecord=[ordered]@{stage=$Name;attempt=$fieldAttempt;goos=$env:GOOS;exit=$fieldStageExit;arguments=$Arguments;stdout=([IO.Path]::GetFileName($fieldOut));stderr=([IO.Path]::GetFileName($fieldErr))}
        $script:fieldStages+=@($fieldStageRecord)
        if($fieldStageExit -eq 0){return}
        $fieldErrors=[IO.File]::ReadAllText($fieldErr);$fieldOutput=[IO.File]::ReadAllText($fieldOut)
        $fieldCrash=$fieldErrors -match '(?im)^[^\r\n]*\b(?:vet|asm|compile)\.exe: exit status 0xc000(?:0043|026b)\s*$'
        $fieldAssertion=$fieldOutput -match '(?m)"Action":"fail"[^\r\n]*"Test":|^\s*--- FAIL:|^panic:|^fatal error:'
        if(-not $fieldCrash -or $fieldAssertion -or $fieldAttempt -eq 3){throw ('Field Go stage failed: '+$Name+' exit='+$fieldStageExit)}
        Write-Output ('FIELD_RETAINED_TOOL_FAILURE stage='+$Name+' attempt='+$fieldAttempt+' same-command-retry=yes assertion-retry=no')
    }
}
try {
    . (Join-Path $fieldRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $fieldRoot 'scripts/system-backup-a-config-proof-source.ps1')
    $fieldSource=New-AConfigProofSourceSnapshot -Root $fieldRoot -Owner $fieldOwned -MaxAttempts 3
    [IO.File]::WriteAllText(($fieldStem+'-source.json'),($fieldSource|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS='';$env:GOMAXPROCS='1';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0'
    $env:GOCACHE=Join-Path $fieldOwned 'cache';$env:GOTMPDIR=Join-Path $fieldOwned 'temp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR
    $env:TEST_TELEMETRY_DIR=Join-Path $fieldOwned 'telemetry'
    foreach($fieldDir in @($env:GOCACHE,$env:GOTMPDIR,$env:TEST_TELEMETRY_DIR)){[IO.Directory]::CreateDirectory($fieldDir)|Out-Null}
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off 2026-10-21')
    $fieldTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR | Out-String)|ConvertFrom-Json
    if($LASTEXITCODE -ne 0 -or $fieldTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($fieldTelemetry.GOTELEMETRYDIR) -ne $env:TEST_TELEMETRY_DIR){throw 'Isolated telemetry not honored'}
    # Read completed immutable entries from the existing user cache, never write
    # or remove that cache. -count=1 below prevents reuse of any test results.
    $fieldExistingCache=Join-Path $env:LOCALAPPDATA 'go-build'
    if((Test-Path -LiteralPath $fieldExistingCache -PathType Container) -and -not ((Get-Item -LiteralPath $fieldExistingCache).Attributes -band [IO.FileAttributes]::ReparsePoint)){
        foreach($fieldCacheDir in @(Get-ChildItem -LiteralPath $fieldExistingCache -Directory)){
            if($fieldCacheDir.Name -notmatch '^[a-f0-9]{2}$' -or ($fieldCacheDir.Attributes -band [IO.FileAttributes]::ReparsePoint)){continue}
            $fieldCopyDir=Join-Path $env:GOCACHE $fieldCacheDir.Name
            [IO.Directory]::CreateDirectory($fieldCopyDir)|Out-Null
            foreach($fieldEntry in @(Get-ChildItem -LiteralPath $fieldCacheDir.FullName -File)){
                if($fieldCopiedBytes -ge 536870912 -or $fieldEntry.Length -gt 67108864 -or $fieldEntry.Name -notmatch '^[a-f0-9]{64}-[ad]$' -or ($fieldEntry.Attributes -band [IO.FileAttributes]::ReparsePoint)){continue}
                $fieldInput=$null;$fieldMemory=[IO.MemoryStream]::new()
                try{$fieldInput=[IO.File]::Open($fieldEntry.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete));$fieldInput.CopyTo($fieldMemory);[IO.File]::WriteAllBytes((Join-Path $fieldCopyDir $fieldEntry.Name),$fieldMemory.ToArray());$fieldCopied++;$fieldCopiedBytes+=$fieldMemory.Length}
                catch [IO.FileNotFoundException] {}
                finally{if($null -ne $fieldInput){$fieldInput.Dispose()};$fieldMemory.Dispose()}
            }
        }
    }
    Write-Output ('FIELD_CACHE copied_entries='+$fieldCopied+' bytes='+$fieldCopiedBytes+' test-results-reused=no original-cache-modified=no')
    Invoke-FieldGoStage 'tests' @('test','-mod=readonly','-count=1','-p=1','-json','./cmd/system-backup-registration') 'jsonl'
    Invoke-FieldGoStage 'owner-dependencies' @('list','-mod=readonly','-deps','-test','-tags','systembackup_mysql','-f','{{.ImportPath}}','./internal/systembackupsecurity','./internal/systembackupevidence')
    [IO.Directory]::CreateDirectory((Join-Path $fieldOwned 'bin'))|Out-Null
    foreach($fieldTarget in @('windows','linux')){
        $env:GOOS=$fieldTarget
        $fieldBinary=Join-Path $fieldOwned ('bin/registration-'+$fieldTarget+$(if($fieldTarget -eq 'windows'){'.exe'}else{''}))
        Invoke-FieldGoStage ('build-'+$fieldTarget) @('build','-mod=readonly','-p=1','-trimpath','-buildvcs=false','-ldflags="-s -w -buildid="','-o',$fieldBinary,'./cmd/system-backup-registration')
        $fieldBinaries+=@([ordered]@{goos=$fieldTarget;goarch='amd64';sha256=(Get-FileHash -LiteralPath $fieldBinary -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $fieldBinary).Length})
    }
    Test-DIndexSourceSnapshot -Root (Join-Path $fieldOwned 'source') -Manifest $fieldSource
    $fieldExit=0
}finally{
    $fieldResolved=(Resolve-Path -LiteralPath $fieldOwned).Path
    if([IO.Path]::GetDirectoryName($fieldResolved) -ne $fieldRoot -or [IO.Path]::GetFileName($fieldResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
       ((Get-Item -LiteralPath $fieldResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
       [IO.File]::ReadAllText((Join-Path $fieldResolved 'owner.txt')) -cne [IO.Path]::GetFileName($fieldResolved)){throw 'Owned cleanup identity changed'}
    Remove-Item -LiteralPath $fieldResolved -Recurse -Force
    foreach($fieldEnvName in $fieldEnvNames){[Environment]::SetEnvironmentVariable($fieldEnvName,$fieldSaved[$fieldEnvName],'Process')}
    $fieldRecord=[ordered]@{kind='a_field_dsn_native_validation';started_utc=$fieldStarted;finished_utc=[DateTime]::UtcNow.ToString('o');exit=$fieldExit;source_sha256=$fieldSource.source_sha256;source_files=$fieldSource.files.Count;source_postcheck=($fieldExit -eq 0);stages=$fieldStages;binaries=$fieldBinaries;owner=$fieldResolved;removed=(-not(Test-Path -LiteralPath $fieldResolved));immutable_cache_entries_copied=$fieldCopied;immutable_cache_bytes_copied=$fieldCopiedBytes;original_cache_modified=$false;test_results_reused=$false;default_vet=$true;dependencies_installed=$false;remote=$false;actual_mysql=$false;production_approved=$false}
    [IO.File]::WriteAllText(($fieldStem+'-native.json'),($fieldRecord|ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
    Write-Output ('FIELD_DSN_NATIVE exit='+$fieldExit+' owned-source-cache-binaries-removed='+$fieldRecord.removed+' dependencies-installed=no actual-mysql=no')
}
exit $fieldExit
