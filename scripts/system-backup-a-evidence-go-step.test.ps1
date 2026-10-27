$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'system-backup-a-evidence-go-step.ps1')
$aEvidenceSavedExit=$global:LASTEXITCODE
$aEvidenceTests=0
$script:aEvidenceExpectedArguments=@('test','-count=1','-v','./internal/systembackupevidence')
try {
    # A scoped fake command: no Go compilation, filesystem output or network.
    function go {
        $script:aEvidenceCalls++
        if ($args.Count -ne $script:aEvidenceExpectedArguments.Count) { throw 'Go argument boundaries changed' }
        for($aEvidenceArg=0;$aEvidenceArg -lt $args.Count;$aEvidenceArg++){if($args[$aEvidenceArg] -cne $script:aEvidenceExpectedArguments[$aEvidenceArg]){throw 'Go gate arguments changed'}}
        $aEvidenceReply=$script:aEvidenceReplies[[Math]::Min($script:aEvidenceCalls-1,$script:aEvidenceReplies.Count-1)]
        foreach($aEvidenceLine in $aEvidenceReply.Lines){ Write-Output $aEvidenceLine }
        $global:LASTEXITCODE=$aEvidenceReply.Code
    }
    $aEvidencePass=@{Code=0;Lines=@('PASS','ok clawreef/internal/systembackupevidence 1.494s')}
    foreach($aEvidenceBuildTool in @('asm','compile')) {
    $aEvidenceAsmCrash=@{Code=1;Lines=@("internal/runtime/syscall/linux: C:\Program Files\Go\pkg\tool\windows_amd64\$aEvidenceBuildTool.exe`: exit status 0xc0000043")}
    foreach($aEvidenceStage in @('mysql-probe-build','migration-build')) {
        $aEvidenceArguments=if($aEvidenceStage -eq 'mysql-probe-build'){@('test','-c','-tags','systembackup_mysql','-o','a path with spaces/probe','./internal/systembackupevidence')}else{@('build','-o','a path with spaces/migrate','./cmd/system-backup-migrate')}
        $script:aEvidenceExpectedArguments=$aEvidenceArguments
        foreach($aEvidencePersist in @($false,$true)) {
            $script:aEvidenceCalls=0
            if($aEvidencePersist){$script:aEvidenceReplies=@($aEvidenceAsmCrash)}else{$script:aEvidenceReplies=@($aEvidenceAsmCrash,$aEvidencePass)}
            $aEvidenceFailed=$false
            try{Invoke-AEvidenceGoStep -Arguments $aEvidenceArguments -Stage $aEvidenceStage *> $null}catch{$aEvidenceFailed=$true}
            $aEvidenceExpectedCalls=if($aEvidencePersist){3}else{2}
            if($aEvidenceFailed -ne $aEvidencePersist -or $script:aEvidenceCalls -ne $aEvidenceExpectedCalls){throw 'Build retry policy failed'}
            $aEvidenceTests++
            Write-Output "PASS $aEvidenceStage $aEvidenceBuildTool-persistent=$aEvidencePersist"
        }
    }
    }
    $script:aEvidenceExpectedArguments=@('test','-count=1','-v','./internal/systembackupevidence')
    $aEvidenceCrash=@{Code=1;Lines=@('net/http/internal/httpcommon: C:\Program Files\Go\pkg\tool\windows_amd64\vet.exe: exit status 0xc0000043','PASS','ok clawreef/internal/systembackupevidence 1.494s','FAIL')}
    $aEvidenceCases=@(
        @{Name='success';Replies=@($aEvidencePass);Calls=1;Fails=$false},
        @{Name='vet-crash-then-success';Replies=@($aEvidenceCrash,$aEvidencePass);Calls=2;Fails=$false},
        @{Name='two-vet-crashes-then-success';Replies=@($aEvidenceCrash,$aEvidenceCrash,$aEvidencePass);Calls=3;Fails=$false},
        @{Name='persistent-vet-crash';Replies=@($aEvidenceCrash);Calls=3;Fails=$true},
        @{Name='ordinary-vet-finding';Replies=@(@{Code=1;Lines=@('example.go:42: fmt.Printf format %d has arg name of wrong type string','FAIL')});Calls=1;Fails=$true},
        @{Name='test-assertion-plus-vet-crash';Replies=@(@{Code=1;Lines=@($aEvidenceCrash.Lines[0],'--- FAIL: TestInvariant (0.01s)','FAIL')});Calls=1;Fails=$true},
        @{Name='panic-plus-vet-crash';Replies=@(@{Code=1;Lines=@($aEvidenceCrash.Lines[0],'panic: invariant violated')});Calls=1;Fails=$true},
        @{Name='other-process-error';Replies=@(@{Code=1;Lines=@('vet.exe: exit status 0xc0000005')});Calls=1;Fails=$true},
        @{Name='pass-text-nonzero-exit';Replies=@(@{Code=1;Lines=@('PASS','ok clawreef/internal/systembackupevidence')});Calls=1;Fails=$true}
    )
    foreach($aEvidenceCase in $aEvidenceCases) {
        $script:aEvidenceCalls=0
        $script:aEvidenceReplies=$aEvidenceCase.Replies
        $aEvidenceFailed=$false
        try { Invoke-AEvidenceGoTest *> $null } catch { $aEvidenceFailed=$true }
        if($aEvidenceFailed -ne $aEvidenceCase.Fails -or $script:aEvidenceCalls -ne $aEvidenceCase.Calls){throw ('Failed retry policy case: '+$aEvidenceCase.Name)}
        if($ErrorActionPreference -ne 'Stop'){throw 'ErrorActionPreference escaped helper scope'}
        $aEvidenceTests++
        Write-Output ('PASS '+$aEvidenceCase.Name)
    }
    # Also exercise native stderr/exit handling, especially on PowerShell 5.1.
    # A disposable go.cmd emits one crash, then success; it never invokes Go.
    Remove-Item -LiteralPath Function:\go
    $aEvidenceNativeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $aEvidenceNativeDir=Join-Path $aEvidenceNativeRoot ('.tmp-a-evidence-native-'+[guid]::NewGuid().ToString('N'))
    $aEvidenceSavedPath=$env:PATH
    try {
        [IO.Directory]::CreateDirectory($aEvidenceNativeDir) | Out-Null
        $aEvidenceNativeMock=@'
@echo off
if exist "%~dp0seen" goto passed
echo seen>"%~dp0seen"
echo net/http/internal/httpcommon: C:\Program Files\Go\pkg\tool\windows_amd64\vet.exe: exit status 0xc0000043 1>&2
exit /b 1
:passed
echo PASS
exit /b 0
'@
        [IO.File]::WriteAllText((Join-Path $aEvidenceNativeDir 'go.cmd'),$aEvidenceNativeMock.Replace("`n","`r`n"),[Text.Encoding]::ASCII)
        $env:PATH=$aEvidenceNativeDir+';'+$aEvidenceSavedPath
        $aEvidenceResolvedGo=(Get-Command go -ErrorAction Stop).Source
        if($aEvidenceResolvedGo -ne (Join-Path $aEvidenceNativeDir 'go.cmd')){throw 'Native mock did not shadow Go; refusing compilation'}
        Invoke-AEvidenceGoTest *> $null
        if(-not (Test-Path -LiteralPath (Join-Path $aEvidenceNativeDir 'seen'))){throw 'Native failure was not exercised'}
        $aEvidenceTests++
        Write-Output 'PASS native-stderr-crash-then-success'
        $aEvidenceChild=Join-Path $aEvidenceNativeDir 'native-output.ps1'
        [IO.File]::WriteAllText($aEvidenceChild, 'param([int]$Code,[string]$Value) [Console]::Out.WriteLine("NATIVE_OUT:"+$Value); [Console]::Error.WriteLine("NATIVE_ERR"); exit $Code', [Text.Encoding]::ASCII)
        $aEvidenceShell=Join-Path $PSHOME $(if($PSVersionTable.PSEdition -eq 'Core'){'pwsh.exe'}else{'powershell.exe'})
        foreach($aEvidenceCode in @(0,37)) {
            $aEvidenceTranscript=Join-Path $aEvidenceNativeDir ('capture-'+$aEvidenceCode+'.txt')
            Start-Transcript -Path $aEvidenceTranscript | Out-Null
            try { $aEvidenceCapturedExit=Invoke-AEvidenceNative -FilePath $aEvidenceShell -Arguments @('-NoProfile','-File',$aEvidenceChild,'-Code',[string]$aEvidenceCode,'-Value','two words') }
            finally { Stop-Transcript | Out-Null }
            $aEvidenceCapturedText=[IO.File]::ReadAllText($aEvidenceTranscript)
            if($aEvidenceCapturedExit -ne $aEvidenceCode -or $aEvidenceCapturedText -notmatch 'NATIVE_OUT:two words' -or $aEvidenceCapturedText -notmatch 'NATIVE_ERR'){throw 'Native transcript/status/argument preservation failed'}
            if($ErrorActionPreference -ne 'Stop'){throw 'Native helper changed caller error preference'}
            $aEvidenceTests++
            Write-Output "PASS native-transcript-exit-$aEvidenceCode"
        }
    } finally {
        $env:PATH=$aEvidenceSavedPath
        if(Test-Path -LiteralPath $aEvidenceNativeDir) {
            $aEvidenceResolvedDir=(Resolve-Path -LiteralPath $aEvidenceNativeDir).Path
            if([IO.Path]::GetDirectoryName($aEvidenceResolvedDir) -ne $aEvidenceNativeRoot -or [IO.Path]::GetFileName($aEvidenceResolvedDir) -notmatch '^\.tmp-a-evidence-native-[a-f0-9]{32}$'){throw 'Refusing cleanup outside owned native test directory'}
            Remove-Item -LiteralPath $aEvidenceResolvedDir -Recurse -Force
            if(Test-Path -LiteralPath $aEvidenceResolvedDir){throw 'Native test cleanup failed'}
        }
    }
    # Exercise the real toolchain without compiling or downloading anything.
    # Its telemetry mode and all files must stay in this test's owned scratch.
    $aEvidenceTelemetryScratch=Join-Path $aEvidenceNativeRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
    $aEvidenceTelemetryPrevious=@{}
    foreach($aEvidenceEnvName in @('TEST_TELEMETRY_DIR','GOPROXY','GOSUMDB','GOTOOLCHAIN')){$aEvidenceTelemetryPrevious[$aEvidenceEnvName]=[Environment]::GetEnvironmentVariable($aEvidenceEnvName,'Process')}
    try {
        [IO.Directory]::CreateDirectory($aEvidenceTelemetryScratch) | Out-Null
        $env:GOPROXY='off'; $env:GOSUMDB='off'; $env:GOTOOLCHAIN='local'
        Initialize-AEvidenceTelemetry -Scratch $aEvidenceTelemetryScratch
        $aEvidenceTelemetryFiles=@(Get-ChildItem -Force -Recurse -File -LiteralPath $aEvidenceTelemetryScratch)
        if($aEvidenceTelemetryFiles.Count -ne 1 -or $aEvidenceTelemetryFiles[0].Name -ne 'mode'){throw 'Unexpected telemetry artifacts'}
        $aEvidenceTests++
        Write-Output 'PASS native-go-telemetry-isolated-off'
    } finally {
        foreach($aEvidenceEnvName in $aEvidenceTelemetryPrevious.Keys){[Environment]::SetEnvironmentVariable($aEvidenceEnvName,$aEvidenceTelemetryPrevious[$aEvidenceEnvName],'Process')}
        if(Test-Path -LiteralPath $aEvidenceTelemetryScratch){
            $aEvidenceTelemetryResolved=(Resolve-Path -LiteralPath $aEvidenceTelemetryScratch).Path
            if([IO.Path]::GetDirectoryName($aEvidenceTelemetryResolved) -ne $aEvidenceNativeRoot -or [IO.Path]::GetFileName($aEvidenceTelemetryResolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$'){throw 'Refusing telemetry cleanup outside owned scratch'}
            Remove-Item -LiteralPath $aEvidenceTelemetryResolved -Recurse -Force
            if(Test-Path -LiteralPath $aEvidenceTelemetryResolved){throw 'Telemetry scratch cleanup failed'}
        }
    }
} finally {
    Remove-Item -LiteralPath Function:\go -ErrorAction SilentlyContinue
    $global:LASTEXITCODE=$aEvidenceSavedExit
}
Write-Output "PASS evidence Go retry gate: $aEvidenceTests cases; no build artifacts or remote actions"
