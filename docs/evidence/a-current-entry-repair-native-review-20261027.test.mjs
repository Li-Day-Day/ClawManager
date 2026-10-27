import test from 'node:test';
import assert from 'node:assert/strict';
import {requireCompleteCurrentOrdinary} from './a-current-entry-repair-native-review-20261027.mjs';
import {remainingPackages} from './a-bootstrap-current-repair-inventory-20261027.mjs';
const fixture=()=>({kind:'d2_current_ordinary_complete_native.v1',status:'passed_selected_complete_ordinary_packages',error:null,
  Go_started:true,tests_started:true,source_precheck:true,go_list_source_postcheck:true,windows_source_postcheck:true,
  bootstrap_seed_source_postcheck:true,frozen_source_unchanged:true,owner_removed:true,dependencies_installed:false,
  remote_contacted:false,actual_mysql:false,production_approved:false,packages:remainingPackages.map(p=>p.replace(/^clawreef\//,'')),
  steps:Array.from({length:8},()=>({exit_code:0})),linux_binaries:['server','system-backup-bootstrap'].map(program=>
    ({program,format:'ELF',removed:true,executed:false,sha256:'a'.repeat(64),size:1000000}))});
test('complete phase shape remains an unprivileged prerequisite inspection',()=>{
  assert.deepEqual(requireCompleteCurrentOrdinary(fixture()),{native_start_authorized:false,source_scope_accepted:false});
});
test('partial native runs cannot satisfy final postchecks, packages, stages or cleanup',()=>{
  for(const key of ['source_precheck','go_list_source_postcheck','windows_source_postcheck','bootstrap_seed_source_postcheck','frozen_source_unchanged','owner_removed']){
    const value=fixture();value[key]=false;assert.throws(()=>requireCompleteCurrentOrdinary(value));
  }
  const failed=fixture();failed.status='failed';
  const partial=fixture();partial.packages.pop();
  const missing=fixture();missing.steps.pop();
  const badExit=fixture();badExit.steps[7].exit_code=1;
  const retained=fixture();retained.linux_binaries[1].removed=false;
  const verifiedOnly=fixture();verifiedOnly.status='verified_inputs_only';
  for(const value of [failed,partial,missing,badExit,retained,verifiedOnly])assert.throws(()=>requireCompleteCurrentOrdinary(value));
});
