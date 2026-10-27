[CmdletBinding()]
param(
 [switch]$Remote,
 [switch]$FreezeOnly,
 [ValidateRange(1,4)][int]$BuildParallelism=1,
 [Parameter(Mandatory=$true)][string]$SourceManifestPath,
 [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SshTarget='root@10.130.14.23'
)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
if($Remote -and $FreezeOnly){throw 'FreezeOnly does not allow remote execution'}
$readRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$readProvider=$null;$readDrive=$null
$readManifest=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SourceManifestPath,[ref]$readProvider,[ref]$readDrive)
$readManifest=[IO.Path]::GetFullPath($readManifest)
if($readProvider.Name -ne 'FileSystem' -or [IO.Path]::GetDirectoryName($readManifest) -ne [IO.Path]::GetFullPath((Join-Path $readRoot 'docs/evidence')) -or [IO.Path]::GetFileName($readManifest) -notmatch '^[A-Za-z0-9._-]+\.json$'){throw 'Source manifest must be a new JSON file directly inside docs/evidence'}
$readReceipt=$readManifest+'.result.json'
foreach($readOutput in @($readManifest,$readReceipt)){if(Test-Path -LiteralPath $readOutput){throw 'Choose new source manifest and result filenames'}}
$readCursor=Join-Path $readRoot 'docs/evidence'
while($true){if((Get-Item -LiteralPath $readCursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected evidence directory'};if($readCursor -ceq $readRoot){break};$readCursor=[IO.Path]::GetDirectoryName($readCursor)}
. (Join-Path $PSScriptRoot 'system-backup-d-index-source-snapshot.ps1')
$readOwner=Join-Path $readRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$readSource=Join-Path $readOwner 'source';$readOwnerName=[IO.Path]::GetFileName($readOwner)
$readOwned=$false;$readSnapshot=$null;$readChildExit=$null;$readPost=$false;$readCleanup=$null;$readError=$null;$readStatus='failed'
function Write-ReadNewJSON([string]$File,$Value){$readBytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 10));$readStream=[IO.File]::Open($File,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$readStream.Write($readBytes,0,$readBytes.Length);$readStream.Flush($true)}finally{$readStream.Dispose()}}
try{
 if(Test-Path -LiteralPath $readOwner){throw 'Existing verification detail owner'}
 [IO.Directory]::CreateDirectory($readOwner)|Out-Null
 $readMarker=[IO.File]::Open((Join-Path $readOwner 'owner.txt'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$readMarkerBytes=[Text.Encoding]::UTF8.GetBytes($readOwnerName);$readMarker.Write($readMarkerBytes,0,$readMarkerBytes.Length);$readMarker.Flush($true)}finally{$readMarker.Dispose()}
 $readOwned=$true
 Write-Output ('LOCAL_OWNER verification-detail-source='+$readOwner)
 $readSnapshot=New-DIndexSourceSnapshot -Root $readRoot -Destination $readSource
 Write-ReadNewJSON -File $readManifest -Value ([ordered]@{kind='d_verification_detail_source.v1';owner=$readOwner;source_sha256=$readSnapshot.source_sha256;files=$readSnapshot.files;stable_copy_verified=$readSnapshot.stable_copy_verified;freeze_only=[bool]$FreezeOnly;remote_requested=[bool]$Remote;dependencies_installed=$false;production_approval=$false})
 Write-Output ('LOCAL_SOURCE verification-detail-frozen=yes source_sha256='+$readSnapshot.source_sha256+' files='+$readSnapshot.files.Count)
 if(-not $FreezeOnly){
  $readProbe=Join-Path $readSource 'backend/cmd/server/system_backup_read_verification_history_mysql_test.go'
  $readParent=Join-Path $readSource 'backend/cmd/server/system_backup_read_live_mysql_test.go'
  if(-not (Test-Path -LiteralPath $readProbe) -or -not [IO.File]::ReadAllText($readProbe).Contains('synthetic_cases=16 actual_provider=no production_approval=no') -or -not [IO.File]::ReadAllText($readParent).Contains('testDVerificationDetailHTTPHistoryMySQL(t, db, ctx,')){throw 'Frozen source lacks the reviewed sixteen-case history probe'}
  $readPwshName=if($IsWindows){'pwsh.exe'}else{'pwsh'}
  $readPwsh=Join-Path $PSHOME $readPwshName
  if(-not (Test-Path -LiteralPath $readPwsh -PathType Leaf)){throw 'Current PowerShell executable is unavailable'}
  $readArguments=@('-NoProfile','-File',(Join-Path $readSource 'scripts/system-backup-a-evidence-validation.ps1'),'-AdminReadOnly','-BuildParallelism',[string]$BuildParallelism,'-SshTarget',$SshTarget)
  if($Remote){$readArguments+='-Remote'}
  Push-Location $readSource
  try{& $readPwsh @readArguments;$readChildExit=$LASTEXITCODE}finally{Pop-Location}
  if($readChildExit -ne 0){throw ('Admin read validation failed exit='+$readChildExit+'; preserve any CLEANUP_PENDING identity in the log')}
 }
 Test-DIndexSourceSnapshot -Root $readSource -Manifest $readSnapshot;$readPost=$true
 $readStatus=if($FreezeOnly){'snapshot_only_verified'}else{'profile_completed_actual_results_require_review'}
 Write-Output ('LOCAL_PASS verification-detail-frozen-postcheck=yes freeze-only='+[bool]$FreezeOnly+' dependencies-installed=no remote-requested='+[bool]$Remote)
}catch{$readError=$_.Exception.Message;throw}finally{
 try{
  if($readOwned -and (Test-Path -LiteralPath $readOwner)){
   $readResolved=(Resolve-Path -LiteralPath $readOwner).Path
   if($readResolved -cne $readOwner -or [IO.Path]::GetDirectoryName($readResolved) -cne $readRoot -or [IO.Path]::GetFileName($readResolved) -cne $readOwnerName -or [IO.File]::ReadAllText((Join-Path $readOwner 'owner.txt')) -cne $readOwnerName){throw 'Wrong verification detail cleanup owner'}
   if((Get-Item -LiteralPath $readOwner -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cleanup owner'}
   $readChildren=@(Get-ChildItem -LiteralPath $readOwner -Recurse -Force)
   foreach($readEntry in $readChildren){if(($readEntry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $readEntry.FullName.StartsWith($readOwner+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Redirected cleanup child'}}
   $readCount=@($readChildren|Where-Object{-not $_.PSIsContainer}).Count
   Remove-Item -LiteralPath $readOwner -Recurse -Force
   if(Test-Path -LiteralPath $readOwner){throw 'Verification detail cleanup incomplete'}
   $readCleanup=[ordered]@{owner=$readOwner;removed=$true;files_removed=$readCount;test_build_artifacts_removed=$true}
   Write-Output ('LOCAL_CLEANUP verification-detail-source-owned='+$readOwner+' removed=True')
  }
 }catch{$readStatus='failed';$readError=$_.Exception.Message;throw}finally{
  Write-ReadNewJSON -File $readReceipt -Value ([ordered]@{kind='d_verification_detail_validation.v1';status=$readStatus;source_sha256=$readSnapshot.source_sha256;child_exit=$readChildExit;source_postcheck=$readPost;freeze_only=[bool]$FreezeOnly;remote_requested=[bool]$Remote;actual_mysql_results_accepted=$false;dependencies_installed=$false;cleanup=$readCleanup;error=$readError})
 }
}
