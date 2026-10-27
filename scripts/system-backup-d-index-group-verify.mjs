import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { summarizeIndexGroups } from './system-backup-d-index-group-report.mjs';
import { indexGroupPlan } from './system-backup-d-index-groups.mjs';

export const groupTranscriptNames = indexGroupPlan.map(x => `r${x.round}-${x.variant}.txt`);
const check = (ok, message) => { if (!ok) throw new Error(message); };
const sha = value => createHash('sha256').update(value).digest('hex');

// Recompute the measured report from fixed transcript names rather than
// trusting paths, completion flags, ratios or hashes supplied by a report.
export function verifyIndexGroupSuite({ receipt, reportBytes, transcriptBytes, cacheExists, snapshotBytes }) {
  check(receipt?.kind === 'd_index_group_suite_completion' && receipt.rounds === 2 && receipt.runs === 6
    && receipt.exit === 0 && receipt.production_approved === false && receipt.local_build_cache_cleaned === true,
    'Suite completion or cleanup receipt missing');
  check(/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(receipt.local_build_cache_directory), 'Invalid suite cache identity');
  check(cacheExists === false, 'Suite build cache still exists or absence not checked');
  check(Array.isArray(receipt.transcripts) && receipt.transcripts.length === 6 && transcriptBytes.length === 6,
    'Exactly six transcript receipts are required');
  for (const [i, bytes] of transcriptBytes.entries()) {
    check(receipt.transcripts[i].name === groupTranscriptNames[i] && receipt.transcripts[i].sha256 === sha(bytes),
      'Transcript name/order/hash mismatch');
  }
  check(receipt.report_sha256 === sha(reportBytes), 'Grouped report hash mismatch');
  const saved = JSON.parse(reportBytes.toString('utf8'));
  check(Array.isArray(saved.inputs) && saved.inputs.length === 6 && saved.inputs.every((path, i) =>
    typeof path === 'string' && basename(path.replaceAll('\\', '/')) === groupTranscriptNames[i]), 'Grouped report input names mismatch');
  const { inputs, ...measurements } = saved;
  const computed = summarizeIndexGroups(transcriptBytes.map(x => x.toString('utf8')));
  if(receipt.source_snapshot_sha256 || computed.runs.some(x=>x.source_snapshot_sha256)){
    check(snapshotBytes && receipt.source_snapshot_sha256===sha(snapshotBytes),'Source snapshot manifest receipt missing or hash mismatch');
    const snapshot=JSON.parse(snapshotBytes.toString('utf8'));
    check(snapshot.kind==='d_index_group_source_snapshot' && snapshot.version===1 && snapshot.stable_copy_verified===true && snapshot.production_approved===false
      && Array.isArray(snapshot.files) && snapshot.files.length>0,'Source snapshot manifest invalid');
    check(snapshot.files.every(x=>typeof x.path==='string' && /^(backend|contracts|scripts|docs)\//.test(x.path) && !x.path.split('/').some(part=>!part || part==='.' || part==='..')
      && /^[a-f0-9]{64}$/.test(x.sha256) && Number.isSafeInteger(x.size) && x.size>=0)
      && new Set(snapshot.files.map(x=>x.path)).size===snapshot.files.length,'Source snapshot file pins invalid');
    const digest=sha(snapshot.files.map(x=>`${x.path}\0${x.sha256}\0${x.size}`).join('\n')+'\n');
    check(snapshot.source_sha256===digest && computed.runs.every(x=>x.source_snapshot_sha256===digest),'Transcript source snapshot does not match manifest');
  }
  check(isDeepStrictEqual(measurements, computed), 'Grouped report differs from original transcript measurements');
  return { kind: 'd_index_group_suite_verified', rounds: 2, runs: 6, local_cache_absent: true,
    report_sha256: sha(reportBytes), production_approved: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  check(process.argv.length === 3, 'Usage: node scripts/system-backup-d-index-group-verify.mjs <evidence-directory>');
  const directory = resolve(process.argv[2]);
  const receipt = JSON.parse(readFileSync(resolve(directory, 'suite-complete.json'), 'utf8'));
  check(/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(receipt.local_build_cache_directory), 'Invalid suite cache identity');
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  verifyIndexGroupSuite({ receipt, reportBytes: readFileSync(resolve(directory, 'report.json')),
    transcriptBytes: groupTranscriptNames.map(name => readFileSync(resolve(directory, name))),
    snapshotBytes:receipt.source_snapshot_sha256?readFileSync(resolve(directory,'source-snapshot.json')):undefined,
    cacheExists: existsSync(resolve(projectRoot, receipt.local_build_cache_directory)) });
  process.stdout.write('PASS grouped-index-suite-verification runs=6 local_cache_absent=yes production_approval=no\n');
}
