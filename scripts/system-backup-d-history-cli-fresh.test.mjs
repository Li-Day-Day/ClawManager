import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
const bash=process.env.BASH_EXECUTABLE || (process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash');
const hash=x=>createHash('sha256').update(x).digest('hex');
test('history CLI fresh harness uses current runner and exact ledger before dispatch, without an app Pod',()=>{
  const scratch=mkdtempSync(join(root,'.tmp-d-history-fresh-'));
  try {
    const scripts=['system-backup-fresh-migration-smoke.sh','system-backup-smoke-contract.sh','system-backup-d-migration-phase.sh','system-backup-d-invariants-phase.sh','system-backup-d-history-cli-phase.sh'];
    mkdirSync(join(scratch,'scripts'));
    for(const script of scripts)writeFileSync(join(scratch,'scripts',script),readFileSync(join(root,'scripts',script),'utf8').replaceAll('\r\n','\n'));
    mkdirSync(join(scratch,'backend/internal/systembackupcontroller'),{recursive:true});
    writeFileSync(join(scratch,'backend/internal/systembackupcontroller/bootstrap.go'),readFileSync(join(root,'backend/internal/systembackupcontroller/bootstrap.go')));
    mkdirSync(join(scratch,'backend/internal/db/migrations'),{recursive:true});
    const files=readdirSync(join(root,'backend/internal/db/migrations')).filter(x=>x.endsWith('.sql')).sort();
    for(const name of files)writeFileSync(join(scratch,'backend/internal/db/migrations',name),'-- inert fixture\n');
    writeFileSync(join(scratch,'filenames'),files.join('\n')+'\n');
    const runner=`#!/usr/bin/env bash
set -eu
[[ "$1" == --apply && "$2" == --dsn-file && -s "$3" && "$4" == --expected-server-uuid && "$5" == 11111111-2222-3333-4444-555555555555 && "$6" == --expected-database && "$7" == clawmanager && "$8" == --expected-catalog-sha256 && "$9" == "$MOCK_CATALOG" ]] || exit 81
printf '%s\n' "$*" > "$MOCK_DIR/runner-run"
[[ "$MOCK_MODE" != fresh-failure ]] || exit 42
echo '{"result":"PASS"}'
`;
    const probe=`#!/usr/bin/env bash
set -eu
if [[ "$1" == -test.list ]]; then echo TestDReviewedHistoryCLI; exit 0; fi
[[ -f "$MOCK_DIR/runner-run" && "$D_HISTORY_REVIEW_SMOKE" == 1 ]] || exit 82
printf '%s\n' "$*" > "$MOCK_DIR/probe-run"
`;
    writeFileSync(join(scratch,'runner'),runner);writeFileSync(join(scratch,'probe'),probe);
    const catalog=readFileSync(join(root,'backend/internal/systembackupcontroller/bootstrap.go'),'utf8').match(/ContractMigrationCatalogHash\s*=\s*"([0-9a-f]{64})"/)[1];
    for(const mode of ['pass','fresh-failure','wrong-filenames','unexpected-app','conflicting-runner']){
      for(const name of ['runner-run','probe-run','kubectl-log'])rmSync(join(scratch,name),{force:true});
      const result=spawnSync(bash,['-c',`set -euo pipefail
export MOCK_DIR="$(cd "$1" && pwd)"
export MYSQL_USER=clawmanager MYSQL_PASSWORD=inert-fixture
sleep() { echo 'unexpected polling: fresh runner should already have completed' >&2; return 87; }
kubectl() {
  printf '%s\n' "$*" >> "$MOCK_DIR/kubectl-log"
  case "$*" in
    *"get configmap clawmanager-mysql-init"*) echo '-- fixture schema';;
    *"get pods -l app=mysql"*) echo 'containerd://registry.example/mysql@sha256:${'a'.repeat(64)}';;
    *"exec deploy/mysql"*) echo '8.4.8';;
    *"get node"*) if [[ "$*" == *Ready* ]]; then echo True; else echo False; fi;;
    *"create configmap"*|*"wait pod/mysql"*) return 0;;
    *"create -f -"*)
      spec="$(cat)"
      [[ "$spec" != *migration-app* ]] || { echo 'old app must not run' >&2; return 83; }
      if [[ "$spec" == *'kind: Namespace'* ]]; then echo '11111111-1111-4111-8111-111111111111'; fi;;
    *"get namespace"*) echo '11111111-1111-4111-8111-111111111111';;
    *"delete namespace"*) return 0;;
    *"get pod mysql"*) if [[ "$*" == *status.podIP* ]]; then echo '127.0.0.1'; else echo "$RUN_ID"; fi;;
    *"get pods -l app=migration-app"*) if [[ "$MOCK_MODE" == unexpected-app ]]; then echo 'pod/stray'; fi;;
    *"exec pod/mysql -- uname -m"*) echo x86_64;;
    *"exec "*"pod/mysql -- sh -c"*)
      while [[ "$1" != -- ]]; do shift; done
      shift; shift; shift
      program="$1"; shift
      if [[ "\${1:-}" == query ]]; then
        case "$2" in
          *"TABLE_NAME='schema_migrations'"*) echo 0;;
          'SELECT @@server_uuid') echo '11111111-2222-3333-4444-555555555555';;
          'SELECT COUNT(*) FROM schema_migrations') [[ -f "$MOCK_DIR/runner-run" ]] || return 84; echo '${files.length}';;
          'SELECT filename FROM schema_migrations ORDER BY filename')
            if [[ "$MOCK_MODE" == wrong-filenames ]]; then sed '1s/.*/999_wrong.sql/' "$MOCK_DIR/filenames"; else cat "$MOCK_DIR/filenames"; fi;;
          *'CONCAT(TABLE_NAME'* ) printf '%s\n' 'system_backup_check_results.actual_canonical_json=blob' 'system_backup_check_results.expected_canonical_json=blob' 'system_backup_operations.external_action_public_ids_canonical_json=blob' 'system_backup_operations.retry_of_operation_public_id=char';;
          'CREATE TABLE d_invariant_run_marker'*) return 0;;
          *) echo 'unexpected SQL' >&2; return 85;;
        esac
      elif [[ "$program" == *'SET GLOBAL time_zone'* ]]; then return 0
      else
        remote_prefix=/tmp/
        program="\${program//$remote_prefix/$MOCK_DIR/}"
        bash -c "$program" "$@"
      fi;;
    *) echo 'unexpected kubectl call' >&2; return 86;;
  esac
}
export D_HISTORY_CLI_BINARY="$MOCK_DIR/runner" D_INVARIANT_BINARY="$MOCK_DIR/probe"
if [[ "$MOCK_MODE" == conflicting-runner ]]; then export D_MIGRATION_BINARY=/different/runner; fi
source "$MOCK_DIR/scripts/system-backup-fresh-migration-smoke.sh"
`,'test',scratch.replaceAll('\\','/')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:90000,env:{...process.env,MOCK_MODE:mode,MOCK_CATALOG:catalog,D_HISTORY_CLI_SMOKE:'1',D_HISTORY_REVIEW_SMOKE:'1',D_DB_INVARIANT_SMOKE:'1',D_PROVIDER_REGISTRATION_SMOKE:'0',D_HISTORY_CLI_SHA256:hash(runner),D_INVARIANT_BINARY_SHA256:hash(probe),TEST_APP_IMAGE:'registry.example/old-app@sha256:'+'b'.repeat(64),EXPECTED_APP_DIGEST:'b'.repeat(64)}});
      if(result.error)throw new Error(mode+' '+result.error+'\n'+result.stdout+'\n'+result.stderr);
      assert.equal(result.status===0,mode==='pass',mode+'\n'+result.stdout+'\n'+result.stderr);
      assert.equal(existsSync(join(scratch,'probe-run')),mode==='pass',mode);
      assert.equal(result.stdout.includes('PASS d-reviewed-history-cli'),mode==='pass');
      if(mode==='pass')assert.ok(result.stdout.includes(`applied=${files.length} exact_filenames=yes`));
      if(mode==='conflicting-runner')assert.equal(existsSync(join(scratch,'kubectl-log')),false);
      else assert.match(result.stdout,/CLEANED namespace=/);
      for(const name of ['d-system-backup-migrate','d-migration-dsn','d-invariants.test','d-history-migrate'])assert.equal(existsSync(join(scratch,name)),false,mode+' leaked '+name);
    }
  } finally {
    assert.ok(resolve(scratch).startsWith(resolve(root)+sep));
    rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});
