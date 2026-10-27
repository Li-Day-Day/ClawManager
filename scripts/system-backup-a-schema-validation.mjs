// Dependency-free validator for the keywords used by A's draft contracts.
// This is test tooling, not an API admission validator or a general JSON Schema
// implementation. Unsupported assertion keywords fail rather than being ignored.
import { isDeepStrictEqual } from 'node:util';

const annotations = new Set(['$schema', '$id', '$defs', 'title', 'description', 'contentEncoding']);
const assertions = new Set(['$ref', 'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'minLength', 'maxLength', 'pattern', 'format',
  'minimum', 'maximum', 'items', 'minItems', 'maxItems', 'uniqueItems', 'contains', 'minContains', 'maxContains']);

export function validate(schema, value, root = schema) {
  if (typeof schema === 'boolean') return schema;
  for (const key of Object.keys(schema)) {
    if (!key.startsWith('x-') && !annotations.has(key) && !assertions.has(key)) throw new Error(`unsupported schema keyword ${key}`);
  }
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/')) throw new Error('only local refs supported by A test validator');
    const target = schema.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], root);
    if (target === undefined) throw new Error(`unresolved local schema ref ${schema.$ref}`);
    if (!validate(target, value, root)) return false;
  }
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && ![].concat(schema.type).some(t => t === type || t === 'integer' && Number.isInteger(value))) return false;
  if ('const' in schema && !isDeepStrictEqual(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some(v => isDeepStrictEqual(v, value))) return false;
  if (schema.allOf && !schema.allOf.every(s => validate(s, value, root))) return false;
  if (schema.anyOf && !schema.anyOf.some(s => validate(s, value, root))) return false;
  if (schema.oneOf && schema.oneOf.filter(s => validate(s, value, root)).length !== 1) return false;
  if (schema.not && validate(schema.not, value, root)) return false;
  if (schema.if) {
    const branch = validate(schema.if, value, root) ? schema.then : schema.else;
    if (branch && !validate(branch, value, root)) return false;
  }
  if (type === 'object') {
    if (schema.required?.some(key => !Object.hasOwn(value, key))) return false;
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) { if (!validate(schema.properties[key], item, root)) return false; }
      else if (schema.additionalProperties === false) return false;
      else if (schema.additionalProperties && !validate(schema.additionalProperties, item, root)) return false;
    }
  }
  if (type === 'string') {
    const length = [...value].length;
    if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)) return false;
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) return false;
    if (schema.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value)))) return false;
    if (schema.format && schema.format !== 'date-time') throw new Error(`unsupported format ${schema.format}`);
  }
  if (type === 'number' && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (type === 'array') {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) return false;
    if (schema.items && !value.every(item => validate(schema.items, item, root))) return false;
    if (schema.uniqueItems && value.some((item, i) => value.slice(0, i).some(other => isDeepStrictEqual(item, other)))) return false;
    if (schema.contains) {
      const count = value.filter(item => validate(schema.contains, item, root)).length;
      if (count < (schema.minContains ?? 1) || count > (schema.maxContains ?? Infinity)) return false;
    }
  }
  return true;
}
