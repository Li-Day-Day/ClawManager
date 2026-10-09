#!/usr/bin/env node
// D-only public composition. No owner adapters, credentials or cluster writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMigrationCatalog } from './system-backup-contract-check.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = raw => createHash('sha256').update(raw).digest('hex');
export const jsonBytes = value => `${JSON.stringify(value, null, 2)}\n`;
export const capacityReportPath = '/run/system-backup/capacity/report.json';
export const capacityConfigPath = '/run/system-backup/capacity-config/source.json';
export const capacityBinary = '/usr/local/bin/clawreef-system-backup-registration';
export function capacityTables() {
  const registry = JSON.parse(readFileSync(resolve(root, 'contracts/system-backup/v12/schema-registry.json')));
  return registry.objects.filter(o => o.object_type === 'table' && /^(system_backup_|system_restore_|audit_logs$)/.test(o.name)).map(o => o.name).sort();
}
export function capacityTemplate() {
  return { namespace: 'clawmanager-zhanghui08-system', namespace_uid: '', context: '', image: '', migration_catalog_sha256: computeMigrationCatalog().hash,
    mysql_pod: '', mysql_pod_uid: '', mysql_container: '', mysql_node: '', mysql_data_pvc: '', mysql_data_subpath: '',
    data_directory: '/var/lib/mysql', server_uuid: '', database: 'clawmanager', collector_db_user: '',
    collector_uid: 0, report_gid: 65532, credentials_secret: '', report_pvc: '' };
}
export function renderCapacityDeployment(input) {
  assert.ok(input && !Array.isArray(input));
  assert.deepEqual(Object.keys(input).sort(), Object.keys(capacityTemplate()).sort(), 'unknown or missing fields');
  const name = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
  for (const key of ['namespace', 'mysql_pod', 'mysql_container', 'mysql_node', 'mysql_data_pvc', 'credentials_secret', 'report_pvc']) {
    assert.ok(typeof input[key] === 'string' && name.test(input[key]) && input[key].length <= (key === 'namespace' ? 63 : 253), `invalid ${key}`);
  }
  for (const key of ['namespace_uid', 'mysql_pod_uid']) assert.match(input[key], /^[a-zA-Z0-9-]{1,128}$/);
  assert.match(input.context, /^[A-Za-z0-9][A-Za-z0-9_.@:/-]{0,252}$/);
  assert.match(input.image, /^[a-zA-Z0-9][a-zA-Z0-9./_:-]*@sha256:[0-9a-f]{64}$/);
  assert.equal(input.migration_catalog_sha256, computeMigrationCatalog().hash, 'catalog mismatch');
  assert.match(input.server_uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  for (const key of ['database', 'collector_db_user']) assert.match(input[key], /^[A-Za-z0-9_]{1,64}$/);
  assert.notEqual(input.collector_db_user.toLowerCase(), 'root');
  assert.ok(Number.isSafeInteger(input.collector_uid) && input.collector_uid > 0 && input.collector_uid <= 2147483647);
  assert.equal(input.report_gid, 65532, 'must match existing HTTP/bootstrap group');
  assert.ok(typeof input.data_directory === 'string' && /^\/[A-Za-z0-9_./-]+$/.test(input.data_directory) && posix.normalize(input.data_directory) === input.data_directory && input.data_directory !== '/' && !input.data_directory.split('/').includes('..'));
  assert.ok(!input.data_directory.startsWith('/run') && !'/run/system-backup'.startsWith(`${input.data_directory}/`), 'data mount overlaps runtime mounts');
  assert.ok(input.mysql_data_subpath === '' || /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(input.mysql_data_subpath));
  assert.notEqual(input.mysql_data_pvc, input.report_pvc, 'report must not share MySQL PVC');
  const source = { server_uuid: input.server_uuid, database: input.database, user: input.collector_db_user, data_directory: input.data_directory, tables: capacityTables() };
  const raw = jsonBytes(source), hash = sha256(raw), configName = `sbk-capacity-${hash.slice(0, 16)}`;
  const labels = { 'app.kubernetes.io/name': 'system-backup-capacity' };
  const metadata = name => ({ name, namespace: input.namespace, labels });
  const securityContext = { runAsNonRoot: true, runAsUser: input.collector_uid, runAsGroup: input.report_gid, seccompProfile: { type: 'RuntimeDefault' } };
  const containerSecurity = { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } };
  const command = [capacityBinary, '--capacity-config', capacityConfigPath];
  const collector = { apiVersion: 'apps/v1', kind: 'Deployment', metadata: metadata('system-backup-capacity'), spec: {
    replicas: 0, strategy: { type: 'Recreate' }, selector: { matchLabels: labels }, template: { metadata: { labels }, spec: {
      serviceAccountName: 'system-backup-capacity', automountServiceAccountToken: false, securityContext,
      affinity: { nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [{ matchFields: [{ key: 'metadata.name', operator: 'In', values: [input.mysql_node] }] }] } } },
      containers: [{ name: 'collector', image: input.image, imagePullPolicy: 'IfNotPresent', command: [...command, '--collect-capacity', capacityReportPath], securityContext: containerSecurity,
        env: [{ name: 'SYSTEM_BACKUP_CAPACITY_CONFIG_SHA256', value: hash }, { name: 'SYSTEM_BACKUP_REGISTRATION_DSN_FILE', value: '/run/system-backup/capacity-credentials/dsn' }],
        resources: { requests: { cpu: '25m', memory: '32Mi' }, limits: { cpu: '250m', memory: '128Mi' } },
        readinessProbe: { exec: { command: [...command, '--check-capacity-source'] }, periodSeconds: 15, timeoutSeconds: 10, failureThreshold: 1 },
        volumeMounts: [
          { name: 'mysql-data', mountPath: input.data_directory, readOnly: true, ...(input.mysql_data_subpath ? { subPath: input.mysql_data_subpath } : {}) },
          { name: 'report', mountPath: '/run/system-backup/capacity' },
          { name: 'config', mountPath: '/run/system-backup/capacity-config', readOnly: true },
          { name: 'credentials', mountPath: '/run/system-backup/capacity-credentials', readOnly: true },
        ] }],
      // Deliberately no fsGroup: kubelet must never recursively chown MySQL data.
      volumes: [
        { name: 'mysql-data', persistentVolumeClaim: { claimName: input.mysql_data_pvc, readOnly: true } },
        { name: 'report', persistentVolumeClaim: { claimName: input.report_pvc } },
        { name: 'config', configMap: { name: configName, defaultMode: 292 } },
        { name: 'credentials', secret: { secretName: input.credentials_secret, defaultMode: 292, items: [{ key: 'dsn', path: 'dsn' }] } },
      ],
    } } } };
  return { source, report: { status: 'renderable', scope: 'offline_capacity_composition', config_sha256: hash, table_count: source.tables.length,
    initial_replicas: 0, mysql_restart_required: false, cluster_checked: false, grants_checked: false, report_storage_required: 'preprovisioned distinct RWX filesystem PVC; root directory group 65532 mode 2770',
    note: '0444 projected credential is isolated to collector container; no fsGroup or data-volume permission changes', configuration_activated: false },
  manifest: { apiVersion: 'v1', kind: 'List', items: [
    { apiVersion: 'v1', kind: 'ServiceAccount', metadata: metadata('system-backup-capacity'), automountServiceAccountToken: false },
    { apiVersion: 'v1', kind: 'ConfigMap', metadata: metadata(configName), immutable: true, data: { 'source.json': raw } }, collector,
  ] } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.ok((args.length === 2 || args.length === 4) && args[0] === '--input' && (args.length === 2 || args[2] === '--output'));
    const result = renderCapacityDeployment(JSON.parse(readFileSync(resolve(args[1]), 'utf8')));
    if (args.length === 4) writeFileSync(resolve(args[3]), jsonBytes(result.manifest), { flag: 'wx' });
    console.log(jsonBytes(result.report));
  } catch { console.error('Capacity deployment rejected: check public target pins, image, UID and storage inputs; no cluster contacted.'); process.exitCode = 1; }
}
