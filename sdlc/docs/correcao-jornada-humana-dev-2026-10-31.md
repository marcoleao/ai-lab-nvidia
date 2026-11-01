# Correções da jornada humana até DEV

**Resultado final, 31/10/2026, 19:19 America/Sao_Paulo:** melhorias instaladas e Hello World corrigido publicado em [DEV](http://localhost:33991). O [MR !3](http://localhost:3180/sdlc/hellow/app/-/merge_requests/3) passou por revisão/segurança/merge, construção e implantação pelos controles do Portal. Conferência direta no navegador: 21 cenários aprovados, cobrindo as nove combinações de cor/fonte em desktop e celular, reset e teclado; foco visível também confirmado. Quatro testes HTTP aprovados na implantação atual. O aceite visual separado não foi convertido em aprovação de Desenvolvimento Finalizado nem em cobertura G1 automática.

Origem: [simulação Hello World](simulacao-hello-world-portal-2026-10-31.md). O usuário autorizou corrigir e implementar o SDLC para facilitar a publicação humana em DEV. Esta fatia trata causas reproduzidas, preservando as tentativas anteriores e sem editar diretamente a aplicação produzida.

## Causa confirmada

As três tentativas chegaram ao compilador de microalterações e terminaram com `SyntaxError` do Babel durante a inspeção de `src/app.css`. CSS era tratado como JavaScript. A exceção virou UNKNOWN e o adapter descartou o diagnóstico. `qwen-code · model_wait` era o último sinal visível, não a causa. A fonte privada foi consultada somente em leitura após a simulação; não confirma timeout, OOM ou indisponibilidade do modelo.

O localizador também selecionou somente um detalhe cosmético, apesar do escopo exigir interface e estado. O perfil não oferecia a declaração pequena de componente necessária para acrescentar estado e controles.

Na qualificação sintética antes da instalação, o planejador repetiu o mesmo arquivo em dois objetivos, inclusive tratando preservação como edição. Há uma única reparação estrutural desse plano, dentro do orçamento existente e com todo o escopo aprovado; outra proposta inválida é recusada sem editar. O plano original e a reparação ficam na fonte privada, sem apagar a tentativa reprovada.

## Contratos e cobertura

| Referência | Correção | Limites |
| --- | --- | --- |
| HW-01 | CSS usa o parser CSS do esbuild. Inspeção inválida retorna recusa estruturada. Função React pequena pode receber estado/controles, preservando nome, export e trechos externos. Planejamento pode propor duas fontes distintas de uma capacidade completa. | CSS/função até 6.000 caracteres; patch combinado até dois arquivos/24 KB; reparo focado continua com uma mudança. Sem executar scripts de projeto, rede, novas dependências ou infraestrutura. HTML não é oferecido ao inspetor JS/CSS. |
| HW-02 | Conversar sobre interrupção anterior à publicação preserva a retomada técnica. Orientação factual identificada como Portal usa o marcador confirmado, sem pedir ao modelo que invente causa/próxima ação. Depois da resposta informativa, retry retorna à geração com a mesma especificação/G1. | Marcador de não publicação, escopo vigente, capacidades aprovadas e ausência de diagnóstico obrigatório de qualidade. Mudança explícita de requisitos exige revisão/Gateway. A consulta factual não reinterpreta a causa nem substitui o diagnóstico registrado. |
| HW-03 | Nova dependência exige pacote, necessidade e impacto na proposta. A UI apresenta os dados antes da autorização; o backend recusa decisão incompleta. | O modelo não concede permissão. Propostas antigas não recebem justificativas retroativas. |
| HW-04 | Especificação recebe SHA/branch e entradas observadas pelo adapter GitLab, com orientação de preservar bibliotecas, servidor e build existentes. | Não fixa React para todo Sistema; fontes limitadas são identificadas. Leitura não aprova código nem destino. |
| HW-05 | Códigos conhecidos do compilador têm projeção segura. Sem código conhecido, informa que não há causa técnica registrada em formato seguro. | Stack, fonte, prompt e segredo ficam privados. UI usa “diagnóstico técnico registrado” sem prometer informação completa. |
| HW-06 | Sincronização do teste inclui `tsconfig.json` e `security/`, também presentes no fingerprint de runtime. | Recursos próprios de regressão e banco descartável `portal_test`; nenhuma limpeza ou fixture na base humana. |
| HW-07 | Perfil de UI distingue texto, imagem, fundo da janela e família do h1. Expectativa deve ter referência no escopo; leitura sem controles usa literais observados. Fundo/fonte usam operações fechadas com expectativa congelada e replay independente. Medidas observadas de viewport/margens chegam aos perfis de implementação/reparo. | Fundo verifica cinco pontos da viewport atual, fonte confere a família computada do primeiro h1; não é comparação de todos os pixels, todos os dispositivos ou fontes binárias. Somente cor `#RRGGBB`/família limitada, sem seletor livre, escrita de estilo, DOM, armazenamento ou backend. SDK legado não recebe essas novas capacidades; adoção restrita ao perfil local de especialistas. |
| HW-08 | Objetos literais `style` têm um recorte próprio para geometria. O agente propõe somente o objeto pequeno; o compilador preserva propriedades/expressões de estado existentes e limita adições/alterações a valores de layout enumerados. Repetição de tokens confirmada pelo serviço tem diagnóstico seguro próprio. | Sem spread, métodos, chaves computadas, remoção de propriedades, novas cores/fontes, callbacks, imports ou chamadas em declarações novas. O fallback de componente completo conserva seu limite anterior. A resposta HTTP integral permanece privada; só a mensagem exata reconhecida ganha `INFERENCE_TOKEN_REPEAT_LIMIT`. |

Revisão UX por agente somente em leitura: preservar shell, painel e próxima ação existentes; diagnóstico não deve virar decisão de negócio; justificar dependências antes de pedir autorização. Foram reutilizados componentes e comandos compartilhados.

## Auditoria

Sem nova fila, tabela, migration, métrica ou ação de domínio. Produtores `EXECUTION_DISCUSSION_*`, `EXECUTION_DECISION_*`, `EXECUTION_RETRIED` e codificação mantêm recorder transacional, autoria/correlação e replay. O marcador é limpo na transação que enfileira outra tentativa; falha do recorder reverte estágio, marcador e pedido. Mudança de especificação limpa o marcador antigo e mantém novo G1. Justificativas ficam na fonte controlada da decisão, sem projeção integral no ledger.

Preparação/instalação do executor e publicação local usam os catálogos administrativos existentes, fora da base. Imagens, backup, manifesto e fontes anteriores são preservados para reversão. Nenhum resultado histórico é reescrito.

## Validação dirigida

- 23 testes Node do compilador: CSS, função com estado, recusa de renomeação/código externo, revisão/capacidade e preservação de fontes.
- 24 contratos Python de microalterações e 21 do executor: limites, recusa sem edição, diagnóstico seguro e UNKNOWN sem patch.
- 79 testes de backend em cinco arquivos: contexto, adapter, correção, fundação e especificação; mensagem/replay, preservação de G1, rollback do retry e dependência incompleta. Recibo `20261031T211649Z-fcc967`.
- 12 cenários Chromium em `validation-retry.spec.ts` e `discussion.spec.ts`, desktop/celular, conversa/recarga, decisão de negócio separada e autorização. Recibo `20261031T210030Z-873365`.
- Build de produção API/web aprovado na imagem candidata, sem rede e sem mudar dependências.
- Catálogo: 606 cenários/55 arquivos; dois novos casos. Contagem não equivale a regressão completa executada.
- Inferência real `qwen3:14b`, sem dados de aplicação: `literal-edit` e `react-provider` aprovados em `coding-live-20261031T210819Z-2bce91`; fonte estável, sem troca de configuração operacional nessa qualificação. Não representa a suíte inteira nem o aceite do Hello World. A rodada anterior `coding-live-20261031T210616Z-7bb8dd` foi reprovada e preservada.

Rodadas reprovadas preservadas: faltavam arquivos na sincronização de teste; o teste novo recarregava antes de terminar a navegação; o teste de rollback instalava o spy depois da captura do recorder pela aplicação. Preparação e roteiros foram corrigidos, sem reclassificar os resultados anteriores.

## Atualização local e retomada real

Portal atualizado para a imagem `ae3c50a36950…`, fonte `5599ae812a6d…`, com backup privado verificável `dev-qwen-browser-verified-20261030-d4759752`. As 49 tabelas foram preservadas exatamente, sem migrations pendentes. Health ready/preview e ledger administrativo sem operações pendentes ao fim da atualização. Executor atualizado para `7d4b9181ca43…`, módulos `3916f84fc720…`, backup privado `human-dev-coding-20261031T211203Z`, serviço ativo.

Na História real, a conversa manteve a retomada sem outro G1. A resposta do modelo, porém, ainda inventou falha de publicação e sugeriu preparar decisão. Esse resultado histórico foi preservado. A correção adicional usa uma orientação do Portal baseada exclusivamente no marcador confirmado para essa consulta, identificando sua autoria e sem chamada ao modelo. A decisão explícita de mudar requisitos continua usando o agente e exigindo revisão/Gateway. A atualização adicional foi publicada: imagem `8780adb83c82…`, fonte `7fe648dfea94…`, backup `dev-qwen-browser-verified-20261030-8b7f87a1`, 49 tabelas preservadas exatamente, health ready/preview e ledger sem pendências. O contrato da orientação factual foi conferido em isolamento e posteriormente observado numa interrupção real, conforme a continuação abaixo.

A retomada pelos controles do Portal gerou código e abriu o [MR !2](http://localhost:3180/sdlc/hellow/app/-/merge_requests/2), com validação do executor/navegador. Code Review e Security Scan aprovados; Draft liberado e merge confirmado pela interface. Construção do commit integrado `9c5d4eb09118f63849c0e0f6fb165ebcd6f8d45c`, imagem `sha256:5a2f39efa61d0f939e1ebf981b97ba4f22c6954fb991a2ca1b2f146aecded9da`, seguida de publicação DEV confirmada e saudável em [localhost:33991](http://localhost:33991), às 18:24. A simulação anterior mantém seu resultado histórico.

A conferência no navegador, simulando uso humano em DEV, encontrou fundo parcial: após escolher Azul claro/Georgia, o `main` ficou azul e Georgia, mas sua altura era 239,875 px e o restante da viewport continuou branco. A troca de cor/fonte estava funcional, porém o critério de cobertura da página não estava atendido. A evidência foi preservada em [captura](assets/hello-world-retomada-dev-2026-10-31/04-defeito-fundo-parcial.png). A suíte DEV disponível tem quatro casos HTTP sem vínculo a critérios G1; foi solicitada somente como verificação técnica, sem aprovar aceites de negócio. Novo ciclo aberto pela UI, defeito descrito na História e especificação revisada para cobertura completa em 1440×1000/390×844 e redimensionamento, preservando os demais critérios. Naquele momento, a correção e o aceite funcional ainda estavam em andamento. Nenhuma fonte da aplicação foi editada diretamente.

O novo ciclo real foi recusado antes de publicar: o planejador de UI copiou `R$ 0,00` de um exemplo genérico, causando uma expectativa alheia ao Hello World e um reparo indevido. O exemplo foi removido e a referência da expectativa passou a ser conferida antes de abrir o navegador e antes de qualquer reparo de aplicação. HW-07 acrescenta asserções visuais fechadas. A orientação factual de HW-02 foi então observada numa interrupção real, respondendo sem inferência e conservando a retomada: [registro](assets/hello-world-retomada-dev-2026-10-31/06-orientacao-factual.txt).

Qualificação intermediária `coding-live-20261031T213643Z-382ab6` preservada como reprovada: React escolheu uma frase narrativa inteira como texto de saída; o caso visual foi corretamente recusado por margens brancas. A leitura sem controles agora restringe a escolha aos literais observados; o navegador fornece geometria/CSS computado aos perfis de código. O teste novo de fundo também revelou margem colapsada na própria fixture sintética, corrigida no caso de sucesso com `flow-root`; o verificador continuou recusando o caso parcial. A qualificação seguinte `coding-live-20261031T214054Z-9758b6` aprovou React, preço e aparência, com fonte estável. Aparência usou a asserção de fundo e uma conferência independente de seleção, cobertura, fonte e reset. Não é certificação da suíte completa. [Recibo seguro](assets/hello-world-retomada-dev-2026-10-31/07-qualificacao-visual.json).

HW-07 passou em 20 contratos Python do operador, quatro testes Node do registro de controles e 16 ensaios Chromium reais com fontes sintéticas, incluindo recusa de fundo parcial, família incorreta e replay com outra cor. Os 24 contratos de microalterações e 21 do executor também passaram depois da inclusão das observações visuais. Executor instalado com módulos `7c92bb3a93a8…`, navegador `0c21127153f2…`, backup privado verificado `human-dev-coding-20261031T214318Z`. Portal atualizado para `b1312951b246…`, fonte `2ede21676e7e…`, backup privado verificado `dev-qwen-browser-verified-20261030-8e4a6a25`. Preservação exata das 49 tabelas, sem migration pendente, health ready/preview e ledger sem operações pendentes.

A retomada real repetiu HTTP 500 na geração do componente completo; outra retomada explícita preservou o mesmo resultado. Uma requisição isolada, sem aplicar patch ou escrever domínio, confirmou a resposta `prediction aborted, token repeat limit reached` em evidência privada `inference-20261031T215147Z`, com auditoria administrativa. Não se atribuiu a OOM ou timeout. O código voltou a tentar gerar uma função inteira para alterar poucos estilos: HW-08 oferece o objeto de estilo isolado e uma orientação de geometria baseada nas margens observadas. A qualificação intermediária `coding-live-20261031T215636Z-5a8fc3` usou esse recorte, mas foi corretamente recusada por ainda deixar margens. O perfil passou a explicitar a diferença entre margem do filho e margem do ancestral; teste e expectativa não foram relaxados. O desfecho desse ciclo está registrado no resultado final abaixo.

Após HW-08: 24 testes Node do compilador, 21 do operador Python, 24 de microalterações e 21 do executor passaram, incluindo recusa de alterar estado, inserir chamada/URL ou remover propriedade no estilo. Backend: 79 casos aprovados novamente em `20261031T215525Z-60d078`, com projeção segura do código de repetição. A qualificação `coding-live-20261031T215854Z-017bc5` aprovou os três controles, com fonte estável, asserção visual, uso do recorte de layout e conferência independente de fundo/fonte/reset: [recibo seguro](assets/hello-world-retomada-dev-2026-10-31/08-qualificacao-layout.json). Executor instalado com imagem `0a31b81bc594…`, módulos `6d8cb6c12dca…`, backup privado verificado `human-dev-coding-20261031T220059Z`. Portal final publicado na imagem `53672ae741a4…`, fonte `6cd58d3676ab…`, backup privado verificado `dev-qwen-browser-verified-20261030-25b4a710`: 49 tabelas preservadas exatamente, sem migration pendente, health ready/preview, ledger sem operações pendentes. [Metadados seguros das publicações](assets/hello-world-retomada-dev-2026-10-31/09-publicacoes-portal.json). A correção real foi retomada com o mesmo G1; o desfecho está registrado no resultado final abaixo.

## Adoção e backlog

A última tentativa do recorte de estilos foi recusada por `inset: '0'`; o compilador restringia o valor a `0` numérico. As duas representações CSS equivalentes passaram a ser aceitas nas declarações de zero enumeradas, preservando os mesmos limites, estado e verificador visual. Os 24 testes Node passaram novamente, com as duas formas. A qualificação específica `coding-live-20261031T220647Z-ebe62d` aprovou aparência, recorte de layout e replay independente; não representa repetição dos outros controles. Imagem do executor final `7e326c4d87ae…`, mesmos módulos `6d8cb6c12dca…`, backup privado verificado `human-dev-coding-20261031T220803Z`. [Recibo](assets/hello-world-retomada-dev-2026-10-31/10-qualificacao-zero-css.json).

O [MR !3](http://localhost:3180/sdlc/hellow/app/-/merge_requests/3) alterou somente `src/App.jsx`, por geração do agente. Sua revisão `83e9f688ee040cc0b23877d71c8df0781623b713` passou por Code Review e Security Scan; Draft liberado e merge solicitado/confirmado pelo Portal. A construção do commit integrado `2e7d569df311350ec5688325b168765c83441810` produziu `sha256:d7f619cad25d31edb83fa921921a1b962303da01e3b2d7175078aee234deae23`. Segunda publicação DEV confirmada e saudável às 19:14 em [localhost:33991](http://localhost:33991): [registro](assets/hello-world-retomada-dev-2026-10-31/12-dev-corrigido-publicado.txt).

Na execução real, o planejador escolheu uma asserção de fundo `#FFFFFF`, comprovando somente seu ensaio limitado: [metadados seguros](assets/hello-world-retomada-dev-2026-10-31/11-codificacao-real.json). A conferência externa usou seleções HTML nativas e leituras de CSS computado, sem injetar DOM, armazenamento ou backend. A primeira rodada de 13 cenários passou; a rodada ampliada de 21 passou nas nove combinações de três cores/três fontes em 1440×1000 e 390×844, incluindo independência, cantos/fundo da viewport, ausência de overflow horizontal, reset, teclado e nenhuma requisição externa observada: [resultado](assets/hello-world-retomada-dev-2026-10-31/16-aceite-visual-21-cenarios.json), [desktop](assets/hello-world-retomada-dev-2026-10-31/14-dev-desktop.png), [celular](assets/hello-world-retomada-dev-2026-10-31/15-dev-celular.png). O foco visível dos dois selects foi conferido separadamente: [resultado](assets/hello-world-retomada-dev-2026-10-31/18-foco-teclado.json). O primeiro observador de teclado comparava IDs, mas os labels válidos eram implícitos; foi corrigido para observar a ordem dos controles, sem alterar a aplicação. O resultado reprovado anterior permanece preservado.

Os quatro casos HTTP do pedido 2 passaram às 19:15, vinculados à versão atual de DEV na observação das 19:17: [registro](assets/hello-world-retomada-dev-2026-10-31/17-testes-dev-aprovados.txt). São verificação técnica, sem vínculo a critérios G1. A História permanece sem aprovação de Desenvolvimento Finalizado. O manifesto preparado foi conferido ao final e o ledger administrativo foi validado, com 128 registros e nenhuma operação pendente. As atualizações do Portal preservaram exatamente as 49 tabelas; as mudanças posteriores de negócio foram exclusivamente os comandos da jornada executados pela UI. Manifesto SHA256 dos artefatos em [evidências](assets/hello-world-retomada-dev-2026-10-31/sha256.json).

- [x] HW-01–HW-08 implementados e validados nos recortes descritos.
- [x] Revisão UX e testes desktop/celular, sem redesenho ou novo indicador.
- [x] Publicar a primeira correção localmente com backup e preservação das tabelas.
- [x] Retomar Hello World pelos agentes e pelos controles do Portal; MR !2 criado.
- [x] Revisão, segurança, merge, construção e primeira publicação DEV confirmados.
- [x] Publicar a orientação factual adicional; contrato conferido em isolamento, sem simular falha na base real.
- [x] Conferir revisão/segurança/integração; construir/publicar a correção em DEV e testar as duas interações.
- [ ] Evitar História duplicada de validação na primeira proposta, sem perder requisitos.
- [ ] Melhorar a continuidade entre revisão humana, encerramento da tentativa e novo Gateway.
- [ ] Executar regressão completa limpa no marco de consolidação, separada da inferência.
- [ ] Suíte de negócio em DEV com critérios G1 e asserções visuais: os quatro casos HTTP existentes não comprovam fundo/fonte nem encerram Teste em DEV.
- [ ] Planejar transições representativas no ensaio visual: o cenário nativo real escolheu só o branco inicial; as demais cores foram conferidas fora desse ensaio e na qualificação sintética.

QA/HML/PRD, outros Sistemas e outras aplicações não estão certificados por esta fatia.

<a id="navegacao-dev"></a>

## Análise de navegação da História e acesso a DEV

Análise solicitada em 31/10/2026, com revisão independente de UX e da projeção técnica. Este recorte registra diagnóstico e plano; não implementa nem publica mudanças de navegação. A correção do campo Justificativa no Projeto é anterior e independente desta análise.

A História já tem uma aplicação disponível em DEV, mas a jornada continua apresentando a orientação do pós-merge. O usuário precisa conciliar mensagens de fontes diferentes e descobrir um aprofundamento para abrir o resultado. Além da comunicação, há uma capacidade de aceite funcional de interface ainda não integrada ao fluxo atual.

### Situação real conferida

Consulta de 31/10/2026 às 19:48, America/Sao_Paulo, na História `HELLOW-SITEHW-1`, `cmvwutzrh001001t5lxja9hez`. Persona Ana para observar as ações existentes, sem confirmar comandos. Navegação nativa por Tarefas, Execução, destino DEV e conferência da aprovação, em 1440×1000 e 390×844. O link publicado foi aberto pelo controle existente e exibiu a página Hello World. APIs foram consultadas somente por GET; nenhuma fonte de aplicação, registro de negócio ou resultado de agente foi alterado.

| Assunto | Fato observado | Comunicação da jornada |
| --- | --- | --- |
| Aplicação | [Hello World em DEV](http://localhost:33991), publicação nº 2 confirmada e observação saudável | Link ausente na entrada da História e na Execução padrão |
| Construção | Artefato nº 2 confirmado, commit `2e7d569df311350ec5688325b168765c83441810` | Próxima ação ainda é **Preparar versão DEV** |
| Testes | Pedido nº 2 aprovado e corrente; quatro casos HTTP, escopo técnico | Cabeçalho mostra **TESTING / Resultado registrado**, sem explicar qual resultado |
| Aceitação | Zero de seis critérios G1 com cobertura registrada | Impedimento só aparece ao abrir **Revisar aprovação**, dentro de DEV |
| Aprovação | Desenvolvimento Finalizado sem aprovação; impedido pela aceitação | A entrada informa **Sem aprovação registrada**, sem orientar o que está faltando |

Metadados seguros das consultas: [leitura factual](assets/historia-orientacao-dev-2026-10-31/leitura-segura.json). A disponibilidade é uma observação datada; este registro não promete saúde futura.

### Problemas de comunicação e navegação

1. **A entrada prioriza a lista de Tarefas e não o resultado utilizável.** A faixa informa TESTING, Resultado registrado e Continuar em Execução. Nenhum desses textos responde se o usuário já pode abrir a aplicação. O rótulo da tarefa atual continua no merge concluído, enquanto Teste em DEV está DOING.
2. **A próxima ação é anterior ao estado real.** Em Execução, Preparar versão DEV permanece principal mesmo depois de construção, publicação e teste técnico confirmados. A mensagem também orienta outro ciclo para alterar requisitos, antes de explicar que a aplicação já está disponível.
3. **O acesso a DEV depende da descoberta do trilho.** O link Abrir aplicação em DEV só está visível dentro do destino DEV, no quadro de publicação, depois da construção. No ensaio desktop, o link estava na posição vertical 1.936 px do documento; em 390 px, 2.736 px. São medidas deste conteúdo/viewport, não metas gerais de desempenho. Na primeira tela do celular, o trilho mostra fases iniciais e DEV exige deslocamento horizontal.
4. **Os quadros conservam instruções que parecem pendências atuais.** A construção afirma que publicação e aprovação continuam pendentes, embora a publicação já esteja confirmada no quadro seguinte. O destino começa com construir → publicar → testar → aprovar sem indicar qual desses passos falta agora. Resultados históricos precisam de linguagem que não declare o estado presente de outros quadros.
5. **A ausência de aceite parece uma tarefa que o usuário conseguiria cumprir pelo fluxo disponível.** A conferência pede entregar casos funcionais pelo fluxo de código, mas o executor DEV atual não realiza as interações de navegador exigidas por esta História. O usuário pode navegar manualmente e conferir os critérios; isso ainda não registra a evidência exigida pelo gate.

Evidências: [entrada desktop](assets/historia-orientacao-dev-2026-10-31/01-entrada-desktop.png), [entrada celular](assets/historia-orientacao-dev-2026-10-31/02-entrada-celular.png), [painel com o link existente](assets/historia-orientacao-dev-2026-10-31/03-publicacao-dev.png), [impedimento da aprovação](assets/historia-orientacao-dev-2026-10-31/04-impedimento-aceite.png) e [link no celular após rolagem](assets/historia-orientacao-dev-2026-10-31/05-link-celular.png). São capturas da interface vigente, sem montagem de uma interface proposta.

### Causas e fronteiras da implementação

| Fonte | Diagnóstico |
| --- | --- |
| [journey.ts](../portal/apps/api/src/journey.ts) | O ramo pós-merge define título/mensagem e `prepare_dev` sem incorporar os resultados posteriores de construção, publicação, testes e aprovação. |
| [story-delivery.ts](../portal/packages/shared/src/story-delivery.ts) | Publicação e aprovação são projetadas como `unconfirmed`; o marcador DEV Próximo depende somente do merge. Foi um contrato de separação de destinos, não uma leitura completa da entrega. |
| [story-workspace.tsx](../portal/apps/web/app/story-workspace.tsx) | Cabeçalho e encaminhamento genéricos; os painéis DEV só aparecem na consulta do destino. |
| [development-deployment.tsx](../portal/apps/web/app/development-deployment.tsx) | O link já existe e exige observação saudável correspondente à publicação; a localização é insuficiente. Essa proteção deve ser reutilizada. |
| [story-environment.tsx](../portal/apps/web/app/story-environment.tsx) | Ordem fixa de instruções, sem resumo da pendência corrente. |
| [runtime/service.py](../portal/runtime/service.py) | Suíte DEV executa HTTP/status/conteúdo; não opera selects, CSS, teclado ou recarga em navegador. |
| [agent-context.ts](../portal/apps/api/src/agent-context.ts) | O contrato proíbe atribuir cobertura de interação React/localStorage a verificações de health/HTML; nesses casos exige escopo técnico. |
| [coding_micro.py](../portal/executor/coding_micro.py) | O perfil local `micro-json-v1` trabalha em fontes existentes JS/TS/CSS e exclui criação/edição de testes. Outro ciclo com esse perfil não garante produzir a suíte de aceitação. |
| [assistant-dev-actions.ts](../portal/packages/shared/src/assistant-dev-actions.ts) | Metadados estruturados cobrem preparação/publicação; não apresentam a mesma leitura de testes, aceitação e limitação do executor. O assistente também precisa compartilhar a orientação factual futura. |

O verificador de UI durante a codificação já produz provas limitadas, mas não produz automaticamente a evidência de aceitação DEV exigida pela aprovação. Os 21 cenários de conferência humana desta retomada permanecem evidência externa dirigida; não foram convertidos em `DevelopmentTest` nem em aprovação. O contrato existente de suítes usa `scope: acceptance` e `criterionIndices` base zero; não basta atribuir esses índices a casos HTTP incapazes de verificar a interação.

### Apresentação proposta para esta História

Reutilizar o resumo da História, visível também na entrada por Tarefas e nas demais abas. Manter compacto, com o resultado primeiro e sem acrescentar todos os detalhes ao cabeçalho fixo:

> **Versão disponível em DEV**  
> Abra a aplicação para conferir o resultado. As quatro verificações técnicas passaram.  
> **Abrir aplicação em DEV ↗** — `http://localhost:33991`  
> **Consultar critérios e pendências**  
> O aceite das interações da interface ainda não está integrado ao fluxo do SDLC. Desenvolvimento Finalizado permanece pendente.

Abrir a aplicação é o acesso principal neste estado; Consultar critérios e pendências abre a leitura existente, focando a pendência de aceitação. Essa navegação não inicia teste nem aprovação. A limitação deve identificar que há trabalho no SDLC, sem transferi-la ao usuário como se bastasse executar novamente a suíte técnica. Iniciar novo ciclo fica como alternativa para corrigir defeito ou mudar requisitos, com a confirmação atual.

### Matriz para a próxima ação

| Situação confirmada | Orientação e destino |
| --- | --- |
| Integração pendente | Explicar a decisão/impedimento atual e abrir a atividade correspondente. |
| Integrado, sem artefato corrente | Falta construir a versão; abrir conferência de construção. |
| Artefato corrente, sem publicação | Falta publicar em DEV; abrir conferência de publicação. |
| Construção/publicação/teste em andamento | Acompanhar o pedido existente, sem sugerir outro pedido. |
| DEV saudável, sem testes correntes | Abrir a aplicação e conferir os testes disponíveis, identificando seu escopo. |
| Teste técnico aprovado, aceite de UI indisponível | Abrir a aplicação, consultar critérios e explicar a limitação do SDLC. Não prometer um comando de aceitação inexistente. |
| Aceitação implementada e reprovada | Exibir critérios/casos reprovados e a correção permitida pelo domínio. |
| Evidências completas, sem decisão responsável | Abrir revisão de Desenvolvimento Finalizado, mantendo sua confirmação. |
| Desenvolvimento aprovado | Explicar o desenvolvimento aprovado e a entrega por release em QA em diante, sem atestar conclusão em produção. |
| Destino mudou ou ficou indisponível | Separar publicação histórica e versão atendida agora; encaminhar à observação/recuperação apropriada. |
| Leitura falhou ou ficou antiga | Identificar situação não confirmada e preservar a última leitura datada; não anunciar uma URL histórica como versão atual. |

O DEV é compartilhado pelo Sistema: fase TESTING, URL cadastrada no ambiente, merge ou recibo de publicação isolado não comprovam qual História está atendida agora. Próxima ação e acesso DEV precisam derivar de leitura compartilhada no servidor, com referência de revisão, publicação e observação. Histórico selecionado não substitui a situação atual. O resumo do frontend e a orientação factual do assistente devem consumir essa mesma leitura, sem duplicar regras de autorização ou inventar novos indicadores.

### Backlog e critérios para implementar

- [x] Diagnosticar pela navegação real desktop/celular e confrontar com fontes atuais; revisão UX independente e análise técnica somente leitura.
- [ ] **NAV-DEV-01 — prioridade imediata:** resumo factual em todas as abas da História, URL DEV evidente e próxima orientação coerente com a entrega atual. Reutilizar leituras/observação existentes, incluindo estados incertos e substituição por outra versão no DEV compartilhado.
- [ ] **NAV-DEV-02 — continuidade:** links para o quadro exato, foco no título, retorno/recarga e preservação de filtros/rascunhos/tentativa consultada. Corrigir instruções estáticas e retirar estados atuais indevidamente declarados por recibos históricos. Rever rótulos da tarefa atual e a posição do trilho no celular.
- [ ] **NAV-DEV-03 — assistente:** compartilhar a leitura factual de disponibilidade, próxima ação e limites de aceitação; não recomendar reconstrução/republicação por desconhecer os resultados correntes.
- [ ] **ACEITE-UI — bloqueio funcional independente da navegação:** integrar execução de casos de interface associados aos critérios G1 e produzir evidência de aceitação vinculada a revisão, artefato e publicação. Exige contrato, autorização/capacidades, auditoria, rollback/retentativa e testes próprios antes de oferecer esse avanço. Um eventual aceite manual formal depende de decisão explícita de domínio; não é um desvio automático do gate.

Aceite da primeira fatia: em 1440/390, identificar o resultado disponível e abrir DEV sem descobrir o trilho ou percorrer painéis técnicos; um acesso principal e uma orientação contextual. Link nativo com URL legível, quebra de linha e indicação de nova aba, acessível por teclado e para papéis de consulta. Consultar/navegar não pode enfileirar comandos. Testar publicação saudável, versão substituída, indisponibilidade, erro/leitura antiga, mudanças de SHA, aceitação pendente/completa, permissão somente leitura e consulta histórica. Conferir que testes técnicos não liberam aceitação e que outro ciclo não aparece como solução para uma capacidade ausente.

Não houve execução de suíte de regressão ou build nesta análise, pois só documentação/evidências foram acrescentadas. A primeira implementação deve adaptar os contratos já cobertos em `journey`, `story-delivery` e `development-{deployments,tests,approvals}`, com cenários integrados de navegação; a cobertura existente não comprova o comportamento proposto. Catálogo atual de 608 cenários/55 arquivos não foi executado integralmente. QA/HML/PROD, outras Histórias, acervo e jornada completa do assistente não foram certificados por este ensaio.

<a id="navegacao-dev-implementacao"></a>

## Implementação da orientação e do acesso a DEV

Implementação autorizada após a análise acima. O recorte entrega NAV-DEV-01 e a parte de NAV-DEV-02 referente ao destino exato dos quadros; não implementa o executor de aceite de interface nem a leitura estruturada completa no assistente (NAV-DEV-03).

`StoryDevProgress` compartilha os fatos e checks da aprovação existente. A jornada pós-merge consulta a disponibilidade fora da transação e relê as referências antes de anunciar a URL da aplicação. Observação desconhecida, antiga, substituída por outra publicação, divergência de revisão ou mudança durante a consulta não recebe link de versão atual. A sonda remota tem prazo de um segundo; consultas simultâneas idênticas são coalescidas, sem cache de progresso concluído. Não há novo comando, tabela, migration, autorização de domínio ou indicador.

O resumo fica no fluxo normal, depois do título e antes das abas, também na entrada por Tarefas. Situação, próxima orientação, URL e instante observado usam a leitura compartilhada. A falha preserva a última leitura datada, identifica a situação não confirmada e suspende o link atual. O marcador de DEV deixa de anunciar Próximo quando a leitura já comprova publicação. Navegar ou abrir a aplicação não exige persona com permissão de escrita.

`devStep=build|deployment|test|approval` aprofunda a URL existente de Execução → DEV. O título do quadro recebe foco abaixo da faixa fixa; repetir o mesmo link volta ao destino, e polling não desloca o foco. A consulta preserva os demais parâmetros, incluindo filtros e tentativa histórica. O quadro de Desenvolvimento Finalizado mostra cobertura e checks pendentes em leitura, sem abrir automaticamente o formulário de confirmação. Os comandos continuam revalidando versão, evidências, autoria, permissão e confirmação pelas operações originais.

Recibos de construção conservam a mensagem registrada nos detalhes. O resumo do êxito descreve somente a construção, sem declarar publicação/testes ainda pendentes quando outra fonte já os confirmou. A orientação de aceitação distingue a suíte técnica da cobertura funcional e identifica a limitação do perfil HTTP, sem prometer que repetir testes ou iniciar outro ciclo resolve testes de interface ausentes.

A nova leitura acrescenta consultas locais no pós-merge e uma sonda remota à jornada, que já possui polling. Não houve ensaio de carga ou certificação de escala. A medição dirigida retornou cinco GETs em 119/55/49/48/49 ms antes e 139/146/142/148/135 ms depois: mediana de 49 para 142 ms nesta amostra local. Esse custo adicional precisa ser considerado ao ampliar concorrência; não é uma meta/SLA nem um novo KPI. Contagens de critérios e checks continuam sendo evidências da revisão. [Antes](assets/historia-orientacao-dev-implementacao-2026-10-31/06-consulta-antes.json) e [depois](assets/historia-orientacao-dev-implementacao-2026-10-31/07-consulta-depois.json).

### Validação e publicação deste recorte

- Backend: **96/96**, sem falhas ou skips, em `20261031T232039Z-f1719e`: aprovação 49, construção 16, jornada 23 e contrato de entrega 8. Doze casos novos incluem ausência de escrita, papéis de consulta, história paginada independente, observação antiga/lenta/indisponível, DEV compartilhado, resultado incerto, mudança de escopo/referência durante consulta e URL com credenciais. Os testes de aprovação existentes conservam rollback/replay e bloqueio de suíte técnica.
- Navegador: a rodada ampliada de seis arquivos teve **141/143 aprovados**, em `20261031T232340Z-55fe1e`. Os sete cenários novos passaram. Os dois casos reprovados eram expectativas antigas de texto do diagnóstico técnico (completo versus registrado), corrigidas no teste sem alterar a implementação desse diagnóstico. A rodada final `20261031T232946Z-08a465` aprovou **9/9**, incluindo os dois casos corrigidos, os sete cenários novos e a verificação adicional do retorno à atividade atual ao consultar uma tentativa anterior. Sem skips, flaky ou fonte alterada durante as rodadas.
- O navegador cobre desktop/celular, abertura da aplicação por teclado sem persona, pendências visíveis sem formulário de decisão, foco abaixo da faixa fixa, repetição do mesmo link, polling sem roubar foco, recarga, filtros/tentativa preservados, falha com leitura datada e URL suspensa, DEV substituído e parâmetro de quadro inválido. Fixtures interceptam os dados e recusam comandos de domínio nos casos de navegação.
- Catálogo atualizado: **615 cenários/56 arquivos**, sete cenários novos. Não equivale a regressão completa executada. Revisão visual UX das capturas isoladas em 1440/390 sem impedimento; a primeira viewport real permanece uma conferência operacional separada.
- Build de produção API/web aprovado, incluindo TypeScript, sem rede ou alteração de dependências. Imagem candidata `0aa72ec98599…`, fonte `131881e52cd9…`.

Publicado no portal local em 31/10/2026, às 20:32, imagem `0aa72ec98599…` e fonte `131881e52cd9…`. Backup privado validado por digest/leitura/permissões; **49 tabelas preservadas exatamente**, sem migrations pendentes. Saúde `ready/preview`, manifesto conferido e ledger administrativo com 136 registros e nenhuma operação pendente ao concluir a publicação. [Projeção segura da publicação](assets/historia-orientacao-dev-implementacao-2026-10-31/09-publicacao.json).

Conferência real pelos controles da interface em 1440/390, sem persona de escrita: resumo disponível na entrada por Tarefas e na Especificação; link abriu a aplicação Hello World; pendência abriu o quadro exato com foco, cobertura **0 de 6** visível sem formulário, repetição do link e recarga corretas. Nenhum comando de negócio foi enviado. No celular, o título focado ficou em 322,39 px e a faixa fixa terminou em 308,09 px. [Conferência dirigida](assets/historia-orientacao-dev-implementacao-2026-10-31/10-conferencia-interface.json) e [Especificação](assets/historia-orientacao-dev-implementacao-2026-10-31/08-resumo-especificacao.json).

Evidências reais: [História desktop](assets/historia-orientacao-dev-implementacao-2026-10-31/01-historia-desktop.png), [resumo desktop](assets/historia-orientacao-dev-implementacao-2026-10-31/02-resumo-desktop.png), [entrada celular](assets/historia-orientacao-dev-implementacao-2026-10-31/03-entrada-celular.png), [resumo celular](assets/historia-orientacao-dev-implementacao-2026-10-31/04-resumo-celular.png) e [pendências celular](assets/historia-orientacao-dev-implementacao-2026-10-31/05-pendencias-celular.png). [Manifesto SHA-256](assets/historia-orientacao-dev-implementacao-2026-10-31/sha256.json). Revisão UX final sem impedimento no recorte: no celular, cabeçalho/trilho ainda dominam a primeira viewport e o botão exige rolagem vertical comum. A fatia remove a necessidade de descobrir uma aba/destino oculto; não promete o botão na primeira dobra.

- [x] NAV-DEV-01: resumo factual e acesso DEV publicados e conferidos.
- [x] NAV-DEV-02, parte dos quadros: URL, foco, leitura direta das pendências, recarga e retorno validados.
- [ ] NAV-DEV-02, restante: harmonizar rótulos de atividade e reduzir a predominância do cabeçalho/trilho móvel.
- [ ] NAV-DEV-03: leitura estruturada completa no assistente.
- [ ] ACEITE-UI: produzir evidência funcional vinculada ao G1 pelo fluxo apropriado.

Os gates e a ausência de evidência formal de aceite UI do Hello World permanecem independentes desta alteração de navegação. Não houve edição da aplicação produzida, de dados de negócio ou de resultados de agentes para demonstrar esta fatia. Acervo, demais níveis, QA/HML/PROD e o catálogo completo não são declarados certificados.

<a id="dev-acoes-hierarquia"></a>

## Hierarquia dos quadros e das ações DEV

NAV-DEV-04 responde ao feedback posterior: o acesso à aplicação passou a funcionar, mas os quatro quadros ainda apresentavam consulta prévia, atualização, nova execução e confirmação no mesmo nível. O recorte reorganiza a apresentação, preservando os contratos dos controladores e os gates.

Onde a jornada oferece `StoryDevProgress`, as quatro etapas têm assunto e situação explícitos. A etapa da próxima orientação abre inicialmente; um `devStep` explícito prefere o quadro solicitado. Construção e publicação confirmadas ficam recolhidas. Testes técnicos aprovados são identificados como verificação técnica, com aceitação pendente; não são anunciados como a etapa de aceitação concluída. Os estados resumidos usam os checks atuais, não qualquer recibo histórico `succeeded`.

| Intenção | Apresentação |
| --- | --- |
| Consultar o que aconteceu | Abrir a etapa compacta e ler o resultado. Não inicia pedido. |
| Atualizar a leitura | Controle secundário **Atualizar consulta**, com indicação de que não inicia outra execução. |
| Conferir um avanço ainda necessário | Revisar construção, publicação, execução dos testes ou Desenvolvimento Finalizado, conforme a etapa atual. |
| Reavaliar uma etapa anterior | **Outras ações**, com rótulo específico de outra construção/publicação ou nova execução dos testes. |
| Confirmar um efeito | Formulário somente após revisão explícita; motivo, aceite e Confirmar não aparecem quando a prévia respondeu `allowed=false`. |
| Resultado incerto ou pedido em andamento | Acompanhamento/recuperação do mesmo pedido, preservando a identidade original; não se converte em executar novamente. |

O disclosure conserva um único controlador montado por operação. Não muda `active` ao recolher: esse sinal continua representando o destino DEV ativo, mantendo polling, rascunhos e recuperação. Revisão em aberto, consulta explícita em andamento, erro, recibo à frente da leitura e pedidos pendentes/incertos mantêm o quadro visível. Para fechar uma revisão, o usuário usa Voltar ao acompanhamento; motivo é preservado e o aceite da revisão local é limpo pelas regras existentes. A expansão acontece antes de foco/rolagem, inclusive quando o endereço já é o mesmo.

O quadro de aprovação no Hello World mostra a cobertura 0/6 e a limitação de aceite de interface. Consultar suas condições fica como opção secundária; não é apresentado como um avanço já disponível. Prévia impedida mostra a causa e o retorno, em vez de um botão de confirmação desabilitado e campos sem uso.

Compatibilidade: onde ainda não há projeção integrada de progresso, a apresentação plana e os nomes anteriores são preservados; não se declara migração do assistente, pré-merge ou demais fluxos por esta fatia. O formulário de uma prévia negada é simplificado também nesses consumidores, mantendo o mesmo bloqueio. Não há mudança de corpo, assinatura, token, autorização, mutation, política ou indicador.

### Validação e publicação NAV-DEV-04

- **109/109 cenários de navegador aprovados**, sem skips ou flaky e com fonte estável, em `20261101T014253Z-807173`: doze cenários novos de hierarquia, sete do resumo e noventa de construção/publicação/testes/aprovação. A primeira rodada `20261101T013616Z-1b87dd` teve 99/109: duas expectativas de abertura não respeitavam o alvo explícito do deep link e oito ainda esperavam campos desabilitados numa prévia negada. Os testes passaram a exigir ausência dos controles de decisão e retorno operável, preservando as verificações de autorização, contextos permitidos, pedidos, assinaturas e rascunhos.
- Cobertura em 1440/390: etapas recolhidas e pendência atual aberta, testes técnicos distintos de aceitação, ações secundárias, GET sem comando, prévia negada sem motivo/checkbox/Confirmar, navegação repetida/recarga, motivo preservado, revisão que exige Voltar antes de recolher, erro de consulta recuperável, queued/unknown/pedido sem recibo e recuperação entre abas. A fixture recusa comandos nos casos de consulta e mantém simulações somente no ambiente isolado.
- Catálogo **627 cenários/57 arquivos**, com doze novos; não houve execução completa do catálogo. Consumidores sem a projeção integrada mantêm o contrato de apresentação legado, com cenário próprio de compatibilidade.
- Build de produção API/web e TypeScript aprovados. Sem mudança de backend nesta fatia, sem nova suíte de regressão backend além da evidência anterior.

A primeira conferência real em leitura confirmou os quatro estados, as três etapas anteriores recolhidas, o bloqueio de outra publicação já ativa sem campos de decisão, retorno/recolhimento, foco abaixo da faixa fixa e aplicação Hello World acessível. Nenhum comando de negócio foi enviado. A inspeção da representação ARIA encontrou título e estado sem separador textual; o ajuste recebeu asserção nos cenários existentes, **19/19 aprovações focais** em `20261101T014943Z-b8be29` e novo build de produção aprovado.

Revisão UX das capturas reais sem impedimento na hierarquia. Permanecem melhorias de texto: reduzir repetição da explicação HTTP/aceite no celular e substituir a frase genérica “a implantação ainda exige confirmação” quando a própria conferência já identificou impedimento. O bloqueio e a ausência de comando executável estão explícitos nessa situação; não se declara revisão integral de toda a cópia dos painéis. O aceite funcional de UI, a integração completa ao assistente e a compactação do cabeçalho móvel permanecem nas suas fatias próprias.

Publicado e conferido no portal local em **31/10/2026 às 22:53**, imagem final `67be261aac0b…`, fonte `c52cdda1ac30…`. As duas atualizações desta fatia conservaram backup privado verificável e **49 tabelas preservadas exatamente**, sem migrations pendentes. Saúde `ready/preview`, manifesto preparado conferido e ledger com 144 registros e nenhuma operação pendente ao final da publicação. [Projeções seguras das publicações](assets/hierarquia-acoes-dev-2026-10-31/06-publicacoes.json).

Conferência final nativa em 1440/390 com Ana: construção/publicação/testes técnicos recolhidos, cobertura 0/6 aberta, outras ações disponíveis somente após escolha explícita; consulta de outra publicação já ativa mostrou impedimento, sem campos/checkbox/Confirmar. Voltar permitiu recolher novamente, o foco da pendência permaneceu abaixo da faixa e o link abriu Hello World em DEV. **Zero comandos de negócio** nessa conferência e sem overflow horizontal. A leitura ARIA registra “Construção Artefato confirmado Consultar resultado”, com separação textual entre assunto e estado. [Registro](assets/hierarquia-acoes-dev-2026-10-31/05-conferencia-real.json).

Evidências: [etapas desktop](assets/hierarquia-acoes-dev-2026-10-31/01-etapas-desktop.png), [etapas celular](assets/hierarquia-acoes-dev-2026-10-31/02-etapas-celular.png), [prévia impedida](assets/hierarquia-acoes-dev-2026-10-31/03-publicacao-impedida.png), [foco na pendência](assets/hierarquia-acoes-dev-2026-10-31/04-foco-pendencia.png) e [manifesto SHA-256](assets/hierarquia-acoes-dev-2026-10-31/sha256.json). Nenhuma aplicação produzida, dado de negócio ou resultado de agente foi alterado para demonstrar esta apresentação.

<a id="help-fluxo-execucao"></a>

## HELP: documentação do percurso e dos retornos

Por solicitação do usuário, esta fatia interrompe a evolução da navegação operacional para documentar o que existe. A entrada **HELP — Guia do SDLC** fica na parte inferior do menu lateral e também no menu móvel do Assistente. A rota `/help` apresenta o documento na identidade visual do portal; [o HTML canônico](../portal/apps/web/public/help/fluxo-execucao.html) é independente, imprimível e utilizável sem JavaScript ou API. As duas apresentações compartilham a mesma fonte editorial.

O mapa possui **15 etapas** e **47 famílias identificadas de alternativas e retornos (L01–L47)**, agrupadas por contexto. Cada retorno informa gatilho, caminho, o que permanece válido, condição de saída e limite. A documentação inclui Sistema e base técnica, planejamento pelo Assistente ou manual, especificação aplicada/G1, execução e correções, publicação do código no GitLab, Code Review/Security Scan, merge, construção, destino/publicação/testes DEV, aprovação de desenvolvimento e fronteira das releases. A numeração descreve o percurso de leitura; não promete uma única sequência obrigatória para todos os contextos.

Revisões técnicas e de UX participaram do mapa. Foram conferidos os ramos starter/contrato/repositório pronto, tentativas automáticas do provisionador, substituição da proposta antes do G1, correção técnica versus alteração de escopo, revisão de qualidade por SHA e recuperação de pedidos. Consultar, reapresentar um comando com a identidade original e reconciliar um resultado incerto têm efeitos diferentes e aparecem separados no glossário. Publicar código no GitLab, implantar em DEV, passar na verificação HTTP e aprovar os critérios da História também são resultados distintos.

**Limites e backlog:** o HELP é uma fotografia datada do contrato implementado, sem consultar o estado de projetos. A lista de loops cobre as famílias mapeadas nos fluxos atuais; não afirma esgotar falhas de infraestrutura ou combinações futuras. Aceite funcional de UI e candidata imutável/promoções QA/HML/PROD/conclusão continuam nas suas fatias pendentes. Links repetidos e retornos entre telas operacionais continuam sujeitos à análise com o usuário a partir deste mapa. Não houve mudança das ações operacionais, dos gates, dos dados de negócio ou das aplicações geradas para ilustrar a documentação.

### Validação do HELP

A rodada isolada `20261101T023029Z-5fb464` aprovou **14/14 cenários de navegador**, com fonte estável e sem flaky: seis de HELP e oito de compatibilidade do Assistente. A cobertura inclui acesso em 1440/390 com APIs indisponíveis; entrada direta sem consultas de persona/itens; destinos únicos de todas as âncoras internas; teclado no índice, região da tabela e menu móvel; seleção atual e fechamento do diálogo; ausência de formulários/comandos; e HTML independente com JavaScript desabilitado. O cenário móvel carrega contexto isolado válido do Assistente antes de indisponibilizar as APIs e navegar até a ajuda. A primeira rodada, preservada, revelou esse requisito de montagem da fixture e não uma falha do link.

O catálogo ficou em **633 cenários/58 arquivos**, conferido em `20261101T022958Z-65bc0b`; não houve execução completa do catálogo. A revisão de fonte verificou alternativas e fronteiras; esses testes não reexecutam os 47 caminhos de negócio. A revisão UX ajustou a introdução para a próxima ação, tornou a tabela rolável uma região nomeada/focável e preservou números do mapa com texto preto/contorno na impressão sem fundos.

A inspeção real do arquivo independente encontrou a primeira regra de CSS descartada por marcadores de seção escritos como comentários HTML dentro de `style`. A fonte canônica passou a usar comentários CSS nessa seção, com extração correspondente na rota. A rodada focal final `20261101T023422Z-fa7e0b` aprovou **6/6 cenários HELP**, sem flaky e com fonte estável, incluindo as novas asserções de margem, espaçamento, fonte e fundo do documento sem JavaScript e cores/contorno do contador sob mídia de impressão. Catálogo final conferido em `20261101T023410Z-8a0ada`, conservando 633/58.

A revisão UX de quatro capturas reais não encontrou impedimento visual em 1440/390: entrada separada no rodapé, mapa e retornos legíveis, fronteira parcial identificada por texto e borda. O documento é longo; índice, busca nativa e rolagem continuam necessários, e o índice móvel fica depois da introdução. Não se declara ensaio de usabilidade com usuários ou validação assistiva integral. A preservação de contexto/rascunhos ao sair e retornar à ajuda permanece como verificação de uma fatia futura, junto à decisão da navegação operacional.

Publicado no portal local em **31/10/2026 às 23:37**, imagem final `ba8cd529e721…`, fonte `93ec8e7701a9…`, após build de produção API/web aprovado. As duas publicações desta entrega conservaram backup privado verificável e **49 tabelas preservadas exatamente**, sem migrations pendentes. Saúde `ready/preview`, manifesto/imagens conferidos e trilha administrativa com 154 registros e nenhuma operação pendente ao final. Nenhuma aplicação gerada foi modificada.

A conferência real final abriu a ajuda pelo rodapé da História e, no celular, pelo diálogo do Assistente em contexto válido, usando teclado e confirmando o fechamento do menu. Confirmou 15 etapas/47 retornos, seleção atual, ausência de overflow horizontal em 1440/390, região da tabela focável, navegação por âncoras e HTML independente com fonte/fundo/espaçamento aplicados. A inspeção da mídia de impressão confirmou contador preto com contorno e menu oculto. **Zero comandos de negócio, zero consultas de API enquanto na ajuda e zero erros de página** nessa conferência. Esses resultados não representam validação de todos os fluxos operacionais documentados.

Evidências: [HELP desktop](assets/help-fluxo-2026-10-31/01-help-desktop.png), [mapa desktop](assets/help-fluxo-2026-10-31/02-mapa-desktop.png), [HELP celular](assets/help-fluxo-2026-10-31/03-help-celular.png), [retornos no celular](assets/help-fluxo-2026-10-31/04-retornos-celular.png), [HTML independente](assets/help-fluxo-2026-10-31/05-html-independente.png), [projeção segura de validação/publicação](assets/help-fluxo-2026-10-31/06-validacao-publicacao.json) e [manifesto SHA-256](assets/help-fluxo-2026-10-31/sha256.json).

