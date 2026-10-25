# Auditoria transversal do SDLC — diagnóstico e proposta de arquitetura

Data: 24/10/2026. Estado: **proposta aprovada pelo usuário; adoção e limites registrados na [implementação](implementacao-auditoria-2026-10-24.md)**. As seções abaixo preservam o diagnóstico e o desenho original; o documento de implementação distingue o que foi entregue das etapas de produção e decisões pendentes.

Escopo: portal atual, seus agentes/workers e integrações, com contratos de adaptação para núcleo legado e operações administrativas. Revisões independentes de arquitetura, UX e operação realizadas por agentes de apoio. Nenhum evento, resultado de agente, dado de negócio ou recurso GitLab foi alterado nesta análise.

## 1. Parecer

A preocupação é procedente. A trilha atual registra ocorrências, mas não garante que cada uma explique seu resultado, o efeito produzido e a identidade de quem iniciou e executou a ação. O problema não se resolve apenas trocando “Não registrado” por “Sucesso”. Precisamos tornar esses fatos obrigatórios na origem, preservar suas evidências e apresentá-los sem confundir pedido, execução, decisão de negócio e situação atual.

Recomendo um **módulo compartilhado de auditoria no backend**, contrato versionado e catálogo tipado de ações, com projeção e componentes de consulta comuns. A tabela de domínio continua sendo a fonte do estado corrente. Não recomendo iniciar por um microserviço, por event sourcing integral ou por triggers genéricos como única fonte da explicação de negócio.

O contrato deve responder: **o que aconteceu, sobre qual objeto, quem solicitou, quem executou, quando ocorreu e foi registrado, por que foi permitido/recusado, qual o resultado observado, o que mudou e qual evidência sustenta a afirmação**.

Uma solicitação pode ter sido aceita sem que o efeito externo tenha sido concluído. Uma análise de segurança pode ter sido executada com sucesso e reprovado o código. Um timeout pode deixar o efeito remoto indeterminado. A auditoria precisa registrar essas distinções.

## 2. Diagnóstico comprovado

### 2.1 Caso observado no aceite

Consulta somente por leitura à base atual identificou **dois eventos**, um `ITEM_CREATED` e um `GITLAB_PROVISIONED`. Ambos estão sem os campos que a consulta atual reconhece como resultado. Foram consultados apenas contagens, ações e nomes de campos, sem coletar conteúdo de negócio.

| Evento | Campos efetivamente registrados no payload | Consequência |
| --- | --- | --- |
| `ITEM_CREATED` | `key`, `status` | A criação é afirmada pela ação; não existe campo explícito de resultado |
| `GITLAB_PROVISIONED` | `gitlabGroupId`, `gitlabGroupPath`, `gitlabUrl` | Há referências do recurso remoto; não existe campo explícito de resultado |

`apps/api/src/collections.ts:58–80` procura `payload.result`, `payload.outcome` ou `payload.state`. Na ausência deles, retorna nulo. `apps/web/app/history-collection.tsx:62` apresenta “Não registrado”. A tela expõe uma deficiência do contrato de gravação; não é evidência de que a operação falhou.

Há outra perda: a lista segura de detalhes de `collections.ts` não inclui a chave do item nem as referências GitLab desses dois eventos. Além disso, só admite valores escalares curtos; diferenças estruturadas como `before/after` de releases não chegam integralmente à consulta. A correção exige projeção tipada e segura, não liberação de payload bruto.

### 2.2 Inventário por família

| Família / fontes inspecionadas | O que já existe | Lacuna a tratar |
| --- | --- | --- |
| Itens e hierarquia — `app.ts` | Criação, atualização, aprovação, status, ciclo e arquivamento auditados na transação | Resultado não obrigatório; atualização só registra versão; aprovação/arquivamento têm payload vazio; não há comparação uniforme |
| Escopo e repositórios — `app.ts`, `journey.ts` | Vínculos, seleção de componentes, provisionamento e retomadas possuem eventos | Seleção pode guardar só o conjunto novo; resultado e referências remotas não têm contrato comum; operações sem alteração não têm semântica uniforme |
| Assistente e planejamento — `assistant.ts`, `plans.ts` | Mensagens, propostas, revisão e aplicação; conteúdo versionado em fontes próprias | Expiração de rodada e fallback de erro não têm cobertura canônica equivalente; falta identidade iniciador/executor uniforme |
| Execução e conversa — `execution.ts`, `execution-discussion.ts` | Pedido, G1, publicação, falhas, cancelamento e retomada | Alguns produtores inserem diretamente no histórico e usam ancestrais vazios; resultado, evidência e sequência não são uniformes |
| Qualidade — `quality.ts` | SHA, política, resultado e duração em parte dos eventos | Resultado mistura execução da ferramenta e decisão sobre o código; outros eventos da mesma família omitem resultado |
| Merge e conversa — `merge.ts`, `merge-discussion.ts` | Operação, execução, SHA e MR; confirmação externa | Escrita própria fora do helper; solicitante, executor e autoria remota precisam ser distinguidos |
| Releases — `releases.ts` | Revisões e composição; alguns eventos já possuem `before/after` | Contrato/projeção não uniforme; vínculos têm vários objetos afetados e precisam de alvo primário e alvos relacionados |
| Trabalho operacional — `work-activities.ts` | `WorkActivity`, `WorkAttempt`, `WorkEvent`; deduplicação por tentativa/chave | Mudanças automáticas de Tarefas precisam de evidência auditável por alvo; heartbeat/progresso não devem inundar a auditoria |
| Falhas e recusas de requisição — `app.ts` | Respostas estruturadas de validação, permissão, conflito e erro | Handler não persiste trilha de tentativa; gravar só na transação que reverte não resolve |
| Legado — `services/control` | Eventos transacionais, outbox, idempotência e cadeia de hashes por Projeto | Modelo e acesso separados; não existe federação automática com o portal; eventos de segurança têm conteúdo reduzido |
| Administração — scripts de integração, GitLab, backup/restore/reset | Marcadores, relatórios e arquivos operacionais | Não constituem trilha central imutável; reset pode apagar o próprio histórico; falta identidade operacional e registro externo ao alvo |

Este inventário é uma análise estática das famílias e caminhos principais, não uma declaração de cobertura integral de todos os efeitos possíveis. A primeira etapa de implementação deve fechar a matriz rota/comando/worker/transição → contrato → teste, incluindo SQL de migração e manutenção. Nenhuma família está declarada migrada.

### 2.3 Evidências técnicas principais

- `prisma/schema.prisma`, modelo `HistoryEvent`: ação, ator, item, ancestrais, mensagem, payload e timestamp; sem resultado tipado, versão de contrato ou mudanças obrigatórias.
- `apps/api/src/app.ts:57–75`: helper aceita `action:string` e `payload:unknown`; `mutate` já oferece transação e idempotência úteis.
- `app.ts:135/144/154/159/170/188/200/229`: criação, atualização, aprovação, vínculos, ciclo, status, arquivamento e GitLab apresentam granularidades diferentes. `STATUS_CHANGED` e ciclo já guardam `from/to`.
- `execution.ts:142/249`, `merge.ts:112`, `releases.ts:98`: inserções diretas permitem contornar o helper.
- `assistant.ts:85/157`: recuperação de falha/expiração altera rodada sem a mesma cobertura de `HistoryEvent`.
- `prisma/migrations/202610200001_foundation/migration.sql:130–136`: trigger impede UPDATE/DELETE de linhas de histórico. Não impede TRUNCATE nem alteração do trigger por um administrador.
- `tests/collections.test.ts:136–147`: protege contra fabricação de resultado legado e verifica linhagem. Preservar essa intenção.
- `services/control/control.py:114–147`, `maintenance.py:24–29`, `runtime.py:36–37`: núcleo legado contém padrões úteis de evento/outbox/cadeia/verificação/privilégios, a adaptar sem alegar equivalência com o portal.
- `scripts/linux/reset-business-data.sh`: apaga histórico e backups; o marcador `clean-start` registra início vazio, não cadeia de custódia administrativa completa.

## 3. Modelo de informação proposto

### 3.1 Separar conceitos

| Conceito | Pergunta respondida | Exemplo |
| --- | --- | --- |
| Ação | O que foi tentado ou realizado? | Criar Sistema; aprovar G1; provisionar grupo |
| Fase | Que momento foi observado? | Pedido recebido, início, espera, conclusão, observação/reconciliação |
| Resultado da ação | Qual foi o desfecho desta ocorrência? | Aceita, concluída, recusada, falhou, sem alteração |
| Decisão de domínio | Qual foi o veredito aplicável? | G1 aprovado; revisão reprovada; promoção bloqueada |
| Estado registrado | Como estava o alvo/job nessa ocorrência? | ACTIVE; pending → ready; DRAFT |
| Estado atual | Como o processo está agora? | Projeção corrente, consultada separadamente |
| Qualidade da evidência | O que realmente está demonstrado? | Transação local confirmada; confirmação remota; dado legado incompleto |

Resultado nunca será deduzido genericamente de `status`, do sufixo da ação, de HTTP 200 ou do estado atual do item. Cada ação terá semântica e evidências permitidas no catálogo.

### 3.2 Vocabulário inicial de resultados

| Código proposto | Exibição | Regra |
| --- | --- | --- |
| `ACCEPTED` | Solicitação aceita | Aceitação durável; não afirma efeito assíncrono concluído |
| `SUCCEEDED` | Concluída | Efeito definido para a ação confirmado; informar seu escopo |
| `REJECTED` | Recusada | Permissão, validação, conflito ou regra impediu o comando; razão tipada |
| `FAILED` | Falhou | Falha de execução comprovada; não equivale a qualquer timeout remoto |
| `CANCELLED` | Cancelada | Cancelamento no escopo confirmado; não afirma reversão de efeito remoto |
| `NO_CHANGE` | Sem alteração | Comando válido sem mudança, com razão; replay não duplica o evento original |
| `DEFERRED` | Adiada / aguardando | Dependência ou decisão impede continuidade, com motivo explícito |
| `UNKNOWN` | Efeito não confirmado | Somente nos casos previstos, como resposta remota perdida; exige reconciliação |

Não há resultado vazio no contrato novo. `UNKNOWN` não será um valor padrão para contornar validação. Campos obrigatórios e combinações de fase/resultado serão definidos por ação. Registros antigos sem campo próprio usam a classificação de cobertura **legado sem resultado explícito**, separada do vocabulário de fatos novos.

Uma revisão corretamente executada com achados pode ter `SUCCEEDED` e `decision=REJECTED`. O gate continua bloqueado. Uma análise que não terminou tem `FAILED` ou `UNKNOWN`, nunca aprovação. Conclusão parcial é registrada por alvos/etapas confirmados; não se publica sucesso global enquanto houver parte sem confirmação.

O resultado pertence ao **fato delimitado pela ação**, não automaticamente à operação inteira. O catálogo fecha as combinações abaixo e proíbe combinações indefinidas:

| Ação/fato | Fase | Resultado do fato | Decisão | Situação da operação |
| --- | --- | --- | --- | --- |
| Pedido persistido | `REQUESTED` | `ACCEPTED` | `NOT_APPLICABLE` | Na fila |
| Tentativa assumida pelo worker | `STARTED` | `SUCCEEDED`, exibido como “Início confirmado” | `NOT_APPLICABLE` | Em execução; não concluída |
| Continuidade depende de G1 | `WAITING` | `DEFERRED` | `NOT_EVALUATED` | Aguardando decisão |
| Análise concluída com achados impeditivos | `FINISHED` | `SUCCEEDED` | `REJECTED` | Análise concluída; gate bloqueado |
| Scanner interrompido antes do parecer | `FINISHED` | `FAILED` | `NOT_EVALUATED` | Requer nova análise; gate bloqueado |
| Efeito remoto sem confirmação | `OBSERVED` | `UNKNOWN` | `NOT_APPLICABLE` | Reconciliação pendente |
| Efeito remoto confirmado depois | `RECONCILED` | `SUCCEEDED` | `NOT_APPLICABLE` | Concluída no escopo confirmado |

`decision` distingue `NOT_APPLICABLE`, `NOT_EVALUATED`, `APPROVED` e `REJECTED`; veredito parcial não autoriza aprovação. A projeção só conclui a operação com o evento terminal aplicável. Métricas de sucesso de operações não contam eventos intermediários bem-sucedidos como operações concluídas.

### 3.3 Envelope versionado

| Grupo | Campos / regras propostas |
| --- | --- |
| Identidade do evento | `eventId`, `schemaVersion`, `action`, `actionVersion`, `auditEpochId` |
| Alvo | Tipo, ID estável, chave/nome registrados no instante, versão anterior/nova quando aplicável; snapshot mínimo independente da existência futura do item |
| Escopo | Ancestrais registrados e alvos relacionados; suporte a repositório, release, integração, configuração e operação administrativa, além de Item |
| Autoria | `initiator`, `executor`, representação/delegação quando houver; tipo e grau de autenticação da identidade |
| Origem | Aplicação/componente, versão/build, canal HTTP/worker/CLI/provedor e instância; valores confiáveis definidos no servidor |
| Tempo | `occurredAt`, `recordedAt`, tempo de origem e sua procedência quando externo; UTC no armazenamento e Brasília na consulta |
| Desfecho | `phase`, `outcome`, `reasonCode`, resumo seguro; decisão e estado em campos distintos |
| Causalidade | `operationId`, `causationEventId`, `requestId`, `attemptId` e sequência por operação quando aplicáveis |
| Deduplicação | Chave determinística por ocorrência/transição e ID de evento do provedor quando existir; não expor chave/token secreto |
| Alterações | Conjunto tipado `changes` ou motivo explícito de inaplicabilidade; valores selecionados por política |
| Evidências | Tipo, origem, ID estável, revisão/SHA/digest, instante de observação e referência de acesso; sem despejo de HTTP/payload bruto |
| Cobertura | Fonte original, versão, completude e restrições; enriquecimento posterior identificado separadamente |

Não é necessário preencher `attemptId` em uma edição síncrona nem inventar um `requestId` humano para um webhook. O catálogo declara os campos aplicáveis e torna essa aplicabilidade verificável. Operações sem item existente, recusadas antes da criação e manutenção precisam de alvo próprio, sem criar um Item fictício para acomodá-las.

## 4. Valores anteriores e novos

Capturar os valores na transação que efetiva a mudança, depois de conferir autorização e versão. A fonte não é a cópia enviada pelo navegador. Uma leitura posterior não recupera com segurança o estado que existia antes.

Cada alteração terá `field/path`, operação (`add`, `replace`, `remove`), anterior, novo e política de visibilidade. Distinguir **valor nulo**, **inexistente**, **não observado** e **restrito**; esses quatro estados não podem compartilhar um simples `null`.

| Ação | Evidência mínima recomendada |
| --- | --- |
| Criar Sistema | Alvo inexistente → existente; chave/nome/status inicial/versão permitidos; resultado local confirmado |
| Editar | Campos alterados, anterior → novo, versões; sem registrar como mudança os campos iguais |
| Alterar status/ciclo | Estado anterior → novo; razão, versão e decisão humana aplicável |
| Aprovar gate | Decisão anterior → nova, aprovador, política, revisão/digest e escopo exatos; aprovação não se propaga para outra revisão |
| Arquivar em cascata | `archived:false → true` em cada alvo e versões; operação pai correlacionada; eventuais jobs cancelados identificados |
| Alterar vínculos | Conjuntos anteriores/novos ou adições/remoções por ID; referências e versões aplicáveis |
| Provisionar GitLab | Estado local anterior → confirmado; ID/caminho remoto; distinguir criado agora, recurso reutilizado ou verificação reconciliada |
| Compor release | Adições, remoções e revisões planejadas, fontes/destinos em transferência; sem confundir com pacote/deploy |
| Solicitar agente | Aceitação, contexto/revisão e modelo/política; conteúdo por referência controlada |
| Executar/revisar/integrar | Tentativa, entradas aprovadas por referência, revisão, resultado da execução, veredito e evidência remota |
| Trocar credencial/configuração | Quem, qual integração, versão/fingerprint não secreto e efeito; valores secretos nunca entram no diff |

Texto de negócio precisa de política explícita: metadados curtos permitidos podem ter anterior/novo; descrições longas ou restritas devem usar revisões imutáveis e consulta autorizada. O registro principal aponta revisão anterior/nova e informa a restrição. Não copiar prompts, respostas integrais, código, tokens ou segredos para a auditoria. Digest de conteúdo sensível não é anonimização; conteúdo de baixa entropia exige outra política.

Para lotes, correlacionar sumário com eventos/alterações por alvo e contagens confirmadas. Não registrar uma lista truncada como todos os afetados. Heartbeat não exige diff de negócio a cada atualização; transições de Tarefas feitas pelo executor exigem rastreabilidade do alvo e da evidência que as justificou.

## 5. Componentes e garantias

| Componente proposto | Responsabilidade |
| --- | --- |
| `AuditCatalog` | Ações/versionamento, resultados/fases permitidos, campos obrigatórios, política de mudanças/evidências, tradução e redação segura |
| `AuditContext` | Identidade confiável, origem, operação, requisição, delegação e causalidade; propagação explícita a jobs |
| `AuditRecorder` | Validar, sanear e inserir evento imutável e suas alterações/alvos na transação; único caminho de escrita da aplicação |
| Executor de comando auditável | Coordenar autorização, concorrência, antes/depois, mutação e registro; separar recusas/rollback; não decidir regras de domínio por conta própria |
| Adaptadores de workers/provedores | Intenção, tentativas, confirmação externa, deduplicação e reconciliação |
| Consulta de auditoria | Projeção segura, autorização, escopo, filtros, paginação e cobertura; adaptador legado explícito |
| Componentes de interface | Tabela, resultado, diff, identidade, referências e sequência causal compartilhados |
| Monitor de integridade/cobertura | Detectar escrita inválida, falha de gravação, fluxo sem evento esperado e reconciliação pendente |

### 5.1 Persistência e evolução

Preferência: evolução aditiva de `HistoryEvent` para envelope v2 e estruturas de alterações/alvos, dentro do mesmo PostgreSQL. O nome físico pode permanecer por compatibilidade. Campos novos só são obrigatórios para eventos v2; não preencher retroativamente lacunas com valores fictícios. Eventos legados podem conservar o formato atual e ser projetados por adaptador versionado.

O desenho de tabelas/índices deve ser fechado na primeira etapa, comparando envelope JSON validado com tabelas filhas para alvos/diffs. Colunas tipadas para resultado, alvo, datas e correlação favorecem filtros e restrições. A escolha não deve tornar a API dependente de JSON arbitrário. Não duplicar permanentemente o mesmo fato em duas trilhas independentes; se houver compatibilidade temporária, uma fonte autoritativa e IDs de origem explícitos evitam contagem dupla.

Se alterações/alvos forem tabelas filhas, o conjunto precisa ser **selado atomicamente com o evento**. Proibir UPDATE/DELETE não basta: inserir um filho depois também alteraria o fato publicado. Definir fechamento verificável do conjunto e impedir inserções tardias, ou manter o conteúdo auditável em uma unidade imutável. Contagem/digest do manifesto devem refletir o conjunto fechado; não são substitutos da restrição de escrita.

`WorkEvent`, conversas, revisões e artefatos preservam suas finalidades. A auditoria referencia essas fontes; não absorve todo o conteúdo. Métricas existentes continuam com suas definições até migração específica validada. `metricsVersion` não substitui versão do contrato de auditoria.

### 5.2 Atomicidade local, recusas e falhas

- Mudança local e seu evento confirmado entram na mesma transação. Se o registro obrigatório falhar, a mudança não confirma. Não devolver “salvo” sem essa garantia.
- Conflitos de versão e recusas não produzem falso evento de alteração. Registrar a tentativa recusada em transação separada após rollback, com ação pretendida, alvo permitido, identidade, código de razão e correlação.
- Validação HTTP registra campos/códigos de erro permitidos, sem copiar entradas inválidas brutas. Alvo desconhecido ou não autorizado não pode vazar informações no evento consultável pelo solicitante.
- O registro de auditoria não pode gerar recursão infinita ao auditar a própria falha. Sinalização operacional de contingência terá outro destino e correlação.
- Se o banco inteiro estiver indisponível, não prometer que a recusa foi persistida nele. Bloquear alterações críticas, emitir sinal no canal operacional independente e apresentar indisponibilidade. Spool externo, recuperação e sua segurança precisam de projeto/testes; não declarar garantia absoluta sem esse mecanismo.
- Exportação remota futura usa outbox transacional; a ausência do coletor não transforma uma transação local auditada em operação silenciosa.

### 5.3 Efeitos externos

1. Pedido autorizado confirma comando/intenção e job, com evento `ACCEPTED`, na transação local.
2. Worker assume tentativa identificada; claim/concessão e evento de início confirmam juntos na transação, com a identidade executora. A chamada remota ocorre fora da transação do banco.
3. Confirmação válida gera evento com referência externa e resultado observado; mudança local e confirmação entram juntas na transação.
4. Resposta perdida ou falha de persistência após efeito remoto deixa a operação pendente de reconciliação. Não presumir que o GitLab falhou e não repetir criação cegamente.
5. Reconciliação consulta a fonte, confirma o efeito e acrescenta novo evento relacionado. Se confirmar apenas existência atual, não afirmar data ou autoria histórica de criação sem evidência.
6. Retentativa preserva `operationId`, ganha `attemptId` e deduplica a mesma ocorrência. Reenvio idempotente não é uma nova criação. Tentativas de acesso/replay podem ter trilha operacional própria.

A chave de deduplicação identifica fonte/instância e época quando aplicável. Repetição com conteúdo idêntico recupera o fato original; mesma chave com conteúdo divergente gera conflito e investigação, nunca sobrescrita silenciosa. O reconciliador preserva observações fora de ordem como fatos e não regride um estado confirmado por receber evidência mais antiga. ID remoto isolado não é uma identidade global suficiente.

Cancelamento é delimitado: impedir nova etapa não equivale a desfazer commit, MR ou grupo. Compensação, quando suportada, é outra ação auditada. Concorrência entre arquivamento/cancelamento e retorno tardio de provedor precisa de reconciliação; uma resposta atrasada não pode liberar gates ou esconder um efeito remoto já produzido.

## 6. Autoria, proteção e administração

### 6.1 Identidade

Guardar separadamente quem solicitou, quem executou e quem consta na evidência remota. Um usuário pode solicitar, um worker executar e uma conta técnica criar o recurso GitLab. Não atribuir a execução humana ao agente nem registrar o agente como aprovador humano.

No LAB atual, `X-Persona` identifica uma persona declarada. Deve continuar explícito que isso não comprova identidade pessoal autenticada. O contrato comporta identidade verificada, mas autenticação real e autorização de leitura/exportação são pré-requisitos para alegar responsabilização individual em produção. Campo de usuário enviado livremente pelo cliente não atende a esse requisito.

Modelo, versão e política registram a ferramenta utilizada; não constituem identidade humana nem autorização. Propostas de agente não substituem aprovações exigidas.

### 6.2 Imutabilidade e cadeia de custódia

Preservar o bloqueio a UPDATE/DELETE e ampliar a proteção a todas as estruturas da auditoria. Separar papéis de migração, operação e consulta; a aplicação não deve ser proprietária capaz de desativar os controles. Restringir TRUNCATE e DDL. Correção de um fato é um novo evento relacionado ao original, nunca edição silenciosa.

Hash encadeado ajuda a detectar alterações sob determinadas condições; sozinho, no mesmo banco e sob o mesmo administrador, não prova ausência de adulteração. Para ameaça administrativa, projetar ancoragem independente, exportações assinadas ou armazenamento com retenção imutável, incluindo custódia de chaves e verificação. Não recomendar uma cadeia global serializadora sem medir concorrência. Reaproveitar conceitos do legado sem presumir que uma cadeia por Projeto cobre múltiplos alvos/épocas.

Prazo de retenção, quem pode consultar/exportar, tratamento de dados restritos e destino independente dependem de decisão do responsável. Não fixar prazo legal ou declarar conformidade regulatória nesta proposta.

### 6.3 Operações fora do portal

Backup, restore, reset, exclusão de projetos remotos, troca de credencial, alteração de integração, instalação e migração também precisam de contratos. Registrar operador verificável, motivo/escopo, ambiente, versão do procedimento, IDs afetados, resultado e validação posterior; nunca comandos contendo segredos ou dumps integrais na trilha.

O registro de uma limpeza não pode existir apenas no banco que será apagado. Manter manifesto/trilha administrativa protegida fora do alvo e um `auditEpochId` de cada início/restore. Restaurar um backup não pode apagar silenciosamente a evidência do próprio restore nem reutilizar identificadores de época. Reset de aceite e retenção de produção são políticas distintas. A limpeza anterior autorizada não prova que esse mecanismo já existe; não reconstruiremos evidência histórica inexistente.

Mudanças feitas diretamente no GitLab precisam de observação por webhook autenticado e/ou reconciliação. Preservar evento/ator da fonte e declarar cobertura inicial: o portal só comprova os efeitos que observou. Adotar o módulo no portal não audita automaticamente toda atividade administrativa do GitLab, do laboratório, do sistema operacional ou das aplicações geradas.

## 7. Experiência de auditoria

Tabela principal: **Quando, Quem iniciou / Quem executou, Entidade, Ação, Resultado, Alteração resumida e Evidência**. Campos técnicos e diferenças extensas ficam em expansão acessível; manter a identidade visual, filtros recolhidos e paginação compartilhada. Exibir o código original da ação em detalhes, com rótulo em PT-BR.

Em telas pequenas, usar apresentação compacta preservando ação, entidade e desfecho identificáveis; autoria detalhada, diferenças e evidências podem ir para expansão acessível. Manter o vínculo da ocorrência e o retorno ao recorte. Históricos agregados nunca ocultam qual alvo foi afetado.

Exemplos esperados após adoção do contrato:

| Ação | Resultado | Alteração/evidência |
| --- | --- | --- |
| Sistema criado | Concluída | Inexistente → existente; sigla/nome/status inicial; versão 1 |
| Provisionamento solicitado | Solicitação aceita | Job persistido; operação e solicitante; não afirma grupo pronto |
| Grupo GitLab provisionado | Concluída | pending → ready; grupo e caminho confirmados; conta executora |
| Revisão de segurança concluída | Execução: concluída. Decisão: código reprovado | Campos/badges separados; SHA/política; achados e gate bloqueado; ferramenta funcionou |
| Provisionamento sem resposta | Efeito não confirmado | Tentativa identificada; reconciliação pendente |
| Atualização recusada | Recusada | Conflito de versão; nenhuma mudança confirmada |

Para os eventos antigos **sem resultado explícito**, apresentar **“Legado: resultado não capturado”**, com explicação, mantendo a ação originalmente registrada. Legados com resultado suportado preservam o valor e a procedência pelo mapeamento da família. A criação ou provisionamento pode constar no texto original; isso não autoriza fabricar o campo de resultado. Em campos ausentes: “Anterior não capturado”; em dado protegido: “Valor restrito”; em ausência real: “Não existia”. A sinalização de uma execução concluída não pode sugerir aprovação quando a decisão está reprovada ou não avaliada.

Oferecer filtros por resultado, incluindo **sem resultado explícito**, por ação, alvo, período, iniciador/executor, operação/tentativa, origem e versão/cobertura conforme disponibilidade. O filtro de nulos hoje não existe. Aplicar filtros/contagem/ordenação no servidor; mostrar cobertura e manter consultas de arquivados e ancestrais.

Operação correlacionada permite percorrer pedido → tentativa → confirmação/recusa → reconciliação. Isso explica o processo sem misturar fatos históricos com estado atual/gates, que permanecem independentes da página consultada.

Separar data do fato de data de registro para eventos externos atrasados. Definir qual data o filtro usa. O `asOf` atual não é prova de snapshot imutável de commits concorrentes; exportação reprodutível precisa congelar o conjunto de IDs/versões e manifestar filtros, ordem, cobertura e instante. Exportar JSON estruturado e, se aprovado, CSV seguro para planilha; referência/digest do manifesto comprova o arquivo, não a veracidade de fatos ausentes.

Consultas comuns não geram eventos de negócio. Acesso sensível à própria auditoria e exportações terão trilha de acesso segregada, sem registrar infinitamente a leitura de seus próprios registros.

## 8. Tratamento dos registros existentes

1. Preservar eventos originais e identificar sua versão de origem. Sem UPDATE em massa para transformar ausência em sucesso.
2. Mapear explicitamente campos legados por família, com valor original e regra de projeção visíveis. `payload.state` só vira resultado normalizado quando o contrato daquela ação sustenta a interpretação; não adotar mapeamento global cego.
3. Aproveitar `from/to` já gravados; informar ausência quando não houver antes/depois. Não derivar o valor anterior do estado atual.
4. Expor referências remotas existentes mediante projeção segura por ação e autorização, sem mostrar o JSON bruto.
5. Quando necessário, acrescentar evento de verificação posterior com fonte, instante, responsável e vínculo ao original. Verificar que o grupo existe hoje não prova quando ele foi criado.
6. Informar a data/versão de início da cobertura nova por família. Mesmo uma base pequena de aceite não elimina a necessidade dessa compatibilidade.

## 9. Plano de adoção e condições de passagem

Todos os itens abaixo estão **propostos e não implementados**. A sequência é dependente; não declarar o SDLC inteiro auditado após migrar a primeira família.

| ID | Entrega proposta | Condição para considerar pronta |
| --- | --- | --- |
| AUD-01 | Catálogo completo e decisões de produto | Matriz de comandos/rotas/workers/administração; campos/políticas e exceções revisados |
| AUD-02 | Contrato, armazenamento aditivo, recorder e contexto | Validação em runtime/DB, transação, autoria, correlação, diffs e testes de falha |
| AUD-03 | Itens, hierarquia, vínculos e GitLab | Criação/edição/aprovação/status/arquivo/provisionamento/retentativas com efeito e evidência completos |
| AUD-04 | Assistente, planos, execução, qualidade, merge e trabalho | Transições, recuperação de concessões, cancelamento, replays e mutações automáticas cobertos |
| AUD-05 | Releases e múltiplos alvos | Composição, transferência e revisão explicáveis por alvo sem duplicar fatos |
| AUD-06 | Recusas, segurança e administração | Rollback, autenticação/autorização, backup/restore/reset e contingência com limites testados |
| AUD-07 | Consulta, diffs, cobertura e exportação | UI comum, paginação/URL/acessibilidade, legado honesto e exportação reprodutível se aprovada |
| AUD-08 | Proteção, monitoramento e regra para novas entregas | Privilégios, retenção escolhida, monitor e CI impedindo bypass/ações sem contrato |

AUD-08 possui requisitos desde AUD-02; sua validação transversal encerra a adoção. Restrições de escrita e catálogo não ficam para depois da instrumentação. Identidade real e custódia independente são marcos específicos antes de uma alegação de auditoria de produção; o LAB pode validar o comportamento com identidade declarada explicitamente identificada.

Não adotar uma correção apenas visual como conclusão da entrega. Uma eventual primeira fatia poderá resolver os dois produtores observados e a explicação de legado, desde que identificada como parcial e construída sobre o contrato aprovado.

## 10. Critérios de aceite e testes adversariais

1. Nenhum evento v2 persiste sem resultado válido, alvo aplicável, identidade/origem e campos obrigatórios do catálogo. Mapeamento de ação desconhecida falha antes do commit.
2. Edição registra valores anteriores/novos corretos sob concorrência; versão obsoleta não altera domínio e deixa tentativa recusada.
3. Falha ao gravar evento impede confirmação local; rollback não deixa falso sucesso. Erro de validação não grava entrada sensível.
4. Criação, aprovação e arquivo possuem semântica explícita; cascata permite identificar todos os alvos, inclusive jobs/Tarefas afetados.
5. Pedido aceito, fila, processamento, espera e conclusão são distintos. Veredito de qualidade não se confunde com erro técnico.
6. Timeout após criação remota e falha local após resposta são ensaiados; reconciliação não duplica recursos/eventos nem afirma resultado sem evidência.
7. Retry mantém operação e cria tentativa; replay idempotente e evento duplicado do provedor não duplicam alteração ou métrica.
8. Iniciador humano, worker, modelo e conta remota permanecem distintos; persona demo não aparece como usuário corporativo autenticado.
9. Eventos em Tarefas/Histórias aparecem no escopo ancestral mesmo após arquivamento; consulta antiga não interfere em projeção corrente/gates.
10. Redação segura antes da persistência e na consulta/exportação; segredo sintético, CRLF, HTML, fórmulas CSV e campos longos são testados em fixtures isoladas.
11. UPDATE/DELETE/TRUNCATE e DDL são negados ao papel de aplicação; revisão administrativa/correção deixa evidência no destino apropriado.
12. Reset/restore ensaiado em ambiente descartável preserva manifesto externo e muda a época; reinício não cria eventos fictícios de negócio.
13. Filtros, nulos legados, correlação, datas, paginação, retorno, teclado e telas pequenas usam contratos compartilhados; nenhuma coleção truncada parece completa.
14. CI proíbe inserções diretas fora do módulo e mantém matriz de cobertura de cada rota/worker, incluindo novas ações. Regra estática é barreira adicional, não prova única: testes transacionais e integração continuam obrigatórios.
15. Medir custo de escrita, volume de diffs e índices em carga representativa. Não prometer capacidade, duração ou proteção contra administrador antes das verificações correspondentes.
16. Impedir inserção tardia de alvos/diffs em evento já publicado. Dois workers, fonte duplicada/divergente, observação fora de ordem e replay após restore/época são testados; nenhum desses casos sobrescreve evidência ou regride a projeção indevidamente.

## 11. Indicadores sugeridos e decisões pendentes

Estas métricas são candidatas; nenhuma coleta/dashboard novo está implementado ou aprovado por este texto. A política de métricas da arquitetura exige decisão do usuário antes dessa implementação.

| Indicador | Definição proposta | Limite / objetivo a definir |
| --- | --- | --- |
| Adoção do contrato | Ações/comandos migrados com evidência / inventário obrigatório, por família/versão | Complementa a contagem de eventos; um evento completo não prova cobertura de ações sem evento |
| Completude de eventos | Eventos v2 que passam no validador / total v2; violações recusadas separadas | Regra funcional sugerida: nenhum v2 incompleto confirmado; não é SLO de disponibilidade |
| Cobertura de alterações | Transições auditáveis confirmadas com evento correspondente / transições confirmadas observadas por fonte independente | Exige reconciliação com domínio/jobs; não calcular só a partir da própria trilha |
| Falhas de auditoria | Contagem de falhas/rejeições de escrita por origem/código; duração sem destino disponível | Canal independente necessário quando a base falha; limiares a decidir |
| Pendência de confirmação remota | Quantidade e idade das operações com efeito `UNKNOWN` sem resolução | Prazo de reconciliação e alerta a decidir |
| Atraso de registro externo | Diferença entre instante de origem e registro, com fonte/qualidade de relógio | Ausência de data confiável é sem medição; evitar duração negativa interpretada como desempenho |
| Lacunas legadas | Eventos sem resultado/diff explícitos por versão/família | Não representa falha atual da operação; base para transparência de cobertura |

Decisões para aprovação da implementação:

- Confirmar a separação resultado/fase/decisão e o módulo obrigatório com catálogo para novas ações.
- Definir profundidade de valores textuais: diffs permitidos por campo, referências de revisões e perfis de consulta.
- Escolher proteção inicial do LAB e exigências para produção: identidade real, segregação de papéis e custódia independente.
- Definir retenção, acesso/exportação e destino administrativo fora da base; não presumir prazo.
- Selecionar indicadores/objetivos e limites de alerta. Metas operacionais dependem de medição.
- Confirmar a sequência de adoção e quais integrações externas terão eventos observados já na primeira fase.

## 12. Referências consultadas

As recomendações de design são uma aplicação ao SDLC das evidências do código e das referências abaixo; não são declaração de certificação ou obrigação legal específica.

- [NIST SP 800-53 Rev. 5](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf): AU-2/AU-3 orientam seleção e conteúdo dos eventos; AU-5 trata falhas de auditoria; AU-9 proteção; AU-11 retenção; AU-12 geração e correlação. O catálogo é configurável ao contexto da organização.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html): contexto e resultado da ação, correlação, dados excluídos, proteção e verificação do mecanismo; diferencia finalidades de auditoria, operação e segurança.
- [Padrões de experiência, §8](../portal/docs/PADROES_DE_EXPERIENCIA.md): histórico, rastreabilidade, cobertura, privacidade e separação da situação atual.
- [Arquitetura do portal](../portal/docs/ARCHITECTURE.md): atomicidade/idempotência, fontes e política de métricas.

Conclusão de revisão: há evidência suficiente para justificar a evolução transversal e definir os controles acima. A implementação ainda depende das decisões indicadas e dos ensaios de falha/concorrência. O comportamento de produção e a completude integral não podem ser certificados apenas por esta análise estática.
