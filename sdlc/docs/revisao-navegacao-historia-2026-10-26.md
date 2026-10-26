# Revisão da navegação e condução da História

Data: 26/10/2026 · Situação: **diagnóstico, proposta de implementação e protótipo para revisão**. Esta entrega não altera nem publica a aplicação do Portal, seus comandos, os agentes ou os dados de negócio.

O objetivo é permitir que a pessoa reconheça onde está, o que falta, quem precisa agir e qual decisão faz a História avançar. A revisão envolveu agentes com perfil de UX e de fluxo/arquitetura, confrontando a interface com os comandos realmente existentes.

Referências: [padrões de experiência](../portal/docs/PADROES_DE_EXPERIENCIA.md), [arquitetura](../portal/docs/ARCHITECTURE.md), [estabilização até a codificação](estabilizacao-ate-codificacao-2026-10-25.md), [auditoria transversal](implementacao-auditoria-2026-10-24.md) e [releases e promoção](releases-promocao-2026-10-22.md). O contrato de estabilização prevalece sobre descrições históricas anteriores.

## 1. Resultado da revisão

A História hoje reúne a lista de trabalho, controles de Projeto, especificação, decisões operacionais e administração técnica, mas não deixa sua relação suficientemente clara. Retirar Componentes resolve uma parte; a mudança principal é organizar a página pela **decisão atual da História**, preservando os assuntos e as fontes de evidência.

Proposta de navegação: **Tarefas → Execução → Especificação → Conversas → Mais**. Tarefas continua sendo a entrada. Mais reúne Auditoria e Configuração. Cabeçalho e orientação da próxima ação permanecem disponíveis nas cinco abas. A página continua em uma coluna, com edição central.

Repositórios e integração GitLab são geridos no **Sistema**. A História identifica apenas **onde será implementada**, entre os repositórios já pertencentes ao Sistema. Seu MR específico continua acessível como evidência de entrega. Isso preserva a distinção entre propriedade do repositório e escopo da execução.

## 2. Achados priorizados

Referências de linha correspondem ao workspace revisto em 26/10/2026; arquivos já possuíam alterações anteriores a esta revisão.

| Prioridade | Achado e consequência | Evidência no código | Mudança proposta |
| --- | --- | --- | --- |
| P0 | Criar tarefa recebe destaque permanente; o próximo passo fica atrás de um acesso genérico. A pessoa precisa descobrir a ação do processo. | `apps/web/app/story-workspace.tsx:320` | Nomear o acesso contextual pela ação disponível e levar à confirmação central. Criar tarefa fica junto da coleção como ação secundária. |
| P0 | A execução da História começa com planejamento do Projeto. O escopo muda dentro da página antes de apresentar a decisão atual. | `portal.tsx:315`; `story-workspace.tsx:340` | Apresentar a etapa da História primeiro; planejamento de outras Histórias vira link contextual para o Projeto/Assistente. |
| P0 | CANCELLED aparece depois de COMPLETED no ciclo e a posição marca etapas anteriores como percorridas. Isso pode sugerir aprovações sem evidência. | `story-workspace.tsx:37,323` | Cancelamento como resultado terminal separado. Cada etapa informa evidência confirmada, pendência ou ausência de cobertura. |
| P0 | Componentes mistura cadastro, GitLab e seleção de escopo na História. O Sistema hoje mostra somente sua integração, sem catálogo na aba. | `story-workspace.tsx:176,359`; `repos.tsx:14–18`; `portal.tsx:319,346` | Gestão e acesso ao repositório no Sistema; alvo técnico contextual na História, preservando os vínculos usados pelo G1. Restaurar catálogo do Sistema é trabalho explícito da implementação futura. |
| P0 | Seis Tarefas fixas podem parecer um pipeline completo, embora Teste/Teste Final não tenham executores e o merge atual não os exija. | `packages/shared/src/pipeline-plan.ts:3`; estabilização, seção 5 | Expor disponibilidade e dependências reais. Definir a sequência completa em uma fase funcional própria; não anunciar essa orquestração como existente. |
| P1 | A tabela de Tarefas é inventário ordenável por datas/nome/status; sua ordem não explica a sequência dos agentes. | `story-workspace.tsx:76,110` | Sequência operacional separada da consulta. Ordenar uma tabela não muda dependências ou elegibilidade de execução. |
| P1 | Revisão aplicada, rascunho, conteúdo congelado e G1 precisam ser conectados pela pessoa. | `story-specification.tsx:67–71,85` | Resumo simultâneo das versões e acesso direto ao conteúdo que falta, com indicação do que o agente está usando. |
| P1 | Conversa consultiva, discussão operacional e histórico aparecem em lugares próximos com efeitos distintos. | `story-workspace.tsx:366,377`; `conversation-history.tsx` | Nomear o assunto e explicar seu efeito: conversar não aplica revisão, aprova gate ou inicia código. |
| P1 | Execução acumula assistente, ciclo, decisões, sinais, vínculos, código e release. | `story-workspace.tsx:340–385` | Etapa atual e decisão primeiro; evidências depois; detalhes técnicos por expansão e links de seção. |
| P1 | Projeções operacionais possuem recortes de 100 eventos e 200 verificações. | `apps/api/src/journey.ts:27–32` | Identificar cobertura; usar consultas próprias para percorrer o histórico. Não calcular prontidão a partir do lote exibido. |
| P2 | O acervo usa outra composição de abas e ainda apresenta Componentes. Mudar somente a História ativa deixa duas arquiteturas. | `archived-item.tsx:27,42` | Incluir acervo explicitamente na migração, mantendo somente leitura e situação registrada. |
| P2 | Um ciclo longo e muitos níveis de controles dificultam a leitura móvel. | `story-workspace.tsx`; `story-workspace.css` | Resumo compacto da etapa atual, rótulos claros, foco previsível e acesso às demais etapas sem etapas concluídas por inferência. |

Os achados acima são diagnóstico de código e contrato. Não se afirma que todos foram reproduzidos na instalação publicada. A validação no navegador desta entrega se refere ao protótipo isolado.

## 3. O que preservar

- Entrada em Tarefas, navegação global e identidade Segoe UI/azul/navy existentes.
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
| Cabeçalho da História | Localização e orientação atual | Breadcrumb Sistema/Projeto/Épico/História; chave/título; fase; disponibilidade; revisão executada; próximo responsável e impedimento; acesso contextual à próxima ação. |
| Tarefas | Consultar e detalhar trabalho | Tabela compartilhada, filtros/contagem/paginação; distinção entre etapas obrigatórias e tarefas adicionais; atividade atual e link de retorno. Criar tarefa não inicia execução. |
| Execução | Conduzir a História | Etapa e decisão atual; confirmação do comando; resumo das pré-condições; responsáveis; sequência com evidências; sinais observados; destino técnico; entrega/MR e associação de release. |
| Especificação | Preparar o conteúdo | Requisitos de negócio, critérios, dependências e plano técnico; rascunho/revisão aplicada; cobertura dos critérios; revisões anteriores. IA opcional. |
| Conversas | Consultar e esclarecer | Conversa consultiva da História; acesso à discussão operacional quando pertinente; fontes e referências. Uma mensagem não representa decisão de gate. |
| Mais → Auditoria | Rastrear decisões | Quem, ação, alvo/revisão, instante, resultado, motivo e referências seguras, mantendo filtros e snapshot da consulta. |
| Mais → Configuração | Administrar a História | Identificação, ações de ciclo permitidas e seus efeitos. Cancelar História e interromper tentativa têm confirmações distintas. |
| Sistema → Componentes | Gerir o patrimônio técnico | Catálogo dos repositórios do Sistema, integração GitLab, provisionamento e links externos de administração. |
| Releases global | Gerir a entrega composta | Criação/composição de release e, futuramente, candidatas/ambientes/G2/G3. A História só associa um DRAFT elegível existente. |

O cabeçalho usa um único destaque contextual: **Completar especificação**, **Revisar G1**, **Acompanhar codificação**, **Responder impedimento** ou **Revisar verificação**, conforme a projeção atual. Em outra aba, esse acesso navega e posiciona o foco na seção correspondente. O comando mutável e sua confirmação continuam em Processo e decisões, evitando dois controles concorrentes para a mesma operação.

Editar fica secundário no cabeçalho. No modo de edição, Salvar/Cancelar assumem a faixa de ações. Um rascunho ainda não aplicado permanece identificado e não muda o snapshot em execução.

## 5. Repositório no Sistema, alvo na História

`Repository` já pertence ao Sistema (`apps/api/src/app.ts:332`). `ItemRepository` identifica o escopo e a execução atual exige exatamente um repositório pronto associado à História (`execution.ts:25–26`). Esse alvo entra no fingerprint do G1 e é validado novamente por qualidade/merge.

Portanto, a implementação precisa:

1. Oferecer o catálogo/gestão de repositórios no Sistema. A aba atual de Sistema mostra somente a integração GitLab; remover a aba da História sem completar esse destino deixaria a gestão sem acesso.
2. Mostrar em Especificação/Execução um bloco compacto **Onde será implementada**: nome do alvo, Sistema proprietário, prontidão e link Gerenciar no Sistema. Sem URL de administração GitLab ou cadastro de repositório na História.
3. Selecionar explicitamente entre alvos já cadastrados no Sistema e dentro do escopo autorizado do Projeto, por contrato existente (`app.ts:112`). Mover a interface não amplia a elegibilidade. Nenhum alvo ou vários alvos impedem preparar a execução atual; uma sugestão única ainda precisa ser confirmada, sem associação silenciosa.
4. Preservar os vínculos persistidos. Alvo não é informação decorativa; removê-lo ou alterá-lo pode mudar o escopo aprovado.
5. Exigir revisão/G1 quando a mudança atingir o conteúdo congelado. Com execução ativa, manter rascunho e orientar interrupção/novo ciclo explícitos.
6. Manter links ao commit/MR específico como evidências da História. Eles não são o catálogo de repositórios.

## 6. Sequência existente e sequência a implementar

O fluxo existente permite preparar conteúdo manualmente ou com IA e aprovar G1. **Aprovar G1 já enfileira a codificação**; não existe uma etapa de aprovação de planejamento de Tarefa entre G1 e código. A geração percorre contexto, geração e publicação. Depois há revisão de código, scanner de segurança e merge confirmado por SHA.

As seis Tarefas obrigatórias são Codificação, Teste, Revisão de Código, Revisão de Segurança, Teste Final e Merge de Código. Sua criação atômica não comprova a execução dessas etapas nem garante uma cadeia completa.

| Recorte | Existente | Lacuna / proposta |
| --- | --- | --- |
| Especificação → G1 → Codificação | Revisão/snapshot aprovados; G1 e enfileiramento no mesmo comando | Tornar pré-condições e efeito da confirmação claros na interface. |
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
| SPECIFICATION incompleta | Objetivo, comportamento ou critério ausente; Completar especificação abre o campo pertinente | Salvar rascunho não inicia agente nem aprova G1. |
| Preparação técnica | Plano manual ou opção de elaboração por IA; alvo e integrações identificados | IA elabora plano, sem autorizar código. Plano manual válido dispensa geração. |
| Dependência impeditiva pendente | Nome e motivo da dependência; ação para revisar a informação | Pode elaborar/salvar; G1/código permanecem bloqueados. |
| G1 pendente | Revisão, alvo, critérios e escopo que serão congelados; confirmação **Aprovar G1 e enfileirar codificação** | Persona autorizada aprova; comando existente já coloca código na fila. |
| Codificação na fila | TO DO, motivo de espera e última observação | Sem início confirmado, não mostrar DOING nem avanço percentual. |
| Codificação em execução | Etapa observada, provedor, última confirmação e Tarefa atual | Contexto → geração → publicação; início confirmado permite DOING. |
| Sem confirmação recente | Sinal não recente, horário da última confirmação; atualizar/consultar situação | Não afirmar falha ou repetir o pedido de execução. |
| Aguardando orientação | Impedimento e discussão da atividade; revisar proposta de decisão | Confirmar a proposta de decisão operacional revisa a especificação e exige novo G1. Conversa consultiva por si só não altera escopo. |
| Falha técnica recuperável | Falha, tentativa/etapa e ação de retomada elegível | Recuperar mesmo contexto/patch quando possível; preservar artefatos. |
| Código publicado | Branch, SHA, MR e resultado de Codificação | Conclui só Codificação; próxima verificação usa o código publicado. |
| Teste/Teste Final sem executor | Tarefa planejada e disponibilidade **Não disponível nesta versão** | Sem botão que finja executar teste ou evidência inventada para liberar merge. |
| Review/Segurança pendentes | Pareceres do SHA/base/política atuais; revisão antes do scan | Agentes existentes registram passed/blocked/failed/stale. Incompletude nunca aprova. |
| Achado de qualidade/segurança | Achados, referência do parecer e Solicitar correção | Novo SHA invalida review/scan/merge. Mesmo escopo não exige automaticamente novo G1; mudança de escopo exige. |
| Escopo/parecer desatualizado | Revisão usada versus atual; o que mudou e quais decisões ficaram obsoletas | Não reutilizar aprovação de outra revisão. Aplicar novo conteúdo exige ciclo explícito. |
| Merge elegível | Evidências atuais e confirmação do SHA exato | Pedido, integração e confirmação remota separados; merge não conclui História/deploy. |
| Solicitação sem confirmação | Identidade da intenção pendente e Verificar a mesma solicitação | Reconciliar/repetir a mesma chave e corpo; sem nova aprovação ou duplicação. |
| Ancestral INACTIVE | Qual Sistema/Projeto/Épico impede ação; consulta permanece | Reativar e retomar são decisões distintas. Aprovação ainda válida não é descartada só pela pausa. |
| Cancelamento solicitado | Publicação externa ainda em reconciliação; novas operações bloqueadas | Preservar commit/MR eventualmente confirmados; aguardar resultado antes de CANCELLED. |
| CANCELLED | Motivo e resultados preservados; Reabrir quando elegível | Reabertura justificada volta a SPECIFICATION e exige novo G1; Tarefas não reabrem automaticamente. |
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
| Sem `tab`, `tab=tasks`, `tab=overview` | Tarefas; compatibilidade com a antiga entrada Resumo. |
| `tab=planning` | Execução, conservando o identificador já publicado. |
| `tab=components` da História | Execução → Destino da execução; aviso curto sobre gestão no Sistema e link explícito para lá. Sem salto automático para outra entidade. |
| `tab=delivery`, `tab=releases` | Conteúdo de entrega/release em Execução. |
| `tab=activity`, `tab=manage` | Mais → Auditoria / Configuração. |
| `interact=…`, `tab=blockers` | Seção central correspondente de Execução. |
| `process=action|conversation|processing|administration|release|delivery` | Manter contratos existentes; um novo identificador de destino técnico precisa ser aditivo e testado. |

Normalizações conservam `tasks.*`, `attempt`, `returnTo` e parâmetros de coleções pertinentes. Trocar de aba remove somente parâmetros de processo incompatíveis. Voltar/avançar/recarga devem restabelecer o recorte; formulários não desmontam por consulta ou ordenação. Nunca colocar texto da especificação/conversa ou credenciais na URL.

### Autoria, auditoria e concorrência

Reorganizar a apresentação reutiliza comandos e fontes existentes. Se a fase futura criar ação, dependência, executor ou decisão, deve incluir entrada no catálogo, semântica resultado/fase/decisão, autoria, iniciador, correlação e comparação anterior/nova, pelo recorder compartilhado na mesma transação. Testar rollback, replay e resposta tardia. Nada de inserir diretamente em `HistoryEvent`.

Preservar `expectedVersion`, revisão base, digest do conteúdo, `expectedLinksVersion`, SHA/base/política e intenção idempotente conforme o comando. Conflito conserva o rascunho e pede revisão explícita. Fontes de requisitos, prompts, conversas, código e resultados continuam controladas; a auditoria só projeta referências seguras. Publicação administrativa futura segue trilha externa à base alterada.

Não criar métricas de funil ou uso nesta entrega. Preservar definições de fila, processamento, espera humana, correção, retomada e reabertura já aprovadas, sem contar polling ou replay como trabalho novo.

## 9. Plano incremental de implementação

| Etapa | Entrega concreta | Arquivos/contratos principais | Critério de conclusão |
| --- | --- | --- | --- |
| HN-01 | Navegação da História e CTA contextual; remover Componentes; separar planejamento de Projeto; ciclo sem inferência de conclusão | `story-workspace.tsx/css`, `portal.tsx`, `archived-item.tsx`, componentes de navegação existentes | Cinco abas; acesso direto/retorno; próxima ação em qualquer aba; cancelamento separado; nenhuma alteração de gate. |
| HN-02 | Destino técnico da História e gestão de repositórios no Sistema | `repos.tsx`, `portal.tsx`, `execution.ts`, vínculos existentes e catálogo do Sistema | Gestão acessível só no Sistema; vínculo explícito preservado; nenhum/múltiplos alvos explicados; alteração de escopo exige revisão adequada. |
| HN-03 | Resumo de prontidão, revisões e sequência observada | `journey.ts`, tipos compartilhados, `story-specification.tsx`, qualidade/merge | UI usa capacidades da API; G1 apresenta seu efeito atômico; sinais/evidências não dependem da consulta histórica. |
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

Abrir [protótipo navegável da História em localhost:3383](http://localhost:3383/?scenario=g1) ou seu [arquivo local](prototipo-historia-2026-10-26.html). Os controles de cenário pertencem à demonstração e ficam identificados fora da navegação do produto. Os dados são fixtures locais, sem consulta à API, integração GitLab ou execução de agentes.

Roteiro recomendado:

1. Começar em especificação incompleta. Identificar o que falta e navegar ao campo pertinente, mantendo Tarefas como entrada.
2. Abrir G1 pendente, conferir revisão/alvo/escopo e a confirmação de aprovação que já enfileira código.
3. Consultar fila, processamento e impedimento. Distinguir espera humana, falha técnica e falta de confirmação recente.
4. Abrir código publicado e os pareceres. Conferir a separação entre evidência atual e futura automação de Teste/Teste Final.
5. Experimentar filtros/ordem/detalhe/retorno e a edição entre abas, com salvar/cancelar e rascunho identificado.
6. Abrir destino técnico e visitar Sistema; retornar ao mesmo contexto da História. Conferir o MR como evidência da entrega.
7. Consultar situação cancelada/reaberta, hierarquia inativa, acervo e sem permissão. Nenhum desses recortes deve conceder aprovação ou iniciar trabalho.

O protótipo demonstra a composição e as interações; não substitui testes da API, transações, agentes ou scanners. A sequência completa e os estados de conclusão são visualizações para revisão, sem declaração de implementação dos trechos futuros.

## 12. Critérios de aceite da implementação futura

- Em qualquer aba, identificar História, etapa, impedimento, responsável e acesso ao próximo passo, sem ler a auditoria para calcular a situação.
- Gestão/URL do repositório no Sistema; alvo explícito da História preservado no G1; legado `tab=components` mantém contexto e oferece destino útil.
- Uma coluna, edição central, rascunho preservado, foco visível e controles sem sobreposição em 1440×1000, 390×844 e 390×500.
- Tarefas, revisões, auditoria e conversas preservam escopo, filtro, ordem, paginação, recarga e retorno; dados além dos antigos limites permanecem acessíveis onde houver migração declarada.
- G1 executa o mesmo comando atômico; consultar, salvar rascunho, conversar ou ordenar não aprova, inicia agente ou conclui etapa.
- Erros de leitura/mutação, falha técnica, impedimento de domínio, falta de permissão e falta de sinal recente têm mensagens diferentes e ação pertinente.
- Conflitos, pedido incerto, replay, atraso de resposta, cancelamento durante publicação e reabertura preservam evidências e não duplicam efeitos.
- Código, review, scanner e merge usam a revisão/SHA/base/política corretos; ordenação da tabela e status manual não dispensam essas guardas.
- Cancelamento não aparece como último passo de um caminho de sucesso. COMPLETED legado não comprova etapas não observadas.
- Toda futura ação mutável usa catálogo/recorder e tem testes de rollback/retentativa; fontes controladas e trilha administrativa são preservadas.

## 13. Evidência e limites desta entrega

A revisão de código/contrato foi concluída com dois agentes especializados, além do agente responsável pelo protótipo. A revisão final de UX aprovou desktop, celular, menu global explícito, as cinco abas visíveis em 390 px e a separação entre orientação atual, decisão e evidências.

**Validação final: 18 verificações de navegador aprovadas, 27 cenários consultáveis, zero erros de JavaScript.** O [roteiro executável](assets/historia-2026-10-26/check.mjs) e o [relatório](assets/revisao-historia-2026-10-26/report.json) registram: navegação/entrada, 24 Tarefas em páginas de 20, filtro/ordem/detalhe/retorno/recarga, estados de consulta, G1 atômico, edição e rascunhos, link legado de Componentes, retorno do Sistema, correção e merge, decisão operacional com novo G1, revisão 4 preservada na fila, cancelamento antes de publicação, rascunho de alvo/mensagem, contagem após tarefa adicional, intenção incerta, reabertura, permissões/acervo/tentativa histórica, teclado/diálogos e redução de movimento. O caminho secundário de condições de G1 em tentativa histórica também foi validado sem oferecer aprovação.

Viewports conferidos: 1440×1000, 390×844, 390×500 e 780×844, sem estouro horizontal do documento. As Tarefas mantêm tabela com rolagem identificada; a página usa rolagem normal. Capturas: [Tarefas desktop](assets/revisao-historia-2026-10-26/tarefas-desktop.png), [Execução desktop](assets/revisao-historia-2026-10-26/execucao-desktop.png), [Tarefas celular](assets/revisao-historia-2026-10-26/tarefas-390-844.png), [impedimento celular](assets/revisao-historia-2026-10-26/impedimento-mobile.png), [Sistema celular](assets/revisao-historia-2026-10-26/sistema-mobile.png) e [menu celular](assets/revisao-historia-2026-10-26/menu-mobile.png).

A sintaxe dos scripts foi conferida com Node. O navegador fez somente 168 GETs dos arquivos estáticos da própria prévia, incluindo recargas dos cenários; nenhuma requisição à API, GitLab, modelos ou outros destinos. O servidor da prévia aceita somente arquivos explícitos, sem API ou escrita, e está separado do Portal em `http://localhost:3383`, no contêiner `sdlc-history-prototype-20261026`, usando a imagem de navegador já preparada e montagem de fontes somente leitura. O [servidor estático](assets/historia-2026-10-26/serve.mjs) não publica a implementação no Portal.

Os dados e as alterações simuladas ficam em memória e reiniciam ao recarregar; a URL restaura o cenário e o recorte de consulta, sem prometer persistência de decisões ou rascunhos entre sessões. As operações de reconciliação são representações locais, sem validação de transações ou efeitos remotos. A barra de cenários é ferramenta da demonstração e não deve ser incorporada à página real.

A aplicação real e o acervo ainda usam a navegação anterior; HN-01–HN-06 são backlog proposto. UX-C05, UX-C06 e UX-C07 conservam adoção parcial. Nenhuma API, worker, migration, dado de negócio ou aplicação produzida pelo SDLC foi alterado nesta entrega.

Leitor de tela em hardware, teclado nativo móvel, testes de execução real, autenticação corporativa e conformidade WCAG completa não são comprovados por esta prévia. Nenhuma aplicação produzida pelo SDLC ou resultado de agente deve ser alterado para demonstrar a proposta.
