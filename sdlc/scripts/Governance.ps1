Set-StrictMode -Version Latest

# Pure reference functions for the control-service contract. These functions
# receive trusted identity/policy inputs; they do not authenticate callers.
function Assert-Transition {
    param([string]$From, [string]$To)
    $allowed = @{
        planned = @('ready', 'cancelled')
        ready = @('running', 'cancelled')
        running = @('validating', 'waiting_human', 'paused', 'failed', 'cancelled')
        validating = @('completed', 'waiting_human', 'paused', 'failed', 'cancelled')
        waiting_human = @('ready', 'cancelled')
        paused = @('ready', 'cancelled')
        failed = @('ready', 'cancelled')
        cancelled = @()
        completed = @()
    }
    if (-not $allowed.ContainsKey($From) -or $To -notin $allowed[$From]) {
        throw "Invalid run transition: $From -> $To"
    }
}

function Assert-ReleaseAuthorization {
    param(
        [Parameter(Mandatory)]$Approval,
        [Parameter(Mandatory)][string]$ObjectHash,
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string]$PolicyHash,
        [Parameter(Mandatory)][bool]$Accepted,
        [Parameter(Mandatory)][bool]$BackupVerified
    )
    foreach ($field in @('actor_kind','decision','revoked','object_hash','target','policy_hash')) {
        if ($field -notin $Approval.PSObject.Properties.Name) { throw "Missing approval field: $field" }
    }
    if ($ObjectHash -cnotmatch '^[a-f0-9]{64}$' -or $PolicyHash -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid hash' }
    if ($Approval.actor_kind -cne 'human' -or $Approval.decision -cne 'approved') { throw 'Human approval required' }
    if ($Approval.revoked -isnot [bool] -or $Approval.revoked) { throw 'Approval revoked or invalid' }
    if ($Approval.object_hash -cne $ObjectHash -or $Approval.target -cne $Target -or $Approval.policy_hash -cne $PolicyHash) {
        throw 'Approval does not match release, target or policy'
    }
    if (-not $Accepted -or -not $BackupVerified) { throw 'Acceptance and verified backup required' }
}
