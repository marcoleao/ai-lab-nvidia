function Test-BootstrapAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal $identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-BootstrapAdministrator {
    if (-not (Test-BootstrapAdministrator)) {
        throw 'Este bootstrap exige privilegios administrativos. Feche esta execucao, abra PowerShell com "Executar como administrador" na MESMA conta Windows, entre na raiz do projeto e repita o comando. Aceite a solicitacao de elevacao do Windows. Nenhum provisionamento foi iniciado.'
    }
}
