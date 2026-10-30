# Plano incremental: desenvolvimento, releases e ambientes

**RA-11c publicada — preparação pelo assistente:** ação junto à conversa do Sistema, painel/confirmações e pedido compartilhados com o repositório, metadados atuais e recuperação preservada. 83 testes backend e 59 cenários únicos no runtime final verificados em rodadas dirigidas. [Recibo e roteiro](#41-ra-11c--preparação-da-aplicação-pelo-assistente). OK manual pendente. Próxima fatia: RA-12a, destino DEV do Sistema.

**Correção de conceito — 29/10/2026:** operação por Sistema deve ser conduzida pelo próprio SDLC, com assistente, serviços de domínio e executores separados. A RA-11b está entregue pelos controles do portal; seu encaminhamento pela conversa ainda falta e passa a ser a **RA-11c**. RA-12 foi dividida em destino DEV, implantação e encaminhamento pelo assistente, cada um testável. Cadastro de ambiente, estrutura técnica, provisionamento e deploy são fatos distintos. [Decisão, cobertura e roteiro](#40-correção-de-conceito--assistente-executores-e-ambientes). Essa atualização prevalece sobre indicações anteriores de próxima fatia; não altera os recibos ou os OKs pendentes.

**RA-11b publicada — preparação da aplicação no Sistema:** prévia completa, commit/MR próprios, build/teste HTTP reais e status GitLab com pipeline obrigatório preservado. Liberação do Draft e merge separados; 126 testes backend e 41 cenários de interface aprovados. [Recibo e roteiro](#39-ra-11b--preparação-controlada-da-aplicação). Próxima fatia: RA-12, implantação DEV. OK manual da preparação pendente.

**RA-11 publicada — construção de trabalho DEV:** prévia e confirmação na História, fonte/contrato/imagem fixados, executor separado e artefato com digest. 92 testes backend, 60 cenários de interface e compilação React real em fixtures isoladas aprovados. [Recibo e limites](#38-ra-11--construção-de-trabalho-e-novo-piloto). Novo piloto escolhido pelo usuário: CURSOS, aplicação de venda de cursos on-line criada do zero, com jornada catálogo → detalhes → pedido sem cobrança. Histórias ainda em especificação; preparação técnica e implantação são próximas etapas, sem resultado fabricado.

**RA-10d publicada — integração do contrato:** liberação do Draft e merge separados, confirmação da fonte efetiva e encerramento local de pendências sem apagar intenções. Backup conferido e 41 tabelas anteriores preservadas; 22 cenários novos de interface e validação em projeto GitLab temporário aprovados. [Recibo, limites e roteiro](#37-ra-10d--integração-controlada-e-fonte-efetiva-do-contrato). OK manual pendente. Próxima fatia: RA-11, construção DEV.

**Consolidação da regressão — 29/10/2026:** ambiente rápido exclusivo da automação, catálogo de interface e execução limpa compartilhada com o CI. A ordem crítica para o piloto até PRD no laboratório está registrada na [seção 36](#36-regressão-consolidada-e-caminho-do-piloto-em-dois-dias). Esta consolidação não encerra RAs funcionais nem publica alterações no portal humano.

**RA-10c publicada — envio do contrato ao GitLab:** proposta revisada gera intenção durável, commit exclusivo e Merge Request Draft próprios, com recuperação de efeito incerto e continuação parcial. MR criado não significa integrado na branch padrão. 131 testes de aplicação, 8 de auditoria e 117 cenários de navegador aprovados, com revisão UX. [Recibo e roteiro](#35-recibo-ra-10c--envio-controlado-do-contrato-ao-gitlab). OK manual pendente.

**RA-10b publicada — proposta e revisão locais do contrato:** o arquiteto prepara uma definição no Sistema, com perguntas, acompanhamento durável e revisão explícita. Publicação GitLab e execução permanecem próprias. 103 testes de aplicação, 8 de auditoria e 97 cenários de navegador aprovados, com revisão UX. [Recibo e roteiro](#34-recibo-ra-10b--proposta-e-revisão-locais-do-contrato). OK manual pendente.

**RA-10a publicada — consulta do contrato de execução:** Sistema → Repositório do Sistema → Contrato de execução. Leitura versionada em commit fixado, estrutura/entradas conferidas, estados ausente/inválido/não suportado e falha com leitura anterior preservada. Sem execução de comandos/aplicações ou edição do repositório. 73 testes de aplicação, 8 de auditoria e 65 cenários de navegador aprovados, com revisão UX. [Recibo e roteiro](#33-recibo-ra-10a--consulta-do-contrato-de-execução). OK manual pendente.

**RA-09f publicada — rastreabilidade do código na composição planejada:** consulta a execução exata registrada, separa fonte planejada de commit integrado e identifica evidência capturada posteriormente. Mantém histórico, paginação, filtros e rascunhos; não compõe código nem cria pacote/deploy. 81 testes de aplicação, 8 de auditoria e 49 cenários de navegador aprovados, com revisão UX. [Recibo e roteiro](#32-recibo-ra-09f--rastreabilidade-do-código-na-composição). OK manual pendente.

**RA-09e publicada — fechamento remoto histórico:** pedido confirmado no portal, intenção durável antes da escrita GitLab, recuperação do mesmo job por consulta e encerramento local RA-09d separado. Recebimento não é sucesso remoto; versão do job impede regressão por recibo antigo. 219 testes de aplicação, 8 de auditoria e 154 cenários de navegador aprovados. [Recibo e roteiro](#31-recibo-ra-09e--fechamento-remoto-do-mr-anterior). OK manual pendente.

**RA-09d publicada — encerramento histórico local:** MR antigo comprovado fechado, sem sinais de merge/agendamento, permite encerrar o acompanhamento com motivo e confirmação humana. Fonte imutável, tentativa/ciclo preservados e consulta posterior disponível. 171 testes de aplicação, 8 de auditoria e 140 cenários de navegador aprovados. [Recibo e roteiro](#30-recibo-ra-09d--encerramento-do-acompanhamento-histórico). OK manual pendente.

**RA-09c publicada — confirmação histórica posterior:** a evidência da Tarefa anterior permite verificar no GitLab e confirmar um merge ocorrido cujo resultado local ficou incerto. Tentativa original e ciclo atual são preservados. 112 testes de aplicação, 8 de auditoria e 126 cenários de navegador aprovados. [Recibo e roteiro](#29-recibo-ra-09c--confirmação-histórica-posterior). OK manual pendente.

**RA-09b publicada — captura histórica controlada:** consulta do GitLab, revisão e confirmação humana registram a referência ausente de uma integração já confirmada, inclusive em ciclo anterior. Recibo idempotente, auditoria e recuperação entre abas, sem alterar o merge original. 86 testes de aplicação, 8 de auditoria e 114 cenários de navegador aprovados. [Recibo e roteiro](#28-recibo-ra-09b--captura-histórica-controlada). OK manual pendente.

**RA-09a publicada — referência da integração:** novas confirmações do worker preservam origem/destino e commits de merge/squash informados pelo GitLab. Consulta atual e da tentativa antiga ficam no fluxo existente, sem inventar referências legadas. 100 testes de aplicação, 8 de auditoria e 100 cenários de navegador aprovados. [Recibo e roteiro](#27-recibo-ra-09a--referência-preservada-da-integração). OK manual pendente.

**RA-08b publicada — novo ciclo após integração/testing:** confirmação na Execução volta à especificação, preserva tarefas/release/MR e exige novo Gateway com destino/base explícitos. Aprovações antigas não autorizam o ciclo novo. 116 testes de aplicação, 8 de auditoria e 92 cenários de navegador aprovados. [Recibo e roteiro](#26-recibo-ra-08b--novo-ciclo-de-desenvolvimento). OK manual pendente.

**RA-08a publicada — destino explícito no Gateway de Especificação:** novas preparações exigem confirmação da branch de integração DEV e do commit de partida; agentes usam a base fixada, com release opcional. 141 testes de aplicação, 8 de auditoria e 84 cenários de navegador aprovados. [Recibo, limites e roteiro](#25-recibo-ra-08a--destino-explícito-no-gateway-de-especificação). OK manual pendente; retorno de testing permanece na RA-08b.

**RA-07 publicada — preparação controlada da branch:** consome decisão inicial válida, confirmação separada e conta dedicada. Proteção conferida antes da referência, base fixa e recuperação por leitura. Indicadores na Visão Geral aprovados pelo usuário, sem metas. 80 testes de aplicação, 8 de auditoria e 37 cenários de navegador aprovados. [Recibo e roteiro](#24-recibo-ra-07--preparação-controlada-da-branch). OK manual e decisões reais continuam separados.

**Correção da Execução do Épico publicada — 28/10/2026:** acompanhamento das Histórias primeiro; ciclo, retomada e planejamento no Projeto como aprofundamentos. Impedimentos reais da árvore completa, confirmação explícita e formulário alinhado. 51 testes de aplicação, 8 de auditoria e 20 cenários de navegador aprovados. [Recibo e roteiro](#23-correção-transversal--execução-do-épico). A sequência de releases permanece no quadro; esta correção não marca outra RA como aceita.

**RA-06b publicada — decisão local no portal:** política e base inicial podem ser revisadas/confirmadas explicitamente no plano da Release, com autoria, contexto, auditoria e retentativa durável. Não cria branches ou decide a base real automaticamente. 101 testes de aplicação, 8 de auditoria e 48 cenários de navegador aprovados. [Recibo e roteiro](#22-recibo-ra-06b--decisão-local-do-plano). OK do usuário e decisão real da REL-1 pendentes.

**RA-06a publicada — consulta e proposta de branches:** no detalhe da Release, Composição → Plano de branches e base. Branch/commit observados, desenho não aprovado e decisões DE-01/02 são distintos. Nenhuma escrita no GitLab ou base autorizada por GET. 74 testes de aplicação, 8 de auditoria e 42 cenários de navegador aprovados. [Recibo, proposta e roteiro](#21-recibo-ra-06a--consulta-e-proposta-de-branches). OK do usuário e decisões DE continuam pendentes.

**RA-05b publicada — referência de planejamento e cadastro separados:** mudanças de fase/versão administrativa não invalidam conteúdo/código nem criam snapshot por si só. Alteração real exige revisão explícita e contexto conferido no salvamento. Sem release e Planejamento a revisar têm recortes distintos. 57 testes de aplicação, 8 de auditoria e 38 cenários de navegador aprovados. [Recibo e roteiro](#20-recibo-ra-05b--vigência-das-referências-de-planejamento). OK do usuário pendente.

**RA-05a publicada — composições preservadas:** associação atual e revisões imutáveis de composição têm fontes separadas; transferir/retirar História preserva suas participações registradas. Aprofundamentos paginados em Composição da Release e Release planejada da História. 73 testes de aplicação, 8 de auditoria e 31 cenários de navegador aprovados; OK do usuário pendente. [Recibo e roteiro](#19-recibo-ra-05a--composições-e-participações-preservadas).

**RA-03 publicada — desenvolvimento e conclusão separados:** leitura consistente na lista de Histórias, História e Tarefas; referências de especificação/código separadas da versão do cadastro. Sem aprovação ou produção inferidas de status. 74 testes de aplicação, 8 de auditoria, 65 cenários de navegador e revisão UX aprovados. Comando Desenvolvimento Finalizado permanece na RA-14. [Recibo e roteiro](#17-recibo-ra-03--desenvolvimento-e-conclusão-separados). OK do usuário pendente.

**RA-04a publicada — estados e DEV inicial:** OPEN/CLOSED/CANCELED substituem DRAFT/FROZEN/CANCELLED na persistência, consultas, filtros, associação e métricas. Criação gera OPEN com posição DEV no fluxo, sem atestar implantação. O cancelamento foi entregue na RA-04b; fechar e gerar cópia continuam nas fatias próprias. [Definição e impactos](#13-definição-posterior--open-closed-canceled-e-cópia-em-dev) e [recibo/roteiro RA-04a](#14-recibo-ra-04a--estados-da-release-e-dev-inicial).

Data: 27/10/2026. Documento de trabalho e registro de aceite por entrega.

Contrato de domínio: [releases e promoção entre ambientes](releases-promocao-2026-10-22.md#contrato-corrente-dev-candidatas-e-conclusão-em-produção--27102026). Referências obrigatórias: [arquitetura](../portal/docs/ARCHITECTURE.md), [experiência](../portal/docs/PADROES_DE_EXPERIENCIA.md), [auditoria](implementacao-auditoria-2026-10-24.md) e [métricas de releases](metricas-releases-2026-10-22.md).

**Acompanhamento corrente:** o pedido inicial entregou definições, levantamento do código e este plano. Depois da autorização do usuário para iniciar, a primeira entrega da RA-01 foi reprovada, corrigida e republicada, com as tentativas preservadas nas seções 8 e 9. Ao solicitar “VAmos adiante”, o usuário autorizou prosseguir após a revisão da RA-01; este retorno foi registrado como aceite para avançar. RA-02 foi implementada, validada e publicada para seu teste, conforme seção 10; As demais RA seguem planejadas, com antecipações/fatias publicadas registradas abaixo. O [plano geral anterior](plano-portal-sdlc-2026-10-20.md) permanece como histórico; esta evolução não retoma indiscriminadamente seu backlog inteiro.


**Correção solicitada após RA-02:** o usuário apontou DEV ausente em Releases e divergência Security Scan/Merge Request entre lista e detalhe. Autorizou expressamente corrigir/preencher a base do laboratório, inclusive com dados sintéticos, e dispensou compatibilidade com dados antigos. Esta instrução substitui a exigência anterior de compatibilidade no recorte afetado; não exige criar resultados sintéticos de execução. A correção RA-02-C1 antecipa a separação estrutural de composição/ambientes da RA-04 e unifica a fase de integração, sem iniciar os executores previstos nas demais entregas.

## 1. Resultado e modo de execução

- DEV recebe versões de trabalho. Histórias percorrem codificação/testes e recebem aprovação **Desenvolvimento Finalizado** por revisão.
- A release nasce OPEN no fluxo DEV, sem comprovar deploy. Fechamento fixa conteúdo e muda para CLOSED; não existe reabertura. Cancelamento gera CANCELED e preserva instalações/histórico.
- DEV → QA exige release CLOSED e todas as Histórias da composição aprovadas; constrói/versiona pacote imutável e só então implanta em QA.
- QA/HML/PRD recebem os mesmos artefatos do pacote fechado; conteúdo alterado exige outra release por cópia em DEV e nova validação.
- Retirada em QA/HML/PRD gera cópia OPEN em DEV e recompõe código; a origem fechada e suas evidências permanecem preservadas. Cópia não cancela automaticamente a origem.
- A História só é concluída na entrada confirmada em PRD da candidata que contém sua revisão. Merge e aprovação de DEV não a concluem.

Executar **uma entrega funcional por vez**, publicar/disponibilizar seu recorte quando validado e apresentar o roteiro manual. O usuário testa e registra OK ou reprovação antes de avançarmos à próxima entrega dependente. Uma solicitação posterior do usuário pode mudar essa cadência; não deduzir seu aceite de silêncio, passagem do tempo ou teste automático aprovado. Atividades preparatórias independentes não podem produzir uma coleção de funcionalidades ainda sem teste do usuário.

Cada RA deve acrescentar uma capacidade observável, com escopo limitado. Se uma entrega exigir infraestrutura maior ou deixar de ser pequena, subdividi-la antes de codificar (por exemplo RA-12a/12b), conservando ID, dependências e histórico. Não acumular várias entregas numa única liberação para teste. Não há estimativa de prazo prometida sem medir a execução.

## 2. Baseline inspecionada e alterações necessárias

Este inventário descreve o código encontrado em 27/10, incluindo mudanças locais já existentes. A implementação deve conferir novamente os pontos de integração; nomes de novos modelos/endpoints são propostas, não contratos publicados.

| Funcionalidade existente / fonte | Situação observada | Alteração necessária | Entregas |
| --- | --- | --- | --- |
| [Schema Prisma](../portal/prisma/schema.prisma): `Item`, `Release`, `ReleaseStory`, `Environment` | `ReleaseStage` mistura DRAFT/REJECTED e QA/HML/PRODUCTION; associação usa `plannedStoryVersion`; ambiente guarda projeção atual, sem histórico completo de implantação | Separar composição, candidata, build, artefato, implantação, validação e aprovação DEV; preservar legado; tratar revisão de conteúdo separada da versão otimista da linha | 01–05, 11–19, 25 |
| [Vocabulário compartilhado](../portal/packages/shared/src/states.ts) e [Tarefas do pipeline](../portal/apps/api/src/pipeline-tasks.ts) | Há fases de História e seis Tarefas padrão; Teste/Teste Final ainda sem executor | Desenvolvimento Finalizado distinto de COMPLETED; ciclos coding/testing; resultados reais das mesmas Tarefas, sem duplicatas a cada deploy | 03, 08, 13–14, 19, 25 |
| [Cadastro do repositório](../portal/apps/api/src/system-repository.ts), [API principal](../portal/apps/api/src/app.ts), [repos.tsx](../portal/apps/web/app/repos.tsx) | Um repositório por Sistema; cadastro cria referências QA/HML/PRD | Incluir referência DEV; adequação explícita/idempotente de existentes; distinguir cadastro de ambiente e provisionamento real | 02, 12 |
| [Templates](../portal/packages/templates/src/index.ts) e `.sdlc/contract.md` gerado | Runtime generic neutro; não declara uma aplicação de negócio executável | Contrato versionado de build, testes, execução, saúde e migração; validação e edição/proposta explícita, sem trocar aplicação/stack automaticamente | 10–13, 17 |
| [Integrações na web](../portal/apps/web/app/integrations.tsx), prontidão na [API](../portal/apps/api/src/app.ts) e [credenciais](../portal/apps/api/src/credentials.ts) | Ferramentas e contas têm prontidão/identidades próprias | Expor capacidade real de executor/registro/destinos; proteger branches de release conforme política e revisar escopo da conta de merge, sem retirar proteção da main nem fornecer credenciais ao modelo | 07, 10–12, 17–18, 28 |
| [Planejamento de releases](../portal/apps/api/src/releases.ts) | DRAFT, composição, transferência e seleção paginada já existem; `ready:false` e capacidades de build/promoção desligadas | Manter planejamento; calcular prontidão real sobre toda composição; distinguir participação histórica e seleção ativa; bloqueios transacionais; liberar capacidades só quando entregues | 04–05, 15–24 |
| [Releases na web](../portal/apps/web/app/releases.tsx) e [CSS](../portal/apps/web/app/releases.css) | Gestão central em Releases, seletor na História, filtros/URL/versões | Mostrar dimensões separadas; composição/pendências, candidatas, artefatos, implantações, validações, retirada e próxima ação; preservar navegação e rascunhos | 01, 04–05, 15–24 |
| [Adapter GitLab](../portal/apps/api/src/gitlab.ts) | Contexto usa branch padrão; `sdlc/story-<executionId>` publica MR para esse destino; correção exige destino padrão | Resolver base/destino autorizado da release; manter contexto por SHA e regras create/update; nova revisão/MR depois de merge; adoção explícita do acervo | 06–09, 21 |
| [Execução](../portal/apps/api/src/execution.ts) e [conversa de execução](../portal/apps/api/src/execution-discussion.ts) | Snapshot/G1, agentes, retentativa e publicação durável já existem | Congelar contexto da release; permitir correções nos ciclos DEV; invalidar evidências afetadas; conservar novo G1 quando escopo muda | 08–14 |
| [Qualidade](../portal/apps/api/src/quality.ts) e [readiness](../portal/apps/api/src/merge-readiness.ts) | CODE REVIEW/SECURITY SCAN fixam revisão/base/política | Revalidar destino/base da História; release opcional em DEV; não herdar evidência para outro código; acrescentar testes DEV e validação de candidata como execuções distintas | 09, 13–19, 22 |
| [Merge](../portal/apps/api/src/merge.ts), [provider](../portal/apps/api/src/merge-provider.ts), [liberação Draft](../portal/apps/api/src/merge-preparation.ts) | Liberação e merge específicos com conta própria; merge não conclui História | Integrar no destino/base explícito da História, sem exigir release em DEV; reconciliar composição antes de QA e registrar commits de origem/merge/squash; preservar gates, reconciliação e autoria; não concluir no merge | 07–09, 14, 25 |
| [Jornada](../portal/apps/api/src/journey.ts), [workspace](../portal/apps/web/app/story-workspace.tsx), [execução web](../portal/apps/web/app/story-execution.tsx) | Fase/decisão atual e histórico independente já existem | Desenvolvimento Finalizado, revisão implantada em DEV, bloqueios de composição e conclusão em PRD; não usar ambiente como fase/estado de release | 01–05, 08–19, 25, 28 |
| [Assistente de merge](../portal/apps/api/src/merge-discussion.ts) e [conversa web](../portal/apps/web/app/merge-discussion.tsx) | Ação de liberação proposta; perfis consultivos de arquitetura/infraestrutura | Oferecer operações entregues de release/ambiente/retirada com proposta e confirmação; mostrar capacidade indisponível sem promessa de execução genérica | Transversal, 28 |
| [Ciclo da História](../portal/apps/api/src/story-lifecycle.ts) e [hierarquia](../portal/apps/api/src/lifecycle-policy.ts) | Cancelamento/pausa/arquivamento e reabertura já possuem guardas | Incluir filas de build/teste/deploy/recomposição; preservar resultados; não tratar cancelamento como aprovação DEV nem permitir apagar código implantado | 03–29 |
| [Auditoria](../portal/apps/api/src/audit.ts), [catálogo](../portal/apps/api/src/audit-catalog.ts), [papel runtime](../portal/scripts/runtime-role.py) | Recorder transacional, trilha externa administrativa e conta restrita existentes | Catalogar cada novo comando/resultado, revisar privilégios por tabela, correlação e evidência; testar rollback/retentativa com papel restrito em cada migration | Todas com mutação |
| [Métricas de release](../portal/apps/api/src/release-metrics.ts), [web](../portal/apps/web/app/release-metrics.tsx), [História](../portal/apps/api/src/story-metrics.ts), trabalho/merge/qualidade | Contagens e durações atuais têm fontes distintas; releases usam stage legado | Separar unidade release/candidata/implantação/validação; instrumentar desde cada executor; conclusão em PRD; não reconstruir sucesso de dados ausentes | Transversal, 27 |
| [Compose](../portal/compose.yaml), [bootstrap portal](../portal/bootstrap.ps1), [bootstrap lab](../../lab/bootstrap.ps1), credenciais e prontidão | Infraestrutura do portal não é executor de aplicações | Conectar executor isolado, registro de artefatos, redes/volumes e segredos por ambiente; bootstrap não cria negócio, História, release ou deploy de demonstração | 10–12, 17–18, 23–26 |
| [Controle legado](../services/control/README.md) e scripts SDLC | Outra base/serviço, com contratos e utilitários próprios | Avaliar reutilização de infraestrutura sem assumir que seja executor da nova arquitetura; não migrar, limpar ou modificar o legado implicitamente | 10–12, 29 |
| [Testes](../portal/tests), testes de navegador e documentação | Suítes reais e fixtures isoladas já existem | Adaptar contratos antigos; novas evidências por entrega, consulta integral, concorrência, conta restrita e falhas remotas; sem editar negócio/aplicação para demonstrar | Todas |

## 3. Decisões e parâmetros de execução

RF-01–RF-18 do documento de domínio são a referência. Não reabrir o que o usuário já definiu como se estivesse pendente.

| ID | Ponto que ainda exige escolha | Proposta inicial, sujeita a OK antes do trabalho dependente | Necessário em |
| --- | --- | --- | --- |
| DE-01 | Branches, base e concorrência de releases | DEV da História independente de release, por MR em destino/base explícitos. Definir papel de main, isolamento entre Histórias, montagem do destino da release antes de QA e adoção dos merges existentes. Branch de release não é pré-requisito para desenvolvimento individual. Nenhuma alteração remota ao aprovar só o plano. | RA-06/07 |
| DE-02 | Primeira base sem versão em produção e História sem release | Base inicial e destino Git explicitamente escolhidos; História pode gerar, integrar, publicar e testar em DEV sem release até Desenvolvimento Finalizado. Associação é obrigatória antes de QA. Não inferir base pelo HEAD mutável. | RA-06/08 |
| DE-03 | Desenvolvimento Finalizado decidido; G2 e G3 ainda pendentes | Usuário aprovou Ana/Product Owner, Bruno/Arquiteto e Admin, com evidências da mesma revisão e sem segregação do G1 no laboratório. Homologação/produção exigem decisão própria; OKs deste arquivo não são gates de software. | RA-14 decidido; RA-19/23/24/25 pendentes |
| DE-04 | Primeiro executor, runtime suportado, isolamento e topologia | Perfil inicial já escolhido para CURSOS: Node 24/React, uma unidade HTTP, sem migração de banco neste recorte, PRD separado no laboratório. RA-11/11b implementam build/preparação; RA-12a/b detalham e executam o destino DEV compartilhado do Sistema com fila por destino. QA segue por candidata e ambientes mantêm isolamento de configuração/dados. Aplicação sem contrato fica impedida. | RA-10/11/12a/12b/18 |
| DE-05 | Versões e identidade de artefatos | Identidade estável da release e seu conteúdo fechado/pacote/digests; outra release por cópia para conteúdo diferente, com origem rastreável. Definir convenção de versão de software sem confundir com versão otimista da linha ou número de tentativa. | RA-16/17/21 |
| DE-06 | Reversão de dados e disponibilidade após rollback | Recuperação por contrato de migração e versão anterior compatível; guardar conclusão histórica da História e disponibilidade atual separadamente. Detalhar eventual reabertura explícita. | RA-12/25/26 |
| DE-07 | Retirada com dependências/código compartilhado e cancelamento | Prévia, motivo, análise de impacto e MR revisável; sem remoção automática de dependente. História cancelada não satisfaz Desenvolvimento Finalizado enquanto associada; exclusão de código exige prova. | RA-15/20/21 |
| DE-08 | Elegibilidade exata de Fechar release | Recomenda-se exigir todas as Histórias com Desenvolvimento Finalizado válido já no fechamento, além de base/revisões determinadas; o gate permanece obrigatório antes de QA. Definir se composição vazia pode fechar. Não impor essas escolhas extras como se já tivessem sido aprovadas. | RA-15/16a |

Escolhas técnicas rotineiras que não alterem o contrato podem seguir dentro do escopo de cada entrega. Registrar a escolha e a evidência aqui; questões de domínio/permissão pendentes não são resolvidas por timeout ou por suposição do agente.

## 4. Regras para considerar uma entrega pronta para teste

1. Descrever o comportamento novo e o alcance. Preservar capacidades existentes, identidade visual e contratos compartilhados. Envolver revisão de UX em entregas que criam/alteram telas ou navegação.
2. Implementar API, domínio, persistência/worker e apresentação necessários àquela fatia; capacidade futura permanece indisponível com explicação. Não mostrar sucesso de operação simulada no portal real.
3. Criar migration aditiva/compatível quando necessária; conferir permissões SELECT/INSERT/UPDATE/DELETE da conta restrita, proteção das fontes imutáveis e recuperação de versão. Não repetir a lacuna de permissões encontrada na primeira publicação de MergePreparation.
4. Cada nova ação exige catálogo de auditoria explícito, recorder na transação, iniciador/executor, revisão, correlação, antes/depois ou inaplicabilidade justificada. Administrativas usam trilha externa à base alterada. Segredos e conteúdo de agentes permanecem nas fontes controladas.
5. Exercitar o positivo e os impedimentos pertinentes: persona sem permissão, revisão alterada, concorrência, replay da mesma chave, perda de resposta/reinício, falha de auditoria e ausência de evidência. Ampliar a regressão de acordo com o impacto; não repetir tudo por rotina sem mudança que justifique.
6. Verificar leitura com coleção completa: busca/filtros/ordem/paginação/URL, seleção fora da página, estados de consulta, histórico independente da situação corrente e acervo. Nenhum GET aprova gate ou cria trabalho.
7. Registrar evidência reproduzível, versão/commit/imagem quando houver, ambientes efetivamente usados, limites, backup/reversão e roteiro manual. Publicação do portal não autoriza deploy de aplicação nem execução de História para demonstração.
8. Disponibilizar o recorte, deixar o usuário testar e registrar seu resultado. Falha/reprovação reabre o mesmo ID; não apagar aceite anterior ou evidência de tentativa, nem substituir OK humano por teste automático.

Fixtures ficam em testes isolados. Dados de negócio, código produzido pelo SDLC e resultados de agentes não são editados para encenar funcionalidades. Integração real, quando necessária, usa recursos isolados ou operação explicitamente autorizada pelo usuário.

## 5. Entregas pequenas, dependências e roteiro de aceite

### RA-00 — Definições e plano de acompanhamento

- **Escopo:** contrato corrente, inventário, decisões abertas, entregas e registro de OK deste arquivo.
- **Teste técnico:** referências locais, consistência de regras e distinção entre existente/proposto/implementado.
- **Teste do usuário:** conferir RF-02–RF-07, retirada em QA e a ordem abaixo. Resultado esperado: nenhum item funcional marcado como implementado e possibilidade de aprovar ou ajustar uma fatia individual.
- **Depende de:** nada. **Saída:** este documento; aguarda OK do usuário.

### RA-01 — Leitura separada de release, ambiente, implantação e validação

**Situação:** revisão publicada aceita para prosseguir pelo usuário ao solicitar “VAmos adiante”. Tentativa anterior preservada; [recibo da revisão](#9-revisão-ra-01--navegação-filtros-e-atualização).

- **Alterar:** projeções de Releases/História e web, com adaptação compatível do legado; ainda sem comandos novos de build/deploy.
- **Teste do usuário:** abrir uma release e sua História, trocar abas, recarregar; conferir rótulos separados e “não executado/sem evidência” onde não há execução. QA nunca aparece como status da composição nova.
- **Negativo:** um valor QA legado não vira implantação concluída ou teste aprovado. **Depende de:** RA-00. **Não inclui:** provisionamento/migração definitiva.

### RA-02 — Cadastro de DEV como referência de ambiente

**Situação:** implementada/publicada para teste; OK do usuário pendente. [Recibo e roteiro](#10-recibo-ra-02--referências-de-ambiente).

- **Alterar:** cadastro do Sistema/repositório, Environment e consulta; recuperação explícita/idempotente de Sistemas existentes, com auditoria.
- **Teste do usuário:** cadastrar Sistema de validação e conferir DEV/QA/HML/PRD; executar recuperação no escopo escolhido e repetir sem duplicar referências.
- **Negativo:** abrir Sistema não cria DEV; nova referência não afirma aplicação implantada. **Depende de:** RA-01. **Não inclui:** deploy.

### RA-03 — Desenvolvimento Finalizado separado de conclusão

**Situação:** leitura implementada/publicada para teste; comando de aprovação continua na RA-14. [Recibo e limites](#17-recibo-ra-03--desenvolvimento-e-conclusão-separados).

- **Alterar:** modelo/projeção de revisão, aprovação de desenvolvimento e vocabulário de História/Tarefa; compatibilidade com estados existentes.
- **Teste do usuário:** consultar História em coding/testing e perceber que permanece aberta; consultar legado concluído sem fabricar aprovação DEV. Conferir a pendência “desenvolvimento ainda não aprovado”.
- **Negativo:** PATCH genérico/seletor de status não conclui, aprova DEV ou zera resultados. Fechamento de agrupador não força conclusão dos filhos. **Depende de:** RA-01. O comando de aprovação virá em RA-14.

### RA-04 — Estado da composição separado dos ambientes

- **Alterar:** schema, consultas/filtros, métricas e UI para OPEN/CLOSED/CANCELED, com DEV como posição inicial de fluxo separada das implantações reais. DRAFT/FROZEN/CANCELLED são a implementação publicada a migrar, não os nomes finais. A separação estrutural foi antecipada pela RA-02-C1; o ciclo funcional novo ainda está pendente.
- **Teste do usuário:** criar release OPEN em DEV, editar composição, filtrar estados e distinguir ambiente do fluxo de implantação confirmada. Cancelar e verificar preservação dos fatos.
- **Negativo:** nenhum QA/HML/PRODUCTION ou cadastro DEV é convertido em sucesso fictício; CLOSED/CANCELED não reabrem nem aceitam edição. **Depende de:** RA-01; subdivisões e dependências na seção 13. Sem exigir compatibilidade antiga dispensada pelo usuário; preservar auditoria histórica.

### RA-05 — Composição ativa por revisão e rastreabilidade

- **Alterar:** associação/transferência existente, `plannedStoryVersion`, API e seleção paginada. Separar versão otimista, revisão de conteúdo/código, associação ativa e participação imutável/histórica em releases. O `ReleaseStory.storyId` único atual não suporta a cópia preservando ambas as composições; refatorar essa responsabilidade antes de copiar.
- **Teste do usuário:** associar História à release OPEN antes do merge; mudar filtro/página; atualizar status e depois conteúdo. A primeira mudança preserva a referência pertinente; alteração real de conteúdo apresenta revisão desatualizada e exige revisão explícita. Uma História em duas composições por cópia mantém referências/revisões da origem sem duplicar o item ou apagar histórico.
- **Negativo:** outro Sistema, transferência concorrente e alteração silenciosa de pacote são recusados. **Depende de:** RA-03/04.

### RA-06 — Plano de branches e adoção, sem escrita no GitLab

- **Alterar:** consulta de base/destino e tela de revisão do plano; conferir DE-01/02 com o usuário.
- **Teste do usuário:** visualizar release, base/commit, branches propostas e Histórias já integradas em main. Escolher caso sem versão em PRD e ver a pendência explícita.
- **Negativo:** consultar/aprovar o desenho não move branch, reescreve código ou altera MR legado. **Depende de:** RA-05. A política é registrada aqui antes de RA-07.

### RA-07 — Criar branch da release por operação controlada

**Situação:** capacidade implementada/publicada para teste no cenário inicial com decisão vigente registrada; operação real exige confirmação própria. [Recibo e limites](#24-recibo-ra-07--preparação-controlada-da-branch). OK manual pendente.

- **Alterar:** adapter GitLab, comando/worker de preparação e contexto da release; revisão/base fixadas, identidade restrita e auditoria.
- **Teste do usuário:** confirmar preparação da branch e conferir referência real; repetir a mesma solicitação e recuperar após perda de resposta sem duplicar recursos.
- **Negativo:** nome existente com base divergente, escopo inválido e branch protegida não são sobrescritos. Conferir proteção da nova referência e acesso da conta dedicada, sem afrouxar a main ou permitir force push. **Depende de:** RA-06 e aceite DE-01/02.

### RA-08 — Gerar/corrigir História com destino explícito e DEV independente

**Divisão incremental:** RA-08a entregue para novas preparações, no destino DEV descrito na seção 25. RA-08b entrega novo ciclo após testing/merge confirmado, conforme seção 26; destinos de release/arbitrários e proveniência continuam nas dependências próprias. A entrega parcial não libera essas guardas nem altera execuções antigas.

- **Alterar:** contexto/snapshot/G1, agente de código, publicação e guardas hoje ligadas à branch padrão ou que bloqueiam novo ciclo em testing.
- **Teste do usuário:** preparar/revisar História, gerar código para o destino mostrado; voltar de testing para correção. Conferir requisitos, revisão e branch no pedido e no resultado; repetir sem release associada. Release opcional não impede gerar/integrar código para DEV.
- **Negativo:** troca de base/destino ou escopo invalida decisão; associação de planejamento não altera código nem aprova candidata; correção fora do escopo exige G1 pertinente. Não alterar execução antiga em curso. **Depende de:** RA-05/06 e DE-01/02 para o destino da História; RA-03/07 somente para compor candidata/release, sem bloquear DEV por falta de associação.

### RA-09 — Merge e correções posteriores com proveniência

**Divisão incremental:** RA-09a registra metadados e consulta; RA-09b captura referências ausentes de integrações já confirmadas; RA-09c confirma posteriormente merge comprovado de execução anterior sem reescrever a tentativa. RA-09d encerra acompanhamento local quando a consulta comprova MR fechado sem merge/agendamento. RA-09e acrescenta fechamento remoto de MR aberto por pedido durável e confirmado. RA-09f liga por consulta a execução exata registrada na composição às fontes preservadas de publicação e integração. Enriquecimento de referência parcial e composição física de código/candidata permanecem próprios. Limites e sequência nas seções 27–32.

- **Alterar:** qualidade, liberação Draft, merge, fonte/destino, commits de integração/squash e associação da entrega à release.
- **Teste do usuário:** integrar MR na branch aprovada; ver História ainda aberta. Solicitar correção após merge e conferir nova revisão/MR rastreável, sem fingir que MR fechado continua editável.
- **Negativo:** fonte/base alterada, aprovações antigas, merge duplicado e escrita em outro destino são impedidos. **Depende de:** RA-08.

### RA-10 — Validar contrato de execução do Sistema

**Divisão incremental:** RA-10a publicada para consulta do formato v1 e verificação de referências no commit, sem executar comandos. RA-10b publicada para proposta e revisão locais pelo arquiteto. RA-10c publicada para envio controlado em branch/MR próprios; RA-10d publicada para integração e confirmação da fonte efetiva. Prontidão real de ferramentas permanece nas capacidades próprias. [Formato, limites e propriedade](contrato-execucao-sistema-v1.md).

- **Alterar:** schema/leitura versionada do contrato no repositório e prontidão de ferramentas; proposal/edição somente por ação explícita.
- **Teste do usuário:** consultar comandos/entradas de build/teste, saúde, runtime e migração do contrato autorizado; retirar requisito numa fixture e ver impedimento antes de executar.
- **Negativo:** template generic não implica stack configurada; comandos arbitrários do chat não viram execução. **Depende de:** RA-02/05 e DE-04/06.

### RA-11 — Construir versão de trabalho DEV

- **Alterar:** executor de build isolado, fila/lease, fontes da História por SHA, resultados e artefatos de trabalho rastreáveis; sem release obrigatória ou candidata de QA.
- **Teste do usuário:** solicitar build da revisão autorizada; acompanhar fila/início/resultado. Conferir falha real em fixture e retomada/reconciliação sem resultado inventado.
- **Negativo:** HEAD alterado, contrato inválido, segredo em saída e acesso fora do workspace são recusados/controlados. **Depende de:** RA-09/10. Uma tecnologia suportada primeiro; suporte extra em outras fatias.

### RA-11b — Preparar a aplicação no repositório do Sistema

- **Alterar:** preparação fixa e revisável Node 24/React, com branch/commit/MR Draft exclusivos, build/teste técnico reais e status GitLab próprio; liberação e integração confirmadas separadamente. Não contornar as proteções do agente de codificação.
- **Teste do usuário:** conferir os nove arquivos no Sistema, confirmar publicação e acompanhar; liberar Draft, integrar e consultar contrato na fonte efetiva, sem sair do portal.
- **Negativo:** aplicação existente não é sobrescrita; perda de resposta não repete efeitos; falha técnica não informa sucesso ou aprova História. **Depende de:** RA-10d/11. Recibo na seção 39.

### RA-11c — Encaminhar a preparação pelo assistente

- **Alterar:** consultar a capacidade/pendência real do Sistema e apresentar proposta estruturada para a preparação RA-11b na conversa. Reutilizar os serviços, políticas de confirmação, versões, idempotência, intenções e worker existentes. O texto do modelo não concede autorização nem escolhe fontes arbitrárias.
- **Teste do usuário:** pedir a preparação da aplicação, conferir o mesmo efeito disponível no repositório do Sistema, confirmar e acompanhar o pedido. Liberar Draft e integrar continuam decisões próprias. Recarregar ou trocar de aba recupera a mesma operação.
- **Negativo:** ação inexistente fica indisponível com explicação; contexto/persona/revisão alterados impedem envio novo; conversa e botão concorrentes não duplicam efeitos. Não há comandos Docker/shell fornecidos ao usuário ou execução genérica pelo modelo. **Depende de:** RA-11b. Inclui revisão UX do encaminhamento e testes de rollback/retentativa nos comandos reaproveitados.

### RA-12 — Implantar versão de trabalho em DEV

- **Alterar:** executor de implantação, configuração/segredos, exclusão por destino, saúde e projeção atual do ambiente. Guardar identidade da versão efetivamente ativa e histórico de tentativas.
- **Teste do usuário:** publicar uma História sem release, abrir URL DEV e conferir revisão/saúde; provocar falha isolada e observar que a versão anterior não é anunciada como nova. Reconciliar resposta perdida.
- **Negativo:** deploy concorrente não sobrescreve silenciosamente o destino; sem sucesso apenas por container iniciado. **Depende de:** RA-11 e DE-04/06.

A RA-12 é o aceite conjunto das três fatias abaixo. O fluxo final conduz a preparação do destino ausente e a implantação dentro do portal; instalar recursos manualmente por Sistema não satisfaz esse aceite. O executor da plataforma deve estar instalado previamente. Cada efeito mantém intenção e resultado próprios; uma confirmação do fluxo não pode encobrir falha ou repetir efeito já enviado.

#### RA-12a — Preparar o destino DEV do Sistema

- **Alterar:** leitura de prontidão e configuração do destino, plano com perfil suportado e provisionamento sob demanda por executor controlado. Identificar Sistema/ambiente e propriedade de recursos; configuração/segredos ficam nas fontes apropriadas, sem dados reais no chat. Referências cadastradas continuam separadas da prontidão física.
- **Teste do usuário:** conferir e preparar destino ausente; acompanhar resultado e consultar recursos confirmados. Novo pedido equivalente não cria outro destino; recurso compatível já gerenciado é conferido.
- **Negativo:** recurso sem prova de propriedade, perfil não suportado, base da plataforma indisponível ou ambiente de outro Sistema impedem a operação sem adoção/sobrescrita. Perda de resposta recupera o mesmo pedido. Testar rollback por falha do recorder e reinício. Não declarar implantação ou saúde da aplicação. **Depende de:** DE-04/06 e contrato suportado.

#### RA-12b — Publicar artefato confirmado no destino DEV

- **Alterar:** selecionar imagem/digest de build confirmado, validar disponibilidade e compatibilidade, serializar por destino, implantar e conferir saúde/versão efetiva. Encadear preparação RA-12a quando necessária, com efeitos e checkpoints distintos, sem exigir comandos técnicos externos da pessoa de negócio.
- **Teste do usuário:** publicar História sem release, abrir URL DEV e conferir a fonte ativa; depois publicar outra revisão, preservando tentativas e versão anterior. Falha demonstra situação atual real e recuperação, sem anunciar a versão nova como ativa.
- **Negativo:** artefato ausente/adulterado, destino incompatível, concorrência, versão alterada e resposta perdida não liberam sobrescrita ou reenvio incerto. Testar limites do runtime, ausência de acesso à infraestrutura administrativa e rollback/retentativa de auditoria. Não aprova Desenvolvimento Finalizado ou conclui História. **Depende de:** RA-11 e RA-12a.

#### RA-12c — Conduzir a publicação DEV pelo assistente

- **Alterar:** estender o encaminhamento RA-11c a consultar/preparar destino e publicar artefato DEV. O assistente apresenta efeito e impedimentos reais e acompanha os pedidos dos mesmos serviços da tela. Preparação e implantação permanecem identificáveis no acompanhamento; não criam outra fila ou executor.
- **Teste do usuário:** solicitar publicação em DEV pela conversa, revisar o destino/artefato e confirmar no portal; acompanhar preparação necessária, implantação, URL e versão saudável. Recuperar o pedido após recarga sem nova decisão ou duplicação.
- **Negativo:** pedido textual não autoriza operação indisponível, produção, comando livre ou revisão diferente. Testar autorização, contexto alterado, paridade com os controles da tela e recuperação incerta. **Depende de:** RA-11c/12a/12b. Revisão UX e evidência em ambiente isolado obrigatórias.

### RA-13 — Executar testes DEV e retornar à codificação

- **Alterar:** executor de testes, evidências por revisão/implantação, Tarefa Teste e jornada; manter as Tarefas planejadas existentes.
- **Teste do usuário:** testar versão DEV; reprovar, solicitar correção, gerar novo MR/build/deploy e testar de novo. Ver tentativas anteriores preservadas e História entre coding/testing.
- **Negativo:** caso de teste descrito não é execução; teste de outro commit/ambiente não aprova o atual. **Depende de:** RA-12.

### RA-14 — Aprovar Desenvolvimento Finalizado

- **Alterar:** comando de aprovação, elegibilidade, autorização, invalidação por mudança real e indicação na História/Release; registrar aprovador/revisão/evidências.
- **Teste do usuário:** aprovar revisão DEV com testes e controles válidos, mesmo sem release, e conferir História ainda aberta. Alterar código e ver prontidão afetada perder validade, sem apagar aprovação histórica.
- **Negativo:** persona sem papel, evidência ausente, resultado stale ou deploy não confirmado bloqueiam. **Depende de:** RA-09/13 e DE-03.

### RA-15 — Conferir todas as Histórias para DEV → QA

- **Alterar:** readiness calculada no backend sobre composição integral, dependências, proveniência e versão; lista/contagem/ação de preparar QA.
- **Teste do usuário:** release com três Histórias, duas aprovadas e uma pendente: bloquear e apontar a terceira. Repetir com a pendente fora da página/filtro. Aprovar todas e ver elegibilidade, ainda sem pacote ou deploy.
- **Negativo:** cancelada/retirada apenas do cadastro/código extra ou teste da composição anterior não satisfazem o gate. **Depende de:** RA-05/14 e DE-07.

### RA-16 — Fechar composição e preparar pacote para QA

- **RA-16a — Fechar:** comando OPEN → CLOSED com snapshot integral da composição, Histórias/revisões, base/SHA e entradas; sem reabertura ou edição posterior. Conferir elegibilidade DE-08. Fechamento não afirma build/deploy.
- **RA-16b — Preparar QA:** revalidar todos os gates da composição CLOSED, reservar identidade/versão do pacote e iniciar construção na passagem DEV → QA. Resultados e manifesto de artefatos serão selados em RA-17; as entradas do fechamento não podem ser substituídas.
- **Teste do usuário:** fechar, consultar manifesto e tentar editar/reabrir; confirmar Preparar QA e comparar base/revisões; repetir sem duplicar. Falha operacional mantém CLOSED, com retentativa para as mesmas entradas.
- **Negativo:** mudança concorrente de composição/prontidão invalida pedido; fonte indefinida impede fechamento. Conteúdo alterado exige outra release OPEN por cópia. **Depende de:** RA-04a/05/15 e DE-05/08. Não construir o pacote antes do marco DEV → QA.

### RA-17 — Construir pacote imutável da candidata

- **Alterar:** build fixado, registro/armazenamento de artefatos, digests e verificações do conjunto; logs seguros e resultado observado.
- **Teste do usuário:** construir e consultar a versão/digests reais; comparar fonte com manifesto; falhar build em teste isolado e confirmar que não há pacote aprovado nem deploy QA.
- **Negativo:** não substituir bytes de artefato já selado. Falha antes de produzir pacote pode ser retomada sob fonte/contrato fixados; conteúdo alterado exige outra release por cópia em DEV, sem reabrir a origem CLOSED. **Depende de:** RA-11/16.

### RA-18 — Implantar a candidata em QA

- **Alterar:** executor usa digests existentes, ambiente QA e histórico de implantação; resultado/saúde/reconciliação separados do estado da release.
- **Teste do usuário:** implantar candidata, abrir QA e comparar identidade com pacote. Exercitar falha/retentativa isolada e verificar qual versão ficou ativa.
- **Negativo:** proibido reconstruir para QA, trocar conteúdo ou declarar testes aprovados pelo deploy. **Depende de:** RA-12/17.

### RA-19 — Validar a candidata implantada em QA

- **Alterar:** testes da composição, Teste Final, relatórios e elegibilidade para HML; evidências ligadas à implantação/digest e critérios das Histórias.
- **Teste do usuário:** executar validação, consultar falha e depois resultado de nova execução válida. Conferir que História permanece aberta mesmo com QA aprovado.
- **Negativo:** candidata substituída, versão diferente no ambiente, ausência de controle ou resultado anterior não liberam HML. **Depende de:** RA-13/18 e DE-03.

### RA-20 — Prévia de cópia em DEV e alteração de composição fechada

- **Alterar:** gestão da release com origem CLOSED identificada, nova identidade proposta em DEV, análise de commits/dependentes e comparação da composição original versus cópia; somente leitura.
- **Teste do usuário:** partir de origem em QA, HML ou PRD; propor cópia OPEN e retirada de H02 de H01/H02/H03. Ver dependência de H03, origem/base e ausência de aceites herdados; desistir da prévia e confirmar origem intacta.
- **Negativo:** nenhuma retirada/execução apenas por abrir a página; grafo incompleto fica explícito e bloqueia proposta insegura. **Depende de:** RA-19 e DE-07.

### RA-21 — Gerar Cópia em DEV como outra release OPEN

- **Alterar:** comando idempotente com origem/versão/motivo e nova chave, vínculo de proveniência e composição de planejamento OPEN em DEV. Não transferir associação apagando a origem; não duplicar Histórias; sem pacote, implantação ou aceite da release herdados. Edição/retirada e alterações Git revisáveis são ações posteriores na cópia, sem refazer a original.
- **Teste do usuário:** confirmar cópia, consultar ambas e comparar referências; incluir/retirar Histórias na cópia e verificar origem intacta. Reenviar após resposta perdida sem criar outra release. Cancelamento da origem, quando pretendido, é explícito.
- **Negativo:** cópia e cancelamento concorrentes obedecem à revisão; dependente não é removido silenciosamente; não reescrever branch/pacote fechado nem reabrir Histórias concluídas. **Depende de:** RA-05/09/16a/20. Revisão e correção seguem os agentes/capacidades autorizados.

### RA-22 — Revalidar a cópia em DEV e publicar a nova release

- **Alterar:** encadeamento da nova release aos comandos de DEV/prontidão/fechamento/build/QA, preservando as identidades e o histórico de origem/cópia.
- **Teste do usuário:** integrar recomposição, testar DEV, revisar aprovações afetadas e todas as Histórias restantes; fechar a cópia, preparar seu pacote, implantar e validar QA. Comparar manifestos: H02/código fora, H01/H03 corretas.
- **Negativo:** a identidade original não é reutilizada, cancelamento bloqueia novas promoções e aprovação da origem não aprova a cópia. **Depende de:** RA-14–21. Teste focado de retirada; não substitui o aceite individual das entregas anteriores.

### RA-23 — Autorizar e implantar a candidata em HML

- **Alterar:** gate G2/autoria, solicitação de promoção e executor HML usando os mesmos artefatos aprovados em QA.
- **Teste do usuário:** autorizar candidata selecionada, implantar HML e comparar digests QA/HML; consultar falha operacional e reavaliar sem reconstrução.
- **Negativo:** candidata substituída, retirada confirmada ou validação QA ausente bloqueiam. **Depende de:** RA-19/22 e DE-03.

### RA-24 — Homologar ou rejeitar conteúdo em HML

- **Alterar:** registro de homologação/regressão, decisão/motivo de negócio e elegibilidade G3, sem concluir História ou alterar artefato.
- **Teste do usuário:** aprovar uma composição; reprovar outra indicando História/achado. Conferir bloqueio de PRD e caminho de correção/retirada por cópia como nova release OPEN em DEV, novo fechamento/pacote e QA.
- **Negativo:** aprovar texto no chat não aprova G3; aprovação anterior não migra à sucessora. **Depende de:** RA-23 e DE-03.

### RA-25 — Implantar em PRD e concluir as Histórias correspondentes

- **Alterar:** gate G3, deploy PRD por digest, resultado/saúde, confirmação auditada da entrada em produção e conclusão das revisões incluídas; refletores de status/jornada/métricas.
- **Teste do usuário:** confirmar publicação autorizada; antes do resultado, Histórias abertas. Após entrada confirmada, concluir exatamente as Histórias/revisões elegíveis do manifesto, uma vez, com link à implantação.
- **Negativo:** falha, resposta perdida, outra candidata ou SHA divergente não concluem; replay não duplica conclusão. Reconciliar implantação sem refazer deploy. **Depende de:** RA-24 e DE-03/06.

### RA-26 — Recuperação operacional e rollback rastreável

- **Alterar:** operação específica de recuperação, compatibilidade de migrações, implantação anterior, autorização e disponibilidade atual, preservando fatos históricos.
- **Teste do usuário:** simular falha isolada e restaurar versão compatível; consultar resultado, versão ativa e motivo. Política de reabertura de História, se escolhida, é explícita e auditada.
- **Negativo:** rollback de aplicação não promete reversão de dados; migração incompatível impede execução automática. **Depende de:** RA-25 e DE-06. Recuperação mínima já deve existir em cada executor anterior.

### RA-27 — Indicadores com unidades e cobertura corretas

- **Alterar:** métricas/web/filtros e compatibilidade de stage legado; distinguir release, candidata, implantação, validação, aprovação DEV e conclusão em PRD.
- **Teste do usuário:** comparar um cenário com duas candidatas e múltiplas tentativas: contagens e durações não multiplicam release por História/ambiente; ausência histórica aparece como ausência.
- **Negativo:** não deduzir implantações antigas de QA legado nem inventar métricas DORA completas. **Depende de:** RA-25 e contratos de métricas detalhados. Instrumentação/auditoria de cada produtor não ficam adiadas para esta entrega.

### RA-28 — Assistente conduz o fluxo operacional entregue

- **Alterar:** propostas de ação, diagnóstico/roteamento, explicações e contexto da História/Release, sem ampliar privilégios genéricos do modelo.
- **Teste do usuário:** pedir liberação de desenvolvimento, preparação QA, diagnóstico de falha e retirada; receber a operação disponível com escopo e confirmação própria, sem sair do portal para operações já suportadas.
- **Negativo:** texto não aprova gate nem executa ação; capacidade inexistente é declarada e encaminhada. **Depende de:** RA-26/27. Ações e mensagens essenciais entram em cada fatia anterior; este item harmoniza a condução integral.

### RA-29 — Adoção do legado, revisão final e fechamento do plano

- **Alterar:** plano explícito de adequação por IDs/versões para Sistemas, Histórias, branches e releases anteriores, compatibilidade de URLs e documentação da cobertura real. Nenhuma migração automática por GET/bootstrap.
- **Teste do usuário:** revisar prévia de adoção, aplicar somente escopo autorizado e conferir registros preservados; testar uma jornada completa e a retirada/retentativa já aceitas nas fatias anteriores.
- **Negativo:** falta de evidência não vira aprovação/conclusão; não mudar código de aplicações/resultados para demonstrar. **Depende de:** RA-28. O teste final é regressão, não o primeiro contato do usuário com as funcionalidades.

## 6. Quadro de acompanhamento e OK

Marcar cada coluna somente com sua evidência. **Disponível** significa acessível para testar, não aprovação de negócio. RA-00 é documental; a marca de entrega produzida abaixo significa documento criado, não código implantado.

| ID | Entrega produzida | Técnica validada | Disponível para teste | OK do usuário | Estado / evidência |
| --- | --- | --- | --- | --- | --- |
| RA-00 | [x] | [x] | [x] | [ ] | Documentação/referências; aguarda revisão do usuário |
| RA-01 | [x] | [x] | [x] | [x] | Revisão aceita para prosseguir: usuário “VAmos adiante”; 46 testes de aplicação e 47 de navegador; tentativas preservadas nas seções 8/9 |
| RA-02 | [x] | [x] | [x] | [ ] | Correção RA-02-C1 publicada: DEV em Releases, compositionStatus independente e Merge Request coerente na base real; 110 testes de aplicação e 66 de navegador; recibo na seção 11; aguarda novo OK |
| RA-02-C2 | [x] | [x] | [x] | [ ] | Trilho DEV independente e QA+ por candidata imutável; 52 testes de aplicação, 8 de auditoria, 77 cenários de navegador e UX; seção 12; aguarda OK |
| RA-03 | [x] | [x] | [x] | [ ] | Fundação de leitura publicada, sem executor de aprovação: 74 testes de aplicação, 8 de auditoria, 65 de navegador e UX; seção 17; aguarda OK |
| RA-04 | [ ] | [ ] | [ ] | [ ] | Parcial: estrutura RA-02-C1, estados/DEV RA-04a e cancelamento RA-04b publicados; fechamento/cópia/promoção continuam nas fatias próprias |
| RA-04a | [x] | [x] | [x] | [ ] | Estados OPEN/CLOSED/CANCELED e DEV inicial publicados; 66 testes de aplicação, 8 de auditoria, 61 cenários de navegador e UX; seção 14; aguarda OK |
| RA-04b | [x] | [x] | [x] | [ ] | Cancelamento auditado com motivo, versão, replay e preservação de composição/Histórias; 52 testes de aplicação, 8 de auditoria, 28 cenários de navegador e UX; seção 16; aguarda OK |
| RA-05 | [ ] | [ ] | [ ] | [ ] | Base RA-05a/05b publicada: composições preservadas e referência sem confundir cadastro. Cenário integrado de cópia pertence às RA-20/21; não declarar cópia implementada |
| RA-06 | [ ] | [ ] | [ ] | [ ] | Parcial: RA-06a/06b publicadas; decisão inicial explícita pode ser registrada no portal. Escolha real, adoção/proveniência e fonte PRD continuam próprias — seção 22 |
| RA-07 | [x] | [x] | [x] | [ ] | Preparação controlada no cenário inicial com decisão válida, confirmação e reconciliação; métricas aprovadas sem metas. Publicada; OK manual pendente — seção 24 |
| RA-08 | [ ] | [ ] | [ ] | [ ] | Parcial: RA-08a/08b publicadas no cenário DEV de branch padrão; destinos adicionais e proveniência continuam próprios |
| RA-08a | [x] | [x] | [x] | [ ] | Destino/base explícitos no Gateway, publicação/qualidade conferidas e DEV sem release obrigatória; seção 25 |
| RA-08b | [x] | [x] | [x] | [ ] | Novo ciclo após integração/testing, barreira entre aprovações e recuperação da liberação corrente; publicada, seção 26 |
| RA-09 | [ ] | [ ] | [ ] | [ ] | Parcial: RA-09a–09f preservam referências, resolução histórica e leitura da entrega por composição; enriquecimento de referência parcial e prova de composição física permanecem nas dependências próprias |
| RA-09a | [x] | [x] | [x] | [ ] | Referência imutável de merge/squash com consulta atual/histórica; seção 27 |
| RA-09b | [x] | [x] | [x] | [ ] | Captura da referência ausente de merge já confirmado, atual/histórico, com confirmação e recuperação; seção 28 |
| RA-09c | [x] | [x] | [x] | [ ] | Confirmação positiva de merge de execução anterior, sem nova integração; seção 29 |
| RA-09d | [x] | [x] | [x] | [ ] | Encerrar acompanhamento local de MR histórico comprovado fechado, com motivo/fonte imutável; seção 30 |
| RA-09e | [x] | [x] | [x] | [ ] | Fechamento remoto histórico durável, motivo/aceite, reconciliação somente leitura e continuidade RA-09d; seção 31 |
| RA-09f | [x] | [x] | [x] | [ ] | Leitura rastreável da execução exata planejada e integração observada; sem composição física/pacote/deploy; seção 32 |
| RA-10 | [ ] | [ ] | [ ] | [ ] | Parcial: consulta RA-10a, proposta/revisão RA-10b e envio ao GitLab RA-10c publicados; integração e prontidão de ferramentas permanecem próprias |
| RA-10a | [x] | [x] | [x] | [ ] | Contrato v1 consultado em commit fixo, estrutura e referências regulares conferidas, sem executar/editar; seção 33 |
| RA-10b | [x] | [x] | [x] | [ ] | Proposta do arquiteto em fila, versões/revisão locais imutáveis, perguntas e recuperação; seção 34 |
| RA-10c | [x] | [x] | [x] | [ ] | Envio do contrato para branch/MR próprios, intent/lease/recorder e recuperação; seção 35 |
| RA-10d | [x] | [x] | [x] | [ ] | Integração controlada e fonte efetiva; resolução local sem apagar intenção; validação GitLab real isolada; recibo na seção 37; sem executor implícito |
| RA-11 | [x] | [x] | [x] | [ ] | Primeiro perfil Node 24/React; fonte fixa, sandbox, intenção e artefato; recibo na seção 38; sem deploy ou aceite do piloto |
| RA-11b | [x] | [x] | [x] | [ ] | Preparação controlada no Sistema, nove arquivos, build/teste/status reais e integração separada; seção 39 |
| RA-11c | [x] | [x] | [x] | [ ] | Ação junto à conversa, painel compartilhado e metadados atuais; recibo na seção 41 |
| RA-12 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-12a | [x] | [x] | [x] | [ ] | Destino DEV controlado, prova imutável e recuperação; seção 42 |
| RA-12b | [x] | [x] | [x] | [ ] | Artefato DEV, URL estável e recuperação; seção 43 |
| RA-12c | [x] | [x] | [x] | [ ] | Assistente reutiliza preparação/publicação DEV; seção 44 |
| RA-13 | [x] | [x] | [x] | [ ] | Testes HTTP versionados DEV, Tarefa e correção com G1; seção 45 |
| RA-14 | [x] | [x] | [x] | [ ] | Publicada; aprovação humana por revisão; OK manual pendente — seção 46 |
| RA-15 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-16 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-17 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-18 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-19 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-20 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-21 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-22 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-23 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-24 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-25 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-26 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-27 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-28 | [ ] | [ ] | [ ] | [ ] | Planejada |
| RA-29 | [ ] | [ ] | [ ] | [ ] | Planejada |

**Entrega corrente para teste do usuário:** RA-11, construção no quadro DEV da História, com executor Node 24/React separado, fonte/contrato fixados e prova de artefato. Indicadores existentes mantidos. **Próximo trabalho do piloto:** preparação técnica controlada da nova aplicação CURSOS pelo portal e primeiro ciclo real de código/contrato; depois RA-12, implantação da versão DEV e decisões de dados/recuperação DE-06. RA-10 tem prontidão demonstrada somente para o perfil inicial; demais runtimes/topologias permanecem próprios. O cadastro do piloto e as evidências isoladas não são build/deploy da aplicação.

## 7. Diário de validação e modelo de recibo

| Data | ID | Registro | Autor/OK |
| --- | --- | --- | --- |
| 27/10/2026 | RA-00 | Contrato atualizado e plano criado; 172 referências locais conferidas, 30 IDs/linhas de acompanhamento consistentes e `git diff --check` aprovado. Nenhuma funcionalidade nova implantada; sem testes de aplicação/deploy neste recorte documental. | Agente: documentação; OK do usuário pendente |
| 27/10/2026 | RA-01 / início | Usuário solicitou “Vamos iniciar a implementação do plano”; autorização registrada para executar a primeira fatia, sem presumir OK manual posterior. | Mensagem do usuário; não encerra parâmetros DE ou valida futuras entregas |
| 27/10/2026, 16:23 | RA-01 / entrega | Leitura compatível de Releases/História publicada; 44 testes de aplicação, 42 cenários de navegador e revisão UX aprovados. Consulta real sem escritas. | Técnica: aprovada pelo agente; OK do usuário pendente |
| 27/10/2026 | RA-01 / reprovação | Usuário apontou histórico fora da aba Auditoria, atalhos apagando Sistema/Projeto/Épico pendentes e ação de atualização incompreensível. Reaberta a mesma RA, com evidência original preservada. | Reprovada pelo usuário; sem avanço a RA-02 |
| 27/10/2026, 16:59 | RA-01 / revisão entregue | Abas e filtros corrigidos, atualização clara com revisão de mudanças; 46 testes de aplicação e 47 de navegador, revisão UX e consulta real sem escritas aprovados. Dados preservados. | Republicada; novo OK do usuário pendente; RA-02 permanece planejada |
| 27/10/2026 | RA-01 / aceite e RA-02 / início | Após a entrega revisada, usuário solicitou “VAmos adiante”. Retorno registrado como aceite para prosseguir; iniciada somente a próxima fatia RA-02. Não representa aceite antecipado de outras entregas/gates. | RA-01 OK; RA-02 em implementação |
| 27/10/2026, 19:36 | RA-02 / entrega | Referências DEV/QA/HML/PRD e recuperação por Sistema publicadas. Migration amplia restrição sem backfill; 89 testes de aplicação e 62 de navegador, conta restrita e UX aprovados. Conferência real somente leitura; 31 tabelas preservadas. | Técnica aprovada; disponível; OK do usuário pendente; RA-03 não iniciada |
| 27/10/2026, 21:31 | RA-02-C1 / correção entregue | Usuário dispensou compatibilidade e autorizou correção da base. Modelo de composição separado de destinos, DEV visível/cadastrado e fase merge_request persistida, com manutenção auditada e evidências reais preservadas. 110 testes de aplicação e 66 de navegador aprovados. | Publicada e conferida na instalação real; novo OK pendente; RA-03 não iniciada |

Para cada entrega, acrescentar um recibo sem apagar tentativas anteriores:

```text
ID / tentativa:
Escopo entregue e limitações:
Decisões DE resolvidas, autor/data e referência:
Arquivos / migration / ações de auditoria:
Fonte/commit/imagem e URL/ambiente de teste, quando aplicável:
Testes técnicos executados e evidências (incluindo falhas/integrações não exercitadas):
Roteiro manual executado pelo usuário:
Resultado: OK / REPROVADO / PENDENTE
Quem confirmou e quando (ou referência à mensagem do usuário):
Pendências / defeitos / próxima tentativa:
Backup / recuperação / reversão e seus limites:
Próxima entrega liberada:
```

Um “OK RA-XX” do usuário pode ser registrado como aceite daquela entrega, na versão/evidência apresentada. Um defeito posterior acrescenta registro e reabre o item afetado; os aceites anteriores não são apagados. Ajustes de escopo e novos subitens atualizam dependências e quadro antes do avanço.

## 8. Recibo RA-01 — leitura separada publicada

**Tentativa anterior:** reprovada pelo usuário por navegação/filtros/clareza. O registro abaixo preserva a evidência histórica; a entrega corrigida e o roteiro corrente estão na seção 9.

**Escopo entregue.** Lista/cards, detalhe de release e associação confirmada na História apresentam composição, candidata/artefatos, ambiente, implantação e validação como dimensões distintas. DRAFT confirma somente composição. QA/HML/PRODUCTION/REJECTED são valores legados registrados: não certificam pacote, ambiente ativo, implantação concluída ou aprovação de testes. O trilho que marcava etapas anteriores com check foi retirado; “Pacote fechado” não é inferido de um valor fora de DRAFT. Filtros/ordenação mantêm `stage` e URLs existentes, com o rótulo “Valor registrado”.

**Contrato compatível.** [Projeção compartilhada](../portal/packages/shared/src/release-reading.ts) produz `situation` adicional na [API de releases](../portal/apps/api/src/releases.ts), inclusive na associação confirmada da História. O valor `stage`, versões, contadores, paginação, corpos de comandos e suas guardas permanecem compatíveis. O [componente de leitura](../portal/apps/web/app/release-situation.tsx) é usado pela [web de releases](../portal/apps/web/app/releases.tsx); associação ainda não salva não substitui a consulta confirmada. Falha de atualização conserva o último resultado identificado e informa que a situação atual não foi confirmada. Contexto de outra História não é apresentado como consulta corrente.

**Limites.** Sem migration, novo comando de negócio, DEV cadastrado, candidata, build, implantação ou teste de aplicação produzida. O enum persistido e os indicadores do dashboard continuam legados, reservados a RA-04/RA-27. “Sem evidência disponível” não afirma que nunca ocorreu uma execução externa; informa o limite das fontes consultadas. Arquivados conservam suas restrições. Aprovar esta RA não aprova gates de software ou os parâmetros de branches/execução.

**Evidência técnica.** [44 testes de aplicação aprovados](assets/ra01-leitura-release-2026-10-27/application-validation.json): 23 de releases, seis da projeção, sete de métricas e oito de catálogo/guardas de auditoria. A API foi exercitada com DRAFT/QA/HML/PRODUCTION/REJECTED, verificando projeções iguais em lista/detalhe/História, ausência de escrita e preservação dos registros. [42 cenários de navegador aprovados](assets/ra01-leitura-release-2026-10-27/validation.json), sem falhas, skips ou flakiness, em `release-reading`, `releases` e `story-workspace`: navegação, filtros/ordem/páginas, associação/transferência, revisões, rascunhos, pedidos incertos, recarga e falha de consulta. Tipos API/web, build de produção e `git diff --check` passaram. Integrações externas não foram exercitadas nesta fatia de consulta. Revisão UX aprovou desktop/390 px; não equivale a validação assistiva integral ou OK humano.

Capturas com fixtures isoladas: [legado desktop](assets/ra01-leitura-release-2026-10-27/ra01-legacy-desktop.png), [legado celular](assets/ra01-leitura-release-2026-10-27/ra01-legacy-mobile.png), [consulta falhou e preservou resultado](assets/ra01-leitura-release-2026-10-27/ra01-legacy-mobile-error.png).

**Publicação em 27/10/2026, 16:23 (America/Sao_Paulo).** API/web `21a2cec5946d`, origem `ae41ba7e1aa526e9aae64b6263021390f9f1bbde3b96faf49c0e21d3205aee33`, saúde `ready/preview`. Backup privado de 167.003 bytes com digest/leitura verificados; imagens/manifesto anteriores disponíveis para reversão. As 31 tabelas mantiveram impressões integrais idênticas durante a publicação; nenhum dado de negócio foi adequado para demonstração. Sem migrations. `PORTAL_PUBLICATION` usou o recorder administrativo externo: 120 registros válidos e nenhuma operação pendente. [Registro seguro](assets/ra01-leitura-release-2026-10-27/publication.json).

A [checagem real somente leitura](assets/ra01-leitura-release-2026-10-27/live-validation.json) conferiu lista e seletor da História em 1440/390 px, zero escritas tentadas, erros de página ou overflow. A instalação está sem releases e a História consultada sem associação; não foram criados exemplos reais. Portanto, as situações de DRAFT/legados foram comprovadas na API e no navegador isolados, não encenadas na instalação humana. Recursos descartáveis de validação foram removidos após recolher a evidência.

**Roteiro para seu teste (OK ainda pendente):**

1. Atualizar o portal e abrir **Releases**. Conferir “Releases por valor registrado”; filtros QA/HML/PRODUCTION são identificados como legados, sem confirmar ambientes implantados. Conferir seleção/URL ao aplicar filtro e limpar.
2. Como Administrador ou Release Manager, criar intencionalmente uma release DRAFT do seu Sistema, se desejar usá-la no planejamento. Este passo é uma ação sua de negócio; a validação técnica não cadastrou uma release por você.
3. Abrir o detalhe e conferir **Situação da entrega**, com os cinco campos. Somente composição deve estar confirmada; candidata/ambiente/implantação/validação não ganham sucesso. Usar **Atualizar consulta** e recarregar.
4. Na História, abrir **Execução → Release planejada**, escolher/salvar a release existente com persona autorizada e consultar a associação confirmada. Conferir as mesmas dimensões e o retorno ao detalhe da release. Trocar abas e recarregar sem perder o vínculo.
5. Conferir em celular/largura reduzida. Para registros legados e falha de consulta sem dados reais correspondentes, revisar as capturas e relatórios isolados acima; não alterar o banco real para criar esse cenário. Uma rodada isolada interativa pode ser preparada separadamente se necessária.
6. Responder **OK RA-01** ou **Reprovado RA-01: motivo**, indicando o passo e comportamento observado. O quadro/diário serão atualizados com sua manifestação; a RA-02 permanece aguardando esse retorno.


## 9. Revisão RA-01 — navegação, filtros e atualização

**Retorno posterior:** usuário solicitou “VAmos adiante” após esta entrega; aceite para prosseguir registrado no quadro/diário. O recibo abaixo conserva a situação daquela publicação. RA-02 passa a ser o recorte corrente.

**Motivo da reabertura:** a primeira tentativa não seguiu a navegação do portal e perdeu campos de filtro ainda não aplicados ao mudar um atalho. A aprovação técnica anterior não substituiu o teste do usuário. A correção permanece na RA-01; RA-02 não foi iniciada.

**Correções publicadas:** abas Composição/Auditoria com `context-tabs`; auditoria consultada somente na aba própria; edição permanece montada durante a consulta. URLs `picker.*` e `history.*` independentes, com compatibilidade para bookmarks antigos de auditoria. Atalhos alteram apenas o recorte/página e preservam escopo aplicado, campos pendentes e seleção fora da página. O recorte aplicado e o aviso “Filtros alterados. Use Aplicar filtros.” continuam distintos. A lista de releases também preserva Sistema e busca pendentes ao alternar o valor registrado.

**Atualizar lista:** consulta os dados atuais sem salvar, apagar escolhas ou aplicar filtros pendentes. Alteração de composição, revisão ou associação exige abrir “Revisar alterações” e aceitar “Continuar com dados atualizados” antes de salvar separadamente. Histórias indisponíveis são identificadas; nenhuma escolha é removida silenciosamente. A consulta de IDs selecionados é limitada a 50 por requisição e percorre todos os lotes selecionados, sem limitar a revisão à página visível. Composição inalterada é comparada com a mesma ordenação em ambos os lados para não gerar nova versão/evento por ordem de IDs.

**Evidência técnica:** [46 testes de aplicação aprovados](assets/ra01-revisao-ux-2026-10-27/application-validation.json): 25 de releases, seis de projeção, sete de métricas de release e oito de catálogo/guardas. Incluem escopo exato por IDs, ausências, consulta sem efeitos, validação de limites, composição inalterada, conflitos, rollback e replay. [47 cenários de navegador aprovados](assets/ra01-revisao-ux-2026-10-27/validation.json), sem skips/falhas/flakiness: abas, URLs/bookmarks antigos, teclado, voltar/avançar, filtros aplicados/pendentes, escopo, seleção entre páginas, atualização com falha, revisão fora do filtro, escolhas indisponíveis, salvamento e pedidos incertos. Tipos API/web, build de produção e diferenças passaram. A rodada final repetiu o conjunto após concluir o texto da comparação de revisões e associações. Integrações externas não foram exercitadas nesta correção de consulta.

[Revisão UX do recorte](assets/ra01-revisao-ux-2026-10-27/ux-review.json) aprovada; não equivale a aceite manual ou teste assistivo integral. Capturas isoladas: [filtros/escopo no desktop](assets/ra01-revisao-ux-2026-10-27/release-picker-scope-desktop.png), [celular](assets/ra01-revisao-ux-2026-10-27/release-picker-scope-mobile.png), [Auditoria](assets/ra01-revisao-ux-2026-10-27/release-audit-desktop.png), [Auditoria no celular](assets/ra01-revisao-ux-2026-10-27/release-audit-mobile.png) e [revisão de alterações](assets/ra01-revisao-ux-2026-10-27/release-refresh-review-desktop.png).

**Publicação em 27/10/2026, 16:59 (America/Sao_Paulo):** API/web `c130a99f0961`, origem `05539ae4f3a5001a7b9c08959d9964027720f2dd7c8486f4d25de05870d97495`, saúde ready/preview. Backup privado de 167.826 bytes, digest/leitura verificados e referências para reversão preservadas. As 31 tabelas mantiveram impressões integrais idênticas; sem migrations ou novos comandos de negócio. Trilha administrativa externa `PORTAL_PUBLICATION`: 126 registros válidos, nenhuma operação pendente. [Recibo seguro](assets/ra01-revisao-ux-2026-10-27/publication.json).

**Conferência real:** a [validação somente leitura](assets/ra01-revisao-ux-2026-10-27/live-validation.json) usou a release existente **Release 1 - Outubro**, sem criar fixtures ou salvar composição. Confirmou Auditoria separada, filtros aplicados/pendentes preservados nos atalhos e na troca de abas, desktop/390 px sem overflow, zero escritas tentadas e zero erros de página. Versão e IDs da composição permaneceram iguais. As condições concorrentes e de indisponibilidade foram verificadas no ambiente isolado; não foram provocadas na instalação real. Contêineres/banco descartáveis de validação removidos após recolher a evidência.

**Roteiro corrente para seu teste:**

1. Atualizar o portal em http://localhost:3310 e abrir **Releases → Release 1 - Outubro**. Conferir **Composição**; o histórico aparece somente ao abrir **Auditoria**. Voltar à composição.
2. Abrir **Escolher Histórias** e os filtros. Escolher Projeto e Épico; alternar **Prontas e sem release**, **Sem release**, **Pendentes** e **Todas**. Os campos continuam preenchidos. Enquanto pendentes, o aviso pede **Aplicar filtros** e o resumo continua mostrando o recorte já aplicado.
3. Usar **Aplicar filtros**; alternar os atalhos novamente e conferir Projeto/Épico no resumo e na URL. Seleções fora do recorte/página continuam contadas. Na lista de releases, trocar o valor registrado também preserva Sistema/busca ainda em edição.
4. Marcar uma História, deixar um campo de filtro em edição, abrir **Auditoria** e voltar à **Composição**. Escolhas, filtro pendente e versão-base são preservados; trocar de aba não salva.
5. Usar **Atualizar lista**. A consulta mantém escolhas e filtros. Havendo mudanças concorrentes, **Revisar alterações** mostra o que mudou; **Continuar com dados atualizados** mantém as escolhas para revisão, sem salvar. **Salvar composição** fica bloqueado até essa decisão. Para a situação concorrente sem intervenção nos dados reais, consultar a captura/ensaio isolado acima.
6. **Salvar composição** confirma as escolhas; **Cancelar** descarta a edição. Conferir Auditoria para o registro do salvamento e testar também em largura reduzida.
7. Registrar **OK RA-01** ou **Reprovado RA-01: motivo**. A tentativa anterior continua preservada; RA-02 só será iniciada após o OK desta entrega, conforme a cadência definida.


## 10. Recibo RA-02 — referências de ambiente

**Escopo implementado:** cadastro novo do Sistema/repositório inclui DEV/QA/HML/PRD. Migração apenas amplia a restrição de códigos; Sistemas existentes permanecem preservados. A aba Ambientes consulta todas as referências do repositório único e permite completar somente os códigos ausentes explicitamente revisados. A confirmação lista códigos e repositório, mantém registros existentes e não amplia a lista autorizada.

**API/domínio:** consulta sem efeitos em `/api/systems/:id/environments`, recuperação em `/api/systems/:id/environment-references`; roles de planejamento existentes, Sistema ativo, identidade/revisões do Sistema e repositório, idempotência, autoria, correlação e antes/depois seguro. Ação `ENVIRONMENT_REFERENCES_REGISTERED` separada de provisionamento GitLab; NO_CHANGE não duplica referências nem inventa implantação. Sem alteração de status de História, release, versão/digest/URL já registrados, aprovação ou execução de aplicação. A conta restrita foi exercitada.

**Experiência:** aba existente, quatro destinos em ordem, ausência/cadastro/registro legado separados; atualização com carregamento/falha e última consulta preservada; confirmação por teclado, cancelamento com foco, invalidação por mudança de contexto/persona e replay de resposta perdida. Rolagem das abas mantém a aba ativa visível em celular e no redimensionamento.

**Validação técnica:** [89 testes de aplicação aprovados](assets/ra02-referencias-ambientes-2026-10-27/application-validation.json): ambientes (10), fundação/hierarquia (25), repositório único (7), releases (25), métricas de release (7), auditoria HTTP/banco/catálogo/guardas (15). Incluem criação atômica/replay, recuperação só de DEV, preservação das referências/metadata existentes e de outro Sistema, conjunto autorizado sem expansão, versões/escopo/permissão, inatividade/acervo, concorrência, NO_CHANGE, falha de auditoria com rollback e retentativa e execução com `sdlc_portal_app`. A migration foi aplicada em fixture com registros legados, sem backfill, aceitando DEV e recusando código não contratado.

[62 cenários de navegador aprovados](assets/ra02-referencias-ambientes-2026-10-27/validation.json), sem falhas/skips/flakiness, em `system-environments`, `hierarchy`, `releases`, `audit-history`, `release-reading`, `story-workspace` e `experience-standards`. Cobrem consulta sem escrita, confirmação/cancelamento e foco de teclado, manutenção de URL/versão legadas, persona/revisão alteradas, resposta perdida com recarga/replay, erro de consulta, cadastro concorrente já concluído, aba ativa visível e desktop/390 px. A expectativa antiga de ausência do ciclo na História foi alinhada à fase já visível entregue anteriormente; esta RA não altera o ciclo da História. Tipos API/web, build de produção e diferenças passaram. Sem integração externa de aplicação/deploy nesta rodada.

[Revisão UX aprovada](assets/ra02-referencias-ambientes-2026-10-27/ux-review.json), sem substituir aceite do usuário ou teste assistivo integral. Capturas isoladas: [cadastro completo](assets/ra02-referencias-ambientes-2026-10-27/environments-new-desktop.png), [celular](assets/ra02-referencias-ambientes-2026-10-27/environments-new-mobile.png), [recuperação de DEV](assets/ra02-referencias-ambientes-2026-10-27/environments-recovery-desktop.png), [confirmação no celular](assets/ra02-referencias-ambientes-2026-10-27/environments-recovery-mobile.png) e [falha de consulta](assets/ra02-referencias-ambientes-2026-10-27/environments-query-error.png).

**Publicação em 27/10/2026, 19:36 (America/Sao_Paulo):** API/web `af2e9cd1d59a`, origem `f4f676a3a2a31a82d270e0fb902ef129bf6cf2e8c64088eb0d45fffff810e19d`, saúde ready/preview. Aplicada somente `202610270003_environment_dev`; sem backfill ou alteração de linhas de negócio. As 31 tabelas de negócio mantiveram impressões integrais idênticas. Backup privado de 169.608 bytes, com digest/leitura verificados; imagens/manifesto anteriores preservados para reversão. A restrição ampliada é compatível com a imagem anterior e não exige apagar DEV para revertê-la. Proteções reais conferidas: INSERT de Environment permitido ao runtime; UPDATE/DELETE/TRUNCATE da auditoria negados. Ledger externo `PORTAL_PUBLICATION`: 130 registros válidos e nenhuma operação pendente. [Recibo seguro](assets/ra02-referencias-ambientes-2026-10-27/publication.json).

**Conferência na instalação real:** [somente leitura e prévia cancelada](assets/ra02-referencias-ambientes-2026-10-27/live-validation.json) no Sistema existente, com QA/HML/PRD preservados e DEV ausente. Em desktop/390 px, os quatro destinos e a aba ativa ficaram visíveis; a prévia listou somente DEV e foi cancelada. Zero fixtures, tentativas de escrita, erros de página ou overflow. Nenhuma referência foi cadastrada para demonstração. [Consulta real](assets/ra02-referencias-ambientes-2026-10-27/live-environments-1440.png), [prévia no celular](assets/ra02-referencias-ambientes-2026-10-27/live-environments-review-390.png). Recursos/banco descartáveis removidos após recolher a evidência.

**Roteiro para seu teste:**

1. Atualizar http://localhost:3310 e abrir **Sistemas → Gestão de Video Locadora → Ambientes**. Conferir DEV como referência não cadastrada e QA/HML/PRD existentes, com cadastro separado de implantação.
2. Como Administrador, Product Owner ou Arquiteto, usar **Cadastrar referências ausentes**. A confirmação deve listar somente **DEV**, o repositório e a ausência de infraestrutura/deploy. **Voltar** cancela sem cadastrar.
3. Abrir novamente e usar **Confirmar cadastro**. Conferir os quatro destinos e a mensagem de cadastro, sem sucesso de implantação. Atualizar/recarregar não duplica referências.
4. Abrir **Auditoria** e conferir a ocorrência de cadastro com autoria e alteração de códigos. Consultar/atualizar a aba não cria novas ocorrências de cadastro. Na condição sem alteração, uma nova operação explícita retorna NO_CHANGE; o replay da mesma solicitação conserva o resultado original.
5. Conferir em celular, inclusive por link direto, com a aba Ambientes à vista. Sem persona habilitada, em Sistema inativo ou com consulta falhando, o impedimento é explicado. Cenários de falha/concorrência foram exercitados em isolamento; consultar a evidência acima.
6. Em um próximo cadastro de Sistema feito por você, conferir as quatro referências desde a criação. O ensaio técnico já validou essa situação no banco isolado e não criou um Sistema por você.
7. Registrar **OK RA-02** ou **Reprovado RA-02: motivo**. RA-03 permanece planejada até o seu retorno.



## 11. Correção RA-02-C1 — Releases e fase da História

**Pedido e diagnóstico:** DEV havia sido incluído somente no cadastro de ambientes. Releases continuava consumindo ReleaseStage com destinos e compatibilidade legada. O cabeçalho da História substituía visualmente Security Scan por Merge Request sem persistir a fase, enquanto a lista lia Item.status. Usuário dispensou compatibilidade e autorizou correção da base do laboratório.

**Implementação:** ReleaseStage/Release.stage removidos; Release.compositionStatus usa DRAFT/FROZEN/CANCELLED. Lista, seleção, vínculos, métricas e restrições de composição usam o contrato novo. Os ambientes DEV/QA/HML/PRD são um quadro separado do Sistema, com consulta própria e sem agregado fictício na visão global. DEV é destino previsto de desenvolvimento; cadastro não comprova infraestrutura ou implantação. FROZEN não comprova candidata construída; CANCELLED não cancela Histórias ou remove implantação.

A fase merge_request é persistida quando os gates vigentes da revisão permitem a integração ou quando seu merge está confirmado. Qualidade, solicitação/reconciliação de merge e manutenção explícita usam o mesmo produtor, com execução e versão da História sincronizadas. Cabeçalho, lista, filtro e ordenação usam o estado gravado; o override visual foi retirado. Não basta um MR existir, não há conclusão no merge nem início fictício de testes. A ação STORY_MERGE_PHASE_ENTERED é um fato local com antes/depois, autoria e correlação.

**Validação:** 110 testes de aplicação e 66 de navegador aprovados, incluindo gates, retentativa, rollback de auditoria, lista/filtro/ordem/detalhe coerentes, ambientes em Releases e regressões de rascunho/abas. Migração/reversão ensaiadas em schema isolado, conservando linhas e recusando downgrade de composição congelada. Publicação e reconciliação concluídas; aceite manual pendente.


**Evidências da correção:** [110 testes de aplicação](assets/correcao-releases-fase-2026-10-27/application-validation.json), [66 cenários de navegador](assets/correcao-releases-fase-2026-10-27/validation.json), [ensaio de migration/rollback](assets/correcao-releases-fase-2026-10-27/migration-validation.json), [entrada executável da manutenção](assets/correcao-releases-fase-2026-10-27/command-entry-validation.json) e [parecer UX](assets/correcao-releases-fase-2026-10-27/ux-review.json). Tipos API/web, build e diferenças passaram. A entrada administrativa foi ajustada para resolver dependências no pacote API e exercitada antes de concluir a manutenção. Integrações de build/deploy de aplicações não foram executadas.

**Publicação em 27/10/2026, 21:31 (America/Sao_Paulo):** API/web `41d7d081714b`, origem `3714a75cd4fe2536dece69d672d83717bef5ad445b992e36619e4694a1f957a9`, saúde ready/preview. Aplicada `202610270004_release_composition_story_phase`; as 31 tabelas foram preservadas durante as publicações, comparando Release.stage com o campo renomeado compositionStatus. Backup anterior à alteração de modelo e backup anterior ao ajuste do comando, privados, com digest/leitura verificados. A reversão de schema/imagem foi ensaiada e recusa composições já congeladas. [Recibo seguro](assets/correcao-releases-fase-2026-10-27/publication.json).

**Correção efetiva da base autorizada:** [plano/resultado da reconciliação](assets/correcao-releases-fase-2026-10-27/data-reconciliation.json). A História **Formulário de Criação e Edição de Filmes** passou de security_scan, versão 17, para merge_request, versão 18, com storyVersion da execução sincronizada. Fonte: merge já confirmado no mesmo commit. O Sistema **Gestão de Video Locadora** recebeu somente a referência DEV ausente; QA/HML/PRD e o repositório foram mantidos. Hashes confirmaram preservação do conteúdo da História, snapshot/código/resultados da execução, verificações de qualidade e operação de merge. Não foi necessário inventar resultados sintéticos nem modificar aplicação produzida pelo SDLC.

O ledger externo registra `PORTAL_DOMAIN_RECONCILIATION`, incluindo tentativas sem confirmação anteriores à correção do transporte/entrada do comando e a conclusão posterior; 146 registros válidos, nenhuma operação pendente. Os fatos de fase/cadastro usam o recorder compartilhado na base. A publicação e a manutenção são operações distintas; não se afirma transação única envolvendo ambas ou as duas correções de dados.

**Conferência real concluída:** [consultas e capturas sem novas escritas](assets/correcao-releases-fase-2026-10-27/live-validation.json), em 1440/390 px: DEV/QA/HML/PRD visíveis em Releases, sem rótulos legados; filtro/lista/detalhe concordam em MERGE REQUEST; merge continua confirmado, História não concluída, sem overflow/erros de página. [Releases desktop](assets/correcao-releases-fase-2026-10-27/live-releases-1440.png), [celular](assets/correcao-releases-fase-2026-10-27/live-releases-390.png), [lista da História](assets/correcao-releases-fase-2026-10-27/live-story-list-1440.png), [detalhe da História](assets/correcao-releases-fase-2026-10-27/live-story-phase-1440.png). Ambiente descartável removido após recolher evidências.

**Roteiro corrente:**

1. Atualizar o portal e abrir **Releases**. Conferir os destinos DEV/QA/HML/PRD no quadro de ambientes e a composição em quadro separado, sem “Legado”.
2. Selecionar **Gestão de Video Locadora** nos filtros e aplicar. Conferir quatro referências cadastradas, inclusive DEV, e o acesso à consulta no Sistema. Destino previsto/cadastro não certifica implantação.
3. Abrir a lista de Histórias do Épico e localizar **Formulário de Criação e Edição de Filmes**. A coluna de status mostra **MERGE REQUEST**. Filtrar por esse status e ordenar preserva o resultado.
4. Abrir a mesma História: o cabeçalho/trilho confirma **MERGE REQUEST** e o código integrado mantém seus resultados. Não aparece conclusão da História ou implantação criada pela correção.
5. Conferir desktop/celular, composição/seleção e Auditoria. Registrar **OK RA-02-C1** ou o problema encontrado. A RA-03 e o restante funcional de RA-04 continuam separados no plano.

## 12. Ajuste RA-02-C2 — Trilho de entrega da História

**Situação:** implementada, validada e publicada para teste; OK do usuário pendente. Escopo autorizado: ajustar o trilho considerando publicação independente da História em DEV e candidata imutável obrigatória a partir de QA.

- [x] Contrato atualizado: release opcional até Desenvolvimento Finalizado; obrigatória na entrada em QA, com todas as Histórias aprovadas.
- [x] Trilho preserva atividades até Merge Request e apresenta DEV / QA / HML / PROD em Histórias e Tarefas.
- [x] Consulta de destino separada da etapa atual, com URL `tab=planning&process=environment&environment=DEV|QA|HML|PRD`; PROD é rótulo de PRD.
- [x] Pré-requisitos por destino e associação consultada na API; seleção ainda não salva não vira associação confirmada.
- [x] Verificação técnica consolidada e revisão UX: 52 testes de aplicação, 8 de auditoria e 77 cenários únicos de navegador aprovados.
- [x] Publicação API/web e conferência somente leitura da História de Filmes e suas Tarefas em 1440/390 px. Sem migrations, escritas de validação ou alteração das 31 tabelas.
- [ ] OK do usuário no portal.

**Teste do usuário:** abrir a História na aba Tarefas e conferir o trilho; consultar DEV e verificar release opcional e publicação pendente. Consultar QA: exigir release, Desenvolvimento Finalizado de todas as Histórias e pacote imutável. Abrir o seletor existente por “Escolher release” e retornar à consulta de QA. Trocar abas e recarregar; consultar uma Tarefa e sua tentativa anterior, mantendo status próprio e fase atual da História. A consulta não executa deploy, não marca etapa concluída e não altera a composição.

**Limites:** esta fatia entrega navegação e projeção de leitura. Não implementa publicação DEV, aprovação de desenvolvimento, candidata, build/deploy ou promoção. RA-03 continua pendente; RA-06–09 foram ajustadas para não exigir release antes do desenvolvimento. RA-11–14 atendem a História/revisão independente de release; RA-15–18 atendem à composição e candidata QA. Nenhuma branch, aplicação produzida, conteúdo de negócio ou resultado de agente precisa ser alterado nesta entrega.

**Evidências:** [artefatos de validação](assets/trilho-entrega-historia-2026-10-27/). [Testes de aplicação](assets/trilho-entrega-historia-2026-10-27/application-validation.json), [navegador consolidado](assets/trilho-entrega-historia-2026-10-27/browser-validation.json), [UX](assets/trilho-entrega-historia-2026-10-27/ux-review.md), [publicação](assets/trilho-entrega-historia-2026-10-27/publication.json) e [conferência real](assets/trilho-entrega-historia-2026-10-27/live-validation.json).


**Recibo publicado:** imagem `sha256:7704f696ce754100c098ad0693720c2c9f31698c981d1aab7134db3424ac1697`, fonte `822b7b27f7b0423fe3378ca624511abc78b96a85377d6f216e2d47dcb06567ff`; saúde ready/preview. Backup privado verificado e reversão preservada pelo publicador compartilhado. As 31 tabelas permaneceram idênticas antes/depois da publicação e após a conferência somente leitura; sem migrations. Auditoria administrativa externa íntegra e sem operações pendentes. A História “Formulário de Criação e Edição de Filmes” segue em Merge Request, versão 18, com suas seis Tarefas e associação confirmada à REL-1; DEV é próximo destino, sem implantação comprovada. Nenhuma aplicação produzida ou resultado de agente foi modificado para a demonstração.

**Validação técnica:** builds API/Next aprovados. 52 testes de aplicação (contrato de entrega, jornada/associação, leitura/composição de release), 8 de auditoria e 77 cenários únicos de navegador aprovados. O segundo lote substitui os 35 cenários iniciais de workspace por 36 finais; não somar retentativas como cenários novos. Casos incluem merge de revisão antiga, consulta sem release, QA com pré-requisitos, histórico de Tarefa, foco por teclado, escolha pendente preservada entre abas, retorno e ausência de overflow em desktop/390 px. Os dados sintéticos ficaram em `portal_test`; a verificação real bloqueou toda escrita HTTP. Não houve execução real de deploy DEV/QA/HML/PROD ou validação assistiva integral.

## 13. Definição posterior — OPEN, CLOSED, CANCELED e cópia em DEV

**Situação atual:** estados/DEV inicial publicados pela RA-04a e cancelamento auditado publicado pela RA-04b; as outras fatias abaixo permanecem planejadas. Esta seção nasceu como definição documental; seu recibo funcional está na seção 14. Os recibos RA-01/02/C1/C2 permanecem preservados; teste automático não equivale a OK do usuário.

**Regras fixadas:** criação OPEN no fluxo DEV; edição somente de composição OPEN; fechamento para CLOSED sem reabertura; CLOSED promove para QA/HML/PRD com gates; cancelamento em qualquer ambiente gera CANCELED; alteração de conteúdo fechado exige outra release OPEN em DEV por cópia. DEV individual da História continua sem release obrigatória. Fonte/pacote/implantações da origem permanecem preservados. Conteúdo diferente não gera outra candidata sob a mesma identidade fechada.

**Precisões operacionais:** DEV inicial não atesta deploy. CLOSED não atesta build/teste/deploy. CANCELED bloqueia novas promoções e não desfaz instalação nem conclusão histórica em PRD; efeito externo em curso precisa de reconciliação. Copiar não cancela automaticamente a origem, não reaproveita aceites da release e não reabre Histórias já concluídas. O gate de todas as Histórias com Desenvolvimento Finalizado continua obrigatório para QA. Exigi-lo também no fechamento, e permitir ou não fechar composição vazia, são recomendações a resolver em DE-08 antes de RA-16a.

### Impactos concretos no existente

| Área | Alteração necessária |
| --- | --- |
| Prisma/migrations e guardas SQL de composição | ReleaseCompositionState DRAFT/FROZEN/CANCELLED → OPEN/CLOSED/CANCELED; default OPEN, posição inicial DEV sem evidência de deploy, fechamento terminal para edição e autoria/revisão de fechamento/cancelamento. Rever privilégios runtime; não alterar payloads históricos de auditoria. |
| ReleaseStory, associação e transferência | Hoje storyId é chave única e uma transferência remove o vínculo anterior. Separar planejamento ativo de participação/revisões preservadas, para origem/cópia conterem a mesma História sem duplicar o item ou alterar pacote fechado. Código da História em produção e sua conclusão anterior não são reabertos por cópia. |
| API de releases, coleções, readiness e gates | Defaults, filtros, contagens, validações e comandos por estado; edição somente OPEN, promoção somente CLOSED não cancelada e com evidências válidas. Fechar/cancelar/copiar com versão otimista, permissão, idempotência e reconciliação. |
| Leitura compartilhada e telas de Releases/História | release-reading, story-delivery, seletor de associação e detalhes de destino devem usar os novos estados. Preservar filtros/URL/rascunhos/seleção/Auditoria; origem/cópia e revisões visíveis. Posição DEV não pode aparecer como implantação concluída. Revisão UX em cada fatia de tela. |
| Fechamento, candidata, build e executores | Fixar fonte/composição no fechamento; construir e selar pacote ao preparar QA. Retentar mesmas entradas sem reabrir. Conteúdo alterado exige outra release. Cancelamento precisa disputar autorização com promoção e preservar resultado de operação já enviada. |
| GitLab e prova de composição | Cópia não é duplicação cega de branch/HEAD ou retirada de código por desmarcação. Identificar base vigente, commits/revisões incluídos e dependências; alterações revisáveis sem reescrever origem. Sem exigir release no desenvolvimento individual em DEV. |
| Assistente, agentes e workers | Orientar para operações realmente entregues: editar OPEN, fechar, cancelar e gerar cópia; não sugerir reabertura ou RC2 de conteúdo diferente na mesma release. Propostas não concedem permissão nem iniciam deploy sem comando/gates. |
| Auditoria e métricas | Cada comando futuro deve ter catálogo/recorder/autoria/correlação e antes/depois próprios. Cópia conta como nova release e mantém proveniência. Cancelamento não apaga implantação nem reduz artificialmente fatos históricos de produção. Sem migração de eventos legados. |

### Fatias de implementação e teste

Conservar os IDs do plano; subdividir as entregas afetadas em vez de construir todo o ciclo de uma vez. A primeira fatia possível é RA-04a; as demais obedecem às dependências de revisão/gates/executor, sem antecipar aceite humano ou funcionalidades inexistentes.

| Fatia | Escopo observável | Teste pequeno do usuário | Dependência | Implementada / validada / disponível / OK |
| --- | --- | --- | --- | --- |
| RA-04a | Novos estados/defaults e DEV inicial na leitura; migration e adaptação dos consumidores existentes | Criar OPEN em DEV, editar e filtrar; confirmar ausência de deploy atestado e preservação de abas/filtros | RA-01 e referência de ambiente existente | [x] / [x] / [x] / [ ] — recibo na seção 14 |
| RA-04b | Cancelar OPEN/CLOSED de forma auditada, sem reabrir ou perder composição/histórico | Cancelar, consultar motivo e tentar editar/promover; repetir resposta perdida sem nova decisão | RA-04a; integrar reconciliação à medida que executores forem entregues | [x] / [x] / [x] / [ ] — recibo na seção 16 |
| RA-05a | Participação/revisões históricas separadas de associação ativa | Consultar referências da mesma História em composições diferentes sem apagar a revisão de origem | RA-03/04a | [x] / [x] / [x] / [ ] — seção 19 |
| RA-05b | Vigência por conteúdo/código separada da versão administrativa | Mudança apenas de fase não invalida referência pertinente; alteração real exige revisão explícita, sem alterar o registro anterior | RA-05a | [x] / [x] / [x] / [ ] — seção 20 |
| RA-16a | Fechar OPEN → CLOSED com composição/revisões fixas e sem reabertura | Fechar revisão válida, conferir manifesto e bloquear edição/reabertura; alteração posterior encaminha para cópia | RA-05/15; DE-05/08 | [ ] / [ ] / [ ] / [ ] |
| RA-16b/17/18 | Preparar pacote fechado, construir/verificar e implantar em QA, cada RA em liberação própria | Observar separadamente fechamento, build e implantação; falha mantém CLOSED e permite retentar as mesmas entradas | RA-16a e executores/gates do plano | [ ] / [ ] / [ ] / [ ] |
| RA-20/21 | Prévia e criação de cópia OPEN em DEV com outra identidade, em liberações separadas | Copiar origem CLOSED de QA/HML/PRD, editar só a cópia e conferir origem intacta; replay retorna a mesma cópia | RA-05a/16a/19 e análise de composição | [ ] / [ ] / [ ] / [ ] |
| RA-22 | Percorrer o novo ciclo da cópia sem aceites herdados | Revalidar DEV, fechar e implantar o novo pacote em QA; comparar identidades e evidências | RA-14–21 | [ ] / [ ] / [ ] / [ ] |

**Negativos técnicos por fatia mutável:** papel sem autorização, referência/versão desatualizada, corrida fechar/editar/cancelar/promover/copiar, replay e perda de resposta, falha do recorder com rollback e permissões da conta restrita. Testes isolados devem cobrir cancelamento após publicação preservando implantação/Histórias e operação externa em curso cujo efeito ainda precisa ser confirmado. Dados simulados permanecem em testes isolados; não alterar uma aplicação produzida ou resultado de agente para demonstrar o portal.

**Validação desta rodada documental:** conferir consistência RF-06/13/15–18, remoção da sucessão de conteúdo na mesma release dos passos correntes, dependências das novas fatias e links locais. Não há evidência funcional nova, execução de História, mudança de dados ou publicação nesta rodada.


## 14. Recibo RA-04a — Estados da release e DEV inicial

**Situação:** implementada, validada e publicada para teste. OK do usuário pendente. A autorização “Vamos adiante” foi aplicada à primeira fatia pequena da seção 13, sem antecipar os demais comandos.

- [x] Persistência e default OPEN, com flowEnvironment DEV na criação. Valores anteriores renomeados para OPEN/CLOSED/CANCELED, sem mudar identidade, versão, composição, conteúdo ou resultados.
- [x] API/filtros/contagens/ordenação, cards/detalhe, seletor na História, detalhes de destino e métricas com nomenclatura coerente.
- [x] Estado da release e Ambiente do fluxo separados de candidata, implantação e validação. Valores históricos de ambiente ausentes permanecem desconhecidos para composições fechadas/canceladas migradas.
- [x] Guardas SQL impedem editar composição fechada, reabrir CLOSED/CANCELED, retornar CANCELED a CLOSED e mudar ambiente sem executor.
- [x] Criação usa RELEASE_CREATED existente: SUCCEEDED/COMPLETED, antes nulo, OPEN/DEV posteriores, iniciador/executor e correlação; campo de fluxo com projeção segura e rótulo português. Rollback por falha de auditoria e replay da mesma chave verificados.
- [x] Builds API/Next, 66 testes de aplicação, 8 de auditoria, 61 cenários únicos de navegador, revisão UX desktop/390 px e ensaio de migration/rollback/papel runtime aprovados.
- [x] Publicação e conferência real somente leitura, com zero escritas/erros/overflow e valores de auditoria anteriores preservados.
- [ ] OK do usuário no portal.

**Roteiro para testar:**

1. Atualizar Releases e conferir OPEN · Aberta, CLOSED · Fechada e CANCELED · Cancelada, mantendo a escolha de Sistema/busca ao usar atalhos e abas.
2. Selecionar Administrador ou Release Manager e criar uma release com Sistema/nome. Conferir OPEN e Ambiente do fluxo DEV, sem pacote, implantação ou teste atestado. A composição pode começar vazia.
3. Editar a composição com os controles existentes, consultar Auditoria e voltar. Conferir seleção/rascunhos preservados e o registro da criação com OPEN/DEV, autoria e correlação.
4. Abrir a História associada e consultar a release. Conferir a mesma situação; DEV da História continua independente da associação.
5. Consultar métricas, filtros CLOSED/CANCELED e registros históricos. Contagem zero é válida; eventos antigos que registraram DRAFT não são reescritos como OPEN.
6. Registrar OK RA-04a ou o problema encontrado. A próxima fatia independente é RA-04b, cancelamento; fechamento e cópia seguem suas dependências no plano.

**Alcance e limites:** esta entrega não disponibiliza fechar/cancelar/copiar/promover nem cria pacote ou executor de ambiente. A ausência dessas capacidades tem explicação visível. Testes com estados fechados/cancelados e falhas usam fixtures isoladas. Nenhuma aplicação produzida ou resultado de agente foi alterado para demonstração. Valores desconhecidos e falhas de consulta não viram OPEN/DEV ou sucesso de implantação.

**Publicação:** imagem `sha256:dc3c67e96509d30eeb1bb9f914d678205cc3ee025efe1d5c1c9e734b6c9040e4`, fonte `b111345658a5dcf4719e14881bc8a0c28e9edb53b871eb6a17da3e4aa7afbb9e`; migration `202610270005_release_open_closed_canceled`. Backup privado verificado e reversão ensaiada. As 31 tabelas de negócio foram conferidas: 30 integralmente inalteradas; em Release, somente a renomeação dos estados e o novo metadado de fluxo previsto pela migration. Identidade/versão/composição e todas as linhas normalizadas foram preservadas. Auditoria administrativa externa íntegra e sem operações pendentes.

**Conferência real:** REL-1 manteve versão 2 e sua História associada, agora OPEN/DEV. A História “Formulário de Criação e Edição de Filmes” segue merge_request, versão 18, com seis Tarefas. Auditoria anterior com DRAFT preservada. Fixtures e banco descartável ficaram isolados da instalação publicada.

**Evidências:** [aplicação](assets/ra04a-estados-release-2026-10-27/application-validation.json), [navegador consolidado](assets/ra04a-estados-release-2026-10-27/browser-validation.json), [migration/rollback](assets/ra04a-estados-release-2026-10-27/migration-validation.json), [UX](assets/ra04a-estados-release-2026-10-27/ux-review.md), [publicação](assets/ra04a-estados-release-2026-10-27/publication.json) e [leitura real](assets/ra04a-estados-release-2026-10-27/live-validation.json). O lote final de seis verificações substitui as versões anteriores dos mesmos cenários e não aumenta a contagem única. Sem teste assistivo integral ou execução real de deploy.

**Ajuste visual posterior à RA-04a:** quadro geral “O planejamento é persistido…” removido por solicitação do usuário. Build aprovado, seis consultas de navegador em desktop/celular sem quadro, erro ou overflow; validação somente leitura. Publicação sem migration, com as 31 tabelas integralmente preservadas. A mudança não avança os comandos de RA-04b/RA-16a/RA-21. [Verificação](assets/ra04a-estados-release-2026-10-27/release-notice-validation.json) e [publicação](assets/ra04a-estados-release-2026-10-27/release-notice-publication.json).


## 15. Releases — quadros finais e totalizadores por ambiente

**Situação:** ajuste solicitado, implementado, validado e publicado; OK do usuário pendente. Não avança RA-04b ou os executores futuros.

- Coleção/paginação ficam antes de Estado da release e Ambientes do Sistema. Retorno à lista por teclado, sem limpar filtros/campos pendentes.
- Totalizadores DEV/QA/HML/PRD usam Release.flowEnvironment e toda a coleção do recorte aplicado, incluindo estado. Destino nulo/desconhecido aparece em Sem ambiente registrado; soma reconcilia com total da consulta.
- Facetas de estado preservam Sistema/busca antes do filtro de estado, com explicação. CANCELED conta no último ambiente registrado, sem ser evidência de implantação.
- Falhas e loading não viram zero. Cadastro do ambiente e contagem têm confirmação/erro independentes.

**Validação:** builds API/Next aprovados; 31 testes de aplicação, 8 de auditoria e 16 cenários de navegador aprovados, com UX desktop/390 px. Casos: 32 releases em duas páginas, quatro destinos, nulos, canceladas, Sistema/busca/estado e exclusão de Sistema arquivado; coleção de 21 releases conserva total 21 ao mostrar uma única release na segunda página. Falhas independentes, ordem dos quadros, URL/seleção pendente e retorno por teclado verificados. Fixtures somente em portal_test; sem alterar aplicação produzida ou resultado de agente.

**Publicação:** imagem `sha256:4a2b806f352136c07479cc2c7cb21943e284caf182ac2b9ae1d3ba93a860ee0e`, fonte `888413786b1af2e96c9f12056cdca75119a53a5432c7c9c5e80efadf6bd4e8fc`. Saúde ready/preview, backup/reversão auditados, sem migration e com as 31 tabelas integralmente preservadas. Consulta nova é somente leitura; não cria ação de domínio ou evento de aprovação. Publicação usa PORTAL_PUBLICATION na trilha administrativa externa.

**Roteiro:** atualizar Releases; conferir filtros e lista antes dos dois quadros finais. Escolher Sistema/busca/estado, trocar página e comparar totais. Campos ainda não aplicados não mudam o recorte. Conferir zero confirmado, Sem ambiente registrado e os rótulos de fluxo separados de implantação. Registrar OK ou o problema encontrado.

**Evidências:** [aplicação](assets/releases-totalizadores-2026-10-27/application-validation.json), [navegador](assets/releases-totalizadores-2026-10-27/validation.json), [UX](assets/releases-totalizadores-2026-10-27/ux-review.md), [publicação](assets/releases-totalizadores-2026-10-27/publication.json) e [conferência real](assets/releases-totalizadores-2026-10-27/live-validation.json). Sem avaliação assistiva integral ou execução de deploy.

**Ajuste visual posterior:** quadro de ambientes removido do detalhe individual da release, mantendo os totalizadores na lista. Publicado após build, com conferência somente leitura desktop/390 px; situação da entrega, Histórias e abas preservadas. Sem migration e com as 31 tabelas integralmente preservadas. [Verificação](assets/releases-totalizadores-2026-10-27/detail-environments-validation.json) e [publicação](assets/releases-totalizadores-2026-10-27/detail-environments-publication.json).


## 16. Recibo RA-04b — Cancelamento auditado da release

**Data:** 28/10/2026. **Situação:** implementada, validada e publicada; OK do usuário pendente. A solicitação para retomar as implementações considerando as últimas regras autorizou esta fatia; não foi tratada como aceite automático de todas as entregas anteriores.

- [x] POST /api/releases/:id/cancel para Administrador/Release Manager, com confirmação explícita, expectedVersion e motivo de 10–500 caracteres. OPEN/CLOSED passam a CANCELED sem reabertura, preservando ambiente, composição e Histórias.
- [x] Release guarda instante/autor/motivo da decisão; fatos anteriores ausentes continuam desconhecidos. Guardas SQL tornam a decisão terminal/imutável, sem inventar metadados de registros CANCELED antigos.
- [x] RELEASE_CANCELLED explícito no catálogo, com SUCCEEDED/COMPLETED/NOT_APPLICABLE para a mudança confirmada, iniciador/executor/alvo/correlação e antes/depois. Motivo completo permanece na fonte Release; auditoria usa digest/referência, sem duplicar o texto livre.
- [x] Idempotência reutiliza a chave/corpo/persona; outra solicitação sobre a versão já cancelada é NO_CHANGE, preservando decisão original. Concorrência compartilha o lock das mutações de composição; rollback de auditoria reverte estado e chave.
- [x] Confirmação inline no detalhe com contexto/motivo. Abrir bloqueia Salvar composição; Voltar reabilita e preserva escolhas. Abas/persona/revisão preservam rascunho e invalidam confirmação quando necessário. CANCELED bloqueia também o formulário antigo cuja base ainda era OPEN.
- [x] Resposta perdida conserva o pedido e oferece Verificar resultado do cancelamento, inclusive após reload e troca/retorno de persona. Nenhuma nova decisão por retentativa.
- [x] Interface conserva os últimos ajustes: quadros finais e totais na lista; detalhe sem quadro de ambientes; aviso geral de backlog removido.
- [x] Builds, 52 testes de aplicação, 8 de auditoria, 28 cenários únicos de navegador, revisão UX desktop/390 px e migration/rollback/runtime aprovados.
- [x] Conferência real somente leitura, sem fixtures/cancelamentos/escritas de validação; release e História existentes intactas.
- [ ] OK do usuário.

**Roteiro para teste do usuário:**

1. Abrir uma release OPEN que se pretenda cancelar e selecionar Administrador ou Release Manager. Cancelar release abre a confirmação; não faz a mudança imediatamente.
2. Conferir chave/nome/estado/ambiente e preencher motivo. Motivo curto mantém Confirmar cancelamento bloqueado. Voltar mantém escolhas sem cancelar.
3. Se houver edição não salva, consultar Auditoria e voltar; motivo/escolhas continuam disponíveis. Confirmar cancelamento cancela a release registrada sem aplicar essas escolhas.
4. Conferir CANCELED, motivo/autor/data e evento em Auditoria; composição/Histórias permanecem, sem reabertura ou salvamento de formulário OPEN antigo. Conferir o contador CANCELED e a permanência no último ambiente do fluxo.
5. Se a resposta não for confirmada, usar Verificar resultado do cancelamento com a persona original. Registrar OK RA-04b ou o impedimento encontrado.

**Limites reais:** esta fatia cancela o registro da release. Não interrompe operação externa, não executa rollback/undeploy e não reabre Histórias concluídas. Não há ainda executor de implantação/promoção a reconciliar; essa integração continua nas entregas próprias. A composição permanece vinculada e imutável; replanejamento dessas Histórias por outra composição/cópia depende de RA-03/05a/20/21, e essa indisponibilidade aparece antes de confirmar quando há Histórias. Fechar release continua dependendo de prontidão/revisões e DE-08; nenhuma dessas capacidades foi declarada entregue.

**Evidência técnica:** casos isolados cobrem OPEN/CLOSED, fluxo QA/HML/PRD sem mudar versão instalada ou História concluída, ausência de confirmação/permissão, chave reaproveitada/concorrente, versão alterada, corrida salvar/cancelar, falha de auditoria com rollback/retentativa e legado sem metadados. Navegador cobre rascunho não aplicado preservado, persona/versão invalidando confirmação, resposta perdida/reload com o mesmo pedido, bloqueio do formulário OPEN antigo, foco/retorno e tela móvel. O lote final substitui os cinco cenários anteriores de cancelamento; não duplicar a contagem de 28 cenários únicos.

**Publicação:** imagem `sha256:6e271a5ce1b42618de578226d54849ebcd15b5aa9fa15c4c004805e519327fa6`, fonte `86f130d9e823fc9cfdae5365a4bd54c06e2bd6bc90c5cf6776acdb63325e8d3d`; migration `202610270006_release_cancellation`. Backup privado verificado, rollback ensaiado e recusa de descartar decisão já registrada. Das 31 tabelas de negócio, 30 ficaram integralmente inalteradas; Release preservou todas as colunas prévias, recebendo apenas quatro metadados nulos de cancelamento. Histórico/envelopes/RequestKey existentes preservados; ledger externo íntegro e sem operações pendentes. A validação real abriu/fechou a confirmação, com POST bloqueado; REL-1 continuou OPEN versão 2 e a História de Filmes continuou merge_request versão 18.

**Artefatos:** [aplicação](assets/ra04b-cancelamento-release-2026-10-27/application-validation.json), [navegador](assets/ra04b-cancelamento-release-2026-10-27/browser-validation.json), [migration/runtime/rollback](assets/ra04b-cancelamento-release-2026-10-27/migration-validation.json), [UX](assets/ra04b-cancelamento-release-2026-10-27/ux-review.md), [publicação](assets/ra04b-cancelamento-release-2026-10-27/publication.json) e [conferência real](assets/ra04b-cancelamento-release-2026-10-27/live-validation.json). Testes simulados somente em portal_test; sem execução de agentes/aplicações para demonstração nem avaliação assistiva integral.


## 17. Recibo RA-03 — Desenvolvimento e conclusão separados

**Situação:** implementada, validada e publicada em 28/10/2026 no portal local; disponível para teste, **OK do usuário pendente**. O pedido para continuar autoriza esta execução e não é aceite antecipado das demais fatias.

### Comportamento entregue

- A lista de Histórias dentro do Épico conserva a fase como informação principal. Desenvolvimento e conclusão aparecem como informações secundárias da mesma História, sem mudar filtros, ordenação, paginação ou URL.
- História e Tarefas compartilham a leitura corrente **Situação da História**, fora da faixa sticky, com duas dimensões: desenvolvimento sem aprovação registrada e conclusão aberta dependente da entrada em produção. DONE da Tarefa e merge não aprovam desenvolvimento nem concluem a História.
- **Consultar revisão e evidências** inicia recolhido e preserva abertura entre abas. Mostra última revisão aplicada de especificação, referência de código da última execução e versão administrativa do cadastro como conceitos distintos. As duas referências não constituem uma revisão de desenvolvimento aprovada nem atestam que pertencem à mesma aprovação. Referência inexistente fica ausente, nunca revisão zero. Execução mais recente sem SHA não usa SHA de execução anterior silenciosamente.
- Tentativa histórica e página de Auditoria não substituem a leitura corrente. Falha de atualização mantém a última leitura com aviso de situação atual não confirmada; primeira consulta sem fonte permanece desconhecida.
- TESTING/UAT/PRODUCTION/COMPLETED registrados não produzem aprovação DEV ou evidência de implantação. COMPLETED existente continua registrado com **Conclusão registrada; produção não confirmada**, sem reabrir ou editar dados. Cancelamento continua decisão independente.
- PATCH/seletor genérico não aprovam desenvolvimento ou concluem a História; mensagem explica ação própria e entrada confirmada em produção. Fechamento de agrupador não força filhos abertos a concluir.

### Fontes, arquivos e limites

`packages/shared/src/story-lifecycle-reading.ts` define o contrato de leitura; `apps/api/src/story-lifecycle-reading.ts` consulta somente metadados existentes de StorySpecificationRevision e StoryExecution. GET de coleção, detalhe e jornada usam transação RepeatableRead. A coleção obtém referências em uma consulta adicional por página de até 20 Histórias, com fontes indexadas, sem uma consulta por linha. Coleção/detalhe não atestam vigência do contexto; a jornada usa a conferência de escopo existente. Conteúdo de revisão, prompts e arquivos de código não entram no DTO novo.

`story-lifecycle-status.tsx/.css`, `item-collection.tsx`, `portal.tsx` e `story-workspace.tsx` compartilham a apresentação, preservando shell Dell, abas, trilho DEV/QA/HML/PROD e próxima ação. Listagem global /stories não foi criada; a coleção continua na página do Épico. Detalhe de release continua sem quadro de ambientes e lista de releases mantém seus dois quadros finais e totalizadores.

**Esta fatia é uma fundação de leitura, sem migration ou tabela de aprovação vazia.** Não cria aprovação, revisão de desenvolvimento composta, deploy DEV, pacote, candidata, cópia ou promoção. A revisão aprovada com evidências/autoria e invalidação será registrada pelo comando RA-14 após seus pré-requisitos. QA continua exigindo todas as Histórias da composição com aprovação válida; nenhum status/manual ou referência isolada satisfaz esse gate. Participação histórica em composições permanece RA-05a; fechar/copiar/promover continuam pendentes.

### Validação e publicação

- **74 testes de aplicação:** coleções, jornada, ciclo de vida, projeções de entrega e desenvolvimento/conclusão. Cobertura inclui referências/ausências, escopo alterado, segredo fora do DTO, leitura sem escrita, legado, PATCH/status, Tarefa DONE e fechamento de agrupador com filho aberto.
- **8 verificações de auditoria** e build API/web aprovados. Sem novo produtor de domínio: apenas consultas e texto da rejeição existente. Publicação usa PORTAL_PUBLICATION na trilha externa, com backup verificado e retorno à imagem anterior preparado.
- **65 cenários únicos de navegador:** jornada/História, experiência, hierarquia real em portal_test, Releases e cancelamento. Os quatro casos RA-03 foram repetidos após corrigir o mock da coleção para a URL real do Épico e sua query de consulta; relatório inicial preservado. Nenhum teste usa integração real ou dado sintético na instalação publicada.
- UX aprovou fonte e capturas desktop/390 px; fase/ação continuam principais, detalhes recolhidos e sem overflow. Parecer não comprova acessibilidade assistiva integral nem substitui aceite humano.
- Publicação sem migration, com **31 tabelas idênticas**. Instalação real conferida somente por leitura, incluindo a História Formulário de Criação e Edição de Filmes e suas Tarefas; nenhum resultado de agente, aplicação produzida ou dado de negócio foi alterado para demonstrar o Portal.

A primeira tentativa de publicação retornou automaticamente à imagem anterior porque o verificador procurou textos dinâmicos da API no JavaScript estático. A checagem foi corrigida para rótulos presentes no bundle e a publicação foi repetida com a mesma imagem/fonte testada. A tentativa e seu resultado permanecem na trilha administrativa externa; não houve migration ou mudança de dado de negócio.

Evidências: [aplicação](assets/ra03-desenvolvimento-conclusao-2026-10-28/application-validation.json), [navegador consolidado](assets/ra03-desenvolvimento-conclusao-2026-10-28/browser-validation.json), [UX](assets/ra03-desenvolvimento-conclusao-2026-10-28/ux-review.md), [publicação](assets/ra03-desenvolvimento-conclusao-2026-10-28/publication.json), [leitura real](assets/ra03-desenvolvimento-conclusao-2026-10-28/live-validation.json).

### Roteiro para seu OK

1. No Épico, confira a lista de Histórias: fase continua principal; desenvolvimento/conclusão aparecem abaixo, sem resetar filtros ou página.
2. Abra **Formulário de Criação e Edição de Filmes**. Confira fase Merge Request, desenvolvimento sem aprovação registrada e conclusão dependente de produção, nas abas Tarefas e Execução.
3. Abra **Consultar revisão e evidências** e confira SHA/especificação quando existentes. Versão do cadastro não deve aparecer como aprovação. Mude de aba e confira a expansão preservada.
4. Entre numa Tarefa e numa tentativa anterior, quando houver: a situação exibida continua sendo da História atual. DONE da Tarefa não deve aparecer como desenvolvimento aprovado.
5. Confira no celular e registre **OK RA-03** ou **Reprovado RA-03: motivo**. A próxima fatia é RA-05a; aprovação DEV e executores mantêm suas dependências.


## 18. Ajuste solicitado — abas Auditoria e Configurações da História

Por solicitação do usuário em 28/10/2026, a História passa a apresentar **Tarefas, Execução, Especificação, Conversas, Auditoria e Configurações**. As duas últimas substituem o agrupamento em Mais, reutilizando os conteúdos existentes. URLs activity/manage, filtros, fase e permissões permanecem; link more antigo abre Auditoria. A Tarefa mantém seu menu anterior. Não é avanço da RA-05a nem aceite automático das RA publicadas.

Publicado com build API/web, oito verificações de auditoria e doze cenários existentes de navegador aprovados. Conferência real somente leitura em desktop/390 px cobre abas finais, conteúdo único, links antigos/diretos, teclado, recarga, voltar, parâmetros e navegação da Tarefa. Sem migration, sem ações de negócio e com 31 tabelas idênticas. [Navegador](assets/historia-abas-auditoria-configuracoes-2026-10-28/browser-validation.json), [planejamento/hierarquia](assets/historia-abas-auditoria-configuracoes-2026-10-28/additional-browser-validation.json), [conferência real](assets/historia-abas-auditoria-configuracoes-2026-10-28/live-validation.json), [publicação](assets/historia-abas-auditoria-configuracoes-2026-10-28/publication.json). A primeira tentativa de publicação retornou à imagem anterior ao encontrar uma checagem inadequada de texto de template no bundle; o verificador foi corrigido, com validação funcional pelas URLs reais e imagem/fonte final identificadas no recibo. A revisão UX aprova o desenho e os cuidados de acesso/teclado/celular; não substitui seu OK manual.


## 19. Recibo RA-05a — Composições e participações preservadas

**Situação:** implementada, validada e publicada em 28/10/2026; disponível para teste, **OK do usuário pendente**. O pedido para continuar autoriza a implementação, sem antecipar aceite das próximas fatias.

### Resultado observável

- Release mantém sua **composição vigente**; abaixo dela, **Revisões da composição** inicia recolhido, lista todos os registros por páginas de 20 e permite consultar uma revisão sem substituí-la pela vigente nem alterar comandos/gates.
- História mantém **Planejamento atual** e seletor existentes. Abaixo, **Participações em releases** permite consultar cada revisão na qual ela foi registrada. Transferir ou retirar do planejamento não apaga essas participações nem duplica o item História. Há acesso à revisão completa da release de origem.
- A revisão escolhida identifica número próprio, instante, autoria efetivamente capturada, estado no registro, versão administrativa e referências preservadas das Histórias. Sua lista de Histórias também é paginada, sem apresentar um limite como conjunto completo. Selecionar revela/foca o quadro; fechar devolve foco ao botão de origem ou resumo.
- Consulta/filtro/página de Auditoria não muda a composição vigente. Parâmetros compositionRevisions.*, composition.revision, compositionMembers.* e participations.* são independentes de picker.* e history.*. Paginação conserva asOf; situação corrente é consultada independentemente do recorte histórico. Rascunho do seletor de release fica preservado e não vira associação confirmada ao consultar histórico.
- Loading, vazio, erro e leitura anterior preservada são distintos. Um registro de composição **não é candidata, pacote construído, aprovação ou implantação**. A História mantém as duas últimas abas Auditoria/Configurações; não há nova aba nesta fatia. Detalhe de release continua sem quadro de ambientes; lista conserva seus quadros finais e totalizadores.

### Fonte e comportamento técnico

`ReleaseCompositionRevision` sela a composição completa em uma linha JSON imutável, com número sequencial por release, versão administrativa observada, origem, autor/operação conhecidos e digest para novos registros. A linha completa evita permitir acrescentar filhos posteriormente a uma revisão já publicada. Índices de release/número/data e GIN por conteúdo apoiam consulta paginada por release e História.

`ReleaseStory` continua sendo o **vínculo atual único de planejamento**. A composição preservada pertence às revisões, com várias ocorrências da mesma História em releases/revisões diferentes. GET detalhe e contagem da release usam a revisão vigente quando disponível, sem depender da página de histórico ou confundir um vínculo removido com perda de composição anterior. Vínculos ativos de CLOSED/CANCELED continuam protegidos pelo contrato existente; não foi criado atalho de transferência para contornar imutabilidade. Cópia futura deverá criar outra identidade/revisão e preservar as fontes da origem por operação própria.

Os comandos existentes RELEASE_CREATED/RELEASE_COMPOSITION_CHANGED registram o snapshot na mesma transação de vínculos, versão, recorder e RequestKey. Transferência registra as duas composições afetadas. Replay/NO_CHANGE não duplica revisão; falha de recorder reverte toda a alteração. Auditoria recebe referência/número/digest seguros, sem conteúdo livre de especificação, prompts ou código. Não há novo comando autônomo de snapshot nem escrita em consulta.

Referências capturam somente metadados da especificação/código e digest do conteúdo de negócio quando a associação é efetivamente atualizada; membros não revisados conservam a referência anterior, ou ausência identificada. Versão administrativa não é aprovação do conteúdo; especificação e execução são fontes independentes, sem garantia implícita de uma aprovação comum. Não retropreencher referências antigas com o código atual.

Migration `202610280001_release_composition_revisions` adiciona uma tabela e observa a composição atual integral de cada release existente, com origem **Registro inicial observado**. Não reconstrói alterações anteriores, autoria, especificação/código ou aprovação antiga: esses campos ficam ausentes. Registra o instante da observação, não o de uma decisão humana desconhecida. A conta runtime possui SELECT/INSERT; UPDATE/DELETE/TRUNCATE são impedidos. Rollback só permite remover registros de observação; recusa se houver decisões planejadas novas.

### Evidências e limites

- **73 testes de aplicação** em coleções/jornada de release, cancelamento, leitura, novas revisões e migration. Cobrem preservação de origem após transferência/retirada, referências/segredos, leitura sem escrita, paginação de 45 revisões/22 participações e de 25 Histórias, concorrência/replay, falha de recorder/retentativa e escopo. A rejeição de comando continua auditada, sem ser confundida com escrita causada por GET.
- **8 verificações de auditoria**, build API/web e **31 cenários únicos de navegador** aprovados. Incluem fluxos existentes de composição/cancelamento/métricas/auditoria e casos novos desktop/390 px com foco/fechar, rascunho, atualização falha, parâmetros/abas, recarga e página 2 com 27 revisões. Tentativas iniciais de teste foram corrigidas para abrir a consulta do planejamento pela rota existente process=delivery e respeitar a expansão já preservada; relatórios originais mantidos.
- Migration exercitada com dados isolados, roundtrip sem decisões novas, bloqueio de rollback após decisão e INSERT/SELECT da conta restrita. Na instalação real, **31 tabelas anteriores permaneceram idênticas**; a nova tabela contém somente a observação integral do planejamento já existente. Publicação com backup verificado e trilha administrativa externa. Não foram criadas Histórias/releases de demonstração nem alterados resultados de agentes/aplicações produzidas.
- UX aprovou desenho, fonte e capturas após ajuste de foco. Conferência real somente leitura: release REL-1 e História de Filmes, desktop/celular, referências antigas explicitamente não capturadas e fase/abas preservadas. Não equivale a validação assistiva integral ou aceite do usuário.

**Limites funcionais:** RA-05 global permanece parcial. A comparação existente plannedStoryVersion/currentVersion e seus filtros ainda são administrativos; **RA-05b** deverá separar vigência por conteúdo/código e atualização explícita de referência, para mudança apenas de fase não representar alteração de conteúdo. Esta fatia não transforma digest em aprovação, não introduz nova autorização DEV, não fecha release, não permite copiar/reabrir nem promove pacote. Histórico anterior à adoção não é reconstruído. Fechamento e cópia continuam nas RA-16a/20/21 e dependências; aprovação DEV permanece RA-14. A escolha de snapshots preservados não resolve por si só composição real de código/branches.

Evidências: [aplicação](assets/ra05a-composicoes-2026-10-28/application-validation.json), [navegador consolidado](assets/ra05a-composicoes-2026-10-28/browser-validation.json), [UX](assets/ra05a-composicoes-2026-10-28/ux-review.md), [publicação](assets/ra05a-composicoes-2026-10-28/publication.json), [leitura real](assets/ra05a-composicoes-2026-10-28/live-validation.json).

### Roteiro para seu OK

1. Abra REL-1 em Releases, aba Composição. Confira a composição vigente e expanda **Revisões da composição**. O registro inicial observado deve explicar os dados históricos não capturados.
2. Consulte a revisão. Confira foco/rolagem, número, autoria ausente e referências da História sem código/especificação reconstruídos. Feche e confira o retorno do foco. Auditoria continua na sua aba.
3. Na História de Filmes, Execução → **Entrega de código e release**, consulte **Planejamento atual** e expanda **Participações em releases**. O registro inicial não deve aparecer como pacote/aprovação/implantação. A ação Release planejada abre o seletor existente e a mesma consulta histórica.
4. Em planejamento de teste criado por você no portal, associe uma História a uma OPEN, transfira para outra OPEN e depois retire. Confira participação nas duas releases/revisões antigas, com planejamento atual correto e sem mudar o status da História.
5. Confira desktop/celular e registre **OK RA-05a** ou **Reprovado RA-05a: motivo**. A próxima fatia é RA-05b; copiar e promover não estão disponíveis nesta entrega.


## 20. Recibo RA-05b — Vigência das referências de planejamento

**Situação:** implementada, validada e publicada em 28/10/2026; disponível para teste, **OK do usuário pendente**. As colunas de OK anteriores não foram alteradas pelo pedido para continuar.

### Comportamento entregue

- Planejamento distingue **referências conferidas**, **alteradas**, **não conferidas** e **sem associação**. Isso não é aprovação DEV, prontidão da candidata, execução de testes ou implantação. ready permanece falso enquanto os executores/gates próprios não existem.
- Mudança apenas de status/fase, versão administrativa ou campos administrativos não invalida a referência. Salvar o mesmo conteúdo/especificação/código não incrementa a release nem cria outra revisão da composição. Nova execução com o mesmo SHA publicado também preserva essa identidade; a revisão antiga continua apontando para a execução original observada.
- Conteúdo de negócio, referência de especificação ou SHA publicado alterado exige revisar e salvar explicitamente. A nova revisão preserva a anterior, inclusive quando o cadastro da História não mudou de versão. Execução mais recente sem SHA não herda código anterior e permanece não conferida; salvar não inventa publicação.
- Registros da adoção inicial ou de política anterior, sem comparação suficiente, permanecem **não conferidos**, sem reinterpretar ou reescrever o registro. Uma confirmação humana nova registra as referências então consultadas. Nada é retropreenchido ou aprovado ao abrir uma página.
- **Sem release** inclui somente História sem associação atual. **Planejamento a revisar** inclui associações existentes com referência alterada/não conferida, usando a coleção inteira antes da paginação. Prontas e sem release/Pendentes continuam com seus fatos de prontidão próprios. O atalho usa picker.view=review; mantém Sistema/Projeto/Épico/status/busca, campos pendentes e escolhas fora da página. A seleção visível usa a mesma separação de associação.
- Detalhe da Release, picker e História usam estado das referências; versões administrativas ficam em detalhes como **Versão do cadastro**, sem alerta de desatualização por simples diferença numérica. Mantidos shell, abas, aprofundamentos RA-05a, Auditoria/Configurações finais da História e quadros finais da lista de Releases.

### Contexto revisado e concorrência

GETs fornecem token de contexto calculado a partir dos fatos atuais de conteúdo, especificação e código. Novo pedido de associação/atualização inclui expectedReferenceToken. Não é autorização ou assinatura: permissões existentes e versões otimistas continuam obrigatórias. Mudança depois da consulta rejeita o comando com PLANNING_REFERENCE_CHANGED; ausência em pedido novo exige consultar/revisar. Pedido antigo já confirmado pode reconciliar pela mesma chave/corpo, mesmo sem esse campo; a validação nova não destrói replay durável.

A conferência é repetida no ponto de captura da revisão, antes de gravá-la; metadados consultados nessa conferência são os que serão preservados. Teste introduz deriva entre a checagem inicial e a captura e comprova rollback de vínculo, versão e revisão. O retorno ao contexto atual não substitui a intenção pendente de resposta perdida; retentativa conserva corpo, persona e chave.

No editor aberto, Atualizar lista/opções renova somente o CAS administrativo quando token/associação/disponibilidade são iguais, sem painel de revisão de conteúdo e sem perder escolha. Conflito VERSION_CONFLICT identifica atualização de cadastro. Se conteúdo/código/associação muda, Salvar fica bloqueado, escolhas permanecem e a atualização oferece revisão explícita. Na Release: Revisar alterações → Continuar com dados atualizados. Na História: Usar referências atualizadas. Aceitar o contexto não salva a associação. Leitura antiga preservada é identificada como anterior e não confirma os fatos novos.

### Fontes e implementação

Migration `202610280002_story_planning_reference` acrescenta somente a função SQL estável sdlc_story_planning_reference; não cria tabela, coluna ou backfill. Ela calcula metadados/digests a partir do Item e das últimas revisões locais de especificação/execução, com uma política explícita **story-planning-v2**. Usa JSONB normalizado no PostgreSQL fixado do laboratório: ordem das chaves de objetos não fabrica alteração; ordem das listas continua significativa. Conteúdo considerado: nome, descrição, requisitos, critérios de aceite e plano técnico. Status/Item.version, flags administrativos e estado operacional da execução não entram na identidade. Especificação é identificada por sua revisão; código conhecido é identificado por SHA, independentemente do ID de uma nova execução equivalente. Execução sem SHA tem identidade própria e ausência explicitada.

A mesma função atende projeções, filtro/contagem do escopo completo e verificação de comando, evitando divergência entre JavaScript e SQL. Metadata é buscada em lote; filtros acontecem no backend antes da página, com as fontes indexadas existentes. Não há chamada GitLab para atestar HEAD remoto nem execução de agente por GET. Current significa igualdade dos fatos locais de planejamento; não comprova proveniência do código para a especificação, qualidade, publicação DEV ou pacote. Esses gates continuam nas entregas próprias.

`planning-references.ts`, contrato compartilhado planning-reference.ts, release-compositions.ts e releases.ts aplicam a regra; o snapshot mantém policy/token sem reescrever revisões antigas. Recorder/RequestKey continuam na mesma transação/lock existentes. Mudança só administrativa conserva referência/versão do cadastro originalmente capturadas. Ação STORY_RELEASE_PLANNED registra a mudança da referência da composição no antes/depois; ações existentes RELEASE_COMPOSITION_CHANGED/CREATED preservam seus significados. Sem novo comando de aprovação, worker, métrica ou alteração de GitLab.

### Validação e publicação

- **57 testes de aplicação:** composição/transferência/cancelamento, preservação de revisões, referência corrente, SQL/runtime restrito, contexto concorrente e replay. Os onze novos cenários cobrem fase/versionamento, mudança sem incrementar cadastro, especificação, SHA equivalente/diferente, ausência de código recente, política anterior, 22 referências a revisar fora da primeira página e normalização de JSON. Filtros e DTOs coincidem sem truncar coleção.
- **8 verificações de auditoria** e build API/web aprovados. Tests exercitam falha do recorder/retentativa e deriva no ponto de captura. Replay de pedido confirmado sem token preservado; novo pedido sem contexto é recusado.
- **38 cenários únicos de navegador** em Releases/composição/cancelamento/leitura/métricas/auditoria e sete novos casos de referências em desktop/390 px. Incluem fase com editor já aberto, CAS administrativo, filtros/rascunhos, escolha preservada, alteração só do código, revisão explícita e resposta perdida/reconciliação. Expectativas antigas de versão planejada foram adaptadas aos rótulos novos; relatórios iniciais mantidos.
- UX aprovou fonte/capturas após retirar duplicação, separar revisão administrativa de conteúdo e identificar a leitura anterior. Cobertura não equivale a acessibilidade assistiva integral.
- Publicação com backup/trilha externa PORTAL_PUBLICATION; **32 tabelas existentes idênticas**, sem mudança de dado de negócio, resultado de agente ou aplicação produzida. A função é aditiva e pode ser mantida ao retornar imagem, sem apagar referências v2. Conferência real somente por GET: História de Filmes e REL-1 continuam v18/v2, respectivamente; o planejamento antigo v17 é não conferido por ausência de referência comparável, não declarado obsoleto só pela diferença de versão.

**Limites e próximos passos:** base RA-05a/05b não cria cópia, fecha release, monta pacote, promove ambiente ou concede Desenvolvimento Finalizado. A consulta de referências locais não substitui proveniência de branch/commit ou os gates futuros. Política de base/branches deve ser revisada em RA-06/DE-01/02 antes de escrita no GitLab. Não há novo aceite automático das implementações; cenário integrado de cópia pertence às RA-20/21.

Evidências: [aplicação](assets/ra05b-referencias-2026-10-28/application-validation.json), [navegador consolidado](assets/ra05b-referencias-2026-10-28/browser-validation.json), [UX](assets/ra05b-referencias-2026-10-28/ux-review.md), [publicação](assets/ra05b-referencias-2026-10-28/publication.json), [leitura real](assets/ra05b-referencias-2026-10-28/live-validation.json).

### Roteiro para seu OK

1. Na História de Filmes, Execução → Entrega de código e release, confira a referência não conferida do registro inicial e expanda os detalhes. As versões 17/18 são do cadastro; não há alerta dizendo que a diferença numérica mudou o conteúdo. Nenhum registro foi atualizado automaticamente.
2. No planejamento de uma release OPEN, confira Sem release separado de Planejamento a revisar. Escolha Projeto/Épico e deixe busca ainda não aplicada; mude atalhos e confira seleção/escopo/rascunho preservados.
3. Em um planejamento de teste criado por você, confirme referências; depois confira que simples avanço de fase não as invalida. No editor já aberto, Atualizar lista/opções deve renovar o controle administrativo sem exigir aceite de conteúdo se as referências continuam iguais.
4. Altere conteúdo/especificação ou publique nova referência de código no fluxo autorizado. Confira a necessidade de revisar/salvar; se o contexto muda enquanto edita, a escolha fica preservada e Salvar é bloqueado até atualização/revisão. Aceitar referências atualizadas não salva a associação sozinho.
5. Confira auditoria/revisões anteriores, desktop/celular, e registre **OK RA-05b** ou **Reprovado RA-05b: motivo**. A próxima entrega é RA-06, consulta/proposta de branches sem escrita, com decisões DE-01/02.


## 21. Recibo RA-06a — Consulta e proposta de branches

**Situação:** implementada, validada e publicada em 28/10/2026. **OK do usuário pendente.** Esta fatia entrega a consulta e a proposta da RA-06; DE-01/02 não foram decididas pelo pedido para continuar. RA-06 global continua parcial; RA-07 não foi iniciada.

| Fatia | Implementada | Validada tecnicamente | Publicada | OK do usuário |
| --- | --- | --- | --- | --- |
| RA-06a — consulta e desenho proposto, sem escrita | [x] | [x] | [x] | [ ] |
| RA-06 — decisão da política/base e adoção | [ ] | [ ] | [ ] | [ ] |

### Experiência entregue

Na aba **Composição** do detalhe da Release, **Plano de branches e base** começa recolhido. O conteúdo separa **Observado no repositório**, **Desenho proposto · não aprovado** e **Decisões pendentes**. Não acrescenta aba, quadro de ambientes ou ação de criação/preparação/aprovação indisponível. Composição vigente, planejamento, cancelamento, revisões e Auditoria permanecem independentes.

O repositório é o único do Sistema, sem seleção de componentes. A consulta mostra branch padrão e SHA observados, proteção declarada pelo GitLab e presença/ausência da branch com nome proposto. Branch existente não é adotada automaticamente; origem/proteção/autorização exigirão os controles da RA-07. HEAD consultado não se torna base de release.

**Cenário e busca do plano** usa FilterPanel compartilhado, recolhido inicialmente. Pode-se analisar primeira release sem produção, origem ainda indefinida ou uma base informada como de produção, com SHA completo opcional. Encontrar o commit no repositório não confirma sua origem em PRD ou autorização. A instalação ainda não dispõe de fonte confirmada de implantação em produção para resolver essa origem.

**Usar este SHA na análise** preenche somente o rascunho, abre o painel e foca o campo após abertura. Não aplica busca pendente. **Consultar cenário e busca** faz GET; **Limpar consulta** volta aos padrões deste contexto; **Atualizar consulta do plano** renova leitura/recorte sem aplicar rascunhos. O SHA aplicado permanece fixo mesmo se a branch observada mudar.

Coleção **Integrações registradas no GitLab**: MRs merged para a branch padrão, busca no título, criação mais recente/antiga primeiro e páginas remotas de 20. Relação com História só aparece quando repositório de origem, branch e SHA coincidem com a execução local do mesmo Sistema; título não identifica História. Fork com mesmos branch/SHA não assume execução local. Participação na composição e coincidência de SHA com planejamento são fatos separados da integração. MR sem correspondência continua visível como não identificado.

A coleção não prova o conteúdo atual do HEAD: reversões, commits diretos, dependências, ancestralidade, proveniência e inventário completo não foram implementados. Merge histórico não autoriza adoção ou seleção de código. Nenhum agente foi executado, resultado antigo alterado, branch movida ou MR reescrito para demonstrar o fluxo.

### Consulta, concorrência e limites da fonte

API GET `/api/releases/:id/branch-plan`: escopo deriva da release e repositório do Sistema, com conta de consulta da integração existente. O adapter dedicado só possui GET, recusa projeto arquivado/fora da raiz gerenciada e não segue links remotos de paginação. Seleciona metadados; não consulta arquivos, diffs, prompts, descrições de MR, e-mails ou segredos. Erro remoto não devolve corpo/credencial.

Parâmetros `branchPlan.base/scenario/search/direction/page/asOf/target` são independentes de picker.*, history.* e compositionRevisions.*. API valida campos/parâmetros; pesquisa e ordenação remotas são aplicadas antes de paginar. X-Total é usado quando fornecido; sem ele a UI informa total desconhecido e continuação real. Ausência dos headers de continuação em página cheia exige consulta do próximo offset. Página além de total conhecido é normalizada. Sem total, página vazia posterior não é apresentada como coleção global vazia.

O corte asOf usa created_before de MR; não é snapshot persistido ou prova do instante do merge. Ordenação/empates são da API remota, sem garantia adicional de desempate por ID. Atualizações/exclusões remotas e limite de offset do GitLab podem mudar ou impedir páginas; a falha é explícita e Atualizar retorna ao início. Este limite não declara contrato geral de snapshot/ordenação integralmente migrado. Paginação preserva o destino observado; mudança da branch padrão exige atualização explícita. Não substitui o SHA informado por HEAD.

Metadados locais de release/composição/repositório são lidos em RepeatableRead, sem transação aberta durante HTTP. Depois da leitura remota, contexto é conferido novamente; deriva rejeita o GET. Isso não é atomicidade distribuída nem aprova a composição. Erro/novo recorte preserva a leitura anterior identificada com data; sua busca/ordem confirmadas continuam explícitas. Ordem solicitada diferente da preservada é explicada. Consulta vazia confirmada é distinta de erro.

### Proposta concreta para DE-01/02 — ainda não aprovada

1. **main:** preservar seu uso atual como integração de desenvolvimento durante a adoção. Não tratá-la como ambiente PRD nem como composição autorizada de toda release. Destino/base de cada nova História devem ser explícitos; mudanças no fluxo de agentes ficam nas RA-08/09.
2. **Histórias e correções:** manter branch por execução e MR rastreável; correção posterior a MR integrado abre nova revisão/MR. DEV individual continua independente de associação/branch de release. Nenhum reset, force push, alteração de MR fechado ou proteção reduzida.
3. **Release:** propor `sdlc/release-<id da release>`, com base por commit fixo. Quando houver produção comprovada, usar como origem a referência de produção explicitamente escolhida, identificando sua composição completa. Sem produção, exigir escolha e revisão de um SHA inicial e inventário do código já existente; não adotar automaticamente o main/HEAD ou uma release registrada como PRD sem evidência.
4. **Acervo integrado:** identificar revisões/MRs/commits e distinguir o que já pertence à base do que será acrescentado. Todo conteúdo extra e dependência exige resolução revisável. O histórico entregue nesta fatia é insumo, não a prova completa. Desmarcar História não remove código; não fazer cherry-pick cego nem fabricar uma lista completa a partir dos MRs desta página.
5. **Concorrência:** isolar composição por branch/identidade de release e revalidar entradas. Não impor uma única release OPEN por Sistema como se já aprovada. Concorrência de DEV/implantação e topologia dependem de DE-04/executor, não da contagem de branches.
6. **Correções após fechamento:** outra release OPEN em DEV por cópia, preservando origem/pacote. Integração das correções nas linhas ainda ativas deverá ser explícita/revisável; esta proposta não habilita propagação automática ou compartilhamento de aprovações.

Esses itens são uma recomendação revisável, não decisão de domínio já persistida. Aceite técnico/funcional de DE-01/02 deve identificar política/base e limites antes da escrita RA-07 e mudanças de destino RA-08. Aprovar a implementação de consulta não aprova base, código, desenvolvimento ou pacote. A escolha concreta da base inicial ainda não foi feita no Sistema real.

### Evidências e publicação

- **74 testes de aplicação**, incluindo dez do adapter GET e cinco integrados da consulta, mais regressões de planejamento/composição, referências e publicação GitLab. Exercitam escopo, SHA exato, fork/ausência de correspondência, proteção de dados, total ausente, continuação, página normalizada, alteração de destino e contexto alterado durante HTTP. GET preserva release, revisão, auditoria e RequestKey.
- Build API/web e **8 verificações de auditoria** aprovados. Sem migration, novo comando de negócio ou ação de aprovação no catálogo. Publicação usa PORTAL_PUBLICATION na trilha externa; não cria HistoryEvent de consulta. Retentativa da leitura é outro GET, sem efeito de mutação para reverter/reconciliar.
- **42 cenários de navegador**, quatro novos RA-06 em desktop/390 px. Cobrem painel recolhido/lazy, revelar/focar SHA, preservar base fixa, páginas/abas/rascunhos/URL, erro de busca/ordem, leitura anterior e vazio confirmado. Os testes são isolados em portal_test, sem workers ou integrações reais. A primeira rodada identificou falha de foco, corrigida antes da rodada final; relatórios preservados.
- UX aprovou fonte/capturas finais, sem declarar acessibilidade assistiva integral. Publicação tem backup verificado e **32 tabelas de negócio idênticas**. Conferência real somente GET: REL-1/História de Filmes preservadas, proposta sem base autorizada, integrações reais e versões administrativas inalteradas. Dados sintéticos ficaram somente em testes.

Evidências: [aplicação](assets/ra06-branches-2026-10-28/application-validation.json), [navegador final](assets/ra06-branches-2026-10-28/browser-validation-final.json), [primeira rodada](assets/ra06-branches-2026-10-28/browser-validation.json), [UX](assets/ra06-branches-2026-10-28/ux-review.md), [publicação](assets/ra06-branches-2026-10-28/publication.json) e [leitura real](assets/ra06-branches-2026-10-28/live-validation.json). Contratos consultados: [branches](https://docs.gitlab.com/api/branches/) e [MRs/paginação/filtros](https://docs.gitlab.com/api/merge_requests/).

### Roteiro para seu OK

1. Abra REL-1 → Composição → **Plano de branches e base**. Confira branch/commit reais, desenho não aprovado e decisões DE-01/02, sem perda da composição ou das abas.
2. Use **Usar este SHA na análise** com Cenário e busca recolhido. Confira abertura/foco e que Base para análise continua indefinida até consultar. Escolha Primeira release, sem versão em produção; consulte e confira pendência explícita da base, sem tratar o commit como autorizado.
3. Pesquise título/alterne ordem e páginas quando disponíveis; mantenha um campo ainda não aplicado e abra Auditoria/volte. Confira rascunho/URL preservados. Atualizar consulta não aplica esse campo nem troca o SHA já aplicado.
4. Consulte MRs e Histórias identificadas, participação na composição e coincidência do SHA. Ausência de correspondência ou diferença do planejamento não deve virar adoção/aprovação. O registro inicial da REL-1 continua sem referência de código capturada.
5. Confira desktop/celular e registre **OK RA-06a** ou **Reprovado RA-06a: motivo**. Revise separadamente a proposta DE-01/02 acima; somente após a decisão caberá implementar RA-07. Sem fechar/promover/copiar nesta entrega.


## 22. Recibo RA-06b — Decisão local do plano

**Situação:** implementada, validada e publicada em 28/10/2026. **OK do usuário pendente.** Disponibiliza o registro explícito da política e base inicial por release/composição; a REL-1 real não recebeu decisão automática. Não encerra DE-01/02 globalmente nem inicia RA-07.

| Fatia | Implementada | Validada | Publicada | OK do usuário |
| --- | --- | --- | --- | --- |
| RA-06b — decisão inicial auditada no portal | [x] | [x] | [x] | [ ] |

### Funcionamento e escopo

No aprofundamento existente **Plano de branches e base**, selecionar cenário inicial e consultar um SHA completo continua sendo leitura. **Registrar decisão do plano** pede justificativa de 10–500 caracteres. **Revisar decisão do plano** abre confirmação inline com release, repositório, número da composição, cenário declarado, SHA integral, branch planejada e as seis regras da política **release-branches-v1** (proposta da seção 21). Somente **Confirmar decisão do plano** persiste a escolha humana. Voltar preserva a justificativa e não grava.

Reutiliza as permissões de planejamento da composição: Admin, PO, Arquiteto e Release Manager. Não cria autorização GitLab, aprovação de desenvolvimento, gate de software, inventário ou confirmação de produção. Persona é declarada no LAB; não é autenticação corporativa ou segregação de funções nova.

A decisão registra o contexto integral e a política oferecida, sem mudar status/versão da Release, composição, História, código, MR ou ambiente. Cenário inicial é uma declaração humana; não prova que nunca houve implantação externa. Cenário de base em produção continua indisponível para registro enquanto não houver fonte confirmada própria. Uma branch existente consultada não é adotada por este comando.

A alteração de SHA/cenário no formulário, ainda não consultada, bloqueia a revisão. Busca de título sozinha continua independente. Mudança de contexto/persona após revisão desabilita confirmar e conserva justificativa; é necessário voltar, atualizar a consulta e revisar. Alterações de composição/cancelamento na mesma tela ficam bloqueadas durante revisão/resultado pendente. Outros clientes continuam protegidos pelo backend. Mantidos shell, abas, filtro/rascunho/URL e consulta de composições. Histórico permanece em **Auditoria**, com rótulo e referências da decisão; não acrescenta quadro de eventos à Composição.

### Persistência, concorrência e recuperação

Migration aditiva **202610280003_release_branch_plan_decisions** cria somente `ReleaseBranchPlanDecision`, sem backfill. Cada decisão é uma linha completa imutável: número por release, composição/revisão de cadastro, repositório/projeto GitLab, base/SHA observado, política completa/versionada/digest, justificativa, autoria, operação e instante. Trigger confere composição vigente, contexto OPEN/DEV, Sistema ativo e repositório do mesmo Sistema. Runtime pode SELECT/INSERT, sem UPDATE/DELETE/TRUNCATE; rollback SQL recusa descartar decisões. Retorno à imagem anterior pode conservar a tabela aditiva.

GET existente acrescenta política oferecida, token de contexto e resumo da última decisão, separando **ausente**, **correspondente ao contexto**, **contexto alterado** e **registro preservado**. Não escreve para invalidar/substituir registros. Decisão fixa a base, sem acompanhar HEAD: avanço da branch após o registro não muda sozinho a base escolhida. Mudança de composição/repositório/política/destino exige nova decisão pertinente. Histórico consultado não vira contexto de comando.

POST `/api/releases/:id/branch-plan/decisions` exige persona autorizada, versão da release, decisão anterior esperada, token revisado, SHA, cenário initial, versão da política, justificativa e confirmação explícita. Cache confirmado é consultado antes da exigência da política atual e do GitLab: a solicitação original pode reconciliar mesmo com consulta remota indisponível ou nova política oferecida. Nova solicitação com política antiga é recusada. Consulta GitLab é somente GET, fora da transação de gravação. Estado do Sistema também é conferido após o HTTP; inativação durante consulta rejeita o contexto.

A gravação revalida contexto após lock compartilhado e confirma escopo no trigger de captura. Decisão, recorder e RequestKey são transacionais. Falha da auditoria ou deriva no ponto de captura reverte todos os efeitos locais. Mesma chave/corpo/persona recupera o mesmo resultado; corpo diferente é conflito. Nova solicitação com a mesma decisão/justificativa é NO_CHANGE, preservando autor/instante originais. Alterar base, política, contexto **ou justificativa** cria outra decisão, preservando a anterior. Corrigir justificativa não é descartado como duplicação.

A UI reutiliza `useOperation`: intenção/corpo/persona/chave são congelados e preservados em sessão. **Verificar resultado da decisão** reconcilia o pedido original após resposta perdida/reload, inclusive sem os parâmetros da consulta ou com GET falho. Resultado confirmado pelo replay não afirma que o plano ainda é vigente; o topo informa **Situação atual do plano não confirmada** até uma leitura atual bem-sucedida. Não reenvia a decisão com campos novos ou outra persona.

### Auditoria e limites

Ação catalogada **RELEASE_BRANCH_PLAN_RECORDED**: SUCCEEDED ou NO_CHANGE / COMPLETED / APPROVED, decisão exclusivamente do plano local. Alvo é a Release, iniciador/executor humano declarados, correlação estável e antes/depois com IDs/números da decisão, composição, base, política/digests e repositório. Não altera eventos legados nem aprova código. Justificativa livre e política completa ficam na fonte controlada; não são copiadas para o evento. Resumo público da decisão não expõe a justificativa; consulta detalhada de justificativas antigas não faz parte desta fatia.

RA-07 continuará exigindo a decisão pertinente e controles próprios para criar/proteger/reconciliar branch, identidade restrita, base, colisões e efeitos externos. Este registro não dispensa inventário/proveniência, Desenvolvimento Finalizado, pacote imutável ou gates de QA/HML/PRD. Não há novo worker, métrica, mudança dos agentes de código/merge ou aprovação automática da proposta no Sistema real.

### Evidências e publicação

- **101 testes distintos de aplicação**: 17 novos cenários de decisão/migration/rollback/replay/concorrência/permissões, além das regressões pertinentes. Incluem SQL de escopo no ponto de captura, recorder falho, correção da justificativa, contexto inativo durante rede e replay após troca da política. Relatórios focados substituem resultados dos módulos alterados na consolidação; os demais resultados aprovados foram preservados.
- Build API/web e **8 verificações de auditoria** aprovados.
- **48 cenários únicos de navegador**, seis novos em desktop/390 px, com confirmação, política, base pendente, busca independente, persona, abas, conflito, bloqueio cruzado e resposta perdida. O rerun final do comando confirmou os seis casos na imagem revisada. O teste legado de filtro passou a limitar a consulta ao painel visível, pois o plano oculto permanece montado para preservar a recuperação.
- UX aprovou fonte/capturas, incluindo a distinção de resultado confirmado e situação atual desconhecida. Não comprova acessibilidade assistiva integral ou OK do usuário.
- Publicação com backup verificado e trilha externa PORTAL_PUBLICATION. **32 tabelas anteriores idênticas**, nova tabela sem decisão sintética, sem alteração de negócio/aplicação produzida/resultado de agente. Conferência real somente GET na REL-1 e História de Filmes, mantendo versões 2/18 e escolha real pendente. Fixtures e confirmações simuladas ficaram apenas em portal_test, sem workers ou GitLab real.

Evidências: [aplicação](assets/ra06b-decisions-2026-10-28/application-validation.json), [navegador consolidado](assets/ra06b-decisions-2026-10-28/browser-validation-consolidated.json), [UX](assets/ra06b-decisions-2026-10-28/ux-review.md), [publicação](assets/ra06b-decisions-2026-10-28/publication.json), [leitura real](assets/ra06b-decisions-2026-10-28/live-validation.json).

### Roteiro para seu OK

1. Abra Release → Composição → Plano de branches e base. No cenário inicial, informe/consulte um SHA completo; Usar este SHA na análise preenche o rascunho e exige consultar antes da decisão. A escolha é sua; a publicação não definiu a base da REL-1.
2. Selecione persona de planejamento, informe justificativa e revise a decisão. Confira composição, SHA integral e política. Voltar não registra; base/cenário alterados sem consultar impedem revisar. Busca pendente não é aplicada por registrar a decisão.
3. Confirme somente após revisar os dados. Confira número, autoria, instante e base da decisão registrada, e abra Auditoria. Nenhuma branch ou implantação deve ser criada por essa confirmação.
4. Confira preservação de rascunho entre abas/celular e o bloqueio durante revisão. Em contexto alterado, a justificativa deve permanecer, exigindo atualizar/revisar novamente. Correção de justificativa cria outro registro, preservando o anterior.
5. Registre **OK RA-06b** ou **Reprovado RA-06b: motivo**. Próxima fatia: RA-07, preparação controlada de branch a partir de decisão registrada válida.


## 23. Correção transversal — Execução do Épico

**Situação:** implementada, validada e publicada em 28/10/2026, após análise e pedido explícito de correção do usuário. **OK manual pendente.** RA-07 e demais decisões/entregas de releases não foram marcadas como realizadas por esta correção.

### Comportamento entregue

- Aba, shell, persona, breadcrumb e entrada padrão Histórias foram preservados. **Acompanhar as Histórias** aparece primeiro, com estado do Épico e contagens completas, independentes do recorte/página da lista. O link para Histórias preserva os parâmetros existentes. Arquivamento é informado como dimensão sobreposta; não significa conclusão.
- **Gerenciar ciclo do Épico**, **Retomar trabalhos pausados** e **Planejar no Projeto** começam recolhidos. O ciclo deixou de apresentar ACTIVE/INACTIVE/COMPLETED/CANCELLED como passos sequenciais. São estados alternativos. G1/Gateway de Especificação e execução de código continuam nas Histórias.
- Justificativa ocupa a largura do painel, com rótulo acima e ajuda abaixo, inclusive no celular. Ações mostram seus impedimentos antes do envio. A consulta inclui descendentes arquivados; ocultar um filho aberto na lista não libera fechamento.
- Escolher uma ação abre confirmação inline com nome do Épico, estado origem/destino, justificativa e efeitos. Voltar não grava e restaura foco. A justificativa fica preservada entre recolhimento, abas, erros e nova revisão. Confirmação reconsulta as condições; diferença observada impede o POST e exige revisão, sem substituir a intenção silenciosamente.
- Carregamento informa **Conferindo condições**; falha informa **Condições atuais não confirmadas**; mudança real tem aviso próprio. Últimos valores preservados são identificados como leitura anterior, com instante da consulta. Ausência/falha não é zero ou autorização.
- Retomada informa quantidade pausada e quantidade elegível no contexto ativo, separadas. Usa as mesmas famílias/registros do comando existente, não representa agentes ou Histórias únicas. Reativar não retoma automaticamente. A retomada tem revisão/confirmação própria e seu resultado diz recolocação na fila, sem afirmar execução/conclusão.
- Planejamento indica o Projeto ancestral no título e nos links. Não promete entrevista restrita ao Épico ou execução de agente neste agrupador. Histórico permanece na aba Auditoria.

### Contrato técnico e regras preservadas

Novo GET `/api/items/:id/epic-execution`, somente para item do tipo Épico não arquivado, usa RepeatableRead e a árvore inteira, sem limite disfarçado de coleção completa. Não possui filtros/paginação; parâmetros desconhecidos são recusados. Retorna contagens, estado registrado/leitura do ciclo, operações em curso, elegibilidade, motivo obrigatório e token de contexto. Token não é autorização nem gate; não depende da página de auditoria/Histórias. Não lê prompts ou resultados de agentes, não dispara trabalho e não cria histórico.

`groupTransitions`, `closureReasonRequired`, `hierarchyRunningCounts` e `eligibleHierarchyItems` compartilham as condições usadas nos comandos existentes. A elegibilidade percorre a hierarquia já carregada e a mesma política de bloqueio, preservando o escopo ativo da retomada. Sem alterar transições, permissões ou semântica de pausa/retomada/encerramento. Conclusão/cancelamento exigem ausência de descendentes abertos; inativação exige ausência de operações em curso. Justificativa segue a API: obrigatória para cancelar/reabrir encerrado e nos casos de encerramento vazio/todos os filhos diretos cancelados; opcional nos demais casos permitidos. Não foi criado gate do Épico.

UI reutiliza `useOperation` e os POSTs `/items/:id/status` e `/items/:id/resume-work`, com versão, persona e Idempotency-Key existentes. Resposta incerta/reload mantém corpo/chave/persona e oferece **Verificar resultado da operação do Épico**; não cria outra intenção ou atribui resultado ao novo perfil selecionado. Consulta prévia e comando são operações distintas; a autoridade continua nas guardas transacionais do backend, sem alegar atomicidade entre ambos. Recebimento de um resultado idempotente não substitui a leitura atual do cabeçalho.

A apresentação de Projeto/Sistema permanece anterior; as regras compartilhadas tiveram regressão exercitada. Épico arquivado/acervo não recebeu nova tela. Não há migration, alteração de enum/status, métrica de dashboard, nova aprovação ou operação GitLab. As ações existentes STATUS_CHANGED, HIERARCHY_WORK_PAUSED/RESUMED, seus recorders, autoria e correlação permanecem; não se declarou migração de produtores não alterados.

### Validação e publicação

- **51 testes de aplicação:** seis novos da consulta, além de ciclo/hierarquia, política de estados, coleções e atividades. Incluem 25 Histórias/175 descendentes, acervo aberto, cancelamento em andamento/lease, pai inativo, pausa/reativação/retomada elegível, razão de fechamento e ausência de escrita em GET.
- Build API/web e **8 guardas de auditoria** aprovados.
- **20 cenários distintos de navegador**, oito novos do Épico em desktop/390 px e regressões adaptadas de ciclo, hierarquia e auditoria. Última rodada focada confirma os oito casos na imagem final; os demais resultados aprovados foram preservados. Exercitam URL/filtros, motivo entre abas, confirmação sem escrita antecipada, conflito antes do POST, falha de leitura, replay após resposta perdida, persona original e retomada real no backend isolado, sem workers/integrações reais.
- UX aprovou fonte e oito capturas. Viewport/foco móvel conferidos separadamente: confirmação e botões visíveis abaixo da barra fixa. Captura fullPage com sticky não foi tratada como evidência suficiente de posicionamento. Acessibilidade assistiva integral permanece fora da comprovação.
- Publicação com backup/trilha externa PORTAL_PUBLICATION e **33 tabelas anteriores preservadas**, sem migration. Conferência real só GET e abertura/fechamento de revisão, sem confirmar ciclo, retomar trabalho ou inserir dados sintéticos. Épico de Filmes e História preservam versões 1/18; dados/execuções/aplicação produzida não foram alterados para demonstração.

Evidências: [aplicação](assets/epic-execution-2026-10-28/application-validation.json), [navegador](assets/epic-execution-2026-10-28/browser-validation-consolidated.json), [UX](assets/epic-execution-2026-10-28/ux-review.json), [viewport/foco](assets/epic-execution-2026-10-28/epic-focus-viewport.json), [publicação](assets/epic-execution-2026-10-28/publication.json), [leitura real](assets/epic-execution-2026-10-28/live-validation.json).

### Roteiro para testar

1. Abra o Épico → Execução. Confira acompanhamento primeiro e os três aprofundamentos recolhidos. Abra Histórias e retorne, preservando os filtros/ordenação.
2. Abra Gerenciar ciclo: confira campo alinhado, estado sem trilho e impedimentos junto a concluir/cancelar. As contagens incluem acervo e não representam só a página de Histórias.
3. Revise Inativar: deve apresentar efeito sobre a árvore e exigir confirmar. Voltar não altera o Épico. Entre Auditoria/Execução, a justificativa deve permanecer.
4. Confira retomada distinta de reativação e planejamento explicitamente no Projeto. Registre **OK correção do Épico** ou o problema encontrado. Nenhuma escolha de base ou avanço no plano de releases é pressuposto por este teste.


## 24. Recibo RA-07 — preparação controlada da branch

**Situação:** implementada, validada e publicada em 28/10/2026 após o pedido de continuar. **OK manual pendente.** A implementação consome a decisão local do cenário inicial da RA-06b; não resolve por suposição DE-01/02 da REL-1, adoção do acervo, proveniência de produção ou destinos dos agentes. RA-08 não foi iniciada.

### Comportamento entregue

Em **Release → Composição → Plano de branches e base**, Preparação no GitLab fica abaixo da decisão local. Registrar a decisão e executar a preparação são confirmações diferentes. A primeira não grava no provedor. A segunda exige Admin/Release Manager, decisão vigente, Sistema ativo, release OPEN/DEV, composição e repositório atuais, cenário/base consultados correspondentes e confirmação de repositório, branch exata e SHA fixo. Consulta/recarregamento não cria recursos.

O comando enfileira uma intenção persistida, sem alterar Release.version, composição, Histórias ou ambientes. O worker usa o segredo já dedicado à conta `sdlc-agent-for-merge`, valida identidade ativa não administrativa, projeto gerenciado e acesso Maintainer. Confere commit, branch e a coleção completa de proteções aplicáveis; regra permissiva por wildcard impede preparação, mesmo se houver regra exata mais restritiva. Cria a proteção do nome antes da branch: push direto 0, merge 40, force push falso. Não possui atualização de branch, reset, remoção, unprotect ou alteração da main. Branch existente só pode ser reconhecida se SHA e proteção já forem compatíveis; divergência não é sobrescrita.

Cada escrita revalida decisão/composição/repositório/Sistema e a propriedade/prazo da operação. HTTP fica fora da transação local. A pequena distância entre conferência e efeito externo não é uma transação distribuída: cancelamento/mudança posterior não desfaz efeito já enviado. **Cancelar a release continua disponível**, inclusive com job em fila ou resultado incerto. Antes de escrever, contexto inválido interrompe; depois de efeito possível, preserva/reconcilia a mesma intenção e identifica mudança do contexto sem afirmar que a release está apta.

Fila, processamento, impedimento, resultado desconhecido e confirmação têm textos distintos. Sucesso exige SHA autorizado e proteção observados; aparece como fato datado da preparação, não como prova de conteúdo integrado ou proteção contínua futura. Justificativa da decisão e consulta/filtros são preservados entre abas e recolhimento. Confirmação recebe foco, permite Voltar sem preparar e recusa persona/contexto diferentes.

Perda da resposta HTTP do portal mantém chave/corpo/persona originais em `useOperation`; **Verificar recebimento da preparação** recupera o aceite local sem outra intenção. **Verificar resultado da preparação** solicita consulta remota da mesma operação, sem repetir POST no GitLab. Lease expirada ou marcador de escrita persistido também retomam somente por leitura. Recibo da verificação permanece visível se o GET seguinte falhar, mesmo reutilizando o mesmo ID. Última leitura fica datada/qualificada; ausência/falha não vira zero ou sucesso. Efeito parcial pode continuar UNKNOWN; não há retry remoto automático para completar uma proteção/branch não confirmada. A resolução operacional desse caso continua limitada à consulta e ao diagnóstico, sem comando de sobrescrita.

### Métricas aprovadas nesta entrega

O usuário escolheu explicitamente **incluir indicadores na Visão Geral, sem metas por enquanto**. Na visão de Releases, **Preparação de branches** (`releaseView=branches`) usa os filtros existentes e as quatro semanas em America/Sao_Paulo, com intervalos [início, fim) e semana atual parcial:

- **Preparações solicitadas:** operações persistidas únicas pela data de aceite; retentativas de transporte, worker e reconciliação não contam outra vez. Nova preparação explicitamente solicitada após um impedimento é outra operação, identificada pelo seu número.
- **Tempo até confirmação:** mediana de horas corridas entre createdAt e a primeira confirmedAt persistida com resultado SUCCEEDED, incluindo fila, espera e recuperação. Semana da confirmação, número de amostras e mediana do período calculada sobre as próprias amostras; medianas semanais não são somadas. Sem amostras = Sem medição, não zero.
- **Resultados ainda não confirmados:** estoque de UNKNOWN, incluindo a reconciliação temporariamente queued/running, em Sistemas não arquivados. Fila comum, bloqueio observado e sucesso não integram esse estoque. O estoque atual não recebe janela semanal histórica fictícia.

A unidade é operação, não release/História/branch contada por evento. Criações e confirmações históricas preservam Sistemas hoje arquivados. Recortes de Projeto/participação são os mesmos da release e usam a composição/participação atuais, sem reconstruir associação antiga ou restringir somente ao executor. Cobertura inicia no produtor novo; branches antigas/externas não são convertidas em amostras. Não foram criadas metas, taxas de deploy ou DORA por esta implementação.

### Persistência, auditoria e validação

Migration aditiva `202610280004_release_branch_preparation` cria ReleaseBranchPreparation sem backfill. SQL valida captura do plano vigente, sequência, um resultado não resolvido/confirmado por release, intenção preservada e coerência de sucesso/SHA/proteção/confirmedAt. Runtime SELECT/INSERT/UPDATE apenas para o registro operacional, sem DELETE/TRUNCATE; fontes de decisão/auditoria continuam imutáveis. Rollback vazio exercitado; com preparações gravadas recusa perder efeitos/fontes. Uma reversão de imagem preserva a tabela aditiva.

Catálogo explícito: RELEASE_BRANCH_PREPARATION_REQUESTED e RELEASE_BRANCH_RECONCILIATION_REQUESTED = ACCEPTED/REQUESTED; STARTED = SUCCEEDED/STARTED; COMPLETED = SUCCEEDED/COMPLETED; BLOCKED = DEFERRED/WAITING/NOT_EVALUATED; UNCONFIRMED = UNKNOWN/OBSERVED. Nenhuma dessas ações aprova desenvolvimento, QA ou produção. Recorder transacional participa de aceite/chave, claim e conclusão/confirmedAt, preservando autoria original, executor system:release-branch, operação e comparação. Ausência de observação anterior da proteção permanece nula, não falsa. Não copia credencial, justificativa livre, prompt ou código.

**80 testes de aplicação**, **8 de auditoria**, build API/web e **37 cenários de navegador** aprovados. Cobrem regras/coleção de proteção fora da primeira página, identidade realista UserPublic sem is_admin, papel/escopo/base, drift entre HTTP e captura, concorrência/replay, cancelamento em fila, marcador/lease expirada, efeito parcial, resposta perdida, falha de recorder antes/depois do efeito, rollback/runtime, cálculos/janelas/participação/arquivados e ausência de amostras. As rotas de controle do worker e dados sintéticos pertencem somente à API de teste em portal_test; não integram a API de produção.

Revisão UX de fonte e capturas desktop/390 px aprovada; datas e PARCIAL seguem a tabela existente. Confirmação inspecionada em viewport real, com botões visíveis. Não se declarou validação assistiva integral. Cenários finais usam a imagem publicada. Uma falha anterior da consulta móvel de composições revelou recorte calculado pelo relógio da API atrás das datas do banco; os dois GETs de revisões/participações passaram a obter asOf dentro da transação pelo maior entre horário do banco e data dos registros já visíveis no mesmo escopo, cobrindo também ajuste regressivo do relógio e preservando asOf explícito e a leitura corrente independente. Teste determinístico com relógio da API em 2020 e registros com data posterior ao relógio atual e dez testes de composições passaram. confirmedAt da preparação também usa o relógio do banco. Confirmação temporalmente anterior ao aceite não é amostra de duração e não vira zero; o fato confirmado permanece preservado. O trace e a rodada reprovada permanecem nos assets. Integração real foi consultada somente por GET: identidade dedicada, Maintainer e método inspect do adapter confirmados; prepare/POST remoto não foi executado para demonstração.

Publicação com backup privado verificado e trilha administrativa externa PORTAL_PUBLICATION. **33 tabelas anteriores preservadas**; uma tabela nova, sem operação sintética/decisão real inserida. Conferência real de navegação/indicadores somente leitura, release e História existentes preservadas. A criação remota real fica no teste explícito do usuário, depois da sua escolha e confirmação no portal.

Evidências: [aplicação consolidada](assets/ra07-branches-2026-10-28/application-validation-consolidated.json), [instrumentação integrada](assets/ra07-branches-2026-10-28/application-validation-confirmation.json), [recorte e relógio](assets/ra07-branches-2026-10-28/application-validation-clock.json), [navegador final](assets/ra07-branches-2026-10-28/browser-validation-ready.json), [integração real somente leitura](assets/ra07-branches-2026-10-28/live-capability.json), [UX](assets/ra07-branches-2026-10-28/ux-review.json), [publicação](assets/ra07-branches-2026-10-28/publication.json), [leitura real](assets/ra07-branches-2026-10-28/live-validation.json).

### Roteiro manual e próximo incremento

1. Na Release, abra Composição → Plano de branches e base. Consulte o cenário inicial e o SHA que você decidiu usar; registre a decisão local, se ainda não existir. Uma sugestão/HEAD consultado não escolhe a base por você.
2. Com Admin ou Release Manager, abra Preparar branch da release. Confira repositório, composição, decisão, branch/SHA e proteção. Voltar não grava. Confirmar preparação no GitLab solicita a operação real.
3. Acompanhe fila e resultado; em resposta incerta use a verificação da mesma preparação. Confira os eventos na aba Auditoria e a referência/proteção observadas. A release permanece OPEN/DEV.
4. Em Visão Geral → Releases → Preparação de branches, confira pedidos únicos, amostras/duração e estoque sem confirmação sob os mesmos filtros. Recarregue o link da visão e compare desktop/celular.
5. Registre **OK RA-07** ou o problema. A próxima fatia RA-08 trata destinos explícitos dos agentes e DEV independente, preservando as decisões e gates próprios.


## 25. Recibo RA-08a — destino explícito no Gateway de Especificação

**Situação:** implementada, validada e publicada localmente em 28/10/2026. **OK manual pendente.** A RA-08 foi dividida para testar uma decisão por vez. Esta fatia fixa destino e base das novas preparações; não implementa retorno de testing/merge para novo ciclo, publicação DEV, pacote QA ou destino da release.

### Regra e experiência entregues

Na confirmação existente da aba **História → Execução → Revisar aprovação**, o quadro Destino desta implementação mostra repositório do Sistema, branch de integração DEV e commit de partida. O SHA completo, horário da consulta e política ficam em detalhe recolhível. A mesma confirmação humana da especificação autoriza enfileirar o código com essa referência; consultar/recarregar não aprova, não cria branch, não associa release e não executa agente.

O primeiro cenário suportado usa a **branch padrão do repositório gerenciado como integração do desenvolvimento**, política `explicit-dev-v1`. É apresentada e confirmada explicitamente; não representa produção nem pacote imutável. Não há seletor arbitrário ou consumo da branch de release da RA-07. A falta de release não impede este ciclo. DE-01/02 da release real continuam sem escolha automática e não são deduzidas de pedidos para continuar o plano.

Falha na leitura preserva o último destino, identificado como leitura anterior, e bloqueia a confirmação. Mudança detectada no aceite mantém o commit anterior visível: **Atualizar destino para revisão** obtém nova leitura e exige aceitar novamente. O formulário permanece montado durante o envio para impedir atualização silenciosa da base após uma recusa. Mudança da versão da História capturada exige voltar e revisar a etapa. Navegação/abas/URL e identidade do portal foram preservadas. Após a primeira abertura, a conversa permanece montada ao alternar para a ação, preservando rascunho e verificação de uma decisão com resposta perdida.

Destino confirmado aparece como detalhe da execução corrente também na Tarefa correspondente; seu texto distingue referência de merge, implantação e conclusão. A fonte histórica é a Auditoria. As telas de tentativas antigas não foram enriquecidas com destinos; uma execução antiga não recebe a referência atual de outra tentativa.

### Contrato, agentes e auditoria

Novas preparações/replanejamentos gravam destinationReviewRequired no snapshot. O GET /api/executions/:id/code-destination consulta somente metadados remotos e devolve a proposta com versão da História, repositório/versão, projeto GitLab, branch, SHA e token do contexto. A conferência local é repetida depois do HTTP, sem manter transação aberta; não lê arquivos para essa proposta, não grava decisão e não transforma o HEAD em autorização.

O comando G1 requer a tupla completa e token para execuções marcadas. Confere autoria/permissão, estado, conteúdo/contexto e base remota, e grava a decisão no mesmo commit da fila, versão e chave idempotente. O snapshot aprovado contém o destino. A ação existente **GATE_APPROVED** registra policyVersion, repositoryId/repositoryVersion, gitlabProjectId, targetBranch e baseSha na projeção segura, preservando correlação/autoria e comparação anterior/nova. Nenhuma nova ação foi criada; rejeições usam COMMAND_REJECTED. Não há inserção direta de HistoryEvent nem cópia de código, prompt ou credencial para a auditoria.

Repetição de aceite confirmado usa chave, corpo e persona originais e retorna o recibo antes de nova consulta remota, inclusive com GitLab indisponível. Falha do recorder reverte decisão/fila/chave; retentativa registra uma decisão. Worker confere o destino contra o GATE_APPROVED imutável e usa codeContext no SHA aprovado, sem seguir um HEAD novo. O agente recebe a referência fixa e não escolhe branch, base ou release.

Publicação confere destino/projeto/branch do MR, e código novo exige a base ainda correspondente. Correção nova e leitura de qualidade recusam MR redirecionado, inclusive com SHA coincidente. Reconciliação de efeito já publicado usa leitura e pode reconhecer o mesmo efeito após avanço da branch alvo; não cria outro commit para recuperar resposta perdida. Essas conferências não tornam GitLab e banco uma transação distribuída: mudança remota posterior pode ocorrer e a fonte permanece datada. Proveniência completa e merge final pertencem à RA-09.

Não houve migration, backfill ou alteração retroativa dos snapshots em curso. Execuções anteriores sem o marcador mantêm seu contrato, sem inventar destino aprovado. As guardas que impedem novo ciclo em testing/merge foram mantidas para a RA-08b. A tela antiga de execução fora da jornada ativa não foi declarada migrada.

### Métricas, validação e publicação

O usuário escolheu explicitamente **manter os indicadores existentes nesta fatia**. Fila, espera humana e retrabalho existentes continuam; não foram acrescentadas contagens de destinos confirmados, recusas por mudança de base, fórmulas, metas ou novas visões no dashboard.

**141 testes de aplicação únicos**, **8 de auditoria**, build API/web e **84 cenários de navegador** aprovados. Abrangem proposta sem escrita, ausência de release, permissão, alteração de base/branch/vínculo/contexto, snapshot adulterado, base fixa no worker, MR redirecionado, recorder/rollback, reconciliação sem escrita e perda de resposta com GitLab indisponível. Os cenários novos passaram em 1440 e 390 px; revisão UX das oito capturas sem bloqueio material no recorte, sem alegar validação assistiva integral.

Uma rodada anterior revelou remontagem do formulário após recusa, que consultava o novo HEAD sem atualização explícita. A correção preserva a leitura rejeitada e foi exercitada nas duas larguras. A conversa antiga tinha seletores de abas/títulos anteriores; o teste foi alinhado à navegação corrente e mantém verificações de permissão, rascunho, dependência explícita, novo G1 e mesma chave nas três respostas perdidas. As rodadas anteriores permanecem nos assets; erros transitórios da configuração isolada não foram apresentados como resultados aprovados.

Todos os dados sintéticos ficaram em portal_test, com provider/worker de teste isolados; essas rotas de controle não integram a API publicada. A imagem final foi publicada com backup privado verificado e PORTAL_PUBLICATION no ledger administrativo externo. **34 tabelas de negócio preservadas integralmente**, sem migration nova, escolha real de base, execução de agente ou alteração de aplicação produzida. Leitura real de História/Tarefa e release verificou ausência de mutações; o novo método de metadados do provider foi conferido no GitLab real somente por GET, sem leitura de código ou escrita.

Evidências: [aplicação consolidada](assets/ra08a-destination-2026-10-28/application-validation-consolidated.json), [auditoria](assets/ra08a-destination-2026-10-28/audit-validation.json), [navegador final](assets/ra08a-destination-2026-10-28/browser-validation-ready.json), [UX](assets/ra08a-destination-2026-10-28/ux-review.json), [publicação](assets/ra08a-destination-2026-10-28/publication.json), [leitura real](assets/ra08a-destination-2026-10-28/live-validation.json), [metadados reais](assets/ra08a-destination-2026-10-28/live-capability.json).

### Roteiro manual e próxima fatia

1. Em uma História apta a preparar especificação, use Ana, Bruno ou Admin. Prepare e revise a especificação; abra Revisar aprovação na aba Execução. Execuções anteriores preservadas não recebem retrospectivamente a nova exigência.
2. Confira repositório, branch e commit. Abra o detalhe para o SHA completo e a política. Voltar não enfileira. Atualizar destino para revisão limpa a aceitação anterior.
3. Aceite a especificação/destino e use Aprovar e enfileirar codificação. Essa ação executa o ciclo real; não é uma demonstração sem efeito. Confira o destino registrado e o evento na Auditoria; não é necessário associar release.
4. Em resultado incerto, verifique o mesmo pedido. Se a base mudar antes da confirmação, revise a leitura explicitamente antes de autorizar novamente. Não existe atualização silenciosa para outro commit.
5. Registre **OK RA-08a** ou o problema encontrado. A próxima fatia RA-08b tratará retorno de testing/merge para nova revisão/codificação; build/deploy DEV, destino de release e pacote QA continuam nas entregas próprias.


## 26. Recibo RA-08b — novo ciclo de desenvolvimento

**Situação:** implementada, validada e publicada localmente em 28/10/2026. **OK manual pendente.** A fatia amplia o ciclo de desenvolvimento no destino DEV da RA-08a. Não implementa build, deploy, executor de testes, Desenvolvimento Finalizado, pacote QA ou seleção arbitrária de branch.

### Comportamento e regras

Após o merge confirmado da revisão corrente, ou na fase testing com essa integração confirmada, **História → Execução** oferece **Iniciar novo ciclo de desenvolvimento**. A confirmação existente explica o retorno à especificação e a necessidade de revisar requisitos/plano técnico, aceitar o destino/base e aprovar outro Gateway antes de gerar código. Checkbox e **Confirmar novo ciclo** são explícitos; Voltar não grava. Não usa Reabrir História, reservado à História cancelada.

O comando existente /api/executions/:id/replan recebe cycleContext do cenário apresentado. Confere persona, hierarquia ativa, versão, execução mais recente, revisão/projeto da integração, vínculo/versão do repositório e ausência de trabalho pendente ou resultado incerto. Mudança do contexto limpa a confirmação na UI e é recusada no comando. UAT/produção/conclusão permanecem bloqueadas. Testing sem integração confirmada não fabrica merge ou aprovação e pede consulta/reconciliação.

Um novo registro de execução preserva a entrega anterior e marca developmentCycleId no cadastro e snapshot; requiresNewG1 volta a ser obrigatório. O guard compartilhado impede comandos e saídas de execuções anteriores, mesmo com conteúdo idêntico e assinatura v3 ainda coincidente. O snapshot mantém a referência à execução anterior e ao contexto da sua entrega; isso não é proveniência completa de squash/commit de integração, reservada à RA-09. Novas preparações dentro desse ciclo carregam o marcador; não há backfill nem reescrita de snapshots anteriores.

Plano técnico já preenchido pode ser reutilizado como **proposta aguardando revisão humana**; o portal não afirma que houve nova análise do agente. Para alterar o conteúdo, use Especificação e aplique a revisão pertinente antes de submeter novamente. Conteúdo igual não recebe revisão documental fictícia, mas precisa de nova autorização do Gateway, metadados atuais e base fixa da RA-08a. A codificação publica por outra execução/MR; não tenta editar o MR já integrado.

Tarefas adicionais/padrão, estados concluídos, evidências e MR anterior permanecem registrados. Tentativas antigas são apresentadas como históricas/desatualizadas, inclusive a integração anterior quando o ciclo novo ainda não tem MR. Tarefa fora da atividade corrente não apresenta aprovação do novo ciclo; **Ir à atividade atual** conduz ao contexto da História. A situação corrente independe da página de histórico consultada.

Release continua opcional em DEV. A associação existente e a composição, inclusive CLOSED, não são alteradas nem reabertas. Referências de planejamento podem passar a desatualizadas e precisam de revisão nos comandos próprios; iniciar ciclo não remove código, atualiza pacote ou promove ambiente.

### Impedimentos e recuperação

Fila, processamento, pausa, lease ativa e integração sem resultado confirmado bloqueiam novo ciclo. O motivo distingue essa pendência da falha do merge já confirmado. Para liberação corrente com resposta incerta, a ação principal é **Verificar resultado da liberação**, reutilizando a reconciliação existente; novo ciclo fica bloqueado em Alternativas. A consulta não repete a escrita GitLab. Observado o MR da mesma revisão já integrado, a liberação torna-se inaplicável e o texto explica que não é necessário retirar Draft; o fato do merge é preservado.

Operação antiga sem confirmação também pode bloquear o ciclo. A interface qualifica a pendência e a consulta pela Auditoria; não promete recuperação indisponível no contexto atual. **Limite explícito:** esta fatia não acrescenta comando genérico para liquidar/reconciliar operações históricas fora da execução corrente. Esse caminho fica no backlog da RA-09; o impedimento não pode ser contornado sobrescrevendo resultados ou código.

Perda de resposta mantém corpo, chave e persona originais na sessão. **Verificar a mesma solicitação** recupera o recibo, mesmo depois de polling/recarga mostrar a nova execução. Não cria outra execução/evento. O contexto de decisão acompanha ações principal/secundárias para não manter uma confirmação antiga quando o impedimento muda.

### Auditoria, métricas e validação

Reutiliza **EXECUTION_REPLANNED**, ACCEPTED/REQUESTED, sem nova ação de catálogo: iniciador humano, runId/previousRunId, comparação de fase/versão e operação da nova execução. Cadastro, snapshot, tentativa, evento e RequestKey confirmam na mesma transação com recorder compartilhado. Falha de auditoria reverte tudo; replay não duplica. Recuperação conserva as ações e autoria existentes de MERGE_PREPARATION. Nenhum prompt, código ou segredo é projetado para a auditoria.

O usuário escolheu explicitamente **manter os indicadores existentes nesta fatia**. Eventos de fila, espera e retrabalho existentes continuam; não se criou contagem específica de ciclos após testing/merge, fórmula, meta ou novo painel. Retentativa HTTP não é novo ciclo.

**116 testes de aplicação únicos**, **8 de auditoria**, build API/web e **92 cenários de navegador** aprovados. Cobertura: integração/testing sem release, contexto/base/vínculo/versão, permissão/hierarquia, trabalho pendente e lease, preservação de release CLOSED/tarefas/MR, barreira entre ciclos com conteúdo igual, novo Gateway, publicação separada, concorrência/replay, rollback do recorder, recuperação por leitura e navegação pela tarefa histórica. Fixtures e controles de worker existem somente em portal_test; nenhum dado de negócio real ou aplicação produzida foi alterado para demonstração.

Revisão UX de fonte e oito capturas desktop/390 px aprovada no recorte. A primeira rodada identificou ausência do botão de recuperação; o caminho foi corrigido. Seletores dos testes também foram alinhados à tarefa histórica, que oculta a aprovação em vez de apresentar botão desabilitado, e ao botão de recuperação do pedido. Relatórios das rodadas anteriores foram preservados; não constituem aprovação. Não se declarou validação assistiva integral.

Publicação com backup privado verificado e PORTAL_PUBLICATION no ledger administrativo externo. **34 tabelas preservadas integralmente**, sem migration ou início de ciclo real. Conferência do portal publicado abriu somente a confirmação e voltou, em desktop/celular, bloqueando qualquer requisição de escrita. História, execução e release reais permaneceram iguais.

A primeira publicação foi revertida automaticamente porque o verificador procurava no JavaScript do navegador um rótulo fornecido pela API. Corrigida a verificação para consultar as duas fontes apropriadas, a mesma imagem testada foi republicada com outro backup. Reversão e preservação das 34 tabelas foram conferidas antes da retentativa; [recibo da tentativa inicial](assets/ra08b-cycles-2026-10-28/publication-attempt1.json) e trilha administrativa preservados.

Evidências: [aplicação](assets/ra08b-cycles-2026-10-28/application-validation-consolidated.json), [auditoria](assets/ra08b-cycles-2026-10-28/audit-validation.json), [navegador final](assets/ra08b-cycles-2026-10-28/browser-validation-final.json), [UX](assets/ra08b-cycles-2026-10-28/ux-review.json), [publicação](assets/ra08b-cycles-2026-10-28/publication.json), [leitura real](assets/ra08b-cycles-2026-10-28/live-validation.json).

### Roteiro manual e sequência

1. Com Ana, Bruno ou Admin, abra Execução de uma História com merge confirmado da revisão corrente. Confira **Iniciar novo ciclo de desenvolvimento**. Voltar na confirmação não altera a História.
2. Para iniciar trabalho real, aceite a confirmação e use Confirmar novo ciclo. A História retorna à especificação, preservando tarefas, MR e associação da release. Sem release também funciona.
3. Revise/aplique a especificação necessária. No Gateway, confira o novo destino/commit e aprove explicitamente para enfileirar código. O MR integrado anterior não será reaberto.
4. Em resposta perdida, use Verificar a mesma solicitação. Em liberação incerta, verifique o resultado antes de abrir ciclo. Consulte Auditoria e as evidências antigas sem alterar a situação atual.
5. Registre **OK RA-08b** ou o problema. A próxima RA-09 trata proveniência e correções posteriores; recuperação histórica, destinos adicionais e integração na branch de release continuam sujeitos às regras próprias. Build/deploy DEV e pacote QA permanecem nas fatias seguintes.


## 27. Recibo RA-09a — referência preservada da integração

**Situação:** implementada, validada e publicada localmente em 28/10/2026. **OK manual pendente.** A primeira fatia da RA-09 registra os metadados de novas confirmações de merge pelo worker, incluindo a conclusão/reconciliação de uma intenção existente. Não captura retroativamente operações já concluídas, resolve toda a proveniência ou associa código a pacote/release.

### Referência e consulta

O provider mantém suas guardas existentes de conta dedicada, namespace/projeto, origem, destino e SHA. Quando o GitLab confirma o MR integrado sem divergência, devolve também merge_commit_sha e squash_commit_sha, normalizados como referências opcionais. A origem revisada continua separada do resultado de integração. Os campos seguem a [API de Merge Requests do GitLab](https://docs.gitlab.com/api/merge_requests/).

O registro usa o merge commit informado; quando ausente, usa o squash commit informado. Guarda ambos separadamente. Não calcula o resultado a partir do HEAD atual nem presume que a origem virou o commit integrado. Se ambos faltarem, inclusive em uma resposta de integração fast-forward sem esses campos, **o merge continua confirmado e a referência fica parcial**. Hash/data opcional inválidos ficam ausentes, sem transformar metadado inválido em fato. Se o GitLab informar o próprio SHA da origem como resultado, esse valor é preservado como informação do provedor, não inferência local.

**Referência da integração** é um detalhe recolhível abaixo da ação corrente na Execução, com estados Referência registrada, Referência parcial e Referência não capturada. Mostra commit revisado na origem, branches, commit integrado, execução/MR, observação e data do merge quando disponível; datas explicitam America/Sao_Paulo. Referências técnicas mostram merge/squash separadamente. A consulta explica que não comprova release, deploy ou conclusão da História.

O detalhe corrente não aparece durante confirmação de outra decisão nem em contexto histórico como se pertencesse à tentativa selecionada. Evidências da Tarefa recebem a referência por operação/sourceId da tentativa correspondente, somente quando seu estado registrado foi succeeded. Uma tentativa antiga falha não recebe a confirmação reconciliada depois. Após outro ciclo, a referência anterior permanece na Tarefa, com aviso de que não autoriza a revisão atual; não migra para a integração ainda inexistente do ciclo novo. Essa adoção enriquece as tentativas já consultadas; não declara migração de todo o acervo/histórico.

### Persistência, auditoria e recuperação

Migration aditiva 202610280005_merge_integration_reference cria **MergeIntegrationReference**, uma referência imutável por operação: execução/História, repositório/versão, projeto/MR, origem/destino, SHA revisado, merge/squash/resultado, autor externo quando informado, data do merge opcional, política gitlab-merge-reference-v1 e instante de observação persistido. Não há backfill. Constraint/trigger conferem correspondência com a operação e a entrega concluídas; runtime tem SELECT/INSERT, sem UPDATE/DELETE/TRUNCATE. Owner também não reescreve por comandos comuns. Rollback vazio é exercitado; havendo registros, recusa descarte.

Captura e confirmação local de merge, tentativa e **MERGE_COMPLETED** participam da mesma transação com o recorder compartilhado. Reutiliza o catálogo existente: resultado SUCCEEDED/COMPLETED para merge observado, autoria agent:merge, iniciador preservado quando capturado, operação e comparação antes/depois. Projeção segura acrescenta integrationReferenceId, sourceSha, integrationSha, mergeCommitSha, squashCommitSha e destino. Nenhuma ação ou aprovação histórica foi inventada; código, prompt e credenciais não entram no registro.

Falha do recorder reverte também a referência e a conclusão local. A intenção/lease continua permitindo consultar o efeito remoto; a recuperação observa a integração existente, sem repetir o PUT de merge. Referência já capturada não é atualizada silenciosamente para outra observação. Provider antigo sem esse contrato mantém ausência explícita; GET da operação/jornada apenas consulta e não grava.

**Limites:** esse registro é uma referência datada do MR, não uma verificação independente de ancestralidade/conteúdo, manifesto de candidata ou prova de que a branch atual ainda contém o código. Recuperação/captura controlada de operações já concluídas ou históricas, enriquecimento de referências parciais, commit de integração/squash na composição da release e demais verificações finais da RA-09 continuam nas fatias próprias. O novo ciclo da RA-08b continua exigindo outro Gateway e preserva a entrega anterior.

### Métricas, validação e publicação

O usuário escolheu explicitamente **manter os indicadores existentes nesta fatia**. Indicadores de integração, fila e retrabalho preservados; sem novas contagens de referências completas/pendentes, fórmulas, metas ou dashboard. Replay/observação não cria outro merge de negócio.

**100 testes de aplicação únicos**, **8 de auditoria**, build API/web e **100 cenários de navegador** aprovados. Cobrem merge comum, squash com/sem merge commit, ausência/invalidade de campos, destino alterado, legacy sem backfill, SQL/runtime/imutabilidade, rollback vazio/populado, falha do recorder e recuperação por leitura, comparação de origem/resultado/HEAD e vínculo histórico sem transferir confirmação a tentativa falha. Navegador exercita consulta por teclado, estados parcial/legado, outro ciclo e evidência da Tarefa em 1440 e 390 px. Revisão UX de seis capturas aprovada após explicitar o aviso histórico e o fuso; sem alegar validação assistiva integral.

Dados sintéticos e controles de worker ficaram somente em portal_test. Publicação com backup privado verificado e PORTAL_PUBLICATION no ledger administrativo externo: **34 tabelas anteriores preservadas**, uma tabela nova inicialmente vazia, sem alteração de aplicação produzida ou artefato/resultado de agente para demonstração. Conferência real somente leitura mostra a ausência de captura na operação antiga, sem converter em falha. O adapter real foi consultado por GET e devolveu os metadados nativos, sem gravar essa observação na fonte de domínio, sem ler arquivos e sem executar merge. GETs não fizeram backfill.

Evidências: [aplicação](assets/ra09a-integration-2026-10-28/application-validation-consolidated.json), [auditoria](assets/ra09a-integration-2026-10-28/audit-validation.json), [navegador final](assets/ra09a-integration-2026-10-28/browser-validation-ready.json), [UX](assets/ra09a-integration-2026-10-28/ux-review.json), [publicação](assets/ra09a-integration-2026-10-28/publication.json), [leitura real](assets/ra09a-integration-2026-10-28/live-validation.json), [provider real somente leitura](assets/ra09a-integration-2026-10-28/live-capability.json).

### Roteiro manual e próxima fatia

1. Na História integrada, abra Execução → Referência da integração. Operações anteriores sem captura aparecem como tal; não é falha do merge nem pedido de aprovação.
2. Em uma nova confirmação real de merge pelo worker, consulte origem, destino, resultado e referências técnicas. O commit integrado pode ser diferente do revisado na origem. Ausência do resultado não será preenchida pelo HEAD.
3. Ao iniciar outro ciclo pela RA-08b, consulte a evidência da Tarefa de Merge anterior. Ela conserva a execução antiga e não aprova o novo ciclo. A auditoria identifica a referência da nova confirmação.
4. Registre **OK RA-09a** ou o problema. A próxima RA-09b tratará captura/reconciliação histórica controlada e continuidade da proveniência; release/candidata e executores de ambiente mantêm seus gates e dependências.


## 28. Recibo RA-09b — captura histórica controlada

**Situação:** implementada, validada e publicada localmente em 28/10/2026. **OK manual pendente.** Esta fatia atende a captura de referência ausente de **MergeOperation já succeeded**, atual ou de uma execução anterior cuja História/contexto permanecem ativos. O merge continua sendo o fato original; a captura é outra observação, registrada no momento da confirmação humana. Sem migration, backfill automático, execução de agente ou escrita GitLab.

### Jornada e contrato

Em **Execução → detalhe da referência da integração**, Consultar referência no GitLab consulta metadados pelo provider dedicado e apresenta **Consulta ao GitLab — ainda não registrada**. Prévia identifica repositório, MR, execução, origem/destino, commit revisado e resultado informado, além da data da consulta em America/Sao_Paulo. Falta de merge/squash informado antecipa referência parcial; não assume origem ou HEAD como resultado integrado.

Registrar referência consultada exige checkbox e persona Admin, Product Owner ou Arquiteto. Trocar persona/contexto limpa a aceitação; contexto ou dado remoto alterado é recusado e preserva a leitura anterior qualificada, exigindo Atualizar consulta ao GitLab. Voltar não grava e restaura foco ao botão de consulta; durante atualização ele fica indisponível e a consulta pode ser abortada ao sair do componente. Sucesso tem anúncio e foco no resumo do resultado, sem mover foco por polling.

A Tarefa anterior consulta/registra **sua operação/sourceId**, mesmo que a História já esteja em outro Gateway. O aviso distingue registro de metadados das ações do processo pertencentes à atividade atual. A captura não usa autorização de pipeline antiga para gerar/corrigir código, integrar, aprovar desenvolvimento ou promover release; não altera História, execução, MR, composição ou estados anteriores. Contextos arquivados, inativos, cancelados/concluídos permanecem sujeitos às guardas de escrita existentes.

GET /api/merge-operations/:id/integration-reference-review valida o vínculo de História/execução/repositório e confirma os mesmos projeto, MR, branches e SHA no GitLab. Leituras locais antes/depois do HTTP verificam a versão da História e do repositório/contexto; HTTP não mantém transação aberta. A prévia não cria fonte, evento de domínio ou RequestKey. Consultar não confirma nem autoriza captura.

POST /api/merge-operations/:id/integration-reference requer confirmed, contexto e observação exatos da prévia. Reconsulta o provider por GET, compara a tupla e repete a conferência local na transação. Exige operação/execução já concluídas com o mesmo SHA e o repositório do Sistema correspondente. **Não exige que a execução antiga seja a mais recente ou conserve aprovação de código vigente**, pois o comando apenas observa sua integração já confirmada. Não chama merge/releaseDraft, lê arquivos ou altera branches.

### Fonte imutável, autoria e recuperação

O registro usa MergeIntegrationReference da RA-09a, preservando a primeira fonte imutável. Comandos concorrentes criam uma referência; a intenção já satisfeita retorna NO_CHANGE e compara os mesmos campos anteriores/novos. Fonte parcial existente não é enriquecida/sobrescrita por esta API. Enriquecimento versionado fica para outra fatia.

Nova ação explícita **MERGE_INTEGRATION_REFERENCE_CAPTURED**, SUCCEEDED ou NO_CHANGE / COMPLETED / NOT_APPLICABLE, efeito observation, com ator/iniciador humano da captura. Alvo/correlação da operação antiga, runId e referências seguras identificam a observação; autoria, origem e instante do merge original não são reatribuídos à persona atual. MERGE_COMPLETED anterior não é reescrito ou repetido.

Fonte, evento e RequestKey confirmam na mesma transação com recorder compartilhado. Falha de auditoria reverte fonte e chave. Chave/corpo/persona originais recuperam o recibo **antes de consultar o GitLab**, inclusive quando ele está indisponível ou a História já mudou. Se a intenção for aceita enquanto outra consulta concorrente falha, o cache confirmado é conferido novamente, sem inventar rejeição de uma operação aceita. Nova chave concorrente pode produzir NO_CHANGE; replay da mesma chave não cria outro evento.

Recusas/falhas desta rota passam a apontar a História e a operação correspondentes por COMMAND_REJECTED/FAILED, com reasonCode no envelope, requestId e autoria. Operação inexistente conserva alvo de requisição, sem inventar História. Essa adoção está restrita às rotas novas; não declara migração dos demais produtores de recusa.

No navegador, useOperation mantém a intenção por operationId. Resposta perdida conserva Verificar resultado do registro mesmo se polling já mostrar referência registrada ou a leitura seguinte falhar. Enquanto o recibo não chega, novas decisões/edição do fluxo ficam bloqueadas; consultas às abas continuam disponíveis. O workspace guarda a recuperação na sessão, incluindo corpo/chave/persona, e oferece banner e painel de verificação nas outras abas ou quando a referência original sai do contexto. Após confirmar, o painel mantém o recibo até Voltar à consulta atual, que foca a aba ativa. Recibo conhecido no workspace prevalece sobre uma leitura anterior quando o GET falha. Essa persistência local não representa autenticação corporativa ou funcionamento do portal inteiro sem conexão.

### Métricas, validação e limites

O usuário escolheu **manter os indicadores existentes nesta fatia**. Não há contagem nova de capturas históricas, fórmula, meta ou painel. Captura/replay não aumenta a quantidade de merges de negócio; indicadores anteriores de integração/fila/retrabalho permanecem.

**86 testes de aplicação únicos**, **8 de auditoria**, build API/web e **114 cenários de navegador** aprovados. Cobrem prévia sem escrita, papel/confirmação, contexto/observação alterados, execução histórica com ciclo atual diferente, concorrência e NO_CHANGE, recibo aceito durante falha de leitura concorrente, rollback do recorder, replay offline após mudança da História, referência parcial/imutável e ausência de escrita remota. Browser valida troca de persona, preservação da prévia, resposta perdida/recarga, tentativa anterior, GET falho após sucesso, bloqueio do novo ciclo pendente, recuperação pela Auditoria, consulta em andamento e foco/anúncios em 1440 e 390 px.

Revisão UX de fonte e 12 capturas aprovada após corrigir persistência da recuperação, bloqueio do fluxo e retorno de foco. Rodada inicial de 112 cenários passou tecnicamente, mas a revisão identificou que outro ciclo poderia esconder o recibo pendente; o coordenador e os cenários adicionais tratam esse caso. Capturas de recuperação são instrumentação da cópia descartável dos testes, na mesma imagem final, sem alterar dados de negócio. Não foi declarada validação assistiva integral.

Dados e controles sintéticos ficaram somente em portal_test. Publicação com backup privado verificado e PORTAL_PUBLICATION externo: **35 tabelas preservadas integralmente**, sem migration ou captura real de demonstração. A leitura real abriu a consulta do GitLab, verificou a confirmação desmarcada e voltou, em desktop/celular; referência, RequestKey e eventos de captura permaneceram iguais. História/execução/release reais não foram alteradas.

**Permanecem pendentes:** operações cujo merge ainda não está confirmado, reconciliação genérica de jobs históricos, enriquecimento versionado de referências parciais e proveniência/composição de candidata/release. Esta fatia não encerra toda a RA-09 nem instala build/deploy DEV ou pacote QA.

Evidências: [aplicação](assets/ra09b-capture-2026-10-28/application-validation-consolidated.json), [auditoria](assets/ra09b-capture-2026-10-28/audit-validation.json), [navegador final](assets/ra09b-capture-2026-10-28/browser-validation-published.json), [UX](assets/ra09b-capture-2026-10-28/ux-review.json), [publicação](assets/ra09b-capture-2026-10-28/publication.json), [consulta real](assets/ra09b-capture-2026-10-28/live-validation.json), [preservação da prévia](assets/ra09b-capture-2026-10-28/live-query-preservation.json).

### Roteiro manual e sequência

1. Abra a História integrada com referência não capturada, ou Evidências da Tarefa de Merge anterior. Expanda o detalhe e use Consultar referência no GitLab. Confira MR, branches, revisão e resultado; Voltar não registra.
2. Com Ana, Bruno ou Admin e contexto ativo, marque a confirmação e use Registrar referência consultada para gravar a observação real. A fase da História e o merge não mudam. O evento aparece em Auditoria com autoria da captura.
3. Se a resposta não chegar, use Verificar resultado do registro com a persona original. Você pode consultar Auditoria e recuperar pelo banner persistente; iniciar outro ciclo fica bloqueado até resolver o recibo.
4. Confira o registro histórico depois do novo ciclo e que ele não aprova a revisão atual. Se houver dados parciais, a fonte permanece parcial e imutável.
5. Registre **OK RA-09b** ou o problema. A próxima RA-09c tratará operações históricas ainda incertas e a continuidade da proveniência; as demais dependências de release/ambientes continuam no plano.


## 29. Recibo RA-09c — confirmação histórica posterior

**Situação:** implementada, validada e publicada localmente em 28/10/2026. **OK manual pendente.** Esta fatia confirma somente resultado **positivo** comprovado pelo GitLab para operação de execução anterior cujo estado local permaneceu tracking/blocked/failed. Operação atual mantém seu fluxo de acompanhamento/worker; a RA-09b continua capturando referência ausente de merge já confirmado. Não há migration, adequação automática de dados ou nova escrita GitLab.

### Jornada e distinção dos fatos

Na **Tarefa de Merge anterior → Evidências**, o resultado originalmente registrado continua identificado. O detalhe separado começa como **Resultado da integração ainda não confirmado** e oferece **Verificar resultado no GitLab**. A prévia é datada e não grava; identifica repositório, execução, MR, origem/destino e SHA esperados, inclusive quando o MR continua aberto, fechado ou divergente. Esses impedimentos explicam por que não há confirmação possível e mantêm botão/checkbox indisponíveis. Fechar um MR não comprova merge.

Se a consulta comprovar a mesma integração, a persona autorizada pode marcar o checkbox e usar **Registrar confirmação de merge**. Trocar persona/contexto limpa o aceite; mudança local/remota exige consulta explícita nova. Erro mantém a prévia anterior qualificada, sem considerá-la vigente. Voltar não grava e retorna foco ao iniciador; durante a consulta ele permanece desabilitado. Sucesso anuncia **Confirmação histórica registrada nesta operação** e foca o resumo.

Após confirmação, **Merge confirmado em verificação posterior** permanece separado de **Resultado registrado nesta tentativa**. WorkAttempt, WorkEvent, Tarefa, execução antiga, História, ciclo atual e releases não mudam. Uma tentativa falha não herda a referência de outra confirmação indiscriminadamente: a projeção exige a ocorrência explícita MERGE_HISTORY_RECONCILED posterior ao resultado original da tentativa. Essa consulta canônica seleciona operação/instante fora da janela paginada de Auditoria; mudar de página ou filtro não muda o fato. Registros succeeded anteriores mantêm a leitura RA-09a/09b.

### Comando, concorrência e fonte

GET /api/merge-operations/:id/historical-reconciliation-review exige execução **diferente da mais recente da mesma História**, entrega de código succeeded com o mesmo SHA, hierarquia ativa e repositório único correspondente ao projeto GitLab. Recusa estados queued/running/paused/cancelled, lease vigente, trabalho ainda em andamento e preparação/liberação pendente, inclusive resultado incerto da liberação. Leituras locais antes/depois do provider comparam História/repositório/revisões/contexto; HTTP ocorre fora da transação. MR aberto/fechado/divergente tem leitura não confirmável com referência esperada preservada, sem criar fonte, chave ou evento de domínio.

POST /api/merge-operations/:id/historical-reconciliation exige confirmação, contexto e observação exatos. Reconsulta somente provider.inspect, compara a tupla projeto/MR/branches/SHA e revalida contexto/atividade na transação compartilhada. Não chama provider.merge/releaseDraft, não enfileira agente e não altera arquivos/branches. Contexto/G1 antigos não concedem autorização para o processo atual.

A situação corrente da operação antiga passa a succeeded com data/autor externo informados pelo GitLab; ausência de data permanece nula. actorId/actorName/requestedAt originais são preservados. O resultado da tentativa original continua em sua fonte. A referência usa a política gitlab-merge-reference-v1 e as constraints/triggers existentes; a operação é atualizada antes da inserção na **mesma transação**, sem relaxar a validação do banco. A primeira MergeIntegrationReference continua imutável, inclusive se parcial; não se assume origem/HEAD como commit integrado.

Fonte, atualização da operação, evento e RequestKey confirmam ou revertem juntos. A chave original devolve o mesmo recibo antes do HTTP, inclusive após mudança da História ou indisponibilidade GitLab. Consulta concorrente que falhe depois de a mesma intenção ser aceita confere o cache novamente. Intenções distintas concorrentes produzem uma confirmação e NO_CHANGE explícito, sem repetir integração ou sobrescrever fonte.

### Auditoria, experiência e métricas

Nova ação explícita **MERGE_HISTORY_RECONCILED**, SUCCEEDED/NO_CHANGE, COMPLETED, NOT_APPLICABLE, efeito observation. Autor/iniciador humano corresponde à confirmação posterior; alvo/correlação apontam a operação anterior e runId. Compara estado, finishedAt, origem, autor externo e referência anterior/nova. Projeção segura admite finishedAt/origin/mergedBy; mensagens livres/blocos brutos do provider permanecem nas fontes controladas e não são duplicados no envelope. Resultado original e identidade de quem solicitou o merge não são reatribuídos. Não cria MERGE_COMPLETED, aprovação, conclusão de Tarefa/História ou deploy. Recusas/falhas usam a adoção contextual das rotas merge-operations da RA-09b; não declara migração de outros produtores.

Recuperação persistente da RA-09b conserva endpoint, corpo, chave e persona por operação. Resposta perdida pode ser verificada após recarga ou pela Auditoria, mesmo que a referência já apareça registrada ou o GET seguinte falhe. Novas decisões ficam bloqueadas enquanto o recibo está pendente; consulta às abas continua disponível. Painel mantém o resultado até Voltar à consulta atual, com foco na aba ativa. Não foi criado novo shell, aba ou coleção de operações.

O usuário escolheu **manter os indicadores existentes nesta fatia**. Não há contagem/fórmula/meta/painel novo. Observação posterior não gera MERGE_COMPLETED nem multiplica merges por replay; indicadores de integração, fila e retrabalho mantêm seus contratos.

### Validação, publicação e limites

**112 testes de aplicação únicos**, **8 de auditoria**, build API/web e **126 cenários de navegador** aprovados. Os 26 testes novos de API cobrem consulta sem escrita, papel/aceite, execução anterior, MR aberto/fechado/indefinido, divergência de tupla, drift local/remoto, concorrência/NO_CHANGE, cache aceito durante leitura concorrente falha, replay offline, rollback da operação/fonte/chave e guardas de atividade/lease/preparação. Regressões preservam a regra de não herdar sucesso em tentativa falha sem confirmação posterior explícita e os contratos de ciclo/métricas.

Doze cenários novos de navegador, nos viewports 1440/390, cobrem separação de fatos, permissão/troca de persona, foco, prévia impedida com MR/branches/SHA, divergência remota, GET falho após sucesso e resposta perdida/recarga/Auditoria com pedido original. Revisão UX de fonte e dez capturas no recorte, sem declarar validação assistiva integral ou migração global de consultas legadas.

Dados simulados permaneceram somente em portal_test. Publicação pela trilha administrativa externa PORTAL_PUBLICATION, com backup privado verificado e **35 tabelas preservadas**, sem migration. A conferência real fez somente GET: prévia da referência do merge existente nos dois tamanhos, retorno sem gravar e recusa da execução atual pela rota histórica. Nenhuma confirmação histórica ou referência real foi criada, nem foram alterados dados de negócio/resultados de agentes para demonstrar a função. Não havia caso histórico incerto real para demonstrar o comando positivo; essa parte foi validada isoladamente.

**Limites:** esta fatia não declara reconciliação negativa/encerramento de MR sem merge, cancelamento de intenção incerta, liberação Draft incerta, catálogo completo de operações sem WorkAttempt, enriquecimento de fonte parcial ou proveniência/composição de candidata/release. Uma operação antiga sem merge permanece impedida, sem fabricar sucesso; sua resolução explícita é a próxima RA-09d. A RA-09 agregada continua parcial e os executores DEV/QA/HML/PRD seguem nas etapas próprias.

Evidências: [aplicação](assets/ra09c-history-2026-10-28/application-validation.json), [auditoria](assets/ra09c-history-2026-10-28/audit-validation.json), [navegador](assets/ra09c-history-2026-10-28/browser-validation.json), [UX](assets/ra09c-history-2026-10-28/ux-review.json), [publicação](assets/ra09c-history-2026-10-28/publication.json), [consulta real](assets/ra09c-history-2026-10-28/live-validation.json), [preservação dos dados](assets/ra09c-history-2026-10-28/live-query-preservation.json).

### Roteiro manual e sequência

1. Em uma Tarefa de Merge de execução anterior com resultado sem confirmação, abra Evidências. Confira o resultado original e o detalhe Resultado da integração ainda não confirmado. Não crie situações artificiais na base humana para testar: se não houver caso, consulte as capturas isoladas desta entrega.
2. Use Verificar resultado no GitLab. Confira MR, execução, branches e SHA. Voltar não registra. MR aberto/fechado/divergente explica o impedimento e mantém a confirmação indisponível.
3. Se houver merge comprovado, com Ana/Bruno/Admin e contexto ativo, marque o aceite e registre a confirmação. Confira o resultado posterior separado, sem alteração da tentativa/Tarefa nem aprovação do ciclo atual.
4. Se a resposta não chegar, verifique a mesma solicitação com a persona original. Auditoria e recarga preservam a recuperação; confira autoria, operação, comparação e referência no evento.
5. Registre **OK RA-09c** ou o problema. Próxima RA-09d: resolver explicitamente integrações anteriores sem merge confirmado; proveniência/composição e ambientes permanecem no plano.


## 30. Recibo RA-09d — encerramento do acompanhamento histórico

**Situação:** implementada, validada e publicada localmente em 28/10/2026. **OK manual pendente.** Esta fatia encerra somente o **acompanhamento local** de pedido anterior quando o GitLab comprova MR **closed**, para a mesma revisão/projeto/branches, sem metadados de merge nem agendamento. Não fecha ou cancela MR no GitLab, não remove código e não afirma ausência permanente de integração. MR aberto/divergente/indisponível permanece impedido; merge comprovado usa RA-09c. O próximo encerramento remoto de MR aberto é RA-09e, ainda não executado.

### Jornada e motivo

Em **Tarefa de Merge anterior → Evidências → Verificar resultado no GitLab**, a leitura preserva MR, execução, branches, SHA e instante. Quando elegível, apresenta **Encerrar acompanhamento do pedido anterior**, com motivo de 10–2000 caracteres e checkbox explícito. O texto explica que retira a pendência local desse pedido, preservando tentativa original e ciclo atual. Trocar persona/contexto ou editar o motivo limpa o aceite. Motivo permanece na sessão por operação após falha, atualização, Voltar e navegação; pedido sem resposta conserva o corpo original. O rascunho é retirado após recibo confirmado do encerramento. Permissões Admin/PO/Arquiteto e hierarquia ativa são conferidas no comando.

Resultado mostra **Pedido anterior encerrado · Sem merge confirmado naquela consulta**, com autoria, motivo, instante da consulta e decisão. A falha original continua acima do detalhe, em vermelho, sem herdar sucesso. Nenhum ramo resolved diz merge confirmado ou inventa commit integrado. Reconsultar o mesmo MR ainda fechado é leitura neutra, sem outra ação de registro; Voltar restaura foco. A consulta continua disponível para detectar mudança posterior.

### Fonte imutável e contrato

Migration aditiva **202610280006_merge_history_resolution** cria MergeHistoryResolution, uma fonte por operação, com execução/História/repositório/revisão, tupla do MR, observedState=closed, observedAt, decidedAt, autoria, motivo e política **gitlab-closed-mr-observation-v1**. Não preenche legado. Trigger confere operação cancelled, entrega de código succeeded com mesmo SHA/projeto/branches/repositório e ausência de MergeIntegrationReference no instante da criação. Fonte permite SELECT/INSERT à conta runtime, com bloqueio de UPDATE/DELETE/TRUNCATE. Rollback vazio é testado; com fonte registrada recusa descarte. Confirmação positiva posterior preserva essa fonte.

A revisão reaproveita GET /api/merge-operations/:id/historical-reconciliation-review. O provider dedicado só fornece prova de fechamento se os campos de merge forem **explicitamente null**, merge_when_pipeline_succeeds for **explicitamente false**, sem outro sinal de auto-merge/data agendada, e a identidade/tupla forem conferidas. Campo ausente, inválido ou positivo não é convertido em ausência de merge. Regras baseadas no [contrato oficial GitLab](https://docs.gitlab.com/api/merge_requests/), implementadas no adapter e testadas com ausência, dados contraditórios, fork, revisão/destino diferentes e agendamento. Nenhum novo método de escrita foi exposto.

POST /api/merge-operations/:id/historical-closure exige confirmação, motivo, token e observação exatos da prévia. Consulta novamente o provider por GET; compara contexto e prova antes de entrar na mutação compartilhada. A guarda comum exige execução **anterior à mais recente da História**, mesmo commit de código concluído, repositório herdado correspondente e contexto ativo. Recusa lease, trabalho ou preparação/liberação ainda pendente, inclusive liberação com resultado incerto. Integração ou tentativa succeeded já registrada impede substituição por encerramento negativo.

Na mesma transação/lock, operação antiga passa a cancelled e recebe mensagem/instante correntes do encerramento, enquanto fonte imutável, evento e RequestKey são criados. Identidade e data do pedido original permanecem. WorkAttempt/WorkEvent, Tarefa, História, execução atual, composição/release e gates não mudam. A retirada do impedimento antigo é testada com ciclo atual separadamente confirmado; o encerramento não aprova esse ciclo. API não chama merge, releaseDraft, criação de trabalho ou escrita remota.

HTTP externo não mantém transação aberta. A consulta descreve o estado **observado naquele instante**; não há transação distribuída entre GitLab e banco nem promessa de impedir reabertura/integração posterior no provedor. A semântica do comando é encerrar acompanhamento local, preservando essa limitação na tela/fonte. Operação cancelled sem esta fonte continua sujeita às guardas antigas, sem reinterpretar cancelamentos legados.

### Retentativa, merge posterior e auditoria

Resposta perdida mantém chave, corpo, endpoint e persona originais. Replay retorna o recibo antes do HTTP, mesmo após mudança do contexto/indisponibilidade. Consulta concorrente que falhe depois da aceitação confere o cache novamente. Intenções distintas concorrentes criam uma fonte e SUCCEEDED/NO_CHANGE explícitos; a primeira decisão/motivo permanece imutável. Falha do recorder desfaz fonte, atualização da operação e chave.

Se o MR depois for integrado, RA-09c permite consulta/registro positivo da operação encerrada **somente porque há fonte explícita de encerramento**, preservando-a. Situação corrente da operação passa a succeeded e a referência integrada é outra fonte. Recibo antigo do encerramento continua descrevendo sua decisão original, mas **não rebaixa o merge posterior conhecido**. O workspace e o painel de recuperação resolvem operação contra fatos atuais de activities/merge antes do snapshot de fallback e dos recibos; fonte positiva prevalece. Falha do GET seguinte preserva a leitura positiva conhecida. A recuperação pela Auditoria mantém ambos visíveis, com retorno de foco à aba ativa.

Nova ação catalogada **MERGE_HISTORY_CLOSED**, SUCCEEDED/NO_CHANGE, COMPLETED, NOT_APPLICABLE, efeito local. Ator/iniciador humano corresponde à decisão posterior; alvo/correlação e runId apontam à operação anterior. Comparação segura registra estado, finishedAt, historyResolutionId e reasonDigest anteriores/novos. Motivo bruto fica na fonte controlada; não é duplicado no payload/envelope. Rejeições/falhas usam o contrato contextual merge-operations existente, sem declarar migração dos demais produtores. Não há MERGE_COMPLETED, conclusão de Tarefa/História, aprovação ou deploy.

### Validação, métricas e publicação

O usuário escolheu **manter os indicadores existentes nesta fatia**. Sem contagem/fórmula/meta/painel de encerramentos. Eventos originais continuam preservados; replay não é outra ocorrência de negócio. Os contratos de integração, fila e retrabalho permanecem.

**171 testes de aplicação únicos**, **8 de auditoria**, build API/web e **140 cenários de navegador** aprovados. Incluem 33 testes de encerramento histórico e 26 do adapter/merge, guardas, fonte/conta restrita, rollback de transação/migration, concorrência/NO_CHANGE, motivo/papel/aceite, deriva, cache offline e merge posterior que conserva a decisão. Os 14 cenários novos de navegador em 1440/390 cobrem motivo/aceite/persona, retorno e navegação, consulta falha/GET posterior, reconsulta neutra, resposta perdida/recarga/Auditoria e replay de encerramento após merge posterior conhecido. Revisão UX de fonte e capturas no recorte, sem alegar validação assistiva integral.

Rodada inicial de navegador teve 138 aprovações e duas falhas: controles da simulação chegaram indevidamente na observação estrita do provider de teste; foram separados sem afrouxar o contrato de produção. Revisão visual ajustou o motivo para largura disponível/3–4 linhas e acrescentou capturas do topo com resultado original. A captura recorded-top-390 repete o recorte inferior; não foi declarado esse topo específico visualmente validado no celular. Dados e controles sintéticos permaneceram somente em portal_test.

Publicação PORTAL_PUBLICATION na trilha administrativa externa, backup privado verificado, **35 tabelas anteriores preservadas** e uma tabela nova vazia, totalizando 36. A conferência real fez somente GET: prévia/Voltar em desktop/celular e guarda de execução atual. Contagens de fontes, chaves e eventos ficaram iguais; nenhuma decisão ou referência real foi criada para demonstração. Não foram alterados dados de negócio, código produzido ou resultados reais dos agentes. A nova migration não implica adoção retroativa dos fluxos não migrados.

**Limites:** não encerra MR aberto no provedor, não resolve liberação incerta, não cria catálogo completo de operações sem WorkAttempt, não enriquece referência parcial e não compõe candidata/pacote/deploy. RA-09 agregada continua parcial; RA-09e tratará encerramento remoto controlado de MR histórico aberto pelo portal, com autorização/contexto/resultado próprios. Proveniência/composição e ambientes mantêm suas entregas dependentes.

Evidências: [aplicação](assets/ra09d-closure-2026-10-28/application-validation.json), [auditoria](assets/ra09d-closure-2026-10-28/audit-validation.json), [navegador](assets/ra09d-closure-2026-10-28/browser-validation.json), [UX](assets/ra09d-closure-2026-10-28/ux-review.json), [publicação](assets/ra09d-closure-2026-10-28/publication.json), [consulta real](assets/ra09d-closure-2026-10-28/live-validation.json), [preservação dos dados](assets/ra09d-closure-2026-10-28/live-query-preservation.json).

### Roteiro manual

1. Em uma Tarefa de Merge de execução anterior com resultado incerto, abra Evidências e Verificar resultado no GitLab. Confira MR, execução, branches, SHA e data. Se não houver caso real elegível, use as capturas isoladas; não crie situação artificial na base humana.
2. Com MR comprovado fechado e contexto ativo, preencha motivo, marque aceite e use Encerrar acompanhamento do pedido anterior. Confira decisão, autoria, data e motivo, mantendo a tentativa original e o ciclo atual.
3. Consulte novamente: MR ainda fechado mostra acompanhamento já encerrado; Voltar não grava. MR aberto/divergente/indisponível permanece impedido. Sem prova suficiente, o encerramento não fica disponível.
4. Se a resposta não chegar, verifique a mesma solicitação com a persona original, inclusive pela Auditoria/recarga. Se houver merge posteriormente comprovado, registre a confirmação; confira que o encerramento anterior e o novo fato continuam separados.
5. Registre **OK RA-09d** ou o problema. A próxima RA-09e mantém o objetivo de resolver MR histórico aberto pelo próprio portal; candidatas/ambientes continuam no plano.


## 31. Recibo RA-09e — fechamento remoto do MR anterior

**Situação:** implementada, validada e publicada localmente em 28/10/2026. **OK manual pendente.** Complementa RA-09c/09d na Tarefa anterior: permite fechar MR ainda aberto pelo portal, mantendo pedido recebido, efeito remoto observado e encerramento local como fatos diferentes. Não executa merge, altera código/branches, conclui Tarefa/História ou aprova o ciclo atual.

### Jornada

Em **Tarefa de Merge anterior → Evidências → Verificar resultado no GitLab**, consulta elegível oferece **Fechar Merge Request anterior**, com motivo e aceite explícito da mesma execução/MR/branches/SHA. Alterar motivo/persona/contexto invalida aceite; motivo persiste por operação e é reaproveitado na decisão local posterior. Somente Admin/PO/Arquiteto, em contexto ativo, pode solicitar a escrita.

**Fechamento solicitado** confirma recebimento na fila. O acompanhamento preserva identidade do MR, execução, branches, commit, motivo, autoria e sinal registrado; uma resposta HTTP accepted não anuncia fechamento nem confirmação de integração. Job queued/running permanece consultável por leitura própria; ausência de sinal recente deixa de representar execução recente. Polling não move foco nem anuncia sucesso de uma decisão humana.

**Resultado do fechamento ainda não confirmado** oferece **Verificar resultado do fechamento**, que reconcilia o mesmo job por consulta. **Fechamento impedido** usa destaque vermelho, causa e orientação de nova revisão. MR ainda aberto na reconciliação não é sucesso: a tentativa anterior permanece não confirmada, e uma nova escrita exige outro pedido/revisão/aceite. Nenhum GET ou replay de resposta perdida autoriza repetir PUT no mesmo job.

**MR fechado no GitLab** aponta explicitamente a pendência local: usar a consulta para revisar/confirmar **Encerrar acompanhamento do pedido anterior** da RA-09d. O motivo permanece preenchido, sem aceite automático. Se já estava fechado antes da execução, a mensagem identifica a observação sem atribuir a escrita ao assistente. Se o GitLab informar **MR integrado**, não há sucesso de fechamento: a consulta/registro positivo usa RA-09c e preserva o pedido de fechamento.

Recebimento perdido conserva endpoint/corpo/chave/persona no scope de recuperação existente. Após ACK, o job continua disponível por fonte durável e banner em outras abas/recarga. Um recibo cached queued não rebaixa a versão mais nova do job, tampouco integração positiva conhecida. Leitura falha preserva fatos anteriores datados; fato novo da jornada limpa aviso de polling obsoleto. A recuperação usa leitura por operação e o contexto atual antes do snapshot de fallback. Não foi criada nova aba, shell ou lista de histórico truncada apresentada como completa.

### Fonte, autorização e executor

Migration aditiva **202610280007_merge_history_close_operation** cria MergeHistoryCloseOperation, com tupla autorizada, contexto digest, atualização remota observada, motivo, ator original, datas, versão, lease e marcador de intenção. Aprovação original é imutável; UPDATE permitido somente nos campos de execução, exigindo versão crescente, sem apagar marcador de escrita/reconcileOnly. DELETE/TRUNCATE e rollback populado recusam perda de pedidos. Índice parcial impede dois pedidos ativos do mesmo MR/operação. Não há backfill.

POST /api/merge-operations/:id/remote-close exige motivo/confirmed/token/observação exatos e reconsulta GitLab antes da mutação. Confere execução anterior à atual, código concluído, SHA, repositório único do Sistema, identidade/projeto/branches, ausência explícita de merge/agendamento e updatedAt remoto válido. Recusa fonte/tentativa de integração já confirmada, trabalho, lease/liberação ou outro fechamento pendentes. Uma nova aprovação cria outra linha; não reescreve o motivo/contexto anterior. Aceitação e RequestKey/evento confirmam juntos.

O worker usa a fila de integração existente, sem criar Tarefa ou inferência. Grava claim e intenção **antes da escrita**, com lease e revalidação de contexto. Adapter dedicado da conta sdlc-agent-for-merge expõe somente closeHistorical: consulta, exige fonte gerenciada sdlc/, compara revisão/updatedAt, envia **state_event=close** no MR fixado e consulta novamente. Namespace, projeto, branches e SHA continuam guardados; não recebe método/URL/body arbitrários nem altera proteções. [Contrato GitLab](https://docs.gitlab.com/api/merge_requests/).

O fechamento REST utilizado não fornece CAS por SHA neste adapter. Releituras antes/depois detectam deriva observada e impedem confirmação/avanço, mas não garantem atomicidade entre última leitura e PUT, nem transação distribuída. Não há tentativa automática de desfazer fechamento em caso de deriva; o resultado fica não confirmado para reconciliação. Essa limitação não é apresentada como proteção atômica.

Falha após efeito remoto ou vencimento do lease mantém intenção; recuperação do mesmo job consulta antes de confirmar, sem outro close. Falha de auditoria de conclusão não apaga o marcador persistido: lease recuperado reconcilia por GET. Falha do recorder da aceitação reverte job/chave; falha ao gravar intenção impede PUT. MR já closed/merged antes da escrita é observado sem PUT e não cria resultado de código ou conclusão local.

POST /api/merge-operations/:id/remote-close/:jobId/reconcile recebe outro pedido idempotente de consulta, preservando aprovação original e usando reconcileOnly. Duplicata ativa/concluída produz NO_CHANGE explícito, sem nova execução. GET /api/merge-operations/:id/remote-close é somente leitura. Autoria do pedido original permanece; consulta humana tem evento próprio, e o executor conserva iniciador da intenção durável.

### Ciclo de vida, auditoria e métricas

Novo ciclo considera fechamento queued/running/unknown/paused e lease vigente. Integração antiga não compete pelo mesmo MR enquanto há fechamento ativo. Inativação/encerramento da hierarquia e cancelamento da História consideram o executor running; filas entram em pausa e retomada explícita existentes. Pedido interrompido antes de escrita não executa depois; efeitos já incertos permanecem disponíveis para observação. Reconciliação explícita é somente leitura remota mesmo em contexto inativo/terminal, sem liberar nova escrita. A apresentação completa do acervo e catálogo integral de pedidos antigos continuam fora desta fatia.

Oito ações explícitas: MERGE_HISTORY_CLOSE_REQUESTED e RECONCILIATION_REQUESTED (ACCEPTED/REQUESTED, NO_CHANGE/COMPLETED quando aplicável); STARTED e WRITE_PLANNED (SUCCEEDED/STARTED); COMPLETED (SUCCEEDED/COMPLETED, efeito externo); BLOCKED (DEFERRED/WAITING, NOT_EVALUATED); UNCONFIRMED (UNKNOWN/OBSERVED); MERGED (SUCCEEDED/OBSERVED, observação de outro resultado). Todas usam recorder/transaction, alvo/correlação do job, runId, ator original/iniciador e executor. Antes/depois incluem estado/versão e marcador quando aplicável. Motivo bruto e conteúdo ficam nas fontes; auditoria recebe digest/referências seguros. Pausa/retomada/cancelamento continuam nas ações já existentes da hierarquia/História, sem declarar migração de todos os produtores.

A projeção canônica inclui pendências por Story independentemente da janela de tentativas/Auditoria, e a leitura específica recupera o último job da operação. Versão monotônica impede ACK antigo mascarar sucesso recente. O usuário escolheu **manter os indicadores existentes nesta fatia**: sem painel/contagem/fórmula/meta nova de fechamento. Nenhum MERGE_COMPLETED é criado por fechar MR, reconciliar ou repetir ACK; métricas de integração/fila/retrabalho mantêm seus contratos.

### Validação e publicação

**219 testes de aplicação únicos**, **8 de auditoria**, build API/web e **154 cenários de navegador** aprovados. Incluem 32 testes da operação durável e 31 do adapter/merge, aceite/role, contexto remoto/local, concorrência/replay, marker/rollback, lease vencido, fechamento já ocorrido, integração concorrente, fonte protegida, pausa/retomada e consulta inativa. Consulta sem referência capturada agora projeta a tupla local conhecida, mantendo ausência explícita de commit integrado/observação e sem inserir fonte/evento; o contrato de teste foi ajustado para essa leitura enriquecida.

Os 14 cenários novos de navegador em 1440/390 cobrem identidade após ACK, banner durável/Auditoria/recarga, recebimento perdido seguido de job concluído, resposta perdida do provider com apenas um close, impedimento/nova revisão, MR integrado distinto de fechado e erro de polling obsoleto. Controladores de teste aguardam a transação de aprovação/fila antes de simular mudança externa ou execução; isso não afrouxa os checks da aplicação. Revisão UX de fonte e dez capturas no recorte; alguns recortes não mostram o topo inteiro sob o cabeçalho fixo, sem alegação de validação assistiva integral.

Publicação com backup privado e ledger externo PORTAL_PUBLICATION: **36 tabelas anteriores preservadas**, uma nova tabela vazia, total 37, sem decisões de negócio de demonstração. Leitura real validou prévia/Voltar desktop/celular, leitura do fechamento e guarda de execução atual. Nenhum MR real foi fechado, nenhum resultado de agente/aplicação foi alterado, e nenhuma operação/fonte/chave foi criada para demonstrar a função. O PUT de fechamento foi validado com provider controlado e testes do adapter; não foi exercitado contra MR real. Dados simulados ficaram somente em portal_test.

**Limites:** não compõe código/candidata, não cria deploy DEV ou pacote QA, não resolve liberação Draft incerta nem enriquece referência parcial. Fechamento remoto e decisão local permanecem separados; deriva de referência ou acesso sem confirmação mantém impedimento explícito. Histórico integral de todos os jobs/artefatos antigos e apresentação completa de acervo não foram declarados migrados. RA-09 agregada permanece parcial. Próxima RA-09f: proveniência da entrega de código e vínculo à composição planejada; composição física/pacote/deploy continuam nas etapas próprias.

Evidências: [aplicação](assets/ra09e-remote-close-2026-10-28/application-validation.json), [auditoria](assets/ra09e-remote-close-2026-10-28/audit-validation.json), [navegador](assets/ra09e-remote-close-2026-10-28/browser-validation.json), [UX](assets/ra09e-remote-close-2026-10-28/ux-review.json), [publicação](assets/ra09e-remote-close-2026-10-28/publication.json), [consulta real](assets/ra09e-remote-close-2026-10-28/live-validation.json), [preservação](assets/ra09e-remote-close-2026-10-28/live-query-preservation.json).

### Roteiro manual

1. Em Tarefa de Merge anterior elegível, abra Evidências e consulte o resultado. Confira MR/execução/branches/SHA. Sem caso real, use as capturas isoladas; não crie situações artificiais na base humana.
2. Para MR aberto elegível, preencha motivo, marque aceite e solicite Fechar Merge Request anterior. Confira pedido recebido e acompanhamento, sem interpretar recebimento como fechamento.
3. Após MR fechado confirmado, consulte e revise o encerramento local RA-09d com motivo preenchido. Se houver integração, use a confirmação positiva RA-09c. Confira tentativa original e ciclo atual preservados.
4. Resposta perdida: recupere o mesmo pedido/persona; use Verificar resultado do fechamento para o mesmo job. Auditoria e recarga mantêm acompanhamento. Impedimento exige nova consulta/revisão/aceite para outra escrita.
5. Registre **OK RA-09e** ou o problema. Próxima RA-09f: proveniência da entrega e vínculo à composição planejada.


## 32. Recibo RA-09f — rastreabilidade do código na composição

**Situação:** implementada, validada e publicada localmente em **29/10/2026**. **OK manual pendente.** Esta fatia entrega uma leitura das fontes existentes para a execução/SHA que já constam da revisão imutável da composição. Não acrescenta uma decisão de associação, não atualiza composições históricas e não monta código na branch da release.

### Jornada e significado das referências

Na **Release → Composição → Histórias da release**, **Consultar rastreabilidade do código** abre a revisão vigente no aprofundamento existente de revisões. O link preserva os filtros e parâmetros independentes da consulta. Cada História apresenta **Código no planejamento**, seguido do detalhe recolhido **Rastreabilidade do código**. O mesmo detalhe aparece em **História → Execução → Entrega de código e release → Participações em releases**. Nenhuma aba, shell ou trilho novo foi criado.

**Referência no planejamento:** execução e commit da fonte são os valores salvos na composição. **Integração conhecida na consulta:** a evidência preservada do mesmo pedido/execução, com MR/projeto, branches, commit integrado, merge/squash, datas de merge/observação e ID da fonte. Se a evidência foi capturada após a composição, isso aparece explicitamente; a consulta não afirma que o commit integrado constava do registro original. Commit da fonte não substitui commit de integração nem HEAD atual.

Estados distintos: execução não capturada, publicação não capturada, fonte indisponível, referências divergentes, integração não confirmada, merge confirmado sem referência capturada, referência parcial sem commit integrado e referência disponível. Ausência de fonte não prova falha de merge. Falta de execução/SHA no registro não é preenchida por execução posterior, mesmo que a mesma execução receba publicação depois. Divergência de História/Sistema/execução/commit/branch/MR/destino impede apresentar uma integração de outra identidade.

Comparação com o planejamento atual é separada da rastreabilidade histórica. Novo ciclo com código diferente indica necessidade de revisão, conservando a integração da execução original; alteração somente administrativa ou publicação do mesmo SHA em outro ciclo não inventa mudança de conteúdo. A orientação lembra que planejar outra revisão exige composição editável e revisão explícita. Consultar revisão antiga não modifica situação/gates nem associa automaticamente a última integração da História.

### Contrato técnico e limites

`composition-code-traceability.ts` faz consultas locais em lote para os membros da página solicitada: execução exata da composição, repositório do mesmo Sistema, operação única daquela execução e fonte `MergeIntegrationReference`. Valida a tupla antes de projetar campos selecionados. Conteúdo de snapshots, prompts, código, motivos privados e credenciais não são expostos. O valor histórico de `stories` permanece igual ao registro; a leitura é um campo separado.

As APIs existentes `GET /api/releases/:id/composition-revisions/:revisionId?page=…` e `GET /api/items/:id/release-participations?page=…&asOf=…` recebem os campos aditivos `codeTraceability` e `traceabilityAsOf`. O instante da leitura das fontes é separado do cutoff da coleção e da data da revisão/observação. Consulta em RepeatableRead, página de 20, total real e ordenação existentes são preservados. Apenas os membros da página recebem a projeção; isso não é catálogo global nem cálculo de prontidão da composição integral. Revisão de outra Release retorna 404; identidade de execução de outro escopo não expõe sua publicação/integração.

Na web, detalhes nativos recolhidos mantêm uma coluna e quebra de identificadores no celular. Falha conserva a última leitura identificada e seu instante, sem anunciar confirmação atual. Respostas antigas abortadas não substituem a revisão selecionada. URL/paginação de revisões, membros e participações continuam independentes da seleção de Histórias e da Auditoria. Retorno ao processo respeita o assunto corrente; reabrir o detalhe de release conserva a escolha ainda não salva.

Não há migration, escrita GitLab, nova fonte/tabela, captura automática, backfill, comando de agente ou ação de negócio. Os comandos de associação/transferência continuam nos recorders transacionais já existentes; consultas não geram eventos, chaves ou decisões. Publicação utiliza `PORTAL_PUBLICATION` no ledger administrativo fora da base, com backup verificado. Oito checks de auditoria passaram; a adoção não declara novas famílias produtoras migradas.

O usuário escolheu **manter os indicadores existentes nesta fatia**. Sem contagem/painel/fórmula/meta nova de rastreabilidade, nem reclassificação dos indicadores de integração/fila/retrabalho.

**Limites:** esta leitura não comprova código composto na branch da release, build, pacote, Desenvolvimento Finalizado, teste ou implantação. Referência parcial permanece parcial; não há enriquecimento automático nem nova autorização remota. Acesso integral ao acervo, catálogo de todas as operações antigas e prova da composição física da candidata continuam nas entregas próprias. RA-09 agregada permanece parcial; a fundação entregue permite evoluir para RA-10a, leitura/validação do contrato do Sistema. Executores DEV e candidatas QA mantêm suas dependências, decisões e gates.

### Validação e publicação

**81 testes de aplicação** (17 novos de rastreabilidade e regressões de composições, referências de planejamento, releases, merge e métricas), **8 de auditoria**, build API/web e **49 cenários de navegador** aprovados. Os 12 cenários novos cobrem 1440/390, fonte/integração diferentes, captura posterior, parcial/ausente, novo ciclo, revisão histórica, erro de consulta, segunda página, resposta atrasada, teclado e preservação de escolha/URL/Auditoria. O roteiro de navegador foi ajustado para reabrir o assunto Release planejada ao voltar à Execução; não houve mudança do contrato para satisfazer o teste.

Revisão UX de fonte e dez capturas aprovada, sem bloqueador material. São recortes de viewport; várias capturas em scroll sob cabeçalho fixo não mostram o início inteiro do detalhe. Em history-error o aviso fica acima do recorte: erro/preservação foram conferidos na fonte e nos cenários, e participation mostra o erro diretamente. Não é captura completa de todos os estados nem validação assistiva integral. Oito checks de auditoria confirmam o contrato existente; consultas novas não criam ação. Publicação com **37 tabelas anteriores integralmente preservadas**, sem migration ou nova tabela. Conferência real somente por GET/HEAD, em desktop/celular, sem registros sintéticos, alteração de negócio, execução de agentes ou resultados de aplicações. A ausência real de referência permanece explícita; os estados com dados sintéticos foram demonstrados exclusivamente em `portal_test`.

Evidências: [aplicação](assets/ra09f-code-trace-2026-10-29/application-validation.json), [auditoria](assets/ra09f-code-trace-2026-10-29/audit-validation.json), [navegador](assets/ra09f-code-trace-2026-10-29/browser-validation.json), [UX](assets/ra09f-code-trace-2026-10-29/ux-review.json), [publicação](assets/ra09f-code-trace-2026-10-29/publication.json), [consulta real](assets/ra09f-code-trace-2026-10-29/live-validation.json), [preservação](assets/ra09f-code-trace-2026-10-29/live-query-preservation.json).

### Roteiro manual

1. Abra uma Release e use **Consultar rastreabilidade do código**. Confira revisão da composição, História e código no planejamento; abra o detalhe recolhido.
2. Confira a execução registrada, fonte e integração conhecida. Referência ausente/parcial deve aparecer como tal; não criar dados na instalação humana para demonstrar estados. Use as capturas isoladas quando não houver exemplo real.
3. Consulte uma revisão/participação anterior. Confira que execução e evidência continuam ligadas àquele registro, mesmo com ciclo posterior, sem alterar a composição vigente.
4. Confira paginação, recarga e filtros. Na História, escolha outra release sem salvar, consulte participações e volte entre Auditoria/Execução; reabra Release planejada e confira que a escolha permanece.
5. Registre **OK RA-09f** ou o problema. Próxima fatia: RA-10a, consulta/validação do contrato do Sistema; não executa comandos ou deploy por consulta.


## 33. Recibo RA-10a — consulta do contrato de execução

**Situação:** implementada, validada e publicada localmente em **29/10/2026**. **OK manual pendente.** Entrega consulta explícita do contrato versionado do Sistema e valida estrutura/entradas no commit. Não edita aplicações ou arquivos de contrato, não executa agentes/build/teste/deploy e não aprova ferramentas/isolamento/recuperação. RA-10 agregada permanece parcial.

### Jornada

**Sistema → Repositório do Sistema → Contrato de execução → Consultar contrato**. Usa o quadro existente, sem nova aba ou duplicação nos descendentes. Runtime cadastrado, provisionamento do repositório, estrutura do contrato e execução disponível são dimensões distintas. O botão posterior **Consultar contrato novamente** refaz somente a leitura; não chama onChanged, não salva nem limpa formulário/campos pendentes.

**Estrutura e entradas conferidas** identifica a validação de dados/referências. **Contrato não encontrado**, **Contrato incompleto ou inválido** e **Versão não suportada** têm mensagens próprias. Não há inferência de prontidão a partir de runtime generic ou do texto .sdlc/contract.md. Pendências orientam a futura definição/correção pelo portal, sem mandar a pessoa sair para alterar no GitLab ou prometer ação ainda indisponível.

O resultado mostra Sistema/repositório, arquivo, SHA, modo e instante da leitura. **Consultar outra revisão** usa SHA completo; vazio consulta a branch padrão. contract.sha mantém URL independente dos filtros/abas. Alteração ainda não aplicada no input permanece durante releitura e navegação; o formulário do Sistema também. Resposta atrasada/abortada não substitui outra leitura. Falha de acesso preserva o último resultado datado com retentativa, sem anunciá-lo como confirmado atualmente.

Unidades e detalhes técnicos começam recolhidos. Entradas build/teste, Dockerfile/contexto, saúde e migrações aparecem como declarações; arquivo regular encontrado não valida comportamento. Paths/SHAs quebram linha e dados usam uma coluna no celular. Consulta de commit escolhido explicitamente não afirma que ele é HEAD; avanço da branch durante a leitura preserva o SHA original e explica como consultar novamente. Uma revisão específica continua fixa até outra escolha explícita.

### Formato e integração

[Contrato de execução do Sistema v1](contrato-execucao-sistema-v1.md) define .sdlc/execution.json, schemaVersion 1 e até oito unidades do mesmo repositório, sem impor pastas/stack no cadastro. Runtime/versão, entradas de arquivos, artefato de container, saúde HTTP/processo e migração explícita none/scripts são dados. Scripts de migração exigem apply e rollback; none não prova reversibilidade nem ausência de dados. JSON não recebe comandos de shell, argv, URLs/segredos ou capacidades arbitrárias. Propor/editar/publicar e executar permanecem operações futuras e explícitas.

GitProvider.executionContract é capacidade opcional de leitura. Adapter dedicado envia somente GET, valida projeto/namespace/marca gerenciada, fixa commit e confere árvore, arquivo regular, ref/commit/blob/hash antes de validar o formato. Só o conteúdo do contrato é carregado; referências de build/testes/Dockerfile/migração usam metadados. Paths são relativos, com travessia/absolutos/links/arquivos especiais recusados. Pastas e contexto também são conferidos. Múltiplas unidades, incluindo API/batch, compartilham o repositório sem substituir a regra de um repositório por Sistema.

Ausência exige árvore consultada: 404 da raiz ou pasta previamente comprovada é leitura indisponível, sem converter falta de acesso em ausência de contrato. Limites explícitos de 32 KiB, oito unidades, referências/paginação/resposta e orçamento total impedem anunciar cobertura truncada como completa. Lista de problemas limitada a vinte informa se há outros pontos; contrato permanece inválido. Erros/dados privados do remoto, conteúdo bruto, scripts e credenciais não entram na projeção.

Após a leitura há reconsulta da branch/projeto e do cadastro local. Avanço da branch é aviso sobre a mesma fonte; mudança de escopo/branch padrão/Sistema/repositório impede confirmar outro contexto. Essa detecção não afirma atomicidade distribuída ou HEAD permanente. SHA-256 é do conteúdo devolvido pela API, que pode converter texto; blob/commit identificam a fonte Git, sem confundir o digest com bytes brutos. [Arquivos GitLab](https://docs.gitlab.com/api/repository_files/), [árvore](https://docs.gitlab.com/api/repositories/).

GET /api/systems/:id/execution-contract aceita somente sha opcional, sem arquivo/URL/repositório arbitrário. Resolve o repositório do próprio Sistema; inativo é consultável sem retomar trabalho, arquivado não recebe esta capacidade ativa. Repositório ausente/pendente ou provider sem capacidade retorna impedimento de configuração, sem consulta remota fictícia. DTO preserva executionAvailable=false e tooling=not_evaluated. Não há mutation, tabela/migration, backfill, fila ou ação de negócio. Nenhum agente recebeu autorização adicional nesta fatia.

### Auditoria, métricas e validação

Consultas não criam eventos, RequestKey, resultados de agente ou evidências de execução. Recorder/catálogo dos comandos existentes permanecem; publicação usa PORTAL_PUBLICATION na trilha administrativa externa, backup e reversão. O usuário escolheu **manter os indicadores existentes nesta fatia**, sem contagem/painel/fórmula/meta de contratos. Estrutura válida não gera aprovação DEV, integração, build, teste ou implantação.

**73 testes de aplicação**: 35 do adapter/validação, 14 da API e 24 de regressões de repositório único, ambientes e provider de destino; **8 de auditoria** e build API/web aprovados. Cobertura inclui entrada/path/arquivo especial, contrato ausente/JSON inválido/versão desconhecida, múltiplas unidades e migrações, escopo/ref/metadados divergentes, hash, limite de tamanho/árvore, 404 sem ausência fictícia, contexto local alterado e consulta sem escrita. A fixture do teste de entidade inválida foi corrigida para uma hierarquia válida de Projeto; a guarda do domínio foi preservada.

**65 cenários de navegador**, sem falhas ou instabilidade: 14 novos em 1440/390 e regressões de hierarquia, ambientes, História e composições. Cobrem consulta explícita, modos da revisão, input ainda não aplicado, formulário, filtros/URL/abas, retentativa, fonte datada, avanço da branch, resposta atrasada e contexto de outro Sistema.

Revisão UX de fonte e doze capturas aprovada, sem bloqueador material. Capturas fullPage após scroll podem conter sobreposição do cabeçalho fixo/skip link, especialmente em valid; não mostram integralmente todos os trechos sem obstrução. Fonte/cenários complementam o recorte, sem declarar validação assistiva integral.

Publicação com **37 tabelas anteriores preservadas**, sem migration ou nova tabela. Conferência real em desktop/celular somente GET/HEAD, sem registros sintéticos ou alterações em aplicações, resultados de agentes ou dados de negócio. A situação real do contrato permanece conforme a fonte; cenários completos/sintéticos ficaram somente em portal_test. Formato v1 documentado não criou arquivos no repositório de aplicações.

Evidências: [aplicação](assets/ra10a-execution-contract-2026-10-29/application-validation.json), [auditoria](assets/ra10a-execution-contract-2026-10-29/audit-validation.json), [navegador](assets/ra10a-execution-contract-2026-10-29/browser-validation.json), [UX](assets/ra10a-execution-contract-2026-10-29/ux-review.json), [publicação](assets/ra10a-execution-contract-2026-10-29/publication.json), [consulta real](assets/ra10a-execution-contract-2026-10-29/live-validation.json), [preservação](assets/ra10a-execution-contract-2026-10-29/live-query-preservation.json).

### Limites e próxima fatia

Não avalia conteúdo/segurança dos scripts/Dockerfile, suporte instalado a runtime/versão, dependências, funcionamento de saúde/migrações, reversão de dados ou topologia. Não transforma estrutura válida em autorização/prontidão de executores. Não migra apresentação do acervo nem implementa comandos para criar/corrigir o contrato. RA-10b tratará proposta/revisão dentro do portal; publicação e execução dependerão de capacidades explícitas e dos gates próprios, mantendo DE-04/06 e RA-11–14.

### Roteiro manual

1. No Sistema, abra Repositório do Sistema e use Consultar contrato. Confira arquivo, commit e instante. Ausência real deve permanecer explícita; não criar um contrato de demonstração na aplicação humana.
2. Nos exemplos isolados, consulte unidades/entradas e diferencie estrutura conferida de execução indisponível. Confira pendências de versão/campos/arquivos.
3. Em Consultar outra revisão, informe SHA completo desse repositório. Confira commit escolhido; deixe vazio para consultar novamente a branch padrão. Input ainda não aplicado não deve mudar a leitura.
4. Consulte novamente, navegue entre abas e confira filtros/formulário preservados. Em falha, confira última leitura datada e retentativa; mudança da branch não deve substituir o SHA original silenciosamente.
5. Registre OK RA-10a ou o problema. Próxima fatia: proposta/revisão do contrato pelo portal, antes da publicação e execução controladas.


## 34. Recibo RA-10b — proposta e revisão locais do contrato

**Situação:** implementada, validada e publicada localmente em **29/10/2026**. **OK manual pendente.** A pessoa pode definir o contrato com o arquiteto sem sair do portal. RA-10 agregada permanece parcial: esta fatia registra proposta/revisão locais; publicar arquivo, executar ferramentas e implantar permanecem capacidades próprias.

### Jornada e comportamentos

**Sistema → Repositório do Sistema → Contrato de execução → Consultar contrato → Proposta local → Conferir contexto da proposta.** No campo de orientações, descreva a necessidade ou responda às perguntas. **Preparar proposta com assistente** registra intenção durável e retorna ACK; a geração acontece no worker de conversa já existente. O mesmo limite de inferência vale para entrevistas/conversas e propostas, sem fila ou agendador duplicado.

O resultado mostra resumo, perguntas e entradas técnicas pendentes, com definição técnica recolhida. O agente trabalha com contrato/metadados do commit e orientações, sem ler/executar código de aplicação. Perguntas impedem revisão conclusiva; responda e solicite outra preparação. Não existe escolha automática de stack ou migração para preencher lacunas. Nova versão conserva a anterior, autoria e base. A edição opcional em JSON valida o mesmo formato e salva versão humana imutável; conteúdo idêntico preserva a revisão existente.

**Revisar proposta → Registrar revisão local** exige motivo e confirmação. Registra aceite da definição da versão exata, sem criar arquivos, aprovar Desenvolvimento Finalizado, publicar no GitLab ou autorizar build/teste/deploy. Arquivos/pastas ainda ausentes aparecem como pendências de implementação e podem integrar a definição revisada; links/tipos fora da cobertura impedem revisão. Versão nova não herda aprovação. Mudança de repositório/versão técnica/projeto/branch/base/inventário exige outra preparação; não se transfere aceite silenciosamente para novo commit.

Pedido em fila/processamento/pausa ou sem confirmação continua acessível em outras abas do mesmo Sistema e após recarga. Perdida a resposta, **Verificar resultado do pedido do contrato** usa corpo, persona e chave originais, mesmo após conclusão e sem depender de nova consulta remota. Outra persona precisa selecionar a original. ACK conhecido seguido de GET indisponível mantém o novo ID e acompanhamento ainda não confirmado; não apresenta metadados antigos como identidade do novo pedido. Resultado antigo permanece qualificado. Revisão cujo recibo chegou permanece conhecida na mesma proposta mesmo com GET posterior falho; não volta a pedir aceite.

Erro de consulta conserva leitura datada e bloqueia novas decisões; recuperação do pedido original permanece disponível. Cancelamento e ausência de mudanças têm mensagens específicas. Pausa/inatividade e retomada utilizam o ciclo existente: reativação não retoma trabalho automaticamente. Falha ou cancelamento conserva orientações/proposta anterior e permite nova preparação explícita. Campos e pedidos incertos ficam na sessão local, sem sincronização entre dispositivos.

**Revisões locais registradas** é consulta de versões do conteúdo, em páginas de 20 com total e corte temporal. Proposta corrente, pedido mais recente e capacidades são lidos independentemente da página/cutoff. Abrir versão antiga não muda os gates/corrente. `contractProposals.page/asOf` e `contract.proposalId` preservam filtros, abas e `contract.sha`; foco acompanha abertura/retorno e não é sequestrado pelo polling. Auditoria de ocorrências permanece na aba Auditoria. Aprofundamentos usam componentes e identidade visual existentes, uma coluna no celular.

### Implementação, limites e rastreabilidade

[Contrato v1 e APIs](contrato-execucao-sistema-v1.md#ra-10b--preparação-e-revisão-locais) documentam contexto e regras. Consultas GitLab somente GET validam escopo, fixam SHA e conferem metadados antes/depois; não certificam HEAD permanente nem atomicidade distribuída. Inventário recursivo limitado a 200 entradas/256 KiB/25 s adicionais, contexto de metadados de 10 mil caracteres e contexto combinado de 14 mil; excesso impede preparação parcial. Caminhos fora da política não entram no modelo e têm total excluído explícito. Repositórios maiores precisam de evolução deste contrato, sem anunciar amostra como inventário completo.

Migration aditiva `202610290001_execution_contract_proposals` cria `ExecutionContractRequest`, `ExecutionContractProposal` e `ExecutionContractReview` imutáveis, com FKs, escopo e autoria verificados por triggers. Turno `contract_proposal` guarda intenção congelada; worker pode alterar somente seu processamento. Runtime lê/insere fontes, sem UPDATE/DELETE/TRUNCATE; rollback recusa apagar migration após qualquer fonte ou intenção. Nenhum backfill ou dado sintético foi criado na instalação humana.

Autorização permite Administrador/PO/Arquiteto em Sistema ativo. Mutação compartilhada e trava transacional controlam idempotência, concorrência e autoria. O worker revalida contexto, proposta, estado e lease antes de salvar; cancelamento tardio não grava resultado. Falha do recorder reverte resultado/fonte na transação. Expiração não repete inferência automaticamente: o pedido fica preservado para nova ação explícita. Rodadas de contrato ficam fora dos seletores de entrevista/plano, não concluem entrevista nem geram Épicos/Histórias/Tarefas.

Cinco ações explícitas no catálogo e recorder: `EXECUTION_CONTRACT_PROPOSAL_REQUESTED` ACCEPTED/REQUESTED/NOT_APPLICABLE; `EXECUTION_CONTRACT_PROPOSAL_PREPARED` SUCCEEDED/COMPLETED/NOT_APPLICABLE; `EXECUTION_CONTRACT_PROPOSAL_FAILED` FAILED/COMPLETED/NOT_EVALUATED; `EXECUTION_CONTRACT_PROPOSAL_REVISED` SUCCEEDED ou NO_CHANGE/COMPLETED/NOT_APPLICABLE; `EXECUTION_CONTRACT_REVIEWED` SUCCEEDED ou NO_CHANGE/COMPLETED/APPROVED. APPROVED refere-se à definição local. Claim/cancelamento/pausa/retomada/lease reutilizam produtores existentes. Eventos guardam IDs/digests e anterior/novo selecionados; orientações, prompts, conteúdo e motivo permanecem nas fontes controladas. Execução do agente conserva o iniciador humano.

Por resposta explícita do usuário, **indicadores existentes mantidos nesta fatia**: fila, espera e retrabalho, sem KPI/painel/meta de propostas. Falha entra no indicador genérico existente; entrevista formal continua excluindo esse tipo de rodada.

### Validação e publicação

**103 testes de aplicação** (23 de propostas, 4 do provider e 76 de regressões de leitura do contrato, ciclo, conversas e métricas), **8 de auditoria**, tipos/build API/web e **97 cenários de navegador** aprovados. Os 24 novos cenários cobrem 1440/390, fila, perguntas, nova preparação, revisão com GET falho, ACK conhecido/perdido, persona original, deriva da base, cancelamento/falha, bloqueios de consulta, edição, histórico com 22 versões, segunda página/recarga, foco e URL. Os testes foram sincronizados com a navegação antes de recarga e atualizados para a disponibilidade da proposta nesta fatia; o contrato de publicação futura permanece explícito.

Testes de aplicação exercitam rollback de pedido/revisão/finalização por falha de recorder, retentativa idempotente, contexto alterado antes/durante geração, cancelamento tardio, pausa/retomada, lease expirada sem repetir geração, permissão runtime e recusa de rollback populado. Fixtures permanecem somente em `portal_test`; nenhum modelo real ou aplicação produzida foi usado para demonstração.

Revisão UX da fonte e 12 capturas aprovada, sem bloqueador material. Capturas fullPage após scroll têm sobreposição do cabeçalho fixo e do skip link em vários trechos, sem garantir identidade/início de seção integralmente visíveis em cada imagem; a fonte complementa a revisão. Não se declara validação assistiva integral ou teclado nativo em hardware. A adoção não migra acervo de outras telas nem implementa publicação/executores.

Publicação com backup privado verificado e `PORTAL_PUBLICATION` na trilha administrativa externa. **37 tabelas anteriores integralmente preservadas**, três fontes novas vazias, **40 tabelas conferidas**. Conferência real somente GET/HEAD em desktop/celular, incluindo contexto GitLab, sem preparar proposta, disparar modelo ou alterar dados de negócio. O contrato real continua ausente e a execução indisponível. Reversão para imagem anterior só antes de intenção nova: após `contract_proposal`, recuperação deve preservar runtime compatível; fontes não são removidas para viabilizar downgrade.

Evidências: [aplicação](assets/ra10b-contract-proposals-2026-10-29/application-validation.json), [auditoria](assets/ra10b-contract-proposals-2026-10-29/audit-validation.json), [navegador](assets/ra10b-contract-proposals-2026-10-29/browser-validation.json), [UX](assets/ra10b-contract-proposals-2026-10-29/ux-review.json), [publicação](assets/ra10b-contract-proposals-2026-10-29/publication.json), [consulta real](assets/ra10b-contract-proposals-2026-10-29/live-validation.json), [preservação](assets/ra10b-contract-proposals-2026-10-29/live-query-preservation.json).

### Roteiro manual

1. Abra o Sistema em **Repositório do Sistema**, consulte o contrato e confira o contexto da proposta com Ana selecionada.
2. Escreva as definições desejadas e solicite preparação. Confira fila, autoria e commit; visite Auditoria, volte e recarregue para conferir recuperação.
3. Se houver perguntas, responda no mesmo campo e prepare outra proposta. Confira a nova versão e consulte a anterior sem mudar a corrente.
4. Confira entradas pendentes e definição. Registre revisão local com motivo e confirmação; confira autoria e permanência do registro após navegar. Isso não publica o contrato nem inicia DEV.
5. Registre **OK RA-10b** ou o problema. A próxima RA-10c é publicação controlada do contrato; não libera automaticamente build/teste/deploy. Cenários de falha/concorrência usam ambiente isolado, sem alterar aplicação de negócio para demonstrar o portal.


## 35. Recibo RA-10c — envio controlado do contrato ao GitLab

**Situação:** implementada, validada e publicada localmente em **29/10/2026**. **OK manual pendente.** Envia a definição revisada para branch e Merge Request Draft próprios. **MR criado não significa contrato integrado na branch padrão.** RA-10 permanece parcial até integração/fonte efetiva e prontidão real de ferramentas.

### Jornada

**Sistema → Repositório do Sistema → Contrato de execução → Proposta local revisada → Enviar contrato para revisão.** A prévia mostra proposta/revisão, repositório, arquivo .sdlc/execution.json, commit de origem e destino. Branch técnica e digest ficam recolhidos. Motivo mínimo de dez caracteres e checkbox habilitam **Confirmar envio ao GitLab**. Alteração de proposta/revisão/contexto ou consulta indisponível impede nova decisão, preservando o texto.

O ACK só confirma recebimento. Acompanhamento apresenta fila, processamento, pausa, impedimento, desconhecimento, commit confirmado com MR pendente e MR confirmado. O contrato da branch padrão continua na consulta RA-10a e pode permanecer ausente após o envio. Entradas técnicas ainda ausentes continuam pendentes; esta capacidade não as cria ou executa. O link Abrir Merge Request é secundário; não se instrui a pessoa a sair do portal para concluir integração supostamente entregue.

Pedido sem resposta conserva corpo/persona/chave e banner nas outras abas do mesmo Sistema e após recarga. Recibo antigo não regride operação mais nova; novo pedido incerto não usa identidade do envio anterior. Resultado conhecido fica preservado após GET falho, com fonte/data qualificadas e novas decisões bloqueadas. Recuperação do mesmo pedido permanece disponível. Falha sem cache impede afirmar disponibilidade, sem anunciar falsamente envio pendente.

**Verificar resultado do envio** consulta somente GET no GitLab e registra a observação, sem repetir escrita. Commit encontrado com criação do MR ainda não iniciada oferece **Continuar abertura do Merge Request**, com confirmação explícita invalidada por mudança de operação/versão/commit. Mantém o mesmo job e commit. Cancelamento só antes da intenção de escrita externa; pausa e retomada seguem o ciclo do Sistema e reativação sozinha não executa trabalho.

Foco acompanha confirmação após renderização, retorno ao acionador ou painel quando desabilitado, rejeição e recibo no painel estável. Quando um recibo terminal remove o banner em outra aba, o foco retorna à aba corrente; esse ajuste também cobre a recuperação de proposta RA-10b. Polling não move foco. Layout em uma coluna e identificadores quebráveis em 390px; fonte, histórico de versões, filtros e parâmetros existentes são preservados.

### Implementação e limites

[Contrato v1 e APIs](contrato-execucao-sistema-v1.md#ra-10c--envio-controlado-ao-gitlab) descrevem os comandos. ExecutionContractPublication congela versão/revisão, escopo, conteúdo/digest, origem/destino, motivo e autor, com processamento versionado/lease e marcadores antes de commit/MR. Trigger preserva intenção e primeiros efeitos conhecidos; runtime não remove/trunca a fonte. Migration aditiva 202610290002_execution_contract_publication sem backfill; rollback populado recusado.

O consumer usa o agendamento da API existente, sem modelo, novo timer ou broker. Autorização Admin/PO/Arquiteto, atividade do Sistema, proposta/revisão corrente e contexto técnico são revalidados antes de cada escrita. Intenção e ACK são transacionais. Chamadas externas acontecem fora da transação. Conta dedicada sdlc-agent-for-merge exige acesso Maintainer no projeto gerenciado e ausência de administração global; não há mudança de credencial, permissão ou proteção durante o envio.

Adapter específico permite somente um arquivo JSON validado em branch nova no SHA autorizado e MR Draft próprio. Create/update deriva de metadados do arquivo na revisão fixa. Confere pai único, marcador exato, arquivo regular, conteúdo/digest e MR do mesmo projeto/branches/SHA. Como o diff pode ser limitado pelo GitLab, compara metadados completos da raiz e da pasta .sdlc, com IDs de subárvores inalterados fora do contrato, até 202 entradas por pasta e três páginas de 100; limite impede confirmar cobertura parcial. Não usa force, move branch padrão, remove referências ou chama merge/pipeline. São observações revalidadas, sem garantia de HEAD permanente ou transação distribuída. CI já configurada no GitLab mantém sua própria política; esta capacidade não solicita executor DEV ou transforma CI em aprovação do portal.

Checkpoint de commit e recorder são transacionais; falha do recorder de conclusão conserva intenção/marcadores e permite consulta do efeito, sem nova escrita. Lease expirada não repete envio. Ausência observada de efeito que pode ter ocorrido permanece desconhecida; não libera retentativa de criação. Resolução explícita de recusas definitivas/abandono sem confirmação e integração pertencem à RA-10d e dependências, preservando a intenção antiga. Não se prometem todos os caminhos de recuperação remota já implementados.

Acompanhamento atual e por ID pertencem ao Sistema e não dependem da página histórica. Não são catálogo integral de jobs; eventos continuam em Auditoria. Acervo integral de operações, integração do contrato, avaliação de runtime/ferramentas, build/testes/deploy e DE-04/06 permanecem nas entregas próprias. Nenhuma aplicação produzida ou dado real foi alterado para demonstrar esta capacidade.

### Auditoria e métricas

Dez ações catalogadas: EXECUTION_CONTRACT_SEND_REQUESTED ACCEPTED/REQUESTED; SEND_STARTED SUCCEEDED/STARTED; COMMIT_OBSERVED SUCCEEDED/OBSERVED; SENT SUCCEEDED/COMPLETED; SEND_BLOCKED DEFERRED/WAITING; SEND_UNCONFIRMED UNKNOWN/OBSERVED; SEND_OBSERVED SUCCEEDED/UNKNOWN/DEFERRED em OBSERVED; SEND_CONTINUED ACCEPTED/REQUESTED; SEND_CANCELLED CANCELLED/COMPLETED; SEND_PAUSED SUCCEEDED/COMPLETED, sempre com prefixo EXECUTION_CONTRACT_. Decisão NOT_EVALUATED em SEND_BLOCKED/SEND_UNCONFIRMED e NOT_APPLICABLE para os demais, sem aprovar software.

Recorder compartilhado registra intenção/checkpoint/estado/evento/chave na mesma transação, com antes/depois selecionados, autoria e correlação pela operação. Executor de integração conserva o iniciador original; observação/continuação/cancelamento humanos identificam seu próprio iniciador. JSON/motivo ficam na fonte controlada; auditoria recebe IDs/digests. Pausa/retomada hierárquica inclui a nova operação e reutiliza os produtores existentes. Novos fluxos de integração e ferramentas não são declarados cobertos.

O usuário escolheu **manter os indicadores existentes nesta fatia**. Sem nova contagem, painel, fórmula ou meta de envios. Dados de processamento ficam disponíveis no acompanhamento/auditoria; recebimento, commit ou MR confirmado não alimentam Desenvolvimento Finalizado, build, testes ou implantação.

### Validação e publicação

**131 testes de aplicação:** 18 novos de intenção/worker/recuperação, 10 do adapter dedicado e 103 de propostas, leitura do contrato, ciclo, conversas e métricas; **8 de auditoria**, tipos/build API/web e **117 cenários de navegador** aprovados. Os 20 novos cenários em 1440/390 cobrem revisão obrigatória, prévia/motivo/aceite, foco, fila/Auditoria/recarga/cancelamento, MR separado da fonte padrão, commit/MR com resposta perdida, continuação sem outro commit, versões/checkbox, GET falho após fato conhecido, persona/corpo/chave e rejeição por deriva da base.

Testes exercitam rollback transacional de pedido/observação/conclusão, replay concorrente/offline, recuperação de lease sem repetir efeitos, pausa/retomada, identidade/escopo/conteúdo/arquivo único e recusa de remoção da fonte populada. O teste de rollback RA-10b passou a desfazer/reaplicar a dependência posterior na ordem correta; migrations publicadas anteriores não foram reescritas. Dados sintéticos ficam somente em portal_test, sem modelo/GitLab reais ou criação de resultados para a instalação humana.

Revisão UX da fonte e 12 capturas aprovada. Corrigido foco anterior à renderização e texto antigo sobre publicação futura, distinguindo envio disponível e integração futura. Capturas fullPage após scroll têm cabeçalho fixo/skip link sobre partes da identidade anterior; áreas novas de confirmação/resultado estão legíveis. Nem todos os estados de banner são capturados. Não se declara validação assistiva integral ou teclado nativo em hardware.

Publicação com backup privado verificado, recorder administrativo externo PORTAL_PUBLICATION e **40 tabelas anteriores integralmente preservadas**. Nova tabela vazia, **41 tabelas conferidas**. A comparação exclui somente campos voláteis de lease/observação do worker de merge; fontes, conteúdo e decisões de negócio são conferidos. Conferência real somente GET/HEAD em desktop/celular, sem gerar proposta, enviar commit/MR ou acionar modelo. Downgrade para imagem anterior recusado após qualquer intenção nova, preservando fontes e exigindo runtime compatível; não se removem dados para viabilizar reversão.

Evidências: [aplicação](assets/ra10c-contract-publication-2026-10-29/application-validation.json), [auditoria](assets/ra10c-contract-publication-2026-10-29/audit-validation.json), [navegador](assets/ra10c-contract-publication-2026-10-29/browser-validation.json), [UX](assets/ra10c-contract-publication-2026-10-29/ux-review.json), [publicação](assets/ra10c-contract-publication-2026-10-29/publication.json), [consulta real](assets/ra10c-contract-publication-2026-10-29/live-validation.json), [preservação](assets/ra10c-contract-publication-2026-10-29/live-query-preservation.json).

### Roteiro manual

1. No Sistema, consulte o contrato e prepare/revise a proposta local com Ana, se ainda não existir definição revisada.
2. Use **Enviar contrato para revisão**. Confira proposta, revisão, arquivo, base e destino; preencha motivo e aceite antes de confirmar.
3. Acompanhe a fila, visite Auditoria e recarregue. Confira pedido/autor e retorno ao envio, preservando contexto.
4. Confira commit e MR confirmados, separados da fonte na branch padrão. A fonte atual pode continuar ausente; integração pelo portal será a RA-10d.
5. Registre **OK RA-10c** ou o problema. Cenários de resposta perdida, pausa e falha usam testes/capturas isolados; não alterar aplicações ou dados reais apenas para demonstrá-los.

## 36. Regressão consolidada e caminho do piloto em dois dias

### Decisão aceita em 29/10/2026

Entrega solicitada: fluxo real de uma aplicação piloto até PRD, em ambiente separado dentro do laboratório atual. Os dois dias são a janela de trabalho; não tornam concluídas as RAs que ainda não têm executor. O plano principal continua com 30 RAs: 5 concluídas, 6 parciais e 19 não iniciadas na linha de base RA-10c; portanto, 25 ainda incompletas. O OK manual das fatias já publicadas permanece com o usuário.

Para acelerar, adotar infraestrutura persistente exclusiva da automação, com fixtures próprias e execução limpa independente nos marcos. Reutilizar dependências, browser e containers; sincronizar somente fontes alteradas. O banco rápido pode acumular dados de teste identificados, mas um caso não depende dos dados/ordem de outro. O portal de uso humano não é transformado em base de testes e não precisa ficar indisponível. Intervenção manual no ambiente automático exige encerrá-lo/recriá-lo antes de voltar a confiar nos resultados.

### Contrato implementado nesta consolidação

- Controlador versionado `portal/scripts/regression.py`, wrapper PowerShell e imagem de toolchain reproduzível, sem helpers privados de `.prepared`.
- Escopos próprios `fast`, `ui` e `verify`, bases `portal_test` e redes internas; credenciais operacionais ausentes. Somente `fast` publica a porta local 3390; o portal humano permanece na 3310.
- `fast` conserva serviços e dados, com fixtures de escopo próprio. `backend` isola cada suíte de integração. `browser` começa em outra base limpa. `full` cria recursos novos, executa backend/build/interface e remove somente os recursos próprios ao final.
- Host determinístico explícito com workers manuais, registro versionado de 45 arquivos/363 cenários de interface e ID estável por caso. Arquivos e títulos não registrados impedem a execução.
- JSON por suíte/caso, HTML, JUnit, capturas e traces de falha; resumo com hashes, imagens, duração, fonte estável e limites. CI configurado com o mesmo executor e upload também em falha; a execução remota do workflow não foi atestada localmente.
- Auditoria administrativa dos comandos pelo recorder compartilhado em ledger próprio, fora do banco/container alterados. Não há inserção direta em HistoryEvent nem nova métrica de produto.

Procedimentos e registro de novos casos: [regressão do portal](../portal/tests/regression/README.md). Evidências resumidas ficam em [consolidação da regressão](assets/regressao-consolidada-2026-10-29/validation.json); relatórios completos ficam nos artefatos ignorados pelo Git.

### Acompanhamento da consolidação

| Item | Código | Verificação automática | OK usuário |
| --- | --- | --- | --- |
| Host de interface reproduzível e adapters explícitos | [x] | Smoke aprovado | [ ] |
| Ambiente rápido persistente e sincronização incremental | [x] | Reexecução sem reset/mesmos serviços | [ ] |
| Catálogo e relatórios por caso, CI compartilhado | [x] | Coleta local; CI remoto pendente | [ ] |
| Proteções de propriedade/base/limpeza e trilha externa | [x] | Contratos de recusa e recorder | [ ] |
| Regressão completa em ambiente limpo | [x] | 783 backend + 363 interface aprovados; 4 integrações reais não executadas | [ ] |
| Aceite real com provedores e promoção até PRD | [ ] | Executores ainda pendentes | [ ] |

A primeira linha de base detectou duas fixtures antigas incompatíveis com evoluções posteriores: mock de métricas sem a fonte de preparação de branches e ensaio de rollback de composição herdando foreign keys de migrações posteriores. As fixtures foram corrigidas sem alterar regras do domínio. Na interface, quatro cenários antigos de merge, qualidade e retomada técnica foram atualizados para os controles e aprofundamentos atuais, preservando as asserções de gates, autoria e repetição segura. Um defeito real de restauração de rascunhos nas conversas de execução/merge também foi corrigido no código: a gravação só começa após restaurar a chave corrente, inclusive na montagem repetida do modo de desenvolvimento. Essa correção não redesenha a navegação e não foi publicada no portal humano por esta consolidação. O ambiente dev de teste também precisou permitir a origem local para hidratar a UI, e os logs dos servidores passaram a arquivos para não bloquear durante a execução síncrona dos testes. Rodadas interrompidas/falhas ficam preservadas; não representam regressão aprovada.

### Ordem de implementação para o piloto

| Marco | Trabalho e RAs | Aceite pequeno e verificável |
| --- | --- | --- |
| Base, antes de novo executor | Consolidação desta seção | Comando rápido reproduzível, falhas da linha de base classificadas e rodada limpa registrada |
| Dia 1, primeiro marco | RA-10d: integração controlada do contrato e confirmação da fonte efetiva | Portal comprova arquivo/commit na branch correta; MR criado sozinho não libera execução |
| Dia 1, segundo marco | RA-11/12: build e implantação real da História em DEV independente de Release | Artefato identificado, executor restrito, saúde e logs reais; falha/repetição sem implantação falsa |
| Dia 1, terceiro marco | RA-13/14: testes DEV, correção e Desenvolvimento Finalizado | Repetir ciclo coding/testing; aprovação vinculada ao código válido, sem concluir a História |
| Dia 2, primeiro marco | RA-15/16/17/18: gates de todas as Histórias, CLOSED, pacote imutável e QA | História não pronta bloqueia; pacote versionado uma vez, digest e implantação QA confirmados |
| Dia 2, segundo marco | RA-19/23/24/25: validação QA, autorização HML, homologação e PRD | Mesmo digest promovido, ambientes isolados, saúde real; História conclui só após PRD confirmado |
| Dia 2, aceite | RA-26 mínimo operacional e regressão limpa + jornada real | Diagnóstico de falha, repetição segura, reversão rastreável; recibos de ambiente/digest e teste humano |

Cada executor deve preservar intenção durável, autoria, idempotência, auditoria, reconciliação e distinção entre pedido, efeito incerto e confirmação real. Novas ações entram explicitamente no catálogo. A prova do piloto não pode ser fabricada com atualização direta de status, dados sintéticos operacionais ou resultados de agentes.

As RAs de cópia/recomposição 20/21/22, abrangência geral de métricas/assistente 27/28, adoção 29 e partes ainda pendentes das RAs parciais continuam no backlog. Não são silenciosamente encerradas pelo piloto. Caso o caminho crítico ultrapasse a janela, reduzir abrangência a um runtime/uma unidade do Sistema, nunca retirar gates ou chamar simulação de produção. Cancelamento não desfaz uma implantação; o histórico e o pacote anterior permanecem preservados.

### Resultado registrado da consolidação

Rodada limpa `20261029T173936Z-3bdf4e`: **783 testes de backend aprovados em 74 arquivos e 363 cenários de interface aprovados em 45 arquivos**, sem falhas, skips de interface ou flaky. Quatro testes GitLab reais opt-in ficaram explicitamente não executados. Build de produção e estabilidade da fonte aprovados. A rodada levou aproximadamente 14 minutos; recursos `verify` removidos ao final. O ambiente rápido permanece disponível exclusivamente para automação.

Smoke de quatro cenários: aproximadamente 13–14 segundos, mantendo os mesmos serviços. O arquivo completo de envio do contrato, com 20 cenários, passou duas vezes consecutivas sem reset, em aproximadamente 75 segundos por rodada. São escopos de teste distintos; esses tempos não comparam o mesmo volume de trabalho. Outros 17 contratos de proteção/auditoria/relay foram aprovados, com os quatro guards Node no executor e os 13 contratos Python validados separadamente pelo helper agora usado por `full`. O ledger próprio terminou conferido, sem operação pendente.

[Recibo versionado e limites](assets/regressao-consolidada-2026-10-29/validation.json). Relatório HTML completo: `sdlc/portal/test-results/regression/20261029T173936Z-3bdf4e/html/index.html`. A configuração do CI foi validada por leitura/YAML; execução remota, build frio da imagem e jornada real do piloto permanecem pendentes. O portal humano mantém a publicação RA-10c. Próxima fatia funcional continua sendo RA-10d; não foi implementada nesta consolidação.

## 37. RA-10d — integração controlada e fonte efetiva do contrato

**Situação:** implementada, testada e publicada no portal local em 29/10/2026. OK manual permanece com o usuário. RA-10 agregada continua parcial: contrato integrado não comprova prontidão de ferramentas, build, teste ou implantação. O próximo executor é RA-11, sujeito às decisões DE-04/06.

### Comportamento entregue

No quadro existente **Sistema → Repositório do Sistema → Envio do contrato para revisão**, a pessoa confere condições e fonte do contrato. MR Draft oferece **Confirmar liberação do Draft**, com motivo e aceite; a liberação não autoriza merge. Nova conferência oferece **Confirmar integração do contrato**, fixando origem, destino e revisão. Não há nova aba ou mudança do shell. A consulta `contract.sha` acima pode ser histórica e não é substituída automaticamente; a fonte da branch padrão tem leitura própria e datada.

A interface distingue pedido recebido, fila, processamento, impedimento, efeito não confirmado, Draft liberado e integração confirmada. GET falho conserva recibos e última fonte datada, bloqueando novas decisões. Perda de resposta conserva corpo, persona e chave entre abas/recarga. A recuperação consulta o mesmo pedido; não transforma ausência em autorização para repetir PUT. Contexto/versão/persona alterados invalidam o aceite e preservam o motivo. Confirmação/resultado recebem foco por ação explícita; polling não desloca o foco.

MR que já foi integrado fora desta fila pode ser registrado por observação explícita, sem outro merge. O recibo conserva o SHA de integração e seu instante; uma fonte atual diferente não apaga esse fato. A integração confirma somente o arquivo de contrato e mantém explícitas as entradas/ferramentas ainda não avaliadas.

### Intenção, escrita e prova

`ExecutionContractIntegration` registra intenções distintas `release_draft` e `merge`, com autoria/motivo, número, revisão, repositório, projeto, SHA de origem/base, token remoto, versões, lease e marcador de escrita. Intenção, RequestKey e recorder compartilham transação. Worker revalida Sistema/repositório/proposta e contexto remoto; grava a intenção de escrita imediatamente antes do PUT. Expiração de lease, resposta perdida ou falha de recorder após efeito conservam os marcadores e exigem observação, sem nova escrita automática. Trabalho do Sistema inclui essas operações na contagem, pausa e retomada explícitas.

O adapter exige conta ativa `sdlc-agent-for-merge`, sem administração global, acesso Maintainer e projeto gerenciado no namespace esperado. Confere o commit exclusivo `.sdlc/execution.json`, sua base, conteúdo e árvore completa nas pastas envolvidas. MR precisa corresponder a projeto/origem/destino/SHA/marker. Liberação altera somente o título do MR próprio; merge envia o SHA fixado e preserva a branch. Não altera arquivos de aplicação, CI, permissões, proteções ou configurações de projeto. Agendamento automático bloqueia a liberação para não causar merge implícito; integração respeita conflitos, discussões, pipeline exigido e estado de merge do GitLab.

A prova positiva verifica conteúdo e árvore do commit integrado e sua ancestralidade na branch padrão via merge-base. A fonte atual é conferida separadamente no HEAD observado; mudança posterior não reescreve o recibo. Não se usa uma lista truncada de diffs como prova de exclusividade. Mantém-se o limite declarado do adapter de envio: até 202 entradas por pasta conferida, três páginas; excesso ou metadados incompletos impedem confirmação.

O endpoint de atualização do MR não oferece CAS por SHA para o título, e o merge fixa SHA de origem, sem CAS da branch de destino. Inspeções anteriores e prova posterior detectam desvios, mas não constituem transação distribuída. Efeito sem prova permanece desconhecido; não se anuncia sucesso por uma resposta HTTP isolada.

### Encerramento local e preservação

**Encerrar acompanhamento no portal** exige motivo e aceite e pode resolver envio incerto sem commit/MR confirmado. Registra `resolvedAt`, pessoa e motivo uma única vez, preservando a intenção original e os efeitos conhecidos. Não fecha, remove, desfaz ou afirma ausência de recursos GitLab. Novo envio pode ser revisado sem reativar a intenção antiga; efeitos tardios continuam consultáveis. Lease ativa impede encerramento; fila não iniciada é cancelada, e escrita possivelmente iniciada permanece sem confirmação. O cancelamento anterior do envio continua restrito ao momento anterior à escrita.

Operações resolvidas deixam de bloquear a preparação/novo envio, mas não recebem nova autorização de escrita. Retentativa HTTP mantém a decisão original; confirmação positiva posterior é outro fato, sem apagar a resolução. Sistema inativo/arquivado continua bloqueando novas decisões; consulta e reconciliação de efeitos têm capacidades próprias de leitura.

### Auditoria, regressão e métricas

Catálogo explícito de pedido/início/intenção/resultado/observação/pausa/retomada/cancelamento da integração e resolução local, com executor, iniciador e correlação por operação. Projeção seleciona IDs, estados e digests; JSON do contrato, prompts e motivos permanecem nas fontes controladas. Testes exercitam rollback por falha de recorder e retentativa, permissão/escopo/contexto, perda de resposta, lease, pausa e preservação das fontes. Migration aditiva não preenche decisões antigas e recusa rollback após fonte nova; a publicação usa backup e recorder administrativo externo.

Indicadores existentes mantidos, conforme a orientação reiterada do usuário e o recorte aprovado para o piloto em dois dias. A nova integração é de configuração, não uma entrega de código de História para os indicadores de merge. Melhorias gerais de métricas continuam em RA-27; não há indicador novo aprovado deixado implícito.

O catálogo versionado recebeu 22 cenários novos em desktop/390px. A revisão UX separa inspeção visual, asserções de foco e limites de fullPage/assistividade. Validação real opt-in usa apenas projeto temporário próprio no GitLab local: commit exclusivo, Draft separado, merge com SHA fixo na main protegida, conteúdo/ancestralidade e reconciliação. O projeto do ensaio é removido após confirmação de propriedade; não se alteram aplicações ou dados operacionais para demonstrar o portal.

Evidências: [validação e limites](assets/ra10d-contract-integration-2026-10-29/validation.json), [revisão UX](assets/ra10d-contract-integration-2026-10-29/ux-review.json).

**Regressão:** a rodada ampla `20261029T184148Z-819fd8` permanece registrada com falha: 805 testes backend aprovados, um fixture de rollback com dependência desatualizada e quatro opt-in não executados; 383 casos de interface aprovados e duas asserções que ainda anunciavam a integração como futura. Corrigida a ordem do fixture e o texto esperado, a reexecução dirigida aprovou 72 testes backend e dez execuções de interface. A reconciliação por caso cobre 806 testes backend e 385 casos de interface aprovados, sem somar repetições. Isso é cobertura composta das rodadas, não uma única execução `full` verde. Os 22 casos novos passaram nas duas larguras. Build de produção, contratos auxiliares e revisão UX aprovados. Quatro suítes GitLab opt-in antigas permanecem não executadas nesta rodada simulada; a validação real do novo provider foi executada separadamente, com remoção confirmada dos projetos próprios.

**Publicação:** imagem `sha256:5ced6514a0abce6fa13a68b11d22ab06ffb893b534767763ffb0181b16de51bd`, fonte `f2507691656fc6eca29a2f1613ef8fad985886a0533d09f3defd798812b6c9ed`, 36 migrations e 42 tabelas. Backup privado verificado; 41 tabelas anteriores preservadas sob a normalização declarada no recibo e nova tabela de integração vazia. Conferência posterior somente por GET/HEAD e SELECT, em 1440/390px, sem escrita no GitLab ou criação de exemplos operacionais. Credencial dedicada de merge ativa e sem administração global. Portal local saudável em `http://localhost:3310`; aceite manual e implantação da aplicação piloto continuam pendentes.

### Roteiro manual

1. No Sistema, use o envio já confirmado do contrato e **Conferir condições e fonte do contrato**.
2. Se o MR estiver Draft, confira a revisão e confirme somente sua liberação. Verifique que a integração continua pendente.
3. Confira novamente, preencha motivo/aceite e confirme a integração. Acompanhe fila e resultado sem sair do portal.
4. Use **Conferir fonte na branch padrão** e compare commit/data/conteúdo, preservando eventual `contract.sha` histórico acima.
5. Para uma pendência que não deve continuar, abra **Resolver acompanhamento deste envio** e registre o encerramento local. Não usar isso como rollback GitLab.
6. Registre **OK RA-10d** ou o impedimento. Falhas e resposta perdida são demonstradas nos testes isolados, sem fabricar resultados reais.

## 38. RA-11 — construção de trabalho e novo piloto

**Situação:** implementada, testada e publicada no portal local em 29/10/2026; OK manual pendente. Escopo da entrega: primeiro perfil controlado Node 24/React, uma unidade HTTP, sem migração. A construção gera artefato de trabalho DEV e não altera fase da História, Tarefas, aprovação ou release. Não implanta a aplicação nem prepara candidata QA.

### Piloto escolhido pelo usuário

Após a leitura do acervo, o usuário escolheu **criar outra aplicação do zero**, de venda de cursos on-line, e aprovou catálogo → detalhes → pedido, **sem cobrança**. Não foram adotados os dados, código ou aprovações do VIDLOC.

- Sistema **CURSOS — Venda de Cursos On-line**, ID `cmvtxl4ve000001payfklcdhw`.
- Projeto **CURSOS-VENDAS — Loja de Cursos On-line**, ID `cmvtxl4xb000901pazsea31mm`.
- Épico **CURSOS-VENDAS-E1 — Compra de cursos sem cobrança**.
- Histórias **CURSOS-VENDAS-1 — Consultar catálogo e detalhes de cursos** e **CURSOS-VENDAS-2 — Registrar pedido de curso sem cobrança**.
- Repositório próprio provisionado automaticamente: projeto GitLab 9, `sdlc/cursos/app`, sem aproveitar conteúdo do piloto anterior.

Cadastro usou os comandos normais auditados, persona Ana declarada e chaves idempotentes, sem SQL de negócio. As duas Histórias estão em SPECIFICATION e possuem as Tarefas padrão do planejamento, sem aprovação, resultado de agente, merge, build ou deploy artificial. Dados de cursos/compradores/pedidos não foram preenchidos para demonstração. O escopo e os critérios técnicos ainda precisam passar pelo Gateway de Especificação.

DE-04 passa a ter o recorte técnico inicial Node 24/React, uma unidade HTTP e serviço de construção local separado. A escolha do novo piloto está registrada; outras topologias/runtimes continuam fora da capacidade. DE-06 continua necessário antes da implantação com persistência, saúde e recuperação de dados; `migrations: none` do perfil inicial não é promessa de reversão de qualquer dado futuro.

### Fluxo entregue

Na própria Execução, o trilho **DEV** abre o quadro de construção, antes da ajuda recolhida. Após merge confirmado, a próxima navegação oferece **Preparar versão DEV** quando o executor está configurado. **Conferir versão para construir** consulta condições sem gravar; **Confirmar construção DEV** exige motivo/aceite, versão da História, operação anterior e contexto conferido. SHA, contrato, unidade e perfil ficam explícitos, com detalhes técnicos recolhidos. A Tarefa usa sua História proprietária e conserva o contexto da tentativa.

A fonte é o HEAD observado do destino DEV que contém o commit de integração da História por ancestralidade. Pode incluir outras alterações integradas no mesmo destino; não se anuncia isolamento por História. API fixa esse SHA e o contrato presente nele, com revalidação antes do envio. Mudança de fonte/contexto bloqueia a operação. Release não é obrigatória. Fonte ausente, referência de merge faltante, contrato inválido, perfil não suportado ou executor indisponível exibem impedimento em vez de liberar um botão sem explicação.

Pedido recebido, fila, execução, pausa, impedimento, falha, incerteza e artefato confirmado são separados. Perda de resposta mantém persona/corpo/chave entre abas/recarga e permite ler o mesmo job. GET falho conserva artefato datado e bloqueia decisões novas. Retomar/cancelar exigem versão e confirmação; cancelamento é somente antes do envio. Foco muda por gesto, não por polling. Correção adicional resolve a disputa de navegação entre seleção QA e retorno pendente de Tarefas, sem enfraquecer os testes anteriores.

### Executor e persistência

DevelopmentBuild preserva História/execução/referência integrada, Sistema/repositório/projeto, SHA, contrato, unidade, imagem preparada, autor/motivo, versões e intenção de despacho. Recorder e RequestKey compartilham transação; worker identifica iniciador humano e executor. Falha do recorder antes do despacho impede envio; falha após efeito conserva intenção e permite observação. Claim expirado sem despacho é bloqueado; após despacho não há envio automático por ausência de resultado. Inatividade pausa fila e retomada continua explícita.

API acessa um serviço local por socket Unix e não recebe socket Docker. Código executa sem rede/segredos, como UID 1000, raiz somente leitura e workspace tmpfs limitado, com snapshot próprio somente leitura. Serviço confere arquivo completo do SHA, caminhos/tipos, perfil de Dockerfile controlado e dependências preparadas. Saída arbitrária do compilador é descartada; não é exibida como mensagem/auditoria. Arquivos produzidos são validados e empacotados em outro container nunca iniciado. Resultado preserva imagem por ID e arquivo por digest/tamanho. [Perfil, receitas, limites e preparação reproduzível](executor-node24-react-v1.md).

O serviço confiável possui privilégio Docker do host; não é uma VM por build nem uma garantia contra administrador. Reinício do próprio serviço deixa trabalho interrompido incerto sem reexecutá-lo; resolução geral desses acompanhamentos, retenção/quota global de artefatos e diagnóstico protegido de compilador permanecem no backlog operacional. Nenhuma dessas lacunas é convertida em sucesso ou permissão para repetir código.

### Verificação e publicação

- **92 testes backend aprovados**, oito arquivos, incluindo 14 testes novos de persistência/worker e seis de provider; rodada `20261029T195450Z-d260a3`.
- **60 cenários de navegador aprovados**, incluindo 20 novos em 1440/390px e o arquivo anterior de navegação da História; rodada `20261029T195645Z-ad64f9`, sem skip/flaky. Catálogo total: 405 casos/47 arquivos; essa rodada dirigida não afirma ter reexecutado todo o catálogo.
- Seis contratos Python do serviço e checks auxiliares de auditoria/relay/controlador aprovados; build TypeScript/Next de produção aprovado.
- Ensaio real `executor-live-775730d1`: React compilado em container com sandbox, conteúdo conferido na imagem, falha não zero sem artefato/saída pública e repetição da mesma referência sem nova execução. Imagens/containers próprios removidos. Usa somente fixtures isoladas e não é a jornada GitLab → build → deploy do piloto.
- Rodadas anteriores com falhas de semântica do recorder, navegação e empacotamento experimental permanecem nos relatórios/ledgers. O ensaio real detectou que copiar tmpfs pelo archive do Docker não preservava os arquivos; a coleta passou a usar o comando fixo no container e a exigir `dist/app.js` antes de confirmar artefato. Não se reescreveram recibos antigos para verde.

Imagem publicada `sha256:b75f650344ae2a51f42a98c9ceea0b7f16539f3bb7641ecdea693a624776e898`, fonte `35af802b8f924e21ce0f6a8492832a88d9eb0fd003d100299c6c85c372abfc38`. Migration `202610290004_development_build`, 37 migrations/43 tabelas, backup privado verificado (289.078 bytes), 42 tabelas anteriores preservadas sob a normalização declarada e nova tabela vazia. Conferência real por GET/HEAD e SELECT aprovou 1440/390, bloqueio correto da História ainda não integrada, role restrita e executor pronto; API sem socket Docker. Serviço de build não recebeu jobs operacionais artificiais. [Recibo seguro](assets/ra11-development-build-2026-10-29/validation.json) e [revisão UX](assets/ra11-development-build-2026-10-29/ux-review.json).

### Roteiro manual e próxima execução

1. Abra o Projeto CURSOS-VENDAS e confira as duas Histórias em especificação, com o repositório novo do Sistema CURSOS.
2. Abra CURSOS-VENDAS-1 → Execução → DEV → **Conferir versão para construir**. A falta de integração deve aparecer como impedimento e impedir confirmação; isso é o estado real esperado, não uma falha a preencher com dados sintéticos.
3. Depois da preparação técnica e do ciclo real de código/contrato, confirme a construção da fonte conferida. Acompanhe fila/resultado e confira imagem/digest sem exigir release.
4. Registre **OK RA-11** ou o impedimento. Sucesso da construção deve continuar separado de implantação DEV e Desenvolvimento Finalizado.

**Próxima execução necessária do piloto:** preparar sua estrutura executável de forma controlada dentro do portal. O agente atual de codificação protege Dockerfile/infra e a proposta de contrato RA-10b altera somente a definição; não se deve contornar essas proteções por prompt ou editar a aplicação diretamente para demonstrar esta fatia. A preparação precisa produzir uma alteração revisável em branch/MR próprios, antes de habilitar o primeiro ciclo real e RA-12. Pagamentos externos e cursos/pedidos de demonstração não foram incluídos. Persistência dos pedidos, cadastro dos cursos e critérios técnicos serão detalhados antes da codificação. As demais RAs mantêm seus gates e OKs próprios.

## 39. RA-11b — preparação controlada da aplicação

**Situação:** publicada em `http://localhost:3310`, com implementação, validação e conferência local registradas no recibo abaixo. OK manual do usuário pendente. Esta fatia resolve a preparação técnica necessária ao piloto novo; não encerra RA-12 ou a entrega até PRD.

Sistema → Repositório do Sistema → **Preparação da aplicação**. A prévia apresenta nove arquivos completos e confere base/repositório/contexto. Publicação cria branch/commit/MR Draft próprios. A confirmação também autoriza compilar o commit exato, executar teste técnico HTTP e informar seu resultado ao GitLab. Os repositórios gerenciados exigem pipeline aprovado; a implementação conserva essa exigência. Liberar Draft e integrar são novas decisões confirmadas separadamente. Estrutura técnica integrada não é funcionalidade de negócio, aprovação de História, release ou implantação.

Fonte e efeitos conhecidos são preservados em intenção durável com autoria, versão, lease e recorder compartilhado. Cada efeito tem checkpoint; resposta incerta exige leitura do mesmo pedido. Continuação completa somente efeito ainda não iniciado. Envio de contrato concorrente é impedido. Encerramento local mantém intenção/efeitos; não desfaz GitLab. [Contrato completo, limites e comandos reproduzíveis](preparacao-aplicacao-node24-react-v1.md).

### Evidências e limites

- Backend dirigido: 126 testes aprovados em dez arquivos, incluindo 19 de API/persistência e 13 de fronteira GitLab da preparação. Rodada `20261029T211034Z-8e145e`, fonte estável.
- Serviço: oito contratos Python aprovados, incluindo propósito fixo, teste técnico, isolamento, falha sem prova pública e recusa de reutilizar ID com outro conteúdo.
- Interface: 41 cenários aprovados, incluindo 24 novos em 1440/390 e regressão dirigida de contrato/auditoria; rodada `20261029T211336Z-9c623b`, sem skip/flaky e com fonte estável. Catálogo total de 429 casos em 48 arquivos; os recibos discriminam o subconjunto reexecutado, sem declarar regressão completa. [Revisão UX e capturas](assets/ra11b-application-preparation-2026-10-29/ux-review.json).
- Ensaio real `application-live-8c0ea955`: projeto temporário próprio 13, main protegida, pipeline obrigatório e conta dedicada não administradora. Commit exclusivo → build real → teste HTTP real → status técnico/pipeline 22 → liberação de Draft → merge → nova compilação/teste do SHA integrado. Reconciliação somente leitura e remoção do projeto/imagens/containers confirmadas. Sem acesso à base operacional ou alterações em CURSOS.
- O ensaio descobriu uma falha real de transporte: o POST ao socket não enviava Content-Length. Cliente corrigido e contrato exercitado no socket real. Rodadas anteriores com falhas de fixtures, classificação de resultado sem prova e asserções foram preservadas nos relatórios; não foram convertidas retroativamente em sucesso.
- Build TypeScript/Next de produção aprovado. Instalação do serviço e publicação usam ledger administrativo externo, backup privado e verificação de preservação de linhas. Detalhes finais no [recibo seguro](assets/ra11b-application-preparation-2026-10-29/validation.json).

Imagem publicada `sha256:c77ad66f38368074230334a31531051cdd3c4ac5758fc12edcd4ab29c5af2e60`, fonte `c701a84bfe14a225828e647a4141782507835780ab82721bde57e966b9d9499c`. Migrations 005/006, 39 migrations e 44 tabelas: 43 anteriores preservadas sob a normalização declarada no recibo e a nova ApplicationPreparation vazia. Backup privado verificado de 300,109 bytes. Conferência publicada por GET/HEAD e SELECT em 1440/390 aprovou prévia real elegível de nove arquivos, confirmação explícita, conta runtime restrita e serviço capaz de build/teste, sem socket Docker na API. Ambas as Histórias CURSOS permanecem em especificação. Smoke final: quatro casos aprovados no ambiente persistente de automação; ui/verify removidos pelo controlador com verificação de propriedade. Ledgers operacionais e de regressão sem operações pendentes.

### Roteiro manual

1. Abra **Sistema CURSOS → Repositório do Sistema → Preparação da aplicação**, com Ana.
2. Clique **Conferir preparação Node 24/React** e confira os nove arquivos. CURSOS permanece sem starter até a confirmação desse pedido real.
3. Informe motivo/aceite e confirme a preparação. Acompanhe commit, Draft, build/teste técnico e status confirmado. Troque de aba ou recarregue para conferir recuperação do mesmo pedido.
4. Confira a etapa seguinte, libere o Draft e depois confirme a integração em ações separadas. Confirme a leitura atual do contrato e o recibo integrado.
5. Registre **OK RA-11b** ou impedimento. As duas Histórias do piloto continuam em especificação até o ciclo real do Gateway e dos agentes.

**Próxima fatia:** RA-12, implantação da versão de trabalho em DEV. Cadastro de cursos, persistência dos pedidos e critérios técnicos do piloto ainda precisam ser detalhados antes da codificação. Retenção/quota global de artefatos, diagnóstico protegido de compilador e recuperação administrativa geral do serviço continuam no backlog. Mantêm-se os indicadores existentes conforme a decisão do usuário, sem metas ou painel novo.

## 40. Correção de conceito — assistente, executores e ambientes

**Decisão autorizada pelo usuário em 29/10/2026:** o próprio SDLC deve conduzir a preparação e a operação de cada Sistema. O assistente entende a necessidade, propõe ações e conduz as confirmações pertinentes; serviços de domínio autorizam e registram a intenção; executores fazem os efeitos e comprovam o resultado. A administração mantém a infraestrutura base. O [contrato de responsabilidades](autonomia-assistente-executores-2026-10-29.md) é a referência desta correção.

### Correções aplicadas

- Separados cadastro da referência de ambiente, estrutura da aplicação, destino provisionado, build e implantação saudável. O Sistema e a release podem ter referências DEV sem runtime ou deploy.
- Propriedade de ambiente corrigida na arquitetura: Sistema, por meio do repositório único. Unidade/pasta não cria ambiente independente. DEV inicial é compartilhado; Histórias continuam sem exigir release para desenvolver/publicar em DEV.
- Corrigidos trechos antigos que diziam não existir executor de build ou limitavam templates a contratos, após as entregas RA-11/11b.
- Explicitada a cobertura real da conversa: o assistente ainda não encaminha preparação/build/deploy. As confirmações e comandos já entregues na tela permanecem válidos; prompt não supre essa ligação.
- Registrada RA-11c para oferecer a preparação na conversa usando os mesmos serviços. RA-12 dividida em a: destino, b: implantação e c: encaminhamento pela conversa. Nenhuma dessas fatias foi marcada como implementada ou testada.
- O fluxo final de publicação DEV deve preparar o destino ausente dentro do perfil suportado e mostrar os efeitos de cada etapa, sem comandos avulsos por Sistema. Infraestrutura base indisponível ou perfil não suportado gera impedimento explícito.

### Verificação e limites desta revisão

Conferência das fontes atuais: `environments.ts` registra referências; `application-preparations.ts` e RA-11b controlam o starter; `development-build-provider.ts` e o serviço oferecem build/verificação técnica; `assistant.ts`, `requirements.ts` e `contract-proposals.ts` conservam limites de conversa/proposta local. Não foi encontrada uma ferramenta entregue de provisionamento ou deploy no chat.

Esta entrega altera documentação e planejamento. Verificação aprovada: oito documentos, links novos de responsabilidades, IDs/checklist das quatro fatias pendentes, distinção entre capacidades atuais/pendentes e `git diff --check`. `scripts/prepared.py verify` confirmou que fonte executável, manifesto e imagens preparados continuam correspondentes. Não exige migration, publicação do portal, alteração de dados ou reexecução da regressão funcional. Os recibos anteriores continuam com suas evidências e OKs pendentes, sem serem usados como aceite da autonomia planejada. Indicadores existentes preservados; nenhuma meta nova.

**Próxima execução:** RA-11c, ligação da preparação com o assistente, antes de considerar encerrada essa experiência. A implantação DEV avança por RA-12a/b/c. A revisão do conceito não executa essas fatias nem altera a aplicação CURSOS.

## 41. RA-11c — preparação da aplicação pelo assistente

**Situação:** publicada em `http://localhost:3310`, com validação e conferência local registradas nesta fatia. OK manual pendente. Provisionamento e implantação DEV continuam nas RA-12a/b/c.

O Assistente em contexto do Sistema apresenta **Preparar aplicação** ou **Acompanhar preparação** junto à conversa, fora do texto e do histórico. O diálogo reutiliza o painel da RA-11b, com prévia completa e confirmações próprias. **Conversa do Sistema** e o link **Abrir assistente do Sistema** na aba Conversas dão acesso ao fluxo. O encaminhamento conserva conversa, rascunho, URL, foco e recuperação do pedido, inclusive entre diálogo e repositório.

`GET /api/assistant` projeta `systemAction` do contexto atual, independentemente da página de mensagens. É observação de Sistema/repositório/operação, sem tokens de autorização ou acesso Docker. Só o contexto de Sistema recebe essa ação. O snapshot da mensagem fornece a observação ao modelo, com orientação para encaminhar a ação disponível e explicar limites; texto não publica, não cria ambiente ou aprova merge. A conferência remota e os comandos mantêm os serviços da RA-11b.

Conversa no Sistema passa a aceitar mensagens pelas personas autorizadas sem exigir seleção de Projeto. Geração/aplicação de planejamento e criação de itens conservam os destinos e permissões de Projeto. Falha de metadados ou mudança de persona/contexto impede decisões novas; pendência anterior conserva autoria, corpo e chave de recuperação. Modelo indisponível não desabilita o executor já configurado. Não há novo comando, fila, tabela ou indicador de negócio.

### Verificação e publicação

Resultados, hashes, limites e conferência de publicação estão consolidados no [recibo seguro](assets/ra11c-assistant-preparation-2026-10-29/validation.json) e na [revisão UX](assets/ra11c-assistant-preparation-2026-10-29/ux-review.json). O registro não substitui OK manual. Fixtures permanecem em testes isolados; nenhuma aplicação ou resultado do piloto é alterado para demonstração.

- **83 testes backend aprovados**, oito arquivos, incluindo 11 novos de ação/contexto do assistente; rodada `20261030T020447Z-f6f116`.
- **59 cenários únicos no runtime final**, por ID: rodada `20261030T020334Z-1c8241` com 57/59 e dois erros de asserção textual, seguida de `20261030T020652Z-66f856` com os 20 novos aprovados após ajuste só no teste. Runtime igual, relatórios brutos preservados. Sem skip/flaky. Rodada preliminar de 56 permanece qualificada na revisão UX; não é somada ao runtime final.
- TypeScript/Next de produção aprovados. Catálogo total: 449 casos em 49 arquivos. Smoke final: quatro casos aprovados no ambiente persistente de automação. Esta é regressão dirigida, não completa.
- Imagem publicada `sha256:b3a037f310e2b56faf30350ee5414d11400d50e7352db5ce837eb7f796cb065c`, fonte `9c9fdc5cf404df66c9e2ce0e56db1cbaf84516c42122fa2920e09ff0f3647884`. Sem migration; 44 tabelas anteriores preservadas sob a normalização declarada, backup privado conferido (316230 bytes). Verificação real em 1440/390 somente por GET/HEAD e SELECT aprovou ação do Sistema, painel compartilhado, link local, retorno de foco e restrições de persona/Projeto, sem criar mensagens, jobs ou arquivos do piloto.
- UI/verify removidos pelo controlador com verificação de propriedade; fast permanece exclusivo da automação. Ledgers operacionais e de regressão sem operações pendentes. Inferência real, nova escrita GitLab e implantação DEV não foram executadas nesta validação.

### Roteiro manual

1. Abra **Sistema CURSOS → Conversas → Abrir assistente do Sistema**; confirme que o contexto é o Sistema e selecione Ana.
2. Peça orientação para preparar a aplicação. Use **Preparar aplicação** junto à conversa e confira o Sistema, a prévia de nove arquivos e o motivo/aceite.
3. Confirme somente quando desejar efetuar a preparação real. Acompanhe o mesmo pedido e a verificação técnica; liberação de Draft e integração continuam confirmações separadas.
4. Feche o diálogo e confira conversa/rascunho/URL. Use a recuperação ou entre no repositório do Sistema para continuar o mesmo pedido; recarregar e trocar persona não devem duplicá-lo.
5. Registre **OK RA-11c** ou o impedimento. A preparação continua distinta de provisionamento e implantação DEV.

**Próxima execução:** RA-12a, destino DEV do Sistema. RA-12b implanta o artefato confirmado; RA-12c amplia o encaminhamento do assistente às capacidades DEV entregues. Sem aprovação automática de desenvolvimento, QA ou PRD.

## 42. RA-12a — destino DEV do Sistema

**Publicada em 30/10/2026.** Primeira das quatro implementações sequenciais autorizadas sem liberação intermediária. OK manual permanece pendente.

Sistema → Ambientes oferece preparação do destino antes do quadro das quatro referências. A revisão fixa Sistema/repositório/ambiente, contrato e perfil; motivo/aceite autorizam intenção durável. Executor por socket cria somente rede interna própria, confere propriedade e preserva prova. Não implanta aplicação ou altera versão/URL do ambiente. Consulta e prova histórica são distintas; perda de resposta usa o mesmo pedido, sem nova criação. Pausa, retomada, cancelamento e auditoria seguem os contratos transversais.

Validação: 39 testes backend em cinco arquivos, 20 cenários finais de navegador em 1440/390, cinco contratos Python e ensaio real cliente Node → socket → Docker. Confirmados isolamento, identidade, replay, retarget recusado, reconciliação e limpeza dos recursos exclusivos. Rodada anterior de26inclui seis casos do cadastro das referências em sua própria fonte. Build TypeScript/Next aprovado após correção restritiva do tipo de role. [Recibo seguro](assets/ra12a-environment-target-2026-10-30/validation.json) e [UX/capturas](assets/ra12a-environment-target-2026-10-30/ux-review.json).

Migration202610300001_environment_target: fontes EnvironmentOperation/EnvironmentTarget, intenção/prova imutáveis e conta runtime restrita; rollback vazio validado e populado recusado. Publicação com backup privado verificado,44tabelas anteriores preservadas sob normalização declarada e duas novas vazias. Instalação de plataforma não criou destino para CURSOS. Conferência publicada por GET/HEAD/SELECT aprovou1440/390 e impedimento correto: falta preparar/integrar o contrato da aplicação, disponível pelo fluxo RA-11b/c.

**Roteiro:** Ana → Sistema CURSOS → Ambientes → Conferir destino DEV. Confira o impedimento real até integrar a preparação da aplicação. Após contrato compatível, revise/autorize a preparação; acompanhe recurso confirmado, recarga e retomada do mesmo pedido. Estado de implantação deve permanecer separado.

**Próxima fatia autorizada:** RA-12b, implantação de artefato confirmado. [Contrato do executor](executor-destinos-dev-v1.md) e [acompanhamento das quatro entregas](execucoes-noturnas-2026-10-30.md).

## 43. RA-12b — publicar artefato DEV

**Publicada em 30/10/2026**, segunda das quatro entregas autorizadas. OK manual pendente. História → Execução/Ambientes → DEV oferece publicação após a construção, revisão de destino/fonte e confirmação. Preparação necessária é encadeada pelo comando existente; implantação permanece efeito separado. URL estável por Sistema, troca após saúde e preservação da anterior em falha. Recibo histórico e disponibilidade atual são distintos. Não exige release nem conclui História/desenvolvimento.

Validação: 12 casos novos backend; 24 adjacentes aprovados em sua rodada identificada; 44 casos de navegador (20 publicação, 20 construção, quatro jornada), seis capturas revisadas, cinco contratos Python e ensaio real com três imagens, falha HTTP503, substituição e recuperação. Corrigidos referência ausente na fixture, keys React duplicadas e acesso privado à rede interna identificado pelo ensaio real. Falhas preservadas, sem somar reexecuções como novos casos. Build TypeScript/Next aprovado. [Recibo](assets/ra12b-development-deployment-2026-10-30/validation.json), [UX](assets/ra12b-development-deployment-2026-10-30/ux-review.json) e [contrato/limites](implantacao-dev-v1.md).

Migration 202610300002_development_deployment adiciona fonte de intenção/prova imutável, restrição por ambiente e grants. Publicação com backup privado verificado e linhas anteriores preservadas; nova fonte vazia. CURSOS consultado somente por leitura, sem construir/publicar ou editar aplicação para demonstração. Indicadores existentes mantidos.

**Roteiro:** Ana → História → Execução → DEV → Conferir publicação DEV. Sem merge/build válidos, confira impedimento real. Com artefato confirmado, revise e confirme; acompanhe preparação se necessária, publicação e URL saudável. Resultado incerto usa Verificar mesmo pedido. Aprovação de desenvolvimento permanece separada. Próxima entrega: RA-12c, condução pelo assistente.

## 44. RA-12c — conduzir DEV pelo assistente

**Publicada em 30/10/2026**, terceira das quatro entregas autorizadas. OK manual pendente. Conversa do Sistema abre preparação do destino; conversa da História abre publicação, inclusive quando acessada por Tarefa. Os painéis reutilizam prévia, confirmação, comandos e recuperação existentes. Metadados do servidor fixam contexto; texto da conversa não executa efeitos. A situação atual independe da página de mensagens. Não há ferramenta de escrita do modelo, fila ou executor paralelo.

Validação: 62 casos backend em seis arquivos; navegador e capturas no [recibo](assets/ra12c-assistant-dev-2026-10-30/validation.json) e [revisão UX](assets/ra12c-assistant-dev-2026-10-30/ux-review.json). Cobertura inclui escopo da Tarefa proprietária, papel real, metadados incompletos/alheios, consulta perdida, invalidação de aceite antigo e handoff entre conversa/ambientes após ACK perdido. Chave, corpo e persona originais são preservados. Publicação com backup privado e linhas anteriores preservadas; nenhuma migration. O piloto foi consultado somente por leitura, sem avançar seus gates ou fabricar demonstração. Indicadores existentes mantidos.

**Roteiro:** Ana → CURSOS → Conversas → Abrir assistente → Preparar destino DEV. Na História, abra a conversa contextual e Publicar em DEV. Confira os impedimentos reais antes de construir/publicar. Enviar mensagem não substitui confirmação. Recuperação incerta consulta o mesmo pedido, inclusive ao voltar à tela original. Próxima entrega: RA-13, executor de testes DEV.

## 45. RA-13 — executar testes DEV e retornar ao ciclo de correção

**Publicada em 30/10/2026**, quarta e última entrega desta sequência autorizada. OK manual pendente. História/Tarefa → Execução → DEV apresenta testes após publicação, com suíte, cobertura, casos e efeitos de escrita conferidos antes da confirmação. O executor HTTP testa a instância ativa fixada, preserva nomes/índices da versão e distingue reprovação, falha de executor e resultado incerto. A prova não é inferida de uma descrição de teste ou de HTTP health.

Somente suíte de aceitação que cobre todos os critérios aprovados pode concluir a Tarefa Teste. Suíte técnica mantém andamento. Reprovação mantém status doing com situação operacional blocked; a História fica em testing e continua aberta. Solicitar correção abre o novo ciclo existente, com revisão/G1, sem gerar código por clique de navegação. Nova implantação/ciclo deixa a prova anterior histórica. Tarefas, conteúdo planejado e tentativas anteriores são preservados. Não aprova Desenvolvimento Finalizado, release ou produção.

Validação: 149 casos backend únicos em 12 arquivos, escolhidos por arquivo entre três rodadas identificadas; 89 cenários UI (24 novos/65 adjacentes) em 1440/390, seis capturas revisadas; cinco contratos Python de runtime, sete HTTP e três do controlador; catálogo com 533 casos/53 arquivos e smoke da lane automatizada. Não é uma regressão completa final do sistema. [Recibo e fontes](assets/ra13-development-tests-2026-10-30/validation.json) e [UX/capturas](assets/ra13-development-tests-2026-10-30/ux-review.json).

Ensaio real: builds e implantações exclusivos, POST/GET, HTTP409 funcional com saúde200, replay sem repetir POST, recusa de revisão substituída e cliente Node por socket Unix consultando provas e suíte. Recursos próprios conferidos e removidos; piloto/repositório/base de negócio não alterados. As falhas intermediárias foram preservadas. Corrigidos status indevido blocked da Tarefa, dependência de versão/quantidade de arquivos do starter, foco de recuperação, filtro da fixture e preparação do cliente de ensaio.

Migration 202610300003_development_test inclui intenção/prova imutável, FK da Tarefa/implantação, grants, bloqueio concorrente e evolução explícita do starter v2 com dez arquivos. V1 histórica permanece íntegra. Rollback vazio validado; prova DEV e preparação v2 impedem descarte. Publicação com backup privado e linhas anteriores preservadas. A base automatizada exclusiva foi renovada uma vez para consolidar a migration ainda em elaboração; o laboratório do usuário foi preservado e a lane rápida segue quente.

**Roteiro:** Ana → História → Execução → DEV. Após artefato publicado, Conferir testes DEV → revisar suíte/cobertura/casos e eventuais escritas → confirmar. Confira resultado por caso e referência da implantação; resultado antigo não comprova a versão atual. Reprovação → Solicitar correção → confirmar novo ciclo/G1 no comando existente. Testes de disponibilidade do starter são técnicos; os casos funcionais devem ser entregues pelo agente junto ao código. [Contrato e limites HTTP](testes-dev-http-v1.md).

As quatro entregas RA-12a/12b/12c/13 estão publicadas e tecnicamente verificadas; os quatro OKs manuais continuam pendentes. A próxima etapa do plano é RA-14, aprovação de Desenvolvimento Finalizado, que não foi iniciada nesta sequência.

Conferência pós-publicação das quatro capacidades: portal real em 1440/390, somente GET/HEAD, sem escritas bloqueadas ou enviadas; diálogo do assistente e painéis de construção/publicação/testes montados, impedimentos reais visíveis e confirmação indisponível sem fonte válida. Conta API uid1000/sdlc_portal_app, executor de testes pronto, sem socket Docker e sem DELETE da fonte de teste. As 48 tabelas mantiveram as mesmas linhas sob normalização declarada. Piloto permaneceu com zero destinos preparados, implantações ou testes fabricados e 161 eventos, conforme recibo. Capturas de viewport foram inspecionadas para separar o trilho fixo dos artefatos da captura fullPage.


## 46. RA-14 — aprovação de Desenvolvimento Finalizado

Em 30/10/2026 o usuário confirmou a proposta DE-03 para Desenvolvimento Finalizado: Product Owner (Ana), Arquiteto (Bruno) ou Admin podem aprovar após merge/rastreabilidade, revisão de código, segurança, implantação DEV e testes de aceitação válidos da mesma revisão. No laboratório o aprovador pode ter participado do G1. G2/G3 permanecem decisões distintas, ainda pendentes nas respectivas entregas. Mantidos os indicadores existentes, sem métricas/metas novas.

Precisão necessária ao DEV compartilhado: a publicação da História B não revoga a aprovação de A. A aprovação é vinculada à especificação/ciclo/código e ao artefato/evidências da própria História, sem acompanhar o HEAD global ou a disponibilidade corrente do destino. Mudança real da própria revisão/ciclo, novo artefato/publicação próprios ou reprovação técnica/funcional posterior exigem nova conferência. Falha de executor/resultado sem confirmação não é reprovação funcional e tem leitura própria. Situação administrativa, título, fase, associação à release e página de histórico não concedem nem invalidam por si uma aprovação.

A fatia implementa comando local explícito/idempotente, fonte imutável de aprovação, prévia da elegibilidade e leitura compartilhada na História/Tarefa/lista/composição de release. História continua aberta até PRD; release continua opcional em DEV e promoção QA não é liberada por este recorte (RA-15). Não altera o piloto ou resultados de agentes para demonstração. Revisão UX, testes isolados de concorrência/rollback/replay/perda de resposta e invalidação acompanham a entrega; aceite manual permanece separado.


### Entrega e evidências RA-14

**Publicada em 30/10/2026 em http://localhost:3310. OK manual pendente.** A decisão DE-03 acima foi implementada. História/Tarefa → Execução → DEV apresenta **Desenvolvimento Finalizado** após os testes. **Revisar aprovação** mostra condições, impedimentos e fontes; motivo e confirmação explícita registram uma aprovação imutável. A História continua aberta e não exige release em DEV. Nova revisão/ciclo/artefato ou reprovação da própria História torna a decisão anterior histórica. Ocupação do DEV por outra História preserva a decisão. Resposta de executor perdida conserva situação sem confirmação e recuperação do mesmo pedido; recibo recuperado exige leitura atual antes de indicar vigência.

Lista e composição usam a mesma validade. Na Release o marcador descreve a revisão atual da História, sem aprovar composição congelada/candidata. A prontidão integral continua na RA-15. O fluxo de novo ciclo explica que a aprovação anterior precisará ser renovada. [Contrato](aprovacao-desenvolvimento-v1.md), [recibo seguro](assets/ra14-development-approval-2026-10-30/validation.json) e [revisão UX/capturas](assets/ra14-development-approval-2026-10-30/ux-review.json).

Validação dirigida: **189 casos backend únicos em 12 arquivos**, incluindo 27 de aprovação, com fontes por arquivo no recibo. Primeira rodada de interface: 95/95; rodada final: 40/40 após qualificação do marcador da Release, incluindo os 24 novos e 16 adjacentes repetidos. Rodadas sobrepostas não são somadas; não é regressão completa do sistema. Catálogo: 557 casos em 54 arquivos; smoke: quatro verdes. Build TypeScript/Next aprovado. Cobertos papéis, cadeia de três SHAs distintos, DEV compartilhado, mudança própria, reprovação versus falha de executor, ciclo, associação a release, rollback/retentativa/concorrência, recuperação de ACK histórico, escopo da Tarefa e consulta sem escrita.

Migration `202610300004_development_approval` acrescentou a fonte imutável, funções de referência/validade, validação de vínculo e grants. Publicação com backup privado verificado; 48 tabelas anteriores preservadas, 49 após a migration, fonte nova vazia. Conferência real em 1440/390 somente por GET/HEAD e SELECT, com impedimentos corretos do piloto ainda sem evidências. Nenhuma aprovação, execução ou dado de demonstração inserido no piloto. Indicadores existentes mantidos; sem executor novo. UI/verify removidos pelo controlador após a validação; fast permanece aquecido e exclusivo da automação.

### Roteiro manual RA-14

1. Ana, Bruno ou Admin → História → Execução → DEV → **Revisar aprovação**. Sem evidências completas, conferir cada impedimento e usar os acessos às fontes.
2. Após merge/rastreabilidade, revisão/segurança, build, implantação e aceitação completa da mesma revisão, conferir a prévia, informar motivo e confirmar **Desenvolvimento Finalizado**, inclusive sem release.
3. Conferir o aprovador e as referências preservadas. A História continua aberta. Na lista e na composição, conferir o mesmo marcador, sem promoção QA liberada por ele.
4. Abrir novo ciclo da própria História: a aprovação anterior deve ficar histórica. Outra História publicar no DEV compartilhado não deve invalidá-la por si só. Persona sem papel pode consultar, mas não aprovar.
5. Em resposta perdida, recuperar o mesmo pedido e conferir a leitura atual. Registrar **OK RA-14** ou o impedimento neste plano, sem usar esse OK documental como aprovação de software.

**Próxima fatia:** RA-15, leitura da composição integral e impedimentos para DEV → QA. Fechamento/Cópia, pacote imutável e promoção continuam nas fatias respectivas; papéis G2/G3 ainda exigem definição.

## 47. Pausa do plano — validação real do zero até DEV

Em 30/10/2026 o usuário pausou as implementações e pediu uma jornada exclusivamente pela interface, com agentes reais, criando um catálogo de joias do zero até DEV. RA-15 e posteriores não foram iniciadas nesta execução. A aprovação documental das entregas anteriores não foi inferida.

Resultado: fluxo até DEV reprovado. Sistema JOIASC, Projeto CATLOG, Épico, História e seis Tarefas foram criados pela UI; especificação e Gateway avançaram, mas a preparação padrão falhou duas vezes por incompatibilidade de perfil e a codificação parou no limite de 15000 caracteres do contexto. Conversa de impedimento não produziu resolução aplicável pelo portal. Sem publicação DEV confirmada e sem uso de SQL, API direta, mocks ou suíte de backend. Os 28 casos do catálogo estão bloqueados, sem resultado funcional presumido. Clareza geral da próxima ação: 2/5, avaliação qualitativa.

[Relatório, prioridades e retomada](teste-real-joias-dev-2026-10-30.md) · [Matriz de casos e evidências](assets/joias-jornada-ui-2026-10-30/casos-e-resultado.json). Resolver esses bloqueios e repetir a jornada antes de declarar o fluxo DEV apto ou retomar as próximas RAs. Nenhum gate real foi fabricado para a demonstração.
## 48. Desbloqueio da jornada real até DEV

Em 30/10/2026, após a reprovação da jornada JOIASC, o usuário autorizou corrigir os impedimentos e repetir o percurso pela interface. RA-15 e posteriores permanecem pausadas. A aplicação continua sendo produzida e corrigida pelos agentes no portal; a manutenção atua no SDLC, sem editar o catálogo, seus dados ou resultados para demonstrar sucesso.

Foram corrigidos comparação de arquivos JSONB na preparação, retomada da intenção sem efeitos, permissões reais do executor, duplicação/limites do contexto, formato e perguntas da conversa, revisão conjunta de módulos atuais, sintaxe React/TypeScript, correções literais com recuperação para arquivos completos e contagem de ciclos por decisão humana confirmada. O diagnóstico agora oferece conversa e novo Gateway, sem retry que ignore a decisão. CODE REVIEW distingue defeitos atuais de recomendações; todo defeito informado, em qualquer severidade, e todo alerta do scanner continuam bloqueando. Pareceres anteriores permanecem preservados e exigem nova análise sob a política corrente.

A repetição acrescentou validação de regex no JavaScript emitido e prazo único no cliente HTTP local. A seleção administrativa do codificador já instalado não resolveu sozinha a duração: houve nova chamada encerrada no teto explícito de sete minutos. A retomada técnica passa a pedir resposta curta por intervalos, mantendo validação integral, SHA, congelamento e publicação existentes. Essas correções e suas verificações isoladas não são aprovação funcional da aplicação.

A preparação real foi retomada pela interface, compilada e integrada no MR !2. A História passou por novos Gateways e correções no MR !3, com Ana, sem autorização de bibliotecas novas. As publicações do portal são sem migration, com backup e conferência das 49 tabelas; a ocorrência de retorno da imagem e a normalização restrita da projeção corrente de acompanhamento de merge estão documentadas. Indicadores existentes mantidos, sem metas ou contagens novas.

**Validação funcional ainda em andamento:** merge da História, construção/publicação DEV e os 28 casos do catálogo precisam de resultado real registrado. As verificações internas e 99 cenários dirigidos de interface, seguidos de quatro casos de diagnóstico (rodadas sobrepostas), protegem as correções e não substituem essa aceitação. Catálogo de regressão: 565 casos em 54 arquivos. Não há OK manual, publicação DEV, aprovação de Desenvolvimento Finalizado ou avanço das próximas RAs inferidos deste registro parcial.

[Correções, publicação, testes e limites](correcao-fluxo-dev-2026-10-30.md) · [revisão UX inicial](assets/desbloqueio-dev-2026-10-30/ux-review.json) · [diagnóstico e ação principal](assets/desbloqueio-dev-2026-10-30/quality-diagnosis-ux-review.json).
