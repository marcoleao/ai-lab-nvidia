# Diagnóstico

| Sintoma | Ação |
| --- | --- |
| ExecutionPolicy | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\bootstrap.ps1` |
| nvidia-smi Windows falha | Reparar driver Dell/NVIDIA manualmente; reboot; repetir |
| WSL inexistente | Mesmo bootstrap em administrador; reboot; retorno 3010 |
| Virtualização indisponível | Habilitar virtualização BIOS/UEFI e verificar políticas corporativas |
| WSL sem systemd | Atualizar plataforma com `wsl --update`; repetir bootstrap |
| Erro GPU dentro WSL/container | `ai doctor`; verificar driver, WSL atualizado e toolkit; não instalar driver Linux |
| Docker não inicia | `ai shell`, `systemctl status docker`, `journalctl -u docker`; repetir bootstrap após corrigir causa |
| Distro nome igual não gerenciada | Mudar nome e diretório antes de importar; nunca adotar distro de terceiro |
| Porta ocupada | Alterar portas em lab.yaml e rodar up |
| localhost não responde | Conferir containers/health; verificar localhost forwarding WSL, VPN e política Hyper-V firewall; nenhuma regra global será aberta automaticamente |
| Health demora | Primeiro startup WebUI ou build/pull; ajustar timeout; `ai logs <serviço>` |
| Modelo OOM | Menor modelo/contexto, fechar outras cargas GPU; manter concorrência um |
| Falta espaço | Aumentar disco ou remover o lab por nuke após backup; VHDX não encolhe só por down |
| Lock/config alterados | Atualizar lock com uv Linux e commitar ambos; rebuild; nunca instalar pacote manualmente para corrigir imagem |
| Operação já em execução | Aguardar outro bootstrap/shell/dev/logs; lock exclusivo impede concorrência no mesmo repositório |

`ai doctor` retorna erro se GPU/daemon/serviços selecionados falham. Profiles desativados são reportados como não testados, não como recursos obrigatoriamente instalados. `ai test` usa container temporário para testar GPU mesmo com apenas core. Logs próprios de bootstrap ficam em `.logs`; logs de serviço vêm do Docker.

Comando `update` usa exatamente as versões do Git; não corrige automaticamente uma tag removida do registry. Rede corporativa/proxy pode exigir configuração explícita de Docker dentro da distro, versionada e sem secrets no Git. Não copie daemons/credenciais de outras distros.
