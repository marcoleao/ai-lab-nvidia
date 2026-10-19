# Experiência de negócio no chat — versão 0.3

A avaliação humana identificou uma interface orientada à operação técnica: nomes internos, vários botões simultâneos, escolha manual de projeto/conversa, repetição de cliques para ajustar rascunhos e ausência de orientação após o envio. Esta entrega reorganiza o chat em torno de decisões de negócio.

## Caminho principal

1. **Sua ideia**: dê um nome e conte o problema. A conversa inicial é criada automaticamente. **Preparar meu plano** permite avançar quando desejar.
2. **Seu plano**: revise o resultado esperado, frentes de trabalho, entregas e condições para considerar o trabalho pronto. Escreva um ajuste e use **Pedir ajuste** para obter uma nova versão, sem precisar acionar outro botão de geração.
3. **Sua decisão**: **Enviar para revisão** pede confirmação e encaminha o plano ao planejamento existente. **Revisar e decidir** abre o portal na ideia correta e na seção de revisão. O envio não é aprovação e não inicia execução de código.

O plano atual e a resposta recente têm destaque. Conversas anteriores, seleção de ideias e detalhes técnicos ficam recolhidos. O estágio e a próxima ação aparecem explicitamente. Após envio, as alterações no planejamento existente são feitas no portal. Durante envio parcial, **Concluir envio** permite retomar sem duplicações e impede gerar outra cópia como ajuste.

O progresso de envio é conferido nos registros do servidor, com marcadores exatos de turno/hash/referência. Quando um item já foi revisado, sua primeira versão imutável é consultada para preservar a identificação do envio original. O progresso não depende de memória da Webview nem de aceitar como aprovadas as mensagens do modelo.

## Alcance e limites

Esta é uma revisão do chat e da transição para a revisão. O portal não foi redesenhado por completo. A configuração inicial ainda exige uma chave pessoal e o portal pode solicitar autenticação própria. Aprovações continuam no portal, com os gates existentes. A tela não afirma acompanhar automaticamente o resultado da decisão tomada no portal. Construção, testes e deploy de produto continuam pendentes.

Nenhuma conversa foi apagada ou republicada para validar a interface. Os testes de navegador usam estado e conteúdo sintéticos. A prévia local fica em `sdlc/.state/ux-preview/plano-negocio.png`.

## Verificação

- Onze testes Node passaram: cancelamento, transporte, diagnóstico privado, confirmação de envio, idempotência, ajuste direto do rascunho, marcadores exatos, progresso após revisão de itens e bloqueio de ajuste durante envio parcial.
- Dois testes Chromium passaram, incluindo tela estreita, início sem ideia, revisão do plano, conteúdo não confiável, envio parcial, acesso somente de leitura, histórico recolhido e seleção da ideia correta após login no portal.
- A sintaxe JavaScript e os contratos PowerShell passaram.
- A repetição do teste de host real do VS Code foi impedida pelo atualizador do próprio aplicativo (`Code is currently being updated`), antes de carregar a extensão. A abertura no perfil habitual deve ser confirmada pelo usuário após a recarga da janela.

Não se trata de aceite humano da nova experiência; a validação automatizada confirma os estados e ações implementados.

Pacote instalado: extensão 0.3.0, VSIX SHA256 `52FD9CCD41E00FD7E728967CA0C9078645C5BE242235A65B49C37FAC4359B7D2`; backend `agentic-sdlc/control:198f815feca780dffbeb901ede968a8335ee45edd305115ce9e68250664ed421`. O portal terminou a atualização saudável. Não houve migração de banco ou inferência de modelo para instalar esta revisão de interface.
