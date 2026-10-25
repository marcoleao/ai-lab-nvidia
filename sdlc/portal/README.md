# Portal SDLC — fundação

Os [padrões de experiência e navegação](docs/PADROES_DE_EXPERIENCIA.md) são a referência central para identidade visual, arquitetura da informação, filtros, ordenação, paginação, histórico, acessibilidade e revisão de novas funcionalidades. O documento inclui o inventário das lacunas atuais e o plano de adoção; as telas existentes ainda serão adaptadas gradualmente.

A [adoção real dos padrões aprovados](../docs/implementacao-padroes-experiencia-2026-10-24.md) inclui filtros recolhidos, recorte/quantidade visíveis, carregamento com ícone animado, falhas em vermelho e ordenação pelos nomes das colunas. Listas/cartões mantêm controles de campo/direção. Sistemas, filhos e histórico canônico usam consultas paginadas próprias; a seleção de Histórias de Releases não fica limitada às primeiras 5.000 e preserva escolhas fora da página. Conversas/lookups e projeções legadas ainda têm pendências registradas no inventário, sem alterar os gates ou o orçamento da LLM.

O menu **Integrações**, após Releases, reúne o quadro de prontidão das ferramentas conectadas ao SDLC. A página Sistemas concentra a consulta da hierarquia.

Na consulta de um Sistema, a lista de Projetos mostra PLANNED e ACTIVE não arquivados por padrão. Marque **Mostrar projetos inativos** para incluir COMPLETED, CANCELLED e os arquivados. A contagem indica quantos Projetos estão visíveis em relação ao total disponível.

Sistemas possuem os status ACTIVE e INACTIVE. A lista mostra ACTIVE não arquivados por padrão; **Mostrar sistemas inativos** inclui INACTIVE e os arquivados. Na aba Configurações do Sistema, use a ação da faixa superior para inativar ou reativar. A mudança preserva os itens e recursos vinculados. O inventário do dashboard contabiliza os dois status.

Arquivamento é identificado separadamente como **ARCHIVED**, preservando o status e o ciclo originais. Itens arquivados e seus descendentes podem ser abertos para consulta da hierarquia, descrição, componentes, ambientes do Sistema e histórico, sem ações de alteração ou execução. Mostrar um arquivado não restaura seus dados ao planejamento ativo.

O menu **Assistente**, entre Visão geral e Sistemas, concentra a entrevista de requisitos e substitui o botão flutuante. Escolha Sistema e Projeto para conversar com a assistente com perfil de Analista de Sistemas e TechLead. Revise a proposta ou confirme a conclusão da entrevista para criar épicos, histórias e tarefas no destino selecionado. Conversas e propostas anteriores continuam disponíveis no contexto original.

As [conversas por escopo](../docs/conversas-por-escopo-2026-10-24.md) mantêm o planejamento no Projeto e os esclarecimentos específicos na História. A aba Conversas reúne mensagens das fontes próprias e referências compartilhadas, com paginação e origem identificada. Uma interação concluída pode ser relacionada às Histórias afetadas do mesmo Projeto; a associação registra a versão observada, preserva o conteúdo na origem e mantém o escopo e os gates. Acervo e contextos encerrados são somente leitura. Os indicadores aprovados permanecem, sem novas metas.

As novas Histórias guardam especificação estruturada: descrição detalhada, objetivo e atores, entradas/validações, saídas, regras, aceite funcional e técnico, dependências, exceções, requisitos não funcionais, premissas e limites. Os detalhes podem ser consultados na proposta e na aba Especificação da História. Perguntas em aberto bloqueiam a conclusão; respostas inválidas não criam parte do plano. O dashboard possui a seção Assistente, com as métricas aprovadas e comparação de quatro semanas. Consulte o contrato em [arquitetura](docs/ARCHITECTURE.md).

História e Tarefas agora usam a navegação aprovada no [plano de evolução](../docs/evolucao-historia-tarefas-ux-2026-10-23.md): a História apresenta o resumo da entrega; cada Tarefa reúne seu trabalho, resultados e tentativas. Fase e situação permanecem visíveis, e uma área contextual concentra a próxima ação, as confirmações, a conversa e o processamento. Ela abre por padrão no desktop; no celular, a entrada identifica a atividade. O portal preserva a escolha de abertura do usuário.

As decisões usam a jornada calculada pelo backend, sem resultados simulados. Fila, heartbeat do executor e eventos de ferramenta são sinais distintos; uma consulta da tela não prova avanço do modelo. Tarefas planejadas só recebem conclusão automática quando o usuário vincula explicitamente seu escopo e o critério de publicação. O formulário protege alterações concorrentes e preserva rascunhos. Resultados antigos continuam consultáveis sem criar Tarefas retroativamente; conversas auxiliares não substituem a tentativa principal da atividade.

CODE REVIEW e SECURITY SCAN agora são executados na História antes de liberar o merge. Consulte o [contrato das verificações, correção pela IA e métricas](../docs/verificacoes-qualidade-2026-10-23.md). O scanner inicial cobre regras SAST e segredos; outros scanners e a execução de testes continuam no backlog.

A navegação real passou a adotar o [protótipo revisado](../docs/implementacao-interface-2026-10-22.md): abas por contexto, ações próximas ao breadcrumb e Releases no menu principal. Releases vazias e composição de Histórias já são persistidas com controle de versão, permissões e idempotência. As etapas de QA, homologação e produção ainda dependem dos executores previstos no backlog; nenhum resultado simulado é usado no portal.

O [dashboard organiza os indicadores por assunto](../docs/navegacao-dashboard-2026-10-22.md), exibindo uma seção por vez. Os filtros são compartilhados e ficam em “Filtrar indicadores”; o recorte aplicado permanece visível. Releases separa etapa atual, tempo em composição e comparação semanal.

Na História, o [assistente de merge](../docs/assistente-merge-2026-10-22.md) complementa a revisão direta no GitLab. O pedido identifica MR/branches/SHA e exige confirmação; Draft, pipeline, conflito e proteções continuam obrigatórios. A credencial da conta `sdlc-agent-for-merge` fica exclusiva no backend. Conclusões, bloqueios, falhas e duração aparecem no dashboard, sem tratar merge como deploy ou História concluída.

Portal local separado do legado: hierarquia, aprovação de planejamento, Tarefas, histórico, execução assistida e integração de código. A instalação inicia vazia. Os agentes e as integrações dependem de configuração e das decisões autorizadas no fluxo; a criação de um Sistema não inicia geração de código ou deploy.

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
