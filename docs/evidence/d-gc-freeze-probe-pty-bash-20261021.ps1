$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=Join-Path $root '.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e'
if([IO.File]::ReadAllText((Join-Path $owner 'owner.txt')) -cne [IO.Path]::GetFileName($owner)){throw 'Wrong Bash check owner'}
$file=Join-Path $owner 'source/scripts/system-backup-d-download-gc-freeze-phase.sh'
$prefix=Join-Path $PSScriptRoot 'd-gc-freeze-probe-pty-bash-20261021'
if(Test-Path -LiteralPath ($prefix+'.json')){throw 'Bash evidence occupied'}
& 'C:/Program Files/Git/bin/bash.exe' -n $file 1>($prefix+'.stdout') 2>($prefix+'.stderr')
$code=$LASTEXITCODE
[ordered]@{kind='d_gc_freeze_existing_git_bash_pty_syntax_check';exit=$code;file='scripts/system-backup-d-download-gc-freeze-phase.sh';sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant();mode='existing Git Bash in working PTY; syntax only';dependencies_installed=$false;remote_executed=$false;actual_mysql=$false}|ConvertTo-Json|Set-Content -LiteralPath ($prefix+'.json') -Encoding utf8NoBOM
Write-Output ('FREEZE_PTY_BASH syntax-exit='+$code+' remote=not_run dependencies-installed=no')
exit $code
