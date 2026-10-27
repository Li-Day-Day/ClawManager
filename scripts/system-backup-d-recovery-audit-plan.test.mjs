import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRecoveryAuditPlan } from './system-backup-d-recovery-audit-plan.mjs';

const input=()=>({namespace:'isolated',claimName:'audit',initJobName:'audit-init',storageClassName:'reviewed-audit',storageRequestBytes:1073741824,
  journalMaxBytes:67108864,headroomBytes:67108864,initImage:'example.test/python@sha256:'+'a'.repeat(64),runAsUser:10001,runAsGroup:10001,journalPath:'/audit/management.jsonl'});
test('candidate plan has one exclusive claim and a suspended immutable-image initializer',()=>{
  const plan=buildRecoveryAuditPlan(input()),[pvc,job]=plan.items;
  assert.equal(pvc.metadata.annotations['clawmanager.io/production-approved'],'false');
  assert.deepEqual(plan.metadata,{});
  assert.deepEqual(pvc.spec.accessModes,['ReadWriteOncePod']);
  assert.equal(job.spec.suspend,true);assert.equal(job.spec.backoffLimit,0);
  const pod=job.spec.template.spec,c=pod.containers[0];
  assert.equal(pod.automountServiceAccountToken,false);assert.equal(c.imagePullPolicy,'Never');
  assert.deepEqual(c.command.slice(0,2),['python3','-c']);assert.match(c.command[2],/O_EXCL/);assert.match(c.command[2],/O_NOFOLLOW/);
  assert.equal(pod.securityContext.runAsUser,10001);assert.equal(c.volumeMounts[0].mountPath,'/audit');
  assert.equal(pod.volumes[0].persistentVolumeClaim.claimName,pvc.metadata.name);
  assert.ok(!plan.items.some(x=>x.kind==='Deployment'||x.kind==='RoleBinding'));
});
test('capacity arithmetic does not lose precision and excludes the exact boundary',()=>{
  const f=input();f.storageRequestBytes=Number.MAX_SAFE_INTEGER;f.journalMaxBytes=Number.MAX_SAFE_INTEGER-4097;f.headroomBytes=4096;
  assert.doesNotThrow(()=>buildRecoveryAuditPlan(f));f.headroomBytes=4097;assert.throws(()=>buildRecoveryAuditPlan(f));
});
for(const [name,mutate] of [
  ['missing input',x=>delete x.claimName],['unreviewed extra field',x=>x.productionApproved=true],
  ['unsafe namespace',x=>x.namespace='../../other'],['zero identity',x=>x.runAsUser=0],['unsafe integer',x=>x.storageRequestBytes=2**53],
  ['capacity overflow',x=>x.journalMaxBytes=x.storageRequestBytes],['no headroom',x=>x.headroomBytes=0],
  ['mutable image',x=>x.initImage='python:latest'],['fake empty digest',x=>x.initImage='python@sha256:'+'0'.repeat(64)],
  ['image shell injection',x=>x.initImage='x;curl bad@sha256:'+'a'.repeat(64)],
  ['parent path',x=>x.journalPath='/audit/../management.jsonl'],['relative path',x=>x.journalPath='audit/management.jsonl'],
  ['root file',x=>x.journalPath='/management.jsonl'],['subdirectory alias',x=>x.journalPath='/audit/./management.jsonl'],
])test(`rejects ${name}`,()=>{const f=input();mutate(f);assert.throws(()=>buildRecoveryAuditPlan(f));});
test('example placeholder cannot be treated as approved deployment inputs',()=>{
  const example=JSON.parse(readFileSync(new URL('../deployments/k8s/system-backup-recovery-audit.input.example.json',import.meta.url),'utf8'));
  assert.throws(()=>buildRecoveryAuditPlan(example),/immutable image/);
});
