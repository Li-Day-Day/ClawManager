$ErrorActionPreference='Stop'
$aFieldTestRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$aFieldTestOwned=Join-Path $aFieldTestRoot ('.tmp-a-field-wrapper-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($aFieldTestOwned)|Out-Null
$global:aFieldTestCalls=0
$global:aFieldTestExit=0
$global:aFieldTestOutput=''
function global:ssh {
    begin {$aFieldTestPayload='';$aFieldTestArguments=$args}
    process {$aFieldTestPayload+=[string]$_+"`n"}
    end {
        $global:aFieldTestCalls++
        if(($aFieldTestArguments -join ' ') -notmatch "tr -d '\\015' \| python3 -B - --embedded-plan"){throw 'Missing bytecode/CR guard'}
        if($aFieldTestPayload -notmatch 'A_FIELD_PLAN_JSON=base64.b64decode' -or $aFieldTestPayload -notmatch 'START TRANSACTION READ ONLY'){throw 'Missing complete embedded plan/probe'}
        $global:LASTEXITCODE=$global:aFieldTestExit
        Write-Output $global:aFieldTestOutput
    }
}
try {
    Push-Location $aFieldTestRoot
    try {
        $aFieldTestFixture=(& node --input-type=module -e "import fs from 'node:fs';import {syntheticFieldFixture} from './scripts/system-backup-a-field-evidence-fixture.mjs';const f=syntheticFieldFixture(fs.readFileSync('scripts/system-backup-a-field-evidence.py'),{native:true,socketObserver:true});console.log(JSON.stringify({plan:f.plan,result:f.envelope.result}));" |Out-String)|ConvertFrom-Json
        if($LASTEXITCODE -ne 0){throw 'Unable to create in-memory fake fixture'}
    }finally{Pop-Location}
    $aFieldTestPlan=Join-Path $aFieldTestOwned 'plan.json'
    $aFieldTestPlanText=($aFieldTestFixture.plan|ConvertTo-Json -Depth 20)+"`n"
    [IO.File]::WriteAllText($aFieldTestPlan,$aFieldTestPlanText,[Text.UTF8Encoding]::new($false))
    $aFieldTestFixture.result.plan_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $aFieldTestPlan).Hash.ToLowerInvariant()
    $global:aFieldTestOutput=$aFieldTestFixture.result|ConvertTo-Json -Depth 20 -Compress
    $aFieldWrapper=Join-Path $PSScriptRoot 'system-backup-a-field-evidence.ps1'
    & $aFieldWrapper -PlanPath $aFieldTestPlan -CheckOnly
    if($global:aFieldTestCalls -ne 0){throw 'CheckOnly used transport'}
    $aFieldTestReceipt=Join-Path $aFieldTestOwned 'receipt.json'
    & $aFieldWrapper -PlanPath $aFieldTestPlan -SshTarget 'test@example.invalid' -OutputPath $aFieldTestReceipt
    $aFieldReceived=[IO.File]::ReadAllText($aFieldTestReceipt)|ConvertFrom-Json
    if($aFieldReceived.status -ne 'COLLECTED_REVIEW_REQUIRED' -or $aFieldReceived.ssh_exit -ne 0 -or $aFieldReceived.result.complete_field_acceptance -ne $false){throw 'Lost public result or false acceptance'}
    $aFieldBefore=$global:aFieldTestCalls
    try {& $aFieldWrapper -PlanPath $aFieldTestPlan -OutputPath $aFieldTestReceipt;throw 'Overwrite accepted'}catch{if($_.Exception.Message -eq 'Overwrite accepted'){throw}}
    if($global:aFieldTestCalls -ne $aFieldBefore){throw 'Overwrite reached SSH'}
    $global:aFieldTestExit=2
    $aFieldFailed=Join-Path $aFieldTestOwned 'failed.json'
    try {& $aFieldWrapper -PlanPath $aFieldTestPlan -OutputPath $aFieldFailed;throw 'Remote failure accepted'}catch{if($_.Exception.Message -eq 'Remote failure accepted'){throw}}
    $aFieldFailedResult=[IO.File]::ReadAllText($aFieldFailed)|ConvertFrom-Json
    if($aFieldFailedResult.ssh_exit -ne 2 -or $aFieldFailedResult.status -ne 'BLOCKED'){throw 'Lost original remote failure'}
    $global:aFieldTestOutput='not-json-secret-never-copy-to-receipt'
    $global:aFieldTestExit=0
    $aFieldInvalid=Join-Path $aFieldTestOwned 'invalid-result.json'
    try {& $aFieldWrapper -PlanPath $aFieldTestPlan -OutputPath $aFieldInvalid;throw 'Unexpected output accepted'}catch{if($_.Exception.Message -eq 'Unexpected output accepted'){throw}}
    if([IO.File]::ReadAllText($aFieldInvalid).Contains('not-json-secret')){throw 'Unrecognized stdout copied to public receipt'}
    $aFieldBefore=$global:aFieldTestCalls
    $aFieldIncomplete=Join-Path $aFieldTestOwned 'incomplete.json'
    [IO.File]::WriteAllText($aFieldIncomplete,$aFieldTestPlanText.Replace('"capacity_input":','"unexpected_secret":'),[Text.UTF8Encoding]::new($false))
    try {& $aFieldWrapper -PlanPath $aFieldIncomplete -CheckOnly;throw 'Invalid plan accepted'}catch{if($_.Exception.Message -eq 'Invalid plan accepted'){throw}}
    if($global:aFieldTestCalls -ne $aFieldBefore){throw 'Invalid plan used SSH'}
    Write-Output 'PASS field-wrapper: plan-only, embedded pins/CR, no overwrite, remote failure, malformed output withheld, invalid plan before SSH; fake transport only'
}finally{
    Remove-Item Function:\ssh -ErrorAction SilentlyContinue
    $aFieldTestResolved=[IO.Path]::GetFullPath($aFieldTestOwned)
    if([IO.Path]::GetDirectoryName($aFieldTestResolved) -ne $aFieldTestRoot -or [IO.Path]::GetFileName($aFieldTestResolved) -notmatch '^\.tmp-a-field-wrapper-[a-f0-9]{32}$' -or
       ((Get-Item -LiteralPath $aFieldTestResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe test cleanup identity'}
    Remove-Item -LiteralPath $aFieldTestResolved -Recurse -Force
    if(Test-Path -LiteralPath $aFieldTestResolved){throw 'Test cleanup incomplete'}
}
