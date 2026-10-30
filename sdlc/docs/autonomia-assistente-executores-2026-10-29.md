# Responsabilidades do assistente, executores e ambientes

29/10/2026 · Correção de conceito autorizada pelo usuário após a RA-11b.

O próprio SDLC deve conduzir a preparação técnica e a operação dos Sistemas. O assistente orienta e propõe ações; os serviços de domínio autorizam comandos; os executores realizam os efeitos e comprovam os resultados. A implementação desses mecanismos pertence à evolução da plataforma. Operar cada novo Sistema não deve depender de o desenvolvedor da plataforma editar sua aplicação ou executar comandos avulsos no host.

Este é o contrato para a evolução incremental. A tabela de cobertura distingue o que já funciona do que ainda precisa ser implementado; esta decisão não cria infraestrutura ou concede ferramentas novas aos agentes existentes.

## Responsabilidades

| Responsável | Papel |
| --- | --- |
| Pessoa de negócio | Define a necessidade, revisa o efeito proposto e confirma as decisões pertinentes. Recebe situação, impedimento e próximo passo no portal. |
| Assistente e especialistas de arquitetura/infraestrutura | Entendem a necessidade, consultam capacidades e situação reais, propõem configuração e encaminham ações suportadas para revisão. Explicam limites e acompanham o mesmo pedido. |
| Serviços de domínio do SDLC | Validam escopo, persona, versões, políticas, pré-condições e confirmação; registram intenção, autoria, correlação e auditoria; enfileiram o trabalho. |
| Executores do SDLC | Preparam recursos e executam build, testes ou implantação dentro de perfis suportados, com limites e provas próprios. Reconciliam efeitos sem repetir escritas incertas. |
| Administração da plataforma | Instala e mantém a infraestrutura base confiável, executores, perfis, acessos e capacidade. Trata exceções que excedam os perfis entregues, com diagnóstico e trilha próprios. |

O assistente não recebe acesso genérico a Docker, shell, credenciais ou GitLab administrativo. A confirmação humana autoriza uma ação estruturada e sua revisão, não comandos produzidos livremente pelo modelo. Capacidade nova exige implementação e validação; um prompt não a disponibiliza.

## Cinco fatos diferentes

| Fato | Significado e prova |
| --- | --- |
| Referência do ambiente cadastrada | DEV, QA, HML ou PRD identificado no Sistema. O cadastro não comprova recursos ou aplicação ativa. |
| Aplicação preparada | Estrutura e contrato executáveis produzidos por alteração revisável no repositório. Build/teste técnico do starter não criam um ambiente permanente. |
| Destino provisionado | Recursos e configuração do Sistema/ambiente efetivamente preparados e conferidos pelo executor. Requer identidade e propriedade dos recursos; não comprova implantação. |
| Artefato construído | Fonte fixada produziu imagem/arquivo com identidade e digest conhecidos. Não comprova aplicação em execução. |
| Implantação saudável | Artefato exato aplicado ao destino, com versão ativa e saúde observadas. Pedido aceito ou container iniciado não comprovam esse resultado. |

Os ambientes pertencem ao **Sistema**. No modelo atual, o vínculo físico é `Environment.repositoryId` para o repositório único desse Sistema. APIs, frontend, backend, batch e infraestrutura podem ser unidades do mesmo repositório; não ganham Sistemas, repositórios ou ambientes independentes só por serem pastas/unidades.

O cadastro do Sistema registra as referências DEV/QA/HML/PRD. Não exige reservar quatro runtimes vazios. Provisionamento pode ocorrer sob demanda no perfil suportado. Projetos e Histórias usam os destinos do Sistema; um pedido de uma História não cria, implicitamente, um DEV isolado para ela. O primeiro DEV é compartilhado, com exclusão por destino e versão ativa explícita. QA, HML e PRD precisam manter isolamento de configuração, dados e acessos; compartilhar o laboratório não autoriza cruzá-los.

Uma release OPEN nasce com contexto de planejamento em DEV. Isso não significa que foi construída, implantada ou que o destino já está pronto. A História pode desenvolver/publicar em DEV sem release. A passagem para QA mantém release CLOSED, composição elegível e pacote imutável; a conclusão da História continua condicionada à entrada confirmada em PRD.

## Conversa e controles do portal

Assistente e telas são entradas para os mesmos serviços de domínio. A proposta apresentada na conversa precisa identificar Sistema, ambiente, ação, fonte/artefato, revisão, efeitos e pré-condições reais. Dados de autorização vêm do servidor. Texto do modelo, histórico, exemplos ou um “sim” descontextualizado não substituem a confirmação vinculada à proposta.

O controle de revisão/confirmação fica fora do texto livre do histórico e usa a política de confirmação da ação existente. Não acrescenta aprovações redundantes. Troca de persona, fonte, configuração, versão ou contexto invalida uma decisão nova; a recuperação de pedido anterior conserva autoria e identidade originais.

O serviço grava a intenção antes de enviar ao executor. Acompanhamento mostra recebimento, fila, execução, efeito comprovado, impedimento ou incerteza separadamente. Falha de transporte permite consultar o mesmo pedido. Retomar só pode completar efeito seguramente ainda não iniciado. Conversa e botões não podem formar duas filas independentes ou permitir que uma entrada contorne os gates da outra.

Para a pessoa de negócio, **publicar em DEV** deve conduzir a preparação do destino ausente dentro do fluxo suportado, com seus efeitos registrados, sem uma lista de comandos técnicos para executar fora do portal. Se a infraestrutura base ou o perfil estiver indisponível, o SDLC precisa explicar a dependência e disponibilizar o encaminhamento de suporte quando implementado; não anunciar que a resolveu.

## Cobertura conferida em 29/10/2026

| Capacidade | Evidência atual | Lacuna explícita |
| --- | --- | --- |
| Referências DEV/QA/HML/PRD | `environments.ts` e RA-02; cadastro automático e consulta no Sistema | Provisionamento real é capacidade distinta. |
| Estrutura inicial Node 24/React | RA-11b: prévia, confirmação, intenção/worker, commit/MR e verificação técnica; liberação/merge separados | RA-11c oferece a ação estruturada junto à conversa do Sistema; destino/deploy continuam distintos. |
| Build de trabalho DEV | RA-11: comando da História e executor real por socket Unix | Não implanta aplicação ou prepara destino permanente. |
| Conversa geral e arquiteto de contrato | `assistant.ts`, `requirements.ts`, `contract-proposals.ts`; orientação e propostas locais com limites explícitos | Não há ferramenta genérica de provisionamento/deploy no chat. Esses limites permanecem corretos até existir o executor/encaminhamento correspondente. |
| Infraestrutura base do laboratório | Instalação administrativa versionada e executor Node 24/React instalado | Instalação do executor não cria um destino de cada Sistema. |
| Provisionamento e implantação DEV | Escopo da RA-12 | Ainda não implementados; não há aceite de ambiente do piloto. |

O teste real isolado da RA-11b comprova publicação/build/teste/status/merge do starter. Não comprova orquestração pela conversa ou implantação DEV. Os recibos anteriores preservam seu escopo e seus OKs pendentes.

## Adoção no plano

- **RA-11c:** proposta e encaminhamento da preparação já entregue a partir do assistente, com os mesmos serviços, confirmações e acompanhamento. Sem novas permissões ou segundo executor.
- **RA-12a:** destino DEV do Sistema — leitura de prontidão, plano e provisionamento controlado sob demanda, com identidade/propriedade e recuperação.
- **RA-12b:** implantação da imagem confirmada — exclusão por destino, versão ativa, saúde e preservação do estado anterior em falha.
- **RA-12c:** orientação/encaminhamento de publicação e recuperação pelo assistente; estende o mecanismo da RA-11c às capacidades DEV entregues.

Cada fatia mantém roteiro positivo e negativo, evidência isolada e OK manual próprios no [plano incremental](plano-incremental-releases-ambientes-2026-10-27.md). O mecanismo deve servir aos Sistemas seguintes no mesmo perfil. Bootstrap manual por Sistema não satisfaz o aceite funcional.

A correção conceitual original alterou contratos e planejamento. Não altera telas, prompts executáveis, comandos, catálogo de auditoria, schema, dados ou recursos do laboratório. Mantém os indicadores existentes e não cria metas. As próximas mutações exigem o [contrato de auditoria transversal](implementacao-auditoria-2026-10-24.md); a navegação futura exige revisão UX e o padrão central.

## Adoção RA-11c

A preparação agora é encaminhada junto à conversa do Sistema, com observação atual do servidor e o painel/confirmações da RA-11b. O modelo orienta a usar a ação disponível e continua sem ferramentas de escrita; somente a confirmação estruturada chama os comandos existentes. A conversa aceita personas autorizadas no Sistema, preservando a exigência de Projeto para criar/aplicar planejamento. Falha de consulta bloqueia decisão nova e mantém recuperação. Provisionamento e implantação DEV continuam pendentes em RA-12a/b/c. [Evidência, roteiro e limites](plano-incremental-releases-ambientes-2026-10-27.md#41-ra-11c--preparação-da-aplicação-pelo-assistente).
