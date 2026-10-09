#!/usr/bin/env node
// Local Node -> OpenSSH byte pipe. Passwords stay in OpenSSH's console prompt;
// no PowerShell string pipeline, temporary files, uploads or remote mutations.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const identityHash = 'a88b9dcf73776853ff36887f705a156b3ffdf4db12ab2497c614ffa6f814079b';
export const passLine = 'PASS: A current-context identity and active-config read-only preflight';

export function normalizeProbeInput(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\0')) throw new Error('probe script contains a NUL byte');
  return Buffer.from(text.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n'), 'utf8');
}

export function identitySSHCommand(host, { passwordLogin = false } = {}) {
  if (typeof host !== 'string' || !/^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*@)?[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(host)) {
    throw new Error('SSH host must be a configured alias or user@hostname');
  }
  return ['ssh', '-T', '-o', `BatchMode=${passwordLogin ? 'no' : 'yes'}`,
    '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2',
    ...(passwordLogin ? ['-o', 'PubkeyAuthentication=no', '-o', 'PreferredAuthentications=password', '-o', 'NumberOfPasswordPrompts=1'] : []),
    host, 'bash --noprofile --norc -s'];
}

export function validateIdentityOutput(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\r')) throw new Error('unexpected CR in probe output');
  const lines = text.trimEnd().split('\n');
  const keys = ['probe_started_at', 'probe_finished_at', 'installation_identity_hash', 'authenticated_subject_hash',
    'config_rows', 'active_installations', 'tls_verification_enabled', 'namespace_identity_stable',
    'temporary_artifacts_created', 'historical_candidate_authenticated', 'evidence_registered'];
  if (lines.length !== keys.length + 1 || lines.at(-1) !== passLine) throw new Error('incomplete probe output');
  const result = {};
  keys.forEach((key, i) => {
    if (!lines[i].startsWith(key + '=')) throw new Error('unexpected probe field');
    result[key] = lines[i].slice(key.length + 1);
  });
  for (const key of ['probe_started_at', 'probe_finished_at']) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(result[key]) || !Number.isFinite(Date.parse(result[key]))) throw new Error('invalid probe time');
  }
  if (result.probe_finished_at < result.probe_started_at || result.installation_identity_hash !== identityHash ||
      !/^[0-9a-f]{64}$/.test(result.authenticated_subject_hash) ||
      !/^\d+$/.test(result.config_rows) || !/^\d+$/.test(result.active_installations) ||
      result.tls_verification_enabled !== 'true' || result.namespace_identity_stable !== 'true' ||
      result.temporary_artifacts_created !== 'false' || result.historical_candidate_authenticated !== 'false' || result.evidence_registered !== 'false') {
    throw new Error('probe identity, counters or safety assertions do not match');
  }
  return keys.map(key => `${key}=${result[key]}`).join('\n') + '\n' + passLine + '\n';
}

export function runIdentityProbe({ host, passwordLogin = false, scriptBytes, runCommand = spawnSync }) {
  const command = identitySSHCommand(host, { passwordLogin });
  const input = normalizeProbeInput(scriptBytes);
  const response = runCommand(command[0], command.slice(1), {
    shell: false, input, timeout: 120_000, maxBuffer: 16 * 1024,
    windowsHide: !passwordLogin,
    stdio: ['pipe', 'pipe', passwordLogin ? 'inherit' : 'pipe'],
  });
  // A printed PASS cannot override SSH/remote exit failure or a timeout.
  if (response.error || response.signal || response.status !== 0) {
    const code = Number.isInteger(response.status) ? response.status : 'unavailable';
    throw new Error(`SSH/remote preflight failed (exit=${code}); no successful result accepted`);
  }
  try { return validateIdentityOutput(response.stdout); }
  catch { throw new Error('remote preflight output rejected; no successful result accepted'); }
}

function main() {
  const args = process.argv.slice(2);
  const passwordLogin = args.at(-1) === '--ssh-password';
  if (passwordLogin) args.pop();
  if (args.length !== 2 || args[0] !== '--ssh-host') throw new Error('usage: node scripts/system-backup-a-identity-ssh.mjs --ssh-host <alias-or-user@host> [--ssh-password]');
  const output = runIdentityProbe({ host: args[1], passwordLogin, scriptBytes: readFileSync(new URL('./system-backup-a-identity-readonly-probe.sh', import.meta.url)) });
  process.stdout.write(output);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
