# Redefinição da interface e retomada do backlog

## Situação atual

Nova revisão solicitada em 23/10: [História macro, Tarefas operacionais e área única de interação](evolucao-historia-tarefas-ux-2026-10-23.md). Contém diagnóstico confirmado, árvore de navegação, ciclo, matriz de ações e plano UX-H1 a UX-H7. **Proposta para validação**, sem mudanças nesta rodada na interface, nos registros ou nos projetos gerados. O plano funcional abaixo permanece preservado.

O usuário autorizou aplicar a interface baseada no protótipo ao portal real. A migração e o planejamento persistido de releases estão descritos em [Implementação da interface](implementacao-interface-2026-10-22.md). Os registros abaixo preservam as decisões das etapas anteriores; a restrição anterior ao protótipo foi substituída por essa autorização. O backlog de execução após MR continua separado, sem importar resultados simulados.

## Decisão do usuário — 22/10/2026

Pausar as implementações funcionais para redefinir a interface e adotar novos padrões de navegação. A navegação atual ficou confusa com o crescimento das funcionalidades. O aceite anterior da hierarquia não representa aceite da experiência atual. O [plano e seu backlog](plano-portal-sdlc-2026-10-20.md) permanecem preservados para retomada após a redefinição.

Esta pausa se refere ao trabalho de implementação; não determina desligamento de serviços, cancelamento de execuções ou alteração de dados de negócio.

Decisão posterior de navegação, aplicada ao protótipo: **Releases** passa a ser item do menu principal, ao lado de Visão Geral e Sistemas, concentrando criação, composição, ramificações, verificações e promoção. Na História só é possível escolher uma release em rascunho já existente do mesmo Sistema; criar pela História deixou de fazer parte da proposta. Sistema/Projeto/Épico mantêm links de consulta, sem telas de gestão duplicadas. O menu global consulta todos os Sistemas, com filtros explícitos e criação com Sistema obrigatório. Essa revisão passou em 35 testes de navegador e revisão de UX em desktop/celular; continua simulada e não retoma a implementação funcional.

Refinamento da escolha de Histórias: atalhos com contagens para prontas e sem release, sem release, pendentes, selecionadas e todas; busca imediata e filtros combináveis por Projeto/Épico, status, verificações e associação da revisão atual. A seleção permanece ao filtrar e recarregar, com contador das escolhas ocultas e lote restrito às visíveis. No celular, facetas ficam recolhidas e os critérios ativos continuam identificados. A criação exige somente Sistema e nome: um DRAFT vazio é válido e pode ser composto depois por outra pessoa autorizada. A colaboração entre usuários ainda não é executada pelo protótipo; a definição fica preservada para a implementação futura.

Validação do refinamento: 42 testes de navegador passaram, preservando as 35 jornadas anteriores e acrescentando sete sobre seleção, filtros e composição posterior de DRAFT vazio. Os testes não encontraram chamadas de API/serviços externos nem erros JavaScript/CSP. A imagem preparada do portal original permaneceu válida; o trabalho continua restrito ao protótipo independente e à documentação.

Consulta visual de releases: quatro cartões de etapa com contagens — Em composição, QA, Homologação e Produção — filtram uma lista única de rascunhos e candidatas, com 20 releases por página e ordem decrescente de criação. Busca e Sistema refinam os totais; paginação também aparece acima da lista. Rejeitadas ficam identificadas como exceções. Produção distingue pacote atual do histórico; aprovar G2/G3 não antecipa a mudança de ambiente. Registros anteriores sem data permanecem identificados ao final. Novas datas são registradas sem alterar o conteúdo dos pacotes existentes.

Validação da consulta: 47 testes de navegador passaram, incluindo cinco novos com 46 registros de teste paginados em 20/20/6. Datas, desempate, filtros, recarga, ausência de data, mudança de etapa, produção atual/histórica e paginação/foco no celular foram verificados. Capturas desktop/celular revisadas com UX; o aceite humano permanece pendente. O portal original e o backlog funcional continuam preservados.

Definição adicional para o redesenho e a retomada: [releases do Sistema e promoção imutável](releases-promocao-2026-10-22.md). Incluir seleção em lote de Histórias e dependências, acompanhamento da candidata por ambiente e retorno obrigatório a QA completo e nova homologação sempre que o conteúdo mudar em HML. Ações de continuidade ficam na faixa superior junto ao breadcrumb. O registro não implementa essas telas ou os processos de deploy e mantém a pausa funcional.

Representação navegável para revisão humana: [protótipo independente de releases](../prototypes/navigation-v1/README.md), disponível na porta 3311 em `#/releases/system-atendimento`. Mostra composição, ramificações, ambientes, seleção em lote e retorno por retirada/correção em HML; mantém identidade visual, revisões e pacotes anteriores na simulação. Revisado por agente de UX e verificado em 23 testes de navegador, incluindo as 14 jornadas anteriores. Os cenários são fictícios, separados da execução atual; isso não implementa deploys no portal real, não conclui o backlog e não equivale a aceite humano da nova interface.

## Ponto de retomada funcional

Correção da navegação do protótipo: releases passaram a compartilhar a mesma hierarquia de Histórias. Pela aba Releases da História é possível planejar uma revisão em rascunho; Projeto/Épico consultam seu escopo; composições e ramificações retornam à mesma entidade. Histórico fechado e planejamento atual permanecem distintos. Ao fechar uma seleção, pendências permanecem no rascunho e a candidata produzida fica acessível. A integração foi verificada em 33 testes do protótipo, preservando os controles anteriores. Essa revisão substitui a proposta inicial de cenários isolados e não implementa os processos no portal real.

Disponível: hierarquia Sistema → Projeto → Épico → História → Tarefa; repositórios associados ao Sistema e vinculados ao trabalho; planejamento assistido por IA; propostas revisáveis; especificação e aprovação humana G1; geração de código e publicação de Merge Request em rascunho; conversa sobre impedimentos e retomada técnica de patches inválidos.

O usuário informou que o Merge Request foi criado. A entrega do pipeline implementado termina nesse ponto; isso não comprova testes, revisão, segurança ou implantação. A História permanece em CODING após a publicação do rascunho.

Retomar pela integração do Merge Request às próximas etapas: executor isolado de build/testes e evidências, CODE REVIEW automático, SECURITY SCAN e tratamento dos resultados pelo agente. Depois, completar gates G2/G3, homologação/regressão, pacotes imutáveis, promoção/deploy e Blue/Green conforme as dependências e critérios do plano original. A ordem técnica detalhada deve respeitar esse plano; nenhuma dessas entregas foi concluída por este registro.

Referências do estado atual: [execução assistida](execucao-assistida-2026-10-20.md), [encerramento da conversa](encerramento-conversa-2026-10-22.md) e [validação de patches](validacao-patch-2026-10-22.md).

## Trabalho prioritário de interface

Revisão geral solicitada pelo usuário: [proposta consolidada do time de UX para Sistemas](proposta-ux-navegacao-sistemas-2026-10-22.md). Contém diagnóstico, arquitetura de navegação, ponto único de continuidade, acompanhamento da IA e roteiro de validação. Trata-se de proposta; o redesenho dessas telas ainda não foi implementado.

Primeiro recorte autorizado: [Visão Geral com dashboard e instrumentação de métricas](dashboard-metricas-2026-10-22.md), mantendo Sistemas com a navegação existente. O restante do backlog funcional continua pausado.

1. Mapear as jornadas atuais e os pontos de confusão: encontrar trabalho, navegar entre níveis, conversar com a IA, revisar decisões, acompanhar execução e consultar entregas.
2. Definir com agentes de perfil User Experience a arquitetura de informação e padrões consistentes de navegação global, contexto local e detalhe. Essa participação foi solicitada explicitamente pelo usuário para a criação de telas.
3. Elaborar uma proposta navegável para revisão, incluindo a História e seu ciclo completo, antes de expandir o padrão às demais telas.
4. Implementar o padrão revisado e validar as jornadas com o usuário. Registrar eventuais ajustes e o aceite antes de retomar o backlog funcional.

Diretrizes já confirmadas: navegação intuitiva e graficamente clara como um diagrama de execução de processo; hierarquia do domínio preservada; status em inglês e demais textos em PT-BR; assistente de IA acessível no contexto do trabalho; projetos de demonstração criados pelo próprio usuário, sem exemplos pré-fabricados.

Critérios propostos para a revisão: deixar claro onde a pessoa está, como voltar, qual etapa está ativa, qual é a próxima ação, quem pode realizá-la e o que está bloqueado ou ainda não implementado. Exibir o resultado da execução e seu limite sem confundir criação de Merge Request com conclusão da História. Tornar a seleção de persona e as razões para ações desabilitadas compreensíveis. Organizar conteúdo para evitar que listas, decisões e ações principais fiquem escondidas entre painéis extensos.

As escolhas concretas de menu, layout e componentes ainda serão definidas na revisão de UX. O redesenho deve preservar contratos, conversas, decisões, autorizações, histórico e dados existentes. A IA da ferramenta continua responsável pelo trabalho gerado e pela interação com o usuário; o redesenho não autoriza ajustes externos nos projetos produzidos.
