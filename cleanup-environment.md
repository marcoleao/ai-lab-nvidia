# Limpeza e teste do zero

O [hub Homepage F8a](operations/HUB.md) também possui projeto, volume selado e identidade/recibos próprios, fora da limpeza legada. Parar o hub preserva esses recursos. A remoção implementada nos testes limita-se à CI descartável identificada; não é desinstalador do ambiente humano. Backup continua para capítulo posterior.

A [observabilidade local F3a/F4a](operations/OBSERVABILITY.md) possui projeto, dez volumes, credenciais e recibos próprios, fora da limpeza legada. `stop` preserva Grafana, métricas e estado Loki. Não remova `observability-seed.json` (senha/chave) ou os controles para tentar reparar uma falha. Esta entrega não oferece limpeza/backup desses dados nem migra aplicações produzidas.

O [ciclo de vida do runtime próprio](operations/RUNTIME-LIFECYCLE.md) também preserva dados, VM, configuração e habilitação de boot. Parar Docker/Colima exige ausência de workloads ativos e não é desinstalação. Não remova manifestos/journals para forçar recuperação; limpeza global e backup continuam fora dessa entrega.

A [operação diária da fundação](operations/OPERATIONS.md) oferece parada/partida/reinício e diagnóstico dos serviços próprios, preservando volumes. `stop` não é limpeza; logs privados, journal de manutenção e recibos de idempotência também permanecem fora da limpeza legada. Não apague esses arquivos para forçar retomada. Não há backup automático nesta entrega.

Os [conjuntos privados de ingresso F2c2b](operations/INGRESS.md), seus recibos/journals e identidades não são removidos pela limpeza legada. Revisões são imutáveis e retomadas com a mesma configuração; não adicione arquivos ou credenciais aos conjuntos para forçar ativação. Nenhum serviço público ou backup de dados é criado pela preparação desses arquivos.

A [origem mTLS F2c2a](operations/ORIGIN-TLS.md), suas gerações/volumes e os arquivos privados de certificados também ficam fora da limpeza legada. Rotação usa revisão explícita, com compensação de processos e preservação dos recursos. Não apague controles para forçar reparo/adoção; a desinstalação dessa camada ainda não possui executor. Nenhum backup foi criado.

Execute na mesma conta Windows utilizada na instalação. O script não usa internet. Não foi executada a limpeza real durante sua implementação; a execução destrutiva cabe ao operador neste roteiro.

Este roteiro atende aos instaladores legados LAB/SDLC. O novo instalador prepara distro separada, CLI, pré-requisitos, runtime e [redes F2a](operations/NETWORK.md); distro, releases, serviços/perfis, redes próprias, armazenamento e ledgers externos não são removidos por este roteiro. A remoção da nova instalação ainda não foi implementada. Retentativas verificam recursos próprios existentes, sem exigir limpeza prévia. Engine externo conserva sua administração e seus dados; F2a altera apenas redes/sondas identificadas da nova instalação, sem prune ou desconexão de aplicações.

[F2b](operations/ACCESS.md) acrescenta containers/volumes próprios de identidade, banco, cofre e borda, além de credenciais/material de recuperação privados. Este roteiro também não os remove. Não apague somente o material de recuperação mantendo Raft/volumes, nem use down com volumes/prune como reparo. Compensação do instalador preserva estado durável; desinstalação específica permanece pendente. Nenhum backup é criado por essa entrega.

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
```

O prepare reserva redes distintas para núcleo e GitLab, mesmo antes de criar containers. Up/restart também verifica reservas antigas e corrige sobreposição realocando somente as redes GitLab, preservando imagens e volumes, sem downloads. O primeiro início do GitLab pode levar vários minutos; aguarde a conclusão do comando.

O SDLC inicia vazio. Doctor verifica saúde sem criar dados; testes sintéticos são exclusivos da instalação descartável descrita em sdlc/docs/construcao-fase-0-2026-10-20.md. Instale a extensão e configure uma chave nova:

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
.\sdlc\bootstrap.ps1 doctor
```

Confira chat no VS Code, WebUI, portal e GitLab local. O usuário cria seu projeto durante a apresentação; não há aplicação pronta publicada automaticamente. A aprovação desse ensaio comprova instalação nova e operação desconectada no seu equipamento. Novas aplicações devem usar imagens/pacotes/modelos previamente preparados; recursos extras não passam a existir automaticamente offline.
