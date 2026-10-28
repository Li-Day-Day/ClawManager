import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {inspectSecurityCompileShape} from './a-security-linux-compile-review-20261027.mjs';
const owner='C:\\security-owner';
const fixture=()=>({kind:'a_security_linux_compile_supplement.v1',status:'passed_exact_current_ordinary_security_Linux_compile',error:null,
  owner,Go_started:true,source_precheck:true,source_postcheck:true,cleanup:true,compiler_cache_hints_only:true,
  tests_executed:false,dependencies_installed:false,actual_SQL:false,production_approved:false,test_results_reused:false,
  telemetry:'off_owned_directory_verified',steps:[{command:['go','test','-c','-o',path.join(owner,'security.test'),'./internal/systembackupsecurity'],goos:'linux',goarch:'amd64',tags:'',exit_code:0}],
  binary:{format:'ELF',class:64,machine:'amd64',executed:false,size:1000000,sha256:'a'.repeat(64)}});
test('ordinary Linux compile inspection requires a fresh frozen postcheck and cleanup',()=>{
  assert.equal(inspectSecurityCompileShape(fixture()).native_start_authorized,false);
  for(const field of ['source_postcheck','cleanup']){const value=fixture();value[field]=false;assert.throws(()=>inspectSecurityCompileShape(value));}
});
test('tagged, test-executing, wrong-platform or failed commands cannot substitute for the ordinary compile',()=>{
  const tagged=fixture();tagged.steps[0].command.splice(2,0,'-tags','systembackup_mysql');tagged.steps[0].tags='systembackup_mysql';
  const executed=fixture();executed.tests_executed=true;
  const wrong=fixture();wrong.steps[0].goos='windows';
  const failed=fixture();failed.steps[0].exit_code=1;
  for(const value of [tagged,executed,wrong,failed])assert.throws(()=>inspectSecurityCompileShape(value));
});
