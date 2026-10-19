[CmdletBinding()]
param(
    [ValidateSet('package','install','test')]
    [string]$Command = 'package',
    [switch]$HostSmoke
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../scripts/windows/Require-Administrator.ps1"
Assert-BootstrapAdministrator
if ($HostSmoke -and $Command -ne 'test') { throw 'HostSmoke applies only to test.' }
switch ($Command) {
    'package' { & "$PSScriptRoot/scripts/windows/Package-Vscode.ps1" }
    'install' { & "$PSScriptRoot/scripts/windows/Package-Vscode.ps1" -Install }
    'test' { & "$PSScriptRoot/scripts/windows/Test-Vscode.ps1" -HostSmoke:$HostSmoke }
}
