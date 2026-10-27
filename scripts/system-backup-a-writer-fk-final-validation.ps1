[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PriorPreparation)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$fkRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fkToken=[guid]::NewGuid().ToString('N')
$fkOwner=Join-Path $fkRoot ('.tmp-d-index-cache-'+$fkToken)
$fkPrefix=Join-Path $fkRoot ('docs/evidence/a-writer-fk-final-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$fkToken.Substring(0,8))
$fkSaved=@{};$fkVars=@('GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR')
foreach($name in $fkVars){$fkSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$fkError=$null;$fkSteps=@();$fkStable=$false
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
try {
    $fkPriorFile=[IO.Path]::GetFullPath($PriorPreparation)
    if([IO.Path]::GetDirectoryName($fkPriorFile) -cne (Join-Path $fkRoot 'docs/evidence') -or [IO.Path]::GetFileName($fkPriorFile) -notmatch '^d-resources-mysql-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.json$'){throw 'Explicit local preparation receipt in workspace required'}
    $fkPrior=Get-Content -LiteralPath $fkPriorFile -Raw|ConvertFrom-Json
    if($fkPrior.kind -ne 'd_resources_mysql_preparation.v1' -or $fkPrior.error -or $fkPrior.remote_requested -or -not $fkPrior.owner_removed -or (Test-Path -LiteralPath $fkPrior.owner) -or $fkPrior.steps.Count -ne 4 -or @($fkPrior.steps|Where-Object {$_.exit_code -ne 0}).Count){throw 'Prior complete local preparation not successful or cleaned'}
    $fkPrevious=Get-Content -LiteralPath $fkPrior.source -Raw|ConvertFrom-Json
    if((Get-DIndexPinDigest -Pins $fkPrevious.files) -cne $fkPrevious.source_sha256){throw 'Prior source manifest digest differs'}
    if(Test-Path -LiteralPath $fkOwner){throw 'Final FK owner exists'}
    [IO.Directory]::CreateDirectory($fkOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $fkOwner 'owner.txt'),[IO.Path]::GetFileName($fkOwner))
    $fkSnapshot=New-AConfigProofSourceSnapshot -Root $fkRoot -Owner $fkOwner
    [IO.File]::WriteAllText(($fkPrefix+'-source.json'),($fkSnapshot|ConvertTo-Json -Depth 8))
    $fkOrdinary={param($pins) @($pins|Where-Object {$_.path -match '^(backend|contracts)/' -and $_.path -notmatch '_mysql_test\.go$'}|ForEach-Object {$_.path+"`0"+$_.size+"`0"+$_.sha256}|Sort-Object -CaseSensitive) -join "`n"}
    if((& $fkOrdinary $fkPrevious.files) -cne (& $fkOrdinary $fkSnapshot.files)){throw 'Ordinary code changed; new complete resources validation required'}
    foreach($step in $fkPrior.steps){if((Get-FileHash -LiteralPath $step.log -Algorithm SHA256).Hash.ToLowerInvariant() -cne $step.log_sha256){throw 'Prior native log changed'}}
    $fkOldEvents=@(Get-Content -LiteralPath $fkPrior.steps[0].log|ForEach-Object {$_|ConvertFrom-Json})
    if(@($fkOldEvents|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -or @($fkOldEvents|Where-Object {$_.Action -eq 'pass' -and -not $_.Test}).Count -ne 1){throw 'Prior complete ordinary package not passed'}
    foreach($dir in @('cache','tmp','telemetry')){[IO.Directory]::CreateDirectory((Join-Path $fkOwner $dir))|Out-Null}
    $env:GO111MODULE='on';$env:GOWORK='off';$env:GOFLAGS='-mod=readonly -p=2';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOTOOLCHAIN='local';$env:GOPROXY='off';$env:GOSUMDB='off'
    $env:GOCACHE=Join-Path $fkOwner 'cache';$env:GOTMPDIR=Join-Path $fkOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $fkOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    Push-Location (Join-Path $fkOwner 'source/backend')
    try {
        $fkLog=$fkPrefix+'-seed.jsonl'
        & go test -tags systembackup_mysql -run '^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$' -count=1 -json ./internal/systembackupresources 2>&1|Tee-Object -FilePath $fkLog
        $fkCode=$LASTEXITCODE;$fkSteps+=@{stage='latest_tagged_seeds_default_vet';exit=$fkCode;log=$fkLog;sha256=(Get-FileHash -LiteralPath $fkLog -Algorithm SHA256).Hash.ToLowerInvariant()}
        if($fkCode -ne 0){throw 'Latest FK seed compile/test failed'}
        $fkNames=@(Get-Content -LiteralPath $fkLog|ForEach-Object {$_|ConvertFrom-Json}|Where-Object {$_.Action -eq 'pass' -and $_.Test}|ForEach-Object {$_.Test}|Sort-Object -CaseSensitive)
        if(($fkNames -join ',') -cne 'TestAResourcesWriteFKMySQLSeed,TestDResourcesReadbackMySQLSeed,TestDResourcesWriteMySQLSeed'){throw 'Latest exact seed coverage differs'}
        $env:GOOS='linux';$fkBinary=Join-Path $fkOwner 'resources.test'
        & go test -c -tags systembackup_mysql -o $fkBinary ./internal/systembackupresources
        $fkCode=$LASTEXITCODE;$fkSteps+=@{stage='latest_linux_tagged_probe';exit=$fkCode}
        if($fkCode -ne 0){throw 'Latest Linux FK probe compile failed'}
        $fkBinaryHash=(Get-FileHash -LiteralPath $fkBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    } finally {Pop-Location}
    Test-DIndexSourceSnapshot -Root (Join-Path $fkOwner 'source') -Manifest $fkSnapshot
    Test-DIndexSourceSnapshot -Root $fkRoot -Manifest $fkSnapshot
    $fkStable=$true
} catch {$fkError=$_.Exception.Message} finally {
    foreach($name in $fkVars){[Environment]::SetEnvironmentVariable($name,$fkSaved[$name],'Process')}
    if(Test-Path -LiteralPath $fkOwner){
        $fkResolved=(Resolve-Path -LiteralPath $fkOwner).Path
        if([IO.Path]::GetDirectoryName($fkResolved) -cne $fkRoot -or [IO.Path]::GetFileName($fkResolved) -cne ('.tmp-d-index-cache-'+$fkToken) -or ((Get-Item -Force -LiteralPath $fkResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $fkResolved 'owner.txt')) -cne [IO.Path]::GetFileName($fkResolved)){throw 'Refusing final FK cleanup outside exact owner'}
        Remove-Item -LiteralPath $fkResolved -Recurse -Force
    }
    $fkRecord=[ordered]@{kind='a_resources_latest_tagged_preparation.v1';error=$fkError;prior_complete_preparation=$fkPriorFile;prior_receipt_sha256=$(if($fkPriorFile){(Get-FileHash -LiteralPath $fkPriorFile -Algorithm SHA256).Hash.ToLowerInvariant()});ordinary_inputs_unchanged=$fkStable;latest_tagged_source_postchecked=$fkStable;source=($fkPrefix+'-source.json');steps=$fkSteps;binary_sha256=$fkBinaryHash;owner=$fkOwner;owner_removed=(-not(Test-Path -LiteralPath $fkOwner));default_vet=$true;dependencies_installed=$false;actual_mysql=$false;production_approved=$false}
    [IO.File]::WriteAllText(($fkPrefix+'.json'),($fkRecord|ConvertTo-Json -Depth 8))
    Write-Output ('A_WRITER_FK_FINAL_RESULT='+$fkPrefix+'.json')
}
if($fkError){throw $fkError}
