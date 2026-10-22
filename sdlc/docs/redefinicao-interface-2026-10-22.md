# Redefinição da interface e retomada do backlog

## Decisão do usuário — 22/10/2026

Pausar as implementações funcionais para redefinir a interface e adotar novos padrões de navegação. A navegação atual ficou confusa com o crescimento das funcionalidades. O aceite anterior da hierarquia não representa aceite da experiência atual. O [plano e seu backlog](plano-portal-sdlc-2026-10-20.md) permanecem preservados para retomada após a redefinição.

Esta pausa se refere ao trabalho de implementação; não determina desligamento de serviços, cancelamento de execuções ou alteração de dados de negócio.

## Ponto de retomada funcional

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
