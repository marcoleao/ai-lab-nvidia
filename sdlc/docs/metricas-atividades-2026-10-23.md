# Métricas reais de atividades e Tarefas

O usuário aprovou todos os indicadores sugeridos nesta evolução: tempo em fila, processamento e espera humana; resolução de impedimentos por categoria; retomadas após falhas; Tarefas vinculadas às atividades de execução e reabertas por correção. A consulta utiliza as mesmas quatro semanas de calendário em São Paulo, incluindo a semana atual parcial, e os filtros por participação, Sistema e Projeto do dashboard.

## Fontes e unicidade

`WorkActivity` identifica uma atividade da História e sua Tarefa de processo. `WorkAttempt` identifica cada tentativa efetivamente solicitada, com autoria, fila e início confirmado. `WorkTaskLink` registra a associação atual explícita das Tarefas planejadas à atividade. O evento de histórico `WORK_TASKS_BOUND` preserva cada seleção confirmada, mesmo após desvincular ou vincular novamente. `WorkEvent` preserva os acontecimentos semânticos da tentativa.

O agregado utiliza essas fontes diretamente. A chave única `(attemptId, key)` identifica um acontecimento, independentemente de suas projeções no histórico da História ou da Tarefa. Uma repetição de transporte não é uma nova operação. O mesmo vínculo em mais de uma atividade não transforma uma Tarefa em duas.

Não são criadas amostras históricas a partir de `updatedAt`, da duração de uma consulta da interface, de heartbeats ou de publicações antigas. Esta coleta começa com a instrumentação real. A consulta não cria Tarefas nem corrige retroativamente seus estados.

## Definições

| Indicador | Fonte e cálculo | Unidade e atribuição semanal |
| --- | --- | --- |
| Fila | Soma de `queueMs` dos eventos `stage_started`; após o primeiro término, seu `payload.queueMs` agregado, sem duplicar os eventos de etapas | Mediana em segundos; semana do último início observado enquanto ativa, ou do primeiro término |
| Processamento | Primeiro evento terminal da tentativa com `payload.processingMs` válido | Mediana em segundos; semana desse término |
| Espera humana | `wait_resolved.payload.durationMs`, com `waitKind` igual a `waiting_input` ou `waiting_approval` | Mediana em segundos; semana da resolução |
| Resolução de impedimentos | `wait_resolved.payload.durationMs`, com `waitKind` igual a `blocked` ou `failed` | Mediana em segundos, também por categoria; semana da resolução |
| Retomadas após falhas | Eventos `wait_resolved` com `resumedAfterFailure: true` | Ocorrências; semana da resolução |
| Vinculação atual de Tarefas | Tarefas ativas distintas com vínculo direto de `WorkActivity.taskId` ou `WorkTaskLink`, divididas por todas as Tarefas ativas no recorte | Percentual e numerador/denominador do estoque atual |
| Primeira vinculação | Menor data observada no histórico `WORK_TASKS_BOUND` por Tarefa no recorte; criação do vínculo atual como fonte alternativa quando não existe evento original | Tarefas distintas; semana dessa data |
| Tarefas reabertas | IDs distintos em `reopened.payload.taskIds` | Tarefas distintas em cada semana e no período completo |
| Ocorrências de reabertura | Cada evento `reopened` e Tarefa distinta afetada nesse evento | Ocorrências por semana |

O processamento inclui o período aguardando a resposta do modelo ou da ferramenta externa. Soma as etapas ocupadas, excluindo filas entre contexto, geração e publicação, além da espera humana posterior ao primeiro término. A posterior aprovação de G1 pode mudar o estado final da mesma tentativa, mas não deve somar os dias de decisão humana ao processamento já observado.

A fila acumulada considera somente intervalos encerrados por um início de etapa confirmado; a fila ainda aberta não é completada pelo relógio da consulta. Em uma tentativa ativa, a soma é observada e parcial; no primeiro término, o agregado preservado é definitivo para aquela tentativa. Um registro da instrumentação anterior que só possua `queuedAt/startedAt` conserva somente esse primeiro intervalo efetivamente confirmado. Contar os inícios e também o total terminal duplicaria o tempo; o agregado escolhe uma fonte por tentativa.

Um ciclo que atravessa semanas entra inteiro na semana de sua resolução; o indicador não é uma distribuição de horas consumidas por semana. Esperas em aberto não são durações concluídas. Reabrir uma Tarefa em duas semanas conta uma em cada semana e uma no total de Tarefas distintas do período; por isso, esse total não é a soma das colunas.

O vínculo explícito pode existir antes de uma tentativa começar. Ele mede a cobertura de associação do trabalho a uma atividade de execução, e não comprova conclusão, execução bem-sucedida ou aprovação. A série de primeiras vinculações usa o primeiro registro persistido disponível em cada recorte. Desvincular reduz o estoque atual, mas não apaga a semana da primeira associação nem cria uma nova primeira associação ao vincular novamente. Sem evento ou vínculo original não há reconstrução anterior à instrumentação.

Sem amostras completas, as medianas retornam `null`, zero amostras e motivo de indisponibilidade. Sem Tarefas ativas, o percentual retorna `null`. Contagens de eventos observados podem ser zero. Categorias sem resolução no período não recebem durações fictícias nem metas presumidas.

## Categorias e filtros

As categorias iniciais do executor são acesso da integração (`integration_access`), indisponibilidade/tempo limite (`provider_unavailable`), alteração de revisão ou escopo (`changed_scope`), decisão do usuário (`user_decision`) e falha de execução (`execution_failure`). Achados de qualidade preservam a categoria emitida pelo executor. Ausência de categoria aparece explicitamente. Novas categorias persistidas continuam consultáveis sem serem reclassificadas por texto livre da mensagem.

Sistema e Projeto limitam a linhagem da História. Participação inclui ação humana na História, na Tarefa de processo, em uma Tarefa explicitamente vinculada ou autoria da tentativa. Essa associação não inclui outras Histórias, Projetos ou Sistemas. O filtro é de participação no trabalho e não de desempenho individual do autor de cada evento.

O estoque exclui Tarefas arquivadas; eventos históricos e durações não desaparecem por arquivamento. Os filtros refletem a linhagem e os vínculos persistidos no momento da consulta, sem reconstrução de propriedade ou composição histórica.

## Apresentação e validação

O dashboard oferece a seção **Atividades**, com três visões: Tempos, Impedimentos e Tarefas e retomadas. Cada mediana mostra a quantidade de amostras; quatro semanas e agregado do período ficam na mesma tabela. A definição das fontes permanece expansível e não aumenta o conteúdo inicial da página.

As regressões verificam fronteiras semanais de São Paulo, duração concluída versus espera aberta, correlação de acontecimentos, deduplicação, participação em Tarefa sem ampliar o escopo, categorias, vínculos e reaberturas distintos, ausência de amostras e exclusão de dados futuros/inválidos. Não alteram dados humanos para produzir indicadores.
