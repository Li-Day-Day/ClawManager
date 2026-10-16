import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const events = (path) => read(path).toString('utf8').split(/\r?\n/).map((line) => line.trim())
  .filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
const summarize = (data) => [...new Set(data.map((item) => item.Package))].map((pkg) => {
  const rows = data.filter((item) => item.Package === pkg);
  return { package: pkg, package_pass: rows.some((item) => item.Action === 'pass' && !item.Test),
    top_level_pass: rows.filter((item) => item.Action === 'pass' && item.Test && !item.Test.includes('/')).length,
    including_subtests_pass: rows.filter((item) => item.Action === 'pass' && item.Test).length,
    failed: rows.filter((item) => item.Action === 'fail').length };
});
const logs = [
  'docs/evidence/system-backup-d-independent-node-20261016-r40-final.txt',
  'docs/evidence/system-backup-d-control-health-linux-20261016-r40-fix.txt',
  'docs/evidence/system-backup-d-control-health-linux-20261016-r40-final.txt',
  'docs/evidence/system-backup-d-independent-go-focused-20261016-r40.txt',
  'docs/evidence/system-backup-d-audit-preflight-20261016-r40-final.txt',
  'docs/evidence/system-backup-d-independent-inventory-20261016-r40.txt',
  'docs/evidence/system-backup-d-independent-contract-20261016-r40.txt',
];
assert.match(read(logs[0]).toString('utf8'), /tests 211\b/);
assert.match(read(logs[0]).toString('utf8'), /fail 0\b/);
const goFull = summarize(events(logs[1]));
assert.equal(goFull.length, 2);
assert.ok(goFull.every((item) => item.package_pass && item.failed === 0));
assert.equal(goFull.reduce((sum, item) => sum + item.top_level_pass, 0), 194);
assert.equal(goFull.reduce((sum, item) => sum + item.including_subtests_pass, 0), 479);
const finalHealth = summarize(events(logs[2]));
assert.equal(finalHealth[0].top_level_pass, 3);
assert.ok(finalHealth[0].package_pass && finalHealth[0].failed === 0);
const http = summarize(events(logs[3]));
assert.equal(http[0].top_level_pass, 2);
assert.ok(http[0].package_pass && http[0].failed === 0);
assert.match(read(logs[4]).toString('utf8'), /fixtures cases=42 cluster_actions=none products=none/);
const inventory = JSON.parse(read(logs[5]));
const contract = JSON.parse(read(logs[6]));
assert.equal(inventory.summary.inventoried_objects, 100);
assert.equal(inventory.summary.repository_runtime_create, 0);
assert.equal(contract.migration_catalog.file_count, 95);
assert.equal(contract.summary.policy_pending, 40);
assert.equal(contract.summary.cross_review_pending, 60);
assert.equal(contract.blockers.missing_artifacts.length, 4);
assert.equal(contract.blockers.schema_hash_pending, true);
const authority = JSON.parse(read('docs/evidence/system-backup-d-a-authority-review-20261016-r40.json'));
assert.equal(authority.cases.length, 8);
for (const pin of authority.focused_current_pins) assert.equal(hash(read(pin.path)), pin.sha256);
const cleanup = ['.tmp-a-evidence-66065c2a47994b3caf1b08076b4253dc', 'frontend/dist', 'frontend/node_modules', 'scripts/__pycache__'];
for (const path of cleanup) assert.equal(existsSync(new URL(path, root)), false, `Unexpected generated directory: ${path}`);
const sources = [
  'backend/cmd/server/system_backup_read_live.go', 'backend/cmd/server/system_backup_read_live_test.go',
  'backend/internal/systembackupcontroller/control_health.go', 'backend/internal/systembackupcontroller/control_health_test.go',
  'backend/internal/systembackupread/control_health.go', 'backend/internal/systembackupread/control_health_test.go',
  'backend/internal/systembackupread/overview_control_test.go',
  'frontend/src/pages/admin/backups/BackupLiveOperations.tsx', 'frontend/src/pages/admin/backups/backupLiveOperations.ts',
  'frontend/src/pages/admin/backups/BackupLiveWorkspace.tsx', 'frontend/src/lib/systemBackupI18n.ts',
  'frontend/scripts/system-backups-live-operations.test.mjs', 'frontend/scripts/system-backups-i18n.test.mjs',
  'scripts/system-backup-d-recovery-audit-storage-preflight.ps1', 'scripts/system-backup-d-recovery-audit-storage-preflight.test.ps1',
  'scripts/system-backup-d-recovery-audit-init.py', 'scripts/system-backup-d-recovery-audit-init.test.py',
  'docs/system-backup-d-control-health-proposal-20261016.sql', 'docs/system-backup-d-independent-work-20261016.md',
  'docs/system-backup-d-six-scope-readiness-20261015.md', 'docs/system-backup-d-current-handoff-audit-20261014.md',
  'docs/system-backup-restore-d-role-steps.md', 'docs/system-backup-d-a-authority-preparation-review-20261015.md',
  'docs/system-backup-d-config-maintenance-receipt-review-20261015.md', 'docs/system-backup-d-recovery-audit-deployment-preflight-20261012.md',
];
for (const path of sources.filter((path) => path.endsWith('.md'))) {
  for (const [, link] of read(path).toString('utf8').matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(link)) continue;
    assert.ok(existsSync(new URL(link.split('#')[0], new URL(path, root))), `Broken link: ${path}: ${link}`);
  }
}
const pins = (paths) => paths.map((path) => ({ path, sha256: hash(read(path)), bytes: read(path).length }));
const report = {
  kind: 'd_independent_work_final_local_audit', recorded_at: new Date().toISOString(), result: 'PASS_FOR_LISTED_LOCAL_SCOPE_ONLY',
  node_tests: 211, full_linux_go_before_final_autocommit_restriction: goFull, final_autocommit_health_only: finalHealth,
  focused_http_source_tests: http, focused_windows_wrapper_overall_pass: false, audit_preflight_cases: 42,
  linux_initializer: { observed_tool_exit: 0, tests: 8, skipped: 0, raw_transcript: 'tool output only',
    image: 'sha256:8d9d0b8bcf6506481eae4907c18f5e3e7902e629f5f6d684f9e7c32e85e3ddf0' },
  go_image: 'sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039',
  inventory_native_exit: 0, strict_contract_native_exit: 1, frontend_build_native_exit: 1, full_server_build_test_pass: false,
  dependency_installation: false, image_pull: false, tested_new_container_label_observed_empty: 'codex.task=d-independent-20261016',
  checked_absent_directories: cleanup, authority_eight_case_review: 'docs/evidence/system-backup-d-a-authority-review-20261016-r40.json',
  current_source_hashes_recorded_after_tests: pins(sources), evidence_logs: pins(logs),
  current_tree_frozen_or_approved: false, new_schema_installed: false, production_health_enabled: false,
  full_frontend_or_browser_verified: false, production_approval: false, original_goal_complete: false,
};
writeFileSync(new URL('./system-backup-d-independent-final-check-20261016-r40.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ result: report.result, sources: sources.length, logs: logs.length, node: 211, go_top_level: 194, audit_preflight: 42, goal_complete: false }));
