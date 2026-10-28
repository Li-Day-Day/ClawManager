[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ParityReceipt,
    [Parameter(Mandatory=$true)][string]$EntryLinuxReceipt,
    [string]$PreparedOwner='',
    [string[]]$Packages=@('internal/systembackupproducer','internal/systembackupsecurity','internal/systembackupresources','internal/systembackupread','internal/systembackupevidence','cmd/server'),
    [switch]$VerifyInputsOnly
)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$ordinaryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ordinaryAllowed=@('internal/systembackupproducer','internal/systembackupsecurity','internal/systembackupresources','internal/systembackupread','internal/systembackupevidence','cmd/server')
if($Packages.Count -eq 0 -or @($Packages|Select-Object -Unique).Count -ne $Packages.Count -or @($Packages|Where-Object {$_ -cnotin $ordinaryAllowed}).Count){throw 'Only explicitly selected remaining complete ordinary packages are allowed'}
$ordinaryID=[guid]::NewGuid().ToString('N')
$ordinaryOwner=Join-Path $ordinaryRoot ('.tmp-d-index-cache-'+$ordinaryID)
$ordinaryPreparedCache=$null;$ordinaryAdopted=$false
if($PreparedOwner){
    if($VerifyInputsOnly){throw 'Verify-only cannot consume a prepared native cache owner'}
    $candidateOwner=[IO.Path]::GetFullPath($PreparedOwner)
    if([IO.Path]::GetDirectoryName($candidateOwner) -cne $ordinaryRoot -or [IO.Path]::GetFileName($candidateOwner) -cnotmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or (Resolve-Path -LiteralPath $candidateOwner).Path -cne $candidateOwner -or ((Get-Item -LiteralPath $candidateOwner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Prepared cache must be the exact Root workspace owner'}
    if([IO.File]::ReadAllText((Join-Path $candidateOwner 'owner.txt')) -cne [IO.Path]::GetFileName($candidateOwner) -or (Test-Path -LiteralPath (Join-Path $candidateOwner 'source'))){throw 'Prepared owner marker wrong or source already present'}
    foreach($entry in Get-ChildItem -LiteralPath $candidateOwner -Recurse -Force){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Prepared cache contains a redirected entry'}}
    $ordinaryPreparedCache=Get-Content -LiteralPath (Join-Path $candidateOwner 'preparation.json') -Raw|ConvertFrom-Json
    if($ordinaryPreparedCache.kind -cne 'd2_current_ordinary_compilation_cache_handoff.v1' -or $ordinaryPreparedCache.owner -cne $candidateOwner -or $ordinaryPreparedCache.cache_only -ne $true -or $ordinaryPreparedCache.tests_started -ne $false -or $ordinaryPreparedCache.test_result_reuse -ne $false -or [IO.Path]::GetDirectoryName($ordinaryPreparedCache.report) -cne $PSScriptRoot -or (Get-FileHash -LiteralPath $ordinaryPreparedCache.report -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ordinaryPreparedCache.report_sha256){throw 'Prepared cache provenance mismatch'}
    foreach($update in @($ordinaryPreparedCache.updates)){if([IO.Path]::GetDirectoryName($update.report) -cne $PSScriptRoot -or (Get-FileHash -LiteralPath $update.report -Algorithm SHA256).Hash.ToLowerInvariant() -cne $update.report_sha256){throw 'Prepared cache update provenance mismatch'}}
    $ordinaryOwner=$candidateOwner;$ordinaryID=[IO.Path]::GetFileName($ordinaryOwner).Substring('.tmp-d-index-cache-'.Length)
}
$ordinaryPrefix=Join-Path $PSScriptRoot ('d2-current-ordinary-native-'+$ordinaryID)
$ordinaryManifest=$ordinaryPrefix+'.source.json'
$ordinaryResult=[ordered]@{kind='d2_current_ordinary_complete_native.v1';status='failed';id=$ordinaryID;owner=$ordinaryOwner;Go_started=$false;tests_started=$false;packages=$Packages;dependencies_installed=$false;remote_contacted=$false;actual_mysql=$false;production_approved=$false;source_scope_accepted=$false;owner_removed=$false;steps=@();error=$null}
$ordinaryDriverPath=[IO.Path]::GetFullPath($PSCommandPath)
$ordinaryDriverHash=(Get-FileHash -LiteralPath $ordinaryDriverPath -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinarySnapshotter=Join-Path $PSScriptRoot 'd-local-closeout-snapshot-20261023.mjs'
$ordinarySnapshotterHash=(Get-FileHash -LiteralPath $ordinarySnapshotter -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryInventory=Join-Path $PSScriptRoot 'd2-current-ordinary-inventory-20261027.mjs'
$ordinaryInventoryHash=(Get-FileHash -LiteralPath $ordinaryInventory -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryScopeReader=Join-Path $PSScriptRoot 'd2-current-ordinary-go-scope-20261027.mjs'
$ordinaryScopeReaderHash=(Get-FileHash -LiteralPath $ordinaryScopeReader -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryParser=Join-Path $PSScriptRoot 'a2-reference-capability-go-scope-20261026.mjs'
$ordinaryParserHash=(Get-FileHash -LiteralPath $ordinaryParser -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryEventReader=Join-Path $PSScriptRoot 'd-resources-mysql-actual-review-20261023.mjs'
$ordinaryEventReaderHash=(Get-FileHash -LiteralPath $ordinaryEventReader -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryParityValidator=Join-Path $PSScriptRoot 'a2-reference-capability-supplement-review-20261027-r2.mjs'
$ordinaryParityValidatorHash=(Get-FileHash -LiteralPath $ordinaryParityValidator -Algorithm SHA256).Hash.ToLowerInvariant()
$ordinaryVariables=@('GOENV','GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','GOTELEMETRY','TEMP','TMP')
$ordinarySaved=@{};foreach($name in $ordinaryVariables){$ordinarySaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
function Read-OrdinaryDependencyReceipt([string]$InputPath,[string]$Pattern){
    $absolute=[IO.Path]::GetFullPath($InputPath)
    if([IO.Path]::GetDirectoryName($absolute) -cne (Join-Path $ordinaryRoot 'docs/evidence') -or [IO.Path]::GetFileName($absolute) -cnotmatch $Pattern -or ((Get-Item -LiteralPath $absolute -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unexpected prerequisite receipt path'}
    return [ordered]@{path=$absolute;sha256=(Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant();receipt=(Get-Content -LiteralPath $absolute -Raw|ConvertFrom-Json)}
}
function Assert-OrdinaryHelpers {
    foreach($item in @(@($ordinaryDriverPath,$ordinaryDriverHash),@($ordinarySnapshotter,$ordinarySnapshotterHash),@($ordinaryInventory,$ordinaryInventoryHash),@($ordinaryScopeReader,$ordinaryScopeReaderHash),@($ordinaryParser,$ordinaryParserHash),@($ordinaryEventReader,$ordinaryEventReaderHash))){
        if((Get-FileHash -LiteralPath $item[0] -Algorithm SHA256).Hash.ToLowerInvariant() -cne $item[1]){throw 'Ordinary executed driver or reader changed'}
    }
    if($ordinaryParityValidator){
        if((Get-FileHash -LiteralPath $ordinaryParityValidator -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ordinaryParityValidatorHash){throw 'Exact parser composition receiver changed'}
    }
}
try {
    $parity=Read-OrdinaryDependencyReceipt $ParityReceipt '^a2-reference-capability-supplement-[a-f0-9]{32}\.composed\.json$'
    if($parity.receipt.kind -cne 'a2_reference_capability_composed_candidate_review.v1' -or $parity.receipt.status -cne 'passed_exact_candidate_windows_and_supplement' -or $parity.receipt.windows_source_postcheck -ne $true -or $parity.receipt.snapshot_postcheck -ne $true -or $parity.receipt.reviewed_inputs_postcheck -ne $true -or $parity.receipt.owners_independently_absent -ne $true -or $parity.receipt.actual_SQL -ne $false -or $parity.receipt.production_approved -ne $false){throw 'Exact accepted parser Windows/supplement composition required before ordinary validation'}
    $ordinaryParityPrefix=$parity.path -replace '\.composed\.json$',''
    $parityAnswer=(& node $ordinaryParityValidator --check $ordinaryParityPrefix|Out-String)
    if($LASTEXITCODE -ne 0){throw 'Actual parser composition receiver rejected'}
    $parityCheck=$parityAnswer|ConvertFrom-Json
    if($parityCheck.status -cne 'passed_exact_candidate_windows_and_supplement' -or [IO.Path]::GetFullPath($parityCheck.output.path) -cne $parity.path -or $parityCheck.output.sha256 -cne $parity.sha256 -or $parityCheck.output.size -ne (Get-Item -LiteralPath $parity.path).Length){throw 'Parser composition receiver returned another artifact'}
    $ordinaryResult.parity_composition_check=$parityCheck
    # Candidate validation is not promotion. Require its two candidate files to
    # be present with exactly those bytes in the real current source first.
    foreach($relative in @('backend/internal/systembackupbootstrapsecurity/reference.go','backend/internal/systembackupbootstrapsecurity/reference_contract_parity_test.go')){
        $pin=@($parity.receipt.source_files|Where-Object {$_.path -ceq $relative})
        $candidatePin=@($parity.receipt.candidate_delta|Where-Object {$_.path -ceq $relative})
        if($pin.Count -ne 1 -or $candidatePin.Count -ne 1 -or $pin[0].sha256 -cne $candidatePin[0].sha256 -or $pin[0].size -ne $candidatePin[0].size -or (Get-Item -LiteralPath (Join-Path $ordinaryRoot $relative)).Length -ne $pin[0].size -or (Get-FileHash -LiteralPath (Join-Path $ordinaryRoot $relative) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin[0].sha256){throw 'Validated parser candidate has not been promoted exactly to current source'}
    }
    $entryLinux=Read-OrdinaryDependencyReceipt $EntryLinuxReceipt '^d-bootstrap-entry-linux-[a-f0-9]{32}\.json$'
    if($entryLinux.receipt.kind -cne 'd_bootstrap_entry_linux_supplement.v1' -or $entryLinux.receipt.status -cne 'passed_exact_linux_supplement' -or $entryLinux.receipt.precheck -ne $true -or $entryLinux.receipt.postcheck -ne $true -or $entryLinux.receipt.cleaned -ne $true -or $entryLinux.receipt.actual_mysql_executed -ne $false -or $entryLinux.receipt.dependencies_installed -ne $false -or @($entryLinux.receipt.linux_steps).Count -ne 4 -or @($entryLinux.receipt.linux_steps|Where-Object {$_.exit_code -ne 0}).Count){throw 'Original entry Linux supplement must finish before the next native window'}
    if(Test-Path -LiteralPath (Join-Path $ordinaryRoot ('.tmp-d-bootstrap-linux-'+$entryLinux.receipt.id))){throw 'Entry Linux supplement owner still present'}
    if(@(Get-Process go -ErrorAction SilentlyContinue).Count){throw 'Another native Go process is active; ordinary validation not started'}
    if(([IO.DriveInfo]::new([IO.Path]::GetPathRoot($ordinaryRoot))).AvailableFreeSpace -lt 10GB){throw 'Insufficient free space for isolated complete ordinary validation'}
    $ordinaryResult.prerequisites=@($parity,$entryLinux)|ForEach-Object {[ordered]@{path=$_.path;sha256=$_.sha256}}
    if(-not $PreparedOwner){
        if(Test-Path -LiteralPath $ordinaryOwner){throw 'Ordinary native owner already exists'}
        [IO.Directory]::CreateDirectory($ordinaryOwner)|Out-Null
        [IO.File]::WriteAllText((Join-Path $ordinaryOwner 'owner.txt'),[IO.Path]::GetFileName($ordinaryOwner))
    }
    $ordinaryAdopted=$true
    $ordinaryResult.prepared_cache=$ordinaryPreparedCache
    & node $ordinarySnapshotter create $ordinaryOwner $ordinaryManifest
    if($LASTEXITCODE -ne 0){throw 'Ordinary source freeze failed'}
    $ordinaryResult.source_manifest=$ordinaryManifest
    $ordinaryResult.source_manifest_sha256=(Get-FileHash -LiteralPath $ordinaryManifest -Algorithm SHA256).Hash.ToLowerInvariant()
    $ordinaryResult.source_precheck=$true
    $ordinaryParent=Join-Path $ordinaryRoot 'docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.json'
    $ordinaryParentHash=(Get-FileHash -LiteralPath $ordinaryParent -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $ordinaryOwner 'ordinary-packages.json'),(ConvertTo-Json -InputObject @($Packages)))
    if(-not $VerifyInputsOnly){
        foreach($dir in @('cache','tmp','telemetry','binary')){[IO.Directory]::CreateDirectory((Join-Path $ordinaryOwner $dir))|Out-Null}
        $env:GOENV='off';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=1';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTELEMETRY='off'
        $env:GOCACHE=Join-Path $ordinaryOwner 'cache';$env:GOTMPDIR=Join-Path $ordinaryOwner 'tmp';$env:TEMP=$env:GOTMPDIR;$env:TMP=$env:GOTMPDIR;$env:TEST_TELEMETRY_DIR=Join-Path $ordinaryOwner 'telemetry'
        [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
        $ordinaryResult.Go_started=$true
        $telemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR|Out-String|ConvertFrom-Json)
        if($LASTEXITCODE -ne 0 -or $telemetry.GOTELEMETRY -cne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Ordinary telemetry isolation failed'}
        if(@(Get-Process go -ErrorAction SilentlyContinue).Count){throw 'Another Go process became active before the ordinary tests'}
        Push-Location (Join-Path $ordinaryOwner 'source/backend')
        try {
            foreach($platform in @('windows','linux')){
                $env:GOOS=$platform
                foreach($tags in @('ordinary','systembackup_mysql')){
                    $listArguments=@('list','-deps','-test','-json')
                    if($tags -ceq 'systembackup_mysql'){$listArguments+=@('-tags','systembackup_mysql')}
                    $listArguments+=@($Packages|ForEach-Object {'./'+$_})
                    $listLog=$ordinaryPrefix+'.'+$platform+'.'+$tags+'.jsonl'
                    $listErrors=$listLog+'.stderr.txt'
                    & go @listArguments 1> $listLog 2> $listErrors
                    $listExit=$LASTEXITCODE
                    $ordinaryResult.steps+=@([ordered]@{command=@('go')+$listArguments;platform=$platform;tags=$tags;exit_code=$listExit;log=$listLog;sha256=(Get-FileHash -LiteralPath $listLog -Algorithm SHA256).Hash.ToLowerInvariant();stderr=$listErrors;stderr_sha256=(Get-FileHash -LiteralPath $listErrors -Algorithm SHA256).Hash.ToLowerInvariant()})
                    if($listExit -ne 0){throw 'Actual complete ordinary go-list closure failed'}
                }
            }
            $scopeSummary=(& node $ordinaryScopeReader $ordinaryOwner|Out-String)
            if($LASTEXITCODE -ne 0){throw 'Actual ordinary dependency capture rejected'}
            $ordinaryResult.actual_go_scope=$ordinaryPrefix+'.scope.json'
            $ordinaryResult.actual_go_scope_sha256=(Get-FileHash -LiteralPath $ordinaryResult.actual_go_scope -Algorithm SHA256).Hash.ToLowerInvariant()
            & node $ordinarySnapshotter check $ordinaryOwner $ordinaryManifest
            if($LASTEXITCODE -ne 0){throw 'Frozen source changed during actual go-list capture'}
            $ordinaryResult.go_list_source_postcheck=$true
            $env:GOOS='windows'
            $ordinaryArguments=@('test','-json','-count=1','-timeout=2700s')+@($Packages|ForEach-Object {'./'+$_})
            $ordinaryLog=$ordinaryPrefix+'.full.jsonl'
            [IO.File]::WriteAllText($ordinaryLog,'')
            $ordinaryResult.tests_started=$true
            & go @ordinaryArguments 2>&1|Tee-Object -FilePath $ordinaryLog
            $ordinaryExit=$LASTEXITCODE
            $ordinaryResult.steps+=@([ordered]@{command=@('go')+$ordinaryArguments;platform='windows';exit_code=$ordinaryExit;log=$ordinaryLog;sha256=(Get-FileHash -LiteralPath $ordinaryLog -Algorithm SHA256).Hash.ToLowerInvariant()})
            if($ordinaryExit -ne 0){throw 'Complete ordinary package validation failed'}
            $inventory=(& node $ordinaryInventory $ordinaryOwner $ordinaryLog $ordinaryParent $ordinaryParentHash|Out-String)
            if($LASTEXITCODE -ne 0){throw 'Ordinary native package/test inventory rejected'}
            $ordinaryResult.native_inventory=$inventory|ConvertFrom-Json
            & node $ordinarySnapshotter check $ordinaryOwner $ordinaryManifest
            if($LASTEXITCODE -ne 0){throw 'Windows complete-package source postcheck failed'}
            Assert-OrdinaryHelpers
            $ordinaryResult.windows_source_postcheck=$true
            $checkpoint=$ordinaryPrefix+'.windows-postcheck.json'
            $checkpointValue=[ordered]@{kind='d2_current_ordinary_windows_checkpoint.v1';source_manifest=$ordinaryManifest;source_manifest_sha256=$ordinaryResult.source_manifest_sha256;source_precheck=$true;source_postcheck=$true;packages=$Packages;steps=$ordinaryResult.steps;actual_go_scope=$ordinaryResult.actual_go_scope;actual_go_scope_sha256=$ordinaryResult.actual_go_scope_sha256;native_inventory=$ordinaryResult.native_inventory;driver_sha256=$ordinaryDriverHash;snapshotter_sha256=$ordinarySnapshotterHash;inventory_sha256=$ordinaryInventoryHash;scope_reader_sha256=$ordinaryScopeReaderHash;go_list_parser_sha256=$ordinaryParserHash;native_event_reader_sha256=$ordinaryEventReaderHash;actual_mysql=$false;dependencies_installed=$false;source_scope_accepted=$false}
            [IO.File]::WriteAllText($checkpoint,($checkpointValue|ConvertTo-Json -Depth 12))
            $ordinaryResult.windows_checkpoint=[ordered]@{path=$checkpoint;sha256=(Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash.ToLowerInvariant()}
            # A2 validates OriginalMaterials on its real caller closure. These
            # are only the other three missing stable-source local roots.
            $seedArguments=@('test','-json','-tags','systembackup_mysql','-run','^TestDBootstrap(Consumer|ConsumerRanges|Entry)MySQLSeed$','-count=1','-timeout=2700s','./internal/systembackupevidence')
            $seedLog=$ordinaryPrefix+'.bootstrap-seeds.jsonl'
            [IO.File]::WriteAllText($seedLog,'')
            & go @seedArguments 2>&1|Tee-Object -FilePath $seedLog
            $seedExit=$LASTEXITCODE
            $ordinaryResult.steps+=@([ordered]@{command=@('go')+$seedArguments;platform='windows';exit_code=$seedExit;log=$seedLog;sha256=(Get-FileHash -LiteralPath $seedLog -Algorithm SHA256).Hash.ToLowerInvariant()})
            if($seedExit -ne 0){throw 'Remaining local bootstrap seed phase failed'}
            $seedInventory=(& node $ordinaryInventory --bootstrap-seeds $seedLog|Out-String)
            if($LASTEXITCODE -ne 0){throw 'Remaining local bootstrap seed inventory rejected'}
            $ordinaryResult.bootstrap_seed_inventory=$seedInventory|ConvertFrom-Json
            & node $ordinarySnapshotter check $ordinaryOwner $ordinaryManifest
            if($LASTEXITCODE -ne 0){throw 'Remaining bootstrap seed source postcheck failed'}
            Assert-OrdinaryHelpers
            $ordinaryResult.bootstrap_seed_source_postcheck=$true
            $seedCheckpoint=$ordinaryPrefix+'.bootstrap-seeds-postcheck.json'
            [IO.File]::WriteAllText($seedCheckpoint,([ordered]@{kind='d2_current_bootstrap_seed_checkpoint.v1';source_manifest=$ordinaryManifest;source_manifest_sha256=$ordinaryResult.source_manifest_sha256;source_postcheck=$true;step=$ordinaryResult.steps[-1];inventory=$ordinaryResult.bootstrap_seed_inventory;driver_sha256=$ordinaryDriverHash;inventory_sha256=$ordinaryInventoryHash;actual_mysql=$false;source_scope_accepted=$false}|ConvertTo-Json -Depth 10))
            $ordinaryResult.bootstrap_seed_checkpoint=[ordered]@{path=$seedCheckpoint;sha256=(Get-FileHash -LiteralPath $seedCheckpoint -Algorithm SHA256).Hash.ToLowerInvariant()}
            $env:GOOS='linux'
            $ordinaryResult.linux_binaries=@()
            foreach($program in @('server','system-backup-bootstrap')){
                $binary=Join-Path $ordinaryOwner ('binary/'+$program)
                $buildArguments=@('build','-buildvcs=false','-o',$binary,('./cmd/'+$program))
                $buildLog=$ordinaryPrefix+'.linux-'+$program+'.txt'
                [IO.File]::WriteAllText($buildLog,'')
                & go @buildArguments 2>&1|Tee-Object -FilePath $buildLog
                $buildExit=$LASTEXITCODE
                $ordinaryResult.steps+=@([ordered]@{command=@('go')+$buildArguments;platform='linux';exit_code=$buildExit;log=$buildLog;sha256=(Get-FileHash -LiteralPath $buildLog -Algorithm SHA256).Hash.ToLowerInvariant()})
                if($buildExit -ne 0){throw 'Current Linux program build failed'}
                $header=New-Object byte[] 64
                $stream=[IO.File]::OpenRead($binary)
                try{$headerRead=$stream.Read($header,0,64)}finally{$stream.Dispose()}
                if($headerRead -ne 64 -or [BitConverter]::ToString($header,0,7) -cne '7F-45-4C-46-02-01-01' -or [BitConverter]::ToUInt16($header,18) -ne 62){throw 'Current Linux program is not an amd64 ELF'}
                $binaryRecord=[ordered]@{program=$program;format='ELF';sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item -LiteralPath $binary).Length;executed=$false}
                Remove-Item -LiteralPath $binary -Force
                $binaryRecord.removed=-not(Test-Path -LiteralPath $binary)
                $ordinaryResult.linux_binaries+=@($binaryRecord)
            }
            if($ordinaryResult.steps.Count -ne 8 -or $ordinaryResult.linux_binaries.Count -ne 2){throw 'Missing actual scope/test/seed/Linux stages'}
        }finally{Pop-Location}
    }
    & node $ordinarySnapshotter check $ordinaryOwner $ordinaryManifest
    if($LASTEXITCODE -ne 0){throw 'Ordinary frozen source postcheck failed'}
    $ordinaryResult.frozen_source_unchanged=$true
    foreach($dependency in @($parity,$entryLinux)){if((Get-FileHash -LiteralPath $dependency.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $dependency.sha256){throw 'Prerequisite receipt changed'}}
    if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ordinaryDriverHash -or (Get-FileHash -LiteralPath $ordinarySnapshotter -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ordinarySnapshotterHash){throw 'Ordinary validation driver/helper changed'}
    if((Get-FileHash -LiteralPath $ordinaryInventory -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ordinaryInventoryHash -or (Get-FileHash -LiteralPath $ordinaryParent -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ordinaryParentHash){throw 'Ordinary inventory inputs changed'}
    if((Get-FileHash -LiteralPath $ordinaryScopeReader -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ordinaryScopeReaderHash -or (Get-FileHash -LiteralPath $ordinaryParser -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ordinaryParserHash){throw 'Actual Go dependency scope readers changed'}
    $ordinaryResult.status=if($VerifyInputsOnly){'verified_inputs_only'}else{'passed_selected_complete_ordinary_packages'}
}catch{$ordinaryResult.error=$_.Exception.Message}finally{
    # Preserve a real postcheck even on later native failure. It never changes
    # a failed run into success or manufactures a prior checkpoint.
    if((Test-Path -LiteralPath $ordinaryManifest) -and (Test-Path -LiteralPath (Join-Path $ordinaryOwner 'source'))){
        try {
            & node $ordinarySnapshotter check $ordinaryOwner $ordinaryManifest
            if($LASTEXITCODE -ne 0){throw 'Final frozen source check failed'}
            Assert-OrdinaryHelpers
            $ordinaryResult.frozen_source_unchanged=$true
        }catch{
            $ordinaryResult.frozen_source_unchanged=$false
            $ordinaryResult.postcheck_error=$_.Exception.Message
            $ordinaryResult.status='failed'
            if(-not $ordinaryResult.error){$ordinaryResult.error='Final ordinary source/helper postcheck failed'}
        }
    }
    foreach($name in $ordinaryVariables){[Environment]::SetEnvironmentVariable($name,$ordinarySaved[$name],'Process')}
    if($ordinaryAdopted -and (Test-Path -LiteralPath $ordinaryOwner)){
        $resolved=(Resolve-Path -LiteralPath $ordinaryOwner).Path
        if($resolved -cne $ordinaryOwner -or [IO.Path]::GetDirectoryName($resolved) -cne $ordinaryRoot -or [IO.Path]::GetFileName($resolved) -cne ('.tmp-d-index-cache-'+$ordinaryID) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne [IO.Path]::GetFileName($resolved)){throw 'Refusing ordinary cleanup outside exact owner'}
        foreach($entry in @((Get-Item -LiteralPath $resolved -Force))+@(Get-ChildItem -LiteralPath $resolved -Recurse -Force)){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing redirected ordinary cleanup'}}
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    $ordinaryResult.owner_removed=-not(Test-Path -LiteralPath $ordinaryOwner)
    $ordinaryResult.prepared_owner_retained_before_adoption=[bool]($PreparedOwner -and -not $ordinaryAdopted -and (Test-Path -LiteralPath $ordinaryOwner))
    $ordinaryResult.driver_sha256=$ordinaryDriverHash
    $ordinaryResult.snapshotter_sha256=$ordinarySnapshotterHash
    $ordinaryResult.inventory_sha256=$ordinaryInventoryHash
    $ordinaryResult.scope_reader_sha256=$ordinaryScopeReaderHash
    $ordinaryResult.go_list_parser_sha256=$ordinaryParserHash
    $ordinaryResult.native_event_reader_sha256=$ordinaryEventReaderHash
    $ordinaryResult.parity_composition_validator_sha256=$ordinaryParityValidatorHash
    $ordinaryReceiptPath=$ordinaryPrefix+'.json'
    if($PreparedOwner -and -not $ordinaryAdopted){$ordinaryReceiptPath=$ordinaryPrefix+'.prerequisite-rejected-'+[guid]::NewGuid().ToString('N')+'.json'}
    [IO.File]::WriteAllText($ordinaryReceiptPath,($ordinaryResult|ConvertTo-Json -Depth 12))
    Write-Output ('ORDINARY_RESULT='+$ordinaryReceiptPath)
}
if($ordinaryResult.error){throw $ordinaryResult.error}
