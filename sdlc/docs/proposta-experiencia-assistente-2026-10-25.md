# Revisão da experiência do Assistente

Data: 25/10/2026. **Proposta aprovada pelo usuário e implementada; validação e publicação registradas ao final.** O diagnóstico e as capturas anteriores abaixo documentam a situação anterior. A revisão envolveu agentes de UX/contratos e inspeção no navegador do código servido. O objetivo é facilitar começar a conversa, entender as pendências e revisar exatamente o que será criado.

Referências: [padrões de experiência](../portal/docs/PADROES_DE_EXPERIENCIA.md), [arquitetura](../portal/docs/ARCHITECTURE.md) e [contrato até coding](estabilizacao-ate-codificacao-2026-10-25.md). Os registros antigos de UX são históricos; o contrato de estabilização prevalece.

## Diagnóstico

A conversa está subordinada aos controles de contexto, avisos e explicações. O usuário precisa percorrer uma página extensa antes de escrever e depois alternar assuntos para descobrir por que não pode avançar. A revisão de propostas também conserva regras anteriores às seis Tarefas padrão.

Na amostra com contexto selecionado e seis interações, em zoom padrão:

| Medida | Desktop 1440 × 1000 | Celular 390 × 844 |
| --- | ---: | ---: |
| Altura do quadro de seleção de contexto | 459 px | 883 px |
| Início do painel de conversa | 795 px | 1.342 px |
| Início da área de mensagem | 1.531 px | 2.076 px |
| Rolagem interna das mensagens | 1.525 px em janela de 420 px | 1.993 px em janela de 354 px |

Não houve estouro horizontal nessas amostras. O problema principal observado é a hierarquia e a quantidade de rolagem, inclusive página e conversa rolando separadamente. São medidas de um cenário representativo, não um benchmark universal.

As capturas usam **dados sintéticos interceptados somente no navegador**: [desktop](assets/revisao-assistente-2026-10-25/atual-desktop.png) e [celular](assets/revisao-assistente-2026-10-25/atual-mobile.png). A entrada sem contexto também foi inspecionada. Nenhuma mensagem foi enviada, nenhuma IA foi acionada e nenhuma mutação foi solicitada à instalação.

## Problemas prioritários

| Prioridade | Problema e efeito para o usuário | Evidência |
| --- | --- | --- |
| Alta | **A confirmação pode prometer zero Tarefas e criar seis.** A contagem ignora padrões; edição ainda fala em ao menos uma Tarefa e limita a quatro entradas. Textos anunciam Épico TO DO, embora o estado inicial seja ACTIVE. | `assistant-plan.tsx:35,69,71,87–101`; criação em `plans.ts:139–145`; contrato em `plan-schema.ts:8–16`. No navegador, uma proposta de um Épico/uma História com `tasks: []` mostrou **0 Tarefas e 2/30 itens**; o resultado previsto pelo contrato é **6 Tarefas e 8 itens**. |
| Alta | **Permissões contraditórias.** Arquiteto conversa e revisa, mas a tela bloqueia criação/aplicação que a API já permite. | `assistant-plan.tsx:27`; `assistant.tsx:129,173–174`; APIs `plans.ts:54,111`. |
| Alta | **Pausa sem caminho claro.** `paused` vem da API, mas não existe no mapa de estados do frontend. Após reativar o agrupador, a atividade continua bloqueando o envio, sem uma orientação coerente de retomada. O comportamento varia conforme a página do histórico. | `api/src/assistant.ts:55`; `web/app/assistant.tsx:11,22,137,154,160`. A retomada existe em `resume-work.tsx`. |
| Alta | **Rascunho da proposta e pedido incerto podem se perder ao sair.** Só o estado React guarda a edição e a retentativa; trocar contexto/página desmonta o formulário. A mensagem já possui preservação em sessão, mas a proposta não. | `assistant-plan.tsx:17–23`; `assistant.tsx:26,62,178`. |
| Alta | **O campo para escrever fica depois de muita configuração.** Seletores e textos são repetidos mesmo depois da escolha. No celular, o quadro de contexto sozinho excede a altura da tela. | Capturas/medidas acima; `assistant-workspace.tsx:36–38`; `assistant.css`, regras `.assistant-embedded` e `.assistant-scroll`. |
| Média | **Cobertura não comunica o significado das pendências.** Atores, saídas e outros detalhes complementares parecem faltar com o mesmo peso dos essenciais; comportamento esperado não aparece. Dependências pendentes não separam impacto impeditivo/informativo. | `assistant-workspace.tsx:92–99`; requisitos essenciais em `requirements.ts:15–22`. |
| Média | **A cobertura muda silenciosamente ao consultar propostas antigas.** Usa a primeira proposta da página recebida, sem acompanhar explicitamente a proposta que o usuário está revisando. | `assistant-workspace.tsx:79`; paginação em `plans.ts:20–24`. |
| Média | **Revisão e conclusão exigem esforço desnecessário.** Árvore com expansões sucessivas, edição parcial de requisitos, duas formas de concluir escondidas em seleção e linguagem como “Preparar aplicação”. O recibo não conduz diretamente às Histórias criadas. | `assistant.tsx:166–178`; `assistant-plan.tsx:67–105`. |

Os achados de permissão, pausa, preservação e fonte da cobertura foram confrontados com o código e os contratos. Não foram todos reproduzidos em navegador nesta rodada; essa distinção deve permanecer nas evidências de implementação.

## Proposta de experiência

### 1. Escolher uma vez, manter o destino visível

Na entrada, mostrar uma instrução curta e a seleção pesquisável de Sistema e Projeto. Busca/paginação continuam no servidor, com acesso a todos os registros autorizados. Depois da escolha, recolher os controles para uma faixa:

**Sistema › Projeto · situação atual · Alterar contexto**

“Alterar contexto” expande a seleção; não apaga rascunhos nem resolve pedidos pendentes silenciosamente. A confirmação de criação sempre repete o destino. Na ausência real de Sistemas/Projetos, mostrar a ação correspondente à permissão e ao estado, sem criar ou selecionar um contexto arbitrário.

Conversas antigas do Sistema permanecem acessíveis e identificadas como tal, separadas da conversa do Projeto e do destino de criação.

### 2. Três assuntos, com a situação atual sempre presente

**Conversa | Proposta | Histórico** são assuntos de navegação, não novos gates ou fases de negócio. Atividade atual, pausa, impedimento e confirmação incerta ficam visíveis em qualquer assunto. A consulta de uma proposta antiga não altera a elegibilidade atual.

Na **Conversa**, priorizar mensagens e campo de composição. Reduzir textos permanentes; mover explicações extensas e modelo técnico para ajuda expansível. Mostrar perto do campo “Perguntas registradas pela assistente: 2”, com acesso aos pontos. Ausência de perguntas não significa requisitos completos nem liberação para coding.

Favorecer uma única rolagem principal. Se o campo acompanhar a rolagem, reservar espaço e validar teclado virtual para não cobrir mensagens, foco ou decisões. No cenário de entrada da conversa, o usuário deve conseguir começar a escrever sem atravessar os antigos quadros de configuração.

Usar um próximo passo contextual: continuar respondendo, gerar proposta, retomar revisão ou verificar uma operação cuja confirmação não chegou. A ação de enviar mensagem e a ação de criação precisam ter funções visualmente distintas.

### 3. Revisar uma História por vez sem esconder o conjunto

Na **Proposta**, mostrar resumo do escopo, destino, revisão/data/estado e totais reais. A lista de Histórias identifica a selecionada; seu editor ocupa o espaço principal, sem três níveis de expansões obrigatórias. Preservar a edição das demais Histórias ao trocar de seleção.

Reutilizar contratos e validações da especificação editável nos campos compatíveis com a revisão de propostas. Objetivo, comportamento, critérios, regras e dependências podem ser ajustados por pessoa, mantendo autoria e versão. Informações complementares ficam em expansão própria; não exigir texto inventado.

Mostrar as seis Tarefas fixas por História, com sua etapa. Detalhar uma etapa não cria outra Tarefa. Separar visualmente **Tarefas padrão** e **Tarefas adicionais**; remover um detalhamento não pode aparentar excluir uma etapa obrigatória. A contagem efetiva e o limite da proposta devem vir do mesmo contrato usado pela API.

Trocar “Cobertura da proposta” por um resumo com significados distintos:

- **Essencial da especificação:** objetivo, comportamento e critério funcional, respeitando o contrato da ação.
- **Detalhamento complementar:** informações registradas, não informadas ou sem aplicação declarada; não transformar ausência em impedimento genérico.
- **Dependências:** impacto e situação. Uma dependência impeditiva de coding não impede, por si só, elaborar a especificação.

Identificar a fonte — proposta, revisão, data e História. Esse resumo acompanha a proposta selecionada; não troca para a primeira proposta de uma página histórica. Ele não substitui a validação técnica de G1 na História.

### 4. Confirmar o resultado exato e oferecer continuidade

Exemplo de confirmação fiel:

> Criar neste Projeto: **1 Épico ACTIVE, 1 História SPECIFICATION e 6 Tarefas TO DO**.

“Salvar revisão” aparece quando há edição local; criação permanece impedida até resolver o conflito ou salvar. A ação principal de criação pode ser “Conferir criação”, seguida da confirmação explícita já existente. Manter a recuperação da mesma solicitação após perda da resposta.

Após o sucesso confirmado pela API, mostrar recibo com destino, revisão aplicada, totais reais e links para as Histórias/Projeto. Manter a proposta aplicada acessível como referência. O passo seguinte de codificação pertence à História e ao seu G1.

**Gerar proposta para revisão** deve ser o caminho principal. A opção existente **Concluir entrevista e criar itens** permanece como alternativa nomeada e explicada, com sua confirmação; não será removida nem escondida em um menu genérico.

### Estados e recuperação

Explicar o motivo real de uma ação indisponível: persona, IA indisponível, versão alterada, contexto INACTIVE, operação atual ou pedido incerto. Não orientar troca de persona para resolver inatividade.

Para pausa, identificar o agrupador responsável e oferecer acesso à sua Execução. Reativar continua distinto de retomar; o Assistente não deve recolocar trabalho em fila automaticamente. Cancelar uma rodada só aparece quando a hierarquia e a permissão permitem o comando existente.

Rascunhos e pedidos pendentes devem ser preservados por contexto, proposta, revisão e persona de origem. Antes de abandonar uma edição, permitir salvar ou descartar conscientemente; recarga, falha e consulta de histórico não podem apagar a edição nem gerar outra chave para o mesmo pedido incerto.

## Prévia e decisão de fluxo

A [prévia navegável](prototipo-assistente-2026-10-25.html) ilustra a organização proposta com dados de exemplo. É um arquivo independente, sem chamadas à API e sem criação real. Não representa funcionalidade publicada nem aceite de acessibilidade.

Imagens da proposta: [desktop](assets/revisao-assistente-2026-10-25/proposta-desktop.png) e [celular](assets/revisao-assistente-2026-10-25/proposta-mobile.png). O menu e a identidade reais devem ser preservados; a navegação global da prévia é esquemática. Foram conferidos troca de assunto por clique/teclado, permanência do texto local, confirmação ilustrativa e largura móvel, com zero chamadas de rede e zero erros de página. Isso valida apenas a navegação do protótipo, não o comportamento da aplicação futura.

Uma decisão deve ficar separada do ajuste visual: **permitir gerar uma proposta em rascunho enquanto existem perguntas registradas?** A tela hoje bloqueia a geração, embora a API dessa geração não imponha a mesma condição; a conclusão direta possui sua própria guarda. Minha recomendação é permitir estudar um rascunho com dúvidas visíveis, mantendo a confirmação/criação e G1 com suas validações próprias. Isso exige decisão explícita; o primeiro incremento pode manter a regra atual.

## Ordem recomendada e critérios de aceite

1. Corrigir contagem/estados, permissão, pausa e preservação de rascunhos/pedidos. Essas correções evitam decisões erradas e perda de trabalho.
2. Compactar o contexto e reorganizar conversa/proposta/histórico, com editor focado e recibo navegável. Preservar identidade visual e contratos de URL/consulta existentes.
3. Validar percurso completo em desktop/celular e com teclado, incluindo conflitos, pausas e perda de resposta. Não encerrar UX-C05–C07 pela troca de layout.

Critérios mínimos para a implementação:

- Começar uma mensagem no contexto já escolhido sem atravessar os controles de seleção; comparar com as medidas desta revisão em 1440 × 1000 e 390 × 844, incluindo teclado virtual e zoom.
- Prévia e recibo coincidem com os itens efetivamente criados, incluindo padrões, adicionais e estados iniciais. Arquiteto tem as ações autorizadas pelo backend.
- Trocar assunto, contexto e página ou recarregar preserva rascunhos; retentar uma resposta perdida não duplica a operação.
- Pausa é nomeada e tem caminho de recuperação; página histórica não determina estado atual, cobertura vigente ou controles.
- Navegação por teclado, foco visível e anúncios de estado funcionam sem reler toda a conversa a cada atualização. Mensagens de erro indicam uma ação recuperável.

A revisão inicial acima não alterou componentes, APIs ou dados; suas capturas representam inspeção visual com interceptação de leitura. A implementação posterior foi autorizada pelo usuário com “Vamos nessa”.

## Implementação da experiência aprovada

O contexto escolhido ocupa uma faixa compacta; **Alterar contexto** reabre os mesmos seletores pesquisáveis, com busca e paginação no servidor. Sistema e Projeto permanecem identificados. Conversas anteriores do Sistema conservam sua origem, separada do destino de criação. Disponibilidade e permissões acompanham a consulta atual.

Os assuntos são **Conversa, Proposta e Histórico**, com navegação por teclado e estado na URL. A Conversa prioriza o campo de mensagem e apresenta apenas a última interação, explicitamente identificada como parcial. A coleção completa fica no Histórico, em páginas de 20. A conversa consultiva da História conserva o acesso às mensagens anteriores. A página usa a rolagem do documento; não há janela concorrente para rolar as mensagens.

O GET de Assistente fornece `latestTurn`, `currentProposal`, impedimento e capacidades atuais, independentemente das páginas históricas. A leitura ocorre em snapshot `RepeatableRead` e não grava eventos ou itens. Sem persona declarada, não concede comandos. Pausa identifica a necessidade de retomada explícita e oferece acesso à Execução; consultar ou reativar não recoloca trabalho em fila. As guardas de geração e conclusão também reconhecem rodadas pausadas.

O editor mostra uma História por vez, mantendo a visão do conjunto. Requisitos essenciais, complementos e dependências podem ser revisados, respeitando os schemas existentes. As seis etapas fixas aparecem separadas das Tarefas adicionais. O contrato compartilhado de contagem inclui os itens efetivamente materializados: detalhar uma etapa não duplica sua Tarefa, e o limite permanece 30 itens.

Rascunhos e solicitações incertas são preservados em `sessionStorage`, por contexto/proposta/revisão/persona. A mesma tentativa conserva corpo, identidade e persona ao recarregar, consultar histórico ou encontrar o contexto inativo. Resposta incompleta não confirma sucesso. Conflitos preservam o conteúdo local; descarte exige ação explícita. Falha no armazenamento é informada e impede enviar uma solicitação que não possa ser preservada. Isso cobre a sessão do navegador; não é sincronização de rascunhos entre dispositivos nem promessa de persistência após encerrar a sessão.

O recibo usa IDs persistidos e itens reais, com totais por tipo, destino e links. Registros legados sem recibo detalhado mostram a lacuna; a interface não reconstrói uma prova de criação a partir do texto gerado. As ações do Arquiteto acompanham as permissões existentes da API. **Concluir entrevista e criar itens** permanece como alternativa explícita à geração para revisão.

Mantido o bloqueio atual da interface para gerar proposta enquanto há perguntas registradas. Alterar essa regra continua sendo uma decisão de fluxo separada. Não foram introduzidos gates, fases, métricas, executores posteriores ao coding ou novos comandos de negócio. A evolução usa as mutações e o recorder existentes; a publicação usa `PORTAL_PUBLICATION` no ledger administrativo externo. UX-C05–C07 continuam parciais.

### Validação e publicação

Concluídos em 25/10/2026:

- **303 testes de aplicação aprovados** em banco descartável; quatro integrações externas opt-in permaneceram fora da rodada. Após acrescentar a identificação segura do Projeto real ao recibo, os 14 testes de contratos/planejamento afetados passaram novamente. Tipos, build e oito verificações de auditoria aprovados.
- **54 cenários distintos de navegador aprovados**, nas suítes `assistant-workspace`, `assistant-workflow`, `assistant-plan-review`, `assistant`, `plans`, `completion`, `conversation-history`, `story-task-planning` e `story-workspace`. A rodada ampla aprovou 53 e identificou uma expectativa antiga de perguntas já expandidas. Corrigida somente a interação do teste com a expansão, as duas suítes afetadas passaram 15/15; os quatro cenários de medição também passaram novamente. As primeiras falhas de seletores ambíguos e da fixture incompleta de release foram corrigidas nos ensaios, sem alterar a aplicação de release.
- Cobertos contexto com 25 Sistemas e paginação, perguntas, complementos e dependências, seis etapas e limite de 30 itens, edição por Arquiteto, versões concorrentes, pausa fora da página histórica, histórico/proposta na URL, rascunhos por persona/contexto, resposta de rede perdida ou incompleta, recibo confirmado e proposta antiga incerta mesmo após chegar uma nova proposta e recarregar.
- Teclado, foco, 1440×1000, 390×844, largura intermediária e viewport reduzida 390×500 conferidos. A viewport reduzida emula o espaço ocupado por teclado; não é um ensaio de teclado nativo em dispositivo real. Leitor de tela e validação assistiva completa continuam pendentes.

Medições finais em fixtures sintéticas no navegador, sem mutações na instalação:

| Medida | Desktop 1440 × 1000 | Celular 390 × 844 |
| --- | ---: | ---: |
| Quadro de contexto selecionado | 76 px | 98 px |
| Início do campo de mensagem | 578 px | 708 px |
| Rolagem interna da conversa | Não existe | Não existe |

Essas amostras representam a organização atual, não um benchmark universal. Perguntas e resumos longos ficam em expansão identificada para não deslocar o campo automaticamente. Capturas da implementação: [Conversa desktop](assets/revisao-assistente-2026-10-25/implementacao-conversa-desktop.png), [Conversa celular](assets/revisao-assistente-2026-10-25/implementacao-conversa-mobile.png), [Proposta desktop](assets/revisao-assistente-2026-10-25/implementacao-proposta-desktop.png) e [Proposta celular](assets/revisao-assistente-2026-10-25/implementacao-proposta-mobile.png). Todos os dados dessas capturas pertencem às fixtures isoladas.

**Publicada localmente em `http://localhost:3310/assistant`, às 15:06 de 25/10/2026 (America/Sao_Paulo).** Imagem API/web `3611d5dc3633`, origem `a5595e2568bae9cd23f60866818a663db8556d57f4559d7cbcbe1738b2ad85df`. Saúde `ready/preview`, identidade restrita `sdlc_portal_app` e integrações existentes preservadas. Os bundles servidos e as novas projeções dos contextos reais de Sistema e Projeto foram conferidos por leitura; consulta sem persona não concedeu comandos.

Não havia migrations pendentes. Antes da substituição, foi criado backup privado verificado e comparadas contagens/impressões dos registros de todas as tabelas; os dois itens existentes e os demais registros permaneceram íntegros. Nenhum item, mensagem, resultado de agente ou aplicação produzida pelo SDLC foi criado/alterado para demonstrar a revisão. A época persistente da auditoria foi preservada. Imagens anteriores e manifesto mantidos para reversão. A trilha administrativa externa terminou com 64 registros válidos e nenhuma operação pendente. Os recursos descartáveis de validação foram removidos após recolher as evidências.
