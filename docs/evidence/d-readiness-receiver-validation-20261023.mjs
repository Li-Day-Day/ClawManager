import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pin = name => ({ path: name, sha256: sha(fs.readFileSync(path.join(root, name))) });
const suites = [
  ['resources', 'd-resources-mysql-actual-review-20261023', 64],
  ['drill', 'd-drill-http-review-20261023', 52],
  ['A_FK_compatibility', 'a-resources-writer-fk-actual-review-20261023', 27],
  ['A_writer_compatibility', 'a-resources-writer-actual-review-20261023', 14],
];
const inputs = suites.flatMap(([, name]) => [pin('docs/evidence/' + name + '.mjs'), pin('docs/evidence/' + name + '.test.mjs')]);
inputs.push(pin('docs/evidence/d-readiness-receiver-validation-20261023.mjs'));
const prefix = 'docs/evidence/d-readiness-receivers-' + crypto.randomUUID().replaceAll('-', '');
const report = { kind: 'd_readiness_receiver_validation.v1', started_at: new Date().toISOString(), command: process.execPath,
  inputs, steps: [], inputs_stable: false, error: null, actual_mysql: false, dependencies_installed: false };
try {
  for (const [suite, name, count] of suites) {
    const log = prefix + '-' + suite + '.txt';
    const fd = fs.openSync(path.join(root, log), 'wx');
    const args = ['--test', '--test-isolation=none', 'docs/evidence/' + name + '.test.mjs'];
    let exit;
    try {
      exit = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', fd, fd] });
        child.once('error', reject); child.once('exit', resolve);
      });
    } finally { fs.closeSync(fd); }
    const step = { suite, args, tests: count, exit_code: exit, log: pin(log) }; report.steps.push(step);
    assert.equal(exit, 0, suite + ' native exit');
    const text = fs.readFileSync(path.join(root, log), 'utf8');
    for (const [label, expected] of [['tests', count], ['pass', count], ['fail', 0], ['cancelled', 0], ['skipped', 0], ['todo', 0]]) {
      assert.match(text, new RegExp('(?:ℹ|#) ' + label + ' ' + expected + '(?:\\r?\\n|$)', 'u'), suite + ' ' + label);
    }
    console.log('PASS receiver=' + suite + ' tests=' + count);
  }
  for (const input of inputs) assert.equal(pin(input.path).sha256, input.sha256, 'receiver drift: ' + input.path);
  report.inputs_stable = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  report.completed_at = new Date().toISOString();
  fs.writeFileSync(path.join(root, prefix + '.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('RECEIVER_VALIDATION=' + prefix + '.json');
}
