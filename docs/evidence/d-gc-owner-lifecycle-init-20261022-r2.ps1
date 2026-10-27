$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$owner=Join-Path $root '.tmp-d-index-cache-3d426c330a554ab298d97639612abb42'
$source=Join-Path $owner 'source';$archive=Join-Path $owner 'source-r1'
if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($owner)) -cne $root -or [IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong revision owner'}
foreach($p in @($owner,$source)){if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected revision directory'}}
foreach($p in @(Get-ChildItem -LiteralPath $source -Recurse -Force)){if(($p.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $p.FullName.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Redirected revision child'}}
if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($source)) -cne $owner -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($archive)) -cne $owner -or (Test-Path -LiteralPath $archive)){throw 'Unsafe revision destination'}
. (Join-Path $root 'scripts/system-backup-d-index-source-snapshot.ps1')
$previous=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-candidate-20261022-source.json') -Raw|ConvertFrom-Json
Test-DIndexSourceSnapshot -Root $source -Manifest $previous
Move-Item -LiteralPath $source -Destination $archive
$base=New-DIndexSourceSnapshot -Root $root -Destination $source
$base|Add-Member -NotePropertyName owner -NotePropertyValue $owner
$base|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-base-20261022-r2.json') -Encoding utf8NoBOM
$targets=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-targets-20261022.json') -Raw|ConvertFrom-Json).targets
foreach($p in $targets){$dest=Join-Path $source $p;if(Test-Path -LiteralPath $dest){(Get-Item -LiteralPath $dest).IsReadOnly=$false};Copy-Item -LiteralPath (Join-Path $archive $p) -Destination $dest;(Get-Item -LiteralPath $dest).IsReadOnly=$true}
[ordered]@{owner=$owner;targets=$targets}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'd-gc-owner-lifecycle-targets-20261022-r2.json') -Encoding utf8NoBOM
Write-Output ('GC_OWNER_LIFECYCLE_REVISION2 files='+$base.files.Count+' sha256='+$base.source_sha256+' previous_source=source-r1')
