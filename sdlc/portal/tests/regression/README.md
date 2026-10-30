# Regressão do Portal SDLC

O ambiente rápido é exclusivo da automação. Containers, dependências, compilação incremental e dados de fixtures são reaproveitados; cada cenário cria seu contexto e declara sua dependência de isolamento. Um teste não pode depender da execução anterior. O portal humano continua separado, na porta 3310.

## Comandos no Windows

Na raiz do repositório, com Docker disponível no WSL `agentic-sdlc`:

```powershell
# Uma vez, ou após alteração do lock de dependências:
.\sdlc\portal\regression.ps1 toolchain
# No laboratório atual, reutiliza o cache existente após conferir o lock:
.\sdlc\portal\regression.ps1 toolchain --reuse-cached

# Ciclo diário: sincroniza somente arquivos alterados; mantém banco e serviços.
.\sdlc\portal\regression.ps1 fast
.\sdlc\portal\regression.ps1 fast contract-publications.spec.ts --grep 'confirmed MR'

# Backend selecionado, com esquema limpo para cada suíte de integração:
.\sdlc\portal\regression.ps1 backend releases.test.ts story-delivery.test.ts
# Interface selecionada em outra base, independente do ambiente rápido:
.\sdlc\portal\regression.ps1 browser releases.spec.ts

# Catálogo: revisar a diferença gerada antes de aceitar novos casos.
.\sdlc\portal\regression.ps1 catalog --write-catalog
# Regressão completa: recursos novos, backend, build de produção e interface.
.\sdlc\portal\regression.ps1 full

.\sdlc\portal\regression.ps1 status
.\sdlc\portal\regression.ps1 cleanup --scope fast
```

Em Linux/WSL, na pasta `sdlc/portal`, os mesmos argumentos são aceitos por `python3 scripts/regression.py`. Não há dependência de scripts privados de `.prepared`. A imagem de dependências/navegador é construída por `infra/Dockerfile.regression`; fontes e segredos não fazem parte dessa imagem. O cache antigo pode ser adotado após conferência do lock; o ID usado consta do recibo.

| Modo | Recursos/dados | Uso |
| --- | --- | --- |
| `fast` | `sdlc-regression-fast-*`, persistentes; Next dev, porta local 3390 | Fixtures próprias, sem limpeza global; smoke padrão de quatro casos |
| `backend` | `sdlc-regression-verify-*`; reset do esquema por suíte de integração e ao terminar | Domínio, API, PostgreSQL e migrações |
| `browser` | `sdlc-regression-ui-*`; base limpa no início | Arquivos que exigem base limpa e investigação visual |
| `full` | Remove/cria apenas os recursos próprios de `verify`; limpa ao final | Linha de base e aceite técnico completo, sem cache de dados |

Redes são internas, sem saída para provedores. Somente a porta do ambiente rápido é publicada no loopback. `DATABASE_URL` e `TEST_DATABASE_URL` precisam coincidir e apontar para `portal_test`. Propriedade, mounts, ambiente e anexos de rede são conferidos antes da remoção. O controlador impede dois comandos simultâneos no mesmo escopo. Nunca contornar o bloqueio com `docker exec` concorrente ou executar reset contra a base humana.

`tests/support/server.mjs` fornece adapters determinísticos e endpoints `__test` para disparar workers explicitamente. Não inicia timers de produção nem aceita credenciais GitLab/LLM operacionais. Esses endpoints não são importados por `apps/api/src/server.ts`.

## Registro dos testes de interface

1. Escrever o cenário em `tests/e2e/*.spec.ts`, com nome que descreva o comportamento observável. Registrar precondições e dados na fixture, com IDs únicos ou interceptações explícitas. Não editar dados reais para fabricar impedimentos.
2. Dirigir a interface por papéis, nomes e rótulos acessíveis. Verificar resultados, mensagens, foco e URL/contexto quando aplicável. Esperar estados; evitar pausas arbitrárias, ordem entre arquivos ou capturas sem asserção.
3. Para mutações, cobrir autoria, recusa, resposta perdida, repetição e preservação de rascunho quando pertinentes. O caminho feliz isolado não comprova esses contratos.
4. Registrar o arquivo em `catalog.json`: área, requisito/RA quando conhecido, isolamento e providers. `requirements: []` significa rastreabilidade pendente. Novos casos devem informar sua RA.
5. Rodar `catalog --write-catalog`. `cases.json` recebe IDs estáveis `UI-…`, derivados de arquivo e título completo. Renomear um caso muda seu ID; revisar a diferença. O executor recusa arquivos/casos não registrados.
6. Rodar o arquivo selecionado. Para habilitar reuso no `fast`, provar duas execuções consecutivas sem reset e sem dependência de dados anteriores; então declarar `scoped-fixtures`. Arquivos `fresh-database` são recusados no modo rápido.

O código Playwright registra passos e expectativas de forma reproduzível. Vídeo/gravação manual pode ajudar na escrita, mas não substitui fixture e asserções. Captura manual usa ambiente descartável de captura, separado do ambiente rápido exclusivo da automação.

O catálogo inicial contém 45 arquivos e 363 cenários. Parte usa interceptação HTTP; outra parte percorre UI/API/PostgreSQL reais com adapters externos simulados. Isso não comprova implantação real. A classificação de todos os casos por requisito e a revisão assistiva integral continuam no backlog.

## Relatórios e repetição

Cada execução gera `test-results/regression/<id>/`:

- `summary.json`: comando, hashes de runtime/testes, estabilidade das fontes, fases e resultado consolidado;
- `environment.json`: propriedade, IDs das imagens e operação administrativa correlacionada, quando executado pelo controlador;
- `backend.json` e JSON por arquivo: aprovados, falhos, não executados e erros de coleta;
- `browser.json`, `browser-cases.json`, `browser-junit.xml` e `html/index.html`: resultado por caso e ID;
- `browser-artifacts/`, `screenshots/` e logs: rastros das falhas e capturas solicitadas pelos cenários.

O modo `full` inclui também os contratos Python de auditoria administrativa, relay e proteção do controlador. O CI usa o mesmo `pnpm regression:ci` e publica relatórios também em falha. O comando Playwright direto escreve em `test-results/browser-direct`, para não limpar os relatórios e o ledger das rodadas consolidadas. Só aprova se todas as fases executadas passarem e a fonte permanecer estável. Testes GitLab reais opt-in ficam explicitamente não executados na rodada simulada. Não esconder falhas com retentativas automáticas: investigar pelo ID/trace, corrigir e anexar outra execução. Rodadas interrompidas e falhas anteriores permanecem registradas.

Relatórios detalhados são ignorados pelo Git. O recibo resumido, com contagens e limites, é versionado em `sdlc/docs/assets`. Copiar somente metadados seguros, sem tokens, prompts, conteúdo de negócio ou HTML de ambientes reais. O ledger administrativo próprio fica em `test-results/regression/control/audit`, fora das bases e dos containers removidos; não é apagado na limpeza dos ambientes.

## Limites e rotina

Rodar testes dirigidos a cada mudança, o smoke após alterações de navegação e `full` ao consolidar marcos e antes do aceite final. O modo rápido não comprova migração limpa, integração real nem deploy. O aceite do piloto exige provedores reais isolados e evidência do mesmo digest em QA → HML → PRD.

Não há clonagem de template de banco nesta versão: o ganho vem do reuso dos containers, browser/dependências, fonte incremental e fixtures próprias. Mudança de dependências exige atualizar a imagem; mudança de esquema exige validar migrações e rodada limpa. Se o volume de fixtures prejudicar desempenho, recriar o ambiente rápido pelo comando próprio, fora de uma execução.

## Escopo da palavra completa

`full` executa o catálogo completo do **Portal SDLC**, com os contratos auxiliares acima. A regressão de todo o repositório inclui ainda os outros jobs preservados em `.github/workflows/validate.yaml`: extensão VS Code, portal/controlador legado, integrações PostgreSQL do control, Windows/IaC e gates Linux. Esses jobs não são substituídos pela regressão do portal nem foram todos reexecutados por esta consolidação. A jornada real do piloto, com build/registry/deploy, será acrescentada quando os executores existirem; adapters simulados não constituem esse aceite.

## Validação real opt-in do contrato

`python3 scripts/regression-gitlab.py` (WSL, na pasta do portal) usa somente o GitLab local da instalação, em `127.0.0.1:3180`, com credenciais dedicadas lidas de arquivos privados. Cria um projeto privado `sdlc/regression-contract-<UUID>`, prepara o arquivo de contrato, libera Draft e integra o SHA fixado na main protegida; confere bytes e ancestralidade e remove apenas o projeto próprio. Não carrega o banco do portal nem modifica aplicações existentes. A preparação do projeto de ensaio define sua própria política sem pipeline; o adapter continua respeitando pipelines/proteções de qualquer destino real. A validação não comprova executores de aplicação.

O resultado fica em `test-results/regression/provider-live-*/provider-live.json`, correlacionado à trilha administrativa própria. Se a limpeza não for confirmada, o resultado falha. `python3 scripts/regression-gitlab.py --cleanup <caminho-do-provider-live.json>` retoma somente a remoção do projeto comprovadamente próprio. Em GitLab com exclusão adiada, o nome pode receber o sufixo `-deletion_scheduled-<id>`; o controlador exige o UUID, namespace, ID e tópico do ensaio antes da remoção definitiva. Nunca usar a remoção para projetos de aplicações. Esse teste é opt-in e fica separado da rodada com providers simulados.

## Construção DEV — RA-11

O catálogo recebe 20 casos novos em `development-build.spec.ts` (405 casos/47 arquivos no total). Preflight, persistência, auditoria e worker têm suítes backend próprias; `tests/build-executor.test.py` cobre o serviço em diretórios temporários e integra os checks auxiliares do modo full. Hashes passam a incluir `executor/`, a preparação de ferramentas e seu Dockerfile; sincronização não depende de `.prepared`.

`python3 scripts/validate-build-executor.py` é opt-in: executa compilação React real, verifica limites de sandbox e conteúdo da imagem e provoca um exit não zero em fixtures isoladas. Não lê banco do portal nem modifica piloto/aplicações. Recibo correlacionado em `test-results/regression/executor-live-*/executor-live.json`; a limpeza confere rótulos próprios antes de remover imagens/containers. Esse ensaio não é jornada GitLab → build → deploy nem substitui o aceite do piloto até PRD. [Perfil e preparação reproduzível](../../../docs/executor-node24-react-v1.md).
