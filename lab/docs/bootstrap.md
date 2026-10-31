# Bootstrap e retomada

A partir da raiz, para o SDLC: execute `lab/bootstrap.ps1 prepare sdlc` com internet, depois `lab/bootstrap.ps1 up sdlc` e `doctor`. O perfil prepara apenas Ollama e os dois modelos existentes necessários ao Portal. [Contrato e comandos completos](sdlc-profile.md). Para o laboratório geral, `prepare all`/`up all` continuam disponíveis.

Todo bootstrap exige PowerShell administrativo; sem elevação, interrompe com mensagem ao usuário. Prepare instala driver NVIDIA ausente via Windows Update e verifica Windows/GPU/disco, habilita WSL quando necessário, valida SHA256 do rootfs datado e importa uma distro exclusiva. Uma distro preexistente sem marcadores é recusada. Driver/WSL podem exigir reboot (saída 3010); repita o comando como administrador na mesma conta. Veja [privilégios e driver](windows-prerequisites.md).

Na distro, configura usuário lab/systemd, instala Docker/Toolkit e sincroniza fontes para ext4. O preparo geral constrói Python pelo lock e preenche MiniLM/tiktoken; o perfil `sdlc` dispensa esses componentes, as imagens extras e o container Qwen Code do LAB. Um manifesto privado v3 identifica a seleção e os ativos preparados; manifesto de outro perfil exige nova preparação.

Up exige a distro e o manifesto existentes. Não executa apt, pull ou build; valida os artefatos, inicia serviços com --pull never/--no-build e executa doctor/smoke. Mantém o bloqueio de saída dos containers.

Falhas preservam etapas concluídas. Repita prepare all para completar downloads interrompidos; use doctor para diagnóstico local. Alterações nos artefatos registrados exigem nova preparação. Não há retomada por tarefa agendada.

Se o import falhou antes de gravar todos os marcadores, confira nome, BasePath e marcadores antes de recuperação manual; nunca adote uma distro de outro usuário.

A criação de uma nova distro não foi reexecutada nesta revisão. Veja [evidências e limites](../../sdlc/docs/revisao-criacao-offline-2026-10-19.md).
