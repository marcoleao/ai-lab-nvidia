[CmdletBinding()]
param(
    [ValidateSet('access','demo','publish','verify','merge')]
    [string]$Command = 'verify',
    [string]$Project = '',
    [string]$Directory = ''
)
. "$PSScriptRoot/scripts/windows/Setup.ps1"
$configuration = Read-SdlcInstall
$null = Assert-SdlcOwner $configuration
$arguments = @('-d',$configuration.distro_name,'-u','root','--exec','env',
    "GITLAB_PORT=$($configuration.portal_port + 80)", "DEMO_PORT=$($configuration.portal_port + 81)",
    'python3','-u','/opt/agentic-sdlc/source/gitlab/manage.py',$Command)
if ($Project) { $arguments += @('--project',$Project) }
if ($Directory) {
    if ($Command -ne 'publish') { throw 'Directory aplica-se somente a publish.' }
    if (-not $Directory.StartsWith('/opt/agentic-sdlc/workspaces/', [StringComparison]::Ordinal)) {
        throw 'Use um workspace Linux em /opt/agentic-sdlc/workspaces/<nome>, dentro do ambiente SDLC.'
    }
    $arguments += @('--directory',$Directory)
}
if ($Command -eq 'access') {
    $result = Invoke-SdlcCapture wsl.exe $arguments
    if ($result.Code -ne 0) { throw 'Credencial indisponivel; execute o bootstrap do SDLC.' }
    Set-Clipboard -Value (($result.Output -join "`n").Trim())
    Write-Host "Senha do usuario root copiada. GitLab: http://127.0.0.1:$($configuration.portal_port + 80)"
} else {
    Invoke-SdlcNative wsl.exe $arguments
}
