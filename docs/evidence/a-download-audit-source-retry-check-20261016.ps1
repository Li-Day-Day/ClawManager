[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SourceManifestPath)
$ErrorActionPreference='Stop'
$auditRetryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$auditRetryOwner=Join-Path $auditRetryRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$auditRetryManifest=[IO.Path]::GetFullPath($SourceManifestPath)
if([IO.Path]::GetDirectoryName($auditRetryManifest) -ne (Join-Path $auditRetryRoot 'docs/evidence') -or (Test-Path -LiteralPath $auditRetryManifest)){throw 'Expected new audit retry manifest in evidence directory'}
. (Join-Path $auditRetryRoot 'scripts/system-backup-a-evidence-go-step.ps1')
Write-Output ('LOCAL_STAGE download-audit-source-retry host-powershell='+$PSVersionTable.PSVersion+' real-Go=no SSH=no SQL=no')
& (Join-Path $auditRetryRoot 'scripts/system-backup-a-config-proof-source.test.ps1')
& (Join-Path $auditRetryRoot 'scripts/system-backup-d-download-audit-dispatch.test.ps1')
$auditRetryPS51=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
foreach($auditRetryTest in @('system-backup-a-config-proof-source.test.ps1','system-backup-d-download-audit-dispatch.test.ps1')){
    Write-Output ('LOCAL_STAGE download-audit-source-retry windows-powershell=5.1 test='+$auditRetryTest)
    $auditRetryExit=Invoke-AEvidenceNative -FilePath $auditRetryPS51 -Arguments @('-NoProfile','-NonInteractive','-File',(Join-Path $auditRetryRoot ('scripts/'+$auditRetryTest)))
    if($auditRetryExit -ne 0){throw ('Windows PowerShell test failed: '+$auditRetryTest+' exit='+$auditRetryExit)}
}
$auditRetryParseErrors=$null
$auditRetryAST=[Management.Automation.Language.Parser]::ParseFile((Join-Path $auditRetryRoot 'scripts/system-backup-d-download-audit-validation.ps1'),[ref]$null,[ref]$auditRetryParseErrors)
if($auditRetryParseErrors.Count){throw 'Patched audit wrapper has syntax errors'}
$auditRetryCalls=@($auditRetryAST.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'New-AConfigProofSourceSnapshot'},$true))
if($auditRetryCalls.Count -ne 1 -or $auditRetryCalls[0].Extent.Text -ne 'New-AConfigProofSourceSnapshot -Root $auditRoot -Owner $auditOwner -MaxAttempts 3' -or @($auditRetryAST.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'New-DIndexSourceSnapshot'},$true)).Count){throw 'Audit wrapper must call bounded source-only capture exactly once'}
Write-Output 'PASS audit source retry AST: one bounded capture before downstream; existing dispatch=13 unchanged'
. (Join-Path $auditRetryRoot 'scripts/system-backup-d-index-source-snapshot.ps1')
. (Join-Path $auditRetryRoot 'scripts/system-backup-a-config-proof-source.ps1')
try {
    [IO.Directory]::CreateDirectory($auditRetryOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $auditRetryOwner 'owner.txt'),[IO.Path]::GetFileName($auditRetryOwner))
    Write-Output ('OWNED download-audit-retry-source='+$auditRetryOwner)
    $auditRetrySnapshot=New-AConfigProofSourceSnapshot -Root $auditRetryRoot -Owner $auditRetryOwner -MaxAttempts 3
    $auditRetryStream=[IO.File]::Open($auditRetryManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try{$auditRetryBytes=[Text.Encoding]::UTF8.GetBytes(($auditRetrySnapshot|ConvertTo-Json -Depth 6));$auditRetryStream.Write($auditRetryBytes,0,$auditRetryBytes.Length)}finally{$auditRetryStream.Dispose()}
    Test-DIndexSourceSnapshot -Root (Join-Path $auditRetryOwner 'source') -Manifest $auditRetrySnapshot
    foreach($auditRetryPin in @($auditRetrySnapshot.files|Where-Object {$_.path -in @('scripts/system-backup-d-download-audit-validation.ps1','scripts/system-backup-a-config-proof-source.ps1','scripts/system-backup-a-config-proof-source.test.ps1')})){
        if((Get-FileHash -LiteralPath (Join-Path $auditRetryRoot $auditRetryPin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $auditRetryPin.sha256){throw 'Current wrapper or source-only helper changed during verification'}
    }
    Write-Output ('LOCAL_PASS download-audit-retry-real-snapshot=yes files='+$auditRetrySnapshot.files.Count+' source_sha256='+$auditRetrySnapshot.source_sha256+' attempts='+$auditRetrySnapshot.capture_attempts+' frozen-postcheck=yes current-wrapper-helper-postcheck=yes Go=no SSH=no SQL=no')
} finally {
    if(Test-Path -LiteralPath $auditRetryOwner){
        $auditRetryResolved=(Resolve-Path -LiteralPath $auditRetryOwner).Path
        if([IO.Path]::GetDirectoryName($auditRetryResolved) -ne $auditRetryRoot -or [IO.Path]::GetFileName($auditRetryResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $auditRetryResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $auditRetryResolved 'owner.txt')) -ne [IO.Path]::GetFileName($auditRetryResolved)){throw 'Refusing retry source cleanup outside exact owner'}
        Remove-Item -LiteralPath $auditRetryResolved -Recurse -Force
    }
    Write-Output ('LOCAL_CLEANUP download-audit-retry-owned='+$auditRetryOwner+' removed='+(-not(Test-Path -LiteralPath $auditRetryOwner)))
}
