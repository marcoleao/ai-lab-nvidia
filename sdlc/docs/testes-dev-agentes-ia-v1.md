# Testes por Agentes de IA em DEV

Implementada e publicada no LAB em 01/11/2026. Esta bateria auxilia a decisão humana sobre a História inteira. Não aprova critérios, não conclui tarefas, não abre ajustes nem publica uma versão automaticamente.

## Como usar

Na aprovação da História em DEV, **Testes por Agentes de IA** aparece entre **Confirmar aprovação da História em DEV** e **Solicitar ajustes**. O link abre uma página própria; iniciar a bateria exige o botão explícito dessa página. O hub de execução continua com dois quadros: acompanhamento e próximas ações.

1. Confira a publicação e inicie a bateria.
2. Acompanhe o progresso e os cenários registrados. Abra as imagens e o roteiro de cada cenário quando necessário.
3. Se houver falha funcional reproduzida, revise o resumo preenchido no formulário existente de ajustes. O texto humano já digitado é preservado.
4. **Confirmar solicitação de ajustes** registra a decisão humana. A bateria sozinha não envia esse pedido.
5. Se os resultados forem suficientes para sua avaliação, volte à aprovação da História. A confirmação continua global, humana e independente da bateria opcional.

Um resultado sem falhas encontradas vale somente para os cenários executados. “Não verificado” significa que o agente não produziu prova suficiente; não significa defeito da aplicação. A cobertura integral dos critérios permanece sob controle humano.

### Consultar resultados depois de sair da bateria

**História:** o resumo de DEV e o quadro **Acompanhamento da execução** oferecem **Consultar resultados dos testes por IA**, com situação, contagens e data da última bateria registrada.

**Tarefa:** o mesmo acesso aparece em **Resumo**, **Evidências** e **Execução**, inclusive em tarefas de implementação. A bateria pertence à História, não à tentativa selecionada da Tarefa. A consulta de uma tentativa histórica informa expressamente essa diferença.

O link fixa `aiTest=<id>` e abre os cenários, imagens e roteiros daquela bateria. Consultar não inicia uma nova execução nem registra aceite ou solicitação de ajustes. O resumo é da última bateria, não um histórico integral de todas as baterias. A autorização de escrita não controla a visibilidade de evidências já registradas.

Erro de leitura preserva a última referência, contagens e data com aviso próprio; não transforma ausência de confirmação em ausência de resultados nem altera a validade exibida da aprovação humana. Mudança de fonte preserva o acesso histórico, sem transferir sugestões à revisão atual. Essa evolução usa somente os GETs existentes; API, agentes, modelo, migrations, métricas e decisões de domínio permanecem com seus contratos anteriores.

A validação dessa descoberta inclui 15 cenários novos em 1440/390, leitura sem persona de escrita, link fixo por teclado e com alvo mínimo de 44px, três abas da Tarefa, tentativa histórica, fontes alteradas, consulta falha sem invalidar aprovação humana, estados sem bateria/em execução/incerto e ausência de POST. Os resultados da rodada ampliada e da adequação das verificações antigas ficam no [acervo da navegação](assets/resultados-ia-navegacao-2026-11-01/). Os testes antigos de consulta de aprovação foram alinhados à decisão global já adotada, preservando as verificações de recuperação, identidade, rascunho e foco; isso não reescreve resultados antigos de agentes.

**Publicado localmente:** 72 cenários distintos passaram nas rodadas dirigidas, além do build de produção. A [publicação da navegação](assets/resultados-ia-navegacao-2026-11-01/publication.json) trocou apenas o web para `1aa87b47ecbb`, preservando imagem e identidade do container da API, executores e conteúdo das 51 tabelas. Não houve migration nova. Backup privado com digest e arquivo conferidos. A [conferência ao vivo](assets/resultados-ia-navegacao-2026-11-01/live-review.json) navegou por cinco entradas em 1440/390, sem persona de escrita, com identidade da bateria conservada e zero comandos: a bateria real permaneceu inconclusiva, com três cenários sem falha e três não verificados. Isso valida descoberta e consulta, sem aceitar a História, corrigir os erros do executor ou declarar regressão integral do repositório. O shell móvel mantém seus limites de altura/rolagem anteriores.

## Fonte e execução

`DevelopmentAiTest` guarda uma intenção imutável com especificação, execução, referência, build, implantação, ambiente, SHA, imagem, autoria e política `dev-ai-browser-v1`. O contexto v2 conserva requisitos, critérios, regras, requisitos não funcionais, plano técnico, decisões e tarefas aprovadas. Cada critério recebe um cenário representativo próprio, com seus casos de teste como referência; nenhuma aprovação por critério é criada.

A API confirma a saúde da publicação gerenciada antes do pedido e revalida o contexto antes do envio. O runtime confere a implantação e imagem reais antes das ações. O endereço vem da publicação própria; o usuário e o modelo não escolhem uma URL livre. Mudanças de fonte preservam o resultado anterior como histórico, sem emprestar suas sugestões à nova versão.

O especialista de testes já existente é reutilizado com foco no cenário atual. O operador age em controles observados e confere uma expectativa congelada. Uma segunda sessão limpa repete o mesmo roteiro para confirmar sucesso ou reproduzir uma falha funcional. O executor não corrige código, renderiza outra candidata nem prepara dados na aplicação publicada. O modelo local de UI é o já selecionado no executor de código; não há novo modelo, serviço de nuvem ou alteração de seleção.

As sessões novas isolam cookies e armazenamento do navegador. Elas **não limpam a base de DEV**. Acesso externo, WebSocket, service workers e requisições de escrita no servidor são bloqueados; somente GET/HEAD da mesma origem são admitidos. Isso não assegura ausência de efeitos de um servidor que implemente escrita indevidamente por GET. O perfil pressupõe uma aplicação gerenciada cuja leitura HTTP seja apropriada para esse ensaio.

Limites desta versão:

- Até 12 critérios, um cenário representativo por critério, até 20 ações registradas por cenário.
- Orçamento de 120 inferências, 600 segundos para a bateria e 240 segundos por cenário; operações de transporte têm seus próprios timeouts limitados.
- Asserções disponíveis: texto, fundo em amostras da janela e fonte do título h1. Não representam inspeção visual geral nem cobertura de todas as fontes e elementos.
- Sem escrita no backend, preparação de autenticação, integração externa, percurso de teclado, redimensionamento, upload ou fixture de imagem no DEV publicado. Esses recortes permanecem não verificados quando exigidos.
- A observação atual é consultada por polling, aproximadamente a cada quatro segundos na página e cinco segundos no worker. Não é um stream de todas as ações; ações rápidas podem ocorrer entre leituras.
- O resumo de ajustes tem até 1.800 caracteres e inclui todos os cenários com falha. Títulos longos são abreviados explicitamente no resumo; o relatório conserva o cenário completo. O campo humano mantém seu limite existente de 2.000 caracteres e não é truncado silenciosamente.

## Evidências e recuperação

Cada caso pode conservar `initial.png`, `final.png` e `report.json`. O relatório contém cenário, ações, observação selecionada da interface, referência e resultado da repetição. Um manifesto privado fixa os hashes das evidências; arquivos alterados são recusados na leitura. Prompts, configurações, respostas brutas do modelo e erros técnicos integrais permanecem nas fontes privadas próprias. Os relatórios e imagens podem conter conteúdo visível de DEV e são fontes controladas, não campos da auditoria pública.

A URL `?aiTest=<id>` consulta uma bateria específica. A situação corrente e a autorização para usar sugestões vêm de uma leitura atual separada. Falha de consulta retém a última evidência identificada e retira a confirmação atual. Troca de persona ou fonte invalida a sugestão, sem apagar o rascunho humano.

A chave idempotente preserva o pedido original, inclusive após resposta perdida ou substituição da publicação. O marcador de despacho é gravado antes de chamar o serviço nativo. Depois dele, a recuperação consulta a mesma identidade, sem reenviar por ausência de confirmação. Resultados de casos já registrados e recibos terminais não são reescritos.

Após reinício nativo, casos preservados são reconciliados e os restantes ficam não verificados; não há repetição automática de ações/inferências. Uma incerteza sem recibo verificável permanece explícita e bloqueia outra bateria no mesmo DEV. Esta versão não oferece cancelamento ou encerramento administrativo dessa incerteza pela interface. Isso não cria um gate adicional de aprovação humana. Mudança de contexto no portal pode tornar a evidência histórica antes de o processo de leitura terminar; não há cancelamento instantâneo prometido.

## Auditoria e instalação

Cinco ações explícitas: `AI_DEV_TEST_REQUESTED`, `AI_DEV_TEST_STARTED`, `AI_DEV_TEST_PROGRESS`, `AI_DEV_TEST_COMPLETED` e `AI_DEV_TEST_UNCONFIRMED`. Usam o recorder compartilhado na transação da intenção/progresso/resultado, com iniciador humano, executor agente, operação correlacionada e estados anteriores/novos. A projeção inclui IDs, fonte, etapas e contagens; não inclui prompts, requisitos integrais, observações da interface ou o texto sugerido de ajustes.

`COMPLETED/SUCCEEDED/NOT_EVALUATED` confirma o registro da execução, inclusive quando o teste encontrou falha; não é aprovação da História. Resultado sem confirmação usa `UNKNOWN/OBSERVED`. A aprovação ou rejeição humana posterior usa o fluxo de aceitação e seu catálogo existente.

As duas migrations são aditivas e recusam downgrade quando há fonte/evidência registrada. A instalação pública configura código antes do runtime para reutilizar a seleção existente de UI. Reinstalação recusa baterias nativas ativas. A publicação e instalação usam os produtores administrativos existentes fora da base alterada, com backup privado, preservação das identidades e compensação de arquivos/imagens. Não há migração declarada de outros agentes, gates, métricas ou fluxos legados.

## Validação e limites da evidência

O recorte de interface possui 16 cenários novos, além dos 16 de aceitação humana reutilizados, em desktop/celular. Inclui navegação sem comando, início explícito, acompanhamento, resposta perdida, evidência histórica, leitura falha, permissão, troca de contexto, preservação de rascunho e confirmação humana. Os cenários usam interceptação isolada e não equivalem a aceite da aplicação de negócio.

A API possui testes dirigidos de pedido, fonte, autorização, idempotência, ausência de decisão automática, privacidade e rollback/retentativa do recorder. Contratos nativos cobrem repetição independente, classificação de limitações, identidade, reinício sem novas ações, integridade de evidências e proteção de reinstalação. O Chromium também foi conferido no fluxo existente de candidatas.

A qualificação real `ai-dev-live-20261101T221250Z-9c879e` usou qwen3:14b, Chromium e duas publicações sintéticas isoladas: cor/fonte passaram; uma falha real de cor foi reproduzida no mesmo roteiro; teclado permaneceu não verificado; uma tentativa POST foi bloqueada com contador do servidor inalterado; substituição da implantação recusou fonte antiga e preservou o recibo. A fonte ficou estável durante o ensaio. As duas tentativas anteriores com acesso a um botão de escrita foram preservadas como inconclusivas; elas motivaram melhoria do foco do especialista e separação do probe de proteção na fixture, sem alterar dados/aplicações do SDLC ou transformar resultados antigos em sucesso.

Recibos selecionados ficam em [evidências desta implementação](assets/testes-dev-ia-2026-11-01/). O [recibo operacional](assets/testes-dev-ia-2026-11-01/publication.json) confirma API/web na imagem `3533f47eae57`, Portal pronto, executores na fonte qualificada e modelo existente preservado. As duas migrations foram aplicadas: 47 no total e 51 tabelas. A comparação normalizada preservou todas as linhas das 50 tabelas anteriores; somente campos operacionais de polling/lease já definidos de MergeOperation são normalizados. O backup privado teve digest, permissões e leitura do arquivo confirmados. Não houve alteração de aplicação produzida, dados de negócio ou resultado anterior de agente para demonstrar a entrega.

A [conferência publicada](assets/testes-dev-ia-2026-11-01/live-review.json) navegou pela aprovação, nova página e HELP em 1440/390, com início habilitado e sem overflow horizontal. Não enviou comandos, bateria ou aprovação na História operacional. A inspeção visual das capturas confirmou o painel e controles; o shell existente continua exigindo rolagem no celular. Isso não certifica assistividade integral ou todo o catálogo de regressão. Nenhum teste desta entrega aprova a História operacional nem cria uma release QA.
