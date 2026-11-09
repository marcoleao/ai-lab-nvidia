[CmdletBinding()]
param(
    [ValidateSet('Native','Static','Windows')][string]$Mode='Native',
    [string]$WslDistribution=''
)
$ErrorActionPreference='Stop'
$repository=$PSScriptRoot
if($WslDistribution){
    if($Mode -ne 'Native' -or $WslDistribution -notmatch '^[A-Za-z0-9._-]{1,64}$'){throw 'PLATFORM_VALIDATION_ARGUMENTS_INVALID'}
    $running=((& wsl.exe --list --running --quiet) -join "`n") -replace "`0",''
    if($LASTEXITCODE -ne 0 -or $WslDistribution -cnotin @($running -split "`r?`n"|ForEach-Object {$_.Trim()})){throw 'PLATFORM_VALIDATION_RUNNING_WSL_REQUIRED'}
    $guestPath=& wsl.exe --distribution $WslDistribution --exec wslpath -a -u $repository
    if($LASTEXITCODE -ne 0){throw 'PLATFORM_VALIDATION_WSL_PATH_UNAVAILABLE'}
    & wsl.exe --distribution $WslDistribution --exec /bin/sh ($guestPath.TrimEnd('/')+'/operations/validate.sh') --mode unit
    exit $LASTEXITCODE
}
$python=Get-Command python3,python -ErrorAction SilentlyContinue|Where-Object {$_.Source -notlike '*\WindowsApps\*'}|Select-Object -First 1
$cached=Join-Path $repository '.cache/toolchains/python-3.14.0/python.exe'
if(Test-Path -LiteralPath $cached -PathType Leaf){$executable=$cached}elseif($python){$executable=$python.Source}else{throw 'PLATFORM_VALIDATION_PYTHON_REQUIRED'}
$selected=@{Native='unit';Static='static';Windows='windows'}[$Mode]
& $executable (Join-Path $repository 'operations/scripts/validation.py') --mode $selected
exit $LASTEXITCODE
