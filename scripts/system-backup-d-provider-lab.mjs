#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { identitySSHCommand, normalizeProbeInput } from './system-backup-a-identity-ssh.mjs';

try {
  const args = process.argv.slice(2);
  const passwordLogin = args.at(-1) === '--ssh-password';
  if (passwordLogin) args.pop();
  const action = args.shift();
  const options = { action };
  const allowed = action === 'deploy' ? ['--ssh-host', '--image'] : action === 'cleanup' ? ['--ssh-host', '--namespace', '--uid'] : [];
  if (!allowed.length || args.length !== allowed.length * 2) throw new Error('usage: deploy --ssh-host HOST --image REPO@sha256:DIGEST --ssh-password; or cleanup --ssh-host HOST --namespace NAME --uid UID --ssh-password');
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i].slice(2))) throw new Error('unexpected/duplicate argument');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (action === 'deploy' && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(options.image)) throw new Error('digest-pinned image required');
  if (action === 'cleanup' && (!/^sbk-provider-zh-[a-f0-9]{12}$/.test(options.namespace) || !/^[a-f0-9-]{36}$/.test(options.uid))) throw new Error('exact lab namespace and UID required');
  const [command, ...sshArgs] = identitySSHCommand(options['ssh-host'], { passwordLogin });
  sshArgs[sshArgs.length - 1] = 'python3 -';
  // JSON transported as base64 avoids Python boolean/string-literal ambiguity.
  const client = normalizeProbeInput(readFileSync(new URL('../deployments/k8s/system-backup-provider-lab/client.py', import.meta.url)));
  const prefix = `import json, base64\nLAB_OPTIONS=json.loads(base64.b64decode('${Buffer.from(JSON.stringify(options)).toString('base64')}'))\nLAB_CLIENT_SOURCE=base64.b64decode('${client.toString('base64')}').decode('utf-8')\n`;
  const code = normalizeProbeInput(readFileSync(new URL('./system-backup-d-provider-lab.py', import.meta.url)));
  const result = spawnSync(command, sshArgs, { shell: false, input: Buffer.concat([Buffer.from(prefix), code]),
    windowsHide: !passwordLogin, stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.error || result.signal || result.status !== 0) throw new Error('SSH/deployment or cleanup failed; keep the printed namespace/UID for recovery');
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
