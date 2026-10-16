import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const label = value => typeof value === 'string' && value.length <= 63 && /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const fields = ['namespace','claimName','initJobName','storageClassName','storageRequestBytes','journalMaxBytes','headroomBytes','initImage','runAsUser','runAsGroup','journalPath'];

export function buildRecoveryAuditPlan(input) {
  check(input && !Array.isArray(input) && Object.keys(input).length === fields.length && fields.every(x => Object.hasOwn(input, x)), 'Exact reviewed deployment fields required');
  for (const key of ['namespace','claimName','initJobName']) check(label(input[key]), 'Invalid Kubernetes name: ' + key);
  check(typeof input.storageClassName === 'string' && input.storageClassName.length <= 253 && /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(input.storageClassName), 'Invalid reviewed StorageClass');
  for (const key of ['storageRequestBytes','journalMaxBytes','headroomBytes','runAsUser','runAsGroup']) check(positive(input[key]), 'Positive exact integer required: ' + key);
  check(input.journalMaxBytes >= 4096 && BigInt(input.journalMaxBytes) + BigInt(input.headroomBytes) < BigInt(input.storageRequestBytes), 'Journal capacity and independent headroom exceed request');
  check(input.runAsUser <= 2147483647 && input.runAsGroup <= 2147483647, 'Writer identity out of range');
  check(typeof input.initImage === 'string' && /^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(input.initImage) && !input.initImage.endsWith('0'.repeat(64)), 'Initializer requires a reviewed immutable image with Python 3');
  check(typeof input.journalPath === 'string' && /^\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+$/.test(input.journalPath)
    && !input.journalPath.split('/').some(x => x === '.' || x === '..'), 'Fixed absolute journal path required');
  const script = readFileSync(new URL('./system-backup-d-recovery-audit-init.py', import.meta.url), 'utf8');
  const annotations = {'clawmanager.io/candidate-only':'true','clawmanager.io/production-approved':'false','clawmanager.io/journal-path':input.journalPath,
    'clawmanager.io/journal-max-bytes':String(input.journalMaxBytes),
    'clawmanager.io/audit-init-sha256':createHash('sha256').update(script).digest('hex')};
  return {apiVersion:'v1',kind:'List',metadata:{},items:[
    {apiVersion:'v1',kind:'PersistentVolumeClaim',metadata:{name:input.claimName,namespace:input.namespace,annotations},
      spec:{accessModes:['ReadWriteOncePod'],volumeMode:'Filesystem',storageClassName:input.storageClassName,
        resources:{requests:{storage:String(input.storageRequestBytes)}}}},
    {apiVersion:'batch/v1',kind:'Job',metadata:{name:input.initJobName,namespace:input.namespace,annotations},
      spec:{suspend:true,backoffLimit:0,activeDeadlineSeconds:180,template:{metadata:{annotations},spec:{
        restartPolicy:'Never',automountServiceAccountToken:false,
        securityContext:{runAsNonRoot:true,runAsUser:input.runAsUser,runAsGroup:input.runAsGroup,fsGroup:input.runAsGroup,fsGroupChangePolicy:'OnRootMismatch',seccompProfile:{type:'RuntimeDefault'}},
        containers:[{name:'audit-initializer',image:input.initImage,imagePullPolicy:'Never',command:['python3','-c',script],
          args:['--path',input.journalPath,'--uid',String(input.runAsUser),'--gid',String(input.runAsGroup)],
          securityContext:{allowPrivilegeEscalation:false,readOnlyRootFilesystem:true,capabilities:{drop:['ALL']}},
          resources:{requests:{cpu:'10m',memory:'32Mi'},limits:{cpu:'100m',memory:'64Mi'}},
          volumeMounts:[{name:'recovery-audit',mountPath:posix.dirname(input.journalPath),readOnly:false}]}],
        volumes:[{name:'recovery-audit',persistentVolumeClaim:{claimName:input.claimName,readOnly:false}}],
      }}}},
  ]};
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  check(process.argv.length === 4, 'Usage: node scripts/system-backup-d-recovery-audit-plan.mjs <reviewed-input.json> <new-plan.json>');
  const plan=buildRecoveryAuditPlan(JSON.parse(readFileSync(process.argv[2],'utf8')));
  writeFileSync(process.argv[3],JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
  process.stdout.write('PASS audit-storage-plan generated=yes init_suspended=yes production_approval=no\n');
}
