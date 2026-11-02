# Correções gerais do executor de implementação e UI

**Situação conferida em 01/11/2026:** fontes instaladas e saudáveis em código/runtime, sem mudança de modelos, orçamento ou credenciais; navegador atualizado para seletores sem nome. **142 testes dirigidos** de contrato/Chromium passaram, além das qualificações com modelo descritas abaixo. A jornada real produziu MR !2 e passou no cenário/replay da primeira candidata; Code Review bloqueou a integração e as correções posteriores não passaram. Não houve build/deploy DEV. Preservação semântica da interface e limite de contexto continuam como limitações observadas, sem declaração de resolução completa do executor para qualquer tarefa.

Correção geral solicitada em 01/11/2026 durante a [continuação da jornada Aurora até DEV](simulacao-catalogo-joias-dev-2026-11-01.md). O usuário autorizou corrigir o executor e explicitou que ele deve atender outros projetos.

## Continuação do repasse de achados e preenchimento

A [retomada da jornada](simulacao-catalogo-joias-dev-retomada-2026-11-01.md) registra duas correções gerais posteriores: preservação do contexto de implementação sem duplicação idêntica e vínculo dos dados iniciais congelados a controles observados. Código/runtime foram atualizados às 23:06 com configuração preservada. As evidências e limitações anteriores continuam históricas; a continuação registra separadamente o resultado operacional e os novos controles dirigidos.

## Problema e contrato

Quatro recibos privados de codificação mostraram a mesma classificação indevida: `page_background` para um cenário de cadastro. O literal de cor proposto não existia nos requisitos. A guarda de fonte recusou corretamente a expectativa, antes do navegador funcional e de qualquer correção da candidata. Esclarecer os textos da História e aprovar outro G1 não resolveu a classificação.

O classificador agora recebe `currentGoal` como resultado focal e mantém o contexto aprovado integral como restrição. A instrução distingue resultado textual, imagem carregada, família da fonte do h1 e fundo cobrindo a janela; a lista de capacidades não determina o assunto do teste. Não há nomes de Sistemas, Projetos, produtos, campos ou mensagens da aplicação no executor.

`page_background` só é oferecido quando existe um literal aprovado no formato `#RRGGBB`. Essa é uma condição necessária do contrato já existente: sem tal fonte, nenhum valor aceito pela asserção de fundo poderia passar pela guarda. Não se usa CSS atual, dados inventados pelo cenário ou a resposta do modelo para criar essa autorização. A presença de uma cor no contexto permite a escolha; não força um teste de cor quando o resultado focal é textual. Imagem e fonte mantêm suas capacidades próprias.

O schema e a validação local compartilham o conjunto permitido. Uma resposta fora dele é recusada antes de consultar literal ou abrir navegador. A guarda `require_assertion_source` permanece; a expectativa continua congelada e sujeita à repetição independente do mesmo roteiro. Não se troca teste visual por texto, não se escolhe uma mensagem do catálogo por regra determinística e não se concede aceite completo a um cenário representativo.

Limites mantidos: uma asserção/cenário representativo, vinte ações registradas, orçamento global de inferência, ausência de teclado/resize/upload/backend e `completeAcceptance=false`. Cores sem literal hexadecimal não ganham conversão implícita nesta correção. Tipografia e imagens ainda dependem de escolha semântica do modelo, controles observados e execução real; não há promessa de classificação infalível.

## Verificação

| Verificação | Resultado |
| --- | --- |
| Contratos do planejador | 28 testes: fontes, schemas, limites, imagem, fluxo principal e preservação do contexto; três novos testes cobrem vários subcasos do classificador |
| Compilador de microalterações / executor | 30 + 23 testes aprovados |
| Atualização de fontes | 5 testes, com subcasos para código/runtime: configuração/identidade preservadas, falha de saúde, falha de confirmação da auditoria, auditoria indisponível antes da escrita, recusa de trabalho ativo e retentativa explícita |
| Consumidores e administração | 9 DEV IA, 5 runtime, 4 runner e 9 recorder administrativo aprovados |
| Classificação com modelo instalado | 7/7: agendamento, despesas, almoxarifado, reserva em contexto com aparência, imagem, fundo e fonte |
| Fluxo completo sintético | Reservas e aparência aprovados, com replay independente; teclado recusado como não executado, sem substituição por smoke |

São **113 testes de contrato distintos**, sete ensaios de classificação e três controles no ensaio completo (dois positivos e uma recusa esperada). Não é regressão completa nem aceite da aplicação Aurora. Não houve qualificação de outro modelo. A rodada `coding-live-20261102T001426Z-8844f5` usa data UTC no identificador, correspondente a 01/11/2026 em São Paulo.

Fontes e resultados seguros: [classificação](assets/correcao-classificacao-teste-ui-2026-11-01/classifier-qualification.json), [qualificação dirigida](assets/correcao-classificacao-teste-ui-2026-11-01/qualification.json), [publicação das fontes](assets/correcao-classificacao-teste-ui-2026-11-01/executor-source-publication.json) e [manifesto](assets/correcao-classificacao-teste-ui-2026-11-01/sha256.json). Receitas, fontes de candidatas e conteúdo de agentes permanecem nas fontes privadas.

## Atualização administrativa e auditoria

A primitiva interna `scripts/executor_source_update.py` atualiza somente os módulos declarados de uma instalação existente de código/runtime e seu `sourceDigest`. Não cria uma instalação nova, jobs, recursos de aplicação ou autorização de negócio. Valida propriedade, serviço ativo, arquivos regulares, ausência de trabalho ativo e correspondência dos dois módulos de navegador na imagem instalada. O chamador confere a qualificação da fonte exata antes da atualização.

Reutiliza as entradas explícitas `PORTAL_CODING_EXECUTOR_INSTALLED` e `PORTAL_RUNTIME_EXECUTOR_INSTALLED`, com recorder administrativo fora da base. REQUESTED precede efeitos; conclusão exige fonte/saúde conferidas. Backup privado guarda arquivos, metadados, configuração e hashes anteriores/novos. Modelo, imagens, tokens, instalação, orçamento e configuração permanecem byte a byte; não são projetados no ledger. Não há escrita direta em HistoryEvent, migration ou evento artificial de negócio.

Falha após parar o executor restaura os arquivos e reinicia o serviço; a conferência da restauração fica no recibo privado. Falha do recorder antes do efeito impede a escrita; falha da confirmação posterior compensa a atualização e conserva resultado administrativo incerto. A retentativa explícita cria outra operação/backup, sem reescrever a anterior. A compensação foi testada em diretórios isolados com serviços interceptados; não se declara rollback real sobre a instalação operacional. A consulta de atividade não é lock global contra uma operação concorrente externa: a manutenção exige janela sem novos pedidos.

Instalados código e runtime em 01/11/2026, às 21:18 (São Paulo), com saúde confirmada e configuração exata preservada. Backups privados: `executor-source-coding-839d7eadcf3646d48049bb10ea53e603` e `executor-source-runtime-dc818d9749804eaab51688057030bfde`. O Portal e as aplicações existentes não foram recompilados nem tiveram seus dados alterados nessa manutenção. A aplicação do catálogo será produzida e publicada pelos comandos normais do Portal, com resultado próprio.

O teste de atualização de fontes foi incluído nos checks de suporte da regressão. Esta cobertura não declara migração de instaladores antigos, nem altera modelos, métricas, gates ou resultados legados. O resultado do uso real após a correção pertence à [jornada DEV](simulacao-catalogo-joias-dev-2026-11-01.md).

## Plano de reparo com uma fonte elegível

A primeira retomada real classificou corretamente o resultado como texto e executou o formulário. O cenário funcional falhou e solicitou reparo; o modelo marcou o mesmo arquivo para editar e preservar inteiro. A guarda recusou as duas propostas contraditórias. Essa falha permanece registrada, sem publicar a candidata.

O schema de planejamento agora limita `readOnlyPaths` a no máximo o número de fontes elegíveis menos uma, pois `changes` exige ao menos uma edição. Quando só existe uma fonte elegível, essa lista deve ser vazia. Isso não amplia os caminhos autorizados, não escolhe o arquivo e não remove a validação de sobreposição ou as regras de preservação do conteúdo. Planos contraditórios continuam recusados antes da edição.

O novo contrato passou em 31 testes do compilador (114 contratos distintos no conjunto dirigido), incluindo a recusa de conflito mesmo com uma única fonte. Três planejamentos reais independentes — reservas, despesas e materiais — retornaram uma alteração e nenhuma preservação integral conflitante. O fluxo sintético completo foi repetido com as fontes novas: aparência e reservas passaram com replay independente; teclado permaneceu não executado pela limitação declarada. A [segunda qualificação](assets/correcao-classificacao-teste-ui-2026-11-01/qualification-v2.json) conserva `completeAcceptance=false` e não usa dados de negócio.

Somente o executor de código precisou de nova atualização, em 01/11/2026, 21:26, com saúde confirmada e configuração preservada; runtime conserva a fonte já publicada. O [recibo da segunda publicação](assets/correcao-classificacao-teste-ui-2026-11-01/executor-source-publication-v2.json) identifica outra operação e backup privado, sem substituir a primeira. [Planejamentos independentes](assets/correcao-classificacao-teste-ui-2026-11-01/single-plan-qualification.json). A falha inicial do controlador desse ensaio, por ausência de uma função auxiliar de orçamento, foi corrigida antes da qualificação; não é resultado positivo do produto.

## Seletores sem nome acessível

A retomada seguinte superou o plano contraditório, mas o reparo propôs conteúdo idêntico duas vezes, corretamente recusado. O diagnóstico agregado de sintaxe/imports não descreve precisamente essa recusa sem efeito. A investigação do formulário mostrou a causa anterior: o `combobox` existia na árvore acessível, porém era descartado do registro por não possuir nome. O operador preenchia os campos textuais, não selecionava a opção necessária e encontrava a validação de obrigatórios. Não foi alterada a aplicação para facilitar o ensaio.

O registro agora conserva `combobox` sem nome, com papel, índice entre controles equivalentes, seção, opções e seleção observados. O roteiro aceita somente `select` nesse alvo com nome vazio e índice inteiro de 0 a 5. Não inventa um rótulo, não oferece um seletor CSS e não permite selecionar opção ausente. IDs obsoletos e operações incompatíveis permanecem recusados. O limite de seis controles equivalentes e a indicação de coleção limitada continuam existentes.

Cinco testes do registro e 17 testes reais de Chromium passaram, incluindo formulário sintético de entregas com um seletor nomeado e dois sem nome: somente a modalidade pretendida mudou; destino e cobrança foram preservados. O roteiro repetiu a confirmação em navegador novo. Os contratos do executor, DEV IA e runtime passaram novamente. A qualificação com modelo usa entregas, reservas, pré-requisitos e aparência em fontes sintéticas independentes do catálogo.

A primitiva de manutenção aceita opcionalmente um digest imutável de imagem de navegador previamente qualificada. Confere identidade, label e os dois módulos; altera somente a referência de navegador correspondente e o digest das fontes/metadados. As demais propriedades de configuração mantêm os mesmos valores. Sem esse parâmetro, preserva os bytes exatos como nas duas instalações anteriores. Os sete testes de manutenção incluem atualização explícita de imagem, recusa de referência mutável/identidade divergente e compensação de fonte, imagem e configuração em falhas de saúde/auditoria. O backup contém a configuração anterior exata. Modelo, orçamento, credenciais, fontes de aplicação e jobs não mudam.

## Ocorrência literal no localizador de trechos

O cenário sintético adicional expôs uma distinção importante: selecionar e clicar não basta se o implementador mudar o rótulo do botão em vez do resultado. A conferência independente recusou essa candidata. As rodadas reprovadas permanecem como evidência; a conferência não foi removida para publicar o executor.

O localizador de trechos agora recebe as consultas literais e suas ocorrências no arquivo selecionado, além do objetivo, contexto aprovado e índice sintático. Essas ocorrências já eram usadas para localizar o arquivo, mas não eram repassadas à decisão seguinte. A instrução distingue controle de acionamento e expressão de resultado. A escolha continua sendo do modelo entre IDs observados; não há arquivo, elemento ou mensagem do catálogo fixados no coordenador. Escopo autorizado, revisão, papéis sintáticos e validação de edição permanecem iguais. Os 31 contratos do compilador passaram novamente, conferindo também que ocorrências de outro arquivo não vazam para essa seleção.

Limitação exposta pelo ensaio: uma asserção textual representativa pode encontrar o texto no lugar errado, inclusive em um controle. A qualificação dirigida verifica separadamente a preservação do botão, ausência da confirmação com seleção vazia e confirmação após seleção. Isso não transforma o operador geral em validador semântico completo, nem certifica todos os critérios de aplicações arbitrárias. As falhas do controlador de qualificação (agregação inicialmente falsa e comparação literal de formatação) também permanecem distintas das candidatas reprovadas pelo comportamento independente.

O repasse das ocorrências melhorou a seleção, mas não eliminou sozinho a alteração indevida do botão nesse ensaio. A especificação sintética final explicita o literal anterior do parágrafo, o resultado pretendido e o rótulo preservado do botão. Com esse contexto, a confirmação só apareceu após selecionar e enviar, preservando o destino. A [rodada base](assets/correcao-classificacao-teste-ui-2026-11-01/qualification-v3-base.json) conserva a variante reprovada; a [rodada com alvo explícito](assets/correcao-classificacao-teste-ui-2026-11-01/qualification-v3-select.json) passou. Ambas usam o mesmo digest de executor e imagem. Pré-requisitos, aparência, reservas e recusa de teclado passaram na rodada base. Não se declara resolvida a localização semântica em todas as variantes.

Publicadas as fontes e a imagem em código/runtime em 01/11/2026, 21:43, com saúde confirmada. Os [recibos](assets/correcao-classificacao-teste-ui-2026-11-01/executor-source-publication-v3.json) identificam os dois backups. Somente a referência de navegador mudou nos valores da configuração; modelos, orçamento, credenciais e dados foram preservados. A [validação consolidada dirigida](assets/correcao-classificacao-teste-ui-2026-11-01/validation-v3.json) registra **116 contratos + 5 testes de registro + 17 testes Chromium = 138 testes distintos aprovados**, além das qualificações com modelo e suas limitações. A publicação do executor não representa publicação ou aceite da História.

## Vínculo de rótulo observado

A tentativa real seguinte observou o seletor sem nome, mas pediu `anel` quando a opção visível era `Anel`. Isso acionou incorretamente a criação de um pré-requisito que já existia; como não havia formulário próprio para criá-lo, a tentativa foi recusada antes de qualquer ação de browser. Essa falha não foi reescrita.

O coordenador resolve agora somente diferenças de caixa e espaços entre o rótulo solicitado e uma única opção observada. A seleção e o replay usam o literal observado exato; o valor solicitado também fica no recibo privado. Correspondência exata conserva prioridade, aliases semânticos não são inferidos, acentos não são removidos e múltiplas correspondências normalizadas são recusadas como ambíguas. Opção ausente continua exigindo a criação normal pela interface. Isso não altera o valor interno da opção, os requisitos, a asserção congelada ou o formulário da aplicação.

O teste adicional usa modalidades de entrega/cobrança, cobre rótulo sem nome, diferenças de caixa/espaços, ausência, correspondência exata e ambiguidade. Os 29 testes UI e os nove contratos do consumidor DEV passaram. O conjunto dirigido passa a 117 contratos e 22 verificações de registro/Chromium, totalizando 139 testes distintos; as qualificações com modelo são reportadas à parte.

A [qualificação da fonte v4](assets/correcao-classificacao-teste-ui-2026-11-01/qualification-v4.json) passou em pré-requisitos, aparência, reservas e entrega com seletor sem nome, mais recusa esperada de teclado. Os testes independentes mantiveram bloqueio vazio, confirmação congelada e controles preservados. Código/runtime receberam essa fonte em 01/11/2026, 21:49, com saúde confirmada e bytes exatos da configuração preservados; a imagem continua a da publicação v3. [Recibos v4](assets/correcao-classificacao-teste-ui-2026-11-01/executor-source-publication-v4.json) e [validação dirigida v4](assets/correcao-classificacao-teste-ui-2026-11-01/validation-v4.json). A jornada real e suas falhas anteriores conservam resultados próprios.

## Edição após tentativa de envio

O vínculo do rótulo funcionou na tentativa real seguinte. O operador enviou antes de preencher todos os campos, recebeu a validação da aplicação, completou o rascunho e recarregou sem outro envio. A mudança de tela causada pelo erro havia sido tratada como confirmação do clique principal. A asserção falhou, e as duas propostas subsequentes de reparo foram recusadas como expressões inválidas. Não se publicou a candidata.

Agora qualquer ação confirmada de `fill`, `select` ou `check` após um envio invalida essa confirmação: o rascunho precisa ser enviado novamente. Enquanto o envio/pré-requisito estiver pendente, recarga e asserções não são opções do operador. Não se presume sucesso de negócio; a asserção congelada continua obrigatória. Quando a própria aplicação limpa os campos no handler de sucesso, isso não é uma nova ação de edição do operador. Os pré-requisitos de um envio já confirmado também não voltam a ser exigidos apenas porque esse handler limpou o formulário. Cenários que se efetivam pelo próprio controle, sem botão principal, mantêm seu fluxo.

O teste de estado usa formulário de despesas: primeiro envio mostra erro, edição exige novo envio, recarga/asserção ficam bloqueadas nessa etapa, segundo envio limpa seleção e a asserção é executada sem refazer o cadastro. Os 30 contratos UI e os nove do consumidor DEV passaram. Com os demais contratos e navegador já conferidos, o recorte soma 140 testes distintos. Isso não impede todo clique prematuro nem substitui a interpretação do cenário pelo modelo.

A [qualificação v5](assets/correcao-classificacao-teste-ui-2026-11-01/qualification-v5.json) passou nos cinco cenários completos dirigidos: pré-requisitos, campos obrigatórios nativos, aparência, reservas e entrega com seletor sem nome. Teclado permaneceu não executado pela capacidade declarada. Os resultados independentes conferiram seleção/campos vazios bloqueados, mensagens e controles preservados. Código/runtime receberam as fontes às 21:56 de 01/11/2026, com saúde e configuração exata preservadas, sem trocar imagem ou modelo. [Publicação v5](assets/correcao-classificacao-teste-ui-2026-11-01/executor-source-publication-v5.json), [140 testes dirigidos](assets/correcao-classificacao-teste-ui-2026-11-01/validation-v5.json). A versão v5 não elimina as limitações semânticas descritas acima.

## Recuperação estrutural de seleção

A codificação real passou pelo cenário e replay após a publicação v5, produzindo o MR !2. O Code Review bloqueou a integração e a correção autorizada pelo Portal falhou duas vezes na seleção de trechos, antes da edição. Uma reprodução apenas de planejamento/inspeção retornou três IDs únicos e observados, sem reproduzir a violação; isso não converte as tentativas anteriores em sucesso nem identifica retrospectivamente a forma exata da resposta rejeitada.

O localizador agora declara IDs únicos no schema, preserva a resposta candidata no job privado antes de validá-la e admite uma única correção estrutural com o mesmo objetivo, contexto completo e índice observado. Não deduplica IDs, aceita IDs desconhecidos ou escolhe um trecho silenciosamente. A nova resposta passa pela mesma guarda antes de qualquer edição; falha persistente encerra a tentativa. Inferência e tempo continuam no orçamento global existente. A recuperação não resolve por si só erros semânticos de seleção.

Os 32 contratos do compilador incluem seleção duplicada, ID desconhecido e propriedade extra: uma resposta válida pode prosseguir; duas respostas inválidas não alcançam edição. Contexto e schema não se ampliam na recuperação. As fontes de candidata/recuperação permanecem privadas e a fase reutiliza a execução de codificação existente, sem nova ação ou resultado de negócio. O conjunto dirigido passa a 141 testes distintos.

A [qualificação v6](assets/correcao-classificacao-teste-ui-2026-11-01/qualification-v6.json) passou em pré-requisitos, aparência, reservas e entrega com seletor sem nome, mais recusa esperada de teclado, com fonte estável. Às 22:12 de 01/11/2026, somente o executor de código recebeu essa fonte, com saúde e configuração exata preservadas; runtime conserva v5 e o navegador continua v3. [Publicação v6](assets/correcao-classificacao-teste-ui-2026-11-01/executor-source-publication-v6.json), [validação consolidada v6](assets/correcao-classificacao-teste-ui-2026-11-01/validation-v6.json). Não houve mudança dos prompts de planejamento de Histórias, Assistente, Code Review ou Security Scan nesta manutenção.

## Compensação ao encerrar a auditoria administrativa

A revisão da ferramenta de manutenção encontrou uma lacuna no escopo da captura de falha: a compensação cobria erro dentro do corpo da operação e em `operation.result`, mas não uma falha do append final ao sair do context manager do recorder. As instalações reais anteriores seguiram o caminho de sucesso; não houve falha de encerramento observada nelas.

A captura agora envolve o contexto administrativo inteiro. O teste novo provoca falha no encerramento depois dos efeitos e confirma restauração exata de fontes, metadados, configuração e referência de imagem em código/runtime. São oito testes de manutenção, totalizando 142 testes distintos no conjunto dirigido. Essa é compensação isolada, sem ensaio de rollback sobre serviços reais; resultado administrativo incerto não é convertido em sucesso. A ferramenta é executada a partir do repositório, sem nova publicação de serviço por essa correção.
