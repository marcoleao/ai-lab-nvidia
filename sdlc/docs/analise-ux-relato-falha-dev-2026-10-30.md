# Análise UX: relatar um problema em DEV e continuar a História

Status: **análise e backlog; não implementado**. Revisão de 30/10/2026, com fontes e capturas existentes. Não houve navegação no portal real, execução de testes, alteração de aplicação gerada, dados ou resultados de agentes nesta revisão.

O caminho de dependência e o Gateway orientam melhor que o caminho de correção. Depois de abrir a aplicação em DEV e encontrar um defeito, uma pessoa de negócio precisa descobrir que “iniciar novo ciclo” exige editar a especificação, salvar um rascunho, aplicar uma revisão e preparar outra execução. A confirmação do ciclo explica seus efeitos, mas não pergunta qual problema precisa ser resolvido. O custo principal é traduzir o defeito para o modelo interno do processo e transportar seu contexto entre áreas.

## Evidência e limites

| Fonte | O que sustenta | O que não comprova |
| --- | --- | --- |
| [41 — dependência](assets/ux-relato-falha-dev-2026-10-30/41-dependencia-real-bloqueia-segunda-historia.png) | “Integração pré-requisito pendente” nomeia a História necessária, explica a ordem e oferece um link direto. | Integração não comprova aceitação funcional da História anterior. |
| [42 — Gateway](assets/ux-relato-falha-dev-2026-10-30/42-primeira-correcao-g1-destino-conferido.png) | Destino, base, revisão e consentimento humano estão disponíveis antes de autorizar código. | A captura não demonstra como o usuário registrou ou transportou o relato do defeito. |
| [44 — DEV](assets/ux-relato-falha-dev-2026-10-30/44-primeira-correcao-publicada-dev.png) | O painel separa construção, publicação, testes e Desenvolvimento Finalizado; oferece abrir a aplicação. | Saúde HTTP e publicação confirmada não provam correção funcional. O painel não oferece um relato manual de problema junto da publicação. |
| [Recibo funcional da rodada](assets/avaliacao-modelos-lab-2026-10-30/aceitacao-dev-correcao-1.json) | Registra recusa de URL SVG HTTP válida e formatação com ponto em `R$ 0.00`, separando erro inicial da automação de falha do produto. | A análise não reexecutou os casos nem confirmou correção desses defeitos. Não há aceite integral do catálogo. |
| Relato do operador desta jornada | Abrir novo ciclo não ofereceu campo de relato; foi necessário navegar por Especificação → Editar → Salvar rascunho → Aplicar → Preparar nova especificação → Gateway. | Não há cronometragem ou contagem completa de cliques dessa sequência. Não estimar economia percentual. |

As notas abaixo são uma avaliação qualitativa de próxima ação por revisão de UX, não uma pesquisa com usuários. Escala preservada da jornada: **5**, evidente no contexto; **4**, clara com pequena leitura; **3**, exige procurar em outra área; **2**, depende de inferência ou orientação; **1**, sem caminho efetivo. A captura 44 é uma página longa com elementos fixos; não serve para medir posição na primeira dobra. Nenhuma verificação mobile nova foi feita.

## Clareza da próxima ação

| Situação | Nota | Avaliação |
| --- | --- | --- |
| Descobrir o que fazer com um pré-requisito pendente | **5/5** | Motivo, História e acesso estão juntos. O padrão deve ser preservado. |
| Autorizar a implementação no Gateway | **4/5** | Consentimento e destino são claros. Há leitura técnica extensa, mas ela corresponde a uma decisão real de autorização. |
| Abrir a versão publicada em DEV | **4/5** | O link é explícito e a publicação fica identificada. O painel longo aumenta a procura. |
| Relatar um defeito observado manualmente nessa versão | **2/5** | Falta uma ação com o vocabulário de negócio junto do link da aplicação; “novo ciclo” não comunica registrar um problema. |
| Levar o defeito à revisão da especificação | **2/5** | É preciso localizar o editor e decidir onde incorporar o esperado e a regressão, preservando o aceite anterior. Uma conversa consultiva não aplica essa revisão. |
| Continuar após salvar/aplicar a revisão | **3/5** | Os controles existem, mas exigem alternar entre assuntos e compreender rascunho, revisão vigente, execução e Gateway. |

**O ciclo de correção ainda é 2/5 para uma pessoa de negócio**, embora integração, publicação e Gateway tenham caminhos melhores. Essa nota não substitui a avaliação funcional do catálogo nem revisa retroativamente resultados anteriores.

## Diagnóstico nas fontes existentes

- `apps/api/src/journey.ts`: após integração, projeta “Para alterar esta História, inicie outro ciclo e revise a especificação”. A ação `development_cycle` chama `replan` com versão, contexto e confirmação; a confirmação não inclui um relato.
- `apps/web/app/story-workspace.tsx`: a confirmação genérica aceita descrição e checkbox, sem campo de problema observado. O retorno de “Solicitar correção” dos testes localiza a ação de ciclo; não transporta um relato para o editor.
- `apps/web/app/story-specification.tsx`: já separa editar, salvar rascunho e aplicar revisão com confirmação. É o editor a reutilizar; duplicá-lo em outra tela aumentaria divergência e risco de perda dos critérios.
- `apps/web/app/development-test.tsx`: “Solicitar correção” depende de uma execução de testes com falha. O campo “Motivo dos testes DEV” justifica executar uma suíte; não é registro de defeito manual nem prova de reprovação de um critério.
- `apps/api/src/execution.ts`: `replan` captura a especificação e o destino correntes, conserva a entrega anterior e exige novo Gateway. Abrir esse ciclo antes de elaborar o relato pode preparar novamente o escopo anterior e exigir outra preparação depois da revisão. Isso é uma inferência das fontes, não uma execução adicional desta análise.

O [padrão de experiência](../portal/docs/PADROES_DE_EXPERIENCIA.md) exige reconhecer situação e próxima ação no contexto, linguagem de negócio, uma ação contextual por decisão e preservação de rascunhos. A [arquitetura](../portal/docs/ARCHITECTURE.md) conserva conversa consultiva, autorização por revisão e evidências independentes. A solução deve reduzir procura e transferência manual de contexto, preservando as decisões que têm efeitos distintos.

## Proposta pequena no painel atual

1. **Entrada contextual: “Relatar problema nesta versão DEV”.** Disponível junto de “Abrir aplicação em DEV” e como entrada equivalente dos casos efetivamente reprovados. Abrir apenas um bloco no painel existente, sem criar página ou iniciar ciclo. Continuar disponível para observação humana mesmo sem job de testes reprovado. Se houver somente falha do executor, dizer isso e não apresentar reprovação de negócio como confirmada.
2. **Relato curto e versão identificada.** Solicitar “O que aconteceu?”, “O que deveria acontecer?” e, opcionalmente, “Como reproduzir?”. Mostrar História, publicação observada e referências conhecidas de fonte/artefato. Referências técnicas ficam recolhidas. Preservar o texto ao voltar ou trocar de aba. Registrar o relato exige ação humana explícita e autoria; uma nova publicação não deve trocar silenciosamente a versão relatada. Uma observação humana permanece identificada como observação, sem inventar um resultado de suíte.
3. **Revisar no editor existente.** Após registrar o relato na conversa da História pelo caminho auditado existente, oferecer “Revisar especificação da correção” no mesmo contexto. Exibir a necessidade relatada junto do editor atual, com critérios anteriores preservados. Uma sugestão do agente pode propor o esperado e o teste de regressão, mas o usuário revisa a diferença; conversa ou sugestão não alteram a revisão vigente. O envio do relato não deve disparar automaticamente outro comando.
4. **Preparar o ciclo uma vez, depois da revisão.** Após “Salvar rascunho”, levar diretamente à revisão da aplicação, sem exigir descobrir outra área. Aplicar mantém sua confirmação própria. Depois da aplicação confirmada, apresentar a ação existente de preparar novo ciclo, com efeitos e preservação de evidências explícitos. Só então voltar ao Gateway, onde destino e codificação continuam exigindo consentimento separado. Não abrir antecipadamente uma execução com o escopo antigo.

O ganho pretendido é eliminar a abertura prematura do ciclo, o transporte manual do relato e a procura entre abas. Não prometer transformar decisões diferentes em um único clique. Salvar, aplicar, preparar e autorizar continuam distinguíveis, com recuperação independente. **Não criar um botão que execute toda essa sequência em silêncio.**

O uso do envio de mensagem existente pode atender o registro humano inicial. Ainda precisa ser conferido, antes de implementar, como vincular de forma durável a publicação observada ao relato e referenciá-lo no rascunho/snapshot da correção. O DTO de confirmação atual não oferece esse contrato. Não declarar que basta acrescentar um textarea ou que o texto da conversa já chega ao codificador. Se a solução exigir nova mutação ou campos de comando, aplicar o [contrato de auditoria transversal](implementacao-auditoria-2026-10-24.md), com catálogo e recorder, sem escrever eventos diretamente.

## Backlog incremental proposto

| ID | Entrega | Verificação necessária | Estado |
| --- | --- | --- | --- |
| UX-DEV-REL-01 | Entrada semântica no painel DEV e acesso ao relato/revisão no contexto; reutilizar o editor e manter a navegação existente. | Identificar próxima ação após defeito manual, sem job de teste; abrir/voltar por teclado, rascunho e foco preservados em 1440/390. Abrir não escreve nem inicia agente. | Planejado |
| UX-DEV-REL-02 | Relato humano com referência à publicação e autoria; revisão explícita das alterações propostas sem apagar critérios. | Versão mudou durante a escrita, relato de versão anterior, falha de consulta, outro usuário, contexto inativo, perda de resposta e mesma identidade do pedido. Não confundir observação, diagnóstico e resultado de suíte. | Planejado; contrato de vínculo pendente |
| UX-DEV-REL-03 | Continuação contextual salvar → revisar/aplicar → preparar ciclo → Gateway, usando os comandos existentes e contexto atualizado. | Somente um novo ciclo após revisão aplicada; parada/erro em cada decisão não dispara a próxima; reenvio não duplica; base divergente exige revisão; Gateway não aprovado por conversa. | Planejado |
| UX-DEV-REL-04 | Reexecutar a correção pelo usuário de negócio, preservando a publicação antiga e o aceite completo. | Percorrer o relato real até nova DEV e repetir os casos afetados e regressão registrada na versão final; separar duração/ação observada de julgamento qualitativo. | Planejado; aceitação real independente |

Não se acrescentam indicadores nesta análise: manter os existentes, conforme preferência reiterada do usuário. Riscos a cobrir incluem sobrescrever critérios ao resumir um defeito, usar artefato de outra História no DEV compartilhado, tratar atualização de tela como autorização, duplicar ciclo após confirmação perdida e concluir que integração libera funcionalmente uma dependência. Nenhuma alteração de gate, política de dependências ou estado de release é proposta.

Este backlog complementa a [reexecução registrada do catálogo](reexecucao-ui-joias-2026-10-30.md) e o [plano incremental](plano-incremental-releases-ambientes-2026-10-27.md). Não marca RA, migração de tela, teste funcional ou aceitação como concluídos. Código, testes e catálogo da plataforma permaneceram congelados nesta revisão.
