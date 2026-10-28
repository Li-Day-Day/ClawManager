import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = 'docs/evidence/a2-metrics-dedupe-carriers-reviewed-20261027.json';
const inputs = [
  'docs/evidence/a2-metrics-security-original-20261027/metrics-alert-registry.json',
  'docs/evidence/a2-metrics-security-combined-candidate-20261027-r2.json',
];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// Bounded source audit of the present registry syntax, not a PromQL evaluator.
// Only top-level set operators are split. Quoted matcher values are opaque.
function splitSet(expression, operator) {
  const pieces = [];
  let start = 0, quoted = false, escaped = false;
  const stack = [];
  const close = {')':'(', ']':'[', '}':'{'};
  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if ('([{'.includes(c)) { stack.push(c); continue; }
    if (')]}'.includes(c)) { assert.equal(stack.pop(), close[c]); continue; }
    if (!stack.length && expression.slice(i, i + operator.length) === operator &&
        /\s/.test(expression[i - 1] ?? '') && /\s/.test(expression[i + operator.length] ?? '')) {
      pieces.push(expression.slice(start, i).trim());
      start = i + operator.length;
      i += operator.length - 1;
    }
  }
  assert.equal(quoted, false);
  assert.equal(stack.length, 0);
  pieces.push(expression.slice(start).trim());
  assert.ok(pieces.every(Boolean));
  return pieces;
}

function audit(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  const registry = JSON.parse(bytes.toString('utf8'));
  const metrics = new Map(registry.metrics.map(m => [m.name, m]));
  const alerts = registry.alerts.filter(a => a.expression_language === 'promql' && a.dedupe_key.length);
  const rows = alerts.map(alert => {
    const carriers = splitSet(alert.expression, 'or').map(branch => {
      // Set intersection carries the left side; its right-side gates cannot
      // supply absent dedupe fields. No label-altering matching is accepted here.
      const head = splitSet(branch, 'and')[0];
      assert.ok(!/\b(?:bool|on|ignoring|group_left|group_right|unless)\b/.test(head), alert.id);
      const match = head.match(/^(?:increase\((clawmanager_system_backup_[a-z0-9_]+)(?:\{[^{}]*\})?\[5m\]\)|(?:time\(\)\s*-\s*)?(clawmanager_system_backup_[a-z0-9_]+)(?:\{[^{}]*\})?)\s*(?:==|!=|>=|<=|>|<)\s*(.+)$/);
      assert.ok(match, `Unsupported carrier syntax: ${alert.id}: ${head}`);
      const metric = match[1] ?? match[2];
      assert.ok(metrics.has(metric));
      const labels = metrics.get(metric).labels;
      return {branch, carrier_metric:metric, declared_labels:labels,
        missing_dedupe_fields:alert.dedupe_key.filter(k => !labels.includes(k))};
    });
    const referenced = [...new Set(alert.expression.match(/clawmanager_system_backup_[a-z0-9_]+/g) ?? [])];
    const naiveMissing = referenced.filter(name => {
      assert.ok(metrics.has(name));
      return alert.dedupe_key.some(k => !metrics.get(name).labels.includes(k));
    });
    return {id:alert.id, dedupe_key:alert.dedupe_key, carriers,
      any_referenced_metric_missing_fields:naiveMissing};
  });
  const missing = rows.filter(r => r.carriers.some(c => c.missing_dedupe_fields.length));
  assert.deepEqual(missing.map(r => r.id), ['cleanup-overdue', 'signature-or-checksum-failure']);
  const cleanup = missing.find(r => r.id === 'cleanup-overdue');
  assert.deepEqual(cleanup.carriers[0].missing_dedupe_fields, ['cleanup_status']);
  const signature = missing.find(r => r.id === 'signature-or-checksum-failure');
  assert.deepEqual(signature.carriers[0].missing_dedupe_fields, ['task_type', 'failure_category']);
  assert.deepEqual(signature.carriers[1].missing_dedupe_fields, []);
  return {input:{path:file,size:bytes.length,sha256:sha(bytes)},
    registry_metrics:registry.metrics.length, registry_alerts:registry.alerts.length,
    promql_alerts_with_nonempty_dedupe:alerts.length,
    output_carrier_deficiencies:missing.length,
    naive_any_reference_flags:rows.filter(r => r.any_referenced_metric_missing_fields.length).length,
    rows};
}

const report = {
  kind:'a2_metrics_declared_dedupe_carriers_source_audit.v1',
  scope:'Bounded current expression syntax and declared labels, original archive plus combined nine-expression candidate',
  versions:inputs.map(audit),
  semantics_reference:'https://prometheus.io/docs/prometheus/latest/querying/operators/',
  decision:'A-METRICS-02 and newly observed A-METRICS-04 cleanup-overdue require local A/D specification decisions; no new label, default value or dedupe key is approved',
  initial_single_issue_expectation_rejected:true,
  interpretation:[
    'A missing declared field on a right-side scalar or and-gate metric alone is not an output-carrier deficiency.',
    'The signature and verifier branches retain distinct declared label sets under or; one branch cannot enrich the other.',
    'After correcting metric_result to failure, the signature branch can select compliant failure samples but still lacks task_type and failure_category.',
    'cleanup-overdue declares cleanup_status in its dedupe key, while both compared gauges declare no labels; the expression cannot derive that field from these declared inputs.',
  ],
  promql_evaluator_executed:false,
  runtime_emitter_label_presence_proven:false,
  rule_loader_or_notification_dedupe_executed:false,
  actual_series_matching_or_missing_series_proven:false,
  source_ready_is_not_PASS:true,
  live_source_modified:false,
  Go_or_SQL_executed:false,
  dependencies_installed:false,
};
const rendered = JSON.stringify(report, null, 2) + '\n';
if (process.argv[2] === '--write') fs.writeFileSync(path.join(root, output), rendered);
else { assert.equal(process.argv[2], '--check'); assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), rendered); }
console.log(JSON.stringify({output,versions:report.versions.map(v=>({path:v.input.path,alerts:v.promql_alerts_with_nonempty_dedupe,naive_flags:v.naive_any_reference_flags,carrier_deficiencies:v.output_carrier_deficiencies})),evaluator_executed:false}));
