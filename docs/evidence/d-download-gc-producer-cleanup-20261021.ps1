[CmdletBinding()]
param([Parameter(Mandatory=$true)][string[]]$Prefixes)
$ErrorActionPreference='Stop'
$producerCleanupRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$producerCleanupOutput=Join-Path $PSScriptRoot 'd-download-gc-producer-cleanup-20261021.json'
if(Test-Path -LiteralPath $producerCleanupOutput){throw 'Refusing to replace cleanup evidence'}
$producerCleanupPaths=@()
foreach($producerCleanupPrefix in $Prefixes){
    if($producerCleanupPrefix -notmatch '^d-download-gc-producer-20261021-r[1-9][0-9]*$'){throw 'Unexpected run prefix'}
    $producerCleanupText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot ($producerCleanupPrefix+'-native.txt')))
    $producerCleanupMatches=[regex]::Matches($producerCleanupText,'(?m)^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=([^\r\n]+)\r?$')
    if($producerCleanupMatches.Count -ne 1){throw 'Missing exact source owner'}
    $producerCleanupOwner=[IO.Path]::GetFullPath($producerCleanupMatches[0].Groups[1].Value)
    if([IO.Path]::GetDirectoryName($producerCleanupOwner) -cne $producerCleanupRoot -or [IO.Path]::GetFileName($producerCleanupOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$'){throw 'Source owner escaped workspace'}
    if($producerCleanupText -notmatch '(?m)^d_admission_native_exit=[01]\r?$' -or $producerCleanupText -notmatch '(?m)^CLEANED snapshot=True\r?$' -or (Test-Path -LiteralPath $producerCleanupOwner)){throw 'Original run not terminal and cleaned'}
    $producerCleanupPaths += [ordered]@{prefix=$producerCleanupPrefix;path=$producerCleanupOwner;exists=$false}
}
$producerCleanupCache=Join-Path $producerCleanupRoot '.tmp-d-admission-gc-producer-20261021-r1'
$producerCleanupResolved=(Resolve-Path -LiteralPath $producerCleanupCache).Path
if($producerCleanupResolved -cne $producerCleanupCache -or [IO.Path]::GetDirectoryName($producerCleanupResolved) -cne $producerCleanupRoot -or [IO.Path]::GetFileName($producerCleanupResolved) -cne '.tmp-d-admission-gc-producer-20261021-r1'){throw 'Cache owner mismatch'}
$producerCleanupItem=Get-Item -Force -LiteralPath $producerCleanupResolved
if($producerCleanupItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache owner'}
if([IO.File]::ReadAllText((Join-Path $producerCleanupResolved 'owner.txt')).Trim() -cne 'gc-producer-20261021-r1'){throw 'Wrong exact cache marker'}
foreach($producerCleanupChild in (Get-ChildItem -Force -LiteralPath $producerCleanupResolved -Recurse)){
    if($producerCleanupChild.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cache child'}
}
Remove-Item -LiteralPath $producerCleanupResolved -Recurse -Force
if(Test-Path -LiteralPath $producerCleanupResolved){throw 'Cache remains'}
$producerCleanupPaths += [ordered]@{path=$producerCleanupResolved;marker='gc-producer-20261021-r1';exists=$false;removed=$true}
[IO.File]::WriteAllText($producerCleanupOutput,([ordered]@{kind='d_gc_producer_local_owned_cleanup';recorded_at=[DateTime]::UtcNow.ToString('o');paths=$producerCleanupPaths;dependencies_installed=$false;remote_run=$false}|ConvertTo-Json -Depth 8)+"`n")
Write-Output 'PASS exact GC producer owned source directories absent and external build cache removed; evidence retained'
