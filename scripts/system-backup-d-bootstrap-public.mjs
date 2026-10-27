// Assemble verified public inputs only. Never call kubectl, mutate SQL, mint
// credentials, activate config or substitute fixtures for missing registries.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';
import {normalizeProbeInput} from './system-backup-a-identity-ssh.mjs';
import {readCandidates, makeChallenges, validateSigningResult} from './system-backup-d-issuer-signing.mjs';
import {validateAdminResult, candidateRBAC} from './system-backup-d-admin-identity.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const requireValue = v => { if (!v) throw Error('public bootstrap input rejected'); };
const read = p => readFileSync(new URL('../' + p, import.meta.url));
const adminRun = 'd-admin-7d01a0782656f2af361b56e5';
const signingRun = 'd-sig-fa480a2d4c87ebdf0e48f9e6';

export function preparePublicBootstrap() {
  const h = readHandoff(), candidates = readCandidates(h);
  const adminRaw = read(`docs/evidence/system-backup-admin-identity-${adminRun}.json`);
  requireValue(sha(adminRaw) === '93dcc88e5aa21f3db3a0124078b2ae9295848b1efe6a665c7f6a8d3346be5cb9');
  const admin = JSON.parse(adminRaw);
  const {candidate_rbac_sha256, candidate_rbac_file, candidate_only, binding_database_note, ...wire} = admin;
  // This is historical evidence verification. Deployment must repeat live user
  // and database identity checks; do not pretend that the snapshot is fresh.
  validateAdminResult(wire, {run:adminRun, username:'admin', h,
    runnerHash:sha(normalizeProbeInput(read('scripts/system-backup-d-admin-identity.py'))), now:Date.parse(wire.snapshot.observed_at)});
  const rbacRaw = read(`docs/evidence/system-backup-registration-rbac-${adminRun}.candidate.json`);
  requireValue(candidate_only === true && sha(rbacRaw) === candidate_rbac_sha256 &&
    candidate_rbac_sha256 === 'c01f269405ebf341f7bb6910d486654752324020ae3127939fa045ec6bb5486f' &&
    rbacRaw.toString() === JSON.stringify(candidateRBAC(wire)) + '\n');
  const signing = JSON.parse(read(`docs/evidence/system-backup-issuer-signing-${signingRun}.json`));
  const files = {base_source:'system-backup-a-evidence-spike.py', client_source:'system-backup-d-lifecycle-client.py',
    lifecycle_source:'system-backup-d-lifecycle.py', signing_client_source:'system-backup-d-issuer-signing-client.py', runner:'system-backup-d-issuer-signing.py'};
  const bindings = Object.fromEntries(Object.entries(files).map(([k, f]) => [k + '_sha256', sha(normalizeProbeInput(read('scripts/' + f)))]));
  validateSigningResult(signing, {run:signingRun, h, candidates, bindings, challenges:makeChallenges(signingRun, h, candidates)});

  const registries = [
    {kind:'provider_proof_issuers', version:candidates.provider.run_id, hash:candidates.provider.registry_sha256, key:'provider.json', raw:candidates.provider.registry_json},
    {kind:'strong_auth_issuers', version:candidates.strong.run_id, hash:candidates.strong.registry_sha256, key:'strong.json', raw:candidates.strong.registry_json},
    {kind:'rbac_bindings', version:adminRun, hash:candidate_rbac_sha256, key:'rbac.json', raw:rbacRaw.toString()},
  ];
  for (const r of registries) requireValue(sha(r.raw) === r.hash);
  const contractRaw = read('contracts/system-backup/v12/admin-control-resources.schema.json');
  const defs = JSON.parse(contractRaw).$defs;
  const requiredRegistries = defs.RegistryReference.properties.registry_kind.enum;
  const requiredRefs = defs.ConfigReference.properties.purpose.enum;
  requireValue(requiredRegistries.length === 9 && requiredRefs.length === 20);
  const name = 'd-reg-public-' + adminRun.slice('d-admin-'.length);
  const manifest = {apiVersion:'v1', kind:'ConfigMap', immutable:true,
    metadata:{name, namespace:wire.namespace, labels:{'clawmanager.io/d-bootstrap-candidate':adminRun}},
    data:Object.fromEntries(registries.map(r => [r.key, r.raw]))};
  const volume = {name:'registration-registries', configMap:{name, defaultMode:292,
    items:registries.map(r => ({key:r.key, path:`${r.kind}/${r.version}/${r.hash}.json`}))}};
  const report = {kind:'d_registration_public_bootstrap_candidate_v1', candidate_only:true,
    target_installation_id:wire.target_installation_id, application_namespace:wire.namespace,
    application_namespace_uid:wire.namespace_uid, provider_namespace:h.namespace, provider_namespace_uid:h.namespace_uid,
    expected_database:{name:wire.snapshot.database, server_uuid:wire.snapshot.server_uuid},
    expected_user:wire.snapshot.users[0], source_observed_at:wire.snapshot.observed_at,
    source_admin_evidence_sha256:sha(adminRaw), config_schema_sha256:sha(contractRaw),
    registries:registries.map(({kind, version, hash}) => ({registry_kind:kind, version, sha256:hash})),
    admission:{ready_for_activation:false, missing_registry_kinds:requiredRegistries.filter(k => !registries.some(r => r.kind === k)),
      unresolved_config_reference_purposes:requiredRefs, runtime_tables_present:wire.snapshot.runtime_table_count,
      config_rows:wire.snapshot.config_rows, active_installations:wire.snapshot.active_installations,
      missing_implementation:['first_config_bootstrap', 'config_update_transaction', 'deployment_database_identity_guard'],
      pending_deployment:['runtime_schema', 'runtime_signing_identities', 'TLS_listener', 'capacity_collector', 'core_logout_hook'],
      required_acceptance:['live_admin_and_database_recheck', 'human_TOTP', 'HTTP_provider_observation_and_registration', 'config_activation']},
    state:{remote_mutations:false, active_config_updated:false, http_service_ready:false, human_mfa_verified:false},
    scope_note:'Three validated public registries only. This ConfigMap proposal is not a full RuntimeConfig or an activation plan. No identity hash, missing registry or config value is fabricated.'};
  return {manifest, volume, report};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = preparePublicBootstrap();
    const directory = new URL(`../deployments/k8s/system-backup-provider-lab/registration-bootstrap-${adminRun}/`, import.meta.url);
    mkdirSync(directory); // Never overwrite or adopt an existing candidate bundle.
    for (const [name, value] of Object.entries({'public-registries.configmap.json':result.manifest,
      'registry-volume.json':result.volume, 'bootstrap-admission.json':result.report})) {
      writeFileSync(new URL(name, directory), JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
    }
    console.log('bundle=' + fileURLToPath(directory));
    console.log('PUBLIC_INPUTS_READY registries=3/9 unresolved_config_refs=20/20 remote_mutations=false activation_ready=false');
  } catch {
    console.error('Public bootstrap inputs rejected or destination already exists; no remote action performed');
    process.exitCode = 1;
  }
}
