$ErrorActionPreference='Stop'
$refreshRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$refreshOwner=Join-Path $refreshRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$refreshManifestPath=Join-Path $PSScriptRoot 'd-download-producer-owner-source-refresh-20261019-r38.json'
$refreshLogPath=Join-Path $PSScriptRoot 'd-download-producer-owner-source-refresh-20261019-r38.txt'
if((Test-Path -LiteralPath $refreshManifestPath) -or (Test-Path -LiteralPath $refreshLogPath)){throw 'Refusing to replace refresh evidence'}
Start-Transcript -LiteralPath $refreshLogPath -NoClobber | Out-Null
try {
    [IO.Directory]::CreateDirectory($refreshOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $refreshOwner 'owner.txt'),[IO.Path]::GetFileName($refreshOwner))
    . (Join-Path $refreshRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
    . (Join-Path $refreshRoot 'scripts/system-backup-a-config-proof-source.ps1')
    $refreshSnapshot=New-AConfigProofSourceSnapshot -Root $refreshRoot -Owner $refreshOwner -MaxAttempts 3
    $refreshFrozen=Join-Path $refreshOwner 'source'
    $refreshOriginal=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-producer-owner-packages-20261019-r37-source.json')|ConvertFrom-Json
    $refreshOld=@{};foreach($pin in $refreshOriginal.files){$refreshOld[$pin.path]=$pin}
    $refreshChanges=@(foreach($pin in $refreshSnapshot.files){if(-not $refreshOld.ContainsKey($pin.path) -or $refreshOld[$pin.path].sha256 -ne $pin.sha256){$pin.path}})
    $refreshAllowed=@('scripts/system-backup-a-manifest-path.test.ps1','scripts/system-backup-d-config-writer-validation.ps1')
    if(@(Compare-Object $refreshChanges $refreshAllowed -CaseSensitive).Count -ne 0){throw 'Refresh contains changes beyond the two inspected unexecuted PowerShell scripts'}
    foreach($pin in $refreshOriginal.files){if(@($refreshSnapshot.files|Where-Object {$_.path -ceq $pin.path}).Count -ne 1){throw 'Previously tested source is missing'}}
    $refreshTests=@()
    foreach($refreshShell in @('powershell','pwsh')){
        $refreshExecutable=(Get-Command $refreshShell).Source
        $refreshOutput=@(& $refreshExecutable -NoProfile -ExecutionPolicy Bypass -File (Join-Path $refreshFrozen 'scripts/system-backup-a-manifest-path.test.ps1') 2>&1)
        $refreshExit=$LASTEXITCODE
        $refreshOutput|Write-Output
        if($refreshExit -ne 0 -or ($refreshOutput -join "`n") -notmatch 'PASS manifest-path cases=11 .*outputs-created=no build=no remote=no'){throw 'Manifest path regression failed'}
        $refreshTests+=@([ordered]@{shell=$refreshShell;exit_code=$refreshExit;cases=11;build=$false;remote=$false})
    }
    Test-DIndexSourceSnapshot -Root $refreshFrozen -Manifest $refreshSnapshot
    Test-DIndexSourceSnapshot -Root $refreshRoot -Manifest $refreshSnapshot
    $refreshResult=[ordered]@{kind='d_download_producer_owner_source_refresh';original_tested_source_sha256=$refreshOriginal.source_sha256;current_snapshot=$refreshSnapshot;changed_paths=$refreshChanges;all_other_original_inputs_unchanged=$true;current_sources_match=$true;go_rerun=$false;path_tests=$refreshTests;owner_path=$refreshOwner;cleanup_required=$true;dependencies_installed=$false}
    [IO.File]::WriteAllText($refreshManifestPath,($refreshResult|ConvertTo-Json -Depth 10))
} finally {
    try {
        if(Test-Path -LiteralPath $refreshOwner){
            $refreshResolved=(Resolve-Path -LiteralPath $refreshOwner).Path
            if([IO.Path]::GetDirectoryName($refreshResolved) -ne $refreshRoot -or [IO.Path]::GetFileName($refreshResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $refreshResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $refreshResolved 'owner.txt')) -ne [IO.Path]::GetFileName($refreshResolved)){throw 'Refusing refresh cleanup outside exact owned workspace directory'}
            if(@(Get-ChildItem -Force -Recurse -LiteralPath $refreshResolved -Attributes ReparsePoint).Count -ne 0){throw 'Redirected refresh child'}
            Remove-Item -LiteralPath $refreshResolved -Recurse -Force
        }
        Write-Output ('REFRESH_CLEANED path='+$refreshOwner+' absent='+(-not(Test-Path -LiteralPath $refreshOwner)))
    } finally {Stop-Transcript|Out-Null}
}
