# Offline verification of the CI-produced setup bundle. No network or host effect.
function Read-PlatformDistributionJson([string]$Path) {
    $null = Assert-PlatformPlainPath $Path
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -gt 1MB) { throw 'PLATFORM_DISTRIBUTION_METADATA_REQUIRED' }
    try { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'PLATFORM_DISTRIBUTION_METADATA_INVALID' }
}

function Get-PlatformDistributionSources {
    @('install.ps1','platform.ps1','operations/audit/WindowsRecorder.psm1') + @(
        'windows.psm1','core.ps1','distribution.ps1','windows-gpu.ps1','prerequisites.ps1',
        'core-release.sh','installed-platform.sh','linux-host.sh','wsl-config.awk','actions.psd1'
    ) | ForEach-Object { if($_ -like 'operations/*' -or $_ -in @('install.ps1','platform.ps1')){$_}else{'operations/bootstrap/'+$_} }
}

function Test-PlatformDistributionExitCode($Value) {
    return (($Value -is [int] -or $Value -is [long]) -and $Value -eq 0)
}

function Read-PlatformBundledPackage([string]$Root) {
    $rootPath = Assert-PlatformPlainPath $Root
    $manifest = Read-PlatformDistributionJson (Join-Path $rootPath 'precision-lock.json')
    if ($manifest.schema_version -ne 1 -or $manifest.product -cne 'ai-platform' -or $manifest.profile -cne 'precision-windows' -or
        $manifest.target -cne 'linux-amd64' -or $manifest.commit -cnotmatch '^[a-f0-9]{40}$' -or
        $manifest.release_tag -cne ('precision-'+$manifest.commit) -or $manifest.ci_run_id -cnotmatch '^[0-9]+$' -or
        $manifest.source_sha256 -cnotmatch '^[a-f0-9]{64}$' -or $manifest.installation_ready -isnot [bool] -or $manifest.installation_ready -or
        $manifest.qualification -cne 'FOUNDATION_CORE_NOT_COMPLETE_PLATFORM_OR_HARDWARE') { throw 'PLATFORM_DISTRIBUTION_MANIFEST_INVALID' }
    $expectedSources = @(Get-PlatformDistributionSources)
    $actualSources = @($manifest.bootstrap_sha256.PSObject.Properties.Name)
    if ($actualSources.Count -ne $expectedSources.Count -or @($actualSources | Where-Object {$_ -cnotin $expectedSources}).Count -ne 0) { throw 'PLATFORM_DISTRIBUTION_BOOTSTRAP_SET_INVALID' }
    foreach ($name in $expectedSources) {
        $path = Assert-PlatformPlainPath (Join-Path $rootPath $name)
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -gt 1MB) { throw 'PLATFORM_DISTRIBUTION_BOOTSTRAP_MISMATCH' }
        $text = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($path)).Replace("`r`n","`n")
        if ((Get-PlatformSha256 $text) -cne $manifest.bootstrap_sha256.$name) { throw 'PLATFORM_DISTRIBUTION_BOOTSTRAP_MISMATCH' }
    }
    $requirements = @{
        'native-linux-amd64.json'=@{Mode='unit';Target='linux-amd64';Qualification='NATIVE_UNIT_PASSED';Checks=@('native-go-tests','native-installed-release','validation-contracts','distribution-contracts')}
        'windows-bootstrap.json'=@{Mode='windows';Target='windows-amd64';Qualification='WINDOWS_BOOTSTRAP_PASSED';Checks=@('platform-installer.tests.ps1','platform-windows-gpu.tests.ps1','validation-contracts','distribution-contracts')}
        'docker-linux-amd64.json'=@{Mode='integration';Target='linux-amd64';Qualification='DISPOSABLE_DOCKER_PASSED';Checks=@('TestNetworkWithRealDocker','TestAccessWithRealDocker','TestGitlabWithRealDocker')}
    }
    if (@($manifest.required_reports).Count -ne 3 -or @($manifest.required_reports | Where-Object {$_ -cnotin $requirements.Keys}).Count -gt 0 -or @($manifest.required_reports|Sort-Object -Unique).Count -ne 3) { throw 'PLATFORM_DISTRIBUTION_REPORT_SET_INVALID' }
    foreach ($asset in @(@{Key='cli';Name='platform-linux-amd64.tar.gz';Limit=128MB},@{Key='validation';Name='validation.json';Limit=1MB})) {
        $info = $manifest.assets.($asset.Key)
        if ($info.name -cne $asset.Name -or $info.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $info.size -le 0 -or $info.size -gt $asset.Limit) { throw 'PLATFORM_DISTRIBUTION_ASSET_INVALID' }
        $path = Assert-PlatformPlainPath (Join-Path $rootPath ('packages/'+$asset.Name))
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -ne $info.size -or
            (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $info.sha256) { throw 'PLATFORM_DISTRIBUTION_ASSET_HASH_MISMATCH' }
    }
    $receipt = Read-PlatformDistributionJson (Join-Path $rootPath 'packages/validation.json')
    if ($receipt.schema_version -ne 1 -or $receipt.commit -cne $manifest.commit -or $receipt.ci_run_id -cne $manifest.ci_run_id -or
        $receipt.source_sha256 -cne $manifest.source_sha256 -or $receipt.profile -cne 'precision-windows' -or
        $receipt.outcome -cne 'SUCCEEDED' -or $receipt.phase -cne 'COMPLETED' -or $receipt.installation_ready -isnot [bool] -or $receipt.installation_ready -or
        @($receipt.evidence_sha256.PSObject.Properties).Count -ne 3) { throw 'PLATFORM_DISTRIBUTION_VALIDATION_MISMATCH' }
    foreach ($name in $requirements.Keys) {
        $path = Assert-PlatformPlainPath (Join-Path $rootPath ('packages/evidence/'+$name))
        $report = Read-PlatformDistributionJson $path
        if ($report.schema_version -ne 1 -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $receipt.evidence_sha256.$name -or
            $report.commit -cne $manifest.commit -or $report.ci_run_id -cne $manifest.ci_run_id -or
            $report.source_sha256 -cne $manifest.source_sha256 -or $report.comparison.before -cne $manifest.source_sha256 -or $report.comparison.after -cne $manifest.source_sha256 -or
            $report.mode -cne $requirements[$name].Mode -or $report.target -cne $requirements[$name].Target -or
            $report.qualification -cne $requirements[$name].Qualification -or $report.outcome -cne 'SUCCEEDED' -or
            $report.phase -cne 'COMPLETED' -or -not (Test-PlatformDistributionExitCode $report.exit_code)) { throw 'PLATFORM_DISTRIBUTION_REPORT_BINDING_INVALID' }
        $checks = @($report.checks)
        if ($checks.Count -eq 0 -or @($checks.check|Sort-Object -Unique).Count -ne $checks.Count) { throw 'PLATFORM_DISTRIBUTION_REPORT_CHECKS_INVALID' }
        foreach ($required in $requirements[$name].Checks) { if($required -cnotin $checks.check){throw 'PLATFORM_DISTRIBUTION_REPORT_CHECKS_INVALID'} }
        foreach ($check in $checks) {
            if ($check.outcome -cne 'SUCCEEDED' -or -not (Test-PlatformDistributionExitCode $check.exit_code)) { throw 'PLATFORM_DISTRIBUTION_REPORT_CHECKS_INVALID' }
            if ($check.check -cin @('native-go-tests','TestNetworkWithRealDocker','TestAccessWithRealDocker','TestGitlabWithRealDocker') -and
                (($check.tests_passed -isnot [int] -and $check.tests_passed -isnot [long]) -or $check.tests_passed -lt 1)) { throw 'PLATFORM_DISTRIBUTION_TEST_EXECUTION_UNCONFIRMED' }
        }
    }
    return [pscustomobject]@{Path=(Join-Path $rootPath 'packages/platform-linux-amd64.tar.gz');Sha256=$manifest.assets.cli.sha256;Source='validated_precision_bundle';ReleaseTag=$manifest.release_tag;Commit=$manifest.commit;SourceSha256=$manifest.source_sha256;CiRunId=$manifest.ci_run_id}
}
