[CmdletBinding()]
param(
    [ValidateSet('plan','validate','prepare','up','down','restart','status','doctor','logs','test','access','backup','restore-check','backup-key','revoke-access','rotate-access','export-backup','report','readiness')]
    [string]$Command = 'plan',
    [string]$BackupId = '',
    [ValidateSet('human','reader')][string]$Identity = 'human',
    [ValidateSet('portal','gitlab')][string]$Service = 'portal'
)
. "$PSScriptRoot/../scripts/windows/Require-Administrator.ps1"
Assert-BootstrapAdministrator
. "$PSScriptRoot/scripts/windows/Setup.ps1"
$configuration = Read-SdlcInstall
if ($Command -eq 'validate') { & "$PSScriptRoot/tests/validate.ps1"; return }
if ($Command -eq 'plan') {
    [pscustomobject]@{
        Scope='Control nucleus, Forgejo backlog, GitLab and Runner for local demos; application agents pending'
        Distro=$configuration.distro_name
        Storage=$configuration.distro_directory
        Portal="http://127.0.0.1:$($configuration.portal_port)"
        Transport='Explicit HTTP on loopback only; no LAN binding or Windows trust changes'
        Services='PostgreSQL, portal/API, consumer, Forgejo, GitLab, GitLab Runner, local demo server and loopback proxies'
        GitLab="http://127.0.0.1:$($configuration.portal_port + 80)"
        Demo="http://127.0.0.1:$($configuration.portal_port + 81)"
        BacklogSource="http://127.0.0.1:$($configuration.portal_port + 1) (portal is the human interface)"
        Preparation='Downloads rootfs/images, installs Docker only in the new distro, builds pinned runtime'
        Runtime='Internal container networks; Runner executes trusted demos without host or Docker socket mounts'
        Backup='Encrypted archive; restore-check uses a separate temporary database'
        LabChanges='None'
    } | Format-List
    return
}
if ($Service -ne 'portal' -and $Command -ne 'access') { throw 'Service applies only to access.' }
if ($Service -eq 'gitlab' -and $Identity -ne 'human') { throw 'Identity applies only to portal access.' }
if ($BackupId -and $Command -notin 'restore-check','export-backup') { throw 'BackupId applies only to restore-check or export-backup.' }
if ($Command -in 'restore-check','export-backup' -and $BackupId -cnotmatch '^sdlc-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$') { throw 'Provide a valid -BackupId from the backup command.' }
$state = Join-Path $PSScriptRoot '.state'
foreach ($directory in @($state, (Join-Path $PSScriptRoot '.cache'))) {
    if ((Test-Path $directory) -and ((Get-Item $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Generated directories cannot be junctions.' }
    if (-not (Test-Path $directory)) { New-Item -ItemType Directory -Path $directory | Out-Null }
}
$lock = [IO.File]::Open((Join-Path $state 'operation.lock'), 'OpenOrCreate','ReadWrite','None')
try {
    $targetPath = Join-Path $state 'target.json'
    if (Test-Path $targetPath) {
        $target = Get-Content $targetPath -Raw | ConvertFrom-Json
        if ($target.directory -ne $configuration.distro_directory -or $target.name -ne $configuration.distro_name) { throw 'Target changed while state exists; restore previous configuration.' }
    }
    if ($Command -eq 'readiness') {
        . "$PSScriptRoot/scripts/windows/Readiness.ps1"
        Write-SdlcReadiness $configuration
    } elseif ($Command -eq 'prepare') {
        Write-SdlcUtf8 $targetPath (@{name=$configuration.distro_name;directory=$configuration.distro_directory} | ConvertTo-Json)
        Prepare-Sdlc $configuration
    } elseif ($Command -eq 'access') {
        if ($Service -eq 'gitlab') { & "$PSScriptRoot/gitlab.ps1" access }
        else { Copy-SdlcAccess $configuration $Identity }
    }
    elseif ($Command -eq 'backup-key') {
        $null = Assert-SdlcOwner $configuration
        $secret = Invoke-SdlcCapture wsl.exe @('-d',$configuration.distro_name,'-u','root','--exec','cat','/opt/agentic-sdlc/.secrets/backup_key')
        if ($secret.Code -ne 0) { throw 'Backup key unavailable.' }
        Set-Clipboard -Value (($secret.Output -join '').Trim())
        Write-Host 'Chave do backup copiada. Guarde-a separadamente do arquivo cifrado para recuperacao fora desta workstation.'
    } elseif ($Command -eq 'report') {
        $null = Assert-SdlcOwner $configuration
        $report = Invoke-SdlcCapture wsl.exe @('-d',$configuration.distro_name,'-u','root','--exec','cat','/opt/agentic-sdlc/state/last-automated-acceptance.json')
        if ($report.Code -ne 0) { throw 'No report available; run test first.' }
        $content = ($report.Output -join "`n")
        $null = $content | ConvertFrom-Json
        Write-SdlcUtf8 (Join-Path $state 'acceptance-report.json') $content
        $gitlabReport = Invoke-SdlcCapture wsl.exe @('-d',$configuration.distro_name,'-u','root','--exec','cat','/opt/agentic-sdlc/gitlab-demo/acceptance.json')
        if ($gitlabReport.Code -ne 0) { throw 'GitLab report unavailable; run test first.' }
        $gitlabContent = ($gitlabReport.Output -join "`n")
        $null = $gitlabContent | ConvertFrom-Json
        Write-SdlcUtf8 (Join-Path $state 'gitlab-acceptance-report.json') $gitlabContent
        Write-Host 'Relatorio salvo em sdlc/.state/acceptance-report.json. Aceite humano permanece separado.'
        Write-Host 'Relatorio GitLab/Runner salvo em sdlc/.state/gitlab-acceptance-report.json.'
    } elseif ($Command -eq 'export-backup') {
        $null = Assert-SdlcOwner $configuration
        $destination = Join-Path $PSScriptRoot 'backups'
        if ((Test-Path $destination) -and ((Get-Item $destination -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Backup export cannot use a junction.' }
        if (-not (Test-Path $destination)) { New-Item -ItemType Directory -Path $destination | Out-Null }
        $exportFile = Join-Path $destination "$BackupId.fernet"
        if ((Test-Path $exportFile) -and ((Get-Item $exportFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Backup export file cannot be a symlink.' }
        $linuxDestination = Get-SdlcLinuxPath $configuration $destination
        Invoke-SdlcNative wsl.exe @('-d',$configuration.distro_name,'-u','root','--exec','cp',"/opt/agentic-sdlc/backups/$BackupId.fernet","$linuxDestination/$BackupId.fernet")
        Get-FileHash -LiteralPath (Join-Path $destination "$BackupId.fernet") -Algorithm SHA256 | Format-List
        Write-Host 'Somente o backup cifrado foi exportado. Guarde a chave separadamente.'
    } elseif ($Command -in 'revoke-access','rotate-access') {
        $null = Assert-SdlcOwner $configuration
        Invoke-SdlcNative wsl.exe @('-d',$configuration.distro_name,'-u','root','--exec','bash','/opt/agentic-sdlc/source/scripts/linux/runtime.sh','/opt/agentic-sdlc',$Command,$Identity)
    } else {
        Invoke-SdlcRuntime $configuration $Command $BackupId
        if ($Command -in 'up','restart','doctor') {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$($configuration.portal_port)/health/ready" -TimeoutSec 10
            if ($response.StatusCode -ne 200) { throw 'Portal not reachable from Windows.' }
            Write-Host "Portal: http://127.0.0.1:$($configuration.portal_port)"
            foreach ($url in @("http://127.0.0.1:$($configuration.portal_port + 80)/users/sign_in", "http://127.0.0.1:$($configuration.portal_port + 81)")) {
                $check = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
                if ($check.StatusCode -ne 200) { throw "Service not reachable from Windows: $url" }
            }
            Write-Host '[OK] GitLab and demo reachable from Windows.'
        }
    }
} finally { $lock.Dispose() }
