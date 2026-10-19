# Install only absent NVIDIA display drivers, during explicit online preparation.
function Get-LabNvidiaSmi {
    $command = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
    if ($command) { return $command }
    foreach ($path in @((Join-Path $env:WINDIR 'System32/nvidia-smi.exe'),
                         (Join-Path $env:ProgramFiles 'NVIDIA Corporation/NVSMI/nvidia-smi.exe'))) {
        if (Test-Path -LiteralPath $path) { return (Get-Command $path -ErrorAction Stop) }
    }
    return $null
}

function Get-LabNvidiaDisplayDevices {
    return @(Get-CimInstance Win32_PnPEntity | Where-Object {
        $_.PNPDeviceID -match '^PCI\\VEN_10DE&' -and
        ($_.PNPClass -eq 'Display' -or (@($_.CompatibleID) -match '^PCI\\.*CC_03').Count -gt 0)
    })
}

function Select-LabNvidiaUpdate($Updates, $Device) {
    $ids = @($Device.HardwareID) + @($Device.CompatibleID)
    return @($Updates | Where-Object {
        $_.DriverClass -eq 'Display' -and $_.DriverManufacturer -match '^NVIDIA(?:\s|$)' -and
        $_.DriverHardwareID -match '^PCI\\VEN_10DE&' -and $_.DriverHardwareID -in $ids
    } | Sort-Object -Property @{Expression={$_.DriverVerDate};Descending=$true},
        @{Expression={$_.Identity.RevisionNumber};Descending=$true} | Select-Object -First 1)
}

function Install-LabNvidiaUpdates($Updates, $Session) {
    $collection = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($update in $Updates) {
        if (-not $update.EulaAccepted) { $update.AcceptEula() }
        $null = $collection.Add($update)
        Write-Lab INFO "Driver selecionado: $($update.Title)"
    }
    $downloader = $Session.CreateUpdateDownloader()
    $downloader.Updates = $collection
    Write-Lab INFO 'Baixando somente os drivers NVIDIA selecionados pelo Windows Update...'
    $download = $downloader.Download()
    if ([int]$download.ResultCode -ne 2) { throw "Download NVIDIA incompleto (Windows Update ResultCode=$($download.ResultCode)). Repita prepare apos corrigir a conectividade/politica do Windows Update." }
    for ($i=0; $i -lt $collection.Count; $i++) {
        if (-not $collection.Item($i).IsDownloaded) { throw 'Pacote NVIDIA nao foi completamente baixado.' }
    }
    $installer = $Session.CreateUpdateInstaller()
    if ($installer.RebootRequiredBeforeInstallation) { return $true }
    $installer.Updates = $collection
    $installer.AllowSourcePrompts = $false
    $installer.ForceQuiet = $true
    Write-Lab INFO 'Instalando driver NVIDIA. A tela pode piscar durante a instalacao.'
    $result = $installer.Install()
    if ([int]$result.ResultCode -ne 2) { throw "Instalacao NVIDIA falhou ou ficou incompleta (Windows Update ResultCode=$($result.ResultCode), HRESULT=$($result.HResult)). Consulte o Windows Update; nenhum driver existente foi removido pelo bootstrap." }
    return [bool]$result.RebootRequired
}

function Ensure-LabNvidiaDriver([switch]$Provision) {
    $devices = @(Get-LabNvidiaDisplayDevices)
    if (-not $devices.Count) { throw 'Nenhuma GPU NVIDIA PCI de video foi detectada. Confira o equipamento e a habilitacao da GPU.' }
    $drivers = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object {
        $_.DeviceClass -eq 'DISPLAY' -and $_.DriverProviderName -match '^NVIDIA(?:\s|$)'
    })
    $missing = @($devices | Where-Object { $_.PNPDeviceID -notin @($drivers | ForEach-Object { $_.DeviceID }) })
    if (-not $missing.Count) {
        Write-Lab OK 'Driver NVIDIA ja instalado; preservado sem buscar atualizacoes.'
        return $false
    }
    if (-not $Provision) { throw 'Driver NVIDIA ausente. Execute .\lab\bootstrap.ps1 prepare all como administrador e com internet.' }
    Assert-BootstrapAdministrator
    Write-Lab INFO 'Driver NVIDIA ausente; consultando drivers aplicaveis via Windows Update. Esta etapa requer internet.'
    $session = New-Object -ComObject Microsoft.Update.Session
    $session.ClientApplicationID = 'ai-lab-nvidia bootstrap'
    $searcher = $session.CreateUpdateSearcher()
    $searcher.Online = $true
    $search = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Driver'")
    if ([int]$search.ResultCode -ne 2) { throw 'Consulta Windows Update incompleta. Verifique rede, servico Windows Update e politicas corporativas; repita prepare.' }
    $available = @()
    for ($i=0; $i -lt $search.Updates.Count; $i++) { $available += $search.Updates.Item($i) }
    $selected = @()
    foreach ($device in $missing) {
        $candidate = @(Select-LabNvidiaUpdate $available $device)
        if (-not $candidate.Count) { throw "Windows Update nao disponibilizou driver NVIDIA de video para $($device.PNPDeviceID). Instale o pacote oficial Dell/NVIDIA desse equipamento e repita prepare. Nenhum outro update sera instalado." }
        if ($candidate[0].Identity.UpdateID -notin @($selected | ForEach-Object { $_.Identity.UpdateID })) { $selected += $candidate[0] }
    }
    return (Install-LabNvidiaUpdates $selected $session)
}
