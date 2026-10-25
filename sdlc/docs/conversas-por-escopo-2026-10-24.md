# Conversas por Projeto e História

Data: 24/10/2026. Decisão do usuário: planejamento no Projeto, detalhamento e execução na História, com origem comum rastreável quando houver vários impactos. Implementação e validação desta evolução são registradas abaixo; não altera aplicações produzidas pelo SDLC.

## Responsabilidades e passagem de contexto

O menu Assistente mantém o planejamento do Projeto. Conversas anteriores do Sistema continuam no Sistema. A História possui sua conversa consultiva para requisitos, critérios, decisões e esclarecimentos de execução. A Tarefa usa o contexto da História ancestral, identificado na interface; o Épico usa o planejamento do Projeto. Abertura ou consulta não cria sessão, envia mensagem ou inicia agente.

A passagem para a História utiliza os requisitos persistidos e sua proveniência. Mensagens do Projeto não são transferidas para a História nem incorporadas integralmente ao prompt. As discussões de execução e merge continuam em suas fontes e preservam operação, autoria, tentativas e permissões. A coleção de conversas permite consultá-las juntas, identificando a origem.

Conversa não altera requisitos, aplica plano, aprova G1, corrige código ou solicita merge. Essas ações continuam exigindo os comandos, permissões, versões e confirmações existentes. Alterações reais do escopo exigem revisão das aprovações afetadas; mudança operacional ou associação de uma referência não invalida G1 por si.

O planejamento cria Épicos, Histórias e Tarefas nas situações existentes. A execução mantém CODING, CODE REVIEW e SECURITY SCAN, com evidências da revisão aplicável. Testes executados, candidatas imutáveis e promoção QA/HML/PRD permanecem no backlog funcional. Merge e conclusão de uma conversa não concluem a História. A release continua associando revisões identificadas das Histórias do Sistema.

## Origem e impactos compartilhados

`ConversationLink` registra uma referência de uma rodada concluída ou revisão de proposta para uma História do Projeto. Preserva fonte, identidade da fonte, revisão da proposta quando aplicável, versão observada da História, autoria e data. O vínculo é append-only; não copia mensagens, altera escopo ou concede aprovação. A origem pode ser o planejamento do Projeto ou a conversa de outra História do mesmo Projeto; uma sessão legada do Sistema ancestral pode ser referenciada explicitamente. É proibido vincular uma origem de outro Projeto.

Uma decisão pode ser relacionada a várias Histórias. A conversa de origem permanece única; cada vínculo identifica o alvo e sua revisão. A coleção usa identidade da fonte para evitar espelhos duplicados. Vínculos posteriores são novas ocorrências, sem editar auditoria já publicada. O vínculo significa referência contextual, não comprovação de implementação ou aceite do seu conteúdo.

Histórias criadas pela aplicação de uma proposta usam a proveniência já persistida em `Item.data`, validada contra `PlanProposal`, seus itens aplicados e a sessão original. A consulta não inventa vínculos para itens legados sem essa evidência. Novas aplicações de plano incluem alvos relacionados e referências no mesmo evento `PLAN_APPLIED`; não duplicam a operação em cada História.

## Conversa e auditoria

`ChatTurn`, `ExecutionMessage`, `MergeDiscussionTurn`, propostas e revisões mantêm o conteúdo em suas fontes próprias. `HistoryEvent` registra ocorrência, autoria, resultado, fase, decisão, comparação e referências seguras. Especificações, prompts, respostas integrais, código e credenciais não são copiados para a auditoria.

`CONVERSATION_LINKED` é uma ação local de associação: resultado `SUCCEEDED` ou `NO_CHANGE`, fase `COMPLETED`, decisão `NOT_APPLICABLE`. Usa o recorder compartilhado na transação do vínculo, com comparação ausência → referência, autoria humana declarada no LAB, correlação e evidência da origem. Erro do recorder reverte o vínculo. Reenvio com a mesma chave recupera o resultado original; mesma associação já existente não cria outro vínculo.

A consulta canônica de auditoria inclui os alvos relacionados explicitamente registrados em eventos v2, além do item e descendentes. Usa existência de alvo, sem duplicar linhas ou operações. O alvo primário e a autoria originais permanecem visíveis. Eventos legados não recebem alvos, resultados ou aprovações fictícios. Consultar páginas antigas não determina situação corrente ou gates.

## Contratos de consulta

- `GET /api/assistant`: contexto explícito, modo `planning` ou `delivery`, leitura de arquivados somente mediante opção, rodadas e propostas paginadas. Versão, rodada pendente e disponibilidade de entrevista são independentes da página de mensagens.
- `GET /api/items/:id/conversations`: mensagens das fontes do contexto, filtro de origem, escopo próprio/descendentes, páginas de 20, ordenação por data com desempate por identidade da fonte e limite `asOf`. A consulta identifica mensagens diretas, descendentes, origem do planejamento e referências explícitas. A cobertura informa as fontes consultadas; não declara integração de sistemas externos.
- `POST /api/items/:id/conversation-links`: História de destino, origem tipada, revisão da fonte, versão esperada da História, confirmação explícita, persona autorizada e chave idempotente. Sem mudança da versão operacional ou do conteúdo da História por adicionar referência.
- `GET /api/assistant/plans/:id/revisions/:version`: conteúdo da revisão exata na fonte, autoria, contexto e leitura de acervo explícita. A versão humana posteriormente editada não substitui o conteúdo da revisão referenciada.
- `GET /api/collections/items?kind=story&projectId=...`: seletor paginado e pesquisável de Histórias do Projeto, atravessando seus Épicos. Filtra no servidor e respeita arquivamento dos ancestrais.

Filtros aplicados, página e ordenação ficam na URL. Carregamento, erro, vazio e resultado confirmado têm apresentações distintas; erro preserva a consulta e o rascunho. Datas usam America/Sao_Paulo. A consulta do acervo é explícita e somente leitura. Paginação da conversa não amplia o contexto do modelo ou altera autorização de comandos.

## Métricas e limites

O usuário escolheu preservar os indicadores existentes, sem novas metas. Entrevistas de planejamento continuam restritas aos contextos de Projeto/Sistema instrumentados; a conversa consultiva da História não conta como entrevista de planejamento. Tentativas, falhas e retomadas dos executores mantêm as fontes atuais. O painel de auditoria continua adiado.

A coleção integrada não concede uma ferramenta de escrita ao modelo nem converte texto em decisão. Referenciar uma conversa permite sua consulta e rastreabilidade; seu conteúdo não passa automaticamente a integrar o prompt de codificação ou o escopo aprovado. Decisões que alterem a entrega precisam ser registradas nos requisitos e aprovadas pelo fluxo aplicável. Não executa testes/deploys futuros e não migra conversas entre contextos. A cobertura de seletores, fontes antigas e consultas operacionais não adaptadas permanece explícita no inventário UX-C06.

## Evidência

Validação em recursos Docker descartáveis, banco exclusivo `portal_test`, fonte montada somente para leitura. A migração aditiva foi exercitada nessa instalação; nenhuma fixture ou vínculo foi criado na base humana.

- Suíte completa de aplicação: **220 testes aprovados**, com **4 testes de provedores externos opt-in não executados**. O runner oficial recriou exclusivamente o schema de `portal_test` por suíte e deixou o banco vazio ao terminar.
- Verificação direcionada final: **15 testes aprovados** de escopo, referências e auditoria. Incluem 61 rodadas/23 propostas acessíveis, origem comum sem duplicação, aplicação real de plano, revisão humana exata, vínculos entre Histórias, recusa entre Projetos, acervo/ancestrais, versão otimista, rollback e replay idempotente.
- O corte temporal inicial usa o relógio do banco, alinhado ao ledger. Um teste atrasa somente o relógio da API em 60 segundos e confirma que eventos e conversas já persistidos continuam visíveis. O `asOf` informado pelo cliente permanece preservado para navegação histórica.
- TypeScript da API/web, build de produção, catálogo/guardas de auditoria e sintaxe do runner passaram.
- A regressão de navegador aprovou **41 cenários distintos** de conversas, Assistente, propostas, conclusão de entrevista e História/Tarefa. A última execução dos **7 cenários específicos** passou após os ajustes finais: referências sem vínculo prévio, falhas com causa da própria fonte, rodada ativa fora da página, replay após recarga, filtros/URL, acervo e links de origem arquivada.
- Revisão de UX e inspeção de capturas em 1440 e 390 pixels: contexto e fase permanecem visíveis, filtros recolhidos, foco e referências consultáveis, sem rolagem horizontal do documento. Isso não declara concluída a validação assistiva completa de UX-C07.

Os cenários de navegador interceptam dados exclusivamente nos testes. As capturas desktop/celular ficam em `portal/test-results/screenshots/conversations-1440.png` e `conversations-390.png`; o log de backend fica em `portal/test-results/conversations-backend.log`. Esses artefatos locais não transportam dados dos projetos humanos.

Publicação local concluída mediante solicitação explícita do usuário em **http://localhost:3310**. API e web usam a mesma imagem validada, com a aba **Execução** nos cinco níveis e os contratos de conversas disponíveis. A migração `202610240005_conversation_scope` foi aplicada com os três overrides de integrações, LLM e auditoria preservados.

Antes da migração, a entrada web foi retirada e a ociosidade das operações foi confirmada; nenhum trabalho foi cancelado. Com a API parada, foram preservadas suas imagens anteriores, criado backup privado e calculados digests de todas as tabelas existentes, inclusive `AuditInstallation` e `ItemAuditRevision`. A comparação exata após a migração e antes do reinício confirmou preservação integral. A conferência posterior manteve os **6 itens e 11 eventos de auditoria**; a nova tabela de referências nasceu vazia, sem dados fictícios. A época de auditoria foi preservada.

Backup: `conversations-20261024-67f4b3ad-attempt-d0eca1cf`, em diretório privado fora do repositório, com 93.498 bytes, digest conferido e formato legível por `pg_restore --list`. Isso verifica a integridade do arquivo, sem declarar um ensaio de restauração desta publicação. As imagens anteriores permanecem disponíveis para reversão das aplicações, sem restauração automática sobre trabalho novo.

Verificação posterior: saúde em modo `preview`, conta `sdlc_portal_app` sem UPDATE/TRUNCATE da auditoria nem UPDATE dos vínculos, leitura dos novos contratos em Sistema/Projeto/História e rótulos no JavaScript efetivamente servido. GitLab, modelo local e scanner disponíveis; registry e executor mantêm seu estado não configurado, conforme o backlog. O fingerprint da imagem confere com a fonte preparada. A ação administrativa `PORTAL_PUBLICATION` foi registrada pelo recorder compartilhado fora da base, com backup, fonte e imagem correlacionados; a cadeia administrativa foi validada sem operações pendentes. Nenhuma aplicação produzida pelo SDLC foi alterada ou executada para demonstrar a funcionalidade.
