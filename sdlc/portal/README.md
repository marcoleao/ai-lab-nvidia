# Portal SDLC — fundação

**RA-10c publicada:** proposta local revisada pode ser enviada ao GitLab como commit e Draft MR próprios, com fila/recuperação e continuação parcial sem repetir commit. Integração na branch padrão é a próxima RA-10d; execução permanece indisponível. Indicadores existentes mantidos. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#35-recibo-ra-10c--envio-controlado-do-contrato-ao-gitlab). OK manual pendente.

**RA-10b publicada:** no Repositório do Sistema, o arquiteto prepara proposta local do contrato com perguntas, versões e revisão explícita. Pedido recuperável entre abas/recarga; revisão não publica nem libera execução. Indicadores existentes mantidos. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#34-recibo-ra-10b--proposta-e-revisão-locais-do-contrato). OK manual pendente.

**RA-10a publicada:** consulta do contrato de execução do Sistema por commit, com validação estrutural/entradas e execução indisponível nesta fatia. [Recibo/roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#33-recibo-ra-10a--consulta-do-contrato-de-execução).

**RA-09f publicada:** rastreabilidade da execução exata planejada e da integração conhecida, sem compor pacote ou implantar. [Recibo/roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#32-recibo-ra-09f--rastreabilidade-do-código-na-composição).

**RA-09e publicada:** fechamento remoto histórico pelo portal, com pedido durável e recuperação por consulta do mesmo job. [Recibo/roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#31-recibo-ra-09e--fechamento-remoto-do-mr-anterior).

**RA-09d publicada:** encerramento local histórico de MR comprovado fechado, com fonte imutável e consulta posterior preservada. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#30-recibo-ra-09d--encerramento-do-acompanhamento-histórico).

**RA-09c publicada:** verificação e confirmação histórica positiva, com tentativa original/ciclo atual preservados. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#29-recibo-ra-09c--confirmação-histórica-posterior).

**RA-09b publicada:** consulta e captura histórica confirmada no portal, com autoria, auditoria e recuperação persistente, preservando merge/release. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#28-recibo-ra-09b--captura-histórica-controlada).

**RA-09a publicada:** referência de origem/integração com merge/squash, consulta corrente/histórica e ausência legada explícita. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#27-recibo-ra-09a--referência-preservada-da-integração).

**RA-08b publicada:** novo ciclo após integração/testing com revisão e outro Gateway, preservando tarefas, release e MR anterior. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#26-recibo-ra-08b--novo-ciclo-de-desenvolvimento).

**RA-08a publicada:** confirmação do destino DEV e do commit no Gateway de Especificação, agentes com base fixa e release opcional. Métricas existentes mantidas. [Recibo, roteiro e limites](../docs/plano-incremental-releases-ambientes-2026-10-27.md#25-recibo-ra-08a--destino-explícito-no-gateway-de-especificação).

**RA-07 publicada:** preparação controlada da branch após decisão válida e confirmação, recuperação por leitura e indicadores na Visão Geral sem metas. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#24-recibo-ra-07--preparação-controlada-da-branch).

**Execução do Épico corrigida:** acompanhamento primeiro, ciclo/retomada/planejamento recolhidos, motivo alinhado, impedimentos completos e confirmação contextual. 51 testes de aplicação, 8 de auditoria e 20 cenários de navegador aprovados. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#23-correção-transversal--execução-do-épico).

**RA-06b publicada — decisão do plano no portal:** política/base inicial por contexto, confirmação explícita, autoria/auditoria e reconciliação durável. Sem escrita GitLab ou escolha automática da base real. 101 testes de aplicação, 8 de auditoria e 48 cenários de navegador aprovados. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#22-recibo-ra-06b--decisão-local-do-plano).

**RA-06a publicada — consulta/proposta de branches:** Release → Composição → Plano de branches e base. Repositório/commit observados, proposta não aprovada e DE-01/02 separados; SHA só para análise e integrações remotas paginadas. Sem escrita GitLab, aprovação ou alteração de dados por GET. 74 testes de aplicação, 8 de auditoria e 42 cenários de navegador aprovados. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#21-recibo-ra-06a--consulta-e-proposta-de-branches).

**RA-05b publicada — referência e cadastro separados:** fase/versão administrativa não invalida planejamento; conteúdo, especificação ou SHA alterados exigem contexto revisado. Sem release e Planejamento a revisar são recortes distintos. Editor preserva escolhas e atualiza só CAS administrativo quando não houve mudança de referência. 57 testes de aplicação, 8 de auditoria e 38 cenários de navegador aprovados; registros antigos não são reinterpretados. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#20-recibo-ra-05b--vigência-das-referências-de-planejamento).

**RA-05a publicada — composições preservadas:** revisões imutáveis e participações históricas separadas do planejamento atual, com consultas recolhidas/paginadas na Release e História. Transferir/retirar não apaga as referências registradas. 73 testes de aplicação, 8 de auditoria e 31 cenários de navegador aprovados. Copiar/fechar/promover e vigência por conteúdo/código continuam nas fatias próprias. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#19-recibo-ra-05a--composições-e-participações-preservadas).

**RA-03 publicada — desenvolvimento e conclusão separados:** lista do Épico, História e Tarefas compartilham leitura de desenvolvimento sem aprovação registrada e conclusão dependente de produção. Revisões/SHA ficam em detalhes recolhidos; versão do cadastro não concede aprovação. 74 testes de aplicação, 8 de auditoria, 65 cenários de navegador e UX aprovados. Ação Desenvolvimento Finalizado permanece RA-14; OK do usuário pendente. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#17-recibo-ra-03--desenvolvimento-e-conclusão-separados).

**RA-04b publicada — cancelamento auditado:** Administrador/Release Manager pode cancelar OPEN/CLOSED com motivo e confirmação. A decisão fica preservada, sem reabertura ou alteração de composição/Histórias/implantação; resposta incerta reutiliza a solicitação. Rascunhos e os ajustes recentes de layout permanecem. 52 testes de aplicação, 8 de auditoria e 28 cenários de navegador aprovados. Fechamento/cópia/promoção seguem pendentes. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#16-recibo-ra-04b--cancelamento-auditado-da-release).

**RA-04a publicada:** releases usam OPEN/CLOSED/CANCELED e nascem OPEN em DEV, como posição do fluxo, sem implantação atestada. Persistência, consultas, associação e métricas adaptadas. Cancelamento entregue pela RA-04b; fechar, copiar e promover continuam nas fatias próprias. 66 testes de aplicação, 8 de auditoria e 61 cenários de navegador aprovados; 30 tabelas intactas e somente os metadados de Release previstos na migration alterados. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#14-recibo-ra-04a--estados-da-release-e-dev-inicial). OK do usuário pendente.

**Trilho de entrega RA-02-C2 publicado:** após Merge Request, consultar DEV → QA → HML → PROD na História e nas Tarefas. DEV pertence ao desenvolvimento individual da História, com release opcional; QA exige release e candidata imutável. Esta fatia entrega navegação/pré-requisitos, sem executar publicação ou promoção. [Acompanhamento e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#12-ajuste-ra-02-c2--trilho-de-entrega-da-história).

**Correção RA-02-C1 disponível:** Releases separa composição de ambientes e mostra DEV/QA/HML/PRD sem rótulos de compatibilidade. A fase Merge Request é persistida e coerente na lista, filtros e detalhe da História. A base do laboratório foi corrigida por manutenção auditada, conforme autorização do usuário; evidências reais preservadas. 110 testes de aplicação e 66 de navegador aprovados. [Recibo e roteiro](../docs/plano-incremental-releases-ambientes-2026-10-27.md#11-correção-ra-02-c1--releases-e-fase-da-história). Novo aceite pendente.

O [plano incremental de releases e ambientes](../docs/plano-incremental-releases-ambientes-2026-10-27.md) é o acompanhamento corrente dessa evolução: inventário do código afetado, 30 entregas RA-00–RA-29, testes e quadro de OK do usuário. As [regras correntes](../docs/releases-promocao-2026-10-22.md#contrato-corrente-dev-candidatas-e-conclusão-em-produção--27102026) distinguem Desenvolvimento Finalizado em DEV e conclusão da História em PRD, exigem todas as Histórias prontas antes de QA e preservam candidatas ao retirar conteúdo. O recorte implementado e publicado alcança RA-01/RA-02: leitura separada e cadastro de referências; infraestrutura, candidatas e executores de implantação seguem nas entregas posteriores.

As [definições de releases e ambientes consolidadas em 27/10/2026](../docs/releases-promocao-2026-10-22.md#consolidação-de-domínio--27102026) separam composição, candidata imutável, implantação e validação. DEV, QA, HML e PRD são ambientes; DEV admite versões de trabalho e QA recebe candidatas identificadas. O documento distingue decisões acordadas, propostas até QA e os parâmetros técnicos ainda abertos; seu contrato corrente já fixa a conclusão da História na entrada confirmada em PRD. RA-02-C1 também separa composição e ambientes no modelo corrente; infraestrutura e executores de ambiente continuam no backlog.

Os [padrões de experiência e navegação](docs/PADROES_DE_EXPERIENCIA.md) são a referência central para identidade visual, arquitetura da informação, filtros, ordenação, paginação, histórico, acessibilidade e revisão de novas funcionalidades. O documento inclui o inventário das lacunas atuais e o plano de adoção; as telas existentes ainda serão adaptadas gradualmente.

A [adoção real dos padrões aprovados](../docs/implementacao-padroes-experiencia-2026-10-24.md) inclui filtros recolhidos, recorte/quantidade visíveis, carregamento com ícone animado, falhas em vermelho e ordenação pelos nomes das colunas. Listas/cartões mantêm controles de campo/direção. Sistemas, filhos e histórico canônico usam consultas paginadas próprias; a seleção de Histórias de Releases não fica limitada às primeiras 5.000 e preserva escolhas fora da página. Conversas/lookups e projeções legadas ainda têm pendências registradas no inventário, sem alterar os gates ou o orçamento da LLM.

O menu **Integrações**, após Releases, reúne o quadro de prontidão das ferramentas conectadas ao SDLC. A página Sistemas concentra a consulta da hierarquia.

Na consulta de um Sistema, a lista de Projetos mostra ACTIVE não arquivados por padrão. Marque **Mostrar projetos inativos** para incluir INACTIVE, COMPLETED, CANCELLED e os arquivados. A contagem indica quantos Projetos estão visíveis em relação ao total disponível.

Sistemas possuem os status ACTIVE e INACTIVE. A lista mostra ACTIVE não arquivados por padrão; **Mostrar sistemas inativos** inclui INACTIVE e os arquivados. A inatividade bloqueia mutações e início de trabalho em toda a árvore; reativar preserva os itens e recursos vinculados e exige retomada explícita das filas. O inventário do dashboard contabiliza os dois status.

A [estabilização até a codificação](../docs/estabilizacao-ate-codificacao-2026-10-25.md) remove a aprovação própria de Projeto/Épico e mantém G1 na História. Histórias manuais e de agentes admitem especificação e plano técnico editáveis, rascunho paralelo e revisões imutáveis. Toda nova História recebe seis Tarefas obrigatórias, usadas pelo próprio pipeline. Cancelamento e reabertura são explícitos e preservam resultados anteriores. O documento registra validação e limites; esta revisão foi publicada localmente em 25/10/2026, mediante autorização, com backup e preservação dos registros existentes. Os fluxos posteriores à codificação terão revisão separada.

Arquivamento é identificado separadamente como **ARCHIVED**, preservando o status e o ciclo originais. Itens arquivados e seus descendentes podem ser abertos para consulta da hierarquia, descrição, componentes, ambientes do Sistema e histórico, sem ações de alteração ou execução. Mostrar um arquivado não restaura seus dados ao planejamento ativo.

O menu **Assistente**, entre Visão geral e Sistemas, concentra a entrevista de requisitos e substitui o botão flutuante. Escolha Sistema e Projeto para conversar com a assistente com perfil de Analista de Sistemas e TechLead. Revise a proposta ou confirme a conclusão da entrevista para criar épicos, histórias e tarefas no destino selecionado. Conversas e propostas anteriores continuam disponíveis no contexto original.

As [conversas por escopo](../docs/conversas-por-escopo-2026-10-24.md) mantêm o planejamento no Projeto e os esclarecimentos específicos na História. A aba Conversas reúne mensagens das fontes próprias e referências compartilhadas, com paginação e origem identificada. Uma interação concluída pode ser relacionada às Histórias afetadas do mesmo Projeto; a associação registra a versão observada, preserva o conteúdo na origem e mantém o escopo e os gates. Acervo e contextos encerrados são somente leitura. Os indicadores aprovados permanecem, sem novas metas.

As novas Histórias guardam especificação estruturada: objetivo, comportamento esperado, atores, entradas/saídas, regras, aceite funcional e técnico, dependências e tópicos complementares. Uma História pode nascer apenas com título e Épico. Preparar exige objetivo, comportamento e critério funcional; G1 exige plano técnico válido e ausência de dependências impeditivas pendentes. Os detalhes podem ser editados e consultados na aba Especificação, com autoria e histórico separados da origem da História. O dashboard apresenta as métricas aprovadas em quatro semanas. Consulte o contrato em [arquitetura](docs/ARCHITECTURE.md).

História e Tarefas usam a navegação aprovada nos [padrões centrais](docs/PADROES_DE_EXPERIENCIA.md): a História entra em Tarefas e reúne cinco abas — Tarefas, Execução, Especificação, Conversas e Mais. Execução apresenta a etapa atual e sua confirmação no mesmo painel; sinais, conversa, vínculos de escopo, destino e release são abertos sob demanda. Marca, menu, persona, breadcrumb, estado e edição permanecem. Cada Tarefa conserva seu trabalho, resultados e tentativas.

G1 é apresentado como **Gateway de Especificação**. A aprovação existente autoriza e enfileira a codificação; consulta e navegação não iniciam agentes. **Um repositório é criado automaticamente para cada Sistema**, com estado e URL em Sistema → Repositório do Sistema (`tab=components` permanece compatível). Projetos, Épicos, Histórias e Tarefas herdam esse destino sem seleção. APIs, frontend, backend, batch e infraestrutura são pastas definidas pela arquitetura dentro do mesmo repositório; o cadastro não impõe linguagem ou estrutura de aplicação. Conteúdos de agentes e registros históricos mantêm o texto original. Veja [contrato e evidências](../docs/revisao-navegacao-historia-2026-10-26.md#18-repositório-único-criado-no-cadastro-do-sistema).

“Preparar especificação” exige o repositório do Sistema pronto e os requisitos da História completos. A pendência explica a causa e aponta para o Sistema, sem pedir associação no Projeto ou na História. Sistemas legados sem repositório têm recuperação explícita; múltiplos repositórios legados exigem revisão e não são fundidos automaticamente. Ana tem permissão de planejamento; essa permissão não substitui os requisitos da execução.

As decisões usam a jornada calculada pelo backend, sem resultados simulados. Fila, heartbeat do executor e eventos de ferramenta são sinais distintos; uma consulta da tela não prova avanço do modelo. Tarefas planejadas só recebem conclusão automática quando o usuário vincula explicitamente seu escopo e o critério de publicação. O formulário protege alterações concorrentes e preserva rascunhos. Resultados antigos continuam consultáveis sem criar Tarefas retroativamente; conversas auxiliares não substituem a tentativa principal da atividade.

CODE REVIEW e SECURITY SCAN agora são executados na História antes de liberar o merge. Consulte o [contrato das verificações, correção pela IA e métricas](../docs/verificacoes-qualidade-2026-10-23.md). O scanner inicial cobre regras SAST e segredos; outros scanners e a execução de testes continuam no backlog.

A navegação real passou a adotar o [protótipo revisado](../docs/implementacao-interface-2026-10-22.md): abas por contexto, ações próximas ao breadcrumb e Releases no menu principal. Releases vazias e composição de Histórias já são persistidas com controle de versão, permissões e idempotência. As etapas de QA, homologação e produção ainda dependem dos executores previstos no backlog; nenhum resultado simulado é usado no portal.

O [dashboard organiza os indicadores por assunto](../docs/navegacao-dashboard-2026-10-22.md), exibindo uma seção por vez. Os filtros são compartilhados e ficam em “Filtrar indicadores”; o recorte aplicado permanece visível. Releases separa etapa atual, tempo em composição e comparação semanal.

Na História, o [assistente de merge](../docs/assistente-merge-2026-10-22.md) complementa a revisão direta no GitLab. O pedido identifica MR/branches/SHA e exige confirmação; Draft, pipeline, conflito e proteções continuam obrigatórios. A credencial da conta `sdlc-agent-for-merge` fica exclusiva no backend. Conclusões, bloqueios, falhas e duração aparecem no dashboard, sem tratar merge como deploy ou História concluída.

Portal local separado do legado: hierarquia, especificação/G1, Tarefas, histórico, execução assistida e integração de código. A instalação inicia vazia. Os agentes e as integrações dependem de configuração e das decisões autorizadas no fluxo; a criação de um Sistema não inicia geração de código ou deploy.

Na raiz do repositório, em PowerShell administrativo na conta da instalação:

```powershell
.\sdlc\portal\bootstrap.ps1 prepare
.\sdlc\portal\bootstrap.ps1 up
.\sdlc\portal\bootstrap.ps1 doctor
```

Abrir **http://localhost:3310**. Selecione explicitamente uma persona para atuar. `prepare` precisa de internet; `up` não constrói nem baixa e recusa fontes/imagens alteradas após a preparação. A distro SDLC deve estar instalada; o comando não instala outra distro ou altera o laboratório. O novo banco tem volume próprio. `down` preserva esse volume.

```powershell
.\sdlc\portal\bootstrap.ps1 status
.\sdlc\portal\bootstrap.ps1 logs
.\sdlc\portal\bootstrap.ps1 down
```

Configuração opcional: copie `.env.example` para `.env` **neste diretório**. GitLab exige URL alcançável de dentro do container e token com permissão para criar os grupos/projetos gerenciados. `localhost` dentro do container não é o Windows ou outro container. O bootstrap não lê tokens antigos automaticamente. Tokens não vão ao navegador. Sem configuração, o usuário pode planejar e a integração fica visivelmente pendente. Nunca use a seleção de persona como autenticação corporativa; este modo é somente local.

Operação equivalente no Linux/WSL, após preparar a imagem, para uma instalação sem overrides de integração:

```bash
python3 scripts/prepared.py verify
docker compose up -d --pull never --no-build
docker compose down
```

Quando existirem `.prepared/compose.integrations.json` e/ou `.prepared/compose.llm.json`, inclua cada arquivo existente com `-f` após `-f compose.yaml` em todas as operações Compose. O bootstrap Windows já faz isso automaticamente. Usar apenas o arquivo base retira a configuração de GitLab/IA do contêiner recriado.

Para desenvolvimento com Node 24 e pnpm 12.14.0, configure `DATABASE_URL` para seu PostgreSQL próprio, `DEMO_MODE=true`, `PORTAL_ORIGIN=http://localhost:3000` e `API_BASE_URL=http://127.0.0.1:4100`. Instale por `pnpm install --frozen-lockfile`, aplique `pnpm db:generate && pnpm db:setup` e execute `pnpm dev`. Não aponte para o banco legado.

## Testes

A [auditoria transversal](../docs/implementacao-auditoria-2026-10-24.md) usa contrato v2, recorder transacional, comparação de valores, consulta segura e conta de runtime restrita. `bootstrap.ps1 up` aplica migrations e configura `.prepared/compose.audit.json` mantendo a credencial fora do repositório. Inclua esse override também nas operações Compose manuais. O painel de indicadores foi adiado; eventos não expiram automaticamente.

`pnpm test` exige banco **descartável** `portal_test` e recria seu schema antes de cada suíte de integração, incluindo as variáveis de teste específicas de releases/qualidade/merge/trabalho. Deixa esse banco vazio para o navegador ao terminar. `pnpm audit:check` valida o catálogo/recorder sem banco. Não usar a URL da base de aceitação. Os novos testes administrativos estão em `../tests/test_audit_admin.py`.

Unitários/integração usam exclusivamente `TEST_DATABASE_URL` terminando em `/portal_test`, com schema preparado em instalação descartável. `pnpm test` cobre estado vazio, hierarquia, papéis, idempotência concorrente, aprovações, status, versão, arquivamento, histórico imutável e adapters. `pnpm build` valida TypeScript e produção web. `pnpm test:e2e` usa Chromium local contra serviços de teste e confirma o modo de banco antes de criar dados. Capturas vão para `test-results/screenshots` ou `SCREENSHOT_DIR`. Não executar esses testes na prévia humana.

`tests/e2e/story-workspace.spec.ts` verifica a navegação História → Tarefa, G1, retomada da mesma solicitação, contexto histórico, sinais de processamento, concorrência dos vínculos e preservação de rascunhos. As jornadas usam dados interceptados no navegador; não executam operações nos projetos do usuário. Atualizações do mesmo item preservam o painel e sua seção; mudanças de contexto continuam carregando o item de destino.

O ensaio real do GitLab está em `scripts/test-gitlab-provider.sh`: exige contêiner de build isolado com código/dependências, cria seu próprio GitLab temporário, verifica reuso, contrato neutro e main protegida, e limpa os volumes. Exige recursos/internet na preparação; não usar durante a apresentação.

Veja [decisões](docs/DECISIONS.md), [arquitetura](docs/ARCHITECTURE.md), [roteiro humano](docs/DEMO_GUIDE.md) e [revisão UX](../docs/ux-fundacao-2026-10-20.md). Migração do legado, recuperação do banco novo e pipeline completo continuam no plano.

## Regressão reproduzível e ambiente rápido

O fluxo recomendado está em [tests/regression/README.md](tests/regression/README.md): ambiente persistente exclusivo da automação, fixtures próprias, catálogo de cenários Playwright, relatórios por caso e regressão limpa independente. Use `regression.ps1 fast` no ciclo diário e `regression.ps1 full` nos marcos. O CI usa o mesmo executor. `pnpm test:e2e` isolado continua sendo um comando de baixo nível: exige o host de teste e uma base explicitamente isolada; não inicia nem prepara o ambiente sozinho.
