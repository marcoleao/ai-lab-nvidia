# Contrato de execução do Sistema — formato v1

29/10/2026 · RA-10a/RA-10b/RA-10c/RA-10d · [Plano incremental](plano-incremental-releases-ambientes-2026-10-27.md).

## Escopo e propriedade

O repositório único do Sistema pode organizar APIs, frontend, backend, batch e infraestrutura conforme sua arquitetura. O arquivo **`.sdlc/execution.json`** descreve unidades desse mesmo repositório. A RA-10a consulta e valida a estrutura e as referências; não cria o arquivo nem altera aplicações, não executa suas entradas e não aprova ferramentas, isolamento, reversão ou implantação. O cadastro `runtime=generic` e o texto `.sdlc/contract.md` não comprovam um contrato executável.

O formato v1 é um contrato de dados desta implementação. Não é um padrão externo nem uma autorização para interpretar qualquer comando do repositório. A RA-10b acrescenta proposta e revisão locais pelo portal; a RA-10c envia a definição para branch/MR próprios; a RA-10d integra o contrato com confirmação explícita e prova da fonte efetiva. A RA-11 já oferece build de trabalho no perfil Node 24/React, e a RA-11b prepara a estrutura desse perfil com verificação técnica. Dados de teste ficam somente em `portal_test`. Destino e implantação DEV permanecem nas fatias RA-12a/b e na recuperação DE-06; encaminhamento pelo assistente usa os mesmos comandos conforme o [contrato de responsabilidades](autonomia-assistente-executores-2026-10-29.md), com cobertura explicitamente pendente em RA-11c/12c.

A RA-10c acrescenta o envio da definição revisada para uma branch própria e um Merge Request Draft do contrato. **MR criado não significa contrato integrado na branch padrão**. A consulta RA-10a continua mostrando a fonte efetiva do commit consultado; o contrato pode continuar ausente nessa fonte após o envio. A RA-10d abaixo acrescenta a integração pelo portal; construir, testar e implantar exigem seus comandos e provas próprios.

## Formato

Objeto JSON com `schemaVersion: 1` e `units` contendo de uma a oito unidades. Campos desconhecidos, unidades duplicadas e coleções acima do limite invalidam a estrutura. Outra versão é identificada como não suportada. O formato não contém shell, `argv`, variáveis de ambiente, URLs de serviços, credenciais ou comandos livres; build/teste/migração são **referências a arquivos**, e a existência desses arquivos não valida seu comportamento.

```json
{
  "schemaVersion": 1,
  "units": [
    {
      "id": "api",
      "path": "backend",
      "runtime": { "kind": "node", "version": "24" },
      "build": { "entrypoint": "scripts/build.mjs" },
      "test": { "entrypoint": "scripts/test.mjs" },
      "artifact": { "dockerfile": "Dockerfile", "context": "." },
      "health": { "kind": "http", "path": "/health", "port": 8080, "status": 200 },
      "migrations": { "mode": "none" }
    }
  ]
}
```

O exemplo é documental e não cria estrutura de aplicação. Referências desse exemplo precisam existir no commit consultado para a verificação de entradas passar. `runtime.kind` é identificador declarado; `version` tem de um a três componentes numéricos. Isso não significa que o executor instalado suporta esse runtime/versão.

| Campo | Regra v1 |
| --- | --- |
| `id` | Identificador de unidade único, de até 40 caracteres, iniciado por letra minúscula e seguido de letras minúsculas/números/hífen |
| `path` | Pasta da unidade relativa à raiz do repositório; `.` indica a raiz |
| `build.entrypoint`, `test.entrypoint` | Arquivo regular, relativo à pasta da unidade |
| `artifact.dockerfile` | Referência a arquivo regular; conteúdo e segurança do Dockerfile ainda não avaliados |
| `artifact.context` | Diretório regular, relativo à pasta da unidade; `.` indica essa pasta |
| `health.kind=http` | Caminho local iniciado por `/`, porta de 1 a 65535, resposta declarada 200; não faz chamada HTTP à aplicação |
| `health.kind=process` | `exitCode: 0`; não inicia nem inspeciona processo |
| `migrations.mode=none` | Declaração de ausência de migração; não prova ausência de dados nem reversibilidade |
| `migrations.mode=scripts` | Exige os dois caminhos `apply` e `rollback`, relativos à pasta da unidade; ambos precisam ser arquivos regulares |

Caminhos usam letras ASCII, números, ponto, hífen, sublinhado e separador `/`, com até 180 caracteres e oito segmentos por campo. Caminhos absolutos, segmentos `.`/`..` internos, travessia, `\`, URLs, expansão de shell, pastas `.git`/`.ssh`/`.aws` e arquivos `.env` não pertencem ao formato. A exceção `.` vale somente para campos de diretório. Arquivos especiais, links e submódulos não são aceitos como entradas. As pastas ancestrais precisam ser diretórios regulares da árvore consultada.

## Leitura, identidade e cobertura

O Sistema resolve seu repositório, estado e projeto GitLab. O adapter dedicado usa somente GET e confere namespace gerenciado, identidade/projeto e marca `sdlc-managed`. Consulta a branch padrão e fixa o commit antes de ler o arquivo ou qualquer referência. Um SHA explícito de 40/64 caracteres pode selecionar outra revisão do mesmo repositório; isso não a torna vigente na branch.

A consulta de árvore confere presença e modo dos arquivos, e somente o conteúdo de `.sdlc/execution.json` é carregado. Build/testes/Dockerfile/migrações são verificados por metadados, sem carregar código ou interpretar instruções. A identidade do arquivo inclui caminho, ref, commit, blob e SHA-256 do conteúdo retornado pela API. O hash descreve o conteúdo consultado; a API GitLab pode converter texto ao devolver o conteúdo, por isso não é anunciado como digest de bytes brutos do Git. [Contrato de arquivos GitLab](https://docs.gitlab.com/api/repository_files/), [árvore de repositório](https://docs.gitlab.com/api/repositories/).

Ausência é confirmada pela árvore lida no commit fixado. Um 404 ao consultar a raiz ou uma pasta já comprovada pela árvore ancestral é falha de leitura, sem converter falta de acesso em contrato ausente.

O contrato tem limite de 32 KiB, até oito unidades, no máximo 40 referências distintas de arquivos no formato atual, e resposta HTTP limitada a 256 KiB. A leitura tem orçamento de 128 chamadas/20 segundos e de dez páginas de 100 entradas por diretório. Quando não é possível demonstrar a cobertura integral das referências, a consulta falha explicitamente; não anuncia truncamento como ausência ou sucesso. A lista de problemas apresenta os primeiros vinte com aviso quando há outros pontos. Não é inventário integral do repositório.

Depois da leitura, branch e projeto são consultados novamente. Avanço da branch mantém o resultado no SHA original e gera aviso; mudança de branch padrão/escopo ou mudança do cadastro local durante a consulta impede confirmar o resultado para outro contexto. Releituras detectam deriva observada; não certificam atomicidade entre serviços nem tornam o commit consultado HEAD permanente.

## API e apresentação

`GET /api/systems/:id/execution-contract?sha=<SHA completo opcional>` aceita somente Sistema não arquivado. Sistema inativo permanece em consulta, sem retomar trabalho. Repositório ausente/pendente ou provider sem capacidade de leitura retorna impedimento de configuração explícito, sem inferir prontidão pelo runtime.

A resposta identifica Sistema, repositório, versão local, commit/branch, modo da consulta, instante, digest/blob quando disponíveis, estado estrutural, unidades validadas e referências conferidas. `executionAvailable` permanece **false** e `tooling` permanece **not_evaluated**. Estados: válido, inválido, ausente e versão não suportada; falha de acesso/limite/revisão indisponível é erro de consulta. Um contrato com estrutura reconhecida e arquivo de entrada ausente continua inválido; suas unidades são apresentadas como declarações qualificadas.

No Portal, usar **Sistema → Repositório do Sistema → Contrato de execução → Consultar contrato**. O bloco não é repetido em Projeto/História/Tarefa; esses níveis conservam o link ao Sistema. `contract.sha` é namespace de URL independente dos filtros e abas existentes. A consulta explícita não limpa campos ainda não aplicados, formulário do Sistema ou referências já consultadas. Falha conserva a leitura anterior datada; resposta atrasada de outra consulta não a sobrepõe. Detalhes de unidades ficam recolhidos, em uma coluna no celular.

## Autoria, auditoria e métricas

RA-10a é somente consulta. Não cria evento de negócio, RequestKey, fila, resultado de agente, evidência de execução ou revisão de conteúdo. Não há migration nem backfill. A publicação usa o recorder administrativo externo `PORTAL_PUBLICATION` com backup e preservação. Proposta/edição/aprovação futura exigirá fonte versionada, autorização, catálogo e recorder na transação, idempotência e recuperação próprios.

Por escolha do usuário, **indicadores existentes mantidos nesta fatia**, sem contagem, painel, fórmula ou meta nova de contratos. Estrutura válida não alimenta aprovação DEV, merge, build, teste ou implantação. A cobertura real e o OK manual ficam no recibo RA-10a do plano incremental.

## RA-10b — preparação e revisão locais

Na mesma área do Sistema, **Proposta local** recebe orientações ou respostas em linguagem natural. Consultar o contrato fixa a fonte; **Conferir contexto da proposta** confirma repositório, branch, commit e metadados. **Preparar proposta com assistente** registra um pedido e o devolve à interface antes da geração. O arquiteto utiliza a fila e o worker de conversa existentes, com a exclusão compartilhada de inferência. Não cria outro agendador. Administrador, Product Owner e Arquiteto podem solicitar, ajustar ou revisar em Sistema ativo; consultar permanece possível quando inativo.

O arquiteto recebe o contrato consultado, um inventário de caminhos/modos permitido, a proposta anterior e as orientações explícitas. Não lê código de scripts nem executa ferramentas. A árvore recursiva tem limite de 200 entradas, resposta de 256 KiB e orçamento adicional de 25 segundos; a leitura falha se a cobertura exceder o limite, sem apresentar recorte como inventário completo. Caminhos fora da política ficam excluídos com total informado. O contexto de metadados tem limite de 10 mil caracteres; proposta anterior e orientações combinadas, 14 mil. Excesso impede registrar pedido parcial. Repositórios maiores exigem evolução desse contrato de contexto.

O resultado contém resumo, até oito perguntas e contrato v1 opcional. Contrato ausente exige perguntas. Dúvidas sobre runtime, saúde, migrações ou outras definições devem ser esclarecidas; o agente não recebe autorização para inventar escolhas. Perguntas impedem revisão conclusiva. A pessoa responde no mesmo campo e solicita outra preparação. As versões anteriores permanecem preservadas.

Arquivos/pastas ainda ausentes são **entradas técnicas pendentes**, podendo compor uma definição local revisada; esse registro não os cria. Links, submódulos e tipos fora da cobertura impedem a revisão conclusiva. A edição técnica em JSON é um aprofundamento opcional, validado pelo mesmo schema, e salva uma nova versão imutável. Edição idêntica preserva versão e revisão existentes.

**Revisar proposta → Registrar revisão local** exige motivo, confirmação explícita e a mesma proposta/contexto atual. Esse aceite refere-se somente à definição local. O contrato publicado, build, testes, migração, desenvolvimento finalizado, deploy e gates permanecem independentes. Nova versão não herda a revisão da anterior. Mudança de repositório, versão do cadastro do repositório, projeto, branch, commit ou inventário exige nova preparação na base atual. A versão administrativa do Sistema não é identidade técnica; inatividade continua bloqueando escrita e requer retomada explícita da fila.

### Persistência, recuperação e consulta

`ExecutionContractRequest`, `ExecutionContractProposal` e `ExecutionContractReview` são fontes imutáveis, com autoria, contexto e relações verificadas no banco. A intenção usa `ChatTurn.kind=contract_proposal`, preservando corpo, autoria e vínculo originais. A migration aditiva não cria proposta/resultado para Sistemas reais. Runtime possui SELECT/INSERT nas três fontes, sem UPDATE/DELETE/TRUNCATE. O rollback da migration recusa remoção após qualquer intenção ou fonte registrada.

Pedidos e decisões usam a mutação compartilhada, transação, recorder e RequestKey. Mesmo corpo, persona e chave recuperam o recibo sem chamar novamente GitLab/modelo. O worker revalida antes/depois da inferência e na transação final; cancelamento tardio ou perda de lease não grava proposta. Falha do recorder reverte resultado/fonte na transação. Lease vencida não repete automaticamente a mesma inferência: preserva o pedido e exige nova preparação explícita. Pausa, cancelamento e retomada usam o ciclo existente; reativação sozinha não retoma trabalho.

Rascunhos e pedidos sem resposta ficam na sessão do navegador, sem sincronização entre dispositivos. Acompanhamento permanece acessível nas outras abas do mesmo Sistema e após recarga. Pedido com ACK conhecido e consulta posterior indisponível continua identificado; não vira sucesso nem some. Revisão confirmada mantém o recibo da própria proposta mesmo com falha posterior da consulta. Erro de consulta conserva a leitura datada e bloqueia novas decisões até atualização; recuperação do pedido original permanece disponível à persona original.

| API | Finalidade |
| --- | --- |
| `GET /api/systems/:id/contract-proposals/context?sha=` | Conferir fonte e token de contexto, sem salvar |
| `GET /api/systems/:id/contract-proposals?page=&asOf=` | Histórico em páginas de 20, ordenado por número e ID decrescentes; proposta corrente/pedido mais recente independem da página/cutoff |
| `GET /api/systems/:id/contract-proposals/:proposalId` | Consultar fonte integral do mesmo Sistema |
| `GET /api/systems/:id/contract-requests/:requestId` | Acompanhar pedido exato, separado do histórico |
| `POST /api/systems/:id/contract-proposals/prepare` | Registrar intenção durável, sem inferência na requisição HTTP |
| `POST /api/systems/:id/contract-proposals/:proposalId/revise` | Salvar versão humana com contexto e controle de concorrência |
| `POST /api/systems/:id/contract-proposals/:proposalId/review` | Registrar revisão local da versão exata |

`contractProposals.page/asOf` e `contract.proposalId` preservam filtros/abas e `contract.sha`. Página histórica não redefine proposta corrente ou permissões. O histórico de versões é aprofundamento do conteúdo; ocorrências de auditoria continuam na aba Auditoria. Conteúdo e motivo ficam nas fontes controladas, com projeção selecionada no histórico de auditoria.

O catálogo inclui `EXECUTION_CONTRACT_PROPOSAL_REQUESTED`, `EXECUTION_CONTRACT_PROPOSAL_PREPARED`, `EXECUTION_CONTRACT_PROPOSAL_FAILED`, `EXECUTION_CONTRACT_PROPOSAL_REVISED` e `EXECUTION_CONTRACT_REVIEWED`, com resultado/fase/decisão próprios e correlação ao pedido/versão. A revisão usa decisão APPROVED somente para a definição local. Falha não aprova gate. Por escolha explícita do usuário, mantêm-se os indicadores existentes de fila, espera e retrabalho, sem KPI, painel ou meta de propostas; o produtor de falha entra no indicador genérico já existente. Rodadas deste tipo não contam como entrevista de requisitos e não geram itens de planejamento.

Publicação administrativa preserva fontes e backup fora da base. Antes de existir intenção nova é possível restaurar a imagem anterior mantendo a migration aditiva; após intenção `contract_proposal`, a imagem antiga não conhece seu processamento e a recuperação deve manter runtime compatível. Não se apagam fontes para permitir reversão. A continuação de envio foi entregue pela RA-10c abaixo; executores DEV permanecem dependentes de DE-04/06 e RA-11–14.

## RA-10c — envio controlado ao GitLab

Na proposta corrente revisada, **Enviar contrato para revisão** consulta uma prévia do arquivo, repositório, proposta/revisão, base, branch nova e destino. **Confirmar envio ao GitLab** exige motivo de pelo menos dez caracteres e checkbox explícito. O servidor revalida a proposta e sua revisão, repositório/versão/projeto, contexto técnico e base corrente antes de registrar o pedido. Não recebe conteúdo/arquivo/URL arbitrário do cliente. A pessoa pode preparar/revisar uma nova definição após um envio confirmado; outro envio aguarda integração ou encerramento confirmado do MR anterior.

`ExecutionContractPublication` congela a intenção original: versão local, revisão, repositório/versão/projeto, commit/branch de origem, conteúdo JSON validado, SHA-256, motivo, autoria e contexto. Uma operação por Sistema mantém trabalho pendente; MR ainda aberto também impede novo envio. Campos de processamento têm versão, lease e marcadores de escrita próprios para commit e MR. Intenção, primeira identidade dos efeitos e primeira confirmação não podem ser reescritas. Runtime não pode remover/truncar registros; rollback da migration recusa fontes populadas.

O POST devolve ACK antes do processamento. O consumidor usa o agendamento já existente da API, sem modelo, timer ou broker adicional. O worker confere o contexto antes de cada escrita, guarda o marcador na transação e faz HTTP fora dela. A conta dedicada é `sdlc-agent-for-merge`, ativa, sem administração global e com Maintainer no projeto gerenciado. Não se altera essa permissão ou proteção durante o envio.

O adapter envia apenas `.sdlc/execution.json` normalizado, em branch `sdlc/contract-<proposalId>-<número>`, criada no SHA autorizado. Uma ação create/update usa a existência e a última revisão do arquivo no commit fixado; não depende de amostra de arquivos do agente. Não usa force, reset, atualização da branch padrão, exclusão de branch, merge ou endpoint de pipeline. O MR é próprio, Draft, com origem/destino e marcador da operação. APIs oficiais: [criação de commit com start_sha e actions](https://docs.gitlab.com/api/commits/#create-a-commit) e [criação de Merge Request](https://docs.gitlab.com/api/merge_requests/#create-mr).

A conferência do efeito verifica commit com pai único igual à base, marcador exato, arquivo regular e conteúdo correspondente ao digest; o MR precisa pertencer ao mesmo projeto, branch, destino, commit e marcador. Como o GitLab pode limitar arquivos no diff, a prova compara também os metadados completos da raiz e da pasta `.sdlc` nos dois commits. IDs de objetos/subárvores fora do contrato precisam permanecer iguais. Essa conferência privada não lê código de aplicação nem altera o inventário permitido ao modelo. Até 202 entradas por pasta, em três páginas de 100; excesso/inconsistência impede afirmar exclusividade. [Limites do diff GitLab](https://docs.gitlab.com/api/commits/#retrieve-commit-diff).

Branch ou MR divergente não é adotado nem sobrescrito. Respostas limitadas a 256 KiB e timeout de seis segundos por chamada; nenhum inventário/resultado incompleto é apresentado como êxito. A revalidação detecta deriva observada, sem prometer transação distribuída ou que HEAD permanecerá fixo.

### Resultado parcial e recuperação

| Situação | Comportamento |
| --- | --- |
| Na fila/processando | Acompanhamento do mesmo pedido; sem declarar efeito GitLab confirmado |
| Sem confirmação | **Verificar resultado do envio** consulta por GET e registra a observação; não repete commit ou criação do MR |
| Commit confirmado e criação do MR ainda não iniciada | Exibe commit e pendência; **Continuar abertura do Merge Request** exige confirmação explícita e revalida a fonte, preservando o commit e a mesma operação |
| MR confirmado | Exibe origem, commit, MR, autor e instante; integração na branch padrão continua pendente |
| MR fechado/merge observado posteriormente | Observação do mesmo envio, sem simular merge ou liberar execução; nova fonte efetiva continua na consulta RA-10a |
| Pausa | Retomada explícita pelo Sistema; reativação sozinha não executa o envio |
| Cancelamento | Permitido somente antes de qualquer intenção de escrita externa; não desfaz GitLab |

O checkpoint de commit e o recorder são transacionais; recusa ou falha antes da abertura do MR conserva o commit conhecido. Escrita que já pode ter ocorrido nunca é repetida automaticamente, inclusive após falha do recorder de conclusão ou lease expirada. Consulta sem encontrar um efeito que pode ter ocorrido conserva **resultado não confirmado**; não a converte em prova negativa nem libera nova escrita. Tratamento de efeitos definitivamente recusados/abandono de operações sem confirmação e integração controlada serão capacidades posteriores, preservando a intenção anterior.

ACK, pedido incerto e fatos confirmados ficam na sessão do navegador, com corpo/persona/chave originais. Replay recupera o recibo antes de exigir GitLab disponível. Uma resposta antiga não regride versão maior da operação. GET posterior falho conserva o fato conhecido, data e motivo do impedimento; bloqueia novas decisões de proposta/envio até atualização, mantendo recuperação do mesmo pedido. Na ausência de cache, falha de consulta não é anunciada como envio pendente, mas impede afirmar disponibilidade para novas decisões. Banner entre abas do mesmo Sistema e após recarga conserva a recuperação; histórico de outra proposta não retargeta a operação.

### APIs, auditoria e cobertura

| API | Finalidade |
| --- | --- |
| `GET /api/systems/:id/contract-publication` | Acompanhamento atual e impedimentos locais, independente da página histórica de propostas |
| `GET /api/systems/:id/contract-publication/preview` | Conferir contexto e destino sem salvar |
| `POST /api/systems/:id/contract-publication` | Confirmar intenção/ACK durável, sem HTTP de escrita ou modelo na requisição |
| `GET /api/systems/:id/contract-publications/:operationId` | Consultar operação exata do mesmo Sistema |
| `POST /api/systems/:id/contract-publications/:operationId/reconcile` | Consulta remota somente leitura e observação transacional de efeitos |
| `POST /api/systems/:id/contract-publications/:operationId/continue` | Solicitar continuação explícita apenas da criação de MR ainda não iniciada |
| `POST /api/systems/:id/contract-publications/:operationId/cancel` | Cancelar antes da escrita |

As mutações usam recorder, autorização e idempotência compartilhados; intenção/fonte/estado/evento/chave pertencem à mesma transação. Worker identifica o executor de integração e o iniciador humano original. Cancelamento, continuação e observação humanos identificam a pessoa que executou cada comando, preservando o solicitante original na fonte. Auditoria recebe IDs/digests e antes/depois selecionados; conteúdo e motivo ficam nas fontes controladas. Não há gravação direta em HistoryEvent, reconstrução de dados antigos ou resultado de agente sintético na instalação humana.

Ações catalogadas: `EXECUTION_CONTRACT_SEND_REQUESTED`, `EXECUTION_CONTRACT_SEND_STARTED`, `EXECUTION_CONTRACT_COMMIT_OBSERVED`, `EXECUTION_CONTRACT_SENT`, `EXECUTION_CONTRACT_SEND_BLOCKED`, `EXECUTION_CONTRACT_SEND_UNCONFIRMED`, `EXECUTION_CONTRACT_SEND_OBSERVED`, `EXECUTION_CONTRACT_SEND_CONTINUED`, `EXECUTION_CONTRACT_SEND_CANCELLED` e `EXECUTION_CONTRACT_SEND_PAUSED`. Recebimento, processamento, subefeito confirmado, envio confirmado e desconhecimento têm resultado/fase próprios, sem APPROVED de software. Pausa/retomada da hierarquia incluem a nova operação e reutilizam os produtores existentes.

Por escolha explícita do usuário, **indicadores existentes mantidos nesta fatia**, sem KPI, fórmula, painel ou meta nova de envios. A confirmação do MR não alimenta evidência de desenvolvimento finalizado, build, testes ou deploy. O portal não solicita pipelines nesta capacidade; automações já configuradas no GitLab mantêm sua própria política de CI. [Contrato de pipelines GitLab](https://docs.gitlab.com/ci/pipelines/).

Acompanhamento atual e leitura por ID não são catálogo integral de operações; eventos permanecem em Auditoria. O acervo completo de jobs continua nas etapas próprias; integração do MR foi acrescentada pela RA-10d abaixo. Publicação administrativa usa ledger externo/backup, sem envio real de contrato para demonstrar a funcionalidade. Antes de qualquer intenção nova é possível restaurar a imagem anterior; após registro de envio, recuperação deve manter runtime compatível e preservar fontes.

## RA-10d — integração e fonte efetiva

No mesmo quadro do envio, **Conferir condições e fonte do contrato** consulta MR, revisão e fonte atual. **Confirmar liberação do Draft** e **Confirmar integração do contrato** são decisões separadas, cada qual com motivo, aceite, contexto/versionamento, intenção durável e autoria. A conta dedicada `sdlc-agent-for-merge` confere projeto gerenciado, acesso, origem/destino, commit exclusivo e políticas reais do GitLab. Merge envia o SHA fixado; não altera proteções, CI, permissões ou arquivos de aplicação. Agendamento automático impede a liberação do Draft.

`ExecutionContractIntegration` preserva intenção, lease e marcador antes da escrita. Resposta perdida, lease expirada ou falha de recorder após efeito exigem observação por leitura; não repetem PUT. A prova verifica conteúdo/árvore e ancestralidade do commit integrado. O recibo histórico e o HEAD atual são fatos separados: alteração posterior da fonte não apaga o merge conhecido. `contract.sha` consultado acima pode permanecer histórico. A conferência remota não é uma transação distribuída; efeito sem prova fica sem confirmação.

**Encerrar acompanhamento no portal** resolve uma pendência com motivo, confirmação, autoria e data imutáveis; preserva intenção e efeitos conhecidos e não desfaz recursos GitLab. Lease ativa impede encerramento. Fila ainda não escrita é cancelada; escrita possivelmente iniciada permanece incerta. O envio resolvido permite nova proposta/envio, sem reativar a intenção antiga. Efeitos tardios permanecem consultáveis.

| API relativa a `/api/systems/:id/contract-publications/:publicationId` | Finalidade |
| --- | --- |
| `GET /integration` | Acompanhamento local, versão e recibos conhecidos |
| `GET /integration/context` | Fonte/condições remotas e contexto para decisão explícita |
| `POST /integration` | Pedir `release_draft` ou `merge`, com intenção/ACK durável |
| `POST /integrations/:jobId/reconcile` | Observar efeito sem repetir escrita |
| `POST /integrations/:jobId/resume` | Retomar explicitamente uma operação pausada |
| `POST /resolve` | Resolver acompanhamento local sem apagar sua fonte |

Recorder compartilhado, idempotência, contexto e autoria estão na mesma transação. Eventos selecionam IDs, estados e digests; conteúdo/motivo permanecem nas fontes controladas. Pausa/retomada do Sistema incluem as novas operações. Migration aditiva recusa rollback após intenção ou resolução nova. Publicação administrativa verifica backup e preservação fora da base. Indicadores existentes mantidos; integração de configuração não comprova entrega de código, ferramentas, build, teste ou deploy. [Recibo, limites e roteiro RA-10d](plano-incremental-releases-ambientes-2026-10-27.md#37-ra-10d--integração-controlada-e-fonte-efetiva-do-contrato).

## Primeiro consumidor executável — RA-11

A construção DEV acrescenta o perfil restrito **node24-react-v1**: uma unidade Node 24 HTTP na raiz, sem migração e com receita/entradas controladas. A consulta RA-10a continua somente estrutural (`executionAvailable: false`, `tooling: not_evaluated` nessa leitura); a prontidão do primeiro executor é conferida em Integrações e na prévia da construção da História. Contrato estruturalmente válido com outro runtime/receita não libera esse executor. A construção fixa fonte DEV que contém a integração da História e o contrato nesse mesmo SHA; não exige Release e não representa teste, deploy ou Desenvolvimento Finalizado. [Perfil, versões, preparação e limites](executor-node24-react-v1.md), [recibo RA-11](plano-incremental-releases-ambientes-2026-10-27.md#38-ra-11--construção-de-trabalho-e-novo-piloto).
