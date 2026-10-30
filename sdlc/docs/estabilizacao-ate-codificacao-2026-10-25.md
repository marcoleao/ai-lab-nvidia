# Estabilização do SDLC até a codificação

Data: 25/10/2026. Decisões tomadas com o usuário, uma a uma, após a análise dos fluxos e a confirmação do contrato consolidado.

**Situação desta revisão: implementada, validada e publicada localmente em 25/10/2026, mediante autorização do usuário.** As duas migrations aditivas foram aplicadas com backup e preservação dos registros existentes. Não houve normalização de estados, criação de dados de demonstração ou execução de agentes para validar a publicação. A evidência está na seção 11.

**Continuação autorizada:** a base de desenvolvimento foi posteriormente limpa sem criar backup para essa limpeza, e os provedores reais foram exercitados em recursos isolados. Os ajustes encontrados foram validados e publicados; a base instalada permanece vazia. A seção 12 distingue essa operação da publicação histórica acima.

Este documento detalha a decisão de domínio. [Arquitetura](../portal/docs/ARCHITECTURE.md), [padrões de experiência](../portal/docs/PADROES_DE_EXPERIENCIA.md) e [auditoria transversal](implementacao-auditoria-2026-10-24.md) registram sua adoção. A mudança cobre requisitos, plano técnico, G1, geração, validação técnica e publicação da branch/MR em rascunho. Os fluxos posteriores à codificação serão revisados em outra fase.

## 1. Agrupadores, disponibilidade e encerramento

| Entidade | Estados do contrato |
| --- | --- |
| Sistema | `ACTIVE` e `INACTIVE` |
| Projeto e Épico | `ACTIVE`, `INACTIVE`, `COMPLETED` e `CANCELLED`; criação em `ACTIVE` |
| História | Fases existentes, iniciando em `SPECIFICATION`, com `CANCELLED` como resultado terminal próprio |
| Tarefa | `TO DO`, `DOING`, `DONE` e `CANCELLED` |

- Projeto e Épico são agrupadores. Não possuem aprovação própria para liberar a História; o comando antigo de aprovação recusa a operação e orienta usar G1.
- `INACTIVE` representa pausa temporária, distinta de conclusão e cancelamento. É permitido haver filhos abertos durante a pausa.
- Inatividade ou encerramento de um agrupador bloqueia criação, edição e início de trabalho em toda a árvore. Novas mensagens consultivas também ficam bloqueadas; consulta dos itens e do histórico continua disponível.
- Inativar exige que as operações em andamento tenham terminado ou tenham sido interrompidas explicitamente. Uma concessão ainda válida de operação cancelada pode representar provedor ainda em processamento; a inativação aguarda sua liberação.
- Filas pendentes são pausadas. Reativar não as inicia; retomada exige comando explícito. A política é compartilhada por comandos, projeções e workers.
- Concluir ou cancelar Projeto/Épico exige ausência de descendentes abertos. A verificação percorre a árvore completa e inclui o acervo: arquivar um filho aberto legado não o transforma em finalizado.
- Agrupador vazio ou com todos os filhos diretos cancelados pode ser concluído ou cancelado, com justificativa. Os resultados dos filhos são preservados.
- Reabertura de agrupador encerrado exige justificativa e ancestrais ativos. Reativação e mudanças de apresentação do agrupador não alteram o conteúdo aprovado da História.

`lifecycle-policy.ts` centraliza elegibilidade, leitura dos estados legados, verificação de operações ativas e pausa/retomada. `app.ts` usa a mesma política para cadastros, alterações, vínculos, ciclos, provisionamento e arquivamento. As integrações aplicam a guarda antes de reclamar um trabalho, evitando que a inatividade seja contornada pelo executor.

## 2. Arquivamento

- Projeto, Épico, História e Tarefa precisam estar finalizados antes de arquivar. Inatividade não satisfaz essa condição.
- Sistema precisa estar `INACTIVE`, sem descendentes abertos e com justificativa. Seu arquivamento é uma exceção administrativa explícita ao bloqueio de alterações durante a inatividade.
- As seis Tarefas padrão são obrigatórias e não podem ser arquivadas individualmente como forma de retirar uma etapa. O arquivamento de uma História finalizada preserva sua árvore no acervo.
- Arquivar não remove repositórios, branches, MRs, revisões, resultados ou eventos. Consultar o acervo não restaura itens nem libera mutações.

## 3. História manual e especificação editável

A origem da História muda sua proveniência, sem criar regras diferentes de edição, completude ou aprovação.

1. Uma História pode nascer apenas com título e vínculo ao Épico, como rascunho em `SPECIFICATION`. Criar não inicia agentes.
2. Requisitos de negócio e plano técnico para G1 são assuntos separados na mesma área de Especificação. Ambos podem ser escritos e editados por pessoas; geração/revisão por IA é opcional.
3. Para preparar a execução, exigir objetivo, comportamento esperado e ao menos um critério funcional verificável. Os demais tópicos são complementares; não preencher campos inexistentes por inferência.
4. Para aprovar G1, exigir plano técnico válido, arquitetura e casos de teste cobrindo todos os critérios. Casos de teste descritos não são testes executados.
5. Dependências possuem impacto `blocking` ou `informative`, além da situação `pending`/`confirmed`. Dependências impeditivas pendentes bloqueiam G1 e codificação; elaborar a especificação continua permitido.
6. Salvar rascunho não troca a especificação vigente e não aprova G1. É permitido manter novo rascunho durante a codificação, enquanto o agente usa a revisão congelada.
7. Aplicar conteúdo alterado à execução exige encerrar ou interromper explicitamente a tentativa atual e obter novo G1. A interface preserva a edição recusada por conflito ou trabalho em andamento.

Fontes novas: `StorySpecificationDraft` mantém a edição otimista; `StorySpecificationRevision` preserva cada aplicação e sua autoria. A revisão anterior e a saída original do agente não são reescritas. Os critérios funcionais têm projeção compatível em `data.acceptanceCriteria`, atualizada na mesma operação, sem duas fontes editáveis independentes.

Os comandos de especificação usam versões de rascunho, revisão base e versão esperada da História. A consulta de revisões pagina de 20 em 20, com metadados, ordem determinística e referência `asOf`; a revisão vigente e a elegibilidade do comando continuam independentes da página histórica.

## 4. G1 e conteúdo da execução

PO, Arquiteto e Admin podem editar, cancelar, reativar e aprovar G1, respeitando os bloqueios de estado e escopo. A mesma pessoa pode editar e aprovar seu conteúdo, em ações explícitas diferentes. A identidade continua sendo a persona declarada do LAB; não há afirmação de autenticação corporativa ou separação técnica entre duas pessoas reais.

Para execuções novas, o snapshot de escopo v3 contém requisitos completos, plano técnico, critérios, escopo das Tarefas envolvidas na codificação e componente. O agente recebe esse conteúdo; a presença de um digest não substitui enviar os requisitos ao modelo. Excesso do contexto suportado deve ser apresentado como impedimento, sem aprovação parcial ou omissão silenciosa.

Mudanças nesses conteúdos exigem nova revisão/G1. Títulos, organização, status, andamento e resultados não invalidam aprovação de conteúdo. Alterações operacionais de ancestrais ficam separadas da revisão aprovada. Mudar diretamente o escopo de uma Tarefa durante uma tentativa ativa é recusado; o rascunho paralelo é o caminho próprio da especificação.

**Limite de compatibilidade:** snapshots antigos mantêm sua assinatura conservadora. Um snapshot que não capturou os requisitos completos não é convertido silenciosamente em aprovação v3. Se seu contexto não puder mais ser comprovado, é necessário outro ciclo explícito de especificação/G1; eventos, pareceres e artefatos antigos permanecem consultáveis.

## 5. Planejamento obrigatório e resultado por Tarefa

Toda História criada, manualmente ou por agente, recebe atomicamente:

| Etapa identificada | Tarefa padrão |
| --- | --- |
| `coding` | Codificação |
| `test` | Teste |
| `code_review` | Revisão de Código |
| `security_scan` | Revisão de Segurança |
| `final_test` | Teste Final |
| `merge` | Merge de Código |

Essas Tarefas são fixas e obrigatórias: podem receber detalhamento, mas não perder sua etapa nem ser excluídas. A criação é idempotente. O usuário e o agente podem detalhar o mesmo planejamento, sem fabricar outra Tarefa técnica equivalente. Tarefas adicionais são permitidas para trabalhos específicos.

Na preparação explícita de uma História legada, uma Tarefa técnica já associada à atividade pode ser adotada para a etapa padrão, com auditoria e preservação de identidade, texto, status, resultados e tentativas. Associações conflitantes exigem revisão explícita e não são reescritas silenciosamente. Preparar novo G1 preserva Tarefas concluídas; iniciar sua nova execução é a ação que pode reabri-las.

O executor usa a própria Tarefa planejada. `WorkActivity`, `WorkAttempt` e `WorkEvent` registram etapas, tentativas, sinais, resultados e evidências; a História mostra a entrega consolidada. Requisitos e G1 pertencem à História e não exigem uma sétima Tarefa automática de especificação. Uma nova tentativa não apaga as anteriores.

A fila mantém a Tarefa em `TO DO`; início confirmado permite `DOING`; a evidência aplicável permite `DONE`. Na Codificação, a publicação confirmada da branch/MR em rascunho é o resultado desta entrega. Não representa merge, deploy ou conclusão da História.

Tarefas adicionais têm conclusão manual com relato obrigatório do trabalho e resultado, e referências quando aplicáveis. `TaskResultRevision` preserva cada resultado confirmado; `data.taskResult` é a projeção atual, com referência à revisão imutável. Reabrir e concluir novamente não substitui o resultado anterior. A consulta da fonte pagina de 20 em 20, com ordenação determinística e referência `asOf`; a URL preserva `taskResults.page` e `taskResults.asOf`, independentes da elegibilidade atual.

As Tarefas das etapas posteriores já existem para planejamento e registro. Isso não implementa o executor de Teste/Teste Final nem redefine nesta fase a sequência, os gates ou os critérios finais de review, scan, testes e merge.

## 6. Cancelamento e reabertura da História

Cancelar a História é diferente de interromper uma tentativa para revisar a especificação. O comando de cancelamento terminal bloqueia novas operações, cancela Tarefas abertas e solicita a interrupção das tentativas. Tarefas `DONE`, resultados e artefatos são preservados, sem sucesso fictício para trabalho cancelado.

Se a publicação GitLab já está em andamento, o pedido é aceito e aparece como **Cancelamento solicitado**. A História só passa a `CANCELLED` após verificar o resultado da publicação enviada. A reconciliação reutiliza o patch e as referências duráveis; não gera outro código. Commit, branch e MR eventualmente confirmados permanecem registrados mesmo quando a entrega é cancelada. Ausência de confirmação externa não equivale a cancelamento definitivamente confirmado.

Uma História cancelada pode reabrir explicitamente, com justificativa e ancestrais ativos, voltando a `SPECIFICATION` e exigindo novo G1. As Tarefas não reabrem automaticamente com a História. Uma posterior ação explícita de execução pode abrir nova tentativa da Tarefa correspondente, preservando seu histórico.

## 7. Métricas aprovadas

As novas medidas entram na Visão geral e usam suas quatro semanas de calendário em `America/Sao_Paulo`, semana atual parcial e filtros existentes de participação, Sistema e Projeto. Não foram definidas metas numéricas.

| Indicador | Definição e fonte |
| --- | --- |
| Histórias criadas por origem | Cada História conta uma vez, na semana da criação. `data.creationOrigin` é fixo: `manual` ou `assistant`; editar depois não altera a origem. Fonte sem procedência comprovada aparece como origem não registrada. |
| Revisões de especificação | Aplicações após a primeira versão em `StorySpecificationRevision`, uma por revisão confirmada. Alterar negócio e plano técnico na mesma aplicação conta uma operação. Rascunhos, replays, recusas e gravações sem mudança não contam. Autoria humana/agente é separada da origem de criação. |
| Cancelamentos | Ocorrências efetivas `STORY_CANCELLED` e quantidade de Histórias distintas afetadas. Pedido pendente, interrupção da tentativa, pausa ou cancelamento das Tarefas em cascata não contam como cancelamento adicional de História. |
| Reaberturas | Ocorrências `STORY_REOPENED` e quantidade de Histórias distintas. Retentativa técnica e `INACTIVE → ACTIVE` não são reabertura de História. |

`story-metrics.ts` calcula essas fontes; `FlowPolicyInstallation.startedAt` identifica o início de cobertura. Períodos sem observação não são convertidos em zero. Uma História cancelada, reaberta e cancelada novamente no período produz duas ocorrências de cancelamento, uma História afetada e uma reabertura. Estoque atual e ocorrências históricas são medidas distintas.

Os novos indicadores de cancelamento/reabertura abrangem somente Histórias, por decisão do usuário. Outros itens mantêm auditoria e indicadores existentes. As seis Tarefas padrão não multiplicam a criação nem o cancelamento de Histórias e têm procedência `pipeline`, separada do conteúdo efetivamente proposto pelo agente. O indicador anterior de revisões de propostas de plano continua sendo outra medida.

Pausas e retomadas observadas de fila possuem eventos duráveis. O cálculo deve excluir apenas intervalos de pausa comprovados, sem inventar tempos de registros anteriores à instrumentação.

## 8. Auditoria, preservação e publicação futura

Todas as ações novas têm catálogo explícito e usam o recorder na transação da mutação. A auditoria pública guarda resultado/fase/decisão, autoria, correlação e referências anterior/nova revisão. Requisitos, plano técnico, resultados textuais, prompts e conteúdo dos agentes permanecem nas fontes controladas. Pedido de cancelamento e confirmação têm ocorrências diferentes; a integração executora e a pessoa iniciadora são identificadas separadamente.

As migrations `202610250001_story_specification` e `202610250002_lifecycle_contract` preparam fontes, permissões e constraints de forma aditiva. Não convertem registros de negócio nem reconstroem aprovações. `StorySpecificationRevision` e `TaskResultRevision` têm proteção contra alteração, exclusão e truncamento. O rascunho é mutável com versão otimista; não é uma revisão aplicada.

`normalize-item-states.ts --apply` continua sendo manutenção explícita, com operação administrativa correlacionada e `ITEM_STATE_POLICY_CHANGED` no recorder. A política v2 pode adequar Projeto/Épico legados aos ciclos de agrupador. A reversão é compensada, idempotente e recusa sobrescrever alterações posteriores. Nenhum desses comandos foi executado na instalação humana nesta entrega. GETs não criam Tarefas, revisões, resultados ou eventos de demonstração.

Para uma aplicação futura, conferir backup privado, imagens anteriores, migrações e permissões, ledger administrativo, adequação explícita dos registros afetados, contagens/digests preservados e saúde dos serviços. Publicação e normalização precisam de registro próprio; testes isolados não são autorização para alterar a instalação.

## 9. Validação e adoção desta revisão

O runner reproduzível `portal/scripts/validate-stabilization.py` reutiliza a infraestrutura de validação isolada, com nomes/ownership próprios, imagens locais preparadas e banco exclusivo `portal_test`. Os comandos `prepare`, `refresh`, `check`, `test`, `e2e`, `status` e `cleanup` não publicam o portal. A execução não utiliza a URL da instalação humana.

Exemplo a partir de `sdlc/portal`, no WSL com as imagens já preparadas:

```sh
python3 scripts/validate-stabilization.py prepare
python3 scripts/validate-stabilization.py check
python3 scripts/validate-stabilization.py test
python3 scripts/validate-stabilization.py e2e tests/e2e/stabilization.spec.ts tests/e2e/planning-lifecycle.spec.ts tests/e2e/story-task-planning.spec.ts tests/e2e/story-workspace.spec.ts tests/e2e/dashboard.spec.ts
python3 scripts/validate-stabilization.py status
python3 scripts/validate-stabilization.py cleanup
```

`refresh` atualiza apenas a cópia dos fontes nos recursos de teste. `test` interrompe os serviços do runner descartável antes de recriar o schema por suíte; não compartilhar esse banco com outra rodada simultânea. Aceita também basenames existentes para uma rodada direcionada. Os logs ficam em `test-results/stabilization-backend.log` e `stabilization-targeted.log`, fora do versionamento.

**Evidência final: 267 testes distintos de aplicação e 42 cenários distintos de navegador aprovados.** A rodada global teve 266 testes aprovados; o último caso acrescentado de troca de componente/bloqueio de escopo passou na suíte `pipeline-planning`, com seus oito casos. Esses oito não são somados novamente ao total. Permaneceram fora da rodada quatro integrações externas opt-in (`quality-live`, `merge-live` e dois casos `gitlab-live`). Tipos API/web, catálogo/guardas de auditoria, build de produção e `git diff --check` passaram.

O navegador cobriu `dashboard` (7), `planning-lifecycle` (7), `stabilization` (3), `story-task-planning` (6) e `story-workspace` (19). Na rodada conjunta, 41 passaram; o caso G1 passou após corrigir um seletor ambíguo do próprio teste e repeti-lo isoladamente. Os três casos de estabilização usam API/banco descartáveis reais, sem executar modelo ou provedor externo. Os demais exercitam os contratos visuais com APIs interceptadas. Foram conferidos recuperação idempotente após recarga, rascunhos, contexto histórico, resultado manual obrigatório, permissões, inatividade e navegação em desktop/celular. Isso não equivale a ensaio humano com tecnologias assistivas nem a integração real de provedores.

As regressões de banco incluem pausa/retomada, bloqueios da árvore, adoção legada, autoria/iniciador, cancelamento durante publicação, rollback/retentativa, `NO_CHANGE`, imutabilidade, paginação e separação entre escopo aprovado, título e resultado. Durante a validação, as duas migrations foram aplicadas apenas em `portal_test`; a aplicação local posterior está registrada na seção 11. Nenhum teste alterou aplicações produzidas pelo SDLC ou resultados reais de agentes.

Ao encerrar, os contêineres, volumes e redes descartáveis desta validação foram removidos após conferir propriedade/isolamento. Os logs locais de teste foram preservados; serviços e volumes da instalação humana não foram alterados.

| Recorte | Adoção no código | Evidência/pendência |
| --- | --- | --- |
| Ciclos e guardas | Política compartilhada e comandos de inatividade, encerramento, retomada e arquivamento | Regressão global, 11 casos de lifecycle e sete cenários visuais aprovados |
| Especificação e G1 | Rascunho, aplicação versionada, plano manual/agente e snapshot v3 | 16 casos de especificação e integração visual, incluindo resposta perdida e G1, aprovados |
| Tarefas e resultados | Seis padrões, uso da mesma Tarefa, adoção legada e resultado manual imutável | Oito casos de pipeline, ciclos/consulta e regressões visuais aprovados |
| Métricas | Origem, revisões aplicadas, cancelamentos e reaberturas de História | Quatro casos de História, regressão de métricas e sete cenários de dashboard aprovados |
| Instalação humana | Publicada em localhost:3310 mediante autorização | Duas migrations aditivas, backup validado e registros anteriores preservados; sem normalização ou demonstração |
| UX-C05–C07 | Permanecem parciais | A entrega não conclui consultas operacionais, lookups remanescentes nem validação assistiva completa |

## 10. Limites reservados à fase posterior

**Decisão posterior do usuário — 27/10/2026:** a [regra corrente](releases-promocao-2026-10-22.md#contrato-corrente-dev-candidatas-e-conclusão-em-produção--27102026) encerra a pendência sobre finalização: História só é concluída na entrada confirmada em PRD da candidata contendo sua revisão; Desenvolvimento Finalizado em DEV libera sua participação na passagem para QA, exigida para todas as Histórias da composição. O marco DEV → QA congela e constrói/versiona o pacote imutável. A exigência antiga de História já concluída para entrar em QA fica substituída por esse gate de desenvolvimento. Os trechos anteriores/inferiores que ainda registram a questão como pendente são históricos. Retirada em QA exige sucessora e revalidação desde DEV. [Plano e OK por entrega](plano-incremental-releases-ambientes-2026-10-27.md).

**Continuação documental — 27/10/2026:** a [consolidação de releases e ambientes](releases-promocao-2026-10-22.md#consolidação-de-domínio--27102026) registra DEV/QA/HML/PRD como destinos, QA como ambiente de testes e a separação entre composição, candidata, implantação e validação. DEV admite versões de trabalho; a partir de QA, a entrega usa candidata imutável. As próximas entregas até QA são recomendações, não executores concluídos. Naquela primeira discussão a finalização ainda estava pendente; a decisão posterior do usuário, registrada acima, encerrou a questão com Desenvolvimento Finalizado antes de QA e conclusão na entrada confirmada em PRD. Esta atualização não altera schema, dados ou publicações registradas neste documento.

Review, segurança, testes, merge, finalização com sucesso da História e promoção de releases terão sua revisão funcional própria. As integrações existentes conservam seus gates e evidências, recebendo apenas as guardas transversais necessárias ao contrato de disponibilidade.

Decisão registrada para releases: uma release não pode ser promovida se houver História não finalizada; finalizada inclui sucesso ou cancelamento. Essa condição é necessária e não transforma cancelamento em evidência de código aprovado. A futura definição deve esclarecer o conteúdo implantável de Histórias canceladas e o instante da conclusão com sucesso, evitando dependência circular entre finalizar e promover. Não há executor novo de ambiente nesta entrega.

## 11. Publicação local autorizada — 25/10/2026

Publicada em **http://localhost:3310**, incluindo a estabilização e a equiparação da Chave do Projeto à sigla do Sistema. API/web usam a imagem `sha256:570baeb361667a6f45811042bd39af8a5138c6a0859f3bf6634520deb7797969`, preparada sem rede a partir das dependências locais cujos manifests foram conferidos. Fonte/imagem e manifesto passaram na verificação de integridade do preparo.

Não havia trabalhos ativos ou em fila. Web/API foram pausados antes do backup; `portal.dump` teve permissões privadas, digest e legibilidade conferidos antes das migrations. Referência: `stabilization-20261025-d7edff7e-attempt-ba3d7ea6`, fora do repositório. Imagens anteriores e manifesto permanecem disponíveis para reversão das aplicações; não se executou restore nem normalização.

As migrations `202610250001_story_specification` e `202610250002_lifecycle_contract` foram aplicadas. Contagens/digests de todas as tabelas existentes foram comparados antes/depois e preservados, incluindo os **seis Itens e 16 eventos de auditoria**. As tabelas novas de rascunho, revisão e resultado permaneceram vazias; o único registro novo de instalação é o marco de cobertura `FlowPolicyInstallation`. Nenhum dado foi criado para demonstrar os fluxos.

Conferências finais: saúde `ready/preview` pelo host Windows e pela distro; API/web na imagem esperada; conta `sdlc_portal_app` sem UPDATE/TRUNCATE na auditoria; fontes novas de revisão/resultado com INSERT e sem UPDATE. GitLab, modelo local e scanner mantiveram prontidão. Registry/executor continuam sem configuração, conforme a instalação anterior. Consultas existentes de Sistema/Projeto/História foram verificadas sem mutações.

A validação de Chave do Projeto foi conferida no schema carregado pela API e no JavaScript servido: seis letras, conversão para maiúsculas e ausência da antiga instrução de 2 a 12 caracteres. Isso não afirma execução de agentes, publicação de aplicações de negócio ou conclusão das etapas posteriores à codificação.

Preparação e atualização foram registradas como `PORTAL_PUBLICATION` pelo recorder administrativo externo; a configuração de runtime está correlacionada à operação. A cadeia foi validada com 30 registros e nenhuma operação pendente. O backup e as evidências privadas de preservação continuam disponíveis.

## 12. Limpeza autorizada e validação com provedores reais — 25/10/2026

O usuário autorizou limpar a base de desenvolvimento sem backup. O alvo conferido foi exclusivamente `portal` em `sdlc-portal-foundation-db-1`. Web/API foram pausados; a operação transacional foi primeiro ensaiada com rollback e comparação integral dos registros. Na execução confirmada foram removidos **47 registros**, incluindo dados de negócio, filas, resultados e histórico dessa base. Não foi criado dump ou backup para a limpeza.

Schema, migrations, permissões de runtime e configurações de integração foram mantidos. Os triggers de proteção ficaram habilitados ao fim da transação. `AuditInstallation` recebeu uma nova época, `844dee0c-4979-4a7c-a767-1a4be23fc46f`, e `FlowPolicyInstallation` um novo marco de cobertura; são os únicos registros de configuração de instalação mantidos na base vazia. A trilha administrativa externa foi preservada, sem girar a época global do legado. O reset foi registrado como `PORTAL_DEVELOPMENT_RESET`, com épocas anterior/nova e contagem observada.

### Ensaio real e achados

O ensaio usou `portal_test`, a mesma API por injeção HTTP do Fastify, workers acionados pelo driver, **GitLab real e qwen3:14b real**. Não foram fabricadas respostas dos provedores. A base instalada não recebeu dados de teste. Os repositórios ficaram em namespaces exclusivos, identificados por recibos privados; os recursos preexistentes no GitLab permaneceram fora das mutações.

Foram exercitados:

- Provisionamento real de grupo/repositório neutro, proteção de `main`, seleção de componente e criação manual de História com suas seis Tarefas, sem início automático.
- Plano técnico manual e plano técnico produzido pela IA, G1 explícito, contexto do repositório, geração, validação sintática e publicação de commits/MRs em rascunho. As duas Histórias reutilizaram a Tarefa Codificação planejada; `main` permaneceu no commit original.
- Inatividade enquanto havia trabalho em fila, recusa de criação na árvore inativa, reativação sem retomada automática e retomada explícita preservando G1. Rascunho paralelo foi salvo, mas sua aplicação e a alteração direta de escopo durante a execução foram recusadas.
- Criação de uma terceira História por planejamento do agente real, aplicação idempotente, seis Tarefas sem duplicação, edição humana da especificação e preservação da origem `assistant`. A criação e a edição não iniciaram codificação.
- Cancelamento e reabertura de História já codificada: a Tarefa DONE, as tentativas e os artefatos ficaram preservados; as outras cinco Tarefas permaneceram canceladas, sem reabertura automática. Novas execuções usaram novo G1.

O ensaio encontrou dois pontos de orientação da geração. Primeiro, o modelo numerou casos de teste como se fossem critérios adicionais. A especificação inválida foi recusada antes de G1. O schema técnico agora limita `criterionIndex` aos critérios existentes e permite vários casos associados ao mesmo critério; o prompt explicita essa associação. A retentativa real passou a aguardar aprovação com referências válidas.

Segundo, testes gerados misturaram APIs de Jest com `node:test`, incluindo símbolos não importados e exports inexistentes. As funções passaram nas verificações independentes, mas os testes do agente falharam. A codificação agora recebe o contrato de testes do runtime, com imports válidos de `node:test` e export default de `node:assert/strict`. O agente gerou novas tentativas após novos G1; **não houve edição manual dos arquivos produzidos pelo agente para fazê-los passar**. Falhas, commits e tentativas anteriores foram preservados na evidência controlada.

As duas novas tentativas passaram tanto nos testes produzidos pelo agente quanto nas verificações independentes dos critérios. O código foi executado em contêineres separados, sem rede, credenciais, acesso ao banco ou ao Docker, com filesystem somente leitura e limites de memória/processos. O ensaio foi em Node; não afirma execução real de aplicações Python nesta rodada.

### Resultado, publicação e limites

**268 testes de regressão aprovados**, incluindo o novo caso de referências de critérios e a verificação do contrato de testes enviado à codificação. Tipos API/web, catálogo de auditoria, build de produção e diferenças passaram. Os quatro opt-in antigos não foram executados como suíte nesta rodada; os drivers reais acima validaram o recorte até coding, sem afirmar revisão funcional de qualidade/merge/deploy.

A evidência privada está em `/opt/agentic-sdlc/portal/validation/real-flow-3aa261c8d8f640e2`, incluindo tentativas, resultados e logs. As respostas de diagnóstico ficaram em fonte privada; conteúdos de agentes e credenciais não foram copiados para a auditoria pública. A exclusão remota foi inicialmente apenas agendada pelo GitLab. Os dois namespaces temporários foram depois removidos pelo serviço instalado do GitLab, com conferência estrita de ID/nome dos recursos criados pelo ensaio, e a remoção foi confirmada. Runner, credenciais copiadas, banco e rede descartáveis também foram removidos.

Os ajustes foram publicados em `localhost:3310`, imagem **`sha256:972481febd831e36f25db1998bcca88f685f6087c208f4fffa3bf482c3047d27`**, sem novas migrations ou backup de banco. A comparação antes/depois confirmou a base vazia e a manutenção de sua nova época. API/web estão saudáveis em `ready/preview`. A trilha externa foi validada com 56 registros e nenhuma operação pendente; limpeza, observação da validação, execução dos testes isolados e publicação possuem ações administrativas explícitas.

Essa execução auxiliar de testes valida o código produzido no ensaio; **não implementa o executor de Teste/Teste Final no produto**. Os gates e a revisão funcional posteriores à codificação, QA/HML/PRD e a validação assistiva completa continuam no escopo futuro já acordado. A validação técnica também não substitui o aceite humano da experiência completa.
