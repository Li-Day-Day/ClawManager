$ErrorActionPreference='Stop'
$healthTokens=$null;$healthParseErrors=$null
$healthScript=Join-Path $PSScriptRoot 'system-backup-d-control-health-validation.ps1'
$healthAST=[Management.Automation.Language.Parser]::ParseFile($healthScript,[ref]$healthTokens,[ref]$healthParseErrors)
if($healthParseErrors.Count){throw 'Health wrapper has PowerShell syntax errors'}
$healthAssignments=@($healthAST.FindAll({param($node)
    $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -eq '$healthCommand'
},$true))
if($healthAssignments.Count -ne 1){throw 'Expected one dedicated remote command'}
function Get-HealthDispatchFixture {
    $healthRemote='/tmp/clawmanager-d-control-health-'+('1'*32)
    $healthArchiveHash='2'*64;$healthMigrationHash='3'*64;$healthBinaryHash='4'*64;$healthInputHash='5'*64
    . ([scriptblock]::Create($healthAssignments[0].Extent.Text))
    return $healthCommand
}
$healthCommandFixture=Get-HealthDispatchFixture
$healthPatterns=@(
    "KUBE_CONTEXT='kubernetes-admin@kubernetes'",
    "SOURCE_NAMESPACE='clawmanager-zhanghui08-system'",
    "TEST_NODE='node1'",
    "D_DB_INVARIANT_SMOKE=1",
    "D_PROVIDER_REGISTRATION_SMOKE=1",
    ("D_MIGRATION_BINARY='/tmp/clawmanager-d-control-health-"+('1'*32)+"/system-backup-migrate'"),
    ("D_MIGRATION_BINARY_SHA256='"+('3'*64)+"'"),
    ("D_INVARIANT_BINARY='/tmp/clawmanager-d-control-health-"+('1'*32)+"/d-control-health.test'"),
    ("D_INVARIANT_BINARY_SHA256='"+('4'*64)+"'"),
    ("D_PROVIDER_REGISTRATION_DDL='/tmp/clawmanager-d-control-health-"+('1'*32)+"/d-control-health-inputs.json'"),
    ("D_PROVIDER_REGISTRATION_DDL_SHA256='"+('5'*64)+"'"),
    'bash -n scripts/system-backup-d-provider-registration-phase.sh',
    'bash scripts/system-backup-fresh-migration-smoke.sh'
)
if($healthPatterns.Count -ne 13){throw 'Expected thirteen complete dispatch assertions'}
foreach($expected in $healthPatterns){if(-not $healthCommandFixture.Contains($expected)){throw ('Missing production dispatch binding: '+$expected)}}
$healthPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-d-control-health-phase.sh'))
if([regex]::Matches($healthPhase,'-test.run "\^TestDControlHealthMySQL\$"').Count -ne 1){throw 'Remote phase must run only the exact new root'}
if($healthPhase -match 'TestDConfig|TestAConfig|TestDAdmin'){throw 'Health phase repeats unrelated old suites'}
if($healthPhase -notmatch 'D_CONTROL_HEALTH_INPUTS_SHA256="\$4"'){throw 'Actual capsule pin not passed to root'}
Write-Output ('PASS control-health dispatch bindings='+$healthPatterns.Count+' dedicated-root=yes network=no products=none')
