$ErrorActionPreference='Stop'
$aFieldInventoryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$aFieldInventoryOwned=Join-Path $aFieldInventoryRoot ('.tmp-a-field-inventory-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($aFieldInventoryOwned)
$aFieldInventoryWrapper=Join-Path $PSScriptRoot 'system-backup-a-field-inventory.ps1'
$global:aFieldInventoryMockCalls=0
$global:aFieldInventoryMockExit=0
$global:aFieldInventoryMockRaw='{"kind":"a_field_public_inventory.v1","status":"PUBLIC_REFERENCES_OBSERVED_REVIEW_REQUIRED","context":"kubernetes-admin@kubernetes","namespace":"clawmanager-zhanghui08-system","namespace_uid":"337cfe30-2c17-4b8e-b32a-760778b8098e","production_approved":false}'
function global:ssh {
    process {
        if($_ -notmatch 'class Inventory:' -or $_ -match "`r"){throw 'Unexpected public inventory payload'}
        if(($args -join ' ') -notmatch 'StrictHostKeyChecking=yes' -or ($args -join ' ') -notmatch 'python3 -B'){throw 'Missing strict transport'}
        $global:aFieldInventoryMockCalls++
        $global:LASTEXITCODE=$global:aFieldInventoryMockExit
        $global:aFieldInventoryMockRaw
    }
}
try {
    $aFieldInventoryOut=Join-Path $aFieldInventoryOwned 'public.json'
    & $aFieldInventoryWrapper -OutputPath $aFieldInventoryOut
    $aFieldInventoryRecord=Get-Content -Raw -LiteralPath $aFieldInventoryOut | ConvertFrom-Json
    if($aFieldInventoryRecord.ssh_exit -ne 0 -or $aFieldInventoryRecord.payload_sha256 -notmatch '^[a-f0-9]{64}$' -or $global:aFieldInventoryMockCalls -ne 1){throw 'Missing bound public transport result'}
    try {& $aFieldInventoryWrapper -OutputPath $aFieldInventoryOut;throw 'Existing receipt replaced'}catch{if($_.Exception.Message -eq 'Existing receipt replaced'){throw}}
    if($global:aFieldInventoryMockCalls -ne 1){throw 'Existing receipt contacted SSH'}
    $global:aFieldInventoryMockExit=2
    $global:aFieldInventoryMockRaw='{"kind":"a_field_public_inventory.v1","status":"BLOCKED","production_approved":false}'
    $aFieldInventoryFail=Join-Path $aFieldInventoryOwned 'failed.json'
    try {& $aFieldInventoryWrapper -OutputPath $aFieldInventoryFail;throw 'Failed SSH accepted'}catch{if($_.Exception.Message -eq 'Failed SSH accepted'){throw}}
    if((Get-Content -Raw -LiteralPath $aFieldInventoryFail|ConvertFrom-Json).ssh_exit -ne 2){throw 'Lost failed remote exit'}
    $global:aFieldInventoryMockRaw='private-unrecognized-output'
    $global:aFieldInventoryMockExit=0
    $aFieldInventoryBad=Join-Path $aFieldInventoryOwned 'invalid.json'
    try {& $aFieldInventoryWrapper -OutputPath $aFieldInventoryBad;throw 'Malformed output accepted'}catch{if($_.Exception.Message -eq 'Malformed output accepted'){throw}}
    if((Get-Content -Raw -LiteralPath $aFieldInventoryBad).Contains('private-unrecognized')){throw 'Malformed output exported'}
    Write-Output 'PASS field-public-inventory wrapper: pinned payload, no overwrite, original failure, unrecognized stdout withheld; fake transport only'
}finally{
    Remove-Item Function:\ssh -ErrorAction SilentlyContinue
    $aFieldInventoryResolved=[IO.Path]::GetFullPath($aFieldInventoryOwned)
    if([IO.Path]::GetDirectoryName($aFieldInventoryResolved) -ne $aFieldInventoryRoot -or [IO.Path]::GetFileName($aFieldInventoryResolved) -notmatch '^\.tmp-a-field-inventory-[a-f0-9]{32}$' -or ((Get-Item -LiteralPath $aFieldInventoryResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe inventory test cleanup'}
    Remove-Item -LiteralPath $aFieldInventoryResolved -Recurse -Force
    if(Test-Path -LiteralPath $aFieldInventoryResolved){throw 'Inventory test cleanup incomplete'}
}
