$ErrorActionPreference='Stop'
$capacityTokens=$null;$capacityErrors=$null
$capacityPath=Join-Path $PSScriptRoot 'system-backup-mysql-startup-diagnostic.ps1'
$capacityAST=[Management.Automation.Language.Parser]::ParseFile($capacityPath,[ref]$capacityTokens,[ref]$capacityErrors)
if($capacityErrors.Count){throw 'Startup wrapper parse failed'}
$capacityFunction=$capacityAST.Find({param($a) $a -is [Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq 'Get-NodePodCapacityCommand'},$true)
if(-not $capacityFunction){throw 'Missing capacity command builder'}
. ([scriptblock]::Create($capacityFunction.Extent.Text))
$capacityBody="printf '%s\n' 'capacity-payload'`n"
$capacityEncoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($capacityBody))
$capacityCommand=Get-NodePodCapacityCommand -EncodedScript $capacityEncoded
if($capacityCommand -cne ('bash -c "set -euo pipefail; printf ''%s'' '''+$capacityEncoded+''' | base64 -d | bash -s -- ''kubernetes-admin@kubernetes'' ''node1''"')){throw 'Unexpected capacity command or target'}
if([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($capacityEncoded)) -cne $capacityBody){throw 'Capacity payload changed'}
foreach($capacityBad in @('AA','AA=','AAAA===',"AA'bad",'AA;bad',"AA`nbad")){
    $capacityRejected=$false
    try{$null=Get-NodePodCapacityCommand -EncodedScript $capacityBad}catch{$capacityRejected=$true}
    if(-not $capacityRejected){throw 'Unsafe/invalid encoded input accepted'}
}
Write-Output 'PASS node-pod-capacity-dispatch: validated encoding and fixed context/node with pipeline failure propagation'
$capacityAssignments=@($capacityAST.FindAll({param($a) $a -is [Management.Automation.Language.AssignmentStatementAst]},$true))
foreach($capacityPlan in @(@('diagnosticFiles','scripts/system-backup-d-node-pod-capacity.sh',3),@('diagnosticSyntaxScripts','system-backup-d-node-pod-capacity.sh',2))){
    $capacityAssignment=@($capacityAssignments | Where-Object {$_.Operator -eq 'Equals' -and $_.Left.Extent.Text -ceq ('$'+$capacityPlan[0])})
    if($capacityAssignment.Count -ne 1){throw 'Ambiguous preparation plan'}
    $NodeCapacityOnly=$true
    $capacitySelected=@(& ([scriptblock]::Create($capacityAssignment[0].Right.Extent.Text)))
    if($capacitySelected.Count -ne 1 -or $capacitySelected[0] -cne $capacityPlan[1]){throw 'Read-only payload includes extra sources'}
    $NodeCapacityOnly=$false
    $capacitySelected=@(& ([scriptblock]::Create($capacityAssignment[0].Right.Extent.Text)))
    if($capacitySelected.Count -ne $capacityPlan[2]){throw 'Original startup preparation plan changed'}
}
$capacityBranches=@($capacityAST.FindAll({param($a) $a -is [Management.Automation.Language.IfStatementAst] -and $a.Clauses[0].Item1.Extent.Text -ceq '$NodeCapacityOnly' -and $a.Extent.Text.Contains('Get-NodePodCapacityCommand')},$true))
if($capacityBranches.Count -ne 1){throw 'Ambiguous early read-only branch'}
$capacityBranch=$capacityBranches[0].Extent.Text
if($capacityBranch -notmatch 'Get-NodePodCapacityCommand' -or $capacityBranch -notmatch '\$diagnosticSSH @diagnosticSSHOptions' -or $capacityBranch -notmatch 'return\s*\}'){throw 'Missing read-only dispatch/early return'}
if($capacityBranch -match 'diagnosticRemoteAttempted|diagnosticSCP|tar\.exe|mkdir|rm -rf|MYSQL_STARTUP_ONLY'){throw 'Read-only branch reaches a mutating remote path'}
$capacityText=[IO.File]::ReadAllText($capacityPath)
if($capacityText.IndexOf('& tar.exe') -lt $capacityBranches[0].Extent.EndOffset){throw 'Archive step precedes read-only return'}
if($capacityText -notmatch 'if\(\$diagnosticLocalOwned -and \(Test-Path -LiteralPath \$diagnosticScratch\)\)' -or $capacityText -notmatch 'Unsafe redirected diagnostic cleanup path'){throw 'Missing local ownership/path cleanup guards'}
Write-Output 'PASS node-pod-capacity-dispatch: one-file read-only branch returns before archive/SCP/startup, original plans preserved, owned cleanup guarded'
