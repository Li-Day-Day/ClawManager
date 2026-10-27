# Public facts only. No remote scratch, installs, configuration changes or writes.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$PlanPath,
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23',
    [string]$OutputPath='',
    [switch]$CheckOnly
)
$ErrorActionPreference='Stop'
$aFieldRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$aFieldPlan=[IO.Path]::GetFullPath($PlanPath)
$aFieldProbe=Join-Path $PSScriptRoot 'system-backup-a-field-evidence.py'
function Get-AFieldSHA([byte[]]$Bytes){
    $aFieldHasher=[Security.Cryptography.SHA256]::Create()
    try {return ([BitConverter]::ToString($aFieldHasher.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()} finally {$aFieldHasher.Dispose()}
}
$aFieldPlanBytes=[IO.File]::ReadAllBytes($aFieldPlan)
if($aFieldPlanBytes.Length -gt 1048576){throw 'Public evidence plan exceeds limit'}
# Validation uses existing Python only; -B prevents bytecode/cache artifacts.
if($env:OS -eq 'Windows_NT'){
    & py -3 -B $aFieldProbe --plan $aFieldPlan --check-plan
}else{& python3 -B $aFieldProbe --plan $aFieldPlan --check-plan}
$aFieldCheckExit=$LASTEXITCODE
if($aFieldCheckExit -ne 0){throw 'Evidence plan is incomplete or invalid; no SSH started. Reuse existing observation and fill reviewed public references.'}
& node (Join-Path $PSScriptRoot 'system-backup-a-field-evidence.mjs') --check-scope --plan $aFieldPlan
if($LASTEXITCODE -ne 0){throw 'Public plan omits source-required metadata tables; no SSH started'}
if((Get-AFieldSHA ([IO.File]::ReadAllBytes($aFieldPlan))) -ne (Get-AFieldSHA $aFieldPlanBytes)){throw 'Public plan changed during validation; no SSH started'}
if($CheckOnly){Write-Output 'PASS field-evidence-plan-only=yes remote-started=no dependencies-installed=no';return}
if(-not $OutputPath){$OutputPath=Join-Path $aFieldRoot ('docs/evidence/a-field-evidence-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')}
$aFieldOutput=[IO.Path]::GetFullPath($OutputPath)
$aFieldScriptBytes=[IO.File]::ReadAllBytes($aFieldProbe)
$aFieldStrictUTF8=New-Object Text.UTF8Encoding($false,$true)
$aFieldPayload="import base64`nA_FIELD_PLAN_JSON=base64.b64decode('"+[Convert]::ToBase64String($aFieldPlanBytes)+"').decode('utf-8')`n"+$aFieldStrictUTF8.GetString($aFieldScriptBytes).Replace("`r`n","`n")
$aFieldEnvelope=[ordered]@{kind='a_field_evidence_transport.v1';status='INCOMPLETE';ssh_target=$SshTarget;plan_sha256=(Get-AFieldSHA $aFieldPlanBytes);script_sha256=(Get-AFieldSHA $aFieldScriptBytes);payload_sha256=(Get-AFieldSHA ([Text.Encoding]::UTF8.GetBytes($aFieldPayload)));ssh_exit=$null;result=$null;production_approved=$false}
# Reserve the exact receipt before SSH, refusing old evidence replacement.
$aFieldStream=[IO.File]::Open($aFieldOutput,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$aFieldWriter=New-Object IO.StreamWriter($aFieldStream,(New-Object Text.UTF8Encoding($false)))
$aFieldSavedEncoding=$OutputEncoding
try {
    $OutputEncoding=[Text.UTF8Encoding]::new($false)
    # All required remote programs must already exist. No private values in argv.
    $aFieldLines=@($aFieldPayload | & ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -- $SshTarget "tr -d '\015' | python3 -B - --embedded-plan")
    $aFieldEnvelope.ssh_exit=$LASTEXITCODE
    $aFieldRaw=$aFieldLines -join "`n"
    try {
        if([Text.Encoding]::UTF8.GetByteCount($aFieldRaw) -gt 33554432){throw 'Public result exceeds bounded envelope size'}
        $aFieldResult=$aFieldRaw|ConvertFrom-Json
        if($aFieldResult.kind -ne 'a-field-evidence.v1' -or $aFieldResult.plan_sha256 -ne $aFieldEnvelope.plan_sha256){throw 'Unexpected result binding'}
        $aFieldEnvelope.result=$aFieldResult
        $aFieldEnvelope.status=if($aFieldEnvelope.ssh_exit -eq 0 -and $aFieldResult.status -eq 'READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED'){'COLLECTED_REVIEW_REQUIRED'}else{'BLOCKED'}
    }catch{$aFieldEnvelope.status='TRANSPORT_OR_RESULT_REJECTED'}
} finally {
    $OutputEncoding=$aFieldSavedEncoding
    $aFieldWriter.WriteLine(($aFieldEnvelope|ConvertTo-Json -Depth 24 -WarningAction Stop))
    $aFieldWriter.Dispose()
    Write-Host ('Public evidence receipt: '+$aFieldOutput)
}
if($aFieldEnvelope.status -ne 'COLLECTED_REVIEW_REQUIRED'){throw 'Field evidence incomplete; retain the public receipt. No grants/DDL/deployment or files were changed remotely.'}
Write-Output 'COLLECTED_REVIEW_REQUIRED full-production-acceptance=no revocation-test=not-run physical-reservation=not-proven atomic-volume-test=not-run'
