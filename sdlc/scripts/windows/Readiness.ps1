Set-StrictMode -Version Latest

function Get-SdlcReadinessDecision($Facts) {
    $pending = [Collections.Generic.List[string]]::new()
    if ($null -eq $Facts.free_ram_gib -or $Facts.free_ram_gib -lt 10) { $pending.Add('Confirmar pelo menos 10 GiB de RAM disponivel antes do ensaio: VM 6 GiB e margem 4 GiB; laboratorio deve estar ativo.') }
    if ($null -eq $Facts.free_disk_gib -or $Facts.free_disk_gib -lt 150) { $pending.Add('Confirmar pelo menos 150 GiB livres para preparar worker e evidencias.') }
    if ($Facts.virtualization_available -ne $true) { $pending.Add('Confirmar virtualizacao de hardware e SLAT.') }
    if ($Facts.hyperv_management_available -ne $true) { $pending.Add('Verificar disponibilidade do Hyper-V para a VM de execucao isolada.') }
    if ($Facts.lab_running -ne $true) { $pending.Add('Iniciar o laboratorio e repetir a medicao com ambos os ambientes ativos.') }
    if ($Facts.lab_models_verified -ne $true) { $pending.Add('Verificar os modelos disponiveis no Ollama do laboratorio.') }
    if ($Facts.portal_ready -ne $true) { $pending.Add('Restabelecer o portal SDLC antes de integrar novos componentes.') }
    # Inventory alone never certifies isolation or network connectivity.
    $pending.Add('Ensaiar VM isolada, rede privada autenticada e inferencia sob carga antes de habilitar workers.')
    return [ordered]@{ status='pending_validation'; worker_execution_authorized=$false; pending=@($pending.ToArray()) }
}

function Write-SdlcReadiness($Config) {
    $issues = [Collections.Generic.List[string]]::new()
    $facts = [ordered]@{
        total_ram_gib=$null; free_ram_gib=$null; free_disk_gib=$null
        cpu=$null; virtualization_available=$null; hypervisor_present=$null
        hyperv_management_available=$false; lab_running=$false
        lab_models_verified=$false; lab_models=@(); portal_ready=$false
    }
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        $facts.total_ram_gib = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        $facts.free_ram_gib = [Math]::Round($os.FreePhysicalMemory / 1MB, 2)
        $processors = @(Get-CimInstance Win32_Processor -ErrorAction Stop)
        $facts.cpu = @($processors | ForEach-Object { $_.Name })
        $system = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
        $facts.hypervisor_present = [bool]$system.HypervisorPresent
        $facts.virtualization_available = $facts.hypervisor_present -or @($processors | Where-Object { $_.VirtualizationFirmwareEnabled -and $_.SecondLevelAddressTranslationExtensions }).Count -gt 0
    } catch { $issues.Add('Inventario CIM indisponivel; capacidade de memoria/virtualizacao nao confirmada.') }
    try {
        $driveName = [IO.Path]::GetPathRoot($Config.distro_directory).Substring(0,1)
        $drive = Get-PSDrive -Name $driveName -ErrorAction Stop
        $facts.free_disk_gib = [Math]::Round($drive.Free / 1GB, 2)
    } catch { $issues.Add('Espaco livre do armazenamento SDLC nao confirmado.') }
    $facts.hyperv_management_available = $null -ne (Get-Command Get-VM -ErrorAction SilentlyContinue)
    $environment = Get-Content -LiteralPath (Join-Path $script:SdlcRoot 'config/environment.json') -Raw | ConvertFrom-Json
    $running = Invoke-SdlcCapture wsl.exe @('--list','--running','--quiet')
    if ($running.Code -eq 0) {
        $facts.lab_running = $environment.lab_distro_name -in @($running.Output | ForEach-Object { $_.Trim() })
    } else { $issues.Add('Nao foi possivel consultar as distros WSL ativas.') }
    # Never start a stopped lab, create containers or read its secret environment.
    if ($facts.lab_running) {
        $containers = Invoke-SdlcCapture wsl.exe @('-d',$environment.lab_distro_name,'-u','root','--exec','docker','ps','--filter','label=com.docker.compose.project=ai-local-lab','--filter','label=com.docker.compose.service=ollama','--format','{{.ID}}')
        $ids = @($containers.Output | Where-Object { $_ -cmatch '^[a-f0-9]{12,64}$' })
        if ($containers.Code -eq 0 -and $ids.Count -eq 1) {
            $models = Invoke-SdlcCapture wsl.exe @('-d',$environment.lab_distro_name,'-u','root','--exec','docker','exec',$ids[0],'ollama','list')
            if ($models.Code -eq 0 -and $models.Output.Count -gt 0 -and $models.Output[0] -match '^NAME\s+ID\s+SIZE') {
                $facts.lab_models = @($models.Output | Select-Object -Skip 1 | Where-Object { $_.Trim() } | ForEach-Object { ($_.Trim() -split '\s+')[0] })
                $facts.lab_models_verified = $facts.lab_models.Count -gt 0
            } else { $issues.Add('Ollama nao retornou inventario de modelos valido.') }
        } else { $issues.Add('Esperado exatamente um container Ollama ativo do projeto ai-local-lab.') }
    }
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$($Config.portal_port)/health/ready" -TimeoutSec 5 -ErrorAction Stop
        $body = $response.Content | ConvertFrom-Json
        $facts.portal_ready = $response.StatusCode -eq 200 -and $body.status -eq 'ready' -and $body.scope -eq 'acceptance-nucleus'
    } catch { $issues.Add('Portal nao respondeu ao health check no loopback Windows.') }
    $report = [ordered]@{
        schema_version=1; observed_at_utc=[DateTime]::UtcNow.ToString('o')
        scope='read_only_inventory'; facts=$facts; collection_issues=@($issues.ToArray())
        decision=(Get-SdlcReadinessDecision ([pscustomobject]$facts))
        limits=@('RAM e disco sao uma fotografia, nao um benchmark.', 'Modulo Hyper-V presente nao comprova VM executavel.', 'Inventario de modelos nao comprova inferencia ou conectividade entre ambientes.')
    }
    $destination = Join-Path $script:SdlcRoot '.state/readiness-report.json'
    if ((Test-Path -LiteralPath $destination) -and ((Get-Item -LiteralPath $destination -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Readiness report cannot be a symlink.' }
    Write-SdlcUtf8 $destination ($report | ConvertTo-Json -Depth 8)
    Write-Host ($report | ConvertTo-Json -Depth 8)
    Write-Host 'Relatorio salvo em sdlc/.state/readiness-report.json. Nenhum worker habilitado.'
}
