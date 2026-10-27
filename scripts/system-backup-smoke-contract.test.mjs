import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { computeMigrationCatalog } from './system-backup-contract-check.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const bash = process.env.BASH_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
function run(path) {
  const result = spawnSync(bash, ['-c', 'set -euo pipefail; source scripts/system-backup-smoke-contract.sh; load_system_backup_smoke_contract "$1"; printf "%s %s %s" "$EXPECTED_MIGRATIONS" "$EXPECTED_CATALOG_HASH" "$EXPECTED_CATALOG_PREFIX"', 'test', path.replaceAll('\\', '/')], {cwd: root, encoding: 'utf8', windowsHide: true});
  if (result.error) throw result.error;
  return result;
}
test('shell contract matches current embedded migrations and full controller catalog', () => {
  const catalog = computeMigrationCatalog();
  const result = run(resolve(root, 'backend/internal/systembackupcontroller/bootstrap.go'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${catalog.file_count} ${catalog.hash} ${catalog.hash.slice(0, 12)}`);
});

test('isolated image requires a repository and the independently pinned digest', () => {
  const pin = 'b'.repeat(64);
  const result = spawnSync(bash, ['-c', `set -euo pipefail
source scripts/system-backup-smoke-contract.sh
validate_system_backup_smoke_image "registry.example:5000/clawmanager@sha256:$1" "$1"
for image in 'clawmanager:latest' "clawmanager@sha256:$2" "clawmanager@sha256:$1;invalid"; do
  if validate_system_backup_smoke_image "$image" "$1"; then exit 9; fi
done
`, 'test', pin, 'a'.repeat(64)], {cwd:root, encoding:'utf8', windowsHide:true});
  if (result.error) throw result.error;
  assert.equal(result.status,0,result.stderr);
});
test('shell contract follows new values/CRLF and rejects missing/duplicate constants', () => {
  const directory = mkdtempSync(join(tmpdir(), 'd-smoke-contract-'));
  const path = join(directory, 'bootstrap.go');
  const fixture = `\tContractMigrationCatalogHash = "${'a'.repeat(64)}"\r\n\tContractMigrationCatalogFileCount = 17\r\n`;
  try {
    writeFileSync(path, fixture);
    assert.equal(run(path).stdout, `17 ${'a'.repeat(64)} ${'a'.repeat(12)}`);
    for (const bad of ['', fixture+fixture, fixture.replace('17', '0'), fixture.replace('a'.repeat(64), 'INVALID')]) {
      writeFileSync(path, bad); assert.notEqual(run(path).status, 0);
    }
  } finally { rmSync(directory, {recursive:true}); }
});
test('all remote smoke scripts parse and enabled checks consume shared count/hash', () => {
  for (const path of ['system-backup-smoke-contract.sh', 'system-backup-controller-enabled-phase.sh', 'system-backup-controller-enabled-preflight.sh', 'system-backup-fresh-migration-smoke.sh', 'system-backup-d-invariants-phase.sh', 'system-backup-d-invariants-image-phase.sh']) {
    const result = spawnSync(bash, ['-n', `scripts/${path}`], {cwd:root, encoding:'utf8', windowsHide:true});
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
  }
  const phase = readFileSync(join(root,'scripts/system-backup-controller-enabled-phase.sh'),'utf8');
  assert.match(phase, /grep -qx "\$EXPECTED_MIGRATIONS"/);
  assert.match(phase, /catalog=\$EXPECTED_CATALOG_PREFIX/);
  assert.doesNotMatch(phase, /grep -qx 91|catalog=b3fe27c26b2/);
  for (const path of ['system-backup-controller-enabled-preflight.sh','system-backup-fresh-migration-smoke.sh']) {
    assert.match(readFileSync(join(root,'scripts',path),'utf8'), /load_system_backup_smoke_contract backend\/internal\/systembackupcontroller\/bootstrap.go/);
  }
});
