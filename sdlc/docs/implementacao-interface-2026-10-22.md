# Implementação da interface baseada no protótipo

## Autorização e escopo

Após a revisão do protótipo, o usuário solicitou aplicar a interface ao portal real. Esta entrega migra a navegação e mantém as operações já implementadas. Também entrega o planejamento persistido de releases, necessário para substituir as associações simuladas. O backlog de execução após o Merge Request continua separado: os resultados fictícios do protótipo não são transportados para o produto.

O portal permanece em http://localhost:3310. O protótipo independente continua em http://localhost:3311 para comparação. Dados de exemplo, respostas hardcoded e avanços simulados não são adicionados ao banco humano.

## Navegação e preservação

- Menu principal: Visão geral, Sistemas e Releases. O dashboard existente, seus indicadores e filtros permanecem.
- Sistema → Projeto → Épico → História → Tarefa mantém identidades, dados e URLs existentes. Abas usam `?tab=` para detalhe contextual sem remontar conversas ou solicitações incertas.
- Criação, edição, aprovações de planejamento, status de Tarefa, G1 e recuperação de execução ficam na faixa de ações junto ao breadcrumb.
- Componentes/repositórios, integração GitLab, ambientes, ciclo do Projeto, arquivamento e histórico continuam acessíveis pelas abas de contexto.
- A História separa Acompanhamento, Especificação, Impedimentos, Entrega, Tarefas, Componentes, Atividade, Configurações e Releases.
- A situação da execução apresenta etapa confirmada, próximo passo, última consulta e última atualização. Uma falha de comunicação não substitui o último estado confirmado por uma falsa falha do agente.
- A persona continua explícita. Operações incertas mantêm ator, corpo, chave e versão; trocar a persona não permite confirmar em nome de outra pessoa.

## Releases reais nesta entrega

A migração aditiva `202610220009_release_planning` cria releases e associações de planejamento. Não altera registros anteriores de Histórias, commits, especificações ou decisões.

| Operação | Personas autorizadas |
|---|---|
| Consultar releases e composições | Leitura local disponível sem persona |
| Criar release, inclusive vazia | Admin, Release Manager |
| Compor release pela área central | Admin, Release Manager |
| Escolher/remover release existente na História | Admin, Release Manager, Product Owner, Arquiteto |

Criar exige Sistema e nome; o resultado é **DRAFT**, com zero Histórias permitido. A seleção posterior é outra operação e pode ser feita por outra pessoa autorizada. Dados persistem no PostgreSQL, com auditoria por ator e data. `sessionStorage` guarda apenas uma solicitação de mutação ainda não confirmada para permitir reconciliação após recarga; não é o armazenamento das releases.

A área central oferece:

- Contagens por etapa, filtros combinados e páginas de 20 releases, ordenadas por criação decrescente com desempate estável.
- Atalhos para prontas e sem release, versão atual sem release, pendentes, selecionadas e todas.
- Busca, Projeto → Épico dependente, status e associação; seleção preservada fora dos filtros, lote visível e limpeza global separada.
- Revisões planejadas e atuais distintas, transferências explícitas entre rascunhos e consulta da mesma associação pela História.
- Versão otimista da release de destino, das Histórias e dos rascunhos de origem. Conflitos não sobrescrevem silenciosamente o trabalho de outra pessoa.
- Repetição idempotente de solicitações cujo resultado não chegou ao navegador. Eventos de auditoria não são duplicados no replay.

O catálogo é limitado a 5.000 Histórias por consulta, a composição a 500 Histórias e o seletor da História a 1.000 rascunhos. A consulta central permite refinar Projeto e Épico no servidor antes de carregar as Histórias. Quando o recorte ultrapassa o limite, retorna somente as opções de refinamento e o total, sem lista parcial; salvar fica bloqueado até obter um recorte completo. Escolhas já feitas fora do recorte permanecem selecionadas e sujeitas à validação de versões ao salvar. Busca, status e associação continuam refinando localmente o recorte carregado. Um Projeto acima do limite deve ser refinado por Épico; um Épico acima do limite ainda exige paginação futura. Clientes anteriores continuam recebendo o erro explícito de limite, sem mudança silenciosa de contrato.

Validação do refinamento: typecheck e build de produção passaram, assim como 15 contratos de releases e 22 jornadas de navegador. O novo contrato foi exercitado com 5.001 Histórias em banco descartável: consulta ampla sem lista parcial, opções de Projeto disponíveis e recuperação por recorte menor. Nenhum desses registros foi criado na prévia humana.

## Limite do pipeline e métricas

Somente criação e composição DRAFT têm mutações públicas nesta entrega. Nenhuma revisão recebe `ready=true` apenas pelo status ou pela existência de MR. A lista “Prontas” permanece vazia enquanto os executores de revisão, segurança e testes não fornecerem evidências reais. Fechamento de candidata, manifesto, ramificações de entrega, QA, G2, HML, G3 e deploy permanecem no backlog; as ações são identificadas como indisponíveis.

As garantias de domínio para candidatas futuras continuam registradas em [Releases e promoção imutável](releases-promocao-2026-10-22.md). Associações desta entrega são planejamento, não manifests de pacotes fechados nem prova de implantação.

Eventos duráveis `RELEASE_CREATED`, `RELEASE_COMPOSITION_CHANGED` e `STORY_RELEASE_PLANNED` registram operação, correlação, ator, versão e instante na mesma transação idempotente, sem prompts, código ou credenciais. O usuário aprovou todos os novos indicadores sugeridos. As [métricas de releases](metricas-releases-2026-10-22.md) acrescentam quantidade por etapa, idade em composição e comparação de criações nas quatro semanas. Duração concluída e ciclos por rejeição são apresentados como indisponíveis até a integração dos eventos reais. O dashboard anterior permanece íntegro, com os mesmos filtros.

## Validação e atualização local

Validação feita em bancos `portal_test` descartáveis e rede isolada, sem fixtures no banco da demonstração:

- Typecheck da API e interface e build Next de produção.
- 41 testes existentes de regras/adapters e 14 testes novos de releases.
- 17 jornadas de navegador, incluindo dashboard, hierarquia, repositórios, assistente, planos, impedimentos, G1, retomadas, MR e releases reais.
- Revisão visual por agente de UX em desktop e celular, com cores, persona, situação e ações preservadas.

Os dois testes externos de GitLab real não são executados nessa validação local. Testes de adapters e as jornadas locais passam sem credenciais externas. A atualização do preview requer imagem preparada correspondente às fontes e aplicação aditiva da migração, preservando o volume existente.

Atualização local concluída: interface em `localhost:3310`, migração aditiva aplicada e imagem preparada verificada. Backup do banco em `sdlc/portal/.prepared/portal-before-interface-20261022.dump` e imagem anterior preservada como `sdlc-portal:before-interface-v1-20261022`. Os totais existentes permaneceram: 29 itens, 126 eventos de histórico, 2 repositórios, 1 sessão, 8 turnos e 1 execução. Nenhuma release ou fixture foi criada no banco humano durante a implantação.

A atualização inicial usou somente o Compose base; a conferência final identificou a falta dos overrides existentes. A aplicação final inclui `compose.yaml`, `.prepared/compose.integrations.json` e `.prepared/compose.llm.json`, como já previsto no bootstrap. GitLab e LLM responderam **READY** novamente, com os mesmos arquivos locais de credencial e relay; Registry e executor permanecem não configurados. Nenhuma inferência, provisionamento ou execução do usuário foi iniciada para validar a interface.
