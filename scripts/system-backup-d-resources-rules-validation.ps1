[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$rulesRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rulesToken = [guid]::NewGuid().ToString('N')
$rulesOwner = Join-Path $rulesRoot ('.tmp-d-resources-rules-' + $rulesToken)
$rulesSource = Join-Path $rulesOwner 'source'
$rulesPrefix = Join-Path $rulesRoot ('docs/evidence/d-resources-rules-local-' + $rulesToken)
$rulesLog = $rulesPrefix + '.jsonl'
$rulesResult = $rulesPrefix + '.json'
$rulesSnapshot = $rulesPrefix + '-source.json'
$rulesOwned = $false
$rulesExit = $null
$rulesFailure = $null
$rulesFrozenStable = $false
$rulesCurrentStable = $false
$rulesCleanup = $false
$rulesFileCount = 0
$rulesInputs = @()
$rulesVariables = @('GO111MODULE','GOWORK','GOFLAGS','GOOS','GOARCH','CGO_ENABLED','GOTOOLCHAIN','GOPROXY','GOSUMDB','TEST_TELEMETRY_DIR','GOCACHE','GOTMPDIR','GOPATH','GOMAXPROCS','TEMP','TMP')
$rulesSaved = @{}
foreach ($rulesVariable in $rulesVariables) { $rulesSaved[$rulesVariable] = [Environment]::GetEnvironmentVariable($rulesVariable, 'Process') }
function Get-RulesInput([string]$Relative, [string]$Base) {
    $rulesBytes = [IO.File]::ReadAllBytes((Join-Path $Base $Relative))
    $rulesHasher = [Security.Cryptography.SHA256]::Create()
    try { $rulesHash = ([BitConverter]::ToString($rulesHasher.ComputeHash($rulesBytes))).Replace('-','').ToLowerInvariant() } finally { $rulesHasher.Dispose() }
    return [ordered]@{ path=$Relative; size=$rulesBytes.Length; sha256=$rulesHash; bytes_base64=[Convert]::ToBase64String($rulesBytes) }
}
function Get-RulesPaths([string]$Base) {
    $rulesPackage = Join-Path $Base 'backend/internal/systembackupresources'
    $rulesPaths = @(Get-ChildItem -LiteralPath $rulesPackage -File -Recurse | ForEach-Object { $_.FullName.Substring($Base.Length+1).Replace('\','/') })
    return @($rulesPaths + @('contracts/system-backup/v12/schema-registry.json','contracts/system-backup/v12/verifier-contract.schema.json','scripts/system-backup-d-resources-rules-validation.ps1') | Sort-Object)
}
try {
    if (Test-Path -LiteralPath $rulesOwner) { throw 'Owner already exists' }
    New-Item -ItemType Directory -Path $rulesOwner | Out-Null
    [IO.File]::WriteAllText((Join-Path $rulesOwner '.owner'), $rulesToken)
    $rulesOwned = $true
    $rulesPaths = @(Get-RulesPaths $rulesRoot)
    foreach ($rulesPath in $rulesPaths) {
        $rulesInput = Get-RulesInput $rulesPath $rulesRoot
        $rulesTarget = Join-Path $rulesSource $rulesPath
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($rulesTarget)) | Out-Null
        [IO.File]::WriteAllBytes($rulesTarget, [Convert]::FromBase64String($rulesInput.bytes_base64))
        if ((Get-RulesInput $rulesPath $rulesSource).sha256 -ne $rulesInput.sha256 -or (Get-RulesInput $rulesPath $rulesRoot).sha256 -ne $rulesInput.sha256) { throw 'Source changed while freezing' }
        $rulesInputs += $rulesInput
    }
    [IO.File]::WriteAllText($rulesSnapshot, ([ordered]@{ kind='d_resources_rules_source.v1'; inputs=$rulesInputs } | ConvertTo-Json -Depth 8))
    foreach ($rulesDirectory in @('cache','tmp','gopath','telemetry')) { [IO.Directory]::CreateDirectory((Join-Path $rulesOwner $rulesDirectory)) | Out-Null }
    $env:GO111MODULE='off'; $env:GOWORK='off'; $env:GOFLAGS=''; $env:GOOS='windows'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'
    $env:GOTOOLCHAIN='local'; $env:GOPROXY='off'; $env:GOSUMDB='off'
    $env:GOCACHE=Join-Path $rulesOwner 'cache'; $env:GOTMPDIR=Join-Path $rulesOwner 'tmp'; $env:GOPATH=Join-Path $rulesOwner 'gopath'
    $env:TEMP=$env:GOTMPDIR; $env:TMP=$env:GOTMPDIR; $env:GOMAXPROCS='2'
    $env:TEST_TELEMETRY_DIR=Join-Path $rulesOwner 'telemetry'
    [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'), ('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')), [Text.Encoding]::ASCII)
    $rulesTelemetry=(& go env -json GOTELEMETRY GOTELEMETRYDIR | Out-String | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0 -or $rulesTelemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($rulesTelemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR) { throw 'Go telemetry is not isolated' }
    Write-Output ('RESOURCES_RULES_OWNER=' + $rulesOwner)
    Push-Location (Join-Path $rulesSource 'backend/internal/systembackupresources')
    try { & go test -json -count=1 -timeout=180s -p 2 . 2>&1 | Tee-Object -FilePath $rulesLog; $rulesExit=$LASTEXITCODE } finally { Pop-Location }
    if ($rulesExit -ne 0) { throw ('Resources package failed exit=' + $rulesExit) }
    if ((@(Get-RulesPaths $rulesSource) -join "`n") -cne ($rulesPaths -join "`n")) { throw 'Frozen input set changed' }
    foreach ($rulesInput in $rulesInputs) {
        if ((Get-RulesInput $rulesInput.path $rulesSource).sha256 -ne $rulesInput.sha256) { throw 'Frozen input changed during test' }
    }
    $rulesFrozenStable=$true
    if ((@(Get-RulesPaths $rulesRoot) -join "`n") -cne ($rulesPaths -join "`n")) { throw 'Current input set changed' }
    foreach ($rulesInput in $rulesInputs) {
        if ((Get-RulesInput $rulesInput.path $rulesRoot).sha256 -ne $rulesInput.sha256) { throw 'Current input changed during test' }
    }
    $rulesCurrentStable=$true
} catch {
    $rulesFailure=$_.Exception.Message
} finally {
    foreach ($rulesVariable in $rulesVariables) { [Environment]::SetEnvironmentVariable($rulesVariable, $rulesSaved[$rulesVariable], 'Process') }
    if ($rulesOwned -and (Test-Path -LiteralPath $rulesOwner)) {
        $rulesResolved=(Resolve-Path -LiteralPath $rulesOwner).Path
        if ([IO.Path]::GetDirectoryName($rulesResolved) -cne $rulesRoot -or [IO.Path]::GetFileName($rulesResolved) -cne ('.tmp-d-resources-rules-'+$rulesToken) -or [IO.File]::ReadAllText((Join-Path $rulesResolved '.owner')) -cne $rulesToken -or (Get-Item -LiteralPath $rulesResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Owner cleanup identity mismatch' }
        $rulesFileCount=@(Get-ChildItem -LiteralPath $rulesResolved -Recurse -File -Force).Count
        Remove-Item -LiteralPath $rulesResolved -Recurse -Force
        $rulesCleanup=-not (Test-Path -LiteralPath $rulesResolved)
    }
    $rulesReceipt=[ordered]@{
        kind='d_resources_rules_validation.v1'; exit_code=$rulesExit; error=$rulesFailure
        frozen_inputs_stable=$rulesFrozenStable; current_inputs_stable=$rulesCurrentStable
        snapshot=$rulesSnapshot; log=$rulesLog; owner=$rulesOwner; owner_removed=$rulesCleanup; removed_files=$rulesFileCount
        scope='complete_systembackupresources_package_offline'; default_vet=$true; dependencies_installed=$false
        actual_mysql=$false; cross_review_approval=$false; production_wired=$false
    }
    [IO.File]::WriteAllText($rulesResult, ($rulesReceipt | ConvertTo-Json -Depth 8))
    Write-Output ('RESOURCES_RULES_RESULT=' + $rulesResult)
}
if ($null -ne $rulesFailure) { throw $rulesFailure }
