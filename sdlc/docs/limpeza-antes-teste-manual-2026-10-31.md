# Limpeza antes da instalação manual do zero

Este roteiro usa `cleanup-environment.ps1`, já existente no projeto. **Não executa a limpeza automaticamente.**

A limpeza apaga as distros **`agentic-sdlc` e `ai-local-lab`**, com bancos, repositórios GitLab/Forgejo, aplicações, modelos, imagens Docker, volumes, credenciais e caches. Também remove os backups gerados nas pastas gerenciadas do projeto. Guarde qualquer backup que queira manter **fora da pasta do projeto** antes de começar.

Fontes, `.git`, configurações versionadas, Windows, plataforma WSL, driver NVIDIA, Git, VS Code e outras distros são preservados. Não há prune global. Salve todos os arquivos novos/alterados; inclua-os na versão de código que usará para reinstalar.

## Antes dos comandos

1. Interrompa bootstraps e testes em execução. Não inicie novos agentes.
2. Se usa a extensão antiga, execute **SDLC: Remover chave deste VS Code** nos perfis em que a configurou.
3. Feche **todas** as janelas do VS Code.
4. Abra PowerShell **externo, como administrador, na mesma conta Windows da instalação**.

Execute uma etapa de cada vez. Se ocorrer erro de propriedade, registro WSL ou link/junction, pare e confira a mensagem; não substitua o procedimento por exclusões globais.

## Sequência

```powershell
Set-Location 'C:\Users\marco\Documents\Git\ai-lab-nvidia'

# 1. Mostra o escopo e carrega as funções que protegem os caminhos.
# O ponto inicial significa dot-source; esta etapa usa somente Plan.
. .\cleanup-environment.ps1 -Action Plan

# 2. Simula a remoção, sem apagar os ambientes.
.\cleanup-environment.ps1 -Action Clean -WhatIf

# 3. Executa a remoção das distros e dos dados gerenciados.
.\cleanup-environment.ps1 -Action Clean
# Digite CLEANUP quando solicitado. Aguarde concluir sem erro.

# 4. Limpa as configurações geradas locais do Portal.
# Estas duas pastas/arquivos não são cobertos pelo script antigo.
# As funções carregadas no passo 1 conferem contenção e recusam links/junctions.
Remove-CleanupPath -Path (Join-Path $cleanupRoot 'sdlc/portal/.prepared') -AllowedRoot $cleanupRoot
Remove-CleanupPath -Path (Join-Path $cleanupRoot 'sdlc/portal/.env') -AllowedRoot $cleanupRoot

# 5. Confere o resultado.
.\cleanup-environment.ps1 -Action Plan
wsl.exe --list --verbose
Test-Path -LiteralPath '.\sdlc\portal\.prepared'
Test-Path -LiteralPath '.\sdlc\portal\.env'
git status --short
```

O plano final deve mostrar as duas distros como não registradas e sem os dados gerados por ele gerenciados. Os dois `Test-Path` devem retornar `False`. Suas alterações de código devem continuar no `git status`. Outras distros podem continuar listadas.

O passo 4 remove manifestos, referências de sockets e sobreposições Compose da instalação anterior. Isso evita que o primeiro `up` reutilize configurações de executores que já não existem. Não remova `test-results`: ele conserva relatórios e a trilha externa dos testes; não é usado como base de negócio da nova instalação. Caches de dependências no Windows, quando existentes, também não equivalem às imagens/volumes das distros removidas e não são usados como dados de negócio pelo instalador.

## Reinstalação

Após a conferência e com internet, siga o [roteiro de instalação de LAB e SDLC](instalacao-manual-ate-dev-2026-10-31.md), começando por:

```powershell
.\lab\bootstrap.ps1 prepare sdlc
.\lab\bootstrap.ps1 up sdlc
.\lab\bootstrap.ps1 doctor
.\sdlc\install.ps1 prepare
.\sdlc\install.ps1 up
.\sdlc\install.ps1 doctor
```

Se Windows/WSL/driver solicitar reboot, reinicie e retome a preparação conforme a mensagem. A limpeza real e a reinstalação permanecem ações manuais do operador. As proteções do script foram conferidas por testes isolados; não houve remoção de ambiente nesta preparação do roteiro.
