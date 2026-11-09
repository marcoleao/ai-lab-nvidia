@{
    SchemaVersion = 1
    Commands = @{
        Distribution = @{ Action = 'PLATFORM_DISTRIBUTION_BUNDLE_VALIDATED'; Effect = 'read_only'; AuditPersistence = 'none_read_only'; Comparison = 'NOT_APPLICABLE_READ_ONLY'; Rollback = 'NOT_APPLICABLE_NO_MUTATION' }
        Plan = @{ Action = 'PLATFORM_WINDOWS_INSTALLATION_PLANNED'; Effect = 'read_only'; AuditPersistence = 'none_read_only'; Comparison = 'NOT_APPLICABLE_READ_ONLY'; Rollback = 'NOT_APPLICABLE_NO_MUTATION' }
        Query = @{ Effect = 'read_only'; AuditPersistence = 'none_read_only'; Actions = @('PLATFORM_CONFIGURATION_VALIDATED','PLATFORM_INVENTORY_READ','PLATFORM_PLAN_COMPUTED','PLATFORM_PUBLICATION_PLAN_COMPUTED') }
        Observe = @{ Effect = 'read_only'; AuditPersistence = 'none_read_only'; Actions = @('PLATFORM_RUNTIME_STATUS_READ','PLATFORM_RUNTIME_DIAGNOSED') }
        Operate = @{ Effect = 'owned_foundation_maintenance'; AuditPersistence = 'per_step_external_ledger'; Actions = @('PLATFORM_WINDOWS_SERVICES_STARTED','PLATFORM_WINDOWS_SERVICES_STOPPED','PLATFORM_WINDOWS_SERVICES_RESTARTED','PLATFORM_WINDOWS_PRIVATE_LOGS_EXPORTED') }
        Runtime = @{ Effect = 'owned_runtime_lifecycle'; AuditPersistence = 'per_step_external_ledger'; Actions = @('PLATFORM_WINDOWS_RUNTIME_STARTED','PLATFORM_WINDOWS_RUNTIME_STOPPED','PLATFORM_WINDOWS_RUNTIME_RESTARTED') }
        Hub = @{ Effect = 'owned_local_service_hub'; AuditPersistence = 'per_step_external_ledger'; Actions = @('PLATFORM_HUB_LAYER_PREPARED') }
        Gitlab = @{ Effect = 'owned_scm_tool'; AuditPersistence = 'per_step_external_ledger'; Actions = @('PLATFORM_GITLAB_LAYER_PREPARED') }
        Observability = @{ Effect = 'owned_observability_core_preparation'; AuditPersistence = 'per_step_external_ledger'; Actions = @('PLATFORM_OBSERVABILITY_LAYER_PREPARED') }
        Install = @{ Effect = 'administrative_workflow'; AuditPersistence = 'per_step_external_ledger'; Actions = @('PLATFORM_WSL_PREPARED','PLATFORM_ROOTFS_PREPARED','PLATFORM_DISTRO_IMPORTED','PLATFORM_LINUX_CONFIGURED','PLATFORM_CLI_PREPARED','PLATFORM_CLI_ACTIVATED','PLATFORM_CLI_ACTIVATION_RESTORED','PLATFORM_WINDOWS_GPU_DRIVER_PREPARED','PLATFORM_HOST_PREREQUISITES_PREPARED','PLATFORM_CONTAINER_LAYER_PREPARED','PLATFORM_NETWORK_LAYER_PREPARED','PLATFORM_ACCESS_LAYER_PREPARED','PLATFORM_ORIGIN_LAYER_PREPARED','PLATFORM_INGRESS_ARTIFACTS_PREPARED') }
    }
    Actions = @{
		PLATFORM_HUB_LAYER_PREPARED = @{ Effect = 'owned_local_service_hub'; Comparison = 'native_receipt_digest'; Rollback = 'STOP_NEW_START_PRESERVE_SEALED_CONFIGURATION' }
        PLATFORM_GITLAB_LAYER_PREPARED = @{ Effect = 'owned_scm_tool'; Comparison = 'native_receipt_digest'; Rollback = 'STOP_NEW_START_PRESERVE_DURABLE_STATE' }
        PLATFORM_OBSERVABILITY_LAYER_PREPARED = @{ Effect = 'owned_local_observability_core'; Comparison = 'native_receipt_digest'; Rollback = 'STOP_NEW_STARTS_PRESERVE_TELEMETRY_AND_PRIVATE_CREDENTIALS' }
        PLATFORM_WINDOWS_RUNTIME_STARTED = @{ Effect = 'owned_runtime_start'; Comparison = 'native_operation_receipt_digest'; Rollback = 'NATIVE_RUNTIME_RUNNING_FLAG_COMPENSATION_NO_DATA_ROLLBACK' }
        PLATFORM_WINDOWS_RUNTIME_STOPPED = @{ Effect = 'owned_runtime_stop'; Comparison = 'native_operation_receipt_digest'; Rollback = 'NATIVE_RUNTIME_RUNNING_FLAG_COMPENSATION_NO_DATA_ROLLBACK' }
        PLATFORM_WINDOWS_RUNTIME_RESTARTED = @{ Effect = 'owned_runtime_restart'; Comparison = 'native_operation_receipt_digest'; Rollback = 'NATIVE_RUNTIME_RUNNING_FLAG_COMPENSATION_NO_DATA_ROLLBACK' }
        PLATFORM_WINDOWS_SERVICES_STARTED = @{ Effect = 'owned_foundation_start'; Comparison = 'native_operation_receipt_digest'; Rollback = 'NATIVE_RUNNING_FLAGS_COMPENSATION_NO_DATA_ROLLBACK' }
        PLATFORM_WINDOWS_SERVICES_STOPPED = @{ Effect = 'owned_foundation_stop'; Comparison = 'native_operation_receipt_digest'; Rollback = 'NATIVE_RUNNING_FLAGS_COMPENSATION_NO_DATA_ROLLBACK' }
        PLATFORM_WINDOWS_SERVICES_RESTARTED = @{ Effect = 'owned_foundation_restart'; Comparison = 'native_operation_receipt_digest'; Rollback = 'NATIVE_RUNNING_FLAGS_COMPENSATION_NO_DATA_ROLLBACK' }
        PLATFORM_WINDOWS_PRIVATE_LOGS_EXPORTED = @{ Effect = 'private_bounded_log_export'; Comparison = 'native_operation_receipt_digest'; Rollback = 'PRESERVE_PRIVATE_EXPORT_RECONCILE_INTENT' }
        PLATFORM_WSL_PREPARED = @{ Effect = 'host_configuration'; Comparison = 'wsl_state'; Rollback = 'PRESERVE_SHARED_HOST_COMPONENT' }
        PLATFORM_ROOTFS_PREPARED = @{ Effect = 'verified_cache'; Comparison = 'rootfs_sha256'; Rollback = 'PRESERVE_VERIFIED_CACHE' }
        PLATFORM_DISTRO_IMPORTED = @{ Effect = 'owned_distro'; Comparison = 'distro_registration'; Rollback = 'PRESERVE_AND_RECONCILE_NO_AUTOMATIC_DELETE' }
        PLATFORM_LINUX_CONFIGURED = @{ Effect = 'owned_linux_configuration'; Comparison = 'configuration_digest'; Rollback = 'ATOMIC_FILES_AND_EXPLICIT_RETRY' }
        PLATFORM_CLI_PREPARED = @{ Effect = 'owned_cli_candidate'; Comparison = 'release_digest'; Rollback = 'PREVIOUS_ACTIVE_RELEASE_PRESERVED' }
        PLATFORM_CLI_ACTIVATED = @{ Effect = 'owned_cli_pointer'; Comparison = 'active_release_digest'; Rollback = 'COMPARE_AND_RESTORE_PREVIOUS_POINTER' }
        PLATFORM_CLI_ACTIVATION_RESTORED = @{ Effect = 'owned_cli_pointer'; Comparison = 'active_release_digest'; Rollback = 'EXPLICIT_RETRY_AFTER_VERIFICATION' }
        PLATFORM_WINDOWS_GPU_DRIVER_PREPARED = @{ Effect = 'missing_windows_gpu_driver'; Comparison = 'gpu_driver_digest'; Rollback = 'PRESERVE_SHARED_HOST_DRIVER' }
        PLATFORM_HOST_PREREQUISITES_PREPARED = @{ Effect = 'owned_linux_userland_and_gpu_probe'; Comparison = 'native_receipt_digest'; Rollback = 'REOBSERVE_PACKAGES_NO_AUTOMATIC_DOWNGRADE' }
        PLATFORM_CONTAINER_LAYER_PREPARED = @{ Effect = 'owned_container_runtime'; Comparison = 'native_receipt_digest'; Rollback = 'NATIVE_CONFIGURATION_COMPENSATION' }
        PLATFORM_NETWORK_LAYER_PREPARED = @{ Effect = 'owned_private_networks_and_isolation_probes'; Comparison = 'native_receipt_digest'; Rollback = 'REMOVE_EMPTY_OWNED_CANDIDATES_PRESERVE_EXISTING_ENDPOINTS' }
        PLATFORM_ACCESS_LAYER_PREPARED = @{ Effect = 'owned_identity_vault_edge_local'; Comparison = 'native_receipt_digest'; Rollback = 'STOP_NEW_STARTS_PRESERVE_DURABLE_STATE_AND_RECOVERY' }
        PLATFORM_ORIGIN_LAYER_PREPARED = @{ Effect = 'owned_origin_mtls_loopback'; Comparison = 'native_receipt_digest'; Rollback = 'RESTORE_PREVIOUS_PROCESS_STATE_PRESERVE_CANDIDATE_AND_MATERIAL' }
        PLATFORM_INGRESS_ARTIFACTS_PREPARED = @{ Effect = 'owned_private_ingress_artifacts'; Comparison = 'native_receipt_digest'; Rollback = 'PRESERVE_IMMUTABLE_BUNDLES_RECONCILE_INTENT_NO_PUBLIC_ACTIVATION' }
    }
}
