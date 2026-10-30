# Releases do Sistema e promoção entre ambientes

**Responsabilidades e ambientes — 29/10/2026:** a [correção de conceito](autonomia-assistente-executores-2026-10-29.md) separa referência de ambiente, estrutura da aplicação, provisionamento, build e implantação saudável. A release OPEN ter contexto DEV não comprova ambiente físico ou deploy. Assistente e controles do portal devem conduzir os mesmos serviços/executores do SDLC; encaminhamento da preparação e provisionamento/implantação DEV ainda têm fatias pendentes no plano. O build RA-11 e a preparação RA-11b já entregues não atestam implantação ou promoção da release.

**RA-06b publicada em 28/10/2026:** política/base inicial podem receber decisão explícita no próprio plano da Release, por contexto e autoria; nenhum pedido para continuar decide a base real. A confirmação é local e não executa branch ou gate de software. [Contrato, roteiro e limites](plano-incremental-releases-ambientes-2026-10-27.md#22-recibo-ra-06b--decisão-local-do-plano).

**RA-06a — consulta/proposta publicada em 28/10/2026:** detalhe da Release apresenta branches, SHA e integrações remotas separados do desenho e de DE-01/02. Nenhuma base é autorizada por consulta, nem histórico de MR comprova composição. [Proposta concreta ainda não aprovada e roteiro](plano-incremental-releases-ambientes-2026-10-27.md#21-recibo-ra-06a--consulta-e-proposta-de-branches). Operações de branch e mudanças nos agentes continuam nas entregas dependentes.

**RA-05b — adoção de referências em 28/10/2026:** fase/versão do cadastro não são revisão de conteúdo. Planejamento compara fatos locais de conteúdo, especificação e código; SHA equivalente preserva identidade. Conferência de planejamento não concede Desenvolvimento Finalizado ou candidata. Registro sem referência suficiente fica não conferido e mudança real exige revisão explícita; fonte histórica permanece intacta. [Recibo e limites](plano-incremental-releases-ambientes-2026-10-27.md#20-recibo-ra-05b--vigência-das-referências-de-planejamento).

**RA-03 — adoção de leitura em 28/10/2026:** fase, aprovação de desenvolvimento e conclusão têm leitura separada na lista, História e Tarefas. Versão administrativa não é revisão aprovada; especificação e SHA são referências independentes, sem atestar uma aprovação comum. Status não é evidência DEV/produção; COMPLETED registrado fica preservado com produção não confirmada. O comando de Desenvolvimento Finalizado permanece RA-14 e QA exige aprovação válida de todas as revisões da composição. [Recibo e limites](plano-incremental-releases-ambientes-2026-10-27.md#17-recibo-ra-03--desenvolvimento-e-conclusão-separados).

**Ciclo OPEN/CLOSED/CANCELED — adoção RA-04a/04b:** estados/DEV inicial e cancelamento auditado estão publicados. Administrador/Release Manager pode cancelar OPEN/CLOSED com motivo/confirmação; decisão e composição permanecem preservadas, sem reabertura ou alteração de instalação/Histórias. Fechar, gerar cópia e promover continuam nas fatias próprias. [Contrato](#ciclo-da-release-open-closed-e-canceled) e [recibo RA-04b/limites](plano-incremental-releases-ambientes-2026-10-27.md#16-recibo-ra-04b--cancelamento-auditado-da-release). Eventos anteriores conservam os valores registrados à época.

**Correção de adoção RA-02-C1:** o usuário dispensou compatibilidade do modelo antigo no laboratório. Releases agora usa compositionStatus DRAFT/FROZEN/CANCELLED, separado dos destinos DEV/QA/HML/PRD. A existência de cadastro não certifica implantação; a fase da História é persistida e merge não a conclui. A base existente foi reconciliada com os fatos confirmados, sem inventar resultados. [Publicação e evidência](plano-incremental-releases-ambientes-2026-10-27.md#11-correção-ra-02-c1--releases-e-fase-da-história).

**Adoção incremental RA-02, 27/10/2026:** referências de DEV/QA/HML/PRD e recuperação explícita de ausências implementadas no cadastro/consulta do Sistema. Isso não provisiona ambientes, cria candidatas ou executa deploy; o restante deste contrato segue nas entregas posteriores. [Evidência e aceite](plano-incremental-releases-ambientes-2026-10-27.md#10-recibo-ra-02--referências-de-ambiente).

## Contrato corrente: DEV, candidatas e conclusão em produção — 27/10/2026

Este contrato incorpora as definições explícitas do usuário posteriores à primeira consolidação. Prevalece sobre os trechos históricos abaixo quando houver divergência. O [plano incremental e registro de aceites](plano-incremental-releases-ambientes-2026-10-27.md) relaciona código afetado, dependências, testes e OK do usuário por entrega. A adoção publicada alcança leitura, cadastro de referências e navegação, conforme os recibos do plano; os novos executores de publicação, aprovação e promoção continuam planejados.

| Regra | Definição corrente |
| --- | --- |
| RF-01 | DEV, QA, HML e PRD são ambientes; não são estados de release. Composição, candidata, build, implantação, validação e aprovação têm situações e evidências próprias. |
| RF-02 | A História permanece aberta durante desenvolvimento e validação. Só é **concluída** quando a entrada em produção da candidata que contém sua revisão for efetivamente confirmada. Solicitar deploy, fazer merge ou aprovar DEV/QA/HML não a conclui. |
| RF-03 | **Desenvolvimento Finalizado** é a aprovação que habilita a revisão da História a compor a passagem DEV → QA. É diferente da conclusão da História e deve identificar revisão/código, evidências de DEV, aprovador e instante. O código interno e a representação física serão definidos na implementação. |
| RF-04 | A História pode ser publicada individualmente em DEV, sem depender de release. Durante os diversos deploys em DEV, percorre ciclos de codificação e testes. Correções voltam ao desenvolvimento; alteração de especificação/escopo aprovado segue o Gateway de Especificação existente. Review, scan e merge continuam com seus resultados próprios. |
| RF-05 | A release só pode iniciar a passagem DEV → QA quando **todas as Histórias associadas à composição avaliada** estiverem com Desenvolvimento Finalizado válido. A conferência considera a coleção inteira e sua revisão, não apenas a página visível, um contador ou as Histórias prontas. |
| RF-06 | Fechar a release fixa sua composição/revisões e muda OPEN → CLOSED, ainda em DEV. O marco DEV → QA monta/versiona o pacote dessa composição: construir, verificar e depois implantar em QA. CLOSED não atesta build ou implantação; falha não reabre a release nem confirma entrada em QA. Mudança de conteúdo exige cópia como outra release. |
| RF-07 | DEV admite builds/versionamentos de trabalho da História, rastreáveis por revisão, e vários deploys, sem candidata formal ou release obrigatória por experimento. Na passagem para QA, a candidata identifica o conteúdo e os artefatos; os mesmos digests seguem para HML e PRD, sem rebuild. |
| RF-08 | Congelamento identifica release, composição, base/commit, revisões de Histórias, dependências, migrações e conjunto de artefatos. Branch é referência mutável; a candidata não pode seguir automaticamente o HEAD depois de congelada. |
| RF-09 | A associação a uma release é opcional durante especificação, codificação, revisão, merge, publicação e testes individuais em DEV, até Desenvolvimento Finalizado. Torna-se obrigatória na passagem para QA, com todas as Histórias da composição aprovadas e pacote imutável. O destino Git/base deve ser explícito e rastreável, sem exigir branch de release no ciclo DEV. Esta definição posterior substitui a exigência anterior de release antes de gerar/integrar código. |
| RF-10 | A composição de código deve corresponder à composição autorizada. Marcar/desmarcar Histórias não acrescenta/remove código de branches; código extra, dependências não resolvidas ou conteúdo sem proveniência impedem o avanço. O inventário inclui a base, não apenas Histórias novas. |
| RF-11 | Aprovações pertencem à revisão/evidência. Alterações posteriores reabrem o trabalho afetado e invalidam sua prontidão; a composição integrada exige validação própria. Mudanças de status administrativo não devem, sozinhas, inventar nova revisão de conteúdo ou apagar evidências. |
| RF-12 | Implantação concluída, testes aprovados e aceite de negócio são fatos distintos. Resultados ausentes, falhos ou não confirmados impedem o avanço e permanecem identificados como tais. |
| RF-13 | Cada release fechada identifica um conteúdo fixo e seu pacote imutável, com várias tentativas operacionais permitidas para as mesmas entradas. Alteração de conteúdo cria outra release por cópia em DEV; não gera RC2 com conteúdo diferente dentro da release original. Histórico de participação não equivale à associação ativa de planejamento. A mesma revisão não recebe conclusão por um pacote que não a contém. |
| RF-14 | Gates, autorização, revisão/digests, idempotência, concorrência por destino, retentativa, reconciliação e auditoria são garantidos por API/orquestrador/executor, além da interface. Modelo de IA não concede permissão nem substitui evidência real. |
| RF-15 | Os estados da release serão OPEN, CLOSED e CANCELED. Criação gera OPEN no fluxo DEV; OPEN pode fechar ou cancelar; CLOSED pode cancelar. CANCELED é terminal. Não existe transição de reabertura. |
| RF-16 | OPEN admite editar composição somente em DEV. CLOSED impede editar conteúdo em qualquer ambiente. Apenas CLOSED não cancelada pode promover para QA, HML e PRD, com os controles próprios de cada destino. |
| RF-17 | A release pode ser cancelada em qualquer momento. Cancelamento bloqueia novas promoções e preserva conteúdo, histórico e resultados; não desfaz uma implantação nem reabre Histórias já concluídas em produção. Operação externa já iniciada exige reconciliação do resultado real. |
| RF-18 | Gerar Cópia em DEV cria outra identidade de release, OPEN e no fluxo DEV, ligada à origem. A origem permanece preservada; a cópia permite incluir/retirar Histórias e reiniciar o ciclo com nova composição e pacote. A cópia não reutiliza aprovação da release nem evidência de implantação como autorização do novo pacote. |

### Ciclo da release: OPEN, CLOSED e CANCELED

Esta definição posterior prevalece sobre o modelo anterior de várias candidatas com conteúdos diferentes dentro da mesma release. Os termos candidata, manifesto e artefato continuam úteis para identificar o pacote; não autorizam editar o conteúdo de uma release CLOSED. A implementação permanece nas fatias do [plano incremental](plano-incremental-releases-ambientes-2026-10-27.md#13-definição-posterior--open-closed-canceled-e-cópia-em-dev).

| Estado | Ambiente do fluxo | Composição editável | Operações de domínio |
| --- | --- | --- | --- |
| OPEN | DEV | Sim | Incluir/retirar Histórias, fechar ou cancelar |
| CLOSED | DEV | Não | Preparar pacote e solicitar entrada em QA após os gates; cancelar |
| CLOSED | QA | Não | Validar e solicitar HML após os gates; cancelar; gerar cópia em DEV |
| CLOSED | HML | Não | Homologar e solicitar PRD após os gates; cancelar; gerar cópia em DEV |
| CLOSED | PRD | Não | Consultar o que foi publicado; cancelar administrativamente; gerar cópia em DEV |
| CANCELED | Último ambiente registrado | Não | Consultar conteúdo/histórico; sem reabertura ou novas promoções |

**DEV ao criar** indica posição inicial no fluxo, sem afirmar que houve build ou deploy. A implantação de cada ambiente tem fatos e tentativas próprios. Promover não remove automaticamente a instalação de QA ao entrar em HML; a consulta deve distinguir o ambiente de avanço das versões efetivamente instaladas em cada destino. Histórias continuam livres para desenvolver/publicar em DEV sem release, conforme RF-04/09.

**Fechamento e montagem são fatos distintos.** Fechar fixa Histórias/revisões, origem/base e entradas necessárias à composição; preparar QA constrói e sela os artefatos dessa fonte. Todas as Histórias precisam de Desenvolvimento Finalizado válido antes da entrada em QA. Recomenda-se verificar esse gate já ao fechar, para evitar uma composição congelada sabidamente incompleta; a elegibilidade exata do fechamento, inclusive composição vazia, fica explicitamente em DE-08 do plano. Nenhuma dessas decisões de interface substitui autorização, prontidão ou confirmação do executor.

**Falha de build/deploy mantém CLOSED.** Uma retentativa com as mesmas entradas não muda conteúdo nem reabre a release. Fonte, dependências/contrato ou bytes já selados não podem ser substituídos para aproveitar a identidade original; correção de conteúdo segue por outra release OPEN. QA aprovado continua obrigatório antes de HML; homologação/autorização continua obrigatória antes de PRD.

**Cancelamento preserva os fatos.** A decisão pode ocorrer em DEV, QA, HML ou PRD. Bloqueia novas intenções de promoção de forma concorrente e auditada; execução já enviada pode ter produzido efeito e precisa ser consultada. A interface não pode afirmar que o deploy foi interrompido apenas porque a release virou CANCELED. Em PRD, o software permanece instalado até uma recuperação ou substituição explícita. Histórias concluídas pela publicação anterior e indicadores históricos de implantação permanecem preservados. Cancelar a release não cancela automaticamente suas Histórias; as ainda abertas podem ser replanejadas com seu histórico preservado.

**Cópia preserva identidade e proveniência.** Deve partir de uma composição/revisões identificadas da origem, gerar novo ID/chave e ligação com a origem, sem duplicar as Histórias como novos itens nem transferir/apagar sua participação histórica. A cópia nasce sem candidata implantada, sem digests novos atestados e sem aceites de QA/HML/PRD herdados. Uma aprovação individual de desenvolvimento só pode continuar válida se suas condições/revisão/base permanecerem válidas; a composição nova precisa de verificação própria. Histórias já concluídas não voltam automaticamente a coding: alterações novas exigem trabalho/revisão identificados.

Gerar cópia, por si só, não cancela a origem nem autoriza promover uma das duas. Se a origem não deve seguir adiante, o cancelamento deve ser explícito. Copiar conteúdo antigo exige verificar a base vigente e dependências para não regredir mudanças já publicadas. Retirar uma História da cópia não remove automaticamente seu código: a prova de composição RF-10 permanece obrigatória.

**Exemplo:** R1 CLOSED em QA contém H01/H02/H03. Gerar Cópia em DEV cria R2 OPEN, com origem R1. R2 pode retirar H02, resolver dependências, validar a composição em DEV, fechar e gerar seu pacote para QA. R1 continua identificável e imutável; seus testes não aprovam R2. R2 percorre QA → HML → PRD com os mesmos artefatos. Se R1 for cancelada, sua instalação/histórico continua consultável.

### DEV independente da release e trilho da História — 27/10/2026

O trilho mantém as atividades existentes até Merge Request e depois apresenta **DEV → QA → HML → PROD**. DEV pertence ao desenvolvimento da História; QA, HML e PROD pertencem à candidata imutável da release. Ambientes não substituem status de execução. Desenvolvimento Finalizado aprova uma revisão e não conclui a História. A conclusão continua condicionada à entrada confirmada de sua candidata em produção.

A liberdade do ciclo DEV não garante isolamento físico: um DEV compartilhado só pode anunciar a revisão efetivamente ativa, com fila/exclusão por destino; sobrescrever uma publicação exige controle. A topologia fica em DE-04. Associação no portal não seleciona código: antes de QA, a composição Git precisa demonstrar exatamente quais revisões e dependências entram no pacote. Histórias integradas numa base compartilhada que não pertençam à composição exigem isolamento ou remoção verificável; simplesmente desassociá-las não basta. DE-01/02 e RA-06–09 detalharão a estratégia, sem alterar branches remotamente nesta entrega.

A implementação atual desta fatia é de consulta: mostra pré-requisitos e associação confirmada; merge/cadastro de ambiente/status antigo não comprovam implantação. Publicação individual DEV, aprovação de desenvolvimento, construção de candidata e promoção ainda precisam de executores e fatos próprios. [Entrega RA-02-C2 e roteiro](plano-incremental-releases-ambientes-2026-10-27.md#12-ajuste-ra-02-c2--trilho-de-entrega-da-história).

### Retirar uma História enquanto a candidata está em QA

A ação futura passa a ser **Gerar Cópia em DEV**, seguida de edição na nova release OPEN. Não cancela automaticamente a História ou a origem, não altera o pacote instalado e não transforma retirada do cadastro em remoção de código. A descrição anterior de RC2 dentro da mesma release foi substituída por outra identidade de release.

1. Consultar a candidata e selecionar a revisão a retirar; apresentar commits, correções relacionadas, dependentes e impacto. Apenas abrir a prévia não muda o plano ou a promoção.
2. Confirmar a cópia com versão otimista, identidade da origem e autoria; editar a retirada somente na nova composição OPEN. Se a origem não deve prosseguir, cancelar explicitamente sua promoção. Cancelamento e promoção concorrentes precisam ser serializados; não anunciar interrupção de uma implantação já em curso sem tratar sua situação.
3. Preservar RC1, manifesto, artefatos, testes, decisões e implantações. A candidata anteriormente testada não é sobrescrita. Uma substituição precisa ser reconhecível na decisão de promover, sem confundir conteúdo imutável com a autorização mutável da entrega.
4. Criar outra release OPEN em DEV, ligada à origem, sem reabertura ou alteração da composição fechada original. A História retirada permanece no histórico; não recebe conclusão nem perde resultados anteriores.
5. Retirar de fato o código por alteração revisável: reversão ou reconstrução a partir de base conhecida, conforme análise. Dependências, conflitos, migrações e correções compartilhadas podem impedir a operação. Não executar exclusão silenciosa nem atribuir a um agente uma capacidade que ainda não possua.
6. Validar a composição alterada em DEV, revisar prontidão das Histórias afetadas e exigir todas as Histórias restantes com Desenvolvimento Finalizado válido para a composição pretendida.
7. Fechar a nova release e montar/versionar seu pacote na passagem DEV → QA; construir os artefatos e executar os controles obrigatórios dessa composição em QA. Evidências da origem não aprovam a cópia.
8. Após aprovação, promover a nova release a HML. A correção ou retirada em HML/PRD segue o mesmo retorno por cópia: nova release OPEN em DEV, fechamento, pacote, QA e nova homologação antes de PRD.

Exemplo: R1 contém H01/H02/H03. Retirar H02 na cópia R2 produz composição H01/H03, somente se o código e as dependências permitirem. Se H03 depender de H02, a ferramenta exige uma decisão explícita: retirar também H03 ou resolver a dependência e revalidar. R1 permanece no histórico; o destino de promoção é sempre escolhido explicitamente e seu cancelamento bloqueia novas promoções.

### Branches e GitLab: recomendações a validar no plano

O código atual usa a branch padrão como contexto/destino e cria `sdlc/story-<executionId>`. DEV continua independente de release: Histórias/correções usam destino/base explícitos e MRs rastreáveis. Para montar uma release, pode ser necessária uma branch de integração a partir de base conhecida, com prova da composição e commit fixado ao fechar; sua criação não é pré-requisito do desenvolvimento individual. A cópia recebe nova identidade e referência de origem, sem reaproveitar a branch fechada como destino editável. DEV/QA/HML/PRD continuam destinos de artefatos, sem branches por ambiente como substituto da rastreabilidade.

A estratégia ainda precisa de aceite técnico/funcional antes de alterar repositórios: papel de `main`, origem da primeira release sem versão em produção, adoção de Histórias já integradas em `main`, propagação de correções e concorrência de releases. Uma release em desenvolvimento por Sistema é uma recomendação inicial, não uma restrição já aprovada. Não mover/resetar branches ou reescrever MRs existentes para demonstrar o fluxo. Nova correção após um MR integrado exige nova revisão/MR rastreável; não escrever em um MR já fechado como se fosse o mesmo ciclo aberto.

### Decisões encerradas e detalhes ainda abertos

**Encerradas por definição do usuário:** momento de conclusão da História em PRD; distinção de Desenvolvimento Finalizado; ciclos coding/testing com deploys DEV independentes de release; gate de todas as Histórias antes de QA; montagem/versionamento imutável no marco DEV → QA; estados OPEN/CLOSED/CANCELED, sem reabertura; alteração de conteúdo fechado por outra release OPEN em DEV, gerada por cópia. Isso substitui a conclusão no aceite de QA/HML e a recomposição de conteúdo por RC2 dentro da mesma release.

**A validar antes das entregas dependentes:** política concreta de branches/base e releases simultâneas; quem aprova Desenvolvimento Finalizado/G2/G3 e os critérios obrigatórios; executor inicial e topologia/isolamento; contratos de build/testes/migração/saúde; convenção de versões; tratamento de retirada/cancelamento com código integrado; recuperação de dados e significado operacional de reversão de produção. O plano registra esses pontos sem pedir novamente as definições que o usuário já fixou.

## Consolidação de domínio — 27/10/2026

Esta consolidação inicial registra a discussão posterior ao merge, a correção explícita de que **QA é um ambiente de testes, não um status**, e a inclusão de **DEV como ambiente de desenvolvimento**. Deve ser lida à luz do contrato corrente no início deste documento, que incorpora as decisões posteriores sobre conclusão, gate DEV e retirada em QA. As decisões de 22/10 permanecem abaixo como origem das regras de composição e promoção imutável; menções antigas a “etapa QA/HML/produção” identificam destinos/validação, não estados da release.

**Alcance desta atualização: documentação.** Não aplica migrations, acrescenta DEV à instalação, associa Histórias, constrói pacotes ou implanta software. Criação de release em DRAFT e associação planejada de Histórias já existem no portal. Candidatas imutáveis, construção de pacotes, executores de Teste/Teste Final e implantações DEV/QA/HML/PRD ainda exigem implementação. Referências de ambiente cadastradas não comprovam infraestrutura ou aplicação executável.

### Conceitos e responsabilidades

| Conceito | Definição |
| --- | --- |
| Sistema | Unidade contínua de software, proprietária das releases e de um único repositório. Sua arquitetura organiza APIs, frontend, backend, batches e infraestrutura em pastas. |
| História | Entrega de negócio com especificação, revisão, trabalho e evidências. Merge confirma integração de código; não comprova implantação, aceite ou conclusão. |
| Release planejada | Intenção de composição do Sistema. Em DRAFT admite inclusão/retirada de Histórias e pode começar vazia. Não constitui pacote implantável. |
| Candidata | Composição identificada e imutável, vinculada às revisões, commits e manifesto. Uma release pode ter várias candidatas; mudança de conteúdo gera outra identidade, ligada à anterior. |
| Artefato | Pacote construído da composição, identificado por versão e digest. O manifesto registra o conjunto completo de artefatos da candidata. |
| Ambiente | Destino de execução: DEV, QA, HML ou PRD. Não representa estado da release, da História ou de uma operação. |
| Implantação | Operação que associa candidata/artefatos a um ambiente e registra tentativa, resultado, autoria e instante. Admite várias tentativas no mesmo destino. |
| Validação | Execução de verificações sobre conteúdo identificado, com evidências e resultado próprios. Implantação concluída não equivale a testes aprovados. |
| Promoção | Avanço autorizado dos mesmos artefatos para outro ambiente, preservando conteúdo/digests e gates. Não reconstrói o pacote. |

### Ambientes acordados

| Ambiente | Finalidade | Conteúdo |
| --- | --- | --- |
| DEV | Executar e verificar mudanças durante o desenvolvimento | Permite versões de trabalho sem release fechada; cada execução deve identificar sua revisão/origem. |
| QA | Ambiente de testes | Recebe candidata identificada e imutável da release, com implantação e testes daquela composição. |
| HML | Homologação com o negócio | Recebe os mesmos artefatos aprovados em QA, com homologação própria. UAT descreve a atividade de aceite nesse contexto. |
| PRD | Operação da versão autorizada em produção | Recebe os mesmos artefatos homologados, após autorização aplicável. |

DEV não exige criar uma candidata para cada experimento. A partir de QA, a unidade implantável é uma candidata da release. Aprovação em DEV não substitui validação em QA. Uma mesma candidata pode estar implantada em QA e HML ao mesmo tempo, com implantações e resultados distintos. Quantidade, tipo e isolamento físico das instâncias de ambiente ainda serão definidos.

### Ambiente, estado e resultado são dimensões separadas

Exemplo de apresentação conceitual:

> Release 1.2 · candidata 3 · ambiente QA · implantação concluída · validação em execução.

“Solicitada”, “em execução”, “concluída” e “falhou” exemplificam estados de implantação. “Pendente”, “em execução”, “aprovada” e “reprovada” exemplificam situações/resultados de validação. O vocabulário técnico completo, incluindo cancelamento e efeito não confirmado, será definido com os executores e o contrato de auditoria; estes exemplos não criam enums ou comandos.

O código ainda possui `QA`, `HML` e `PRODUCTION` em `ReleaseStage`. Esse modelo legado precisa de evolução: não inferir implantação real desses valores, não inventar aprovações ao migrar e não atribuir DEV retroativamente. Estado da composição, build, implantação, ambiente e validação precisam de fontes independentes. Telas e indicadores que usam o enum não foram migrados por esta definição.

### Associação da História e conteúdo efetivamente implantado

A História pode ser associada a uma release em DRAFT antes do merge. A associação planeja a entrega; não dispensa especificação, Gateway de Especificação, verificações ou merge. A gestão continua em Releases; a História escolhe uma release existente do mesmo Sistema. Histórias de Projetos distintos do mesmo Sistema podem integrar a composição.

Com um repositório por Sistema, a branch principal pode conter várias Histórias integradas. **Selecionar Histórias no cadastro não seleciona nem retira código.** Construir um commit entrega seu conteúdo integral, incluindo a base e outras integrações. O manifesto precisa identificar base, commit, inventário completo, Histórias/revisões, dependências e migrações. A lista de Histórias novas não substitui esse inventário.

**Recomendação para a primeira implementação, sujeita ao detalhamento técnico:** fixar um commit para a candidata, identificar todas as mudanças desde a composição anterior e impedir fechamento quando código e seleção planejada forem inconsistentes. Subconjuntos de Histórias já integradas exigem estratégia própria de composição e dependências; desmarcar uma História não desfaz seu merge. Preservar a correlação com os commits de origem, merge/squash e base.

### Evolução recomendada até QA

Ordem proposta de implementação, sem declarar executores entregues ou autorizar uso de dados de negócio para demonstração:

1. **Elegibilidade técnica:** comprovar integração no destino, registrar revisão/commits e verificar dependências e evidências válidas.
2. **Composição planejada:** aproveitar DRAFT e associação existentes, distinguindo Histórias prontas e pendentes, sem inclusão silenciosa de código.
3. **Candidata imutável:** fechar seleção elegível com manifesto, base, revisão do repositório, dependências e migrações. Mudança posterior gera nova candidata.
4. **Construção e validação:** executar build/testes e produzir artefatos/digests. O repositório deve declarar como construir, testar, executar, verificar saúde e tratar migrações conforme sua arquitetura; o template neutro não fornece esses contratos automaticamente.
5. **Implantação em QA:** executar os artefatos identificados, com configurações/segredos do ambiente, concorrência por destino, migrações, saúde, retentativa e recuperação. Reverter aplicação não implica poder desfazer migração de dados; planejar essa compatibilidade.
6. **Validação em QA:** testar a composição efetivamente implantada e relacionar resultados aos critérios das Histórias. Review/segurança de uma História isolada não validam automaticamente toda a candidata.

Primeira fatia recomendada: percorrer o fluxo para um Sistema, incluindo falha e retomada segura em validação isolada, antes de ampliar para HML/PRD. DEV apoia o desenvolvimento e tem seu executor a definir; não vira status obrigatório da release nem gera candidata por experimento.

A pessoa de negócio conduz pelo portal: associar à release, preparar candidata, construir/validar, implantar em QA e acompanhar resultados. O assistente explica impedimentos e oferece operações disponíveis; permissões, confirmações, evidências e auditoria pertencem ao domínio/executor. Intervenções genéricas de infraestrutura não são apresentadas como automáticas.

### Registro anterior de finalização — substituído pelo contrato corrente

O trecho abaixo preserva a discussão anterior. A decisão posterior do usuário em RF-02–RF-06 encerra essa pendência: Desenvolvimento Finalizado em DEV habilita QA, e conclusão da História depende da entrada confirmada em produção. Não aplicar a condição histórica como bloqueio circular à primeira implantação em QA.

O contrato anterior exige Histórias finalizadas antes da promoção, considerando sucesso ou cancelamento. Se concluir com sucesso depender de QA/aceite, aplicar a exigência à entrada em QA cria uma dependência circular. **A correção de QA e a inclusão de DEV não revogam silenciosamente essa regra.**

A proposta discutida distingue elegibilidade técnica para entrar em QA, aprovação em QA para avançar à homologação e critérios próprios de aceite/conclusão. O instante da conclusão, o significado de promoção nesse gate e o tratamento de Histórias canceladas precisam de decisão explícita antes de implementar guardas. Cancelamento nunca autoriza incluir código cancelado no pacote.

### Garantias, adoção e backlog

- Promover os mesmos digests QA → HML → PRD, sem rebuild. Configurações de ambiente são declaradas e não podem ocultar troca de conteúdo.
- Mudança de conteúdo após fechamento gera outra candidata, nova validação em QA e novos gates/homologação. Evidências anteriores permanecem históricas.
- Implantação concluída, teste aprovado e aceite humano são fatos distintos. Falha, ausência ou efeito desconhecido não equivalem a sucesso.
- API, orquestrador e executor validam revisão/digest, autorização, idempotência, concorrência e resultado observado, pelo contrato de auditoria; botões não são a única proteção.
- Detalhar candidata/manifesto, execução de build, artefatos, implantação e validação. Tabelas, infraestrutura, contratos de execução, versionamento e recuperação ainda dependem do desenho técnico.
- Evoluir o enum e a apresentação/indicadores sem fabricar evidências históricas. A [política de métricas](metricas-releases-2026-10-22.md) deve distinguir release, candidata, implantação e validação, sem novas metas ou contagens fictícias.
- A adoção permanece no planejamento/composição em DRAFT. Este recorte é documental: não conclui UX-C05–C07, não adapta telas nem provisiona DEV ou deploys. A evidência é a documentação e a conferência de referências; não há validação de implantação por documentar o contrato.

## Registro de origem — decisão do usuário em 22/10/2026

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
