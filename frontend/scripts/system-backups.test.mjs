import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from '../../scripts/system-backup-a-schema-validation.mjs';
import { filterBackups, formatBytes, unavailableBackupSource } from '../src/pages/admin/backups/backupReadModel.ts';
import { createBackupPreview, previewBackupSource } from '../src/pages/admin/backups/backupPreview.ts';
import { BackupReadError, createBackupApiReadClient } from '../src/pages/admin/backups/backupApiRead.ts';
import { collectBackupTaskPages, readFirstBackupTaskPage, readNextBackupTaskPage } from '../src/pages/admin/backups/backupReadPages.ts';
import { createBackupLiveSource, liveBackupReadEnabled, nextBackupReadDelay } from '../src/pages/admin/backups/backupLiveSource.ts';
import { startBackupLivePolling } from '../src/pages/admin/backups/backupLivePolling.ts';

test('live read polling backs off errors and bounds refresh intervals', () => {
  assert.equal(nextBackupReadDelay({ kind: 'ready' }, 0), 30_000);
  assert.equal(nextBackupReadDelay({ kind: 'unavailable' }, 0), 60_000);
  assert.deepEqual([1, 2, 3, 10].map((failures) => nextBackupReadDelay({ kind: 'error' }, failures)),
    [5_000, 10_000, 20_000, 60_000]);
});

test('live polling avoids overlapping reads, pauses hidden tabs and discards stopped results', async () => {
  const queued = new Map();
  let nextId = 0;
  const scheduler = {
    set(callback, delay) { const id = ++nextId; queued.set(id, { callback, delay }); return id; },
    clear(id) { queued.delete(id); },
  };
  const fire = () => {
    const [id, scheduled] = queued.entries().next().value;
    queued.delete(id);
    scheduled.callback();
    return scheduled.delay;
  };
  const pending = [];
  const states = [];
  let visible = true;
  let before = 0;
  const poll = startBackupLivePolling({ read() {
    return new Promise((resolve) => pending.push(resolve));
  } }, (state) => states.push(state.kind), () => { before += 1; }, () => visible, scheduler);
  assert.equal(before, 1);
  poll.wake();
  assert.equal(pending.length, 1, 'wake cannot overlap an in-flight read');
  pending.shift()({ kind: 'ready', data: {} });
  await Promise.resolve();
  assert.deepEqual(states, ['ready']);
  assert.equal(queued.size, 1);
  visible = false;
  assert.equal(fire(), 30_000);
  assert.equal(before, 1, 'hidden page cannot read');
  visible = true;
  poll.wake();
  assert.equal(fire(), 0);
  assert.equal(before, 2);
  poll.stop();
  pending.shift()({ kind: 'error' });
  await Promise.resolve();
  assert.deepEqual(states, ['ready'], 'stopped read cannot publish a stale result');
  assert.equal(queued.size, 0);
});

// Resolve the repository's draft schemas for the existing dependency-free
// validator. No schema copies, generated fixture files or network resolution.
const contractRoot = new URL('../../contracts/system-backup/v12/', import.meta.url);
const documents = new Map();
function document(name) {
  if (!documents.has(name)) documents.set(name, JSON.parse(readFileSync(new URL(name, contractRoot), 'utf8')));
  return documents.get(name);
}
function resolved(schema, file) {
  if (Array.isArray(schema)) return schema.map((item) => resolved(item, file));
  if (!schema || typeof schema !== 'object') return schema;
  if ('default' in schema) {
    // JSON Schema defaults annotate inputs; they do not validate a response.
    const { default: ignored, ...withoutDefault } = schema;
    void ignored;
    return resolved(withoutDefault, file);
  }
  if ('maxProperties' in schema) {
    // The activity contract repeats its closed nine-field bound. Prove the
    // keyword redundant before adapting it for the shared test validator.
    assert.equal(schema.additionalProperties, false);
    assert.ok(Object.keys(schema.properties).length <= schema.maxProperties);
    const { maxProperties: ignored, ...closed } = schema;
    void ignored;
    return resolved(closed, file);
  }
  if (schema.$ref) {
    const [relative, fragment] = schema.$ref.split('#');
    const targetFile = relative || file;
    const target = fragment.slice(1).split('/').reduce((value, key) => value[key], document(targetFile));
    const { $ref: ignored, ...siblings } = schema;
    void ignored;
    return { allOf: [resolved(target, targetFile), resolved(siblings, file)] };
  }
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, resolved(value, file)]));
}
function schema(file, name) { return resolved(document(file).$defs[name], file); }
const redactedConfigValues = document('admin-control-redacted-examples.json').config_update_request.config;
function configResource(version, active = false) {
  return {
    schema_version: 'system-backup-config.v1', origin_installation_id: 'installation_fixture', version,
    row_version: version, active, effective_enabled: false, config: redactedConfigValues,
    created_by: '42', change_reason: null, created_at: '2026-10-12T00:00:00Z',
  };
}

test('preview read projections conform to the existing draft JSON schemas', () => {
  const detailFile = 'admin-task-detail-resources.schema.json';
  const schemas = {
    backups: schema(detailFile, 'BackupDetailResource'), drills: schema(detailFile, 'DrillDetailResource'),
    preflights: schema(detailFile, 'PreflightDetailResource'), verifications: schema(detailFile, 'ArtifactVerificationDetailResource'),
    events: schema('admin-activity-resources.schema.json', 'EventResource'),
    logs: schema('admin-activity-resources.schema.json', 'LogEntryResource'),
  };
  for (const scenario of ['ready', 'empty', 'disabled', 'logs_expired']) {
    const data = createBackupPreview(scenario);
    assert.equal(data.source, 'preview');
    assert.ok(validate(schema('admin-control-resources.schema.json', 'OverviewResource'), data.overview), `${scenario}: overview`);
    for (const [key, definition] of Object.entries(schemas)) {
      data[key].forEach((row, index) => assert.ok(validate(definition, row), `${scenario}: ${key}[${index}]`));
    }
  }
  const invalid = structuredClone(createBackupPreview('ready').backups[0]);
  invalid.acceptance_eligible = false;
  assert.equal(validate(schemas.backups, invalid), false, 'eligible reason cannot survive an ineligible verdict');
  const extra = { ...createBackupPreview('ready').backups[0], unregistered_field: true };
  assert.equal(validate(schemas.backups, extra), false, 'DTOs stay closed');
});

test('default source never reports fixture data as an installed system', async () => {
  assert.deepEqual(await unavailableBackupSource.read(new AbortController().signal), { kind: 'unavailable' });
});

test('Admin read client binds pagination and resource IDs without fixture fallback', async () => {
  const paths = [];
  const client = createBackupApiReadClient(async (path) => {
    paths.push(path);
    return new Response(JSON.stringify({ items: [], next_cursor: null, consistency: 'eventual' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await client.list('backups', signal, { limit: 2, status: 'succeeded', cursor: 'next+page' }), {
    items: [], next_cursor: null, consistency: 'eventual',
  });
  assert.equal(paths[0], '/api/v1/admin/system-backups?limit=2&cursor=next%2Bpage&status=succeeded');
  await assert.rejects(client.detail('drills', 'sbk_00000000-0000-0000-0000-000000000001', signal),
    (error) => error instanceof BackupReadError && error.code === 'invalid_resource_id');
  assert.equal(paths.length, 1);
});

test('Admin read client rejects fixture responses and malformed list envelopes', async () => {
  const signal = new AbortController().signal;
  const fixture = createBackupApiReadClient(async () => new Response('{}', {
    headers: { 'X-System-Backup-Data-Source': 'fixture' },
  }));
  await assert.rejects(fixture.overview(signal), (error) => error instanceof BackupReadError && error.code === 'fixture_source');
  const malformed = createBackupApiReadClient(async () => new Response(JSON.stringify({ items: {}, next_cursor: null, consistency: 'stable_cutoff' })));
  await assert.rejects(malformed.list('backups', signal), (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  const denied = createBackupApiReadClient(async () => new Response(JSON.stringify({ code: 'permission_denied' }), { status: 403 }));
  await assert.rejects(denied.config(signal), (error) => error instanceof BackupReadError && error.status === 403 && error.code === 'permission_denied');
});

test('Admin read client preserves cancellation and never returns a late response', async () => {
  const controller = new AbortController();
  const client = createBackupApiReadClient(async () => {
    controller.abort();
    return new Response(JSON.stringify({ schema_version: 'system-backup-overview.v1' }));
  });
  await assert.rejects(client.overview(controller.signal), { name: 'AbortError' });
});

test('Admin read client addresses versioned config and bounded task activity', async () => {
  const paths = [];
  const client = createBackupApiReadClient(async (path) => {
    paths.push(path);
    return new Response(JSON.stringify(path.includes('/versions/') ? configResource(4)
      : { items: [], next_cursor: null, consistency: 'stable_cutoff' }));
  });
  const signal = new AbortController().signal;
  await client.configVersion(4, signal);
  await client.activity('backups', 'sbk_00000000-0000-4000-8000-000000000001', 'logs', signal, { limit: 1000, cursor: 'page-2' });
  assert.deepEqual(paths, [
    '/api/v1/admin/system-backup-config/versions/4',
    '/api/v1/admin/system-backups/sbk_00000000-0000-4000-8000-000000000001/logs?limit=1000&cursor=page-2',
  ]);
  assert.throws(() => client.activity('backups', 'sbk_00000000-0000-4000-8000-000000000001', 'events', signal, { limit: 501 }),
    (error) => error instanceof BackupReadError && error.code === 'invalid_limit');
  assert.equal(paths.length, 2);
});

test('Admin config history read checks closed resources and descending versions', async () => {
  const signal = new AbortController().signal;
  const paths = [];
  const first = configResource(4, true);
  const second = configResource(3);
  const client = createBackupApiReadClient(async (path) => {
    paths.push(path);
    return new Response(JSON.stringify({ items: [first, second], next_cursor: 'next', consistency: 'stable_cutoff' }));
  });
  const page = await client.configVersions(signal, { limit: 2, cursor: 'prior' });
  assert.deepEqual(page.items.map((item) => item.version), [4, 3]);
  assert.ok(validate(schema('admin-control-resources.schema.json', 'ConfigResourceList'), page));
  assert.deepEqual(paths, ['/api/v1/admin/system-backup-config/versions?limit=2&cursor=prior']);
  for (const items of [
    [second, first],
    [first, { ...second, active: true }],
    [{ ...first, canonical_config_json: '{}' }, second],
    [{ ...first, effective_enabled: true }, second],
    [{ ...first, config: { ...redactedConfigValues, credential: 'raw' } }, second],
    [{ ...first, config: { ...redactedConfigValues, durations: { ...redactedConfigValues.durations, token: 'raw' } } }, second],
    [{ ...first, config: { ...redactedConfigValues, references: [
      { ...redactedConfigValues.references[0], uri: 'raw' }, ...redactedConfigValues.references.slice(1),
    ] } }, second],
  ]) {
    const malformed = createBackupApiReadClient(async () => new Response(JSON.stringify({ items, next_cursor: 'next', consistency: 'stable_cutoff' })));
    await assert.rejects(malformed.configVersions(signal, { limit: 2 }),
      (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  }
  const short = createBackupApiReadClient(async () => new Response(JSON.stringify({ items: [first], next_cursor: 'next', consistency: 'stable_cutoff' })));
  await assert.rejects(short.configVersions(signal, { limit: 2 }),
    (error) => error instanceof BackupReadError && error.code === 'invalid_response');
});

test('Admin operation read requires an exact redacted operation', async () => {
  const operation = document('redacted-examples.json').examples.operation;
  assert.ok(validate(schema('task-operation.schema.json', 'Operation'), operation));
  const signal = new AbortController().signal;
  const paths = [];
  const client = createBackupApiReadClient(async (path) => {
    paths.push(path);
    return new Response(JSON.stringify(operation));
  });
  assert.equal((await client.operation(operation.public_id, signal)).public_id, operation.public_id);
  assert.deepEqual(paths, [`/api/v1/admin/system-backup-operations/${operation.public_id}`]);
  await assert.rejects(client.operation('sop_invalid', signal),
    (error) => error instanceof BackupReadError && error.code === 'invalid_resource_id');
  assert.equal(paths.length, 1);
  for (const altered of [
    { ...operation, public_id: 'sop_99999999-9999-4999-8999-999999999999' },
    { ...operation, failure_message: 'unreviewed raw failure' },
    { ...operation, external_action_public_ids_canonical_json: '[]' },
    { ...operation, target_public_id: 'sdr_22222222-2222-4222-8222-222222222222' },
    { ...operation, status: 'succeeded' },
  ]) {
    const bad = createBackupApiReadClient(async () => new Response(JSON.stringify(altered)));
    await assert.rejects(bad.operation(operation.public_id, signal),
      (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  }
});

test('Admin operation list checks every item and pagination boundary', async () => {
  const operation = document('redacted-examples.json').examples.operation;
  const signal = new AbortController().signal;
  const paths = [];
  const client = createBackupApiReadClient(async (path) => {
    paths.push(path);
    return new Response(JSON.stringify({ items: [operation], next_cursor: null, consistency: 'stable_cutoff' }));
  });
  const result = await client.operations(signal, { limit: 2 });
  assert.equal(result.items[0].public_id, operation.public_id);
  assert.deepEqual(paths, ['/api/v1/admin/system-backup-operations?limit=2']);
  for (const altered of [
    { items: [operation], next_cursor: 'next', consistency: 'stable_cutoff' },
    { items: [operation, operation], next_cursor: null, consistency: 'stable_cutoff' },
    { items: [{ ...operation, public_id: 'sop_00000000-0000-4000-8000-000000000002', origin_installation_id: 'installation_other', target_public_id: 'installation_other' }, operation], next_cursor: null, consistency: 'stable_cutoff' },
    { items: [{ ...operation, failure_message: 'raw secret' }], next_cursor: null, consistency: 'stable_cutoff' },
    { items: [operation], next_cursor: null, consistency: 'eventual' },
  ]) {
    const bad = createBackupApiReadClient(async () => new Response(JSON.stringify(altered)));
    await assert.rejects(bad.operations(signal, { limit: 2 }),
      (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  }
});

test('Admin activity read rejects unreviewed event and log fields', async () => {
  const snapshot = createBackupPreview('ready');
  const id = snapshot.backups[0].task.public_id;
  const signal = new AbortController().signal;
  const details = {
    previous_status: null, current_status: 'succeeded', reason: null, attempt_number: 1,
    operation_public_id: null, evidence_public_id: null, truncated: false, original_size: null, content_hash: null,
  };
  const event = { ...snapshot.events[0], details };
  const log = snapshot.logs[0];
  const client = createBackupApiReadClient(async (path) => new Response(JSON.stringify({
    items: [path.endsWith('/logs') ? log : event], next_cursor: null, consistency: 'stable_cutoff',
  })));
  assert.equal((await client.activity('backups', id, 'events', signal)).items[0].details.attempt_number, 1);
  assert.equal((await client.activity('backups', id, 'logs', signal)).items[0].phase, 'publish');
  for (const [channel, item] of [
    ['events', { ...event, raw_payload: 'secret' }],
    ['events', { ...event, details: { ...details, provider_uri: 'secret' } }],
    ['events', { ...event, task_status: 'restoring' }],
    ['logs', { ...log, evidence_locator: 'secret' }],
    ['logs', { ...log, phase: 'restore' }],
  ]) {
    const bad = createBackupApiReadClient(async () => new Response(JSON.stringify({
      items: [item], next_cursor: null, consistency: 'stable_cutoff',
    })));
    await assert.rejects(bad.activity('backups', id, channel, signal),
      (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  }
});

test('Admin overview read enforces closed state and measured counts', async () => {
  const overview = createBackupPreview('ready').overview;
  const signal = new AbortController().signal;
  const client = createBackupApiReadClient(async () => new Response(JSON.stringify(overview)));
  assert.equal((await client.overview(signal)).config_version, overview.config_version);
  assert.ok(validate(schema('admin-control-resources.schema.json', 'OverviewResource'), overview));
  for (const altered of [
    { ...overview, provider_uri: 'raw' },
    { ...overview, controller_health: 'ready' },
    { ...overview, active_task_count: -1 },
    { ...overview, observed_at: 'not-a-date' },
    { ...overview, shortage_failure_domains: [{ ...overview.shortage_failure_domains[0], raw_source: 'secret' }] },
  ]) {
    const bad = createBackupApiReadClient(async () => new Response(JSON.stringify(altered)));
    await assert.rejects(bad.overview(signal),
      (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  }
});

test('Admin read client accepts matching task and activity projections', async () => {
  const snapshot = createBackupPreview('ready');
  const backup = snapshot.backups[0];
  const event = snapshot.events[0];
  const signal = new AbortController().signal;
  const client = createBackupApiReadClient(async (path) => new Response(JSON.stringify(path.endsWith('/events')
    ? { items: [event], next_cursor: null, consistency: 'stable_cutoff' }
    : path.endsWith(backup.task.public_id) ? backup
      : { items: [backup.task], next_cursor: null, consistency: 'stable_cutoff' })));
  assert.equal((await client.detail('backups', backup.task.public_id, signal)).task.public_id, backup.task.public_id);
  assert.equal((await client.list('backups', signal)).items[0].public_id, backup.task.public_id);
  assert.equal((await client.activity('backups', backup.task.public_id, 'events', signal)).items[0].target_public_id, backup.task.public_id);
});

test('task lists and task details keep their distinct v12 wire shapes', async () => {
  const detail = createBackupPreview('ready').backups[0];
  const list = { items: [detail.task], next_cursor: null, consistency: 'stable_cutoff' };
  assert.equal(validate(schema('task-operation.schema.json', 'TaskList'), list), true);
  const client = createBackupApiReadClient(async () => new Response(JSON.stringify(list)));
  assert.equal((await client.list('backups', new AbortController().signal)).items[0].public_id, detail.task.public_id);
  const wrong = createBackupApiReadClient(async () => new Response(JSON.stringify({ ...list, items: [detail] })));
  await assert.rejects(wrong.list('backups', new AbortController().signal),
    (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  const leaked = createBackupApiReadClient(async () => new Response(JSON.stringify({
    ...list, items: [{ ...detail.task, config_snapshot_json: '{"secret":"raw"}' }],
  })));
  await assert.rejects(leaked.list('backups', new AbortController().signal),
    (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  for (const invalidTask of [
    { ...detail.task, retry_of_public_id: 'sdr_00000000-0000-4000-8000-000000000001' },
    { ...detail.task, deadline_at: 'not-a-date' },
    ...['retry_of_public_id', 'failure_message', 'heartbeat_at', 'next_reconcile_at', 'started_at', 'finished_at'].map((field) => {
      const missing = { ...detail.task };
      delete missing[field];
      return missing;
    }),
  ]) {
    const invalid = createBackupApiReadClient(async () => new Response(JSON.stringify({ ...list, items: [invalidTask] })));
    await assert.rejects(invalid.list('backups', new AbortController().signal),
      (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  }
});

test('all four Admin detail reads reject raw owner and execution fields', async () => {
  const preview = createBackupPreview('ready');
  const signal = new AbortController().signal;
  const resources = {
    backups: preview.backups[0], drills: preview.drills[0],
    preflights: preview.preflights[0], verifications: preview.verifications[0],
  };
  for (const [kind, detail] of Object.entries(resources)) {
    const client = createBackupApiReadClient(async () => new Response(JSON.stringify(detail)));
    assert.equal((await client.detail(kind, detail.task.public_id, signal)).task.public_id, detail.task.public_id);
    const altered = [
      { ...detail, raw_job_status: 'secret' },
      { ...detail, execution: { ...detail.execution, private_job_uid: 'secret' } },
      { ...detail, verifier_summary: { ...detail.verifier_summary, expected_json: 'secret' } },
    ];
    if (kind !== 'backups') altered.push({ ...detail, source: { ...detail.source, provider_uri: 'secret' } });
    for (const row of altered) {
      const bad = createBackupApiReadClient(async () => new Response(JSON.stringify(row)));
      await assert.rejects(bad.detail(kind, detail.task.public_id, signal),
        (error) => error instanceof BackupReadError && error.code === 'invalid_response');
    }
  }
});

test('Admin read client rejects mismatched resources and malformed cursor envelopes', async () => {
  const backup = createBackupPreview('ready').backups[0];
  const signal = new AbortController().signal;
  for (const body of [
    { items: [{ ...backup.task, task_type: 'drill' }], next_cursor: null, consistency: 'stable_cutoff' },
    { items: [backup.task], next_cursor: '', consistency: 'stable_cutoff' },
    { items: [backup.task], next_cursor: 'é'.repeat(2049), consistency: 'stable_cutoff' },
    { items: [backup.task], next_cursor: null, consistency: 'stable_cutoff', unexpected: true },
  ]) {
    const client = createBackupApiReadClient(async () => new Response(JSON.stringify(body)));
    await assert.rejects(client.list('backups', signal), (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  }
  const wrongDetail = createBackupApiReadClient(async () => new Response(JSON.stringify({ ...backup, task: { ...backup.task, public_id: 'sbk_00000000-0000-4000-8000-000000000009' } })));
  await assert.rejects(wrongDetail.detail('backups', backup.task.public_id, signal), (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  const incompleteDetail = createBackupApiReadClient(async () => new Response(JSON.stringify({ ...backup, task: { ...backup.task, deadline_at: undefined } })));
  await assert.rejects(incompleteDetail.detail('backups', backup.task.public_id, signal),
    (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  const leakedDetail = createBackupApiReadClient(async () => new Response(JSON.stringify({ ...backup, task: { ...backup.task, config_snapshot_json: '{}' } })));
  await assert.rejects(leakedDetail.detail('backups', backup.task.public_id, signal),
    (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  const mutable = createBackupApiReadClient(async () => new Response(JSON.stringify({ items: [], next_cursor: null, consistency: 'stable_cutoff' })));
  await assert.rejects(mutable.list('backups', signal, { status: 'succeeded' }), (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  await assert.rejects(mutable.list('backups', signal, { cursor: 'é'.repeat(2049) }), (error) => error instanceof BackupReadError && error.code === 'invalid_cursor');
  await assert.rejects(mutable.list('backups', signal, { status: 'restoring' }),
    (error) => error instanceof BackupReadError && error.code === 'invalid_status');
  const eventual = createBackupApiReadClient(async () => new Response(JSON.stringify({ items: [], next_cursor: null, consistency: 'eventual' })));
  await assert.rejects(eventual.list('backups', signal),
    (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  const mixed = createBackupApiReadClient(async () => new Response(JSON.stringify({
    items: [backup.task], next_cursor: null, consistency: 'eventual',
  })));
  await assert.rejects(mixed.list('backups', signal, { status: 'failed' }),
    (error) => error instanceof BackupReadError && error.code === 'invalid_response');
});

test('Admin read client rejects wrong overview, config and activity identities', async () => {
  const snapshot = createBackupPreview('ready');
  const backup = snapshot.backups[0];
  const signal = new AbortController().signal;
  const badOverview = createBackupApiReadClient(async () => new Response(JSON.stringify({ ...snapshot.overview, origin_installation_id: 'other' })));
  await assert.rejects(badOverview.overview(signal), (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  const badConfig = createBackupApiReadClient(async () => new Response(JSON.stringify({
    schema_version: 'system-backup-config.v1', origin_installation_id: 'installation_fixture', version: 3, active: true,
    effective_enabled: false, config: {},
  })));
  await assert.rejects(badConfig.configVersion(4, signal), (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  const badEvent = createBackupApiReadClient(async () => new Response(JSON.stringify({
    items: [{ ...snapshot.events[0], target_public_id: 'sbk_00000000-0000-4000-8000-000000000009' }],
    next_cursor: null, consistency: 'stable_cutoff',
  })));
  await assert.rejects(badEvent.activity('backups', backup.task.public_id, 'events', signal),
    (error) => error instanceof BackupReadError && error.code === 'invalid_response');
});

test('Admin read client rejects an abort during JSON decoding', async () => {
  const controller = new AbortController();
  const client = createBackupApiReadClient(async () => ({
    status: 200, ok: true, headers: new Headers(),
    async json() { controller.abort(); return { schema_version: 'system-backup-overview.v1' }; },
  }));
  await assert.rejects(client.overview(controller.signal), { name: 'AbortError' });
});

test('task page collection follows opaque cursors and preserves one installation', async () => {
  const [first, second] = createBackupPreview('ready').backups.map((item) => item.task);
  const seen = [];
  const reader = { async list(kind, _signal, options) {
    seen.push({ kind, ...options });
    return options.cursor
      ? { items: [second], next_cursor: null, consistency: 'stable_cutoff' }
      : { items: [first], next_cursor: 'opaque-next', consistency: 'stable_cutoff' };
  } };
  const result = await collectBackupTaskPages(reader, 'backups', new AbortController().signal, { limit: 1 });
  assert.deepEqual(result.items.map((task) => task.public_id), [first.public_id, second.public_id]);
  assert.equal(result.origin_installation_id, 'installation_preview');
  assert.deepEqual(seen.map(({ cursor }) => cursor), [undefined, 'opaque-next']);
});

test('on-demand task pages fetch one page at a time and reject unsafe continuations', async () => {
  const [first, second] = createBackupPreview('ready').backups.map((item) => item.task);
  const signal = new AbortController().signal;
  const calls = [];
  let later = { items: [second], next_cursor: null, consistency: 'stable_cutoff' };
  const reader = { async list(_kind, _signal, options) {
    calls.push(options);
    return options.cursor ? later : { items: [first], next_cursor: 'opaque-next', consistency: 'stable_cutoff' };
  } };
  const firstPage = await readFirstBackupTaskPage(reader, 'backups', signal, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(firstPage.items.map((item) => item.public_id), [first.public_id]);
  const complete = await readNextBackupTaskPage(reader, 'backups', firstPage, signal);
  assert.deepEqual(calls[1], { limit: 1, cursor: 'opaque-next' });
  assert.deepEqual(complete.items.map((item) => item.public_id), [first.public_id, second.public_id]);
  assert.equal(await readNextBackupTaskPage(reader, 'backups', complete, signal), complete);
  assert.equal(calls.length, 2);
  for (const [page, code] of [
    [{ items: [], next_cursor: 'opaque-next', consistency: 'stable_cutoff' }, 'cursor_loop'],
    [{ items: [first], next_cursor: null, consistency: 'stable_cutoff' }, 'duplicate_resource'],
    [{ items: [{ ...second, origin_installation_id: 'other' }], next_cursor: null, consistency: 'stable_cutoff' }, 'installation_changed'],
    [{ items: [second], next_cursor: null, consistency: 'eventual' }, 'consistency_changed'],
  ]) {
    later = page;
    await assert.rejects(readNextBackupTaskPage(reader, 'backups', firstPage, signal),
      (error) => error instanceof BackupReadError && error.code === code);
  }
});

test('task page collection refuses cursor loops, duplicates, mixed installations and incomplete budgets', async () => {
  const [first, second] = createBackupPreview('ready').backups.map((item) => item.task);
  const signal = new AbortController().signal;
  const sequence = (later) => ({ async list(_kind, _signal, options) {
    return options.cursor ? later : { items: [first], next_cursor: 'same-cursor', consistency: 'stable_cutoff' };
  } });
  for (const [later, code] of [
    [{ items: [], next_cursor: 'same-cursor', consistency: 'stable_cutoff' }, 'cursor_loop'],
    [{ items: [first], next_cursor: null, consistency: 'stable_cutoff' }, 'duplicate_resource'],
    [{ items: [{ ...second, origin_installation_id: 'installation_other' }], next_cursor: null, consistency: 'stable_cutoff' }, 'installation_changed'],
    [{ items: [second], next_cursor: null, consistency: 'eventual' }, 'consistency_changed'],
  ]) {
    await assert.rejects(collectBackupTaskPages(sequence(later), 'backups', signal),
      (error) => error instanceof BackupReadError && error.code === code);
  }
  await assert.rejects(collectBackupTaskPages(sequence({ items: [second], next_cursor: null, consistency: 'stable_cutoff' }),
    'backups', signal, { maxPages: 1 }), (error) => error instanceof BackupReadError && error.code === 'pagination_limit');
});

test('task page collection stops after cancellation without returning partial rows', async () => {
  const controller = new AbortController();
  const first = createBackupPreview('ready').backups[0].task;
  const reader = { async list() { controller.abort(); return { items: [first], next_cursor: null, consistency: 'stable_cutoff' }; } };
  await assert.rejects(collectBackupTaskPages(reader, 'backups', controller.signal), { name: 'AbortError' });
});

test('live read source assembles only authenticated read resources', async () => {
  const preview = createBackupPreview('ready');
  const overview = { ...preview.overview, origin_installation_id: 'installation_live' };
  const config = { schema_version: 'system-backup-config.v1', origin_installation_id: 'installation_live',
    version: overview.config_version, effective_enabled: overview.effective_enabled, active: true, config: {} };
  const calls = [];
  const client = {
    async overview() { calls.push('overview'); return overview; },
    async config() { calls.push('config'); return config; },
    async list(kind) { calls.push(kind); return { items: [], next_cursor: null, consistency: 'stable_cutoff' }; },
  };
  const result = await createBackupLiveSource(client).read(new AbortController().signal);
  assert.equal(result.kind, 'ready');
  assert.deepEqual(Object.keys(result.data).sort(), ['backups', 'config', 'drills', 'overview', 'preflights', 'verifications']);
  assert.deepEqual(calls, ['overview', 'config', 'backups', 'drills', 'preflights', 'verifications', 'overview']);
  assert.deepEqual(result.data.backups.items, []);
  assert.equal(result.data.backups.next_cursor, null);
});

test('live read source rejects config drift during task page reads', async () => {
  const preview = createBackupPreview('ready');
  const overview = { ...preview.overview, origin_installation_id: 'installation_live' };
  const config = { schema_version: 'system-backup-config.v1', origin_installation_id: 'installation_live',
    version: overview.config_version, effective_enabled: overview.effective_enabled, active: true, config: {} };
  let reads = 0;
  const client = {
    async overview() {
      reads += 1;
      return reads === 1 ? overview : { ...overview, config_version: overview.config_version + 1 };
    },
    async config() { return config; },
    async list() { return { items: [], next_cursor: null, consistency: 'stable_cutoff' }; },
  };
  assert.deepEqual(await createBackupLiveSource(client).read(new AbortController().signal), { kind: 'error' });
  assert.equal(reads, 2);
});

test('live source loads later pages only when requested', async () => {
  const preview = createBackupPreview('ready');
  const overview = { ...preview.overview, origin_installation_id: 'installation_live' };
  const config = { schema_version: 'system-backup-config.v1', origin_installation_id: 'installation_live',
    version: overview.config_version, effective_enabled: overview.effective_enabled, active: true, config: {} };
  const [first, second] = preview.backups.map((item) => ({ ...item.task, origin_installation_id: 'installation_live' }));
  const calls = [];
  const client = { async overview() { return overview; }, async config() { return config; },
    async list(kind, _signal, options) {
      calls.push({ kind, ...options });
      return kind === 'backups' && options.cursor
        ? { items: [second], next_cursor: null, consistency: 'stable_cutoff' }
        : { items: kind === 'backups' ? [first] : [], next_cursor: kind === 'backups' ? 'next' : null, consistency: 'stable_cutoff' };
    } };
  const source = createBackupLiveSource(client);
  const result = await source.read(new AbortController().signal);
  assert.equal(result.kind, 'ready');
  assert.equal(calls.length, 4);
  assert.equal(result.data.backups.items.length, 1);
  const next = await source.loadMore('backups', result.data.backups, result.data.overview, new AbortController().signal);
  assert.equal(next.items.length, 2);
  assert.deepEqual(calls[4], { kind: 'backups', limit: 50, cursor: 'next' });
  await assert.rejects(source.loadMore('backups', result.data.backups,
    { ...result.data.overview, origin_installation_id: 'another_installation' }, new AbortController().signal),
    (error) => error instanceof BackupReadError && error.code === 'installation_changed');
});

test('live source rejects a later page after config changes', async () => {
  const preview = createBackupPreview('ready');
  const overview = { ...preview.overview, origin_installation_id: 'installation_live' };
  const config = { schema_version: 'system-backup-config.v1', origin_installation_id: 'installation_live',
    version: overview.config_version, effective_enabled: overview.effective_enabled, active: true, config: {} };
  const [first, second] = preview.backups.map((item) => ({ ...item.task, origin_installation_id: 'installation_live' }));
  let drift = false;
  const client = {
    async overview() { return drift ? { ...overview, config_version: overview.config_version + 1 } : overview; },
    async config() { return config; },
    async list(kind, _signal, options) {
      return kind === 'backups' && options.cursor
        ? { items: [second], next_cursor: null, consistency: 'stable_cutoff' }
        : { items: kind === 'backups' ? [first] : [], next_cursor: kind === 'backups' ? 'next' : null, consistency: 'stable_cutoff' };
    },
  };
  const source = createBackupLiveSource(client);
  const initial = await source.read(new AbortController().signal);
  assert.equal(initial.kind, 'ready');
  drift = true;
  await assert.rejects(source.loadMore('backups', initial.data.backups, initial.data.overview, new AbortController().signal),
    (error) => error instanceof BackupReadError && error.code === 'snapshot_changed');
});

test('live reads require an explicit build-time opt-in', () => {
  assert.equal(liveBackupReadEnabled(undefined), false);
  assert.equal(liveBackupReadEnabled('true'), false);
  assert.equal(liveBackupReadEnabled('0'), false);
  assert.equal(liveBackupReadEnabled('1'), true);
});

test('live read source keeps fixture and not-ready responses unavailable', async () => {
  for (const error of [new BackupReadError(200, 'fixture_source'), new BackupReadError(503, 'not_ready')]) {
    const client = { async overview() { throw error; }, async config() { throw new Error('unreachable'); },
      async list() { throw new Error('unreachable'); } };
    assert.deepEqual(await createBackupLiveSource(client).read(new AbortController().signal), { kind: 'unavailable' });
  }
});

test('live read source rejects changing config and cross-installation task pages', async () => {
  const preview = createBackupPreview('ready');
  const overview = { ...preview.overview, origin_installation_id: 'installation_live' };
  const config = { schema_version: 'system-backup-config.v1', origin_installation_id: 'installation_live',
    version: overview.config_version + 1, effective_enabled: overview.effective_enabled, active: true, config: {} };
  const client = { async overview() { return overview; }, async config() { return config; }, async list() { throw new Error('unreachable'); } };
  assert.deepEqual(await createBackupLiveSource(client).read(new AbortController().signal), { kind: 'error' });
  config.version = overview.config_version;
  const other = { ...preview.backups[0].task, origin_installation_id: 'installation_other' };
  client.list = async (kind) => ({ items: kind === 'backups' ? [other] : [], next_cursor: null, consistency: 'stable_cutoff' });
  assert.deepEqual(await createBackupLiveSource(client).read(new AbortController().signal), { kind: 'error' });
});

test('live read source propagates cancellation without a stale result', async () => {
  const controller = new AbortController();
  const client = { async overview() { controller.abort(); throw new Error('canceled'); },
    async config() { throw new Error('unreachable'); }, async list() { throw new Error('unreachable'); } };
  await assert.rejects(createBackupLiveSource(client).read(controller.signal), { name: 'AbortError' });
});

test('preview failures and unsupported/loading states do not fall back to successful data', async () => {
  for (const [scenario, kind] of [['error', 'error'], ['loading', 'loading'], ['unsupported', 'unsupported']]) {
    const result = await previewBackupSource(scenario).read(new AbortController().signal);
    assert.equal(result.kind, kind);
    assert.equal('data' in result, false);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(previewBackupSource('ready').read(controller.signal), { name: 'AbortError' });
});

test('execution success does not imply backup eligibility or recovery readiness', () => {
  const data = createBackupPreview('ready');
  const functional = data.backups.find((backup) => backup.task_purpose === 'functional_test');
  assert.equal(functional.task.status, 'succeeded');
  assert.equal(functional.artifact_usable, true);
  assert.equal(functional.acceptance_ready, false);
  assert.equal(functional.acceptance_eligible, false);
  assert.ok(functional.eligibility_reason_codes.includes('functional_test'));
  assert.equal(data.overview.backup_recovery_readiness, false);
  assert.equal(data.drills[0].task.status, 'succeeded');
  assert.equal(data.drills[0].cleanup_status, 'running');
  assert.equal(data.drills[0].acceptance_eligible, false);
  assert.equal(data.preflights[0].task.status, 'succeeded');
  assert.equal(data.preflights[0].report_validity_reason, 'report_expired');
});

test('unknown finalization is neither a readable artifact nor a registered recovery point', () => {
  const data = createBackupPreview('ready');
  const backup = data.backups.find((item) => item.task.status === 'finalization_unknown');
  assert.equal(backup.artifact_usable, false);
  assert.equal(backup.acceptance_eligible, false);
  assert.equal(backup.artifact_registration_id, null);
  assert.equal(data.catalog.find((item) => item.backupId === backup.task.public_id).registration, 'pending');
});

test('empty and disabled states retain their distinct semantics', () => {
  const empty = createBackupPreview('empty');
  for (const key of ['backups', 'catalog', 'drills', 'preflights', 'verifications', 'events', 'logs']) assert.deepEqual(empty[key], []);
  assert.equal(empty.overview.active_task_count, 0);
  const disabled = createBackupPreview('disabled');
  assert.equal(disabled.overview.effective_enabled, false);
  assert.equal(disabled.config.effective_enabled, false);
  assert.equal(disabled.overview.monitoring_armed, true);
  assert.ok(disabled.backups.length > 0, 'historical records remain visible');
});

test('expired log preview retains durable events and refresh produces isolated fixtures', () => {
  const expired = createBackupPreview('logs_expired');
  assert.equal(expired.logsExpired, true);
  assert.ok(expired.events.length > 0);
  expired.backups[0].checksums.manifest = null;
  expired.backups[0].verifier_summary.passed = -1;
  const fresh = createBackupPreview('ready');
  assert.ok(fresh.backups[0].checksums.manifest);
  assert.equal(fresh.backups[0].verifier_summary.passed, 6);
});

test('backup filters combine ID/matrix search with exact execution status', () => {
  const backups = createBackupPreview('ready').backups;
  assert.equal(filterBackups(backups, ' K8S-CLUSTER ', 'succeeded').length, 2);
  assert.equal(filterBackups(backups, '000000000002', 'all').length, 1);
  assert.equal(filterBackups(backups, '000000000002', 'succeeded').length, 0);
  assert.equal(filterBackups(backups, '', 'all').length, backups.length);
  assert.equal(filterBackups(backups, 'missing', 'all').length, 0);
});

test('unknown byte count is not displayed as a measured zero', () => {
  assert.equal(formatBytes(null), '—');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 KiB');
  assert.equal(formatBytes(2147483648), '2.0 GiB');
});
