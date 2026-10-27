[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run,
    [string]$WarmCache=''
)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$prefix=Join-Path $PSScriptRoot ('a-gc-audit-resource-'+$Run)
$owner=Join-Path $root ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $owner 'source'
$names=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOTELEMETRY','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOMAXPROCS');$saved=@{}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
foreach($suffix in @('-native.txt','-source.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw 'Refusing existing audit-resource evidence'}}
function Invoke-AuditResourceStage {
    param([string]$Stage,[string[]]$Arguments,[string[]]$ExpectedFail=@())
    for($attempt=1;$attempt -le 3;$attempt++){
        $stdout=$prefix+'-'+$Stage+'-attempt'+$attempt+'.jsonl';$stderr=$prefix+'-'+$Stage+'-attempt'+$attempt+'-stderr.txt'
        if((Test-Path -LiteralPath $stdout)-or(Test-Path -LiteralPath $stderr)){throw 'Stage output exists'}
        Write-Host ('STAGE_START name='+$Stage+' attempt='+$attempt+' default_vet=yes')
        & 'C:/Program Files/Go/bin/go.exe' @Arguments 1>$stdout 2>$stderr
        $stageExit=$LASTEXITCODE
        $events=@(Get-Content -LiteralPath $stdout|ForEach-Object{$_|ConvertFrom-Json})
        $failed=@($events|Where-Object {$_.Test -and $_.Action -eq 'fail'}|ForEach-Object{$_.Test}|Sort-Object)
        $buildFailed=@($events|Where-Object {$_.Action -eq 'build-fail' -or $_.FailedBuild})
        $text=([IO.File]::ReadAllText($stderr))+([IO.File]::ReadAllText($stdout))
        Write-Host ('STAGE name='+$Stage+' attempt='+$attempt+' exit='+$stageExit+' default_vet=yes')
        if($stageExit -ne 0 -and $failed.Count -eq 0 -and $text -match '(?:vet|asm|compile)\.exe: exit status 0xc000(?:0043|026b)' -and $attempt -lt 3){Write-Output ('KNOWN_TOOL_RETRY stage='+$Stage+' same_command=yes');continue}
        if($ExpectedFail.Count){
            if($stageExit -ne 1 -or $buildFailed.Count -ne 0 -or ($failed -join "`n") -cne (@($ExpectedFail|Sort-Object)-join "`n")){throw ('Counterfactual did not fail exact independent assertions: '+$Stage)}
        } elseif($stageExit -ne 0 -or $failed.Count -ne 0 -or $buildFailed.Count -ne 0){throw ('Audit-resource stage failed: '+$Stage)}
        if(@($events|Where-Object{$_.Action -eq 'skip'}).Count){throw 'Unexpected skipped test'}
        if($Stage -ne 'evidence-full'){
            $ran=@($events|Where-Object{$_.Test -and $_.Action -eq 'run'}|ForEach-Object{$_.Test}|Sort-Object)
            $expectedRuns=@('TestAGCDirectAuditResourcePublishedInteger','TestAGCDirectAuditResourcePublishedInteger/published_int','TestAGCDirectAuditResourcePublishedInteger/wrong_type','TestAGCDirectAuditResourcePublishedInteger/unexpected_fk')|Sort-Object
            if(($ran -join "`n") -cne ($expectedRuns -join "`n")){throw ('Incomplete independent regression run: '+$Stage)}
        }
        Write-Host ('STAGE_ACCEPTED name='+$Stage+' attempt='+$attempt+' expected_counterfactual='+[bool]$ExpectedFail.Count)
        return
    }
    throw ('Audit-resource stage did not complete: '+$Stage)
}
$exitCode=1
Start-Transcript -LiteralPath ($prefix+'-native.txt') -NoClobber|Out-Null
try {
    foreach($dir in @($owner,(Join-Path $owner 'cache'),(Join-Path $owner 'tmp'),(Join-Path $owner 'telemetry'),(Join-Path $owner 'overlays'))){[IO.Directory]::CreateDirectory($dir)|Out-Null}
    [IO.File]::WriteAllText((Join-Path $owner 'owner.txt'),[IO.Path]::GetFileName($owner))
    Write-Host ('LOCAL_OWNER audit-resource='+$owner+' process_id='+$PID)
    $env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOTELEMETRY='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOMAXPROCS='1';$env:CGO_ENABLED='0';$env:GOOS='windows';$env:GOARCH='amd64';$env:GOCACHE=Join-Path $owner 'cache';$env:GOTMPDIR=Join-Path $owner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $owner 'telemetry'
    if($WarmCache){
        # Only adopt an A-owned COPY of build-cache files. Never move or clear
        # another run's cache; tests still use -count=1, normal vet and overlays.
        $warmResolved=(Resolve-Path -LiteralPath $WarmCache).Path
        $warmOwner=[IO.Path]::GetDirectoryName($warmResolved)
        $cacheTarget=[IO.Path]::GetFullPath($env:GOCACHE)
        if([IO.Path]::GetDirectoryName($warmOwner) -ne $root -or [IO.Path]::GetFileName($warmOwner) -notmatch '^\.tmp-a-gc-cache-[a-f0-9]{32}$' -or [IO.Path]::GetFileName($warmResolved) -ne 'cache' -or
            [IO.File]::ReadAllText((Join-Path $warmOwner 'owner.txt')) -ne [IO.Path]::GetFileName($warmOwner) -or
            ((Get-Item -Force -LiteralPath $warmOwner).Attributes -band [IO.FileAttributes]::ReparsePoint) -or ((Get-Item -Force -LiteralPath $warmResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            [IO.Path]::GetDirectoryName($owner) -ne $root -or [IO.Path]::GetDirectoryName($cacheTarget) -ne $owner -or [IO.Path]::GetFileName($cacheTarget) -ne 'cache' -or
            ((Get-Item -Force -LiteralPath $cacheTarget).Attributes -band [IO.FileAttributes]::ReparsePoint) -or @(Get-ChildItem -Force -LiteralPath $cacheTarget).Count){throw 'Refusing unowned/redirected cache adoption'}
        Write-Host ('WARM_CACHE source='+$warmResolved+' target='+$cacheTarget+' tests-count=1 default-vet=yes dependencies-installed=no')
        Remove-Item -LiteralPath $cacheTarget -Force
        Move-Item -LiteralPath $warmResolved -Destination $cacheTarget
    }
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),'off')
    $formatting=@(& 'C:/Program Files/Go/bin/gofmt.exe' -l (Join-Path $root 'backend/internal/systembackupevidence/download_retention_gc_references_a_test.go'))
    if($LASTEXITCODE -ne 0 -or $formatting.Count){throw 'A regression requires formatting; validation does not modify workspace inputs'}
    . (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $root 'scripts/system-backup-a-config-proof-source.ps1')
    $manifest=New-AConfigProofSourceSnapshot -Root $root -Owner $owner
    $manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($prefix+'-source.json') -Encoding utf8
    Write-Host ('LOCAL_SOURCE sha256='+$manifest.source_sha256+' files='+$manifest.files.Count)
    $target=Join-Path $source 'backend/internal/systembackupevidence/download_retention_gc_references.go'
    $correct=[IO.File]::ReadAllText($target).Replace("`r`n","`n")
    $typePattern='("audit_logs\.resource_id":\s*)"int"'
    $fkPattern='(func gcDirectFKEdges\(maintenance bool\) map\[string\]bool \{\n\tout := map\[string\]bool\{\}\n)'
    $selector='r := []gcDirectReference{'
    $columnsEnd='(?s)(func gcDirectColumns\(maintenance bool\) map\[string\]string \{.*?)(\n\treturn out\n\})'
    if([regex]::Matches($correct,$typePattern).Count -ne 1 -or [regex]::Matches($correct,$fkPattern).Count -ne 1 -or [regex]::Matches($correct,$columnsEnd).Count -ne 1 -or [regex]::Matches($correct,[regex]::Escape($selector)).Count -ne 1){throw 'Cannot bind exact correction counterfactuals'}
    $publicFault=$correct.Replace($selector,($selector+"`n"+'        {7, "audit_logs", "resource_id", "id", "public", true},'))
    $publicFault=[regex]::Replace($publicFault,$columnsEnd,('${1}'+"`n"+'    out["audit_logs.resource_id"] = "int"'+'${2}'))
    $mutants=@{
        'wrong-type'=[regex]::Replace($correct,$typePattern,'${1}"varchar"')
        'public-string'=$publicFault
        'unpublished-fk'=[regex]::Replace($correct,$fkPattern,('${1}'+'    out["audit_logs.resource_id>system_backup_operations.id"] = true'+"`n"))
    }
    $testRoot='TestAGCDirectAuditResourcePublishedInteger'
    Push-Location (Join-Path $source 'backend')
    try {
        $argsBase=@('test','-json','-count=1','-timeout=900s','-run',('^'+$testRoot+'$'),'./internal/systembackupevidence')
        Invoke-AuditResourceStage -Stage 'targeted' -Arguments $argsBase
        foreach($fault in @('wrong-type','public-string','unpublished-fk')){
            $replacement=Join-Path $owner ('overlays/'+$fault+'.go');$overlay=Join-Path $owner ('overlays/'+$fault+'.json')
            [IO.File]::WriteAllText($replacement,$mutants[$fault],[Text.UTF8Encoding]::new($false))
            $map=@{};$map[$target]=$replacement
            [IO.File]::WriteAllText($overlay,(@{Replace=$map}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
            Write-Host ('COUNTERFACTUAL name='+$fault+' overlay_sha256='+(Get-FileHash -LiteralPath $overlay -Algorithm SHA256).Hash.ToLowerInvariant()+' source_sha256='+(Get-FileHash -LiteralPath $replacement -Algorithm SHA256).Hash.ToLowerInvariant())
            $leaves=@($testRoot)
            if($fault -eq 'wrong-type'){$leaves+=@(($testRoot+'/published_int'),($testRoot+'/wrong_type'))}
            elseif($fault -eq 'public-string'){$leaves+=($testRoot+'/published_int')}
            else{$leaves+=($testRoot+'/unexpected_fk')}
            Invoke-AuditResourceStage -Stage $fault -Arguments (@('test','-overlay',$overlay)+$argsBase[1..($argsBase.Count-1)]) -ExpectedFail $leaves
        }
        Invoke-AuditResourceStage -Stage 'evidence-full' -Arguments @('test','-json','-count=1','-timeout=900s','./internal/systembackupevidence')
    } finally {Pop-Location}
    Test-DIndexSourceSnapshot -Root $source -Manifest $manifest
    Get-DIndexSourceFiles -Root $root|Set-Content -LiteralPath ($prefix+'-current-files.txt') -Encoding utf8
    Write-Host 'LOCAL_PASS audit-resource-postcheck=yes default-vet=yes dependencies-installed=no remote=not-run actual_mysql=not-run'
    $exitCode=0
} finally {
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
    if(Test-Path -LiteralPath $owner){$resolved=(Resolve-Path -LiteralPath $owner).Path;if([IO.Path]::GetDirectoryName($resolved) -ne $root -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -ne [IO.Path]::GetFileName($resolved)){throw 'Refusing unowned audit-resource cleanup'};Remove-Item -LiteralPath $resolved -Recurse -Force}
    Write-Host ('CLEANED audit-resource-source-cache-overlay='+(-not(Test-Path -LiteralPath $owner)))
    Write-Host ('a_gc_audit_resource_local_exit='+$exitCode)
    Stop-Transcript|Out-Null
}
