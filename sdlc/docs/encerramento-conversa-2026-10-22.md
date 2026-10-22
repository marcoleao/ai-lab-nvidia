# Encerrar a conversa e revisar a decisão

O aceite humano encontrou uma inconsistência: depois de o usuário escolher um encaminhamento, a resposta textual anunciava implementação, enquanto o campo estruturado `ready` continuava falso. A confirmação da ferramenta não aparecia, prendendo a pessoa no diálogo.

Agora **Preparar decisão para revisão** fica disponível quando há orientações enviadas pelo usuário, mesmo que o modelo tenha marcado a última rodada como não pronta. A ação enfileira um pedido específico, persistido em `ExecutionMessage.intent=prepare_decision`. O modelo resume as escolhas do histórico e registra dúvidas restantes. O protocolo transforma o resultado válido em proposta revisável; o modelo não controla se o usuário pode solicitar o encerramento da entrevista.

A preparação não confirma a decisão, não concede capacidades, não aprova G1 e não inicia codificação ou implantação. O usuário revisa o resumo, confirma as autorizações que desejar conceder e usa **Confirmar decisão e revisar especificação**. A execução revisa a especificação e aguarda novo G1. A conversa comum recebeu orientação de protocolo para não anunciar execução inexistente nem substituir o fluxo por mais perguntas quando a escolha já foi registrada. Nenhuma biblioteca ou solução de negócio foi fixada pelo agente externo.

Os pedidos de preparação e confirmação usam chaves idempotentes distintas, preservando corpo, versão e persona quando a confirmação HTTP se perde. A migração adiciona apenas o tipo de intenção, com valor `discuss` para mensagens anteriores, sem alterar suas palavras ou propostas anteriores. A conversa humana não é preparada ou confirmada automaticamente durante a atualização.

## Evidências

Trinta e sete testes de contrato passaram em PostgreSQL descartável. A regressão inclui duas respostas `ready=false` apesar de uma escolha explícita, pedido de preparação, repetição da mesma chave sem duplicar mensagens e novo G1 antes de gerar código. Dois testes Chromium passaram, cobrindo execução e diálogo, incluindo perda de confirmação na preparação e na confirmação da decisão.

O histórico da conversa que apresentou o problema foi copiado temporariamente para um banco descartável. Com `qwen3:14b`, o pedido de preparação concluiu em aproximadamente 18 segundos e produziu proposta revisável; o teste não confirmou a decisão nem publicou código. A cópia temporária do histórico é removida após a validação. Esse resultado valida o encerramento do diálogo, não implantação: o pipeline disponível ainda termina em Merge Request em rascunho, com build/testes, revisão, scanners e deploy pendentes.
