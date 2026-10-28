import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const target = 'clawreef/internal/systembackupbootstrapsecurity';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sorted = values => [...new Set(values)].sort();
const base = value => value.replace(/ \[[^\]]+\]$/, '');

// go list -json emits adjacent JSON objects, rather than a JSON array.
// Reject all non-JSON output and incomplete objects instead of dropping lines.
export function parseGoList(text) {
  text = text.replace(/^\uFEFF/, '');
  const result = [];
  let start = -1, depth = 0, string = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0) {
      if (/\s/.test(char)) continue;
      assert.equal(char, '{', 'non-JSON Go listing output');
      start = i;
      depth = 1;
      continue;
    }
    if (string) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') string = false;
      continue;
    }
    if (char === '"') string = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      depth--;
      assert.ok(depth >= 0, 'unbalanced Go listing');
      if (depth === 0) {
        result.push(JSON.parse(text.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  assert.equal(start, -1, 'incomplete Go listing');
  assert.ok(result.length, 'empty Go listing');
  return result;
}

export function affectedScope(rows) {
  for (const row of rows) {
    assert.equal(row.Error, undefined, `Go package error: ${row.ImportPath}`);
    assert.ok(!row.Incomplete, `incomplete Go package: ${row.ImportPath}`);
    assert.ok(!row.DepsErrors?.length, `dependency error: ${row.ImportPath}`);
  }
  // Generated *.test mains and [package.test] variants are not production
  // reverse edges. TestImports/XTestImports are examined separately below.
  const originals = rows.filter(row => (row.ImportPath === 'clawreef' || row.ImportPath?.startsWith('clawreef/')) &&
    !row.ForTest && !row.ImportPath.endsWith('.test') && !row.ImportPath.includes(' ['));
  const packages = new Map();
  for (const row of originals) {
    assert.ok(!packages.has(row.ImportPath), `duplicate package: ${row.ImportPath}`);
    packages.set(row.ImportPath, row);
  }
  assert.ok(packages.has(target), 'target package missing from actual listing');
  const runtime = new Set([target]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of originals) {
      if (!runtime.has(row.ImportPath) && (row.Imports ?? []).some(p => runtime.has(base(p)))) {
        runtime.add(row.ImportPath);
        changed = true;
      }
    }
  }
  const testCallers = originals.filter(row => !runtime.has(row.ImportPath) &&
    [...(row.TestImports ?? []), ...(row.XTestImports ?? [])].some(p => runtime.has(base(p))));
  const describe = row => ({
    package: row.ImportPath,
    directory: row.Dir,
    production_files: sorted(row.GoFiles ?? []),
    test_files: sorted([...(row.TestGoFiles ?? []), ...(row.XTestGoFiles ?? [])]),
    imports_of_affected_runtime: sorted((row.Imports ?? []).map(base).filter(p => runtime.has(p))),
    test_imports_of_affected_runtime: sorted([...(row.TestImports ?? []), ...(row.XTestImports ?? [])].map(base).filter(p => runtime.has(p)))
  });
  return {
    listed_packages: rows.length,
    project_original_packages: packages.size,
    runtime_affected: [...runtime].sort(),
    additional_test_callers: testCallers.map(row => row.ImportPath).sort(),
    selected_files: [...runtime].sort().map(p => describe(packages.get(p))).concat(testCallers.map(describe).sort((a, b) => a.package.localeCompare(b.package)))
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [prefix, mode, ...extra] = process.argv.slice(2);
  assert.ok(prefix && ['--write', '--check'].includes(mode) && !extra.length,
    'Usage: node a2-reference-capability-go-scope-20261026.mjs <capture-prefix> --write|--check');
  const captures = [];
  for (const goos of ['windows', 'linux']) for (const tags of ['ordinary', 'systembackup_mysql']) {
    const file = `${prefix}.${goos}.${tags}.jsonl`;
    const bytes = fs.readFileSync(file);
    captures.push({goos_label: goos, tags_label: tags, input: {path: file, size: bytes.length, sha256: sha(bytes)},
      ...affectedScope(parseGoList(bytes.toString('utf8')))});
  }
  const report = {
    kind: 'a2_reference_capability_actual_go_list_scope.v1',
    scope: 'Imports and selected test metadata from supplied actual go-list captures; platform, command exit and frozen-source provenance require the owning native receipt.',
    captures,
    runtime_union: sorted(captures.flatMap(c => c.runtime_affected)),
    additional_ordinary_test_callers: sorted(captures.filter(c => c.tags_label === 'ordinary').flatMap(c => c.additional_test_callers)),
    additional_mysql_test_callers: sorted(captures.filter(c => c.tags_label === 'systembackup_mysql').flatMap(c => c.additional_test_callers)),
    tests_executed_by_reader: false,
    actual_SQL: false,
    production_approved: false
  };
  const output = `${prefix}.scope.json`;
  if (mode === '--write') fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), report);
  console.log(JSON.stringify({mode, output, runtime_union: report.runtime_union,
    additional_ordinary_test_callers: report.additional_ordinary_test_callers,
    additional_mysql_test_callers: report.additional_mysql_test_callers}));
}
