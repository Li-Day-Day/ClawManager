import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localRecheckPins, localRecheckEnvironment, validateManifest, validateReceipt, validateGoEvents } from './d-resources-mysql-actual-review-20261023.mjs';

// Re-run only the ordinary package, against the original run's exact inputs.
// Native stdout goes directly to a file descriptor, without PowerShell decoding.
// This is a new local execution, never a repair or replacement of old evidence.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const pinned = (file, bytes = fs.readFileSync(file)) => ({ path: relative(file), sha256: sha(bytes) });
const parentFile = path.resolve(process.argv[2] ?? '');
assert.equal(path.dirname(parentFile), path.join(root, 'docs/evidence'));
const parent = json(parentFile);
validateReceipt(parent);
const manifestFile = path.resolve(parent.source), manifest = json(manifestFile);
assert.equal(manifestFile, parentFile.slice(0, -5) + '-source.json');
validateManifest(manifest);
const inputs = localRecheckPins(manifest);
const token = crypto.randomUUID().replaceAll('-', '');
const owner = path.join(root, '.tmp-d-resources-recheck-' + token);
const source = path.join(owner, 'source');
const prefix = path.join(root, 'docs/evidence/d-resources-local-recheck-' + token);
const log = prefix + '.jsonl', stderr = prefix + '.stderr.txt';
const report = {
  kind: 'd_resources_local_recheck.v1', parent_receipt: pinned(parentFile), source_manifest: pinned(manifestFile),
  inputs, command: parent.steps[0].command, environment: localRecheckEnvironment,
  started_at: new Date().toISOString(), owner, owner_removed: false,
  source_verified_before_and_after: false, dependencies_installed: false, remote_executed: false,
  exit_code: null, error: null,
};
function readInput(base, pin) {
  let cursor = path.join(base, pin.path);
  assert.ok(cursor.startsWith(base + path.sep));
  while (cursor !== base) {
    assert.equal(fs.lstatSync(cursor).isSymbolicLink(), false, 'redirected recheck input');
    cursor = path.dirname(cursor);
  }
  const bytes = fs.readFileSync(path.join(base, pin.path));
  assert.equal(bytes.length, pin.size, 'recheck input size differs: ' + pin.path);
  assert.equal(sha(bytes), pin.sha256, 'recheck input differs: ' + pin.path);
  return bytes;
}
function selectedFiles(base) {
  const names = ['backend/go.mod', 'backend/go.sum'];
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
      assert.equal(e.isSymbolicLink(), false, 'redirected recheck source');
      const name = rel + '/' + e.name;
      if (e.isDirectory()) walk(name);
      else if (e.isFile()) names.push(name);
    }
  };
  walk('backend/internal/systembackupresources'); walk('contracts');
  return names.sort();
}
const inputNames = inputs.map(pin => pin.path).sort();
fs.mkdirSync(owner); fs.writeFileSync(path.join(owner, 'owner.txt'), token, { flag: 'wx' });
try {
  assert.deepEqual(selectedFiles(root), inputNames, 'recheck source set differs from original');
  for (const pin of inputs) {
    const bytes = readInput(root, pin), target = path.join(source, pin.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  assert.deepEqual(selectedFiles(source), inputNames);
  for (const pin of inputs) { readInput(root, pin); readInput(source, pin); }
  for (const name of ['cache', 'tmp', 'telemetry']) fs.mkdirSync(path.join(owner, name));
  fs.writeFileSync(path.join(owner, 'telemetry/mode'), 'off ' + new Date().toISOString().slice(0, 10));
  const out = fs.openSync(log, 'wx'), err = fs.openSync(stderr, 'wx');
  try {
    console.log('LOCAL_RECHECK_STARTED source_files=' + inputs.length + ' remote=no dependencies=offline');
    report.exit_code = await new Promise((resolve, reject) => {
      const child = spawn('go', parent.steps[0].command.slice(1), {
        cwd: path.join(source, 'backend'), windowsHide: true,
        env: { ...process.env, ...localRecheckEnvironment, GOCACHE: path.join(owner, 'cache'),
          GOTMPDIR: path.join(owner, 'tmp'), TEST_TELEMETRY_DIR: path.join(owner, 'telemetry') },
        stdio: ['ignore', out, err],
      });
      child.once('error', reject); child.once('exit', resolve);
    });
  } finally { fs.closeSync(out); fs.closeSync(err); }
  assert.equal(report.exit_code, 0, 'local Go command failed');
  const names = validateGoEvents(fs.readFileSync(log, 'utf8'));
  report.passed_roots = names.filter(name => !name.includes('/')).length;
  report.passed_events = names.length;
  for (const pin of inputs) { readInput(root, pin); readInput(source, pin); }
  assert.deepEqual(selectedFiles(root), inputNames);
  assert.deepEqual(selectedFiles(source), inputNames);
  report.source_verified_before_and_after = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  // Verify the exact absolute task-owned target before recursive removal.
  assert.equal(path.dirname(owner), root);
  assert.match(path.basename(owner), /^\.tmp-d-resources-recheck-[a-f0-9]{32}$/);
  assert.equal(fs.realpathSync(owner), owner);
  assert.equal(fs.lstatSync(owner).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(owner, 'owner.txt'), 'utf8'), token);
  fs.rmSync(owner, { recursive: true, force: false });
  report.owner_removed = !fs.existsSync(owner);
  report.finished_at = new Date().toISOString();
  for (const [key, file] of [['log', log], ['stderr', stderr]]) if (fs.existsSync(file)) report[key] = pinned(file);
  report.runner_sha256 = sha(fs.readFileSync(fileURLToPath(import.meta.url)));
  fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('LOCAL_RECHECK_RESULT=' + relative(prefix + '.json'));
  console.log('LOCAL_RECHECK_CLEANED=' + report.owner_removed + ' error=' + report.error);
}
