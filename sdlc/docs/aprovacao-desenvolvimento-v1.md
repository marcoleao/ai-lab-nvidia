# Desenvolvimento Finalizado — contrato v1

RA-14 · 30/10/2026. Evidências de entrega e aceite no [plano incremental](plano-incremental-releases-ambientes-2026-10-27.md#46-ra-14--aprovação-de-desenvolvimento-finalizado).

Desenvolvimento Finalizado é uma aprovação humana de uma revisão da História, separada da fase do fluxo, do ambiente e da conclusão. A História continua aberta até a entrada confirmada em PRD da release contendo sua revisão. A aprovação não exige associação a release; ela será uma entrada da avaliação integral da composição na RA-15.

## Política aprovada

Product Owner (Ana), Arquiteto (Bruno) e Admin podem aprovar. No laboratório, o aprovador pode ter participado do Gateway de Especificação. Essa decisão foi confirmada pelo usuário em 30/10/2026 e não define os papéis de homologação ou produção. Personas continuam sendo as identidades demonstrativas do laboratório; não representam autenticação corporativa.

A prévia exige especificação e ciclo atuais aprovados no Gateway, execução de código finalizada, merge confirmado com referência completa, revisão de código e segurança aprovadas pela política vigente, build vinculado à integração, implantação DEV confirmada e testes de aceitação aprovados para o mesmo artefato, com todos os critérios funcionais cobertos. Teste técnico ou HTTP de saúde não substitui aceitação.

A rastreabilidade encadeia o commit da História, o commit integrado e a fonte do build. Esses SHAs podem ser diferentes: o destino DEV compartilhado pode conter outras integrações. As relações e as provas confirmadas precisam corresponder; exigir igualdade dos três SHAs bloquearia um fluxo válido.

## Fonte, validade e DEV compartilhado

`StoryDevelopmentApproval` é uma fonte imutável que fixa política, especificação, ciclo/execução, repositório, commits, referência de integração, build/imagem/digest, implantação, teste/suíte, controles, aprovador, motivo e instante. A validade corrente é derivada das fontes, sem reescrever o recibo ou produzir evento em GET:

| Estado | Significado |
| --- | --- |
| `not_recorded` | Nenhuma aprovação registrada. |
| `valid` | Aprovação aplicável à revisão e às evidências atuais da própria História. |
| `outdated` | A própria revisão mudou ou há reprovação posterior; é necessária nova aprovação humana após corrigir e validar. |
| `unconfirmed` | Trabalho ou controle da própria História está sem resultado confirmado. Consultar/reconciliar o mesmo pedido antes de decidir. |

Novo ciclo, alteração funcional/técnica, referência do repositório, código, build ou implantação da própria História tornam a aprovação anterior histórica. Reprovação posterior de aceitação/revisão/segurança exige outra aprovação humana mesmo após novos resultados positivos. Falha de executor e resposta perdida não são reprovação funcional: a reconciliação pode restabelecer a aplicabilidade quando a fonte não mudou e não houve reprovação.

Outra História ocupar o DEV compartilhado não invalida esta aprovação. Não se exige que a instância continue ativa, que o HEAD global permaneça igual ou que o executor esteja disponível para consultar uma prova durável. Título, versão administrativa, fase, associação a release e inatividade de ancestral não mudam a validade por si só. Os comandos continuam respeitando hierarquia e permissões. Cancelamento da própria História impede considerar a aprovação vigente.

## Comando e recuperação

`GET /api/items/:id/development-approval` lê o recibo e sua validade; `/context` fornece prévia e impedimentos para a persona. `POST` exige versão da História, aprovação anterior esperada, token da prévia, motivo, confirmação explícita e chave de idempotência. `/api/items/:id/development-approval/:approvalId` consulta uma prova histórica da mesma História.

A confirmação grava fonte, auditoria e chave na mesma transação. Falha do recorder reverte tudo. Repetir a chave recupera o recibo original; ele não atesta validade atual. A interface consulta a situação novamente antes de mostrar aprovação vigente. Uma confirmação com chave nova de aprovação já vigente resulta em `NO_CHANGE`, sem duplicar a fonte. Mudança de contexto ou HTTP 409 exige rever a prévia, preservando o motivo.

Ações explícitas: `STORY_DEVELOPMENT_APPROVED` (`SUCCEEDED/COMPLETED/APPROVED`) e `STORY_DEVELOPMENT_APPROVAL_UNCHANGED` (`NO_CHANGE/COMPLETED/NOT_APPLICABLE`). Recorder compartilhado conserva autoria, correlação, referências e antes/depois seguros. Motivo livre permanece na fonte controlada. Não há escrita direta em `HistoryEvent`, worker ou acesso externo novo. Conta runtime possui SELECT/INSERT na fonte; UPDATE/DELETE/TRUNCATE e rollback destrutivo preenchido são recusados.

## Experiência e limites

História e Tarefa exibem a aprovação no destino DEV após os testes, dentro do shell existente. A Tarefa identifica a História proprietária. Lista de Histórias e composição da release usam a mesma leitura. O marcador da composição descreve a revisão atual da História; não aprova automaticamente uma revisão congelada, a composição, a candidata ou a promoção. Os gates de release permanecem pendentes da RA-15 e dos executores QA/HML/PRD.

Mantidos os indicadores existentes, sem nova contagem ou meta. Casos de backend e interface ficam registrados no catálogo da regressão. Fixtures e provas simuladas são exclusivas das bases de teste; a validação publicada consulta o piloto sem alterar a aplicação, seus dados ou seus gates. O recibo da fatia distingue regressão dirigida, ensaio operacional e OK manual pendente.
