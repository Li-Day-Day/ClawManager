[CmdletBinding()]
param([string]$CacheSourceOwner)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskID=[Guid]::NewGuid().ToString('N')
$taskOwner=Join-Path $taskRoot ('.tmp-a-reference-parity-'+$taskID)
$taskSource=Join-Path $taskOwner 'source'
$taskPrefix=Join-Path $taskRoot ('docs/evidence/a2-reference-capability-native-'+$taskID)
$taskDecoder='backend/internal/systembackupbootstrapsecurity/reference.go'
$taskNewTest='backend/internal/systembackupbootstrapsecurity/reference_contract_parity_test.go'
$taskCandidate='docs/evidence/a2-reference-capability-parity-candidate-20261026.go.txt'
$taskBefore='docs/evidence/a2-reference-capability-parity-before-20261026.go.txt'
$taskTest='docs/evidence/a2-reference-capability-parity-test-candidate-20261026.go.txt'
$taskScopeReader='docs/evidence/a2-reference-capability-go-scope-20261026.mjs'
$taskTestRoot='TestSecurityReferenceCombinedEvidenceCapabilitiesFollowExistingSchema'
$taskReport=[ordered]@{kind='a2_reference_capability_candidate_native.v1';id=$taskID;owner=$taskOwner;status='running';Go_started=$false;tests_started=$false;live_source_modified=$false;dependencies_installed=$false;actual_SQL=$false;production_approved=$false;cleanup=$false;phases=@();driver_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()}
$taskVariables=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$taskSaved=@{};foreach($name in $taskVariables){$taskSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$taskExpected=$null
function Get-TaskPins([string]$root,[string[]]$paths){
    @($paths|ForEach-Object{
        $file=Get-Item -LiteralPath (Join-Path $root $_)
        if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected source refused'}
        [ordered]@{path=$_;size=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
}
function Get-TaskFiles {
    $files=@(& rg --files --hidden backend contracts scripts)
    if($LASTEXITCODE -ne 0){throw 'Source enumeration failed'}
    $files+=@('docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/system-backup-d-config-maintenance-082-proposal-20261015.sql','docs/system-backup-d-admin-read-index-candidate-20261012.sql','docs/system-backup-d-download-admission-schema-proposal-20261019.sql')
    @($files|ForEach-Object {$_.Replace('\','/')}|Sort-Object -Unique -CaseSensitive)
}
function Wait-TaskGoWindow([string]$phase){
    $until=[DateTime]::UtcNow.AddHours(3);$quietSince=$null;$lastNotice=[DateTime]::MinValue
    while($true){
        $otherGo=@(Get-Process -Name go -ErrorAction SilentlyContinue)
        if($otherGo.Count){
            $quietSince=$null
            if(([DateTime]::UtcNow-$lastNotice).TotalSeconds -ge 30){
                Write-Output ('REFERENCE_WAIT_GO phase='+$phase+' live_pids='+(($otherGo|ForEach-Object Id) -join ','))
                $lastNotice=[DateTime]::UtcNow
            }
        }else{
            if($null -eq $quietSince){$quietSince=[DateTime]::UtcNow}
            if(([DateTime]::UtcNow-$quietSince).TotalSeconds -ge 10){return}
        }
        if([DateTime]::UtcNow -ge $until){throw ('Live Go process wait exceeded for '+$phase)}
        Start-Sleep -Seconds 1
    }
}
function Run-TaskGo([string]$phase,[string[]]$goArgs,[switch]$ExpectedFailure){
    Wait-TaskGoWindow $phase
    $taskReport.Go_started=$true
    & go @goArgs 1>($taskPrefix+'.'+$phase+'.jsonl') 2>($taskPrefix+'.'+$phase+'.stderr.txt')
    $exit=$LASTEXITCODE
    $taskReport.phases+=@([ordered]@{phase=$phase;goos=$env:GOOS;arguments=$goArgs;exit=$exit;expected_failure=[bool]$ExpectedFailure})
    if($ExpectedFailure){if($exit -eq 0){throw ('Expected old-source assertion failures missing: '+$phase)}}
    elseif($exit -ne 0){throw ('Go phase failed: '+$phase)}
}
function Get-TaskEvents([string]$phase){
    @(Get-Content -LiteralPath ($taskPrefix+'.'+$phase+'.jsonl')|Where-Object {$_.Length}|ForEach-Object {$_|ConvertFrom-Json})
}
function Assert-PassedEvents([string]$phase,[string[]]$packages){
    $events=Get-TaskEvents $phase
    if(@($events|Where-Object {$_.Action -in @('fail','build-fail','skip')}).Count){throw ('Unexpected failure/skip: '+$phase)}
    $actual=@($events|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}|ForEach-Object Package|Sort-Object)
    if(($actual -join "`n") -cne (($packages|Sort-Object) -join "`n")){throw ('Package completion mismatch: '+$phase)}
    $runs=@($events|Where-Object {$_.Action -eq 'run' -and $_.Test}|ForEach-Object {$_.Package+'::'+$_.Test}|Sort-Object)
    $passes=@($events|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Package+'::'+$_.Test}|Sort-Object)
    if(-not $runs.Count -or ($runs -join "`n") -cne ($passes -join "`n") -or @($runs|Sort-Object -Unique).Count -ne $runs.Count){throw ('Run/pass mismatch: '+$phase)}
    $taskReport[$phase+'_pass_events']=$passes.Count
}
try{
    Push-Location $taskRoot
    try{
        if(Test-Path -LiteralPath (Join-Path $taskRoot $taskNewTest)){throw 'Live regression path already exists; rebase candidate explicitly'}
        $taskReport.input_pins=Get-TaskPins $taskRoot @($taskCandidate,$taskBefore,$taskTest,$taskScopeReader)
        if((Get-FileHash -LiteralPath (Join-Path $taskRoot $taskDecoder) -Algorithm SHA256).Hash.ToLowerInvariant() -cne '99de31e723c22e1b3f8cbf33f0689054ae7ec589bab0c4c3e3666c26ca083022'){throw 'Live decoder differs from reviewed parent'}
        if((Get-FileHash -LiteralPath (Join-Path $taskRoot $taskBefore) -Algorithm SHA256).Hash.ToLowerInvariant() -cne '99de31e723c22e1b3f8cbf33f0689054ae7ec589bab0c4c3e3666c26ca083022'){throw 'Old-source archive differs from reviewed parent'}
        if((Get-FileHash -LiteralPath (Join-Path $taskRoot $taskCandidate) -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'bf76dcb6301fa2ffc331d45231e458e2806f1f7b01026cac02422c51510ea183'){throw 'Candidate differs from D1 source review'}
        if((Get-FileHash -LiteralPath (Join-Path $taskRoot $taskTest) -Algorithm SHA256).Hash.ToLowerInvariant() -cne '6c7e3e9a7d7d0f507b1799c2941d9ce83ab55cc95e11b214798fd3a260a24340'){throw 'Regression differs from D1 source review'}
        [IO.Directory]::CreateDirectory($taskSource)|Out-Null
        [IO.File]::WriteAllText((Join-Path $taskOwner 'owner.txt'),[IO.Path]::GetFileName($taskOwner))
        [ordered]@{kind='a2_reference_capability_running_handle.v1';id=$taskID;owner=$taskOwner;powershell_pid=$PID;started_utc=[DateTime]::UtcNow.ToString('o');status='starting';terminal_receipt=($taskPrefix+'.json')}|ConvertTo-Json|Set-Content -LiteralPath ($taskPrefix+'.running.json') -Encoding utf8
        $paths=@(Get-TaskFiles);$base=Get-TaskPins $taskRoot $paths
        if($paths.Count -lt 1000){throw 'Incomplete source capture'}
        foreach($p in $paths){$to=Join-Path $taskSource $p;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))|Out-Null;Copy-Item -LiteralPath (Join-Path $taskRoot $p) -Destination $to}
        if(($base|ConvertTo-Json -Depth 4 -Compress) -cne ((Get-TaskPins $taskSource $paths)|ConvertTo-Json -Depth 4 -Compress)){throw 'Source changed during copy; Go not started'}
        $taskReport.parent_files=$base
        Copy-Item -LiteralPath (Join-Path $taskRoot $taskCandidate) -Destination (Join-Path $taskSource $taskDecoder) -Force
        Copy-Item -LiteralPath (Join-Path $taskRoot $taskTest) -Destination (Join-Path $taskSource $taskNewTest)
        $candidatePaths=@($paths+$taskNewTest|Sort-Object -Unique -CaseSensitive)
        $taskExpected=Get-TaskPins $taskSource $candidatePaths;$taskReport.files=$taskExpected
        foreach($dir in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $taskOwner $dir))|Out-Null}
        if($CacheSourceOwner){
            $cacheSource=[IO.Path]::GetFullPath($CacheSourceOwner)
            if([IO.Path]::GetDirectoryName($cacheSource) -cne $taskRoot -or [IO.Path]::GetFileName($cacheSource) -notmatch '^\.tmp-(a-api-linux|d-api|d-index-cache)-[a-f0-9]{32}$'){throw 'Cache source must be an explicit workspace compiler owner'}
            foreach($dir in @($cacheSource,(Join-Path $cacheSource 'cache'))){if((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache refused'}}
            if([IO.File]::ReadAllText((Join-Path $cacheSource 'owner.txt')) -cne [IO.Path]::GetFileName($cacheSource)){throw 'Cache owner marker mismatch'}
            $copied=0
            foreach($dir in Get-ChildItem -LiteralPath (Join-Path $cacheSource 'cache') -Directory){
                if($dir.Name -notmatch '^[a-f0-9]{2}$'){continue}
                if($dir.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache bucket refused'}
                foreach($file in Get-ChildItem -LiteralPath $dir.FullName -File){
                    if($file.Name -notmatch '^[a-f0-9]{64}-[ad]$'){continue}
                    if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache entry refused'}
                    $to=Join-Path (Join-Path $taskOwner 'cache') $dir.Name;[IO.Directory]::CreateDirectory($to)|Out-Null
                    try{Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $to $file.Name) -ErrorAction Stop;$copied++}catch{throw 'Explicit read-only compilation cache copy failed'}
                }
            }
            $taskReport.cache_seed=[ordered]@{source=$cacheSource;source_read_only=$true;copied_entries=$copied;test_result_reuse=$false}
        }
        $env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS='1'
        $env:GOCACHE=Join-Path $taskOwner 'cache';$env:GOTMPDIR=Join-Path $taskOwner 'tmp';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $taskOwner 'telemetry'
        [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
        Wait-TaskGoWindow 'telemetry'
        $taskReport.Go_started=$true
        $telemetry=@(& go env -json GOTELEMETRY GOTELEMETRYDIR)|ConvertFrom-Json
        if($LASTEXITCODE -ne 0 -or $telemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Owned telemetry unavailable'}
        $taskReport.telemetry='off_owned_directory_verified'
        Push-Location (Join-Path $taskSource 'backend')
        try{
            foreach($platform in @('windows','linux')){
                $env:GOOS=$platform
                foreach($tags in @('ordinary','systembackup_mysql')){
                    $arguments=@('list','-deps','-test','-json');if($tags -ne 'ordinary'){$arguments+=@('-tags',$tags)};$arguments+='./...'
                    Run-TaskGo ($platform+'.'+$tags) $arguments
                }
            }
            & node (Join-Path $taskRoot $taskScopeReader) $taskPrefix --write
            if($LASTEXITCODE -ne 0){throw 'Actual Go scope derivation failed'}
            $scope=Get-Content -Raw -LiteralPath ($taskPrefix+'.scope.json')|ConvertFrom-Json
            $taskReport.actual_go_scope=($taskPrefix+'.scope.json')
            if(@($scope.additional_ordinary_test_callers).Count -ne 0 -or (@($scope.additional_mysql_test_callers) -join ',') -cne 'clawreef/internal/systembackupevidence'){throw 'New test-only caller requires explicit local-only test scope review'}
            $env:GOOS='windows';$taskReport.tests_started=$true
            Copy-Item -LiteralPath (Join-Path $taskRoot $taskBefore) -Destination (Join-Path $taskSource $taskDecoder) -Force
            Run-TaskGo 'old' @('test','-json','-count=1','-timeout=2700s','-run',('^'+$taskTestRoot+'$'),'./internal/systembackupbootstrapsecurity') -ExpectedFailure
            $old=Get-TaskEvents 'old'
            $failed=@($old|Where-Object {$_.Action -eq 'fail' -and $_.Test -like ($taskTestRoot+'/*')}|ForEach-Object {$_.Test.Split('/')[-1]}|Sort-Object)
            if(($failed -join ',') -cne 'append_record,exact_delete,inventory_read,snapshot_list' -or @($old|Where-Object {$_.Action -eq 'skip'}).Count -ne 0 -or @($old|Where-Object {$_.Action -eq 'pass' -and $_.Test -like ($taskTestRoot+'/*')}).Count -ne 4){throw 'Old-source failures do not isolate exactly the four contract violations'}
            $taskReport.old_expected_failed_capabilities=$failed
            Copy-Item -LiteralPath (Join-Path $taskRoot $taskCandidate) -Destination (Join-Path $taskSource $taskDecoder) -Force
            Run-TaskGo 'fixed' @('test','-json','-count=1','-timeout=2700s','-run',('^'+$taskTestRoot+'$'),'./internal/systembackupbootstrapsecurity')
            Assert-PassedEvents 'fixed' @('clawreef/internal/systembackupbootstrapsecurity')
            if($taskReport.fixed_pass_events -ne 9){throw 'Expected root and all eight capability cases'}
            $packages=@($scope.runtime_union);$relativePackages=@($packages|ForEach-Object {'./'+($_ -replace '^clawreef/','')})
            Run-TaskGo 'full' (@('test','-json','-count=1','-timeout=2700s')+$relativePackages)
            Assert-PassedEvents 'full' $packages
            Run-TaskGo 'tagged_seed' @('test','-json','-count=1','-timeout=2700s','-tags','systembackup_mysql','-run','^TestDBootstrapOriginalMaterialsMySQLSeed$','./internal/systembackupevidence')
            Assert-PassedEvents 'tagged_seed' @('clawreef/internal/systembackupevidence')
            if($taskReport.tagged_seed_pass_events -ne 1){throw 'Expected exact local-only original-materials seed'}
            $env:GOOS='linux';$taskReport.linux_binaries=@()
            foreach($pkg in $packages){
                $name=$pkg.Split('/')[-1];$binary=Join-Path $taskOwner ($name+'.test')
                Run-TaskGo ('linux_'+$name) @('test','-c','-o',$binary,('./'+($pkg -replace '^clawreef/','')))
                $taskReport.linux_binaries+=@([ordered]@{package=$pkg;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item -LiteralPath $binary).Length})
            }
            $binary=Join-Path $taskOwner 'tagged-evidence.test'
            Run-TaskGo 'linux_tagged_evidence' @('test','-c','-tags','systembackup_mysql','-o',$binary,'./internal/systembackupevidence')
            $taskReport.linux_tagged_evidence=[ordered]@{sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item -LiteralPath $binary).Length}
        }finally{Pop-Location}
        $taskReport.current_parent_unchanged=(($base|ConvertTo-Json -Depth 4 -Compress) -ceq ((Get-TaskPins $taskRoot @(Get-TaskFiles))|ConvertTo-Json -Depth 4 -Compress))
        $taskReport.status='passed_exact_candidate_snapshot'
    }finally{Pop-Location}
}catch{$taskReport.status='failed';$taskReport.error=$_.Exception.Message}finally{
    if($taskReport.input_pins){
        try{$taskReport.reviewed_inputs_unchanged=(($taskReport.input_pins|ConvertTo-Json -Depth 4 -Compress) -ceq ((Get-TaskPins $taskRoot @($taskReport.input_pins|ForEach-Object path))|ConvertTo-Json -Depth 4 -Compress))}catch{$taskReport.reviewed_inputs_unchanged=$false}
        if(-not $taskReport.reviewed_inputs_unchanged){$taskReport.status='failed';$taskReport.input_postcheck_error='Reviewed staged inputs or scope reader changed'}
    }
    if($taskExpected){
        try{$taskReport.snapshot_unchanged=(($taskExpected|ConvertTo-Json -Depth 4 -Compress) -ceq ((Get-TaskPins $taskSource @($taskExpected|ForEach-Object path))|ConvertTo-Json -Depth 4 -Compress))}catch{$taskReport.snapshot_unchanged=$false}
        if(-not $taskReport.snapshot_unchanged){$taskReport.status='failed';$taskReport.postcheck_error='Candidate snapshot changed or became unavailable'}
    }
    if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $taskReport.driver_sha256){$taskReport.status='failed';$taskReport.driver_changed=$true}
    foreach($name in $taskVariables){[Environment]::SetEnvironmentVariable($name,$taskSaved[$name],'Process')}
    $absolute=[IO.Path]::GetFullPath($taskOwner)
    if(Test-Path -LiteralPath $absolute){
        if([IO.Path]::GetDirectoryName($absolute) -cne $taskRoot -or [IO.Path]::GetFileName($absolute) -cne ('.tmp-a-reference-parity-'+$taskID) -or ((Get-Item -LiteralPath $absolute).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $absolute 'owner.txt')) -cne [IO.Path]::GetFileName($absolute)){throw 'Unsafe owner cleanup refused'}
        Remove-Item -LiteralPath $absolute -Recurse -Force
    }
    $taskReport.cleanup=-not(Test-Path -LiteralPath $absolute)
    $taskReport|ConvertTo-Json -Depth 14|Set-Content -LiteralPath ($taskPrefix+'.json') -Encoding utf8
    Write-Output ('REFERENCE_PARITY_RECEIPT='+$taskPrefix+'.json')
}
if($taskReport.status -ne 'passed_exact_candidate_snapshot' -or -not $taskReport.cleanup){exit 1}
