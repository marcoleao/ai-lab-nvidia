# Backup e recuperação

O lab inteiro está no VHDX da distro. Git contém definição, não dados. Antes de nuke, exporte a distro para um **backup escolhido conscientemente fora do diretório gerenciado**:

```powershell
.\bootstrap.ps1 down
wsl --terminate ai-local-lab
wsl --export ai-local-lab D:\Backups\ai-local-lab.tar
```

O backup contém secrets, modelos, notebooks e imagens: proteja-o. Backups externos criados pelo operador não são apagados por nuke; portanto uma exportação conserva dados de IA fora do lab por escolha explícita. Para remoção completa inclusive backups, remova-os separadamente após conferência. Não importe sobre uma distro existente.

O caminho mais simples para recuperar infraestrutura é `bootstrap` novamente; ele refaz imagens/volumes e downloads declarados. Para recuperar dados, copie backups selecionados para a nova distro usando volumes específicos com containers parados. Um restore completo via `wsl --import` exige conservar/reconciliar os marcadores Windows/Linux e o BasePath; a CLI não adota automaticamente imports manuais. Nunca copie marcador de uma distro para autorizar remoção de outra.

Perda de `.env` com distro viva: recupere `/opt/ai-local-lab/.env` da própria distro para a raiz do Git antes de `up`, mantendo-o fora do versionamento. Gerar novo `WEBUI_SECRET_KEY` pode invalidar sessões/dados cifrados. Código escrito apenas em workspace ou notebooks se perde no nuke; copie para Git/backup previamente.

Falha parcial de nuke: unregister remove registro/VHDX; arquivos gerados restantes podem ser removidos repetindo nuke com o marcador externo preservado. Se o marker ou identidade estiverem inconsistentes, a CLI interrompe: inspecione manualmente antes de prosseguir. Não use remoções globais de WSL ou Docker como recuperação.
