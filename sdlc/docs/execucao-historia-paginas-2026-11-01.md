# Execução da História — acompanhamento e páginas de ação

**Publicado no portal local em 01/11/2026.** Esta fatia reorganiza a navegação da História. Build API/web, validação dirigida, revisão UX e conferência real em 1440/390 concluídos. As contagens e limitações das rodadas, a publicação e as evidências estão registradas abaixo; não houve execução completa do catálogo.

## Escopo e experiência

A História mantém seis abas: **Tarefas, Execução, Especificação, Conversas, Auditoria e Configurações**. A entrada da História continua em Tarefas. A aba Execução passa a ser um ponto de acompanhamento e escolha, com dois quadros:

1. **Acompanhamento da execução:** situação da jornada, sinais e automações, últimas leituras de DEV, recorte de eventos e link da aplicação quando a leitura autoritativa confirmar sua disponibilidade.
2. **O que você pode fazer agora:** link para a próxima ação, recuperação de solicitações pendentes e alternativas disponíveis no contexto atual.

Os quadros não contêm o formulário de confirmação de uma decisão. Cada ação abre uma página própria, identificada pela História, com retorno à Execução. Consulta e navegação não iniciam agentes, repetem operações nem aprovam gates. Os formulários continuam usando os comandos, prévias, permissões, versões e confirmações existentes.

O escopo desta reorganização é a **História não arquivada**. Tarefas conservam sua navegação anterior, trabalho, resultados, tentativas e comportamento de recuperação. Acervo, Sistemas, Projetos e demais entidades não são declarados migrados por esta entrega. A identidade visual, a persona, a localização e a edição do item são preservadas.

## Contrato de URL

As rotas abaixo usam o identificador da História no lugar de `:id`. Abrir uma URL é navegação; uma mutação exige a confirmação própria da página.

| URL | Conteúdo e limite |
| --- | --- |
| `/stories/:id/execution` | Os dois quadros de acompanhamento e escolha. |
| `/stories/:id/execution/actions/:actionId` | Uma ação do núcleo da jornada. O identificador deve continuar disponível na leitura atual de `nextAction` ou `secondaryActions`; uma ação ausente não é substituída por outra. `pending` identifica a recuperação de uma solicitação já preservada. |
| `/stories/:id/execution/conversation` | Conversa e esclarecimentos disponíveis no contexto. Conversar não substitui confirmação de correção ou integração. |
| `/stories/:id/execution/processing` | Processamento, sinais e recuperação aplicáveis à integração. |
| `/stories/:id/execution/administration` | Administração dos vínculos e do escopo de Tarefas. |
| `/stories/:id/execution/destination` | Destino de implementação e repositório. |
| `/stories/:id/execution/delivery` | Entrega de código e referências de integração. |
| `/stories/:id/execution/release` | Planejamento de release existente; entrar na página não compõe nem promove um pacote. |
| `/stories/:id/execution/specification` | Consulta da especificação no contexto da execução. |
| `/stories/:id/execution/dev/build` | Construção DEV. |
| `/stories/:id/execution/dev/deployment` | Publicação em DEV. |
| `/stories/:id/execution/dev/test` | Testes em DEV. |
| `/stories/:id/execution/dev/approval` | Conferência e decisão de Desenvolvimento Finalizado. |
| `/stories/:id/execution/environments/QA`, `/HML`, `/PRD` | Consulta dos limites e da situação do ambiente; não implementa produtores de promoção ausentes. |

`/stories/:id/execution/environments/DEV` é uma entrada de compatibilidade: encaminha para a etapa indicada pela leitura, para a consulta da aprovação já registrada ou para os detalhes da execução quando não há etapa indicada. Não retorna ao mesmo botão genérico do hub nem abre os quatro formulários simultaneamente. As URLs anteriores baseadas em parâmetros de execução são normalizadas para as páginas correspondentes. O construtor compartilhado remove os parâmetros de apresentação substituídos (`process`, `interact`, `devStep`, `environment` e `tab`) e preserva parâmetros alheios à execução. Segmentos inválidos não selecionam uma ação por aproximação.

A passagem QA → escolha de release conserva a origem e a seleção não salva. Retornos vindos de Tarefas, Sistema e Projeto aceitam somente a árvore válida da História; URLs externas ou segmentos desconhecidos não viram um destino de retorno. Consultar integração abre Entrega de código, com a referência correspondente. Solicitar correção após testes abre a decisão do novo ciclo, sem voltar a uma lista genérica.

## Uma etapa DEV por página

`StoryEnvironment` recebe `focusedStep` e `standaloneAction` para apresentar somente a construção, publicação, teste ou aprovação solicitada. A orientação e o título pertencem à etapa selecionada. Uma entrada individual sem etapa válida não escolhe outro formulário automaticamente.

Os quatro controladores continuam únicos e montados em hosts estáveis; somente o host selecionado fica visível. Em modo individual, `DevStage` permanece aberto e não oferece disclosure para esconder o formulário da página. `active` continua identificando o destino em que a pessoa está trabalhando: apenas o controlador DEV selecionado fica ativo. Esconder um host não equivale a concluir, cancelar ou repetir sua operação.

A prévia explicitamente negada conserva os impedimentos, a consulta e o retorno, sem apresentar motivo, aceite ou botão de confirmar. A disponibilidade do comando continua sendo decidida pelos contratos existentes. A reorganização não cria um gate adicional.

## Estado local e recuperação

O layout de `/stories/:id` mantém o Portal e o Workspace da mesma História montados durante a troca entre suas páginas. A chave de carregamento considera a identidade da História, em vez de tratar cada página de ação como um novo item. Assim, trocar a URL dentro da mesma História não deve destruir o proprietário em memória do pedido, seu rascunho ou sua identidade de repetição.

Os controladores DEV notificam o Workspace por `onPendingChange`, em efeito, sobre pedido pendente; construção, publicação e testes também sinalizam resultado remoto `unknown`. O Workspace mantém o mapa por etapa e apresenta no acompanhamento um **link de recuperação para a página proprietária**. Esse aviso em memória não depende de `sessionStorage`. A confirmação ou reapresentação do pedido fica na página da ação, com a identidade e o corpo originais; o acompanhamento não deve exibir o portal de recuperação mutante de outra página.

O núcleo da jornada e o registro de integração conservam suas recuperações próprias. Em caso de resposta perdida, não se transforma o link de recuperação em novo pedido: repetição e reconciliação seguem os contratos de idempotência existentes. A aprovação de G1 continua autorizando e **enfileirando a codificação**; não confirma execução síncrona nem sucesso do código.

A reabertura de História cancelada abre `/execution/actions/reopen_story`. Configurações encaminha para a mesma página proprietária, que mantém a justificativa montada e usa o comando existente `POST /api/items/:id/reopen`, com `expectedVersion`, `comment`, persona e chave originais. O recorder da API conserva `STORY_REOPENED`, alterações anterior/nova e a exigência de outro G1. A resposta incerta usa a recuperação do núcleo; erro não limpa a justificativa. Após um recibo, o hub aguarda uma nova leitura da jornada antes de oferecer outro comando.

A garantia de montagem é limitada às páginas da **mesma História**. Recarregar o navegador, sair desse layout, abrir outra História ou encerrar a sessão pode desmontar o Workspace. A persistência já existente e a revalidação no servidor continuam necessárias; não há nova garantia de recuperação após recarga quando o armazenamento do navegador estiver indisponível. Consultar uma tentativa histórica também não muda a situação atual ou os gates.

## Consultas, atualidade e custo

| Fonte | Uso nesta fatia | Atualização e limite |
| --- | --- | --- |
| `GET /api/items/:id/journey` | Situação e ações da jornada, sinais, eventos recebidos e projeção `devProgress`. | Consulta existente, sem cache de navegador, com novo ciclo agendado 2.500 ms após terminar a leitura anterior. Respostas de efeito encerrado não atualizam a tela. |
| `GET /api/items/:id/development-build` | Última operação de construção recebida no acompanhamento. | Uma das três consultas independentes do acompanhamento DEV. |
| `GET /api/items/:id/development-deployment` | Última operação de publicação e leitura de preparação de destino recebidas. | Uma das três consultas independentes do acompanhamento DEV. |
| `GET /api/items/:id/development-test` | Última operação de testes recebida. | Uma das três consultas independentes do acompanhamento DEV. |

O acompanhamento ativo dispara os três GETs DEV em paralelo e agenda outro conjunto **4.000 ms após a conclusão**. Ao sair do acompanhamento, encerra o timer, aborta suas consultas em curso e descarta respostas tardias. Uma falha de fonte conserva a leitura anterior identificada e sinaliza a falha; não transforma falta de resposta em sucesso, ausência de operação ou resultado atual confirmado. Não há transação ou snapshot atômico comum entre as três respostas.

Esses três GETs adicionais não representam o total de requisições da tela: o núcleo da jornada e as consultas já existentes dos controladores têm ciclos próprios. Esta entrega não introduz métrica, orçamento de carga comprovado ou agregador de consultas. O custo combinado e a atualidade na infraestrutura final ainda exigem conferência.

Os eventos do quadro são um **recorte de até seis eventos recebidos**, ordenado para acompanhamento, com acesso às consultas existentes de detalhes e histórico. As leituras de automação mostram a última operação recebida de cada fonte, sem declarar que constituem todo o acervo. Falha de consulta, carregamento e leitura anterior permanecem distinguíveis; uma atualização manual somente consulta.

A URL de DEV vem da projeção autoritativa `devProgress`, com data da observação. O frontend não deduz disponibilidade a partir de `TESTING`, de um teste antigo ou de uma publicação histórica. A projeção exige correlação da revisão, construção e operação publicadas, observação saudável e URL segura; incerteza ou outra versão no DEV compartilhado não autorizam apresentar uma URL como sendo a versão atual desta História. A leitura pode mudar entre a consulta e a abertura da aplicação.

## Decisões, auditoria e limites de produto

- `nextAction`, `secondaryActions`, checks e `devProgress` orientam a navegação. O contexto, a permissão, a versão e os impedimentos são conferidos novamente antes do comando.
- As assinaturas, corpos, autoria, correlação e chaves de idempotência dos comandos existentes permanecem. Não há nova ação de domínio, worker, integração, evento, gate ou indicador nesta fatia. As mutações continuam usando sua trilha e o recorder existentes.
- Teste técnico aprovado não comprova cobertura integral de aceitação. O executor HTTP atual não passa a produzir evidência de interação visual, fonte, teclado ou comportamento de interface por causa das novas páginas. Navegar na aplicação tampouco registra aceitação ou Desenvolvimento Finalizado.
- As consultas de QA, HML e PRD não implementam composição imutável, promoção ou conclusão que ainda não tenham produtor disponível. A nova navegação não transforma esses limites em comandos prontos.
- Não se alteram aplicações produzidas pelo SDLC, dados de negócio ou resultados de agentes para demonstrar a interface. Dados de validação pertencem a testes isolados.
- A publicação do Portal reutilizou `PORTAL_PUBLICATION` e sua trilha administrativa externa, com backup privado e comparação de conteúdo de negócio; não inseriu eventos diretamente em `HistoryEvent`.

## Adoção e validação

| Área | Estado desta fatia |
| --- | --- |
| História: acompanhamento com dois quadros e páginas próprias | Publicada e conferida no portal local. |
| URLs diretas, compatibilidade e retorno | Validação dirigida de navegação, parâmetros, recarga, teclado e foco aprovada. |
| Estado do pedido entre páginas da mesma História | Recuperação e identidade verificadas; rascunho DEV e persona permanecem em memória sem armazenamento. |
| Consulta parcial, erro e atualização concorrente | Cenários dirigidos de falha, leitura datada e contexto alterado verificados; sem snapshot distribuído comum. |
| Infraestrutura final, acessibilidade e navegação desktop/móvel | Conferência real em 1440/390 e quatro provas de foco/oclusão; sem validação assistiva integral. |
| Publicação | Imagem `476ad5b7eb7e…`, fonte `b228aceefc9e…`, saúde `ready/preview`; recibo abaixo. |
| Tarefa e outras entidades | Navegação anterior preservada; sem declaração de migração. |

### Evidência da validação dirigida

O catálogo final contém **650 cenários/59 arquivos**, conferido em `20261101T043001Z-4f0381`. A rodada ampliada `20261101T041754Z-1c8bd3` executou **301 cenários em 25 arquivos: 300 passaram e um falhou** por ler o link de saída da Tarefa antes de concluir a navegação para DEV. A correção acrescentou somente a espera pelo destino esperado; o cenário `UI-8cbc40f0d208` passou na rodada focal `20261101T043014Z-cfa300`, **1/1**. O runtime permaneceu idêntico (`61937468a010…`), com fonte estável, sem flaky ou erros de navegador nas duas rodadas. Assim, são **301 cenários distintos verificados pelas rodadas combinadas**, e não 301/301 em uma única execução. O relatório ampliado reprovado foi preservado.

A cobertura inclui os quinze casos novos de navegação, as etapas DEV, G1 e destino, correções e novo ciclo, qualidade/segurança, merge e suas referências, publicação pelo Assistente, releases/rastreabilidade, permissões, consultas e os cenários legados de Tarefa. Os testes mantêm verificações de corpo, versão, SHA, política, autoria e identidade de retentativa. A nova reabertura teve prova isolada de ACK perdido com um único `STORY_REOPENED`, mesma versão após replay e Tarefas canceladas preservadas; referência pendente bloqueou a ação mantendo a justificativa e sem escrita.

Os quatro cenários de foco verificaram abertura de G1 e recarga em 1440/390: `activeElement` no H1 e título abaixo do limite inferior da faixa fixa. Os menores afastamentos registrados foram 49,5 px em desktop e 30 px no celular. Dados e comandos de teste ficaram no `portal_test` ou em interceptações explícitas; não atestam execuções reais de LLM/GitLab/registry nem aprovação funcional de aplicações.

Build de produção final API/web aprovado, incluindo as rotas próprias de História/Execução e o HELP estático. Revisão UX de quatro capturas isoladas e quatro capturas reais sem bloqueio visual. O cabeçalho mantém os destinos legíveis e sem navegação operacional concorrente; a confirmação do G1 conserva seu aceite explícito. **Limites:** a primeira área é longa no celular e exige rolagem até as ações; não se afirma presença de ambos os quadros na primeira dobra. Sem ensaio de carga, teste com usuários ou validação assistiva integral.

### Publicação e conferência real

Publicada em **01/11/2026 às 01:33 (America/Sao_Paulo)**, imagem `476ad5b7eb7ed95f0b7b6c269896e89b12d58fbde9d397f7a739f3f00cdc783f`, fonte `b228aceefc9e8547942b2a1833bce96ef37132dcc230f5b3fca0578229211226`. Backup privado verificável, 43 migrations existentes sem pendência e **conteúdo de negócio de 49 tabelas preservado**. A comparação exclui somente leases/metadados de consulta automática de `MergeOperation`, explicitados na projeção segura; não é uma declaração de igualdade byte a byte de todo metadado de polling. Ledger administrativo com 168 registros e nenhuma operação pendente, manifesto e imagens conferidos.

A conferência real na História existente Hello World abriu Execução pela aba, confirmou **dois quadros, zero campos de interação visíveis no hub, um único controlador DEV na página da ação**, retorno ao mesmo hub e detalhes da execução em URL própria. Não houve overflow em 1440/390, erros de página ou comandos de negócio. O link da aplicação abriu `http://localhost:33991/` com H1 **Hello World**, sem escrita. A pendência real de aceitação **0 de 6 critérios** permaneceu explícita; nenhum gate, resultado de agente ou aplicação produzida foi alterado para a demonstração.

Evidências: [acompanhamento desktop](assets/execucao-historia-paginas-2026-11-01/01-acompanhamento-desktop.png), [página da ação desktop](assets/execucao-historia-paginas-2026-11-01/02-acao-desktop.png), [acompanhamento celular](assets/execucao-historia-paginas-2026-11-01/03-acompanhamento-celular.png), [página da ação celular](assets/execucao-historia-paginas-2026-11-01/04-acao-celular.png), [projeção segura das rodadas, foco, publicação e uso real](assets/execucao-historia-paginas-2026-11-01/05-validacao-publicacao.json) e [manifesto SHA-256](assets/execucao-historia-paginas-2026-11-01/sha256.json).

## Referências

- [Continuação da simulação humana após esta publicação](simulacao-humana-pos-dev-2026-11-01.md): aplicação conferida em DEV; bloqueio real de aceitação e backlog SH-01–SH-05, sem correção de produto nesta sessão.
- [Padrões de experiência e navegação](../portal/docs/PADROES_DE_EXPERIENCIA.md).
- [Arquitetura e política de métricas](../portal/docs/ARCHITECTURE.md).
- [Auditoria transversal](implementacao-auditoria-2026-10-24.md).
- [Mapa HELP e limites do fluxo de negócio](correcao-jornada-humana-dev-2026-10-31.md#help-fluxo-execucao), datado da entrega anterior; não é recibo das novas páginas.
- Fontes da navegação: [rotas compartilhadas](../portal/apps/web/app/story-execution-navigation.ts), [Workspace](../portal/apps/web/app/story-workspace.tsx), [Portal](../portal/apps/web/app/portal.tsx) e layout de `apps/web/app/stories/[id]/layout.tsx`.
- Fontes da apresentação: [acompanhamento](../portal/apps/web/app/story-execution-hub.tsx), [ambiente](../portal/apps/web/app/story-environment.tsx) e [etapa DEV](../portal/apps/web/app/dev-stage.tsx).
- Fonte da leitura autoritativa: [progresso DEV](../portal/apps/api/src/story-dev-progress.ts).
