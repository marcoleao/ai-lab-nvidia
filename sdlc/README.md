# SDLC agêntico

Execute o bootstrap em PowerShell como administrador, na mesma conta Windows usada para instalar. Sem elevação, ele interrompe com orientação ao usuário.

O bootstrap inicia sem dados de negócio, independentemente de marcadores de instalações anteriores. O usuário cria seu projeto durante a apresentação. `doctor` verifica a instalação sem criar exemplos; aceitação sintética fica restrita ao [ensaio descartável](docs/construcao-fase-0-2026-10-20.md). O comando de demo pré-fabricada foi removido.

A [nova fundação do Portal SDLC](portal/README.md) está em `sdlc/portal`, com navegação hierárquica, status e planejamento na porta 3310. Tem bootstrap e banco próprios; não substitui o portal legado ou migra seus dados nesta etapa. Veja a [revisão de UX](docs/ux-fundacao-2026-10-20.md).

O ambiente de demos agora tem [GitLab e Runner locais](gitlab/README.md), com
Issue, Merge Request, testes, build e publicação manual em rede interna off-line.
GitLab e Runner fazem parte de `.\sdlc\bootstrap.ps1 prepare` e
`.\sdlc\bootstrap.ps1 up`, sem instalação separada.
O mesmo bootstrap controla parada, reinício, estado, diagnóstico, logs e testes.
A [extensão do VS Code](../vscode/README.md) tem instalador independente em
`.\vscode\bootstrap.ps1 install`.
Consulte o [registro da integração e verificações](docs/bootstrap-unificado-2026-10-19.md).
Consulte também a [revisão de criação e operação offline](docs/revisao-criacao-offline-2026-10-19.md), com pré-requisitos, evidências e limites.

Esta área contém as ferramentas e configurações do SDLC local, conectado à inferência de `../lab/`. As demos ficam no GitLab do ambiente SDLC; nenhum projeto gerado é armazenado neste repositório. Workspaces temporários ficam em `/opt/agentic-sdlc/workspaces` na distro do SDLC, e os checkouts do Runner ficam em seu volume local.

- [Arquitetura e governança](docs/sdlc-agentico-proposta.md)
- [Plano do Portal SDLC: fases, backlog e aceite (20/10/2026)](docs/plano-portal-sdlc-2026-10-20.md)
- [Especificação do piloto e plano de instalação](docs/sdlc-agentico-piloto.md)
- [Portal humano: interface, sessões e validação](services/control/web/README.md)
- [Instalação e aceitação do ambiente](docs/aceitacao-do-ambiente.md)
- [Planejamento versionado com Forgejo](docs/backlog.md)
- [Evolução proposta: chat com os agentes no VS Code](docs/chat-sdlc-vscode.md)
- [Extensão VS Code: chat e entrevista local](../vscode/README.md)
- [Experiência de negócio: ideia, plano e decisão](docs/experiencia-negocio-2026-10-16.md)

O núcleo está instalado: PostgreSQL, portal/API, consumidor e demonstração. O responsável confirmou acesso ao portal em 2026-10-15; consulte o [registro de aceite e próxima etapa](docs/aceite-nucleo-2026-10-15.md). O pacote agora inclui planejamento versionado com Forgejo. Agentes, integração com os modelos e entrega de aplicações permanecem pendentes.

## Comandos disponíveis

```powershell
.\sdlc\bootstrap.ps1 plan
.\sdlc\bootstrap.ps1 validate
.\sdlc\bootstrap.ps1 readiness
```

Execute a partir da raiz do repositório. `plan` apresenta o plano e `validate` verifica contratos, sem instalar serviços. `readiness` coleta inventário somente de leitura e grava um relatório local, sem iniciar o laboratório parado nem autorizar workers. Consulte o [estado da implementação](docs/implementacao.md) para os limites e próximos marcos.

Após revisar o [roteiro](docs/aceitacao-do-ambiente.md), a instalação usa `prepare` e `up`; a verificação do ambiente humano usa `doctor`. `test` recusa a instalação permanente; `report` exporta relatórios antigos existentes, sem executar testes. `access` copia a chave pessoal para o clipboard sem imprimi-la. Operação, backup e restore-check têm comandos próprios descritos no roteiro.
