[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$AcceptedSourceManifest)
$ErrorActionPreference='Stop'
$ownedCheckRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ownedCheckSource=Get-Content -Raw -LiteralPath $AcceptedSourceManifest|ConvertFrom-Json
$ownedCheckRecovery=$ownedCheckSource.native_fs_recovery
$ownedCheckContainers=@('codex-a-ldap-request-b60c12b55e514f29861ac9784827c4a8','codex-a-ldap-request-dc94a690e6ab4afaa69b0727ea226f9a','codex-a-ldap-nativefs-run-cd67638d6e494159b80d4d92915f45cf',$ownedCheckRecovery.container)
$ownedCheckVolumes=@('codex-a-ldap-nativefs-cd67638d6e494159b80d4d92915f45cf',$ownedCheckRecovery.volume)
$ownedCheckObservedContainers=@(& docker ps -a --format '{{.Names}}')
if($LASTEXITCODE -ne 0){throw 'Docker container inventory failed'}
$ownedCheckObservedVolumes=@(& docker volume ls --format '{{.Name}}')
if($LASTEXITCODE -ne 0){throw 'Docker volume inventory failed'}
if(@($ownedCheckObservedContainers|Where-Object {$_ -in $ownedCheckContainers}).Count -gt 0 -or @($ownedCheckObservedVolumes|Where-Object {$_ -in $ownedCheckVolumes}).Count -gt 0){throw 'Owned Docker object still exists'}
$ownedCheckResult=[ordered]@{recorded_at=[DateTime]::UtcNow.ToString('o');read_only=$true;docker_exit=0;inventory_complete=$true;exact_containers=$ownedCheckContainers;exact_volume=$ownedCheckRecovery.volume;prior_volume=$ownedCheckVolumes[0];observed_container_names=@($ownedCheckObservedContainers|Where-Object {$_ -in $ownedCheckContainers});observed_volume_names=@($ownedCheckObservedVolumes|Where-Object {$_ -in $ownedCheckVolumes});foreign_inventory_omitted=$true;source_manifest=[IO.Path]::GetRelativePath($ownedCheckRoot,[IO.Path]::GetFullPath($AcceptedSourceManifest)).Replace('\','/')}
$ownedCheckPath=Join-Path $PSScriptRoot 'a-ldap-owned-container-volume-check-20261016.json'
if(Test-Path -LiteralPath $ownedCheckPath){throw 'Cleanup receipt already exists'}
[IO.File]::WriteAllText($ownedCheckPath,($ownedCheckResult|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output 'PASS exact-owned-containers=4 absent=yes exact-owned-volumes=2 absent=yes read-only=yes'
