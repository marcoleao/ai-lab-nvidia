# Hardware/Windows Update are pure mocks. No real CIM, COM or driver operation.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repository=Split-Path $PSScriptRoot -Parent
Import-Module (Join-Path $repository 'operations/audit/WindowsRecorder.psm1') -Force -DisableNameChecking
. (Join-Path $repository 'operations/bootstrap/windows-gpu.ps1')
function Check($Condition,$Message){if(-not $Condition){throw $Message}}
function Reject([scriptblock]$Operation,[string]$Code){try{$null=& $Operation}catch{if($_.Exception.Message -eq $Code){return};throw};throw "Expected $Code"}
$script:device=[pscustomobject]@{PNPDeviceID='PCI\VEN_10DE&DEV_26B8\FIXTURE';PNPClass='Display';HardwareID=@('PCI\VEN_10DE&DEV_26B8');CompatibleID=@('PCI\VEN_10DE&CC_0300')}
$script:devices=@($script:device);$script:drivers=@();$script:comCalls=0
function Get-CimInstance($ClassName){switch($ClassName){Win32_PnPEntity{return $script:devices};Win32_PnPSignedDriver{return $script:drivers};default{throw 'Unexpected CIM query'}}}
function New-Object{param($ComObject)$script:comCalls++;throw 'Unexpected COM operation'}
$script:drivers=@([pscustomobject]@{DeviceClass='DISPLAY';DriverProviderName='NVIDIA';DeviceID=$script:device.PNPDeviceID;DriverVersion='32.0.15.9500'})
$state=Get-PlatformNvidiaState
Check (-not (Ensure-PlatformNvidiaDriver $state) -and $script:comCalls -eq 0) 'Existing driver triggered Windows Update'
$script:devices=@()
Reject {Get-PlatformNvidiaState} 'PLATFORM_NVIDIA_GPU_REQUIRED'
$script:devices=@($script:device)
function Driver($Class,$Maker,$ID,$Date){[pscustomobject]@{DriverClass=$Class;DriverManufacturer=$Maker;DriverHardwareID=$ID;DriverVerDate=[datetime]$Date;Identity=[pscustomobject]@{UpdateID=$Date;RevisionNumber=1};EulaAccepted=$true;IsDownloaded=$true}}
$older=Driver Display NVIDIA 'PCI\VEN_10DE&DEV_26B8' '2026-01-01'
$newer=Driver Display NVIDIA 'PCI\VEN_10DE&DEV_26B8' '2026-02-01'
$wrong=@((Driver MEDIA NVIDIA 'PCI\VEN_10DE&DEV_26B8' '2026-03-01'),(Driver Display Intel 'PCI\VEN_10DE&DEV_26B8' '2026-03-01'),(Driver Display NVIDIA 'PCI\VEN_10DE&DEV_FFFF' '2026-03-01'))
Check (@(Select-PlatformNvidiaUpdate (@($older,$newer)+$wrong) $script:device)[0] -eq $newer) 'Wrong device/version selected'
Check (@(Select-PlatformNvidiaUpdate $wrong $script:device).Count -eq 0) 'Unrelated update selected'
$script:items=[Collections.ArrayList]::new()
$script:collection=[pscustomobject]@{Count=0}
$script:collection|Add-Member ScriptMethod Add {param($Value)$null=$script:items.Add($Value);$this.Count=$script:items.Count;return 0}
$script:collection|Add-Member ScriptMethod Item {param($Index)return $script:items[$Index]}
$script:downloadCode=2;$script:installCode=2;$script:reboot=$true;$script:installCalls=0
$script:downloader=[pscustomobject]@{Updates=$null}
$script:downloader|Add-Member ScriptMethod Download {return [pscustomobject]@{ResultCode=$script:downloadCode}}
$script:installer=[pscustomobject]@{Updates=$null;AllowSourcePrompts=$true;ForceQuiet=$false;RebootRequiredBeforeInstallation=$false}
$script:installer|Add-Member ScriptMethod Install {$script:installCalls++;return [pscustomobject]@{ResultCode=$script:installCode;RebootRequired=$script:reboot}}
$script:session=[pscustomobject]@{}
$script:session|Add-Member ScriptMethod CreateUpdateDownloader {return $script:downloader}
$script:session|Add-Member ScriptMethod CreateUpdateInstaller {return $script:installer}
function New-Object{param($ComObject)Check ($ComObject -eq 'Microsoft.Update.UpdateColl') 'Unexpected COM class';return $script:collection}
Check (Install-PlatformNvidiaUpdates @($newer) $script:session) 'Reboot not propagated'
Check ($script:installer.ForceQuiet -and -not $script:installer.AllowSourcePrompts) 'Driver install protocol changed'
$script:downloadCode=3
Reject {Install-PlatformNvidiaUpdates @($newer) $script:session} 'PLATFORM_NVIDIA_DOWNLOAD_INCOMPLETE'
Check ($script:installCalls -eq 1) 'Partial download was installed'
$script:downloadCode=2;$script:installCode=4
Reject {Install-PlatformNvidiaUpdates @($newer) $script:session} 'PLATFORM_NVIDIA_INSTALL_UNCONFIRMED'
$script:installer.RebootRequiredBeforeInstallation=$true
Check (Install-PlatformNvidiaUpdates @($newer) $script:session) 'Pre-existing reboot ignored'
Write-Output 'Windows GPU: preservation, hardware match, selected download, failure and reboot contracts: OK.'
