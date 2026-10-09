import test from 'node:test';
import assert from 'node:assert/strict';
import { runReadiness, validateReadinessOutput } from './system-backup-d-provider-readiness.mjs';
const output = ['D_PROVIDER_READINESS_V1', 'namespace=clawmanager-zhanghui08-system',
  'namespace_uid=337cfe30-2c17-4b8e-b32a-760778b8098e',
  ...['kubectl', 'openssl', 'python3', 'node', 'aws', 'vault', 'bao', 'mc', 'docker', 'ctr', 'crictl'].map(x => `tool=${x} available`),
  'workload=clawmanager-zhanghui08-system/minio', 'service=minio', 'storage_class=local-path', 'node=node1 amd64',
  'temporary_artifacts_created=false', 'provider_capability_proven=false', 'PASS: D provider readiness inventory only', ''].join('\n');
test('accept metadata only; reject injected output, truncation and wrong identity', () => {
  assert.equal(validateReadinessOutput(Buffer.from(output)), output);
  for (const bad of [output.replace('service=minio', 'token=DO_NOT_PRINT'), output.replace('tool=mc available\n', ''),
    output.replace('337cfe30', '437cfe30'), output.replace('provider_capability_proven=false', 'provider_capability_proven=true'), output.slice(0, -15)]) {
    assert.throws(() => validateReadinessOutput(Buffer.from(bad)));
  }
});
test('PASS never overrides failed SSH; strict host verification and LF bytes stay enabled', () => {
  const runCommand = (command, args, options) => {
    assert.equal(command, 'ssh');
    assert.ok(args.includes('StrictHostKeyChecking=yes'));
    assert.ok(args.includes('PubkeyAuthentication=no'));
    assert.equal(options.input.includes(13), false);
    assert.equal(options.shell, false);
    return { status: 1, stdout: Buffer.from(output) };
  };
  assert.throws(() => runReadiness({ host: 'root@10.130.14.23', passwordLogin: true, runCommand }), /failed/);
});
