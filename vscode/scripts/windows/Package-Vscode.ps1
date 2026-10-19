[CmdletBinding()]
param([switch]$Install)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$extensionRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$extensionDirectory = $extensionRoot
$package = Get-Content -LiteralPath (Join-Path $extensionDirectory 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($package.name -cne 'sdlc-chat' -or $package.version -cnotmatch '^\d+\.\d+\.\d+$') { throw 'Invalid extension identity.' }
$destination = Join-Path $extensionRoot '.state/packages'
foreach ($directory in @((Join-Path $extensionRoot '.state'), $destination)) {
    if ((Test-Path -LiteralPath $directory) -and ((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Generated package directory cannot be a junction.' }
    if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory | Out-Null }
}
$archivePath = Join-Path $destination "sdlc-chat-$($package.version).vsix"
if ((Test-Path -LiteralPath $archivePath) -and ((Get-Item -LiteralPath $archivePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Generated package cannot be a symlink.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipArchive]::new([IO.File]::Open($archivePath, [IO.FileMode]::Create), [IO.Compression.ZipArchiveMode]::Create)
function Add-VsixEntry([string]$Name, [string]$Text) {
    $entry = $archive.CreateEntry($Name)
    $entry.LastWriteTime = [DateTimeOffset]::new(2026, 10, 15, 0, 0, 0, [TimeSpan]::Zero)
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write($Text.Replace("`r`n", "`n")) } finally { $writer.Dispose() }
}
try {
    foreach ($file in @('package.json','extension.js','client.js','view.js','lab-transport.sh','README.md','media/icon.svg','media/chat.css','media/chat.js')) {
        $source = Join-Path $extensionDirectory $file
        if ((Get-Item -LiteralPath $source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Extension source cannot be a symlink.' }
        Add-VsixEntry "extension/$file" ([IO.File]::ReadAllText($source))
    }
    Add-VsixEntry '[Content_Types].xml' '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="css" ContentType="text/css"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="md" ContentType="text/plain"/><Default Extension="sh" ContentType="application/octet-stream"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'
    Add-VsixEntry 'extension.vsixmanifest' @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011"><Metadata><Identity Language="en-US" Id="sdlc-chat" Version="$($package.version)" Publisher="ai-local"/><DisplayName>SDLC Local - Agentes</DisplayName><Description xml:space="preserve">Entrevista com modelos locais e historico governado.</Description><Tags>local,sdlc,chat</Tags><Categories>Other</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.100.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/></Assets></PackageManifest>
"@
} finally { $archive.Dispose() }
Get-FileHash -LiteralPath $archivePath -Algorithm SHA256 | Format-List
if ($Install) {
    $codeCommand = Get-Command code.cmd -ErrorAction Stop
    & $codeCommand.Source --install-extension $archivePath --force | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'VS Code extension installation failed.' }
    Write-Host 'Extensao instalada. Abra SDLC: Conversar com os agentes; recarregue a janela se necessario.'
}
