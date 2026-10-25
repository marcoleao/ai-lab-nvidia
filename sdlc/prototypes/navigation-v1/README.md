# Prévia dos padrões de experiência do SDLC

**Acesso: http://localhost:3311/#/overview**

Esta prévia substitui a entrada do protótipo anterior. A referência funcional é o **portal real atual**, em `sdlc/portal`; a proposta de evolução segue [PADROES_DE_EXPERIENCIA.md](../../portal/docs/PADROES_DE_EXPERIENCIA.md). O caminho `navigation-v1` foi mantido para preservar a instalação e a porta de acesso.

Preserva a identidade visual do produto, os cinco menus e as jornadas já existentes. Não representa autorização para remover capacidades que não estejam detalhadas aqui. Veja o [mapa de preservação](PRESERVATION.md) e sua [versão navegável](http://localhost:3311/#/coverage).

## Roteiro para revisão

1. Em **Visão geral**, compare os nove assuntos de indicadores, as quatro semanas e os filtros de participação, Sistema e Projeto. Projeto só habilita após a escolha do Sistema.
2. Em **Sistemas**, experimente busca, aprovação/status, ciclos, inativos/arquivados, ordenação e páginas de 20 registros. Edite filtros e confira que só se aplicam ao confirmar; o checkbox de inclusão aplica imediatamente e informa esse comportamento.
3. Abra **Atendimento ao Cliente** e desça por Projeto → Épico → História → Tarefa. Volte pelo breadcrumb e confira o recorte da consulta anterior. Consulte também um Projeto arquivado e seus descendentes, em leitura.
4. Na aba **Atividade** do Sistema, pesquise `EVT-101` ou uma correlação, abra a ocorrência e retorne à mesma consulta. Datas usam o horário de Brasília.
5. Em **Assistente**, selecione Sistema e Projeto. Os links de criação levam aos formulários locais. Converse, gere uma proposta, revise entradas, saídas, critérios e dependências, e confirme a criação simulada. Escolher contexto ou entrar na página não cria entidades.
6. Na **História**, a fase e a atividade atual permanecem no topo. O resumo é macro; Tarefas concentram resultado, tentativas, achados e histórico. A interação contextual apresenta o próximo passo. Abra os controles de simulação para comparar G1, fila, resposta da IA, revisão, correção, segurança, credencial e sinais desatualizados.
7. Em **Releases**, consulte as etapas, crie um DRAFT vazio e escolha Histórias. Na História, associe somente uma release existente. Preserve a diferença entre planejamento atual, revisão histórica, pacote fechado e ambiente.
8. Consulte **Composição** e **Ramificações** da release R1/R2. A rejeição de HML exige uma nova candidata, retorno a QA, repetição dos controles e nova homologação. A promoção HML → PRD conserva manifesto e artefato.
9. Em **Integrações**, consulte a prontidão simulada, explore uma falha e tente novamente. A página Sistemas não duplica esse quadro.

O topo permite escolher uma **persona simulada**. Sem persona, o protótipo começa em consulta e explica as ações indisponíveis. Personas não autenticam nem alteram permissões do produto real.

O seletor “Explorar estado da consulta” demonstra carregamento, falha, vazio e resultado parcial. “Reiniciar simulação” restaura os exemplos locais.

Ordenação (padrão v1.2): nas tabelas, clique no nome da coluna para ordenar; um novo clique alterna ↑/↓. Os cabeçalhos aceitam Enter/Espaço e indicam a ordem para leitores de tela. Listas sem tabela, como a seleção de Histórias de uma release, preservam o combo de campo e o controle de direção. Ordenar mantém filtros, rascunhos e seleções e volta à primeira página.

Validação v1.2: sintaxe e navegação em Edge passaram para clique no cabeçalho, ordenação global, retorno à primeira página, Enter/Espaço, manutenção de foco e rascunho, cabeçalhos com resultado vazio e layout de 390 px, sem escrita em API. Os testes existentes de ordenação foram adaptados para os cabeçalhos; a suíte completa de Chromium de 42 jornadas abaixo corresponde à revisão v1.1, não foi recontabilizada nesta revisão. Evidência local: `.artifacts/check-header-sorting.ps1`.

Revisão de feedback e filtros (padrão v1.1): filtros começam recolhidos no desktop e no celular, com recorte e total sempre visíveis. Consultas e agentes pendentes usam o mesmo ícone circular animado; falhas aparecem em vermelho com texto e ícone. A opção de redução de movimento mantém a indicação estática. Fila, processamento, espera humana e ausência de confirmação continuam distintos; a animação não comprova progresso interno do modelo.

A revisão v1.1 passou em **42/42 jornadas de Chromium**: as 29 anteriores, adaptadas para abrir filtros explicitamente, e 13 cenários novos de feedback. Foram verificados recolhimento/expansão por teclado, rascunhos e recortes preservados, falhas históricas, consultas e agentes em processamento, distinção de espera humana/estado desconhecido, retomada e movimento reduzido em 1440 px e 390 px. Relatório em `.artifacts/feedback-final-report`; capturas em `.artifacts/screenshots/feedback-*` e `experience-feedback-story-*`. A adoção é no protótipo; as telas reais continuam no backlog de migração.

## Limites e preservação

- Dados hardcoded, respostas fixas e operações em memória/`sessionStorage` desta aba. Nenhum dado foi copiado do banco real.
- Nenhuma chamada de API, LLM, scanner, GitLab ou deploy. O servidor estático permite apenas GET/HEAD; CSP usa `connect-src 'none'`.
- A porta, o contêiner e a rede do protótipo são próprios. Não há montagem de credenciais, banco ou dados de aplicações produzidas pelo SDLC.
- O real já possui entrevistas, propostas, G1, codificação, Code Review, Security Scan, merge assistido/externo e planejamento DRAFT de releases. Essas capacidades são representadas por simulações.
- Execução de testes e candidatas imutáveis com promoção QA/HML/PRD continuam no backlog real. A navegação futura foi preservada e identificada como simulação.
- Paginação, busca e ordenação operam sobre o conjunto fictício completo antes de selecionar a página. Isso demonstra a experiência; não comprova capacidade de banco, consistência concorrente ou paginação em servidor no produto real.
- O backlog UX-C01–C07 e o backlog funcional permanecem registrados. Nenhuma tela real foi migrada nesta entrega.

## Arquivos e execução

`public/index.html` carrega **`experience.mjs`**, com dados em `experience-data.mjs`, consultas compartilhadas em `queries.mjs/css`, dashboard/Assistente/Integrações em `workspace-pages.mjs/css` e os módulos de História/Tarefas e Releases. A entrada anterior `app.mjs` não é mais carregada; não há seletor `classic` na nova interface.

O contêiner usa a imagem local `sdlc-portal:prepared` somente como runtime Node:

```powershell
wsl -d agentic-sdlc -u root --cd /mnt/c/Users/marco/Documents/Git/ai-lab-nvidia/sdlc/prototypes/navigation-v1 --exec docker compose up -d --no-build
```

Os arquivos públicos são montados em leitura; a instalação existente recebe a nova entrada ao atualizar o navegador.

## Validação

A suíte atual é `tests/experience*.spec.mjs`, configurada em `experience.config.mjs`; o `playwright.config.mjs` padrão aponta para ela. As suítes antigas ficam como referência dos recortes anteriores e não são contabilizadas como validação desta nova entrada.

Em 24/10/2026 passaram **29/29 jornadas em Chromium**: seis de consultas/histórico, oito de Releases, sete de História/Tarefas e oito de menus/dashboard/Assistente/Integrações/acervo. A revisão incluiu desktop de 1440 px e celular de 390 px, preservação de rascunhos e seleções, consultas históricas somente leitura e ausência de chamadas a APIs, ferramentas, sockets ou destinos externos nos fluxos instrumentados. A porta 3311 respondeu com a nova entrada e o contêiner permaneceu saudável. Evidências em `.artifacts/experience-final-report` e `.artifacts/screenshots/experience-*`.

Para um runner isolado com Playwright e Chromium disponíveis, `scripts/run-browser-tests.mjs` copia os testes para `/app`, serve `/source/public` em 8080 e executa a suíte, gravando resultados em `/output`. Ele espera o protótipo montado em `/source:ro` e um diretório de artefatos em `/output`. Não usa a porta nem os dados do portal real.

As capturas da revisão ficam em `.artifacts`. O pacote `.artifacts/prototype-before-entry-replacement-20261024.tar.gz` preserva o protótipo anterior à troca de entrada.
