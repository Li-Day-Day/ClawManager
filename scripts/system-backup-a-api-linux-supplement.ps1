[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$NativeReceipt)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$compileRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compileID=[Guid]::NewGuid().ToString('N')
$compileOwner=Join-Path $compileRoot ('.tmp-a-api-linux-'+$compileID)
$compileSource=Join-Path $compileOwner 'source'
$compilePrefix=Join-Path $compileRoot ('docs/evidence/a-api-linux-native-'+$compileID)
$compileReport=[ordered]@{kind='a_api_linux_supplement.v1';id=$compileID;status='failed';dependencies_installed=$false;actual_sql=$false;production_authorized=$false;cleanup=$false;driver_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()}
$compileVars=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$compileSaved=@{};foreach($name in $compileVars){$compileSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
function Get-CompilePins([string]$base,[string[]]$paths){
    @($paths|ForEach-Object{$f=Get-Item -LiteralPath (Join-Path $base $_);if($f.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected source refused'};[ordered]@{path=$_;size=$f.Length;sha256=(Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
}
try{
    $receiptPath=(Resolve-Path -LiteralPath $NativeReceipt).Path
    if([IO.Path]::GetDirectoryName($receiptPath) -cne (Join-Path $compileRoot 'docs/evidence')){throw 'Native receipt outside evidence directory'}
    $prior=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
    if($prior.kind -ne 'a_api_readiness_native.v1' -or $prior.targeted_exit -ne 0 -or $prior.full_exit -ne 0 -or -not $prior.cleanup -or $prior.linux_systembackupsecurity_exit -ne 1 -or $prior.failure -ne 'Go phase failed: linux_systembackupsecurity'){throw 'Requires exact successful native tests and original failed Linux stage'}
    $priorLinux=$receiptPath -replace '\.json$','.linux_systembackupsecurity.jsonl'
    if((Get-Content -LiteralPath $priorLinux -Raw) -notmatch 'There is not enough space on the disk'){throw 'Not the original disk-space failure'}
    $compileReport.native_receipt=[ordered]@{path=[IO.Path]::GetRelativePath($compileRoot,$receiptPath).Replace('\','/');sha256=(Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash.ToLowerInvariant()}
    $paths=@($prior.files|ForEach-Object {$_.path})
    $pins=Get-CompilePins $compileRoot $paths
    $currentPaths=@(& rg --files --hidden backend contracts scripts|ForEach-Object {$_.Replace('\','/')}|Sort-Object -Unique)
    $newPaths=@($currentPaths|Where-Object {$_ -notin $paths})
    [IO.Directory]::CreateDirectory($compileSource)|Out-Null
    [IO.File]::WriteAllText((Join-Path $compileOwner 'owner.txt'),[IO.Path]::GetFileName($compileOwner))
    foreach($p in $paths){$dest=Join-Path $compileSource $p;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null;Copy-Item -LiteralPath (Join-Path $compileRoot $p) -Destination $dest}
    $snapshot=Get-CompilePins $compileSource $paths
    if(($pins|ConvertTo-Json -Depth 4 -Compress) -cne ($snapshot|ConvertTo-Json -Depth 4 -Compress)){throw 'Source copy drift'}
    $compileReport.files=$snapshot
    $compileReport.native_tests_reused_only_for_identical_bytes=$true
    $compileReport.cache_seed='none_linux_only_cold_cache'
    $compileReport.free_bytes_before=(Get-PSDrive -Name ([IO.Path]::GetPathRoot($compileRoot).Substring(0,1))).Free
    $env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS='1'
    $env:GOCACHE=Join-Path $compileOwner 'cache';$env:GOTMPDIR=Join-Path $compileOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $compileOwner 'telemetry';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
    [IO.Directory]::CreateDirectory($env:GOCACHE)|Out-Null;[IO.Directory]::CreateDirectory($env:GOTMPDIR)|Out-Null;[IO.Directory]::CreateDirectory($env:TEST_TELEMETRY_DIR)|Out-Null
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $telemetry=@(& go env -json GOTELEMETRY GOTELEMETRYDIR)|ConvertFrom-Json
    if($LASTEXITCODE -ne 0 -or $telemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -ne $env:TEST_TELEMETRY_DIR){throw 'Private telemetry unavailable'}
    # D may keep editing its server/API/smoke files. Resolve the ACTUAL test
    # dependency directories for these four packages before accepting reuse;
    # every file in those directories plus module/contracts/docs must match.
    Push-Location (Join-Path $compileRoot 'backend')
    try{
        $depDirs=@(& go list -deps -test -f '{{if not .Standard}}{{.Dir}}{{end}}' ./internal/systembackupsecurity ./internal/systembackupbootstrapmaterials ./internal/systembackupcatrust ./internal/systembackupnoncebootstrap)
        if($LASTEXITCODE -ne 0){throw 'Cannot resolve existing dependency scope'}
    }finally{Pop-Location}
    $compileReport.dependency_directories=@($depDirs|Where-Object {$_ -and $_.StartsWith((Join-Path $compileRoot 'backend')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)}|ForEach-Object {[IO.Path]::GetRelativePath($compileRoot,$_).Replace('\','/')}|Sort-Object -Unique)
    if($compileReport.dependency_directories.Count -lt 4){throw 'Incomplete Go dependency scope'}
    $protected=@($paths|Where-Object {
        $inputPath=$_
        $inputPath -in @('backend/go.mod','backend/go.sum') -or $inputPath.StartsWith('contracts/') -or $inputPath.StartsWith('docs/') -or @($compileReport.dependency_directories|Where-Object {$inputPath.StartsWith($_+'/')}).Count -gt 0
    })
    $protectedBefore=Get-CompilePins $compileRoot $protected
    $priorProtected=@($prior.files|Where-Object {$_.path -in $protected})
    if(($protectedBefore|ConvertTo-Json -Depth 4 -Compress) -cne ($priorProtected|ConvertTo-Json -Depth 4 -Compress)){throw 'Tested package/dependency bytes changed; cannot reuse tests'}
    if(($protectedBefore|ConvertTo-Json -Depth 4 -Compress) -cne (@($snapshot|Where-Object {$_.path -in $protected})|ConvertTo-Json -Depth 4 -Compress)){throw 'Copied dependency bytes changed; cannot reuse tests'}
    foreach($newPath in $newPaths){if(@($compileReport.dependency_directories|Where-Object {$newPath.StartsWith($_+'/')}).Count -gt 0 -or $newPath.StartsWith('contracts/')){throw 'New untested dependency input'}}
    $compileReport.tested_dependency_files=$protectedBefore
    $priorByPath=@{};foreach($p in $prior.files){$priorByPath[$p.path]=$p.sha256}
    $compileReport.uncovered_changed_paths=@($pins|Where-Object {$_.sha256 -cne $priorByPath[$_.path]}|ForEach-Object {$_.path})
    $compileReport.uncovered_added_paths=$newPaths
    $compileReport.native_tests_reused_only_for_identical_bytes=$true
    $compileReport.linux_binaries=@()
    # The original native go test phases already ran vet. This supplement only
    # compiles Linux ELF tests; avoid repeating host vet processes here.
    $compileReport.linux_compile_vet=$false
    Push-Location (Join-Path $compileSource 'backend')
    try{
        foreach($pkg in @('systembackupsecurity','systembackupbootstrapmaterials','systembackupcatrust','systembackupnoncebootstrap')){
            $binary=Join-Path $compileOwner ($pkg+'.test')
            & go test -vet=off -c -o $binary ('./internal/'+$pkg) 2>&1|Tee-Object -FilePath ($compilePrefix+'.'+$pkg+'.txt')|Out-Null
            $compileReport[$pkg+'_exit']=$LASTEXITCODE
            if($LASTEXITCODE -ne 0){throw ('Linux compilation failed: '+$pkg)}
            $stream=[IO.File]::OpenRead($binary);try{$magic=New-Object byte[] 4;$null=$stream.Read($magic,0,4)}finally{$stream.Dispose()}
            if([Convert]::ToHexString($magic) -ne '7F454C46'){throw 'Expected Linux ELF executable'}
            $compileReport.linux_binaries+=@{package=$pkg;size=(Get-Item -LiteralPath $binary).Length;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();format='ELF'}
            Write-Output ('LINUX_COMPILED='+$pkg)
        }
    }finally{Pop-Location}
    $after=Get-CompilePins $compileRoot $paths
    $compileReport.source_unchanged=(($protectedBefore|ConvertTo-Json -Depth 4 -Compress) -ceq (@($after|Where-Object {$_.path -in $protected})|ConvertTo-Json -Depth 4 -Compress))
    $compileReport.source_paths_unchanged=(@(Compare-Object $currentPaths @(& rg --files --hidden backend contracts scripts|ForEach-Object {$_.Replace('\','/')}|Sort-Object -Unique)).Count -eq 0)
    $compileReport.status='passed_for_exact_native_test_bytes'
}catch{$compileReport.failure=$_.Exception.Message}
finally{
    foreach($name in $compileVars){[Environment]::SetEnvironmentVariable($name,$compileSaved[$name],'Process')}
    $absolute=[IO.Path]::GetFullPath($compileOwner)
    if([IO.Path]::GetDirectoryName($absolute) -cne $compileRoot -or [IO.Path]::GetFileName($absolute) -cne ('.tmp-a-api-linux-'+$compileID)){throw 'Cleanup boundary mismatch'}
    if(Test-Path -LiteralPath $absolute){if((Get-Item -LiteralPath $absolute).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owner refused'};if([IO.File]::ReadAllText((Join-Path $absolute 'owner.txt')) -cne [IO.Path]::GetFileName($absolute)){throw 'Owner marker mismatch'};Remove-Item -LiteralPath $absolute -Recurse -Force}
    $compileReport.cleanup=(-not(Test-Path -LiteralPath $absolute))
    $compileReport|ConvertTo-Json -Depth 12|Set-Content -LiteralPath ($compilePrefix+'.json') -Encoding utf8
    Write-Output ($compilePrefix+'.json')
}
if($compileReport.status -ne 'passed_for_exact_native_test_bytes' -or -not $compileReport.cleanup){exit 1}
