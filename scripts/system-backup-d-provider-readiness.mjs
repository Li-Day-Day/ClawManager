#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identitySSHCommand, normalizeProbeInput } from './system-backup-a-identity-ssh.mjs';

export function validateReadinessOutput(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const lines = text.trimEnd().split('\n');
  if (text.includes('\r') || lines[0] !== 'D_PROVIDER_READINESS_V1' ||
      lines[1] !== 'namespace=clawmanager-zhanghui08-system' ||
      lines[2] !== 'namespace_uid=337cfe30-2c17-4b8e-b32a-760778b8098e' ||
      lines.at(-3) !== 'temporary_artifacts_created=false' ||
      lines.at(-2) !== 'provider_capability_proven=false' ||
      lines.at(-1) !== 'PASS: D provider readiness inventory only') throw new Error('inventory envelope rejected');
  const tools = ['kubectl', 'openssl', 'python3', 'node', 'aws', 'vault', 'bao', 'mc', 'docker', 'ctr', 'crictl'];
  tools.forEach((tool, index) => {
    if (![ `tool=${tool} available`, `tool=${tool} missing` ].includes(lines[index + 3])) throw new Error('tool inventory incomplete');
  });
  for (const line of lines.slice(3 + tools.length, -3)) {
    if (!/^(?:workload=[a-z0-9.-]+\/[a-z0-9.-]+|(?:service|storage_class)=[a-z0-9.-]+|node=[a-z0-9.-]+ [a-z0-9_]+)$/.test(line)) throw new Error('unexpected inventory field; output withheld');
  }
  return lines.join('\n') + '\n';
}

export function runReadiness({ host, passwordLogin, runCommand = spawnSync }) {
  const [command, ...args] = identitySSHCommand(host, { passwordLogin });
  const result = runCommand(command, args, {
    shell: false, input: normalizeProbeInput(readFileSync(new URL('./system-backup-d-provider-readiness.sh', import.meta.url))),
    timeout: 240_000, maxBuffer: 256 * 1024, windowsHide: !passwordLogin,
    stdio: ['pipe', 'pipe', passwordLogin ? 'inherit' : 'pipe'],
  });
  if (result.error || result.signal || result.status !== 0) throw new Error(`SSH/remote inventory failed (exit=${result.status ?? 'unavailable'}); output not accepted`);
  return validateReadinessOutput(result.stdout);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const passwordLogin = args.at(-1) === '--ssh-password';
    if (passwordLogin) args.pop();
    if (args.length !== 2 || args[0] !== '--ssh-host') throw new Error('usage: node scripts/system-backup-d-provider-readiness.mjs --ssh-host root@10.130.14.23 --ssh-password');
    process.stdout.write(runReadiness({ host: args[1], passwordLogin }));
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
