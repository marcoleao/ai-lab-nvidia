# Decisões da fundação — 20/10/2026

## ADR-001 — Plataforma nova separada do núcleo instalado

O monorepo `sdlc/portal` usa TypeScript estrito, Next App Router/React, Fastify, Zod, Prisma e PostgreSQL. Node e imagens base são fixados por digest; versões de pacotes e lockfile são versionados. Prisma 7.10.1 usa driver PostgreSQL explícito; não adotamos a versão 8 candidata identificada na preparação. Referências: [Next](https://nextjs.org/docs/app/getting-started/installation), [Prisma 7/PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [Fastify](https://fastify.dev/docs/latest/Reference/Server/), [configuração pnpm](https://pnpm.io/settings).

O portal novo tem banco/volumes/rede próprios e porta 3310. Nenhum serviço novo escreve nas tabelas do núcleo FastAPI. A extensão VS Code continua apontando para o legado. Migração, compatibilidade `/v1`, backups e cutover serão entregas próprias, com conferência de dados. Não converter outcomes antigos em Sistemas automaticamente.

## ADR-002 — Hierarquia tipada com armazenamento comum

Sistema, Projeto, Épico, História e Tarefa são entidades de domínio discriminadas por `kind`, persistidas em `Item`. Campos comuns não são duplicados; atributos específicos são JSON validado pela API. FK composta `(parentId,parentKind)` e CHECK por nível impedem pais inválidos e ciclos. CHECK por tipo limita os status exatos definidos pelo usuário. Chave de projeto inclui a chave do Sistema; chaves das histórias são numeradas no Projeto, independentemente do Épico. Contadores e criação são atômicos.

Isso difere de cinco tabelas independentes, sem mudar a hierarquia ou navegação. As tabelas específicas de execuções, gates, revisões e pacotes serão introduzidas nas fases correspondentes; não existem execuções fictícias. Arquivamento é booleano separado do status. Histórico é append-only também por trigger PostgreSQL, com IDs dos ancestrais para consulta agregada.

## ADR-003 — Personas somente em demonstração local

O novo servidor exige `DEMO_MODE=true`. A API não é publicada no host; o frontend acessível apenas em loopback encaminha `/api`. Personas são configuração estática, sem autenticação corporativa ou alegação de identidade forte. Seleção é explícita e mantida na sessão do navegador. O núcleo antigo mantém suas identidades, sessões e CSRF.

Admin, Product Owner e Architect podem planejar. Aprovação de Projeto/Épico exige Admin ou Product Owner. Épico exige Projeto aprovado. Aprovação de planejamento não inicia pipeline nem concede autorização de deploy. Status de História é reservado ao futuro orquestrador. Tarefas não saltam TO DO→DONE; reabertura exige justificativa. Não é possível concluir Épico sem Histórias concluídas.

## ADR-004 — Provisionamento externo não participa da transação local

Criar Sistema/Projeto grava o item e um job persistente no mesmo commit. O processador realiza HTTP fora da transação; falhas preservam o planejamento e geram condição/histórico de integração. No máximo três tentativas automáticas; nova tentativa humana é explícita, com controle de versão. Jobs sem configuração permanecem visíveis aguardando ação. Claims e retomada de execução expirada reduzem sobreposição; marcadores GitLab tornam a reconciliação idempotente.

Grupos exigem `[sdlc-managed]` na descrição e projetos exigem tópico `sdlc-managed`. Colisões sem marca falham sem sobrescrever conteúdo. O grupo raiz é criado sob demanda da primeira criação humana, em vez de gerar recursos no bootstrap. O Projeto recebe apenas contrato neutro Node/Python, sem regra de negócio, build ou deploy automático nesta fase. URLs só aparecem quando confirmadas pelo GitLab. A branch main é criada pelo commit inicial e depois definida como principal/protegida: [contrato de criação](https://docs.gitlab.com/api/projects/), [proteções](https://docs.gitlab.com/api/protected_branches/).

Na versão CE testada, atualizações granulares da regra existente não alteraram o nível de push. A reconciliação pode recriar a regra somente enquanto há exatamente um commit e todos os blobs correspondem, por hash Git, ao contrato neutro esperado. Qualquer conteúdo de negócio, commit adicional ou divergência bloqueia esse caminho e exige revisão administrativa; a regra não é removida. A configuração final é consultada novamente e precisa proibir push e force push. Auto DevOps permanece desabilitado para não disparar pipeline a partir do esqueleto.

Tokens ficam apenas no backend, configurados em `.env` privado. A aplicação não copia credenciais do legado automaticamente. TLS não é desabilitado. A conectividade entre as redes do novo portal e o GitLab existente precisa ser configurada explicitamente pelo operador; o estado inicial informa NOT CONFIGURED.

## ADR-005 — Navegação e processo são visões distintas

A hierarquia orienta onde criar e consultar; o ciclo da História orienta a execução futura. Os nove status definidos pelo usuário aparecem integralmente, com texto, número, contorno e cor. A tela deixa explícito NOT STARTED; não existe botão que simule pipeline. Em tablet o processo é vertical; em desktop, horizontal. CSS nativo com tokens visuais substitui Tailwind neste primeiro incremento, preservando a identidade e evitando uma camada sem uso. Não há fonte/CDN externa obrigatória.

O agente de UX desenhou e revisou as telas e capturas reais; ver [parecer](../../docs/ux-fundacao-2026-10-20.md). Polling discreto de 5 s mantém provisionamento atualizado sem apagar rascunhos. SSE, histórico completo paginado e visualização de AgentRuns são fases posteriores.

## ADR-006 — Operação e isolamento

Prepare baixa/constrói; up usa somente imagens locais e verifica o manifesto de hashes/IDs antes de iniciar. O bootstrap novo reutiliza somente a seleção/validação de propriedade da distro, sem modificar o bootstrap permanente. Down preserva dados. Não há reset implícito.

Testes automatizados exigem banco `portal_test`, e o navegador confirma também a identidade do alvo na API. O ensaio GitLab cria instância/volumes/rede temporários próprios, sem usar os repositórios humanos. Fixtures ficam em testes.

Executor de builds/deploy será serviço separado e restrito; a API atual não monta socket Docker. A compatibilização com a política de worker em VM permanece pendente e não foi flexibilizada. Registry OCI, scanners, Traefik e inferência autônoma não estão instalados por este incremento. `integrations/health` indica dependências ausentes; verde de conectividade não equivale a aceite de pipeline completo.

Limites conhecidos: os componentes novos ainda não integram backup/exportação do legado; manter esta prévia separada até implementar recuperação própria e migração. A rede de entrada permite conectividade configurada; o bloqueio completo de saída do novo stack ainda não tem o aceite offline do núcleo antigo. Readiness é um diagnóstico limitado, sem conexão autenticada de registry ou descoberta/roteamento de modelos por agente nesta fase.
