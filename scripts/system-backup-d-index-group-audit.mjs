import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {summarizeIndexGroupRun,summarizeIndexGroups} from './system-backup-d-index-group-report.mjs';
import {indexGroupPlan} from './system-backup-d-index-groups.mjs';

export function auditIndexGroupFailure(directory){
  const texts=indexGroupPlan.map(({round,variant})=>readFileSync(join(directory,`r${round}-${variant}.txt`),'utf8'));
  const runs=texts.map((text,i)=>summarizeIndexGroupRun(text,indexGroupPlan[i]));
  let rejection=null;
  try{summarizeIndexGroups(texts);}catch(error){rejection=error.message;}
  const keys=['authority_binary_sha256','http_binary_sha256'];
  const drift=Object.fromEntries(keys.map(key=>[key,[...new Set(runs.map(x=>x[key]))]]));
  return {kind:'d_index_group_failure_audit',suite_accepted:rejection===null,rejection,individual_runs_verified:runs.length,production_approved:false,
    drift,runs:runs.map(x=>({round:x.round,variant:x.variant,transcript_sha256:x.transcript_sha256,run:x.report.scope.run,
      namespace_uid:x.report.scope.namespace_uid,index_binary_sha256:x.report.binary_sha256,authority_binary_sha256:x.authority_binary_sha256,http_binary_sha256:x.http_binary_sha256})),
    conclusion:rejection?'Preserve individual receipts; do not combine differing binaries into accepted six-run comparison.':'All existing grouped consistency checks passed; completion receipt still required.'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==4)throw new Error('Usage: <group-directory> <new-audit.json>');
  const result=auditIndexGroupFailure(process.argv[2]);
  writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  process.stdout.write(`AUDITED individual_runs=${result.individual_runs_verified} suite_accepted=${result.suite_accepted} rejection=${result.rejection}\n`);
}
