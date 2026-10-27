$ErrorActionPreference='Stop'
$ldapFinalRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $ldapFinalRoot
$ldapFinalOwner=Join-Path $ldapFinalRoot ('.tmp-a-evidence-'+[guid]::NewGuid().ToString('N'))
$ldapFinalStamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$ldapFinalLog=Join-Path $PSScriptRoot ('a-ldap-request-native-fs-local-'+$ldapFinalStamp+'.txt')
$ldapFinalSource=Join-Path $PSScriptRoot ('a-ldap-request-native-fs-source-'+$ldapFinalStamp+'.json')
Start-Transcript -LiteralPath $ldapFinalLog | Out-Null
$ldapFinalExit=0
try {
    & (Join-Path $PSScriptRoot 'a-ldap-prepare-native-fs-20261016.ps1') -Owner $ldapFinalOwner
    Copy-Item -LiteralPath (Join-Path $ldapFinalOwner 'source-manifest.json') -Destination (Join-Path $PSScriptRoot 'a-ldap-native-preparation-source-20261016.json')
    & (Join-Path $PSScriptRoot 'a-ldap-native-fs-validation-20261016.ps1') -PreparedOwner $ldapFinalOwner -SourceManifestPath $ldapFinalSource
} catch {
    $ldapFinalExit=1
    Write-Output ('LDAP_NATIVE_ERROR='+$_.Exception.Message)
} finally {
    if(Test-Path -LiteralPath $ldapFinalOwner){
        $ldapFinalResolved=(Resolve-Path -LiteralPath $ldapFinalOwner).Path
        if([IO.Path]::GetDirectoryName($ldapFinalResolved) -ne $ldapFinalRoot -or [IO.Path]::GetFileName($ldapFinalResolved) -notmatch '^\.tmp-a-evidence-[a-f0-9]{32}$' -or ((Get-Item -LiteralPath $ldapFinalResolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.File]::ReadAllText((Join-Path $ldapFinalResolved 'owner.txt')) -ne [IO.Path]::GetFileName($ldapFinalResolved)){throw 'Refusing cleanup outside exact owned directory'}
        Remove-Item -LiteralPath $ldapFinalResolved -Recurse -Force
        Write-Output ('LOCAL_CLEANUP ldap-preparation-owned='+$ldapFinalResolved+' removed=True')
    }
    Write-Output ('a_ldap_request_exit='+$ldapFinalExit)
    Write-Output ('ldap_request_log='+$ldapFinalLog)
    Write-Output ('ldap_request_source='+$ldapFinalSource)
    Stop-Transcript | Out-Null
}
exit $ldapFinalExit
