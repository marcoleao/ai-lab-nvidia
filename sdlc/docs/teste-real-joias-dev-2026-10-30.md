# Jornada real pela interface: Catálogo de Joias até DEV

30/10/2026 · laboratório `http://localhost:3310` · execução por navegador Chromium/Playwright, sem mocks. O plano de implementação foi pausado a pedido do usuário. Esta avaliação não concede OK às RAs nem altera o código do portal.

**Resultado: fluxo até DEV reprovado nesta execução. A aplicação não foi publicada.** Foram avaliados 20 cenários do portal: 12 passaram e 8 falharam. Os 28 casos de uso do catálogo ficaram bloqueados e não foram executados. [Matriz, passos, resultados e hashes](assets/joias-jornada-ui-2026-10-30/casos-e-resultado.json).

O usuário autorizou criar um Sistema do zero e conduzir os agentes reais pelo portal. Todos os comandos de negócio desta jornada são cliques, preenchimentos e confirmações na interface. Não foram usadas chamadas diretas de API, SQL, fixtures ou edição de resultados. Não foram executadas suítes de backend. As verificações técnicas disparadas automaticamente pelo fluxo do SDLC pertencem ao produto, não substituem os testes de interface solicitados.

## Contexto criado

| Item | Referência observada na interface |
| --- | --- |
| Sistema | [JOIASC — Catálogo de Joias](http://localhost:3310/systems/cmvuyxwxs000001no52u26eju) |
| Projeto | [JOIASC-CATLOG — Primeira versão do Catálogo de Joias](http://localhost:3310/projects/cmvuz2ec9000r01noyocwpx81) |
| Épico | [Gerenciar catálogo de joias](http://localhost:3310/epics/cmvuzcbou001v01noblaxtyl9) |
| História | [JOIASC-CATLOG-1](http://localhost:3310/stories/cmvuzcbp8001x01nodp2cxj2j) |
| Repositório apresentado | `sdlc/joiasc/app`, estado READY, criado automaticamente |
| Preparação 1 | `0049c67b-1161-492c-846b-26105678ab02`, impedida; posteriormente cancelada e com acompanhamento encerrado pela UI |
| Preparação 2 | `8d742bb6-8916-4e1e-8130-f447385de45d`, repetição controlada, mesmo impedimento |

O catálogo começa vazio. O escopo inclui joias, categorias e coleções; cadastro, consulta, pesquisa/filtros, edição e arquivamento/reativação; campos completos, SKU único, preço não negativo, fotos por URL e disponibilidade. Para a primeira versão no perfil suportado, foi explicitada persistência local por navegador e sua limitação, sem banco compartilhado ou checkout. Isso não representa persistência multiusuário de produção.

## Método de avaliação da próxima ação

Uma avaliação qualitativa, por um operador, não é pesquisa estatística de usabilidade. A escala é: **5**, próxima ação evidente no contexto; **4**, clara com pequena leitura; **3**, exige procurar em outra área; **2**, depende de inferência ou orientação imprecisa; **1**, impedimento sem caminho efetivo de resolução. Erros do roteiro de automação não entram na nota do produto.

| Etapa observada | Nota | Evidência |
| --- | --- | --- |
| Criar Sistema | 4/5 | CTA, formulário e confirmação claros; sigla exige exatamente seis letras. |
| Criar Projeto | 4/5 | Ação contextual explícita e destino preservado. |
| Encontrar assistente e mudar Sistema → Projeto | 3/5 | Conversas oferece acesso; é necessário sair da conversa, criar Projeto e abrir outro contexto, repetindo requisitos. |
| Entrevista e perguntas pendentes | 2/5 | Uma resposta anunciou perguntas sem mostrá-las; as duas estavam apenas no diálogo Resumo. |
| Recuperar resposta inválida | 3/5 | Recuperação preservou a mensagem; falha expôs JSON extenso na conversa e exigiu novo envio. |
| Revisar e criar planejamento | 3/5 | Escopo reduzido indevidamente a busca/filtros na primeira proposta; revisão humana e nova geração necessárias. Confirmação dos oito itens é clara. |
| Preparar aplicação | 1/5 | Dois pedidos padrão recusados por incompatibilidade de perfil, sem solução disponível para o usuário. |
| Recuperar preparação impedida | 1/5 | Verificação orienta aguardar/retomar fila apesar de estado impedido; nova tentativa reproduz a falha. |
| Orientação do assistente sobre impedimento | 1/5 | Sugeriu selecionar outro modelo/ajustar perfil; essas opções não aparecem no painel utilizado. Não resolveu a operação. |
| Identificar próximo passo da História | 5/5 | “Continuar em Execução” leva ao painel focado, com “Preparar especificação”. |
| Revisar Gateway e destino | 5/5 | Requisitos, plano técnico, commit e autorização explícita estão disponíveis; a codificação foi enfileirada pela UI. |
| Tratar falha da codificação | 2/5 | A causa “contexto maior que 15000 caracteres” aparece, mas o escopo havia sido aceito no planejamento e no Gateway. Falta antecipar o limite e conduzir uma divisão segura. |
| Resolver a falha em conversa | 1/5 | Primeira rodada falhou; a segunda respondeu com orientação externa, texto incompleto e pedido de dependências sem justificar sua necessidade. |
| Entender impedimento do destino DEV | 4/5 | Explica falta do contrato integrado, perfil aceito e oferece link ao repositório; confirmação permanece bloqueada. |
| Consultar construção/publicação DEV | 3/5 | Impedimentos são corretos nas prévias, mas aparecem quatro ações de etapas ainda sem evidência; é necessário abrir cada conferência para descobrir o que falta. |

Não há nota de facilidade para merge, construção, implantação ou uso do catálogo enquanto essas etapas não forem efetivamente alcançadas.

**Avaliação geral da clareza da próxima ação: 2/5 — difícil para alguém de negócio.** É um julgamento da jornada observada, não a média aritmética das notas. A navegação funciona melhor no foco da História e no Gateway; perde fluidez quando a preparação ou o agente falha. O caminho principal termina em instruções técnicas que o usuário não consegue resolver pelos controles oferecidos.

## Problemas reproduzidos

1. **Bloqueador funcional — preparação padrão recusada.** Em Sistema → Conversas → Assistente → Preparar aplicação → Conferir preparação Node 24/React, revisar os dez arquivos e confirmar. O pedido passa a “Preparação impedida” antes da escrita. “Conferir próxima etapa” apresenta **“A preparação não corresponde ao perfil técnico autorizado.”** O painel identifica `node24-react-starter-v2`. Reconciliar não resolve; cancelar/encerrar o acompanhamento e criar novo pedido produz o mesmo impedimento. Causa interna não investigada por backend nesta avaliação.
2. **Orientação genérica e contraditória.** O resultado principal manda conferir base/repositório/GitLab; o botão Verificar resultado responde “Aguarde o executor ou retome a fila antes de consultar o efeito”. Não existe um caminho contextual de correção do perfil. Não se deve atribuir a falha a permissões GitLab ou ao tipo do catálogo sem evidência.
3. **Assistente sugere controles ausentes.** Ao relatar o erro, a resposta recomendou trocar modelo, escolher modelo com banco ou ajustar perfil. O fluxo usado oferece um modelo fechado e não apresenta essas opções. A conversa precisa refletir capacidades/ações reais e encaminhar impedimentos de plataforma.
4. **Formato inválido da resposta.** A conversa do Projeto exibiu JSON integral e “O modelo não conseguiu consolidar a resposta e o resumo da entrevista no formato esperado”. A recuperação funcionou pelo botão disponível; não houve alteração de resultado do agente.
5. **Perda de escopo na proposta.** Apesar do resumo mencionar CRUD, a primeira proposta gerou apenas busca/filtros. Após feedback pela conversa e nova geração, o agente incluiu o ciclo do catálogo. A revisão humana pela UI tornou explícitos os doze critérios completos antes de criar os itens; não foi editado código ou resultado de execução.
6. **Perguntas escondidas no Resumo.** A resposta do Projeto anunciou uma rodada de perguntas sem contê-las na conversa. O Resumo continha duas questões que bloqueavam gerar a proposta.
7. **Texto de outro domínio.** A preparação genérica diz “não cria cursos, pedidos”, mesmo neste Sistema de joias. Isso prejudica a percepção de contexto.
8. **Limite de contexto descoberto depois do Gateway.** O agente preparou a especificação com doze critérios e seus testes; a interface permitiu aprová-la e enfileirou a codificação. A Tarefa e a História passaram a informar **“Contexto maior que 15000 caracteres. Reduza o escopo desta História.”** O limite deveria ser tratado antes de autorizar uma execução que não consegue iniciar com o contexto montado. Esta avaliação não identificou internamente qual conteúdo ocupa o limite.
9. **Conversa de recuperação sem resolução operacional.** A primeira rodada sobre o contexto falhou com mensagem genérica. Uma nova mensagem mais curta recebeu uma resposta marcada como SUCCEEDED, mas ela disse que o portal não estava disponível para interação direta, sugeriu Jira/Trello, terminou incompleta e passou a pedir autorização para adicionar dependências sem explicar a relação com a divisão do escopo. Não foi concedida essa autorização apenas para avançar. O sucesso da rodada não foi contado como resolução do impedimento.

## Evidência e reprodução

Capturas em [assets/joias-jornada-ui-2026-10-30](assets/joias-jornada-ui-2026-10-30/). A sessão registra ações por seletores visíveis e snapshots da interface, sem inspeção de corpos de respostas da API. O roteiro e as evidências brutas ficam separados dos dados de negócio. As falhas de seletor/espera do próprio roteiro são preservadas, sem classificá-las como defeitos do portal.

## Estado final e limites da evidência

O Sistema, Projeto, Épico, História e seis Tarefas foram criados pela interface e permanecem disponíveis. A História ficou em **CODING / Aguardando sua orientação**, com a especificação preservada e aprovação do Gateway registrada. A preparação 2 permanece impedida. Não há merge, artefato ou publicação DEV confirmados nesta jornada. As prévias da construção e da publicação recusaram corretamente continuar sem as respectivas evidências.

Os 28 casos registrados cobrem estado vazio; categorias/coleções; cadastro; obrigatórios, SKU e preço; detalhes/fotos; pesquisa/filtros; edição/cancelamento; arquivamento/reativação; recarga; teclado e mobile. Todos estão explicitamente **BLOCKED**, não aprovados nem reprovados quanto ao comportamento funcional da aplicação. Não existe URL do catálogo DEV a oferecer como entrega pronta.

São 65 interações concluídas registradas e 35 capturas, incluindo evidências de falhas do próprio roteiro. Foram inspecionadas capturas e estados em 1440 e 390 pixels. Não houve overflow horizontal nos recortes mobile conferidos; não se afirma conformidade integral de acessibilidade ou teste de todos os navegadores.

Uma leitura concorrente do arquivo de comandos interrompeu o driver de navegador (`ENODATA`); o comando pendente era apenas navegação/consulta. O driver foi corrigido e reiniciado, e o estado real foi reaberto pela interface, sem repetir comandos de negócio. Essa falha e os erros de seletor/espera do roteiro não entram nos defeitos ou notas do produto. A cobertura de vídeo da primeira sessão é parcial; não é anunciada gravação integral contínua. Jornal bruto, ações e vídeos ficam em `sdlc/portal/test-results/user-journeys/joias-20261030`, separado do relatório. O arquivo de ações é evidência para reprodução assistida, não uma suíte que possa ser reexecutada cegamente contra estes mesmos cadastros.

## Prioridades antes de retomar o plano

1. **P0 — corrigir e validar a preparação do perfil padrão em um Sistema realmente novo.** A causa interna exige investigação própria; não atribuir ao GitLab, ao catálogo ou ao usuário sem evidência. Repetir o fluxo pela UI até estrutura integrada e destino DEV preparado.
2. **P0 — tratar orçamento de contexto antes do Gateway.** Planejamento e especificação precisam propor Histórias que o executor consiga consumir, mantendo requisitos e rastreabilidade. Oferecer divisão assistida pelo portal e conferir a elegibilidade antes da autorização. Não resolver apenas aumentando contagens ou reenviando o mesmo pedido.
3. **P1 — tornar a recuperação executável no contexto.** Mensagem deve identificar impedimento, responsável, ação disponível e como verificar a resolução. O assistente deve referir os controles e capacidades entregues, preservando o usuário dentro do portal; pedido de novas dependências exige necessidade e impacto explícitos.
4. **P1 — preservar escopo e tornar saídas inválidas recuperáveis.** Perguntas bloqueadoras visíveis na conversa, proposta comparável ao escopo consolidado e resposta incompleta/fora de formato qualificada sem tratar SUCCEEDED como solução de negócio.
5. **Retomar este mesmo teste até o resultado real.** Corrigir os bloqueios, concluir código/revisões/merge/build/publicação e só então executar os 28 casos do catálogo pelo navegador. O acervo de joias não será preenchido diretamente no banco ou por chamadas de API.

A RA-15 e as próximas implementações de releases permanecem pausadas a pedido do usuário. Esta execução não altera o código do portal, a infraestrutura da aplicação, resultados de agentes ou aplicações anteriores para produzir uma demonstração bem-sucedida.
