// Read-only intake audit. Public input integrity is not provider admission,
// approval of a draft contract, deployment, human MFA or configuration activation.
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {resolve, relative, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const defaultBundle = resolve(root, 'deployments/k8s/system-backup-provider-lab/registration-bootstrap-d-admin-7d01a0782656f2af361b56e5');
const hash = value => createHash('sha256').update(value).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const requireInput = value => { if (!value) throw Error('activation_input_rejected'); };
const read = path => {
  requireInput(statSync(path).isFile() && statSync(path).size <= 2 * 1024 * 1024);
  return readFileSync(path);
};
const json = path => JSON.parse(read(path));

export function auditActivationInputs(bundle = defaultBundle) {
  const contractPath = resolve(root, 'contracts/system-backup/v12/admin-control-resources.schema.json');
  const defs = json(contractPath).$defs;
  const kinds = defs.RegistryReference.properties.registry_kind.enum;
  const purposes = defs.ConfigReference.properties.purpose.enum;
  const candidatePath = join(bundle, 'bootstrap-admission.json');
  const manifestPath = join(bundle, 'public-registries.configmap.json');
  const volumePath = join(bundle, 'registry-volume.json');
  const candidate = json(candidatePath), cm = json(manifestPath), volume = json(volumePath);
  requireInput(candidate.kind === 'd_registration_public_bootstrap_candidate_v1' && candidate.candidate_only === true);
  requireInput(candidate.config_schema_sha256 === hash(read(contractPath)));
  requireInput(cm.apiVersion === 'v1' && cm.kind === 'ConfigMap' && cm.immutable === true && cm.metadata.namespace === candidate.application_namespace);
  requireInput(volume.configMap.name === cm.metadata.name && volume.configMap.defaultMode === 292);
  requireInput(Array.isArray(candidate.registries) && Array.isArray(volume.configMap.items));
  const found = new Set(), keys = new Set(), paths = new Set();
  for (const r of candidate.registries) {
    requireInput(Object.keys(r).sort().join(',') === 'registry_kind,sha256,version');
    requireInput(kinds.includes(r.registry_kind) && !found.has(r.registry_kind) && digestPattern.test(r.sha256) && versionPattern.test(r.version) && !r.version.includes('..'));
    const path = `${r.registry_kind}/${r.version}/${r.sha256}.json`;
    const items = volume.configMap.items.filter(item => item.path === path);
    requireInput(items.length === 1 && !keys.has(items[0].key) && !paths.has(path));
    const bytes = cm.data[items[0].key];
    requireInput(typeof bytes === 'string' && Buffer.byteLength(bytes) <= 262144 && hash(bytes) === r.sha256);
    // A content hash alone is not semantic validation. The production adapter
    // must use the strict Go decoders / the appropriate owner's schema.
    const registry = JSON.parse(bytes);
    requireInput(registry.version === r.version && typeof registry.schema_version === 'string');
    found.add(r.registry_kind); keys.add(items[0].key); paths.add(path);
  }
  requireInput(Object.keys(cm.data).length === keys.size && volume.configMap.items.length === paths.size);
  const refs = candidate.references ?? [];
  requireInput(Array.isArray(refs));
  const refPurposes = new Set();
  for (const r of refs) {
    requireInput(Object.keys(r).sort().join(',') === 'identity_hash,purpose,version');
    requireInput(purposes.includes(r.purpose) && !refPurposes.has(r.purpose) && digestPattern.test(r.identity_hash) && typeof r.version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(r.version));
    requireInput(!['latest', 'current', 'default'].includes(r.version));
    refPurposes.add(r.purpose);
  }
  const manifest = json(resolve(root, 'contracts/system-backup/v12/contract-manifest.json'));
  const missingContracts = manifest.artifacts.filter(a => a.status === 'missing').map(a => a.id);
  const registryProfiles = {};
  // Search only public handoff/deployment data. Exclude examples, schemas and
  // synthetic test fixtures; record candidate locations, not inferred approval.
  let scanned = 0;
  for (const directory of ['docs/evidence', 'deployments/k8s/system-backup-provider-lab']) {
    const walk = folder => {
      for (const entry of readdirSync(folder, {withFileTypes:true})) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile() && entry.name.endsWith('.json') && statSync(path).size <= 2 * 1024 * 1024) {
          scanned++;
          let value;
          try { value = json(path); } catch { continue; }
          if (typeof value?.schema_version === 'string' && value.version) {
            (registryProfiles[value.schema_version] ??= []).push(relative(root, path).replaceAll('\\', '/'));
          }
        }
      }
    };
    walk(resolve(root, directory));
  }
  return {
    kind:'d_activation_input_audit_v1', status:'BLOCKED',
    target:{installation_id:candidate.target_installation_id, namespace:candidate.application_namespace,
      namespace_uid:candidate.application_namespace_uid, database:candidate.expected_database, user:candidate.expected_user},
    integrity_checked_registry_kinds:[...found], required_registry_count:kinds.length,
    missing_registry_kinds:kinds.filter(k => !found.has(k)),
    declared_config_reference_purposes:[...refPurposes], required_reference_count:purposes.length,
    missing_config_reference_purposes:purposes.filter(p => !refPurposes.has(p)),
    // Even declared hashes are unresolved until a live typed resolver binds
    // the resource version, authority, permission and capability to this config.
    unresolved_live_reference_purposes:purposes,
    full_config_file_present:existsSync(join(bundle, 'bootstrap-config.json')),
    runtime_file_present:existsSync(join(bundle, 'runtime.json')),
    missing_contracts:missingContracts,
    public_handoff_search:{json_files_scanned:scanned, versioned_registry_profiles:registryProfiles},
    source_bindings:[contractPath,candidatePath,manifestPath,volumePath].map(path => ({path:relative(root,path).replaceAll('\\','/'),sha256:hash(read(path))})),
    blockers:['real_registry_and_typed_ref_adapters_required','cross_resource_policy_admission_required',
      'live_database_and_admin_recheck_required','runtime_identity_tls_capacity_logout_deployment_required',
      'human_mfa_required','config_mutation_activation_required'],
    state:{remote_mutations:false,http_service_deployed:false,human_mfa_verified:false,active_config_updated:false},
    note:'Historical public input integrity only. Candidate flags and lab receipts cannot authorize deployment or activation.'
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    requireInput(args.length === 0 || args.length === 2 && args[0] === '--bundle');
    console.log(JSON.stringify(auditActivationInputs(args.length ? resolve(args[1]) : defaultBundle), null, 2));
    process.exitCode = 2; // well-formed but blocked; never interpreted as PASS
  } catch {
    console.error('activation_input_rejected; no remote action performed');
    process.exitCode = 1;
  }
}
