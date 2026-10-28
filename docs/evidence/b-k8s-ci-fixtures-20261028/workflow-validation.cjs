
const fs=require('node:fs'), yaml=require(require('node:path').resolve('frontend/node_modules/js-yaml')), assert=require('node:assert/strict');
const workflow=yaml.load(fs.readFileSync('.github/workflows/build.yml','utf8'));
const job=workflow.jobs['k8s-smoke'];
assert(!job['continue-on-error']);
for (const step of job.steps) {
 if (step.run) {
  const result=require('node:child_process').spawnSync(process.env.SMOKE_BASH,['-n'],{input:step.run,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }
}
const source=yaml.loadAll(fs.readFileSync('deployments/k8s/single-node/clawmanager.yaml','utf8'));
const fixture=yaml.loadAll(fs.readFileSync(process.env.SMOKE_MANIFEST,'utf8'));
assert.equal(fixture.length,source.length+2);
const key=o=>o.kind+'/'+o.metadata.name;
const modified=new Set(['Deployment/mysql','Deployment/clawmanager-app','Deployment/clawmanager-secret-broker','Deployment/minio','Deployment/openclaw-runtime','Deployment/hermes-runtime','Deployment/opencode-runtime','Deployment/deepseek-harness-runtime','Service/clawmanager-frontend']);
for(let i=0;i<source.length;i++) {
 assert.equal(key(source[i]),key(fixture[i]));
 if(!modified.has(key(source[i]))) assert.deepEqual(fixture[i],source[i],key(source[i]));
 if(source[i].kind==='Deployment') {
  assert.deepEqual(fixture[i].spec.template.spec.containers.map(x=>x.env),source[i].spec.template.spec.containers.map(x=>x.env));
  assert.deepEqual(fixture[i].spec.template.spec.serviceAccountName,source[i].spec.template.spec.serviceAccountName);
 }
}
const app=fixture.find(x=>key(x)==='Deployment/clawmanager-app');
const original=source.find(x=>key(x)==='Deployment/clawmanager-app');
assert.deepEqual(app.spec.template.spec.initContainers[0].args, original.spec.template.spec.initContainers[0].args);
assert.deepEqual(app.spec.template.spec.volumes.filter(x=>x.name!=='workspaces'),original.spec.template.spec.volumes.filter(x=>x.name!=='workspaces'));
assert.equal(app.spec.replicas,0);
assert.equal(fixture.at(-1).kind,'Secret');
assert.equal(fixture.at(-2).kind,'ConfigMap');
assert.equal(fixture.at(-1).metadata.namespace,'clawmanager-system');
console.log(JSON.stringify({workflow_yaml:'parsed',all_job_shells:'bash syntax pass',original_objects:source.length,fixture_objects:fixture.length,untouched_objects:'equal',all_deployment_env_and_service_accounts:'preserved',app_auth_tls_contract:'preserved',scope:'offline only'}));
