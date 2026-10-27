// Reproduce the D ConfigValues numeric allowlist without installing packages.
// Default is read-only comparison; --write regenerates the single Go source.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const mode = process.argv[2] ?? '--check';
if (!['--check', '--write'].includes(mode) || process.argv.length > 3) throw Error('use --check or --write');
const source = readFileSync(new URL('../contracts/system-backup/v12/admin-control-resources.schema.json', import.meta.url));
const defs = JSON.parse(source).$defs;
const groups = {durations:'DurationConfig', capacity:'CapacityConfig', concurrency:'ConcurrencyConfig', preflight_limits:'PreflightLimits'};
const sha = createHash('sha256').update(source).digest('hex');
let output = `// Generated from the v12 D-owned ConfigValues schema. Tests pin the source hash.\npackage systembackupsecurity\n\nconst bootstrapConfigSchemaSHA256 = "${sha}"\n\nvar bootstrapNumberRules = map[string]map[string]bootstrapNumberRule{\n`;
for (const [group, name] of Object.entries(groups)) {
  const definition = defs[name];
  if (definition.additionalProperties !== false || definition.required.length !== Object.keys(definition.properties).length) throw Error('numeric schema shape changed');
  output += `${JSON.stringify(group)}: {\n`;
  for (const [field, rule] of Object.entries(definition.properties)) {
    const scale = field === 'source_size_safety_factor' ? 100 : 1;
    const numbers = [rule.minimum, rule.maximum, rule.default].map(value => value * scale);
    if (!definition.required.includes(field) || !numbers.every(Number.isSafeInteger) || !['integer', 'number'].includes(rule.type) || (scale === 1 && rule.type !== 'integer')) throw Error('review numeric field before generation');
    output += `${JSON.stringify(field)}: {Min:${numbers[0]}, Max:${numbers[1]}, Default:${numbers[2]}, Scale:${scale}},\n`;
  }
  output += '},\n';
}
output += '}\n';
for (const [name, values] of [
  ['bootstrapRegistryKinds', defs.RegistryReference.properties.registry_kind.enum],
  ['bootstrapReferencePurposes', defs.ConfigReference.properties.purpose.enum],
]) output += `var ${name} = []string{${values.map(value => JSON.stringify(value)).join(',')}}\n`;
const target = new URL('../backend/internal/systembackupsecurity/config_bootstrap_rules.go', import.meta.url);
// Ignore gofmt whitespace while preserving every byte inside string literals.
// No subprocess is needed in check mode. Run gofmt separately after --write.
const tokens = text => text.replace(/"(?:\\.|[^"\\])*"|(\s+)/g, (match, whitespace) => whitespace ? '' : match);
if (mode === '--write') writeFileSync(target, output);
else if (tokens(readFileSync(target, 'utf8')) !== tokens(output)) throw Error('generated rules differ; review schema and use --write then gofmt');
console.log(`PASS bootstrap-config-rules mode=${mode.slice(2)} schema_sha256=${sha}`);
