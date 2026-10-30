param(
    [ValidateSet('toolchain','prepare','sync','status','fast','backend','browser','full','catalog','cleanup')]
    [string]$Command = 'status',
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)
$ErrorActionPreference = 'Stop'
$regressionScript = Join-Path $PSScriptRoot 'scripts/regression.py'
$linuxScript = & wsl.exe -d agentic-sdlc -u root -- wslpath -a $regressionScript
if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve the regression script in WSL.' }
& wsl.exe -d agentic-sdlc -u root -- python3 $linuxScript.Trim() $Command @Arguments
exit $LASTEXITCODE
