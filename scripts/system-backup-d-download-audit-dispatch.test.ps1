$ErrorActionPreference='Stop'
$auditTokens=$null;$auditParseErrors=$null
$auditAST=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'system-backup-d-download-audit-validation.ps1'),[ref]$auditTokens,[ref]$auditParseErrors)
if($auditParseErrors.Count){throw 'Audit wrapper syntax error'}
$auditAssignments=@($auditAST.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$auditCommand'},$true))
if($auditAssignments.Count -ne 1){throw 'Expected one dedicated audit dispatch'}
function Get-AuditDispatchFixture {
    $auditRemote='/tmp/clawmanager-d-download-audit-'+('1'*32)
    $auditArchiveHash='2'*64;$auditRunnerHash='3'*64;$auditBinaryHash='4'*64;$auditInputHash='5'*64
    . ([scriptblock]::Create($auditAssignments[0].Extent.Text))
    return $auditCommand
}
$auditFixture=Get-AuditDispatchFixture
$auditPatterns=@("KUBE_CONTEXT='kubernetes-admin@kubernetes'","SOURCE_NAMESPACE='clawmanager-zhanghui08-system'","TEST_NODE='node1'",'D_DB_INVARIANT_SMOKE=1','D_PROVIDER_REGISTRATION_SMOKE=1',
    ("D_MIGRATION_BINARY='/tmp/clawmanager-d-download-audit-"+('1'*32)+"/system-backup-migrate'"),("D_MIGRATION_BINARY_SHA256='"+('3'*64)+"'"),
    ("D_INVARIANT_BINARY='/tmp/clawmanager-d-download-audit-"+('1'*32)+"/d-download-audit.test'"),("D_INVARIANT_BINARY_SHA256='"+('4'*64)+"'"),
    ("D_PROVIDER_REGISTRATION_DDL='/tmp/clawmanager-d-download-audit-"+('1'*32)+"/d-download-audit-inputs.json'"),("D_PROVIDER_REGISTRATION_DDL_SHA256='"+('5'*64)+"'"),
    'bash -n scripts/system-backup-d-provider-registration-phase.sh','bash scripts/system-backup-fresh-migration-smoke.sh')
foreach($auditPattern in $auditPatterns){if(-not $auditFixture.Contains($auditPattern)){throw ('Audit dispatch missing binding: '+$auditPattern)}}
$auditPhase=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-backup-d-download-audit-phase.sh'))
if(($auditPhase -split '-test.run').Count -ne 2 -or -not $auditPhase.Contains('^TestDDownloadAdmissionAuditMySQL$') -or $auditPhase.Contains('^TestDControlHealthMySQL$')){throw 'Audit dispatch must select only its dedicated root'}
Write-Output ('PASS download-audit dispatch bindings='+$auditPatterns.Count+' dedicated-root=yes network=no products=none')
