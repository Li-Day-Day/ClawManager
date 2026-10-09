import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { capacityTemplate, renderCapacityDeployment, capacityTables, root, sha256, capacityConfigPath, capacityBinary, capacityReportPath } from './system-backup-d-capacity-deployment.mjs';
import { checkFreshReference, runRuntimePreflight } from './system-backup-d-runtime-preflight.mjs';

function planFixture() {
  return { ...capacityTemplate(), namespace_uid: 'namespace-test-uid', context: 'synthetic-context', image: `example.invalid/d-test@sha256:${'a'.repeat(64)}`,
    mysql_pod: 'mysql-test', mysql_pod_uid: 'mysql-test-uid', mysql_container: 'mysql', mysql_node: 'test-node', mysql_data_pvc: 'mysql-test-data',
    server_uuid: '11111111-2222-3333-4444-555555555555', collector_db_user: 'capacity_reader', collector_uid: 999, credentials_secret: 'capacity-test-dsn', report_pvc: 'capacity-test-report' };
}
function fakeEnvironment() {
  const plan = planFixture(), rendered = renderCapacityDeployment(plan);
  const registry = JSON.parse(readFileSync(resolve(root, 'contracts/system-backup/v12/schema-registry.json')));
  const records = [['metadata', { server_version: '8.4.8', sql_mode: '' }]];
  for (const t of registry.objects.filter(o => o.owner === 'D')) records.push(['table', { name: t.name }], ['column', { table_name: t.name, name: 'id', ordinal_position: 1, normalized_type: 'int', nullable: 0, default: null, character_set: null, collation: null, extra: '', generation_expression: null }]);
  const raw = records.map(([kind, data]) => `${kind}\t${JSON.stringify(data)}`).join('\n')+'\n';
  const reference = { catalog_sha256: plan.migration_catalog_sha256, records_sha256: sha256(raw), records: raw };
  const mysql = { metadata: { uid: plan.mysql_pod_uid }, spec: { nodeName: plan.mysql_node, containers: [{ name: 'mysql', volumeMounts: [{ name: 'data', mountPath: '/var/lib/mysql' }] }], volumes: [{ name: 'data', persistentVolumeClaim: { claimName: plan.mysql_data_pvc } }] }, status: { phase: 'Running', containerStatuses: [{ name: 'mysql', containerID: 'containerd://mysql-test', restartCount: 0, state: { running: {} } }] } };
  const collector = { metadata: { uid: 'collector-test-uid' }, spec: { ...structuredClone(rendered.manifest.items[2].spec.template.spec), nodeName: plan.mysql_node }, status: { phase: 'Running', containerStatuses: [{ name: 'collector', containerID: 'containerd://collector-test', restartCount: 0, state: { running: {} } }] } };
  const objects = {
    [`namespace/${plan.namespace}`]: { metadata: { uid: plan.namespace_uid } }, [`pod/${plan.mysql_pod}`]: mysql, 'pod/capacity-test': collector,
    [`pvc/${plan.mysql_data_pvc}`]: { spec: { volumeName: 'mysql-pv', accessModes: ['ReadWriteOnce'] }, status: { phase: 'Bound' } },
    [`pvc/${plan.report_pvc}`]: { spec: { volumeName: 'report-pv', accessModes: ['ReadWriteMany'] }, status: { phase: 'Bound' } },
    'pv/mysql-pv': { spec: { hostPath: { path: '/data/mysql-test' } } }, 'pv/report-pv': { spec: { nfs: { server: 'nfs.invalid', path: '/reports-test' } } },
  };
  const identity = { server_uuid: plan.server_uuid, database: plan.database, data_directory: `${plan.data_directory}/`, now: '2026-09-29T01:00:01.000000Z' };
  const capacity = { server_uuid: plan.server_uuid, database: plan.database, observed_at: '2026-09-29T01:00:00.000000Z', allocated_bytes: 100000, available_bytes: 99999999999 };
  const state = { plan, reference, objects, identity, capacity, raw, calls: [], failingSource: false, modes: '2770:65532\n640:65532\n', restart: false };
  state.run = (command, args, options) => {
    assert.equal(command, 'kubectl'); assert.equal(options.shell, false);
    state.calls.push({ args, input: options.input });
    const get = args.indexOf('get');
    if (get >= 0) {
      if (args[get+1] === 'secret') return { status: 0, stdout: 'present' };
      const key = `${args[get+1]}/${args[get+2]}`, obj = structuredClone(objects[key]);
      if (!obj) return { status: 1, stderr: 'SECRET-ERROR-MUST-NOT-LEAK' };
      if (state.restart && key === `pod/${plan.mysql_pod}` && state.calls.filter(c => c.args.includes('get') && c.args.includes(plan.mysql_pod)).length > 1) obj.status.containerStatuses[0].restartCount++;
      return { status: 0, stdout: JSON.stringify(obj) };
    }
    assert.ok(args.includes('exec'));
    let stdout;
    if (options.input?.startsWith('SELECT JSON_OBJECT')) stdout = JSON.stringify(identity);
    else if (options.input?.startsWith('SELECT filename')) stdout = readdirSync(resolve(root, 'backend/internal/db/migrations')).filter(n => n.endsWith('.sql')).sort().join('\n');
    else if (options.input?.startsWith('-- Read-only MySQL')) stdout = state.raw;
    else if (args.includes('--check-capacity-source')) { if (state.failingSource) return { status: 1, stderr: 'SECRET-ERROR-MUST-NOT-LEAK' }; stdout = JSON.stringify(capacity); }
    else if (args.includes('mount-check')) stdout = state.modes;
    else if (args.includes('cat') && args.includes(capacityReportPath)) stdout = JSON.stringify(capacity);
    else assert.fail('unexpected command');
    return { status: 0, stdout };
  };
  return state;
}
const probe = s => runRuntimePreflight(s.plan, { reference: s.reference, collectorPod: 'capacity-test', run: s.run });

test('capacity template remains blank and validates no fabricated identities', () => {
  assert.throws(() => renderCapacityDeployment(capacityTemplate()));
  const template = JSON.parse(readFileSync(resolve(root, 'deployments/k8s/system-backup-capacity.template.json')));
  assert.deepEqual(template, capacityTemplate());
});
test('collector pins database config, least privilege table list, node and distinct read-only data mount', () => {
  const plan = planFixture(), r = renderCapacityDeployment(plan), pod = r.manifest.items[2].spec.template.spec, container = pod.containers[0];
  assert.equal(r.manifest.items[2].spec.replicas, 0);
  assert.equal(pod.securityContext.fsGroup, undefined);
  assert.equal(pod.automountServiceAccountToken, false);
  assert.deepEqual(r.source.tables, capacityTables());
  assert.equal(sha256(r.manifest.items[1].data['source.json']), r.report.config_sha256);
  assert.deepEqual(container.command, [capacityBinary, '--capacity-config', capacityConfigPath, '--collect-capacity', capacityReportPath]);
  assert.equal(container.volumeMounts[0].readOnly, true); assert.equal(pod.volumes[0].persistentVolumeClaim.readOnly, true);
  assert.equal(container.volumeMounts[1].readOnly, undefined);
  assert.ok(!r.manifest.items.some(i => ['Secret','PersistentVolumeClaim','Role'].includes(i.kind)));
});
test('unsafe source, root UID, storage reuse and unknown inputs reject', () => {
  for (const mutate of [
    p => p.image = 'example.invalid/app:latest', p => p.collector_uid = 0, p => p.report_gid = 999,
    p => p.report_pvc = p.mysql_data_pvc, p => p.data_directory = '/', p => p.data_directory = '/run/system-backup',
    p => p.mysql_data_subpath = '../escape', p => p.server_uuid = '', p => p.collector_db_user = 'root',
    p => p.dsn = 'secret', p => p.migration_catalog_sha256 = 'b'.repeat(64),
  ]) { const p = planFixture(); mutate(p); assert.throws(() => renderCapacityDeployment(p)); }
});
test('complete mocked read-only probe passes D scope without mutation or credential output', () => {
  const s = fakeEnvironment(), r = probe(s);
  assert.equal(r.status, 'PASS_D_SCOPE', JSON.stringify(r));
  assert.equal(r.cluster_mutated, false); assert.equal(r.database_mutated, false);
  assert.equal(r.owner_admission, 'not_run');
  assert.ok(s.calls.every(c => c.args.includes('get') || c.args.includes('exec')));
  assert.ok(s.calls.filter(c => c.input).every(c => c.input.startsWith('SELECT ') || c.input.startsWith('-- Read-only MySQL')));
  assert.ok(!JSON.stringify(r).includes('MYSQL_PASSWORD'));
});
test('namespace, Pod and database identity mismatches stop dependent probing', () => {
  for (const field of ['namespace', 'pod', 'database']) {
    const s = fakeEnvironment();
    if (field === 'namespace') s.objects[`namespace/${s.plan.namespace}`].metadata.uid = 'wrong';
    if (field === 'pod') s.objects[`pod/${s.plan.mysql_pod}`].metadata.uid = 'wrong';
    if (field === 'database') s.identity.server_uuid = 'wrong';
    assert.equal(probe(s).status, 'BLOCKED');
    assert.ok(!s.calls.some(c => c.input?.startsWith('SELECT filename')));
  }
});
test('RWOP, nonshared reports, storage alias, unsafe mount and container drift block', () => {
  for (const mutate of [
    s => s.objects[`pvc/${s.plan.mysql_data_pvc}`].spec.accessModes = ['ReadWriteOncePod'],
    s => s.objects[`pvc/${s.plan.report_pvc}`].spec.accessModes = ['ReadWriteOnce'],
    s => s.objects['pv/report-pv'].spec = structuredClone(s.objects['pv/mysql-pv'].spec),
    s => s.objects['pod/capacity-test'].spec.containers[0].volumeMounts[0].readOnly = false,
    s => s.objects['pod/capacity-test'].spec.containers[0].volumeMounts[1].readOnly = true,
    s => s.objects['pod/capacity-test'].spec.containers[0].securityContext.privileged = true,
    s => s.objects['pod/capacity-test'].spec.securityContext.fsGroup = 65532,
    s => s.objects['pod/capacity-test'].spec.securityContext.fsGroup = 0,
    s => s.objects['pod/capacity-test'].spec.securityContext.supplementalGroups = [0],
    s => s.objects['pod/capacity-test'].spec.containers[0].env[0].value = 'b'.repeat(64),
    s => s.objects['pod/capacity-test'].spec.nodeName = 'other',
  ]) { const s = fakeEnvironment(); mutate(s); assert.equal(probe(s).status, 'BLOCKED'); }
});
test('stale report, future clock, inaccessible report, source denial, restart and schema drift cannot pass', () => {
  for (const mutate of [
    s => s.capacity.observed_at = '2026-09-29T00:59:00Z', s => s.capacity.observed_at = '2026-09-29T01:00:02Z',
    s => s.capacity.database = 'other', s => s.modes = '2770:65532\n600:999\n',
    s => s.failingSource = true, s => s.restart = true,
    s => s.raw = s.raw.replace('"normalized_type":"int"', '"normalized_type":"bigint"'),
  ]) { const s = fakeEnvironment(); mutate(s); const r = probe(s); assert.equal(r.status, 'BLOCKED'); assert.ok(!JSON.stringify(r).includes('SECRET-ERROR')); }
});
test('missing fresh baseline and missing collector remain explicitly blocked; mismatched baseline rejects before calls', () => {
  const s = fakeEnvironment();
  const r = runRuntimePreflight(s.plan, { run: s.run });
  assert.ok(r.blockers.includes('d_schema_reference_required')); assert.ok(r.blockers.includes('collector_runtime_probe_required'));
  for (const mutate of [r => r.catalog_sha256 = 'b'.repeat(64), r => r.records += '\n']) {
    const ref = structuredClone(s.reference); mutate(ref); assert.throws(() => checkFreshReference(ref));
  }
});
