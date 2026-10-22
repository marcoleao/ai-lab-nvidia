# Criação do planejamento pela assistente

Ao final da entrevista, a própria assistente transforma a conversa em planejamento cadastrado. Na conversa do Sistema, o usuário seleciona um Projeto desse Sistema. Na conversa do Projeto, o destino é o próprio Projeto. A ação **Concluir entrevista e criar itens**, disponível para Admin e Product Owner, solicita ao modelo local a estrutura e registra épicos, histórias e tarefas em uma transação. O recibo permanece na conversa de origem.

A entrevista existente pode ser aproveitada. Não há cópia manual de títulos, necessidade de repetir perguntas ou aplicação externa pelo agente de desenvolvimento. O fluxo anterior de proposta editável permanece disponível no Projeto como alternativa. Uma confirmação textual isolada não constitui aprovação de status; o prompt orienta a assistente a indicar a ação de conclusão e a não anunciar criações sem recibo.

O planejamento inicia em TO DO / SPECIFICATION / TO DO. A criação não altera aprovações nem executa código. A validação do destino, permissões, versão da conversa e impressão digital da hierarquia ocorre no backend; alterações no Projeto durante a geração impedem o cadastro. Falha na geração ou na gravação não deixa itens parciais. Solicitações repetidas com a mesma chave recuperam o mesmo resultado. Cancelamento descarta a saída tardia.

## Validação

Trinta testes TypeScript passaram em PostgreSQL descartável, incluindo escopo entre Sistemas, permissões, criação pela fila da assistente, proveniência, idempotência, contexto alterado e resposta inválida. O teste destrutivo de GitLab não foi executado. O build de produção e a verificação de tipos passaram.

Um teste Chromium validou seleção obrigatória do destino na conversa do Sistema, recuperação de confirmação de envio perdida com a mesma chave, recibo após recarga e ausência de transbordamento em 1440 e 390 pixels. A revisão do fluxo foi feita por agente com perfil UX.

Com `qwen3:14b`, a conclusão real de uma entrevista técnica em `portal_test` criou exatamente um épico, uma história e uma tarefa no Projeto selecionado; geração e cadastro levaram aproximadamente 19 segundos. Esse ensaio não usou a conversa humana nem adicionou dados ao seu planejamento.

## Correção da intervenção externa

Antes desse fluxo, o agente de desenvolvimento cadastrou indevidamente 12 itens diretamente, contrariando a intenção de demonstrar a criação pela assistente da ferramenta. Após a correção do usuário, esses 12 itens foram conferidos por ID, versão e descendência e arquivados pela API. Os seis itens anteriores e a entrevista foram preservados. O histórico de criação e arquivamento permanece auditável. Nenhum cadastro substituto foi feito na conversa humana.

## Correção de timeout e formato da proposta

No uso da entrevista real, uma conclusão excedeu 120 segundos e outra gerou JSON completo, com 4253 caracteres, mas acrescentou `repositoryIds` na raiz e nos épicos. Esses campos não pertencem ao contrato; a falha de formato não significava que aquele texto era grande demais.

O provedor agora envia o JSON Schema do plano ao Ollama, em vez de solicitar apenas JSON genérico. O formato limita propriedades, níveis e quantidades durante a geração, mantendo a validação posterior e a possibilidade de responder que a entrevista é insuficiente. A geração solicita descrições concisas, com limite de 4096 tokens de saída; resposta truncada continua sendo recusada, com erro específico.

API e relay aguardam até 240 segundos por inferência, com lease da fila de 300 segundos para evitar expiração anterior ao limite de resposta. Não há reenvio automático das conclusões que falharam. Esses limites são finitos; indisponibilidade do motor ou propostas que excedam o limite ainda podem falhar sem criar itens parciais.

Trinta e um testes TypeScript e o teste Python do relay passaram. A geração estruturada usa o recurso documentado pelo Ollama em https://ollama.com/blog/structured-outputs.

O histórico da entrevista que apresentou as falhas foi reproduzido exclusivamente em `portal_test`. Com o mesmo modelo local, a conclusão levou 48749 ms e cadastrou um épico, três histórias e sete tarefas, com recibo persistido pela assistente. A conversa original não foi reenviada nem alterada na validação; nenhum item de teste foi criado no ambiente humano.
