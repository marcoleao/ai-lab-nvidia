# Ciclo de vida

| Ação | Containers/rede | Dados app | Modelos | Imagens/engine/distro |
| --- | --- | --- | --- | --- |
| down | remove | mantém | mantém | mantém |
| up | converge | mantém | baixa ausentes | mantém/converge |
| restart | reinicia | mantém | mantém | mantém |
| reset | recria | remove/recria | mantém por padrão | mantém |
| destroy | remove | remove | mantém por padrão | mantém |
| rebuild | recria | mantém | mantém | reconstrói imagens próprias |
| update | recria | mantém | repuxa declarações | pull de tags configuradas |
| nuke | elimina | elimina | elimina | elimina toda distro própria |

Modelos são volume externo do projeto Compose, com label de propriedade. `down -v` remove todos os outros volumes. `preserve_models: false` remove também esse volume em reset/destroy após conferir label. Dados app incluem cache Hugging Face e notebooks Jupyter. Código no bind mount workspace não é volume Compose; permanece até nuke.

Ephemeral substitui volumes WebUI/Qdrant/Jupyter por tmpfs, sem apagar volumes persistentes anteriores. Ao voltar ao modo persistente, os dados antigos voltam. RAM de tmpfs é liberada quando o container para. Modelos efêmeros são opcionais e podem exigir dezenas de GB de RAM.

Matriz de aceite na workstation:

```powershell
.\bootstrap.ps1                    # A: host limpo, GPU e modelo
.\bootstrap.ps1                    # B: idempotência
.\bootstrap.ps1 down
.\bootstrap.ps1 up                 # C: estado preservado
.\bootstrap.ps1 reset              # D: confirma DELETE
.\bootstrap.ps1 rebuild            # E: build + smoke
.\bootstrap.ps1 nuke               # F: confirma NUKE
.\bootstrap.ps1                    # G: recriação limpa
```

Antes de nuke, faça backup dos dados necessários. Compare `wsl --list --verbose` antes/depois para demonstrar preservação das demais distros. Execução desses cenários destrutivos é responsabilidade consciente do operador; eles não são executados pela CI pública.
