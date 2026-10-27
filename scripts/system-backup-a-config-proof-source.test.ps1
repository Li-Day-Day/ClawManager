$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-a-config-proof-source.ps1')
$captureTestWorkspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$captureTestOwned=Join-Path $captureTestWorkspace ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
$captureTestRoot=Join-Path $captureTestOwned 'fixture'
$captureTestCount=0
try {
    [IO.Directory]::CreateDirectory($captureTestRoot)|Out-Null
    foreach($scenario in @('stable','one-drift','file-set-drift','persistent-drift','unrelated-error','unsafe-owner')){
        & {
            param($scenario,$captureTestRoot)
            $caseOwner=Join-Path $captureTestRoot ('.tmp-d-index-cache-'+[guid]::NewGuid().ToString('N'))
            [IO.Directory]::CreateDirectory($caseOwner)|Out-Null
            [IO.File]::WriteAllText((Join-Path $caseOwner 'owner.txt'),[IO.Path]::GetFileName($caseOwner))
            $script:caseCalls=0
            $script:caseScenario=$scenario
            function New-DIndexSourceSnapshot {
                param([string]$Root,[string]$Destination)
                $script:caseCalls++
                if(Test-Path -LiteralPath $Destination){throw 'Partial source was reused'}
                [IO.Directory]::CreateDirectory($Destination)|Out-Null
                [IO.File]::WriteAllText((Join-Path $Destination 'partial.txt'),'attempt-'+$script:caseCalls)
                if($script:caseScenario -eq 'persistent-drift' -or $script:caseScenario -eq 'unsafe-owner' -or ($script:caseCalls -eq 1 -and $script:caseScenario -eq 'one-drift')){throw 'Source changed while snapshot was copied'}
                if($script:caseCalls -eq 1 -and $script:caseScenario -eq 'file-set-drift'){throw 'Source file set changed while snapshot was copied: backend/added.go'}
                if($script:caseScenario -eq 'unrelated-error'){throw 'Snapshot input is redirected'}
                return [ordered]@{source_sha256=('a'*64);files=@([ordered]@{path='partial.txt'});stable_copy_verified=$true}
            }
            if($scenario -eq 'unsafe-owner'){[IO.File]::WriteAllText((Join-Path $caseOwner 'owner.txt'),'wrong owner')}
            $result=$null;$failure=$null
            try {$result=New-AConfigProofSourceSnapshot -Root $captureTestRoot -Owner $caseOwner}catch{$failure=$_.Exception.Message}
            switch($scenario){
                'stable' {if($failure -or $script:caseCalls -ne 1 -or $result.capture_attempts -ne 1 -or $result.capture_failures.Count -ne 0){throw 'Stable capture did not run exactly once'}}
                {$_ -in @('one-drift','file-set-drift')} {if($failure -or $script:caseCalls -ne 2 -or $result.capture_attempts -ne 2 -or $result.capture_failures.Count -ne 1){throw 'Drift recovery did not capture a new clean source exactly once'}}
                'persistent-drift' {if($result -or $failure -ne 'Source changed while snapshot was copied' -or $script:caseCalls -ne 3){throw 'Persistent source edits bypassed the capture limit'}}
                'unrelated-error' {if($result -or $failure -ne 'Snapshot input is redirected' -or $script:caseCalls -ne 1){throw 'Non-drift error was retried'}}
                'unsafe-owner' {if($result -or $failure -notlike 'Refusing partial proof source cleanup*' -or $script:caseCalls -ne 1 -or -not(Test-Path -LiteralPath (Join-Path $caseOwner 'source/partial.txt'))){throw 'Unsafe partial source was removed or capture continued'}}
            }
            Write-Host ('PASS proof-source-'+$scenario+' capture-calls='+$script:caseCalls+' no-build-or-remote=yes')
        } $scenario $captureTestRoot
        $captureTestCount++
    }
    foreach($wrapperScenario in @('recover-once','always-changing')){
        $wrapperRoot=Join-Path $captureTestRoot $wrapperScenario
        foreach($directory in @('scripts','docs/evidence')){[IO.Directory]::CreateDirectory((Join-Path $wrapperRoot $directory))|Out-Null}
        foreach($entry in @('system-backup-a-config-proof-validation.ps1','system-backup-a-config-proof-source.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $entry) -Destination (Join-Path $wrapperRoot ('scripts/'+$entry))}
        [IO.File]::WriteAllText((Join-Path $wrapperRoot 'mode.txt'),$wrapperScenario)
        $fakeCommon=@'
function New-DIndexSourceSnapshot {
    param([string]$Root,[string]$Destination)
    $counter=Join-Path $Root 'capture-count.txt'
    $n=1
    if(Test-Path -LiteralPath $counter){$n=1+[int][IO.File]::ReadAllText($counter)}
    [IO.File]::WriteAllText($counter,[string]$n)
    if(Test-Path -LiteralPath $Destination){throw 'Wrapper reused partial capture'}
    [IO.Directory]::CreateDirectory((Join-Path $Destination 'scripts'))|Out-Null
    if($n -eq 1 -or [IO.File]::ReadAllText((Join-Path $Root 'mode.txt')) -eq 'always-changing'){throw 'Source changed while snapshot was copied'}
    Copy-Item -LiteralPath (Join-Path $Root 'dispatch-stub.ps1') -Destination (Join-Path $Destination 'scripts/system-backup-a-evidence-dispatch.test.ps1')
    Copy-Item -LiteralPath (Join-Path $Root 'evidence-stub.ps1') -Destination (Join-Path $Destination 'scripts/system-backup-a-evidence-validation.ps1')
    return [ordered]@{source_sha256=('b'*64);files=@([ordered]@{path='synthetic-wrapper-input'});stable_copy_verified=$true}
}
function Test-DIndexSourceSnapshot {
    param([string]$Root,[object]$Manifest)
    if($Manifest.capture_attempts -ne 2 -or -not $Manifest.stable_copy_verified){throw 'Wrapper lost successful capture metadata'}
    [IO.File]::WriteAllText((Join-Path ([IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($Root))) 'postcheck.txt'),'yes')
}
'@
        $dispatchStub=@'
$fixture=(Get-Item -LiteralPath $PSScriptRoot).Parent.Parent.Parent.FullName
[IO.File]::AppendAllText((Join-Path $fixture 'dispatch-calls.txt'),"one`n")
'@
        $evidenceStub=@'
param([switch]$ConfigProofOnly,[int]$BuildParallelism,[switch]$Remote,[string]$SshTarget)
if(-not $ConfigProofOnly -or -not $Remote -or $BuildParallelism -ne 2 -or $SshTarget -ne 'synthetic@invalid'){throw 'Wrapper did not forward the exact dedicated profile'}
$fixture=(Get-Item -LiteralPath $PSScriptRoot).Parent.Parent.Parent.FullName
[IO.File]::AppendAllText((Join-Path $fixture 'evidence-calls.txt'),"one`n")
'@
        [IO.File]::WriteAllText((Join-Path $wrapperRoot 'scripts/system-backup-d-index-source-snapshot.ps1'),$fakeCommon)
        [IO.File]::WriteAllText((Join-Path $wrapperRoot 'dispatch-stub.ps1'),$dispatchStub)
        [IO.File]::WriteAllText((Join-Path $wrapperRoot 'evidence-stub.ps1'),$evidenceStub)
        $wrapperManifest=Join-Path $wrapperRoot 'docs/evidence/source.json'
        $wrapperFailure=$null
        try{& (Join-Path $wrapperRoot 'scripts/system-backup-a-config-proof-validation.ps1') -Remote -BuildParallelism 2 -SshTarget 'synthetic@invalid' -SourceManifestPath $wrapperManifest}catch{$wrapperFailure=$_.Exception.Message}
        $wrapperCalls=[int][IO.File]::ReadAllText((Join-Path $wrapperRoot 'capture-count.txt'))
        if($wrapperScenario -eq 'recover-once'){
            if($wrapperFailure -or $wrapperCalls -ne 2 -or -not(Test-Path -LiteralPath $wrapperManifest) -or
                [IO.File]::ReadAllLines((Join-Path $wrapperRoot 'dispatch-calls.txt')).Count -ne 1 -or
                [IO.File]::ReadAllLines((Join-Path $wrapperRoot 'evidence-calls.txt')).Count -ne 1 -or
                -not(Test-Path -LiteralPath (Join-Path $wrapperRoot 'postcheck.txt'))){throw 'Wrapper retried downstream work or lost the successful manifest/postcheck'}
        } elseif($wrapperFailure -ne 'Source changed while snapshot was copied' -or $wrapperCalls -ne 3 -or
            (Test-Path -LiteralPath $wrapperManifest) -or (Test-Path -LiteralPath (Join-Path $wrapperRoot 'dispatch-calls.txt')) -or
            (Test-Path -LiteralPath (Join-Path $wrapperRoot 'evidence-calls.txt'))){throw 'Wrapper started downstream work or published a failed snapshot'}
        if(@(Get-ChildItem -LiteralPath $wrapperRoot -Directory -Force | Where-Object {$_.Name -like '.tmp-d-index-cache-*'}).Count){throw 'Wrapper left a source owner behind'}
        Write-Host ('PASS proof-source-wrapper-'+$wrapperScenario+' capture-calls='+$wrapperCalls+' downstream-faked=yes actual-build-or-remote=no')
        $captureTestCount++
    }
    Write-Output ('PASS proof source capture: '+$captureTestCount+' cases; source-only fakes, no Go/SSH/database')
} finally {
    if(Test-Path -LiteralPath $captureTestOwned){
        $captureTestResolved=(Resolve-Path -LiteralPath $captureTestOwned).Path
        if([IO.Path]::GetDirectoryName($captureTestResolved) -ne $captureTestWorkspace -or [IO.Path]::GetFileName($captureTestResolved) -notmatch '^\.tmp-d-index-cache-[a-f0-9]{32}$' -or ((Get-Item -Force -LiteralPath $captureTestResolved).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing capture fixture cleanup outside owned workspace'}
        Remove-Item -LiteralPath $captureTestResolved -Recurse -Force
    }
    Write-Output ('LOCAL_CLEANUP proof-source-test-owned='+$captureTestOwned+' removed='+(-not(Test-Path -LiteralPath $captureTestOwned)))
}
