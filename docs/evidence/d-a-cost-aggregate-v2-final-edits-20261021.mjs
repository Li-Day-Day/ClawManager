import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096/source/';
const dir='backend/internal/systembackupbusinessa/';
const edit=(p,fn)=>{fs.chmodSync(root+p,0o666);fs.writeFileSync(root+p,fn(fs.readFileSync(root+p,'utf8').replaceAll('\r\n','\n')));};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,a);return s.replace(a,b);};
edit(dir+'cost_aggregate_test.go',s=>s.replace('case "amount":input.Gateway.CostSources[0].EstimatedCost="1.00000001"','case "amount":input.Gateway.CostSources[0].EstimatedCost="2.00000001"'));
edit(dir+'verifier.go',s=>{
 s=once(s,'\tchecks, err := VerifyBackupSnapshot(ctx, scope, source, dump, proof)','\tsource.Snapshot = cloneSourceSnapshot(source.Snapshot)\n\tdump.Snapshot = cloneSourceSnapshot(dump.Snapshot)\n\tchecks, err := VerifyBackupSnapshot(ctx, scope, source, dump, proof)');
 s=once(s,'\tfor _, evidence := range []CaptureEvidence{source, dump} {','\tsource.Snapshot = cloneSourceSnapshot(source.Snapshot)\n\tdump.Snapshot = cloneSourceSnapshot(dump.Snapshot)\n\tfor _, evidence := range []CaptureEvidence{source, dump} {');
 s=once(s,'\tif err := proof.VerifyCapture(ctx, source, dump); err != nil {','\tproofSource, proofDump := source, dump\n\tproofSource.Snapshot = cloneSourceSnapshot(source.Snapshot)\n\tproofDump.Snapshot = cloneSourceSnapshot(dump.Snapshot)\n\tif err := proof.VerifyCapture(ctx, proofSource, proofDump); err != nil {');
 return once(s,'\tchecks := CategoryChecks{Users: make([]Check, 0, 8),','\tif err := ctx.Err(); err != nil { return CategoryChecks{}, err }\n\tchecks := CategoryChecks{Users: make([]Check, 0, 8),');
});
edit(dir+'restore_rows_mysql_test.go',s=>{
 const marker='\tif _, err := database.ExecContext(ctx, "UPDATE enterprise_auth_settings SET ldap_bind_password_ciphertext=NULL WHERE id=101"); err != nil {';
 const insert=`
 // Same row counts and inert-state checks must not hide cost drift. Each
 // injection is restored before continuing in this run-owned database.
 originalCost := rows.Gateway.Costs[0]
 for _, mutation := range []struct{name, set string}{
  {"money", "estimated_cost=estimated_cost+0.00000001"},
  {"tokens", "total_tokens=total_tokens+1"},
  {"currency_case", "currency='usd'"},
  {"actual_NULL", "actual_cost=NULL"},
 } { t.Run("cost_aggregate_"+mutation.name,func(t *testing.T){
  if _,err:=database.ExecContext(ctx,"UPDATE cost_records SET "+mutation.set+" WHERE id=?",originalCost.ID);err!=nil{t.Fatal("inject cost drift",err)}
  got,err:=verifier.VerifyRestoreTarget(ctx,scope,binding.Dump.Snapshot,binding.Dump.EvidenceRef)
  if !errors.Is(err,ErrRestoreNormalizationMismatch)||len(got.AIGateway)!=14{t.Error("real same-count aggregate drift accepted",err)}else{
   for _,check:=range allCategoryChecks(got){
    if check.ID=="ai_gateway.restore_cost_aggregates"{if check.Status!="failed"{t.Error("aggregate mismatch missing")}}else if check.Status!="passed"{t.Error("same-count drift changed unrelated check",check.ID)}
   }
  }
  if _,err:=database.ExecContext(ctx,"UPDATE cost_records SET estimated_cost=?,total_tokens=?,currency=?,actual_cost=? WHERE id=?",originalCost.EstimatedCost,originalCost.TotalTokens,originalCost.Currency,originalCost.ActualCost,originalCost.ID);err!=nil{t.Fatal("restore cost fixture",err)}
 }) }
 if t.Failed(){t.Fatal("cost aggregate SQL drift checks failed")}
`;
 s=once(s,marker,insert+marker);
 const nullableMarker='\tt.Log("PASS A business SQL NULL preservation and exact decimal roundtrip")';
 return once(s,nullableMarker,`\treadProof.counts = cloneSourceSnapshot(binding.Dump.Snapshot)
 checks, err = verifier.VerifyRestoreTarget(ctx, scope, binding.Dump.Snapshot, binding.Dump.EvidenceRef)
 if err != nil || len(checks.AIGateway) != 14 { t.Fatal("nullable cost aggregate verification failed",err) }
`+nullableMarker);
});
console.log('Closed proof mutation boundary and prepared actual MySQL drift cases');
