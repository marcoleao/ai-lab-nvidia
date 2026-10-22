# SPEC: Portal SDLC DevOps com Agentes de IA

> **Destinatário:** Codex (agente de implementação)
> **Objetivo:** implementar uma aplicação de demonstração de um ciclo DevOps/SDLC ponta a ponta, orquestrado por agentes de IA com *human-in-the-loop* (HITL) nos quality gates, com portal web de identidade visual Dell. **Os deploys em QA, HML e PRD são reais**, executados no ambiente de demonstração onde a aplicação roda.
> **Idioma da UI e dos conteúdos gerados:** Português (Brasil). Código, nomes de entidades, rotas e variáveis em Inglês.

---

## 0. Como usar este documento

1. Leia o documento inteiro antes de escrever código.
2. Implemente seguindo a ordem da seção **17 (Plano de implementação por fases)**.
3. Cada fase termina com os **critérios de aceite** da seção **18** correspondentes. Não avance sem que passem.
4. Onde houver decisão não especificada, escolha a opção mais simples que atenda ao critério de aceite e registre a decisão em `docs/DECISIONS.md`.
5. A aplicação é uma **demonstração**. Priorize: fluxo visível, histórico rico, pipeline claro, estados vazios que guiam a criação ao vivo e **deploys reais verificáveis** (o avaliador deve conseguir abrir as URLs dos ambientes e ver a versão implantada mudar). Não implemente nuvem pública nem multi-host (ver seções 2 e 3).

---

## 1. Visão geral

O sistema permite modelar e executar o ciclo de vida de software em uma hierarquia navegável:

```
Sistema (System)
 └── Projeto (Project)
      └── Épico (Epic)
           └── História (Story)
                └── Tarefa (Task)
```

Cada **História** percorre um **pipeline de 6 estágios** com **3 quality gates de aprovação humana** (G1, G2, G3) e **1 decisão automática de Code Review** (CR, sem humano). Em cada estágio atuam **agentes de IA** especializados. **Tudo** que um agente ou humano faz é registrado como evento imutável no **histórico** do item e fica consultável no portal.

### Princípios

- **Rastreabilidade total:** toda ação gera um `HistoryEvent` vinculado ao item (e propagado aos ancestrais para consulta agregada).
- **Automação com controle:** deploy em **Teste/QA** é automático. Deploys em **Homologação** e **Produção** são automatizados, mas **só disparam após aprovação humana** no quality gate.
- **Transparência do pipeline:** cada história exibe seu pipeline visual com status por estágio, por agente e por gate.
- **Agentes plugáveis, com IA 100% local:** cada agente usa uma interface única e consome **exclusivamente os modelos locais já disponíveis e expostos no laboratório** (seção 6.1). Nenhum dado sai do ambiente do laboratório. O `MockProvider` existe **exclusivamente para testes automatizados** e não é utilizável na demonstração: se o LLM local estiver indisponível, o agente **falha de forma explícita**, sem conteúdo substituto.

---

## 2. Escopo

### Dentro do escopo

- CRUD de Sistemas, Projetos, Épicos, Histórias e Tarefas.
- Navegação hierárquica e visões transversais (Kanban de histórias, lista de aprovações pendentes, feed de atividade).
- Orquestrador de pipeline (máquina de estados) por história.
- 10 agentes de IA (seção 6), incluindo o **Agente de Code Review** com aprovação/reprovação automáticas (seção 6.2).
- Quality gates com aprovação/rejeição humana e comentário obrigatório na rejeição.
- Histórico/auditoria por item com anexos de artefatos (spec, ADR, casos de teste, relatórios, logs de deploy).
- **Deploy REAL** de uma aplicação-alvo nos ambientes **QA, HML e PRD**, executados no próprio ambiente de demonstração onde o portal roda (containers Docker + proxy reverso), incluindo **Blue/Green Deployment real** em produção, health checks reais, troca de tráfego real e rollback real (seções 8 e 9).
- Identidade visual Dell (seção 12).
- **Bootstrap mínimo** (migrações, personas, catálogo de agentes, políticas padrão) **sem nenhum dado de demonstração**: o portal inicia **vazio** e todo Sistema, Projeto, Épico, História e Tarefa é **criado pelo usuário durante a apresentação**; todo o restante (requisitos, arquitetura, casos de teste, código, testes, revisão, pacotes, deploys) é produzido de forma autônoma pelos agentes e pela plataforma (seção 14).
- **GitLab** (instância existente do laboratório) como **repositório Git** de todas as aplicações-alvo, com estrutura de namespaces **`/sdlc/<sistema>/<projeto>`**, branches, commits, **Merge Requests reais**, tags e comentários de review (seção 9.3).
- **Repositório de Artefatos** (instância existente do laboratório) para **versionar pacotes imutáveis**; **o que migra entre os ambientes QA → HML → PRD é sempre o mesmo pacote imutável** (mesmo digest), nunca um novo build (seção 9.4).
- **Tarefas de correção:** todo loop de correção originado em um quality gate (G1, G2, G3 ou CR) é registrado como **Tarefa** antes do retrabalho (seção 7.5).

### Fora do escopo

- Provisionamento em nuvem pública, clusters Kubernetes externos e infraestrutura multi-host. Os três ambientes (QA, HML, PRD) são **isolados logicamente** (containers, redes e rotas distintas) **no mesmo host/ambiente de demonstração** onde a aplicação executa.
- Instalação e administração do **GitLab** e do **repositório de artefatos** (a plataforma apenas os consome, como os modelos de LLM).
- Autenticação corporativa (SSO).
- Scanners de segurança comerciais/licenciados e suítes de teste de terceiros. Por padrão são usados **scanners open source executados como contêineres efêmeros** (ex.: Trivy, Semgrep, gitleaks) e os **testes automatizados do próprio projeto**, ambos reais (seção 9). Todos os adapters seguem interface estável, permitindo trocar a implementação sem alterar o orquestrador.

---

## 3. Premissas e decisões já tomadas

| # | Decisão |
|---|---|
| P1 | Os agentes citados originalmente foram mantidos e foram incluídos agentes adicionais: **Codificação** (o Estágio 2 exige "Codificação"), **Segurança** (Estágio 4) e **Code Review** (Estágio 3, solicitado posteriormente) (seção 6). |
| P2 | O pipeline tem **3 quality gates humanos** (e **1 decisão automática de Code Review, `CR`**, sem aprovação humana): **G1** (antes da Codificação), **G2** (antes do deploy em Homologação, após testes de dev e de segurança), **G3** (antes do deploy em Produção, após regressão em Homologação). |
| P3 | Fluxo do usuário: "Codificação, deploy em QA e testes de dev com um quality gate e aprovação para deploy em Homologação" **seguido de** "Testes de Segurança" **e** "Deploy em HML". Interpretação adotada: **G2 é avaliado após o Estágio 4 (Segurança) concluir**, reunindo evidências dos Estágios 2, 3 e 4; a aprovação em G2 autoriza o deploy em HML (Estágio 5). Se preferir G2 imediatamente após os testes de dev e o Code Review (Estágio 3), ajuste via flag `PIPELINE_GATE_G2_POSITION` (seção 5.4). |
| P4 | Autenticação simplificada: seleção de **persona** (papéis) no topo do portal, sem senha. Papéis: `product_owner`, `architect`, `qa_lead`, `security_lead`, `release_manager`, `admin`. |
| P5 | Persistência em banco relacional local (SQLite por padrão, Postgres opcional). |
| P6 | Atualizações em tempo real no portal via **Server-Sent Events (SSE)**. |
| P7 | **Deploys são reais** no ambiente de demonstração, via **Docker Engine** (API/socket) com **Traefik** como proxy reverso. O host de demonstração deve ter Docker instalado e o usuário da API com permissão de acessar o socket. Há um fallback `DEPLOY_MODE=simulated` para máquinas sem Docker. |
| P8 | O que é implantado é uma **aplicação-alvo** (workload) cujo código-fonte reside no **GitLab** (`sdlc/<sistema>/<projeto>`) e que é empacotada **uma única vez** em um **pacote imutável** publicado no **repositório de artefatos**; esse pacote é o que é implantado em QA, HML e PRD. **Não existe aplicação-alvo pré-fabricada:** o código é criado ao vivo pelos agentes a partir do que o usuário especificar, sobre um **esqueleto neutro de runtime, sem lógica de negócio** (seção 9.1). O pipeline constrói, publica e implanta essa aplicação de verdade. |
| P9 | Testes de desenvolvimento, regressão e *smoke* são **reais** (testes automatizados gerados pelos agentes e executados no clone de trabalho, mais requisições HTTP ao ambiente implantado) e a análise de segurança usa **scanners reais** executados como contêineres efêmeros. Modos simulados existem apenas como contingência explícita e nunca com resultados pré-programados (seção 9). |
| P10 | **A camada de LLM usa os modelos locais já em operação no laboratório**, acessados por endpoint(s) HTTP já expostos. O portal **não instala, não baixa e não hospeda modelos**; apenas os consome. Endpoints, nomes de modelo e credenciais (se houver) são informados por configuração (seção 5.4). Se o servidor for compatível com OpenAI API (vLLM, Ollama `/v1`, LM Studio, TGI, llama.cpp server, etc.), nenhum código específico é necessário. |
| P11 | **Posição do Code Review:** o Estágio 3 (Code Review) foi inserido **após** o Estágio 2 (codificação, deploy em QA e testes de dev) e **antes** dos testes de segurança, preservando a definição original do Estágio 2 e permitindo que o revisor use as **evidências dos testes de dev** (resultados e cobertura). Como o QA é um ambiente de teste, ele pode receber código ainda não revisado; HML e PRD, porém, **só recebem imagens cujo commit teve Code Review aprovado** (seção 13). A decisão do Code Review é **100% automática** (sem aprovação humana); reprovação devolve o fluxo ao Estágio 2 automaticamente (seção 6.2). |
| P12 | **GitLab** é uma instância **já existente e acessível** no laboratório. A plataforma usa a API REST v4 e HTTPS com token (seção 5.4). Estrutura obrigatória de namespaces: grupo raiz **`sdlc`** → subgrupo por **Sistema** → repositório por **Projeto** (`sdlc/<sistema>/<projeto>`). |
| P13 | O **repositório de artefatos** é uma instância **existente** no laboratório. Como o tipo exato não foi informado, a plataforma o acessa por uma interface `ArtifactRepository` com implementações para **GitLab Container + Package Registry (padrão)**, Nexus, Artifactory e registro local (`registry:2`) como contingência (seção 9.4). Estrutura de caminhos: **`/sdlc/<sistema>/<projeto>/<versão>`**. |
| P14 | **Pacote imutável:** cada build gera um pacote versionado e identificado por **digest**; ele nunca é alterado nem reconstruído. A promoção entre ambientes é **por referência ao mesmo digest**; configuração específica de ambiente é injetada **em tempo de deploy**, nunca embutida no pacote. |
| P15 | **Loops de correção iniciados por quality gate** (G1, G2, G3 e o gate automático CR) sempre geram **Tarefas de correção** antes do retrabalho (seção 7.5). Falhas de estágio que não vêm de gate (ex.: teste falhou) continuam registradas como evento e reexecução, sem exigir tarefa. |
| P16 | **Nada pré-fabricado na demonstração:** o portal inicia **vazio**; o usuário cria Sistema, Projeto, Épico, História e Tarefas ao vivo. Não há dados semeados, histórico de exemplo, aplicação de exemplo, patches, conteúdo-modelo de agentes nem cenários de falha programados. Falhas, reprovações e rollbacks só ocorrem se resultarem do **comportamento real** (código gerado, testes, revisão, health checks) ou de **decisões do apresentador** (ex.: rejeitar um gate). Fixtures existem **somente em testes automatizados** (seção 15). |

---

## 4. Stack tecnológica recomendada

Use esta stack, salvo impedimento técnico (registrar em `docs/DECISIONS.md`).

| Camada | Tecnologia |
|---|---|
| Monorepo | `pnpm` workspaces |
| Frontend | **Next.js 14+ (App Router)**, **React 18**, **TypeScript**, **Tailwind CSS**, componentes próprios (shadcn/ui permitido), **React Flow** (visual do pipeline), **TanStack Query** |
| Backend | **Node.js 20 + NestJS** (ou Fastify) + **TypeScript** |
| ORM / DB | **Prisma** + SQLite (dev/demo) / PostgreSQL (opcional) |
| Tempo real | SSE (`/api/events/stream`) |
| Validação | **Zod** (schemas compartilhados em `packages/shared`) |
| Testes | Vitest (unit), Playwright (e2e do portal) |
| Execução / Deploy | **Docker Engine** acessado via `dockerode` (ou CLI `docker`/`docker compose`), **Traefik v3** como proxy reverso e gerenciador de rotas/pesos (provider de arquivo dinâmico), imagens obtidas do **repositório de artefatos** configurado (por digest) |
| Git / GitLab | **GitLab** via API REST v4 (`@gitbeaker/rest` ou `fetch`) para grupos, projetos, branches, commits, Merge Requests, discussões e tags; `simple-git` apenas para **clone de trabalho local** (cache descartável) usado em build/lint/testes |
| Repositório de artefatos | Interface `ArtifactRepository`: GitLab Container + Package Registry (padrão), Nexus, Artifactory ou `registry:2` (contingência); manifesto/SBOM como pacote genérico; verificação de digest |
| LLM | Interface `LLMProvider` com implementação **`LocalLLMProvider`** (default; consome os modelos locais do laboratório por endpoint HTTP, preferencialmente **compatível com a API OpenAI `/v1/chat/completions`**, com adaptador opcional para API nativa Ollama) e `MockProvider` (**exclusivo para testes automatizados**). **Não usar provedores externos em nuvem.** |
| Lint/format | ESLint + Prettier |

### Estrutura do repositório

```
/
├─ apps/
│  ├─ web/                # Portal Next.js
│  └─ api/                # Backend + orquestrador
├─ packages/
│  ├─ shared/             # Tipos, schemas Zod, enums, constantes do pipeline
│  ├─ agents/             # Implementação dos agentes + prompts + providers
│  ├─ adapters/           # Adapters: deploy (real/Docker), test-runner, security-scanner
│  └─ templates/          # Esqueletos NEUTROS de runtime (node, python): Dockerfile, /health, /version, review.yaml, smoke.yaml; SEM lógica de negócio
├─ infra/
│  ├─ docker-compose.platform.yml   # Traefik + rede sdlc-net (+ registry local só se ARTIFACT_REPO_TYPE=local)
│  └─ traefik/                      # estático + dynamic/ (arquivos de roteamento gerados pela API)
├─ workspaces/            # (gitignored) clones de trabalho descartáveis dos repositórios GitLab sdlc/<sistema>/<projeto>
├─ prisma/                # schema.prisma, migrations, bootstrap.ts (somente configuração; NENHUM dado de demonstração)
├─ docs/
│  ├─ DECISIONS.md
│  ├─ ARCHITECTURE.md
│  └─ DEMO_GUIDE.md      # roteiro para o apresentador (o sistema NÃO cria nada previamente)
├─ .env.example
└─ README.md              # Como subir a plataforma (vazia) em poucos minutos
```

---

## 5. Modelo de domínio

### 5.1 Entidades

Todas possuem `id (cuid)`, `createdAt`, `updatedAt`.

**System**
`key` (ex.: `PAYX`), `name`, `description`, `ownerName`, `status` (`active|archived`), `gitlabGroupId`, `gitlabGroupPath` (ex.: `sdlc/payx`).

**Project**
`systemId`, `key`, `name`, `description`, `status` (`planning|active|done|archived`), `startDate`, `targetDate`, `gitlabProjectId`, `gitlabPath` (ex.: `sdlc/payx/checkout`), `gitlabUrl`, `defaultBranch` (default `main`), `workspacePath` (clone local de trabalho, ex.: `workspaces/payx/checkout`), `artifactRepoPath` (ex.: `sdlc/payx/checkout`), `versionBase` (ex.: `1.4.2`, base do versionamento automático), `dockerContext` (caminho do contexto de build dentro do repositório), `runtime` (`node|python`, escolhido na criação do Projeto), `containerPort`, `healthPath` (default `/health`), `smokeConfigPath` (default `smoke.yaml`).

**Epic**
`projectId`, `key` (ex.: `PAYX-E1`), `title`, `description`, `status` (`backlog|in_progress|done`), `priority` (`low|medium|high|critical`).

**Story**
`epicId`, `key` (ex.: `PAYX-101`), `title`, `description`, `userStory` (formato "Como... quero... para..."), `acceptanceCriteria` (JSON array), `priority`, `storyPoints`, `status` (derivado do pipeline, ver 5.3), `currentStage` (1–6), `currentGate` (nullable), `reviewIteration` (0–N, contador de tentativas de Code Review), `gitBranch` (`feature/<key>`), `mergeRequestIid`, `mergeRequestUrl`, `currentPackageId`, `assigneeRole`.

**Task**
`storyId`, `key` (ex.: `PAYX-101-T1`), `title`, `description`, `type` (`analysis|architecture|test_design|development|correction|code_review|test_execution|security|deploy|other`), `status` (`todo|in_progress|blocked|done`), `ownerType` (`agent|human`), `ownerRef` (id do agente ou nome do usuário), `stage` (1–6).

**Campos adicionais das Tarefas de correção** (`type=correction`, ver 7.5): `origin` (`manual|agent|gate_rejection|auto_review|system`), `originGateId`, `originGateCode` (`G1|G2|G3|CR`), `iteration` (número do loop), `returnToStage` (estágio ao qual o pipeline retornou), `feedback` (texto original da rejeição ou do achado), `findingId` (para `CR`), `parentTaskId` (tarefa de correção anterior equivalente, em reprovações recorrentes), `resolvedByAgentRunId`, `resolutionSummary`, `resolutionCommitSha`, `resolutionPackageId`, `resolutionArtifactIds`, `resolvedAt`.

> Tarefas são **geradas automaticamente** pelos agentes e pelo orquestrador (ex.: o Agente de Requisitos cria tarefas de análise; o Agente de Deploy cria uma tarefa de deploy por ambiente), mas também podem ser criadas manualmente. **Toda rejeição de quality gate gera obrigatoriamente Tarefa(s) de correção** (seção 7.5).

**PipelineRun**
`storyId`, `runNumber`, `status` (`running|waiting_approval|failed|completed|cancelled`), `startedAt`, `finishedAt`. Uma história pode ter múltiplos runs (reentrada após rejeição ou falha).

**StageRun**
`pipelineRunId`, `stage` (1–6), `iteration` (tentativa; incrementa a cada retrabalho), `status` (`pending|running|passed|failed|rejected_auto|waiting_gate|skipped`), `startedAt`, `finishedAt`, `summary`.

**AgentRun**
`stageRunId`, `agentId`, `status` (`queued|running|succeeded|failed`), `input` (JSON), `output` (JSON), `startedAt`, `finishedAt`, `model`, `tokensIn`, `tokensOut`, `logs` (texto).

**Gate**
`pipelineRunId`, `code` (`G1|G2|G3|CR`), `kind` (`human|automatic`), `status` (`pending|approved|rejected`), `checklist` (JSON array de itens com `label` e `autoStatus` pass/fail/na), `requiredRole` (nulo quando `kind=automatic`), `decidedBy` (usuário ou `agent:code_review`), `decidedAt`, `comment`.

**CodeReview**
`storyId`, `pipelineRunId`, `stageRunId`, `iteration` (1..N), `commitSha` (commit revisado), `baseSha`, `status` (`approved|approved_with_comments|rejected|error`), `score` (0–100), `policySnapshot` (JSON: limiares vigentes na decisão), `deterministicChecks` (JSON: lista de `{id,label,blocking,status,detail}`), `summary` (texto PT-BR), `modelUsed`, `startedAt`, `finishedAt`, `gateId` (gate automático `CR`).

**CodeReviewFinding**
`codeReviewId`, `source` (`deterministic|llm`), `severity` (`blocker|major|minor|info`), `category` (`correctness|security|maintainability|performance|readability|architecture_conformance|acceptance_criteria|test_quality|style`), `file`, `lineStart`, `lineEnd`, `title`, `description`, `suggestion`, `fingerprint` (hash estável de file+category+título normalizado), `status` (`open|resolved|persisting`, comparado à iteração anterior), `taskId` (tarefa de correção gerada, quando aplicável).

**Artifact**
`storyId` (opcional `taskId`), `agentRunId` (opcional), `type` (`requirements|architecture_adr|diagram|test_cases|test_report|security_report|deploy_log|release_notes|code_summary|code_review_report`), `title`, `contentMarkdown`, `version`, `metadata` (JSON).

**Environment**
`projectId` (os 3 ambientes são criados automaticamente, **vazios**, ao criar o Projeto), `code` (`QA|HML|PRD`), `name`, `url` (URL **real** roteada pelo Traefik, ex.: `http://qa.checkout.localhost`), `currentVersion`, `currentPackageId`, `currentPackageDigest`, `liveStatus` (`not_deployed|up|down|degraded|unknown`, atualizado por health check periódico real); para PRD: `activeColor` (`blue|green`), `blueVersion`, `greenVersion`, `trafficBlue` (0–100), `trafficGreen` (0–100).

**Deployment**
`storyId`, `pipelineRunId`, `environmentCode`, `version`, `strategy` (`direct|blue_green`), `status` (`pending|building|in_progress|health_checking|succeeded|failed|rolled_back`), `startedAt`, `finishedAt`, `triggeredBy` (agent/human), `approvedGateId` (obrigatório para HML e PRD), `origin` (`real|simulated`), e os campos reais de execução: `packageId`, `packageVersion`, `packageDigest`, `packageRef` (ex.: `<repositório>/sdlc/payx/checkout@sha256:…`), `commitSha`, `containerIds` (JSON), `color` (`blue|green`, só PRD), `endpointUrl`, `healthCheckResults` (JSON), `smokeTestResults` (JSON), `deployLogRef`.

**PackageVersion** (imutável, append-only; nunca atualizar o conteúdo nem reutilizar versão)
`projectId`, `storyId`, `pipelineRunId`, `version` (ex.: `v1.4.3`), `commitSha`, `repositoryType`, `repositoryRef` (ex.: `<registry>/sdlc/payx/checkout`), `digest` (`sha256:…`), `manifestUrl`, `sbomUrl`, `signatureRef` (nullable), `sizeBytes`, `builtAt`, `builtBy` (`agent:deploy_qa`), `builder` (`local_docker|gitlab_ci`), `status` (`candidate|released|superseded|rejected`), `supersededByPackageId`. Somente o `status` (e `supersededByPackageId`) pode mudar; os demais campos são imutáveis.

**PackagePromotion**
`packageId`, `environmentCode` (`QA|HML|PRD`), `deploymentId`, `gateId` (obrigatório para HML e PRD), `status` (`active|replaced|rolled_back`), `promotedAt`, `promotedBy`. Promoção é **referência** ao mesmo pacote: não copia nem reconstrói.

**HistoryEvent** (imutável, append-only; nunca atualizar ou deletar)
`id`, `timestamp`, `itemType` (`system|project|epic|story|task`), `itemId`, `story IdRoot` (nullable, para agregação), `actorType` (`agent|human|system`), `actorId`, `actorName`, `action` (enum, ver 7.2), `message` (PT-BR, legível), `payload` (JSON), `artifactId` (nullable), `stage` (nullable), `gateCode` (nullable).

### 5.2 Relacionamentos e regras

- Exclusão em cascata lógica: arquivar Sistema arquiva Projetos, e assim por diante (soft delete via `status`).
- **Chaves legíveis** (`key`) únicas e geradas automaticamente: Sistema (4–5 letras maiúsculas), Épico `<PROJ>-E<n>`, História `<PROJ>-<n>`, Tarefa `<HIST>-T<n>`.
- Eventos de uma tarefa **propagam** para a história, épico, projeto e sistema (campos `storyId`, `epicId`, `projectId`, `systemId` denormalizados no evento) para permitir a visão "Atividade" em qualquer nível.

### 5.3 Status da História (derivado)

| `currentStage` / situação | `status` exibido |
|---|---|
| Sem pipeline iniciado | `Backlog` |
| Estágio 1 em execução | `Em Especificação` |
| Gate G1 pendente | `Aguardando Aprovação G1` |
| Estágio 2 | `Em Desenvolvimento / QA` |
| Estágio 3 | `Em Code Review` |
| Code Review reprovado (automático) | `Em Retrabalho (Code Review n/N)` (volta ao Estágio 2) |
| Gate humano reprovado (G1/G2/G3) | `Em Correção (<gate>)` (volta ao estágio de retorno; tarefas de correção abertas) |
| Estágio 4 | `Testes de Segurança` |
| Gate G2 pendente | `Aguardando Aprovação G2` |
| Estágio 5 | `Homologação` |
| Gate G3 pendente | `Aguardando Aprovação G3` |
| Estágio 6 | `Deploy em Produção` |
| Pipeline concluído | `Concluída` |
| Falha/rejeição | `Bloqueada` (com motivo) |

### 5.4 Configuração

Variáveis em `.env`:

```
LLM_MODE=local                   # local (único modo da demonstração) | mock (somente com NODE_ENV=test)
LLM_BASE_URL=http://<host-do-laboratorio>:<porta>/v1   # endpoint JÁ exposto no laboratório (compatível OpenAI)
LLM_API_KEY=                     # opcional; vazio se o endpoint não exige
LLM_API_STYLE=openai             # openai (padrão) | ollama
LLM_DEFAULT_MODEL=<nome-do-modelo-local>
# Mapa opcional de modelo por agente (JSON). Agentes sem entrada usam LLM_DEFAULT_MODEL.
LLM_MODEL_MAP={"requirements":"<modelo-a>","architecture":"<modelo-a>","test_design":"<modelo-b>","coding":"<modelo-codigo>","code_review":"<modelo-revisor>","security":"<modelo-b>"}   # preferir, no code_review, um modelo diferente do usado em coding
LLM_TIMEOUT_MS=180000            # modelos locais podem ser lentos
LLM_MAX_CONCURRENCY=2            # chamadas simultâneas ao laboratório
LLM_TEMPERATURE=0.2
LLM_MAX_OUTPUT_TOKENS=4096
LLM_CONTEXT_WINDOW=8192          # ajustar ao modelo real; usado no orçamento de contexto
LLM_JSON_MODE=auto               # auto | on | off (usa response_format/grammar se o servidor suportar)
LLM_TLS_INSECURE=false           # true apenas se o endpoint do lab usar certificado interno não confiável
PIPELINE_GATE_G2_POSITION=after_security   # after_dev_tests | after_security
CODE_REVIEW_ENABLED=true
CODE_REVIEW_MAX_ITERATIONS=3         # após N reprovações, a história fica Bloqueada e exige intervenção humana
CODE_REVIEW_MAX_BLOCKERS=0           # reprova se bloqueantes > este valor
CODE_REVIEW_MAX_MAJORS=2             # reprova se achados graves > este valor
CODE_REVIEW_MIN_SCORE=75             # reprova se score < este valor
CODE_REVIEW_MIN_COVERAGE=80          # cobertura mínima (do relatório de testes de dev); 0 desativa
CODE_REVIEW_MAX_DIFF_LINES=1500      # diffs maiores são revisados por partes; acima de 3x o limite reprova por "mudança grande demais"
CODE_REVIEW_ON_LLM_FAILURE=block     # block (falha do estágio, sem decisão) | deterministic_only (decide só com checagens determinísticas, sinalizado)
DATABASE_URL=file:./dev.db
# --- GitLab (instância existente do laboratório) ---
GITLAB_BASE_URL=https://<gitlab-do-laboratorio>
GITLAB_TOKEN=                    # token com escopo api (group/project access token ou PAT de conta de serviço); nunca logar
GITLAB_ROOT_GROUP=sdlc           # grupo raiz: sdlc/<sistema>/<projeto>
GITLAB_DEFAULT_BRANCH=main
GITLAB_VISIBILITY=private
GITLAB_TLS_INSECURE=false
GITLAB_MERGE_AFTER=prd_success   # prd_success (padrão) | review_approved: quando fazer o merge da MR na main
# --- Repositório de artefatos (instância existente) ---
ARTIFACT_REPO_TYPE=gitlab        # gitlab (Container + Package Registry) | nexus | artifactory | local
ARTIFACT_REPO_URL=               # URL do registry/repositório de artefatos
ARTIFACT_REPO_USER=
ARTIFACT_REPO_TOKEN=
ARTIFACT_REPO_ROOT=sdlc          # raiz de caminhos: sdlc/<sistema>/<projeto>
ARTIFACT_SIGN_PACKAGES=false     # assinar com cosign, se disponível
ARTIFACT_CANDIDATE_RETENTION_DAYS=30   # só candidatos nunca liberados podem ser removidos (por admin); pacotes released nunca
BUILD_MODE=local_docker          # local_docker | gitlab_ci (dispara pipeline no GitLab e aguarda o pacote publicado)
DEPLOY_MODE=docker               # docker | simulated (fallback sem Docker)
DOCKER_HOST=unix:///var/run/docker.sock
DEPLOY_DOMAIN_SUFFIX=localhost   # hosts: qa.<proj>.localhost, hml.<proj>.localhost, prd.<proj>.localhost
DEPLOY_NETWORK=sdlc-net
DEPLOY_HEALTH_TIMEOUT_MS=60000
DEPLOY_HEALTH_RETRIES=10
BLUEGREEN_STEPS=10,50,100        # etapas de tráfego do Green
BLUEGREEN_STEP_OBSERVE_MS=5000   # observação (health real) entre etapas
BLUEGREEN_STANDBY_MINUTES=30     # janela de standby do Blue após sucesso
TEST_MODE=real                   # real (padrão): executa os comandos de teste de review.yaml + smoke/regressão HTTP | simulated (contingência explícita)
SECURITY_MODE=real                # real (padrão): Trivy/Semgrep/gitleaks como contêineres efêmeros | simulated (contingência explícita)
```

---

## 6. Agentes de IA

Todos implementam a interface:

```ts
interface Agent {
  id: AgentId;
  name: string;            // PT-BR
  stage: 1|2|3|4|5|6;
  run(ctx: AgentContext): Promise<AgentResult>;
}

interface AgentContext {
  story: Story; epic: Epic; project: Project; system: System;
  previousArtifacts: Artifact[];
  correctionTasks?: Task[];     // Tarefas de correção geradas pela rejeição do gate (humano ou CR) que originou o loop (seção 7.5)
  humanFeedback?: string;       // comentário original da rejeição (conveniência; a fonte de verdade são as tarefas)
  llm: LLMProvider;
}

interface AgentResult {
  artifacts: ArtifactDraft[];   // docs gerados
  tasks?: TaskDraft[];          // tarefas a criar/atualizar
  storyPatch?: Partial<Story>;  // ex.: refinar critérios de aceite
  verdict: 'ok' | 'warning' | 'fail';
  summary: string;              // PT-BR, 1-3 frases
  logs: string[];
}
```

### Catálogo

| ID | Nome | Estágio | Responsabilidade | Principais saídas |
|---|---|---|---|---|
| `requirements` | Agente de Requisitos | 1 | Analisa a história, refina user story, gera requisitos funcionais/não funcionais, critérios de aceite (Gherkin), riscos e dúvidas em aberto | Artifact `requirements`; tarefas de análise; atualiza `acceptanceCriteria` |
| `architecture` | Agente de Arquitetura | 1 | Define abordagem técnica: componentes, integrações, modelo de dados, decisões (ADR), diagrama Mermaid, impactos NFR | Artifact `architecture_adr` + `diagram` (Mermaid); tarefas técnicas |
| `test_design` | Agente de Casos de Teste | 1 | Deriva casos de teste dos critérios de aceite: unitários, integração, funcionais, regressão, segurança; matriz de rastreabilidade requisito→teste | Artifact `test_cases` (tabela + Gherkin) |
| `coding` *(adicional)* | Agente de Codificação | 2 | **Altera o código real** da aplicação-alvo no **repositório GitLab do Projeto** (`sdlc/<sistema>/<projeto>`): cria branch `feature/<key>`, aplica mudanças, faz **commits e push reais** e abre/atualiza uma **Merge Request real** para a `main` (o merge ocorre conforme `GITLAB_MERGE_AFTER`), cria tarefas de desenvolvimento e marca progresso, e implementa também os **testes automatizados** correspondentes aos casos de teste (executáveis pelo comando definido em `review.yaml`). O código é gerado pelo **modelo local** (ver 6.1, `CODING_STRATEGY`); como **fallback** (modelo indisponível ou mudança que não compila/passa nos checks) aplica **patches pré-definidos** por cenário de demo (`packages/agents/src/patches/`), sinalizado no histórico, para que o código implantado realmente mude (ex.: novo endpoint/versão visível) | Artifact `code_summary` (diff, commit SHA, link da MR); commits e MR reais no GitLab |
| `code_review` *(adicional)* | Agente de Code Review | 3 | Revisa **automaticamente** o diff real da história lido do **GitLab** (MR `feature/<key>` → `main`) combinando **checagens determinísticas** (lint/build, secrets, tamanho do diff, testes alterados, cobertura) e **análise por LLM local** (corretude, segurança, manutenibilidade, aderência ao ADR e aos critérios de aceite). **Aprova ou reprova automaticamente** por política configurável; reprovação devolve achados ao Agente de Codificação (seção 6.2) | Artifact `code_review_report` (versionado por iteração); `CodeReview` + `CodeReviewFinding`; gate automático `CR`; tarefas de correção |
| `test_exec` | Agente de Execução de Testes | 2 e 5 | Executa (via adapter) testes de desenvolvimento no QA (estágio 2) e testes de regressão no HML (estágio 5); consolida resultados | Artifact `test_report` (passed/failed/skipped, cobertura, duração) |
| `security` | Agente de Segurança *(adicional, executa os testes de segurança do Estágio 4)* | 4 | Via adapter simula SAST, SCA (dependências), secrets scan, DAST e análise de licenças; classifica achados por severidade | Artifact `security_report` |
| `deploy_qa` | Agente de Deploy QA | 2 | **Constrói o pacote** (imagem Docker + manifesto + SBOM) a partir do commit da história (`BUILD_MODE`), **publica-o como pacote imutável e versionado no repositório de artefatos** e faz **deploy real e automático** desse pacote no QA (container + rota Traefik), executa health check e smoke tests reais | `PackageVersion` + Deployment (`origin=real`) + Artifact `deploy_log` |
| `deploy_hml` | Agente de Deploy Homologação | 5 | **Promove o mesmo pacote imutável** (mesmo digest) validado em QA, **sem rebuild**, para o ambiente HML com **deploy real**, **somente após G2 aprovado**; health check e smoke tests reais | Deployment (`origin=real`) + `deploy_log` |
| `deploy_prd` | Agente de Deploy Produção | 6 | **Promove o mesmo pacote imutável** (mesmo digest) para PRD com **Blue/Green real** (dois containers, troca real de pesos no Traefik, rollback real), **somente após G3 aprovado** | Deployment (`origin=real`) + `deploy_log` + `release_notes` |

> Nota: o usuário listou agentes para "executar testes" e "deploy em Teste/HML/PRD". O **Agente de Segurança**, o **Agente de Codificação** e o **Agente de Code Review** são adições necessárias para cobrir os Estágios 2, 3 e 4. Mantenha-os e sinalize-os na UI como "Agente complementar".

### Regras dos agentes

- **Agentes de deploy são determinísticos e não dependem do LLM para operar infraestrutura.** O LLM (quando ativo) apenas redige o log/relatório; as ações de build, deploy, roteamento e rollback são executadas por código do `DeployAdapter` (seção 9).
- **Pacote imutável, construído uma vez:** o pacote é construído e publicado no repositório de artefatos no deploy QA, e **o mesmo pacote (mesmo digest)** é promovido a HML e PRD. **Proibido rebuild** e proibido alterar um pacote publicado; uma correção de código gera **novo commit e nova versão de pacote** (seção 9.4).
- Cada execução cria um `AgentRun` e emite os eventos `AGENT_STARTED` / `AGENT_COMPLETED` / `AGENT_FAILED` no histórico.
- Os artefatos produzidos são **versionados** (`version` incrementa a cada nova geração para a mesma história/tipo).
- Em reexecução após rejeição de gate, o agente recebe as `correctionTasks` (e o comentário original) e deve tratá-las **uma a uma**, referenciando as chaves das tarefas no artefato ("Revisão v2: correções PAYX-101-T7, PAYX-101-T8") e registrando a resolução de cada tarefa (7.5).
- **`LocalLLMProvider` é o padrão** (ver 6.1). Prompts em `packages/agents/src/prompts/<agentId>.md`, saída em Markdown estruturado/JSON validado por Zod, com retries e reparo de saída (6.1).
- `MockProvider` (**exclusivo de testes automatizados/CI**, habilitado somente com `NODE_ENV=test`): conteúdo sintético para validar o orquestrador. **Não existem templates de conteúdo nem respostas pré-fabricadas na execução normal**; todo artefato, código e relatório da demonstração é gerado pelos modelos locais e pela plataforma. Se o endpoint de LLM estiver indisponível, o `AgentRun` falha com mensagem clara e a história fica `Bloqueada` (reexecutável).

### 6.1 Camada de LLM: modelos locais do laboratório

**Premissa:** os modelos já estão em operação e expostos no laboratório. A aplicação apenas os **consome**; não os provisiona.

**Interface**

```ts
interface LLMProvider {
  id: string;                                   // 'local' | 'mock'
  health(): Promise<LLMHealth>;                 // { ok, latencyMs, models: string[] }
  listModels(): Promise<string[]>;
  complete(req: LLMRequest): Promise<LLMResponse>;       // texto
  completeJSON<T>(req: LLMRequest, schema: ZodSchema<T>): Promise<LLMResponse<T>>; // saída estruturada validada
  stream?(req: LLMRequest): AsyncIterable<LLMChunk>;     // opcional, para logs ao vivo
}
interface LLMRequest { agentId: AgentId; model?: string; system: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number; }
interface LLMResponse<T = string> { output: T; model: string; tokensIn?: number; tokensOut?: number; latencyMs: number; raw?: unknown; }
```

**`LocalLLMProvider`: requisitos**

1. **Cliente HTTP** configurável por `LLM_BASE_URL` e `LLM_API_STYLE`.
   - `openai`: `POST {base}/chat/completions` e `GET {base}/models`. Suportar `stream`, `response_format` (JSON) e `max_tokens`/`temperature`.
   - `ollama`: `POST /api/chat` e `GET /api/tags` (adaptador opcional).
2. **Descoberta e validação no startup:** a API chama `health()` e `listModels()`; se `LLM_DEFAULT_MODEL` ou algum modelo do `LLM_MODEL_MAP` não existir no servidor, registra aviso claro e mostra no portal (não derruba a aplicação).
3. **Roteamento por agente:** `model = LLM_MODEL_MAP[agentId] ?? LLM_DEFAULT_MODEL`. Permite usar modelo de código para o Agente de Codificação e outro para os demais.
4. **Orçamento de contexto:** como modelos locais têm janela limitada (`LLM_CONTEXT_WINDOW`), o montador de prompt deve:
   - estimar tokens (aproximação por caracteres ou tokenizer leve);
   - priorizar: instruções do agente > história/critérios > artefatos anteriores **resumidos** > feedback humano;
   - **resumir/truncar** artefatos anteriores longos (ex.: passar só seções relevantes do ADR ao Agente de Casos de Teste) e registrar no `AgentRun` o que foi truncado.
5. **Saída estruturada robusta** (modelos locais erram mais formato):
   - usar `response_format`/modo JSON quando `LLM_JSON_MODE` permitir; caso contrário, instruir formato nos prompts com exemplos *few-shot*;
   - extrair JSON tolerante (remover cercas ```json, texto antes/depois, vírgulas finais);
   - validar com Zod; em falha, **reparo automático** (reenviar a saída inválida + erros do Zod pedindo correção), até **2 retries**; persistindo falha como `AGENT_FAILED` com a saída bruta nos logs;
   - preferir seções Markdown com marcadores fixos para conteúdo longo (ex.: `## Requisitos Funcionais`) e usar JSON apenas para metadados/listas curtas, reduzindo falhas de parsing.
6. **Resiliência:** timeout (`LLM_TIMEOUT_MS`), retry com backoff para erros de rede/5xx/429, **fila interna com limite de concorrência** (`LLM_MAX_CONCURRENCY`) para não sobrecarregar o servidor compartilhado do laboratório; cancelamento ao cancelar o pipeline.
7. **Streaming (quando suportado):** transmitir tokens parciais do agente via SSE para exibir "agente escrevendo..." no drawer do pipeline; sem streaming, exibir indicador de progresso.
8. **Observabilidade:** cada `AgentRun` grava `model`, `tokensIn/Out` (quando o servidor informa), `latencyMs`, prompt final (com redução de dados sensíveis, se houver) e saída bruta nos logs. O portal exibe **qual modelo local** produziu cada artefato.
9. **Privacidade:** todas as chamadas ficam dentro da rede do laboratório; é **proibido** chamar APIs externas de IA. Nenhum dado de história/código é enviado para fora. Logar apenas metadados fora do banco da aplicação.
10. **Determinismo na demo:** `temperature` baixa por padrão e suporte a `seed` quando o servidor aceitar, para resultados mais reprodutíveis.

**Agente de Codificação com modelo local** (mais sensível a qualidade do modelo):
- A saída do LLM deve ser **edições de arquivo estruturadas** (lista de `{path, action, content|patch}`) ou *unified diff*, **nunca** comandos de shell.
- Antes do commit: validar caminhos (apenas dentro do workspace do Projeto, sem `..`), tamanho máximo de mudança, aplicar em branch `feature/<key>` (commit e push reais para o GitLab, atualizando a MR), rodar **verificação objetiva** (build/`docker build` e testes/lint da aplicação-alvo). Falha → devolver o erro ao modelo para correção (até 2 iterações) e, persistindo, `AGENT_FAILED` e história `Bloqueada` com o log.
- **Sem patches pré-definidos nem resultado garantido:** se, após as iterações de correção permitidas (até 2), o modelo não produzir mudança que compile e passe nas verificações, o `AgentRun` falha (`AGENT_FAILED`) e a história fica `Bloqueada` com o log, podendo o apresentador reexecutar o estágio. Nenhum código, patch ou resultado pré-fabricado é injetado.

**Prompts para modelos locais:** escreva prompts curtos e diretivos, com papel, entrada, formato exato de saída e exemplo. Evite depender de capacidades avançadas (tool calling nativo, contextos longos). Versionar os prompts em `packages/agents/src/prompts/` e permitir **ajuste por agente** sem alterar código.

### 6.2 Agente de Code Review e decisão automática (Estágio 3)

**Objetivo:** revisar o código gerado/alterado para a história e **aprovar ou reprovar automaticamente**, sem intervenção humana, devolvendo feedback acionável ao Agente de Codificação.

**Entradas:** diff `main...feature/<key>` (via API do GitLab, compare/MR), mensagens de commit, `commitSha`, história e critérios de aceite, ADR (`architecture_adr`), casos de teste, `code_summary`, **`test_report` de dev (resultados e cobertura)**, convenções do projeto (`REVIEW_GUIDELINES.md` na raiz da aplicação-alvo; se ausente, usar o padrão da plataforma em `packages/agents/src/review/default-guidelines.md`) e achados da iteração anterior (para marcar resolvidos/persistentes).

**Arquitetura em 3 camadas (a decisão final NUNCA é delegada apenas ao LLM):**

1. **Checagens determinísticas** (executadas por código no workspace, sem LLM). Cada uma tem `blocking: true|false` e gera achado `source=deterministic`:
   - build e lint/format da aplicação-alvo passam (comandos definidos em `review.yaml` da aplicação-alvo; *blocking*);
   - **varredura de segredos** (regex de chaves/tokens/senhas e `gitleaks` se disponível; *blocking*);
   - tamanho do diff dentro de `CODE_REVIEW_MAX_DIFF_LINES` (acima de 3× → reprova por "mudança grande demais");
   - arquivos alterados apenas dentro de caminhos permitidos (sem `..`, sem alterar `Dockerfile`/infra sem justificativa no commit; *blocking*);
   - mudanças em dependências sinalizadas (novo pacote → `info`/`major` configurável);
   - **testes**: arquivos de código alterados têm testes novos/alterados correspondentes (heurística) e cobertura do `test_report` de dev ≥ `CODE_REVIEW_MIN_COVERAGE`;
   - resíduos de depuração (`console.log`, `debugger`, `TODO/FIXME`) conforme configuração;
   - **rastreabilidade**: cada critério de aceite aparece mapeado a ao menos um teste/mudança (usa `test_cases`).
2. **Análise por LLM local** (ver 6.1; modelo de `LLM_MODEL_MAP.code_review`, preferencialmente diferente do usado em `coding`):
   - **Chunking do diff por arquivo/hunk** respeitando `LLM_CONTEXT_WINDOW`; cada chunk recebe só o contexto necessário (trecho do ADR/critérios relevantes). Uma passada final **consolida e deduplica** os achados.
   - Saída em JSON validado (Zod) com lista de achados: `{file, lineStart, lineEnd, severity, category, title, description, suggestion}`.
   - **Validação anti-alucinação:** descartar ou rebaixar a `info` qualquer achado cujo `file`/linhas **não existam no diff**; limitar o número de achados por arquivo; exigir `suggestion` para `blocker`/`major`.
   - Prompts em `packages/agents/src/prompts/code_review.md`: papel de revisor sênior, severidades objetivas (`blocker` = bug/segurança/quebra de critério de aceite; `major` = risco relevante de manutenção/desempenho/erro tratado inadequadamente; `minor` = melhoria; `info` = observação), saída exata e exemplo *few-shot*.
3. **Motor de decisão determinístico** (código, política versionada e salva em `policySnapshot`):
   - `score = max(0, 100 − 30·blockers − 10·majors − 2·minors)`;
   - **`rejected`** se qualquer checagem *blocking* falhar **ou** `blockers > CODE_REVIEW_MAX_BLOCKERS` **ou** `majors > CODE_REVIEW_MAX_MAJORS` **ou** `score < CODE_REVIEW_MIN_SCORE`;
   - **`approved_with_comments`** se aprovado mas restam `major`/`minor` dentro dos limites (geram tarefas **não bloqueantes** `type=code_review` como débito técnico);
   - **`approved`** nos demais casos;
   - `error` se o LLM falhar após retries e `CODE_REVIEW_ON_LLM_FAILURE=block` (estágio `failed`, **não** é reprovação; história `Bloqueada` com "Code Review indisponível" e botão de reexecução). Com `deterministic_only`, decide só com as checagens determinísticas e marca o relatório como "revisão parcial (sem IA)".

**Gate automático `CR`:** a decisão é registrada em um `Gate` com `kind=automatic`, `code=CR`, `decidedBy=agent:code_review`, checklist = resultado das checagens + resumo de achados. Eventos `GATE_AUTO_APPROVED` / `GATE_AUTO_REJECTED` entram no histórico com a mensagem legível (ex.: *"Code Review aprovado automaticamente (score 92, 0 bloqueantes, 1 secundário) para o commit a1b2c3d."*). **Nenhuma ação humana aprova ou reprova o CR.** Humanos podem comentar e `admin` pode reexecutar o estágio.

**Reprovação → retrabalho automático:**
1. O `StageRun` do Estágio 3 termina `rejected_auto`; evento `REWORK_REQUESTED`; `story.reviewIteration++`; status `Em Retrabalho (Code Review n/N)`.
2. **Antes de iniciar o retrabalho**, é criada uma **Tarefa de correção** (`type=correction`, `origin=auto_review`, `originGateCode=CR`, `ownerType=agent`, `ownerRef=coding`, `stage=2`, `returnToStage=2`, `iteration=n`) **para cada achado** `blocker`/`major` (inclusive os de checagens determinísticas), vinculada ao achado (`CodeReviewFinding.taskId`); se a reprovação decorrer apenas do score/cobertura, cria-se uma tarefa agregada. Ver 7.5.
3. O pipeline retorna ao **Estágio 2**: o Agente de Codificação recebe as **tarefas de correção** (`correctionTasks`, com arquivo, linhas, descrição e sugestão de cada achado), corrige **no mesmo branch**, faz novo commit/push (MR atualizada) e gera **novo pacote imutável (nova versão)**, marcando o anterior como `superseded`; segue deploy QA e testes de dev e **volta ao Estágio 3** com nova revisão (iteração n+1).
4. Achados são comparados por `fingerprint`: ficam `resolved`, `persisting` ou novos; o relatório destaca "resolvidos nesta iteração".
5. Limite `CODE_REVIEW_MAX_ITERATIONS`: ao exceder, o Estágio 3 vira `failed`, a história `Bloqueada` com "Requer intervenção humana: Code Review reprovado N vezes" (badge visível e item na fila de atenção do dashboard).

**Invariantes:**
- A revisão é **vinculada ao `commitSha`**. Qualquer novo commit (inclusive após rejeição de G2/G3) **invalida** a aprovação anterior e exige novo Code Review.
- O pacote implantado registra o `commitSha` no manifesto (e como label `sdlc.commit=<sha>`); deploys em HML e PRD validam que existe `CodeReview` aprovado (`approved` ou `approved_with_comments`) **para o mesmo commit** (seção 13).
- Toda execução gera `AgentRun`, `Artifact` `code_review_report` (v1..vn, em Markdown, com resumo, tabela de checagens, achados agrupados por severidade com trechos do diff e sugestões) e eventos de histórico.
- O LLM **não** executa comandos nem altera arquivos; só produz achados.
- O resultado de cada iteração é publicado na **Merge Request do GitLab**: nota-resumo (decisão, score, política) e **discussões inline** nos arquivos/linhas dos achados (`commentMergeRequest`), além do `Artifact` no portal. Labels da MR: `sdlc::code-review-approved` / `sdlc::code-review-rejected`.

---

## 7. Orquestrador de Pipeline e Histórico

### 7.1 Pipeline: estágios, agentes e gates

```
┌────────────┐ G1 ┌──────────────────┐     ┌────────────┐ CR  ┌────────────┐ G2 ┌────────────────┐ G3 ┌───────────────┐
│1 ESPECIFI- │👤─▶│2 CODIFICAÇÃO +   │────▶│3 CODE      │🤖──▶│4 TESTES DE │👤─▶│5 HOMOLOGAÇÃO + │👤─▶│6 PRODUÇÃO     │
│  CAÇÃO     │    │  DEPLOY QA +     │     │  REVIEW    │     │  SEGURANÇA │    │  REGRESSÃO     │    │  BLUE/GREEN   │
│            │    │  TESTES DE DEV   │     │ (automático)│     │            │    │                │    │               │
└────────────┘    └──────────────────┘     └─────┬──────┘     └────────────┘    └────────────────┘    └───────────────┘
                           ▲                      │
                           └── CR reprovado: retrabalho automático (até CODE_REVIEW_MAX_ITERATIONS) ──┘
```

| Estágio | Nome | Agentes (ordem) | Execução | Saída para o gate |
|---|---|---|---|---|
| 1 | Especificação | `requirements` → `architecture` → `test_design` | Automática | **Gate G1** (aprovação humana) |
| 2 | Codificação, Deploy QA e Testes de Dev | `coding` → `deploy_qa` → `test_exec` (testes de dev) | Automática (**deploy real no QA** sem aprovação) | Segue direto ao Estágio 3 |
| 3 | Code Review | `code_review` | Automática, com **decisão automática** (gate `CR`) | **Aprovado** → Estágio 4 · **Reprovado** → retrabalho automático no Estágio 2 |
| 4 | Testes de Segurança | `security` | Automática | **Gate G2** (aprovação humana) |
| 5 | Deploy HML e Regressão | `deploy_hml` → `test_exec` (regressão) | Automática **após G2 aprovado** (**deploy real no HML**) | **Gate G3** (aprovação humana) |
| 6 | Deploy Produção (Blue/Green) | `deploy_prd` | Automática **após G3 aprovado** (**Blue/Green real**) | Fim |

*(Com `PIPELINE_GATE_G2_POSITION=after_dev_tests`, o G2 é avaliado após o Estágio 3 (Code Review) e antes do Estágio 4, e o Estágio 4 (Segurança) passa a rodar entre G2 e o deploy em HML sem novo gate.)*

### 7.2 Máquina de estados

- **Pipeline:** `running` → `waiting_approval` (ao atingir gate) → `running` (aprovado) | volta ao estágio de retorno com as **Tarefas de correção** (rejeitado) → `completed` | `failed`.
- **Rejeição de gate:** o pipeline retorna ao **início do estágio que alimenta o gate** (G1→Estágio 1, G2→Estágio 2, G3→Estágio 5; **CR→Estágio 2, de forma automática**; o estágio de retorno pode ser ajustado na rejeição humana, sempre a um estágio anterior ao do gate), **cria antes as Tarefas de correção (7.5)**, cria novo `StageRun` e reexecuta agentes pertinentes com essas tarefas como entrada. Incrementar `runNumber` apenas se for necessário um novo `PipelineRun` (padrão: manter o mesmo run e registrar tentativas).
- **Reprovação automática de Code Review:** não é uma falha de estágio; é um retorno controlado ao Estágio 2 (ver 6.2), com limite de iterações.
- **Falha de agente/estágio** (ex.: teste falhou, vulnerabilidade crítica): estágio `failed`, história `Bloqueada`, evento `STAGE_FAILED`; botão "Reexecutar estágio" disponível para papel `admin` ou o papel responsável.
- **Idempotência:** reexecuções criam novos `AgentRun`; nunca sobrescrevem os anteriores.
- **Concorrência:** uma história tem no máximo 1 `PipelineRun` ativo.
- O orquestrador roda como worker interno (fila em memória + persistência de estado no DB) e emite eventos SSE a cada transição.

### 7.3 Quality Gates

| Gate | Quando | Papel aprovador | Checklist automático (exibido ao aprovador) |
|---|---|---|---|
| **G1** | Fim do Estágio 1 | `product_owner` ou `architect` | Requisitos gerados ✔; critérios de aceite definidos (≥ 1) ✔; ADR/arquitetura gerada ✔; casos de teste cobrem 100% dos critérios de aceite ✔; riscos abertos listados |
| **G2** | Após Estágio 4 | `qa_lead` + `security_lead` (qualquer um com papel válido; registrar quem) | Deploy QA OK ✔; testes de dev: 0 falhas, cobertura ≥ 80% ✔; **Code Review aprovado para o commit implantado (score e achados visíveis)** ✔; segurança: 0 críticos, 0 altos sem justificativa ✔; artefatos presentes ✔ |
| **G3** | Fim do Estágio 5 | `release_manager` | Deploy HML OK ✔; regressão 100% dos casos críticos passando ✔; sem incidentes abertos; notas de release geradas ✔; janela de mudança confirmada (checkbox manual) |

**Decisão automática (sem humano):**

| Gate | Quando | Decisor | Critérios |
|---|---|---|---|
| **CR** | Fim do Estágio 3 | `agent:code_review` (motor de decisão da seção 6.2) | Checagens determinísticas *blocking* OK ✔; bloqueantes ≤ `CODE_REVIEW_MAX_BLOCKERS` ✔; graves ≤ `CODE_REVIEW_MAX_MAJORS` ✔; score ≥ `CODE_REVIEW_MIN_SCORE` ✔; cobertura ≥ mínimo ✔ |

Cada gate **humano** (G1–G3): ações **Aprovar** e **Rejeitar** (comentário obrigatório na rejeição, opcional na aprovação). A rejeição aceita ainda **itens de correção** (lista opcional) e o **estágio de retorno**; cada rejeição gera Tarefa(s) de correção (7.5). A decisão cria `HistoryEvent` (`GATE_APPROVED` / `GATE_REJECTED`) com `actorType=human`. O gate `CR` gera `GATE_AUTO_APPROVED` / `GATE_AUTO_REJECTED` com `actorType=agent`.
Apenas personas com o `requiredRole` (ou `admin`) conseguem decidir; demais veem o gate em modo leitura.

### 7.4 Histórico (catálogo de ações)

`ITEM_CREATED`, `ITEM_UPDATED`, `STATUS_CHANGED`, `PIPELINE_STARTED`, `STAGE_STARTED`, `STAGE_COMPLETED`, `STAGE_FAILED`, `AGENT_STARTED`, `AGENT_COMPLETED`, `AGENT_FAILED`, `ARTIFACT_CREATED`, `TASK_CREATED`, `TASK_UPDATED`, `GATE_REQUESTED`, `GATE_APPROVED`, `GATE_REJECTED`, `GATE_AUTO_APPROVED`, `GATE_AUTO_REJECTED`, `REWORK_REQUESTED`, `GIT_COMMIT_PUSHED`, `MERGE_REQUEST_OPENED`, `MERGE_REQUEST_MERGED`, `MERGE_FAILED`, `PACKAGE_BUILT`, `PACKAGE_PUBLISHED`, `PACKAGE_PROMOTED`, `PACKAGE_INTEGRITY_FAILED`, `DEPLOY_STARTED`, `DEPLOY_SUCCEEDED`, `DEPLOY_FAILED`, `TRAFFIC_SHIFTED`, `ROLLBACK_EXECUTED`, `COMMENT_ADDED`, `PIPELINE_COMPLETED`.

**Requisitos de histórico:**
- Todo evento tem mensagem em PT-BR legível, p. ex.: *"Agente de Requisitos gerou 8 requisitos e 5 critérios de aceite (Requisitos v1)."*
- Eventos com artefato exibem link/preview do artefato.
- Humanos também podem registrar **comentários** em qualquer item (`COMMENT_ADDED`).
- Histórico é **append-only**.

### 7.5 Loops de correção e Tarefas de correção

**Definição:** *loop de correção* é qualquer retorno do pipeline a um estágio anterior causado por **reprovação de um quality gate**: **G1, G2, G3** (humanos) ou **CR** (automático).

**Regras (invariantes verificadas por testes):**

1. **Sem tarefa, sem retrabalho.** Antes de reexecutar qualquer agente em um loop de correção, o orquestrador **cria Tarefa(s) de correção** (`type=correction`) na mesma operação que emite `REWORK_REQUESTED`. Reexecutar sem ao menos uma tarefa de correção aberta é erro interno.
2. **Quantas tarefas:**
   - **Gate humano (G1–G3):** uma tarefa por **item de correção** informado no modal de rejeição; se nenhum item for informado, **uma única tarefa** com o comentário completo da rejeição.
   - **CR (automático):** uma tarefa por achado `blocker`/`major` (inclusive de checagens determinísticas); tarefa agregada se a reprovação for só por score/cobertura (ver 6.2).
3. **Conteúdo obrigatório:** `origin` (`gate_rejection` ou `auto_review`), `originGateId`/`originGateCode`, `iteration`, `returnToStage`, `feedback` (texto original), `stage` e responsável.
4. **Responsável:** `ownerType=agent`; `ownerRef` = agente primário do estágio de retorno (1→`requirements`, que reexecuta a cadeia do estágio; 2→`coding`; 5→`deploy_hml`). `admin` pode reatribuir a um humano.
5. **Ciclo de vida:** `todo` (criada na rejeição) → `in_progress` (quando o estágio de retorno inicia) → `done` quando o agente conclui a correção **e registra a resolução** (`resolutionSummary`, `resolutionArtifactIds` com a nova versão do artefato, `resolutionCommitSha` e `resolutionPackageId` quando houver mudança de código). Falha do agente → `blocked` + `AGENT_FAILED`.
6. **Re-solicitação do gate:** o gate (ou o CR) só é re-solicitado/re-executado quando **todas** as tarefas de correção do loop estão `done`.
7. **Recorrência:** nova reprovação do mesmo gate cria novas tarefas com `iteration+1` e `parentTaskId` apontando para a equivalente anterior (por `fingerprint` no CR; informado ou por título nos humanos). As anteriores permanecem `done` como histórico.
8. **Rastreabilidade:** cada criação/mudança de tarefa gera `TASK_CREATED`/`TASK_UPDATED` com `gateCode`; `REWORK_REQUESTED` lista as chaves das tarefas. Exemplo: *"Tarefa de correção PAYX-101-T7 criada a partir da reprovação do G2 por Carla (Estágio 2, iteração 1): 'cobertura insuficiente no endpoint de QR Code'."*
9. **Imutabilidade da origem:** campos de origem (`origin*`, `feedback`, `iteration`) não são editáveis; humanos podem comentar e `admin` pode reatribuir.
10. **Fora do escopo desta regra:** falhas de estágio que não vêm de gate (ex.: teste falhou, health check falhou) permanecem como `STAGE_FAILED` + reexecução manual, sem exigir tarefa de correção.
11. **UI:** aba Tarefas com filtro **Correções**; cartão do gate com "Correções vinculadas" e seus status; laço de retorno do pipeline com contador de correções abertas; badge "Correções abertas" no cabeçalho da história.

---

## 8. Deploy Blue/Green real (Estágio 6)

Implementação **real** no ambiente onde a plataforma roda, usando Docker + Traefik:

1. **Estado inicial.** Dois casos: **(a) primeiro release do projeto em PRD** (não existe versão anterior): `deploy_prd` sobe o container `prd-<proj>-blue` com o pacote, valida health/smoke reais e roteia **100%** para ele; não há troca progressiva nem Blue de reserva, e uma falha deixa o PRD `not_deployed` (Deployment `failed`). **(b) releases seguintes:** container `prd-<proj>-blue` ativo com 100% do tráfego (versão `vN`) e `green` ausente ou parado; aplicam-se os passos 2 a 10.
2. **Provisionar Green:** `deploy_prd` sobe o container `prd-<proj>-green` com o **pacote promovido** (mesmo digest validado no QA/HML, versão `vN+1`) na rede `sdlc-net`, sem receber tráfego. O estado vai para `provisioning` → `health_checking`.
3. **Health check real:** polling HTTP em `GET <healthPath>` do Green (direto pela rede interna, não pelo domínio público) com `DEPLOY_HEALTH_RETRIES` e `DEPLOY_HEALTH_TIMEOUT_MS`. Falha → aborta, remove Green, mantém Blue (nenhum impacto ao usuário), Deployment `failed`.
4. **Smoke tests reais:** executar as verificações do `smoke.yaml` da aplicação-alvo contra o Green (ex.: `GET /version` deve retornar a versão esperada; endpoints críticos retornam 2xx). Resultados salvos em `smokeTestResults`.
5. **Troca progressiva de tráfego real:** o `DeployAdapter` reescreve o arquivo dinâmico do Traefik (`infra/traefik/dynamic/prd-<proj>.yml`) usando **serviço ponderado** (`weighted`) nas etapas de `BLUEGREEN_STEPS` (ex.: 10% → 50% → 100%). Entre etapas, observa por `BLUEGREEN_STEP_OBSERVE_MS` fazendo health checks reais e medindo taxa de erro das requisições de teste. Cada etapa emite `TRAFFIC_SHIFTED` com os pesos efetivos.
6. **Rollback automático real:** se health/smoke/taxa de erro falhar em qualquer etapa, os pesos voltam a **Blue 100% / Green 0%**, o container Green é parado e removido, Deployment `rolled_back`, evento `ROLLBACK_EXECUTED`.
7. **Sucesso:** Green passa a 100% e vira o ativo; Blue permanece **em standby (container parado, não removido)** pela janela `BLUEGREEN_STANDBY_MINUTES`, habilitando o **rollback manual** (botão "Rollback", papel `release_manager`), que **reinicia o Blue e restaura os pesos de verdade**. Após a janela, o container Blue antigo é removido.
8. **Verificável na prática:** o endpoint público `http://prd.<proj>.localhost/version` da aplicação-alvo reflete a versão real que está recebendo tráfego. Durante a troca, é possível ver as respostas alternando entre versões. A tela de PRD no portal mostra a **versão consultada ao vivo** (chamada real ao endpoint) ao lado da versão registrada.
9. A UI mostra o diagrama azul/verde com pesos, versões, pacote (versão/digest) e saúde, animado pelos eventos SSE. O mesmo componente é usado na tela do ambiente PRD e no Estágio 6 do pipeline da história.
10. **Demonstração do Blue/Green:** exige **ao menos dois releases** do mesmo projeto (o primeiro cria o Blue; o segundo executa a troca Blue→Green). O rollback é demonstrável de forma real e ao vivo pelo botão **Rollback** (durante o standby) e ocorre automaticamente se os health checks/smoke tests **reais** falharem. **Não há falhas pré-programadas.**

---

## 9. Adapters (todos reais por padrão)

Em `packages/adapters`, cada adapter tem interface estável. Todas as implementações padrão são **reais** (Git, artefatos, build, deploy, testes e segurança). Modos simulados existem apenas como **contingência explícita**, com banner "Modo simulado" e **sem resultados ou falhas pré-programados**:

```ts
interface DeployAdapter {
  // Deploy por ambiente SEMPRE a partir de um pacote imutável (referência por digest); nunca faz build
  deploy(input: {
    env: 'QA'|'HML'|'PRD';
    projectId: string;
    packageRef: PackageRef;        // { repository, version, digest, manifestUrl } — o adapter faz pull por digest e verifica integridade
    version: string;
    strategy: 'direct'|'blue_green';
    approvedGateId?: string;      // OBRIGATÓRIO para HML e PRD; adapter valida
  }): AsyncIterable<DeployStep>;  // emite passos/logs reais em streaming
  shiftTraffic(input: { projectId: string; blueWeight: number; greenWeight: number }): Promise<void>;
  rollback(input: { projectId: string; env: 'PRD' }): Promise<void>;
  status(input: { projectId: string; env: 'QA'|'HML'|'PRD' }): Promise<EnvLiveStatus>; // health real
}
interface TestRunnerAdapter {
  run(input: { suite: 'dev'|'regression'|'smoke'; storyKey: string; env?: 'QA'|'HML'|'PRD'; testCases: TestCase[] }): Promise<TestReport>;
}
interface SecurityScannerAdapter {
  scan(input: { storyKey: string; packageRef?: PackageRef; commitSha?: string }): Promise<SecurityReport>; // SAST (código), SCA/secrets/licenças/DAST (pacote por digest)
}
interface GitProvider {                                   // GitLabProvider (único provedor)
  ensureGroup(path: string): Promise<GitGroup>;            // ex.: 'sdlc/payx' (cria 'sdlc' e subgrupo se necessário; idempotente)
  ensureProject(input: { groupPath: string; key: string; runtime: 'node'|'python' }): Promise<GitProject>; // 'sdlc/payx/checkout'
  createBranch(projectId: string, name: string, fromRef: string): Promise<void>;
  commit(projectId: string, branch: string, message: string, changes: FileChange[]): Promise<{ sha: string }>;
  compare(projectId: string, base: string, head: string): Promise<Diff>;
  openMergeRequest(input: MergeRequestInput): Promise<MergeRequest>;
  commentMergeRequest(mrIid: number, note: { body: string; inline?: { file: string; line: number } }): Promise<void>;
  mergeMergeRequest(mrIid: number): Promise<{ mergeSha: string }>;
  tag(projectId: string, name: string, sha: string, message: string): Promise<void>;
}
interface PackageBuilder {                                // BUILD_MODE=local_docker | gitlab_ci
  build(input: { projectId: string; commitSha: string; version: string }): Promise<BuiltPackage>; // imagem + manifesto + SBOM
}
interface ArtifactRepository {                            // GitLab Registry (padrão) | Nexus | Artifactory | local
  publish(pkg: BuiltPackage): Promise<PackageRef>;        // FALHA se a versão já existir (imutável)
  resolve(projectId: string, version: string): Promise<PackageRef | null>;
  verify(ref: PackageRef): Promise<{ ok: boolean; reason?: string }>; // digest/checksum/assinatura
  list(projectId: string): Promise<PackageRef[]>;
}
type PackageRef = { repository: string; version: string; digest: string; manifestUrl: string };
```

### Implementações

| Adapter | `DEPLOY_MODE` / `TEST_MODE` / `SECURITY_MODE` | Comportamento |
|---|---|---|
| `DockerDeployAdapter` | `DEPLOY_MODE=docker` (**padrão**) | **Real.** Pull do **pacote por digest** com verificação de integridade, `docker run`/API, rede, labels, health check, rotas Traefik, pesos Blue/Green, rollback (ver 9.2 e seção 8). **Não faz build.** |
| `GitLabProvider` | sempre | **Real.** API REST v4 do GitLab: grupos/projetos `sdlc/<sistema>/<projeto>`, branches, commits, Merge Requests, discussões inline, tags (ver 9.3). |
| `GitLabRegistryRepository` | `ARTIFACT_REPO_TYPE=gitlab` (**padrão**) | **Real.** Container Registry + Package Registry do GitLab; publicação imutável, verificação de digest (ver 9.4). |
| `NexusRepository` / `ArtifactoryRepository` / `LocalRegistryRepository` | `ARTIFACT_REPO_TYPE=nexus\|artifactory\|local` | **Real**, alternativas à implementação padrão, mesma interface `ArtifactRepository`. |
| `LocalDockerPackageBuilder` / `GitLabCiPackageBuilder` | `BUILD_MODE=local_docker\|gitlab_ci` | **Real.** Constrói o pacote (imagem + manifesto + SBOM); o segundo dispara pipeline no GitLab e aguarda a publicação. |
| `SimulatedDeployAdapter` | `DEPLOY_MODE=simulated` | Contingência explícita para máquinas sem Docker (não usar na demonstração). Passos e logs simulados; Deployments marcados com `origin=simulated` e banner visível no portal ("Modo simulado"). |
| `CommandTestRunner` | `TEST_MODE=real` (**padrão**) | **Real.** Executa no clone de trabalho os comandos de teste de `review.yaml` (unitários/integração criados pelo Agente de Codificação a partir dos casos de teste), extrai resultados e **cobertura** do relatório da ferramenta e roda *smoke*/regressão por **requisições HTTP reais** contra o ambiente implantado (`smoke.yaml` acumulado do projeto). |
| `ToolSecurityScanner` | `SECURITY_MODE=real` (**padrão**) | **Real.** Executa **scanners open source como contêineres efêmeros** via Docker (Trivy para pacote/dependências, Semgrep para SAST, gitleaks para segredos) e normaliza o relatório por severidade. Se uma ferramenta estiver indisponível (ex.: sem acesso à base de vulnerabilidades em ambiente offline), o estágio **falha com mensagem explícita**; nenhum resultado é inventado (a base pode ser fornecida localmente via configuração). |
| `SimulatedTestRunner` / `SimulatedSecurityScanner` | `TEST_MODE=simulated` / `SECURITY_MODE=simulated` | **Contingência explícita**, nunca usada na demonstração: resultados sintéticos neutros, sem falhas programadas, com banner "Modo simulado". |

### 9.1 Contrato de implantabilidade e esqueletos de runtime (sem aplicação de exemplo)

**Não existe aplicação-alvo pré-fabricada.** A aplicação é criada ao vivo: o usuário descreve épicos e histórias; os agentes de Requisitos, Arquitetura, Casos de Teste e Codificação produzem o design e o código no repositório GitLab do Projeto.

**Criação do Projeto:** o formulário solicita nome, chave, descrição e **runtime** (`node` ou `python`; lista extensível em `packages/templates/runtimes/`), além de porta (default `8080`) e `healthPath` (default `/health`).

**Esqueleto neutro (provisionado em `ensureProject`):** apenas arquivos de plataforma, **sem lógica de negócio**:
- `README.md` (nome, descrição e links do portal), `.gitignore`;
- `Dockerfile` do runtime (multi-stage quando aplicável, usuário não-root, `EXPOSE`, `HEALTHCHECK`);
- servidor HTTP mínimo com `GET /health` e `GET /version`;
- `review.yaml` (comandos de build, lint e testes do runtime) e `smoke.yaml` (inicialmente só `/health` e `/version`);
- `.sdlc/contract.md` (o contrato abaixo).

**Contrato de implantabilidade** (injetado nos prompts do Agente de Codificação e verificado pelo pipeline):
- escuta na porta definida por `PORT`; serviço **stateless**; configuração **somente por variáveis de ambiente**; sem segredos no repositório;
- `GET /health` → `200` quando saudável; `GET /version` → `{"version":"<APP_VERSION>","commit":"<GIT_SHA>","env":"<APP_ENV>","color":"<blue|green>"}`, em que **versão e commit são gravados no pacote no build** e **`env` e `color` são injetados em tempo de deploy** (o pacote permanece idêntico entre ambientes);
- `Dockerfile` íntegro e build reprodutível; testes automatizados executáveis por `review.yaml`;
- `smoke.yaml` **cresce a cada história** (verificações derivadas dos critérios de aceite, escritas pelo Agente de Codificação a partir dos casos de teste) e é a base dos *smoke tests* e da regressão HTTP reais.

**Verificação objetiva:** um pacote que não constrói, não passa nos testes ou cujo `/health` falha após o deploy **não avança**: falha de estágio explícita, sem substituição por conteúdo pré-pronto.

### 9.2 Regras do `DockerDeployAdapter`

- **Nomes e labels:** containers `<env>-<projKey>[-<color>]`; labels `sdlc.managed=true`, `sdlc.project`, `sdlc.env`, `sdlc.story`, `sdlc.version`, `sdlc.color`. Apenas recursos com `sdlc.managed=true` podem ser alterados/removidos pelo adapter.
- **Rede:** todos na rede `sdlc-net`; sem publicar portas diretamente no host (exceto Traefik e o portal). Acesso via Traefik por host (`<env>.<projKey>.<DEPLOY_DOMAIN_SUFFIX>`).
- **Isolamento por ambiente:** QA, HML e PRD são containers e rotas distintos, com variáveis de ambiente próprias (`APP_ENV`).
- **Limites:** `--memory` e `--cpus` configurados por ambiente (defaults baixos, ex.: 256 MB / 0.5 CPU) para não saturar o host.
- **Idempotência e limpeza:** QA e HML usam estratégia `direct` (substitui container: sobe novo, valida saúde, troca, remove antigo, para minimizar indisponibilidade). Comando `pnpm demo:reset` remove todos os recursos `sdlc.managed=true` e reinicia o estado.
- **Guard rails de gate:** o adapter **recusa** `deploy` em `HML`/`PRD` se `approvedGateId` ausente, não aprovado ou de outra história/run, e registra o bloqueio no histórico (defesa em profundidade, além da validação no orquestrador).
- **Pacote por digest:** o adapter só implanta um `packageRef` com `digest`; faz `pull` por digest (`repo@sha256:…`), chama `ArtifactRepository.verify` e **aborta** (evento `PACKAGE_INTEGRITY_FAILED`) se o digest divergir ou o pacote não existir no repositório. Tags mutáveis nunca são usadas para implantar.
- **Logs reais:** stdout dos passos (build, run, health) é transmitido via SSE e persistido em `deployLogRef`/Artifact `deploy_log`. Logs de build truncados em tamanho máximo configurável.
- **Segurança operacional:** o socket Docker só é acessível pelo processo da API; nenhum comando shell é montado a partir de entrada do usuário sem sanitização (usar API do Docker/args em array, nunca interpolação de strings em shell).

### 9.3 Git: GitLab e estrutura `/sdlc/...`

**Estrutura de namespaces (obrigatória; exemplo ilustrativo, os nomes reais são definidos pelo usuário):**

```
/sdlc                         ← grupo raiz (GITLAB_ROOT_GROUP)
 ├─ payx                      ← subgrupo = Sistema (key em minúsculas)
 │   ├─ checkout              ← repositório = Projeto  →  sdlc/payx/checkout
 │   └─ reconciliation        ←                           sdlc/payx/reconciliation
 └─ <outro-sistema>/<projeto>
```

- **Provisionamento automático e idempotente:** criar um **Sistema** no portal garante o subgrupo `sdlc/<sistema>`; criar um **Projeto** garante o repositório `sdlc/<sistema>/<projeto>` com o **esqueleto neutro do runtime** escolhido (9.1), marcado com o tópico `sdlc-managed`. Se já existirem **e tiverem a marca `sdlc-managed`**, são **reutilizados** (sem erro); se existirem sem a marca, a criação **falha com erro explícito de colisão** (nunca sobrescreve conteúdo alheio). Os identificadores do GitLab são gravados em `System`/`Project` (seção 5).
- **Branches:** `main` (protegida; sem push direto) e `feature/<STORY-KEY>` (uma por história). **Tags:** `v<versão>` no commit empacotado, **protegidas** (imutáveis).
- **Merge Request real** `feature/<KEY>` → `main`: título `[<KEY>] <título da história>`; descrição com link da história no portal, critérios de aceite e links dos artefatos; labels `sdlc::stage-N`, `sdlc::code-review-approved|rejected`. O Agente de Code Review comenta na MR (nota + discussões inline, ver 6.2).
- **Quando fazer o merge:** por padrão (`GITLAB_MERGE_AFTER=prd_success`) **após o deploy em Produção bem-sucedido**, de modo que a `main` reflita o que está em produção; `review_approved` mergeia assim que o Code Review aprova. Em conflito: evento `MERGE_FAILED` e tarefa (`type=other`) para humano; **não altera o pacote já implantado**.
- **Rastreabilidade nos commits:** autor "SDLC Bot" e *trailers* `Story: <KEY>`, `Agent: coding`, `AgentRun: <id>`, `Iteration: <n>`.
- **Segurança:** `GITLAB_TOKEN` só no backend, nunca logado nem enviado ao navegador; permissões mínimas no grupo `sdlc`; retries com *backoff* e respeito a limites de taxa da API.
- **Clone de trabalho:** `workspaces/<sistema>/<projeto>` é apenas cache descartável (build local, lint, testes); a **fonte da verdade é o GitLab**. Toda mudança só "existe" após `push`.

### 9.4 Repositório de artefatos e pacote imutável

**Estrutura de caminhos:** `/sdlc/<sistema>/<projeto>/<versão>`. Com o repositório padrão (GitLab): imagem de contêiner em `<registry>/sdlc/<sistema>/<projeto>:<versão>` (referenciada por **digest**) e, no *Package Registry*, o pacote genérico `release-manifest` (versão `<versão>`) contendo `manifest.json` e `sbom.json` (e `signature` se `ARTIFACT_SIGN_PACKAGES=true`). Nexus/Artifactory seguem o mesmo caminho lógico.

**O que é o pacote imutável:** imagem OCI (identificada por digest) + `manifest.json` + `sbom.json` (+ assinatura opcional). O manifesto contém apenas **fatos de build**: `system`, `project`, `version`, `storyKey`, `commitSha`, URL da MR, `pipelineRunId`, `builtAt`, `builder`, `imageDigest`, imagem base, checksums e digest do SBOM. **Evidências de gates, testes, segurança e promoções ficam no banco da plataforma**, ligadas ao `packageId`, e **nunca modificam o pacote**.

**Fluxo (Estágio 2):** `coding` faz push do commit → `deploy_qa` aciona `PackageBuilder.build` (`BUILD_MODE=local_docker` ou `gitlab_ci`) → `ArtifactRepository.publish` (falha se a versão existir) → cria `PackageVersion` (`candidate`), tag `v<versão>` no GitLab, eventos `PACKAGE_BUILT` e `PACKAGE_PUBLISHED` → deploy real **desse pacote** no QA.

**Regras de imutabilidade e promoção:**
1. **Publicar uma vez:** versão já existente não pode ser sobrescrita (a plataforma recusa e o repositório é configurado para impedir *redeploy*/tags mutáveis, quando suportado: *immutable tags*, tags protegidas, Nexus sem redeploy, Artifactory sem sobrescrita).
2. **Promover é referenciar:** QA → HML → PRD usam **o mesmo digest**. A promoção cria `PackagePromotion` e o evento `PACKAGE_PROMOTED`; **não há rebuild, cópia com alteração nem edição do pacote**.
3. **Configuração por ambiente em tempo de deploy** (variáveis, segredos, hosts, `APP_ENV`, cor do Blue/Green): **nunca embutida no pacote**.
4. **Verificação de integridade** antes de cada deploy (digest, checksum e, se houver, assinatura). Divergência → deploy abortado, evento `PACKAGE_INTEGRITY_FAILED`, história `Bloqueada`.
5. **Segurança e testes usam o pacote:** o Estágio 4 escaneia o **pacote por digest**; regressão e smoke tests rodam contra o pacote implantado.
6. **Versionamento:** `v<MAJOR>.<MINOR>.<PATCH>` por projeto, **monotônico e atribuído no build** (base em `Project.versionBase`, default `0.1.0`: a **primeira versão do projeto é a própria base**; PATCH incrementa automaticamente a partir da **maior versão já existente no repositório de artefatos**, evitando colisão após um `demo:reset`; MAJOR/MINOR alterados por `admin`/PO nas configurações do projeto). **Cada novo commit gera uma nova versão** (inclusive após loops de correção); versões nunca são reutilizadas.
7. **Estados do pacote:** `candidate` (publicado, em QA/HML) → `released` (promovido a PRD com sucesso) | `superseded` (substituído por novo pacote da mesma história após correção) | `rejected` (pipeline cancelado/reprovado definitivamente). Pacotes `released` e `superseded` **nunca são apagados**; apenas candidatos nunca liberados podem ser removidos por `admin` após `ARTIFACT_CANDIDATE_RETENTION_DAYS`.
8. **Ligação com Code Review e gates:** HML e PRD só aceitam pacote cujo `commitSha` possui Code Review aprovado e cujo gate correspondente (G2/G3) está aprovado (seção 13).

---

## 10. API (REST + SSE)

Base: `/api`. JSON. Validação com Zod. Erros: `{ error: { code, message, details? } }`.

### Hierarquia

```
GET/POST        /systems
GET/PATCH/DELETE /systems/:id
GET/POST        /systems/:id/projects
GET/PATCH/DELETE /projects/:id
GET/POST        /projects/:id/epics
GET/PATCH/DELETE /epics/:id
GET/POST        /epics/:id/stories
GET/PATCH/DELETE /stories/:id
GET/POST        /stories/:id/tasks
GET/PATCH/DELETE /tasks/:id
```

### Histórico e artefatos

```
GET  /:itemType/:id/history?cursor=&limit=&actorType=&action=&stage=   # inclui descendentes (query ?scope=self|descendants)
POST /:itemType/:id/comments
GET  /stories/:id/artifacts
GET  /artifacts/:id
```

### Pipeline

```
POST /stories/:id/pipeline/start             # inicia run
GET  /stories/:id/pipeline                   # estado completo: run, stages, agentRuns, gates, deployments
POST /stories/:id/pipeline/stages/:n/retry
GET  /stories/:id/code-reviews               # iterações do Code Review (status, score, commit, decisão)
GET  /code-reviews/:id                        # checagens determinísticas, achados (com trecho do diff), política aplicada, comparação com a iteração anterior
GET  /stories/:id/tasks?type=correction       # tarefas de correção (origem, gate, iteração, resolução)
GET  /projects/:id/packages                    # versões de pacote do projeto (status, digest, promoções por ambiente)
GET  /stories/:id/packages
GET  /packages/:id                             # detalhes + manifesto + SBOM + promoções + evidências (gates/testes/segurança)
POST /packages/:id/verify                      # verifica digest/integridade no repositório de artefatos
GET  /projects/:id/git                         # repositório GitLab, branches, MRs ativas
GET  /stories/:id/merge-request                # MR da história (link, status, labels)
GET  /integrations/health                      # GitLab, repositório de artefatos, Docker e LLM
POST /stories/:id/pipeline/cancel
GET  /gates?status=pending&role=             # fila de aprovações
POST /gates/:id/approve   { comment? }
POST /gates/:id/reject    { comment, returnToStage?, correctionItems?: string[] }   # comentário obrigatório; gera Tarefa(s) de correção
```

### Ambientes e deploys

```
GET  /environments                       # inclui liveStatus real e URL pública
GET  /environments/:code/live            # consulta ao vivo (health + /version) da aplicação implantada
GET  /environments/PRD/blue-green        # pesos reais, versões, pacote (versão/digest), saúde de cada cor
POST /environments/PRD/rollback          # rollback manual real (papel release_manager)
GET  /deployments?storyId=&env=
GET  /deployments/:id/logs               # logs reais do deploy (também via SSE)
POST /admin/demo/reset                   # limpa recursos sdlc.managed=true e reinicia estado (papel admin)
```

### Tempo real

```
GET /events/stream     # SSE; eventos: history.created, pipeline.updated, gate.updated, deployment.updated, traffic.updated
```

### Camada de LLM

```
GET  /llm/health          # estado do endpoint local do laboratório, latência, modelos disponíveis, mapa de modelos por agente
GET  /llm/models
POST /llm/test            # (admin) envia prompt curto de diagnóstico a um modelo e retorna resposta/latência
```

### Personas (demo)

```
GET  /personas                  # lista de papéis/pessoas de demonstração
header: X-Persona: <personaId>  # enviado pelo frontend; usado para autorização por papel e como `actorName`
```

---

## 11. Portal: Páginas e componentes

### 11.1 Navegação / mapa de telas

| Rota | Tela |
|---|---|
| `/` | **Dashboard** (em instalação nova, **vazio**, com **checklist de prontidão** das integrações e a ação "Criar primeiro Sistema"): KPIs (histórias por estágio, aprovações pendentes, lead time médio, taxa de sucesso de deploy, **taxa de aprovação do Code Review na 1ª tentativa**, média de iterações de review, histórias que exigem intervenção), feed de atividade recente, atalhos |
| `/systems` | Lista/cards de Sistemas + criar |
| `/systems/[id]` | Detalhe do Sistema: projetos, atividade, saúde |
| `/projects/[id]` | Detalhe do Projeto: épicos, progresso, atividade, **link do repositório GitLab (`sdlc/<sistema>/<projeto>`)** |
| `/projects/[id]/packages` | **Pacotes:** versões publicadas no repositório de artefatos (versão, digest, commit, status `candidate/released/superseded`), promoções por ambiente (QA/HML/PRD), manifesto/SBOM e link para o repositório de artefatos |
| `/epics/[id]` | Detalhe do Épico: histórias (lista + Kanban por estágio) |
| `/stories/[id]` | **Tela principal:** pipeline visual + abas (ver 11.2) |
| `/tasks/[id]` | Detalhe da Tarefa (drawer/modal ou página) |
| `/approvals` | Fila de aprovações pendentes (por gate) com checklist e ação Aprovar/Rejeitar |
| `/environments` | QA, HML, PRD, com **URL real clicável**, versão registrada **e versão consultada ao vivo** (chamada real a `/version`), health real, pacote (versão/digest); PRD com visualização Blue/Green com pesos reais de tráfego |
| `/agents` | Catálogo de agentes: descrição, estágio, **modelo local atribuído**, últimas execuções, latência média, tokens, taxa de sucesso; painel de **saúde do LLM local** (endpoint, modelos disponíveis, botão "Testar conexão") |
| `/activity` | Feed global de histórico com filtros |

Elementos globais: **breadcrumb hierárquico** (Sistema › Projeto › Épico › História › Tarefa), busca global (chaves e títulos), seletor de **persona** no cabeçalho, indicador de aprovações pendentes (badge), botão "Nova ..." contextual.

### 11.2 Tela de História (`/stories/[id]`)

Layout:

1. **Cabeçalho:** chave, título, prioridade, pontos, status derivado, **branch e Merge Request no GitLab**, **pacote atual (versão/digest)**, badge **Correções abertas**, botão **"Iniciar Pipeline"** (se não iniciado) / **"Reexecutar estágio"** (se falho).
2. **Pipeline visual (destaque, topo da página)** — ver 11.3.
3. **Abas:**
   - **Visão Geral:** user story, critérios de aceite, descrição, metadados.
   - **Code Review:** uma seção por iteração (1..N) com decisão automática (aprovado/reprovado), score, commit revisado, tabela de checagens determinísticas, achados agrupados por severidade com **trecho do diff e sugestão**, indicação de `resolvido/persistente/novo` e política aplicada; link para o relatório (artefato).
   - **Tarefas:** tabela com chave, tipo, responsável (ícone de agente 🤖 ou humano 👤), status, estágio. Filtro **Correções** (`type=correction`) exibindo gate de origem, iteração, estágio de retorno, feedback original e resolução (commit, pacote, artefato).
   - **Artefatos:** lista versionada por tipo; visualizador Markdown com renderização de Mermaid e tabelas; comparar versões (diff simples).
   - **Histórico:** timeline vertical cronológica com filtros (ator: agente/humano/sistema; estágio; ação). Cada evento: ícone, ator, mensagem, horário, link para artefato/gate/deploy; expandir mostra `payload` e logs.
   - **Deploys:** lista de Deployments por ambiente e versão, com commit, pacote (versão/digest), resultados de health/smoke test e **log real expansível** (streaming enquanto em execução). Links diretos para abrir o ambiente implantado (QA/HML/PRD).
   - **Testes e Segurança:** últimos `test_report` e `security_report` resumidos (gráficos simples de pass/fail e severidades).
4. **Painel lateral de Gate:** quando há gate pendente para a persona atual, exibir card com checklist automático, links para artefatos relevantes e botões **Aprovar** / **Rejeitar** (modal com comentário, **lista opcional de itens de correção** — cada item vira uma Tarefa de correção — e seleção do **estágio de retorno**, com padrão conforme o gate).

### 11.3 Componente: Pipeline Visual

Use **React Flow** (ou SVG próprio) em layout horizontal com **6 colunas de estágio**, **3 losangos de gate humano (G1, G2, G3)** e **1 gate automático (CR)** entre os Estágios 3 e 4, mais uma **aresta de retorno** do Estágio 3 ao Estágio 2 (retrabalho).

- **Nó de Estágio:** título, ícone, status (cor + ícone), duração, lista dos agentes com status individual (chips: `queued`, `running` com spinner, `succeeded`, `failed`). Clique abre drawer com `AgentRuns` (entrada/saída resumida, logs, artefatos gerados).
- **Nó de Gate (quality gate):** formato de losango/escudo com código `G1/G2/G3`, estado: `bloqueado`, `pendente de aprovação` (pulsando, destaque âmbar), `aprovado` (verde, com nome e horário do aprovador), `rejeitado` (vermelho). Clique abre checklist e histórico de decisões.
- **Nó de Gate automático (`CR`):** escudo com ícone de robô, visualmente distinto dos gates humanos (sem botões de aprovação), estados `executando`, `aprovado automaticamente` (verde, com score), `reprovado automaticamente` (vermelho, com nº de bloqueantes/graves) e contador "Tentativa n/N". A **aresta de retorno** 3→2 anima quando há reprovação e exibe o número do retrabalho. Clique abre o relatório da iteração.
- **Arestas:** animadas quando em execução; cinza quando pendentes; verdes quando concluídas.
- **Indicadores de ambiente:** badges `QA`, `HML`, `PRD` nos estágios 2, 5 e 6 com versão implantada. O estágio 6 incorpora o mini-diagrama Blue/Green.
- **Legenda** e **linha do tempo compacta** (duração total e por estágio).
- Atualização em tempo real via SSE (sem reload).
- Acessível: estados também comunicados por texto/ícone, não só por cor.

### 11.4 Componentes reutilizáveis

`HierarchyBreadcrumb`, `StatusBadge`, `PriorityTag`, `AgentChip`, `HistoryTimeline`, `ArtifactViewer` (Markdown + Mermaid), `PipelineGraph`, `GateCard`, `GateDecisionModal`, `BlueGreenDiagram`, `KanbanByStage`, `PersonaSwitcher`, `EmptyState`, `ConfirmDialog`, `DataTable`.

---

## 12. Identidade visual (Dell)

Implementar como **design tokens** em `tailwind.config.ts` e CSS variables, para ajuste fácil.

> Observação: usar uma **interpretação** da identidade Dell Technologies (azul corporativo, interface limpa, muito branco, tipografia sans-serif). **Não** reproduzir logotipos oficiais com ativos protegidos: usar um **placeholder de logo** (`/public/brand/logo-placeholder.svg`) com o texto "Dell Technologies" estilizado em texto/SVG simples, substituível pelo usuário pelo ativo oficial.

### Paleta (tokens)

| Token | Valor sugerido | Uso |
|---|---|---|
| `--dell-blue` | `#0076CE` | Cor primária, ações, links, destaques |
| `--dell-blue-dark` | `#0063B8` / `#00447C` | Hover/pressed, cabeçalho secundário |
| `--dell-navy` | `#012169` | Cabeçalho/sidebar, títulos de seção |
| `--dell-black` | `#1F1F1F` / `#212121` | Texto principal |
| `--dell-gray-900…100` | escala neutra | Superfícies, bordas, texto secundário |
| `--bg` | `#FFFFFF` / `#F4F6F8` | Fundo principal / fundo de app |
| `--success` | `#2E7D32` | Aprovado / sucesso |
| `--warning` | `#ED8B00` | Pendente / atenção (gates aguardando) |
| `--danger` | `#D32F2F` | Falha / rejeitado |
| `--info` | `#0076CE` | Informativo / em execução |

### Tipografia e estilo

- Fonte: **Roboto** (fallback: `"Segoe UI", Arial, sans-serif`). Títulos em peso 500–700; corpo 400.
- Raios de borda pequenos (4–6px), sombras sutis, layout "corporativo limpo" com bastante espaço em branco.
- Cabeçalho superior com logo placeholder + título "**Portal SDLC**", barra lateral escura (`--dell-navy`) com ícones e texto.
- Botão primário: fundo `--dell-blue`, texto branco, hover `--dell-blue-dark`. Botão secundário: borda azul, fundo transparente.
- Ícones: `lucide-react`.
- Suporte a **modo claro** (padrão). Modo escuro opcional (fase final).
- Responsivo desktop-first (≥ 1280px otimizado; funcional ≥ 768px).
- Acessibilidade: contraste WCAG AA, foco visível, `aria-*` nos nós do pipeline.

---

## 13. Regras de negócio e validações (resumo)

1. Não é possível iniciar pipeline sem `userStory` ou título preenchidos (o Agente de Requisitos pode refinar, mas precisa de insumo mínimo).
2. Estágio N+1 só inicia com Estágio N `passed` **e** gate intermediário `approved` (quando aplicável; no Estágio 3 → 4 o gate é o `CR` automático).
3. **Deploy em HML e PRD sem `approvedGateId` é proibido** (validação no backend e no adapter, com erro explícito e evento `DEPLOY_FAILED`/bloqueio registrado).
4. Rejeição de gate exige comentário (≥ 10 caracteres).
5. Só o papel exigido (ou `admin`) pode aprovar/rejeitar o gate correspondente; tentativa indevida retorna 403 e registra evento de sistema.
6. Segurança: achados `critical` bloqueiam automaticamente o Estágio 4 (`failed`); `high` sem justificativa mantêm o checklist do G2 em vermelho e exigem comentário do aprovador para prosseguir.
7. Histórico imutável: nenhuma API de update/delete para `HistoryEvent`.
8. Toda mutação relevante emite `HistoryEvent` + evento SSE na mesma transação lógica.
9. **Pacote imutável:** o pacote é construído e publicado uma única vez (Estágio 2) no repositório de artefatos; QA, HML e PRD só aceitam **o mesmo `packageId`/digest**. Rebuild, sobrescrita de versão e promoção de digest diferente são bloqueados (orquestrador e adapter), com evento no histórico.
10. **Deploy real exige health check aprovado** antes de ser considerado `succeeded`; sem health check bem-sucedido o Deployment falha e a história fica `Bloqueada`.
11. **Só um deploy por ambiente/projeto por vez** (lock); deploys concorrentes ficam em fila.
12. **Code Review obrigatório e atrelado ao commit:** HML e PRD só recebem pacotes cujo `commitSha` possui `CodeReview` com status `approved` ou `approved_with_comments`. Validação no orquestrador **e** no `DockerDeployAdapter` (`commitSha` do manifesto/label `sdlc.commit` do pacote). Novo commit invalida a revisão anterior.
13. **Decisão do Code Review é automática:** não existe API para aprovar/reprovar o gate `CR` manualmente; apenas reexecutar o estágio (papel `admin` ou `architect`). Tentativas de decisão manual retornam 405/403 e registram evento de sistema.
14. **Limite de iterações:** ao exceder `CODE_REVIEW_MAX_ITERATIONS`, a história fica `Bloqueada` exigindo intervenção humana; a reexecução manual zera o contador somente com comentário justificando.
15. **Versionamento de pacote:** `v<MAJOR>.<MINOR>.<PATCH>` por projeto, atribuído no **build** e monotônico (PATCH automático). Cada novo commit gera nova versão; versões nunca são reutilizadas (seção 9.4).
16. **Tarefa de correção obrigatória em loops de gate:** nenhuma reexecução originada em G1, G2, G3 ou CR pode iniciar sem ao menos uma Tarefa de correção aberta (`type=correction`) vinculada ao gate; o gate só é re-solicitado quando todas estiverem `done` (seção 7.5).
17. **GitLab é a fonte da verdade do código:** mudanças de código só são consideradas existentes após commit/push no GitLab (`sdlc/<sistema>/<projeto>`); a `main` é protegida e alterada apenas por Merge Request.

---

## 14. Bootstrap e roteiro de demonstração (sem dados pré-fabricados)

**Princípio:** o portal inicia **vazio**. A plataforma **não cria** Sistema, Projeto, Épico, História, Tarefa, histórico, artefato, pacote, deploy nem aplicação de exemplo. **O usuário cria tudo durante a demonstração**, e os agentes produzem de forma autônoma todo o restante do ciclo. Fixtures existem apenas em testes automatizados (banco isolado, `MockProvider`), nunca na execução da demo.

**Bootstrap (`pnpm infra:up && pnpm db:setup`) cria somente configuração:**
- migrações do banco;
- **personas** (papéis, sem dados de negócio): Ana (Product Owner), Bruno (Arquiteto), Carla (QA Lead), Diego (Security Lead), Elisa (Release Manager) e Admin;
- **catálogo dos 10 agentes** (descrição, estágio, modelo atribuído via `LLM_MODEL_MAP`);
- **políticas padrão** (checklists de G1–G3, política do Code Review);
- **infraestrutura:** Traefik e rede `sdlc-net`, e garantia do **grupo raiz `sdlc`** no GitLab (único recurso externo criado no bootstrap, vazio).

**Pronto para usar:** `GET /integrations/health` e o dashboard exibem o **checklist de prontidão** (GitLab, repositório de artefatos, Docker/Traefik, LLM local). Com tudo verde, o dashboard oferece "Criar primeiro Sistema".

**Estados vazios e criação rápida (UX de demonstração):**
- Todo nível vazio (Sistemas, Projetos, Épicos, Histórias, Tarefas, Pacotes, Atividade) tem `EmptyState` com a ação de criação correspondente.
- Formulários curtos, com mínimo de campos obrigatórios: **Sistema** (nome, chave, descrição); **Projeto** (nome, chave, descrição, **runtime**); **Épico** (título, descrição); **História** (título e descrição livre; a *user story* e os critérios de aceite são refinados pelo Agente de Requisitos, e o usuário pode editá-los); **Tarefa**. Opção "adicionar outro" para criar várias histórias em sequência.
- Ao criar o Projeto, os ambientes **QA, HML e PRD** são registrados como `not_deployed`; o primeiro deploy real em QA cria o primeiro contêiner.

**Reinício entre demonstrações (`pnpm demo:reset`):** limpa o banco e remove contêineres e rotas `sdlc.managed=true`, retornando o portal ao estado **vazio**. Por imutabilidade, **GitLab e repositório de artefatos são preservados por padrão**; `--purge-gitlab` remove também subgrupos/projetos com a marca `sdlc-managed` e pacotes candidatos nunca liberados (quando o repositório permitir). O versionamento calcula a próxima versão a partir do que já existe no repositório de artefatos (9.4), evitando colisões.

**Roteiro do apresentador (`docs/DEMO_GUIDE.md`):** documento de apoio, **não automação**. Sugere o fluxo; o domínio da aplicação é escolhido pelo usuário:
1. Verificar a prontidão no dashboard e criar o **Sistema** e o **Projeto** (escolher o runtime); mostrar o grupo/repositório criado no GitLab.
2. Criar um **Épico** e uma **História** simples e autocontida (dica: histórias pequenas deixam o pipeline mais rápido com modelos locais).
3. **Iniciar o pipeline**; acompanhar os agentes do Estágio 1 e os artefatos; decidir o **G1** como Ana.
4. Estágio 2: commit e Merge Request no GitLab, pacote no repositório de artefatos, **deploy real em QA** (abrir a URL do QA) e testes de dev. Estágio 3: Code Review automático (ver os comentários na MR).
5. Estágio 4 (segurança) e **G2** como Carla; opcionalmente **rejeitar o G2 de propósito** para mostrar a Tarefa de correção, a correção pelo agente e o gate re-solicitado.
6. **HML** (deploy real do mesmo pacote) e regressão; **G3** como Elisa; **PRD**: o primeiro release sobe o Blue.
7. Para mostrar o **Blue/Green**, criar uma **segunda história** (pequena mudança) e percorrer o pipeline: ver a troca progressiva de tráfego e usar o **Rollback**.
8. Navegar pelo histórico em todos os níveis, pelos pacotes e pelo GitLab.

---

## 15. Requisitos não funcionais

- **Pré-requisitos:** Node 20+, pnpm, **Docker Engine/Docker Desktop em execução** (ou `DEPLOY_MODE=simulated`).
- **Rodar localmente com poucos comandos:** `pnpm i && pnpm infra:up && pnpm db:setup && pnpm dev` (README com passos e prints). `pnpm demo:reset` restaura o ambiente.
- **Tempo de resposta** das APIs de leitura < 300 ms em volumes típicos de demonstração.
- **Duração da demonstração:** depende do desempenho dos modelos locais e dos builds reais. Meta: pipeline completo de uma **história pequena** em até ~30 min, com **progresso visível em tempo real** (streaming dos agentes, logs de build/deploy) para que a espera seja informativa.
- **Sem dependência de serviços externos de nuvem.** Dependências de infraestrutura: **Docker local**, o **endpoint de LLM local**, a **instância GitLab** e o **repositório de artefatos** do laboratório (todos já em operação). Nenhuma chamada a APIs externas de IA.
- **Idempotência da infraestrutura:** `infra:up` e os deploys podem ser repetidos sem efeitos colaterais; `demo:reset` remove tudo que o sistema criou.
- **Logs estruturados** (pino) no backend.
- **Tipagem estrita** (`strict: true`), sem `any` não justificado.
- **Testes mínimos:**
  - Unit: máquina de estados do pipeline (todas as transições, rejeições, falhas), regras de gate/permissão, blue/green.
  - Unit: **geração de Tarefas de correção** (uma por item/achado, tarefa única padrão, recorrência com `parentTaskId`, invariante "sem tarefa, sem retrabalho"), **imutabilidade do pacote** (republicação recusada, digest divergente recusado, versionamento monotônico) e **motor de decisão do Code Review** (score, limiares, `approved/approved_with_comments/rejected/error`), validação anti-alucinação dos achados contra o diff, comparação de achados entre iterações (`fingerprint`).
  - Integração (API): fluxo completo feliz, fluxo com rejeição de gate humano e fluxo de reprovação do Code Review (reprova → tarefas de correção → retrabalho → aprova); bloqueio de deploy HML/PRD para commit sem Code Review aprovado. **Fixtures, repositórios de teste e `MockProvider` são exclusivos de testes automatizados** (banco isolado) e **nunca** fazem parte da execução da demonstração.
  - Integração de deploy (requer Docker, marcados `@docker`): build → deploy QA → promoção HML → Blue/Green PRD com validação real de `/version`; rollback real; recusa de deploy sem gate aprovado.
  - E2E (Playwright): navegar hierarquia, iniciar pipeline, aprovar os 3 gates, ver histórico.

---

## 16. Mensagens e textos (PT-BR)

- Toda a UI em Português do Brasil, tom profissional.
- Nomes de estágios: **Especificação**, **Codificação & QA**, **Code Review**, **Testes de Segurança**, **Homologação**, **Produção**.
- Nomes de gates: **CR · Decisão Automática de Code Review**, **G1 · Aprovação de Especificação**, **G2 · Aprovação para Homologação**, **G3 · Aprovação para Produção**.
- Formatar datas com `pt-BR` e fuso do navegador.

---

## 17. Plano de implementação por fases

**Fase 1: Fundação**
Monorepo, `shared` (enums/schemas), Prisma schema + migrations, API CRUD da hierarquia, `HistoryEvent` básico (`ITEM_CREATED/UPDATED`), **bootstrap mínimo (sem dados de demonstração)**, estados vazios e formulários de criação rápida, layout do portal com tokens Dell, navegação hierárquica e breadcrumbs, **`GitProvider`/GitLab: provisionamento idempotente de `sdlc/<sistema>` e `sdlc/<sistema>/<projeto>` ao criar Sistema/Projeto**, `GET /integrations/health`.

**Fase 2: Histórico e artefatos**
Timeline de histórico por item (com agregação de descendentes), comentários, `Artifact` + `ArtifactViewer` (Markdown + Mermaid), SSE.

**Fase 3: Orquestrador e agentes**
Máquina de estados, `AgentRun`/`StageRun`, interface `Agent`, **`LocalLLMProvider`** (cliente dos modelos locais, descoberta de modelos, orçamento de contexto, JSON robusto com reparo, fila/concorrência, streaming), `MockProvider` exclusivo de testes automatizados, prompts dos 10 agentes (**sem conteúdo pré-fabricado**), geração de tarefas e artefatos, Estágio 1 + G1 completos, **geração e ciclo de vida das Tarefas de correção a partir de rejeições de gate (7.5)**, tela de aprovações.

**Fase 4: Estágios 2 a 5 (inclui Code Review)**
Adapters reais (`GitLabProvider`, `ArtifactRepository`, `PackageBuilder`, `DockerDeployAdapter`, `CommandTestRunner`, `ToolSecurityScanner` com scanners em contêineres efêmeros), infraestrutura Traefik/rede, **esqueletos neutros de runtime** e provisionamento de repositórios no GitLab (commits, branch e **Merge Request reais**), **build, publicação e versionamento do pacote imutável**, página de pacotes e **deploy real** do pacote em QA automático, `test_exec`, **Agente de Code Review (checagens determinísticas, análise por LLM local com chunking do diff, motor de decisão automático, gate `CR`, retrabalho automático com `correctionTasks`, relatório por iteração)**, `security`, G2, `deploy_hml` (promoção real do mesmo pacote), regressão, G3, regras de rejeição/falha/retry.

**Fase 5: Produção Blue/Green**
Estágio 6, **Blue/Green real** (dois containers, pesos Traefik reais, health/smoke reais), `BlueGreenDiagram` com dados ao vivo, rollback automático e manual reais, **primeiro release (Blue inicial)**, `release_notes`.

**Fase 6: Pipeline visual**
`PipelineGraph` com estados em tempo real, drawer de AgentRuns, cards de Gate, legenda, acessibilidade.

**Fase 7: Dashboard, ambientes, agentes e polimento**
Dashboard com KPIs, `/environments`, `/agents`, `/activity`, `DEMO_GUIDE.md` (roteiro do apresentador, sem dados pré-criados), README, testes E2E, ajustes visuais finais.

---

## 18. Critérios de aceite (Definition of Done)

**Hierarquia e histórico**
- [ ] Criar Sistema → Projeto → Épico → História → Tarefa pela UI e navegar entre níveis por breadcrumb e links.
- [ ] Abrir **qualquer** item e visualizar seu histórico completo (agentes, humanos, sistema), com filtros e links para artefatos.
- [ ] Histórico de nível superior mostra eventos dos descendentes (toggle "incluir itens filhos").

**Pipeline**
- [ ] Cada história exibe o pipeline com 6 estágios, 3 gates humanos (G1–G3) e 1 gate automático (CR), estados atualizados em tempo real.
- [ ] Estágio 1 executa os 3 agentes e para em **G1**; só segue à Codificação após aprovação humana.
- [ ] Estágio 2 executa codificação (**commit e Merge Request reais no GitLab** `sdlc/<sistema>/<projeto>`), **build e publicação do pacote imutável no repositório de artefatos e deploy real automático desse pacote em QA** (sem aprovação) e testes de dev; `http://qa.<proj>.localhost/version` retorna a versão/commit da história.
- [ ] **Estágio 3 (Code Review)** revisa automaticamente o diff real do commit implantado no QA e **aprova ou reprova sem ação humana**, aplicando a política configurada; a decisão, o score e os achados ficam no histórico e na aba "Code Review".
- [ ] Quando o Code Review **reprovar** (por checagens determinísticas ou análise do LLM sobre o código real gerado), o pipeline volta ao Estágio 2 automaticamente, são criadas Tarefas de correção, o Agente de Codificação corrige, novo pacote é publicado, deploy QA e testes de dev se repetem e o Code Review reavalia; achados resolvidos aparecem como `resolvido`. Comprovado em teste de integração com fixture exclusiva de teste.
- [ ] Ao exceder `CODE_REVIEW_MAX_ITERATIONS`, a história fica `Bloqueada` com indicação de intervenção humana.
- [ ] Não existe forma de aprovar/reprovar o gate `CR` manualmente; deploy em HML/PRD de commit sem Code Review aprovado é recusado (orquestrador e adapter).
- [ ] Os achados citam arquivo/linhas existentes no diff (achados inválidos do LLM são descartados ou rebaixados); a decisão não depende apenas do veredito do LLM.
- [ ] Estágio 4 executa testes de segurança; **G2** exigido antes do deploy em HML.
- [ ] Estágio 5 faz **deploy real em HML** (mesmo pacote/digest do QA) **somente após G2** e roda regressão; **G3** exigido antes de PRD.
- [ ] Estágio 6 faz deploy **Blue/Green real** em PRD **somente após G3**, com troca progressiva de pesos no Traefik, health/smoke tests reais e rollback real; `http://prd.<proj>.localhost/version` reflete a versão que recebe tráfego.
- [ ] Se os health checks/smoke tests **reais** do Green falharem, o rollback automático real restaura o Blue (comprovado em teste de integração com pacote de teste defeituoso, fixture exclusiva de testes); o **rollback manual** real funciona durante o standby.
- [ ] A tela `/environments` mostra URL, health e versão **consultados ao vivo** de QA, HML e PRD.
- [ ] `pnpm demo:reset` limpa o banco e remove todos os contêineres/rotas `sdlc.managed=true`, devolvendo o portal ao estado **vazio**.
- [ ] Com `DEPLOY_MODE=simulated`, o fluxo completo funciona e o portal exibe o banner "Modo simulado".
- [ ] Tentar forçar deploy HML/PRD sem gate aprovado (via API) falha com erro claro e fica registrado no histórico.
- [ ] Rejeição de gate exige comentário, retorna ao estágio correto e o agente reexecuta tratando as Tarefas de correção (artefato v2 referencia as chaves das tarefas).

**Git, pacotes e correções**
- [ ] Criar um Sistema e um Projeto no portal cria/reutiliza no GitLab `sdlc/<sistema>` e `sdlc/<sistema>/<projeto>`; os identificadores ficam gravados e o link do repositório aparece no portal.
- [ ] O Agente de Codificação faz commits/push reais em `feature/<key>` e abre/atualiza uma Merge Request real; o Code Review comenta na MR (nota + discussões inline); a `main` só é alterada por MR (merge conforme `GITLAB_MERGE_AFTER`).
- [ ] O pacote é publicado **uma única vez** no repositório de artefatos (`/sdlc/<sistema>/<projeto>/<versão>`), com manifesto e SBOM; republicar a mesma versão é recusado.
- [ ] QA, HML e PRD executam **o mesmo digest**; nenhum rebuild ocorre após o QA; digest divergente ou pacote inexistente aborta o deploy com `PACKAGE_INTEGRITY_FAILED`.
- [ ] Um novo commit (ex.: após reprovação) gera **nova versão** de pacote e marca a anterior como `superseded`; versões nunca são reutilizadas.
- [ ] A tela `/projects/[id]/packages` lista versões, digest, commit, status e promoções por ambiente.
- [ ] **Toda rejeição de G1, G2, G3 e CR cria Tarefa(s) de correção antes do retrabalho**, com gate de origem, iteração, estágio de retorno e feedback; o ciclo `todo → in_progress → done` registra a resolução (artefato/commit/pacote).
- [ ] Tentativa de reexecutar um loop sem tarefa de correção falha; o gate só é re-solicitado com todas as tarefas do loop em `done`; reprovações recorrentes geram tarefas com `parentTaskId`.
**Demonstração sem dados pré-fabricados**
- [ ] Após `pnpm infra:up && pnpm db:setup`, o portal está **vazio** (nenhum Sistema, Projeto, Épico, História, Tarefa, histórico, artefato, pacote ou deploy), exibindo o checklist de prontidão e a ação "Criar primeiro Sistema".
- [ ] Todo conteúdo exibido (requisitos, ADR, casos de teste, código, testes, relatórios, pacotes, deploys) foi gerado pelos agentes e pela plataforma a partir do que o usuário criou; **nenhum** template de conteúdo, patch, aplicação de exemplo, resultado ou falha pré-programados é usado fora de testes automatizados.
- [ ] Criar Sistema + Projeto (com runtime) cria `sdlc/<sistema>/<projeto>` no GitLab com o esqueleto neutro e registra QA/HML/PRD como `not_deployed`.
- [ ] O primeiro release em PRD sobe o Blue com 100% do tráfego; o segundo release executa o Blue/Green real com troca progressiva de pesos.
- [ ] Com o LLM local indisponível, o agente falha com mensagem clara (sem conteúdo substituto) e a história fica `Bloqueada`, podendo ser reexecutada.

**Agentes**
- [ ] Os 10 agentes executam usando os **modelos locais do laboratório** (`LLM_MODE=local`), produzindo artefatos em PT-BR vinculados à história; nenhum agente chama API externa de IA.
- [ ] `/llm/health` e a tela `/agents` mostram o endpoint, os modelos disponíveis e o modelo atribuído a cada agente; "Testar conexão" funciona.
- [ ] Saída inválida do modelo local aciona reparo/retry; esgotados os retries, o `AgentRun` falha com log da saída bruta e a história é bloqueada de forma clara.
- [ ] O Agente de Codificação aplica mudanças validadas (caminhos restritos ao clone de trabalho, build e testes automatizados reais); se não conseguir após as iterações permitidas, falha de forma explícita, **sem patch de fallback**.
- [ ] Cada artefato exibe qual modelo local o gerou, tokens e latência.
- [ ] Cada execução aparece como `AgentRun` com entrada/saída/logs consultáveis no drawer do pipeline.
- [ ] Trocar `LLM_BASE_URL`/`LLM_DEFAULT_MODEL`/`LLM_MODEL_MAP` no `.env` muda os modelos usados sem alterar código de agentes/orquestrador.

**Portal / Dell**
- [ ] Identidade visual conforme seção 12 (tokens, tipografia, logo placeholder, paleta).
- [ ] Todas as rotas da seção 11.1 funcionam e usam dados reais da API.
- [ ] Fila `/approvals` lista gates pendentes por papel; persona sem permissão vê somente leitura.

**Qualidade**
- [ ] `pnpm i && pnpm infra:up && pnpm db:setup && pnpm dev` sobe a plataforma **vazia**, pronta para o usuário criar o primeiro Sistema.
- [ ] Testes unitários, de integração e E2E descritos na seção 15 passam em `pnpm test`.
- [ ] `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/DEMO_GUIDE.md` e `README.md` criados.

---

## 19. Pontos de extensão futuros (não implementar agora)

- Trocar o `DockerDeployAdapter` por Kubernetes/Argo Rollouts ou nuvem pública, e os runners e scanners padrão por integrações corporativas (GitHub Actions/Jenkins, SonarQube/Snyk, Playwright Cloud), sem alterar o orquestrador.
- SSO corporativo e RBAC real.
- Integração bidirecional com Jira/Azure DevOps.
- Métricas DORA (lead time, deployment frequency, MTTR, change failure rate) no dashboard.
- Agentes adicionais (Observabilidade, FinOps, Documentação).
