$ErrorActionPreference='Stop'
$producerOwnerWorkspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$producerOwnerRecord=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-producer-owner-run-owner-20261019-r33.json') | ConvertFrom-Json
$producerOwnerRuns=@('d-download-producer-owner-focused-20261019-r33','d-download-producer-owner-focused-20261019-r34','d-download-producer-owner-packages-20261019-r35','d-download-producer-owner-packages-20261019-r36','d-download-producer-owner-packages-20261019-r37')
$producerOwnerDirectories=[Collections.Generic.List[string]]::new()
foreach($producerOwnerRun in $producerOwnerRuns){
    $producerOwnerNative=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ($producerOwnerRun+'-native.txt'))
    if($producerOwnerNative -notmatch 'd_admission_native_exit=[01]' -or $producerOwnerNative -notmatch 'CLEANED snapshot=True'){throw 'Run is not terminal and cleaned'}
    $producerOwnerMatch=[regex]::Match($producerOwnerNative,'owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})')
    if(-not $producerOwnerMatch.Success){throw 'Missing exact snapshot identity'}
    $producerOwnerSnapshot=[IO.Path]::GetFullPath($producerOwnerMatch.Groups[1].Value)
    if([IO.Path]::GetDirectoryName($producerOwnerSnapshot) -ne $producerOwnerWorkspace -or [IO.Path]::GetFileName($producerOwnerSnapshot) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Snapshot escapes workspace'}
    if(Test-Path -LiteralPath $producerOwnerSnapshot){throw 'Native wrapper did not remove its snapshot'}
    $producerOwnerDirectories.Add($producerOwnerSnapshot)
}
$producerOwnerExpected=Join-Path $producerOwnerWorkspace '.tmp-d-admission-producer-owner-20261019-r33'
$producerOwnerResolved=(Resolve-Path -LiteralPath $producerOwnerRecord.path).Path
if($producerOwnerResolved -ne $producerOwnerExpected -or [IO.Path]::GetDirectoryName($producerOwnerResolved) -ne $producerOwnerWorkspace -or $producerOwnerRecord.marker -ne [IO.Path]::GetFileName($producerOwnerExpected)){throw 'Cache is not this exact owned directory'}
if(((Get-Item -Force -LiteralPath $producerOwnerResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $producerOwnerResolved 'owner.txt')) -ne $producerOwnerRecord.marker){throw 'Invalid cache marker or redirected directory'}
if(@(Get-ChildItem -Force -Recurse -LiteralPath $producerOwnerResolved -Attributes ReparsePoint).Count -ne 0){throw 'Owned cache contains redirected children'}
Remove-Item -LiteralPath $producerOwnerResolved -Recurse -Force
$producerOwnerDirectories.Add($producerOwnerResolved)
$producerOwnerAbsent=@($producerOwnerDirectories | ForEach-Object {[ordered]@{path=$_;exists=(Test-Path -LiteralPath $_)}})
if(@($producerOwnerAbsent | Where-Object {$_.exists}).Count -ne 0){throw 'Owned cleanup remains incomplete'}
$producerOwnerOutput=Join-Path $PSScriptRoot 'd-download-producer-owner-cleanup-20261019.json'
if(Test-Path -LiteralPath $producerOwnerOutput){throw 'Refusing to replace cleanup evidence'}
[IO.File]::WriteAllText($producerOwnerOutput,([ordered]@{kind='d_download_producer_owner_cleanup';cache_path=$producerOwnerResolved;runs=$producerOwnerRuns;directories=$producerOwnerAbsent;all_absent=$true;dependencies_installed=$false;all_own_sessions_terminal=$true}|ConvertTo-Json -Depth 6))
Write-Output ('CLEANED exact_owned_directories='+$producerOwnerAbsent.Count+' dependencies_installed=no')
