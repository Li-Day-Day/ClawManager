# Input scope belongs only to the bootstrap-security validation, not other A gates.
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')

function Get-ABootstrapRequiredFiles {
    return @('backend/go.mod','backend/go.sum','backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json',
        'docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
        'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/system-backup-d-config-maintenance-082-proposal-20261015.sql')
}

function Get-ABootstrapSourceState {
    param([Parameter(Mandatory=$true)][string]$Root)
    Push-Location $Root
    try {
        $candidates=@(& rg --files --hidden --no-ignore backend/internal/systembackupsecurity backend/internal/systembackupread backend/internal/systembackupcontract backend/internal/systembackupbootstrapsecurity backend/internal/systembackupproducer backend/cmd/system-backup-bootstrap backend/internal/db/migrations contracts/system-backup/v12)
        if($LASTEXITCODE -ne 0){throw 'Cannot enumerate bootstrap dependencies'}
    } finally {Pop-Location}
    $selected=@($candidates | ForEach-Object {$_.Replace('\','/')} | Where-Object {
        ($_ -match '\.go$' -and ($_ -notmatch '_test\.go$' -or $_ -match '/systembackup(?:security|bootstrapsecurity)/|^backend/cmd/system-backup-bootstrap/')) -or
        ($_ -match '^backend/internal/systembackupsecurity/testdata/' -and $_ -match '\.(?:json|sql)$') -or
        ($_ -match '^backend/internal/db/migrations/.*\.sql$') -or ($_ -match '^contracts/system-backup/v12/.*\.json$')
    })
    $missing=@()
    foreach($required in (Get-ABootstrapRequiredFiles)){
        if(Test-Path -LiteralPath (Join-Path $Root $required) -PathType Leaf){$selected+= $required}else{$missing+= $required}
    }
    $files=@($selected | Sort-Object -CaseSensitive)
    $pins=@(Get-DIndexInputPins -Root $Root -Files $files)
    return [ordered]@{source_files=$pins.Count;source_sha256=(Get-DIndexPinDigest -Pins $pins);files=$pins;missing_required=$missing}
}

function Compare-ABootstrapPins {
    param([object[]]$Expected,[object[]]$Actual)
    $before=New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
    $after=New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
    foreach($pin in $Expected){$before.Add([string]$pin.path,$pin)}
    foreach($pin in $Actual){$after.Add([string]$pin.path,$pin)}
    $added=@($after.Keys | Where-Object {-not $before.ContainsKey($_)} | Sort-Object -CaseSensitive)
    $removed=@($before.Keys | Where-Object {-not $after.ContainsKey($_)} | Sort-Object -CaseSensitive)
    $changed=@($before.Keys | Where-Object {$after.ContainsKey($_) -and ($before[$_].sha256 -cne $after[$_].sha256 -or $before[$_].size -ne $after[$_].size)} | Sort-Object -CaseSensitive)
    return [ordered]@{matches=($added.Count -eq 0 -and $removed.Count -eq 0 -and $changed.Count -eq 0);added=$added;removed=$removed;changed=$changed}
}

function Compare-ABootstrapSourceState {
    param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][object]$Baseline)
    if((Get-DIndexPinDigest -Pins $Baseline.files) -cne $Baseline.source_sha256){throw 'Bootstrap baseline digest does not match its file pins'}
    $current=Get-ABootstrapSourceState -Root $Root
    $difference=Compare-ABootstrapPins -Expected $Baseline.files -Actual $current.files
    return [ordered]@{checked_at=[DateTime]::UtcNow.ToString('o');matches=($difference.matches -and $current.missing_required.Count -eq 0);
        source_files=$current.source_files;source_sha256=$current.source_sha256;added=$difference.added;removed=$difference.removed;changed=$difference.changed;missing_required=$current.missing_required}
}
