[CmdletBinding()]
param([switch]$Serve)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$uiRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$uiToken=[guid]::NewGuid().ToString('N')
$uiOwner=Join-Path $uiRoot ('.tmp-d-backups-ui-'+$uiToken)
$uiPrefix=Join-Path $uiRoot ('docs/evidence/d-backups-ui-local-'+$uiToken)
$uiPreviousCache=$env:BACKUPS_UI_LAB_CACHE
$uiServer=$null;$uiFailure=$null;$uiSteps=@();$uiPins=@();$uiStable=$false
function Invoke-UIValidation([string[]]$NodeArguments){
    $uiLog=$uiPrefix+'-step-'+$script:uiSteps.Count+'.txt'
    [IO.File]::WriteAllText($uiLog,'')
    & node @NodeArguments 2>&1 | Tee-Object -FilePath $uiLog
    $uiExit=$LASTEXITCODE
    $script:uiSteps+=@([ordered]@{arguments=$NodeArguments;exit_code=$uiExit;log=$uiLog;log_sha256=(Get-FileHash -LiteralPath $uiLog -Algorithm SHA256).Hash.ToLowerInvariant()})
    if($uiExit -ne 0){throw ('UI validation step failed exit='+$uiExit)}
}
try {
    if(Test-Path -LiteralPath $uiOwner){throw 'UI validation owner exists'}
    [IO.Directory]::CreateDirectory($uiOwner)|Out-Null;[IO.File]::WriteAllText((Join-Path $uiOwner '.owner'),$uiToken)
    foreach($uiRequired in @('frontend/node_modules/typescript/bin/tsc','frontend/node_modules/vite/bin/vite.js')){if(-not(Test-Path -LiteralPath (Join-Path $uiRoot $uiRequired))){throw 'Existing frontend dependencies are missing; no dependencies will be installed'}}
    Push-Location $uiRoot
    try {$uiPaths=@(& rg --files frontend/src frontend/scripts contracts/system-backup/v12);if($LASTEXITCODE -ne 0){throw 'UI input enumeration failed'}} finally {Pop-Location}
    $uiPaths+=@('frontend/vite.backups-ui-lab.config.ts','frontend/backups-ui-lab.html','frontend/vite.config.ts','frontend/tsconfig.app.json','frontend/tsconfig.node.json','frontend/postcss.config.js','frontend/tailwind.config.js','frontend/package.json','frontend/package-lock.json','scripts/system-backup-d-backups-ui-validation.ps1')
    $uiPaths=@($uiPaths|ForEach-Object{$_.Replace('\','/')}|Sort-Object -Unique)
    foreach($uiPath in $uiPaths){$uiPins+=@([ordered]@{path=$uiPath;sha256=(Get-FileHash -LiteralPath (Join-Path $uiRoot $uiPath) -Algorithm SHA256).Hash.ToLowerInvariant()})}
    [IO.File]::WriteAllText(($uiPrefix+'-source.json'),($uiPins|ConvertTo-Json -Depth 5))
    Push-Location (Join-Path $uiRoot 'frontend')
    try {
        $uiTests=@(Get-ChildItem -LiteralPath 'scripts' -Filter 'system-backups*.test.mjs' -File|Where-Object{$_.Name -ne 'system-backups-verification-lab.test.mjs'}|Sort-Object Name|ForEach-Object{$_.FullName})
        # Native dispatch per file keeps every node:test assertion while
        # avoiding the test runner's blocked child-process isolation here.
        foreach($uiTest in $uiTests){Invoke-UIValidation -NodeArguments @($uiTest)}
        Invoke-UIValidation -NodeArguments @('node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--incremental','--tsBuildInfoFile',(Join-Path $uiOwner 'app.tsbuildinfo'),'--pretty','false')
        Invoke-UIValidation -NodeArguments @('node_modules/typescript/bin/tsc','--noEmit','--strict','--skipLibCheck','--target','ES2023','--lib','ES2023,DOM','--module','ESNext','--moduleResolution','bundler','--allowImportingTsExtensions','--esModuleInterop','--types','node','vite.backups-ui-lab.config.ts')
        Invoke-UIValidation -NodeArguments @('node_modules/vite/bin/vite.js','build','--configLoader','native','--outDir',(Join-Path $uiOwner 'dist'),'--emptyOutDir')
        if($Serve){
            $uiPortProbe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,19034);try{$uiPortProbe.Start()}finally{$uiPortProbe.Stop()}
            $env:BACKUPS_UI_LAB_CACHE=Join-Path $uiOwner 'vite-cache'
            $uiNode=(Get-Command node -CommandType Application|Select-Object -First 1).Source
            $uiServer=Start-Process -FilePath $uiNode -ArgumentList @('node_modules/vite/bin/vite.js','--config','vite.backups-ui-lab.config.ts','--configLoader','native') -WorkingDirectory (Join-Path $uiRoot 'frontend') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $uiOwner 'server.out') -RedirectStandardError (Join-Path $uiOwner 'server.err')
            Write-Output 'UI_BROWSER_LAB=http://127.0.0.1:19034/backups-ui-lab.html ; Ctrl+C stops only this owned server and cleans its artifacts.'
            while(-not $uiServer.HasExited){Start-Sleep -Milliseconds 500}
            if($uiServer.ExitCode -ne 0){throw 'UI lab server exited unsuccessfully'}
        }
    } finally {Pop-Location}
    foreach($uiPin in $uiPins){if((Get-FileHash -LiteralPath (Join-Path $uiRoot $uiPin.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $uiPin.sha256){throw ('UI input changed: '+$uiPin.path)}}
    $uiStable=$true
} catch {$uiFailure=$_.Exception.Message} finally {
    if($uiServer -and -not $uiServer.HasExited){Stop-Process -Id $uiServer.Id -Force;$uiServer.WaitForExit()}
    $env:BACKUPS_UI_LAB_CACHE=$uiPreviousCache
    if(Test-Path -LiteralPath $uiOwner){
        $uiResolved=(Resolve-Path -LiteralPath $uiOwner).Path
        if([IO.Path]::GetDirectoryName($uiResolved) -cne $uiRoot -or [IO.Path]::GetFileName($uiResolved) -cne ('.tmp-d-backups-ui-'+$uiToken) -or ((Get-Item -Force -LiteralPath $uiResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $uiResolved '.owner')) -cne $uiToken){throw 'Refusing UI cleanup outside exact owner'}
        Remove-Item -LiteralPath $uiResolved -Recurse -Force
    }
    $uiResult=[ordered]@{kind='d_backups_ui_local_validation.v1';error=$uiFailure;steps=$uiSteps;source=($uiPrefix+'-source.json');inputs_stable=$uiStable;owner=$uiOwner;owner_removed=(-not(Test-Path -LiteralPath $uiOwner));browser_served=[bool]$Serve;dependencies_installed=$false;business_backend=$false;production_approved=$false}
    [IO.File]::WriteAllText(($uiPrefix+'.json'),($uiResult|ConvertTo-Json -Depth 7));Write-Output ('BACKUPS_UI_RESULT='+$uiPrefix+'.json')
}
if($uiFailure){throw $uiFailure}
