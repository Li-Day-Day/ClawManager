import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identitySSHCommand, normalizeProbeInput } from './system-backup-a-identity-ssh.mjs';

const handoffFile = new URL('../docs/evidence/system-backup-d-provider-lab-handoff-20260924.json', import.meta.url);
const expectedHash = 'c6d15516cc4b9f32dd1f4cffaa767c050ff2f2315df4509ad086c7aa51eccf4b';
export function readHandoff() {
  const bytes = readFileSync(handoffFile);
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('handoff file hash changed; review the new handoff before probing');
  return JSON.parse(bytes).handoff;
}

export function validateResult(value, h) {
  const keys = ['kind', 'status', 'started_at', 'finished_at', 'namespace', 'namespace_uid', 'identity_refs_checked', 'tls_verified',
    'temporary_artifacts_created', 'secret_values_extracted', 'token_validity_verified', 'provider_capability_approved', 'evidence_registered'];
  if (Object.keys(value).sort().join() !== keys.sort().join() || value.kind !== 'a_provider_handoff_preflight_v1' || value.status !== 'passed' ||
      value.namespace !== h.namespace || value.namespace_uid !== h.namespace_uid || value.identity_refs_checked !== 8 || value.tls_verified !== true ||
      keys.slice().filter(k => ['temporary_artifacts_created','secret_values_extracted','token_validity_verified','provider_capability_approved','evidence_registered'].includes(k)).some(k => value[k] !== false) ||
      !Number.isFinite(Date.parse(value.started_at)) || !Number.isFinite(Date.parse(value.finished_at)) || Date.parse(value.finished_at) < Date.parse(value.started_at)) {
    throw new Error('remote preflight output rejected');
  }
  return value;
}

export function runPreflight(host, passwordLogin, run = spawnSync) {
  const h = readHandoff();
  const [cmd, ...args] = identitySSHCommand(host, { passwordLogin });
  args[args.length - 1] = 'python3 -B -';
  const prefix = `import json,base64\nHANDOFF=json.loads(base64.b64decode('${Buffer.from(JSON.stringify(h)).toString('base64')}'))\n`;
  const input = Buffer.concat([Buffer.from(prefix), normalizeProbeInput(readFileSync(new URL('./system-backup-a-provider-handoff-preflight.py', import.meta.url)))]);
  const result = run(cmd, args, { shell:false, input, timeout:300_000, maxBuffer:16*1024, windowsHide:!passwordLogin,
    stdio:['pipe','pipe',passwordLogin?'inherit':'pipe'] });
  if (result.error || result.signal || result.status !== 0) {
    let stage = 'ssh_or_remote';
    try {
      const v = JSON.parse(result.stdout);
      if (v.status === 'failed' && ['initialization','context_and_namespace','public_config_bindings','identity_metadata','tools_pod','provider_tls','final_identity_recheck'].includes(v.stage)) stage = v.stage;
    } catch {}
    throw new Error(`preflight failed: stage=${stage}; exit=${result.status ?? 'unavailable'}`);
  }
  try { return validateResult(JSON.parse(result.stdout), h); }
  catch { throw new Error('remote preflight output rejected'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const password = args.at(-1) === '--ssh-password';
    if (password) args.pop();
    if (args.length !== 2 || args[0] !== '--ssh-host') throw new Error('usage: --ssh-host root@10.130.14.23 --ssh-password');
    console.log(JSON.stringify(runPreflight(args[1], password), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
