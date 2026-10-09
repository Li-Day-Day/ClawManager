#!/usr/bin/env node
// Wire shape parity, not a replacement for JSON Schema runtime validation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const contractDirectory = 'contracts/system-backup/v12';
const version = 'system-backup-plan.v12';
const tsName = name => ({ Task: 'SystemBackupTask', Operation: 'SystemBackupOperation' }[name] ?? name);
const union = values => {
  const flattened = [...new Set(values.flat())];
  return flattened.filter(value => !(flattened.includes('string') && value.startsWith('"')) && !(flattened.includes('boolean') && ['true', 'false'].includes(value))).sort();
};
const array = shape => [`array<${union(shape).join('|')}>`];

export function checkDTO({ repository = root, goSource, tsSource, read = path => readFileSync(resolve(repository, path), 'utf8') } = {}) {
  const json = path => JSON.parse(read(path));
  const parity = json(`${contractDirectory}/dto-parity.json`);
  const manifest = json(`${contractDirectory}/contract-manifest.json`);
  assert.equal(parity.contract_version, version);
  assert.equal(manifest.contract_version, version);
  assert.equal(new Set(parity.schema_sources).size, parity.schema_sources.length, 'duplicate schema source');
  const documents = new Map();
  const load = path => {
    const name = relative(repository, resolve(repository, path)).replaceAll('\\', '/');
    assert.ok(name.startsWith(`${contractDirectory}/`) && !name.includes('/../'), 'schema path outside contract directory');
    if (!documents.has(name)) {
      const doc = json(name);
      assert.equal(doc['x-contract-version'], version, `${name}: contract version drift`);
      documents.set(name, doc);
    }
    return [name, documents.get(name)];
  };
  const objects = new Map();
  for (const path of parity.schema_sources) {
    const [name, doc] = load(path);
    for (const [type, schema] of Object.entries(doc.$defs)) {
      if (schema.type !== 'object') continue;
      assert.ok(!objects.has(type), `ambiguous DTO ${type}`);
      assert.equal(schema.additionalProperties, false, `${type}: DTO must be closed`);
      objects.set(type, { path: name, schema });
    }
  }
  function shape(schema, path, seen = []) {
    if (schema.allOf) {
      assert.ok(schema.allOf[0]?.$ref && schema.allOf.slice(1).every(item => Object.keys(item).every(key => key === 'properties')), 'unsupported allOf wire shape');
      // Discriminator refinements constrain values, but share the referenced DTO.
      return shape(schema.allOf[0], path, seen);
    }
    if (schema.$ref) {
      const [file, fragment] = schema.$ref.split('#');
      assert.match(fragment ?? '', /^\/\$defs\/[A-Za-z0-9_]+$/);
      const [target, doc] = load(file ? resolve(repository, dirname(path), file) : path);
      const name = fragment.split('/').at(-1);
      const key = `${target}#${name}`;
      assert.ok(!seen.includes(key), `cyclic scalar schema ${key}`);
      assert.ok(doc.$defs[name], `missing schema reference ${key}`);
      if (objects.get(name)?.path === target) return [`object:${name}`];
      return shape(doc.$defs[name], target, [...seen, key]);
    }
    if (schema.anyOf || schema.oneOf) return union((schema.anyOf ?? schema.oneOf).map(item => shape(item, path, seen)));
    if ('const' in schema) return [JSON.stringify(schema.const)];
    if (schema.enum) return union(schema.enum.map(value => JSON.stringify(value)));
    if (schema.type === 'array') return array(shape(schema.items, path, seen));
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert.ok(types.every(type => ['string', 'integer', 'number', 'boolean', 'null'].includes(type)), `unsupported schema shape in ${path}: ${JSON.stringify(schema)}`);
    return union(types);
  }
  goSource ??= read(parity.go_snapshot);
  tsSource ??= read(parity.typescript_snapshot);
  const go = new Map();
  for (const match of goSource.matchAll(/^type (\w+) struct \{\r?\n([\s\S]*?)^\}/gm)) {
    const fields = new Map();
    for (const line of match[2].split('\n').map(line => line.trim()).filter(Boolean)) {
      const field = line.match(/^\w+\s+([*\[\]\w]+)\s+`json:"([\w]+)"`$/);
      assert.ok(field, `unsupported Go DTO declaration: ${line}`);
      assert.ok(!fields.has(field[2]), `duplicate Go JSON field ${field[2]}`);
      fields.set(field[2], field[1]);
    }
    assert.ok(!go.has(match[1]), 'duplicate Go DTO');
    go.set(match[1], fields);
  }
  const ts = new Map();
  for (const match of tsSource.matchAll(/^export interface (\w+) \{\r?\n([\s\S]*?)^\}/gm)) {
    const fields = new Map();
    for (const line of match[2].split('\n').map(line => line.trim()).filter(Boolean)) {
      const field = line.match(/^(\w+)(\?)?: (.+);$/);
      assert.ok(field, `unsupported TS DTO declaration: ${line}`);
      assert.ok(!fields.has(field[1]), 'duplicate TS field');
      fields.set(field[1], { type: field[3], optional: Boolean(field[2]) });
    }
    assert.ok(!ts.has(match[1]), 'duplicate TS DTO');
    ts.set(match[1], fields);
  }
  const aliases = new Map([...tsSource.matchAll(/^export type (\w+) = (.+);$/gm)].map(m => [m[1], m[2]]));
  const constants = new Map([...tsSource.matchAll(/^export const (\w+) = (\[.*\]) as const;$/gm)].map(m => [m[1], JSON.parse(m[2])]));
  function tsShape(type, seen = []) {
    if (type.startsWith('Array<') && type.endsWith('>')) return array(tsShape(type.slice(6, -1), seen));
    const values = type.split(/\s*\|\s*/);
    if (values.length > 1) return union(values.map(value => tsShape(value, seen)));
    if (type.endsWith('[]')) return array(tsShape(type.slice(0, -2), seen));
    const constant = type.match(/^\(typeof (\w+)\)\[number\]$/);
    if (constant) {
      assert.ok(constants.has(constant[1]), `missing TS enum ${constant[1]}`);
      return union(constants.get(constant[1]).map(value => JSON.stringify(value)));
    }
    if (aliases.has(type)) {
      assert.ok(!seen.includes(type), 'cyclic TS alias');
      return tsShape(aliases.get(type), [...seen, type]);
    }
    for (const name of objects.keys()) if (tsName(name) === type) return [`object:${name}`];
    assert.ok(['number', 'boolean', 'string', 'null'].includes(type) || /^"[^"\\]*"$/.test(type), `unsupported TS type ${type}`);
    return [type];
  }
  function goShape(type) {
    if (type.startsWith('*')) return union(['null', ...goShape(type.slice(1))]);
    if (type.startsWith('[]')) return array(goShape(type.slice(2)));
    if (objects.has(type)) return [`object:${type}`];
    const scalar = { string: 'string', int: 'integer', int64: 'integer', float64: 'number', bool: 'boolean' }[type];
    assert.ok(scalar, `unsupported Go wire type ${type}`);
    return [scalar];
  }
  const goExpected = values => union(values.map(value => value.startsWith('array<') ? `array<${goExpected(value.slice(6, -1).split('|')).join('|')}>` : value.startsWith('"') ? 'string' : value === 'true' || value === 'false' ? 'boolean' : value));
  assert.deepEqual([...go.keys()].sort(), [...objects.keys()].sort(), 'Go DTO coverage');
  assert.deepEqual([...ts.keys()].sort(), [...objects.keys()].map(tsName).sort(), 'TS DTO coverage');
  let fields = 0;
  for (const [name, { schema, path }] of objects) {
    const properties = Object.keys(schema.properties).sort();
    assert.deepEqual([...go.get(name).keys()].sort(), properties, `${name} Go fields`);
    assert.deepEqual([...ts.get(tsName(name)).keys()].sort(), properties, `${name} TS fields`);
    for (const [field, property] of Object.entries(schema.properties)) {
      const expected = shape(property, path);
      const tsField = ts.get(tsName(name)).get(field);
      assert.equal(tsField.optional, false, `${name}.${field}: Go emits this field even when null`);
      assert.deepEqual(tsShape(tsField.type), union(expected.map(value => value.replace(/\binteger\b/g, 'number'))), `${name}.${field}: TS type/nullability/literal mismatch`);
      assert.deepEqual(goShape(go.get(name).get(field)), goExpected(expected), `${name}.${field}: Go type/nullability mismatch`);
      fields++;
    }
  }
  return { status: 'PASS', dto_count: objects.size, field_count: fields, checked_schema_files: documents.size, contract_frozen: false,
    missing_contracts: manifest.artifacts.filter(item => item.status === 'missing').map(item => item.id),
    scope: 'wire types, nested references, nullability, TS literals, existing draft versions; semantic constraints remain JSON Schema validation' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assert.equal(process.argv.length, 2); console.log(JSON.stringify(checkDTO())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
