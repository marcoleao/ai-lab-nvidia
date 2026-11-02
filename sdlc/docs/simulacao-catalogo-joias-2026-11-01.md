# Simulação humana — Catálogo de Joias Aurora

Continuação posterior: [jornada DEV com correção geral do executor, MR !2 e novos impedimentos](simulacao-catalogo-joias-dev-2026-11-01.md). Os resultados e 52 checkpoints abaixo preservam a situação da primeira rodada.

**Resultado da rodada, 01/11/2026, 20:35–20:55, America/Sao_Paulo:** Sistema, Projeto, dois Épicos, cinco Histórias com especificações e trinta Tarefas registrados. Uma História escolhida passou pelo Gateway de Especificação. Sua codificação falhou duas vezes antes de publicar. A release foi composta com essa única História e permanece OPEN em DEV, bloqueada na conferência para QA. **Não houve implantação em DEV nem em QA da funcionalidade. O objetivo de chegar com a release a QA não foi atingido.**

O roteiro foi executado pela interface real do Portal, com navegador automatizado em 1440 × 1000 e verificações dirigidas em 390 × 844. Cliques, preenchimento e personas do LAB representam as decisões da simulação autorizada. Não foram usados mocks, SQL, APIs chamadas diretamente, alterações externas do código produzido ou substituição de resultados dos agentes. Os cadastros de planejamento são reais e permaneceram disponíveis. O Sistema Hello World anterior não foi alterado.

| Registro | Conteúdo / fonte |
| --- | --- |
| Sistema | [AURORA · Catálogo de Joias Aurora](http://localhost:3310/systems/cmvygxn2f000001mlv3v8fzwx) |
| Projeto | [AURORA-CATJOI · Catálogo inicial e gestão de joias](http://localhost:3310/projects/cmvygy9p4000d01mlly5c7fij) |
| Especificação de produto | Descrições de Sistema/Projeto e [entrevista de planejamento](http://localhost:3310/assistant?system=cmvygxn2f000001mlv3v8fzwx&project=cmvygy9p4000d01mlly5c7fij), com proposta aplicada na revisão 2 e complemento humano |
| Épico 1 | [Gestão de joias](http://localhost:3310/epics/cmvyh5z84001n01ml2fatinsa) — cadastro, edição e listagem |
| Épico 2 | [Consulta e descoberta do catálogo](http://localhost:3310/epics/cmvyh7dh8003f01mlkgb644dy) — pesquisa/filtro e detalhe |
| História escolhida | [AURORA-CATJOI-1 · Cadastro básico de joia](http://localhost:3310/stories/cmvyh5z8e001p01ml2qgnhqry/execution) — onze critérios, plano técnico e testes mapeados; G1 aprovado |
| Release | [REL-2 · Aurora 0.1.0 — Cadastro de joia](http://localhost:3310/releases/cmvyh41xk001j01mlqmknc9jj) — composição salva na revisão 2 com uma História |
| Repositório | [sdlc/aurora/app](http://localhost:3180/sdlc/aurora/app) — MR !1 contém apenas preparação técnica; integrado no commit `147902ee2aa7a99bb3661b55fba5a15637a625d7` |

A entrega escolhida cadastra código único manual, nome, categoria, material e preço positivo, confirma em lista e persiste no navegador após recarga. A opção por React/localStorage é uma decisão do piloto registrada no planejamento. Fotos, login, backend, carrinho, pagamento e estoque ficam fora do recorte. Edição, listagem completa, pesquisa/filtro e detalhe permanecem no backlog e não receberam autorização de execução.

| História | Especificação registrada | Tarefas | Situação da rodada |
| --- | --- | --- | --- |
| [1 · Cadastro básico](http://localhost:3310/stories/cmvyh5z8e001p01ml2qgnhqry?tab=specification) | Revisão 2 pelo agente, depois da revisão humana da proposta; onze critérios e onze casos de teste | 6 | Duas tentativas de código FAILED; registro auxiliar da conversa WAITING INPUT |
| [2 · Edição](http://localhost:3310/stories/cmvyh5za9002301mlieadbjnl?tab=specification) | Proposta aplicada; sete critérios | 6 | SPECIFICATION; sem execução |
| [3 · Listagem](http://localhost:3310/stories/cmvyh5zbv002h01ml22mo99a6?tab=specification) | Proposta revisada/aplicada; oito critérios | 6 | SPECIFICATION; sem execução |
| [4 · Pesquisa/filtro](http://localhost:3310/stories/cmvyh7lft003h01mlcz3dmhcq?tab=specification) | Revisão humana 1; sete critérios e dependência interna pendente da listagem | 6 | SPECIFICATION; sem execução |
| [5 · Detalhe](http://localhost:3310/stories/cmvyh8hiu003z01mlp4yg6rzn?tab=specification) | Revisão humana 1; seis critérios e dependência interna pendente da listagem | 6 | SPECIFICATION; sem execução |

Cada História possui Codificação, Teste em DEV, Revisão de Código, Revisão de Segurança, Teste em QA e Merge de Código. O [inventário conferido pela interface](assets/simulacao-catalogo-joias-2026-11-01/inventario.json) contém as trinta identidades/URLs. As Histórias do backlog ainda não possuem plano técnico pronto para G1, nem isso foi declarado.

## Tabela do percurso e das verificações

Os 52 checkpoints abaixo agrupam passos observados desta sessão; não representam 52 casos de regressão automatizada nem aprovação funcional da aplicação. “Passou” refere-se ao comportamento específico descrito. As consultas de gates indisponíveis podem passar como navegação enquanto a entrega permanece bloqueada. A [projeção cronológica segura](assets/simulacao-catalogo-joias-2026-11-01/navegacao.json) registra 84 registros do controlador, com 36 URLs finais distintas, com horários, operações observadas e erros do controlador. Um registro pode agrupar vários cliques e destinos intermediários; a contagem de URLs finais não representa todos os acessos intermediários nem outro total de casos de teste.

Os identificadores numéricos de evidência apontam para os arquivos `.png`/`.txt` locais de `sdlc/portal/test-results/regression/joias-jornada-20261101/`. Capturas selecionadas foram preservadas em `docs/assets/simulacao-catalogo-joias-2026-11-01/`, vinculadas ao fim deste registro.

| ID | Percurso / teste | Esperado | Resultado observado | Situação / evidência bruta |
| --- | --- | --- | --- | --- |
| J01 | Abrir Visão geral | Portal disponível e indicadores consultáveis | Página carregada; inventário existente preservado | Passou · `1793576119109` |
| J02 | Persona Ana → Sistemas | Listagem, recorte, ordenação e paginação inferior | 1 Sistema anterior; filtros recolhidos e paginação no rodapé | Passou · `1793576138113` |
| J03 | Sistemas → Criar sistema | Formulário com nome, sigla de 6 letras e descrição | Campos rotulados; Salvar/Cancelar na faixa superior | Passou · `1793576146475` |
| J04 | Salvar AURORA | Criar e abrir Sistema novo | Sistema ACTIVE, sem Projetos; redirecionamento automático | Passou · `1793576168812` |
| J05 | Criar Projeto CATJOI | Projeto vinculado ao Sistema | Projeto criado com descrição/escopo do MVP | Passou · `1793576186309` |
| J06 | Assistente → selecionar Sistema/Projeto | Fixar contexto sem iniciar geração | Seleção preservada na URL, conversa vazia | Passou · `1793576211805` |
| J07 | Enviar requisitos | Agente real, com fila e resposta identificadas | Pedido registrado; resposta com duas perguntas sobre código e campos | Passou · `1793576226678`, `1793576275159` |
| J08 | Sistema → Repositório | Provisionamento automático concluído | Grupo/repositório READY em `sdlc/aurora/app` | Passou · `1793576236544` |
| J09 | Conferir preparação Node 24/React | Prévia não executar escrita | Base main/SHA e 10 arquivos propostos; confirmação desabilitada antes de motivo/aceite | Passou · `1793576243886` |
| J10 | Expandir arquivos técnicos | Conteúdo e digest revisáveis | Dez arquivos lidos: contrato, Dockerfile, build/teste, servidor e base React | Passou · `1793576258247` |
| J11 | Confirmar preparação técnica | Pedido separado da integração | Solicitação enviada; integração confirmada posteriormente em J14 | Passou · `1793576269165` |
| J12 | Sair/retomar entrevista | Conversa e pedido persistirem | URL original recuperou a resposta concluída | Passou · `1793576275159` |
| J13 | Responder perguntas e fixar escopo | Dois épicos/cinco histórias planejados; só cadastro executado | Resposta concluída; lacuna da proposta registrada em J19 | Passou · `1793576318057`, `1793576384722` |
| J14 | Prévia da próxima etapa da preparação | Liberar Draft e integrar em decisões separadas | MR !1 com validação técnica; Draft liberado e integração confirmada no commit `147902ee2aa7a99bb3661b55fba5a15637a625d7` | Passou · `1793576368719`, `1793576376342`, `1793576400773` |
| J15 | Consultar contrato integrado | Ler a fonte efetiva, sem autorizar build/deploy | Estrutura e três entradas conferidas, unidade web/Node 24 | Passou · `1793576400773` |
| J16 | Recuperar recebimento de integração | Usar a mesma solicitação após saída de página | Reenvio do mesmo pedido, aviso resolvido; integração já confirmada | Passou · `1793576408589` |
| J17 | Sistema → Ambientes | Distinguir referências e implantação | DEV/QA/HML/PRD cadastrados, sem implantação | Passou · `1793576408589` |
| J18 | Conferir/confirmar destino DEV | Prévia e confirmação próprias | Pedido de destino enviado; recursos depois confirmados como preparados | Passou · `1793576418229`, `1793576428054` |
| J19 | Gerar proposta estruturada | Dois épicos, cinco histórias e trinta tarefas | Agente produziu um épico, três histórias e dezoito tarefas; escopo incompleto | Lacuna real do planejamento · `1793576468293` |
| J20 | Releases com Elisa → Criar | Release vazia OPEN em DEV | REL-2 criada; nenhuma candidata/implantação declarada | Passou · `1793576456111` |
| J21 | Release → Alcance da conferência | Nomear os limites de QA | Não confere HEAD, não fecha, não prepara candidata e não implanta | Limite confirmado · `1793576464790` |
| J22 | Revisar proposta | Alterações humanas e critérios preservados | Cadastro e listagem revisados, revisão 2 salva; criação exige nova confirmação | Passou · `1793576494064`, `1793576516606` |
| J23 | Aplicar proposta revisada | Criar exatamente 1 épico, 3 histórias, 18 tarefas | Plano aplicado na revisão 2, 22/22 itens consultáveis | Passou · `1793576565081` |
| J24 | História escolhida → Execução → Preparar | Preparar sem aprovar G1 | Especificação enfileirada, depois revisão 2 pelo agente | Passou · `1793576594321`, `1793576686494` |
| J25 | Projeto → criar segundo épico | Complementar o planejamento no mesmo Projeto | Épico E2 criado com contexto e escopo de backlog | Passou · `1793576611160` |
| J26 | Criar História de pesquisa | Gerar seis tarefas automaticamente | História 4 criada, seis tarefas presentes | Passou · `1793576621656` |
| J27 | Editar/salvar/aplicar especificação de pesquisa | Separar rascunho de revisão vigente | Sete critérios e dependência interna pendente; revisão humana 1 aplicada | Passou · `1793576652852`, `1793576663310` |
| J28 | Criar História de detalhe | Gerar seis tarefas automaticamente | História 5 criada, seis tarefas presentes | Passou · `1793576663310` |
| J29 | Aplicar especificação de detalhe | Registrar critérios e dependência sem iniciar execução | Seis critérios, revisão humana 1; listagem pendente como dependência impeditiva | Passou · `1793576680537` |
| J30 | Revisar especificação preparada do cadastro | Requisitos e testes cobrirem o escopo | Onze critérios, arquitetura, onze casos de teste e riscos visíveis | Passou · `1793576693772` |
| J31 | Gateway → revisar destino | Conferir DEV, branch e commit antes de autorizar | Main no commit `147902ee2aa7a99bb3661b55fba5a15637a625d7`; checkbox só habilitado após consulta | Passou · `1793576718996` |
| J32 | Aprovar Gateway | Enfileirar só a História escolhida | Cadastro em CODING com agente qwen-code; demais Histórias sem execução | Passou · `1793576735716` |
| J33 | Release → selecionar cadastro → filtrar detalhe | Seleção persistir fora do recorte | 1 selecionada fora do filtro; nenhuma ampliação implícita | Passou · `1793576774777` |
| J34 | Limpar filtro/ordenar nome/salvar composição | Preservar apenas a seleção original | Revisão 2 com uma História; QA bloqueada por desenvolvimento não aprovado | Passou · `1793576774777` |
| J35 | Auditoria da release | Autoria e resultados reais | Criação e composição concluídas, Elisa, contrato v2 | Passou · `1793576786640` |
| J36 | Conferir tarefas das cinco Histórias | Exatamente seis por História | Trinta tarefas, incluindo Teste em DEV e Teste em QA; sem extras ou duplicação | Passou · `inventario.json` e `inventario-historia-1.png` a `5.png` |
| J37 | Tarefa Codificação → quatro abas | Consultar execução, evidências, tentativas e conversas sem comandos | Quatro destinos acessíveis; fontes e contexto da História preservados | Passou · `tarefa-navegacao.json` |
| J38 | Execução em 390 × 844 | Dois quadros acessíveis sem transbordo horizontal | Largura do documento 390; falha da primeira tentativa identificada | Navegação passou; agente falhou · `1793576849036` |
| J39 | Consultar diagnóstico da primeira falha | Causa registrada, sem inventar código publicado | Planejador de UI propôs resultado sem referência no escopo/interface; teste recusado antes da correção | Bloqueio real · `1793576865769` |
| J40 | Retomar correção técnica | Mesma execução/base/G1, nova tentativa | Pedido aceito, segunda tentativa iniciada | Passou · `1793576874405` |
| J41 | Consultar resultados IA antes de DEV | Não iniciar teste nem emprestar evidências | Nenhuma bateria; iniciar desabilitado, pré-requisitos explícitos | Passou · `1793576884795` |
| J42 | Tentativas → primeira falha → recarga | Histórico não substituir situação atual | FAILED histórico somente leitura, cabeçalho atual Em processamento; URL preservada | Passou · `1793576899708`, `1793576907872` |
| J43 | Retornar à atividade atual | Sair da tentativa histórica | Retorno disponível e executado; sem escrita | Passou · `1793576922242` |
| J44 | Tarefa Teste em QA → consultar QA | Mostrar release e pré-requisitos, sem execução | REL-2 vinculada, nenhuma candidata/implantação; promoção indisponível | Passou como consulta; entrega bloqueada · `1793576922242` |
| J45 | Tarefa QA → História/QA → celular/recarga/retorno | Destino na URL e contexto preservados | URL QA recuperada, documento com largura 390; retorno ao hub | Passou · `qa-mobile.png`, `1793576935419` |
| J46 | Resultado da retomada | Confirmar resultado real | Segunda falha com o mesmo diagnóstico, nenhuma publicação da História | Falhou · `1793576962709` |
| J47 | Conversar sobre etapa | Orientação sem autorizar execução | Resposta recebida: retomar com o mesmo escopo; sem causa adicional comprovada | Consulta passou; bloqueio continua · `1793576984545` |
| J48 | Conversa → consultar tentativas | Distinguir conversa de execução de código | Dois FAILED de código e terceiro registro auxiliar WAITING INPUT; eventos mostram conferência da orientação, sem implementação | Navegação passou; rótulo ambíguo · `1793577076386`, `1793577087578` |
| J49 | Conferência final da release | Conjunto real e impedimentos explícitos | 1 História, 0 Desenvolvimento Finalizado válido, 1 bloqueada; sem código publicado/capturado | Bloqueada · `1793577103178` |
| J50 | Conferência → filtro vazio → recarga → limpar | Filtro/URL não liberar QA | 0 resultados no recorte manteve 1 História bloqueada no conjunto; recarga preservou busca; limpar restaurou a linha | Passou · `1793577115295`, `conferencia-vazia-total-bloqueado.png` |
| J51 | Projeto e ambos os Épicos ao final | Conferir hierarquia completa | 2 Épicos; 3 + 2 Histórias, sem truncamento | Passou · `projeto-dois-epicos.png`, `epico-3-historias.png`, `epico-2-historias.png` |
| J52 | Voltar ao hub após consultas e conversa | Preservar estado e ação real | História CODING aguardando orientação, Retomar correção técnica disponível; build/deploy/testes sem pedidos | Passou como consulta; execução bloqueada · `1793577151351`, `final-state.json` |

## Impedimentos e observações para evolução

| ID | Achado | Consequência / próximo trabalho | Evidência |
| --- | --- | --- | --- |
| SJ-01 · bloqueador | As duas tentativas do planejador de UI foram recusadas por resultado sem referência no escopo aprovado ou interface observada. O diagnóstico visível não identifica a expectativa concreta rejeitada. | A História não publicou código. Diagnosticar o vínculo da expectativa ao requisito/interface e a recuperação do agente antes de nova tentativa. Não substituir o resultado nem reduzir critérios para simular sucesso. | [Primeiro diagnóstico](assets/simulacao-catalogo-joias-2026-11-01/08-primeiro-diagnostico.png), [segunda ocorrência](assets/simulacao-catalogo-joias-2026-11-01/09-segundo-diagnostico.png) |
| SJ-02 · bloqueador independente | Fechamento, candidata/pacote e implantação QA continuam indisponíveis. | Resolver SJ-01 e aprovar DEV será necessário, mas insuficiente para QA. Continuação depende das entregas de proveniência, fechamento/pacote e executor QA do plano incremental. | [Consulta de QA](assets/simulacao-catalogo-joias-2026-11-01/13-consulta-qa.png), [conferência final](assets/simulacao-catalogo-joias-2026-11-01/16-conferencia-final.png) |
| SJ-03 · planejamento parcial | O agente anunciou escopo completo, mas gerou apenas 1 Épico/3 Histórias em vez dos 2/5 pedidos. A proposta aceita no máximo 30 itens; o plano inteiro ocupa 37. | Complemento humano registrou E2/H4/H5 com requisitos e tarefas. Evolução proposta: informar a cobertura faltante e orientar continuação por etapas antes da aplicação. Não declarar que o agente registrou toda a hierarquia. | [Plano aplicado](assets/simulacao-catalogo-joias-2026-11-01/03-plano-aplicado.png), [Projeto completo](assets/simulacao-catalogo-joias-2026-11-01/04-projeto-dois-epicos.png) |
| SJ-04 · clareza da orientação | O Assistente operacional repetiu Retomar correção técnica, sem evidência adicional ou resolução após a falha reproduzida. | A conversa confirmou o procedimento existente e não reparou o impedimento; uma repetição idêntica não comprova recuperação. Conteúdo integral permanece na conversa da execução. | [Execução/conversa](http://localhost:3310/stories/cmvyh5z8e001p01ml2qgnhqry/execution/conversation) |
| SJ-05 · clareza das tentativas | A conversa criou um registro auxiliar listado como “Codificação · tentativa 3”, embora seus eventos mostrem apenas orientação. | A listagem pode sugerir três execuções de implementação. Distinguir finalidade auxiliar e execução de código sem reescrever os registros. Não classificar esse registro como terceira falha de codificação. | [Registro auxiliar](assets/simulacao-catalogo-joias-2026-11-01/15-registro-auxiliar-conversa.png) |
| SJ-06 · leitura / continuidade | O menu principal Assistente reabriu seleção de contexto; a URL anterior recuperou a conversa. Na Tarefa, a referência de planejamento incluiu resposta estruturada bruta extensa. | Rever continuidade do contexto e apresentação de proposta estruturada. Não foi comprovada perda de mensagem ou de rascunho. | J12 e J37; fontes completas ficam no acervo da conversa/relatório local |

SJ-01 a SJ-06 são achados desta jornada, sem correção ou migração declarada. O Portal manteve as decisões de desenvolvimento, publicação e QA separadas. Não houve alteração de implementação do Portal/agentes, modelos, configurações da plataforma ou política de gates nesta rodada.

A hipótese inicial do controlador de que uma conversa não acrescentaria linha à lista de tentativas foi refutada: o terceiro registro é auxiliar. O evento observado foi preservado e a contagem final distingue duas execuções de código e uma orientação. Outras falhas do controlador foram a rede inicial do navegador, nomes presumidos de controles, prefixo de chave do Projeto, idioma do status “Aplicada” e fechamento da prévia ao trocar a História. Foram corrigidas após ler a interface; não são apresentadas como falhas de negócio. Nenhum cadastro foi repetido por causa delas.

## Etapas que não puderam ser validadas nesta rodada

| Etapa | Situação real |
| --- | --- |
| Revisão de Código e Revisão de Segurança da História | Não alcançadas: nenhuma publicação da implementação. A prova técnica do MR !1 da estrutura não substitui esses controles. |
| MR / merge da funcionalidade | Não alcançados; o único MR confirmado é da preparação técnica. |
| Build/publicação DEV da História | Sem pedidos; somente recursos do destino DEV preparados. |
| Casos funcionais do cadastro, teclado e persistência da aplicação | Não executados: aplicação da História não publicada. Os testes de navegação/mobile do Portal não os substituem. |
| Bateria IA em DEV e aceite humano global | Não executados; consulta sem bateria e comando indisponível foram conferidos. |
| Desenvolvimento Finalizado | Sem aprovação registrada. |
| Candidata imutável / pacote versionado / implantação / testes QA | Indisponíveis na implementação corrente e também impedidos pelas fontes de desenvolvimento ausentes. A tarefa Teste em QA permanece sem conclusão. |

Não houve regressão completa, instalação/requalificação de modelos, benchmark, ensaio de carga, validação assistiva integral ou teste de múltiplas páginas com volume novo. As coleções desta jornada cabiam em uma página; só unicidade/posição e estados dos controles de paginação foram observados. Os arquivos de teste funcional da base técnica validam HTTP/build e não aprovam o cadastro.

Para retomar, use a História existente e preserve sua execução/G1 e fontes. Primeiro é necessário resolver SJ-01 pela manutenção apropriada do agente, revalidar a implementação e prosseguir pelos gates normais. Depois de DEV aprovado, a referência da composição precisará ser revisada explicitamente para capturar a publicação atual. QA continuará dependente de SJ-02. Este documento não autoriza implementação silenciosa dessas capacidades nem substitui aprovação humana posterior por resultado de chat.

## Evidências preservadas

- [Estado final seguro](assets/simulacao-catalogo-joias-2026-11-01/final-state.json), [inventário de Histórias/Tarefas](assets/simulacao-catalogo-joias-2026-11-01/inventario.json), [84 registros de navegação](assets/simulacao-catalogo-joias-2026-11-01/navegacao.json) e [manifesto SHA-256](assets/simulacao-catalogo-joias-2026-11-01/sha256.json).
- [Sistema criado](assets/simulacao-catalogo-joias-2026-11-01/01-sistema-criado.png), [contrato integrado](assets/simulacao-catalogo-joias-2026-11-01/02-contrato-integrado.png), [destino G1](assets/simulacao-catalogo-joias-2026-11-01/05-gateway-destino.png) e [História ao final](assets/simulacao-catalogo-joias-2026-11-01/18-historia-final.png).
- [Auditoria da release](assets/simulacao-catalogo-joias-2026-11-01/12-release-auditoria.png), [QA em celular](assets/simulacao-catalogo-joias-2026-11-01/14-qa-celular.png) e [filtro vazio mantendo bloqueio global](assets/simulacao-catalogo-joias-2026-11-01/17-filtro-vazio-bloqueio-global.png).

Conteúdo integral de requisitos, respostas e resultados permanece nas fontes controladas do Portal; o relatório conserva síntese, identidades e evidências de navegação. Arquivos brutos e controlador local ficam em diretórios ignorados, sem serem apresentados como trilha canônica de auditoria. Criação e composição da release foram conferidas na Auditoria do Portal, com Elisa, contrato v2 e resultado concluído.

Referências de domínio: [padrões de experiência](../portal/docs/PADROES_DE_EXPERIENCIA.md), [arquitetura](../portal/docs/ARCHITECTURE.md), [conferência de desenvolvimento](conferencia-desenvolvimento-release-v1.md) e [plano incremental de releases/ambientes](plano-incremental-releases-ambientes-2026-10-27.md). O registro não amplia a cobertura de adoção desses contratos.
