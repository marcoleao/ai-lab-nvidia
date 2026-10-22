# Visão Geral e métricas do SDLC

Solicitação de 22/10/2026 dentro da revisão de interface. A pausa do restante do backlog permanece; o dashboard e sua instrumentação foram explicitamente solicitados. `/` apresenta a Visão Geral e `/systems` mantém a navegação atual dos Sistemas.

`GET /api/metrics/dashboard` retorna uma fotografia consistente do banco, sem criar itens ou executar agentes. Contém inventário completo, sem o limite de 500 itens da listagem de navegação: Sistemas, Projetos, Épicos, Histórias e Tarefas, com total e contagem de cada status, inclusive zeros. Arquivados são contabilizados separadamente. Projetos mantêm aprovação e ciclo de vida como dimensões distintas.

## Definições adotadas

### Filtros do dashboard

Usuário, Sistema e Projeto podem ser combinados por interseção na mesma consulta. A seleção de Projeto limita aos seus descendentes e a de Sistema limita ao respectivo Sistema e descendentes. Por definição do usuário, o campo Projeto permanece desabilitado até escolher um Sistema e lista somente os Projetos pertencentes a ele. Trocar ou limpar o Sistema limpa o Projeto selecionado. Projetos de outro Sistema são rejeitados pelo backend. As opções de Sistemas e usuários continuam globais, incluindo arquivados identificados, para permitir mudança de recorte e consulta histórica.

Na ausência de campo de responsável no domínio, o filtro de usuário adota **participação humana registrada**: itens em cujo histórico aquele usuário realizou alguma ação, em qualquer data. Resultados dos agentes nesses itens também entram nos indicadores, para medir o processo associado ao trabalho. Isso não atribui todos os resultados à produtividade individual nem equivale a proprietário ou responsável. O usuário confirmou explicitamente em 22/10/2026: participação em itens e processos nos quais realizou ações. Esta é a regra definitiva deste filtro.

Ancestrais dos itens do recorte entram no inventário para indicar o Sistema/Projeto/Épico de contexto, mas seus outros eventos e outros descendentes não ampliam o escopo da medição. Recorte sem participação não recebe os totais globais como substituto. Não há relação de autorização ou mudança automática da persona selecionada ao filtrar usuários.

Os filtros aplicados ficam na query da página (`userId`, `systemId`, `projectId`), sobrevivem à recarga e à navegação de voltar/avançar. O formulário permite alterar e aplicar ou limpar o recorte. Durante nova consulta, os dados do recorte anterior ficam ocultos e respostas canceladas/atrasadas não substituem o resultado atual. Todos os blocos, incluindo as quatro semanas e as categorias de retrabalho, seguem o mesmo recorte.

Validação dos filtros: 41 testes de API/cálculo passaram em banco descartável, incluindo interseção, resultados de agentes no trabalho selecionado, opções globais preservadas e rejeição de combinação inválida. Oito testes Chromium passaram, incluindo filtros, estado vazio, query/reload/voltar/avançar e resposta atrasada de outro recorte. Compilação de produção aprovada e apresentação revisada por UX em desktop e celular.

### Janelas e indicadores

- Quatro semanas de calendário, segunda-feira 00h até segunda-feira 00h em `America/Sao_Paulo`, incluindo semana atual parcial. Comparar a semana parcial com cautela. Limites de eventos são inclusivos no início e exclusivos no fim; não há projeção ou preenchimento com dados sintéticos.
- Aprovações: eventos `PLANNING_APPROVED` e `GATE_APPROVED`. Decisões sobre impedimentos não são contadas como gates.
- Loops: ocorrências de `EXECUTION_RETRIED`, `PATCH_VALIDATION_REJECTED` e `EXECUTION_DECISION_CONFIRMED`. Mede retrabalho/retomadas observados; não ciclos de conversa inferidos pelo texto, nem número de execuções únicas. Uma execução pode contribuir mais de uma vez.
- Contagem de execuções solicitadas, mensagens humanas sobre impedimentos, publicações de MR, falhas registradas e transições de conclusão por semana. Conclusões contam transições, incluindo nova conclusão após reabertura, não estoque de itens concluídos.
- Tempo até MR: mediana da duração entre início da execução e evento de publicação, incluindo esperas e conversas, agrupada na semana da publicação. Não é a métrica DORA de lead time.
- Duração de processamento de etapas: mediana das durações registradas nos eventos de sucesso, bloqueio, validação ou falha, sem incluir espera na fila. Conversa sobre impedimento também registra duração.
- Idade dos Projetos, Épicos e Histórias abertos: desde criação, em dias corridos de 24 horas; faixas sem sobreposição `[0,7)`, `[7,15)`, `[15,30)`, `[30,infinito)`. Um mês corresponde a 30 dias. Arquivados, Projetos COMPLETED/CANCELLED, Épicos DONE e Histórias COMPLETED ficam fora. Uma reabertura mantém idade desde criação.
- O usuário esclareceu “SLOPs” como falhas que exigem refazer a rotina, incluindo ciclos entre codificação/testes e especificação/esclarecimento. O nome adotado é **Retrabalho e ciclos de correção**, separado por categoria e nas quatro semanas. Categorias observáveis: recusa técnica de patch, retomada explícita, decisão que reinicia especificação e esclarecimentos humanos adicionais sobre impedimentos. As categorias de correções solicitadas por testes e revisão ficam indisponíveis até integrar esses processos. Mensagens posteriores à primeira por execução contam como esforço adicional; a primeira é identificada no histórico completo, inclusive antes da janela. Isso não classifica automaticamente uma entrevista normal como falha. O total agrega ocorrências, não rotinas únicas ou taxa de sucesso de primeira tentativa. Uma mesma rotina pode acumular recusas, retomadas e esclarecimentos.

## Instrumentação existente e cobertura

O histórico transacional já registra criação, status, aprovação, decisões, retomadas, validação e publicação. Esta entrega acrescenta `metricsVersion`, duração de processamento e correlação de execução/etapa aos resultados de etapas, além de eventos transacionais de falha e expiração de concessão, e falha de provisionamento de repositório. Eventos de falha gravam códigos, sem texto bruto de erro. Repetições idempotentes das solicitações continuam reutilizando os eventos existentes.

Dados históricos são calculados a partir dos registros preservados. Não se reconstroem timestamps de falhas não registradas, nem durações antigas a partir de `updatedAt`. A tela informa que a cobertura de falhas/durações foi ampliada nesta versão. Nenhuma chamada ao modelo ou implantação é necessária para abrir a Visão Geral.

## DORA e próxima integração

A [referência oficial DORA](https://dora.dev/guides/dora-metrics/) define cinco métricas: Deployment frequency, Change lead time, Failed deployment recovery time, Change fail rate e Deployment rework rate. Todas aparecem no dashboard, com comparação semanal e indicação explícita de coleta ainda não integrada. O fluxo atual termina em MR; marcar status PRODUCTION ou publicar MR não cria amostra DORA.

Para completar os valores ao implementar o executor/deploy e incidentes no backlog preservado, registrar eventos duráveis e deduplicados com ID da fonte, Sistema/repositório/serviço, ambiente, deployment ID, commit(s), instante do commit, início e fim do deploy, resultado, incidente/deploy causador, instante da falha e da recuperação e se a implantação é remediação não planejada. Especificar cobertura da fonte, observação tardia e atualização de incidências sem duplicar deploys.

Deployment frequency contará deploys de produção bem-sucedidos por semana. Change lead time usará commits efetivamente entregues e sua primeira disponibilização, com mediana. Failed deployment recovery time usará incidentes de deploy encerrados na semana, com mediana. Change fail rate dividirá deploys causadores de degradação pelo total de deploys de produção observados na janela. Deployment rework rate dividirá deploys de remediação não planejada pelo total de deploys de produção observados. As taxas serão indisponíveis sem denominador; cada indicador exibirá amostras e cobertura. A avaliação por repositório/serviço deve acompanhar o agregado geral para não esconder contextos distintos. Essas integrações continuam pendentes junto aos respectivos processos, e não representam etapas já executadas.

## Regra para evolução

Conforme incorporado à [arquitetura](../portal/docs/ARCHITECTURE.md), toda nova funcionalidade exige explorar métricas, sugeri-las e questionar o usuário, registrar definições/metas e implementar a instrumentação aprovada com a entrega. Alterações de definição precisam ser versionadas e apontar o início de cobertura.

## Verificações desta entrega

40 testes automatizados passaram com PostgreSQL descartável, cobrindo banco vazio, soma de status, idade nos limites de 7/15/30 dias, virada da semana em São Paulo, conversas iniciadas antes da janela e evento transacional de falha. Dois testes opcionais de GitLab ao vivo foram omitidos; o transporte GitLab não foi alterado.

Seis testes Chromium passaram: dashboard, erro/recuperação dos indicadores, hierarquia, conversa, execução e retomada técnica. O dashboard foi verificado em 1440, 768 e 390 pixels, com revisão de UX, regiões de tabela navegáveis pelo teclado e rolagem indicada no celular. TypeScript e compilação de produção do Next.js passaram. Fixtures e testes ficaram no banco descartável, sem criação de demos no ambiente do usuário.

Atualização disponibilizada em `http://localhost:3310`, com backup e comparação integral dos registros antes/depois, sem alteração de dados de negócio. Health retornou `ready`; consulta real confirmou quatro semanas, seis categorias de retrabalho e cinco indicadores DORA ainda sem coleta. Nenhuma execução de usuário foi iniciada pela atualização.
