# Aprovação humana da História em DEV — política v2

A decisão do usuário em 01/11/2026 substitui a aprovação manual por critério por uma aprovação global da História. Critérios são referência para avaliação humana, sem marcações obrigatórias, contagem mínima ou limite adicional no comando de aprovação. A observação é opcional.

A pessoa abre **Aprovar História em DEV**, confere a aplicação e escolhe **Confirmar aprovação da História em DEV**. Um único comando registra a decisão humana, Desenvolvimento Finalizado e a conclusão da Tarefa Teste em DEV na mesma transação. Não existe segunda confirmação de Desenvolvimento Finalizado nesse percurso. A História permanece aberta até produção; a continuidade é a consulta da release planejada.

**Solicitar ajustes** registra uma decisão negativa e mantém a Tarefa pendente. Não inicia agentes nem correção automaticamente; o retorno à Execução permite avaliar o ciclo de correção existente, com sua própria confirmação. Não muda critérios, conteúdo da História, aplicações geradas ou resultados dos agentes.

## Contrato e rastreabilidade

- Rota existente `/stories/:id/execution/dev/acceptance`, agora com decisão global. `/dev/approval` consulta condições e fontes históricas e recupera pedidos anteriores; novas decisões seguem a rota global.
- `POST /api/items/:id/development-manual-acceptance` recebe `decision: approved|rejected`, nota opcional, confirmação explícita, versão, último registro e token de contexto. Não aceita resultados por critério no novo contrato.
- `DevelopmentManualAcceptance.scope=story`, política `dev-manual-story-acceptance-v2`, `results=[]`. O snapshot dos critérios é referência histórica; não se fabrica cobertura, resultados individuais ou aprovação automática dos critérios.
- Especificação/G1, execução, integração, Code Review, segurança, artefato, publicação saudável/ativa, papel, hierarquia e trabalhos pendentes continuam conferidos. O contexto é revalidado na transação após observação remota.
- Autor, data e referências imutáveis da revisão/implantação ficam nas fontes controladas. Aprovações globais referenciam a fonte humana exata; a vigência continua sendo calculada independentemente da página de histórico.
- Resultado incerto conserva corpo, chave e persona originais. O replay de uma resposta legada já recebida também precede a validação do novo payload; não concede outro aceite.
- Nova confirmação positiva de versão já aprovada é recusada; uma nova decisão negativa pode retirar sua vigência, preservando o histórico. Um novo ciclo ou reprovação posterior mantém os controles existentes.
- A Tarefa consulta a vigência de Desenvolvimento Finalizado; um registro humano isolado ou aceite legado por critérios não é apresentado como aprovação vigente da História.

## Auditoria e migração

Catálogo explícito: `MANUAL_DEV_STORY_APPROVED` (decisão APPROVED) e `MANUAL_DEV_STORY_REJECTED` (REJECTED), ambos SUCCEEDED/COMPLETED. `MANUAL_DEV_ACCEPTANCE_TASK_UPDATED` mantém NOT_APPLICABLE e antes/depois de estado, versão e referência. Na aprovação positiva, `STORY_DEVELOPMENT_APPROVED` usa o mesmo operationId da decisão humana. Todos usam o recorder compartilhado, autoria humana, correlação e projeção segura. Notas e critérios não são copiados ao ledger público.

A migração `202611010002_human_story_acceptance` acrescenta escopo e preserva registros v1 como `criteria`, com política/validações anteriores e imutabilidade. A migração v1 não é reescrita. Rollback vazio é testado; rollback com decisões globais é recusado para não perder dados. Falha em qualquer recorder desfaz decisão humana, aprovação final, Tarefa e chave de idempotência; a repetição exata pode concluir depois.

## Adoção e limites

Esta fatia substitui o aceite humano v1 nas páginas de execução da História, Tarefa Teste em DEV, resumo compartilhado e HELP. O [contrato v1](aceitacao-manual-dev-v1.md) permanece como registro histórico, superado para novas decisões humanas. SH-01 e a dimensão das fontes DEV de SH-05 passam a usar decisão global e vigência; SH-02–SH-04, inventário paginado de decisões humanas, validação assistiva integral e publicação de candidata imutável em QA continuam pendentes. Não declara migração de outras telas ou produção de QA.

## Validação e publicação — 01/11/2026

Publicado localmente às 14:41 (São Paulo), imagem `sha256:ee582f713090a895ef9ec191c1460e320dd15bb0c648f946baff583624605477`, fonte `ff21af654c5a4746c4d8193732d2d2cc6bacdcf36bd2e56a098197b965fa418c`. Migração v2 aplicada (45 migrações), backup validado e conteúdo das 50 tabelas existentes preservado na projeção documentada. Somente a coluna aditiva de escopo dos registros legados e metadados de polling/lease usam normalização explícita; decisões e suas referências permanecem na comparação. [Recibo de publicação](assets/aprovacao-humana-historia-dev-2026-11-01/publication.json).

Backend: **94/94** em quatro arquivos. Navegador: **77 cenários distintos validados** pela união da rodada ampliada (76/77, com expectativa incorreta de helper em pedido pendente) e revalidação final (25/25, dois arquivos, após corrigir a expectativa e os rótulos/estado não confirmado). Não é uma rodada única 77/77 ou regressão integral. Catálogo atual: 651 casos/60 arquivos; cenários da decisão anterior foram adaptados à consulta sem uma segunda aprovação. Tipos da API/web e build de produção passaram. [Cobertura e limites](assets/aprovacao-humana-historia-dev-2026-11-01/validation.json).

Conferência real somente leitura em 1440/390: hub sem campos, ação global disponível sem respostas por critério, observação opcional, consulta anterior sem confirmação própria, Tarefa com vigência e retorno direto. Cinco verificações de tela, sem escrita operacional ou erro de página; largura do documento igual ao viewport. A História operacional permanece TESTING e sua Tarefa DOING, aguardando a decisão do usuário; nenhuma aprovação foi fabricada. [Evidência real](assets/aprovacao-humana-historia-dev-2026-11-01/story-approval-live-checks.json), [desktop](assets/aprovacao-humana-historia-dev-2026-11-01/story-approval-live-desktop.png), [celular](assets/aprovacao-humana-historia-dev-2026-11-01/story-approval-live-mobile.png).


## Campo próprio para solicitar ajustes — 01/11/2026

Ao clicar **Solicitar ajustes**, a pessoa preenche **Descreva os ajustes necessários** no painel aberto e usa **Confirmar solicitação de ajustes**. A descrição é obrigatória nessa interface, sem mínimo arbitrário; campo vazio ou só com espaços mostra erro associado e recebe foco. O limite de 2000 caracteres é o já existente em `notes`. A aprovação continua com observação opcional.

O painel substitui temporariamente os controles de aprovação para evitar intenções concorrentes. Ao abrir, o campo recebe foco; **Voltar à decisão** preserva o texto e devolve o foco à ação de origem. Rascunhos de aprovação e ajustes são separados, persistem por História/versão e não são transferidos automaticamente para uma nova implantação. Na rejeição, somente a descrição de ajustes é enviada em `notes`, com corpo/chave/persona preservados na recuperação. Nenhuma correção é iniciada automaticamente; se havia aprovação vigente, a decisão negativa retira sua vigência.

Esta mudança é de apresentação e validação do formulário. Reutiliza a decisão `rejected` e `MANUAL_DEV_STORY_REJECTED`, sem nova API, migração, evento, worker ou indicador. A descrição permanece na fonte controlada; o ledger público conserva somente suas referências. O contrato da API e os registros anteriores ficam preservados, inclusive decisões negativas antigas sem descrição. Adoção limitada à página de aprovação da História e sua orientação no HELP; demais motivos/formulários não são declarados migrados.

Complemento publicado somente no web em 01/11/2026 às 14:55 (São Paulo), com a mesma imagem e o mesmo container da API retomados após a pausa da comparação. Imagem web `sha256:6f2a99380d2465bd3e25ae98c27c40b06bd1cb1842f66efbb6c130e59d91ea88`, fonte `47a1df8333694d80b5bddb4e0f29c504021c31fe0cd7ca026ad5b04b8e82bf5a`; nenhuma migração nova. Backup validado e conteúdo de negócio das 50 tabelas preservado. [Recibo](assets/campo-ajustes-dev-2026-11-01/publication.json).

**22/22 cenários focais** de interface e HELP passaram (`20261101T175126Z-361064`), incluindo campo próprio, foco, validação vazio/espaços, notas separadas, retorno, recarga, mudança de versão e recuperação da descrição original após resposta perdida. Tipos e build de produção aprovados. Catálogo 655/60; não representa regressão integral do backend ou do catálogo. [Cobertura e limites](assets/campo-ajustes-dev-2026-11-01/validation.json).

A conferência real abriu o painel em 1440/390, conferiu rótulo, foco, obrigatoriedade, exclusividade das ações e retorno do foco. Nenhum texto simulado foi digitado nem solicitação confirmada; sem escritas, erro de página ou overflow horizontal. [Relatório real](assets/campo-ajustes-dev-2026-11-01/adjustments-field-live.json), [desktop](assets/campo-ajustes-dev-2026-11-01/adjustments-field-1440.png), [celular](assets/campo-ajustes-dev-2026-11-01/adjustments-field-390.png).
