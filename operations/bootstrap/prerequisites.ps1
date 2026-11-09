function Invoke-PlatformPreparation($Context,[string]$Phase,[string]$Action='install') {
    Assert-PlatformRegistration $Context (Get-PlatformRegistration $Context.Profile.DistroName)
    $probe=Invoke-PlatformLinuxHost $Context probe
    if($probe.ExitCode -ne 0){Stop-PlatformProvider 'PLATFORM_LINUX_OWNERSHIP_CONFLICT' $probe}
    $arguments=@('--distribution',$Context.Profile.DistroName,'--user','root','--exec','/bin/sh','/opt/ai-platform/core/platform.sh','setup',
        '--action',$Action,'--phase',$Phase,'--operation-id',$Context.OperationId,'--runtime-pool',$Context.RuntimePool,'--memory-gib',[string]$Context.RuntimeMemoryGiB,'--cpus',[string]$Context.RuntimeCPUs,'--disk-gib',[string]$Context.RuntimeDiskGiB,'--runtime-mode',$Context.RuntimeMode)
    if($Phase -eq 'origin' -and $Context.OriginRevision){$arguments+=@('--origin-revision',$Context.OriginRevision)}
    $response=Invoke-PlatformWsl $arguments
    try{$value=$response.Output|ConvertFrom-Json -ErrorAction Stop}catch{Stop-PlatformProvider 'PLATFORM_SETUP_RESULT_INVALID' $response}
    if($value.PSObject.Properties.Name -notcontains 'exit_code' -or $value.PSObject.Properties.Name -notcontains 'host_prerequisites_ready' -or
        $value.installation_id -cne $Context.InstallationId -or $value.profile -cne 'precision-windows' -or $value.operation_id -cne $Context.OperationId){Stop-PlatformProvider 'PLATFORM_CLI_SETUP_INCOMPATIBLE' $response}
    if($value.exit_code -ne $response.ExitCode){Stop-PlatformProvider 'PLATFORM_SETUP_TRANSPORT_UNCONFIRMED' $response}
    if($value.PSObject.Properties.Name -notcontains 'planned' -or $value.schema_version -ne 1 -or $value.planned -isnot [bool] -or
        $value.host_prerequisites_ready -isnot [bool] -or $value.container_runtime_ready -isnot [bool] -or
        $value.gpu_container_qualified -isnot [bool] -or $value.installation_ready -isnot [bool] -or
        $value.gpu_container_qualified -or $value.installation_ready){Stop-PlatformProvider 'PLATFORM_SETUP_RESULT_INVALID' $response}
    if($Action -eq 'plan' -and ($value.planned -ne $true -or $value.outcome -ne 'SUCCEEDED' -or $value.exit_code -ne 0)){
        Stop-PlatformProvider 'PLATFORM_SETUP_PREFLIGHT_REJECTED' $response
    }
    if($Action -eq 'install' -and $value.planned -ne $false){Stop-PlatformProvider 'PLATFORM_SETUP_RESULT_INVALID' $response}
    if($Phase -eq 'network' -and ($value.PSObject.Properties.Name -notcontains 'network_layer_ready' -or $value.network_layer_ready -isnot [bool])){Stop-PlatformProvider 'PLATFORM_NETWORK_SETUP_INCOMPATIBLE' $response}
    if($Phase -eq 'access'){
        foreach($name in @('access_layer_ready','identity_ready','secret_store_ready','edge_ready','sso_flow_qualified','external_publication_ready')){if($value.PSObject.Properties.Name -notcontains $name -or $value.$name -isnot [bool]){Stop-PlatformProvider 'PLATFORM_ACCESS_SETUP_INCOMPATIBLE' $response}}
        if($value.sso_flow_qualified -or $value.external_publication_ready){Stop-PlatformProvider 'PLATFORM_ACCESS_RESULT_INVALID' $response}
    }
    if($Phase -eq 'origin'){
        foreach($name in @('origin_tls_ready','sso_flow_qualified','external_publication_ready')){if($value.PSObject.Properties.Name -notcontains $name -or $value.$name -isnot [bool]){Stop-PlatformProvider 'PLATFORM_ORIGIN_SETUP_INCOMPATIBLE' $response}}
        if($value.sso_flow_qualified -or $value.external_publication_ready){Stop-PlatformProvider 'PLATFORM_ORIGIN_RESULT_INVALID' $response}
        if($value.PSObject.Properties.Name -contains 'origin_certificate_not_after'){
            if($value.origin_certificate_not_after -isnot [string] -or $value.origin_certificate_not_after -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$' -or $value.PSObject.Properties.Name -notcontains 'origin_certificate_sha256' -or $value.origin_certificate_sha256 -isnot [string] -or $value.origin_certificate_sha256 -cnotmatch '^[a-f0-9]{64}$'){Stop-PlatformProvider 'PLATFORM_ORIGIN_CERTIFICATE_METADATA_INVALID' $response}
        }
    }
    if($Phase -eq 'ingress'){
        foreach($name in @('ingress_artifacts_prepared','sso_flow_qualified','external_publication_ready')){if($value.PSObject.Properties.Name -notcontains $name -or $value.$name -isnot [bool]){Stop-PlatformProvider 'PLATFORM_INGRESS_SETUP_INCOMPATIBLE' $response}}
        if($value.sso_flow_qualified -or $value.external_publication_ready){Stop-PlatformProvider 'PLATFORM_INGRESS_RESULT_INVALID' $response}
    }
    if($Phase -eq 'observability'){
        if($value.PSObject.Properties.Name -notcontains 'observability_core_ready' -or $value.observability_core_ready -isnot [bool] -or $value.sso_flow_qualified -or $value.external_publication_ready){Stop-PlatformProvider 'PLATFORM_OBSERVABILITY_SETUP_INCOMPATIBLE' $response}
    }
    if($Phase -eq 'gitlab'){
        foreach($name in @('gitlab_ready','sso_flow_qualified','external_publication_ready')){if($value.PSObject.Properties.Name -notcontains $name -or $value.$name -isnot [bool]){Stop-PlatformProvider 'PLATFORM_GITLAB_SETUP_INCOMPATIBLE' $response}}
        if($value.sso_flow_qualified -or $value.external_publication_ready){Stop-PlatformProvider 'PLATFORM_GITLAB_RESULT_INVALID' $response}
    }
    if($Phase -eq 'hub'){
        foreach($name in @('hub_ready','sso_flow_qualified','external_publication_ready')){if($value.PSObject.Properties.Name -notcontains $name -or $value.$name -isnot [bool]){Stop-PlatformProvider 'PLATFORM_HUB_SETUP_INCOMPATIBLE' $response}}
        if($value.sso_flow_qualified -or $value.external_publication_ready){Stop-PlatformProvider 'PLATFORM_HUB_RESULT_INVALID' $response}
    }
    return $value
}
function Ensure-PlatformPreparation($Context,[string]$Phase) {
    $action=switch($Phase){host{'PLATFORM_HOST_PREREQUISITES_PREPARED'};runtime{'PLATFORM_CONTAINER_LAYER_PREPARED'};network{'PLATFORM_NETWORK_LAYER_PREPARED'};access{'PLATFORM_ACCESS_LAYER_PREPARED'};origin{'PLATFORM_ORIGIN_LAYER_PREPARED'};ingress{'PLATFORM_INGRESS_ARTIFACTS_PREPARED'};observability{'PLATFORM_OBSERVABILITY_LAYER_PREPARED'};hub{'PLATFORM_HUB_LAYER_PREPARED'};gitlab{'PLATFORM_GITLAB_LAYER_PREPARED'};default{throw 'PLATFORM_SETUP_PHASE_INVALID'}}
    return Invoke-PlatformAuditedStep $Context $action NOT_OBSERVED {
        $value=Invoke-PlatformPreparation $Context $Phase
        if($Phase -eq 'host' -and $value.phase -eq 'WAITING' -and $value.reason_code -eq 'REBOOT_REQUIRED'){
            $restart=Invoke-PlatformWsl @('--terminate',$Context.Profile.DistroName)
            if($restart.ExitCode -ne 0){Stop-PlatformProvider 'PLATFORM_DISTRO_RESTART_UNCONFIRMED' $restart}
            $value=Invoke-PlatformPreparation $Context $Phase
        }
        if($value.outcome -eq 'DEFERRED' -and $value.phase -eq 'WAITING'){return New-PlatformStepResult WAITING DEFERRED WAITING $value.reason_code}
        if($value.outcome -eq 'FAILED' -and $value.phase -eq 'COMPLETED'){return New-PlatformStepResult (Get-PlatformSha256 ($value.steps|ConvertTo-Json -Depth 10 -Compress)) FAILED COMPLETED $(if($Phase -eq 'network'){'NATIVE_NETWORKS_RESTORED'}else{'NATIVE_CONFIGURATION_RESTORED'})}
        if($value.outcome -notin @('SUCCEEDED','NO_CHANGE') -or $value.exit_code -ne 0){if($value.reason_code -match '^PLATFORM_[A-Z0-9_]+$'){throw $value.reason_code};throw 'PLATFORM_NATIVE_PREPARATION_UNCONFIRMED'}
        if($Phase -eq 'host' -and -not $value.host_prerequisites_ready -or $Phase -eq 'runtime' -and -not $value.container_runtime_ready){throw 'PLATFORM_NATIVE_READINESS_UNCONFIRMED'}
        if($Phase -eq 'network' -and -not $value.network_layer_ready){throw 'PLATFORM_NETWORK_READINESS_UNCONFIRMED'}
        if($Phase -eq 'access'){
            if(-not $value.access_layer_ready -or -not $value.identity_ready -or -not $value.secret_store_ready -or -not $value.edge_ready){throw 'PLATFORM_ACCESS_READINESS_UNCONFIRMED'}
            Test-PlatformWindowsAccessEndpoints $value.access_endpoints
        }
        if($Phase -eq 'origin'){
            if(-not $value.origin_tls_ready){throw 'PLATFORM_ORIGIN_READINESS_UNCONFIRMED'}
            $u=[uri]$value.origin_endpoint
            if($u.Scheme -cne 'https' -or $u.Host -cne 'gateway.localhost' -or $u.Port -lt 1024 -or $u.UserInfo -or $u.Query -or $u.Fragment -or $u.AbsolutePath -ne '/'){throw 'PLATFORM_ORIGIN_ENDPOINT_REJECTED'}
        }
        if($Phase -eq 'ingress'){
            if(-not $value.ingress_artifacts_prepared -or $value.ingress_bundle_id -isnot [string] -or $value.ingress_bundle_id -cnotmatch '^[a-f0-9]{64}$' -or $value.ingress_bundle_revision -isnot [string] -or $value.ingress_bundle_revision.Length -gt 63 -or $value.ingress_bundle_revision -cnotmatch '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'){throw 'PLATFORM_INGRESS_READINESS_UNCONFIRMED'}
            if(@($value.ingress_adapters.PSObject.Properties).Count -ne 2 -or $value.ingress_adapters.direct -cne 'CONFIGURATION_PREPARED_ACME_AND_INGRESS_PENDING' -or $value.ingress_adapters.tunnel -cnotin @('PENDING_TUNNEL_ID','CONFIGURATION_PREPARED_CONNECTOR_AND_CREDENTIALS_PENDING')){throw 'PLATFORM_INGRESS_RESULT_INVALID'}
        }
        if($Phase -eq 'observability'){
            if(-not $value.observability_core_ready -or $value.dashboard_uid -cne 'platform-foundation'){throw 'PLATFORM_OBSERVABILITY_READINESS_UNCONFIRMED'}
            $u=[uri]$value.grafana_endpoint
            if($u.Scheme -cne 'http' -or $u.Host -cne 'grafana.localhost' -or $u.Port -lt 1024 -or $u.Port -gt 65535 -or $u.UserInfo -or $u.Query -or $u.Fragment -or $u.AbsolutePath -ne '/'){throw 'PLATFORM_OBSERVABILITY_ENDPOINT_REJECTED'}
        }
        if($Phase -eq 'gitlab'){
            if(-not $value.gitlab_ready){throw 'PLATFORM_GITLAB_READINESS_UNCONFIRMED'}
            $u=[uri]$value.gitlab_endpoint
            if($u.Scheme -cne 'http' -or $u.Host -cne 'git.localhost' -or $u.Port -lt 1024 -or $u.Port -gt 65535 -or $u.UserInfo -or $u.Query -or $u.Fragment -or $u.AbsolutePath -ne '/'){throw 'PLATFORM_GITLAB_ENDPOINT_REJECTED'}
        }
        if($Phase -eq 'hub'){
            if(-not $value.hub_ready){throw 'PLATFORM_HUB_READINESS_UNCONFIRMED'}
            $u=[uri]$value.hub_endpoint
            if($u.Scheme -cne 'http' -or $u.Host -cne 'home.localhost' -or $u.Port -lt 1024 -or $u.Port -gt 65535 -or $u.UserInfo -or $u.Query -or $u.Fragment -or $u.AbsolutePath -ne '/'){throw 'PLATFORM_HUB_ENDPOINT_REJECTED'}
        }
        $proof=Get-PlatformSha256 (($value.steps|ConvertTo-Json -Depth 10 -Compress))
        $step=New-PlatformStepResult $proof
        if($Phase -eq 'runtime'){$step|Add-Member NoteProperty Endpoint $value.runtime_endpoint;$step|Add-Member NoteProperty RuntimeMode $value.runtime_mode}
        if($Phase -eq 'network'){$step|Add-Member NoteProperty Networks @($value.networks)}
        if($Phase -eq 'access'){$step|Add-Member NoteProperty Endpoints $value.access_endpoints}
        if($Phase -eq 'origin'){$step|Add-Member NoteProperty Endpoint $value.origin_endpoint}
        if($Phase -eq 'ingress'){$step|Add-Member NoteProperty BundleID $value.ingress_bundle_id;$step|Add-Member NoteProperty Revision $value.ingress_bundle_revision;$step|Add-Member NoteProperty Adapters $value.ingress_adapters}
        if($Phase -eq 'observability'){$step|Add-Member NoteProperty Endpoint $value.grafana_endpoint;$step|Add-Member NoteProperty DashboardUID $value.dashboard_uid}
        if($Phase -eq 'hub'){$step|Add-Member NoteProperty Endpoint $value.hub_endpoint}
        if($Phase -eq 'gitlab'){$step|Add-Member NoteProperty Endpoint $value.gitlab_endpoint}
        if($Phase -eq 'origin' -and $value.PSObject.Properties.Name -contains 'origin_certificate_not_after'){$step|Add-Member NoteProperty CertificateNotAfter $value.origin_certificate_not_after;$step|Add-Member NoteProperty CertificateSHA256 $value.origin_certificate_sha256}
        $step
    }
}

function Read-PlatformLoopbackJson([string]$Uri,[string]$HostHeader){
    $request=[Net.HttpWebRequest]::Create($Uri);$request.Method='GET';$request.Proxy=$null;$request.Timeout=10000;$request.ReadWriteTimeout=10000;$request.AllowAutoRedirect=$false
    if($HostHeader){$request.Host=$HostHeader}
    $response=$null;$reader=$null
    try{$response=$request.GetResponse();if([int]$response.StatusCode -ne 200){throw 'PLATFORM_WINDOWS_ACCESS_UNCONFIRMED'};$reader=[IO.StreamReader]::new($response.GetResponseStream());$buffer=New-Object char[] 1048577;$count=$reader.ReadBlock($buffer,0,$buffer.Length);if($count -gt 1048576){throw 'PLATFORM_WINDOWS_ACCESS_UNCONFIRMED'};return (-join $buffer[0..($count-1)])|ConvertFrom-Json -ErrorAction Stop}
    catch{throw 'PLATFORM_WINDOWS_ACCESS_UNCONFIRMED'}finally{if($reader){$reader.Dispose()};if($response){$response.Dispose()}}
}
function Test-PlatformWindowsAccessEndpoints($Endpoints){
    $identity=[uri]$Endpoints.identity;$secret=[uri]$Endpoints.secret_store
    foreach($item in @(@($identity,'auth.localhost'),@($secret,'vault.localhost'))){$u=$item[0];if($u.Scheme -cne 'http' -or $u.Host -cne $item[1] -or $u.Port -lt 1024 -or $u.UserInfo -or $u.Query -or $u.Fragment -or $u.AbsolutePath -ne '/'){throw 'PLATFORM_ACCESS_ENDPOINT_REJECTED'}}
    $issuer=$identity.GetLeftPart([UriPartial]::Authority)+'/realms/platform'
    $discovery=Read-PlatformLoopbackJson ('http://127.0.0.1:'+$identity.Port+'/realms/platform/.well-known/openid-configuration') $identity.Authority
    if($discovery.issuer -cne $issuer){throw 'PLATFORM_WINDOWS_ACCESS_UNCONFIRMED'}
    $health=Read-PlatformLoopbackJson ('http://127.0.0.1:'+$secret.Port+'/v1/sys/health') $secret.Authority
    if($health.initialized -isnot [bool] -or -not $health.initialized -or $health.sealed -isnot [bool] -or $health.sealed){throw 'PLATFORM_WINDOWS_ACCESS_UNCONFIRMED'}
}
