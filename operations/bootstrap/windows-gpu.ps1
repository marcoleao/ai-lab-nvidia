# Windows display-driver adapter. No LAB/SDLC imports; existing drivers preserved.
function Get-PlatformNvidiaDevices {
    @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPDeviceID -match '^PCI\\VEN_10DE&' -and ($_.PNPClass -eq 'Display' -or (@($_.CompatibleID) -match '^PCI\\.*CC_03').Count -gt 0) })
}
function Get-PlatformNvidiaState {
    $devices=@(Get-PlatformNvidiaDevices)
    if ($devices.Count -eq 0) {throw 'PLATFORM_NVIDIA_GPU_REQUIRED'}
    $drivers=@(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -eq 'DISPLAY' -and $_.DriverProviderName -match '^NVIDIA(?:\s|$)' })
    $missing=@($devices | Where-Object { $_.PNPDeviceID -notin @($drivers | ForEach-Object {$_.DeviceID}) })
    [pscustomobject]@{Devices=$devices;Missing=$missing;Digest=(Get-PlatformSha256 ((@($drivers | ForEach-Object {"$($_.DeviceID)=$($_.DriverVersion)"} | Sort-Object)) -join ':'))}
}
function Select-PlatformNvidiaUpdate($Updates,$Device) {
    $ids=@($Device.HardwareID)+@($Device.CompatibleID)
    @($Updates | Where-Object { $_.DriverClass -eq 'Display' -and $_.DriverManufacturer -match '^NVIDIA(?:\s|$)' -and $_.DriverHardwareID -match '^PCI\\VEN_10DE&' -and $_.DriverHardwareID -in $ids } |
        Sort-Object -Property @{Expression={$_.DriverVerDate};Descending=$true},@{Expression={$_.Identity.RevisionNumber};Descending=$true} | Select-Object -First 1)
}
function Install-PlatformNvidiaUpdates($Updates,$Session) {
    $collection=New-Object -ComObject Microsoft.Update.UpdateColl
    foreach($update in $Updates){if(-not $update.EulaAccepted){$update.AcceptEula()};$null=$collection.Add($update)}
    $downloader=$Session.CreateUpdateDownloader();$downloader.Updates=$collection
    $download=$downloader.Download()
    if([int]$download.ResultCode -ne 2){throw 'PLATFORM_NVIDIA_DOWNLOAD_INCOMPLETE'}
    for($i=0;$i -lt $collection.Count;$i++){if(-not $collection.Item($i).IsDownloaded){throw 'PLATFORM_NVIDIA_DOWNLOAD_INCOMPLETE'}}
    $installer=$Session.CreateUpdateInstaller()
    if($installer.RebootRequiredBeforeInstallation){return $true}
    $installer.Updates=$collection;$installer.AllowSourcePrompts=$false;$installer.ForceQuiet=$true
    $result=$installer.Install()
    if([int]$result.ResultCode -ne 2){throw 'PLATFORM_NVIDIA_INSTALL_UNCONFIRMED'}
    return [bool]$result.RebootRequired
}
function Ensure-PlatformNvidiaDriver($State) {
    if($State.Missing.Count -eq 0){return $false}
    $session=New-Object -ComObject Microsoft.Update.Session
    $session.ClientApplicationID='AI Platform host preparation'
    $searcher=$session.CreateUpdateSearcher();$searcher.Online=$true
    $search=$searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Driver'")
    if([int]$search.ResultCode -ne 2){throw 'PLATFORM_WINDOWS_UPDATE_QUERY_FAILED'}
    $available=@();for($i=0;$i -lt $search.Updates.Count;$i++){$available+=$search.Updates.Item($i)}
    $selected=@()
    foreach($device in $State.Missing){
        $candidate=@(Select-PlatformNvidiaUpdate $available $device)
        if($candidate.Count -ne 1){throw 'PLATFORM_NVIDIA_VENDOR_DRIVER_REQUIRED'}
        if($candidate[0].Identity.UpdateID -notin @($selected|ForEach-Object {$_.Identity.UpdateID})){$selected+=$candidate[0]}
    }
    return Install-PlatformNvidiaUpdates $selected $session
}
function Read-PlatformWindowsGpuVersion {
    $candidates=@((Join-Path $env:SystemRoot 'System32/nvidia-smi.exe'),(Join-Path $env:ProgramFiles 'NVIDIA Corporation/NVSMI/nvidia-smi.exe'))
    foreach($binary in $candidates){
        if(Test-Path -LiteralPath $binary -PathType Leaf){
            $previousPreference=$ErrorActionPreference
            try{$ErrorActionPreference='Continue';$output=@(& $binary --query-gpu=driver_version --format=csv,noheader 2>&1);if($LASTEXITCODE -eq 0){return Get-PlatformSha256 (($output|ForEach-Object {$_.ToString()}) -join ':')}}finally{$ErrorActionPreference=$previousPreference}
        }
    }
    throw 'PLATFORM_NVIDIA_DRIVER_PROBE_FAILED'
}
function Ensure-PlatformWindowsGpu($Context,$Observation) {
    $state=Get-PlatformNvidiaState
    $restart=Join-Path $Context.ControlRoot 'gpu-reboot.json'
    return Invoke-PlatformAuditedStep $Context PLATFORM_WINDOWS_GPU_DRIVER_PREPARED $state.Digest {
        if(Test-Path -LiteralPath $restart){$pending=Read-PlatformControlFile $restart;if($pending.boot_id -ceq $Observation.BootId){return New-PlatformStepResult REBOOT_PENDING DEFERRED WAITING REBOOT_REQUIRED}}
        if(Ensure-PlatformNvidiaDriver $state){Write-PlatformAtomicJson $restart @{boot_id=$Observation.BootId};return New-PlatformStepResult REBOOT_PENDING DEFERRED WAITING REBOOT_REQUIRED}
        $null=Read-PlatformWindowsGpuVersion
        $after=Get-PlatformNvidiaState
        if($after.Missing.Count -ne 0){throw 'PLATFORM_NVIDIA_DRIVER_NOT_OBSERVED'}
        if(Test-Path -LiteralPath $restart){Remove-Item -LiteralPath $restart -Force}
        New-PlatformStepResult $after.Digest $(if($state.Missing.Count -eq 0){'NO_CHANGE'}else{'SUCCEEDED'})
    }
}
