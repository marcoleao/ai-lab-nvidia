# Bootstrap e retomada

1. Parse seguro da configuração e lock exclusivo de operação no repositório.
2. Windows 11 x64, PowerShell, driver/GPU/VRAM, espaço livre, WSL/version.
3. Quando necessário, habilitação WSL com elevação e reboot; saída 3010.
4. Download rootfs Canonical e validação SHA256 por HTTPS. Configure SHA256 fixa para reprodução exata.
5. Import WSL2, marcador Windows e `/etc/ai-local-lab-owner`; nunca adota distro preexistente.
6. Usuário lab, systemd, `/etc/wsl.conf`; saída Linux 42 solicita restart somente desta distro.
7. Repositórios oficiais Docker/Toolkit, grupo docker, daemon systemd e passthrough WSL.
8. Sync ext4, secrets e runtime; build Compose, wait health, pull só de modelos ausentes.
9. Doctor, inferência e operação CUDA; endpoints.

Falha não remove dados automaticamente. Logs de eventos em `.logs/` indicam passo; repita o mesmo comando após corrigir o problema. Instalações apt já satisfeitas não são repetidas; builds usam cache. Distro incompleta permanece gerenciada; Docker parcialmente instalado é convergido na próxima execução.

Se o import falhou antes de registro, o diretório com marcador ainda pode ser removido por `nuke`. Se registro existe mas marcador Linux não pôde ser escrito, a ferramenta recusa adoção/remoção: inspecione o nome e `BasePath` no registro WSL, compare com o marcador Windows e restaure o marcador somente depois de verificar identidade (procedimento excepcional de recovery). Não importe uma distro de outro usuário sob o mesmo nome.

A ferramenta não cria tarefas agendadas de retomada. Após reboot, execute novamente o mesmo comando. WSL deve estar instalado e suficientemente atualizado para systemd; bootstrap aplica `wsl --update --web-download` apenas quando a plataforma está antiga e a sessão elevada. Doctor diagnostica sem atualizar. Nenhuma atualização irrestrita da distro é executada.
