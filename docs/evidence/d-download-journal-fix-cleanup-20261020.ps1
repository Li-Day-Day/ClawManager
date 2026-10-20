$ErrorActionPreference='Stop'
$journalRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$journalNative=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-journal-fix-20261020-r61-native.txt')
if($journalNative -notmatch 'd_admission_native_exit=0' -or $journalNative -notmatch 'FROZEN_POSTCHECK pass=yes') {throw 'Validation must reach its successful terminal state before final cleanup'}
$journalFrozenNative=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'd-download-journal-frozen-20261020-r62-native.txt')
if($journalFrozenNative -notmatch 'd_download_frozen_exit=0' -or $journalFrozenNative -notmatch 'config-writer-frozen-postcheck=yes'){throw 'Frozen wrapper must also reach its successful terminal state'}
$journalOwners=@(
    @{name='.tmp-d-index-cache-c4e565f16388451cbf0e32f87f6aba24';marker='.tmp-d-index-cache-c4e565f16388451cbf0e32f87f6aba24'},
    @{name='.tmp-d-index-cache-29799970ed32406cb178174e28fd77b5';marker='.tmp-d-index-cache-29799970ed32406cb178174e28fd77b5'},
    @{name='.tmp-d-index-cache-074b7967a7754b6a9863489b97afca71';marker='.tmp-d-index-cache-074b7967a7754b6a9863489b97afca71'},
    @{name='.tmp-d-admission-journal-fix-20261020-r60';marker='d-download-journal-fix-20261020-r60'}
)
$journalResults=@(foreach($journalOwner in $journalOwners){
    $journalPath=[IO.Path]::GetFullPath((Join-Path $journalRoot $journalOwner.name))
    if([IO.Path]::GetDirectoryName($journalPath) -cne $journalRoot -or [IO.Path]::GetFileName($journalPath) -cne $journalOwner.name){throw 'Cleanup target escapes this workspace owner'}
    $journalWasPresent=Test-Path -LiteralPath $journalPath
    if($journalWasPresent){
        $journalResolved=(Resolve-Path -LiteralPath $journalPath).Path
        if($journalResolved -cne $journalPath -or ((Get-Item -Force -LiteralPath $journalPath).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            [IO.File]::ReadAllText((Join-Path $journalPath 'owner.txt')) -cne $journalOwner.marker){throw 'Cleanup owner marker or resolved path mismatch'}
        if(@(Get-ChildItem -LiteralPath $journalPath -Force -Recurse -Attributes ReparsePoint).Count){throw 'Cleanup tree contains a redirected path'}
        Remove-Item -LiteralPath $journalPath -Recurse -Force
    }
    if(Test-Path -LiteralPath $journalPath){throw 'Owned validation products remain'}
    [ordered]@{path=$journalPath;was_present=$journalWasPresent;absent=$true}
})
[ordered]@{kind='d_download_journal_fix_cleanup.v1';paths=$journalResults;all_absent=$true;installed_dependencies=$false;remote_executed=$false} |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-download-journal-fix-cleanup-20261020.json') -Encoding utf8
Write-Output 'CLEANED journal-fix owned-source-cache-binaries=4 absent=yes remote=no'
