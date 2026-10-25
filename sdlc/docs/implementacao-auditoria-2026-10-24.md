# Auditoria transversal — implementação no LAB

Data: 24/10/2026. Origem: [diagnóstico e proposta aprovados pelo usuário](proposta-auditoria-transversal-2026-10-24.md).

## Contrato adotado

O portal grava novos eventos pelo módulo `apps/api/src/audit.ts`, conforme catálogo explícito `audit-catalog.ts` e contrato compartilhado `packages/shared/src/audit.ts`. A ação desconhecida, combinação inválida de resultado/fase/decisão ou ausência de comparação obrigatória impede a confirmação da transação.

`HistoryEvent` evolui de forma aditiva para contrato v2. Cada novo registro inclui resultado, fase, alvo, executor, iniciador conhecido ou identificado como não capturado, origem, operação, instante do fato, época de auditoria e envelope validado. Alterações, alvos e evidências ficam selados na mesma linha imutável; não há filhos que possam ser acrescentados depois para mudar o evento publicado.

`AuditInstallation` mantém a época persistente desta instalação. Sua identidade entra na deduplicação explícita. Reenvio de comando continua idempotente; o recorder também aceita chave explícita de ocorrência com digest canônico. Mesma chave e conteúdo divergente gera conflito. Isso não significa que toda origem externa já fornece ID próprio ou que toda chamada usa deduplicação adicional.

Resultados: `ACCEPTED`, `SUCCEEDED`, `REJECTED`, `FAILED`, `CANCELLED`, `NO_CHANGE`, `DEFERRED`, `UNKNOWN`. Fases: `REQUESTED`, `STARTED`, `COMPLETED`, `WAITING`, `OBSERVED`. Decisões de domínio são separadas: `APPROVED`, `REJECTED`, `NOT_EVALUATED`, `NOT_APPLICABLE`, quando aplicáveis. A confirmação do início não conclui a operação; análise concluída pode reprovar o código. Falha/incompletude da análise não aprova gate.

## Cobertura de produtores

Evolução de 25/10/2026: `ITEM_STATE_POLICY_CHANGED` cobre a adequação explícita de estados legados de Projeto/Épico e sua reversão compensada. Resultado SUCCEEDED, fase COMPLETED e decisão NOT_APPLICABLE; executor de manutenção, iniciador não capturado quando ausente e operação correlacionada ao ledger administrativo externo. Atualização de item e recorder pertencem à mesma transação. O comando não altera arquivados nem reescreve eventos; rollback de transação e retentativa, reversão idempotente e recusa de sobrescrever trabalho posterior são exercitados em `tests/item-state-policy.test.ts`.

| Família | Adoção nesta entrega |
| --- | --- |
| Sistemas, Projetos, Épicos, Histórias e Tarefas | Criação, edição, aprovação, status/ciclo, arquivamento e vínculos passam pelo recorder transacional, com comparações selecionadas |
| GitLab | Pedido/origem, tentativa, confirmação e efeito sem resposta separados; iniciador humano e integração executora identificados; efeito tardio após arquivamento não reativa o Sistema |
| Assistente e planos | Solicitação, resposta/proposta, revisão/aplicação, cancelamento, expiração e falhas de recuperação auditados; conteúdo permanece nas fontes próprias |
| Execução e qualidade | Gates, transições, falhas, retomadas e publicação; resultado técnico separado da decisão; efeitos remotos sem confirmação tratados explicitamente |
| Merge e conversas | Registro central, correlação com operação/revisão e distinção entre solicitação, execução e confirmação externa |
| Trabalho automático | Transições de Tarefas registram anterior/novo, evidência e executor; heartbeat/progresso continuam em `WorkEvent` |
| Releases | Criação/composição/transferências e associação de Histórias; histórico embutido usa a mesma projeção segura |
| Recusas HTTP | Mutação recusada ou falha tem evento próprio fora da transação revertida; alvo pode ser a requisição quando o Item ainda não existe |
| Inferência técnica | Pedido e conclusão/falha do probe são auditados sem guardar prompt ou resposta no histórico |
| Consulta restrita de descrição | Acesso autorizado gera ocorrência própria, sem transformar consultas comuns em eventos de negócio |

O inventário acima identifica os produtores adaptados; não representa auditoria de todo SQL administrativo, toda ação remota no GitLab nem de aplicações produzidas pelo SDLC. Webhooks externos e federação integral da trilha do núcleo legado permanecem fora dessa cobertura.

## Comparação e conteúdo restrito

Campos selecionados usam `before/after` com valores tipados: valor efetivo, inexistente, não observado e restrito são situações diferentes. Criação registra inexistência anterior; arquivo registra a marcação e versões; seleção usa os conjuntos anterior/novo. Não ler o estado atual para reconstruir uma alteração histórica.

Descrições ficam em `ItemAuditRevision`, separado da projeção pública e protegido contra edição/exclusão. A auditoria aponta revisões anterior/nova. `GET /api/items/:id/revisions/:revisionId` exige persona com permissão de planejamento, confere o vínculo ao Item e audita o acesso. A interface mostra a referência, sem carregar automaticamente o conteúdo. Isso é controle do LAB com identidade declarada, não autenticação corporativa.

Um registro existente sem revisão passa a ter seu conteúdo observado quando uma edição o captura; esse instante não é uma reconstrução retroativa. O digest da revisão serve à integridade do conteúdo, não à sua anonimização.

Payloads novos são selecionados antes de persistir. Especificação, conteúdo de conversa, entrada/saída de modelo, código e credenciais não são copiados para a auditoria. Pareceres e evidências permanecem nas suas fontes; mensagens de auditoria dos agentes são genéricas. Históricos embutidos e a consulta canônica compartilham a projeção segura.

A [evolução de conversas por escopo](conversas-por-escopo-2026-10-24.md) acrescenta `CONVERSATION_LINKED`: associação confirmada ou já existente, com decisão `NOT_APPLICABLE`, comparação da referência, autoria, correlação e alvos relacionados. O vínculo e a auditoria confirmam na mesma transação. Novos `PLAN_APPLIED` identificam as Histórias criadas em seus alvos, mantendo uma operação única. A consulta contextual inclui esses alvos v2 com existência de referência, sem duplicar registros ou modificar o legado. O conteúdo das mensagens continua exclusivamente em suas fontes.

A publicação autorizada dessa evolução usa a ação administrativa explícita `PORTAL_PUBLICATION`, com escopos de preparação de imagem e atualização local. O recorder administrativo compartilhado registra solicitação e desfecho fora do banco, com referências de fonte, imagem e backup privado. Foram conferidos todos os registros anteriores à migração com workers parados e preservada a época da auditoria; nenhuma ocorrência de negócio foi criada para demonstrar a funcionalidade. A evidência de publicação está no documento específico acima.

## Consulta e legado

As abas Auditoria mantêm filtros, URL, paginação de 20, ordenação determinística e referência `asOf`. A lista mostra alvo registrado, iniciador/executor, ação, resultado, fase, decisão, comparação e referências selecionadas. A apresentação compacta mantém ação, alvo e desfecho identificáveis; detalhes são acessíveis por teclado.

Filtros adicionais: resultado ausente (`result=__missing__`), fase, decisão, iniciador, executor, operação e contrato (`legacy`/`v2`). A situação corrente e os gates permanecem independentes da página de auditoria.

Eventos legados são preservados. Resultado explícito suportado mantém sua procedência; ausência aparece como **Legado: resultado não capturado**, sem converter o nome da ação ou o estado atual em sucesso. Referências GitLab existentes e comparações de composição de releases passam por seleção segura, sem expor payload bruto. A migração não altera os fatos existentes nem gera eventos de negócio para simular funcionamento.

`GET /api/audit/events` permite consulta global, incluindo recusas sem Item, com o mesmo contrato de filtros/paginação. Exige Admin ou Arquiteto no modo de persona declarada. Sem guard a rota nega acesso. O escopo padrão é `global`; a resposta identifica as fontes cobertas. Não foi acrescentado novo item ao menu nem painel de indicadores.

`asOf` delimita a consulta disponível; não certifica snapshot imutável de todas as transações concorrentes. Exportação reprodutível e respectivos perfis/retenção permanecem como decisões próprias, sem implementação implícita nesta entrega.

## Proteção e instalação

As migrations `202610240003_audit_contract` e `202610240004_audit_runtime_role` preservam os registros antigos e acrescentam constraints/índices/época. Triggers bloqueiam alteração/exclusão de eventos e revisões.

A API local usa a conta `sdlc_portal_app`, sem propriedade, herança de papéis ou privilégios administrativos. Ela pode inserir/consultar auditoria, mas não atualizar, apagar, truncar ou desativar seus controles. A época é somente leitura para a aplicação. Novas migrations precisam conceder apenas os privilégios necessários às novas tabelas; o runtime não herda a conta de migração.

`scripts/runtime-role.py` configura uma credencial aleatória em arquivo privado fora do repositório e gera `.prepared/compose.audit.json`, sem incluir a senha no override. O servidor lê o segredo por arquivo. O bootstrap incorpora o override e prepara a conta depois das migrations, antes de subir a API. Não trocar a credencial existente a cada inicialização.

O configurador valida um papel preexistente antes de reutilizá-lo. A inicialização exige o contrato v2 para inserções da aplicação. Um administrador de banco ainda pode mudar schema, papéis ou arquivos; esses controles não são uma garantia contra administração privilegiada.

## Administração fora do banco

`sdlc/scripts/audit_admin.py` oferece contexto Python e CLI `begin/end/epoch/validate`. A trilha fica em `/opt/agentic-sdlc/audit/admin.jsonl`, fora de `state` e `backups`, com diretório 700, arquivo 600, bloqueio, `fsync`, encadeamento e operação pai. Metadados seguem allowlist; bodies, respostas e credenciais não são registrados. UID/EUID são observados; a pessoa por trás de uma sessão root não é inventada.

Foram adaptados no código os configuradores GitLab/LLM, o configurador da conta de banco do portal, o gerenciador GitLab e os scripts de runtime/reset legado. Exclusão remota aceita para processamento não é registrada como exclusão definitivamente confirmada. Reset legado preserva o ledger, verifica a condição vazia por leitura e gira a época administrativa externa.

A época administrativa do legado não muda a época do banco do portal. Procedimentos futuros de restore/reset do portal precisam coordenar o `AuditInstallation` com a trilha externa; não devem copiar uma época antiga silenciosamente.

A instalação do portal usa os configuradores do workspace. As alterações nos scripts do pacote legado precisam passar pelo preparo/atualização desse pacote antes de substituir a fonte instalada: não editar o manifesto para ocultar divergência de fingerprint. Isso não exige executar reset, demos, backup sintético ou comandos de negócio para demonstrar a auditoria.

O ledger local não oferece WORM, assinatura independente ou proteção contra root. Sem âncora externa, remover um sufixo válido da cadeia não é detectável apenas pelo arquivo restante. Custódia independente e integração completa com logs nativos dos provedores são etapas de proteção de produção.

## Testes e regra para novas ações

`pnpm test` usa `scripts/test-isolated.mjs`: exige `portal_test`, recria o schema exclusivamente desse banco antes de cada suíte de integração e deixa o alvo vazio ao terminar. Isso habilita também as suítes que usam variáveis próprias (`TEST_RELEASES_DATABASE_URL`, `TEST_QUALITY_DATABASE_URL`, `TEST_MERGE_DATABASE_URL`, `TEST_WORK_DATABASE_URL`). Nunca usar a URL de aceitação. Testes reais de provedores externos continuam opt-in e não são substituídos por mocks.

`audit-guard.test.ts` impede inserções ORM fora do recorder e valida ações literais contra o catálogo. `audit.test.ts`, `audit-db.test.ts`, `audit-app.test.ts`, `audit-gitlab.test.ts` e `audit-producers-work.test.ts` verificam contrato, legado, epoch, comparação, deduplicação divergente, rollback, conta restrita, revisão protegida, resposta perdida, efeito tardio e Tarefas automáticas. A barreira estática complementa os testes, sem provar sozinha cobertura integral.

Os e2e de auditoria usam APIs simuladas, verificam resultado separado da decisão, legado, filtros, referências, teclado e tela pequena. Testes administrativos usam diretórios temporários/mocks; nenhum teste deve criar registros na base humana ou alterar resultados reais dos agentes.

Evidência da entrega: **204 testes de aplicação aprovados**, incluindo as suítes de banco específicas habilitadas; quatro cenários de infraestrutura externa permaneceram opt-in. **Sete cenários de navegador** de auditoria/padrões passaram, além de **nove testes administrativos e onze regressões do gerenciador GitLab**. TypeScript, build de produção, sintaxe PowerShell/shell e verificação de diferenças passaram. As fixtures antigas de criação de Sistema foram alinhadas à regra já aprovada de seis letras, sem alterar dados de aceite.

Aplicação local: migrations aditivas aplicadas após backup privado; contagens de negócio e digest dos campos originais dos dois eventos existentes conferidos antes/depois, sem alteração. Portal saudável; GitLab, modelo local e scanner disponíveis. Consulta global confirmou os dois eventos legados preservados. Consulta de privilégios executada pela própria API confirmou `current_user=sdlc_portal_app`, sem UPDATE ou TRUNCATE de `HistoryEvent`. Nenhum evento de negócio fictício foi criado para validar a publicação.

## Adoção e limites do plano

| Item | Situação |
| --- | --- |
| AUD-01 | Catálogo e famílias de produtores mapeados; novas ações exigem contrato e teste |
| AUD-02 | Contrato v2, recorder, persistência aditiva, comparações/época/deduplicação explícita implementados |
| AUD-03 | Itens, vínculos e provisionamento do portal adaptados |
| AUD-04 | Produtores de assistente, execução, qualidade, merge e trabalho adaptados |
| AUD-05 | Planejamento/composição de releases adaptados; futuros deploys seguem no backlog existente |
| AUD-06 | Recusas e adapters administrativos implementados; identidade corporativa e atualização do pacote legado são marcos separados |
| AUD-07 | Consulta contextual/global e comparação adotadas; exportação reprodutível não implementada |
| AUD-08 | Restrições do runtime, testes e regra para novas ações adotados; custódia independente e política formal de retenção pendentes |

Decisões do usuário nesta entrega: **painel de indicadores adiado**. Não há prazo de retenção definido; eventos são preservados sem expiração automática. Não foram inventadas metas operacionais, autenticação corporativa ou certificação de conformidade.
