# Preparação de aplicação Node 24/React

29/10/2026 · RA-11b · [Plano incremental](plano-incremental-releases-ambientes-2026-10-27.md#39-ra-11b--preparação-controlada-da-aplicação).

A preparação pertence ao Sistema, proprietário do repositório. Em **Sistema → Repositório do Sistema → Preparação da aplicação**, a pessoa confere a estrutura completa antes de confirmar sua publicação. O primeiro perfil atende uma unidade HTTP Node 24/React, sem migração de banco. Não implementa catálogo, cursos, clientes ou pedidos.

**Responsabilidade e cobertura:** esta capacidade é executada pelo próprio SDLC a partir dos controles do portal. A [correção de conceito de 29/10/2026](autonomia-assistente-executores-2026-10-29.md) define encaminhamento pelo assistente aos mesmos serviços; essa ligação está entregue na RA-11c, conforme a seção de adoção abaixo. A preparação cria a estrutura da aplicação e verifica seu commit; não provisiona um destino DEV permanente. Destino e implantação são as fatias RA-12a/b, com condução pelo assistente na RA-12c. O ambiente de negócio não deve depender de comandos avulsos do desenvolvedor da plataforma.

## Fluxo e autorizações

1. **Conferir preparação Node 24/React:** consulta a base atual e apresenta os nove arquivos completos. Nenhum job ou arquivo é criado pelo GET.
2. **Confirmar preparação da aplicação:** exige motivo, aceite, persona habilitada e versões/contexto atuais. Autoriza criar branch, commit exclusivo, MR Draft, compilar a fonte exata, executar o teste técnico HTTP e informar esse resultado ao GitLab.
3. **Liberar Draft:** outra revisão e confirmação; não integra o código.
4. **Integrar preparação:** outra revisão e confirmação, condicionada à fonte, base, política de pipeline, conflitos, discussões obrigatórias e ausência de agendamento de merge.
5. **Continuar pelas Histórias:** a integração não aprova o Gateway de Especificação, testes funcionais, segurança, Desenvolvimento Finalizado ou implantação. O contrato passa a ser consultado na fonte real.

O template `node24-react-starter-v1` contém `.sdlc/execution.json`, `Dockerfile`, `package.json`, `scripts/build.mjs`, `scripts/test.mjs`, `server.mjs`, `src/App.jsx`, `src/main.jsx` e `src/app.css`. Usa dependências exatas do [executor preparado](executor-node24-react-v1.md). A página inicial é uma estrutura técnica, sem dados de negócio ou resultados de agentes simulados.

## Fonte e GitLab

Só é elegível a base inicial contendo README, `.gitignore` e `.sdlc/contract.md`, quando presentes. Arquivos existentes de aplicação impedem a preparação; não há sobrescrita, substituição ou opção de comandos livres. A prévia reconhece também a estrutura já presente e orienta continuar pelas Histórias.

O pedido preserva base/SHA, repositório e versão, template/digest, nove arquivos completos e autoria. A branch exclusiva é `sdlc/application-<id>`. O commit tem um único pai na base fixada e marcador próprio. A prova usa árvore completa limitada a 202 entradas, bytes/digests dos arquivos e preservação do conteúdo anterior; árvore incompleta, arquivo adicional, symlink ou fonte divergente são recusados. Após merge, prova integrada e fonte atual permanecem fatos separados.

A conta dedicada `sdlc-agent-for-merge` precisa estar ativa, sem administração global, com acesso Maintainer no namespace gerenciado. A preparação não muda proteções, permissões ou exigência de pipeline. Um envio de contrato ou proposta ainda em processamento impede preparar a aplicação; a preparação pendente também impede iniciar envio concorrente do contrato.

## Resultado técnico e pipeline obrigatório

Os repositórios provisionados pelo SDLC exigem pipeline aprovado. A preparação usa o executor real, por socket Unix, no SHA exclusivo do commit e com propósito `application_preparation`. O serviço compila e empacota a fonte e executa o teste fixo `scripts/test.mjs` em container separado: sem rede, UID 1000, raiz somente leitura, 256 MiB, uma CPU, 64 processos e 30 segundos. Confere saúde HTTP, página inicial, JavaScript compilado e resposta de caminho inexistente.

Somente a prova real de build **e** teste técnico autoriza publicar o status externo `sdlc-application-preparation` com sucesso, fonte/ref e marcador exclusivos. A consulta confirma pipeline e status da conta dedicada. Artefato sem prova do teste, ambiguidade de pipeline/status ou resposta desconhecida não liberam sucesso. Isso atende à verificação técnica do starter; não representa pipeline completo da aplicação, teste de negócio, aprovação de segurança ou implantação em DEV.

## Falhas, retomada e histórico

Intenção, checkpoints, autoria, versões, lease e auditoria ficam no portal antes de cada efeito. O serviço preserva o ID e o conteúdo do pedido antes de executar. Consulta do mesmo ID recupera o resultado; nova chamada com outra fonte é recusada.

- Resposta perdida após commit, MR, build, status, liberação de Draft ou merge exige verificar o mesmo pedido. Não há reenvio automático por ausência de resultado.
- Continuação explícita só completa efeito ainda não iniciado: abertura do MR ou validação/status técnico pendente. Um build já enviado nunca é executado novamente por essa ação.
- Falha do teste mantém fonte e MR; nenhum sucesso técnico é enviado ao GitLab. O impedimento fica explícito.
- Falha do recorder antes do efeito impede o envio. Após efeito remoto, mantém os marcadores e permite reconciliação por leitura.
- Inatividade pausa a fila; reativar o Sistema não retoma o trabalho sozinho. Cancelamento é permitido antes de qualquer efeito do pedido.
- Encerrar acompanhamento é decisão local, com motivo, pessoa e instante imutáveis. Preserva intenção, fontes e efeitos; não fecha MR, apaga branch ou desfaz GitLab.

Acompanhamento do pedido atual e recuperação por ID não são uma coleção integral. O histórico consultável continua em Auditoria. A interface mantém fonte datada e recibos entre abas/recarga; falha de consulta impede decisões novas, sem apagar fatos conhecidos.

## Validação reproduzível e limites

No WSL `agentic-sdlc`, pasta `sdlc/portal`:

```text
python3 scripts/regression.py backend application-preparations.test.ts application-preparation-provider.test.ts development-build-provider.test.ts development-builds.test.ts contract-proposals.test.ts contract-publications.test.ts execution-contract.test.ts lifecycle-contract.test.ts audit-guard.test.ts audit.test.ts
python3 scripts/regression.py browser application-preparation.spec.ts execution-contract.spec.ts audit-history.spec.ts
python3 tests/build-executor.test.py
python3 scripts/regression-application.py
```

Os três primeiros usam simulações isoladas onde há provedores externos. O último cria um projeto GitLab temporário próprio, com main protegida e pipeline obrigatório, e usa o executor real: publicação, build/teste, status, liberação, merge e nova compilação da fonte integrada. Não consulta a base operacional nem altera CURSOS. Confere propriedade antes da remoção do projeto/imagens/containers e registra a operação no ledger administrativo externo.

O serviço possui privilégio Docker no host confiável; não oferece VM por execução. Retenção/quota global de artefatos, diagnóstico protegido do compilador e recuperação administrativa geral do serviço seguem no backlog. Pagamentos, persistência de pedidos e cadastro de cursos não fazem parte desta preparação. As RAs de implantação e promoção de release conservam seus próprios testes e aprovações. Mantêm-se os indicadores existentes, conforme a decisão do usuário para esta sequência de entregas.

## RA-11c — encaminhamento junto à conversa

No Assistente, selecione o Sistema e **Conversa do Sistema**. A ação **Preparar aplicação** (ou **Acompanhar preparação**, quando houver pedido atual) abre o mesmo painel da RA-11b em diálogo, conservando conversa, rascunho e URL. Sistema → Conversas também oferece **Abrir assistente do Sistema**. A recuperação fora do diálogo reabre o mesmo pedido.

O servidor fornece metadados atuais do Sistema e da operação, separados da página histórica de mensagens. O modelo recebe essa observação e orienta a usar a ação disponível, sem executar uma ferramenta. A ação permanece utilizável pelos controles quando o modelo está indisponível. Contextos de Projeto/Épico/História/Tarefa não recebem a ação do Sistema. Role, atividade e prontidão observadas não substituem a prévia remota e a revalidação no comando.

A consulta de preparação, os nove arquivos, as confirmações de publicação/Draft/merge, o motivo, a identidade idempotente e o acompanhamento são compartilhados com o repositório. Mudança de contexto/persona ou falha de consulta bloqueia decisão nova e mantém referências/recuperação; não converte texto ou “sim” em autorização. Não há novo executor ou estado paralelo. Esta fatia não implanta DEV nem encaminha comandos de build/deploy ainda ausentes da conversa.

Regressão reproduzível no WSL, pasta sdlc/portal:

```text
python3 scripts/regression.py backend assistant-system-actions.test.ts assistant-contracts.test.ts assistant-messages.test.ts assistant-session.test.ts requirements.test.ts application-preparations.test.ts audit-guard.test.ts audit.test.ts
python3 scripts/regression.py browser assistant-application-preparation.spec.ts application-preparation.spec.ts assistant-workspace.spec.ts assistant-workflow.spec.ts conversation-history.spec.ts
```

Provedores externos são simulados nessas suítes isoladas. Os recibos distinguem a regressão dirigida da conferência somente leitura no portal publicado e do ensaio GitLab/executor da RA-11b; não afirmam nova implantação do piloto ou teste de inferência real.
