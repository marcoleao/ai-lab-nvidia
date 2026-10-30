# Revisão da navegação e condução da História

Data: 26/10/2026 · Revisão 4 · Situação: **implementação autorizada no Portal existente**, conforme “Implementa no portal real”. As revisões 1 e 2 do protótipo não foram aceitas pelo usuário. A entrega aplica a direção da revisão 3 na interface real; validação e publicação estão registradas na seção 16. Contratos de negócio, agentes e registros existentes são preservados.

**Nomenclatura:** por decisão do usuário, a aprovação conhecida tecnicamente como `G1` se chama **Gateway de Especificação** na interface e na proposta corrente. Identificadores e registros anteriores permanecem; as evidências históricas abaixo mantêm os rótulos da época. A aprovação conserva seu efeito de autorizar e enfileirar codificação.

O objetivo é permitir que a pessoa reconheça onde está, o que falta, quem precisa agir e qual decisão faz a História avançar. A revisão envolveu agentes com perfil de UX e de fluxo/arquitetura, confrontando a interface com os comandos realmente existentes.

Referências: [padrões de experiência](../portal/docs/PADROES_DE_EXPERIENCIA.md), [arquitetura](../portal/docs/ARCHITECTURE.md), [estabilização até a codificação](estabilizacao-ate-codificacao-2026-10-25.md), [auditoria transversal](implementacao-auditoria-2026-10-24.md) e [releases e promoção](releases-promocao-2026-10-22.md). O contrato de estabilização prevalece sobre descrições históricas anteriores.

## 1. Resultado da revisão

A História hoje reúne a lista de trabalho, controles de Projeto, especificação, decisões operacionais e administração técnica, mas não deixa sua relação suficientemente clara. Retirar Componentes resolve uma parte; a mudança principal é organizar a página pela **decisão atual da História**, preservando os assuntos e as fontes de evidência.

**A condução simples fica dentro da aba existente Execução da História.** Etapa atual, informação necessária e uma ação principal mudam no miolo da página; confirmação e esclarecimento acontecem ali. O shell, a marca Dell Technologies / Portal SDLC, o menu global, a seleção de persona, o breadcrumb, a identificação, a edição e as abas permanecem visíveis e reconhecíveis.

Tarefas continua como entrada da História. **Tarefas → Execução → Especificação → Conversas → Mais** preserva os assuntos, com aprofundamentos opcionais. A execução usa os mesmos componentes visuais da página: painel branco, tipografia, bordas e alinhamento. Não se propõe uma aplicação paralela ou outra tela de entrada com marca própria.

A primeira versão foi considerada pouco fluida. Na segunda, o isolamento foi aplicado ao shell inteiro e descaracterizou o Portal; o usuário também a rejeitou. A revisão 3 mantém a simplicidade no conteúdo da execução e recupera o contexto do sistema. Pareceres de UX e testes anteriores documentam verificações técnicas, sem substituir o aceite do usuário.

Repositórios e integração GitLab são geridos no **Sistema**. A História identifica apenas **onde será implementada**, entre os repositórios já pertencentes ao Sistema. Seu MR específico continua acessível como evidência de entrega. Isso preserva a distinção entre propriedade do repositório e escopo da execução.

## 2. Achados priorizados

Referências de linha correspondem ao workspace revisto em 26/10/2026; arquivos já possuíam alterações anteriores a esta revisão.

| Prioridade | Achado e consequência | Evidência no código | Mudança proposta |
| --- | --- | --- | --- |
| P0 | As propostas falharam em equilibrar simplicidade e continuidade: a primeira era extensa; a segunda removeu os marcos do Portal. | Retornos do usuário às revisões 1 e 2 | Preservar o shell e os acessos existentes. Simplificar somente o miolo de Execução, com confirmação inline e aprofundamentos opcionais. |
| P0 | Criar tarefa recebe destaque permanente; o próximo passo fica atrás de um acesso genérico. A pessoa precisa descobrir a ação do processo. | `apps/web/app/story-workspace.tsx:320` | Nomear o acesso contextual pela ação disponível e levar à confirmação central. Criar tarefa fica junto da coleção como ação secundária. |
| P0 | A execução da História começa com planejamento do Projeto. O escopo muda dentro da página antes de apresentar a decisão atual. | `portal.tsx:315`; `story-workspace.tsx:340` | Apresentar a etapa da História primeiro; planejamento de outras Histórias vira link contextual para o Projeto/Assistente. |
| P0 | CANCELLED aparece depois de COMPLETED no ciclo e a posição marca etapas anteriores como percorridas. Isso pode sugerir aprovações sem evidência. | `story-workspace.tsx:37,323` | Cancelamento como resultado terminal separado. Cada etapa informa evidência confirmada, pendência ou ausência de cobertura. |
| P0 | Componentes mistura cadastro, GitLab e seleção de escopo na História. O Sistema hoje mostra somente sua integração, sem catálogo na aba. | `story-workspace.tsx:176,359`; `repos.tsx:14–18`; `portal.tsx:319,346` | Gestão e acesso ao repositório no Sistema; alvo técnico contextual na História, preservando os vínculos usados pelo Gateway de Especificação. Restaurar catálogo do Sistema é trabalho explícito da implementação futura. |
| P0 | Seis Tarefas fixas podem parecer um pipeline completo, embora Teste/Teste Final não tenham executores e o merge atual não os exija. | `packages/shared/src/pipeline-plan.ts:3`; estabilização, seção 5 | Expor disponibilidade e dependências reais. Definir a sequência completa em uma fase funcional própria; não anunciar essa orquestração como existente. |
| P1 | A tabela de Tarefas é inventário ordenável por datas/nome/status; sua ordem não explica a sequência dos agentes. | `story-workspace.tsx:76,110` | Sequência operacional separada da consulta. Ordenar uma tabela não muda dependências ou elegibilidade de execução. |
| P1 | Revisão aplicada, rascunho, conteúdo congelado e Gateway de Especificação precisam ser conectados pela pessoa. | `story-specification.tsx:67–71,85` | Resumo simultâneo das versões e acesso direto ao conteúdo que falta, com indicação do que o agente está usando. |
| P1 | Conversa consultiva, discussão operacional e histórico aparecem em lugares próximos com efeitos distintos. | `story-workspace.tsx:366,377`; `conversation-history.tsx` | Nomear o assunto e explicar seu efeito: conversar não aplica revisão, aprova gate ou inicia código. |
| P1 | Execução acumula assistente, ciclo, decisões, sinais, vínculos, código e release. | `story-workspace.tsx:340–385` | Etapa atual e decisão primeiro; evidências depois; detalhes técnicos por expansão e links de seção. |
| P1 | Projeções operacionais possuem recortes de 100 eventos e 200 verificações. | `apps/api/src/journey.ts:27–32` | Identificar cobertura; usar consultas próprias para percorrer o histórico. Não calcular prontidão a partir do lote exibido. |
| P2 | O acervo usa outra composição de abas e ainda apresenta Componentes. Mudar somente a História ativa deixa duas arquiteturas. | `archived-item.tsx:27,42` | Incluir acervo explicitamente na migração, mantendo somente leitura e situação registrada. |
| P2 | Um ciclo longo e muitos níveis de controles dificultam a leitura móvel. | `story-workspace.tsx`; `story-workspace.css` | Resumo compacto da etapa atual, rótulos claros, foco previsível e acesso às demais etapas sem etapas concluídas por inferência. |

Os achados acima são diagnóstico de código e contrato. Não se afirma que todos foram reproduzidos na instalação publicada. A validação no navegador desta entrega se refere ao protótipo isolado.

## 3. O que preservar

- Marca Dell Technologies / Portal SDLC, menu global, topbar/persona, breadcrumb, estado/edição e abas existentes; identidade Segoe UI/azul/navy e entrada em Tarefas.
- Uma coluna; edição central e uma única faixa Salvar/Cancelar; rascunho preservado ao consultar outras abas.
- Consulta de Tarefas no servidor em páginas de 20, filtros inicialmente recolhidos, ordenação nos cabeçalhos e retorno ao recorte.
- Comandos existentes, versões otimistas, confirmação explícita e recuperação idempotente de solicitação sem resposta.
- Fase da História, disponibilidade dos ancestrais, estado da tentativa, status das Tarefas e arquivamento como dimensões distintas.
- Situação corrente e gates independentes da página histórica, da ordenação e dos filtros.
- Sinais reais do executor: falta de heartbeat recente significa ausência de confirmação, sem inventar travamento ou percentual.
- Artefatos, revisões, pareceres e resultados anteriores preservados; novas tentativas não os substituem.

## 4. Arquitetura da informação proposta

| Lugar | Responsabilidade | Conteúdo e ações |
| --- | --- | --- |
| Shell e cabeçalho existentes | Localização e continuidade | Marca, menu, topbar/persona, breadcrumb, fase/status, Editar, título e abas nos lugares existentes. As funcionalidades continuam acessíveis. |
| Aba Execução — conteúdo principal | Fazer a História avançar | Dentro da página da História: etapa/responsável atual, pergunta ou resultado observado, informação mínima pertinente e uma ação elegível. O conteúdo da decisão é simples; o shell permanece. |
| Confirmação ou esclarecimento | Resolver a decisão atual | Substitui o conteúdo central da condução; efeito claro e confirmação explícita. Pergunta do impedimento e resposta ficam no mesmo espaço. Sem cadeia de modais ou ida obrigatória a Execução. |
| Assuntos e aprofundamentos existentes | Consultar ou editar por escolha | Tarefas, Especificação, Conversas e Mais na própria navegação local; evidências e sinais em aprofundamento. Retorno à Execução preserva o ponto e o rascunho. |
| Tarefas | Consultar e detalhar trabalho | Tabela compartilhada, filtros/contagem/paginação; distinção entre etapas obrigatórias e tarefas adicionais; atividade atual e link de retorno. Criar tarefa não inicia execução. |
| Execução — nos detalhes | Consultar a execução | Condições, tentativas, sinais observados, destino técnico, entrega/MR e associação de release. A ação de continuar retorna à condução dedicada. |
| Especificação | Preparar o conteúdo | Requisitos de negócio, critérios, dependências e plano técnico; rascunho/revisão aplicada; cobertura dos critérios; revisões anteriores. IA opcional. |
| Conversas | Consultar e esclarecer | Conversa consultiva da História; acesso à discussão operacional quando pertinente; fontes e referências. Uma mensagem não representa decisão de gate. |
| Mais → Auditoria | Rastrear decisões | Quem, ação, alvo/revisão, instante, resultado, motivo e referências seguras, mantendo filtros e snapshot da consulta. |
| Mais → Configuração | Administrar a História | Identificação, ações de ciclo permitidas e seus efeitos. Cancelar História e interromper tentativa têm confirmações distintas. |
| Sistema → Componentes | Gerir o patrimônio técnico | Catálogo dos repositórios do Sistema, integração GitLab, provisionamento e links externos de administração. |
| Releases global | Gerir a entrega composta | Criação/composição de release e, futuramente, candidatas/ambientes/G2/G3. A História só associa um DRAFT elegível existente. |

Na condução, o destaque corresponde à decisão real: **Aprovar Gateway de Especificação e enfileirar codificação**, **Confirmar orientação**, **Executar revisão** ou **Confirmar merge**, conforme a capacidade atual. A ação e sua confirmação ocupam o mesmo lugar. Durante trabalho do agente, mostrar a etapa observada e a última confirmação; não acrescentar um botão de Continuar que não tenha operação real.

O percurso completo e os detalhes da decisão podem ser consultados por escolha da pessoa. A superfície normal não exibe uma lista de condições já atendidas, o repositório, a release e o histórico simultaneamente. Mostrar apenas a referência necessária à decisão atual; por exemplo, revisão/alvo no Gateway de Especificação e SHA no merge.

Cancelamento e reabertura ficam em Detalhes → Mais → Configuração, conforme elegibilidade. Interrupção e demais alternativas mantêm seu contexto operacional. Os controles de simulação são recolhidos e identificados como ferramenta do protótipo; conclusão de agente não vira uma decisão humana de avançar.

Nos detalhes, Editar fica secundário no cabeçalho. No modo de edição, Salvar/Cancelar assumem a faixa de ações. Um rascunho ainda não aplicado permanece identificado e não muda o snapshot em execução.

## 5. Repositório no Sistema, alvo na História

`Repository` já pertence ao Sistema (`apps/api/src/app.ts:332`). `ItemRepository` identifica o escopo e a execução atual exige exatamente um repositório pronto associado à História (`execution.ts:25–26`). Esse alvo entra no fingerprint do Gateway de Especificação e é validado novamente por qualidade/merge.

Portanto, a implementação precisa:

1. Oferecer o catálogo/gestão de repositórios no Sistema. A aba atual de Sistema mostra somente a integração GitLab; remover a aba da História sem completar esse destino deixaria a gestão sem acesso.
2. Mostrar em Especificação/Execução um bloco compacto **Onde será implementada**: nome do alvo, Sistema proprietário, prontidão e link Gerenciar no Sistema. Sem URL de administração GitLab ou cadastro de repositório na História.
3. Selecionar explicitamente entre alvos já cadastrados no Sistema e dentro do escopo autorizado do Projeto, por contrato existente (`app.ts:112`). Mover a interface não amplia a elegibilidade. Nenhum alvo ou vários alvos impedem preparar a execução atual; uma sugestão única ainda precisa ser confirmada, sem associação silenciosa.
4. Preservar os vínculos persistidos. Alvo não é informação decorativa; removê-lo ou alterá-lo pode mudar o escopo aprovado.
5. Exigir revisão/Gateway de Especificação quando a mudança atingir o conteúdo congelado. Com execução ativa, manter rascunho e orientar interrupção/novo ciclo explícitos.
6. Manter links ao commit/MR específico como evidências da História. Eles não são o catálogo de repositórios.

## 6. Sequência existente e sequência a implementar

O fluxo existente permite preparar conteúdo manualmente ou com IA e aprovar Gateway de Especificação. **Aprovar Gateway de Especificação já enfileira a codificação**; não existe uma etapa de aprovação de planejamento de Tarefa entre Gateway de Especificação e código. A geração percorre contexto, geração e publicação. Depois há revisão de código, scanner de segurança e merge confirmado por SHA.

As seis Tarefas obrigatórias são Codificação, Teste, Revisão de Código, Revisão de Segurança, Teste Final e Merge de Código. Sua criação atômica não comprova a execução dessas etapas nem garante uma cadeia completa.

| Recorte | Existente | Lacuna / proposta |
| --- | --- | --- |
| Especificação → Gateway de Especificação → Codificação | Revisão/snapshot aprovados; Gateway de Especificação e enfileiramento no mesmo comando | Tornar pré-condições e efeito da confirmação claros na interface. |
| Codificação → Teste | Codificação termina com publicação confirmada de branch/SHA/MR rascunho | Teste não tem executor. Definir runtime, evidência, falha/retentativa e correlação antes de liberar essa automação. |
| Código → Review → Segurança → Merge | Review e scan possuem resultados próprios; merge exige pareceres atuais e condições GitLab | Hoje Teste/Teste Final não são exigidos pelo merge. Qualquer alteração nessa guarda exige mudança funcional explícita no backend. |
| Teste Final → Merge | Há Tarefa de planejamento | Executor e critério final ainda precisam ser definidos. Não permitir que status manual genérico substitua evidência futura. |
| Merge → Conclusão da História | Merge confirma integração e conclui sua Tarefa | Merge não conclui a História. O instante de conclusão com sucesso e os critérios posteriores continuam na revisão funcional futura. |
| Release → G2 → HML → G3 → PRD | Planejamento/associação de DRAFT | Candidatas, build, testes de ambiente e promoção não estão disponíveis. G2/G3 pertencem à release, sem gate novo de Tarefa. |

**Proposta para a revisão funcional posterior:** Codificação → Teste → Revisão de Código → Revisão de Segurança → Teste Final → Merge. A ordem precisa ser garantida por dependências e evidências no backend, preservando a regra vigente até essa entrega. A UI não resolve a lacuna apenas ordenando seis linhas.

Tarefas adicionais entram com escopo e dependências explícitos. Não participam automaticamente da codificação e não são concluídas por publicar um MR. Trabalho paralelo só é elegível se o contrato comprovar independência; o protótipo não autoriza concorrência de agentes.

## 7. Matriz de situações e próxima ação

| Situação atual | O que a pessoa vê / faz | Agente e efeito permitido |
| --- | --- | --- |
| SPECIFICATION incompleta | Objetivo, comportamento ou critério ausente; Completar especificação abre o campo pertinente | Salvar rascunho não inicia agente nem aprova Gateway de Especificação. |
| Preparação técnica | Plano manual ou opção de elaboração por IA; alvo e integrações identificados | IA elabora plano, sem autorizar código. Plano manual válido dispensa geração. |
| Dependência impeditiva pendente | Nome e motivo da dependência; ação para revisar a informação | Pode elaborar/salvar; Gateway de Especificação/código permanecem bloqueados. |
| Gateway de Especificação pendente | Revisão, alvo, critérios e escopo que serão congelados; confirmação **Aprovar Gateway de Especificação e enfileirar codificação** | Persona autorizada aprova; comando existente já coloca código na fila. |
| Codificação na fila | TO DO, motivo de espera e última observação | Sem início confirmado, não mostrar DOING nem avanço percentual. |
| Codificação em execução | Etapa observada, provedor, última confirmação e Tarefa atual | Contexto → geração → publicação; início confirmado permite DOING. |
| Sem confirmação recente | Sinal não recente, horário da última confirmação; atualizar/consultar situação | Não afirmar falha ou repetir o pedido de execução. |
| Aguardando orientação | Impedimento e discussão da atividade; revisar proposta de decisão | Confirmar a proposta de decisão operacional revisa a especificação e exige novo Gateway de Especificação. Conversa consultiva por si só não altera escopo. |
| Falha técnica recuperável | Falha, tentativa/etapa e ação de retomada elegível | Recuperar mesmo contexto/patch quando possível; preservar artefatos. |
| Código publicado | Branch, SHA, MR e resultado de Codificação | Conclui só Codificação; próxima verificação usa o código publicado. |
| Teste/Teste Final sem executor | Tarefa planejada e disponibilidade **Não disponível nesta versão** | Sem botão que finja executar teste ou evidência inventada para liberar merge. |
| Review/Segurança pendentes | Pareceres do SHA/base/política atuais; revisão antes do scan | Agentes existentes registram passed/blocked/failed/stale. Incompletude nunca aprova. |
| Achado de qualidade/segurança | Achados, referência do parecer e Solicitar correção | Novo SHA invalida review/scan/merge. Mesmo escopo não exige automaticamente novo Gateway de Especificação; mudança de escopo exige. |
| Escopo/parecer desatualizado | Revisão usada versus atual; o que mudou e quais decisões ficaram obsoletas | Não reutilizar aprovação de outra revisão. Aplicar novo conteúdo exige ciclo explícito. |
| Merge elegível | Evidências atuais e confirmação do SHA exato | Pedido, integração e confirmação remota separados; merge não conclui História/deploy. |
| Solicitação sem confirmação | Identidade da intenção pendente e Verificar a mesma solicitação | Reconciliar/repetir a mesma chave e corpo; sem nova aprovação ou duplicação. |
| Ancestral INACTIVE | Qual Sistema/Projeto/Épico impede ação; consulta permanece | Reativar e retomar são decisões distintas. Aprovação ainda válida não é descartada só pela pausa. |
| Cancelamento solicitado | Publicação externa ainda em reconciliação; novas operações bloqueadas | Preservar commit/MR eventualmente confirmados; aguardar resultado antes de CANCELLED. |
| CANCELLED | Motivo e resultados preservados; Reabrir quando elegível | Reabertura justificada volta a SPECIFICATION e exige novo Gateway de Especificação; Tarefas não reabrem automaticamente. |
| COMPLETED legado | Resultado e evidência registrados; consulta | Não deduzir todos os testes executados a partir do status. Critério futuro de conclusão segue pendente. |
| ARCHIVED | Marca de acervo separada da fase e histórico acessível | Somente leitura; consulta não restaura ou inicia operação. |
| Sem permissão / erro de consulta | Motivo específico, diferente de impedimento técnico; último resultado identificado quando existir | Projeção indisponível não libera ação e falha não vira lista vazia. |

## 8. Contratos da implementação

### Projeção de processo

Evoluir `/api/items/:id/journey` como fonte única da fase atual, atividade/tentativa, permissões, próxima ação e impedimentos. O consumidor não deve reconstruir essas decisões de `tasks.status`, da página de auditoria ou de `PHASES.indexOf`.

Uma evolução aditiva pode expor etapas com chave, disponibilidade do executor, situação observada, dependências, bloqueios e referências de evidência. Os nomes exatos devem seguir os tipos compartilhados. Decisão humana, estado da tentativa e resultado do parecer precisam continuar separados. A API e o worker revalidam a mesma elegibilidade ao executar; botão desabilitado não é controle de domínio.

### Consultas

| Coleção | Contrato preservado / evolução necessária |
| --- | --- |
| Tarefas | Própria História; busca nome/chave; filtros e ordem atuais; páginas de 20 no servidor; desempate estável; `tasks.*`; retorno ao recorte. Não reordenar por polling sem indicação. |
| Revisões de especificação | Páginas de 20 e `asOf`; revisão aplicada e rascunho independentes da página histórica; referência de execução sempre atual. |
| Conversas | Fontes próprias e referências, páginas/cursores existentes, cobertura explícita; conversa consultiva não se converte em comando. |
| Auditoria | Coleção canônica paginada, `asOf`, filtros e projeção segura; resultado legado não capturado continua assim. |
| Tentativas e verificações | Criar contrato próprio de consulta no servidor no recorte UX-C05/C06. Até lá, declarar os limites da projeção operacional; não apresentar os últimos eventos como histórico integral. |
| Seleção de alvo | Mesmo Sistema e escopo autorizado do Projeto; pesquisa/continuação quando houver volume, seleção atual preservada fora da página, versão esperada e confirmação. Sem cadastro da infraestrutura na História. |

Toda coleção distingue carregamento, atualização com último resultado, ausência confirmada, zero com filtro, erro e parcialidade. Filtros/ordem/página não modificam comandos ou etapas.

### URLs e retorno

| Link atual | Destino proposto, preservando contexto pertinente |
| --- | --- |
| Sem `tab` ou destino explícito | Tarefas, preservando a entrada existente da História. |
| `view=flow&tab=planning` | Demonstração do conteúdo simplificado da aba Execução dentro do shell do Portal. `view` é um parâmetro de prototipação, sem outro processo de negócio. |
| `tab=tasks`, `tab=overview` | Consulta de Tarefas nos detalhes, com retorno ao fluxo. |
| `tab=planning` | Evidências/condições de Execução nos detalhes, conservando o identificador já publicado e acesso à condução. |
| `tab=planning&process=action` ou `processing`, sem tentativa histórica | Condução da situação atual. Com `attempt` histórico, manter consulta nos detalhes e oferecer retorno explícito ao fluxo atual. |
| `tab=components` da História | Execução → Destino da execução; aviso curto sobre gestão no Sistema e link explícito para lá. Sem salto automático para outra entidade. |
| `tab=delivery`, `tab=releases` | Conteúdo de entrega/release em Execução. |
| `tab=activity`, `tab=manage` | Mais → Auditoria / Configuração. |
| `interact=…`, `tab=blockers` | Seção central correspondente de Execução. |
| `process=action|conversation|processing|administration|release|delivery` | Manter contratos existentes; um novo identificador de destino técnico precisa ser aditivo e testado. |

Normalizações conservam `tasks.*`, `attempt`, `returnTo` e parâmetros de coleções pertinentes. Trocar de aba remove somente parâmetros de processo incompatíveis. Voltar/avançar/recarga devem restabelecer o recorte; formulários não desmontam por consulta ou ordenação. Nunca colocar texto da especificação/conversa ou credenciais na URL.

O modo de apresentação é aditivo e não muda a fonte da jornada. Abrir detalhes não interrompe ou inicia execução. Voltar ao fluxo mantém a decisão atual e o rascunho em memória; se o processo mudou enquanto a pessoa consultava detalhes, informar a situação observada mais recente e revalidar a decisão antes de confirmar. Consultar uma tentativa antiga continua sem autorizar comandos sobre ela.

### Autoria, auditoria e concorrência

Reorganizar a apresentação reutiliza comandos e fontes existentes. Se a fase futura criar ação, dependência, executor ou decisão, deve incluir entrada no catálogo, semântica resultado/fase/decisão, autoria, iniciador, correlação e comparação anterior/nova, pelo recorder compartilhado na mesma transação. Testar rollback, replay e resposta tardia. Nada de inserir diretamente em `HistoryEvent`.

Preservar `expectedVersion`, revisão base, digest do conteúdo, `expectedLinksVersion`, SHA/base/política e intenção idempotente conforme o comando. Conflito conserva o rascunho e pede revisão explícita. Fontes de requisitos, prompts, conversas, código e resultados continuam controladas; a auditoria só projeta referências seguras. Publicação administrativa futura segue trilha externa à base alterada.

Não criar métricas de funil ou uso nesta entrega. Preservar definições de fila, processamento, espera humana, correção, retomada e reabertura já aprovadas, sem contar polling ou replay como trabalho novo.

## 9. Plano incremental de implementação

| Etapa | Entrega concreta | Arquivos/contratos principais | Critério de conclusão |
| --- | --- | --- | --- |
| HN-01 | Simplificar o miolo de Execução, preservando shell/navegação; remover Componentes; separar planejamento de Projeto | `story-workspace.tsx/css`, `portal.tsx`, `archived-item.tsx`, componentes de navegação existentes | Marca/menu/persona/breadcrumb/título/abas preservados; avançar e confirmar no painel atual; funcionalidades e rascunhos mantidos; nenhuma alteração de gate. |
| HN-02 | Destino técnico da História e gestão de repositórios no Sistema | `repos.tsx`, `portal.tsx`, `execution.ts`, vínculos existentes e catálogo do Sistema | Gestão acessível só no Sistema; vínculo explícito preservado; nenhum/múltiplos alvos explicados; alteração de escopo exige revisão adequada. |
| HN-03 | Resumo de prontidão, revisões e sequência observada | `journey.ts`, tipos compartilhados, `story-specification.tsx`, qualidade/merge | UI usa capacidades da API; Gateway de Especificação apresenta seu efeito atômico; sinais/evidências não dependem da consulta histórica. |
| HN-04 | Contratos de volume e migração dos consumidores remanescentes | Consultas de tentativas/verificações/seletores; UX-C05/C06 | Continuação real, escopo/total consistentes e registros antigos acessíveis; limites não ocultos. |
| HN-05 | Revisão funcional pós-codificação e executores de testes | Política compartilhada de dependências; workers; catálogo de auditoria | Definir escopo Teste/Teste Final, evidência, correção, reexecução e condição de merge/conclusão; garantir ordem no backend. Não faz parte da simples mudança de abas. |
| HN-06 | Revisão transversal e publicação posterior | Navegação ativa/acervo/Tarefa, regressões, padrão central e adoção | Revisão UX, teclado/móvel, contratos e gates; publicar só uma implementação validada no escopo posteriormente autorizado. |

HN-01 a HN-04 podem evoluir sem antecipar G2/G3 ou inventar testes. HN-05 depende das definições funcionais do trecho que a estabilização deixou para outra fase. HN-06 valida a cobertura de cada entrega; não transforma UX-C05–C07 em concluídos por associação.

**Dependência de publicação:** a remoção de Componentes em HN-01 depende do destino de gestão do Sistema de HN-02 disponível antes ou na mesma publicação. Preparar as partes em incrementos não autoriza um intervalo sem acesso à gestão. Conferir links legados e preservação de `ItemRepository` antes de publicar a remoção.

## 10. Decisões ainda necessárias para a fase funcional

Estas questões não bloqueiam o protótipo nem exigem decidir agora para revisar a navegação:

- O que cada executor de Teste e Teste Final executará, em qual ambiente, com qual isolamento e evidência confiável.
- Quais dependências serão obrigatórias entre tarefas adicionais e como representar independência segura.
- Como defeitos e novo SHA invalidarão Teste/Teste Final e os pareceres, sem reaproveitar resultado de outra revisão.
- Qual evento/evidência permitirá concluir a História com sucesso; merge e promoção não devem assumir isso implicitamente.
- Como tratar histórias legadas sem a trilha necessária, sem fabricar testes, aprovações ou datas retroativas.

## 11. Protótipo e roteiro de revisão

Abrir [protótipo na aba Execução em localhost:3383](http://localhost:3383/?view=flow&tab=planning&scenario=g1) ou seu [arquivo local](prototipo-historia-2026-10-26.html). Os controles de cenário pertencem à demonstração e ficam identificados fora da navegação do produto. Os dados são fixtures locais, sem consulta à API, integração GitLab ou execução de agentes.

Roteiro recomendado:

1. Abrir a História e reconhecer o mesmo Portal: marca, menu, persona, localização, título e abas. Tarefas mantém sua consulta.
2. Na aba Execução, cenário Gateway de Especificação, reconhecer a decisão atual e confirmá-la no próprio painel. O shell permanece durante a transição para fila.
3. Abrir a situação de impedimento: ler a pergunta, responder e revisar a decisão, preservando a exigência de novo Gateway de Especificação.
4. Seguir os exemplos de código publicado, revisão, segurança e merge pela mesma área de condução. Conferir a distinção entre confirmação humana e trabalho do agente.
5. Consultar ou editar os assuntos nas abas existentes e retornar à Execução com o ponto e o rascunho preservados.
6. Consultar destino técnico e Sistema, tentativas antigas e auditoria sem alterar a autorização atual. Testar filtros/ordem/páginas na consulta opcional.
7. Explorar falha, confirmação incerta, cancelamento/reabertura, acervo e falta de permissão pelo simulador recolhido; nenhum desses recortes deve fabricar aprovação ou evidência.

O protótipo demonstra a composição e as interações; não substitui testes da API, transações, agentes ou scanners. A sequência completa e os estados de conclusão são visualizações para revisão, sem declaração de implementação dos trechos futuros.

## 12. Critérios de aceite da implementação futura

- Preservar os marcos do Portal real e a entrada em Tarefas; avançar no miolo da aba Execução com etapa atual, pergunta/resultado e um CTA real.
- Confirmar no próprio espaço, sem passagem obrigatória por abas, listagem, checklist completo ou sucessão de modais. Trabalho do agente mostra o estado observado sem botão artificial de avançar.
- Detalhes são um acesso secundário com retorno explícito; preservar rascunho, consulta e foco ao sair e voltar. O fluxo atual independe da página histórica consultada.
- Gestão/URL do repositório no Sistema; alvo explícito da História preservado no Gateway de Especificação; legado `tab=components` mantém contexto e oferece destino útil.
- Uma coluna, edição central, rascunho preservado, foco visível e controles sem sobreposição em 1440×1000, 390×844 e 390×500.
- Tarefas, revisões, auditoria e conversas preservam escopo, filtro, ordem, paginação, recarga e retorno; dados além dos antigos limites permanecem acessíveis onde houver migração declarada.
- Gateway de Especificação executa o mesmo comando atômico; consultar, salvar rascunho, conversar ou ordenar não aprova, inicia agente ou conclui etapa.
- Erros de leitura/mutação, falha técnica, impedimento de domínio, falta de permissão e falta de sinal recente têm mensagens diferentes e ação pertinente.
- Conflitos, pedido incerto, replay, atraso de resposta, cancelamento durante publicação e reabertura preservam evidências e não duplicam efeitos.
- Código, review, scanner e merge usam a revisão/SHA/base/política corretos; ordenação da tabela e status manual não dispensam essas guardas.
- Cancelamento não aparece como último passo de um caminho de sucesso. COMPLETED legado não comprova etapas não observadas.
- Toda futura ação mutável usa catálogo/recorder e tem testes de rollback/retentativa; fontes controladas e trilha administrativa são preservadas.

## 13. Evidência histórica da revisão 1

Os ensaios abaixo documentam a primeira proposta, funcional mas considerada pouco fluida pelo usuário. A revisão 2 altera a prioridade e a composição da página; essas contagens não validam automaticamente a nova experiência.

A revisão de código/contrato foi concluída com dois agentes especializados, além do agente responsável pelo protótipo. A revisão final de UX aprovou desktop, celular, menu global explícito, as cinco abas visíveis em 390 px e a separação entre orientação atual, decisão e evidências.

**Validação final: 18 verificações de navegador aprovadas, 27 cenários consultáveis, zero erros de JavaScript.** O [roteiro executável](assets/historia-2026-10-26/check.mjs) e o [relatório](assets/revisao-historia-2026-10-26/report.json) registram: navegação/entrada, 24 Tarefas em páginas de 20, filtro/ordem/detalhe/retorno/recarga, estados de consulta, G1 atômico, edição e rascunhos, link legado de Componentes, retorno do Sistema, correção e merge, decisão operacional com novo G1, revisão 4 preservada na fila, cancelamento antes de publicação, rascunho de alvo/mensagem, contagem após tarefa adicional, intenção incerta, reabertura, permissões/acervo/tentativa histórica, teclado/diálogos e redução de movimento. O caminho secundário de condições de G1 em tentativa histórica também foi validado sem oferecer aprovação.

Viewports conferidos: 1440×1000, 390×844, 390×500 e 780×844, sem estouro horizontal do documento. As Tarefas mantêm tabela com rolagem identificada; a página usa rolagem normal. Capturas: [Tarefas desktop](assets/revisao-historia-2026-10-26/tarefas-desktop.png), [Execução desktop](assets/revisao-historia-2026-10-26/execucao-desktop.png), [Tarefas celular](assets/revisao-historia-2026-10-26/tarefas-390-844.png), [impedimento celular](assets/revisao-historia-2026-10-26/impedimento-mobile.png), [Sistema celular](assets/revisao-historia-2026-10-26/sistema-mobile.png) e [menu celular](assets/revisao-historia-2026-10-26/menu-mobile.png).

A sintaxe dos scripts foi conferida com Node. O navegador fez somente 168 GETs dos arquivos estáticos da própria prévia, incluindo recargas dos cenários; nenhuma requisição à API, GitLab, modelos ou outros destinos. O servidor da prévia aceita somente arquivos explícitos, sem API ou escrita, e está separado do Portal em `http://localhost:3383`, no contêiner `sdlc-history-prototype-20261026`, usando a imagem de navegador já preparada e montagem de fontes somente leitura. O [servidor estático](assets/historia-2026-10-26/serve.mjs) não publica a implementação no Portal.

Os dados e as alterações simuladas ficam em memória e reiniciam ao recarregar; a URL restaura o cenário e o recorte de consulta, sem prometer persistência de decisões ou rascunhos entre sessões. As operações de reconciliação são representações locais, sem validação de transações ou efeitos remotos. A barra de cenários é ferramenta da demonstração e não deve ser incorporada à página real.

A aplicação real e o acervo ainda usam a navegação anterior; HN-01–HN-06 são backlog proposto. UX-C05, UX-C06 e UX-C07 conservam adoção parcial. Nenhuma API, worker, migration, dado de negócio ou aplicação produzida pelo SDLC foi alterado nesta entrega.

Leitor de tela em hardware, teclado nativo móvel, testes de execução real, autenticação corporativa e conformidade WCAG completa não são comprovados por esta prévia. Nenhuma aplicação produzida pelo SDLC ou resultado de agente deve ser alterado para demonstrar a proposta.

## 14. Evidência histórica da revisão 2 — não aceita pelo usuário

O usuário rejeitou esta composição por descaracterizar o sistema. Os ensaios abaixo continuam como registro técnico; não validam a remoção do contexto do Portal nem autorizam sua implementação.

A segunda versão então apresentada abria diretamente na condução, conforme a [captura histórica](assets/revisao-historia-2026-10-26/v2/fluxo-g1-desktop.png). Etapa, pergunta/resultado e ação principal ocupavam uma única área, mas o shell do Portal era ocultado, motivo da rejeição do usuário. G1, orientação ao agente, revisão, segurança e merge confirmavam no próprio espaço. Durante fila/execução, a superfície apresentava o estado observado, sem ação artificial de avançar.

Detalhes da história abre a consulta por abas, com retorno explícito ao fluxo. Esclarecimento, rascunho, consulta e conteúdo de uma confirmação em andamento são preservados ao aprofundar. A preparação essencial tem campos na própria condução; objetivo vazio impede continuar, preparar conteúdo não aprova G1 e conflito de revisão exige conciliação. Cancelamento/reabertura ficam na configuração dos detalhes. Percurso e exploração de situações são escolhas secundárias; respostas dos agentes só avançam pelos controles identificados como simulação.

**Rodada daquela revisão: 17 verificações aprovadas, 27 cenários consultados, zero erros de JavaScript.** O [roteiro preservado da revisão 2](assets/historia-2026-10-26/check-flow-v2.mjs) e o [relatório específico](assets/revisao-historia-2026-10-26/v2/report.json) cobrem:

- Entrada isolada sem menu lateral, abas, tabela ou trilho; G1 e confirmação inline.
- Percurso G1 → fila → codificação → revisão → segurança → merge na mesma superfície. As respostas de agentes são simuladas somente no explorador recolhido; as tarefas correspondentes recebem o estado observado, sem fabricar DONE para Teste/Teste Final ou concluir a História.
- Detalhes durante uma confirmação, esclarecimento preservado e orientação operacional exigindo novo G1.
- Objetivo obrigatório, preparação sem aprovação implícita e conflito preservando o rascunho.
- Cancelamento em reconciliação e confirmação posterior cancelando as tarefas abertas.
- Paginação, busca sem resultado, falha de consulta, retorno do Sistema e parâmetros de contexto preservados nos detalhes.
- Tentativa histórica e persona de consulta sem aprovação; teclado e redução de movimento.
- Desktop 1440×1000, celular 390×844, altura reduzida 390×500 e largura intermediária 780×844, sem estouro horizontal.

No celular 390×844, a ação inicial de G1 ocupa os pixels verticais 523–569. A confirmação de G1 também cabe integralmente no primeiro viewport, verificada no navegador. Na altura reduzida de 500 px, a página admite rolagem normal para alcançar a decisão. A revisão final de UX aprovou a entrada, a confirmação e o impedimento, em desktop e celular, com um único assunto central e detalhes opcionais.

Capturas da revisão 2: [entrada desktop](assets/revisao-historia-2026-10-26/v2/fluxo-g1-desktop.png), [entrada celular](assets/revisao-historia-2026-10-26/v2/fluxo-390-844.png), [confirmação celular](assets/revisao-historia-2026-10-26/v2/confirmacao-390-844.png), [agente em execução](assets/revisao-historia-2026-10-26/v2/fluxo-agente-desktop.png) e [impedimento celular](assets/revisao-historia-2026-10-26/v2/fluxo-impedimento-mobile.png).

A sintaxe JavaScript e as diferenças foram conferidas. O navegador fez somente 189 GETs dos arquivos estáticos da própria prévia: nenhuma API, modelo ou integração foi acionado. Fontes, servidor e isolamento continuam os mesmos; dados simulados são mantidos em memória. A validação de API/transações, execução de agentes reais, leitor de tela e teclado nativo móvel permanecem fora desta evidência.

Esta revisão substitui a hipótese de entrada em Tarefas do primeiro protótipo. A aplicação publicada, os comandos e os dados do SDLC permanecem preservados; HN-01–HN-06 seguem como proposta de implementação. UX-C05–C07 mantêm sua adoção parcial. Aceite técnico/UX desta prévia não representa aprovação do usuário para aplicar ou publicar o novo fluxo.

## 15. Revisão 3 — execução simples dentro do Portal existente

A correção foi guiada pela tela real em `localhost:3310` e pelo código de `portal.tsx`, `styles.css`, `navigation.css` e `story-workspace.tsx`. A [referência visual](assets/revisao-historia-2026-10-26/v3/portal-reference-desktop.png) e os [marcos capturados](assets/revisao-historia-2026-10-26/v3/portal-reference.json) registram marca Dell Technologies / Portal SDLC, sidebar de 228 px, cinco destinos globais, topbar Planejamento e entrega e seletor de persona. A captura da referência foi somente leitura, com todas as escritas à API bloqueadas no navegador; nenhuma foi solicitada.

O protótipo conserva esse shell, o breadcrumb hierárquico, a fase/estado, Editar/Criar tarefa, o título e as cinco abas. **Tarefas voltou a ser a entrada.** A aba **Execução** contém a etapa atual e sua confirmação inline em um painel padrão do sistema. A marca própria e a tela paralela da revisão 2 foram retiradas da proposta. Abrir os outros assuntos usa a navegação local existente e preserva rascunhos e o ponto da execução.

Nome e descrição continuam editáveis; criar tarefa, consultar registros e selecionar persona permanecem acessíveis. Durante a edição, somente o formulário central fica montado, com cabeçalho e abas preservados. Salvar/descartar não aprova G1 nem inicia trabalho; a confirmação operacional volta apenas após sair do formulário. As guardas existentes de permissão, versão, tentativa histórica, cancelamento e revisão continuam representadas nas fixtures.

**Rodada final: 21 verificações aprovadas, 27 cenários consultados e zero erros de JavaScript.** O [roteiro atual](assets/historia-2026-10-26/check-flow.mjs) compara a marca, os destinos e a largura do menu com a referência real e exercita edição/criação, persona, navegação, rascunhos, confirmação inline e as transições já cobertas na revisão anterior. A validação do protótipo realizou somente 204 GETs dos próprios arquivos estáticos, sem API, modelo ou integração; o [relatório da revisão 3](assets/revisao-historia-2026-10-26/v3/report.json) mantém os resultados separados dos históricos.

Capturas: [Execução no Portal — desktop](assets/revisao-historia-2026-10-26/v3/fluxo-g1-desktop.png), [confirmação no mesmo painel](assets/revisao-historia-2026-10-26/v3/confirmacao-g1-desktop.png), [celular com contexto preservado](assets/revisao-historia-2026-10-26/v3/fluxo-390-844.png) e [impedimento](assets/revisao-historia-2026-10-26/v3/fluxo-impedimento-mobile.png). Os quatro viewports permanecem sem estouro horizontal. No celular, o contexto do sistema é mantido e a decisão pode exigir rolagem normal; a antiga meta de caber tudo na primeira tela não autoriza ocultar o Portal.

Comparação técnica com a tela real confirmou a presença dos marcos existentes. Isso não representa aceite do usuário. Na entrega do protótipo, o código de aplicação em `sdlc/portal/apps`, schema/migrations e pacotes de negócio não recebeu alterações; somente protótipo, validação e documentação foram modificados. A prévia continua isolada em [localhost:3383, aba Execução](http://localhost:3383/?view=flow&tab=planning&scenario=g1). Dados são fictícios e as alterações da demonstração permanecem em memória. O pedido posterior “Implementa no portal real” autoriza a implementação descrita a seguir; UX-C05–C07 continuam parciais.

## 16. Implementação no portal real

O recorte implementa HN-01 e a apresentação de HN-02, preservando a identidade e os contratos existentes. A História mantém Tarefas como entrada e cinco abas: Tarefas, Execução, Especificação, Conversas e Mais. O painel de Execução mostra a etapa observada, a próxima ação elegível e sua confirmação inline. Sinais, conversa, vínculos de escopo, destino e release abrem sob demanda; formulários e consultas preservam seus rascunhos. A Tarefa mantém seu próprio planejamento, status, tentativas e resultados.

Repositórios são geridos em Sistema → Componentes, com criação, vínculo GitLab e retentativa existentes. A História usa “Onde será implementada” para selecionar repositórios já registrados e permitidos no Projeto. Sua antiga URL `tab=components` abre esse destino e preserva filtros; a História arquivada apresenta somente o destino registrado e o acesso ao Sistema. Nenhum vínculo é removido ou criado pela navegação. A seleção conserva a versão observada e exige revisão explícita se outra atualização ocorrer durante a edição.

G1 passa a ser apresentado como **Gateway de Especificação** nos textos do sistema. Identificadores, conteúdo dos agentes, planos, erros de origem e eventos históricos permanecem. “Revisar aprovação” abre a confirmação com História e destino; “Aprovar e enfileirar codificação” envia o comando existente, após o aceite explícito. Mudança de persona, versão, execução, corpo ou capacidade invalida a confirmação. Pedido incerto mantém a intenção original e bloqueia alteração de destino; o cabeçalho oferece retorno à reconciliação mesmo durante a consulta de detalhes.

HN-03 reutiliza as capacidades, sinais e referências que já existem; não acrescenta uma projeção nova de prontidão/revisões. HN-04 e HN-05 continuam pendentes. HN-06 cobre este recorte, sem declarar concluídas a validação assistiva integral ou as pendências UX-C05–C07. Teste/Teste Final continuam sem executor; integração de código não comprova testes, deploy ou conclusão da História.

**Validação final:** 73 cenários distintos de navegador aprovados, sem falhas, skips ou flakiness, em dez suítes: `story-flow`, `story-workspace`, `story-task-planning`, `story-execution`, `story-experience`, `planning-lifecycle`, `conversation-history`, `releases`, `hierarchy` e `stabilization`. O [relatório](assets/implementacao-historia-2026-10-26/validation.json) registra cada caso. Também passaram 21 testes de aplicação — 13 de jornada e oito de catálogo/recorder de auditoria —, tipos da web/API, build de produção e diferenças. Revisão UX conferiu shell, contexto, decisão, confirmação, foco e desktop/celular; os 14 casos de `story-flow` cobrem também concorrência do destino, pedido incerto e acervo. Os cenários usam somente `portal_test` e/ou APIs interceptadas; dados reais, aplicações produzidas e resultados de agentes da instalação humana não são fixtures. Casos antigos de hierarquia/releases foram alinhados à estabilização vigente, sem aprovar Projetos nem arquivar Sistemas ativos para limpar testes. A fixture de consulta da associação de release foi completada, sem alterar a API.

Capturas da aplicação compilada com fixtures isoladas: [Execução desktop](assets/implementacao-historia-2026-10-26/story-flow-desktop.png), [confirmação desktop](assets/implementacao-historia-2026-10-26/story-flow-gateway-confirmation-desktop.png), [celular](assets/implementacao-historia-2026-10-26/story-flow-gateway-confirmation-390-844.png), [altura reduzida](assets/implementacao-historia-2026-10-26/story-flow-gateway-confirmation-390-500.png) e [edição de Tarefa preservada](assets/implementacao-historia-2026-10-26/task-central-edit-mobile.png). Não há comprovação de teclado nativo móvel ou certificação integral com leitor de tela.

**Publicado em [localhost:3310](http://localhost:3310) às 16:31 de 26/10/2026 (America/Sao_Paulo).** Somente o serviço web foi recriado, imagem `80091d7f2448`, origem `382a7be37eb87db663f1ef0d8f8e58e3f58030648bd7f85ca363aaf743415dac`; saúde `ready/preview`. API/worker e schema permanecem. Comparação de contagens e impressões confirmou os registros idênticos nas 30 tabelas. Backup privado de 128.279 bytes, digest e leitura do arquivo verificados; imagem anterior e manifesto disponíveis para reversão. `PORTAL_PUBLICATION` foi registrado pelo recorder administrativo fora do banco; a trilha terminou com 78 registros válidos e nenhuma operação pendente. Os textos do fluxo foram conferidos nos bundles servidos. A checagem final no navegador da instalação publicada foi somente leitura, com gestão no Sistema disponível, controles sem persona desabilitados, zero escritas tentadas e zero erros de página. O [registro de publicação](assets/implementacao-historia-2026-10-26/publication.json) contém apenas metadados seguros. Recursos descartáveis de validação foram removidos; a prévia HTML permanece separada.

## 17. Correção do destino obrigatório para preparar especificação

O relato de botão bloqueado mesmo com Ana selecionada revelou uma pendência real de configuração e um caminho incompleto na interface. A consulta da História confirmou `permissions.canAct=true`, integrações disponíveis e ação `prepare.enabled=false` por falta de um repositório pronto associado. O Sistema e o Projeto daquele contexto estavam sem repositórios cadastrados/selecionados. Não se tratava de trocar persona. A API exige um destino explícito antes de preparar; seus requisitos permanecem.

A lacuna de navegação era a ausência de seleção de escopo em Projetos já existentes. Projeto → Configurações agora apresenta **Repositórios no escopo do Projeto**, usando o componente compartilhado e o PATCH já existente. O Projeto pode permitir vários componentes; a História escolhe um pronto entre os permitidos. Cadastro/criação/vínculo GitLab continuam no Sistema. Não há seleção automática nem nova regra de negócio.

Na História, a preparação sem destino mostra uma explicação associada ao botão desabilitado e oferece **Configurar destino da implementação**. O detalhe aponta para o cadastro no Sistema e a seleção no Projeto, com retorno interno ao destino da História e seus filtros. Lista vazia não abre formulário de seleção vazio e não é descrita como falha de permissão. Os campos e o salvamento de uma seleção já aberta ficam bloqueados se a persona perder permissão; o rascunho e a versão observada são mantidos. Navegar, selecionar e retornar não enviam `prepare`, não aprovam o Gateway e não iniciam agentes.

**Validação:** revisão UX pontual, tipos/build de produção, oito verificações do catálogo/recorder de auditoria e **76 cenários distintos de navegador aprovados**, sem falhas, skips ou flakiness. Os três casos novos cobrem Ana autorizada com destino ausente, Projeto existente selecionando múltiplos componentes seguido da escolha de um na História e perda de permissão durante a seleção. O [relatório](assets/correcao-destino-historia-2026-10-26/validation.json) mantém os casos, com APIs interceptadas e/ou `portal_test`. Capturas isoladas: [pendência e ação de configuração](assets/correcao-destino-historia-2026-10-26/preparacao-bloqueada-destino.png) e [escopo de Projeto existente](assets/correcao-destino-historia-2026-10-26/configuracao-escopo-projeto.png). O ajuste cobre essa lacuna de HN-02; UX-C05–C07 e os executores futuros permanecem parciais.

**Publicado em 26/10/2026, 17:14 (America/Sao_Paulo):** somente web atualizado, imagem `5e3a207f9491`, origem `4403c1f65fbbdbc751b8b8a34b64f0245175c2d037f4a25c931f6e68df530430`; saúde `ready/preview` em `localhost:3310`. API preservada e sem migrations. Backup privado de 128.279 bytes verificado, imagem/manifesto anteriores disponíveis para reversão e comparação idêntica das 30 tabelas. A ação administrativa existente `PORTAL_PUBLICATION` registrou preparação/publicação na trilha externa, encerrada com 82 registros válidos e nenhuma operação pendente. Na História do relato, o navegador com Ana confirmou a pendência e percorreu História → Projeto → Sistema → retorno à História, com escritas bloqueadas, zero escritas tentadas e zero erros. Nenhum repositório real foi cadastrado ou associado, e nenhum agente foi iniciado. O [registro seguro de publicação](assets/correcao-destino-historia-2026-10-26/publication.json) mantém essas verificações. Recursos descartáveis de teste foram removidos após recolher a evidência.

## 18. Repositório único criado no cadastro do Sistema

Decisão posterior e explícita do usuário: **um repositório por Sistema**, criado no cadastro; APIs, frontend, backend, batch e infraestrutura são pastas organizadas pela arquitetura dentro dele. Substitui o catálogo de vários componentes e as seleções de Projeto/História das seções anteriores. A identidade visual, a entrada em Tarefas, a confirmação inline e os gates permanecem.

O cadastro grava Sistema, repositório neutro, referências QA/HML/PRD e pedido de provisionamento na mesma transação. O efeito GitLab é assíncrono e confirmado por estado/URL; o template `generic` contém somente README, gitignore e contrato SDLC, sem impor stack, diretórios de aplicação, CI ou deploy. A API e o índice único de `Repository.systemId` recusam duplicidade. Repositórios Node/Python e seus conteúdos existentes não são reformatados. Múltiplos repositórios legados fazem a migração recusar de forma atômica, preservando todas as linhas para revisão explícita.

Todos os níveis resolvem o destino pela propriedade do Sistema. A herança é usada na consulta, contexto do Assistente, planos, preparação/snapshot, associação de trabalho, qualidade e merge; GETs não materializam vínculos. Os seletores de repositórios foram retirados dos formulários e da revisão de propostas. Campos de propostas antigas e `ItemRepository` permanecem preservados para histórico/compatibilidade, sem permitir nova escolha de destino. Detalhar Tarefas e preservar sua condição de conclusão continua separado da propriedade do repositório.

Sistemas já cadastrados sem repositório têm recuperação explícita no Sistema ativo com permissão. A adequação administrativa usa plano de IDs/versões e correlação externa, o mesmo recorder e a ação catalogada `REPOSITORY_REQUESTED`; não há preenchimento retroativo em GET ou bootstrap. O worker preserva o iniciador do envelope original. Em manutenção sem identidade humana capturada, isso é identificado no registro, sem atribuir a autoria à Ana.

**Validação:** 317 testes distintos de aplicação aprovados; quatro integrações externas opt-in não executadas. A cobertura inclui cadastro automático/replay concorrente, unicidade por API e banco, herança sem escrita na consulta, rollback de transação por falha na auditoria, retentativa e preservação de repositórios ambíguos ao recusar a migração. [Relatório de aplicação](assets/repositorio-unico-2026-10-26/application-validation.json). Tipos de API/web, build de produção, revisão UX/acessibilidade do recorte e diferenças passaram. Os [76 cenários de navegador](assets/repositorio-unico-2026-10-26/validation.json) cobrem formulário, acervo, Tarefas, histórico, releases e nova herança, além de 12 cenários distintos de revisão/fluxo do Assistente aprovados. As fixtures usam somente `portal_test` ou APIs interceptadas. Não se declara validação assistiva completa, novos executores de Teste/Teste Final ou promoção de ambientes; UX-C05–C07 permanecem parciais.

**Publicação concluída em 26/10/2026, 17:44 (America/Sao_Paulo):** API/web `5f693f72bad1`, origem `ec502f55d88c1f11b5f1347e7c090803a339145fa12955cf325dac316d87735c`, saúde `ready/preview`. A migração `202610260001_system_repository` foi aplicada após backup privado verificado e parada das novas entradas/workers ociosos. As 30 tabelas mantiveram exatamente seus registros antes da adequação explícita. Imagens anteriores e manifesto foram preservados; o rollback da aplicação não apaga dados ou repositórios e exige cuidado com provisionamentos pendentes. Não foi feita reversão destrutiva de banco ou recurso GitLab.

Às 17:45, a adequação autorizada identificou um Sistema ativo sem repositório e criou seu único destino neutro: [Gestão de Video Locadora no GitLab](http://127.0.0.1:3180/sdlc/vidloc/app), estado **READY**. Foram acrescentados o repositório, as três referências de ambiente e a auditoria própria; hashes de todas as linhas anteriores das 30 tabelas foram comparados e preservados. Nenhum vínculo de Projeto/História precisou ser editado e nenhum agente de História foi iniciado. Na verificação final somente leitura, Sistema/Projeto/Épico/História retornaram o mesmo repositório, os seletores estavam ausentes e **Preparar especificação ficou habilitado para Ana** na História do relato. O navegador bloqueou qualquer escrita e registrou zero escritas tentadas/erros. Preparação de imagem, publicação e adequação usaram o recorder administrativo externo com `PORTAL_PUBLICATION`; a cadeia terminou com 88 registros válidos e nenhuma operação pendente.

O [registro seguro de publicação](assets/repositorio-unico-2026-10-26/publication.json) e a [rodada adicional do Assistente](assets/repositorio-unico-2026-10-26/additional-browser-validation.json) completam a evidência: **88 cenários distintos de navegador aprovados**. Recursos de teste descartáveis foram removidos após a coleta; a prévia conceitual permanece separada. O bootstrap e as consultas não fazem adequação retroativa automática em outras instalações.

## 19. Correção da publicação GitLab e do contexto dos agentes — 27/10/2026

O HTTP 400 ocorreu na publicação de uma correção da História “Formulário de Criação e Edição de Filmes”. Após nova aprovação do Gateway de Especificação, a amostra de contexto vinha da branch principal e continha apenas o README. A integração usava essa amostra para decidir entre criar e atualizar arquivos, embora quatro caminhos do patch já existissem na revisão publicada. O log confirmou a rejeição do POST de commits; o corpo detalhado da resposta não foi persistido. A revisão da branch permaneceu igual à esperada.

A integração agora consulta cada caminho na revisão imutável usada para publicar: arquivo existente gera atualização com `last_commit_id`; somente HTTP 404 confirmado gera criação. Falha de leitura ou metadado incompleto interrompe a publicação. O HEAD é conferido novamente antes do envio. Isso protege contra mudanças observadas, sem afirmar uma transação distribuída entre consultas e commit. Marcador de execução e hash do patch permitem reconciliar resposta perdida sem duplicar o commit. Não há force, reset ou contorno das proteções da branch.

Os agentes de codificação recebem o código da revisão efetivamente publicada ao gerar correções, inclusive depois de nova discussão/aprovação. O prompt distingue a revisão-base da revisão atual; a base de comparação fica preservada. O modelo fornece caminhos e conteúdo, enquanto a integração determina a operação GitLab. Mudança da base ou revisão divergente impede geração/publicação. A solicitação de correção deixou de reconstruir contexto por uma mistura de amostras. A retomada de falha na publicação reutiliza o patch salvo e mantém permissões, gates e verificações de revisão.

**Validação:** [330 testes de aplicação aprovados](assets/correcao-publicacao-gitlab-2026-10-27/application-validation.json), quatro integrações externas opt-in não executadas e [21 cenários de navegador aprovados](assets/correcao-publicacao-gitlab-2026-10-27/validation.json), sem falhas. A cobertura inclui metadados ausentes/inválidos/recusados, criação e atualização independentes da amostra, alteração de HEAD, resposta perdida, revisão correta para o agente e retentativa sem regeneração. Tipos, catálogo/recorder de auditoria, build de produção e diferenças passaram. Fixtures permaneceram em banco isolado ou APIs interceptadas; recursos descartáveis foram removidos após a coleta. Não houve mudança de interface nem declaração de migração de telas.

**Publicação concluída em 27/10/2026, 09:55 (America/Sao_Paulo):** API `ccfb4b47b776`, origem `ae00be6c8f95cc18e06482fc230b0de8309ee63e7e85117d7cf97c39267ff8bc`, saúde `ready/preview` em `localhost:3310`. Web mantida na imagem `5f693f72bad1`; sem migrations. Backup privado de 153.398 bytes com digest e leitura verificados; imagem e manifesto anteriores disponíveis para reversão. A comparação preservou as linhas anteriores das 30 tabelas, excluindo apenas campos operacionais de lease/checagem de `MergeOperation`; a impressão integral não ficou idêntica devido à atividade operacional. Não se afirma igualdade byte a byte de todas as tabelas. A trilha administrativa externa de `PORTAL_PUBLICATION` terminou com 92 registros válidos e nenhuma operação pendente. As ações de execução e qualidade reutilizam o catálogo e o recorder existentes, sem reescrever eventos antigos.

Na [conferência somente leitura da instalação publicada](assets/correcao-publicacao-gitlab-2026-10-27/live-preview.json), o construtor real preparou **quatro atualizações protegidas e duas criações** para o patch da execução que falhou. O envio foi interceptado antes da rede: zero escritas enviadas, patch/snapshot/estado/revisão inalterados. Nenhum resultado de agente ou código da aplicação foi editado para demonstrar a correção. A execução permanece disponível para **Retomar execução** pelo portal; não se declara que o commit foi enviado ou que a História concluiu. O [registro seguro de publicação](assets/correcao-publicacao-gitlab-2026-10-27/publication.json) reúne a evidência.
## 20. Indicador de fase visível na História e nas Tarefas — 27/10/2026

O indicador visual do **Ciclo da História** estava no componente compartilhado, mas a condição de renderização o restringia à Tarefa individual. A correção remove somente essa restrição: a História já apresenta a faixa no cabeçalho ao entrar em Tarefas, e ela permanece em Execução, Especificação, Conversas, Mais e no aprofundamento em Tarefas. O formulário central mantém seu cabeçalho próprio enquanto aberto. A fase vem da jornada atual e não da tentativa histórica consultada. Etapas não se tornam comandos nem dispensam gates; permissões, estados, código produzido e resultados dos agentes permanecem sob seus contratos existentes.

A revisão por agente de UX aprovou o reaproveitamento do indicador, mantendo identidade visual, números/texto, `aria-current="step"`, rolagem horizontal própria e centralização da etapa atual no celular. Não há novo painel de ciclo no miolo da aba Execução. O [padrão central](../portal/docs/PADROES_DE_EXPERIENCIA.md) registra o contrato; HN-01 recebe esta correção de visibilidade. UX-C05–C07 e os executores futuros continuam parciais; o acervo não foi adaptado neste recorte.

**Validação:** [38 cenários de navegador aprovados](assets/ciclo-historia-2026-10-27/validation.json), sem falhas, skips ou flakiness, nas suítes `story-workspace` e `story-flow`. Os casos novos verificam entrada na História, cinco abas, abertura de Tarefa, retorno, recarga, etapa atual dentro da área visível e ausência de comandos em 1440 e 390 pixels. Fixtures de Conversas/Auditoria foram completadas para esse percurso, sem alterar APIs ou dados reais. Tipos da API/web, build de produção e diferenças passaram. Validação assistiva integral e teclado nativo móvel permanecem fora deste recorte.

**Publicado em 27/10/2026, 11:34 (America/Sao_Paulo):** somente web, imagem `b5bcb9c76f6f`, origem `fa5e292903805e98c7036ab0c707e31e04fe55a94dd449508d38623d48804ca1`; API `ccfb4b47b776` preservada e sem migrations. Saúde `ready/preview`; backup privado de 160.623 bytes com digest e leitura verificados, imagem/manifesto anteriores para reversão. As impressões de negócio das 30 tabelas foram preservadas, excluindo apenas campos operacionais de lease/checagem de `MergeOperation`; a impressão integral variou com a atividade operacional. O recorder administrativo externo registrou `PORTAL_PUBLICATION`; 98 registros válidos, nenhuma operação pendente. [Registro seguro](assets/ciclo-historia-2026-10-27/publication.json).

Na [conferência somente leitura da instalação real](assets/ciclo-historia-2026-10-27/live-validation.json), a História do relato e sua Tarefa exibiram a mesma fase observada **SECURITY SCAN**, com a etapa atual visível em desktop/celular, sem alargar a página, zero escritas tentadas e zero erros de página. Capturas: [História desktop](assets/ciclo-historia-2026-10-27/story-1440.png), [História celular](assets/ciclo-historia-2026-10-27/story-390.png), [Tarefa desktop](assets/ciclo-historia-2026-10-27/task-1440.png) e [Tarefa celular](assets/ciclo-historia-2026-10-27/task-390.png). Nenhum agente foi iniciado por essa conferência. O container descartável de teste foi removido após a coleta.
## 21. Merge Request na faixa do ciclo — 27/10/2026

Por solicitação do usuário, a faixa gráfica deixa de apresentar **Cancelled** como décima etapa e passa a apresentar **Merge Request** entre Security Scan e Testing. A sequência tem dez posições, terminando em Completed. Cancelled continua como estado alternativo no cabeçalho, ciclo de vida, comandos e histórico; não é convertido em etapa concluída. A lista visual foi separada dos estados de negócio para não criar um status persistido de merge nem retirar o cancelamento do ciclo de vida.

O destaque Merge Request usa a atividade corrente `current.kind=merge` nas fases anteriores a Testing. Não depende da existência de URL do MR, que já pode existir antes das revisões; não substitui cancelamento nem fases posteriores. O merge confirmado continua identificado pela situação da jornada, sem inferir testes executados ou conclusão da História. A centralização da faixa também observa mudanças da atividade, mesmo sem troca do status persistido. A revisão de UX aprovou posição, separação de estados e preservação do componente existente. HN-01 incorpora o ajuste; UX-C05–C07 e executores futuros continuam parciais.

**Validação:** [41 cenários de navegador aprovados](assets/etapa-merge-request-2026-10-27/validation.json), sem falhas, skips ou flakiness; tipos API/web, build de produção e diferenças passaram. A cobertura inclui dez posições, Merge Request na posição 6, ausência de Cancelled na faixa, destaque correto de merge e preservação de Testing/Cancelled, navegação História/Tarefa, abas e recarga em desktop/celular. Todas as fixtures permanecem interceptadas e isoladas. Validação assistiva integral e teclado nativo móvel não foram realizados.

**Publicado em 27/10/2026, 12:05 (America/Sao_Paulo):** somente web `25bf7f674527`, origem `65e95e428a5ebf0bc0b5ab89e52cd1d97841c76a67b26c0f9aac07425b6b0171`; API preservada, sem migrations, saúde `ready/preview`. Backup privado de 160.624 bytes com digest/leitura verificados, imagens/manifesto anteriores disponíveis para reversão. As impressões integrais das 30 tabelas ficaram idênticas durante a publicação. `PORTAL_PUBLICATION` usa o recorder administrativo externo; 102 registros válidos e nenhuma operação pendente. [Registro seguro](assets/etapa-merge-request-2026-10-27/publication.json).

A [conferência somente leitura](assets/etapa-merge-request-2026-10-27/live-validation.json) confirmou a sequência e a etapa observada **MERGE REQUEST** na História real e em sua Tarefa, em 1440 e 390 pixels, sem overflow, escritas tentadas ou erros de página. Capturas: [História desktop](assets/etapa-merge-request-2026-10-27/story-1440.png), [História celular](assets/etapa-merge-request-2026-10-27/story-390.png), [Tarefa desktop](assets/etapa-merge-request-2026-10-27/task-1440.png) e [Tarefa celular](assets/etapa-merge-request-2026-10-27/task-390.png). Nenhum agente foi iniciado, status alterado ou resultado editado para demonstrar a alteração. O container descartável foi removido após a coleta.
## 22. Impedimento de merge e orientação na Execução — 27/10/2026

O relato foi confirmado na História “Formulário de Criação e Edição de Filmes”: a integração estava `blocked`, com categorias `draft` e `checks` (`draft_status`). A proposta já possui MR; o pedido ao assistente tenta integrar esse MR e não pode fazê-lo enquanto estiver em Draft. A jornada já retornava motivo e título de impedimento, mas o texto simples e o botão de nova solicitação não tornavam a pendência nem sua solução suficientemente visíveis. A consulta foi somente leitura; não se retirou Draft, não se solicitou merge e nenhum código/resultado de agente foi modificado.

A ação corrente da História e da Tarefa agora apresenta o componente `MergeImpediment` antes da retentativa, com `ErrorState`, ícone, título **Merge impedido**, motivos confirmados, **Como resolver**, acesso ao GitLab e conversa contextual. Draft orienta revisão/liberação por pessoa responsável no GitLab. Categorias de pipeline, conflito, alteração da revisão, discussões, encerramento, acesso e verificações têm orientações específicas; categorias desconhecidas preservam o motivo de origem e encaminham à consulta/conversa, sem inventar solução. A orientação genérica de checks é deduplicada quando há instrução específica de Draft/pipeline/discussão; os motivos originais ficam visíveis.

A nova tentativa chama-se **Reavaliar e solicitar merge**, mantendo comando, autoria, corpo, revisão, gates e confirmação existentes. Pedido pendente conserva sua chave e a reconciliação própria; a mudança do rótulo não envia outro comando. Resultado `failed` orienta verificar/reconciliar sem afirmar um bloqueio confirmado. Falha de consulta preserva o último diagnóstico com aviso de situação não confirmada e ações indisponíveis. Tentativas históricas e outras Tarefas continuam separadas da ação corrente. A revisão de UX aprovou diagnóstico expandido, posição antes do botão, acesso contextual, estados distintos e celular. O recorte adapta a área corrente de História/Tarefa; não declara a migração do componente legado de merge fora desse fluxo.

**Validação:** [44 cenários de navegador aprovados](assets/impedimento-merge-2026-10-27/validation.json), sem falhas, skips ou flakiness, nas suítes `story-workspace` e `story-flow`. A cobertura adicional verifica Draft e checks simultâneos, instrução visível antes da retentativa, confirmação obrigatória sem escrita ao abrir, História/Tarefa em 1440/390 pixels, falha de consulta com diagnóstico preservado, resultado desconhecido e retirada do diagnóstico quando a situação muda. Os demais cenários mantêm rascunhos, permissões, histórico e pedidos incertos. Tipos API/web, build de produção e diferenças passaram. Fixtures interceptadas sem credenciais ou rede externa; não há alegação de validação assistiva integral ou execução de integração externa nessa rodada.

**Publicado em 27/10/2026, 12:26 (America/Sao_Paulo):** somente web `3134f13ebb6d`, origem `9fa5028c440e474e79c6230bc8087f912ca172f47de9d2b24dee7a7822880907`; API preservada, sem migrations e saúde `ready/preview`. Backup privado de 161.276 bytes com digest/leitura verificados; imagens/manifesto anteriores disponíveis para reversão. Impressões integrais das 30 tabelas idênticas durante a publicação. `PORTAL_PUBLICATION` foi registrado na trilha administrativa externa: 106 registros válidos, nenhuma operação pendente. [Registro seguro](assets/impedimento-merge-2026-10-27/publication.json). O padrão central registra esta adoção de HN-01; UX-C05–C07 permanecem parciais.

A [conferência real somente leitura](assets/impedimento-merge-2026-10-27/live-validation.json) confirmou o impedimento Draft e sua orientação antes do botão na História e na Tarefa de merge, em desktop/celular, com zero escritas tentadas, erros de página ou overflow. O [MR !1](http://127.0.0.1:3180/sdlc/vidloc/app/-/merge_requests/1) continua sob revisão; uma pessoa responsável deve liberá-lo após conferir a proposta e então reavaliar a integração pelo portal. Capturas: [História desktop](assets/impedimento-merge-2026-10-27/story-1440.png), [História celular](assets/impedimento-merge-2026-10-27/story-390.png), [Tarefa desktop](assets/impedimento-merge-2026-10-27/task-1440.png) e [Tarefa celular](assets/impedimento-merge-2026-10-27/task-390.png). O container descartável foi removido após a coleta.
## 23. Liberação de Draft e diagnóstico especializado no portal — 27/10/2026

O usuário aprovou a evolução para conduzir a História pelo SDLC sem exigir que a pessoa de negócio opere o GitLab. A primeira capacidade executável é **Liberar para integração**, separada da solicitação de merge. O domínio constrói a proposta a partir da revisão/capacidade corrente; texto do modelo não concede autorização nem executa comandos. A ação aparece no impedimento e na conversa, fora do histórico de mensagens, e abre a mesma confirmação inline com MR, revisão e efeito delimitado. Rascunhos da conversa e contexto de decisão permanecem sob seus contratos existentes. Mudança de revisão/permissão invalida a confirmação; histórico não habilita execução.

`MergePreparation` registra pedido, revisão, iniciador, estado, lease e início da escrita externa. A autorização exige confirmação, persona existente, escopo vigente, CODE REVIEW/SECURITY SCAN e ausência de outra liberação/merge concorrente; o worker revalida base e condições reais antes de chamar a operação específica do adapter. A conta exclusiva de merge continua restrita ao escopo gerenciado. A liberação atualiza somente o título para retirar Draft; não integra código, não conclui Tarefa/História, não publica em ambiente nem muda proteções. Pausa, retomada e cancelamento abrangem a nova fila; cancelamento aguarda a operação em andamento. Não foi criado um executor genérico de comandos GitLab.

A intenção de escrita é persistida antes do efeito externo. Reinício/lease expirado ou resposta perdida consultam o estado antes de qualquer avanço; **Verificar resultado da liberação** reconcilia sem repetir a escrita. Consulta incerta não afirma que Draft continua presente. Resultado conhecido e revisão ainda em Draft exigem nova decisão explícita. A API REST de atualização do título não oferece CAS por SHA: as conferências antes/depois detectam deriva e impedem confirmação/merge, sem alegar atomicidade distribuída. O merge mantém sua própria confirmação e validação. A auditoria usa as quatro novas ações catalogadas e o recorder compartilhado, com correlação e autores humanos/agentes separados.

O assistente encaminha diagnósticos de conflitos ao perfil de arquitetura e de pipeline/acesso ao perfil de infraestrutura; há também pedidos explícitos no mesmo painel. O especialista é persistido por rodada e identificado na resposta/auditoria. Todos usam a fila de inferência e a inspeção controlada existentes; histórico anterior não é reescrito. **Arquitetura e infraestrutura entregam diagnóstico e proposta técnica**, sem alterar código/CI/permissões ou aplicar planos automaticamente. Correções de código conservam o executor e as verificações existentes. A execução de intervenções genéricas de arquitetura/infraestrutura, atribuição/notificação de responsáveis e reparo autônomo de CI permanecem no backlog; esta entrega não os apresenta como capacidades implementadas. A revisão de UX aprovou o recorte e conferiu desktop/celular, sem alegação de validação assistiva integral.

**Validação:** [342 testes distintos de aplicação aprovados](assets/liberacao-merge-2026-10-27/application-validation.json), quatro integrações externas opt-in não executadas; [48 cenários de navegador aprovados](assets/liberacao-merge-2026-10-27/validation.json), sem falhas, skips ou flakiness. Tipos, catálogo/guardas de auditoria, build e diferenças passaram. Cobertura adicional: comando/replay, confirmação/permissão/revisão, revalidação da base, rollback por falha de auditoria, resposta perdida sem segunda escrita, separação entre liberação e merge, autoria especializada e conta restrita do banco. Navegador verifica ação proposta, confirmação, continuidade sem merge, resultado desconhecido, reload e especialistas em 1440/390 pixels. Fixtures permaneceram em `portal_test` ou APIs interceptadas.

Na primeira publicação, a checagem real detectou erro PostgreSQL `42501` na nova tabela: a validação inicial usava seu proprietário, enquanto a API real usa `sdlc_portal_app`. A recuperação administrativa concedeu somente SELECT/INSERT/UPDATE a `MergePreparation`, com ledger externo, sem liberar MR ou alterar dados de negócio. A correção foi incorporada à migration `202610270002_merge_preparation_runtime` e a um teste que usa `SET LOCAL ROLE sdlc_portal_app`; DELETE continua recusado. A migration anterior `202610270001_merge_preparation` cria a operação e acrescenta o perfil à rodada. Ambas são aditivas/transacionais. Esse incidente não é ocultado pela aprovação anterior dos testes com proprietário do banco.

**Publicação definitiva em 27/10/2026, 14:05 (America/Sao_Paulo):** API/web `7670fb8c185a`, origem `e50f4fa7c7b993586e5e59eb4e2f8192f9d835ecec6bd693f2b93063b170d3d5`, saúde `ready/preview`. Backup privado final de 165.244 bytes com digest/leitura verificados; imagens/manifestações anteriores preservados para reversão sem restaurar banco sobre trabalho posterior. A comparação preservou os campos anteriores das linhas existentes, em 31 tabelas após a adição, excluindo campos operacionais de `MergeOperation` e o novo campo `MergeDiscussionTurn.specialist` da projeção comparada. Não se afirma igualdade integral do schema/linhas JSON antes e depois da migration. `PORTAL_PUBLICATION` registrou preparação/publicações e recuperação na trilha administrativa externa: 116 registros válidos, nenhuma operação pendente. [Registro seguro](assets/liberacao-merge-2026-10-27/publication.json).

A [verificação final somente leitura](assets/liberacao-merge-2026-10-27/live-validation.json) confirmou a proposta na conversa, os diagnósticos especializados e MR/revisão na confirmação real com Ana. O botão final permanece desabilitado sem confirmação; houve zero escritas tentadas, zero erros de página e nenhum overflow. O MR e a operação permaneceram inalterados; nenhuma liberação ou merge real foi solicitado para demonstração. Capturas reais complementam as fixtures ao mostrar o escopo: [assistente desktop](assets/liberacao-merge-2026-10-27/live-assistant-1440.png), [assistente celular](assets/liberacao-merge-2026-10-27/live-assistant-390.png), [confirmação desktop](assets/liberacao-merge-2026-10-27/live-confirmation-1440.png) e [confirmação celular](assets/liberacao-merge-2026-10-27/live-confirmation-390.png). Recursos descartáveis foram removidos após coletar a evidência. HN-01 incorpora ação/decisão no portal; UX-C05–C07 permanecem parciais.