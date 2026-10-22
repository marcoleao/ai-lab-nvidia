# Planos estruturados revisáveis

A assistente pode transformar a entrevista de um **Projeto** em proposta estruturada de Épicos, Histórias e Tarefas. Geração e revisão não criam itens. A aplicação é uma operação explícita e distinta, autorizada a Admin ou Product Owner.

## Jornada

1. Abra o Projeto e converse sobre seu objetivo, usuários, resultados e restrições. Uma conversa de Sistema não escolhe ou cria um Projeto de destino automaticamente.
2. Solicite **Gerar nova proposta**. O modelo local usa a entrevista recente e os repositórios envolvidos no Projeto. A fila, o cancelamento e os erros seguem o processamento persistente da conversa.
3. Revise a árvore: títulos, descrições, critérios de aceite e componentes. É possível adicionar/remover níveis, preservando ao menos um filho por nível. Limites: três Épicos, três Histórias por Épico, quatro Tarefas por História e 30 itens no total. Salve as alterações como nova revisão antes de aplicar.
4. Confira Projeto de destino e contagens, marque a confirmação e escolha **Confirmar criação**. Cancelar essa confirmação não altera o backlog.
5. Consulte o recibo e a hierarquia atualizada. O plano cria novos itens; não mescla ou sobrescreve itens anteriores. Aprovações, geração de código, gates, pipelines e deploys não são iniciados por essa ação.

Épicos entram em TO DO; Histórias em SPECIFICATION; Tarefas em TO DO. Critérios são preservados na descrição e nos dados da História. Vínculos de componentes são validados contra o Projeto; Tarefas usam subconjunto dos vínculos da História. IDs omitidos pelo modelo significam nenhuma atribuição (`[]`), nunca escolha automática de um repositório. Outros campos/valores inválidos ou fora do escopo são recusados, sem plano substituto ou itens parciais.

## Integridade e rastreabilidade

`PlanProposal` identifica o Projeto, turno de origem, contexto capturado e revisão atual. `PlanRevision` preserva cada versão do modelo/humana com autor e fonte; PostgreSQL bloqueia alteração/remoção das revisões. Os itens criados guardam proposta/revisão/turno de origem. O histórico registra geração, revisão e confirmação de aplicação com a persona responsável.

A proposta fica desatualizada se mudar a conversa, a versão do Projeto ou seu grafo de trabalho/vínculos. A verificação inclui alterações nos filhos que não incrementavam a versão do pai. Não existe atualização silenciosa das versões capturadas ou opção de forçar uma proposta antiga: é necessário revisar o contexto e gerar outra. Arquivamento/encerramento também bloqueiam a aplicação.

A aplicação utiliza a mesma transação e regras do CRUD manual: chaves, contadores, hierarquia, atribuições, proveniência, recibo e histórico são gravados integralmente ou revertidos. Reenvio com a mesma chave retorna o mesmo recibo; outra tentativa de aplicar a mesma proposta é recusada. A interface preserva rascunhos em conflitos e permite confirmar novamente uma operação cujo resultado HTTP ficou incerto, sem duplicar itens.

## Validação

Build de produção e TypeScript passaram. Vinte e oito contratos passaram em PostgreSQL descartável. Além dos contratos anteriores, foram verificados revisão imutável, permissão/checkbox obrigatório, replay concorrente, status iniciais, proveniência, proposta desatualizada por conversa/grafo, vínculos inválidos e normalização de atribuição omitida. Uma falha forçada na inserção da última Tarefa comprovou rollback de itens, contadores, histórico e recibo; após retirar a falha, o reenvio com a mesma chave funcionou.

Três E2E Chromium passaram: conversa, hierarquia e revisão/aplicação do plano. O teste de interface usa fixture exclusiva do navegador e cobre edição/adição de Tarefa, revisão salva, cancelamento da confirmação, checkbox, perda de resposta após aplicação, confirmação sem duplicação e recibo após reload. Revisão visual por agente de UX aprovada em 1440 e 390 px. Capturas não equivalem a aceite de teclado virtual ou acessibilidade integral.

Separadamente, o modelo real `qwen3:14b` gerou uma proposta válida em aproximadamente 60 segundos a partir de entrevista técnica em banco descartável. A aplicação confirmada criou um Épico TO DO, uma História SPECIFICATION e uma Tarefa TO DO; geração anterior à confirmação criou zero itens. O primeiro ensaio fora do contrato foi bloqueado sem gravação parcial. Nenhuma fixture ou Projeto pronto foi gravado no planejamento humano; o usuário continua definindo seu próprio domínio durante a demonstração.

Migração aplicada à prévia 3310 com backup em `/opt/agentic-sdlc/portal/backups/before-plans-20261020T185359Z.dump`, na distro SDLC. Comparação antes/depois preservou integralmente os seis itens, dois repositórios, seis ambientes e 24 eventos existentes. Sessões/turnos existentes também foram conferidos; ambos estavam vazios, e nenhuma proposta foi semeada. Os dois Projetos respondem com seus componentes selecionados e zero propostas; portal HTTP 200 após a atualização.

## Limites

Esta entrega é planejamento assistido. A qualidade e o escopo propostos precisam de revisão humana; o modelo pode omitir requisitos ou propor trabalho inadequado. O contexto de inferência continua sendo um recorte recente. A interface mostra a revisão atual e as dez propostas mais recentes, preservando versões anteriores no banco. Não há publicação de código, execução de tarefas, aprovação automática ou gates de release implementados por este fluxo.
