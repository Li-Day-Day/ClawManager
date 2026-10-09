#!/usr/bin/env node
// Read-only kubectl get/exec and fixed SELECT/SHOW statements only. Raw SQL,
// provider errors, credentials and schema defaults are never written to output.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { capacityBinary, capacityConfigPath, capacityReportPath, renderCapacityDeployment, root, sha256, jsonBytes } from './system-backup-d-capacity-deployment.mjs';
import { compareDSchemaRecords } from './system-backup-schema-diff.mjs';
import { computeMigrationCatalog } from './system-backup-contract-check.mjs';

const catalog = () => ({ ...computeMigrationCatalog(), filenames: readdirSync(resolve(root, 'backend/internal/db/migrations')).filter(f => f.endsWith('.sql')).sort() });
const registry = () => JSON.parse(readFileSync(resolve(root, 'contracts/system-backup/v12/schema-registry.json')));
const captureSQL = () => readFileSync(resolve(root, 'contracts/system-backup/v12/schema-hash-capture.mysql.sql'), 'utf8');
export function checkFreshReference(reference, expectedCatalog = catalog().hash) {
  assert.deepEqual(Object.keys(reference).sort(), ['catalog_sha256', 'records', 'records_sha256'].sort());
  assert.equal(reference.catalog_sha256, expectedCatalog, 'fresh reference catalog mismatch');
  assert.equal(sha256(reference.records), reference.records_sha256, 'fresh reference bytes mismatch');
  assert.ok(reference.records.length > 0 && Buffer.byteLength(reference.records) <= 64 * 1024 * 1024);
}
function cleanDataDir(value) { return typeof value === 'string' ? value.replace(/\/$/, '') : ''; }
function sameFingerprint(a, b, container) {
  const identity = p => [p.metadata?.uid, p.spec?.nodeName, ...(p.status?.containerStatuses ?? []).filter(c => c.name === container).flatMap(c => [c.containerID, c.restartCount])];
  return JSON.stringify(identity(a)) === JSON.stringify(identity(b));
}
export function runRuntimePreflight(plan, { reference, collectorPod, run = spawnSync, expectedRegistry = registry(), expectedCatalog = catalog(), sql = captureSQL() } = {}) {
  const rendered = renderCapacityDeployment(plan);
  if (reference) checkFreshReference(reference, expectedCatalog.hash);
  if (collectorPod) assert.match(collectorPod, /^[a-z0-9][a-z0-9.-]{0,252}$/);
  const checks = [], blockers = [];
  let probeStage = 'read_only_probe';
  const report = { status: 'BLOCKED', scope: 'D capacity deployment and D schema read-only preflight', observed_at: new Date().toISOString(), checks, blockers,
    cluster_mutated: false, database_mutated: false, configuration_activated: false, human_mfa_verified: false, owner_admission: 'not_run',
    fresh_reference_provenance: reference ? 'operator_supplied_pinned_bytes; replay_receipt_requires_review' : 'missing' };
  function check(name, ok) { checks.push({ name, passed: !!ok }); if (!ok) blockers.push(name); return !!ok; }
  function command(args, input) {
    const getIndex = args.indexOf('get');
    probeStage = getIndex >= 0 ? `read_${args[getIndex + 1]}`
      : input?.startsWith('SELECT JSON_OBJECT') ? 'database_identity_query'
      : input?.startsWith('SELECT filename') ? 'migration_ledger_query'
      : input ? 'schema_capture_query'
      : args.includes('--check-capacity-source') ? 'collector_source_check'
      : args.includes('mount-check') ? 'collector_mount_permissions' : 'collector_report_read';
    const result = run('kubectl', [`--context=${plan.context}`, '--request-timeout=20s', ...args], { input, encoding: 'utf8', shell: false, windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    if (result.error || result.signal || result.status !== 0) throw new Error('read_failed');
    return String(result.stdout);
  }
  const ns = [`--namespace=${plan.namespace}`];
  const get = (kind, name, global = false) => JSON.parse(command([...(global ? [] : ns), 'get', kind, name, '-o', 'json']));
  const exec = (pod, container, args, input) => command([...ns, 'exec', '-i', pod, '-c', container, '--', ...args], input);
  const mysql = query => exec(plan.mysql_pod, plan.mysql_container, ['sh', '-c', 'set -eu; MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --batch --raw --skip-column-names --default-character-set=utf8mb4 --database="$1"', 'd-readonly-preflight', plan.database], query);
  try {
    if (!check('namespace_uid_matches', get('namespace', plan.namespace, true).metadata?.uid === plan.namespace_uid)) return report;
    const mysqlPod = get('pod', plan.mysql_pod);
    if (!check('mysql_pod_identity', mysqlPod.metadata?.uid === plan.mysql_pod_uid && mysqlPod.spec?.nodeName === plan.mysql_node && mysqlPod.status?.phase === 'Running' && mysqlPod.status.containerStatuses?.some(c => c.name === plan.mysql_container && c.containerID && c.state?.running))) return report;
    const container = mysqlPod.spec.containers?.find(c => c.name === plan.mysql_container);
    const mount = container?.volumeMounts?.find(m => cleanDataDir(m.mountPath) === plan.data_directory);
    const dataVolume = mysqlPod.spec.volumes?.find(v => v.name === mount?.name);
    if (!check('mysql_data_mount_matches', !!mount && !mount.subPathExpr && (mount.subPath ?? '') === plan.mysql_data_subpath && dataVolume?.persistentVolumeClaim?.claimName === plan.mysql_data_pvc)) return report;
    const dataPVC = get('pvc', plan.mysql_data_pvc), reportPVC = get('pvc', plan.report_pvc);
    check('mysql_pvc_multi_pod_mount_supported', dataPVC.status?.phase === 'Bound' && (dataPVC.spec.volumeMode ?? 'Filesystem') === 'Filesystem' && dataPVC.spec.accessModes?.some(v => ['ReadWriteOnce', 'ReadWriteMany'].includes(v)) && !dataPVC.spec.accessModes.includes('ReadWriteOncePod'));
    check('report_pvc_shared_filesystem', reportPVC.status?.phase === 'Bound' && (reportPVC.spec.volumeMode ?? 'Filesystem') === 'Filesystem' && reportPVC.spec.accessModes?.includes('ReadWriteMany') && !!reportPVC.spec.volumeName && reportPVC.spec.volumeName !== dataPVC.spec.volumeName);
    // Explicit PV identity comparison catches two PVCs pointing to one backing
    // CSI/NFS/hostPath volume. This profile accepts a CSI or NFS report volume.
    if (dataPVC.spec.volumeName && reportPVC.spec.volumeName) {
      const dataPV = get('pv', dataPVC.spec.volumeName, true), reportPV = get('pv', reportPVC.spec.volumeName, true);
      const backing = pv => pv.spec.csi ? ['csi', pv.spec.csi.driver, pv.spec.csi.volumeHandle] : pv.spec.nfs ? ['nfs', pv.spec.nfs.server, pv.spec.nfs.path] : pv.spec.hostPath ? ['hostPath', plan.mysql_node, pv.spec.hostPath.path] : null;
      const a = backing(dataPV), b = backing(reportPV);
      check('distinct_supported_volume_backings', !!a && !!b && b[0] !== 'hostPath' && JSON.stringify(a) !== JSON.stringify(b));
    } else check('distinct_supported_volume_backings', false);
    // Secret data never enters this process: kubectl emits only key presence.
    check('collector_dsn_key_present', command([...ns, 'get', 'secret', plan.credentials_secret, '-o', 'go-template={{if index .data "dsn"}}present{{end}}']).trim() === 'present');
    const identitySQL = "SELECT JSON_OBJECT('server_uuid',@@server_uuid,'database',DATABASE(),'data_directory',@@datadir,'now',DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%dT%H:%i:%s.%fZ'));";
    const identity = JSON.parse(mysql(identitySQL));
    if (!check('database_identity_matches', identity.server_uuid === plan.server_uuid && identity.database === plan.database && cleanDataDir(identity.data_directory) === plan.data_directory)) return report;
    const filenames = mysql('SELECT filename FROM schema_migrations ORDER BY filename;').trim().split(/\r?\n/);
    const expectedNames = expectedCatalog.filenames;
    // Do not accept counts alone or quietly ignore historical extra migrations.
    report.migrations = { expected_count: expectedNames.length, observed_count: filenames.length,
      missing: expectedNames.filter(f => !filenames.includes(f)), unexpected: filenames.filter(f => !expectedNames.includes(f)) };
    check('migration_filenames_match', !report.migrations.missing.length && !report.migrations.unexpected.length && new Set(filenames).size === filenames.length);
    if (reference) {
      const diff = compareDSchemaRecords(reference.records, mysql(sql), expectedRegistry);
      // Only paths are emitted; raw defaults/definitions can contain sensitive literals.
      report.schema = { table_count: diff.table_count, difference_count: diff.difference_count, paths: diff.differences.map(d => d.path), truncated: diff.differences_truncated };
      check('d_schema_matches_pinned_fresh_reference', diff.matched);
    } else check('d_schema_reference_required', false);
    if (collectorPod) {
      const liveCollector = get('pod', collectorPod), expectedPod = rendered.manifest.items.find(i => i.kind === 'Deployment').spec.template.spec;
      const live = liveCollector.spec.containers?.find(c => c.name === 'collector'), expected = expectedPod.containers[0];
      const same = isDeepStrictEqual;
      const selected = (xs, name) => xs?.find(x => x.name === name);
      const projectionsMatch = expectedPod.volumes.every(v => { const actual = selected(liveCollector.spec.volumes, v.name); return actual && Object.keys(v).every(k => same(actual[k], v[k])); });
      const mountsMatch = live && expected.volumeMounts.every(m => { const actual = selected(live.volumeMounts, m.name); return actual && (actual.readOnly ?? false) === (m.readOnly ?? false) && (actual.subPath ?? '') === (m.subPath ?? '') && !actual.subPathExpr && Object.keys(m).every(k => same(actual[k], m[k])); });
      const security = { ...liveCollector.spec.securityContext, ...live?.securityContext };
      const podMatches = liveCollector.spec.nodeName === plan.mysql_node && live?.image === plan.image && same(live.command, expected.command)
        && expected.env.every(e => selected(live.env, e.name)?.value === e.value) && projectionsMatch && mountsMatch
        && live.volumeMounts.length === expected.volumeMounts.length && liveCollector.spec.containers.length === 1 && !liveCollector.spec.initContainers?.length
        && liveCollector.spec.automountServiceAccountToken === false && !liveCollector.spec.hostPID && !liveCollector.spec.hostIPC && !liveCollector.spec.hostNetwork
        && security.runAsUser === plan.collector_uid && security.runAsGroup === plan.report_gid && liveCollector.spec.securityContext?.fsGroup == null && !liveCollector.spec.securityContext?.supplementalGroups?.length
        && security.runAsNonRoot === true && !security.privileged && security.allowPrivilegeEscalation === false && security.readOnlyRootFilesystem === true
        && same(security.capabilities, { drop: ['ALL'] }) && same(security.seccompProfile, { type: 'RuntimeDefault' });
      if (check('collector_live_spec_matches', podMatches)) {
        const sample = JSON.parse(exec(collectorPod, 'collector', [capacityBinary, '--capacity-config', capacityConfigPath, '--check-capacity-source']));
        check('collector_identity_grants_data_readable', sample.server_uuid === plan.server_uuid && sample.database === plan.database && Number.isSafeInteger(sample.available_bytes) && sample.available_bytes >= 0);
        // test only: no touch, chmod, chown, or fabricated report. stat verifies
        // group access for the separately running HTTP/bootstrap UID 65532.
        const mode = exec(collectorPod, 'collector', ['sh', '-c', 'set -eu; test -r "$1/auto.cnf"; test -w "$2"; test ! -w "$1"; stat -c "%a:%g" "$2"; stat -c "%a:%g" "$3"', 'mount-check', plan.data_directory, '/run/system-backup/capacity', capacityReportPath]).trim().split(/\r?\n/);
        check('report_group_permissions', mode.length === 2 && mode[0] === `2770:${plan.report_gid}` && mode[1] === `640:${plan.report_gid}`);
        const reportRaw = exec(collectorPod, 'collector', ['cat', capacityReportPath]);
        const sampleOnDisk = JSON.parse(reportRaw), after = JSON.parse(mysql(identitySQL));
        const age = Date.parse(after.now) - Date.parse(sampleOnDisk.observed_at);
        check('capacity_report_fresh_matching_identity', after.server_uuid === plan.server_uuid && after.database === plan.database && sampleOnDisk.server_uuid === plan.server_uuid && sampleOnDisk.database === plan.database && Number.isFinite(age) && age >= 0 && age <= 5000 && Number.isSafeInteger(sampleOnDisk.allocated_bytes) && sampleOnDisk.allocated_bytes >= 0 && Number.isSafeInteger(sampleOnDisk.available_bytes) && sampleOnDisk.available_bytes >= 0);
        check('collector_unchanged_during_probe', sameFingerprint(liveCollector, get('pod', collectorPod), 'collector'));
      }
    } else check('collector_runtime_probe_required', false);
    check('mysql_unchanged_during_probe', sameFingerprint(mysqlPod, get('pod', plan.mysql_pod), plan.mysql_container));
    check('namespace_uid_still_matches', get('namespace', plan.namespace, true).metadata?.uid === plan.namespace_uid);
  } catch { check(`${probeStage}_failed_or_output_invalid`, false); }
  report.status = blockers.length ? 'BLOCKED' : 'PASS_D_SCOPE';
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), opts = {};
    assert.ok(args.length % 2 === 0);
    for (let i = 0; i < args.length; i += 2) { assert.ok(['--input', '--fresh-reference', '--collector-pod'].includes(args[i]) && !opts[args[i]]); opts[args[i]] = args[i + 1]; }
    assert.ok(opts['--input']);
    const plan = JSON.parse(readFileSync(resolve(opts['--input']), 'utf8'));
    const reference = opts['--fresh-reference'] ? JSON.parse(readFileSync(resolve(opts['--fresh-reference']), 'utf8')) : undefined;
    const result = runRuntimePreflight(plan, { reference, collectorPod: opts['--collector-pod'] });
    console.log(jsonBytes(result)); process.exitCode = result.status === 'PASS_D_SCOPE' ? 0 : 2;
  } catch { console.error('Read-only preflight input rejected; no raw driver or credential output retained.'); process.exitCode = 1; }
}
