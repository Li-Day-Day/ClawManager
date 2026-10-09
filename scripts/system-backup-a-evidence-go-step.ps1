# Local Go gate. Keep vet enabled; retry only the observed Windows vet/asm/compile
# process failure, using this run's existing isolated cache. Never retry SSH,
# provider operations, ordinary vet findings, or failed test assertions.
function Invoke-AEvidenceNative {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$FilePath, [Parameter(Mandatory=$true)][string[]]$Arguments)
    # Forward native lines through the host so Start-Transcript includes SSH
    # output. Preserve native status separately; stderr alone is not failure.
    $ErrorActionPreference='Continue'
    $PSNativeCommandUseErrorActionPreference=$false
    $global:LASTEXITCODE=$null
    & $FilePath @Arguments 2>&1 | ForEach-Object { Write-Host $_.ToString() }
    if ($null -eq $global:LASTEXITCODE) { return 1 }
    return $global:LASTEXITCODE
}

function Invoke-AEvidenceGoStep {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string[]]$Arguments,
        [ValidateSet('test-vet','mysql-probe-build','migration-build','server-build')][string]$Stage='test-vet'
    )

    # Windows PowerShell 5.1 turns redirected native stderr into ErrorRecords.
    # Capture the native exit code explicitly instead of terminating on stderr.
    $ErrorActionPreference = 'Continue'
    $PSNativeCommandUseErrorActionPreference = $false
    for ($aEvidenceAttempt = 1; $aEvidenceAttempt -le 3; $aEvidenceAttempt++) {
        $aEvidenceOutput = New-Object 'System.Collections.Generic.List[string]'
        $global:LASTEXITCODE = $null
        & go @Arguments 2>&1 | ForEach-Object {
            $aEvidenceLine = $_.ToString()
            $aEvidenceOutput.Add($aEvidenceLine)
            Write-Host $aEvidenceLine
        }
        $aEvidenceStepExit = $global:LASTEXITCODE
        if ($aEvidenceStepExit -eq 0) { return }
        $aEvidenceText = $aEvidenceOutput -join "`n"
        $aEvidenceToolCrash = $aEvidenceText -match '(?im)^[^\r\n]*\b(?:vet|asm|compile)\.exe: exit status 0xc0000043\s*$'
        $aEvidenceTestFailure = $aEvidenceText -match '(?m)^\s*--- FAIL:|^panic:|^fatal error:'
        if (-not $aEvidenceToolCrash -or $aEvidenceTestFailure -or $aEvidenceAttempt -eq 3) {
            throw "Evidence $Stage gate failed (exit=$aEvidenceStepExit, attempt=$aEvidenceAttempt); remote validation has not started; dependencies will not be installed"
        }
        Write-Warning "Windows vet/asm/compile process exited 0xc0000043; retrying the SAME $Stage command ($aEvidenceAttempt/3 failed). Vet remains enabled; isolated cache is retained only until this run ends."
        Start-Sleep -Milliseconds 250
    }
}

function Invoke-AEvidenceGoTest {
    Invoke-AEvidenceGoStep -Arguments @('test','-count=1','-v','./internal/systembackupevidence') -Stage 'test-vet'
}

function Initialize-AEvidenceTelemetry {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Scratch)
    $aEvidenceTelemetryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $aEvidenceOwnedPath=[IO.Path]::GetFullPath($Scratch)
    if([IO.Path]::GetDirectoryName($aEvidenceOwnedPath) -ne $aEvidenceTelemetryRoot -or [IO.Path]::GetFileName($aEvidenceOwnedPath) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or -not (Test-Path -LiteralPath $aEvidenceOwnedPath -PathType Container)) { throw 'Telemetry requires a run-owned evidence scratch directory' }
    if((Get-Item -Force -LiteralPath $aEvidenceOwnedPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing telemetry through a reparse point'}
    $aEvidenceTelemetryDir=Join-Path $aEvidenceOwnedPath 'telemetry'
    [IO.Directory]::CreateDirectory($aEvidenceTelemetryDir) | Out-Null
    if((Get-Item -Force -LiteralPath $aEvidenceTelemetryDir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing telemetry through a reparse point'}
    # GOTELEMETRY is read-only, not an environment override. The installed Go
    # toolchain supports this isolated-test directory; verify support before
    # building. Write off before invoking Go so its startup cannot upload.
    [IO.File]::WriteAllText((Join-Path $aEvidenceTelemetryDir 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
    $env:TEST_TELEMETRY_DIR=$aEvidenceTelemetryDir
    $global:LASTEXITCODE=$null
    $aEvidenceTelemetryJSON=@(& go env -json GOTELEMETRY GOTELEMETRYDIR)
    if($global:LASTEXITCODE -ne 0){throw 'Cannot verify isolated Go telemetry'}
    $aEvidenceTelemetryState=($aEvidenceTelemetryJSON -join "`n") | ConvertFrom-Json
    if($aEvidenceTelemetryState.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($aEvidenceTelemetryState.GOTELEMETRYDIR) -ne $aEvidenceTelemetryDir){throw 'Go toolchain did not honor isolated telemetry; refusing build'}
    Write-Output 'LOCAL_PASS isolated-go-telemetry=off'
}
