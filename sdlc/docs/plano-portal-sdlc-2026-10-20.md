# Plano de implementação do Portal SDLC

**Atualização de 25/10/2026:** a [estabilização até a codificação](estabilizacao-ate-codificacao-2026-10-25.md) substitui neste recorte as regras históricas abaixo: Projeto/Épico são agrupadores sem aprovação própria; inatividade bloqueia a árvore; História admite especificação editável, G1 e seis Tarefas obrigatórias. O código foi validado em isolamento e publicado localmente mediante autorização em 25/10/2026, com backup e preservação dos registros existentes. O backlog posterior à codificação permanece reservado à próxima revisão; os registros cronológicos abaixo não afirmam a adoção do novo contrato.

**22/10/2026 — implementação do backlog funcional pausada por solicitação do usuário.** A prioridade passa a ser a redefinição da interface e dos padrões de navegação. O backlog abaixo permanece preservado; suas pendências não estão canceladas ou concluídas. O ponto de retomada, o estado atual e os critérios da revisão estão em [Redefinição da interface e retomada do backlog](redefinicao-interface-2026-10-22.md). Este registro prevalece sobre os relatos cronológicos de progresso abaixo.

Primeiro recorte da revisão: [Visão Geral, indicadores e instrumentação](dashboard-metricas-2026-10-22.md), solicitado explicitamente pelo usuário. A existência dos cinco cartões DORA não conclui os processos de deploy/incidentes necessários à sua medição. O backlog funcional permanece pausado.

**Decisão de domínio de 22/10/2026:** [Releases do Sistema e promoção imutável](releases-promocao-2026-10-22.md). Releases agrupam revisões de Histórias; implantações promovem sua composição entre ambientes. Alterar conteúdo ou retirar uma História em HML exige nova candidata, QA com todos os testes e controles, novos gates e nova homologação antes de PRD. O pacote homologado segue para produção sem rebuild ou alteração. Esse contrato complementa SDLC-05/10/18/19/22/23/24/26/27 e prevalece sobre formulações antigas de deploy por Projeto ou validação parcial de uma composição modificada. Incorporar os critérios à retomada, sem marcar essas entregas como implementadas ou retomar o backlog agora.

Planejamento assistido: [propostas versionadas, revisão humana e aplicação transacional](planos-revisaveis-2026-10-20.md) implementados. Isso complementa a entrevista, mas não conclui agentes de especificação/G1, execução de código, scanners ou deploy.

Continuação: [assistente local com fila e conversa persistida](assistente-real-2026-10-20.md) implementada. Entrevista real disponível; proposta estruturada/aplicação de backlog e gates seguem pendentes. A fila de conversa não conclui a máquina de execução de pipeline de SDLC-12.

Evolução das integrações: [provider e canal de inferência local validados](inferencia-local-2026-10-20.md), com catálogo e chamada real ao qwen3:14b. SDLC-09/13 têm avanço parcial; isso não conclui o catálogo por agente, worker, artefatos de especificação ou gates de SDLC-14.

Atualização de domínio implementada: [Sistema contínuo, Projetos temporários e repositórios reutilizáveis](sistemas-projetos-repositorios-2026-10-20.md). A decisão substitui a associação original de repositórios/ambientes por Projeto. Os próximos executores, pacotes e deploys devem consumir o catálogo de componentes do Sistema e os vínculos explícitos de trabalho.

Data: 20/10/2026. Estado: construção iniciada. SDLC-01/02 implementados e verificados em testes e instalação Compose descartável, incluindo reinício e recuperação. O avanço da fundação está descrito abaixo. O núcleo legado não foi atualizado. Consulte as [evidências e limites da Fase 0](construcao-fase-0-2026-10-20.md).

Continuação: [fundação implementada](construcao-fundacao-2026-10-20.md) em `sdlc/portal`, com nova interface na porta 3310 e banco próprio. SDLC-04/06 implementados; SDLC-07 implementado/revisado por UX e aceito pelo usuário quanto à hierarquia e clareza da navegação; SDLC-03/05/09/10 parcialmente atendidos conforme os limites registrados. O núcleo legado e seus dados permanecem preservados. O aceite do adapter GitLab é registrado separadamente nessa evidência.

Fonte: [SPEC_PORTAL_SDLC_AI.md](SPEC_PORTAL_SDLC_AI.md), preservada como recebida. As instruções de implementação contidas na especificação são requisitos para o trabalho futuro; a solicitação desta etapa é elaborar o plano. A orientação direta do usuário prevalece: o projeto da apresentação será criado pelo usuário, durante a demonstração, sem demos pré-fabricadas ou criação autônoma de projetos pelo SDLC.

## Resultado esperado e limites

O portal inicia sem dados de negócio. O usuário escolhe o domínio, cria Sistema → Projeto → Épico → História, pode criar Tarefas e inicia explicitamente o pipeline. Somente depois dessa iniciativa os agentes produzem requisitos, arquitetura, testes, código e evidências; tarefas técnicas e de correção podem ser geradas pelo pipeline. A criação de um projeto pelo usuário pode provisionar seu repositório e esqueleto neutro, sem aplicação de negócio e sem iniciar build/deploy.

Fluxo obrigatório:

`Especificação → G1 humano → Codificação + QA + testes → CR automático → Segurança → G2 humano → HML + regressão → G3 humano → PRD`

QA, HML e PRD executam aplicações reais no mesmo host, com pacote imutável promovido pelo mesmo digest. O primeiro release cria Blue; uma segunda história criada pelo usuário permite o segundo release e a troca Blue/Green. Nenhum script cria essas histórias para o apresentador.

Bootstrap cria somente infraestrutura/configuração, identidades/personas, catálogo de agentes, políticas e grupo raiz vazio no GitLab. Não cria sistemas, projetos, histórias, tarefas, histórico de negócio, aplicações, pacotes ou deploys. Reiniciar preserva os dados criados pelo usuário e nunca acrescenta exemplos.

Ficam fora do escopo nuvem pública, Kubernetes externo, multi-host, SSO corporativo, integrações Jira/Azure DevOps e métricas DORA completas. Nenhuma fase deste planejamento executa limpeza, migração de dados ou mudança no ambiente instalado.

## Hierarquia e status definidos pelo usuário

Atualização de 20/10/2026, com esclarecimento explícito: **um Sistema contém diversos Projetos**. Cada Projeto contém Épicos; cada Épico contém Histórias; cada História contém Tarefas. Não foi solicitada hierarquia de projetos dentro de projetos.

Os status abaixo substituem os status de negócio correspondentes da especificação original, preservada como recebida. Códigos internos permanecem em inglês; a interface utiliza os rótulos definidos pelo usuário.

| Entidade | Status exibidos | Códigos internos propostos |
| --- | --- | --- |
| Projeto | AWAITING APPROVAL / APPROVED | `awaiting_approval` / `approved` |
| Épico | TO DO / APPROVED / DOING / DONE | `todo` / `approved` / `doing` / `done` |
| História | SPECIFICATION / APPROVED / CODING / CODE REVIEW / SECURITY SCAN / TESTING / UAT / PRODUCTION / COMPLETED | `specification` / `approved` / `coding` / `code_review` / `security_scan` / `testing` / `uat` / `production` / `completed` |
| Tarefa | TO DO / DOING / DONE | `todo` / `doing` / `done` |

Atualização do usuário em 20/10/2026: todos os rótulos de status, inclusive estados técnicos e condições de execução, devem ser exibidos em inglês. Os demais textos da interface continuam em PT-BR. UAT corresponde ao ambiente de Homologação (HML). Arquivamento é atributo separado e não acrescenta status a esses conjuntos. Os status existentes do Sistema também devem ser exibidos em inglês, sem mudança de semântica.

### Relação com execução e aprovações

- Projeto nasce **AWAITING APPROVAL** e Épico nasce **TO DO**. História criada, ainda sem pipeline iniciado, fica **SPECIFICATION**; Tarefa nasce **TO DO**. Estes valores iniciais são a proposta de implementação para os conjuntos definidos acima.
- Aprovações de Projeto e Épico são decisões próprias e auditadas, distintas de G1/G2/G3. Não aprovar automaticamente um Projeto ou Épico porque uma História passou por um gate. Papéis autorizados e pré-condições dessas decisões devem ser formalizados na fundação, antes de habilitar as transições; esta solicitação não define esses papéis.
- História em preparação/estágio 1: **SPECIFICATION**. Após G1: **APPROVED**, antes de iniciar codificação. Codificação e verificações iniciais de build, deploy QA e testes de desenvolvimento do estágio 2: **CODING**, com a atividade específica indicada no diagrama e nos detalhes. Estágio 3: **CODE REVIEW**. Varreduras de segurança do estágio 4: **SECURITY SCAN**.
- Atualização do usuário: a sequência de status é **CODING → CODE REVIEW → SECURITY SCAN → TESTING**. Após as varreduras, executar a validação final dos testes em QA e consolidar as evidências sob **TESTING**, antes de solicitar G2. Os testes iniciais de desenvolvimento permanecem antes do Code Review para alimentar a revisão; a validação final usa o mesmo commit/pacote, sem rebuild. Essa atividade integra a saída do estágio 4, preservando os seis estágios e os gates existentes. Se houver alteração de código, repetir as verificações e aprovações afetadas.
- Deploy HML e regressão: **UAT**. Deploy PRD e validação de produção: **PRODUCTION**. Pipeline encerrado com sucesso: **COMPLETED**. Preservar no histórico a passagem por produção e apresentar a versão implantada mesmo após a conclusão da história.
- Espera de gate, falha, bloqueio, cancelamento e retrabalho são condições de execução separadas do status de negócio, com motivo e ação disponível. Não criar status adicionais na lista da História ou Tarefa. Em retrabalho, o status da História corresponde à etapa de retorno efetivamente executada; o diagrama exibe o gate de origem e as correções.
- Tarefas de correção seguem **TO DO → DOING → DONE**. Falha registra condição de bloqueio e motivo, mantendo a tarefa **DOING**; concluir exige evidência de resolução. Isso substitui o `blocked` como status de tarefa proposto no documento original.
- Status de negócio não substitui `PipelineRun`, `StageRun`, `AgentRun`, `Gate` ou `Deployment`: seus estados técnicos continuam necessários para orquestração e auditoria. A UI distingue, por exemplo, **TESTING · AWAITING G2 APPROVAL** e **CODE REVIEW · RUNNING**.
- A fundação deve definir a política de agregação dos Épicos (**APPROVED → DOING → DONE**) e reabertura, sem concluir um Épico com Histórias pendentes nem atribuir aprovação por inferência. Alterações manuais não podem contornar gates ou fabricar evidências de execução.

**Aceite:** API, filtros, listas, Kanban, formulários e diagrama usam os mesmos conjuntos de status; testes verificam valores permitidos e transições, distinção entre aprovação de planejamento e gates, retorno de correção e ausência de conclusão com trabalho pendente. Agentes de UX devem validar a clareza dos status de negócio junto às condições de execução.

## Requisito transversal de UX e navegação

Orientação explícita do usuário em 20/10/2026: a navegação deve ser intuitiva e graficamente clara como o diagrama de execução de um processo. Ao criar ou alterar telas, invocar agentes com perfil de User Experience para participar do desenho e da revisão. Essa participação começa nos fluxos e nas primeiras telas da Fase 1; não fica restrita ao grafo da Fase 6 ou ao polimento final.

- Antes da implementação de cada conjunto de telas, um agente de UX define a jornada, hierarquia visual, ações principais, estados vazios e navegação entre níveis; o resultado fica registrado junto à entrega.
- Na revisão das telas implementadas, um agente de UX avalia o fluxo completo e registra problemas e ajustes verificáveis. Agentes de UX são colaboradores da implementação da plataforma, não novos agentes de runtime do catálogo dos dez agentes.
- O usuário deve identificar onde está, o que já aconteceu, o que está em execução, o que depende de sua decisão e qual é a próxima ação, sem precisar interpretar logs ou conhecer a arquitetura técnica.
- O processo aparece em etapas conectadas, com direção de leitura consistente, estágio atual destacado, gates humanos distintos de decisões automáticas e retornos de correção explícitos. Selecionar uma etapa abre seus detalhes preservando o contexto do processo.
- Breadcrumb e seleção de Sistema/Projeto/História preservam o contexto ao abrir aprovações, artefatos, tarefas, pacotes e ambientes. Ações principais usam linguagem de negócio; detalhes técnicos ficam disponíveis sob demanda.
- Estados de execução, espera, bloqueio, falha e conclusão combinam texto, ícone e cor, com foco visível e navegação por teclado. O grafo deve ter representação textual equivalente acessível.

**Aceite de UX por entrega de telas:** registrar revisão dos agentes de UX e evidência de um percurso em que o usuário consegue criar sua hierarquia, iniciar e acompanhar o processo, identificar a próxima decisão, abrir evidências e retornar ao mesmo contexto. Problemas que impeçam entender o estado ou concluir a ação principal bloqueiam o aceite da tela. A validação com o usuário no ensaio humano complementa a revisão dos agentes.

## Diagnóstico do repositório

| Área | Evidência atual | Mudança necessária |
| --- | --- | --- |
| Operação | `bootstrap.ps1`, Compose, WSL, prepare/up separados, locks de imagens, logs e diagnóstico | Reaproveitar o ciclo operacional e ampliar preparação offline para a nova plataforma |
| Núcleo | FastAPI/SQLAlchemy/PostgreSQL, identidades, sessão, CSRF, idempotência, auditoria e backup | Migrar ou adaptar contratos para o domínio completo; conservar dados e controles existentes |
| Planejamento | Portal e Forgejo com outcomes/épicos/histórias | Acrescentar Sistemas, Projetos vinculados, Tarefas e pipeline por história; definir transição do Forgejo |
| Interface | HTML/JS no portal; chat e planejamento na extensão VS Code | Portal completo da especificação, SSE, pipeline, revisões, pacotes, ambientes e identidade visual |
| Inferência | Entrevista já usa modelo local por transporte WSL da extensão | Workers devem consumir inferência sem depender de VS Code aberto; dez agentes, contexto, retries e cancelamento |
| GitLab | API de demonstração, projeto privado, Issue/MR, Runner e pipeline Python | Namespace `sdlc/<sistema>/<projeto>`, código gerado ao vivo, revisão automática, tags e reconciliação |
| Artefatos | Artefato `public/` do pipeline e volume HTML compartilhado | OCI Registry + Package Registry, manifesto, SBOM, versão e digest imutáveis |
| Deploy | Cópia de HTML para uma publicação compartilhada em 3181 | Containers por projeto/ambiente, Traefik, health/smoke reais, promoção e rollback |
| Início vazio | `runtime.py` chama `seed_demo`; marcador `clean-start.json` evita a carga em uma instalação já limpa | Eliminar dependência do marcador: instalação nova e upgrades devem iniciar sem exemplos |
| Aceitação | `runtime.sh test` chama o teste GitLab; `manage.py acceptance()` chama `demo()` | Separar checks de leitura de testes destrutivos/sintéticos; fixtures somente em instalação descartável |
| Isolamento | Runner atual sem socket Docker; política prevê worker em VM e sem shell arbitrário | Decidir contrato do executor de builds/deploy no mesmo host antes de habilitar execução de código gerado |

Fontes: [implementação](implementacao.md), [GitLab](../gitlab/README.md), [início vazio](inicio-vazio-2026-10-16.md), `services/control/runtime.py`, `scripts/linux/runtime.sh`, `gitlab/manage.py`, `gitlab/compose.yaml`, `config/environment.json` e [extensão](../../vscode/README.md). Esta análise foi de código/documentação; não é atestado do estado dos serviços em execução.

## Decisões e inconsistências a resolver na fundação

Estas são recomendações de implementação, a formalizar em ADRs em `docs/DECISIONS.md` da nova aplicação. Divergências da especificação devem ficar explícitas e verificáveis.

| Tema | Direção proposta |
| --- | --- |
| Stack | Seguir o monorepo TypeScript recomendado, dentro de `sdlc/portal/`, com apps web/API e packages shared/agents/adapters/templates. Selecionar versões suportadas e compatíveis na Fase 1, fixando locks; não assumir que as versões mínimas citadas continuam adequadas. Manter `lab/` e `vscode/` independentes. |
| Persistência | Usar PostgreSQL já disponível como banco da apresentação, com Prisma no novo serviço. SQLite pode servir aos testes compatíveis, mas concorrência/migração devem ser aceitas em PostgreSQL. Evitar dois serviços escrevendo nas mesmas tabelas; planejar cutover e importação explícita. |
| Legado e VS Code | Preservar o núcleo até o aceite do substituto. Mapear IDs, projetos, conversas, aprovações e eventos; não converter outcome em System silenciosamente. Oferecer compatibilidade `/v1` ou adaptar a extensão antes do cutover. Não duplicar o mesmo backlog nos dois portais. |
| Forgejo | Manter como legado durante a transição. A plataforma nova usa seu banco para planejamento e GitLab para código. Migração de itens exige mapeamento/proveniência; desligamento só após conferência e aceite. |
| GitLab/registry existentes | A aplicação consome serviços existentes. O Registry OCI não está explicitamente habilitado/publicado no Compose atual; verificar Container e Package Registry, permissões e conectividade. Ajustes operacionais entram na preparação do laboratório, sem reinstalar GitLab ou perder volumes. |
| HTTP/HTTPS | O GitLab atual usa HTTP em loopback/rede interna; a especificação presume HTTPS. Definir endereço interno e política de TLS por ambiente; não desabilitar validação TLS globalmente. |
| Personas | Seletor de persona sem senha é um modo de demonstração local explícito, separado das identidades reais existentes. Nunca tratar `X-Persona` como autenticação forte nem enfraquecer a API legada. |
| Execução Docker | Propor executor dedicado, com operações estruturadas e escopo por projeto, acessando o daemon. A API pública não recebe socket irrestrito. Isso diverge do socket na API sugerido no documento e deve ser registrado. Resolver também a política atual de VM; não alterar a política silenciosamente. |
| Segurança da execução | Builds e testes gerados rodam em containers de trabalho descartáveis, sem segredos de controle ou mounts do host, com limites e rede restrita. Comandos de `review.yaml` são entrada não confiável: validar e executar no sandbox, jamais no host/API. |
| Contradição em 6 | Desconsiderar a frase do catálogo de coding que permite patches pré-definidos. Valem a instrução do usuário e as seções 6.1/14/18: sem fallback de código, conteúdo, resultado ou falha pré-programada. Segurança usa scanners reais, apesar da palavra “simula” no catálogo. |
| Modos simulados | Somente contingência explícita, separados do perfil de apresentação real e com banner. Mock de LLM só em testes isolados. Indisponibilidade de LLM, scanner ou registry bloqueia com erro visível, sem aprovação fabricada. |
| Dez agentes | Catálogo: requirements, architecture, test_design, coding, code_review, test_exec, security, deploy_qa, deploy_hml e deploy_prd. Deploy, testes e scanner são ações determinísticas; LLM redige/análise quando aplicável, não decide comandos de infraestrutura. |
| Gates | Padrão G2 após segurança. Se houver opção G2 antes da segurança, falha/crítico continua bloqueando HML; mudança de evidência invalida autorização pertinente. Rejeição humana exige ≥10 caracteres. CR nunca tem aprovação manual. |
| Escopo de aprovação | Vincular gate a história/run/iteração, snapshot das evidências, commit e pacote quando existentes. Novo código invalida revisão e autorizações afetadas; repetir etapas necessárias. G1/G2/G3 não são permissões reutilizáveis para qualquer pacote. |
| G3 e correções | Retorno padrão G3→5 serve para problemas de HML/regressão. Se a correção muda código, retornar ao 2 e repetir QA, CR, segurança e G2 antes de HML/G3. Gerar release notes antes do G3, finalizando após PRD (resolve exigência do checklist versus saída do estágio 6). |
| Merge depois de PRD | Conferir head/base da MR e serializar releases do projeto. Verificar que árvore resultante corresponde ao commit empacotado, mesmo que SHA do merge seja distinto. Conflito/divergência bloqueia e gera evento/tarefa humana; nunca reconstruir o pacote implantado. |
| Rotas e concorrência | Incluir projeto e sistema/ID na identidade interna dos ambientes para evitar colisão entre projetos homônimos. Endpoints de ambiente/rollback recebem `projectId`; preservar a navegação prevista. Serializar operações por projeto/ambiente e alterações de base compartilhada. |
| Blue/Green recorrente | Alternar cor ativa/inativa a cada release; não assumir Blue sempre ativo após o segundo. Rollback só é concluído após versão antiga saudável e tráfego confirmado. Definir comportamento com novo release durante standby. |
| Imutabilidade e reset | Append-only é regra da operação normal. Reset é operação administrativa explícita de um ambiente de apresentação identificado; preserva GitLab/pacotes por padrão. Registrar recibo operacional fora do banco apagado; remoção externa exige opção separada, escopo gerenciado e prévia. |
| Offline | Preparar imagens base, pnpm/npm/pip e suas dependências, Traefik, scanner e bases antes da apresentação; medir idade das bases. Dependência não preparada falha com diagnóstico. Sem alteração do laboratório ou download de modelos pelo portal. |

## Fases, entregas e critérios de saída

A ordem acompanha a seção 17 da especificação, com uma etapa prévia para retirar a criação de exemplos do caminho operacional. A Fase 4 é subdividida pelo risco e tamanho. Cada fase termina com evidências de aceite; trabalho pendente não é marcado como concluído por possuir interface ou mock.

### Fase 0 — Início vazio e separação da aceitação

- Inventariar `seed_demo`, comando `demo`, templates de aplicação pronta, publicação HTML compartilhada e testes que gravam no ambiente permanente.
- Tornar configuração/identidades o único bootstrap; retirar geração automática de dados, inclusive em instalação nova sem marcador.
- Transferir aplicação pronta e fluxo sintético para fixtures de testes isolados; descontinuar o comando de demo pronta no uso da apresentação.
- Separar `doctor`/health somente leitura de integração/E2E em alvo descartável obrigatório, com proteção contra o ambiente humano.
- Não apagar dados existentes. Migração de instalação preserva projetos humanos, credenciais e volumes.

**Saída:** instalação nova vazia; up/restart repetidos não criam registros de negócio; instalação com dados humanos preservada; testes sintéticos recusam alvo permanente.

### Fase 1 — Fundação, domínio e prontidão

- ADRs de stack, banco, legado, persona, executor, registry e inferência; inventário de recursos e orçamento do host.
- Monorepo, contratos compartilhados, Prisma/migrações, validações, logs estruturados e testes básicos de API.
- CRUD/arquivo lógico da hierarquia inteira; chaves únicas e vínculos; status de negócio conforme atualização do usuário acima, separados das condições de execução; modelo para runs, gates, correções, reviews, pacotes, promoções e deploys.
- Portal com identidade Dell, estados vazios, formulários curtos, breadcrumb, persona local e navegação mínima.
- GitLab idempotente: grupo raiz, subgrupo/repositório somente após ação humana; propriedade gerenciada, colisões, main protegida, skeletons neutros Node/Python.
- `integrations/health` verifica dependências sem criar aplicações nem fazer deploy; registra QA/HML/PRD como `not_deployed` ao criar Projeto.
- Estabelecer plano de migração/compatibilidade, sem cutover nesta fase.

**Saída:** usuário cria a hierarquia completa; links GitLab corretos; colisão não sobrescreve conteúdo; três ambientes vazios; nenhuma lógica de negócio no skeleton.

### Fase 2 — Histórico, artefatos e tempo real

- Histórico append-only com descendentes, autoria, filtros, paginação por cursor e comentários.
- Artefatos versionados, Markdown/Mermaid, tabelas, diff e sanitização de conteúdo gerado.
- Outbox transacional e SSE com retomada por cursor/Last-Event-ID, reconexão e autorização. O commit do banco precede o envio; indisponibilidade do stream não perde evento.
- Metadados de modelo, tokens, latência, logs limitados e remoção de segredos.

**Saída:** eventos completos consultáveis em todos os níveis; reinício/reconexão recupera eventos sem duplicar efeitos; artefatos preservam versões.

### Fase 3 — Orquestrador, agentes e G1

- Máquina de estados persistida; um run ativo por história, fila, leases, heartbeat, retry, cancelamento e recuperação após reinício. Efeitos externos possuem chave de idempotência e reconciliação.
- Provider LLM local independente da extensão, conectividade mínima entre distros, allowlist de endpoints locais e mapeamento por agente; nenhum provedor externo.
- Descoberta de modelos, fila/concorrência conforme capacidade medida, orçamento de contexto, saída estruturada, reparo/retry limitado e streaming quando disponível.
- Catálogo dos dez agentes; executar requirements → architecture → test_design e parar no G1.
- Aprovações por papel e checklist, criação transacional de tarefas de correção, origem imutável, recorrência e resolução verificável.
- Fila de aprovações e visão gráfica inicial de execução, desenhadas e revisadas com agentes de UX; o grafo detalhado vem na Fase 6.

**Saída:** história escrita pelo usuário produz os três artefatos via LLM local; G1 bloqueia codificação; rejeição cria tarefas antes do retrabalho; queda de LLM bloqueia sem substitutos; cancelamento não deixa novo efeito órfão.

### Fase 4A — Codificação, GitLab, pacote e QA

- Coding recebe contexto aprovado e produz edições estruturadas; validar traversal, symlinks, tamanho e arquivos permitidos; feedback de build/lint/testes com tentativas limitadas.
- Clone descartável, branch por história, commit/push/MR reais, trailers e links; testar retomada de push/MR após falha parcial.
- Executor isolado, builder e registry reais. Publicação única de OCI + manifesto + SBOM, versão monotônica com reserva concorrente e digest conferido.
- Build de preparação/verificação pode validar código; somente um build de release é publicado por commit. Nenhum rebuild nas promoções.
- Traefik e rotas por projeto/ambiente; deploy automático QA pelo digest; health/version/smoke HTTP reais; testes de desenvolvimento e cobertura observada, sem números inventados.
- Página de pacotes, evidências e logs reais. `review.yaml`/`smoke.yaml` validados e executados com limites no sandbox.

**Saída:** uma história criada ao vivo resulta em MR, pacote e QA funcional com versão/commit verificáveis. Repetir publicação não sobrescreve versão; falha de build/teste/health interrompe o fluxo.

### Fase 4B — Code Review automático e correções

- Diff real da MR, base/head fixados e evidências dos testes do mesmo commit.
- Checagens determinísticas: lint/build, segredos, caminhos, tamanho, dependências, testes/cobertura e rastreabilidade.
- LLM local revisa chunks; validar arquivo/linhas contra o diff, deduplicar e acompanhar fingerprints entre iterações.
- Motor de decisão com score `max(0, 100 - 30*blockers - 10*majors - 2*minors)`, limiares e snapshot versionado; distinguir reprovação de indisponibilidade.
- Relatório por iteração, comentários/discussões na MR; CR automático sem endpoint de decisão humana.
- Reprovação cria tarefas antes de voltar ao 2; novo commit/pacote/QA/testes; limite de iterações bloqueia e exige justificativa para reset.

**Saída:** fixtures isoladas comprovam aprovar, aprovar com comentários, reprovar e erro; deploy HML/PRD rejeita commit não revisado; novo commit invalida revisão anterior.

### Fase 4C — Segurança, G2, HML e G3

- Scanners reais efêmeros para SAST, SCA, segredos e licenças; DAST HTTP no QA com ferramenta definida na fundação. Preparar imagens/regras/bases offline e registrar versão/data de cada ferramenta.
- Crítico bloqueia; alto exige justificativa vinculada ao achado e evidência; scanner ausente/erro nunca significa “zero vulnerabilidades”.
- G2 por QA Lead ou Security Lead, após segurança por padrão, vinculado ao pacote e evidências; deploy HML exige gate válido e CR do mesmo commit no orquestrador e executor.
- Promover o mesmo digest a HML; regressão acumulada; release notes candidatas; G3 por Release Manager com janela de mudança.
- Testar rejeições G2/G3, correções, invalidação de evidências e repetição das etapas necessárias.

**Saída:** QA e HML executam o mesmo pacote; tentativa de bypass de gate falha e é auditada; G3 só aparece com evidências válidas.

### Fase 5 — PRD Blue/Green e recuperação

- Primeiro release: Blue saudável com 100%; se falhar, PRD continua sem deploy.
- Releases seguintes: cor inativa pelo mesmo digest de QA/HML, health/smoke diretos, pesos reais 10/50/100 com observação e validação do tráfego.
- Rollback automático em falha real; rollback manual autorizado durante standby, com reinício e health da versão anterior antes da troca.
- Persistir pesos/estado, reconciliar containers/rotas após falha/reinício; serializar deploy/rollback/limpeza e alternar cores em terceiro release.
- Merge/tag conforme política com validação de SHA/base e conteúdo; notas finais, pacote released e histórico.

**Saída:** `/version` mostra versão/commit reais em QA/HML/PRD; dois releases e rollback verificados. Testes adicionais cobrem terceiro release e retomada sem dupla promoção.

### Fase 6 — Pipeline visual completo

- Grafo de seis estágios, G1–G3 humanos, CR automático e arestas de correção.
- Drawer de AgentRuns, input/output/logs, score/achados, correções e vínculos de MR/pacote.
- Blue/Green com pesos observados; acessibilidade por texto/ícone/foco, não apenas cor; estados atualizados via SSE.

**Saída:** sem reload, usuário acompanha execução, espera, falha, revisão e retrabalho com dados reais; personas sem papel veem somente leitura nos gates.

### Fase 7 — Aceite integral, operação e transição

- Dashboard, Kanban, busca global, activity, agents, environments e todas as rotas da seção 11; ambientes identificados por projeto; health e versão consultados ao vivo com timestamp.
- KPIs calculados de eventos/runs reais, sem números ilustrativos. UI PT-BR, datas no fuso do navegador, tokens Dell e logo placeholder local; sem fontes/CDNs externas obrigatórias.
- Preparação offline integral, inventário de dependências e recursos, falhas explícitas, poucos comandos para desenvolvimento e integração com bootstrap PowerShell para operação.
- Reset com prévia/escopo, recursos gerenciados e preservação de repositórios/pacotes; semear dados continua proibido após reset/up.
- Documentar arquitetura, decisões, acesso, configuração e roteiro humano sem domínio/aplicação pronta; atualizar `Acessos e URLs.md` quando as rotas forem reais.
- Executar migração ensaiada, comparação de dados e adaptação da extensão; cutover reversível com backup/restauração testados. Desligar componentes substituídos somente após aceite.

**Saída:** critérios da seção 18 rastreados e aceitos; pipeline pequeno medido contra meta de ~30 minutos e leituras contra 300 ms. Meta não atingida gera achado explícito, não resultado ajustado. Ensaio humano começa vazio e o usuário cria o projeto e as histórias.

## Backlog versionado

A evolução aprovada em 24/10/2026 para [conversas por Projeto/História e referências compartilhadas](conversas-por-escopo-2026-10-24.md) complementa SDLC-10/14 e UX-C06: preserva fontes de conversa e comandos/gates, acrescenta contexto consultivo da História e rastreabilidade das origens. Mantém indicadores existentes, sem novas metas. O documento específico registra a validação e os limites; não conclui os executores de testes, candidatas, QA/HML/PRD ou o restante do backlog funcional.

Evolução transversal de UX registrada em 24/10/2026: [padrões de experiência, inventário e plano UX-C00–C07](../portal/docs/PADROES_DE_EXPERIENCIA.md). Esse plano cobre filtros, ordenação, paginação, consultas e histórico de todos os módulos, preservando o backlog funcional abaixo. Apenas a definição documental UX-C00 está concluída; a migração das telas será acompanhada por fluxo.

Fonte de controle inicial: esta tabela. SDLC-01/02 estão **concluídos no código, com testes e aceite em instalação descartável**. SDLC-04/06 estão implementados e testados na nova fundação; SDLC-07 recebeu aceite humano da hierarquia e clareza da navegação, sujeito a evolução com novas funcionalidades; SDLC-03/05/09/10 têm atendimento parcial descrito na evidência da fundação. SDLC-08 tem código e aceite real do adapter concluídos em GitLab descartável (Node/Python, idempotência, main protegida e zero pipelines); conexão da prévia humana configurada e validada conforme [evidências das integrações](integracoes-2026-10-20.md). Os demais itens estão **planejados**. Não há Issue remota criada. Cada linha é uma unidade de entrega que deve trazer na PR: escopo, evidência de aceite, requisitos atendidos e limitações. Dependências devem estar aceitas antes do avanço funcional.

| ID | Entrega | Depende de | Aceite mínimo / referência na especificação |
| --- | --- | --- | --- |
| SDLC-01 | Bootstrap sempre vazio | — | Sem marcador e sem seeds de negócio em instalação/up/restart (§14, §18) |
| SDLC-02 | Aceitação isolada e remoção da demo pronta do fluxo humano | 01 | Alvo permanente recusado; fixture só em teste (§14–15) |
| SDLC-03 | ADRs, inventário e arquitetura da transição | — | Stack/banco, executor, persona, registry, LLM e legado definidos (§3–4) |
| SDLC-04 | Monorepo, contratos e configuração | 03 | Build/test/locks, erros tipados, logs sem segredos (§4–5, §10) |
| SDLC-05 | Schema e migrações da hierarquia, status e execução | 04 | PostgreSQL migra sem perda; unicidade, vínculos e conjuntos de status definidos pelo usuário (§5 com atualização de 20/10) |
| SDLC-06 | CRUD, status, aprovações de planejamento, arquivo lógico, persona e permissões | 05 | Hierarquia completa, transições auditadas e rejeição de acesso indevido; status de negócio distintos de gates/condições técnicas (§5, §10, §13 com atualização de 20/10) |
| SDLC-07 | Layout Dell, navegação e formulários vazios com agentes de UX | 06 | Jornada desenhada/revisada por UX; criar todos os níveis por UI e manter contexto; breadcrumb (§11–12, §14) |
| SDLC-08 | GitLab provisionamento e skeleton Node/Python | 03, 06 | Namespace, colisão segura, main protegida, nenhum domínio pronto (§9.1, §9.3) |
| SDLC-09 | Readiness de GitLab/registry/Docker/LLM | 03, 04 | Checks reais sem criar aplicações; dependência ausente visível (§10, §14) |
| SDLC-10 | Histórico, comentários e artefatos versionados | 05, 06 | Append-only, descendentes, filtros e visualizador seguro (§5, §7.4, §11) |
| SDLC-11 | Outbox/SSE recuperável | 10 | Reconnect/restart sem perda ou efeito duplicado (§7, §10) |
| SDLC-12 | Worker persistido e máquina de estados | 05, 11 | Concorrência, leases, cancelamento, retry/reconciliação (§7, §13) |
| SDLC-13 | Provider LLM local independente do VS Code | 03, 09 | Descoberta, limite, reparo, timeout, sem fallback (§6.1) |
| SDLC-14 | Catálogo, três agentes de especificação e G1 | 07, 10, 12, 13 | Artefatos reais; G1 impede coding (§6–7) |
| SDLC-15 | Gates humanos e tarefas de correção | 12, 14 | Sem tarefa sem retrabalho; origem/resolução/recorrência (§7.3, §7.5) |
| SDLC-16 | Executor isolado e preparação offline | 02, 03, 04 | Código/teste sem acesso ao host/secrets; imagens e dependências prontas (§9, §15) |
| SDLC-17 | Coding, GitLab commits e MR reais | 08, 13, 14, 16 | Edição validada e push; falha sem patch pronto (§6.1, §9.3) |
| SDLC-18 | Registry e pacotes imutáveis | 08, 09, 16, 17 | OCI/manifesto/SBOM; versão concorrente e digest verificados (§9.4) |
| SDLC-19 | Traefik, deploy QA, testes e cobertura reais | 18 | URL/version/health reais; testes contra mesmo commit (§7, §9) |
| SDLC-20 | Motor CR determinístico e achados LLM | 13, 17, 19 | Score, diff válido, política, erros distintos (§6.2) |
| SDLC-21 | Loop CR, relatórios e discussões na MR | 15, 20 | Novo commit/pacote; limite; sem aprovação manual (§6.2, §7.5) |
| SDLC-22 | Segurança real e bases offline | 16, 18, 19 | SAST/SCA/secrets/licenças/DAST; crítico bloqueia (§9, §13) |
| SDLC-23 | G2, promoção HML, regressão e G3 | 15, 21, 22 | Mesmo digest; evidências inválidas bloqueiam (§7, §9.4) |
| SDLC-24 | Primeiro release PRD e Blue/Green recorrente | 23 | Blue inicial, pesos reais e cores alternadas (§8) |
| SDLC-25 | Rollback e reconciliação de release/merge | 24 | Versão antiga saudável; retomar falha; conflito auditado (§8–9.3) |
| SDLC-26 | Grafo de pipeline e drawers ao vivo com agentes de UX | 11, 21, 25 | Processo compreensível: estado atual, próxima ação, seis estágios, gates, correções e pesos acessíveis; revisão UX registrada (§11.2–11.4) |
| SDLC-27 | Dashboard, busca, Kanban, agentes e ambientes | 07, 10, 13, 25 | Rotas e KPIs reais, status/version ao vivo (§11) |
| SDLC-28 | Reset administrativo e contingência explícita | 02, 18, 25 | Limpa só escopo gerenciado; preserva pacotes; simulação sinalizada (§14–15) |
| SDLC-29 | Compatibilidade/migração/cutover e backup | 03, 06, 10, 27 | Extensão funcional; reconciliação e recuperação verificadas (§4–5; legado) |
| SDLC-30 | Aceite integrado, desempenho e documentação | 26, 27, 28, 29 | Matriz §18, testes isolados e roteiro humano vazio (§15–18) |
| SDLC-31 | Alternativas de adapters e builders | 18, 23 | Contratos reais Nexus/Artifactory/local e gitlab_ci; sem declarar teste não executado (§9) |

SDLC-31 integra o escopo total descrito, mas não bloqueia a primeira fatia funcional com registry GitLab e builder Docker local. A conclusão integral da especificação exige validar as alternativas previstas ou registrar formalmente uma redução de escopo; a mera interface não equivale a implementação.

Se o acompanhamento passar a exigir responsáveis, trabalho em paralelo ou múltiplas PRs, espelhar estes IDs em Issues de `marcoleao/ai-lab-nvidia`, agrupadas por fase. Cada Issue conterá requisito/seção, dependências, critérios, checklist de evidências e link desta fonte. Guardar a relação ID→Issue aqui para não criar duplicatas. GitHub controla a evolução da plataforma; GitLab guarda as aplicações criadas pelos usuários. Não criar Issues para projetos fictícios da demonstração.

## Validação e definição de pronto

1. **Vazio e preservação:** instalação nova, restart, upgrade com dados humanos e reset. Apenas testes isolados podem criar fixtures. `doctor` é somente leitura.
2. **Domínio/segurança:** CRUD, vínculos, autorização, histórico append-only, conteúdo Markdown/Mermaid seguro, segredos ausentes de logs/browser.
3. **Orquestração:** todas as transições; G1/G2/G3; proibição de CR manual; correções, recorrência, cancelamento, concorrência, retries e retomada após interrupção em cada efeito externo.
4. **LLM real:** iniciar a partir de história escrita por humano; validar requisitos/ADR/testes/código, limite de contexto, saída inválida e indisponibilidade explícita. Não usar mock como evidência da demonstração.
5. **Pacote e gates:** sobrescrita recusada, versões monotônicas após reset, mismatch de digest, gate de outra história/run, commit novo, revisão inválida e credencial revogada.
6. **Infra real isolada:** build → QA → HML → primeiro PRD → segundo/terceiro release; HTTP `/version`, digest dos containers, pesos observados, rollback e falhas reais de health. Pacote defeituoso só como fixture de teste descartável.
7. **Portal E2E:** criação humana da hierarquia, pipeline, decisões, correções, histórico/SSE e todas as rotas; perfis sem permissão em leitura. Medir desempenho e recursos do host real sem sobrecarregar o laboratório.
8. **Aceite humano:** ambiente começa vazio; apresentador escolhe domínio e histórias. Roteiro é documentação, não seed/gerador de demo. Não forçar falha/reprovação automática para encenação.

A matriz detalhada do §18 será versionada com os testes: requisito → SDLC-ID → teste/evidência → resultado → PR. Não marcar uma fase como aceita com testes simulados quando o requisito exige infraestrutura ou modelo real. Relatórios devem identificar ambiente isolado, versões e data; nenhuma credencial ou conteúdo privado deve ser publicado.

## Ordem de execução e riscos

Primeira entrega: SDLC-01/02, seguida das decisões SDLC-03. Primeiro marco demonstrável: usuário cria hierarquia e executa Especificação→G1 com LLM real (Fases 1–3). Segundo marco: história chega ao QA com código gerado e pacote imutável (4A). Terceiro: CR/segurança/HML/G3 (4B–4C). Quarto: PRD/Blue-Green/rollback (5). Entrega final: visualização, operação e aceite completo (6–7).

Os principais riscos são capacidade dos modelos locais para gerar código e revisar diffs, memória/disco para GitLab+builds+scanners+ambientes, acesso de inferência entre distros, registry ainda não exposto e preparação das bases offline. Resolver e medir na fundação; usar uma história pequena definida pelo usuário no aceite, sem prometer domínio arbitrário ou duração garantida.

Não fixar prazo de conclusão antes da sondagem de capacidade, registry, executor e migração. Após SDLC-03, estimar por Issue com esses resultados. Em cada entrega registrar progresso, testes e bloqueios concretos, preservando os dados do usuário.
