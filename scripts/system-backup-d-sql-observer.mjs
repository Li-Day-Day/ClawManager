import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute } from 'node:path';

const execute = promisify(execFile);
const fail = () => { throw new Error('system backup SQL observation unavailable'); };

export function observerEnvironment(source) {
  const result = {};
  for (const name of ['SystemRoot', 'WINDIR', 'SBK_OBSERVER_DSN_FILE', 'SBK_OBSERVER_CA_FILE', 'SBK_OBSERVER_INSTALLATION_ID',
    'SBK_OBSERVER_SERVER_UUID', 'SBK_OBSERVER_DATABASE', 'SBK_OBSERVER_USER', 'SBK_OBSERVER_HOST']) {
    if (source[name] !== undefined) result[name] = source[name];
  }
  return result;
}

// The smoke CLI loads this named hook from the configured observer module.
export const observeTask = observe;

// Only the dedicated observer's input names enter the child. In particular,
// SBK_SMOKE_* bearer/password values are never inherited by this process.
export async function observe({ mode, kind, publicID, installationID, configVersion, actorID, keySHA256, signal }) {
  const env = process.env;
  if (mode !== 'real' || !['backup', 'preflight'].includes(kind) ||
      !new RegExp(`^${kind === 'backup' ? 'sbk' : 'spf'}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).test(publicID) ||
      installationID !== env.SBK_OBSERVER_INSTALLATION_ID || !Number.isSafeInteger(configVersion) || configVersion < 1 ||
      !/^[1-9][0-9]{0,19}$/.test(actorID ?? '') || !/^[0-9a-f]{64}$/.test(keySHA256 ?? '') ||
      !isAbsolute(env.SBK_SQL_OBSERVER_BINARY ?? '')) fail();
  const childEnv = observerEnvironment(env);
  let output;
  try {
    output = await execute(env.SBK_SQL_OBSERVER_BINARY, ['-kind', kind, '-public-id', publicID,
      '-config-version', String(configVersion), '-actor-id', actorID, '-key-sha256', keySHA256], { env: childEnv, signal, timeout: 11000, maxBuffer: 65536,
      windowsHide: true, encoding: 'utf8' });
  } catch { fail(); }
  let result;
  try { result = JSON.parse(output.stdout); } catch { fail(); }
  if (output.stderr || result.schemaVersion !== 'system-backup-sql-observation.v1' || result.readOnly !== true ||
      result.snapshotRolledBack !== true || result.publicID !== publicID || result.installationID !== installationID ||
      result.configVersion !== configVersion || result.tupleBound !== true) fail();
  return result;
}
