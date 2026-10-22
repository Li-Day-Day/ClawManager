[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PlanPath,[string]$ReceiptPath='')
$ErrorActionPreference='Stop'
$aLiveRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$aLivePlan=[IO.Path]::GetFullPath($PlanPath)
if(-not $ReceiptPath){
    $aLiveID=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
    $ReceiptPath=Join-Path $aLiveRoot ('docs/evidence/a-live-chain-http-'+$aLiveID+'.json')
}
$aLiveReceipt=[IO.Path]::GetFullPath($ReceiptPath)
$aLiveScript=Join-Path $PSScriptRoot 'system-backup-a-live-chain.mjs'
foreach($aLivePath in @($aLivePlan,$aLiveReceipt,$aLiveScript)){if($aLivePath.IndexOfAny([char[]]"`"`r`n") -ge 0){throw 'Invalid public file path'}}
$aLiveStart=New-Object Diagnostics.ProcessStartInfo
$aLiveStart.FileName=(Get-Command node.exe -ErrorAction Stop).Source
$aLiveStart.Arguments='"'+$aLiveScript+'" --plan "'+$aLivePlan+'" --receipt "'+$aLiveReceipt+'"'
$aLiveStart.UseShellExecute=$false
$aLiveStart.CreateNoWindow=$true
$aLiveStart.RedirectStandardInput=$true
$aLiveStart.RedirectStandardOutput=$true
$aLiveStart.RedirectStandardError=$true
$aLiveStart.StandardInputEncoding=New-Object Text.UTF8Encoding($false)
foreach($aLiveDebugVar in @('NODE_DEBUG','NODE_OPTIONS','SSLKEYLOGFILE')){$aLiveStart.EnvironmentVariables.Remove($aLiveDebugVar)}
$aLiveProcess=New-Object Diagnostics.Process
$aLiveProcess.StartInfo=$aLiveStart
$aLiveStarted=$false
function Read-ALivePrivateText([string]$Prompt){
    $aLiveSecure=Read-Host $Prompt -AsSecureString
    $aLivePointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($aLiveSecure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($aLivePointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($aLivePointer); $aLiveSecure.Dispose() }
}
try {
    if(-not $aLiveProcess.Start()){throw 'Cannot start local live-chain verifier'}
    $aLiveStarted=$true
    $aLiveStdout=$aLiveProcess.StandardOutput.ReadToEndAsync()
    while($null -ne ($aLiveMarker=$aLiveProcess.StandardError.ReadLine())){
        if($aLiveMarker -eq 'A_LIVE_CHAIN_CREDENTIALS_READY'){
            $aLiveUsername=Read-Host 'Test account username'
            $aLivePassword=Read-ALivePrivateText 'Test account password (hidden)'
            try {$aLiveProcess.StandardInput.WriteLine((@{username=$aLiveUsername;password=$aLivePassword}|ConvertTo-Json -Compress));$aLiveProcess.StandardInput.Flush()}
            finally {$aLiveUsername='';$aLivePassword=''}
        } elseif($aLiveMarker -eq 'A_LIVE_CHAIN_TOTP_READY'){
            $aLiveCode=Read-ALivePrivateText 'Fresh code from your enrolled authenticator (hidden)'
            try {$aLiveProcess.StandardInput.WriteLine((@{code=$aLiveCode}|ConvertTo-Json -Compress));$aLiveProcess.StandardInput.Flush()}
            finally {$aLiveCode='';$aLiveProcess.StandardInput.Close()}
        } else { Write-Host 'Live-chain verifier reported an input/transport error; inspect the public receipt.' }
    }
    $aLiveProcess.WaitForExit()
    Write-Host $aLiveStdout.GetAwaiter().GetResult()
    Write-Host ('Public receipt: '+$aLiveReceipt)
    if($aLiveProcess.ExitCode -ne 0){throw 'Live-chain HTTP validation did not pass; retain the public receipt'}
} finally {
    if($aLiveStarted -and -not $aLiveProcess.HasExited){$aLiveProcess.Kill();$aLiveProcess.WaitForExit()}
    $aLiveProcess.Dispose()
}
