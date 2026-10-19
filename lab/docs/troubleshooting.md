# Diagnóstico

`pull model manifest: 412` / `requires a newer version of Ollama` é incompatibilidade permanente entre o manifesto remoto e o servidor instalado. O pull interrompe com código 65 sem retentativas. Atualize a tag fixada `OLLAMA_IMAGE` em `config/versions.env` e aplique com `bootstrap prepare all` e depois `bootstrap up all`; preserve o volume de modelos. A versão 0.40.4 foi escolhida da release estável oficial em 2026-10-14 para substituir 0.12.3.

Downloads Ollama com saída 255 passam por retentativas limitadas. O código de saída sozinho não distingue rede, reinício ou sessão interrompida; consulte `/opt/ai-local-lab/.runtime-logs` e `ai logs ollama`. Retome com `prepare all`; reset/nuke descartam dados desnecessariamente.

O aviso Windows sobre WSL1 indisponível é informativo quando WSL2 funciona; não habilite WSL1 para este projeto. `starting` no healthcheck é aguardado pelo doctor até o timeout, enquanto `unhealthy` e containers ausentes continuam sendo erros.

| Sintoma | Ação |
| --- | --- |
| Bootstrap sem elevação | Abrir PowerShell com Executar como administrador, na mesma conta Windows, e repetir |
| Driver NVIDIA ausente | Executar prepare all administrativo com internet; instalação via Windows Update se houver pacote aplicável |
| Windows Update sem driver aplicável/bloqueado | Corrigir acesso/política ou instalar pacote oficial Dell/NVIDIA para o equipamento e repetir prepare |
| ExecutionPolicy | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\bootstrap.ps1` |
| nvidia-smi Windows falha | Reparar driver Dell/NVIDIA manualmente; reboot; repetir |
| WSL inexistente | Executar prepare em administrador; reboot; retorno 3010 |
| Virtualização indisponível | Habilitar virtualização BIOS/UEFI e verificar políticas corporativas |
| WSL sem systemd | Atualizar plataforma com `wsl --update`; repetir bootstrap |
| Erro GPU dentro WSL/container | `ai doctor`; verificar driver, WSL atualizado e toolkit; não instalar driver Linux |
| Docker não inicia | `ai shell`, `systemctl status docker`, `journalctl -u docker`; repetir bootstrap após corrigir causa |
| Distro nome igual não gerenciada | Mudar nome e diretório antes de importar; nunca adotar distro de terceiro |
| Porta ocupada | Alterar portas em lab.yaml; rodar prepare all e up all |
| localhost não responde | Conferir containers/health; verificar localhost forwarding WSL, VPN e política Hyper-V firewall; nenhuma regra global será aberta automaticamente |
| Health demora | Primeiro startup WebUI ou build/pull; ajustar timeout; `ai logs <serviço>` |
| Modelo OOM | Menor modelo/contexto, fechar outras cargas GPU; manter concorrência um |
| Falta espaço | Aumentar disco ou remover o lab por nuke após backup; VHDX não encolhe só por down |
| Lock/config alterados | Atualizar lock com uv Linux e commitar ambos; prepare all e up all; nunca instalar pacote manualmente para corrigir imagem |
| Operação já em execução | Aguardar outro bootstrap/shell/dev/logs; lock exclusivo impede concorrência no mesmo repositório |

`ai doctor` retorna erro se GPU/daemon/serviços selecionados falham. Profiles desativados são reportados como não testados, não como recursos obrigatoriamente instalados. `ai test` usa container temporário para testar GPU mesmo com apenas core. Logs próprios de bootstrap ficam em `.logs`; logs de serviço vêm do Docker.

Use `prepare all` para preparar as versões configuradas; `update`/`rebuild` são recusados. Tags removidas exigem alteração deliberada da configuração. Rede corporativa/proxy pode exigir configuração explícita de Docker dentro da distro, versionada e sem secrets no Git. Não copie daemons/credenciais de outras distros.

