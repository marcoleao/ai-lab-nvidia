# Conferência de desenvolvimento da release — RA-15a

Data: 31/10/2026. Complementa o [plano incremental](plano-incremental-releases-ambientes-2026-10-27.md#50-ra-15a--conferência-integral-do-desenvolvimento). Contrato `release-development-readiness-v1`.

A conferência responde se as fontes registradas de **todas** as Histórias da composição salva satisfazem os controles de desenvolvimento. Ela não autoriza QA. Aprovação de desenvolvimento, composição real de código, fechamento, construção do pacote e implantação continuam fatos separados.

## Fontes e decisões

- Usa a última revisão imutável de composição, verifica digest, unicidade, contagem e correspondência com as associações atuais. Rascunhos do seletor e revisões históricas consultadas não alteram a avaliação.
- Para cada História do mesmo Sistema, confere a referência de planejamento, a especificação, a execução e seu SHA, a integração daquela execução e a validade atual da aprovação RA-14. Uma aprovação válida da revisão atual só conta para a composição se corresponder exatamente às fontes salvas. SHA da fonte, commit integrado e fonte de construção podem ser diferentes; não são comparados como se fossem uma única identidade.
- Evidência positiva de outro Sistema ou execução não é emprestada. Ausência de aprovação é impedimento; impossibilidade de confirmar a fonte é incerteza. História cancelada impede atendimento e encaminha à revisão de sua participação na release.
- Dependências bloqueantes vêm da especificação salva. Uma referência `story:id` presente na composição propaga impedimentos/incertezas, inclusive fora da página. Dependência pendente fora do conjunto bloqueia. A declaração de confirmação fora do conjunto não comprova presença na base: fica sem confirmação até haver prova própria. Dependência informativa não bloqueia; autorreferência bloqueante é recusada pela conferência.
- Release cancelada permanece bloqueada, preservando suas fontes e Histórias. OPEN vazia produz estado neutro, sem decidir a política DE-08 de fechamento vazio.
- Acima de 2.000 Histórias, ou se a composição divergir de suas associações/digest, a resposta declara avaliação incompleta e não qualifica uma página truncada como conjunto completo.

## Consulta e navegação

`GET /api/releases/:id/development-readiness` faz somente leitura, em transação `RepeatableRead`, com instante do banco. Calcula o conjunto antes da busca, filtro, ordenação e paginação. A página contém até 20 Histórias; chave/nome têm desempate por ID. Resumo e impedimentos globais não dependem do recorte visível.

As âncoras opcionais `expectedCompositionId` e `expectedEvaluationDigest` recusam com HTTP 409 uma continuação cuja composição ou evidências mudaram. Atualizar a conferência consulta o estado vigente sem trocar a composição histórica que o usuário está lendo. Parâmetros inválidos são recusados, sem escrita.

No detalhe da release, **Conferência para QA** mostra o resultado e a contagem integral; Histórias, filtros e referências técnicas ficam em aprofundamentos. O namespace `qaReadiness.*` preserva filtros `picker.*`, auditoria e revisão histórica. Atualização da consulta preserva escolhas não salvas do seletor.

Carregamento, erro e resposta parcial conservam a última leitura datada, retirando a confirmação de situação atual. Resposta de outra release é descartada. Divergência de versão, estado, ambiente ou revisão de composição exige atualizar os dados da página e bloqueia novas decisões de composição/cancelamento/plano enquanto o contexto divergir. Os comandos existentes continuam revalidando suas próprias fontes e versões.

## Limites e auditoria

`qaPreparationAvailable` permanece **false**, inclusive com resultado `ready`. O texto de atendimento diz expressamente que ainda falta conferir o código e preparar o pacote. A RA-15b deverá tratar base/HEAD, código extra, reversões, proveniência e dependências efetivamente contidas; RA-16/17 tratam fechamento e pacote imutável. Não há build, deploy, promoção, cópia ou conclusão de História nesta fatia.

Não há nova ação de domínio, evento em `HistoryEvent`, migration, fila ou worker. A leitura reutiliza fontes imutáveis existentes; testes conferem ausência de escrita. Publicação API/web usa `PORTAL_PUBLICATION` na trilha administrativa externa, backup e reversão. Segredos, prompts e conteúdo de agentes não entram na projeção pública.

Indicadores existentes mantidos, conforme decisões anteriores do usuário. As contagens da consulta não criam KPI de Visão Geral nem metas. Modelos, roteamento e configurações do LAB permanecem congelados por instrução explícita; esta entrega não instala ou requalifica modelos/executores.

## Reexecução dirigida

Os casos estão versionados em `tests/development-approvals.test.ts` e `tests/e2e/release-development-readiness.spec.ts`, registrados no catálogo compartilhado. Executar a partir de `sdlc/portal`, pelo mesmo procedimento de [regressão](../portal/tests/regression/README.md):

```text
python3 scripts/regression.py backend development-approvals.test.ts releases.test.ts release-compositions.test.ts
python3 scripts/regression.py browser release-development-readiness.spec.ts development-approval.spec.ts
```

Backend usa base isolada e fixtures normais dos comandos de desenvolvimento. Navegador usa respostas interceptadas, em 1440/390 px, cobrindo próxima ação, impedimento fora da página/filtro, conjunto atendido/vazio, falha HTTP, resposta 200 parcial, mudança concorrente, identidade, histórico independente e rascunho preservado. Isso não comprova pacote/QA ou aceitação integral da aplicação piloto. Resultados e publicação ficam no recibo do plano; regressão completa limpa permanece pendente.
