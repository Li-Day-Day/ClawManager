# Freeze repository build inputs once. No dependencies are installed and no
# credential/runtime directory is traversed. The wrapper owns final cleanup.
function Get-DIndexSourceFiles {
    param([string]$Root)
    Push-Location $Root
    try {
        $files=@(& rg --files --hidden backend contracts scripts docs)
        if($LASTEXITCODE -ne 0){throw 'Cannot enumerate grouped build inputs'}
        return @($files | ForEach-Object {$_.Replace('\','/')} | Where-Object {
            ($_ -notmatch '^docs/' -or $_ -match '^docs/[^/]+\.sql$' -or $_ -in @('docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json')) -and
            $_ -notmatch '(?:^|/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:/|$)' -and
            $_ -match '\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$'
        } | Sort-Object -CaseSensitive)
    } finally {Pop-Location}
}
function Get-DIndexInputPins {
    param([string]$Root,[string[]]$Files)
    $rootPrefix=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
    $checkedDirectories=@{}
    return @(foreach($file in $Files){
        $path=[IO.Path]::GetFullPath((Join-Path $Root $file))
        if(-not $path.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Snapshot input escapes workspace'}
        $info=Get-Item -Force -LiteralPath $path
        if($info.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Snapshot input is redirected'}
        $cursor=[IO.Path]::GetDirectoryName($path)
        while($cursor -ne [IO.Path]::GetFullPath($Root)){
            if($checkedDirectories.ContainsKey($cursor)){break}
            if((Get-Item -Force -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Snapshot input has a redirected path'}
            $checkedDirectories[$cursor]=$true
            $cursor=[IO.Path]::GetDirectoryName($cursor)
        }
        [ordered]@{path=$file;size=$info.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()}
    })
}
function Get-DIndexPinDigest {
    param([object[]]$Pins)
    $text=(@($Pins | ForEach-Object {$_.path+"`0"+$_.sha256+"`0"+$_.size}) -join "`n")+"`n"
    $hasher=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
}
function New-DIndexSourceSnapshot {
    param([string]$Root,[string]$Destination)
    $rootPath=[IO.Path]::GetFullPath($Root)
    $destinationPath=[IO.Path]::GetFullPath($Destination)
    $ownerPath=[IO.Path]::GetDirectoryName($destinationPath)
    if([IO.Path]::GetDirectoryName($ownerPath) -ne $rootPath -or [IO.Path]::GetFileName($ownerPath) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or [IO.Path]::GetFileName($destinationPath) -ne 'source' -or
        (Get-Item -Force -LiteralPath $ownerPath).Attributes -band [IO.FileAttributes]::ReparsePoint -or
        [IO.File]::ReadAllText((Join-Path $ownerPath 'owner.txt')) -ne [IO.Path]::GetFileName($ownerPath)){throw 'Snapshot requires a run-owned workspace directory'}
    if(Test-Path -LiteralPath $destinationPath){throw 'Refusing existing source snapshot'}
    $files=Get-DIndexSourceFiles -Root $rootPath
    foreach($required in @('backend/go.mod','backend/go.sum','scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-index-group-report.mjs')){if($files -notcontains $required){throw ('Required snapshot input missing: '+$required)}}
    $before=Get-DIndexInputPins -Root $rootPath -Files $files
    [IO.Directory]::CreateDirectory($destinationPath) | Out-Null
    foreach($pin in $before){
        $target=Join-Path $destinationPath $pin.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        Copy-Item -LiteralPath (Join-Path $rootPath $pin.path) -Destination $target
        if((Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Source changed while snapshot was copied'}
        (Get-Item -LiteralPath $target).IsReadOnly=$true
    }
    $afterFiles=Get-DIndexSourceFiles -Root $rootPath
    if(($files -join "`n") -ne ($afterFiles -join "`n")){throw ('Source file set changed while snapshot was copied: '+(@(Compare-Object $files $afterFiles | Select-Object -First 5 -ExpandProperty InputObject) -join ', '))}
    $after=Get-DIndexInputPins -Root $rootPath -Files $afterFiles
    $digest=Get-DIndexPinDigest -Pins $before
    if($digest -ne (Get-DIndexPinDigest -Pins $after)){throw 'Source changed while snapshot was copied'}
    return [ordered]@{kind='d_index_group_source_snapshot';version=1;source_sha256=$digest;files=$before;stable_copy_verified=$true;dependencies_installed=$false;production_approved=$false}
}
function Test-DIndexSourceSnapshot {
    param([string]$Root,[object]$Manifest)
    $files=Get-DIndexSourceFiles -Root $Root
    if(($files -join "`n") -ne (@($Manifest.files | ForEach-Object {$_.path}) -join "`n")){throw 'Frozen grouped source file set drift'}
    $actual=Get-DIndexInputPins -Root $Root -Files @($Manifest.files | ForEach-Object {$_.path})
    if((Get-DIndexPinDigest -Pins $actual) -ne $Manifest.source_sha256){throw 'Frozen grouped source snapshot drift'}
}
