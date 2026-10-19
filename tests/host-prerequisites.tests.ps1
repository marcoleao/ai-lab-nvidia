# Pure mocks: never contact Windows Update, elevate or install a driver.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. "$root/scripts/windows/Require-Administrator.ps1"
. "$root/lab/scripts/windows/nvidia-driver.ps1"
function Write-Lab($Level,$Message) { }
function Check($Condition,$Message) { if (-not $Condition) { throw $Message } }
function Reject([scriptblock]$Operation,[string]$Pattern) {
    try { & $Operation } catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw }
        return
    }
    throw "Expected rejection: $Pattern"
}
function Test-BootstrapAdministrator { return $false }
Reject { Assert-BootstrapAdministrator } 'administrador'
function Test-BootstrapAdministrator { return $true }
Assert-BootstrapAdministrator
$script:device = [pscustomobject]@{PNPDeviceID='PCI\VEN_10DE&DEV_26B8\123';PNPClass='Display';HardwareID=@('PCI\VEN_10DE&DEV_26B8');CompatibleID=@('PCI\VEN_10DE&CC_0300')}
$script:devices = @($script:device)
$script:drivers = @()
$script:comCalls=0
function Get-CimInstance($ClassName) {
    if ($ClassName -eq 'Win32_PnPEntity') { return $script:devices }
    if ($ClassName -eq 'Win32_PnPSignedDriver') { return $script:drivers }
    throw 'Unexpected CIM class'
}
function New-Object { param($ComObject) $script:comCalls++; throw 'COM must not be reached in this test' }
Reject { Ensure-LabNvidiaDriver } 'prepare'
Check ($script:comCalls -eq 0) 'Offline diagnostics contacted Windows Update'
$script:drivers = @([pscustomobject]@{DeviceClass='DISPLAY';DriverProviderName='NVIDIA';DeviceID=$script:device.PNPDeviceID})
Check ((Ensure-LabNvidiaDriver -Provision) -eq $false) 'Installed driver was not preserved'
Check ($script:comCalls -eq 0) 'Installed driver triggered a Windows Update query'
$script:devices=@()
Reject { Ensure-LabNvidiaDriver -Provision } 'Nenhuma GPU'
$script:devices=@($script:device)
function Driver($Class,$Maker,$Id,$Date) {
    return [pscustomobject]@{DriverClass=$Class;DriverManufacturer=$Maker;DriverHardwareID=$Id;DriverVerDate=[datetime]$Date;Identity=[pscustomobject]@{UpdateID=$Date;RevisionNumber=1}}
}
$good = Driver Display NVIDIA 'PCI\VEN_10DE&DEV_26B8' '2026-01-01'
$newer = Driver Display NVIDIA 'PCI\VEN_10DE&DEV_26B8' '2026-02-01'
$unrelated = @((Driver MEDIA NVIDIA 'PCI\VEN_10DE&DEV_26B8' '2026-03-01'),
               (Driver Display Intel 'PCI\VEN_10DE&DEV_26B8' '2026-03-01'),
               (Driver Display NVIDIA 'PCI\VEN_10DE&DEV_FFFF' '2026-03-01'))
$chosen = @(Select-LabNvidiaUpdate (@($good,$newer)+$unrelated) $script:device)
Check ($chosen.Count -eq 1 -and $chosen[0] -eq $newer) 'Wrong driver selected'
Check (@(Select-LabNvidiaUpdate $unrelated $script:device).Count -eq 0) 'Unrelated driver selected'

# Exercise the installation protocol and reboot/failure handling with fake COM objects.
$script:items = [Collections.ArrayList]::new()
$script:collection = [pscustomobject]@{Count=0}
$script:collection | Add-Member ScriptMethod Add { param($value) $null=$script:items.Add($value); $this.Count=$script:items.Count; return 0 }
$script:collection | Add-Member ScriptMethod Item { param($index) return $script:items[$index] }
$script:downloadCode=2; $script:installCode=2; $script:reboot=$true; $script:installCalls=0
$script:downloader=[pscustomobject]@{Updates=$null}
$script:downloader | Add-Member ScriptMethod Download { return [pscustomobject]@{ResultCode=$script:downloadCode} }
$script:installer=[pscustomobject]@{Updates=$null;AllowSourcePrompts=$true;ForceQuiet=$false;RebootRequiredBeforeInstallation=$false}
$script:installer | Add-Member ScriptMethod Install { $script:installCalls++; return [pscustomobject]@{ResultCode=$script:installCode;HResult=0;RebootRequired=$script:reboot} }
$session=[pscustomobject]@{}
$session | Add-Member ScriptMethod CreateUpdateDownloader { return $script:downloader }
$session | Add-Member ScriptMethod CreateUpdateInstaller { return $script:installer }
function New-Object { param($ComObject) Check ($ComObject -eq 'Microsoft.Update.UpdateColl') 'Unexpected COM request'; return $script:collection }
$package=[pscustomobject]@{Title='NVIDIA test fixture';EulaAccepted=$true;IsDownloaded=$true}
Check ((Install-LabNvidiaUpdates @($package) $session) -eq $true) 'Reboot requirement lost'
Check ($script:installer.ForceQuiet -and -not $script:installer.AllowSourcePrompts) 'Installer was not configured for unattended installation'
$script:downloadCode=3
Reject { Install-LabNvidiaUpdates @($package) $session } 'Download NVIDIA incompleto'
Check ($script:installCalls -eq 1) 'Installation ran after partial download'
$script:downloadCode=2; $script:installCode=4
Reject { Install-LabNvidiaUpdates @($package) $session } 'Instalacao NVIDIA falhou'
$script:drivers=@(); $script:installCode=2; $script:reboot=$false
$newer | Add-Member NoteProperty Title 'Applicable NVIDIA fixture'
$newer | Add-Member NoteProperty EulaAccepted $true
$newer | Add-Member NoteProperty IsDownloaded $true
$script:searchUpdates=[pscustomobject]@{Count=1}
$script:searchUpdates | Add-Member ScriptMethod Item { param($index) return $newer }.GetNewClosure()
$script:searcher=[pscustomobject]@{Online=$false}
$script:searcher | Add-Member ScriptMethod Search {
    param($query)
    Check ($query -eq "IsInstalled=0 and IsHidden=0 and Type='Driver'") 'Search included unrelated software updates'
    return [pscustomobject]@{ResultCode=2;Updates=$script:searchUpdates}
}
$session | Add-Member NoteProperty ClientApplicationID ''
$session | Add-Member ScriptMethod CreateUpdateSearcher { return $script:searcher }
$script:session=$session
function New-Object {
    param($ComObject)
    if ($ComObject -eq 'Microsoft.Update.Session') { return $script:session }
    if ($ComObject -eq 'Microsoft.Update.UpdateColl') {
        $script:items.Clear(); $script:collection.Count=0
        return $script:collection
    }
    throw 'Unexpected COM request'
}
Check ((Ensure-LabNvidiaDriver -Provision) -eq $false) 'Unexpected reboot request'
Check ($script:items.Count -eq 1 -and $script:items[0] -eq $newer) 'Applicable NVIDIA driver did not reach installer'
$script:searchUpdates.Count=0
Reject { Ensure-LabNvidiaDriver -Provision } 'nao disponibilizou'
Write-Host '[OK] Administrator rejection; installed driver preserved; offline/no-GPU guards; matching GPU only; download/install failures and reboot handling'
