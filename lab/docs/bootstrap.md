# Bootstrap e retomada

A partir da raiz: execute lab/bootstrap.ps1 prepare all com internet e depois lab/bootstrap.ps1 up all para uso local.

Todo bootstrap exige PowerShell administrativo; sem elevação, interrompe com mensagem ao usuário. Prepare instala driver NVIDIA ausente via Windows Update e verifica Windows/GPU/disco, habilita WSL quando necessário, valida SHA256 do rootfs datado e importa uma distro exclusiva. Uma distro preexistente sem marcadores é recusada. Driver/WSL podem exigir reboot (saída 3010); repita o comando como administrador na mesma conta. Veja [privilégios e driver](windows-prerequisites.md).

Na distro, configura usuário lab/systemd, instala Docker/Toolkit, sincroniza fontes para ext4, baixa imagens/modelos, constrói Python pelo lock e preenche caches MiniLM/tiktoken. Um manifesto privado registra os artefatos preparados.

Up exige a distro e o manifesto existentes. Não executa apt, pull ou build; valida os artefatos, inicia serviços com --pull never/--no-build e executa doctor/smoke. Mantém o bloqueio de saída dos containers.

Falhas preservam etapas concluídas. Repita prepare all para completar downloads interrompidos; use doctor para diagnóstico local. Alterações nos artefatos registrados exigem nova preparação. Não há retomada por tarefa agendada.

Se o import falhou antes de gravar todos os marcadores, confira nome, BasePath e marcadores antes de recuperação manual; nunca adote uma distro de outro usuário.

A criação de uma nova distro não foi reexecutada nesta revisão. Veja [evidências e limites](../../sdlc/docs/revisao-criacao-offline-2026-10-19.md).
