// Reference evaluator for A's draft synthetic projected-row vectors only.
// Does not read databases, normalize production dumps, or authorize restores.
import { createHash } from 'node:crypto';
import { validate } from './system-backup-a-schema-validation.mjs';

export function canonicalRows(rows) {
  return JSON.stringify(rows, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}
export const rowChecksum = rows => createHash('sha256').update(canonicalRows(rows)).digest('hex');

export function normalizeFixture(policy, rows, context, secretSchema) {
  const reject = () => { throw new Error('normalization_failed'); };
  if (!Array.isArray(rows)) reject();
  const normalized = rows.map(input => {
    if (!validate(policy.input_projection_schema, input)) reject();
    const row = structuredClone(input);
    for (const [field, domain] of Object.entries(policy.references)) {
      const target = context.mappings?.[domain]?.[String(input[field])];
      if (target === undefined || !validate(policy.input_projection_schema.properties[field], target)) reject();
      row[field] = target;
    }
    for (const field of policy.secret_ref_fields) {
      const ref = context.secret_refs?.[field];
      if (!ref || !validate(secretSchema, ref) || ref.purpose !== 'secret_bundle_part' || ref.identity_version !== policy.expected_secret_versions[field]) reject();
    }
    for (const [field, max] of Object.entries(policy.capacity_limits)) if (row[field] > max) reject();
    for (const field of policy.redacted_fields) row[field] = '[REDACTED]';
    Object.assign(row, policy.normalize_set);
    return row;
  });
  return { rows: normalized, can_resume_source_execution: false };
}
