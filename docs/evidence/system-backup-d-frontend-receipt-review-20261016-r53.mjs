import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const sha=b=>createHash('sha256').update(b).digest('hex');
const buildPath='docs/evidence/system-backup-d-frontend-build-20261016-r51.json';
const build=JSON.parse(read(buildPath)),source=JSON.parse(read(build.source_manifest.replaceAll('\\','/')));
assert.equal(build.status,'full_typescript_and_vite_build_passed');
assert.equal(build.dependencies_installed_by_this_run,false);
assert.equal(build.typescript_build_passed,true);assert.equal(build.vite_build_passed,true);
assert.equal(build.source_postcheck_passed,true);assert.equal(build.build_artifacts_cleaned,true);
assert.equal(sha(read(build.raw_log.replaceAll('\\','/'))),build.raw_log_sha256);
const digest=sha(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
assert.equal(digest,source.source_sha256);assert.equal(digest,build.source_sha256);
assert.equal(existsSync(build.owner_directory),false);
const receiptPath='docs/evidence/system-backup-d-frontend-acceptance-20261016.json';
const browserPath='docs/evidence/system-backup-d-frontend-browser-acceptance-20261016.json';
const receipt=JSON.parse(read(receiptPath)),browser=JSON.parse(read(browserPath));
assert.match(browser.scope,/isolated/i);assert.equal(browser.cases.length,53);
assert.equal(new Set(browser.cases.map(c=>c.case)).size,53);assert.ok(browser.cases.every(c=>c.pass===true));
for(const locale of ['en','zh','ja','ko','de'])assert.ok(browser.cases.some(c=>c.case==='locale-'+locale));
const mobile=browser.cases.find(c=>c.case==='mobile-375-zh-overview');
assert.equal(mobile.layout.scrollWidth,mobile.layout.width);
for(const f of receipt.fix.files){assert.equal(sha(read(f.path)),f.sha256,f.path);assert.equal(source.files.find(p=>p.path===f.path).sha256,f.sha256)}
assert.equal(receipt.cleanup.pending,false);
for(const p of receipt.cleanup.paths)assert.equal(existsSync(new URL(p.path,root)),false,p.path);
const drift=source.files.flatMap(p=>!existsSync(new URL(p.path,root))?[{path:p.path,state:'missing'}]:sha(read(p.path))===p.sha256?[]:[{path:p.path,state:'changed'}]);
// This unused QA HTML was deliberately removed by the received component
// harness after our production build. App sources/configuration remain exact.
assert.ok(drift.every(p=>p.path==='frontend/qa-backups-acceptance.html'&&p.state==='missing'));
const images=receipt.browser.screenshots.map(name=>{
  const path='docs/evidence/'+name,bytes=read(path);
  let format,width,height;
  if(bytes.subarray(1,4).toString()==='PNG'){
    format='PNG';width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  }else{
    assert.equal(bytes.readUInt16BE(0),0xffd8,'Unrecognized screenshot format');format='JPEG';
    for(let i=2;i<bytes.length;){
      assert.equal(bytes[i++],0xff);while(bytes[i]===0xff)i++;
      const marker=bytes[i++];if(marker===0xd9||marker===0xda)break;
      if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
      const length=bytes.readUInt16BE(i);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        height=bytes.readUInt16BE(i+3);width=bytes.readUInt16BE(i+5);break;
      }
      assert.ok(length>=2);i+=length;
    }
  }
  assert.ok(width>0&&height>0);
  return{path,sha256:sha(bytes),format,width,height};
});
const report={kind:'d_frontend_build_and_received_component_review.v1',recorded_at:new Date().toISOString(),
  status:'own_full_build_accepted_received_browser_record_scope_limited',
  own_build:buildPath,own_build_sha256:sha(read(buildPath)),own_build_source_files:source.files.length,own_build_source_sha256:digest,
  own_dependency_installation:false,own_typescript_build:true,own_vite_production_build:true,own_build_artifacts_checked_absent:true,
  current_production_source_drift:[],unused_QA_html_cleanup_delta:drift,
  received_component_receipt:receiptPath,received_component_receipt_sha256:sha(read(receiptPath)),
  received_browser_record:browserPath,received_browser_record_sha256:sha(read(browserPath)),
  browser_cases_reported:53,browser_cases_with_saved_DOM:browser.cases.filter(c=>typeof c.snapshot==='string').length,
  browser_cases_rerun_by_this_reviewer:0,received_locales:['en','zh','ja','ko','de'],
  received_requested_viewports:receipt.browser.viewports,mobile_recorded_content_layout:mobile.layout,
  screenshots_visually_inspected:images,received_cleanup_paths_independently_absent:receipt.cleanup.paths.map(p=>p.path),
  received_install_step_not_performed_or_adopted_by_this_review:true,
  full_53_interactions_independently_reproved:false,real_backend_e2e_proved:false,production_authorization_proved:false,
  full_four_matrix_large_data_e2e_proved:false,overall_goal_complete:false};
writeFileSync(new URL('./system-backup-d-frontend-receipt-review-20261016-r53.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({own_build:'PASS',source_files:source.files.length,production_drift:0,received_browser_cases:53,saved_DOM:report.browser_cases_with_saved_DOM,images:images.length,cleanup:true,real_e2e:false}));
