# UX da fundação do Portal SDLC

Data: 20/10/2026. Parecer de desenho do agente com perfil de User Experience para o primeiro incremento. Referências: [plano](plano-portal-sdlc-2026-10-20.md), seções de hierarquia e UX; [especificação](SPEC_PORTAL_SDLC_AI.md), seções 11, 12 e 14. Este documento define recomendações implementáveis; não representa revisão visual de telas já executadas.

## Jornada principal

O usuário deve conseguir construir **Sistema → Projeto → Épico → História → Tarefa** sem conhecer a infraestrutura. A aplicação inicia vazia e cada criação é explícita. Não oferecer botão de preenchimento de exemplo, aplicação sugerida pronta ou execução automática ao salvar.

1. A página inicial apresenta “Seu SDLC começa com um Sistema”, explica em uma frase a hierarquia e oferece **Criar primeiro Sistema**. A prontidão das integrações aparece em bloco separado com verificações reais ou indicação de indisponibilidade. Não exibir KPIs ilustrativos.
2. Criar Sistema abre formulário curto. Após salvar, abrir o detalhe do Sistema e oferecer **Criar projeto**.
3. Criar Projeto mantém o Sistema visível e fixo no formulário. Após salvar, abrir o Projeto, mostrar **AWAITING APPROVAL** e oferecer **Criar épico**. Aprovação é ação separada e só aparece quando a política e a autorização estiverem implementadas.
4. Criar Épico mantém Sistema e Projeto identificados; abrir o Épico em **TO DO** e oferecer **Criar história**.
5. Criar História solicita título e descrição; abre a História em **SPECIFICATION**, com descrição editável e **Criar tarefa**. Não iniciar pipeline implicitamente.
6. Criar Tarefa abre seu detalhe em **TO DO**, com link claro de retorno à História. “Salvar e criar outra” é secundário e conserva o pai.

Uma integração indisponível deve informar qual ação depende dela. Falha de provisionamento precisa permanecer visível como condição técnica e permitir nova tentativa idempotente, sem apresentar repositório como existente nem induzir o usuário a criar um Projeto duplicado. Indisponibilidade de LLM não deve impedir planejamento local se o contrato da API permitir essa operação.

## Estrutura das telas

Cabeçalho global: identidade do Portal SDLC e persona atual. Navegação lateral com texto e ícone; no primeiro incremento, publicar apenas destinos funcionais. A área principal contém breadcrumb, título, badge de status, descrição e uma ação primária contextual. Evitar duas ações com igual peso competindo no mesmo bloco.

O breadcrumb usa nomes reais e identifica os tipos, por exemplo **Sistemas › Sistema: Vendas › Projeto: Atendimento › Épico: Cadastro › História: Clientes**. Todos os ancestrais são links; a página atual usa `aria-current="page"`. Nomes longos podem ser abreviados visualmente, mantendo o nome completo acessível. IDs internos não substituem nomes.

Cada detalhe mostra seus filhos imediatos em tabela ou lista: título/chave como link, status em texto e uma coluna com contagem de filhos quando disponível. O detalhe de História mostra suas Tarefas. Sempre oferecer um link de retorno ao pai, além do breadcrumb. Preservar contexto e filtros quando o usuário retorna; atualização da página e link direto devem abrir o mesmo item.

Campos obrigatórios devem estar marcados por texto; mostrar rótulo permanente e erro junto ao campo. Nome/chave/descrição e runtime devem seguir o contrato de dados; não inventar obrigatoriedade adicional. O pai contextual é visível e não exige nova seleção. Manter os valores preenchidos em erros de validação ou falha de rede. Durante envio, impedir submissão duplicada e comunicar progresso; após salvar, mover foco para o título da página criada e anunciar a confirmação.

## Processo visual desde a fundação

Usar duas representações explicitamente distintas:

- **Hierarquia:** faixa conectada “Sistema → Projeto → Épico → História → Tarefa”, destacando o nível atual. Significa relação entre itens, não progresso de execução. Cada nível ancestral é navegável; descendentes sem seleção não devem apontar para itens arbitrários.
- **Ciclo da História:** sequência dos status definidos abaixo, com etapa atual destacada e texto “Pipeline ainda não iniciado” quando não houver execução. Uma etapa futura não deve parecer executada ou aprovada. A sequência pode ser somente leitura neste incremento.

Não desenhar o ciclo inteiro como uma única barra de porcentagem: nove status não equivalem a nove parcelas iguais de trabalho. Não usar um Kanban de nove colunas como navegação principal no primeiro incremento; a lista de histórias e o detalhe preservam melhor a compreensão da hierarquia.

Quando a execução estiver disponível, manter os seis estágios e os gates G1/G2/G3 separados dos nove status da História. Gates humanos usam losango e rótulo de decisão humana; Code Review automático usa escudo e rótulo de decisão automática. O estágio atual, próximo passo e decisão pendente aparecem em texto junto ao diagrama. Selecionar um estágio abre painel de detalhes sem perder a História nem a posição no processo. Neste incremento, não habilitar “Iniciar pipeline” se a ação ainda não existir: informar “Execução de agentes será disponibilizada em uma próxima entrega”.

## Vocabulário e semântica

| Nível | Status exibidos, exatamente |
| --- | --- |
| Projeto | AWAITING APPROVAL / APPROVED |
| Épico | TO DO / APPROVED / DOING / DONE |
| História | SPECIFICATION / APPROVED / CODING / CODE REVIEW / SECURITY SCAN / TESTING / UAT / PRODUCTION / COMPLETED |
| Tarefa | TO DO / DOING / DONE |

Status permanecem em inglês; instruções, botões, títulos e mensagens ficam em PT-BR. Explicar UAT como Homologação em ajuda curta. Sistema usa os estados reais do contrato existente traduzidos para inglês; não inventar novo ciclo. Falha, bloqueio e espera são condições técnicas separadas, também em inglês, acompanhadas de motivo em português. Não apresentar seletor livre de status de História que permita simular execução ou contornar gates.

## Acessibilidade e leitura

Texto e ícone acompanham a cor de cada estado; cinza não pode tornar o conteúdo ilegível. Usar contraste AA, foco visível, botões e links nativos, cabeçalhos semânticos, rótulos de formulário associados e região `aria-live` para retorno das mutações. Breadcrumb usa `nav` com nome acessível. Todo diagrama possui alternativa textual ordenada equivalente. Setas decorativas não recebem foco.

Em 1280 px, manter ações e contexto visíveis sem rolagem horizontal da página. Em 768 px, permitir que breadcrumbs e sequência se reorganizem em linhas ou lista vertical. Tabelas podem ter rolagem própria quando necessário. Não exigir arrastar nós para navegar nem depender de hover para explicar ações. Respeitar redução de movimento; estados pendentes não dependem de animação.

## Revisão do primeiro incremento

| Critério verificável | Resultado esperado |
| --- | --- |
| Instalação vazia | Nenhum dado de negócio; ação de criar Sistema identificável sem procurar em menus. |
| Percurso de criação | Criar os cinco níveis pela interface, sem trocar ou redigitar ancestrais. |
| Localização | Em cada detalhe, identificar tipo, nome, pai e ação seguinte; voltar a qualquer ancestral. |
| Sem execução implícita | Salvar História não cria pipeline, código, pacote ou deploy. |
| Estado inicial | Projeto AWAITING APPROVAL; Épico TO DO; História SPECIFICATION; Tarefa TO DO. |
| Sem status fabricado | Não marcar etapas futuras como concluídas nem permitir aprovações sem política implementada. |
| Erros recuperáveis | Falha de validação preserva entrada; falha de rede não duplica item e oferece retorno claro. |
| Persistência de contexto | Recarregar ou abrir link direto mantém item e breadcrumb corretos. |
| Teclado e responsividade | Percurso completo sem mouse; foco previsível; leitura funcional em 768 px. |
| Transparência do incremento | Funções futuras estão descritas sem botões que aparentem funcionar. |

Problemas que impeçam criar a hierarquia, entender o item atual ou distinguir planejamento de execução bloqueiam o aceite. Após a implementação, registrar em evidência separada os testes realmente realizados e a revisão das telas pelo agente de UX. O ensaio humano deverá pedir ao usuário que escolha seu próprio domínio e crie a hierarquia, sem roteiro que forneça dados prontos.

## Implementação inicial e revisão estática

As telas em `sdlc/portal/apps/web` concretizam a jornada em páginas de detalhe com breadcrumb, listas de filhos, formulário contextual, edição e persona selecionada explicitamente. Ações de aprovação de planejamento identificam seu propósito; transições de tarefas ficam restritas aos três valores definidos. O ciclo da História apresenta nove status e uma explicação de indisponibilidade da execução, sem botão que simule pipeline. Provisionamento GitLab é uma ação explícita e não acompanha carregamento de página. A criação reutiliza a chave de idempotência ao repetir envio do mesmo formulário após falha de transporte.

A revisão estática de UX verificou ausência de dados fictícios, distinção entre hierarquia e ciclo de execução, rótulos ingleses incluindo **TO DO**, retorno ao pai, manutenção de formulário em erro, indicação de item indisponível e estilos de foco/contraste. Esta revisão não substitui execução no navegador, teste de teclado ou aceite humano; esses resultados devem ser anexados pela integração da entrega. A apresentação de `data` técnica do GitLab está recolhida sob detalhes e deverá evoluir para resumo estruturado quando o contrato de provisionamento estiver consolidado.

### Ajustes de contrato na revisão integrada

Todas as mutações enviam chave de idempotência; tentativas com mesmo método, corpo, persona e destino mantêm a chave em erro de transporte. Os formulários de edição conservam a versão original enquanto a página recebe atualizações discretas a cada cinco segundos. O polling não fecha o formulário nem fornece dados fictícios. Personas de planejamento são Administrador, Product Owner e Arquiteto; aprovação é reservada aos dois primeiros, e o Épico informa quando o Projeto precisa ser aprovado antes.

Tarefas não oferecem saltos inválidos: TO DO permite DOING; DOING permite TO DO ou DONE; DONE exige justificativa de pelo menos dez caracteres para reabrir como DOING. Arquivamento usa diálogo modal nativo com confirmação, explica a inclusão dos descendentes e a preservação do GitLab. O resumo GitLab mostra condição, mensagem e link real; a criação humana pode disparar o worker de provisionamento e o botão serve apenas para nova tentativa em falha/configuração ausente. Histórico mostra ator e timestamp reais.

### Revisão estática final antes do ensaio em navegador

A escolha explícita de persona agora persiste somente na sessão do navegador e é restaurada após validação contra o catálogo retornado pela API. Isso permite criar os cinco níveis em sequência sem repetir a seleção a cada abertura. Nome, chave e descrição seguem os limites contratuais (120, chave de 2–12 caracteres maiúsculos iniciada por letra, 4000). Ambientes do Projeto mostram o estado retornado, inclusive NOT DEPLOYED e ausência de versão, sem fabricar links. O caminho GitLab usa gitlabGroupPath.

Atualizar dados após conflito mantém o rascunho e informa que a revisão do contexto mais recente deve preceder novo envio. Seletores estáveis create-item, empty-create-item e edit-item distinguem ações repetidas no teste automatizado; formulário possui nome acessível e arquivamento usa diálogo nativo com título. Transições avançadas de Épico ficam para um incremento posterior; aprovação e leitura dos seus estados já estão disponíveis. Build e TypeScript passaram na integração antes destes ajustes; repetir após a alteração, seguido do percurso real em navegador.

## Revisão visual das capturas do ensaio Chromium

O agente de UX inspecionou as capturas reais `.prepared/story-desktop.png` (1440 px) e `.prepared/story-tablet.png` (768 px). A integração informou aprovação do percurso automatizado: criação dos cinco níveis, aprovação de Projeto/Épico, tarefa DOING/DONE, retorno por breadcrumb, recarga e ausência de overflow global. Esses resultados foram recebidos da integração; esta revisão visual não executou novamente o ensaio.

**Achados confirmados nas imagens:** título, status atual, persona, ação Criar tarefa e retorno ao Épico possuem hierarquia visual clara. Breadcrumb mantém os ancestrais identificáveis nas duas larguras. O ciclo explicita NOT STARTED e não aparenta executar agentes. Histórico registra ações reais e identidade do ator. Não foram observados controles sobrepostos nas capturas.

**Problema que bloqueia a clareza do processo em tablet:** a faixa horizontal cortava TESTING, UAT, PRODUCTION e COMPLETED sem pista visual suficiente de continuidade. O código foi ajustado para sequência vertical conectada em larguras até 1050 px, preservando as nove etapas visíveis na leitura da página; em desktop, o texto dos nós aumentou de 9 para 11 px. A resolução deve ser confirmada em nova captura a 768 px antes de considerar encerrado este achado. Foram corrigidos também o gênero do estado vazio de História/Tarefa e os títulos de eventos do histórico, agora em português.

**Limites da revisão:** imagem estática não comprova sequência de foco, contraste calculado, leitor de tela ou comportamento do diálogo. O uso de elementos nativos, foco CSS visível e texto equivalente ao diagrama foi verificado no código, mas não equivale a certificação de acessibilidade. O próximo ensaio automatizado deve confirmar a nova sequência vertical e ausência de overflow; o ensaio humano pode aguardar a entrega integrada.

### Confirmação visual após correção

O agente de UX reinspecionou as duas capturas atualizadas após novo build e ensaio Chromium informados pela integração. Em 768 px, o ciclo agora apresenta as nove etapas completas em sequência vertical conectada, incluindo TESTING, UAT, PRODUCTION e COMPLETED, sem cauda horizontal oculta. Em 1440 px, a sequência horizontal continua inteira e os rótulos estão maiores e legíveis. O estado atual permanece destacado por texto, contorno e cor. O achado de clareza do processo em tablet está **resolvido**.

Os títulos de eventos em português e o estado vazio “Nenhuma tarefa criada” também foram confirmados visualmente. Não há bloqueio visual remanescente observado nestas capturas para o primeiro incremento de planejamento. A integração confirmou novamente o percurso E2E, ausência de overflow em 768 px e visibilidade das nove etapas. A aprovação visual não amplia o escopo para execução de agentes, teclado ou leitor de tela: a avaliação completa dessas interações continua não demonstrada por estas imagens.
