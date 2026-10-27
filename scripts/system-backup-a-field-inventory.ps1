# Public Kubernetes references only. No container exec, Secret request or SQL.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23',
    [ValidatePattern('^[A-Za-z0-9_.@:-]{1,253}$')][string]$Context='kubernetes-admin@kubernetes',
    [ValidatePattern('^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$')][string]$Namespace='clawmanager-zhanghui08-system',
    [ValidatePattern('^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')][string]$NamespaceUid='337cfe30-2c17-4b8e-b32a-760778b8098e',
    [string]$OutputPath=''
)
$ErrorActionPreference='Stop'
$aFieldInventoryScript=Join-Path $PSScriptRoot 'system-backup-a-field-inventory.py'
$aFieldInventoryUTF8=New-Object Text.UTF8Encoding($false,$true)
$aFieldInventoryBytes=[IO.File]::ReadAllBytes($aFieldInventoryScript)
$aFieldInventoryCode=$aFieldInventoryUTF8.GetString($aFieldInventoryBytes).Replace("`r`n","`n")
$aFieldInventoryHasher=[Security.Cryptography.SHA256]::Create()
try {
    $aFieldInventorySHA=([BitConverter]::ToString($aFieldInventoryHasher.ComputeHash($aFieldInventoryBytes))).Replace('-','').ToLowerInvariant()
    $aFieldInventoryPayloadSHA=([BitConverter]::ToString($aFieldInventoryHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($aFieldInventoryCode)))).Replace('-','').ToLowerInvariant()
}finally{$aFieldInventoryHasher.Dispose()}
if(-not $OutputPath){$OutputPath=Join-Path $PSScriptRoot ('../docs/evidence/a-field-public-inventory-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')}
$aFieldInventoryOutput=[IO.Path]::GetFullPath($OutputPath)
$aFieldInventoryStream=[IO.File]::Open($aFieldInventoryOutput,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$aFieldInventoryWriter=New-Object IO.StreamWriter($aFieldInventoryStream,(New-Object Text.UTF8Encoding($false)))
$aFieldInventoryEnvelope=[ordered]@{kind='a_field_public_inventory_transport.v1';script_sha256=$aFieldInventorySHA;payload_sha256=$aFieldInventoryPayloadSHA;ssh_target=$SshTarget;context=$Context;namespace=$Namespace;namespace_uid=$NamespaceUid;ssh_exit=$null;result=$null;production_approved=$false}
$aFieldInventoryEncoding=$OutputEncoding
try {
    $OutputEncoding=[Text.UTF8Encoding]::new($false)
    $aFieldInventoryRemote="tr -d '\015' | python3 -B - --context '"+$Context+"' --namespace '"+$Namespace+"' --namespace-uid '"+$NamespaceUid+"'"
    $aFieldInventoryRaw=@($aFieldInventoryCode | & ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -- $SshTarget $aFieldInventoryRemote) -join "`n"
    $aFieldInventoryEnvelope.ssh_exit=$LASTEXITCODE
    if([Text.Encoding]::UTF8.GetByteCount($aFieldInventoryRaw) -gt 4194304){throw 'Public inventory exceeds bounded result size'}
    $aFieldInventoryResult=$aFieldInventoryRaw|ConvertFrom-Json
    if($aFieldInventoryResult.kind -ne 'a_field_public_inventory.v1'){throw 'Unexpected public inventory result'}
    $aFieldInventoryEnvelope.result=$aFieldInventoryResult
    if($aFieldInventoryEnvelope.ssh_exit -ne 0 -or $aFieldInventoryResult.status -ne 'PUBLIC_REFERENCES_OBSERVED_REVIEW_REQUIRED'){throw 'Public inventory blocked; retain receipt for review'}
    foreach($aFieldInventoryKey in @('context','namespace','namespace_uid')){if($aFieldInventoryResult.$aFieldInventoryKey -ne $aFieldInventoryEnvelope.$aFieldInventoryKey){throw 'Public inventory reference mismatch'}}
    Write-Output 'PUBLIC_REFERENCES_OBSERVED_REVIEW_REQUIRED no-production-acceptance=yes'
}catch{
    throw 'Public inventory did not complete or match; retain the receipt. Unrecognized stdout was withheld.'
}finally{
    $OutputEncoding=$aFieldInventoryEncoding
    $aFieldInventoryWriter.WriteLine(($aFieldInventoryEnvelope|ConvertTo-Json -Depth 18 -WarningAction Stop))
    $aFieldInventoryWriter.Dispose()
    Write-Host ('Public inventory receipt: '+$aFieldInventoryOutput)
}
