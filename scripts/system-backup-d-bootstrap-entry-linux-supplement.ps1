[CmdletBinding()]
param([switch]$VerifyInputsOnly,[ValidatePattern('^[a-f0-9]{32}$')][string]$PriorParityID)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$linuxRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$linuxID=[guid]::NewGuid().ToString('N')
$linuxOwner=Join-Path $linuxRoot ('.tmp-d-bootstrap-linux-'+$linuxID)
$linuxSource=Join-Path $linuxOwner 'source'
$linuxPrefix=Join-Path $linuxRoot ('docs/evidence/d-bootstrap-entry-linux-'+$linuxID)
$linuxParent='docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.json'
$linuxRecovery='docs/evidence/d2-entry-parent-recovery-20261027.json'
$linuxDriverSHA=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$linuxVariables=@('GOOS','GOARCH','CGO_ENABLED','GOFLAGS','GO111MODULE','GOWORK','GOPROXY','GOSUMDB','GOTOOLCHAIN','GOCACHE','GOTMPDIR','GOMAXPROCS','TEST_TELEMETRY_DIR','TMP','TEMP')
$linuxSaved=@{};foreach($name in $linuxVariables){$linuxSaved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$linuxReport=[ordered]@{kind='d_bootstrap_entry_linux_supplement.v1';id=$linuxID;status='failed';parent_receipt=$linuxParent;parent_status='failed';parent_postcheck_retroactively_claimed=$false;combined_acceptance=$false;driver_sha256=$linuxDriverSHA;dependencies_installed=$false;tests_rerun=$false;actual_mysql_executed=$false;production_approved=$false;go_started=$false;precheck=$false;postcheck=$false;cleaned=$false;linux_steps=@()}
function Assert-LinuxPlainPath([string]$file) {
    $absolute=[IO.Path]::GetFullPath($file)
    if(-not $absolute.StartsWith($linuxRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
    $cursor=$absolute
    while($cursor -cne $linuxRoot){
        if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected input rejected'}
        $cursor=[IO.Path]::GetDirectoryName($cursor)
    }
}
function Assert-LinuxPin([string]$file,$pin) {
    Assert-LinuxPlainPath $file
    $item=[IO.FileInfo]::new($file)
    if(-not $item.Exists -or $item.Length -ne $pin.size -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha256){throw ('Frozen bytes differ: '+$pin.path)}
}
function Assert-LinuxSnapshot {
    $actual=@(Get-ChildItem -LiteralPath $linuxSource -File -Recurse -Force|ForEach-Object {[IO.Path]::GetRelativePath($linuxSource,$_.FullName).Replace('\','/')}|Sort-Object -CaseSensitive)
    $expected=@($linuxPins.path|Sort-Object -CaseSensitive)
    if(($actual|ConvertTo-Json -Compress) -cne ($expected|ConvertTo-Json -Compress)){throw 'Frozen input set differs'}
    foreach($pin in $linuxPins){Assert-LinuxPin (Join-Path $linuxSource $pin.path) $pin}
}
try {
    Assert-LinuxPlainPath (Join-Path $linuxRoot $linuxParent)
    Assert-LinuxPlainPath (Join-Path $linuxRoot $linuxRecovery)
    $parent=Get-Content -Raw -LiteralPath (Join-Path $linuxRoot $linuxParent)|ConvertFrom-Json
    $recovery=Get-Content -Raw -LiteralPath (Join-Path $linuxRoot $linuxRecovery)|ConvertFrom-Json
    $parentSHA=(Get-FileHash -LiteralPath (Join-Path $linuxRoot $linuxParent) -Algorithm SHA256).Hash.ToLowerInvariant()
    if($parentSHA -cne 'fb27a21187e66442dc80191279fc225d5c857d8fd7c78891905b20e958ed0c1f' -or $parentSHA -cne $recovery.parent_receipt_sha256 -or $parent.status -cne 'failed' -or $parent.cleaned -ne $true){throw 'Wrong original failed parent'}
    if($parent.targeted_exit -ne 0 -or $parent.full_exit -ne 0 -or $parent.seeds_exit -ne 0 -or @($parent.linux_steps).Count -ne 0){throw 'Unexpected parent stage inventory'}
    if(Test-Path -LiteralPath (Join-Path $linuxRoot '.tmp-d-bootstrap-entry-ae7af3833e1f424f946638b88c7f68d8')){throw 'Parent products remain'}
    $linuxReport.parent_receipt_sha256=$parentSHA
    $linuxReport.recovery_receipt_sha256=(Get-FileHash -LiteralPath (Join-Path $linuxRoot $linuxRecovery) -Algorithm SHA256).Hash.ToLowerInvariant()
    $linuxPins=@($parent.files)
    if($linuxPins.Count -ne 1741 -or @($linuxPins.path|Sort-Object -Unique).Count -ne 1741){throw 'Unexpected parent input closure'}
    $restored=@{}
    foreach($item in $recovery.recovered){if($restored.ContainsKey($item.path)){throw 'Duplicate recovered input'};$restored[$item.path]=$item.artifact}
    if($restored.Count -ne 4){throw 'Unexpected recovery inventory'}
    [IO.Directory]::CreateDirectory($linuxOwner)|Out-Null
    [IO.File]::WriteAllText((Join-Path $linuxOwner 'owner.txt'),[IO.Path]::GetFileName($linuxOwner))
    [IO.Directory]::CreateDirectory($linuxSource)|Out-Null
    foreach($pin in $linuxPins){
        if($pin.path -cnotmatch '^(backend|contracts|scripts|docs)/' -or $pin.path.Contains('\') -or @($pin.path.Split('/')|Where-Object {$_ -in @('','.','..')}).Count -or $pin.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Unsafe frozen path or digest'}
        $from=Join-Path $linuxRoot $pin.path
        if($restored.ContainsKey($pin.path)){$from=Join-Path $linuxRoot $restored[$pin.path]}
        Assert-LinuxPin $from $pin
        $to=Join-Path $linuxSource $pin.path
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))|Out-Null
        [IO.File]::Copy($from,$to,$false)
    }
    Assert-LinuxSnapshot
    $linuxReport.files=$linuxPins;$linuxReport.input_count=$linuxPins.Count;$linuxReport.recovered_input_count=$restored.Count;$linuxReport.precheck=$true
    Write-Output ('LINUX_INPUTS_VERIFIED='+$linuxPins.Count+' owner='+$linuxID)
    if(-not $VerifyInputsOnly){
        if($PriorParityID){
            $priorFile=Join-Path $linuxRoot ('docs/evidence/a2-reference-capability-native-'+$PriorParityID+'.json')
            $until=[DateTime]::UtcNow.AddHours(3)
            Write-Output ('LINUX_WAIT_PARITY='+$PriorParityID)
            while(-not(Test-Path -LiteralPath $priorFile)){
                if([DateTime]::UtcNow -ge $until){throw 'Prior parity terminal wait expired'}
                Start-Sleep -Milliseconds 500
            }
            Assert-LinuxPlainPath $priorFile
            $prior=Get-Content -Raw -LiteralPath $priorFile|ConvertFrom-Json
            if($prior.id -cne $PriorParityID -or $prior.cleanup -ne $true -or (Test-Path -LiteralPath (Join-Path $linuxRoot ('.tmp-a-reference-parity-'+$PriorParityID)))){throw 'Prior parity owner not terminal and cleaned'}
            $linuxReport.prior_parity=[ordered]@{id=$PriorParityID;receipt_sha256=(Get-FileHash -LiteralPath $priorFile -Algorithm SHA256).Hash.ToLowerInvariant();status=$prior.status}
            $stableSince=$null
            while($true){
                if([DateTime]::UtcNow -ge $until){throw 'Stable Go window wait expired'}
                if(@(Get-Process -Name go -ErrorAction SilentlyContinue).Count){$stableSince=$null}
                elseif($null -eq $stableSince){$stableSince=[DateTime]::UtcNow}
                elseif(([DateTime]::UtcNow-$stableSince).TotalSeconds -ge 10){break}
                Start-Sleep -Milliseconds 500
            }
            Assert-LinuxSnapshot
        }
        if(@(Get-Process -Name go -ErrorAction SilentlyContinue).Count){throw 'Go window occupied; no build started'}
        $linuxReport.free_bytes_before=(Get-PSDrive -Name C).Free
        if($linuxReport.free_bytes_before -lt 10GB){throw 'Insufficient free space for private cold Linux compilation'}
        $env:GOOS='linux';$env:GOARCH='amd64';$env:CGO_ENABLED='0';$env:GOFLAGS='-mod=readonly -p=1';$env:GO111MODULE='on';$env:GOWORK='off';$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOMAXPROCS='1'
        $env:GOCACHE=Join-Path $linuxOwner 'cache';$env:GOTMPDIR=Join-Path $linuxOwner 'tmp';$env:TEST_TELEMETRY_DIR=Join-Path $linuxOwner 'telemetry';$env:TMP=$env:GOTMPDIR;$env:TEMP=$env:GOTMPDIR
        foreach($directory in @($env:GOCACHE,$env:GOTMPDIR,$env:TEST_TELEMETRY_DIR)){[IO.Directory]::CreateDirectory($directory)|Out-Null}
        [IO.File]::WriteAllText((Join-Path $env:TEST_TELEMETRY_DIR 'mode'),('off '+[DateTime]::UtcNow.ToString('yyyy-MM-dd')),[Text.Encoding]::ASCII)
        $linuxReport.go_started=$true
        $telemetry=@(& go env -json GOTELEMETRY GOTELEMETRYDIR);if($LASTEXITCODE -ne 0){throw 'Cannot inspect private telemetry'}
        $telemetry=($telemetry -join "`n")|ConvertFrom-Json
        if($telemetry.GOTELEMETRY -ne 'off' -or [IO.Path]::GetFullPath($telemetry.GOTELEMETRYDIR) -cne $env:TEST_TELEMETRY_DIR){throw 'Private telemetry not honored'}
        $linuxReport.telemetry='off_owned_directory_verified'
        Push-Location (Join-Path $linuxSource 'backend')
        try {
            foreach($build in @(@{name='server';package='./cmd/server'},@{name='bootstrap';package='./cmd/system-backup-bootstrap'},@{name='migration-runner';package='./cmd/system-backup-migrate'},@{name='tagged-evidence-test-compile-only';package='./internal/systembackupevidence'})){
                if(@(Get-Process -Name go -ErrorAction SilentlyContinue).Count){throw 'Go window occupied before next Linux stage'}
                $output=Join-Path $linuxOwner ('linux-'+$build.name)
                $arguments=@('build','-o',$output,$build.package)
                if($build.name -ceq 'tagged-evidence-test-compile-only'){$arguments=@('test','-tags','systembackup_mysql','-c','-o',$output,$build.package)}
                Write-Output ('LINUX_STAGE='+$build.name+' owner='+$linuxID)
                & go @arguments 1>($linuxPrefix+'.'+$build.name+'.stdout.txt') 2>($linuxPrefix+'.'+$build.name+'.stderr.txt')
                $exit=$LASTEXITCODE
                $step=[ordered]@{name=$build.name;arguments=$arguments;exit_code=$exit}
                $linuxReport.linux_steps+=@($step)
                if($exit -ne 0){throw ('Linux stage failed: '+$build.name)}
                $step.binary_sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant();$step.binary_size=(Get-Item -LiteralPath $output).Length
                Remove-Item -LiteralPath $output -Force
                $step.binary_removed=-not(Test-Path -LiteralPath $output)
            }
        } finally {Pop-Location}
    }
    $linuxReport.status=if($VerifyInputsOnly){'verified_original_inputs_only'}else{'passed_exact_linux_supplement'}
} catch {$linuxReport.error=$_.Exception.Message;throw} finally {
    try {
        if($linuxReport.precheck){Assert-LinuxSnapshot;$linuxReport.postcheck=$true}
        if((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $linuxDriverSHA){throw 'Supplement driver changed'}
    } catch {$linuxReport.status='failed';$linuxReport.postcheck_error=$_.Exception.Message}
    foreach($name in $linuxVariables){[Environment]::SetEnvironmentVariable($name,$linuxSaved[$name],'Process')}
    if(Test-Path -LiteralPath $linuxOwner){
        $resolved=(Resolve-Path -LiteralPath $linuxOwner).Path
        if([IO.Path]::GetDirectoryName($resolved) -cne $linuxRoot -or [IO.Path]::GetFileName($resolved) -cne ('.tmp-d-bootstrap-linux-'+$linuxID) -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $resolved 'owner.txt')) -cne [IO.Path]::GetFileName($resolved)){throw 'Unsafe supplement cleanup'}
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    $linuxReport.cleaned=-not(Test-Path -LiteralPath $linuxOwner)
    $linuxReport|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($linuxPrefix+'.json') -Encoding UTF8
    Write-Output ('LINUX_RECEIPT='+$linuxPrefix+'.json cleaned='+$linuxReport.cleaned)
}
if($linuxReport.status -ceq 'failed' -or -not $linuxReport.postcheck -or -not $linuxReport.cleaned){throw 'Linux supplement not complete'}
