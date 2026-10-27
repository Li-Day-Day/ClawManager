import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),source=path.join(root,'.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e/source');
const diagnostic=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-gc-freeze-probe-output-diagnostic-20261021-native.json'),'utf8'));
assert.equal(diagnostic.source_postcheck,true);
function edit(file,fn){const p=path.join(source,file);const before=fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');const after=fn(before);assert.notEqual(after,before);fs.chmodSync(p,0o666);fs.writeFileSync(p,after);}
function one(s,a,b){assert.equal(s.split(a).length,2,'ambiguous framework budget edit');return s.replace(a,()=>b);}
edit('scripts/system-backup-a-evidence-validation.ps1',s=>one(s,
 "                    Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-timeout=900s','-v','./internal/systembackupsecurity','./internal/systembackupevidence') -Stage 'test-vet'",
 "                    # Framework budget only: retain every test and default vet.\n                    # The freeze profile's full package exceeded 900s on this host.\n                    # Existing profiles and production deadlines stay unchanged.\n                    $downloadEvidenceTestTimeout=if($ConfigDownloadGCFreezeOnly){'2700s'}else{'900s'}\n                    Invoke-AEvidenceGoStep -Arguments @('test','-count=1',('-timeout='+$downloadEvidenceTestTimeout),'-v','./internal/systembackupsecurity','./internal/systembackupevidence') -Stage 'test-vet'"));
edit('scripts/system-backup-d-download-gc-freeze-dispatch.test.ps1',s=>{
 s=one(s,"'evidenceBashPreflight')){","'evidenceBashPreflight','downloadEvidenceTestTimeout')){");
 const anchor='$gcFreezeCommands=@(';
 const check=`if($downloadEvidenceTestTimeout -ne '2700s'){throw 'Freeze framework timeout lost'}
$gcFreezeBudget=@($gcFreezeAST.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq '$downloadEvidenceTestTimeout'},$true))
if($gcFreezeBudget.Count -ne 1){throw 'Ambiguous download framework budget'}
$ConfigDownloadGCFreezeOnly=$false
. ([scriptblock]::Create($gcFreezeBudget[0].Extent.Text))
if($downloadEvidenceTestTimeout -ne '900s'){throw 'Existing download profile framework budget changed'}
$ConfigDownloadGCFreezeOnly=$true
. ([scriptblock]::Create($gcFreezeBudget[0].Extent.Text))
$gcFreezeFullGate=@($gcFreezeAST.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.Extent.Text.Contains('Invoke-AEvidenceGoStep') -and $n.Extent.Text.Contains('$downloadEvidenceTestTimeout')},$true))
if($gcFreezeFullGate.Count -ne 1 -or -not $gcFreezeFullGate[0].Extent.Text.Contains('./internal/systembackupsecurity') -or -not $gcFreezeFullGate[0].Extent.Text.Contains('./internal/systembackupevidence') -or $gcFreezeFullGate[0].Extent.Text.Contains('-vet=off') -or $gcFreezeFullGate[0].Extent.Text.Contains("'-run'")){throw 'Freeze framework budget weakened the full default-vet gate'}
`;
 return one(s,anchor,check+anchor);
});
console.log('FREEZE_FRAMEWORK_BUDGET new-profile=2700s existing-profiles=900s all-tests=yes default-vet=yes production-deadlines=unchanged');
