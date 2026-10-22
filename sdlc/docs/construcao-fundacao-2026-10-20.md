# Construção da fundação — 20/10/2026

**Continuação:** [planos revisáveis e aplicação confirmada](planos-revisaveis-2026-10-20.md) permitem criar Épicos, Histórias e Tarefas após entrevista e revisão humana, sem iniciar execução.

**Continuação:** [assistente real com conversa persistida](assistente-real-2026-10-20.md), substituindo a prévia de perguntas fixas. A assistente entrevista e propõe texto; planos estruturados agora podem ser revisados e aplicados com confirmação explícita, conforme a continuação acima.

**Atualização de domínio:** repositórios e ambientes passaram a pertencer ao Sistema; Projetos representam iniciativas temporárias e selecionam componentes reutilizáveis. Ver [modelo implementado e migração](sistemas-projetos-repositorios-2026-10-20.md). Essa decisão substitui as descrições originais de repositório/ambientes por Projeto abaixo.

Nova interface em **http://localhost:3310**, separada do portal legado em 3100, com banco e volumes próprios. O ambiente humano da nova interface foi iniciado vazio; nenhum dado de teste foi copiado para ele. Não houve migração ou atualização dos serviços legados.

## Entregue

- Monorepo TypeScript em `sdlc/portal`, Next/React, Fastify/Zod e Prisma/PostgreSQL, com dependências fixadas e lockfile. Build de produção e checagem estrita da API.
- Sistema → Projeto → Épico → História → Tarefa, CRUD de nomes/descrições, chaves e vínculos fortes, arquivamento em cascata sem remover GitLab, ambientes QA/HML/PRD inicialmente NOT DEPLOYED.
- Status definidos pelo usuário, aprovações de planejamento de Projeto/Épico independentes dos gates, transições de tarefas e reabertura justificada. História não pode saltar manualmente para produção. Épico não pode terminar com Histórias pendentes.
- Mutações transacionais com idempotência, concorrência serializada, controle de versão e papéis de persona explícitos no modo local. Condições técnicas não incrementam a versão de planejamento, evitando conflito artificial com rascunhos humanos.
- Histórico básico persistido e agregado dos descendentes, com autor humano/sistema e proteção append-only no PostgreSQL. A fase de artefatos/filtros/paginação/SSE permanece pendente.
- UX desenhada e revisada por agente especializado: estados vazios, criação contextual, breadcrumb, persona mantida na sessão, rascunhos preservados, processo da História com os nove status, ambientes sem links fictícios e diálogo de arquivamento.
- Bootstrap independente: prepare com internet, up com imagens locais e verificação de fonte/IDs/label de imagem; down preserva o banco. Nenhuma distro nova foi instalada. O socket Docker não é montado na API.
- Adapter GitLab real e job de provisionamento persistido, com marca de propriedade, colisão segura, contrato neutro de runtime Node/Python, main protegida e retomada. A conexão da prévia humana foi posteriormente ativada; ver [integrações](integracoes-2026-10-20.md). Readiness mostra indisponibilidades sem respostas substitutas.
- Job de CI acrescentado para build, contratos PostgreSQL e Chromium. Configuração adicionada ao GitHub Actions, sem alegar execução remota nesta entrega.

## Evidências

- **17 contratos automatizados passaram**: 13 de domínio/API/PostgreSQL e quatro do adapter/contratos neutros, incluindo a recusa de remover proteção de repositório com código de negócio. O teste real GitLab é separado e não é contado como aprovado por mock.
- **E2E Chromium passou**: criação humana simulada dos cinco níveis em banco descartável, aprovação de Projeto/Épico, Tarefa DOING/DONE, breadcrumb, reload, persistência de persona, desktop 1440 px e tablet 768 px sem overflow global. Testados também foco no botão, abertura por Enter e cancelamento do diálogo com Escape.
- **Revisão visual UX aprovada** após corrigir etapas ocultas em tablet. Sequência vertical nesse tamanho mostra os nove status integralmente. Ver [parecer e limites](ux-fundacao-2026-10-20.md). Leitor de tela e acessibilidade integral não foram aceitos por essas capturas.
- Preparação da imagem e migração real na instalação nova passaram. Fonte ligada à imagem por hash e IDs locais registrados em `.prepared/manifest.json` privado.
- Windows: GET `/` e `/api/health` na porta 3310 retornaram HTTP 200; a API identificou `scope=portal-foundation` e `databaseMode=preview`.
- Consulta somente leitura ao banco humano confirmou **0 itens, 0 eventos de histórico, 0 ambientes e 0 jobs** antes da entrega. Fixtures de navegador/API ficaram exclusivamente no banco `portal_test` descartável.

**Aceite real GitLab passou** em instalação descartável: runtimes Node e Python, reutilização dos mesmos grupos/repositórios, exatamente um commit neutro por repositório, zero pipelines e main sem push direto ou force push. Os recursos temporários foram removidos pelo ensaio; o GitLab permanente não recebeu fixtures. A conexão da prévia humana foi posteriormente ativada; ver [integrações](integracoes-2026-10-20.md).

## Primeiro teste humano

Atualização: o usuário aprovou a hierarquia e a clareza da navegação. Foi acrescentada uma [prévia de assistente lateral](assistente-planejamento-2026-10-20.md), somente de interface, para experimentar entrevista e revisão de um rascunho sem criar itens.

Correção de visibilidade: a lista de filhos passou a preceder Contexto e Ambientes, seguindo revisão de UX. No projeto, os Épicos ficam logo após a hierarquia e eventual formulário. A inspeção Chromium identificou anteriormente o link do épico a 1076 px do topo, fora da janela de 900 px; os dados estavam preservados. Após a correção, o link passou a 510,5 px e ficou visível na mesma janela de 900 px, confirmado em Chromium e captura visual. Build de produção passou. A alteração é de apresentação, sem migração ou alteração de registros. Na consulta da História, por solicitação do usuário, o gráfico do ciclo precede a lista de Tarefas; nos Projetos, a lista de Épicos continua em destaque.

1. Abrir http://localhost:3310 e selecionar Admin ou Ana/Product Owner.
2. Escolher seu próprio domínio e criar Sistema, Projeto, Épico, História e Tarefa.
3. Avaliar se a próxima ação, os status e o contexto estão claros. Voltar pelo breadcrumb e recarregar a página.
4. Se desejar, aprovar Projeto/Épico e atualizar uma Tarefa para DOING/DONE. Essas ações não iniciam construção ou deploy.

Não executar testes sintéticos contra essa prévia. O [roteiro](../portal/docs/DEMO_GUIDE.md) apoia o usuário sem fornecer projeto pronto.

## Próximas entregas e limites

A evolução atual inclui conversa e criação de planejamento pela assistente e a primeira fatia de [execução assistida: especificação, G1 e código em Merge Request em rascunho](execucao-assistida-2026-10-20.md). G2/G3, execução isolada de testes, Code Review automático, scanners, pacotes, deploys e Blue/Green permanecem pendentes. As integrações não configuradas permanecem indicadas na tela. Os modelos do laboratório não foram alterados, instalados ou baixados.

SDLC-04/06 estão implementados nesta fundação; SDLC-07 recebeu aceite humano da hierarquia e clareza da navegação em 20/10/2026, com possibilidade de evolução conforme novas funcionalidades. SDLC-05 cobre a hierarquia/ambientes/histórico; modelos de execução/release entram nas fases seguintes. SDLC-03 registra decisões adotadas e pendências de executor/registry/migração. SDLC-09 fornece readiness básica, sem afirmar descoberta completa de modelos, autenticação de registry ou aceite do executor. SDLC-10 tem apenas o histórico inicial.

O banco novo ainda não participa do backup/exportação do legado. Recuperação própria, compatibilidade da extensão, importação e cutover continuam em SDLC-29. O ensaio não equivale a reinstalação limpa de Windows/WSL ou prova de bloqueio completo de saída do novo stack.
