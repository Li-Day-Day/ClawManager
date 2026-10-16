# Retry only the pre-build stable-copy check. No Go, SSH or database operation
# belongs here. Each failed partial source is discarded before another capture.
function Remove-AConfigProofPartialSource {
    param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$Owner)
    $captureRoot=[IO.Path]::GetFullPath($Root)
    $captureOwner=[IO.Path]::GetFullPath($Owner)
    if([IO.Path]::GetDirectoryName($captureOwner) -ne $captureRoot -or [IO.Path]::GetFileName($captureOwner) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or
        ((Get-Item -Force -LiteralPath $captureOwner).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        [IO.File]::ReadAllText((Join-Path $captureOwner 'owner.txt')) -ne [IO.Path]::GetFileName($captureOwner)){throw 'Refusing partial proof source cleanup outside its owned directory'}
    $captureSource=Join-Path $captureOwner 'source'
    if(Test-Path -LiteralPath $captureSource){
        $captureResolved=(Resolve-Path -LiteralPath $captureSource).Path
        if([IO.Path]::GetDirectoryName($captureResolved) -ne $captureOwner -or [IO.Path]::GetFileName($captureResolved) -ne 'source' -or
            ((Get-Item -Force -LiteralPath $captureResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing redirected partial proof source cleanup'}
        Remove-Item -LiteralPath $captureResolved -Recurse -Force
        if(Test-Path -LiteralPath $captureSource){throw 'Partial proof source cleanup was not completed'}
    }
}

function New-AConfigProofSourceSnapshot {
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [Parameter(Mandatory=$true)][string]$Owner,
        [ValidateRange(1,3)][int]$MaxAttempts=3
    )
    $captureFailures=[Collections.Generic.List[string]]::new()
    for($captureAttempt=1;$captureAttempt -le $MaxAttempts;$captureAttempt++){
        Write-Host ('LOCAL_SNAPSHOT config-proof-attempt='+$captureAttempt+' max='+$MaxAttempts+' build-started=no remote-started=no')
        try {
            $captureSnapshot=New-DIndexSourceSnapshot -Root $Root -Destination (Join-Path $Owner 'source')
            $captureSnapshot['capture_attempts']=$captureAttempt
            $captureSnapshot['capture_failures']=@($captureFailures.ToArray())
            return $captureSnapshot
        } catch {
            $captureMessage=$_.Exception.Message
            $captureDrift=$captureMessage -eq 'Source changed while snapshot was copied' -or
                $captureMessage.StartsWith('Source changed while snapshot was copied: ',[StringComparison]::Ordinal) -or
                $captureMessage.StartsWith('Source file set changed while snapshot was copied: ',[StringComparison]::Ordinal)
            if(-not $captureDrift -or $captureAttempt -eq $MaxAttempts){throw}
            $captureFailures.Add($captureMessage)
            Remove-AConfigProofPartialSource -Root $Root -Owner $Owner
            Write-Warning ('Proof source changed during capture; discarded this partial copy before retry '+($captureAttempt+1)+'/'+$MaxAttempts+'. No build or remote action has started. '+$captureMessage)
            Start-Sleep -Milliseconds 250
        }
    }
}
