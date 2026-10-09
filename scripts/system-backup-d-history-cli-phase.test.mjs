import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const bash=process.env.BASH_EXECUTABLE || (process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash');
const hash=x=>createHash('sha256').update(x).digest('hex');

test('fresh harness rejects unsupported or incomplete CLI modes before accessing kubectl',()=>{
  for(const mode of ['2','1']) {
    const result=spawnSync(bash,['scripts/system-backup-fresh-migration-smoke.sh'],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,D_HISTORY_CLI_SMOKE:mode,D_DB_INVARIANT_SMOKE:'0'}});
    if(result.error)throw result.error;
    assert.notEqual(result.status,0);
    assert.match(result.stderr,mode==='2'?/invalid history CLI mode/:/history CLI requires dedicated pinned history inputs/);
    assert.equal(result.stdout.includes('RUN namespace='),false);
  }
});

test('CLI phase pins both binaries, requires the exact test, propagates failure and cleans uploads',()=>{
  const scratch=mkdtempSync(join(tmpdir(),'d-history-cli-phase-'));
  try {
    for(const mode of ['pass','failure','absent-test','runner-drift','probe-drift','namespace-drift','pod-drift']) {
      const probe=`#!/usr/bin/env bash
if [ "$1" = -test.list ]; then
  if [ "$MOCK_MODE" != absent-test ]; then echo TestDReviewedHistoryCLI; fi
  exit 0
fi
[ "$D_HISTORY_REVIEW_SMOKE" = 1 ] && [ -n "$D_HISTORY_CLI_SHA256" ] && [ -x "$D_HISTORY_CLI_BINARY" ] || exit 55
printf '%s' "$*" > "$MOCK_DISPATCH"
if [ "$MOCK_MODE" = failure ]; then exit 42; fi
`;
      const runner='#!/usr/bin/env bash\nexit 0\n';
      writeFileSync(join(scratch,'probe'),probe);
      writeFileSync(join(scratch,'runner'),runner);
      writeFileSync(join(scratch,'input-runner'),runner);
      const dispatch=join(scratch,mode+'.dispatch');
      const result=spawnSync(bash,['-c',`set -euo pipefail
mock_dir="$(cd "$1" && pwd)"
chmod +x "$mock_dir/probe" "$mock_dir/runner"
kubectl() {
  case "$*" in
    *"get namespace"*) if [ "$MOCK_MODE" = namespace-drift ]; then echo changed; else echo "$RUN_NAMESPACE_UID"; fi;;
    *"get pod mysql"*) if [ "$MOCK_MODE" = pod-drift ]; then echo changed; else echo "$RUN_ID"; fi;;
    *"exec -i pod/mysql"*) cat >/dev/null;;
    *"exec pod/mysql -- sh -c"*)
      while [ "$1" != -- ]; do shift; done
      shift; shift; shift
      program="$1"; shift
      p=/tmp/d-invariants.test; program="\${program//$p/$mock_dir/probe}"
      p=/tmp/d-history-migrate; program="\${program//$p/$mock_dir/runner}"
      bash -c "$program" "$@";;
    *) return 99;;
  esac
}
history_cli_mode=1
history_review_mode=1
RUN_ID=260930120000-abcd
RUN_NAMESPACE=sbk-mig-$RUN_ID
RUN_NAMESPACE_UID=11111111-1111-4111-8111-111111111111
CONTEXT=test
EXPECTED_CATALOG_HASH=${'b'.repeat(64)}
D_HISTORY_CLI_BINARY="$mock_dir/input-runner"
source scripts/system-backup-d-history-cli-phase.sh
`,'test',scratch.replaceAll('\\','/')],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,MOCK_MODE:mode,MOCK_DISPATCH:dispatch.replaceAll('\\','/'),D_INVARIANT_BINARY_SHA256:mode==='probe-drift'?'0'.repeat(64):hash(probe),D_HISTORY_CLI_SHA256:mode==='runner-drift'?'0'.repeat(64):hash(runner)}});
      if(result.error)throw result.error;
      assert.equal(result.status===0,mode==='pass',result.stderr);
      assert.equal(result.stdout.includes('PASS d-reviewed-history-cli'),mode==='pass',result.stdout);
      if(mode==='pass'||mode==='failure') assert.match(readFileSync(dispatch,'utf8'),/-test.run \^TestDReviewedHistoryCLI\$/);
      else assert.equal(existsSync(dispatch),false);
      if(!mode.endsWith('drift') || mode==='runner-drift' || mode==='probe-drift') {
        assert.equal(existsSync(join(scratch,'probe')),false);
        assert.equal(existsSync(join(scratch,'runner')),false);
      }
    }
  } finally {rmSync(scratch,{recursive:true,force:true});}
});
