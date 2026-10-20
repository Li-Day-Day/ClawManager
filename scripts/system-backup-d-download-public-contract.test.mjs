import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from './system-backup-a-schema-validation.mjs';

const directory = new URL('../contracts/system-backup/v12/', import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(name, directory)));
// Inline only this acyclic schema closure, preserving sibling assertions.
// Existing assertion validator fails on unsupported keywords; it is test-only.
function inline(schema, file, trail = []) {
  if (Array.isArray(schema)) return schema.map(value => inline(value, file, trail));
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    const [name, fragment] = schema.$ref.split('#');
    const targetFile = name || file;
    const key = `${targetFile}#${fragment}`;
    assert.ok(fragment?.startsWith('/') && !trail.includes(key), `invalid/cyclic test reference ${key}`);
    const target = fragment.slice(1).split('/').reduce((value, part) => value?.[part], load(targetFile));
    assert.ok(target, key);
    const { $ref, ...siblings } = schema;
    return { allOf: [inline(target, targetFile, [...trail, key]), inline(siblings, file, trail)] };
  }
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, inline(value, file, trail)]));
}
const vectorDocument = load('download-admission-public-vector.json');
const operation = vectorDocument.operation;
const operationSchema = inline(load('task-operation.schema.json').$defs.Operation, 'task-operation.schema.json');
const policySchema = inline(load('admin-operation-policy.schema.json').$defs.OperationPolicy, 'admin-operation-policy.schema.json');
const policies = load('admin-operation-policy.json').operations;
const policy = policies.find(value => value.operation_id === 'getSystemBackupEvidence');
const openapi = load('admin.openapi.json');

test('public download admission vector satisfies the closed draft schema', () => {
  assert.equal(vectorDocument.status, 'draft');
  assert.equal(validate(operationSchema, operation), true);
  assert.equal(validate(operationSchema, { ...operation, claim_owner: 'PRIVATE' }), false);
  assert.equal(validate(operationSchema, { ...operation, admission_receipt: {} }), false);
});
for (const [name, change] of [
  ['wrong type', { operation_type: 'cleanup' }], ['wrong target', { target_type: 'system', target_public_id: 'installation_test' }],
  ['wrong evidence ID', { target_public_id: 'sbk_00000000-0000-4000-8000-000000000002' }],
  ['wrong endpoint', { endpoint: 'updateSystemBackupConfig' }], ['system actor', { actor_type: 'system' }],
  ['zero actor', { actor_id: '0' }], ['aliased actor', { actor_id: '042' }],
  ['pending', { status: 'pending' }], ['running', { status: 'running' }], ['failed', { status: 'failed' }],
  ['retryable', { retryable: true }], ['failure', { failure_category: 'internal_error' }],
  ['failure message', { failure_message: 'PRIVATE' }], ['range transport status', { http_status: 206 }],
  ['null status', { http_status: null }], ['resource result', { result_resource_public_id: operation.target_public_id }],
  ['config result', { result_config_version: 2 }], ['null start', { started_at: null }], ['null finish', { finished_at: null }],
]) test(`download admission schema rejects ${name}`, () => assert.equal(validate(operationSchema, { ...operation, ...change }), false));
test('download admission nullable fields are explicit and timestamp comparisons remain consumer invariants', () => {
  for (const key of ['result_resource_public_id', 'result_config_version', 'failure_message', 'http_status', 'started_at', 'finished_at']) {
    const value = { ...operation }; delete value[key];
    assert.equal(validate(operationSchema, value), false, key);
  }
  assert.ok(load('task-operation.schema.json').$defs.Operation['x-invariants'].some(value => value.includes('same original SQL UTC instant')));
});
test('all policies validate, and the evidence condition cannot be dropped or silently weakened', () => {
  for (const value of policies) assert.equal(validate(policySchema, value), true, value.operation_id);
  for (const change of [{ recent_strong_auth: 'none' }, { strong_auth_condition: null }, { idempotency_condition: null }, { idempotency_required: true }]) {
    assert.equal(validate(policySchema, { ...policy, ...change }), false);
  }
  const missing = { ...policy }; delete missing.idempotency_condition;
  assert.equal(validate(policySchema, missing), false);
  assert.equal(validate(policySchema, { ...policies.find(value => value.operation_id === 'getSystemBackupOperation'), idempotency_condition: policy.idempotency_condition }), false);
});
test('evidence GET declares conditional single headers, binary full/range responses and no body', () => {
  const get = openapi.paths['/admin/system-backup-evidence/{id}'].get;
  assert.equal(get.requestBody, undefined);
  assert.deepEqual(Object.keys(get.responses), ['200', '206', 'default']);
  for (const name of ['EvidenceIdempotencyKey', 'EvidenceStrongAuthProof']) {
    assert.ok(get.parameters.some(value => value.$ref === `#/components/parameters/${name}`));
    assert.equal(openapi.components.parameters[name].required, false);
    assert.equal(openapi.components.parameters[name]['x-required-when'], policy.idempotency_condition);
  }
  assert.equal(openapi.components.parameters.EvidenceStrongAuthProof.name, 'X-Strong-Auth-Proof');
  for (const status of ['200', '206']) {
    const name = get.responses[status].$ref.split('/').at(-1);
    const response = openapi.components.responses[name];
    assert.deepEqual(response.content, { '*/*': { schema: { type: 'string', format: 'binary' } } });
    assert.deepEqual(response.headers['Cache-Control'], { $ref: '#/components/headers/EvidenceNoStore' });
    assert.deepEqual(response.headers['X-System-Backup-Operation-Id'], { $ref: '#/components/headers/EvidenceOperation' });
    assert.equal(Boolean(response.headers['Content-Range']), status === '206');
  }
  assert.equal(openapi.components.headers.EvidenceOperation['x-required-when'], policy.idempotency_condition);
  assert.deepEqual(openapi.components.headers.EvidenceNoStore.schema, { const: 'no-store' });
  const errors = load('admin-operation-errors.json').profiles.find(value => value.profile_id === 'read_evidence').codes;
  for (const code of ['strong_auth_required', 'strong_auth_expired', 'strong_auth_invalid', 'strong_auth_replayed', 'idempotency_conflict', 'idempotency_expired', 'state_conflict', 'version_conflict', 'not_ready']) assert.ok(errors.includes(code), code);
});
