// Reproduce the read projection allowlist without installing packages.
// Default is read-only comparison; --write regenerates the single Go source.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const mode = process.argv[2] ?? '--check';
if (!['--check', '--write'].includes(mode) || process.argv.length > 3) throw Error('use --check or --write');
const source = readFileSync(new URL('../contracts/system-backup/v12/admin-control-resources.schema.json', import.meta.url));
// Hash the canonical Git bytes; never pin a checkout with newline conversion.
if (source.includes(13)) throw Error('contract must use canonical LF bytes; check .gitattributes');
const defs = JSON.parse(source).$defs;
const groups = {durations:'DurationConfig', capacity:'CapacityConfig', concurrency:'ConcurrencyConfig', preflight_limits:'PreflightLimits'};
const sha = createHash('sha256').update(source).digest('hex');
let output = `// Generated from the v12 ConfigValues schema; TestConfigProjectionRulesMatchContract pins the source.\npackage systembackupread\n\nconst configProjectionSchemaSHA256 = "${sha}"\n\nvar configNumericBounds = map[string]map[string]configNumberBound{\n`;
for (const [group, name] of Object.entries(groups)) {
  const definition = defs[name];
  if (definition.additionalProperties !== false || definition.required.length !== Object.keys(definition.properties).length || new Set(definition.required).size !== definition.required.length) throw Error('numeric schema shape changed');
  output += `${JSON.stringify(group)}: {\n`;
  for (const [field, rule] of Object.entries(definition.properties)) {
    const scale = field === 'source_size_safety_factor' ? 100 : 1;
    const numbers = [rule.minimum, rule.maximum].map(value => value * scale);
    const defaultValue = rule.default * scale;
    if (!definition.required.includes(field) || !numbers.every(Number.isSafeInteger) || !Number.isSafeInteger(defaultValue) || numbers[0] > defaultValue || defaultValue > numbers[1] || !['integer', 'number'].includes(rule.type) || (scale === 1 && rule.type !== 'integer')) throw Error('review numeric field before generation');
    output += `${JSON.stringify(field)}: {${numbers[0]}, ${numbers[1]}, ${scale}},\n`;
  }
  output += '},\n';
}
output += '}\n';
for (const [name, values] of [
  ['configRegistryKinds', defs.RegistryReference.properties.registry_kind.enum],
  ['configReferencePurposes', defs.ConfigReference.properties.purpose.enum],
]) output += `\nvar ${name} = map[string]bool{\n${values.map(value => `${JSON.stringify(value)}: true,`).join('\n')}\n}\n`;
const target = new URL('../backend/internal/systembackupread/config_projection_rules.go', import.meta.url);
// Ignore gofmt whitespace while preserving every byte inside string literals.
const tokens = text => text.replace(/"(?:\\.|[^"\\])*"|(\s+)/g, (match, whitespace) => whitespace ? '' : match);
if (mode === '--write') writeFileSync(target, output);
else if (tokens(readFileSync(target, 'utf8')) !== tokens(output)) throw Error('generated rules differ; review schema and use --write then gofmt');
console.log(`PASS config-projection-rules mode=${mode.slice(2)} schema_sha256=${sha}`);
