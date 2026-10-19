# Windows PowerShell 5.1+. Run from the same Windows account used to install.
[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [ValidateSet('Plan','Clean')][string]$Action = 'Plan',
    [switch]$Yes
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$cleanupRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')

function Assert-CleanupTree([string]$Path, [string]$AllowedRoot) {
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $allowed = [IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\')
    if ($full -ne $allowed -and -not $full.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Removal outside the allowed directory: $full"
    }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Junction/symlink refused: $cursor"
            }
        }
        $cursor = Split-Path $cursor -Parent
    }
    if (Test-Path -LiteralPath $full -PathType Container) { Assert-NoReparseTree $full }
}

function Assert-CleanupRegistry($Config, [bool]$Registered) {
    $target = $Config.distro_directory.TrimEnd('\')
    $entries = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | Get-ItemProperty)
    foreach ($entry in $entries) {
        $storage = [IO.Path]::GetFullPath(($entry.BasePath -replace '^\\\\\?\\','')).TrimEnd('\')
        if ($entry.DistributionName -eq $Config.distro_name) {
            if ($entry.Version -ne 2 -or $storage -ne (Join-Path $target 'distro')) { throw 'Registered distro path/version differs from configuration.' }
        } elseif ($storage -eq $target -or $storage.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith($storage + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Removal target overlaps another WSL distro.'
        }
    }
    if ($Registered -and @($entries | Where-Object DistributionName -EQ $Config.distro_name).Count -ne 1) {
        throw 'Expected exactly one registered owned distro.'
    }
}

function Remove-CleanupPath([string]$Path, [string]$AllowedRoot) {
    if (Test-Path -LiteralPath $Path) {
        Assert-CleanupTree $Path $AllowedRoot
        Remove-Item -LiteralPath ([IO.Path]::GetFullPath($Path)) -Recurse -Force
    }
}

function Invoke-CleanupCapture([string]$File, [string[]]$Arguments) {
    # The capture helper must dispose its temporary stderr file even in preview mode.
    $WhatIfPreference = $false
    Invoke-SdlcCapture $File $Arguments
}

# Reuse the installers' configuration parsers and ownership checks.
. "$cleanupRoot/lab/scripts/windows/helpers.ps1"
$script:Config = Read-LabConfig
$labConfig = $script:Config
. "$cleanupRoot/sdlc/scripts/windows/Setup.ps1"
$sdlcConfig = Read-SdlcInstall
$entries = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | Get-ItemProperty)
$targets = @(
    [pscustomobject]@{Config=$sdlcConfig; Kind='SDLC'; Registered=($sdlcConfig.distro_name -in @($entries | ForEach-Object { $_.DistributionName }))},
    [pscustomobject]@{Config=$labConfig; Kind='Lab'; Registered=($labConfig.distro_name -in @($entries | ForEach-Object { $_.DistributionName }))}
)
$generated = @()
foreach ($area in @('', 'lab', 'sdlc', 'vscode')) {
    foreach ($name in @('.env','.logs','.runtime-logs','.cache','.state','.secrets','backups')) {
        $relative = if ($area) { Join-Path $area $name } else { $name }
        $generated += Join-Path $cleanupRoot $relative
    }
}
$extensionId = 'ai-local.sdlc-chat'
$code = Get-Command code.cmd -ErrorAction SilentlyContinue
$installed = $false
if ($code) {
    $list = Invoke-CleanupCapture $code.Source @('--list-extensions')
    if ($list.Code -ne 0) { throw 'Cannot inventory VS Code extensions.' }
    $installed = $extensionId -in @($list.Output | ForEach-Object { $_.Trim() })
}
if (-not $code) { Write-Warning 'code.cmd nao encontrado: confira/remova a extensao manualmente antes do teste limpo.' }

Write-Host 'Plano de limpeza (somente componentes deste projeto):'
foreach ($target in $targets) {
    $area = if ($target.Kind -eq 'SDLC') { 'sdlc' } else { 'lab' }
    $record = Join-Path $cleanupRoot "$area/.state/target.json"
    if (Test-Path -LiteralPath $record) {
        $previous = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
        if ($previous.name -ne $target.Config.distro_name -or $previous.directory -ne $target.Config.distro_directory) {
            throw 'Configuration changed since installation; restore it before cleanup.'
        }
    }
    Write-Host "  $($target.Kind): $($target.Config.distro_name); registrada=$($target.Registered); armazenamento=$($target.Config.distro_directory)"
    Assert-CleanupRegistry $target.Config $target.Registered
    if (Test-Path -LiteralPath $target.Config.distro_directory) {
        Assert-CleanupTree $target.Config.distro_directory $target.Config.distro_directory
        if ($target.Kind -eq 'SDLC') { $null = Read-SdlcOwner $target.Config }
        else { $null = Read-Owner }
    } elseif ($target.Registered) { throw 'Registered distro has no owned storage directory.' }
}
Write-Host "  Extensao: $extensionId; instalada=$installed"
foreach ($path in $generated) {
    if (Test-Path -LiteralPath $path) {
        Assert-CleanupTree $path $cleanupRoot
        Write-Host "  Dados locais: $path"
    }
}
Write-Host 'Preservados: fontes/.git, configuracoes versionadas, WSL, driver NVIDIA, Git, VS Code e outras distros.'
Write-Host 'Antes de limpar: execute SDLC: Remover chave deste VS Code em cada perfil utilizado e feche o VS Code.'
if ($Action -eq 'Plan') { Write-Host 'Nenhuma remocao executada. Para limpar: .\cleanup-environment.ps1 -Action Clean'; return }
if ($WhatIfPreference) {
    $null = $PSCmdlet.ShouldProcess('distros, extensao e dados gerenciados', 'Remover ambiente local')
    return
}
if (Get-Process -Name Code -ErrorAction SilentlyContinue) { throw 'Feche todas as janelas do VS Code e execute em um PowerShell externo.' }
if (-not $Yes -and (Read-Host 'Remove permanentemente demos, modelos, imagens, secrets e caches. Digite CLEANUP') -cne 'CLEANUP') {
    throw 'Limpeza cancelada.'
}
if (-not $PSCmdlet.ShouldProcess('distros, extensao e dados gerenciados', 'Remover ambiente local')) { return }

$locks = @()
try {
    # Fail before uninstalling anything if another installer is operating.
    foreach ($area in @('lab','sdlc')) {
        $lockPath = Join-Path $cleanupRoot "$area/.state/operation.lock"
        if (Test-Path -LiteralPath $lockPath) { $locks += [IO.File]::Open($lockPath,'Open','ReadWrite','None') }
    }
    foreach ($target in $targets) {
        if ($target.Registered) {
            if ($target.Kind -eq 'SDLC') { $null = Assert-SdlcOwner $target.Config }
            else { Assert-DistroOwner }
        }
    }
    if ($installed) {
        Invoke-SdlcNative $code.Source @('--uninstall-extension',$extensionId)
        $list = Invoke-CleanupCapture $code.Source @('--list-extensions')
        if ($list.Code -ne 0 -or $extensionId -in $list.Output) { throw 'Extension removal could not be verified.' }
    }
    foreach ($target in $targets) {
        $config = $target.Config
        if ($target.Registered) {
            Write-Host "Removendo distro $($config.distro_name)..."
            # Unregister removes the complete owned Linux environment even if Docker is broken.
            Invoke-SdlcNative wsl.exe @('--terminate',$config.distro_name)
            Invoke-SdlcNative wsl.exe @('--unregister',$config.distro_name)
        }
        if (Test-Path -LiteralPath $config.distro_directory) {
            # Revalidate marker, registry overlap and full tree immediately before deletion.
            Assert-CleanupRegistry $config $false
            if ($target.Kind -eq 'SDLC') { $null = Read-SdlcOwner $config }
            else { $null = Read-Owner }
            Remove-CleanupPath $config.distro_directory $config.distro_directory
        }
    }
} finally {
    foreach ($handle in $locks) { $handle.Dispose() }
}
foreach ($path in $generated) { Remove-CleanupPath $path $cleanupRoot }
$remaining = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | Get-ItemProperty)
foreach ($target in $targets) {
    if ($target.Config.distro_name -in @($remaining | ForEach-Object { $_.DistributionName }) -or (Test-Path -LiteralPath $target.Config.distro_directory)) {
        throw "Removal incomplete: $($target.Config.distro_name)"
    }
}
Write-Host 'Limpeza concluida. Nenhuma distro ou dado gerenciado restante. Recomece pelo roteiro de teste do zero no README.'
