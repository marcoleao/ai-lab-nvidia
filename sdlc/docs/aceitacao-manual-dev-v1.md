# Verificação manual de aceitação em DEV

**Atualização de política — 01/11/2026:** novas decisões humanas passam à [aprovação global da História em DEV](aprovacao-humana-historia-dev-v2.md). O registro por critério e a segunda confirmação descritos no percurso v1 são históricos; resultados anteriores são preservados.

01/11/2026 · SH-01 e recorte de SH-05. Implementado, testado e publicado no Portal local às **11:55 (America/Sao_Paulo)**. Recibo e limites abaixo.

A Tarefa **Teste em DEV** permanecia DOING porque a suíte técnica só registrava verificações HTTP. Navegar na aplicação ou clicar em Revisar Desenvolvimento Finalizado não produzia uma evidência de aceitação. A revisão informava o impedimento, mas não oferecia um caminho manual para resolvê-lo.

## Percurso humano

```text
Execução → Registrar verificação manual
             → Abrir aplicação em DEV e conferir os critérios
             → Informar Aprovado / Reprovado / Não verificado
             → Descrever os passos e o resultado observado
             → Revisar registro → Confirmar registro manual
                  ├─ Todos aprovados → Teste em DEV DONE
                  │                    → Revisar Desenvolvimento Finalizado
                  └─ Parcial/reprovado → Teste em DEV DOING
```

A página própria é `/stories/:id/execution/dev/acceptance`. O acompanhamento mantém dois quadros, sem formulário. Pendências da aprovação e Resumo/Evidências/Execução da Tarefa oferecem acesso à mesma página. A Tarefa apresenta fontes de testes automatizados e aceitação humana separadamente, sem editor genérico de status para concluir trabalho do processo.

Os resultados começam como Não verificado. Notas de 10–2000 caracteres e ao menos um critério verificado são obrigatórios. O registro admite até 100 critérios; revisões maiores são apresentadas integralmente, com impedimento explícito. A confirmação declara que a pessoa realizou as verificações na implantação indicada. Depois do sucesso, a tela prioriza o resultado e a aprovação separada; outro registro exige **Registrar nova verificação** ou **Continuar verificação**.

## Fonte, autorização e efeito

`DevelopmentManualAcceptance` é fonte própria, imutável: revisão da especificação, execução, referência de desenvolvimento, build, implantação, fonte, imagem/digest, critérios integrais, resultados, notas, pessoa e data. Não cria casos HTTP, `DevelopmentTest`, `testId`, `suiteDigest` ou resultados de agente fictícios.

O registro exige a cadeia corrente de especificação/G1, integração, revisão de código, segurança, build e implantação, hierarquia ativa, uma única Tarefa Teste em DEV e ausência de trabalho pendente. Observação saudável e datada deve corresponder à implantação ativa, inclusive no DEV compartilhado. Mudança entre observação e gravação é conferida novamente pela referência local, versão, fonte ativa e token; não há transação distribuída com o runtime.

A autorização reutiliza os papéis já habilitados para testes DEV/planejamento: **Product Owner, Arquiteto e Admin**. Outras personas consultam. Essa capacidade não define os papéis de homologação/produção; a identidade continua declarada no modo local do LAB.

| Resultados por critério | Registro | Tarefa |
| --- | --- | --- |
| Todos `true` | `passed` | `done` |
| Algum `false` | `failed` | `doing` |
| Algum `null`, sem reprovação | `pending` | `doing` |

O registro não aprova Desenvolvimento Finalizado, não conclui a História, não cria pacote nem promove release. Reprovação automatizada conhecida impede novo registro manual enquanto não for resolvida; evidência humana não encobre controles técnicos obrigatórios.

## Aprovação e validade

A aprovação admite teste automatizado completo ou verificação manual completa. `StoryDevelopmentApproval.manualAcceptanceId` identifica a fonte humana exata; nesse caso, `testId` e `suiteDigest` ficam nulos. Uma restrição no banco impede fonte ambígua ou ausente. As demais verificações permanecem. A aprovação permite consultar o registro humano exato, mesmo quando há outra verificação posterior.

Mudança da própria revisão/build/implantação torna a prova anterior histórica. Outra História ocupar DEV não apaga uma aprovação registrada. Reprovação manual posterior invalida a aprovação anterior, mesmo após novo resultado positivo; exige outra aprovação humana. Verificação parcial posterior deixa controles sem confirmação. Reprovação automatizada posterior invalida o aceite manual anterior. Repetição técnica positiva sem reprovação intermediária conserva o aceite humano e restaura a Tarefa DONE ao concluir.

## API, recuperação e consultas

| Endpoint | Responsabilidade |
| --- | --- |
| `GET /api/items/:id/development-manual-acceptance` | Último registro da História, relação com a revisão atual, quantidade de critérios e data. Não é inventário completo. |
| `GET .../context` | Critérios, versão/implantação, permissões, impedimentos e token para registrar. |
| `GET .../:recordId` | Registro imutável exato da mesma História; não concede elegibilidade à revisão corrente. |
| `POST ...` | Resultados por índice, notas, confirmação, versão esperada, registro anterior esperado e token. |

POST usa a idempotência compartilhada. Fonte, Tarefa, recorder e RequestKey confirmam na mesma transação. Falha do recorder reverte o conjunto; replay recupera o recibo original, sem observar outro DEV como se fosse o testado. Outra chave/corpo/persona não permite reaproveitar a confirmação.

O pedido incerto permanece no proprietário da operação, com recuperação pelo hub. O rascunho usa estado montado da História e sessão do navegador; sair do layout ou encerrar a sessão sem armazenamento disponível não tem nova garantia de persistência. Outra implantação não herda respostas. Seu relato anterior fica identificado como rascunho anterior; começar a verificação da nova versão limpa o novo relato. Erro ou consulta incompleta não confirma a situação atual.

O hub reutiliza a projeção existente, sem worker ou polling adicional. Seus cálculos passam a consultar o último registro manual e, quando existente, reprovações automatizadas posteriores; isso acrescenta leituras ao custo já existente. Contexto manual consulta ao abrir/atualizar, com nova observação após o POST. A Tarefa consulta as duas fontes ao abrir, atualizar ou mudar sua versão; fontes diferentes não são snapshot atômico. Histórico completo paginado de verificações manuais permanece pendente: a cobertura identifica última evidência ou registro exato. Não houve ensaio de carga ou nova garantia de escala.

## Auditoria e migração

| Ação explícita | Resultado, fase e decisão |
| --- | --- |
| `MANUAL_DEV_ACCEPTANCE_RECORDED` | SUCCEEDED/COMPLETED; APPROVED para critérios integralmente aprovados, REJECTED para reprovação ou NOT_EVALUATED para registro parcial. Não é aprovação de desenvolvimento. |
| `MANUAL_DEV_ACCEPTANCE_TASK_UPDATED` | SUCCEEDED/COMPLETED/NOT_APPLICABLE; anterior/nova situação e versão da Tarefa, com referência à fonte. |

O recorder conserva pessoa, correlação, fonte anterior/nova e contagens seguras. Critérios, notas, prompts e conteúdo de agentes não são copiados ao histórico público. Não há escrita direta em HistoryEvent. Testes de falha/retentativa, concorrência, privacidade e rollback usam bases isoladas.

A migration `202611010001_manual_dev_acceptance` adiciona a fonte e a referência opcional na aprovação, preservando provas HTTP. Runtime recebe SELECT/INSERT; triggers recusam UPDATE/DELETE/TRUNCATE. Rollback recusa fonte manual preenchida. O publicador utilizado recusa downgrade automático após registros reais; publicação usa trilha administrativa externa e backup privado.

## Adoção e limites

SH-01 recebe o produtor manual; automação de navegador em DEV continua separada. SH-05 recebe consulta de fontes DEV e acesso direto nas três abas da Tarefa, sem migração integral do processo legado. SH-02/SH-03/SH-04, composição real do código, pacote imutável e implantação QA permanecem fora desta alteração. Mantidos os indicadores existentes, sem KPI, fórmula ou meta nova.

### Recibo de validação e publicação

**Backend: 93/93 casos em quatro arquivos**, na rodada `20261101T144050Z-13eb17`: 68 de aprovação/aceitação manual, 17 de testes DEV e oito de auditoria. Inclui registro parcial posterior à aprovação, mudança de ciclo, resultado técnico posterior, reprovação, contexto substituído, permissões, imutabilidade, privacidade, concorrência idempotente e rollback/retentativa por falha do recorder.

**Navegador: 87/87 na rodada ampliada de seis arquivos**, `20261101T144136Z-d736d6`, cobrindo manual, aprovação, testes, navegação, resumo DEV e HELP. O ajuste final de consulta impedida passou em **10/10**, `20261101T144526Z-6c30d9`. A revisão UX identificou ainda dois casos concorrentes: prova anterior sob outro ID de aprovação e recibo local antigo escondendo o próximo passo. As correções e os testes ampliados passaram em **35/35**, `20261101T145131Z-fbb08d`, nos dois arquivos afetados. São **87 cenários distintos cobertos por rodadas dirigidas**, não 132 casos distintos nem regressão integral. Sem flaky ou cenários ignorados nas rodadas aprovadas. Catálogo registrado: 661 casos/60 arquivos.

As rodadas reprovadas foram mantidas: `141602Z-835d26` (expectativa antiga da navegação), `142009Z-da9ad5` (arquivo ainda não registrado), `142421Z-65456b` (seletores/fixtures novos), `143326Z-f1da0b` (fixture da Tarefa sem corresponder ao querystring) e `144050Z-1090d3` (nome incorreto do arquivo HELP na seleção). Falhas dos auxiliares de leitura do navegador não foram classificadas como defeitos do produto.

Build de produção API/web final aprovado. Revisão UX de código e capturas em 1440/390 realizada, com os riscos concretos corrigidos e retestados. Capturas longas isoladas com página rolada compõem o cabeçalho fixo no meio da imagem; não foram usadas como prova da posição do cabeçalho no viewport. Não há declaração de acessibilidade assistiva integral.

Primeira publicação aplicou a única migration nova, acrescentando uma tabela e preservando as 49 existentes. A publicação final, sem migration adicional, ficou na imagem **`sha256:2a7617585ba869a16fd7369d59b5e212ebe34456cb6375e4f37ea85168bd114e`**, fonte **`dd6237463120199eb0e2af58da30dacb904583b89955e49e4b4ea596e1d31e6e`**, com saúde `ready/preview`, 44 migrations aplicadas e **50 tabelas preservadas segundo a projeção de comparação**. Ela normaliza os leases/metadados de polling de MergeOperation já declarados no contrato anterior e a nova coluna `manualAcceptanceId` na aprovação, nula nos registros preexistentes. Não se declara igualdade byte a byte de todos os metadados operacionais.

Backups privados das duas publicações tiveram digest, permissões e leitura do arquivo conferidos. Ledger administrativo final conferido com 176 registros e nenhuma operação pendente. Modelos do LAB, aplicações produzidas e resultados de agentes permaneceram preservados.

Conferência real na História **HELLOW-SITEHW-1**, às **11:57**, verificou a ação principal no hub, seis critérios sem aprovações pré-marcadas na página manual, um único encaminhamento manual na aprovação impedida e fontes distintas na Tarefa. Nenhum overflow em 1440/390, erro de página ou POST de negócio. O estado real permaneceu **DOING / 0 de 6**, aguardando a confirmação humana pelo novo formulário; não foi inventado um aceite para demonstrar o Portal.

Evidências: [página manual desktop](assets/aceitacao-manual-dev-2026-11-01/01-manual-desktop.png), [página manual celular](assets/aceitacao-manual-dev-2026-11-01/02-manual-mobile.png), [fontes na Tarefa](assets/aceitacao-manual-dev-2026-11-01/03-tarefa-fontes.png), [conferência real sem comandos](assets/aceitacao-manual-dev-2026-11-01/04-navegacao-real.json), [projeção segura da validação e publicação](assets/aceitacao-manual-dev-2026-11-01/05-validacao-publicacao.json) e [manifesto SHA-256](assets/aceitacao-manual-dev-2026-11-01/sha256.json).
