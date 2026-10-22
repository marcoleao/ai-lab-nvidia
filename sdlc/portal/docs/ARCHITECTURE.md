# Arquitetura da fundação

## Métricas como requisito de arquitetura

Toda nova funcionalidade deve ser explorada quanto aos indicadores que pode fornecer à Visão Geral. Antes da implementação, apresentar ao usuário sugestões de métricas e perguntar quais objetivos, definições e metas devem ser adotados. Registrar as escolhas e implementar coleta, cálculo e visualização junto à funcionalidade, com testes e documentação. Não encerrar a entrega deixando a instrumentação aprovada como tarefa implícita futura.

Cada indicador precisa de definição, unidade, fonte, correlação por entidade/execução/repositório, instante do evento, janela, numerador/denominador quando houver taxa e regra para ausência de dados. Eventos duráveis devem ser gravados junto à transição local, com idempotência, sem prompts, código, credenciais ou conteúdo de conversa. Métricas externas devem deduplicar por ID da fonte; retentativa de transporte não é nova operação de negócio. Espera, falha, retomada, retrabalho, aprovação e duração devem ser avaliados em cada fluxo.

O [contrato do dashboard](../../docs/dashboard-metricas-2026-10-22.md) define as janelas, a cobertura histórica e a integração futura das cinco métricas DORA. Metas de SLO não podem ser inventadas. Indicador sem fonte integrada ou sem amostras deve explicitar a indisponibilidade; não converter ausência de observação em zero. A política vale para desenvolvimento futuro do SDLC e para o desenho dos novos processos da ferramenta.

Atualização do modelo: [Sistema contínuo, Projetos temporários e repositórios reutilizáveis](../../docs/sistemas-projetos-repositorios-2026-10-20.md). `Repository` pertence ao Sistema; `ItemRepository` define o escopo dos Projetos/Histórias/Tarefas; `Environment` pertence ao componente. A aprovação do Projeto é distinta de `projectLifecycle`. A decisão substitui referências anteriores a ambientes/repositório por Projeto.

```text
Navegador Windows (localhost:3310)
  → Next / frontend (loopback)
      → /api → Fastify (sem porta publicada)
          → PostgreSQL próprio (rede interna)
          → job GitLab persistido → API GitLab configurada
```

O bootstrap aplica somente schema. Personas e status são configuração do código compartilhado. A instalação não contém registros de negócio.

`packages/shared` centraliza validação e status; `packages/db` encapsula Prisma/driver; `packages/templates` contém somente contratos neutros de runtime. `apps/api` controla mutações, versão otimista, autorização, idempotência, auditoria e provisionamento. `apps/web` apresenta hierarquia, decisões e contexto. Nenhum endpoint executa código de aplicação, teste, build ou deploy.

Todas as mutações recebem `X-Persona`, `Idempotency-Key` e, para itens existentes, `expectedVersion`. Uma trava transacional global serializa o pequeno volume de planejamento e contadores; particionamento por projeto pode ser introduzido quando houver medições que justifiquem. Histórico e resultado idempotente são gravados junto à mutação. Replays devolvem o resultado original; conteúdo divergente com a mesma chave gera conflito.

Jobs externos têm tentativas/estado persistentes. O worker do processo API trata a integração sem manter transação aberta durante HTTP. Marcadores de propriedade, consulta de estado remoto e claim de job permitem retomada. Não se atribui atomicidade distribuída ao PostgreSQL. Recursos GitLab são preservados ao arquivar localmente.

O banco novo não tem relação física com o banco legado. Projetos existentes no chat não aparecem automaticamente nesta interface. O futuro importador precisa mapear origem/IDs e histórico; as aprovações antigas não serão reaproveitadas como gates de release.
