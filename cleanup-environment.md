# Limpeza e teste do zero

Execute na mesma conta Windows utilizada na instalação. O script não usa internet. Não foi executada a limpeza real durante sua implementação; a execução destrutiva cabe ao operador neste roteiro.

## 1. Preparar a limpeza

No VS Code, abra a paleta (Ctrl+Shift+P) e execute **SDLC: Remover chave deste VS Code**. Faça isso em cada perfil onde configurou a extensão. Desinstalar uma extensão não garante que o VS Code remova os secrets dela; o comando remove a chave pelo mecanismo do próprio editor.

Feche todas as janelas do VS Code e interrompa qualquer bootstrap/teste em andamento. Abra um PowerShell externo na raiz do ai-lab-nvidia. Use a conta original, não uma conta administrativa diferente.

```powershell
cd C:\Users\marco\Documents\Git\ai-lab-nvidia
.\cleanup-environment.ps1
.\cleanup-environment.ps1 -Action Clean -WhatIf
```

Ambos mostram o escopo sem executar remoções. O plano verifica configurações, marcadores Windows, armazenamento WSL e caminhos. A execução real também confere o marcador Linux e bloqueia concorrência com os bootstraps do lab/SDLC. Uma identidade inconsistente interrompe a limpeza, em vez de adotar uma distro desconhecida.

## 2. Executar a limpeza

```powershell
.\cleanup-environment.ps1 -Action Clean
# Digite CLEANUP quando solicitado.
```

O script remove:

- A extensão **ai-local.sdlc-chat** da instalação/perfil padrão acessível por code.cmd.
- As distros configuradas **agentic-sdlc** e **ai-local-lab**, após conferir propriedade. Isso elimina Docker/Toolkit instalados nelas, containers, redes, volumes, modelos, caches, Git/Forgejo/GitLab, Runner, bancos, demos, pipelines, workspaces, builds e secrets.
- Os diretórios de armazenamento gerenciados das distros e os arquivos/diretórios gerados `.env`, `.logs`, `.runtime-logs`, `.cache`, `.state`, `.secrets` e `backups` na raiz e em lab/, sdlc/ e vscode/. Inclui rootfs baixados, VSIX e relatórios locais. Não cria backup antes de remover.

São preservados: fontes, configurações versionadas, .git/GitHub, Windows, plataforma WSL, driver NVIDIA, Git, VS Code, demais extensões e outras distros. Nenhum prune global, wsl --shutdown ou remoção de programa compartilhado é utilizado. Isso zera a instalação do projeto; não equivale a reinstalar o sistema operacional.

Para perfis/instalações personalizados do VS Code, remova também a extensão nesses perfis usando a interface do editor. O script não edita bancos internos, configurações, histórico, cookies dos navegadores ou secrets de outros aplicativos. A seleção de conversas no workspace do editor pode permanecer; o histórico real é eliminado com a distro SDLC. Apague tokens salvos manualmente no navegador/clipboard caso queira testar também a experiência inicial do cliente.

Se houver falha, leia a mensagem, corrija a causa e repita o mesmo comando. A rotina aceita componentes já ausentes. Não contorne recusas de propriedade ou junctions apagando diretórios globais. Sem code.cmd no PATH, a extensão não pode ser inventariada/desinstalada pelo script; confira manualmente sua instalação antes do teste.

## 3. Conferir o estado limpo

```powershell
.\cleanup-environment.ps1
wsl.exe --list --verbose
code.cmd --list-extensions
git status --short
```

O plano deve mostrar as distros como não registradas, a extensão como não instalada e nenhum dado gerado listado. Outras distros e extensões continuam presentes. O Git deve preservar suas alterações de código; a limpeza não executa checkout, reset ou clean.

## 4. Recriar, uma etapa por vez

Conecte a máquina à internet e abra PowerShell **como administrador na mesma conta Windows**. Todos os bootstraps exigem elevação e interrompem com orientação caso ela esteja ausente. Confira a plataforma e as configurações:

```powershell
wsl.exe --version
.\lab\tests\validate.ps1
.\sdlc\bootstrap.ps1 validate
```

Prepare e valide o laboratório:

```powershell
.\lab\bootstrap.ps1 prepare all
.\lab\bootstrap.ps1 up all
.\lab\bootstrap.ps1 doctor
.\lab\bootstrap.ps1 test
```

Se a instalação do driver NVIDIA ou a habilitação do WSL solicitar reboot (saída 3010), reinicie e repita prepare all como administrador na mesma conta. Driver NVIDIA ausente é instalado pelo lab prepare via Windows Update, quando há pacote aplicável e o serviço está disponível. Driver existente é preservado. Veja [detalhes e limites](lab/docs/windows-prerequisites.md).

Prepare e valide o SDLC completo:

```powershell
.\sdlc\bootstrap.ps1 prepare
.\sdlc\bootstrap.ps1 up
.\sdlc\bootstrap.ps1 doctor
.\sdlc\bootstrap.ps1 test
.\sdlc\bootstrap.ps1 report
```

O teste SDLC cria dados sintéticos e demonstra MR, pipeline, merge e deploy. Instale a extensão e configure uma chave nova:

```powershell
.\vscode\bootstrap.ps1 install
.\sdlc\bootstrap.ps1 access
```

Abra o VS Code, execute **SDLC: Configurar chave de acesso** e cole a chave copiada. Os acessos antigos foram eliminados com o ambiente.

## 5. Aceite desconectado

Desconecte a internet da máquina, mantendo o acesso local. Não execute prepare nesta etapa.

```powershell
.\lab\bootstrap.ps1 down
.\sdlc\bootstrap.ps1 down
.\lab\bootstrap.ps1 up all
.\sdlc\bootstrap.ps1 up
.\lab\bootstrap.ps1 test
.\sdlc\bootstrap.ps1 test
.\sdlc\bootstrap.ps1 report
```

Confira chat no VS Code, WebUI, portal e GitLab local, incluindo a demo publicada. A aprovação desse ensaio comprova instalação nova e operação desconectada no seu equipamento. Novas aplicações devem usar imagens/pacotes/modelos previamente preparados; recursos extras não passam a existir automaticamente offline.
