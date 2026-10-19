# Estado da implementação

## Disponível

- GitLab, Runner e servidor de demos integrados ao bootstrap: preparação, início,
  parada, reinício, estado, diagnóstico, logs e teste completo de entrega local.
- Extensão separada em `vscode/`, com `vscode/bootstrap.ps1 install`, `package` e `test`.

- Configuração separada em `config/environment.json`, sem endpoint presumido entre distros e VM.
- Política inicial em `policies/pilot.json`.
- Contrato JSON Schema de aprovação em `contracts/approval.schema.json`.
- Funções puras de referência para transições e autorização em `scripts/Governance.ps1`.
- Comandos `plan` e `validate`, executáveis no PowerShell sem instalar dependências.
- Pacote de instalação do núcleo: distro própria, imagens/dependências fixadas, serviços com papéis de banco restritos e dados sintéticos.
- Operação `prepare/up/down/restart/status/doctor/logs`, acesso por clipboard, revogação/rotação, teste e relatório.
- Backup cifrado e restauração de verificação em banco separado; exportação do backup e da chave por canais distintos.
- Núcleo instalado na distro definitiva e acesso ao portal confirmado pelo responsável em 2026-10-15; [registro do aceite e limites](aceite-nucleo-2026-10-15.md).
- Inventário reproduzível `readiness`: recursos Windows, virtualização, laboratório ativo, modelos locais e saúde do portal; relatório em `.state/readiness-report.json`, sem habilitar workers.
- Planejamento de outcomes, épicos e histórias no portal, com issues versionadas no Forgejo privado, snapshots, histórico, escopo protegido e verificação da fonte nas decisões. Consulte [uso, aceitação e limites](backlog.md).
- Atualização instalada e verificada na distro definitiva em 2026-10-15: [pacote, testes e backups](entrega-backlog-2026-10-15.md). Aceite humano do novo fluxo permanece pendente.
- [Chat VS Code](../../vscode/README.md): entrevista local, resumos propostos, histórico PostgreSQL, recuperação, cancelamento e transporte WSL restrito. A versão 0.2 acrescenta encerramento explícito da entrevista e publicação humana de propostas; edição conversacional, aprovação por história e execução de código continuam pendentes. Consulte a [correção da entrevista](correcao-entrevista-2026-10-16.md).
- Chat C1 instalado em 2026-10-16, com entrevistas reais, persistência após reinício e backup verificado: [roteiro de aceite e evidências](entrega-chat-2026-10-16.md).

```powershell
.\sdlc\bootstrap.ps1 plan
.\sdlc\bootstrap.ps1 validate
```

`plan` e `validate` não importam distros nem iniciam containers. `prepare` importa/configura somente a distro própria e prepara o runtime usando internet; `up` instala o núcleo com as imagens já preparadas. Nenhum comando conecta modelos ou altera o laboratório. Revise o [roteiro de instalação e aceitação](aceitacao-do-ambiente.md) antes de executar operações de instalação.

Os testes PowerShell validam funções de referência. A API Python possui modelos próprios de validação, autenticação com identidades persistentes e transações; ainda não há teste de equivalência completa com o arquivo JSON Schema. As funções PowerShell não são expostas ao cliente.

## Próximos marcos

O [núcleo de controle](../services/control/README.md) possui 32 testes passando na suite HTTP/persistência e backup, com PostgreSQL descartável e testes específicos de migração em SQLite. Um teste separado de navegador também passou em Chromium, incluindo o planejamento. Inclui identidades persistentes, papéis por projeto, sessões humanas, CSRF e consumidor local da outbox com recuperação e retomada autorizada. O núcleo está instalado; gates completos de execução e entrega permanecem pendentes.

1. Completar gates específicos de release. Papéis restritos no banco, sessão humana e primeira interface do portal estão implementados e testados.
2. Aceitar o novo fluxo de planejamento Forgejo no portal; ampliar dependências, importação e reconciliação automática. O ciclo de entrega ainda depende dos workers e gates seguintes.
3. Ampliar o manifesto offline e a revisão de licenças aos futuros componentes. O núcleo já possui imagens por digest e dependências por hash.
4. Concluir o checklist de recuperação/offline e verificar VM, recursos e rede antes de adicionar workers. Acesso ao núcleo instalado foi aceito pelo responsável.
5. Integrar inferência e workers restritos e executar o piloto.

O [portal humano](../services/control/web/README.md) possui interface local, sessões de 30 minutos, proteção CSRF e decisões. O pacote Compose com proxy de entrada foi ensaiado em recursos temporários: acesso pelo Windows, permissões de banco, revogação/rotação, reinício, cifragem e restore-check. A distro definitiva foi importada e configurada; o teste automático instalado passou e o responsável confirmou acesso ao portal. A confirmação não substitui evidências individuais do checklist completo. VM, inferência e aplicação de produto permanecem pendentes.
