# Proposta de UX para a navegação de Sistemas

Data: 22/10/2026. Estado: **proposta para revisão**, sem implementação de telas ou mudanças no ambiente nesta etapa. Consolidação de três revisões de agentes: jornadas de negócio e arquitetura de informação; execução e feedback; hierarquia visual e acessibilidade. A análise utilizou os componentes e contratos atuais e capturas históricas. Não substitui um ensaio de usabilidade com pessoas.

A solicitação é revisar toda a navegação de Sistemas para pessoas de negócio e desenvolvimento: esclarecer localização e momento do processo, reduzir densidade, permitir aprofundamento do macro para o micro, concentrar a continuidade, destacar erros e último resultado e tornar o processamento da IA compreensível.

O [backlog funcional permanece pausado](redefinicao-interface-2026-10-22.md). O dashboard já entregue permanece como Visão Geral; esta proposta trata do espaço de Sistemas e das superfícies de trabalho acessadas por ele.

## Diagnóstico

- `apps/web/app/portal.tsx` concentra filhos, descrição, criação/edição, aprovações, execução, repositórios, ambientes e histórico em uma página vertical. O assunto principal de cada nível compete com os demais.
- A hierarquia Sistema → Projeto → Épico → História → Tarefa é desenhada com passos numerados. A História acrescenta nove status e a execução acrescenta seis etapas técnicas. Localização e progresso usam representações semelhantes, mas representam coisas diferentes.
- As ações para continuar ficam distribuídas: G1 após os documentos, conversa em outro bloco, correção técnica em outro e retomada/cancelamento no final. A criação de Tarefa pode receber mais destaque que uma aprovação pendente.
- O assistente flutuante aberto numa História usa contexto do Projeto ancestral; a conversa sobre impedimento pertence à execução da História. São conversas distintas com apresentação insuficiente do escopo.
- A execução local termina com o rótulo “Concluído”, embora a entrega atual seja um Merge Request em rascunho e a História continue em CODING.
- Estados de fila e processamento podem receber o mesmo texto de atividade. A etapa `discussion` também não está representada no diagrama técnico atual.
- Falhas de atualização, de envio e da execução aparecem em superfícies separadas. Erros de consulta podem sobreviver à recuperação, confundindo condição atual com falha anterior.
- O provedor atual retorna a resposta inteira (`stream:false`). A API fornece estado/etapa e resultados, mas não um sinal de atividade interna do modelo. Atualização da página ou concessão de execução não prova avanço da inferência.

## Recomendação central

Adotar **navegação por contexto, aprofundamento progressivo e um espaço de acompanhamento e decisão por item**. Cada tela deve responder, nesta ordem: onde estou, qual é a situação atual, quem precisa agir, qual é a próxima ação e onde encontro o detalhe.

Usar uma interface compartilhada por negócio e desenvolvimento, com explicação em PT-BR e status em inglês já definidos. Dados técnicos ficam acessíveis sob demanda; riscos, efeitos e condições de aprovação não podem ficar escondidos.

## Do macro para o micro

| Nível | Conteúdo principal ao abrir | Aprofundamento |
| --- | --- | --- |
| Sistemas | Catálogo de Sistemas, quantidade de Projetos e pendências agregadas | Abrir um Sistema |
| Sistema | Seus Projetos, situação resumida e pendências | Projeto; repositórios/componentes, ambientes e atividade em navegação local |
| Projeto | Objetivo, aprovação, ciclo de vida e seus Épicos | Épico; planejamento assistido e acompanhamento agregado |
| Épico | Objetivo, aprovação e suas Histórias por situação | História |
| História | Ciclo da entrega, situação atual, última ocorrência e próxima ação | Especificação, Tarefas, proposta de código/evidências e histórico |
| Tarefa | Descrição, status e evidências daquele trabalho | Detalhe técnico e retorno à História |

O Sistema é duradouro; cada Projeto pertence a um Sistema. Repositórios permanecem no Sistema. Aprovação do Projeto e seu ciclo de vida são dimensões diferentes. Um Sistema ou Projeto com várias Histórias não recebe artificialmente uma única etapa de execução: mostra um resumo das Histórias em cada situação e permite abrir a que exige atenção.

O breadcrumb usa os nomes reais e representa localização, sem numeração de passos. A lista de filhos imediatos fica visível no conteúdo principal. Navegação local separa documentos, configuração e histórico, com URL própria e suporte a voltar/avançar, recarga e links diretos. O retorno preserva filtros e posição na lista. Não exigir que o usuário percorra todas as páginas para acessar um item conhecido.

## Padrão das páginas

1. **Contexto:** breadcrumb, tipo, nome e chave do item; identificação do papel/persona em uso. Não confundir ausência de persona com falha do sistema.
2. **Situação atual:** estado relevante, último acontecimento confirmado e horário, impedimento vigente e quem pode agir. No Projeto/Sistema, resumo agregado e pendências por item.
3. **Próxima ação:** um botão principal com verbo e efeito concretos, como “Revisar especificação” ou “Responder impedimento”. Ações administrativas ficam em menu secundário. Podem existir alternativas secundárias, sem competir pelo papel de continuar a mesma decisão.
4. **Área de trabalho:** conteúdo necessário para aquela decisão, ou filhos imediatos no nível macro. Documentos longos abrem em área ampla; painel estreito serve à conversa, não à revisão completa de arquitetura e testes.
5. **Detalhes sob demanda:** requisitos completos, arquitetura, testes, repositórios, branch, commit, diagnóstico e histórico. Desenvolvedores acessam diretamente; negócio não precisa lê-los para localizar seu trabalho.

Na História, a navegação local pode começar com Acompanhamento, Especificação, Tarefas e Entrega. A atividade recente aparece resumida no acompanhamento, com histórico completo acessível. Os nomes e a quantidade de seções serão validados no protótipo para evitar apenas trocar uma página longa por muitas abas.

## Um ciclo e uma continuidade

Preservar os status SPECIFICATION, APPROVED, CODING, CODE REVIEW, SECURITY SCAN, TESTING, UAT, PRODUCTION e COMPLETED. Mostrar um ciclo principal e destacar a etapa atual. Atividades como obter contexto, consultar modelo, validar patch e publicar MR são detalhes de CODING, não outro processo completo concorrente. Discussões e correções aparecem como atividades/retornos daquela etapa.

Etapas do ciclo podem ser consultadas para entender requisitos e evidências, sem permitir avançar status ignorando o backend. G1/G2/G3, aprovação de Projeto e aprovação de Épico continuam decisões distintas. CANCELLED é alternativa de encerramento do Projeto, não etapa posterior a COMPLETED.

| Situação observada | Mensagem prioritária | Continuidade |
| --- | --- | --- |
| Pré-requisitos incompletos | O que falta e quem pode resolver | Abrir a pendência correspondente |
| QUEUED | Pedido recebido; aguarda processamento | Acompanhar, sem reenviar o pedido |
| RUNNING | Etapa real iniciada e última ocorrência confirmada | Acompanhar; sem exigir outra ação para prosseguir |
| WAITING APPROVAL | Especificação pronta para decisão G1 | Revisar especificação; aprovação explícita no espaço de decisão |
| WAITING INPUT | Pergunta/decisão que impede continuidade | Responder impedimento no contexto da História |
| Correção automática | Recusa resumida e tentativa registrada | Acompanhar correção |
| FAILED | Falha atual, efeito e artefatos preservados | Retomar etapa ou revisar decisão, conforme contexto e permissão |
| MR criado | Proposta de código em rascunho disponível; História permanece em CODING | Consultar a proposta de código |
| Próxima etapa não implementada | Capacidade indisponível nesta versão | Explicar o limite, sem sugerir uma aprovação inexistente para liberar |

“Bloqueado por pré-requisito” é diferente de “não implementado”. A interface deve indicar ambos com clareza. Ter um botão principal significa ter um ponto de entrada para a decisão, não autorizar ações automaticamente ou pular a leitura necessária à aprovação.

## Assistente contextual

Uma superfície visual consistente para conversar, com escopo explícito: “Planejamento do Projeto X” ou “Impedimento da História Y”. Conversas, históricos, versões e autorizações continuam separados no backend. Trocar de contexto não mistura mensagens nem decisões.

O usuário não deve precisar descobrir em qual dos dois chats precisa escrever. A próxima ação abre a conversa correta. Depois da conversa, resumo, efeito e continuação aparecem na mesma área de trabalho.

Preservar a regra já solicitada: a assistente da ferramenta cria o planejamento ao final da conversa autorizada. O redesenho não acrescenta revisão obrigatória extra, nem troca silenciosamente os modos atuais de criação/aplicação de proposta. A exposição simultânea de “Concluir entrevista e criar itens” e “Gerar nova proposta” precisa dar lugar a uma jornada padrão clara, com alternativas identificadas pelo seu efeito. Qualquer alteração de semântica exige decisão específica do usuário.

O assistente não pode anunciar que iniciou código ou deploy apenas por responder no chat. A confirmação do resultado vem dos eventos e artefatos reais do processo.

## Último estado, erros e recuperação

O estado atual ocupa uma região persistente junto à próxima ação, acessível sem procurar no fim da página. A faixa deve continuar visível ou ser facilmente acessível ao aprofundar documentos. No celular, evitar sobreposições que cubram o conteúdo; usar resumo compacto e ação contextual.

Uma falha vigente apresenta: o que ocorreu, o que foi preservado, o que fazer e quem pode agir. Exemplo de redação proposta: “Não foi possível publicar a proposta no GitLab. O código gerado foi preservado. Retomar verifica a publicação existente antes de tentar novamente.” O código do erro, operação e diagnóstico ficam em detalhes técnicos.

Separar **falha de atualização da tela** de **falha confirmada da execução**. Exemplo: “Não foi possível atualizar a situação. Última consulta bem-sucedida às 14:35.” Uma consulta recuperada remove esse alerta; a ocorrência continua no histórico. Mensagens antigas de sucesso ou falha não permanecem como situação atual de outro item.

Erros de preenchimento também aparecem junto aos campos, com um resumo no ponto de decisão. Isso complementa a área persistente sem criar centros de comando concorrentes.

Confirmação HTTP perdida deve consultar/repetir a mesma solicitação idempotente, não criar uma nova execução. Fechar painel ou navegar não cancela trabalho. Cancelamento deve explicar o efeito real: pode impedir continuação sem abortar imediatamente a chamada ao modelo. Durante publicação, respeitar a restrição e a reconciliação atuais; não prometer desfazer algo já publicado.

## Acompanhamento da IA baseado em evidências

Mostrar agente/papel, etapa real, início, tempo decorrido, tentativa quando conhecida e última ocorrência confirmada. Exemplos de eventos: pedido recebido, etapa iniciada, contexto obtido, chamada ao modelo enviada, resposta recebida, validação recusada, correção agendada e publicação confirmada.

Três sinais precisam ser distintos:

- **Consulta da interface:** confirma que a tela conseguiu obter dados do servidor.
- **Heartbeat do executor:** confirma atividade do processo responsável, não avanço da LLM.
- **Atividade do provedor:** confirma sinais reais de inferência, apenas quando o provedor os oferecer.

O provedor atual não transmite fragmentos. Nesse caso, o texto fiel é “Solicitação enviada; aguardando resposta do modelo”, com a hora da solicitação. Não exibir passos internos inventados, percentual baseado no tempo, raciocínio interno ou estimativa sem amostras. Falta de sinal não deve ser rotulada automaticamente como travamento; indicar “Andamento sem confirmação recente” quando o limite de monitoramento definido for ultrapassado.

A reorganização inicial pode usar os estados existentes. Acompanhamento mais preciso requer instrumentação adicional: timestamps próprios de fila/início, eventos de transição, heartbeat, motivo estruturado e correlação de operação/tentativa. Não reutilizar `updatedAt` ou o simples polling como prova de progresso. Streaming é uma possibilidade posterior, condicionada ao suporte e à validação do provedor; não é pré-requisito para comunicar fila, espera e resultado corretamente.

Uma projeção consistente de situação e próxima ação deve reutilizar as regras reais do backend, incluindo papel, contexto, versão e capacidades. Os componentes não devem reinventar regras de autorização diferentes. A API continua validando cada ação.

## Negócio, desenvolvimento e acessibilidade

Não exigir dois produtos nem uma escolha inicial “básico/avançado”. Usar o mesmo processo, com resumo de negócio e detalhes técnicos diretos. Explicar termos: “G1 — aprovação da especificação”; “Merge Request — proposta de alteração do código”. Manter os rótulos de status em inglês conforme definido.

Usar texto e ícone além da cor, foco previsível, navegação por teclado, rótulos acessíveis, anúncios de mudança de estado sem repetição a cada polling e motivo legível junto a controles desabilitados. Não deslocar foco ou abrir painéis repetidamente quando o backend atualizar. Rascunhos e conversas sobrevivem ao aprofundamento e retorno. No celular, revisão extensa usa página dedicada e o ciclo apresenta a etapa atual com acesso às demais.

## Sequência proposta e critérios de aceite

| Recorte proposto | Resultado para revisão |
| --- | --- |
| UX-R1: arquitetura e protótipo | Jornada Projeto → Épico → História, com contexto, drill down e estados G1, fila, inferência, impedimento, falha e MR criado |
| UX-R2: navegação e apresentação | Aplicar o padrão aprovado aos níveis; separar documentos/configuração; corrigir rótulos e mensagens atuais |
| UX-R3: operação observável | Instrumentar eventos de início, timestamps, heartbeat e motivos estruturados; apresentar sinais sem simular progresso |
| UX-R4: assistente e validação integral | Uniformizar a entrada contextual, preservar conversas/decisões e validar retorno, recuperação e acessibilidade |

Os recortes são propostas, não itens concluídos nem autorização para retomar Code Review, Security Scan ou deploy. A revisão não altera projetos produzidos pelo SDLC nem cria demos de negócio.

Validar o protótipo e depois a implementação com participantes de negócio e desenvolvimento. Roteiro: encontrar uma História a partir do Sistema; explicar onde está e a etapa atual; localizar a próxima ação sem instrução; compreender papel e bloqueio; revisar G1; sair e retornar durante geração; distinguir fila, espera do modelo e falha de comunicação; responder impedimento e continuar; reconhecer que MR não é entrega em produção; recuperar erro sem duplicar ação; repetir com teclado e celular.

### Métricas sugeridas para discutir com o usuário

Conforme a [política de arquitetura](../portal/docs/ARCHITECTURE.md), sugerir e questionar antes de instrumentar: tempo para localizar a próxima ação; sucesso das jornadas sem ajuda; tempo até confirmação visível do pedido; tempo em fila/processamento/espera humana; falhas de consulta versus execução; retomadas e recuperação sem duplicação; interações para concluir decisões; ações bloqueadas por papel ou pré-requisito.

Separar medição de ensaio humano de telemetria do produto. Definir fonte, denominador, cobertura e metas com o usuário, sem criar metas numéricas arbitrárias. Não inferir abandono apenas por navegação para outra página: o trabalho pode continuar e a pessoa pode voltar. Não classificar entrevista normal como falha. Para indicadores aprovados, manter a visão das quatro semanas do dashboard e implementar coleta com a respectiva funcionalidade.
