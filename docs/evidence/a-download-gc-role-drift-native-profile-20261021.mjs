// Derive the existing offline runner with only the local role seed selection
// and this evidence-directory location adjusted. No production entry changes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,raw,decode} from './a-frozen-validation-utils-20261021.mjs';
export function roleProfile(text){
  const old='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$';
  assert.equal(text.split(old).length-1,2);
  text=text.replaceAll(old,'^Test(ADownloadGCRoleMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$');
  const root="$nativeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))";
  assert.ok(text.includes(root));text=text.replace(root,"$nativeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))");
  const helper=". (Join-Path $PSScriptRoot '";assert.equal(text.split(helper).length-1,2);
  return '# Derived local role seed profile; preserves native offline, vet, source and cleanup guards.\n'+text.replaceAll(helper,". (Join-Path $nativeRoot 'scripts/");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv[2]==='--write'){
  const output='docs/evidence/a-download-gc-role-drift-native-20261021.ps1';
  fs.writeFileSync(path.join(workspace,output),roleProfile(decode(raw('scripts/system-backup-d-download-admission-native-validation.ps1'))),{flag:'wx'});
  console.log(output);
}
