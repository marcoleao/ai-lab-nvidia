# Windows PowerShell 5.1+; no modules, Python or Docker required on Windows.
[CmdletBinding()]
param(
    [Parameter(Position=0)] [string]$Command = 'up',
    [Parameter(ValueFromRemainingArguments=$true)] [string[]]$Options = @()
)
. "$PSScriptRoot/../scripts/windows/Require-Administrator.ps1"
Assert-BootstrapAdministrator
. "$PSScriptRoot/scripts/windows/helpers.ps1"
. "$PSScriptRoot/scripts/windows/nvidia-driver.ps1"
. "$PSScriptRoot/scripts/windows/doctor.ps1"
. "$PSScriptRoot/scripts/windows/create-wsl.ps1"
. "$PSScriptRoot/scripts/windows/destroy-wsl.ps1"
$lock = $null
$exitCode = 0
try {
    if ($Command -notin 'prepare','up','down','restart','status','doctor','logs','models','shell','dev','jupyter','reset','rebuild','update','destroy','nuke','test') { throw "Unknown command: $Command" }
    $script:Config = Read-LabConfig
    $targetRecord = Join-Path $script:Repo '.state/target.json'
    if (Test-Path -LiteralPath $targetRecord) {
        $previous = Get-Content -LiteralPath $targetRecord -Raw | ConvertFrom-Json
        if ($previous.name -ne $script:Config.distro_name -or $previous.directory -ne $script:Config.distro_directory) { throw 'Target changed while lab state exists. Restore original config, back up and nuke before changing distro name/path.' }
    }
    $yes = '--yes' -in $Options
    $ephemeral = '--ephemeral' -in $Options
    if ($ephemeral) { throw 'Ephemeral caches cannot support offline restarts. Use persistent local volumes.' }
    if ($Command -in 'rebuild','update') { throw 'Use bootstrap prepare for explicit online preparation, then bootstrap up offline.' }
    $follow = '-f' -in $Options
    $rest = @($Options | Where-Object { $_ -notin '--yes','--ephemeral','-f' })
    if (($yes -and $Command -notin 'nuke','reset','destroy') -or ($ephemeral -and $Command -ne 'up') -or ($follow -and $Command -ne 'logs')) { throw 'Option is not valid for this command.' }
    $profiles = @($script:Config.profiles)
    if ($Command -in 'up','prepare' -and $rest.Count) {
        if ($rest.Count -ne 1) { throw 'Usage: ai up [core|rag|dev|all] [--ephemeral]' }
        switch ($rest[0]) {
            'all' { $profiles = @('core','rag','dev') }
            'core' { $profiles = @('core') }
            'rag' { $profiles = @('core','rag') }
            'dev' { $profiles = @('core','dev') }
            default { throw 'Profiles agents and observability are reserved; choose core, rag, dev or all.' }
        }
    } elseif ($Command -ne 'logs' -and $rest.Count) { throw 'Unexpected command arguments.' }
    if ($Command -eq 'logs' -and ($rest.Count -gt 1 -or ($rest.Count -eq 1 -and $rest[0] -notin 'ollama','open-webui','qdrant','ai-dev','jupyter'))) { throw 'Invalid log service.' }
    foreach ($directory in '.state','.logs') {
        $target = Join-Path $script:Repo $directory
        if (Test-Path $target) {
            if ((Get-Item $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Generated directory cannot be a junction.' }
        } else { New-Item -ItemType Directory $target | Out-Null }
    }
    $lock = [IO.File]::Open((Join-Path $script:Repo '.state/operation.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $script:LogFile = Join-Path $script:Repo ('.logs/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.log')
    if ($Command -eq 'nuke') { Set-Step 'Remove owned laboratory'; Remove-Lab $yes }
    elseif ($Command -eq 'prepare') {
        Test-LabHost -Provision
        Ensure-LabDistro
        Configure-LabLinux
        Set-Step 'Sync declarative source and generated runtime configuration'
        Sync-Lab $profiles $ephemeral
        Set-Step 'Prepare local images, model caches and offline manifest'
        Invoke-Linux @('bash','/opt/ai-local-lab/scripts/linux/lab.sh','prepare')
        Show-Endpoints
    } else {
        if ($Command -eq 'doctor') { Test-LabHost }
        if ($script:Config.distro_name -notin (Get-Distros)) { throw 'Dedicated distro not found. Run .\bootstrap.ps1 prepare all first.' }
        Assert-DistroOwner
        if ($Command -eq 'shell') { Invoke-Linux @('bash','-l') }
        else {
            if ($Command -in 'reset','destroy' -and -not $yes) {
                if ((Read-Host "This deletes application data ($Command). Type DELETE") -cne 'DELETE') { throw 'Cancelled.' }
            }
            if ($Command -eq 'up') { Sync-Lab $profiles $ephemeral }
            if ($Command -eq 'reset') {
                # Keep runtime profile/ephemeral selection across lifecycle commands.
                $runtime = & wsl.exe -d $script:Config.distro_name -u lab -- cat /opt/ai-local-lab/.runtime.env
                if ($LASTEXITCODE -ne 0) { throw 'Runtime configuration missing; run up.' }
                foreach ($line in $runtime) {
                    if ($line -match '^LAB_PROFILES=(.*)$') { $profiles = @($Matches[1].Split(',')) }
                    if ($line -match '^EPHEMERAL=(true|false)$') { $ephemeral = $Matches[1] -eq 'true' }
                }
                Sync-Lab $profiles $ephemeral
            }
            $linuxArgs = @('bash','/opt/ai-local-lab/scripts/linux/lab.sh',$Command)
            if ($Command -eq 'logs') { if ($follow) { $linuxArgs += '-f' }; $linuxArgs += $rest }
            Set-Step "Run $Command"
            Invoke-Linux $linuxArgs
            if ($Command -in 'up','restart','reset','rebuild','update','jupyter') { Show-Endpoints }
        }
    }
} catch {
    Write-Lab ERROR "FAILED STEP: $script:Step"
    Write-Lab ERROR $_.Exception.Message
    Write-Lab INFO 'CURRENT STATE: completed steps retained; no automatic destructive rollback.'
    Write-Lab INFO 'HOW TO RETRY: fix the reported prerequisite, rerun .\bootstrap.ps1; use doctor for diagnosis.'
    $exitCode = 1
} finally {
    if ($lock) { $lock.Dispose() }
    if ($Command -eq 'nuke' -and $exitCode -eq 0) {
        $statePath = Join-Path $script:Repo '.state'
        if ((Test-Path $statePath) -and -not ((Get-Item $statePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            Assert-NoReparseTree $statePath
            Remove-Item -LiteralPath $statePath -Recurse -Force
        }
    }
}
exit $exitCode
