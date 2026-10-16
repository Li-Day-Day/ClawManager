$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$snapshotTestWorkspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$snapshotTestOwned=Join-Path $snapshotTestWorkspace ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$snapshotTestRoot=Join-Path $snapshotTestOwned 'fixture'
$snapshotTestDestinationOwner=Join-Path $snapshotTestRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$snapshotTestDestination=Join-Path $snapshotTestDestinationOwner 'source'
try{
    [IO.Directory]::CreateDirectory($snapshotTestDestinationOwner) | Out-Null
    [IO.File]::WriteAllText((Join-Path $snapshotTestDestinationOwner 'owner.txt'),[IO.Path]::GetFileName($snapshotTestDestinationOwner))
    foreach($entry in @('backend/go.mod','backend/go.sum','backend/internal/probe.go','contracts/pin.json','scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-index-group-report.mjs','docs/proposal.sql','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/ignored-group/raw.txt')){
        $path=Join-Path $snapshotTestRoot $entry
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)) | Out-Null
        [IO.File]::WriteAllText($path,'synthetic-'+$entry)
    }
    $snapshotTestManifest=New-DIndexSourceSnapshot -Root $snapshotTestRoot -Destination $snapshotTestDestination
    Test-DIndexSourceSnapshot -Root $snapshotTestDestination -Manifest $snapshotTestManifest
    if(-not $snapshotTestManifest.stable_copy_verified -or $snapshotTestManifest.files.Count -ne 8){throw 'Snapshot input scope drift'}
    Write-Output 'PASS copies all selected source inputs, rejects raw run artifacts, verifies read-only snapshot'
    [IO.File]::WriteAllText((Join-Path $snapshotTestRoot 'backend/internal/probe.go'),'later development change')
    Test-DIndexSourceSnapshot -Root $snapshotTestDestination -Manifest $snapshotTestManifest
    if([IO.File]::ReadAllText((Join-Path $snapshotTestDestination 'backend/internal/probe.go')) -ne 'synthetic-backend/internal/probe.go'){throw 'Live edits reached frozen snapshot'}
    Write-Output 'PASS later working-tree edits do not change frozen source'
    $snapshotTestRejected=$false
    try{New-DIndexSourceSnapshot -Root $snapshotTestRoot -Destination $snapshotTestDestination | Out-Null}catch{$snapshotTestRejected=$true}
    if(-not $snapshotTestRejected){throw 'Existing snapshot overwritten'}
    Write-Output 'PASS rejects snapshot overwrite'
    $snapshotTestExtra=Join-Path $snapshotTestDestination 'backend/internal/extra.go'
    [IO.File]::WriteAllText($snapshotTestExtra,'injected build input')
    $snapshotTestRejected=$false
    try{Test-DIndexSourceSnapshot -Root $snapshotTestDestination -Manifest $snapshotTestManifest}catch{$snapshotTestRejected=$true}
    Remove-Item -LiteralPath $snapshotTestExtra
    if(-not $snapshotTestRejected){throw 'Added snapshot source accepted'}
    Write-Output 'PASS rejects an added build input in frozen snapshot'
    $snapshotTestCorrupt=Join-Path $snapshotTestDestination 'backend/internal/probe.go'
    (Get-Item -LiteralPath $snapshotTestCorrupt).IsReadOnly=$false
    [IO.File]::WriteAllText($snapshotTestCorrupt,'corrupted copied source')
    $snapshotTestRejected=$false
    try{Test-DIndexSourceSnapshot -Root $snapshotTestDestination -Manifest $snapshotTestManifest}catch{$snapshotTestRejected=$true}
    if(-not $snapshotTestRejected){throw 'Snapshot corruption accepted'}
    Write-Output 'PASS rejects copied-source mutation before another remote run'
}finally{
    $snapshotTestResolved=[IO.Path]::GetFullPath($snapshotTestOwned)
    if([IO.Path]::GetDirectoryName($snapshotTestResolved) -ne $snapshotTestWorkspace -or [IO.Path]::GetFileName($snapshotTestResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Unsafe snapshot fixture cleanup'}
    if(Test-Path -LiteralPath $snapshotTestResolved){Remove-Item -LiteralPath $snapshotTestResolved -Recurse -Force}
    Write-Output ('CLEANED source snapshot fixture='+(-not(Test-Path -LiteralPath $snapshotTestResolved)))
}
