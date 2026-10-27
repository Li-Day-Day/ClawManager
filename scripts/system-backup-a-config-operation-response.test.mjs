import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contracts = join(root, 'contracts/system-backup/v12');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const vectors = json(join(root, 'backend/internal/systembackupsecurity/testdata/config_operation_response_vectors.json'));
const operation = json(join(contracts, 'task-operation.schema.json')).$defs.Operation;
const openapi = json(join(contracts, 'admin.openapi.json'));

// Check the scalar constraints actually used by this closed Operation object.
// This is deliberately not a general-purpose JSON Schema validator.
function scalar(value, schema) {
  if (schema.$ref) {
    const [file, pointer] = schema.$ref.split('#');
    assert.ok(file && pointer?.startsWith('/$defs/'));
    const referenced = json(join(contracts, file)).$defs[pointer.slice('/$defs/'.length)];
    assert.ok(referenced, `missing scalar schema ${schema.$ref}`);
    return scalar(value, referenced);
  }
  if ('const' in schema) assert.deepEqual(value, schema.const);
  if (schema.enum) assert.ok(schema.enum.includes(value));
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type) assert.ok(types.some(type => type === 'null' ? value === null : type === 'integer' ? Number.isSafeInteger(value) : typeof value === type));
  if (typeof value === 'string') {
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern));
    if (schema.minLength !== undefined) assert.ok([...value].length >= schema.minLength);
    if (schema.maxLength !== undefined) assert.ok([...value].length <= schema.maxLength);
    if (schema.format === 'date-time') assert.match(value, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum);
    if (schema.maximum !== undefined) assert.ok(value <= schema.maximum);
  }
}

test('operation vectors follow the existing config mutation success references', () => {
  assert.equal(vectors.profile, 'a-config-operation-response.v1');
  assert.equal(vectors.vectors.length, 2);
  assert.equal(openapi.paths['/admin/system-backup-config'].put.responses['200'].$ref, '#/components/responses/Operation');
  assert.equal(openapi.paths['/admin/system-backup-config/rollback'].post.responses['200'].$ref, '#/components/responses/Operation');
  assert.equal(openapi.components.responses.Operation.content['application/json'].schema.$ref, 'task-operation.schema.json#/$defs/Operation');
});

test('complete vector bodies satisfy closed Operation fields and referenced scalar constraints', () => {
  assert.equal(operation.additionalProperties, false);
  for (const vector of vectors.vectors) {
    const body = JSON.parse(vector.canonical);
    assert.deepEqual(Object.keys(body).sort(), Object.keys(operation.properties).sort());
    for (const key of operation.required) assert.ok(Object.hasOwn(body, key));
    for (const [key, value] of Object.entries(body)) scalar(value, operation.properties[key]);
    assert.equal(body.schema_version, 'system-backup-operation.v1');
    assert.equal(body.operation_type, 'config_update');
    assert.equal(body.target_type, 'system');
    assert.equal(body.target_public_id, body.origin_installation_id);
    assert.equal(body.actor_type, 'admin');
    assert.equal(body.status, 'succeeded');
    assert.equal(body.failure_category, 'none');
    assert.equal(body.failure_message, null);
    assert.equal(body.result_resource_public_id, null);
    assert.equal(body.retryable, false);
    assert.equal(body.http_status, 200);
    assert.equal(body.endpoint, vector.name);
    for (const forbidden of ['config', 'active', 'effective_enabled', 'change_reason', 'created_by', 'version']) assert.ok(!Object.hasOwn(body, forbidden));
  }
});

test('independent vectors have exact top-level JCS bytes and SHA-256', () => {
  for (const vector of vectors.vectors) {
    const body = JSON.parse(vector.canonical);
    assert.equal(JSON.stringify(Object.fromEntries(Object.keys(body).sort().map(key => [key, body[key]]))), vector.canonical);
    assert.equal(createHash('sha256').update(vector.canonical).digest('hex'), vector.sha256);
    assert.ok(Buffer.byteLength(vector.canonical, 'utf8') <= 8192);
  }
});
