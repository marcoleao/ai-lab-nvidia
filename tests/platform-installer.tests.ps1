# All provider calls are replaced in module scope. Only disposable files are changed.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
Import-Module (Join-Path $repository 'operations/bootstrap/windows.psm1') -Force -DisableNameChecking
$temporaryParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
$fixture = Join-Path $temporaryParent ('ai-platform-installer-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixture
try {
    & (Get-Module windows) {
        param($Repository, $Fixture)
        function Check($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
        function Reject([scriptblock]$Operation, [string]$Code) {
            try { $null = & $Operation } catch { if ($_.Exception.Message -eq $Code) { return }; throw }
            throw "Expected rejection: $Code"
        }
        $script:testRoot = $Fixture
        $script:cases = 0
        $script:rootfsBytes = [Text.Encoding]::UTF8.GetBytes('isolated-rootfs-fixture')
        $script:rootfsHash = Get-PlatformSha256 'isolated-rootfs-fixture'
        $script:configurationDigest = 'f' * 64
        function script:New-Fixture {
            $script:cases++
            $script:caseRoot = Join-Path $script:testRoot ([string]$script:cases)
            $null = New-Item -ItemType Directory -Path $script:caseRoot
            $script:configPath = Join-Path $script:caseRoot 'platform.json'
            $script:profilePath = Join-Path $script:caseRoot 'windows.psd1'
            [IO.File]::WriteAllText($script:configPath, '{"schema_version":1,"installation_id":"test-platform","default_profile":"precision-windows"}')
            $storage = (Join-Path $script:caseRoot 'data').Replace("'", "''")
            $control = (Join-Path $script:caseRoot 'control').Replace("'", "''")
            $profile = "@{SchemaVersion=1; DistroName='test-platform'; StorageRoot='$storage'; ControlRoot='$control'; LinuxUser='aiplatform'; MinimumFreeDiskGiB=10; MinimumWslVersion='0.67.6'; RootfsUri='https://example.test/rootfs'; RootfsSha256='$script:rootfsHash'}"
            [IO.File]::WriteAllText($script:profilePath, $profile)
            $script:context = Read-PlatformWindowsContext $script:configPath $script:profilePath
            $script:registration = $null
            $script:linuxOwner = $null
            $script:linuxConfigured = $false
            $script:restarted = $false
            $script:admin = $true
            $script:wslReady = $true
            $script:wslModern = $true
            $script:boot = 'boot-1'
            $script:downloadCalls = 0
            $script:badDownload = $false
            $script:importResponseLost = $false
            $script:failConfiguration = $false
            $script:failCompletionAudit = $false
            $script:installExitCode = 3010
            $script:allCalls = [Collections.Generic.List[string]]::new()
            $script:activeCli='ABSENT'; $script:candidates=@{}; $script:cliActivations=0; $script:cliRestores=0
            $script:failPrepare=$false; $script:failActivation=$false; $script:lostActivationReply=$false; $script:failVerify=$false; $script:failRestore=$false; $script:failCoreRequest=$false
            $script:packagePath=Join-Path $script:caseRoot 'cli.tar.gz'
            [IO.File]::WriteAllText($script:packagePath,'mock-provider-package')
            $script:packageHash=(Get-FileHash -LiteralPath $script:packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
            $script:driverMissing=$false;$script:driverReboot=$false;$script:driverCalls=0
            $script:nativeOriginCalls=0;$script:nativeLegacyOrigin=$false;$script:nativeOriginString=$false;$script:nativeOriginPublic=$false;$script:nativeOriginFailed=$false;$script:nativeOriginBadCertificate=$false
            $script:nativeIngressMode='ok';$script:nativeIngressCalls=0
            $script:nativeHubMode='ok';$script:nativeHubCalls=0;$script:nativeObservabilityMode='ok';$script:nativeObservabilityCalls=0
            $script:dailyCalls=0;$script:dailyRunning=$true;$script:dailyBadReceipt=$false;$script:dailyFailAudit=$false;$script:dailyPrivateFailure=$false
            $script:dailyDualPending=$false
            $script:dailySignalEvidence=$false
            $script:nativeHostCalls=0;$script:nativeRuntimeCalls=0;$script:nativeHostWait=0;$script:nativeRuntimeFailed=$false;$script:nativeBadCorrelation=$false
            $script:nativeBadPlan=$false;$script:nativeStringReadiness=$false
            $script:nativeNetworkCalls=0;$script:nativeNetworkFailed=$false;$script:nativeLegacyNetwork=$false;$script:nativeNetworkString=$false
            $script:nativeAccessCalls=0;$script:nativeAccessFailed=$false;$script:nativeLegacyAccess=$false;$script:nativeAccessString=$false;$script:nativeAccessQualified=$false;$script:loopbackUnavailable=$false;$script:loopbackCalls=0
        }
        function script:Get-PlatformHostObservation($Context) {
            $Context.Actor='S-1-5-21-1000'
            return [pscustomobject]@{Administrator=$script:admin; BootId=$script:boot; WslReady=$script:wslReady; WslModern=$script:wslModern}
        }
        function script:Get-PlatformRegistration([string]$Name) { return $script:registration }
        function script:Get-PlatformActorSid { return 'S-1-5-21-1000' }
        function script:Read-PlatformLoopbackJson([string]$Uri){$script:loopbackCalls++;if($script:loopbackUnavailable){throw 'PLATFORM_WINDOWS_ACCESS_UNCONFIRMED'};Check ($Uri -like 'http://127.0.0.1:*') 'Host probe escaped loopback';if($Uri -like '*openid-configuration'){return [pscustomobject]@{issuer='http://auth.localhost:8082/realms/platform'}};return [pscustomobject]@{initialized=$true;sealed=$false}}
        function script:Get-PlatformNvidiaState { [object[]]$missing=@();if($script:driverMissing){$missing=@('fixture-device')};[pscustomobject]@{Missing=$missing;Digest=(Get-PlatformSha256 ([string]$script:driverMissing))} }
        function script:Ensure-PlatformNvidiaDriver($State){$script:driverCalls++;if($script:driverReboot){return $true};$script:driverMissing=$false;return $false}
        function script:Read-PlatformWindowsGpuVersion {return Get-PlatformSha256 'fixture-driver-version'}
        function script:Set-PlatformPrivateDirectory([string]$Path, [string]$Actor) {
            Check ($Path.StartsWith($script:caseRoot + '\', [StringComparison]::OrdinalIgnoreCase)) 'Mutation escaped fixture'
            $null = New-Item -ItemType Directory -Path $Path -Force
        }
        function script:Receive-PlatformRootfs([string]$Uri, [string]$Destination) {
            $script:downloadCalls++
            Check ($Destination.StartsWith($script:context.ControlRoot + '\')) 'Download escaped fixture'
            if ($script:badDownload) { [IO.File]::WriteAllText($Destination, 'invalid fixture') }
            else { [IO.File]::WriteAllBytes($Destination, $script:rootfsBytes) }
        }
        function script:Invoke-PlatformWsl([string[]]$Arguments) {
            $script:allCalls.Add(($Arguments -join '|'))
            switch ($Arguments[0]) {
                '--list' {
                    Check (($Arguments -join '|') -ceq '--list|--running|--quiet') 'Unexpected WSL observation'
                    return [pscustomobject]@{ExitCode=0;Output=$(if($script:dailyRunning){"test-platform`nother-distro"}else{'other-distro'})}
                }
                '--install' { return [pscustomobject]@{ExitCode=$script:installExitCode; Output='password=must-never-appear-in-audit'} }
                '--update' { $script:wslModern=$true; return [pscustomobject]@{ExitCode=0; Output='updated'} }
                '--import' {
                    Check ($Arguments[1] -eq 'test-platform' -and $Arguments[-2] -eq '--version' -and $Arguments[-1] -eq '2') 'Wrong import target/version'
                    $script:registration=[pscustomobject]@{Name='test-platform'; BasePath=(Join-Path $script:context.StorageRoot 'distro'); Version=2}
                    if ($script:importResponseLost) { throw 'PLATFORM_TEST_IMPORT_RESPONSE_LOST' }
                    return [pscustomobject]@{ExitCode=0; Output='imported'}
                }
                '--terminate' {
                    Check ($Arguments.Count -eq 2 -and $Arguments[1] -eq 'test-platform') 'Global or foreign restart'
                    $script:restarted=$true
                    return [pscustomobject]@{ExitCode=0; Output=''}
                }
                '--distribution' {
                    if($Arguments.Count -ge 8 -and $Arguments[6] -eq '/opt/ai-platform/core/platform.sh' -and $Arguments[7] -in @('status','doctor','start','stop','restart','logs')){
                        $script:dailyCalls++
                        Check ($Arguments[3] -ceq 'root' -and $Arguments[-4] -ceq '--operation-id' -and $Arguments[-2] -ceq '--format' -and $Arguments[-1] -ceq 'json') 'Maintenance lost privilege/correlation/JSON binding'
                        $operation=$Arguments[-3];if($script:dailyBadReceipt){$operation='wrong'}
                        if($script:dailyPrivateFailure){return [pscustomobject]@{ExitCode=1;Output='private-provider-diagnostic'}}
                        $component=Get-PlatformOperationComponent $Arguments
                        $value=@{schema_version=1;command=$Arguments[7];scope_component=$component;installation_id='test-platform';profile='precision-windows';operation_id=$operation;exit_code=0;installation_ready=$false;outcome='SUCCEEDED';phase='COMPLETED';reason_code='PLATFORM_PROCESSES_OBSERVED';maintenance_id=('a'*32);unexpected_provider_detail='private-unknown-field';runtime=@{mode='owned';controller='systemd';state='RUNNING';owned=$true;api_ready=$true;unexpected_detail='private-runtime-field'}}
                        if($component -ceq 'homepage'){$value.hub=@{state='READY';prepared=$true;api_ready=$true;endpoint='http://home.localhost:3300';coverage='LOCAL_LINKS_ONLY';private_detail='private-hub-detail';service=@{component='homepage';state='RUNNING';owned=$true;running=$true;private_detail='private-hub-detail'}}}
                        if($script:dailyDualPending){
                            $value.pending_maintenance=@{schema_version=1;component='edge';maintenance_id=('d'*32);command='restart';mode='APPLYING';targets=@(@{component='edge';container_id=('f'*64);stage='START_REQUESTED';private_detail='private-runtime-journal-data'})}
                            $value.pending_runtime_maintenance=@{schema_version=1;component='container-runtime';maintenance_id=('e'*32);command='start';mode='COMPENSATING';private_detail='private-runtime-journal-data';targets=@(@{component='container-runtime';container_id=('b'*64);stage='START_REQUESTED';private_detail='private-runtime-journal-data'})}
                        }
                        if($script:dailySignalEvidence){
                            $value.exit_code=2
                            $value.observability=@{state='CORE_READY';prepared=$true;api_ready=$true;signals_ready=$false;private_detail='private-signal-detail';services=@();signals=@(
                                @{signal='http-identity';component='identity';state='STALE';reason_code='PLATFORM_OBSERVABILITY_SAMPLE_STALE';healthy=$null;private_labels=@{prompt='private-signal-detail'}},
                                @{signal='identity-jvm';component='identity';state='OBSERVED';reason_code='PLATFORM_OBSERVABILITY_JVM_HEAP_OBSERVED_NO_HEALTH_THRESHOLD';healthy=$null;sampled_at='2026-11-09T12:00:00Z';age_seconds=10;private_detail='private-signal-detail'})}
                            return [pscustomobject]@{ExitCode=2;Output=($value|ConvertTo-Json -Depth 12 -Compress)}
                        }
                        return [pscustomobject]@{ExitCode=0;Output=($value|ConvertTo-Json -Depth 12 -Compress)}
                    }
                    if($Arguments.Count -ge 8 -and $Arguments[6] -eq '/opt/ai-platform/core/platform.sh' -and $Arguments[7] -eq 'setup'){
                        $phase=$Arguments[[Array]::IndexOf($Arguments,'--phase')+1];$action=$Arguments[[Array]::IndexOf($Arguments,'--action')+1];$operation=$Arguments[[Array]::IndexOf($Arguments,'--operation-id')+1]
                        $outcome='SUCCEEDED';$stage='COMPLETED';$exit=0;$reason='VERIFIED'
                        if($script:nativeBadCorrelation){$operation='wrong'}
                        if($action -eq 'plan' -and $script:nativeBadPlan){$outcome='REJECTED';$exit=1;$reason='PLATFORM_SETUP_REJECTED'}
                        if($action -eq 'install'){
                            if($phase -eq 'host'){$script:nativeHostCalls++;if($script:nativeHostWait -gt 0){$script:nativeHostWait--;$outcome='DEFERRED';$stage='WAITING';$exit=42;$reason='REBOOT_REQUIRED'}}
                            if($phase -eq 'runtime'){$script:nativeRuntimeCalls++;if($script:nativeRuntimeFailed){$outcome='FAILED';$exit=1;$reason='PLATFORM_COMMAND_FAILED'}}
                            if($phase -eq 'network'){$script:nativeNetworkCalls++;if($script:nativeNetworkFailed){$outcome='FAILED';$exit=1;$reason='PLATFORM_NETWORK_ISOLATION_FAILED'}}
                            if($phase -eq 'access'){$script:nativeAccessCalls++;if($script:nativeAccessFailed){$outcome='FAILED';$exit=1;$reason='PLATFORM_ACCESS_STARTUP_FAILED'}}
                            if($phase -eq 'origin'){$script:nativeOriginCalls++;if($script:nativeOriginFailed){$outcome='FAILED';$exit=1;$reason='PLATFORM_ORIGIN_ROUTE_OR_TLS_UNCONFIRMED'}}
                            if($phase -eq 'ingress'){$script:nativeIngressCalls++;if($script:nativeIngressMode -eq 'missing'){$outcome='DEFERRED';$stage='WAITING';$exit=42;$reason='PLATFORM_INGRESS_PUBLIC_SETTINGS_REQUIRED'};if($script:nativeIngressMode -eq 'failed'){$outcome='FAILED';$exit=1;$reason='PLATFORM_INGRESS_ORIGIN_REVISION_UPGRADE_REQUIRED'}}
                            if($phase -eq 'hub'){$script:nativeHubCalls++;if($script:nativeHubMode -eq 'failed'){$outcome='FAILED';$exit=1;$reason='PLATFORM_HUB_STARTUP_FAILED'}}
                            if($phase -eq 'observability'){$script:nativeObservabilityCalls++;if($script:nativeObservabilityMode -eq 'failed'){$outcome='FAILED';$exit=1;$reason='PLATFORM_OBSERVABILITY_STARTUP_FAILED'}}
                        }
                        $body=@{schema_version=1;planned=($action -eq 'plan');gpu_container_qualified=$false;installation_ready=$false;installation_id='test-platform';profile='precision-windows';operation_id=$operation;outcome=$outcome;phase=$stage;exit_code=$exit;reason_code=$reason;
                            host_prerequisites_ready=($action -eq 'install' -and $phase -eq 'host' -and $exit -eq 0);container_runtime_ready=($action -eq 'install' -and $phase -eq 'runtime' -and $exit -eq 0);runtime_mode='owned';runtime_endpoint='unix:///run/fixture/docker.sock';steps=@(@{action='FIXTURE_NATIVE_STEP';outcome=$outcome;phase=$stage})}
                        if($action -eq 'install' -and $script:nativeStringReadiness){$body.host_prerequisites_ready='false'}
                        $body.network_layer_ready=($action -eq 'install' -and $phase -eq 'network' -and $exit -eq 0)
                        $body.networks=@('edge','services','data','executors'|ForEach-Object {@{role=$_;name=('fixture-'+$_);internal=$true;default_host_binding='127.0.0.1'}})
                        if($script:nativeLegacyNetwork){$body.Remove('network_layer_ready')}
                        if($phase -eq 'network' -and $action -eq 'install' -and $script:nativeNetworkString){$body.network_layer_ready='false'}
                        foreach($name in @('access_layer_ready','identity_ready','secret_store_ready','edge_ready')){$body[$name]=($phase -eq 'access' -and $action -eq 'install' -and $exit -eq 0)}
                        $body.sso_flow_qualified=$script:nativeAccessQualified;$body.external_publication_ready=$false
                        $body.access_endpoints=@{identity='http://auth.localhost:8082';secret_store='http://vault.localhost:8200'}
                        if($script:nativeLegacyAccess){$body.Remove('access_layer_ready')}
                        if($phase -eq 'access' -and $action -eq 'install' -and $script:nativeAccessString){$body.access_layer_ready='true'}
                        $body.origin_tls_ready=($phase -eq 'origin' -and $action -eq 'install' -and $exit -eq 0);$body.origin_endpoint='https://gateway.localhost:9443'
                        if($phase -eq 'origin' -and $script:nativeLegacyOrigin){$body.Remove('origin_tls_ready')}
                        if($phase -eq 'origin' -and $action -eq 'install' -and $script:nativeOriginString){$body.origin_tls_ready='true'}
                        if($phase -eq 'origin' -and $script:nativeOriginPublic){$body.external_publication_ready=$true}
                        if($phase -eq 'origin' -and $action -eq 'install'){$body.origin_certificate_not_after='2027-02-01T12:00:00Z';$body.origin_certificate_sha256='a'*64;if($script:nativeOriginBadCertificate){$body.origin_certificate_not_after='PRIVATE_FIXTURE_CERTIFICATE_CONTENT'}}
                        if($phase -eq 'ingress'){
                            $body.ingress_artifacts_prepared=($action -eq 'install' -and $exit -eq 0)
                            if($script:nativeIngressMode -eq 'legacy'){$body.Remove('ingress_artifacts_prepared')}
                            if($script:nativeIngressMode -eq 'public'){$body.external_publication_ready=$true}
                            if($action -eq 'install'){$body.ingress_bundle_id='b'*64;$body.ingress_bundle_revision='edge-one';$body.ingress_adapters=@{direct='CONFIGURATION_PREPARED_ACME_AND_INGRESS_PENDING';tunnel='PENDING_TUNNEL_ID'};if($script:nativeIngressMode -eq 'metadata'){$body.ingress_bundle_id='PRIVATE_FIXTURE_BUNDLE_CONTENT'};if($script:nativeIngressMode -eq 'string'){$body.ingress_artifacts_prepared='true'}}
                        }
                        if($phase -eq 'observability'){
                            $body.observability_core_ready=($action -eq 'install' -and $exit -eq 0);$body.grafana_endpoint='http://grafana.localhost:3001';$body.dashboard_uid='platform-foundation'
                            if($script:nativeObservabilityMode -eq 'legacy'){$body.Remove('observability_core_ready')}
                            if($script:nativeObservabilityMode -eq 'public'){$body.external_publication_ready=$true}
                            if($action -eq 'install' -and $script:nativeObservabilityMode -eq 'string'){$body.observability_core_ready='true'}
                            if($action -eq 'install' -and $script:nativeObservabilityMode -eq 'metadata'){$body.grafana_endpoint='http://private-user:private-password@other.invalid:3001'}
                        }
                        if($phase -eq 'hub'){
                            $body.hub_ready=($action -eq 'install' -and $exit -eq 0);$body.hub_endpoint='http://home.localhost:3300'
                            if($script:nativeHubMode -eq 'legacy'){$body.Remove('hub_ready')}
                            if($script:nativeHubMode -eq 'public'){$body.external_publication_ready=$true}
                            if($action -eq 'install' -and $script:nativeHubMode -eq 'string'){$body.hub_ready='true'}
                            if($action -eq 'install' -and $script:nativeHubMode -eq 'metadata'){$body.hub_endpoint='http://private-user:private-password@other.invalid:3000'}
                        }
                        return [pscustomobject]@{ExitCode=$exit;Output=($body|ConvertTo-Json -Depth 6 -Compress)}
                    }
                    if ($Arguments[3] -eq 'aiplatform') {
                        Check ($Arguments.Count -in @(8,10)) 'Query appended an unintended null argument'
                        Check ($Arguments[6] -eq '/opt/ai-platform/core/platform.sh' -and $Arguments[7] -in @('inventory','publication')) 'Query changed user, target or command'
                        if ($Arguments[7] -eq 'publication') {
                            Check ($Arguments[8] -ceq '--previous-config' -and $Arguments[9] -ceq '/mnt/c/previous configuration.json') 'Publication query changed previous-config argument boundaries'
                        }
                        return [pscustomobject]@{ExitCode=7;Output='read-only query fixture'}
                    }
                    Check ($Arguments.Count -eq 10 -and $Arguments[1] -eq 'test-platform' -and $Arguments[3] -eq 'root' -and $Arguments[5] -eq '/bin/sh') 'Unexpected Linux call'
                    $operation=$Arguments[7]; $owner=$Arguments[8]
                    switch ($operation) {
                        probe {
                            $code=0
                            if ($null -eq $script:linuxOwner) { $code=3 }
                            elseif ($script:linuxOwner -cne $owner) { $code=4 }
                            return [pscustomobject]@{ExitCode=$code; Output=''}
                        }
                        claim {
                            Check ($null -eq $script:linuxOwner -or $script:linuxOwner -ceq $owner) 'Foreign owner overwritten'
                            $script:linuxOwner=$owner
                            return [pscustomobject]@{ExitCode=0; Output=''}
                        }
                        configure {
                            $script:linuxConfigured=$true
                            if ($script:failConfiguration) { return [pscustomobject]@{ExitCode=5; Output='secret diagnostic'} }
                            return [pscustomobject]@{ExitCode=42; Output=''}
                        }
                        verify {
                            if ($script:linuxConfigured -and $script:restarted) { return [pscustomobject]@{ExitCode=0; Output="READY:$script:configurationDigest"} }
                            return [pscustomobject]@{ExitCode=42; Output=''}
                        }
                        default { throw 'Unexpected Linux operation' }
                    }
                }
                default { throw 'Unexpected native operation' }
            }
        }
        function script:Write-PlatformAuditRecord {
            param($Context,$Action,$Outcome,$Phase,$Before,$After,$ReasonCode)
            if ($script:dailyFailAudit -and $Action -like 'PLATFORM_WINDOWS_*' -and $Outcome -eq 'ACCEPTED') { throw 'PLATFORM_TEST_AUDIT_UNAVAILABLE' }
            if ($script:failCoreRequest -and $Action -eq 'PLATFORM_CLI_ACTIVATED' -and $Outcome -eq 'ACCEPTED') { throw 'PLATFORM_TEST_AUDIT_UNAVAILABLE' }
            if ($script:failCompletionAudit -and $Action -eq 'PLATFORM_DISTRO_IMPORTED' -and $Outcome -eq 'SUCCEEDED') {
                $script:failCompletionAudit=$false
                throw 'PLATFORM_TEST_AUDIT_UNAVAILABLE'
            }
            WindowsRecorder\Write-PlatformAuditRecord $Context $Action $Outcome $Phase $Before $After $ReasonCode
        }
        function Run([string]$Action='Install') {
            Invoke-PlatformWindowsInstallation -Action $Action -Configuration $script:configPath -WindowsProfile $script:profilePath -HostOnly
        }
        function Run-Cli {
            Invoke-PlatformWindowsInstallation -Action Install -Configuration $script:configPath -WindowsProfile $script:profilePath -CliPackage $script:packagePath -CliPackageSha256 $script:packageHash -Through Base
        }
        function Run-Full([string]$Through='Runtime') {Invoke-PlatformWindowsInstallation -Action Install -Configuration $script:configPath -WindowsProfile $script:profilePath -CliPackage $script:packagePath -CliPackageSha256 $script:packageHash -Through $Through}
        function script:Test-PlatformAdministrator { return $script:admin }
        function Run-Daily([string]$Command,[string[]]$Arguments=@()) { Invoke-PlatformInstalledOperation -Command $Command -Configuration $script:configPath -WindowsProfile $script:profilePath -Arguments $Arguments }
        function script:Invoke-PlatformCoreRelease($Context, [string]$Action, [string[]]$ExtraArguments=@()) {
            $desired=Get-PlatformSha256 ("$($Context.CliPackage.Sha256):$($Context.ConfigurationDigest):$($Context.InstallationId):precision-windows")
            switch ($Action) {
                inspect { return [pscustomobject]@{ExitCode=0;Output=$script:activeCli} }
                candidate { return [pscustomobject]@{ExitCode=0;Output=$(if($script:candidates.ContainsKey($desired)){$desired}else{'ABSENT'})} }
                prepare {
                    if ($script:failPrepare) {return [pscustomobject]@{ExitCode=1;Output='private candidate failure'}}
                    $status=if($script:candidates.ContainsKey($desired)){'REUSED'}else{'CREATED'}
                    $script:candidates[$desired]=$true
                    return [pscustomobject]@{ExitCode=0;Output="${status}:$desired"}
                }
                activate {
                    $script:cliActivations++
                    Check ($ExtraArguments[1] -ceq $script:activeCli) 'Activation did not compare previous pointer'
                    if ($script:failActivation) {return [pscustomobject]@{ExitCode=1;Output='private activation failure'}}
                    $script:activeCli=$ExtraArguments[0]
                    return [pscustomobject]@{ExitCode=$(if($script:lostActivationReply){1}else{0});Output=$script:activeCli}
                }
                verify { return [pscustomobject]@{ExitCode=$(if($script:failVerify){1}else{0});Output=$script:activeCli} }
                restore {
                    $script:cliRestores++
                    Check ($ExtraArguments[1] -ceq $script:activeCli) 'Rollback overwrote an unobserved pointer'
                    if ($script:failRestore) {return [pscustomobject]@{ExitCode=1;Output='private rollback failure'}}
                    $script:activeCli=$ExtraArguments[0]
                    return [pscustomobject]@{ExitCode=0;Output=$script:activeCli}
                }
                default {throw 'Unexpected core release operation'}
            }
        }
        function Ledger {
            @(Get-Content -LiteralPath (Join-Path $script:context.ControlRoot 'admin.jsonl') -Encoding UTF8 | ForEach-Object { ($_ | ConvertFrom-Json).record | ConvertFrom-Json })
        }

        # Plan is read-only and never boots a distribution or creates control/cache.
        New-Fixture
        $result=Run Plan
        Check ($result.planned -and -not $result.installation_ready -and -not $result.linux_base_ready) 'Plan asserted installed state'
        Check (-not (Test-Path -LiteralPath $script:context.ControlRoot) -and $script:allCalls.Count -eq 0) 'Plan had effects'
        $script:admin=$false
        Reject { Run } 'PLATFORM_ADMINISTRATOR_REQUIRED'
        Check (-not (Test-Path -LiteralPath $script:context.ControlRoot)) 'Privilege rejection created state'

        # Reboot checkpoint: same invocation before/after reboot, no install loop.
        New-Fixture
        $script:wslReady=$false; $script:wslModern=$false
        $result=Run
        Check ($result.exit_code -eq 3010 -and $result.outcome -eq 'DEFERRED' -and $result.phase -eq 'WAITING') 'Reboot requirement lost'
        $result=Run
        Check (@($script:allCalls | Where-Object { $_ -like '--install*' }).Count -eq 1) 'Repeated WSL install before reboot'
        Check ($script:downloadCalls -eq 0) 'Downloaded/imported before required reboot'
        $script:boot='boot-2'; $script:wslReady=$true; $script:wslModern=$true
        $result=Run
        Check ($result.linux_base_ready -and -not $result.installation_ready) ('Host/full installation distinction lost: ' + ($result | ConvertTo-Json -Compress))
        $ledger=Ledger
        Check (@($ledger | Where-Object { $_.phase -eq 'WAITING' }).Count -eq 2) 'Deferred attempts disappeared'
        Check (($ledger | ConvertTo-Json -Depth 15) -notmatch 'password=|secret diagnostic|rootfsUri') 'Provider content leaked'

        # Fresh install and observed retry reuse the distro/cache without configuration effects.
        New-Fixture
        Check ((Run).linux_base_ready) 'Fresh install failed'
        $firstOperation=(Ledger)[0].operation_id
        Check ((Run).linux_base_ready) 'Retry failed'
        Check ($script:downloadCalls -eq 1) 'Verified cache downloaded again'
        Check (@($script:allCalls | Where-Object { $_ -like '--import*' }).Count -eq 1) 'Owned distro imported twice'
        Check (@($script:allCalls | Where-Object { $_ -like '*|configure|*' }).Count -eq 1) 'Configured host modified again'
        $ledger=Ledger
        Check ($ledger[-1].outcome -eq 'NO_CHANGE' -and $ledger[-1].comparison.before -eq $ledger[-1].comparison.after) 'Retry comparison is not observed'
        Check ($ledger[-1].operation_id -ne $firstOperation -and $ledger[-1].actor.assurance -eq 'OS_ACCOUNT_OBSERVED_HUMAN_NOT_VERIFIED') 'Correlation/authorship invalid'

        # Legacy WSL update is explicit and re-observed.
        New-Fixture
        $script:wslModern=$false
        Check ((Run).linux_base_ready) 'Legacy WSL update failed'
        Check (@($script:allCalls | Where-Object { $_ -like '--update*' }).Count -eq 1) 'WSL was not updated'

        New-Fixture
        $script:wslReady=$false; $script:installExitCode=5
        $result=Run
        Check ($result.outcome -eq 'UNKNOWN' -and $result.reason_code -eq 'PLATFORM_WSL_INSTALL_FAILED') 'WSL provider failure masked'
        Check ($script:downloadCalls -eq 0) 'Continued after failed WSL provisioning'

        # Matching name alone never grants ownership, and no foreign distro is started.
        New-Fixture
        $script:registration=[pscustomobject]@{Name='test-platform';BasePath='C:\foreign';Version=2}
        Reject { Run } 'PLATFORM_FOREIGN_DISTRO_OR_STORAGE'
        Check ($script:allCalls.Count -eq 0) 'Foreign distro was contacted'
        Check (-not (Test-Path -LiteralPath $script:context.ControlRoot)) 'Foreign resource was adopted'
        New-Fixture
        $null=New-Item -ItemType Directory -Path $script:context.StorageRoot
        Reject { Run } 'PLATFORM_FOREIGN_DISTRO_OR_STORAGE'

        # Checksum failure never imports, and a new explicit attempt can recover.
        New-Fixture
        $script:badDownload=$true
        $result=Run
        Check ($result.reason_code -eq 'PLATFORM_ROOTFS_HASH_MISMATCH' -and $result.outcome -eq 'UNKNOWN') 'Hash failure masked'
        Check (@($script:allCalls | Where-Object { $_ -like '--import*' }).Count -eq 0) 'Unverified rootfs imported'
        Check (@(Get-ChildItem -LiteralPath $script:context.ControlRoot -Filter '*.partial').Count -eq 0) 'Partial download not removed'
        $script:badDownload=$false
        Check ((Run).linux_base_ready) 'Retry after checksum failure failed'

        # Lost import response: inspect registration + audited intent + Linux marker,
        # finishing the claim without a second import or automatic destructive rollback.
        New-Fixture
        $script:importResponseLost=$true
        $result=Run
        Check ($result.outcome -eq 'UNKNOWN' -and $null -ne $script:registration -and $null -eq $script:linuxOwner) 'Lost response became success'
        $script:importResponseLost=$false
        Check ((Run).linux_base_ready) 'Import reconciliation failed'
        Check (@($script:allCalls | Where-Object { $_ -like '--import*' }).Count -eq 1) 'Lost response repeated import'

        # Missing/mismatched Linux marker after completed claim is never repaired silently.
        New-Fixture
        $null=Run
        $script:linuxOwner='0' * 32
        $result=Run
        Check ($result.reason_code -eq 'PLATFORM_LINUX_OWNERSHIP_CONFLICT') 'Foreign Linux marker was accepted'
        Check ($script:linuxOwner -ceq ('0' * 32)) 'Foreign marker overwritten'
        $script:linuxOwner=$null
        $result=Run
        Check ($result.reason_code -eq 'PLATFORM_LINUX_OWNERSHIP_CONFLICT') 'Completed claim was inferred from name/path'

        # Registry path drift is refused before starting the registered distribution.
        New-Fixture
        $null=Run
        $script:registration.BasePath='C:\foreign'
        $beforeCalls=$script:allCalls.Count
        $result=Run
        Check ($result.reason_code -eq 'PLATFORM_DISTRO_REGISTRATION_CONFLICT') 'Registry path drift accepted'
        Check ($script:allCalls.Count -eq $beforeCalls) 'Foreign registry target started'

        # Failed configuration retains resources and retries the existing distro.
        New-Fixture
        $script:failConfiguration=$true
        $result=Run
        Check ($result.outcome -eq 'UNKNOWN' -and -not $result.linux_base_ready) 'Partial Linux configuration became ready'
        $diagnostics=@(Get-ChildItem -LiteralPath $script:context.ControlRoot -Filter 'diagnostic-*.json')
        Check ($diagnostics.Count -eq 1 -and (Get-Content -LiteralPath $diagnostics[0].FullName -Raw) -match 'secret diagnostic') 'Private provider diagnosis was lost'
        Check (((Ledger) | ConvertTo-Json -Depth 15) -notmatch 'secret diagnostic') 'Private provider diagnosis leaked into ledger'
        $script:failConfiguration=$false
        Check ((Run).linux_base_ready) 'Retry after Linux configuration failure failed'
        Check (@($script:allCalls | Where-Object { $_ -like '--import*' }).Count -eq 1) 'Configuration failure recreated distro'

        # Audit completion unavailable after confirmed OS effect: preserve uncertainty;
        # retry verifies the marker and reuses the completed resource.
        New-Fixture
        $script:failCompletionAudit=$true
        $result=Run
        Check ($result.outcome -eq 'UNKNOWN' -and $result.reason_code -eq 'PLATFORM_TEST_AUDIT_UNAVAILABLE') 'Audit failure became success'
        Check ((Run).linux_base_ready) 'Retry after audit failure failed'
        Check (@($script:allCalls | Where-Object { $_ -like '--import*' }).Count -eq 1) 'Audit failure recreated distro'

        # Corrupt/incomplete ledger blocks all following effects. No reset/truncation.
        New-Fixture
        $null=Run
        $ledgerPath=Join-Path $script:context.ControlRoot 'admin.jsonl'
        [IO.File]::AppendAllText($ledgerPath, '{broken')
        $beforeCalls=$script:allCalls.Count
        $beforeLedger=[IO.File]::ReadAllText($ledgerPath)
        $result=Run
        Check ($result.outcome -eq 'UNKNOWN' -and $script:allCalls.Count -eq $beforeCalls) 'Corrupt ledger permitted effects'
        Check ([IO.File]::ReadAllText($ledgerPath) -ceq $beforeLedger) 'Corrupt ledger was rewritten'

        # Catalog and safe projection reject unexpected actions/content/result pairs.
        New-Fixture
        $script:context.Actor='S-1-5-21-1000'
        $lock=Open-PlatformControl $script:context
        try {
            Reject { WindowsRecorder\Write-PlatformAuditRecord $script:context UNDECLARED SUCCEEDED COMPLETED ABSENT READY VERIFIED } 'PLATFORM_AUDIT_ACTION_UNKNOWN'
            Reject { WindowsRecorder\Write-PlatformAuditRecord $script:context PLATFORM_WSL_PREPARED SUCCEEDED REQUESTED ABSENT READY VERIFIED } 'PLATFORM_AUDIT_RESULT_INVALID'
            Reject { WindowsRecorder\Write-PlatformAuditRecord $script:context PLATFORM_WSL_PREPARED SUCCEEDED COMPLETED 'password=secret' READY VERIFIED } 'PLATFORM_AUDIT_PROJECTION_INVALID'
            # Atomic replacement does not expose a half-written checkpoint or backup.
            Save-PlatformState $script:context
            $original=Get-Content -LiteralPath (Join-Path $script:context.ControlRoot 'state.json') -Raw
            $script:context.State.linux_base_ready=$true
            $statePath=Join-Path $script:context.ControlRoot 'state.json'
            $stateLock=[IO.File]::Open($statePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
            $writeRejected=$false
            try { Save-PlatformState $script:context } catch { $writeRejected=$true } finally { $stateLock.Dispose() }
            Check $writeRejected 'Locked checkpoint was overwritten'
            Check ((Get-Content -LiteralPath $statePath -Raw) -ceq $original) 'Failed checkpoint did not preserve previous state'
            Save-PlatformState $script:context
            Check ((Read-PlatformControlFile (Join-Path $script:context.ControlRoot 'state.json')).linux_base_ready) 'Atomic replacement failed'
            Check (@(Get-ChildItem -LiteralPath $script:context.ControlRoot -Filter '*.tmp').Count -eq 0) 'Atomic temporary file leaked'
            Reject { $busy=Open-PlatformControl $script:context; $busy.Dispose() } 'PLATFORM_INSTALLATION_BUSY'
        } finally { $lock.Dispose() }

        # Ambiguous identity, policy/config drift, and nested control roots fail closed.
        New-Fixture
        [IO.File]::WriteAllText($script:configPath, '{"schema_version":1,"installation_id":"first","installation\u005fid":"second","default_profile":"precision-windows"}')
        Reject { Read-PlatformIdentity $script:configPath } 'PLATFORM_IDENTITY_INVALID'
        New-Fixture
        [IO.File]::WriteAllText($script:profilePath, ([IO.File]::ReadAllText($script:profilePath).Replace("ControlRoot='", "ControlRoot='https://")))
        Reject { Read-PlatformWindowsContext $script:configPath $script:profilePath } 'PLATFORM_STORAGE_PATH_INVALID'

        New-Fixture
        $profile=[IO.File]::ReadAllText($script:profilePath)
        $oldControl=Join-Path $script:caseRoot 'control'
        $nestedControl=Join-Path $script:context.StorageRoot 'nested'
        [IO.File]::WriteAllText($script:profilePath, $profile.Replace($oldControl,$nestedControl))
        # Each configured base is suffixed by installation_id; compare resolved paths.
        Reject { Read-PlatformWindowsContext $script:configPath $script:profilePath } 'PLATFORM_CONTROL_MUST_BE_EXTERNAL'
        # Missing/bad delivery must be rejected before preparing the host.
        New-Fixture
        Reject { Invoke-PlatformWindowsInstallation -Action Install -Configuration $script:configPath -WindowsProfile $script:profilePath -CliPackage (Join-Path $script:caseRoot 'missing.tar.gz') } 'PLATFORM_CLI_PACKAGE_REQUIRED'
        Reject { Invoke-PlatformWindowsInstallation -Action Install -Configuration $script:configPath -WindowsProfile $script:profilePath -CliPackage $script:packagePath -CliPackageSha256 ('0'*64) } 'PLATFORM_CLI_PACKAGE_HASH_MISMATCH'
        Check ($script:allCalls.Count -eq 0 -and -not (Test-Path -LiteralPath $script:context.ControlRoot)) 'Bad delivery prepared the host'
        [IO.File]::WriteAllText(($script:packagePath -replace '\.tar\.gz$', '.sha256'), "$script:packageHash  cli.tar.gz`n")
        Check ((Read-PlatformCliPackage $script:packagePath '').Sha256 -ceq $script:packageHash) 'Matching sidecar rejected'

        New-Fixture
        $result=Run-Cli
        Check ($result.cli_ready -and -not $result.installation_ready -and 'platform_cli' -notin $result.pending_layers) 'CLI delivery/readiness invalid'
        Check ((Run-Cli).cli_ready -and $script:cliActivations -eq 1) 'Unchanged delivery was activated again'
        Check ((Ledger)[-1].outcome -eq 'NO_CHANGE') 'Unchanged activation not observed'
        $old=$script:activeCli
        [IO.File]::AppendAllText($script:configPath, "`n")
        Check ((Run-Cli).cli_ready -and $old -cne $script:activeCli) 'Configuration revision did not have its own release'

        New-Fixture
        $script:failPrepare=$true
        Check ((Run-Cli).reason_code -eq 'PLATFORM_CLI_PREPARATION_FAILED' -and $script:activeCli -eq 'ABSENT') 'Failed candidate was activated'
        $script:failPrepare=$false
        Check ((Run-Cli).cli_ready) 'Candidate retry failed'

        New-Fixture
        $script:failActivation=$true
        $result=Run-Cli
        Check ($result.outcome -eq 'FAILED' -and $result.phase -eq 'COMPLETED' -and $script:activeCli -eq 'ABSENT') 'Known activation failure became unknown/success'
        $script:failActivation=$false
        Check ((Run-Cli).cli_ready) 'Activation retry failed'

        New-Fixture
        $script:failVerify=$true
        $result=Run-Cli
        Check ($result.outcome -eq 'FAILED' -and $script:activeCli -eq 'ABSENT' -and $script:cliRestores -eq 1) 'First installation rollback failed'
        Check (@((Ledger) | Where-Object { $_.action -eq 'PLATFORM_CLI_ACTIVATION_RESTORED' -and $_.outcome -eq 'SUCCEEDED' }).Count -eq 1) 'Rollback was not recorded'
        $script:failVerify=$false
        Check ((Run-Cli).cli_ready) 'Retry after first installation rollback failed'

        New-Fixture
        $null=Run-Cli
        $old=$script:activeCli
        [IO.File]::AppendAllText($script:configPath,"`n")
        $script:failVerify=$true
        $result=Run-Cli
        Check ($result.outcome -eq 'FAILED' -and $script:activeCli -ceq $old) 'Update did not restore previous code/config revision'

        New-Fixture
        $script:lostActivationReply=$true
        $result=Run-Cli
        Check ($result.cli_ready -and $script:cliActivations -eq 1) 'Lost activation reply repeated effect'
        Check ((Ledger)[-1].reason_code -eq 'ACTIVATION_RECONCILED') 'Lost response was not reconciled explicitly'

        New-Fixture
        $script:failVerify=$true; $script:failRestore=$true
        $result=Run-Cli
        Check ($result.outcome -eq 'UNKNOWN' -and -not $result.cli_ready -and $script:activeCli -ne 'ABSENT') 'Unconfirmed rollback became success'
        $script:failVerify=$false; $script:failRestore=$false
        Check ((Run-Cli).cli_ready -and $script:cliActivations -eq 1) 'Retry repeated an already active release'

        New-Fixture
        $script:failCoreRequest=$true
        $result=Run-Cli
        Check ($result.outcome -eq 'UNKNOWN' -and $script:cliActivations -eq 0) 'Unavailable request audit permitted activation'
        New-Fixture
        $null=Run-Cli
        $ledgerPath=Join-Path $script:context.ControlRoot 'admin.jsonl'
        $ledgerBefore=[IO.File]::ReadAllText($ledgerPath)
        $query=Invoke-PlatformInstalledQuery -Command inventory -Configuration $script:configPath -WindowsProfile $script:profilePath -Arguments @('--format','json')
        Check ($query.ExitCode -eq 7 -and $query.Output -eq 'read-only query fixture') 'Installed query did not preserve provider result'
        $query=Invoke-PlatformInstalledQuery -Command Inventory -Configuration $script:configPath -WindowsProfile $script:profilePath -Arguments $null
        Check ($query.ExitCode -eq 7) 'Argument-free installed query failed'
        $query=Invoke-PlatformInstalledQuery -Command Publication -Configuration $script:configPath -WindowsProfile $script:profilePath -Arguments @('--previous-config','/mnt/c/previous configuration.json')
        Check ($query.ExitCode -eq 7 -and $query.Output -eq 'read-only query fixture') 'Publication query did not preserve read-only transport result'
        Check ([IO.File]::ReadAllText($ledgerPath) -ceq $ledgerBefore) 'Read-only transport wrote an administrative occurrence'
        New-Fixture
        $result=Run-Full
        Check ($result.host_prerequisites_ready -and $result.container_runtime_ready -and -not $result.gpu_container_qualified -and -not $result.installation_ready) 'Partial readiness became full qualification'
        Check ($result.runtime_endpoint -eq 'unix:///run/fixture/docker.sock' -and $script:nativeRuntimeCalls -eq 1) 'Runtime endpoint/phase lost'
        New-Fixture
        $result=Run-Full Host
        Check ($result.host_prerequisites_ready -and -not $result.container_runtime_ready -and $script:nativeRuntimeCalls -eq 0) 'Host-only phase started runtime'
        New-Fixture
        $script:driverMissing=$true;$script:driverReboot=$true
        Check ((Run-Full).exit_code -eq 3010) 'Driver reboot requirement lost'
        Check ((Run-Full).exit_code -eq 3010 -and $script:driverCalls -eq 1) 'Driver reinstalled before reboot'
        $script:boot='boot-2';$script:driverReboot=$false
        Check ((Run-Full).container_runtime_ready -and $script:driverCalls -eq 2) 'Driver reboot resume failed'
        New-Fixture
        $script:nativeHostWait=1
        $result=Run-Full
        Check ($result.container_runtime_ready -and $script:nativeHostCalls -eq 2) 'Owned distro restart did not resume preparation'
        Check (@($script:allCalls|Where-Object {$_ -like '--shutdown*'}).Count -eq 0) 'Security restart shut down all distros'
        New-Fixture
        $script:nativeRuntimeFailed=$true
        $result=Run-Full
        Check ($result.outcome -eq 'FAILED' -and $result.phase -eq 'COMPLETED' -and -not $result.container_runtime_ready) 'Native confirmed compensation lost its result'
        New-Fixture
        $script:nativeBadCorrelation=$true
        $result=Run-Full
        Check ($result.outcome -eq 'UNKNOWN' -and $script:driverCalls -eq 0 -and -not $result.host_prerequisites_ready) 'Foreign native response allowed driver effect'
        New-Fixture
        $script:nativeBadPlan=$true
        $result=Run-Full
        Check ($result.outcome -eq 'UNKNOWN' -and $script:driverCalls -eq 0 -and $script:nativeHostCalls -eq 0) 'Rejected native preflight allowed host effects'
        New-Fixture
        $script:nativeStringReadiness=$true
        $result=Run-Full
        Check ($result.outcome -eq 'UNKNOWN' -and -not $result.host_prerequisites_ready -and $script:nativeRuntimeCalls -eq 0) 'String false became confirmed host readiness'
        New-Fixture
        $result=Run-Full Network
        Check ($result.network_layer_ready -and $result.container_runtime_ready -and @($result.networks).Count -eq 4 -and -not $result.installation_ready) 'Private networks became full installation or lost readiness'
        Check ('private_networks' -notin $result.pending_layers -and 'network_publication' -in $result.pending_layers -and $script:nativeNetworkCalls -eq 1) 'Network preparation claimed publication or skipped a phase'
        New-Fixture
        $script:nativeNetworkFailed=$true
        $result=Run-Full Network
        Check ($result.outcome -eq 'FAILED' -and $result.container_runtime_ready -and -not $result.network_layer_ready -and 'private_networks' -in $result.pending_layers) 'Network failure lost confirmed partial state'
        New-Fixture
        $script:nativeLegacyNetwork=$true
        $result=Run-Full Network
        Check ($result.outcome -eq 'UNKNOWN' -and $script:driverCalls -eq 0 -and $script:nativeHostCalls -eq 0) 'Old CLI allowed effects before network capability check'
        New-Fixture
        $script:nativeNetworkString=$true
        $result=Run-Full Network
        Check ($result.outcome -eq 'UNKNOWN' -and $result.container_runtime_ready -and -not $result.network_layer_ready) 'String network readiness was accepted'
        New-Fixture
        $result=Run-Full Access
        Check ($result.access_layer_ready -and $result.identity_ready -and $result.secret_store_ready -and $result.edge_ready -and $result.network_layer_ready -and -not $result.installation_ready -and -not $result.sso_flow_qualified -and -not $result.external_publication_ready) 'Local access became public/SSO qualification'
        Check ($script:nativeAccessCalls -eq 1 -and $script:loopbackCalls -eq 2 -and 'access' -notin $result.pending_layers -and 'network_publication' -in $result.pending_layers) 'Host reachability or pending publication lost'
        New-Fixture
        $script:nativeLegacyAccess=$true
        $result=Run-Full Access
        Check ($result.outcome -eq 'UNKNOWN' -and $script:driverCalls -eq 0 -and $script:nativeHostCalls -eq 0) 'Incompatible access CLI allowed host effects'
        New-Fixture
        $script:nativeAccessFailed=$true
        $result=Run-Full Access
        Check ($result.outcome -eq 'FAILED' -and $result.network_layer_ready -and -not $result.access_layer_ready) 'Access compensation lost confirmed infrastructure'
        New-Fixture
        $script:nativeAccessString=$true
        $result=Run-Full Access
        Check ($result.outcome -eq 'UNKNOWN' -and $result.network_layer_ready -and -not $result.access_layer_ready) 'String access readiness was accepted'
        New-Fixture
        $script:nativeAccessQualified=$true
        $result=Run-Full Access
        Check ($result.outcome -eq 'UNKNOWN' -and $script:driverCalls -eq 0) 'Unqualified SSO claim allowed host effects'
        New-Fixture
        $script:loopbackUnavailable=$true
        $result=Run-Full Access
        Check ($result.outcome -eq 'UNKNOWN' -and $result.network_layer_ready -and -not $result.access_layer_ready) 'Linux-only reachability was declared Windows access ready'
        New-Fixture
        $result=Run-Full Origin
        Check ($result.origin_tls_ready -and $result.access_layer_ready -and $result.origin_endpoint -ceq 'https://gateway.localhost:9443' -and -not $result.windows_origin_tls_qualified -and -not $result.external_publication_ready -and -not $result.installation_ready) 'Native origin became public/Windows qualification'
        Check ($script:nativeOriginCalls -eq 1 -and 'origin_tls' -notin $result.pending_layers -and 'network_publication' -in $result.pending_layers) 'Origin stage/pending publication lost'
        New-Fixture
        $script:nativeLegacyOrigin=$true
        $result=Run-Full Origin
        Check ($result.outcome -eq 'UNKNOWN' -and $script:driverCalls -eq 0) 'Old native CLI permitted origin host effects'
        New-Fixture
        $script:nativeOriginPublic=$true
        $result=Run-Full Origin
        Check ($result.outcome -eq 'UNKNOWN' -and $script:driverCalls -eq 0) 'False public readiness permitted effects'
        New-Fixture
        $script:nativeOriginString=$true
        $result=Run-Full Origin
        Check ($result.outcome -eq 'UNKNOWN' -and $result.access_layer_ready -and -not $result.origin_tls_ready) 'String origin readiness was accepted'
        New-Fixture
        $script:nativeOriginFailed=$true
        $result=Run-Full Origin
        Check ($result.outcome -eq 'FAILED' -and $result.access_layer_ready -and -not $result.origin_tls_ready) 'Origin compensation discarded access readiness'
        New-Fixture
        $null=Invoke-PlatformWindowsInstallation -Action Install -Configuration $script:configPath -WindowsProfile $script:profilePath -CliPackage $script:packagePath -CliPackageSha256 $script:packageHash -Through Origin -OriginRevision 'rotation-one'
        Check (@($script:allCalls|Where-Object{$_ -like '*|--phase|origin|*|--origin-revision|rotation-one'}).Count -eq 2) 'Origin revision not bound to preflight and install'
        New-Fixture
        $script:nativeOriginBadCertificate=$true
        $result=Run-Full Origin
        Check ($result.outcome -eq 'UNKNOWN' -and -not $result.origin_tls_ready -and ($result|ConvertTo-Json -Depth 10 -Compress) -notmatch 'PRIVATE_FIXTURE_CERTIFICATE_CONTENT') 'Invalid certificate metadata reached projection'
        foreach($mode in @('ok','missing','legacy','public','metadata','string','failed')){
            New-Fixture
            $script:nativeIngressMode=$mode
            $result=Run-Full Ingress
            if($mode -eq 'ok'){Check ($result.ingress_artifacts_prepared -and $result.origin_tls_ready -and -not $result.external_publication_ready -and $result.ingress_bundle_revision -ceq 'edge-one' -and 'network_publication' -in $result.pending_layers) 'Artifacts became external activation'}
            elseif($mode -eq 'missing'){Check ($result.outcome -eq 'DEFERRED' -and $result.phase -eq 'WAITING' -and $result.exit_code -eq 42 -and $result.origin_tls_ready -and -not $result.ingress_artifacts_prepared) 'Missing domain discarded local foundation or asserted activation'}
            elseif($mode -eq 'failed'){Check ($result.outcome -eq 'FAILED' -and $result.origin_tls_ready -and -not $result.ingress_artifacts_prepared) 'Known preserved precondition lost local state'}
            else{Check ($result.outcome -eq 'UNKNOWN' -and -not $result.ingress_artifacts_prepared -and ($result|ConvertTo-Json -Depth 12 -Compress) -notmatch 'PRIVATE_FIXTURE_BUNDLE_CONTENT') 'Invalid ingress projection accepted';if($mode -in @('legacy','public')){Check ($script:driverCalls -eq 0) 'Ingress preflight allowed host effects'}}
        }
        foreach($commandName in @('status','doctor','start','stop','restart','logs')){
            New-Fixture;$null=Run-Full Origin
            $auditPath=Join-Path $script:context.ControlRoot 'admin.jsonl';$before=(Get-FileHash -LiteralPath $auditPath).Hash
            $reply=Run-Daily $commandName @('--component','edge','--request-id',('b'*32))
            Check ($reply.ExitCode -eq 0 -and $script:dailyCalls -eq 1) 'Daily operation not transported'
            Check ($reply.Output -notmatch 'private-unknown-field') 'Unknown provider field leaked to operation projection'
            $after=(Get-FileHash -LiteralPath $auditPath).Hash
            if($commandName -in @('status','doctor')){Check ($before -ceq $after) 'Query wrote Windows audit'}else{Check ($before -cne $after) 'Mutation missing Windows audit'}
        }
        foreach($commandName in @('status','doctor','logs','stop')){
            New-Fixture;$null=Run-Full Origin;$script:dailyRunning=$false
            $before=$script:allCalls.Count;$reply=Run-Daily $commandName;$value=$reply.Output|ConvertFrom-Json
            Check ($script:dailyCalls -eq 0 -and $script:allCalls.Count -eq $before+1 -and $value.reason_code -ceq 'PLATFORM_WSL_DISTRO_STOPPED' -and $value.services.Count -eq 5) 'Observation/stop/logs booted a stopped distro'
        }
        New-Fixture;$null=Run-Full Origin;$script:dailyRunning=$false
        Check ((Run-Daily start).ExitCode -eq 0 -and $script:dailyCalls -eq 1) 'Explicit start did not reach owned distro'
        New-Fixture;$null=Run-Full Origin;$script:admin=$false
        Reject {Run-Daily start} 'PLATFORM_ADMINISTRATOR_REQUIRED'
        Check ($script:dailyCalls -eq 0) 'Unprivileged maintenance reached Linux'
        New-Fixture;$null=Run-Full Origin;$script:dailyFailAudit=$true
        Reject {Run-Daily stop} 'PLATFORM_TEST_AUDIT_UNAVAILABLE'
        Check ($script:dailyCalls -eq 0) 'Native effect before Windows request audit'
        New-Fixture;$null=Run-Full Origin;$script:dailyBadReceipt=$true
        Reject {Run-Daily restart} 'PLATFORM_OPERATION_RECEIPT_INVALID'
        New-Fixture;$null=Run-Full Origin;$script:dailyPrivateFailure=$true
        Reject {Run-Daily logs} 'PLATFORM_OPERATION_RECEIPT_INVALID'
        $ledger=Get-Content -LiteralPath (Join-Path $script:context.ControlRoot 'admin.jsonl') -Raw
        Check ($ledger -notmatch 'private-provider-diagnostic') 'Raw provider output leaked to audit'
        foreach($commandName in @('start','stop','restart')){
            New-Fixture;$null=Run-Full Origin
            $reply=Run-Daily $commandName @('--component','container-runtime','--request-id',('c'*32))
            $value=$reply.Output|ConvertFrom-Json
            Check ($reply.ExitCode -eq 0 -and $value.scope_component -ceq 'container-runtime' -and $value.runtime.owned -and $reply.Output -notmatch 'private-runtime-field') 'Runtime scope/projection lost'
            $ledger=Ledger
            $expectedAction=@{start='PLATFORM_WINDOWS_RUNTIME_STARTED';stop='PLATFORM_WINDOWS_RUNTIME_STOPPED';restart='PLATFORM_WINDOWS_RUNTIME_RESTARTED'}[$commandName]
            Check ($ledger[-1].action -ceq $expectedAction -and $ledger[-1].operation_id -ceq $value.operation_id) 'Runtime audit action/correlation lost'
        }
        New-Fixture;$null=Run-Full Origin;$script:dailyRunning=$false
        $reply=Run-Daily status @('--component=container-runtime');$value=$reply.Output|ConvertFrom-Json
        Check ($script:dailyCalls -eq 0 -and $value.runtime.state -ceq 'NOT_OBSERVED' -and $value.scope_component -ceq 'container-runtime') 'Runtime status booted WSL or invented observation'
        New-Fixture;$null=Run-Full Origin
        Reject {Run-Daily logs @('--component','container-runtime')} 'PLATFORM_OPERATION_ARGUMENTS_INVALID'
        Check ($script:dailyCalls -eq 0) 'Runtime logs reached native provider'
        New-Fixture;$null=Run-Full Origin;$script:dailyDualPending=$true
        $reply=Run-Daily status;$value=$reply.Output|ConvertFrom-Json
        Check ($value.pending_maintenance.component -ceq 'edge' -and $value.pending_runtime_maintenance.component -ceq 'container-runtime' -and $value.pending_runtime_maintenance.targets[0].component -ceq 'container-runtime' -and $reply.Output -notmatch 'private-runtime-journal-data') 'Independent pending maintenance projection lost ownership/privacy'
        New-Fixture;$null=Run-Full Origin;$script:dailySignalEvidence=$true
        $auditPath=Join-Path $script:context.ControlRoot 'admin.jsonl';$before=(Get-FileHash -LiteralPath $auditPath).Hash
        $reply=Run-Daily doctor @('--component','telemetry');$value=$reply.Output|ConvertFrom-Json
        Check ($reply.ExitCode -eq 2 -and $value.observability.api_ready -and -not $value.observability.signals_ready -and $value.observability.signals.Count -eq 2) 'Signal degradation lost independent backend readiness or collection'
        Check ($value.observability.signals[0].state -ceq 'STALE' -and $null -eq $value.observability.signals[0].healthy -and $value.observability.signals[1].age_seconds -eq 10 -and $reply.Output -notmatch 'private-signal-detail') 'Signal evidence/projection fabricated health or leaked provider data'
        Check ($before -ceq (Get-FileHash -LiteralPath $auditPath).Hash) 'Signal diagnosis changed Windows audit'
        foreach($mode in @('ok','legacy','public','string','metadata','failed')){
            New-Fixture;$script:nativeObservabilityMode=$mode
            $result=Run-Full Observability
            if($mode -eq 'ok'){Check ($result.observability_core_ready -and $result.origin_tls_ready -and -not $result.windows_observability_qualified -and -not $result.external_publication_ready -and -not $result.installation_ready -and $result.grafana_endpoint -ceq 'http://grafana.localhost:3001' -and $result.dashboard_uid -ceq 'platform-foundation' -and 'applications' -in $result.pending_layers) 'Observability core claimed application/public/hardware readiness'}
            elseif($mode -eq 'failed'){Check ($result.outcome -ceq 'FAILED' -and $result.access_layer_ready -and -not $result.observability_core_ready) 'Observability compensation discarded foundation readiness'}
            else{Check ($result.outcome -ceq 'UNKNOWN' -and -not $result.observability_core_ready -and ($result|ConvertTo-Json -Depth 12 -Compress) -notmatch 'private-password') 'Invalid observability projection accepted';if($mode -in @('legacy','public')){Check ($script:driverCalls -eq 0) 'Invalid observability preflight allowed host effects'}}
        }
        New-Fixture;$null=Run-Full Origin
        $reply=Run-Daily doctor @('--component','homepage');$value=$reply.Output|ConvertFrom-Json
        Check ($reply.ExitCode -eq 0 -and $value.hub.api_ready -and $value.hub.service.component -ceq 'homepage' -and $reply.Output -notmatch 'private-hub-detail') 'Hub daily projection lost readiness or leaked provider content'
        foreach($mode in @('ok','legacy','public','string','metadata','failed')){
            New-Fixture;$script:nativeHubMode=$mode
            $result=Run-Full Hub
            if($mode -eq 'ok'){Check ($result.hub_ready -and $result.observability_core_ready -and $result.access_layer_ready -and -not $result.windows_hub_qualified -and -not $result.installation_ready -and -not $result.external_publication_ready -and $result.hub_endpoint -ceq 'http://home.localhost:3300' -and $script:nativeHubCalls -eq 1) 'Hub claimed SSO/public/application/hardware readiness or lost dependencies'}
            elseif($mode -eq 'failed'){Check ($result.outcome -ceq 'FAILED' -and $result.observability_core_ready -and -not $result.hub_ready) 'Hub failure lost prepared observability'}
            else{Check ($result.outcome -ceq 'UNKNOWN' -and -not $result.hub_ready -and ($result|ConvertTo-Json -Depth 12 -Compress) -notmatch 'private-password') 'Invalid hub receipt accepted';if($mode -in @('legacy','public')){Check ($script:driverCalls -eq 0) 'Invalid hub preflight allowed host effects'}}
        }
        Write-Output "Installer/operations: $script:cases disposable scenarios, retry/reboot, ownership, audit, activation, maintenance, observability and rollback: OK."
    } $repository $fixture
} finally {
    $resolved = [IO.Path]::GetFullPath($fixture)
    if ($resolved.StartsWith($temporaryParent + '\ai-platform-installer-', [StringComparison]::OrdinalIgnoreCase) -and
        $resolved -eq $fixture -and ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    } else { throw 'Unsafe installer fixture cleanup rejected' }
}
