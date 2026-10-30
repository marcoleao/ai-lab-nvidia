# Sistema contínuo, Projetos temporários e repositórios reutilizáveis

**Responsabilidades — 29/10/2026:** ambientes pertencem ao Sistema por meio do repositório único. Cadastro de referência, preparação da aplicação, provisionamento de destino e implantação têm provas próprias. O SDLC deve oferecer essa operação a partir do assistente e dos controles do portal, usando os mesmos serviços/executores; a infraestrutura base é administrada pela plataforma. A preparação RA-11b já funciona pelos controles; encaminhamento pela conversa e destino/implantação DEV são pendências explícitas. [Contrato e cobertura](autonomia-assistente-executores-2026-10-29.md).

**Atualização RA-02, 27/10/2026:** o cadastro corrente do repositório único inclui referências DEV/QA/HML/PRD. Sistemas existentes podem completar referências ausentes por comando explícito na aba Ambientes, sem alterar dados já registrados. Cadastro de referência não provisiona infraestrutura nem implanta aplicação. [Recibo e limites](plano-incremental-releases-ambientes-2026-10-27.md#10-recibo-ra-02--referências-de-ambiente). Os exemplos de múltiplos componentes abaixo permanecem históricos.

**Registro histórico parcialmente substituído em 26/10/2026:** por decisão posterior do usuário, cada Sistema passa a ter **um repositório criado automaticamente**, herdado por Projetos, Épicos, Histórias e Tarefas. A arquitetura organiza APIs, frontend, backend, batch e infraestrutura em pastas do mesmo repositório. Seleções manuais e catálogo de múltiplos componentes abaixo descrevem o modelo anterior. O [contrato corrente](../portal/docs/ARCHITECTURE.md#repositório-único-por-sistema--26102026) e a [publicação/adoção](revisao-navegacao-historia-2026-10-26.md#18-repositório-único-criado-no-cadastro-do-sistema) preservam as evidências históricas e os registros existentes; as regras antigas de aprovação/ciclo também foram substituídas pela estabilização de 25/10.

Esta decisão substitui a associação original de um repositório/ambientes por Projeto. A hierarquia de planejamento permanece **Sistema → Projeto → Épico → História → Tarefa**.

- **Sistema:** produto contínuo, proprietário lógico do catálogo de repositórios e seus ambientes.
- **Repositório:** componente de código do Sistema, com runtime Node/Python e ambientes QA/HML/PRD. Pode ser utilizado por vários Projetos.
- **Projeto:** iniciativa temporária; seleciona zero ou mais repositórios do mesmo Sistema. Criá-lo não cria repositório ou ambientes.
- **História/Tarefa:** podem indicar os repositórios envolvidos. Histórias selecionam dentro do escopo do Projeto; Tarefas dentro do escopo da História. Remover um vínculo superior é recusado enquanto trabalhos ativos descendentes ainda o utilizarem.

## Operação pela interface

Na consulta do Sistema, **Repositórios do Sistema** permite criar um componente novo ou vincular um GitLab existente pelo ID numérico, após verificar acesso pela conta técnica. O vínculo não altera conteúdo, branch, proteção, pipelines ou namespace remoto. Um mesmo repositório remoto não pode pertencer a dois Sistemas no catálogo. Criar um componente novo solicita o provisionamento idempotente de contrato neutro no grupo GitLab do Sistema, com resultado/retentativa visíveis.

Ao criar/consultar um Projeto, selecione os componentes envolvidos. O mesmo catálogo permanece disponível para outras iniciativas. Os ambientes aparecem na consulta do Sistema, identificados por componente. Não existe deploy automático ao criar um vínculo ou encerrar um Projeto.

**Aprovação** continua `AWAITING APPROVAL / APPROVED`. O **Ciclo do Projeto** é separado: `PLANNED → ACTIVE → COMPLETED`, com alternativa `CANCELLED`. Iniciar exige aprovação. Concluir exige pelo menos um Épico e todos os Épicos ativos em DONE. Projetos encerrados bloqueiam alterações de planejamento; reabertura exige justificativa de pelo menos dez caracteres. COMPLETED reabre em ACTIVE; CANCELLED reabre em PLANNED. Aprovação não é gate de execução ou autorização de deploy.

Cancelar, concluir ou arquivar um Projeto preserva os repositórios do Sistema e seus ambientes. Arquivamento continua sendo uma operação distinta do ciclo de vida.

## Migração preservando o ambiente existente

A migração `202610200002_product_repositories` é transacional e não chama GitLab. Transfere os metadados dos antigos repositórios de Projeto para registros `Repository` do Sistema, mantém IDs/URLs remotos e cria vínculos de uso para os Projetos e suas Histórias/Tarefas existentes. Os ambientes mantêm seus IDs e passam a referenciar o componente. Jobs antigos de provisionamento de Projeto são cancelados localmente; Sistema continua provisionando somente o grupo.

Os nomes, IDs, status de aprovação, relações e histórico anteriores são preservados. O ciclo de cada Projeto começa em PLANNED: aprovação anterior não comprova início ou conclusão. Há um evento adicional por Projeto documentando a mudança de propriedade; eventos anteriores não são reescritos. Repositórios ainda não provisionados não são criados automaticamente pela migração: exigem retomada explícita na consulta do Sistema.

Antes da aplicação humana, a migração foi ensaiada em uma cópia local descartável: seis itens, dois repositórios e seis ambientes preservados; histórico passou de 22 para 24 eventos pela adição de dois recibos de migração. Backup local foi feito antes da mudança.

Aplicação na prévia da porta 3310 concluída: seis itens, dois repositórios e seis ambientes preservados. Todos os 22 eventos anteriores foram comparados e mantidos integralmente, com dois eventos novos de migração. Os IDs GitLab 2 e 3, caminhos e URLs permaneceram iguais. Os Projetos existentes continuam APPROVED e começam com ciclo PLANNED. Backup anterior à aplicação em `/opt/agentic-sdlc/portal/backups/before-product-model-20261020T170009Z.dump`, na distro SDLC, com diretório privado. O portal voltou a responder HTTP 200.

## Validação e limites

Build de produção e TypeScript passaram. Vinte testes de contrato passaram em PostgreSQL descartável: propriedade/reutilização, escopo entre Sistemas e descendentes, vínculo remoto somente leitura, aprovação versus ciclo, bloqueio de encerramento prematuro, reabertura justificada, idempotência, concorrência e preservação de histórico. O ensaio GitLab remoto anterior não foi repetido como teste destrutivo no ambiente humano.

Dois E2E Chromium passaram (assistente e hierarquia), incluindo cadastro manual de componente, seleção na criação de Projeto/História/Tarefa, aprovações e atualização de Tarefa. Revisão visual por agente de UX em desktop e celular: distinção entre produto e iniciativa clara; manter melhorias futuras para tabelas no celular e tamanho do botão flutuante da assistente. As capturas não equivalem a aceite integral de acessibilidade.

Não há execução de agentes, build, publicação ou deploy nesta mudança. Pipelines futuros precisarão consumir os vínculos explícitos e os ambientes dos componentes, sem ressuscitar repositórios por Projeto. Importação de código, migração de repositório entre Sistemas, remoção do catálogo e topologia de deploy com vários componentes ficam para entregas próprias.
