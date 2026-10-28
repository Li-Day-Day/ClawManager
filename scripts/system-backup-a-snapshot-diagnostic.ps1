[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$diagnosticRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$diagnosticToken=[guid]::NewGuid().ToString('N')
$diagnosticOwner=Join-Path $diagnosticRoot ('.tmp-d-index-cache-'+$diagnosticToken)
$diagnosticOut=Join-Path $diagnosticRoot ('docs/evidence/a-snapshot-diagnostic-'+(Get-Date -Format yyyyMMdd-HHmmss)+'-'+$diagnosticToken.Substring(0,8)+'.json')
$diagnosticRecord=[ordered]@{kind='a_snapshot_postcheck_diagnostic.v1';error=$null;source_sha256=$null;files=0;frozen_set_equal=$false;frozen_bytes_equal=$false;added=@();missing=@();order_equal=$false;owner=$diagnosticOwner;owner_removed=$false;builds_run=$false;dependencies_installed=$false;remote_contacted=$false;historical_FK_result_reinterpreted=$false}
try {
 if(Test-Path -LiteralPath $diagnosticOwner){throw 'Diagnostic owner already exists'}
 [IO.Directory]::CreateDirectory($diagnosticOwner)|Out-Null
 [IO.File]::WriteAllText((Join-Path $diagnosticOwner 'owner.txt'),[IO.Path]::GetFileName($diagnosticOwner))
 $diagnosticSnapshot=New-AConfigProofSourceSnapshot -Root $diagnosticRoot -Owner $diagnosticOwner
 $diagnosticFrozen=Join-Path $diagnosticOwner 'source'
 $diagnosticNames=@($diagnosticSnapshot.files | ForEach-Object {$_.path})
 $diagnosticActual=@(Get-DIndexSourceFiles -Root $diagnosticFrozen)
 $diagnosticRecord.source_sha256=$diagnosticSnapshot.source_sha256
 $diagnosticRecord.files=$diagnosticNames.Count
 $diagnosticRecord.added=@($diagnosticActual | Where-Object {$_ -cnotin $diagnosticNames})
 $diagnosticRecord.missing=@($diagnosticNames | Where-Object {$_ -cnotin $diagnosticActual})
 $diagnosticRecord.frozen_set_equal=$diagnosticRecord.added.Count -eq 0 -and $diagnosticRecord.missing.Count -eq 0
 $diagnosticRecord.order_equal=($diagnosticNames -join "`n") -ceq ($diagnosticActual -join "`n")
 $diagnosticRecord.frozen_bytes_equal=(Get-DIndexPinDigest -Pins @(Get-DIndexInputPins -Root $diagnosticFrozen -Files $diagnosticNames)) -ceq $diagnosticSnapshot.source_sha256
 Test-DIndexSourceSnapshot -Root $diagnosticFrozen -Manifest $diagnosticSnapshot
} catch {$diagnosticRecord.error=$_.Exception.Message} finally {
 if(Test-Path -LiteralPath $diagnosticOwner){
  $diagnosticResolved=(Resolve-Path -LiteralPath $diagnosticOwner).Path
  if($diagnosticResolved -cne $diagnosticOwner -or [IO.Path]::GetDirectoryName($diagnosticResolved) -cne $diagnosticRoot -or [IO.Path]::GetFileName($diagnosticResolved) -cne ('.tmp-d-index-cache-'+$diagnosticToken) -or ((Get-Item -Force -LiteralPath $diagnosticResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $diagnosticResolved 'owner.txt')) -cne [IO.Path]::GetFileName($diagnosticResolved)){throw 'Refusing unsafe diagnostic cleanup'}
  foreach($diagnosticChild in @(Get-ChildItem -LiteralPath $diagnosticResolved -Recurse -Force)){if($diagnosticChild.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected diagnostic child'}}
  Remove-Item -LiteralPath $diagnosticResolved -Recurse -Force
 }
 $diagnosticRecord.owner_removed=-not(Test-Path -LiteralPath $diagnosticOwner)
 $diagnosticHandle=[IO.File]::Open($diagnosticOut,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 $diagnosticWriter=[IO.StreamWriter]::new($diagnosticHandle,[Text.UTF8Encoding]::new($false))
 try{$diagnosticWriter.WriteLine(($diagnosticRecord | ConvertTo-Json -Depth 6))}finally{$diagnosticWriter.Dispose()}
 Write-Output ('SNAPSHOT_DIAGNOSTIC='+$diagnosticOut)
 $diagnosticRecord | ConvertTo-Json -Depth 6
}
if($diagnosticRecord.error){throw $diagnosticRecord.error}
