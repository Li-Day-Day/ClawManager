[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SourceRoot,
    [Parameter(Mandatory=$true)][string]$SourceManifestPath,
    [Parameter(Mandatory=$true)][string]$BinaryPath,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$BinarySHA256,
    [Parameter(Mandatory=$true)][string]$OutputPrefix,
    [switch]$Run
)
$ErrorActionPreference='Stop'
$gcRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
function Full-GCPath([string]$p){$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($p)}
$SourceRoot=Full-GCPath $SourceRoot;$SourceManifestPath=Full-GCPath $SourceManifestPath;$BinaryPath=Full-GCPath $BinaryPath;$OutputPrefix=Full-GCPath $OutputPrefix
if([IO.Path]::GetDirectoryName($OutputPrefix) -cne (Join-Path $gcRoot 'docs/evidence')){throw 'Receipt/logs must be directly in docs/evidence'}
if([IO.Path]::GetDirectoryName($SourceManifestPath) -cne (Join-Path $gcRoot 'docs/evidence')){throw 'Source manifest must be directly in docs/evidence'}
$gcSourceOwner=[IO.Path]::GetDirectoryName($SourceRoot)
if([IO.Path]::GetFileName($SourceRoot) -cne 'source' -or [IO.Path]::GetDirectoryName($gcSourceOwner) -cne $gcRoot -or [IO.Path]::GetFileName($gcSourceOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or [IO.File]::ReadAllText((Join-Path $gcSourceOwner 'owner.txt')) -cne [IO.Path]::GetFileName($gcSourceOwner)){throw 'Expected exact human wrapper source owner'}
foreach($p in @($SourceRoot,$gcSourceOwner,$BinaryPath,$SourceManifestPath)){if((Get-Item -Force -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected input rejected'}}
if(-not $BinaryPath.StartsWith($SourceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Binary must belong to that frozen wrapper source'}
if((Get-FileHash -LiteralPath $BinaryPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $BinarySHA256){throw 'Binary SHA mismatch'}
$gcHeader=[IO.File]::OpenRead($BinaryPath)
try{$gcPE=New-Object byte[] 64;if($gcHeader.Read($gcPE,0,64) -ne 64 -or $gcPE[0] -ne 77 -or $gcPE[1] -ne 90 -or $gcHeader.Length -lt 1048576){throw 'Expected actual Windows test executable'};$gcHeader.Position=[BitConverter]::ToInt32($gcPE,60);$gcSignature=New-Object byte[] 6;if($gcHeader.Read($gcSignature,0,6) -ne 6 -or [BitConverter]::ToUInt32($gcSignature,0) -ne 17744 -or [BitConverter]::ToUInt16($gcSignature,4) -ne 34404){throw 'Expected x64 PE executable'}}finally{$gcHeader.Dispose()}
$gcCandidatePath=Join-Path $PSScriptRoot 'd-gc-full-lifecycle-source-candidate-20261027-r5.json'
if((Get-FileHash -LiteralPath $gcCandidatePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'ab3dc8bb9460a92f85711a3a3d228c73aada7bd951b7bb9dda7039c33fc7c4b1'){throw 'Current r5 candidate hash mismatch'}
$gcCandidate=Get-Content -Raw -LiteralPath $gcCandidatePath|ConvertFrom-Json
$gcManifest=Get-Content -Raw -LiteralPath $SourceManifestPath|ConvertFrom-Json
$gcPins=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
foreach($p in $gcManifest.files){if($gcPins.ContainsKey($p.path)){throw 'Duplicate source path'};$gcPins.Add($p.path,$p)}
if($gcPins.Count -ne $gcCandidate.original_files.Count){throw 'Compiler source inventory count differs from r5'}
foreach($p in $gcCandidate.original_files){if(-not $gcPins.ContainsKey($p.path) -or $gcPins[$p.path].size -ne $p.size -or $gcPins[$p.path].sha256 -cne $p.sha256){throw ('Compiler source tuple differs from r5: '+$p.path)}}
function Assert-GCSource {
    foreach($p in $gcCandidate.original_files){$f=[IO.Path]::GetFullPath((Join-Path $SourceRoot $p.path));if(-not $f.StartsWith($SourceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or ((Get-Item -Force -LiteralPath $f).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid frozen source path'};if((Get-Item -LiteralPath $f).Length -ne $p.size -or (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant() -cne $p.sha256){throw ('Frozen source drift: '+$p.path)}}
}
Assert-GCSource
if(-not $Run){Write-Output 'GC_BINARY_CHECK_INPUTS_ONLY Go=False binary_tests=False SQL=False SSH=False';return}
foreach($suffix in @('.json','.source.log','.empty.log')){if(Test-Path -LiteralPath ($OutputPrefix+$suffix)){throw 'Choose an unused OutputPrefix'}}
$gcOwner=Join-Path $gcRoot ('.tmp-d-gc-binary-check-'+[guid]::NewGuid().ToString('N'))
$gcOldEnv=@{};foreach($n in @('TEMP','TMP','GOTMPDIR')){$gcOldEnv[$n]=[Environment]::GetEnvironmentVariable($n,'Process')}
$gcRuns=@();$gcFailure=$null;$gcPostcheck=$false;$gcCleaned=$false;$gcNativeStarted=$false
try{
    [IO.Directory]::CreateDirectory($gcOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $gcOwner 'owner.txt'),[IO.Path]::GetFileName($gcOwner))
    $gcCopy=Join-Path $gcOwner 'evidence.exe';[IO.File]::Copy($BinaryPath,$gcCopy,$false)
    if((Get-FileHash -LiteralPath $gcCopy -Algorithm SHA256).Hash.ToLowerInvariant() -cne $BinarySHA256){throw 'Copied binary changed'}
    $gcTmp=Join-Path $gcOwner 'tmp';$gcEmpty=Join-Path $gcOwner 'empty/a/b'
    [IO.Directory]::CreateDirectory($gcTmp)|Out-Null;[IO.Directory]::CreateDirectory($gcEmpty)|Out-Null
    foreach($n in @('TEMP','TMP','GOTMPDIR')){[Environment]::SetEnvironmentVariable($n,$gcTmp,'Process')}
    $gcExpected=@('TestDDownloadGCFullCollectMySQLSeed','TestDDownloadGCFullLifecycleMySQLSeed','TestDDownloadGCFullProfileMySQLSeed')
    foreach($context in @('source','empty')){
        $cwd=if($context -ceq 'source'){Join-Path $SourceRoot 'backend/internal/systembackupevidence'}else{$gcEmpty}
        if($context -ceq 'empty' -and (@(Get-ChildItem -LiteralPath $cwd -Force).Count -ne 0 -or (Test-Path -LiteralPath (Join-Path $gcOwner 'docs')))){throw 'Empty cwd or its docs resolution is contaminated'}
        $arguments=@('-test.run','^TestDDownloadGCFull(Collect|Profile|Lifecycle)MySQLSeed$','-test.v','-test.count=1','-test.timeout=2700s')
        Push-Location $cwd
        $gcPriorErrors=$ErrorActionPreference
        try{$ErrorActionPreference='Continue';$gcNativeStarted=$true;$captured=@(& $gcCopy @arguments 2>&1);$nativeExit=$LASTEXITCODE}finally{$ErrorActionPreference=$gcPriorErrors;Pop-Location}
        $log=$OutputPrefix+'.'+$context+'.log';[IO.File]::WriteAllLines($log,[string[]]$captured,[Text.UTF8Encoding]::new($false))
        $body=$captured -join "`n"
        $ran=@([regex]::Matches($body,'(?m)^=== RUN\s+(\S+)\r?$')|ForEach-Object {$_.Groups[1].Value})
        $passed=@([regex]::Matches($body,'(?m)^--- PASS: (\S+) \([0-9.]+s\)\r?$')|ForEach-Object {$_.Groups[1].Value})
        $valid=($nativeExit -eq 0 -and ($ran -join '|') -ceq ($gcExpected -join '|') -and ($passed -join '|') -ceq ($gcExpected -join '|') -and [regex]::Matches($body,'(?m)^PASS\r?$').Count -eq 1 -and $body -notmatch '(?m)--- (FAIL|SKIP):|^FAIL\r?$|panic:|fatal error:')
        $gcRuns+=@([ordered]@{context=$context;working_directory=$cwd;arguments=$arguments;exit=$nativeExit;log=$log;log_sha256=(Get-FileHash -LiteralPath $log -Algorithm SHA256).Hash.ToLowerInvariant();ran=$ran;passed=$passed;exact_three_no_fail_skip=$valid;empty_initially_verified=($context -ceq 'empty')})
        if(-not $valid){throw ('GC3 native event validation failed in '+$context)}
        if($context -ceq 'empty' -and (@(Get-ChildItem -LiteralPath $cwd -Force).Count -ne 0 -or (Test-Path -LiteralPath (Join-Path $gcOwner 'docs')))){throw 'Tests populated the empty cwd/docs'}
        if((Get-FileHash -LiteralPath $gcCopy -Algorithm SHA256).Hash.ToLowerInvariant() -cne $BinarySHA256){throw 'Test executable changed'}
        Assert-GCSource
    }
    $gcPostcheck=$true
}catch{$gcFailure=$_.Exception.Message}finally{
    foreach($n in $gcOldEnv.Keys){[Environment]::SetEnvironmentVariable($n,$gcOldEnv[$n],'Process')}
    if(Test-Path -LiteralPath $gcOwner){$resolved=(Resolve-Path -LiteralPath $gcOwner).Path;if([IO.Path]::GetDirectoryName($resolved) -cne $gcRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^\.tmp-d-gc-binary-check-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne [IO.Path]::GetFileName($resolved)){throw 'Refusing cleanup outside exact owned binary test directory'};Remove-Item -LiteralPath $resolved -Recurse -Force}
    $gcCleaned=-not(Test-Path -LiteralPath $gcOwner)
    $result=[ordered]@{kind='d_gc_three_seed_same_binary_two_cwd_native.v1';source_manifest=$SourceManifestPath;source_manifest_sha256=(Get-FileHash -LiteralPath $SourceManifestPath -Algorithm SHA256).Hash.ToLowerInvariant();source_candidate=$gcCandidatePath;source_candidate_sha256=(Get-FileHash -LiteralPath $gcCandidatePath -Algorithm SHA256).Hash.ToLowerInvariant();source_sha256=$gcCandidate.original_source_sha256;binary_original=$BinaryPath;binary_sha256=$BinarySHA256;runs=$gcRuns;source_postcheck=$gcPostcheck;owned_directory=$gcOwner;cleaned=$gcCleaned;error=$gcFailure;Go_compilation_started=$false;native_test_executable_run=$gcNativeStarted;actual_SQL=$false;SSH=$false;missing_docs_fabricated=$false;production_approved=$false}
    $encoded=[Text.UTF8Encoding]::new($false).GetBytes(($result|ConvertTo-Json -Depth 10)+[Environment]::NewLine);$stream=[IO.File]::Open(($OutputPrefix+'.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{$stream.Write($encoded,0,$encoded.Length)}finally{$stream.Dispose()}
}
if($gcFailure){throw $gcFailure}
Write-Output 'PASS GC3_SAME_BINARY source=3 empty_cwd=3 docs_copied=no new_Go_compile=no SQL=no SSH=no owned_cleanup=yes'
