# Métricas de releases no dashboard

**RA-04a publicada:** estoque corrente e idade de trabalho aberto usam OPEN/CLOSED/CANCELED, com rótulos por estado em filtros e indicadores. DEV inicial é metadado de fluxo, sem contagem de implantação. Fórmulas de duração final/retrabalho continuam sem medição onde os eventos/executores ainda não existem. Cópia e cancelamento operacional permanecem pendentes; cancelamento posterior a PRD não deverá apagar fatos de produção. [Contrato](releases-promocao-2026-10-22.md#ciclo-da-release-open-closed-e-canceled) e [recibo](plano-incremental-releases-ambientes-2026-10-27.md#14-recibo-ra-04a--estados-da-release-e-dev-inicial).

**Atualização RA-02-C1:** contagem corrente de releases usa somente situação da composição DRAFT/FROZEN/CANCELLED. DEV/QA/HML/PRD são ambientes do Sistema e não categorias desse estoque. Cadastro de referência não conta como implantação; candidata, validação e métricas de deploy continuam dependendo de suas fontes futuras. Exemplos anteriores de contagem por QA/HML/produção são históricos. [Evidência e limites](plano-incremental-releases-ambientes-2026-10-27.md#11-correção-ra-02-c1--releases-e-fase-da-história).

**Atualização do ciclo — 27/10/2026:** pelo [contrato corrente](releases-promocao-2026-10-22.md#contrato-corrente-dev-candidatas-e-conclusão-em-produção--27102026), Desenvolvimento Finalizado e conclusão em PRD são marcos distintos, e a candidata nasce no marco DEV → QA. Retirada/recomposição gera sucessora sem apagar a anterior. Instrumentar cada novo produtor na entrega correspondente; a harmonização dos indicadores está em RA-27 do [plano incremental](plano-incremental-releases-ambientes-2026-10-27.md). As métricas atuais não foram alteradas por documentar essas fontes e nenhuma nova fórmula/meta está implicitamente aprovada.

**Nota de domínio — 27/10/2026:** a [consolidação de releases e ambientes](releases-promocao-2026-10-22.md#consolidação-de-domínio--27102026) define DEV/QA/HML/PRD como ambientes, separados dos estados de composição, implantação e validação. Indicadores atuais baseados em `ReleaseStage` são legados e ainda não foram migrados; seus valores não comprovam implantação ou aprovação em ambiente. A evolução deverá definir população e unidade (release, candidata, implantação ou validação), preservar histórico/cobertura e evitar contar cada História ou ambiente como nova release. Esta nota não altera fórmulas, metas, dados ou gráficos publicados.

O usuário aprovou todas as sugestões: quantidade por etapa, tempo em composição e ciclos de retrabalho por rejeição. Elas integram a Visão Geral, sob os mesmos filtros de participação, Sistema e Projeto.

## Definições e fontes

| Indicador | Definição | Fonte e disponibilidade |
|---|---|---|
| Quantidade por etapa e total | Contagem de releases existentes em DRAFT, QA, HML, PRODUCTION e REJECTED, uma vez por release, no instante da consulta | `Release.stage`, excluindo Sistemas arquivados do estoque atual. DRAFT vazio é contado. Não comprova execução de QA ou implantação |
| Idade em composição | Horas corridas entre `Release.createdAt` e a consulta, somente para releases ainda em DRAFT | Mediana, maior idade, número de amostras e faixas de idade. Inclui espera e fins de semana; sem amostras resulta em indisponível |
| Criações semanais | Quantidade de releases criadas em cada uma das quatro semanas | `Release.createdAt`, preservando o histórico de Sistemas posteriormente arquivados; não é uma série histórica de ocupação das etapas |
| Duração da composição concluída | Intervalo entre abertura da composição e seu fechamento com identidade/manifesto de candidata | Sem medição até integrar os eventos reais de abertura e fechamento; não confundir com a idade dos DRAFTs abertos |
| Ciclos após rejeição | Nova composição necessária devido à rejeição de uma candidata | Categorias de origem QA e homologação; sem medição até integrar rejeição e criação da nova composição |

As quatro semanas são as mesmas do dashboard: segunda-feira a segunda-feira, fuso `America/Sao_Paulo`, intervalos `[início, fim)` e semana atual parcial. Registros com criação posterior ao instante da consulta não entram no cálculo. Faixas de idade: menos de 7 dias; 7 a menos de 15; 15 a menos de 30; 30 ou mais. Cada dia tem 24 horas. Medianas não são somadas entre semanas.

Zero é uma contagem observada sem registros. Ausência de integração ou de amostras não vira zero. Alterar, retirar ou transferir Histórias em um DRAFT não constitui, por si só, rejeição ou retrabalho.

## Recorte e participação

- Sistema restringe as releases que pertencem a ele.
- Projeto restringe releases com pelo menos uma História atualmente associada ao Projeto. A mesma release conta uma vez mesmo contendo várias Histórias desse Projeto; um rascunho vazio fica fora desse recorte.
- Usuário significa autoria, ação humana explicitamente correlacionada à release ou participação humana em uma História atualmente associada. Ações genéricas no Sistema ou no Projeto não incluem todas as releases.
- Os filtros se cruzam na entidade release. Participação na release não equivale a responsabilidade nominal pelo Projeto.
- As criações históricas usam o recorte de associação/participação atual; não reconstroem a composição que existia em cada semana. A nota é exibida no dashboard.

Os dados são consultados dentro da mesma transação de leitura consistente dos demais indicadores. A seção não realiza uma busca separada sem filtros e desaparece durante a mudança de recorte, evitando exibir números do filtro anterior.

## Instrumentação exigida na retomada do pipeline

Ao implementar os fluxos de candidata e rejeição, registrar eventos duráveis e correlacionados na mesma transação da transição local. A coleta de duração exige composição/candidata, instante de abertura e instante de fechamento. Fechamento parcial precisa identificar cada composição fechada, sem atribuir uma duração de conclusão ao DRAFT que permaneceu aberto.

Cada ciclo de rejeição deverá ter identidade própria, origem QA/HML, candidata rejeitada, nova composição e instante de abertura do retrabalho. Contar uma vez por ciclo, deduplicando retries de transporte, replays de idempotência, múltiplos achados e mensagens da mesma decisão. Nova rejeição de outra candidata pode abrir outro ciclo. Atribuir o ciclo à semana de abertura; conservar as decisões e pacotes anteriores.

A ausência desses fluxos na versão atual é apresentada explicitamente. Não há botão para fabricar medições, transições de etapa ou dados de demonstração. Metas e limites não foram inventados.

## Validação

Typecheck e build de produção passaram. No ambiente isolado, passaram 48 testes de regras/cálculos e 21 jornadas de navegador, incluindo sete testes novos das métricas e quatro jornadas novas. A validação cobre dados persistidos, release vazia, ausência de amostras, filtros combinados, semanas e apresentação em desktop e celular. Dezesseis testes opcionais de integração não foram executados nesta rodada.

A revisão de User Experience não identificou bloqueios. Os testes criaram dados somente no banco descartável; o preview humano foi consultado apenas para verificar a publicação.

Publicado no portal local em `http://localhost:3310/#dashboard-releases`. A imagem preparada corresponde ao código validado. A verificação posterior confirmou HTTP 200, API saudável, GitLab e IA disponíveis e as mesmas contagens de itens, histórico, repositórios, conversas, execuções e releases registradas antes da atualização.


**Totalizadores na lista de Releases, solicitados pelo usuário:** contagem corrente por flowEnvironment DEV/QA/HML/PRD mais Sem ambiente registrado, unidade release única. Considera Sistema/busca/estado aplicados, todos os resultados antes da paginação e Sistemas não arquivados. CANCELED conta no último ambiente registrado quando incluída no recorte. Fonte Release, snapshot transacional RepeatableRead, sem janela histórica, taxa/meta ou inferência de deploy. Zero só após consulta confirmada; erro/carga usa —. A faceta de estados preserva a regra anterior de ignorar seu próprio filtro e explicita a diferença. Somente a lista foi adaptada; Visão Geral e fórmulas existentes permanecem no escopo anterior. [Evidência e limites](plano-incremental-releases-ambientes-2026-10-27.md#15-releases--quadros-finais-e-totalizadores-por-ambiente).

**RA-04b:** cancelamento real atualiza o estoque CANCELED mantendo a release no último flowEnvironment registrado. canceledAt e RELEASE_CANCELLED/SUCCEEDED preservam a ocorrência nova; replay e NO_CHANGE não são novos cancelamentos. Não há nova fórmula, meta ou gráfico de taxa/duração nesta fatia; datas ausentes do legado não viram zero. Instalações e conclusões históricas em PRD permanecem nas fontes anteriores. [Cobertura e roteiro](plano-incremental-releases-ambientes-2026-10-27.md#16-recibo-ra-04b--cancelamento-auditado-da-release).


## Preparação de branches — RA-07, aprovação de 28/10/2026

Usuário aprovou incluir os três indicadores na Visão Geral **sem metas por enquanto**. Fonte nova ReleaseBranchPreparation; createdAt registra o aceite único, confirmedAt é gravado na primeira confirmação bem-sucedida junto ao recorder. Retentativas de transporte/reconciliação/worker não geram outra preparação. Nova intenção explícita após impedimento é outra operação numerada.

| Indicador | Unidade, janela e fórmula |
| --- | --- |
| Preparações solicitadas | Operações únicas criadas nas quatro semanas do dashboard; createdAt em [início, fim), até a consulta |
| Mediana até confirmação | Horas corridas confirmedAt−createdAt, somente sucessos com referência/proteção confirmadas; amostras pela semana da confirmação. Inclui fila/espera/recuperação. Mediana do período sobre todas as amostras, sem somar medianas semanais |
| Resultados ainda não confirmados | Estoque atual UNKNOWN, inclusive consultas reconciliadoras queued/running. Exclui fila comum, bloqueios observados e sucesso; Sistemas arquivados fora do estoque |

Datas em America/Sao_Paulo, quatro intervalos existentes e semana atual parcial. Pedidos e confirmações históricos preservam Sistemas hoje arquivados. Filtros de Sistema/Projeto/participação se cruzam na release como no painel anterior; usam composição/participação atuais, sem reconstruir antigos vínculos e sem restringir só ao executor. Cobertura desde a operação nova; branches externas/antigas não são amostras inferidas. Sem amostras de duração = Sem medição; contagem zero somente em leitura confirmada. Nenhuma meta, taxa de implantação, DORA ou rejeição de QA é inferida. Visão usa releaseView=branches e preserva os demais parâmetros. [Recibo/cobertura](plano-incremental-releases-ambientes-2026-10-27.md#24-recibo-ra-07--preparação-controlada-da-branch).


**RA-08a — decisão de métricas, 28/10/2026:** usuário escolheu manter os indicadores existentes nesta fatia do Gateway de Especificação. Nenhuma contagem específica de destinos confirmados ou recusas por mudança de base foi criada; fila, espera humana e retrabalho existentes preservados, sem novas fórmulas ou metas. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#25-recibo-ra-08a--destino-explícito-no-gateway-de-especificação).


**RA-08b — métricas, 28/10/2026:** usuário escolheu manter indicadores existentes nesta fatia de novos ciclos de desenvolvimento. Preservados fila, espera e retrabalho; sem contagem específica após testing/merge, metas, fórmulas ou novos painéis. Replay mantém a mesma operação. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#26-recibo-ra-08b--novo-ciclo-de-desenvolvimento).


**RA-09a — decisão de métricas, 28/10/2026:** usuário manteve indicadores existentes de integração/fila/retrabalho nesta fatia de rastreabilidade. Sem contagem nova de referências completas/pendentes, meta, fórmula ou painel. Campos seguros e registro transacional não geram outro merge para replay/consulta. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#27-recibo-ra-09a--referência-preservada-da-integração).


**RA-09b — decisão de métricas, 28/10/2026:** usuário manteve indicadores existentes nesta fatia de captura histórica. Sem contagem nova de capturas, fórmula, meta ou painel. Captura humana é observação separada e não gera MERGE_COMPLETED; replay não conta outro evento. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#28-recibo-ra-09b--captura-histórica-controlada).


**RA-09c — decisão de métricas, 28/10/2026:** usuário manteve indicadores existentes nesta fatia. Confirmação histórica é observação própria, sem MERGE_COMPLETED ou contagem nova. Replay não duplica ocorrência; métricas anteriores de integração/fila/retrabalho permanecem. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#29-recibo-ra-09c--confirmação-histórica-posterior).


**RA-09d — decisão de métricas, 28/10/2026:** usuário manteve indicadores existentes nesta fatia. Não cria contagem de encerramentos, fórmula ou meta. Encerramento local usa MERGE_HISTORY_CLOSED, sem MERGE_COMPLETED/conclusão; replay não duplica decisão e eventos anteriores permanecem. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#30-recibo-ra-09d--encerramento-do-acompanhamento-histórico).


**RA-09e — decisão de métricas, 28/10/2026:** usuário manteve indicadores existentes. Sem contagem/painel/fórmula/meta de fechamento histórico. Fechar MR/consultar/replay não gera MERGE_COMPLETED ou conclusão; estados operacionais não equivalem a novas métricas da Visão Geral. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#31-recibo-ra-09e--fechamento-remoto-do-mr-anterior).


**RA-09f — decisão de métricas, 29/10/2026:** usuário escolheu manter os indicadores existentes. Rastreabilidade da composição é leitura das fontes preservadas; não há contagem/painel/fórmula/meta nova, nem inferência de prontidão/integração a partir da ausência de dados. Integração, fila e retrabalho preservam os contratos existentes. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#32-recibo-ra-09f--rastreabilidade-do-código-na-composição).


**RA-10a — decisão de métricas, 29/10/2026:** usuário escolheu manter os indicadores existentes. Consulta/estrutura/entradas de contrato não geram contagem/painel/fórmula/meta nova nem evidência de build, teste, migração ou implantação. Ausência de informação não é sucesso/falha de execução. [Recibo](plano-incremental-releases-ambientes-2026-10-27.md#33-recibo-ra-10a--consulta-do-contrato-de-execução).
