# Padrões de experiência e navegação do Portal SDLC

Versão 1.6 · 25/10/2026 · Referência transversal para produto, UX, desenvolvimento e revisão.

Este documento reúne o padrão para funcionalidades novas e para a evolução das existentes. A adoção atual é parcial; o inventário e o plano de migração estão no final. Registrar o padrão não significa que todas as telas já o implementam. As decisões de domínio, permissões, gates e métricas da [arquitetura](ARCHITECTURE.md) continuam válidas.

## 1. Princípios

- O usuário identifica onde está, o que está consultando, a situação atual e a próxima ação sem abrir outra página para descobrir essas informações.
- Navegação do macro para o micro: Sistema → Projeto → Épico → História → Tarefa. Releases pertencem ao Sistema e são geridas no menu Releases; a História associa uma release existente.
- Consultas usam o mesmo comportamento para filtros, ordenação, contagem, paginação, atualização e retorno. Campos e controles são proporcionais ao conteúdo.
- Uma coleção que pode crescer precisa permitir encontrar e percorrer todos os registros autorizados. Um limite interno não pode parecer o fim da coleção.
- As instruções são compreensíveis para negócio. Evidências e detalhes técnicos são acessíveis por aprofundamento, mantendo o contexto.
- Consultar, filtrar e ordenar são operações de leitura. Não criam itens, não restauram arquivados, não aprovam gates e não iniciam agentes.
- Decisões já tomadas pelo usuário e funcionalidades existentes devem ser preservadas durante a padronização.

## 2. Anatomia das páginas e arquitetura da informação

| Área | Conteúdo e comportamento |
| --- | --- |
| Navegação global | Visão geral, Assistente, Sistemas, Releases e Integrações, nessa ordem. Um único destino ativo; nomes e destinos consistentes. |
| Localização | Breadcrumb com tipos e nomes reais; ancestrais navegáveis e página atual identificada. |
| Situação e interação | Estado atual, processamento ou impedimento e próxima ação. Uma ação primária contextual; confirmações e conversas na área de interação da jornada. |
| Identificação | Título, chave quando existir, escopo e status. Aprovação, ciclo do Projeto, arquivamento e condição da execução têm significados separados. |
| Navegação local | Abas por assunto, com rótulos previsíveis e contagens de significado explícito. Evitar apresentar todos os detalhes simultaneamente. |
| Consulta | Busca e filtros → recorte aplicado e quantidade → ordenação → resultados → paginação. |
| Detalhe | Resumo de negócio primeiro; especificação, evidências, revisões e eventos acessíveis por abas ou expansão. |

Ações de consulta ficam junto à coleção correspondente. Ações que alteram o processo permanecem na área contextual de interação, próxima ao breadcrumb, conforme a jornada de História/Tarefa já definida. Filtros não competem visualmente com a próxima ação do processo.

Em Sistemas, Projetos, Épicos, Histórias e Tarefas, a aba anteriormente chamada Planejamento passa a se chamar **Execução**, por decisão do usuário em 24/10/2026. O identificador `tab=planning` e seus parâmetros continuam válidos, preservando acesso direto, recarga, retorno, filtros e a seção do processo. Orientações e links contextuais usam o novo nome. Aprovação do planejamento, requisitos, conversas do Projeto e o controle interno de planejamento da Tarefa preservam seu significado; a mudança é somente de apresentação. Arquivados continuam com sua navegação de consulta, sem criação de outra aba ou ações. Esta adoção pontual não conclui UX-C05–C07 nem altera métricas, status ou gates.

Na edição e gestão da **História**, a ordem passa a ser **Tarefas, Execução, Especificação, Conversas, Componentes, Mais**, conforme decisão do usuário em 25/10/2026. A aba Resumo foi removida. Mais reúne **Auditoria** (assunto inicial) e **Configuração**; Componentes tem acesso direto. A navegação da Tarefa e a consulta de arquivados mantêm seus contratos próprios.

O conteúdo de entrega de código, MR e escolha de release permanece acessível na aba Execução. Links anteriores de Resumo (`tab=overview`) abrem Tarefas; `tab=delivery` e `tab=releases` acessam os conteúdos correspondentes em Execução. `tab=activity` e `tab=manage` abrem Mais no assunto correto; `tab=components` abre a aba direta. Filtros, rascunhos, tentativa consultada e estado de processo são preservados. A reorganização não cria comandos, estados, métricas ou gates nem altera as fontes da auditoria.

No quadro **Release planejada** da História, o vínculo confirmado é consultado automaticamente ao abrir Execução, com link para a release e versões planejada/atual da História. Ausência confirmada, carregamento e falha são estados distintos; falha de atualização preserva a última associação identificada. **Escolher release** ou **Alterar release** abre somente o seletor existente (`process=release`); escolhas não salvas não substituem a associação consultada. Permissões, versões otimistas, confirmação de operações e gates continuam independentes da consulta. A fonte é o GET existente de associação, que também carrega as opções e mantém seus limites atuais; essa evolução não migra o catálogo para um novo contrato.

Evidência dessa consulta em 25/10/2026: revisão UX, tipos/build e 8 verificações de auditoria aprovados; 30 cenários de navegador em `releases.spec.ts`, `story-task-planning.spec.ts` e `story-workspace.spec.ts` aprovados no ambiente descartável `portal_test`. O ensaio de release usa a API real para consultar sem abrir o seletor, trocar o vínculo, conferir sua persistência, removê-lo e confirmar a ausência; os demais preservam navegação, formulários, fases e retomadas. A cobertura UX-C05–C07 permanece parcial.

Consulta automática publicada em `localhost:3310`, imagem web `7a1620c5e23b`, saúde `ready/preview`; API e dados de negócio preservados. Publicação registrada como `PORTAL_PUBLICATION` na trilha administrativa externa, com imagem anterior disponível para reversão.

Por decisão do usuário em 25/10/2026, o primeiro quadro dessas cinco abas usa o título literal **Excecução com Assistente de I.A.**, compartilhado em `PlanningAssistant`. Os títulos do segundo quadro permanecem **Ciclo do Sistema**, **Ciclo do Projeto**, **Ciclo do Épico**, **Ciclo da História** e **Ciclo da Tarefa**. Esta padronização altera somente o título do primeiro quadro, preservando conteúdo, destinos, comandos, permissões, métricas e o backlog de adoção existente.

Evidência dessa padronização: TypeScript/build de produção aprovados e publicação somente do frontend em `localhost:3310`, com o novo título e os cinco títulos de ciclo conferidos nos arquivos efetivamente servidos. A imagem da API permaneceu a mesma; não houve migração, alteração de banco ou execução de agentes. Imagem anterior e manifesto preservados para reversão, com operação `PORTAL_PUBLICATION` no ledger administrativo externo.

Evidência da renomeação: revisão de UX, TypeScript/build e 12 cenários de navegador aprovados em `planning-lifecycle.spec.ts` e `story-task-planning.spec.ts`. Os cenários existentes confirmam o nome Execução e o acesso por `tab=planning` nos cinco níveis, além de recarga, permissões e continuidade dos controles. As APIs são interceptadas nos testes; nenhum dado da instalação humana foi alterado para validação. Publicação local concluída mediante solicitação do usuário, com os rótulos conferidos no código servido; backup e preservação registrados na [entrega de conversas por escopo](../../docs/conversas-por-escopo-2026-10-24.md).

Por decisão do usuário, **História e Tarefa usam uma coluna, sem área lateral de interação**. Criar Tarefa e editar História seguem o formulário central dos demais níveis, com uma única instância de Salvar/Cancelar na faixa superior; cancelar mantém o recorte e os vínculos não são alterados. O formulário/rascunho permanece montado ao trocar de aba ou atualizar a consulta. A fase continua no cabeçalho fora do modo de formulário. Aprovações, confirmação de solicitações, conversas, sinais e vínculos estão na seção central **Processo e decisões** de Execução, usando os mesmos comandos/gates. A seleção de release fica em Execução da História. A Tarefa também usa formulário central e Salvar/Cancelar no topo, com Editar no cabeçalho. Seu processo, conversa, sinais, confirmações pendentes e controles de status ficam na seção central Processo e decisões de Execução. Cancelar retorna ao contexto da aba; rascunhos e a versão de edição são preservados durante consultas, troca de abas e falhas. Não existe painel lateral, largura reservada ou preferência de abrir/recolher a interação em nenhum dos dois níveis.

Na História e na Tarefa, `process=action|conversation|processing|administration` identifica a seção do processo em Execução; `process=release` identifica a escolha em Execução da História; links legados de release na Tarefa acessam o conteúdo central de Execução. Links anteriores com `interact=...`, `tab=blockers` ou `tab=releases` abrem o conteúdo central correspondente. A navegação para outras abas remove os parâmetros de processo não aplicáveis e preserva os filtros da coleção. Não existe botão de abrir/recolher interação na História ou na Tarefa. Adoção em `StoryWorkspace` e `portal.tsx`, com revisão UX e regressões isoladas de formulário, cancelamento, repetição idempotente, gates, consulta e acesso em celular; essa mudança não migra os executores pendentes de UX-C05/C06.

Evidência desta alteração: 44 cenários de navegador aprovados, incluindo hierarquia e releases contra API/PostgreSQL descartáveis; os três cenários de formulário foram repetidos após o ajuste final de foco/ciclo. Build/TypeScript e revisão de screenshots móveis passaram. Fixtures e comandos de validação ficaram no ambiente isolado, sem criar Tarefas ou alterar resultados no banco de aceite.

Evidência da edição central de Tarefa: 31 cenários isolados de navegador aprovados em `story-workspace.spec.ts`, `story-task-planning.spec.ts` e `story-experience.spec.ts`, incluindo formulário móvel, cancelamento, permissões, rascunho após conflito e repetição idempotente de PATCH após perda da resposta. TypeScript e build passaram; os cenários usam APIs simuladas, sem escrever na base de aceite.

Evidência da remoção completa da lateral de Tarefa: 35 cenários de navegador aprovados (34 na primeira execução e o cenário de métricas repetido com sua API/PostgreSQL descartáveis disponíveis). Incluem URLs legadas normalizadas com recarga e filtros, pedido incerto recuperado após recarga, gates, status manual e tentativa histórica. O cenário móvel foi repetido para revisão visual; nenhum dado de aceite foi criado ou alterado.

O menu lateral mantém a navegação global estável, sem blocos dinâmicos abaixo de Integrações. Localização, ancestrais e situação da jornada ficam no breadcrumb e na área contextual do conteúdo. Adotado no shell compartilhado `apps/web/app/portal.tsx`: removidos os blocos “Neste contexto” e “Gestão de releases”, com revisão de UX; esta alteração pontual não conclui as pendências de UX-C07.

Na manutenção de Sistemas, a aba Componentes apresenta apenas a integração GitLab do Sistema, com estado, caminho, acesso ao grupo e retomada quando aplicável. O quadro de repositórios foi removido dessa aba por decisão do usuário; cadastros, vínculos e APIs permanecem preservados. Histórias e Tarefas mantêm a consulta/seleção de repositórios envolvidos. Adotado no shell compartilhado; esta simplificação não migra as consultas pendentes de UX-C05/C06.

Abrir um resultado e voltar deve recuperar filtros, ordenação, página e, quando possível, posição da lista. Trocar de aba preserva os parâmetros pertinentes; parâmetros de outra coleção não devem afetar a nova consulta. A URL de um detalhe deve permitir acesso direto e recarga.

Projetos não apresentam a aba Componentes, inclusive na consulta de arquivados. Links anteriores com `tab=components` usam a entrada padrão de Épicos, sem reapresentar o painel removido. Vínculos persistidos e seleção de repositórios no cadastro permanecem preservados. Adoção em `portal.tsx` e `archived-item.tsx`; esta mudança de navegação não altera a cobertura das APIs de componentes.

A primeira aba e o destino inicial de cada nível com filhos seguem a hierarquia: Sistema → Projetos, Projeto → Épicos, Épico → Histórias e História → Tarefas. A História sem `tab` abre Tarefas; `tab=tasks` continua aceito e o antigo `tab=overview` resolve para Tarefas. A Tarefa continua com Resumo como entrada, pois não possui nível filho. A fase e a próxima ação permanecem na área contextual em qualquer aba. Aplicado no `StoryWorkspace` real; a consulta de Histórias arquivadas já segue Tarefas como entrada.

A lista de Tarefas da História usa tabela com os mesmos estilos e cabeçalhos compartilhados das listas dos demais níveis: Nome, Status, Criado em e Atualizado. O nome é um link para o detalhe da Tarefa, com retorno ao recorte da História. Descrição completa, evidências e tentativas ficam no detalhe. O contrato `tasks.*`, os atalhos operacionais, filtros recolhidos e paginação de 20 no servidor permanecem; ordenar pelos cabeçalhos preserva rascunhos e filtros e reinicia a página. A ordenação confirma a direção do resultado exibido, inclusive durante falhas/carregamento. A aba Tarefas concentra essa apresentação; arquivados já usam a tabela hierárquica compartilhada.

Evidência da tabela: `tests/e2e/story-experience.spec.ts` valida consulta com 45 Tarefas simuladas, paginação, cabeçalhos/teclado, rascunho de filtros, detalhe e retorno ao recorte, falha com repetição da consulta e apresentação em desktop/celular. Revisão de UX em 24/10/2026.

A consulta de Tarefas omite o parâmetro opcional `status` quando nenhum status foi escolhido, inclusive após limpar filtros. História sem Tarefas apresenta consulta confirmada com zero resultados; falhas reais continuam distinguíveis. Adoção corrigida em `TaskCollection`; regressões em `tests/collections.test.ts` e `tests/e2e/story-experience.spec.ts` cobrem o estado vazio, filtro aplicado, limpeza e recarga. O mock de navegador rejeita status explicitamente vazio, como a API real, para não ocultar divergências do contrato.

Evidência: cenário de entrada da História em `tests/e2e/story-task-planning.spec.ts`, com APIs simuladas, valida primeira aba, filtros, links explícitos/legados, recarga, retorno do navegador e entrada da Tarefa. Revisão de UX em 24/10/2026.

Em Sistemas, Projetos, Épicos, Histórias e Tarefas, a consulta de rastreabilidade se chama **Auditoria**, inclusive na consulta de arquivados. Na gestão da História, Auditoria fica em Mais, junto de Configuração. Na Tarefa permanece diretamente na navegação local, e seu Mais continua reunindo Componentes (padrão) e Configurações. O identificador `tab=activity` permanece para preservar links, filtros e navegação existentes; o conteúdo e as regras da consulta de histórico não mudam. A situação atual e os gates permanecem na área contextual, independentes da página de auditoria.

Os cenários de Auditoria de `tests/e2e/story-task-planning.spec.ts` acompanham as duas navegações: acesso direto, recarga, filtro preservado, uma única consulta visível, assuntos de Mais e fase atual independente. A revisão de UX da reorganização da História é de 25/10/2026; o contrato da Tarefa continua preservado.

## 3. Identidade visual e linguagem

No cadastro de Sistema, a sigla usa exatamente seis letras de A a Z, convertidas para maiúsculas na entrada e na API antes da gravação. O campo impede números e símbolos e informa a extensão obrigatória. A regra de chave de Projetos permanece independente. Adoção nos dois formulários do shell compartilhado e no contrato `createItemSchema`; evidência em `tests/system-key.test.ts` e verificação de persistência em `tests/foundation.test.ts`. Registros anteriores não são reescritos por esta validação.

Preservar a identidade existente. Os componentes devem consumir os tokens compartilhados, evitando cópias locais de cores e estilos. O ponto de partida é `apps/web/app/styles.css`:

| Token | Valor atual | Uso |
| --- | --- | --- |
| `--blue` | `#0076ce` | Ação principal e destaque de seleção |
| `--navy` | `#012169` | Navegação e identidade |
| `--ink` | `#202b3a` | Texto principal |
| `--muted` | `#536476` | Texto de apoio |
| `--line` | `#dce3ea` | Separadores e contornos |
| `--surface` | `#f4f6f8` | Fundo de página |
| `--success` | `#246b36` | Confirmação positiva |
| `--danger` | `#b23d32` | Falhas e erros; acompanhar com texto e ícone |

Manter a tipografia atual Segoe UI/Arial, ícones do conjunto existente e os componentes de painel, formulário e navegação. Adotar a escala de espaçamento 4/8/12/16/24/32/48 px nas evoluções dos componentes compartilhados, com ajustes responsivos; a migração não exige trocar todos os valores existentes de uma vez.

Status permanecem em inglês, conforme o domínio. Títulos, ajuda, comandos, erros e explicações ficam em PT-BR. O mesmo conceito deve ter o mesmo nome em todas as telas. Cor sempre acompanha texto ou ícone com significado acessível. Animações devem respeitar redução de movimento.

`ACTIVE` e `INACTIVE` são status do Sistema. `ARCHIVED` identifica a marcação de arquivamento, preservando status e ciclo originais. No Projeto, aprovação e ciclo de execução continuam separados. Ocultar um item por filtro não modifica nenhuma dessas condições.

## 4. Filtros e pesquisa

Toda pesquisa deve declarar escopo, campos pesquisáveis, filtros disponíveis e valores padrão. Filtros precisam corresponder ao domínio da coleção; não adicionar campos sem significado apenas para preencher uma barra.

**Os filtros começam recolhidos em todas as resoluções**, inclusive desktop. O usuário os abre por um controle nomeado, como “Filtros” ou “Filtrar Histórias”, operável por teclado e com estado expandido/recolhido acessível. Busca, campos de refinamento e atalhos de filtragem ficam dentro do painel. Recorte aplicado, filtros ativos e quantidade continuam visíveis fora dele. Ordenação e paginação permanecem junto aos resultados. O estado de expansão pode acompanhar a consulta durante a navegação da sessão, sempre após uma escolha explícita do usuário; aplicar filtros, encontrar uma falha ou receber parâmetros na URL não abre o painel automaticamente nem apaga rascunhos. Contexto de destino de uma operação, como Sistema/Projeto da entrevista, não é filtro de pesquisa e permanece identificado para a pessoa saber onde atuará.

- Busca textual: chave e nome/título, com campos adicionais declarados. No histórico, incluir mensagem e identificadores quando disponíveis e permitidos.
- Filtros conforme o contexto: Sistema, Projeto, Épico, status, ciclo, arquivamento, ator/participação, período, tipo de atividade e resultado.
- Seletores dependentes obedecem à hierarquia: Projeto habilita após Sistema e contém apenas seus Projetos. Dentro de uma rota contextual, o pai permanece fixo e visível.
- Painéis com vários campos usam rascunho, **Aplicar filtros** e **Limpar filtros**. Enter na busca aplica a consulta. Alterações ainda não aplicadas devem ser identificadas.
- Atalhos como “Mostrar inativos” podem aplicar imediatamente, com esse comportamento explícito. Não misturar campos imediatos e pendentes sob um único botão Aplicar sem distinguir os dois grupos.
- Limpar remove os filtros escolhidos e volta aos padrões, preservando o contexto fixo da rota. Mudar filtros ou ordenação reinicia a página/continuação.
- O recorte efetivamente aplicado permanece visível, mesmo com o painel de filtros recolhido. Mostrar contagem, filtros ativos e como removê-los.

Preservar os recortes atuais: Sistemas ACTIVE não arquivados por padrão; Projetos ACTIVE não arquivados, independentemente da aprovação do planejamento. A opção de inativos inclui INACTIVE e arquivados nos Sistemas; COMPLETED, CANCELLED e arquivados nos Projetos. Mostrar quantos registros adicionais estão disponíveis. Se a inclusão não acrescentar resultados, explicar o motivo: “Não há Sistemas INACTIVE ou arquivados. A lista permanece igual.”

O filtro de Sistemas atua sobre Sistemas; o filtro de Projetos atua sobre Projetos. A tela identifica esse escopo e oferece a navegação para o nível correto.

## 5. Ordenação

Toda coleção consultável declara sua ordem atual. **Em tabelas, a ordenação ocorre clicando no nome da coluna**, sem combo “Ordenar por” nem botão de direção separados. Cada cabeçalho ordenável contém um botão com o nome da coluna e indicador de ordenação; a coluna ativa mostra ↑ ou ↓ e o cabeçalho informa `aria-sort`. Colunas sem ordenação permanecem identificadas como texto, sem simular interação.

Ao escolher outra coluna, aplicar ordem crescente; clicar novamente na coluna ativa alterna crescente/decrescente. Enter e Espaço executam a mesma ação. Preservar foco, filtros aplicados, rascunhos e seleções, reiniciando a paginação. Cabeçalhos continuam disponíveis quando não há resultados. A dica de uso e a direção atual devem ser compreensíveis por teclado e leitor de tela, sem depender só do ícone.

**Em consultas que não são tabelas**, como listas de cartões ou seleção de Histórias, manter o seletor “Ordenar por” e o controle de direção junto aos resultados. Não duplicar as duas formas na mesma consulta. Gráficos, etapas fixas e séries temporais mantêm a ordem semântica já definida, sem controles genéricos desnecessários.

| Coleção | Ordem inicial de referência | Alternativas úteis |
| --- | --- | --- |
| Sistemas | Nome crescente | Criação, atualização, status |
| Projetos, Épicos, Histórias e Tarefas | Criação mais recente primeiro | Nome/chave, atualização, status; ciclo no Projeto |
| Releases | Criação mais recente primeiro | Nome/chave, etapa; manter o padrão já solicitado pelo usuário |
| Histórico e tentativas | Ocorrência mais recente primeiro | Mais antigas primeiro; filtros por tipo, ator e resultado |
| Conversa | Ordem cronológica da conversa | Acesso explícito às mensagens anteriores |
| Indicadores semanais e etapas do processo | Ordem temporal ou do ciclo declarada | Não substituir a semântica do gráfico por ordenação genérica |

A API valida os campos permitidos e acrescenta desempate estável por ID. Ordenar por status segue a ordem de domínio declarada, sem presumir que a ordem alfabética representa o processo. Datas/nome iguais não podem provocar perda ou repetição de registros na navegação.

Não aplicar a ordenação apenas aos registros da página atual. Atualizações automáticas não devem reorganizar uma lista que o usuário está lendo sem indicação e ação explícita para atualizar os resultados.

## 6. Paginação e volume

Coleções abertas a crescimento usam paginação no servidor. Padrão inicial: **20 registros por página**. Releases mantém 20, conforme a decisão existente. Outros tamanhos só são expostos quando definidos no contrato da coleção, com limite validado no servidor; não oferecer “todos” para coleções ilimitadas.

Listas com total conhecido mostram intervalo, total filtrado, página e controles Anterior/Próxima. Exemplo de formato: “21–40 de 137 resultados · Página 2 de 7”. Coleção vazia mostra “0 resultados”, sem intervalo inválido. Página fora do intervalo é normalizada e a resposta informa a página efetiva.

Históricos e conversas podem usar cursor com Anteriores/Próximos ou Carregar anteriores, mantendo informação de continuação. Sem total exato, informar quantos foram carregados e se há mais; não inventar número de páginas. Cursor utiliza ordem estável e referência da consulta para evitar inconsistência com eventos novos.

Filtragem, ordenação, contagem e paginação são feitas sobre o mesmo escopo autorizado. O cliente não recebe os primeiros 500 itens para depois tratá-los como a coleção inteira. Limites de proteção precisam de continuação ou mensagem explícita de consulta parcial, com meio real de acessar os demais registros.

Seletores com muitas opções usam pesquisa e carregamento paginado. A opção já selecionada continua identificada mesmo fora da página atual. Em seleção em lote, distinguir “selecionar esta página” de “todos os resultados filtrados”; filtros e páginas não podem apagar escolhas nem ampliar a operação implicitamente.

Não paginar conjuntos naturalmente limitados, como os três ambientes, etapas de um ciclo, quatro semanas de indicadores ou verificações fixas de prontidão. Esses casos têm ordem e organização adequadas ao conteúdo, sem controles de lista sem utilidade.

## 7. Estado da consulta e contrato das APIs

O estado aplicado deve ser recuperável pela URL: texto pesquisado, filtros, ordem, direção, página/tamanho ou cursor e aba. Coleções diferentes na mesma tela usam parâmetros isolados. Não colocar credenciais, conteúdo de conversa, payloads ou dados sensíveis na URL; buscas sensíveis exigem contrato específico.

Voltar/avançar do navegador, recarregar e abrir o link devem recuperar a consulta. Rascunhos de filtros e formulários são preservados durante consultas e mudanças de ordenação compatíveis. Uma resposta atrasada não pode substituir a consulta mais recente.

O contrato de cada coleção define:

1. Escopo e autorização de leitura; contexto obrigatório e regra de arquivamento.
2. Filtros, busca, campos ordenáveis, valores padrão e combinação dos critérios.
3. Modelo de paginação, limite e comportamento com novas ocorrências.
4. Metadados: filtros e ordem efetivos, quantidade retornada, total quando exato, página/cursor, continuação, referência temporal e indicação de parcialidade.
5. Erros de validação e falha de consulta. Parâmetros inválidos ou não suportados não podem ser silenciosamente ignorados.
6. Ordenação determinística, estratégia de consulta e índices justificados por volume e medições.

Migrar contratos legados de forma compatível, identificando consumidores e testes. Separar o resumo de um item das consultas paginadas de filhos, eventos e tentativas. A projeção da situação atual e dos gates deve continuar correta independentemente da página de histórico carregada.

No LAB, a persona atual restringe principalmente as ações; não representa autenticação corporativa nem autorização individual de leitura. A evolução do contrato não deve atribuir uma proteção que ainda não existe. Em qualquer ambiente, filtros e paginação seguem o mesmo escopo de leitura definido pelo backend.

## 8. Histórico e rastreabilidade

A [adoção da auditoria transversal](../../docs/implementacao-auditoria-2026-10-24.md) acrescenta contrato v2, resultado/fase/decisão separados, comparação anterior/novo, autoria e correlação. As fontes adaptadas e os limites estão na matriz AUD-01–08; UX-C03/C07 não equivalem à cobertura integral de gravação do SDLC. A consulta usa alvo e nomes registrados, detalhes seguros e os mesmos filtros/paginação/URL. Ausência de resultado legado aparece como “Legado: resultado não capturado”, sem inferir sucesso; campos protegidos, inexistentes e não observados têm representações distintas. A interface não carrega automaticamente revisões restritas. Evidências: `tests/collections.test.ts` e `tests/e2e/audit-history.spec.ts`, com revisão de UX e cenários isolados de filtros, comparação, decisão, teclado e celular.

O histórico é uma consulta de primeira classe, com o mesmo cuidado de uma lista de negócio. A pergunta principal é: **quem fez o quê, em qual item/revisão, quando, com qual resultado e motivo?**

| Nível de leitura | Informações |
| --- | --- |
| Resumo de negócio | Data/hora, ator e tipo de ator, ação em linguagem clara, entidade, resultado, motivo e link para o item relacionado |
| Detalhes da ocorrência | Valores anteriores/novos quando registrados, versão/revisão, etapa, evidências e origem |
| Detalhes técnicos expansíveis | ID do evento, correlação/requisição, execução, atividade, tentativa, commit/MR/release/digest, quando existirem na fonte |

Filtros: período, ator humano/agente/ferramenta/sistema/integração conforme registrado na fonte, tipo de evento, entidade, etapa e resultado conforme a cobertura real. A pesquisa deve alcançar eventos antigos, e não apenas os últimos 100. O escopo inicial mantém a consulta do item e seus descendentes, como no histórico agregado atual, com opção explícita de restringir ao próprio item.

Começar pelos eventos mais recentes, sem um corte temporal oculto. Links de ocorrência/tentativa preservam correlação e permitem retornar ao recorte anterior. Campos ausentes aparecem como não registrados; a interface não atribui o ator atual a eventos históricos nem inventa informações retroativas.

Separar trilha de auditoria imutável, eventos de execução, sinais operacionais e conversa. Uma falha de ferramenta, uma mensagem humana e uma decisão de gate têm naturezas diferentes. Ao reunir fontes, usar identidade de origem e correlação reais; não deduplicar apenas por texto ou contar espelhos do mesmo evento como novas operações. A projeção corrente continua separada da página de eventos.

Preservar eventos originais e leitura dos arquivados. Exibir cobertura e retenção conhecidas; uma consulta parcial não pode ser anunciada como “todo o histórico”. Payload bruto e segredos não são exibidos; detalhes técnicos devem ter campos selecionados e tratamento seguro.

Adotar apresentação de datas em PT-BR com fuso explícito **America/Sao_Paulo**, alinhado ao dashboard e ao contexto atual do projeto. Uma futura preferência de fuso deve ser global. Instantes são transportados em formato inequívoco; filtros de período convertem limites para o mesmo referencial, com início inclusivo e fim exclusivo. Ordenação mantém desempate por ID e detalhe pode mostrar segundos/milissegundos quando necessário.

Eventos novos não deslocam o usuário enquanto consulta páginas antigas: mostrar “Há novas ocorrências” e permitir atualizar. Um sinal operacional ou polling da interface não pode ser registrado como decisão de negócio. A paginação de conversa não amplia automaticamente o contexto enviado à LLM nem altera aprovações.

### Conversas por contexto

O menu Assistente mantém o planejamento de Sistema/Projeto. A História tem conversa consultiva própria; a Tarefa identifica e usa a História ancestral, e o Épico identifica o Projeto. A seção central Processo e decisões permite escolher o assunto da História ou a decisão da atividade disponível, preservando os agentes de execução/merge e suas autorizações. Conversa não cria itens, aprova escopo ou executa operações.

A aba **Conversas** consulta as mensagens nas fontes originais e suas referências. Filtros de origem, escopo próprio/descendentes e inclusão explícita de arquivados, ordem por data e páginas de 20 seguem o contrato compartilhado. Na URL, `conversations.source`, `conversations.scope`, `conversations.includeArchived`, `conversations.direction`, `conversations.page`, `conversations.asOf` e `conversations.message` preservam o recorte e a ocorrência. A mensagem selecionada usa identidade da fonte; o link da origem mantém seu contexto. `assistant.page` e `assistant.proposalsPage` identificam as páginas da conversa contextual e das propostas. A situação corrente (versão, rodada ativa e disponibilidade de ações) é independente da página consultada.

Relacionar uma interação concluída ou revisão de proposta a outra História exige escolha pesquisável/paginada do mesmo Projeto, versão esperada e confirmação. O texto explica que a associação registra uma referência e preserva requisitos/gates. Confirmar não copia o chat, aplica a proposta ou aprova seu conteúdo. Perda da resposta conserva a mesma intenção idempotente para reconciliação; leitura do acervo não oferece a ação. Referências mostram versão observada da História e revisão da origem; ausência legada permanece não capturada.

O conteúdo integral fica nas fontes de conversa/revisões, separado da aba Auditoria. A auditoria mantém autoria, efeitos e referências seguras. Sua consulta inclui alvos relacionados explicitamente registrados em eventos v2, com um evento por ocorrência e alvo original visível. A [implementação de conversas por escopo](../../docs/conversas-por-escopo-2026-10-24.md) registra contratos, evidência e limites. Indicadores existentes permanecem, sem novas metas, conforme escolha do usuário.

## 9. Feedback, processamento e estados vazios

| Situação | Resposta da interface |
| --- | --- |
| Carregamento inicial | Ícone animado e texto indicando qual consulta está sendo carregada; não mostrar lista vazia provisória |
| Atualização de consulta existente | Ícone animado e texto de atualização; manter o último resultado identificado e preservar foco/rascunhos |
| Nenhum registro cadastrado | Explicar a ausência e oferecer criação somente se pertinente e autorizada |
| Nenhum resultado com o filtro | Mostrar recorte, total zero e opção de limpar/ajustar filtros |
| Filtro aplicado sem mudar a lista | Confirmar aplicação e explicar ausência de registros adicionais |
| Falha | Destaque vermelho, ícone de erro e mensagem visível perto da consulta, motivo compreensível e nova tentativa que mantém o recorte |
| Resposta parcial/limite | Informar a cobertura e oferecer continuação ou refinamento real |
| Item arquivado | Identificação ARCHIVED e consulta somente leitura; ações de alteração ausentes |

Erros de leitura não são convertidos em “nenhum registro”. Permissões, bloqueios de domínio e indisponibilidade de integração têm mensagens distintas. Operações longas mostram etapa observada, fila/processamento/espera humana, última confirmação e ação disponível. Não simular percentual nem expor raciocínio privado do modelo como progresso.

**Carregamento usa o mesmo ícone animado em todo o portal:** consultas, atualizações, chamadas a ferramentas, geração de propostas e espera da resposta de agentes de IA. O indicador acompanha uma mensagem específica (“Consultando Histórias”, “Na fila”, “Aguardando resposta do agente”) e a região em atualização usa `aria-busy` quando pertinente. A animação cessa ao concluir, falhar ou passar a depender do usuário. Espera humana, gate pendente e ausência de heartbeat não são apresentados como processamento confirmado. Em `prefers-reduced-motion: reduce`, manter o ícone estático e o texto de estado, sem perder a indicação de carregamento. Animação indica uma operação pendente, sem afirmar avanço interno, disponibilidade do executor ou percentual de conclusão.

**Falhas e erros sempre têm indicação vermelha**, nas consultas, formulários, execuções de IA, ferramentas e integrações, inclusive quando consultados no histórico. Combinar ícone, texto e contraste suficiente; nunca depender apenas da cor. Apresentar o que falhou, o contexto afetado e a ação possível, preservando o último resultado conhecido, a consulta e o rascunho. O mesmo componente/tokens atende os módulos. Zero resultados, aviso, integração ainda não configurada, espera humana e bloqueio de regra de negócio não são convertidos artificialmente em erro técnico; mantêm a sua classificação e explicação.

## 10. Acessibilidade e uso em telas menores

Meta de projeto: [WCAG 2.2 nível AA](https://www.w3.org/TR/WCAG22/), sujeita a validação das páginas implementadas. Não declarar conformidade apenas pela definição deste padrão.

- Controles com rótulos permanentes, teclado funcional, foco visível e mensagens associadas. Evitar mudanças inesperadas de foco durante filtragem, paginação e polling.
- Breadcrumb em região de navegação nomeada; página atual identificada, conforme o [padrão de breadcrumb do W3C](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/).
- Tabela semântica, cabeçalhos identificados e botão no campo ordenável. Indicar a ordenação ativa com `aria-sort`, conforme o [exemplo de tabela ordenável do W3C](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/). Validar o comportamento com tecnologias assistivas.
- Paginação em navegação nomeada, página atual identificada e botões indisponíveis claramente comunicados. Resultados anunciados com moderação, sem repetir mensagens a cada polling.
- No celular e no desktop, filtros iniciam recolhidos; escopo, recorte aplicado e quantidade permanecem visíveis. Resultados podem virar cartões com os mesmos campos e ações; rolagem horizontal de tabela, quando necessária, deve ser identificada e acessível.
- Diagramas têm alternativa textual; status não dependem apenas de cor. Confirmar contraste, zoom e redução de movimento nas telas reais.

## 11. Componentes e regras de desenvolvimento

Implementar uma base compartilhada para área de consulta, filtros, resumo aplicado, ordenação, resultados, paginação, estados de consulta e histórico. Os nomes de componentes são decisões de implementação; o comportamento acima é o contrato.

Os componentes recebem metadados e decisões do domínio, sem calcular elegibilidade de gate ou permissão a partir da página de resultados. Evitar cinco implementações diferentes do mesmo filtro. A extração deve acompanhar uma primeira utilização real, com adaptação dos fluxos existentes e testes de comportamento relevantes.

Cada nova tela ou coleção precisa preencher este contrato no requisito/PR:

```text
Coleção e finalidade:
Escopo fixo / autorização / arquivamento:
Campos de busca e filtros / padrões / modo de aplicação:
Ordenação inicial / alternativas / desempate:
Paginação / tamanho / metadados / atualização concorrente:
Estado na URL / retorno / seleções preservadas:
Vazio / falha / parcialidade / processamento:
Histórico, evidências e correlação:
Mobile, teclado e leitura assistiva:
Métricas existentes afetadas / novas propostas:
Validação e limitações:
```

Revisão de UX acompanha telas novas e mudanças de navegação. Exceções justificadas ficam registradas neste padrão ou na decisão do fluxo; decisões operacionais já cobertas pelo padrão não exigem nova confirmação do usuário.

A política de métricas da arquitetura continua aplicável. Latência/falhas de consulta, ausência de resultados e uso de continuação são possibilidades a discutir antes de instrumentar novas métricas. Este documento não autoriza coleta de termos pesquisados ou conteúdo das conversas e não declara esses novos indicadores implementados.

## 12. Inventário da adoção em 24/10/2026

Inventário atualizado na implementação real, com revisão de agentes de UX e arquitetura. Os componentes compartilhados estão em `experience-ui.tsx/css`, `item-collection.tsx` e `history-collection.tsx`. A validação de consultas usa exclusivamente `portal_test`; a demonstração humana continua criada pelo usuário.

| Área | Adoção real nesta entrega | Pendência ou limite |
| --- | --- | --- |
| Sistemas e Projetos | `/api/collections/items`: busca/filtros, ordem global e páginas de 20 no banco; acervo e retorno à consulta | O endpoint legado `/api/items` permanece compatível e limitado para consumidores ainda não migrados |
| Filhos de um item | Épicos, Histórias e Tarefas usam o mesmo contrato paginado; tabelas ordenam pelos cabeçalhos | Projeções legadas do detalhe não equivalem à consulta completa; não usar seus lotes como total |
| Histórico ativo/arquivado | `/api/items/:id/history`: eventos canônicos completos, filtros, correlação, páginas de 20 e snapshot `asOf`; payload selecionado e leitura do acervo | Eventos de execução e conversa continuam fontes distintas; não fabricar resultados/atores ausentes |
| Releases | Filtros recolhidos, ordenação global, páginas de 20; histórico canônico paginado em `/api/releases/:id/history` | QA/HML/PRD continuam no backlog funcional; não criar pacotes ou aprovações simuladas no produto |
| Composição de release | Catálogo pesquisado/filtrado/ordenado no servidor, 20 por página, sem corte de 5.000; membros e versões fora da página preservados | Seleção global e substituição de composição continuam protegidas por versões; view de seleção atual usa o conjunto conhecido completo |
| História/Tarefa e jornada | Tarefas paginadas no servidor; tentativas operacionais completas da jornada filtradas/paginadas em 20 no cliente; fase e ações independentes da consulta | Migrar tentativas para contrato próprio no servidor; a projeção legada ainda limita verificações a 200 e eventos a 100, com cobertura identificada |
| Assistente e discussões | Conversas por Projeto/História, referências compartilhadas e coleção integrada das fontes; rodadas/propostas paginadas e controles atuais independentes da página; seletores de contexto e História com busca/paginação | Painéis operacionais preservam seus recortes atuais; coleção Conversas consulta as mensagens completas. Lookups remanescentes e fontes externas não correlacionadas mantêm limites próprios; UX-C06 permanece parcial |
| Dashboard | Painel de filtros recolhido compartilhado; recorte/URL, indicadores por assunto e quatro semanas preservados | Gráficos fixos não recebem paginação nem ordenação genérica |
| Integrações e diagramas | Carregamento animado, falha em vermelho e nova consulta; conjuntos fixos sem paginação artificial | Disponibilidade não concede aprovação de gate |
| Abas e datas | História ativa sem Resumo, na ordem Tarefas → Execução → Especificação → Conversas → Componentes → Mais (Auditoria, Configuração); links anteriores e filtros preservados; datas das consultas/jornada em America/Sao_Paulo | Tarefa e arquivados mantêm navegação própria; revisão final de componentes legados e acessibilidade completa permanece em UX-C07 |

Cada página de itens reflete uma consulta transacional consistente, com total e desempate estável por ID. Navegar solicita outra página; alterações externas podem afetar a posição ou o total de itens entre solicitações. O histórico fixa `asOf` e só inclui eventos novos mediante atualização explícita. Não há reconstrução de versões antigas de itens nem declaração de snapshot imutável para todas as listas.

Evidência da evolução de conversas: 220 testes de aplicação aprovados (4 integrações externas opt-in fora da rodada), 41 cenários distintos de navegador e inspeção de desktop/celular. O recorte inicial de histórico/conversas usa o relógio do banco; paginação e controles correntes permanecem independentes. A [entrega específica](../../docs/conversas-por-escopo-2026-10-24.md) registra o isolamento, a migração aditiva e a publicação local autorizada, com backup, conferência de dados e serviços saudáveis. UX-C06 continua parcial para os painéis e lookups remanescentes; QA/HML/PRD e validação assistiva completa não foram migrados por essa evidência.

## 13. Plano de adoção

Evidência da navegação da História em 25/10/2026: revisão UX, build e tipos aprovados, 8 verificações de auditoria e 36 cenários distintos de navegador aprovados nas suítes `story-task-planning`, `story-workspace`, `story-execution`, `story-experience` e `hierarchy`, usando somente `portal_test` e respostas interceptadas. Cobertura: ordem das abas, Mais, URLs anteriores, filtros, formulários, gates, retomadas, hierarquia e desktop/celular. A entrega de código/release fica após o processo em Execução para preservar a visibilidade das decisões. Essa evidência não conclui UX-C05–C07.

Publicação local dessa navegação: somente o serviço web atualizado, imagem `182e48a9c457`, saúde `ready/preview` em `http://localhost:3310`, imagem da API preservada, sem migrações ou alterações nos dados de negócio. Operação `PORTAL_PUBLICATION` registrada na trilha administrativa externa, com imagem anterior disponível para rollback.

O backlog funcional anterior permanece preservado no [plano do portal](../../docs/plano-portal-sdlc-2026-10-20.md). A tabela abaixo registra a adoção real por recorte, sem declarar concluídas as pendências de conversas e projeções legadas.

| ID | Entrega | Dependência | Critério principal |
| --- | --- | --- | --- |
| UX-C00 | Padrão versionado, inventário e instruções do repositório — concluído | — | Documento central acessível pelo README e arquitetura |
| UX-C01 | Contrato de consulta e primeira base compartilhada — adotado | C00 | Filtros, ordenação, paginação e estados reais; consumidores legados identificados |
| UX-C02 | Sistemas e Projetos — adotado | C01 | Busca sobre a coleção inteira, ordem nos cabeçalhos, páginas e acervo com retorno preservado |
| UX-C03 | Histórico canônico — adotado | C01 | Evento 101 e anteriores acessíveis; filtros/correlação e leitura de arquivados; situação atual independente |
| UX-C04 | Releases e escolha de Histórias — adotado | C01 | 20 por página; catálogo além de 5.000; seleção/versões preservadas entre páginas e filtros |
| UX-C05 | Demais níveis, Tarefas e tentativas — parcial | C01, C03 | Tarefas e filhos migrados; consultas próprias para tentativas e cobertura legada ainda pendentes |
| UX-C06 | Conversas, propostas e seletores com alto volume — parcial | C01, C03 | Conversas integradas e rodadas/propostas paginadas; seletores de contexto e Histórias adaptados; painéis operacionais e lookups remanescentes preservam cobertura explícita; orçamento da LLM separado |
| UX-C07 | Harmonização e revisão de acessibilidade — parcial | C02–C06 | Filtros recolhidos, carregamento animado e falhas em vermelho aplicados nos fluxos principais; validação assistiva completa e remanescentes dependem de C05/C06 |

Após C01, histórico e as primeiras listas podem evoluir em paralelo. Cada entrega deve substituir o fluxo antigo correspondente, registrar suas limitações e preservar os dados; não marcar o portal inteiro como padronizado pela entrega de um componente isolado.

## 14. Critérios de revisão e aceite

A [prévia navegável](../../prototypes/navigation-v1/README.md), disponível em http://localhost:3311, continua separada e usa dados fictícios. A adoção no portal real em http://localhost:3310 está registrada no inventário acima e em [implementação dos padrões](../../docs/implementacao-padroes-experiencia-2026-10-24.md). Recursos futuros de release continuam sendo somente demonstração no protótipo; não são executores reais.

- Busca encontra o item 501 e os demais registros posteriores ao limite atual; filtro e ordem atuam antes da paginação.
- Histórico acessa evento 101, conversa acessa interação 51 e o catálogo encontra Histórias além das primeiras 5.000.
- Datas iguais e inserções concorrentes não causam perda silenciosa; a estratégia de consistência da coleção é exercitada.
- Contagens correspondem ao mesmo filtro/escopo dos resultados; uma amostra limitada não é apresentada como total.
- Voltar, recarregar e trocar abas preservam o que for pertinente. Seleção fora da página continua identificada e protegida.
- Marcar um filtro sem ocorrências adicionais confirma a aplicação e explica a lista inalterada.
- Arquivados continuam consultáveis e protegidos contra alteração; permissões, status, aprovações e gates não dependem da página carregada.
- Erro, carregamento, zero resultados e resposta parcial são distinguíveis por texto e por tecnologia assistiva.
- Filtros iniciam recolhidos no desktop e no celular; aplicar ou recolher não oculta o recorte/total, não perde rascunhos e não abre o painel sem escolha do usuário.
- Tabelas ordenam pelos nomes das colunas, com direção visível, `aria-sort` e teclado, sem combo redundante; listas/cartões preservam os controles de campo e direção. Ordenar preserva filtros/rascunhos/seleções, reinicia a página e usa a coleção inteira.
- Todo carregamento de consulta, agente ou ferramenta mostra ícone animado com texto; redução de movimento mantém a informação sem animação. Sucesso, falha, espera humana e estado desconhecido não mantêm um indicador de processamento enganoso.
- Toda falha de consulta, formulário, IA ou integração tem destaque vermelho com texto e ícone, inclusive no histórico, sem tratar zero resultados ou espera humana como erro.
- Validar fluxos relevantes em banco/navegador de teste, com volume representativo, teclado e viewport reduzido. Fixtures ficam no ambiente isolado; a demonstração humana continua criada pelo usuário.

Registrar na revisão quais critérios foram exercitados e quais continuam pendentes. Medir as consultas representativas antes de fixar metas de desempenho ou declarar capacidade.

## Ciclo de vida nas abas Execução

Política de estados revisada por decisão do usuário em 25/10/2026. Evidência: revisão UX, tipos/build e guardas de auditoria aprovados; 222 testes de aplicação aprovados (4 integrações externas opt-in fora da rodada) e 20 cenários de navegador em `planning-lifecycle`, `hierarchy`, `dashboard`, `story-execution` e `experience-standards`. Validação de criação real ACTIVE/TO DO, transições, permissões, reabertura, G1 preservado, filtros, acervo e indicadores; `item-state-policy.test.ts` cobre adequação auditada, falha com rollback, retentativa, reversão compensada e proteção contra sobrescrever trabalho posterior. Testes usam somente `portal_test`; a adoção UX-C05–C07 continua parcial.

Publicação local concluída em `localhost:3310`, imagem API/web `bdf38f4552ed`, saúde `ready/preview`. Um item existente exigiu adequação de estado; demais dados e eventos anteriores foram conferidos e preservados. Backup privado validado, imagens anteriores para reversão e operação `PORTAL_PUBLICATION` na trilha administrativa externa; conversão registrada por `ITEM_STATE_POLICY_CHANGED` na transação.

As abas Execução de Sistemas, Projetos, Épicos, Histórias e Tarefas devem apresentar o quadro compartilhado de ciclo de vida, com estado atual explícito, transições permitidas, permissões, processamento animado e erros evidentes. Sistemas mantêm ACTIVE / INACTIVE; Projetos usam ACTIVE / COMPLETED / CANCELLED e são criados em ACTIVE, com aprovação de planejamento independente e justificativa para reabrir em ACTIVE. CANCELLED é uma saída alternativa, sem indicação de etapa obrigatória após COMPLETED. Épicos usam somente TO DO / DOING / DONE, começam em TO DO e iniciam pelo comando de status para DOING, sem aprovação própria. Conclusão exige Histórias não arquivadas em COMPLETED; reabertura exige justificativa. Projetos encerrados devem ser reabertos antes de alterar seus Épicos. A assistente do Épico abre no Projeto ancestral, com esse escopo explícito. Arquivamento continua separado e a consulta de arquivados permanece sem ações de alteração.

Adotado em Sistemas, Projetos, Épicos, Histórias e Tarefas. Histórias e Tarefas incluem Execução na navegação real de `StoryWorkspace`, com o mesmo quadro e acesso à assistente no Projeto ancestral. A História exibe seu status atual; a continuidade abre a interação contextual e não oferece mutação genérica de status nem dispensa gates. A Tarefa exibe seu próprio TO DO / DOING / DONE; o botão leva à única instância dos controles de interação existentes. Controles manuais só aparecem depois de a jornada confirmar Tarefa não gerenciada, sem vínculo `publish_code`; Tarefas de processo/publicação dependem das operações e evidências. Consulta de tentativa histórica não libera alterações manuais. Os indicadores de inventário, transições e execuções continuam usando as fontes já instrumentadas.

As alterações correntes de estado reutilizam as operações e eventos de auditoria existentes. A adequação de itens legados usa ITEM_STATE_POLICY_CHANGED, sem nova métrica de domínio. Aprovações e inventário por status mantêm a instrumentação existente.

Evidência: `tests/e2e/planning-lifecycle.spec.ts` — cenários de navegador com APIs simuladas cobrem transições do Sistema, permissões, processamento, conflito de versão e idempotência, aprovação independente do Projeto e reabertura com justificativa preservada. A extensão para Épicos cobre o ciclo de três estados, contexto ancestral da assistente, transições/reabertura e bloqueio por Projeto encerrado. Revisão de UX em 24/10/2026.

`tests/e2e/story-task-planning.spec.ts` cobre o ciclo e a navegação da História sem escrita de status, ações manuais/reabertura da Tarefa na interação existente e proteção das Tarefas gerenciadas, com APIs simuladas. A adoção não implementa os futuros executores de teste, homologação ou produção.

