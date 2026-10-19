# Especificação do piloto e plano de instalação

Data: 2026-10-14. Status: proposta revisável; sem instalação ou provisionamento autorizado por este documento.
Relacionada à [arquitetura](sdlc-agentico-proposta.md).

## 1. Decisões para o piloto

Produto: Central de Solicitações, aplicação web local com banco, autenticação, dois papéis e histórico de alterações. O usuário do SDLC interage pelo portal; o usuário da aplicação utiliza sua própria interface.

Premissas propostas: um humano acumula funções de responsável pelo produto e aprovador de release; contas de agentes permanecem distintas. Publicação significa ambiente local estável, sem acesso público. Dados sintéticos, sem anexos, e-mail, serviços pagos ou integrações externas. Aprovações críticas exigem sessão humana autenticada; agentes não podem se passar pelo humano.

Stack proposta para portal e aplicação: Python 3.12, FastAPI, templates HTML e recursos CSS/JavaScript locais; SQLAlchemy/Alembic, PostgreSQL e pytest. Playwright para navegação automatizada. A escolha reduz runtimes e build de frontend no piloto; aplicativos futuros podem usar outros stacks mediante templates preparados offline.

São escolhas de projeto, não capacidades já implementadas. A plataforma será construída inicialmente por desenvolvimento convencional assistido; não se pressupõe que um SDLC inexistente consiga criar a si próprio. O critério de quase nenhum contato com código aplica-se à entrega do produto piloto por meio da plataforma pronta.

## 2. Outcomes e backlog do produto

OUT-001: permitir que solicitante e operador concluam um ciclo de solicitação exclusivamente pela interface e consultem seu histórico.

Baseline: processo ainda inexistente. Meta proposta: cinco roteiros com dados sintéticos concluídos por um humano, todos com histórico correto, sem edição de código ou SQL. Registrar conclusão e dificuldades; não inferir ganho de produtividade a partir de cinco casos.

EP-001: abrir e acompanhar solicitações. EP-002: tratar solicitações com autorização. EP-003: preservar histórico e visibilidade.

| História | Comportamento e critérios de aceitação | Cenários obrigatórios |
| --- | --- | --- |
| US-001 — acesso | Solicitante acessa seus dados; operador acessa todas as solicitações; sessão expira e logout invalida acesso | Login correto/incorreto, logout, sessão expirada, acesso sem sessão, proteção contra tentativas repetidas |
| US-002 — cadastro | Título de 1–120 caracteres após trim; descrição de 1–2000; ID único; estado inicial aberta; autoria e data registrados | Válido, vazio, excesso de tamanho, conteúdo HTML exibido como texto, repetição do mesmo envio sem duplicar |
| US-003 — consulta | Solicitante vê somente seus registros; operador vê todos; filtro por estado; paginação estável | Lista vazia, múltiplas páginas, filtros, consulta direta a ID de outro usuário, tentativa de alterar filtro para obter dados alheios |
| US-004 — tratamento | Somente operador altera aberta → em andamento → concluída; encerramento exige nota de 1–1000 caracteres; edição concorrente é detectada | Transições válidas/inválidas, papel inadequado, nota vazia, duas alterações com mesma versão, requisição sem proteção CSRF |
| US-005 — histórico | Registro de criação e mudanças com ator, data, estado anterior/novo e nota; sem edição de histórico pela UI | Ordem dos eventos, conteúdo correto, acesso autorizado, tentativa de editar/apagar evento |

Histórias dependem de US-001; US-004 depende de US-002/003; US-005 acompanha criação e tratamento. Mudanças em critérios geram nova versão, preservam a anterior e invalidam aprovações associadas.

Modelo do produto: `users(id, username, password_hash, role, active)`, `requests(id, owner_id, title, description, status, version, created_at, updated_at)`, `request_events(id, request_id, actor_id, previous_status, new_status, note, occurred_at, command_id)` e `processed_commands(key, request_hash, result_ref)`. Datas UTC; apresentação em America/Sao_Paulo. Constraints e transações protegem autoria, versão e idempotência. Passwords nunca aparecem em logs ou fixtures publicadas.

## 3. Experiência do portal

| Tela | O humano faz | Evidência apresentada |
| --- | --- | --- |
| Projetos e outcomes | Define resultado, meta e restrições | Versões, dependências e progresso |
| Backlog | Revisa épicos, histórias e critérios | Diferenças desde a versão aprovada |
| Execução | Inicia, pausa, cancela e responde perguntas | Etapa atual, tempo, tentativas, ações e bloqueios |
| Aprovações | Aprova/rejeita escopo, plano, risco ou release | Objeto exato, impacto, evidências e justificativa |
| Homologação | Abre aplicação e executa roteiro | Resultado de testes, limitações e formulário de aceitação |
| Auditoria | Navega do outcome ao deploy e exporta pacote | Eventos, hashes, autoria e relações |

Cada interação deve gerar evento. Atualização por SSE com retomada por ID de evento e fallback para consulta; nenhum requisito de internet. Logs técnicos e código são uma expansão opcional, sem exigir leitura para aceitar o comportamento da aplicação.

## 4. Contratos de controle

IDs internos UUID, IDs humanos OUT/EP/US/AC, versão inteira monotônica e `project_id` obrigatório. Schema de contrato inicial `v1`. Entradas validadas; comando desconhecido ou inválido falha sem executar ferramenta.

| Entidade | Campos essenciais |
| --- | --- |
| WorkItem | ID, tipo, pai, versão, critérios, fonte Forgejo, hash do conteúdo, estado de aprovação |
| Run | projeto, história/versão, plano/hash, política/hash, estado, etapa, orçamento, lease, heartbeat, cancelamento |
| ToolCommand | execução, etapa, ferramenta, argumentos validados, idempotency_key, input_hash, prazo, resultado |
| Approval | ator humano, decisão, tipo, object_id/version/hash, target, policy_hash, justificativa, revogação |
| Artifact | SHA256, tamanho, tipo, origem, commit, build, caminho relativo privado |
| TestResult | critério, cenário/versão, execução, resultado, relatório/hash e ambiente |
| Finding | ferramenta, regra, severidade, evidência, status, exceção humana/prazo |
| Release | commit, imagem/digest, migrações/hashes, manifest_hash, testes, findings, aceite |
| Deployment | release, destino, aprovação, backup, estado e verificações posteriores |
| AuditEvent | sequência por projeto, correlação, ator, tempo, tipo, payload redigido, hash anterior e atual |

Hash de aprovação calculado sobre JSON canônico do objeto, inclusive referências por hash. Anexos imutáveis por conteúdo. Concorrência por `expected_version`; divergência retorna conflito, nunca sobrescreve decisão silenciosamente.

Backlog canônico no Forgejo, via issues com labels de tipo e bloco estruturado versionado. Controle mantém snapshot/hash e relações indexadas para auditoria. Webhook autenticado mais reconciliação periódica detectam edição fora do portal; alteração invalida snapshot aprovado. Versão anterior fica nas evidências. Atualizações entre sistemas usam outbox e reconciliação; não presumir transação distribuída.

API inicial:

| Método e rota | Efeito |
| --- | --- |
| POST /v1/projects | Cria projeto e vínculo com repositório local |
| POST /v1/projects/{id}/work-items | Propõe item e agenda sincronização |
| POST /v1/runs | Solicita execução com versões e política |
| GET /v1/runs/{id} | Retorna estado, etapa, orçamento e perguntas |
| POST /v1/runs/{id}/commands | pause, resume, cancel ou resposta humana tipada |
| POST /v1/approvals | Decide sobre objeto e hash identificados |
| POST /v1/approvals/{id}/revoke | Revoga aprovação e bloqueia tarefas pendentes |
| POST /v1/releases/{id}/acceptance | Registra roteiro e aceite/rejeição humana |
| POST /v1/deployments | Solicita promoção com aprovação válida |
| GET /v1/projects/{id}/events | Lista ou transmite eventos autorizados |
| GET /v1/artifacts/{hash} | Obtém evidência após autorização de projeto |

Comandos mutáveis exigem autenticação, `Idempotency-Key`, versão esperada e proteção CSRF quando originados por sessão browser. Repetição com mesmo conteúdo retorna o resultado anterior; chave reutilizada com outro conteúdo retorna conflito. Respostas async incluem command_id e estado; ainda não confirmam sucesso do efeito.

## 5. Estados e execução recuperável

Execução: planejada → pronta (aprovações válidas) → em execução → em validação → concluída. Pode entrar em aguardando humano, pausada, falhou ou cancelada. Retomada exige precondições revalidadas. Execução concluída não significa release aceita.

Release: candidata → validada → em homologação → aguardando aceite → aceita → publicada. Rejeição cria trabalho de correção e nova candidata. Deploy: solicitado → autorizado → preparando backup → aplicando → verificando → concluído; falha entra em recuperação requerida ou recuperado.

Worker reivindica tarefa com lease de 90 s e heartbeat a cada 15 s. Valores iniciais revisáveis. Expiração leva à reconciliação, não à repetição cega. Para deploy/migração, consultar resultado e estado do destino antes de tentar novamente. Lock por projeto/ambiente e fencing token impedem que worker antigo execute novos comandos após perder o lease.

PostgreSQL mantém estado, outbox e eventos transacionalmente. Efeitos externos têm command_id; comprovantes são persistidos e reconciliados. Garantia pretendida: entrega pelo menos uma vez e deduplicação por efeito; não prometer execução exatamente uma vez universal.

LangGraph guarda checkpoints persistentes por run/thread. Ferramentas não executam efeitos privilegiados diretamente no nó antes de uma aprovação. Portal escreve respostas; worker valida identidade, hash e estado antes de retomar. Reinício não elimina aprovações nem perguntas.

Política inicial: uma inferência ativa, um job pesado ativo, máximo de três tentativas por etapa e três ciclos de correção por história. Inferência: timeout inicial 180 s, sujeito ao benchmark; etapa de build/teste: 15 min; scan: 20 min. Exceder orçamento gera pergunta humana, não aumenta limites automaticamente.

## 6. Gates e segurança

G0 escopo: outcome, histórias e critérios aprovados. G1 plano: arquitetura, ferramentas, testes e política aprovados. G2 qualidade: cenários obrigatórios passam e build reproduzível com dependências locais. G3 segurança: sem secrets e sem findings altos/críticos sem exceção válida. G4 aceite humano: roteiro executado sobre o digest identificado. G5 publicação: release/destino/migrações aprovados e backup disponível. G6 verificação: smoke pós-deploy e evidências persistidas.

Pipelines oficiais residem em template protegido, separado do código produzido pelo agente. Mudanças no template/política exigem aprovação humana antes de uso. Agente edita branch e propõe revisão; conta de integração com permissões mínimas faz merge apenas após gates válidos. Validação executa o commit candidato; manifesto de release liga o commit final à árvore validada. Se a árvore mudar, revalidar. Não reconstruir imagem ao promover homologação para publicação.

Agentes possuem ferramentas de leitura/edição de arquivos limitadas ao checkout e execução de tarefas previamente enumeradas. Rejeitar escape por caminhos absolutos, `..`, links simbólicos e injeção de argumentos. Shell arbitrário fica fora do primeiro piloto. Edições de código ainda podem executar conteúdo durante testes: isolamento continua obrigatório.

Workers de código ficam em VM descartável/dedicada, sem mounts Windows ou volumes do controle e sem credenciais de deploy. Runner e daemon de execução residem nessa fronteira. O serviço de controle não compartilha socket Docker com worker. Compatibilidade de virtualização e custo de memória devem ser verificados antes de instalação; se a VM não couber, interromper esse marco e revisar desenho, sem liberar execução irrestrita em WSL.

Publicação utiliza executor separado com destino fixo e comando validado por schema, fora do processo do agente. Segredos por serviço, redigidos em eventos, fora do Git e dos artefatos. Portal e Forgejo acessíveis somente por loopback no Windows; bancos sem publicação de porta. Acesso VM → Forgejo e inferência deverá usar endpoint privado autenticado restrito à rede da VM. Não expor Ollama sem autenticação na LAN.

Integração entre distro SDLC, VM e laboratório é marco de viabilidade: mapear encaminhamento local, origem real dos pacotes e filtros. Não assumir que `localhost` ou nomes Docker funcionam entre esses ambientes. Proxy de inferência com token e limite de chamadas poderá ser necessário; mudança de bind/firewall do laboratório será descrita e aprovada separadamente.

## 7. Testes de aceitação da plataforma

| ID | Demonstração | Evidência e condição de sucesso |
| --- | --- | --- |
| PL-01 | História percorre o ciclo completo | Cadeia outcome → aceite → deploy consultável, todos os links válidos |
| PL-02 | Agente entrega a aplicação | Cinco roteiros humanos passam sem edição manual de código/SQL; intervenções registradas |
| PL-03 | Deploy sem aprovação, revogado ou hash diferente | Todos bloqueados antes de qualquer alteração do destino |
| PL-04 | Reiniciar controle e worker em pontos de falha | Retoma ou pede reconciliação; nenhum deploy ou registro duplicado |
| PL-05 | Pausar/cancelar durante execução | Nenhum novo comando após confirmação; efeitos anteriores visíveis |
| PL-06 | Alterar critério aprovado fora do portal | Detecta mudança, invalida aprovação e bloqueia continuidade |
| PL-07 | Acesso indevido e prompt injection | Ferramentas negam privilégios; secrets ausentes de entradas/logs |
| PL-08 | Backup/restauração | Metadados, Git e evidências recuperados; hashes e vínculos conferidos |
| PL-09 | Internet indisponível | Worker novo realiza build, testes, scans e entrega só com acervo local |
| PL-10 | Pressão de memória e modelo indisponível | Fila e bloqueio visíveis; sem aumentar privilégios ou usar nuvem |
| PL-11 | Rejeição de homologação | Correção ligada à rejeição; nova release exige novo aceite |
| PL-12 | Migração desde versão anterior | Dados preservados, recuperação ensaiada e schema esperado confirmado |

Aceitação técnica registrada por testes não substitui assinatura humana. Não apresentar os testes deste documento como já executados.

## 8. Versões, recursos e armazenamento

Base consultada em 2026-10-14: Forgejo 15.0.10 LTS, selecionado pela janela de suporte em vez da série estável perto do fim de suporte; PostgreSQL 17.11 como candidato inicial suportado. Fontes oficiais abaixo. Revalidar patches no preparo. Runner, LangGraph, frameworks, scanners e imagens terão versões exatas resolvidas e testadas na preparação, com hashes; nenhum `latest`, intervalo aberto ou digest inventado no manifesto final. Estas pendências impedem declarar o pacote de instalação pronto.

Arquivo futuro `environment.lock.json`: nome, versão, origem, digest/SHA256, licença SPDX verificada, arquitetura, dependências, assinatura/proveniência disponível, data do download e resultado de verificação. Incluir transitive locks Python, wheels, imagens, bases dos scanners e navegador Playwright.

Orçamento inicial de medição, não certificação: Windows 8 GiB, serviços de controle/backlog/bancos 4 GiB, VM worker 6 GiB, laboratório/host Linux até 8 GiB de RAM e restante como folga. Evitar offload que exceda esse orçamento. VRAM é separada da RAM, mas caches, contexto e offload consomem recursos adicionais. Se Windows ou laboratório já ultrapassarem a hipótese, reduzir escopo/modelo ou revisar hardware antes de prosseguir.

Não reservar CPU pelo valor de GHz informado. Medir com máquina ligada à energia e carga sustentada; limitar concorrência e monitorar temperatura, memória, paginação e latência. Exigir ausência de OOM e swap sustentado no cenário piloto. Definir baseline após ensaio, sem prometer tempo de entrega antecipado.

Orçamento inicial de disco: 50 GiB runtime/bancos/Git, 120 GiB imagens/pacotes/worker, 50 GiB evidências e 50 GiB backups locais de recuperação; revisar por medição. Backups contra perda física exigem mídia externa local. No piloto, evidências não são apagadas automaticamente; ao atingir quota, bloquear novos jobs e pedir decisão. As distros compartilham orçamento WSL global; não alterar `.wslconfig` implicitamente.

## 9. Plano de instalação separado

Diretório `sdlc/` deste repositório, separado de `lab/`; novos produtos no GitLab local do SDLC, com workspaces internos fora deste repositório. Distro `agentic-sdlc`, volumes prefixados, dados no ext4 e administração por seu próprio bootstrap. Nenhuma instalação de Python/Node/Docker Desktop no Windows prevista; reusar WSL e driver já disponíveis.

Estrutura proposta: `bootstrap.ps1`, `compose.yaml`, `config/`, `locks/`, `services/control/`, `services/portal/`, `workers/`, `templates/`, `policies/`, `tests/`, `docs/` e `offline/manifest.json`. Artefatos/secrets/runtime ficam fora do Git. Projetos residem no GitLab local. Checkouts e artefatos ficam no ambiente SDLC, fora deste repositório de ferramentas.

Comandos a implementar, ainda não existentes: `prepare` baixa/verifica acervo; `plan` mostra mudanças/recursos; `up` converge só a distro própria; `doctor` faz checks; `test` executa contratos; `backup` exporta estado; `restore` valida e restaura com confirmação do destino; `down` preserva dados. Comandos destrutivos deverão conferir nome, caminho e marcador de propriedade e exigir confirmação explícita.

| Marco | Ações previstas | Saída e bloqueio de passagem |
| --- | --- | --- |
| M0 — pacote revisável | Escrever setup, locks, políticas e testes em repo separado | Diff, licenças, downloads, alterações previstas e estimativas revisáveis |
| M1 — viabilidade | Inventário read-only, medição de RAM, teste de VM e desenho de rede | Confirma isolamento, capacidade e conectividade; não amplia bind sem revisão |
| M2 — preparo conectado | Baixar acervo fixado, regras, bases e navegador | Manifesto verificado; todas dependências necessárias presentes |
| M3 — serviços de controle | Importar distro própria, instalar runtime, iniciar Forgejo/PostgreSQL/API/portal | Health checks e fluxo determinístico de aprovação/auditoria |
| M4 — workers e inferência | Preparar VM, registrar runner restrito, conectar proxy local | Permissões e bloqueio de saída testados; benchmark do modelo |
| M5 — piloto | Executar backlog, homologação, rejeição/correção, aceite e publicação | PL-01 a PL-12 e cenários US-001 a US-005 |
| M6 — recuperação/offline | Reinícios, restore em destino de teste e ciclo sem internet | Pacote final de evidências e avaliação humana |

Portas propostas, sujeitas a checagem de conflito: portal 127.0.0.1:3100, Forgejo 127.0.0.1:3101, homologação 127.0.0.1:3200 e publicação local 127.0.0.1:3201. Endpoint privado da VM será definido no M1. Manter portas atuais do laboratório intactas até a mudança de integração aprovada.

Não abrir firewall global, mudar distro padrão, alterar driver ou editar configuração global do WSL sem mudança explícita no plano. Shutdown do SDLC não para o laboratório. Remoção do SDLC não elimina modelos. Não mover a cópia canônica do código para uma pasta descartável do laboratório.

Offline: instalação a partir do manifesto com redes de execução sem saída externa. Scanner deve mostrar snapshot usado; proposta inicial de validade de bases de vulnerabilidade: sete dias. Snapshot vencido bloqueia publicação até janela de atualização ou exceção humana com prazo. Escolher versões com licenças compatíveis; não presumir que todos os recursos são gratuitos.

Backup consistente: pausar escritores/execuções em ponto seguro, exportar bancos e repos, copiar artefatos/manifestos e segredos cifrados, conferir hashes. Restore isolado antes de usar como recuperação. Metas propostas para o piloto: backup diário e antes de deploy, RPO até 24 h para controle e referência pré-deploy para banco do produto; RTO até 4 h, sujeito a ensaio. Backup no mesmo SSD não atende perda física.

## 10. Extensão para os outros tipos de projeto

Depois da aceitação web, US-AI-001 adiciona um agente que classifica solicitações sintéticas com saída validada e justificativa curta. Não altera registros sem aprovação. Avaliar dataset congelado, acesso indevido, indisponibilidade do modelo e comportamento fora de schema.

US-ORC-001 adiciona uma orquestração local: classificação → proposta de encaminhamento → aprovação humana → atualização. Simular falha após a atualização e antes do comprovante para provar reconciliação e deduplicação. Essas histórias são necessárias para aceitar suporte aos três tipos de projeto.

## 11. Revisão e próximos artefatos

Decisões propostas para aprovação de escopo: produto e histórias; um humano com papéis acumulados; publicação local; backlog Forgejo; stack Python/HTML; VM para workers; janelas conectadas de preparo; bases com validade de sete dias; mídia de backup a definir.

Próxima entrega após revisão: pacote de implementação em `sdlc/` neste repositório com scripts, locks completos, contratos executáveis e testes. O plano atual não é um instalador pronto e não contém autorização de execução. O setup será revisado concretamente antes de provisionar.

## Fontes verificadas

- [Forgejo: releases](https://forgejo.org/releases/): 15.0.10 LTS e janela de suporte consultadas em 2026-10-14.
- [PostgreSQL: versionamento](https://www.postgresql.org/support/versioning/): versão 17.11 e suporte da série 17.
- [LangGraph: instalação local](https://docs.langchain.com/oss/python/langgraph/install): biblioteca e dependências de provedores separadas.
- [LangGraph: interrupções](https://docs.langchain.com/oss/python/langgraph/interrupts): retomada pode reexecutar código anterior à interrupção, exigindo cuidado com efeitos.
- [Forgejo Actions: administração](https://forgejo.org/docs/latest/admin/actions/): configuração de runners e ações.

Os limites, contratos, stacks e metas são decisões propostas neste documento; não são medições realizadas nem garantias dos fornecedores.
