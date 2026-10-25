# Releases do Sistema e promoção entre ambientes

## Decisão do usuário — 22/10/2026

Um Sistema possui releases. Uma release associa Histórias e identifica a composição de software que se pretende implantar. A mesma composição pode ser promovida entre testes (QA), homologação (HML/UAT) e produção (PRD). Cada implantação registra o ambiente, a release, as aprovações, o resultado e a data.

**O conteúdo aprovado em homologação deve ser exatamente o conteúdo enviado para produção.** Retirar uma História, corrigir um erro ou alterar qualquer parte do pacote exige uma nova composição, com passagem obrigatória por QA e todos os testes, controles e gates novamente; depois, nova implantação em HML, nova homologação e autorização de produção. É proibido alterar o pacote em HML ou preparar uma composição diferente diretamente para PRD.

Esta é uma definição de domínio e um requisito para implementação futura. Não implementa releases, testes, scanners, gates ou deploys. O [backlog funcional](plano-portal-sdlc-2026-10-20.md) continua pausado durante a redefinição da interface.

## Modelo e rastreabilidade

- O menu principal **Releases**, ao lado de Visão Geral e Sistemas, concentra criação, gestão da composição, ramificações, controles, aprovações e promoção entre ambientes. Sua entrada global consulta todos os Sistemas, com filtro por Sistema. Criar uma release exige escolher o Sistema e informar o nome; isso produz um rascunho, sem iniciar execução ou implantação.
- Na consulta da História, inclusive em SPECIFICATION ou CODING, é possível somente escolher uma release em rascunho já existente do mesmo Sistema e salvar explicitamente a associação da revisão atual. A História não oferece criação ou gestão de releases. Participações em pacotes fechados permanecem no histórico, com links de consulta para a área central. Sistema, Projeto e Épico oferecem somente referências de consulta; composição e ramificações retornam à mesma História, sem criar outro catálogo de trabalho.
- A composição planejada também pode ser administrada na área Releases, incluindo e retirando Histórias do mesmo Sistema. Planejar uma História pendente é permitido; isso não aprova sua revisão nem libera o fechamento do pacote.
- Criar a release não exige associação a nenhuma História. Um rascunho vazio é válido e pode ser composto posteriormente por outra pessoa autorizada. A criação e a escolha das Histórias são operações independentes; rascunho vazio não produz candidata, aprovação, pacote ou implantação. Papéis e permissões concretos permanecem sujeitos à definição da implementação, sem presumir autenticação multiusuário no protótipo.
- A escolha de Histórias deve oferecer atalhos e filtros combináveis por disponibilidade da revisão atual, planejamento, verificações, status do processo, Projeto e Épico. “Revisão atual sem release” significa não ter planejamento ativo nem participação em pacote fechado dessa mesma revisão; uma participação de revisão anterior continua histórica e não oculta o trabalho atual. Status do processo não comprova aprovação de verificações. A seleção deve sobreviver aos filtros e à navegação, com total global e quantidade selecionada fora da lista visível; operações em lote devem explicitar seu alcance.
- A release planejada é uma intenção editável; não altera o status da História, não substitui G1 e não aprova revisão, segurança ou testes. O histórico de participações em composições fechadas é separado da associação atual de planejamento. Uma revisão anterior aprovada não libera a revisão atual.
- Ao fechar uma seleção elegível do rascunho, registrar o vínculo com a candidata produzida e consumir somente as associações daquelas revisões incluídas. As Histórias pendentes continuam no planejamento, com motivo e acesso ao acompanhamento para resolver o impedimento. Pacotes já fechados continuam imutáveis.
- A hierarquia Sistema → Projeto → Épico → História → Tarefa permanece. A associação a uma release não transfere a História de Épico ou Projeto. Uma release pode reunir Histórias de diferentes Projetos do mesmo Sistema.
- A seleção é editável enquanto rascunho. Ao fechar a composição para construir e validar a candidata, ela ganha identidade própria e conteúdo imutável. Qualquer mudança posterior gera outra candidata, com identidade distinta e vínculo à anterior.
- Cada associação identifica a revisão exata da História e suas alterações de código. A mesma História pode participar de outras releases com revisões identificadas; seu status atual não comprova a aprovação de uma revisão diferente.
- O manifesto identifica a base utilizada, as Histórias/revisões selecionadas, os commits e os artefatos por componente/repositório, com versões e digests. Também registra dependências e migrações necessárias. A lista de Histórias acrescentadas não substitui o inventário completo do conteúdo, incluindo funcionalidades já existentes na base.
- Uma release pode ter várias implantações em ambientes diferentes. Promover conteúdo idêntico não cria outra composição nem reconstrói o pacote. Configurações próprias do ambiente devem ser declaradas e rastreadas; não podem servir para substituir conteúdo ou ocultar mudanças não homologadas.
- A versão do software não é um contador de Histórias ou de implantações. A política de versionamento será definida na implementação; versões e identificadores não podem ser reutilizados para conteúdos diferentes.

## Fluxo obrigatório e retorno de homologação

Fluxo de uma composição fechada:

`Preparar candidata → Construir pacote → QA + testes/revisão/segurança → G2 → HML + regressão/homologação → G3 → PRD`

O detalhamento mantém a sequência de revisão, segurança e testes finais do plano original. Os testes devem executar contra o pacote e a composição efetivamente candidatos, não apenas contra cada História isoladamente.

Ao rejeitar conteúdo durante HML:

1. Registrar a rejeição, o motivo e as Histórias/achados envolvidos. Bloquear a promoção dessa candidata para produção.
2. Preservar integralmente o manifesto, os artefatos, as evidências, as implantações e as decisões anteriores. Não substituir o pacote da candidata nem reescrever o histórico.
3. Abrir uma nova candidata vinculada à anterior, com a retirada solicitada ou a correção executada pelo fluxo da ferramenta. Verificar dependências antes de confirmar a composição.
4. Construir o novo pacote e implantá-lo em QA. Executar novamente todos os testes e controles do processo, inclusive revisão e segurança, com novas evidências e nova aprovação G2. Se houver mudança de escopo/especificação, também obter o G1 correspondente antes da codificação.
5. Implantar esse mesmo novo pacote em HML, executar a regressão e obter nova homologação e novo G3. A aprovação da composição anterior não autoriza a nova.
6. Somente então permitir PRD, promovendo exatamente os artefatos homologados, sem rebuild ou edição.

“Voltar para testes” descreve o retorno do trabalho ao processo de validação. A candidata anterior continua imutável; a correção é rastreada em outra candidata. Não há obrigação de alterar o ambiente de produção enquanto o retrabalho acontece.

## Exemplo: dez Histórias em testes, nove para homologação

A candidata R1 contém H01–H10. O usuário retira H07 da seleção para a próxima entrega. O SDLC verifica dependências e prepara R2 com as nove Histórias, a partir de uma base conhecida. Retirar uma associação no cadastro não remove código: a composição e seus artefatos precisam corresponder à seleção.

Se H09 depender de H07, o SDLC explica o impedimento e conduz a decisão dentro da ferramenta: retirar também H09 ou resolver a dependência antes de validar a nova composição. Não incluir H07 silenciosamente e não presumir que qualquer subconjunto seja implantável.

R2 passa por QA e todos os controles antes de ir a HML. Se a retirada ou uma correção for solicitada quando R1 já estiver em HML, aplica-se o mesmo retorno obrigatório: nova candidata → QA completo → nova HML/homologação → PRD. Os testes ou a aprovação de R1 não substituem os de R2.

## Experiência de uso a preservar no redesenho

- A entrada principal fica no menu **Releases**, com filtro por Sistema e acesso contextual pela História. Atalhos para revisões prontas e sem release, filtros combináveis, seleção em lote e contagem das escolhas fora dos filtros evitam abrir dezenas de páginas. Projeto limita a escolha de Épicos. O planejamento permite rascunho vazio e composição posterior; o fechamento exige seleção elegível e dependências resolvidas.
- Mostrar quantidades selecionadas, retiradas e bloqueadas, com dependências e motivos. Diferenciar verificações individuais aprovadas de composição final validada.
- A consulta central deve mostrar visualmente as etapas Em composição, QA, Homologação e Produção, com contagens e filtros combinados por Sistema, etapa e busca. Uma lista única reúne rascunhos e candidatas, paginada a cada 20 releases e ordenada por data de criação decrescente, com desempate estável. Datas desconhecidas são identificadas e ordenadas ao final. Aprovação de um gate não equivale à implantação no próximo ambiente. Rejeitadas aparecem como exceções; produção diferencia versão atual de histórico, conforme as implantações registradas.
- Exibir o processo e a ação principal na faixa superior junto ao breadcrumb. O retorno de HML deve explicar: “O conteúdo mudou. Uma nova candidata precisa passar por testes e nova homologação antes de produção.”
- Separar claramente candidata/release, ambiente atual, implantação, última decisão e próxima ação. Oferecer comparação com a candidata anterior e com o conteúdo atual do ambiente de destino.
- Mostrar andamento real das verificações e seus resultados. O assistente da ferramenta conduz conversas sobre impedimentos e executa operações autorizadas; não depende de ajustes externos nos projetos gerados.
- QA pode continuar recebendo outras Histórias. A validação da candidata exige ambiente ou execução isolada que garanta a composição correta; a estratégia concreta será definida considerando os recursos disponíveis.

A criação das telas exige participação dos agentes de UX, conforme orientação já registrada. Esta decisão não substitui a revisão navegável nem autoriza perda de funcionalidades existentes.

## Critérios de aceite para a implementação

1. Retirar uma História durante QA produz uma nova candidata; somente o pacote correspondente à seleção pode ser promovido.
2. Retirar uma História ou corrigir um erro durante HML impede PRD e exige nova candidata, QA completo, nova HML/homologação e novos gates.
3. Aprovação, teste ou scan da candidata anterior não libera a nova composição. Falha, ausência ou indisponibilidade de uma verificação obrigatória bloqueia o avanço.
4. Uma dependência entre História selecionada e retirada é apresentada e resolvida antes da promoção, sem inclusão silenciosa.
5. API, orquestrador e executor recusam promoção com revisão, manifesto ou digest divergente das evidências e aprovações. A proteção não pode existir apenas no botão da interface.
6. O pacote aprovado em HML chega a PRD sem rebuild ou alteração. Mudanças concorrentes na candidata ou no ambiente de destino exigem conferência e não podem sobrescrever silenciosamente uma implantação.
7. Retomadas são idempotentes e implantações no mesmo destino são serializadas. Preservar releases anteriores, causas de rejeição, vínculos de sucessão e trilha de auditoria.
8. Selecionar dezenas de Histórias é possível em lote, mantendo visíveis os impedimentos e o conteúdo exato da candidata.

## Métricas a definir antes da implementação

Avaliar com o usuário: candidatas rejeitadas em QA/HML, primeiras passagens aprovadas, ciclos de retrabalho por categoria (retirada de escopo, defeito funcional, segurança, dependência e falha operacional), tempo em cada etapa, tempo até nova homologação e implantações por ambiente. Correlacionar Sistema, release/candidata, revisão da História, execução, aprovação e implantação.

Essas são sugestões para definição, não indicadores implementados ou metas aprovadas. Antes da entrega funcional, confirmar definições, denominadores e categorias com o usuário e instrumentar conforme a [política de arquitetura](../portal/docs/ARCHITECTURE.md). Uma release com cinquenta Histórias não equivale a cinquenta implantações para a métrica DORA.
