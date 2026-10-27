$ErrorActionPreference='Stop'
$roleRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$roleCacheRoot=[IO.Path]::GetFullPath((Join-Path $roleRoot '.tmp-d-admission-a-role-drift-20261021-r1'))
$roleCache=Join-Path $roleCacheRoot 'cache'
$roleOwner='a-role-drift-20261021-r1'
$roleSourceCacheRoot=[IO.Path]::GetFullPath((Join-Path $roleRoot '.tmp-d-admission-a-owner-inplace-20261021-r2'))
$roleSourceCache=Join-Path $roleSourceCacheRoot 'cache'
if([IO.Path]::GetDirectoryName($roleCacheRoot) -ne $roleRoot -or (Test-Path -LiteralPath $roleCacheRoot)){throw 'Refusing non-new role cache'}
if([IO.Path]::GetDirectoryName($roleSourceCacheRoot) -ne $roleRoot -or
   ((Get-Item -LiteralPath $roleSourceCacheRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
   [IO.File]::ReadAllText((Join-Path $roleSourceCacheRoot 'owner.txt')) -cne 'a-owner-inplace-20261021-r2'){throw 'Compile cache is not from our exact active owner validation'}
[IO.Directory]::CreateDirectory($roleCache)|Out-Null
[IO.File]::WriteAllText((Join-Path $roleCacheRoot 'owner.txt'),$roleOwner)
$roleExit=1;$roleRuns=@();$roleDigest=$null;$roleCopied=0;$roleCopiedBytes=0
try {
    # Copy only completed content-addressed Go compile entries to this new
    # cache. Readers allow deletion by the source owner's independent cleanup.
    # Tests still execute with -count=1; no test result is reused.
    foreach($roleDir in @(Get-ChildItem -LiteralPath $roleSourceCache -Directory)){
        if($roleDir.Name -notmatch '^[a-f0-9]{2}$' -or ($roleDir.Attributes -band [IO.FileAttributes]::ReparsePoint)){continue}
        $roleTargetDir=Join-Path $roleCache $roleDir.Name
        [IO.Directory]::CreateDirectory($roleTargetDir)|Out-Null
        foreach($roleEntry in @(Get-ChildItem -LiteralPath $roleDir.FullName -File)){
            if($roleEntry.Name -notmatch '^[a-f0-9]{64}-[ad]$' -or ($roleEntry.Attributes -band [IO.FileAttributes]::ReparsePoint)){continue}
            $roleStream=$null;$roleMemory=[IO.MemoryStream]::new()
            try {
                $roleStream=[IO.File]::Open($roleEntry.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
                $roleStream.CopyTo($roleMemory)
                [IO.File]::WriteAllBytes((Join-Path $roleTargetDir $roleEntry.Name),$roleMemory.ToArray())
                $roleCopied++;$roleCopiedBytes+=$roleMemory.Length
            } catch [IO.FileNotFoundException] {
                # Concurrent immutable-cache housekeeping; rebuild this entry.
            } finally {if($null -ne $roleStream){$roleStream.Dispose()};$roleMemory.Dispose()}
        }
    }
    Write-Output ('ROLE_COMPILE_CACHE copied_entries='+$roleCopied+' bytes='+$roleCopiedBytes+' tests_reused=no source_cleanup_not_blocked=yes')
    foreach($roleAttempt in @(1,2)){
        $rolePrefix='a-download-gc-role-drift-fixture-20261021-r'+$roleAttempt
        Write-Output ('ROLE_DRIFT_PREPARATION attempt='+$roleAttempt+' offline=yes actual_mysql=no')
        $rolePreference=$ErrorActionPreference
        try {
            $ErrorActionPreference='Continue'
            & (Get-Command powershell).Source -NoProfile -File (Join-Path $PSScriptRoot 'a-download-gc-role-drift-native-20261021.ps1') `
                -EvidencePrefix $rolePrefix -ExistingOwnedCache $roleCache -IncludeDownloadProbe -TaggedOwnerSeedsOnly `
                -TestRunPattern '^Test(ADownloadGCRoleMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$' -BuildParallelism 1
            $roleNativeExit=$LASTEXITCODE
        } finally {$ErrorActionPreference=$rolePreference}
        $roleStem=Join-Path $roleRoot ('docs/evidence/'+$rolePrefix)
        $roleManifest=Get-Content -Raw -LiteralPath ($roleStem+'-source.json')|ConvertFrom-Json
        if($null -eq $roleDigest){$roleDigest=$roleManifest.source_sha256}
        if($roleDigest -cne $roleManifest.source_sha256){throw 'Role retry frozen input changed'}
        $roleRuns+=@([ordered]@{prefix=$rolePrefix;exit=$roleNativeExit;source_sha256=$roleManifest.source_sha256})
        if($roleNativeExit -eq 0){$roleExit=0;break}
        $roleNative=[IO.File]::ReadAllText($roleStem+'-native.txt');$roleKnown=$false
        if(Test-Path -LiteralPath ($roleStem+'-linux-probe-stderr.txt')){$roleKnown=[IO.File]::ReadAllText($roleStem+'-linux-probe-stderr.txt').Trim() -match '^[A-Za-z0-9_./-]+: [^\r\n]+\\(?:compile|asm)\.exe: exit status 0xc0000043$'}
        foreach($roleMarker in @('NATIVE_EXIT focused_packages=0','FROZEN_UNIT_POSTCHECK pass=yes','NATIVE_PROBE stage=tagged-seed exit=0','NATIVE_PROBE stage=windows-probe exit=0','NATIVE_PROBE stage=detached-seed exit=0','NATIVE_PROBE stage=linux-probe exit=1','CLEANED snapshot=True','d_admission_native_exit=1')){if(-not $roleNative.Contains($roleMarker)){$roleKnown=$false}}
        $roleEvents=@(Get-Content -LiteralPath ($roleStem+'.jsonl')|ForEach-Object {$_|ConvertFrom-Json})
        if(@($roleEvents|Where-Object {$_.Action -in @('fail','skip','build-fail')}).Count -ne 0){$roleKnown=$false}
        if(-not $roleKnown -or $roleAttempt -eq 2){throw 'Role preparation failed; no business or unbounded retry'}
    }
} finally {
    $roleResolved=(Resolve-Path -LiteralPath $roleCacheRoot).Path
    if([IO.Path]::GetDirectoryName($roleResolved) -ne $roleRoot -or $roleResolved -cne $roleCacheRoot -or
       ((Get-Item -LiteralPath $roleResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
       [IO.File]::ReadAllText((Join-Path $roleResolved 'owner.txt')) -cne $roleOwner){throw 'Role cache identity changed; refusing cleanup'}
    Remove-Item -LiteralPath $roleResolved -Recurse -Force
    $roleCleanup=[ordered]@{kind='a_role_metadata_drift_validation_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');path=$roleResolved;exists=(Test-Path -LiteralPath $roleResolved);wrapper_exit=$roleExit;runs=$roleRuns;copied_compile_cache_from=$roleSourceCacheRoot;copied_entries=$roleCopied;copied_bytes=$roleCopiedBytes;test_results_reused=$false;dependencies_installed=$false;remote_executed=$false}
    $roleCleanupPath=Join-Path $PSScriptRoot 'a-download-gc-role-drift-fixture-cleanup-20261021.json'
    if(Test-Path -LiteralPath $roleCleanupPath){throw 'Refusing cleanup overwrite'}
    [IO.File]::WriteAllText($roleCleanupPath,($roleCleanup|ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
    Write-Output ('ROLE_CACHE_CLEANED absent='+(-not $roleCleanup.exists)+' wrapper_exit='+$roleExit)
}
exit $roleExit
