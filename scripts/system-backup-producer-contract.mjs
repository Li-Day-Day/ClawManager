// C1 contract/reference tooling only. No database, identity verification, provider
// access or production admission. Never construct execution handles from this data.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validate } from './system-backup-a-schema-validation.mjs';

const dir = new URL('../contracts/system-backup/v12/', import.meta.url);
export const schema = JSON.parse(readFileSync(new URL('producer-authority.schema.json', dir), 'utf8'));
export const transactions = JSON.parse(readFileSync(new URL('producer-authority-transactions.json', dir), 'utf8'));
const roles = JSON.parse(readFileSync(new URL('a-capability-role-mapping.json', dir), 'utf8'));
const MAX_UINT64 = (1n << 64n) - 1n;
const fail = message => { throw new Error(`producer contract: ${message}`); };
const check = (condition, message) => { if (!condition) fail(message); };
const equal = (a, b) => canonicalBytes(a).equals(canonicalBytes(b));
const sorted = a => [...a].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const counter = v => /^(0|[1-9][0-9]*)$/.test(v) && BigInt(v) <= MAX_UINT64;

function scalarString(value) {
  // Buffer silently replaces lone UTF-16 surrogates; reject instead of hashing
  // replacement characters that could alias a different admitted identity.
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      check(next >= 0xdc00 && next <= 0xdfff, 'invalid Unicode');
    } else check(c < 0xdc00 || c > 0xdfff, 'invalid Unicode');
  }
  return Buffer.from(value, 'utf8');
}
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const lp = b => Buffer.concat([u64(b.length), b]);

export function canonicalBytes(value) {
  const seen = new Set();
  function encode(v, depth) {
    check(depth <= 16, 'encoding depth');
    if (v === null) return Buffer.from('n');
    if (v === false) return Buffer.from('f');
    if (v === true) return Buffer.from('t');
    if (typeof v === 'string') return Buffer.concat([Buffer.from('s'), lp(scalarString(v))]);
    check(typeof v === 'object', 'unsupported value (including numeric JSON)');
    check(!seen.has(v), 'cycle');
    check(Object.getOwnPropertySymbols(v).length === 0, 'symbol keys');
    seen.add(v);
    let result;
    if (Array.isArray(v)) {
      check(Object.keys(v).length === v.length && Object.getOwnPropertyNames(v).length === v.length + 1, 'sparse/extended array');
      for (let i = 0; i < v.length; i++) check(Object.hasOwn(v,i) && 'value' in Object.getOwnPropertyDescriptor(v,String(i)), 'sparse/accessor array');
      result = Buffer.concat([Buffer.from('a'), u64(v.length), ...v.map(x => encode(x, depth + 1))]);
    } else {
      check(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null, 'non-plain object');
      const keys = sorted(Object.keys(v));
      check(Object.getOwnPropertyNames(v).length === keys.length, 'non-enumerable keys');
      for (const key of keys) check('value' in Object.getOwnPropertyDescriptor(v, key), 'accessor property');
      result = Buffer.concat([Buffer.from('o'), u64(keys.length), ...keys.flatMap(k => [encode(k, depth + 1), encode(v[k], depth + 1)])]);
    }
    seen.delete(v);
    return result;
  }
  return encode(value, 0);
}

export function digest(domain, value) {
  return createHash('sha256').update(lp(scalarString(domain))).update(canonicalBytes(value)).digest('hex');
}

function realTimestamp(v) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(v)) return false;
  if (Number(v.slice(0, 4)) < 1000) return false;
  const d = new Date(v);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 23) === v.slice(0, 23);
}

// Validate x-bound constraints on the *matching* schema branches, not a field
// name heuristic (provider ref_version is text, row_version is a uint64).
function bounds(s, v) {
  if (s.$ref) bounds(schema.$defs[s.$ref.split('/').at(-1)], v);
  if (s['x-maximum']) check(typeof v === 'string' && counter(v), 'uint64 overflow');
  if (s['x-max-utf8-bytes']) check(scalarString(v).length <= s['x-max-utf8-bytes'], 'UTF-8 byte bound');
  if (s.format === 'date-time' && v !== null) check(realTimestamp(v), 'invalid UTC microsecond timestamp');
  for (const branch of s.allOf ?? []) bounds(branch, v);
  for (const branch of [...(s.anyOf ?? []), ...(s.oneOf ?? [])]) if (validate(branch, v, schema)) bounds(branch, v);
  if (s.if) {
    const branch = validate(s.if, v, schema) ? s.then : s.else;
    if (branch) bounds(branch, v);
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, child] of Object.entries(s.properties ?? {})) if (Object.hasOwn(v, k)) bounds(child, v[k]);
  }
  if (Array.isArray(v) && s.items) for (const child of v) bounds(s.items, child);
}

function targetChecks(target) {
  const slots = target.result_slots;
  check(equal(slots, sorted(slots)), 'result slots must be sorted');
  if (roles.provider_row_roles.includes(target.role)) {
    check(equal(slots, sorted(roles.codes_by_role[target.role])), 'provider slots must be complete');
  } else {
    const allowed = schema.$defs.DependencyObservation.properties.slot.enum;
    check(slots.every(s => allowed.includes(s)), 'unknown dependency slot');
    if (target.role === 'kms') check(equal(slots, ['kek']), 'KMS evaluator slot');
    if (target.role === 'signing') check(equal(slots, ['signing']), 'signing evaluator slot');
    // Secret has no implicit default: actual authority MUST independently
    // authenticate this exact slot set against A's admitted evaluator profile.
  }
}

export function validateRecord(definition, value) {
  const def = schema.$defs[definition];
  canonicalBytes(value); // reject invalid Unicode/types before any hash
  check(def !== undefined && validate(def, value, schema), `schema ${definition}`);
  bounds(def, value);
  if (value.target) targetChecks(value.target);
  if (definition === 'TargetRecord') check(value.target_hash === digest(transactions.encoding.domains.target,targetKey(value.target)), 'target digest');
  if (definition === 'ResultRequest') {
    const provider = roles.provider_row_roles.includes(value.target.role);
    check(value.purpose === (provider ? 'capability_probe' : 'dependency_check'), 'purpose/role');
    check(value.results.kind === (provider ? 'provider' : 'dependency'), 'evaluator/result kind');
    check(equal(value.results.observations.map(v => v.slot), value.target.result_slots), 'complete sorted result slots');
    check(value.evidence.owner_id === value.scope.installation, 'evidence owner mismatch');
    check(value.evidence.immutable_version !== null && value.evidence.immutable_version !== 'null', 'result needs exact object version');
    check(value.observed_at < value.observation_expires_at, 'observation window');
    check(canonicalBytes(value).length <= 65536, 'result byte limit');
  }
  if (definition === 'CommandRequest') {
    const { command: c, expected: e, next: n, lease_expires_at: lease } = value;
    check(c === 'acquire' ? e === null : e !== null, 'command expected shape');
    check(['acquire', 'takeover'].includes(c) ? n !== null : n === null, 'command next shape');
    check(c === 'revoke' ? lease === null : lease !== null, 'command lease shape');
    if (c !== 'takeover') check(value.termination_decision_hash === null, 'termination decision purpose');
    if (e) check(e.target_generation === value.expected_target_generation, 'command target CAS mismatch');
    if (n) {
      const provider = roles.provider_row_roles.includes(value.target.role);
      check(n.purpose === (provider ? 'capability_probe' : 'dependency_check'), 'command purpose/role');
      check(lease <= n.authorization_expires_at && n.owner_write_expires_at <= n.authorization_expires_at, 'command authorization window');
      check(n.subject_identity_hash === value.actor_identity_hash, 'acquire actor binding');
    }
    if (c === 'takeover') {
      check(n.grant_id !== e.grant_id && n.run_id !== e.run_id && BigInt(n.grant_generation) > BigInt(e.grant_generation), 'takeover needs new generation/run/grant');
    }
    check(canonicalBytes(value).length <= 32768, 'command byte limit');
  }
  if (definition === 'RunRecord') {
    const empty = value.observed_at === null && value.observation_expires_at === null;
    check(empty ? ['acquired','superseded'].includes(value.state) : value.observed_at !== null && value.observation_expires_at !== null && value.observed_at < value.observation_expires_at, 'run observation pair/window');
  }
  if (definition === 'GrantRecord') {
    check(value.created_at < value.lease_expires_at && value.lease_expires_at <= value.authorization_expires_at, 'grant window');
    const provider = roles.provider_row_roles.includes(value.target.role);
    check(value.purpose === (provider ? 'capability_probe' : 'dependency_check'), 'grant purpose/role');
  }
  if (definition === 'HistoricalBindingRecord') {
    check(value.evidence.owner_id === value.scope.installation, 'history owner');
    check(value.evidence.immutable_version === null, 'original pending binding version');
    check(value.observed_at < value.observation_expires_at && value.retention_expires_at >= value.owner_write_expires_at, 'history deadlines');
    check(createHash('sha256').update(scalarString(value.relative_key)).digest('hex') === value.evidence.relative_key_hash, 'relative key hash');
    check(!value.relative_key.startsWith('/') && !value.relative_key.includes('\\') && !value.relative_key.split('/').some(p => ['', '.', '..'].includes(p)), 'relative key path');
  }
  if (definition === 'ReceiptRecord' || definition === 'CommandReceiptRecord') {
    const command = definition === 'CommandReceiptRecord';
    validateRecord(command ? 'CommandRequest' : 'ResultRequest', value.request);
    check(equal(value.scope, value.request.scope), 'receipt scope');
    const h = command ? commandHashes(value.request) : resultHashes(value.request);
    check(value.receipt_key_hash === h.key && value.request_hash === h.request, 'receipt digest');
    check(value.committed_at < value.retention_expires_at, 'receipt retention');
    if (!command) check(BigInt(value.result_version) === BigInt(value.request.expected_result_version) + 1n, 'receipt result CAS');
    else {
      const source = value.request.next ?? value.request.expected;
      for (const key of ['grant_id','grant_generation','run_id']) check(value.outcome[key] === source[key], 'command receipt outcome binding');
      const prior = BigInt(value.request.expected_target_generation);
      const next = ['acquire','takeover'].includes(value.request.command) ? prior + 1n : prior;
      check(BigInt(value.outcome.target_generation) === next, 'command receipt target generation');
    }
  }
  return true;
}

export function targetKey(target) {
  return Object.fromEntries(transactions.encoding.target_key_fields.map(k => [k, target[k]]));
}
export function resultHashes(request) {
  validateRecord('ResultRequest', request);
  const key = Object.fromEntries(transactions.encoding.result_key_fields.map(k => [k, k === 'target_key' ? targetKey(request.target) : request[k]]));
  const d = transactions.encoding.domains;
  return { scope: digest(d.scope, request.scope), target: digest(d.target, targetKey(request.target)), key: digest(d.result_key, key), request: digest(d.result_request, request) };
}
export function commandHashes(request) {
  validateRecord('CommandRequest', request);
  const key = Object.fromEntries(transactions.encoding.command_key_fields.map(k => [k, request[k]]));
  const d = transactions.encoding.domains;
  return { key: digest(d.command_key, key), request: digest(d.command_request, request) };
}

export function reservationBytes(rows, existingEvidenceCost = 0n) {
  const p = JSON.parse(readFileSync(new URL('producer-authority-persistence.json', dir), 'utf8'));
  check(typeof existingEvidenceCost === 'bigint' && existingEvidenceCost >= 0n, 'evidence cost');
  let total = 65536n + existingEvidenceCost;
  for (const [name, count] of Object.entries(rows)) {
    const table = p.tables.find(t => t.name === name);
    check(table && Number.isSafeInteger(count) && count >= 0, 'unknown table/count');
    const bound = BigInt(table.record_max_bytes);
    total += BigInt(count) * (65536n + ((bound + 4095n) / 4096n) * 4096n);
  }
  check(total <= (1n << 63n) - 1n, 'SQL signed accounting overflow');
  return total;
}
