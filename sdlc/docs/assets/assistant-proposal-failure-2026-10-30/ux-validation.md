# Falha da nova geração na aba Proposta — 30/10/2026

O painel Proposta agora mantém visível a falha da geração mais recente, antes do editor ou do recibo da proposta anterior. A proposta já aplicada mantém sua identificação, seus IDs e seu recibo. O aviso usa o componente compartilhado de erro e o diagnóstico público da rodada; não incorpora `output` nem a candidata não validada.

O mesmo botão de gerar proposta permanece no fluxo, apresentado junto do impedimento. A ação “Revisar falha na conversa” abre a janela atual, removendo o cursor anterior e preservando o rascunho. Pedidos sem confirmação conservam a mesma persona, o corpo e a chave; a geração de outro pedido fica impedida. Permissões, perguntas abertas, contexto inativo e consulta sem atualização continuam limitando a ação.

A correlação exige rodada corrente `kind=plan`, `status=failed`, sem atividade em andamento. Se houver proposta atual, o pedido deve ter outro `turnId` e `createdAt` estritamente posterior ao `createdAt` da proposta. A atualização tardia de uma tentativa antiga não substitui uma proposta mais nova. A data da proposta histórica consultada não determina o impedimento corrente. O tipo de interface passou a reconhecer `Proposal.turnId`, já fornecido pela API.

Validação isolada pelo controlador de regressão:

- Catálogo: `20261030T223925Z-75abff`, 582 casos em 54 arquivos.
- Interface: `20261030T223950Z-2f9ea8`, `assistant-plan-review.spec.ts`, 15/15 casos aprovados; sem skipped, flaky ou errors; `sourceStable=true`.
- Três casos novos: RUNNING → failed em 1440 e 390 px, manutenção da proposta aplicada, ausência da candidata privada no painel, abertura por teclado da conversa atual com rascunho preservado e confirmação idempotente após resposta perdida; cronologia do pedido, proposta histórica independente, mesmo `turnId`, perguntas impeditivas e falha de chat sem classificação como geração de proposta.
- Inspeção visual da captura de 390 px: diagnóstico e controles legíveis, sem rolagem horizontal; recibo do plano aplicado permanece separado abaixo do aviso.
- [Captura desktop](assistant-failed-new-proposal-1440.png), [captura celular](assistant-failed-new-proposal-390.png) e [recibo da execução](summary.json).

Arquivos de produto: `apps/web/app/assistant.tsx` e tipo `Proposal` de `apps/web/app/assistant-plan.tsx`. Testes em `tests/e2e/assistant-plan-review.spec.ts`, registrados em `tests/regression/cases.json`. Não há nova página, comando, API, métrica ou mudança em conteúdo persistido.

Limite explícito: o DTO corrente expõe `latestTurn` de qualquer tipo, e não a última geração de proposta separadamente. Depois de uma rodada posterior de conversa, o aviso não reconstrói falhas antigas a partir do histórico paginado; elas continuam na conversa. Se as datas não demonstram que o pedido veio depois da proposta atual, o painel não apresenta esse aviso de nova geração sobre a proposta. Estes testes usam respostas controladas no ambiente isolado e não comprovam publicação real, qualidade do modelo ou entrega em DEV. A aceitação real permanece separada.
