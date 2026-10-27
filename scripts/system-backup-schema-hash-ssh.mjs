#!/usr/bin/env node
// D-owned transport: local Node, remote kubectl/mysql, no remote tool install.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureSchemaHashCandidate, kubectlCaptureCommand } from './system-backup-schema-hash-capture.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const identityVersion = 'k8s-namespace-uid-v1';
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export function sshCommand(host, argv, { passwordLogin = false } = {}) {
  // An OpenSSH config alias or user@hostname; no flags, paths or shell syntax.
  if (typeof host !== 'string' || !/^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*@)?[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(host)) {
    throw new Error('SSH host must be a configured alias or user@hostname');
  }
  return ['ssh', '-T', '-o', `BatchMode=${passwordLogin ? 'no' : 'yes'}`, '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
    ...(passwordLogin ? ['-o', 'PreferredAuthentications=keyboard-interactive,password', '-o', 'NumberOfPasswordPrompts=1'] : []), host,
    // In password mode only SSH's own terminal prompts/diagnostics are shown.
    // Suppress remote kubectl/mysql stderr before inheriting local SSH stderr.
    argv.map(quote).join(' ') + (passwordLogin ? ' 2>/dev/null' : '')];
}

export function captureRemoteSchemaHashCandidate({ host, kubectlContext, namespace, database, inventory, migrationCatalog, captureSql, temporaryRoot, passwordLogin = false, runCommand = spawnSync }) {
  const target = { kubectlContext, namespace, database };
  const captureCommand = sshCommand(host, kubectlCaptureCommand(target), { passwordLogin });
  const uidCommand = sshCommand(host, ['kubectl', `--context=${kubectlContext}`, 'get', 'namespace', namespace, '-o', 'jsonpath={.metadata.uid}'], { passwordLogin });
  const runSSH = (executable, args, options) => runCommand(executable, args, passwordLogin ? {
    ...options, windowsHide: false, stdio: ['pipe', 'pipe', 'inherit'], timeout: 120_000,
  } : options);
  function namespaceUID() {
    const response = runSSH(uidCommand[0], uidCommand.slice(1), { shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 4096 });
    if (response.error || response.status !== 0 || response.signal) throw new Error('remote namespace identity check failed; inspect SSH/context access locally');
    const uid = Buffer.from(response.stdout).toString('utf8').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uid)) throw new Error('remote namespace UID is invalid');
    return uid;
  }
  const before = namespaceUID();
  let candidate;
  try {
    candidate = captureSchemaHashCandidate({
      command: captureCommand,
      context: {
        installation_identity_hash: createHash('sha256').update(`${identityVersion}\0${before}`).digest('hex'),
        installation_identity_version: identityVersion,
      },
      inventory, migrationCatalog, captureSql, temporaryRoot, runCommand: runSSH,
    });
  } catch {
    // Canonicalizer diagnostics can contain untrusted object/field names too.
    throw new Error('remote schema capture or canonicalization failed; no candidate issued');
  }
  if (namespaceUID() !== before) throw new Error('namespace identity changed during capture; candidate rejected');
  return candidate;
}

function main() {
  const args = process.argv.slice(2);
  const passwordLogin = args.at(-1) === '--ssh-password';
  if (passwordLogin) args.pop();
  const flags = ['--ssh-host', '--kubectl-context', '--namespace', '--database'];
  if (args.length !== 8 || flags.some((flag, i) => args[i * 2] !== flag || !args[i * 2 + 1])) {
    throw new Error('usage: node scripts/system-backup-schema-hash-ssh.mjs --ssh-host <alias-or-user@host> --kubectl-context <context> --namespace <namespace> --database <database> [--ssh-password]');
  }
  const candidate = captureRemoteSchemaHashCandidate({
    host: args[1], kubectlContext: args[3], namespace: args[5], database: args[7], passwordLogin,
    inventory: JSON.parse(readFileSync(join(root, 'docs/system-backup-restore-schema-inventory.json'), 'utf8')),
    migrationCatalog: JSON.parse(readFileSync(join(root, 'contracts/system-backup/v12/schema-registry.json'), 'utf8')).migration_catalog,
    captureSql: readFileSync(join(root, 'contracts/system-backup/v12/schema-hash-capture.mysql.sql'), 'utf8'),
  });
  process.stdout.write(`${JSON.stringify(candidate, null, 2)}\n`);
  if (!candidate.inventory_comparison.matched) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  try { main(); } catch (error) {
    // Query output must never be copied into evidence/errors. Password mode
    // shows SSH terminal diagnostics directly, never captures passwords.
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
