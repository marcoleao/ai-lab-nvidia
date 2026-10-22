# Assistente lateral de planejamento

Esta proposta de interface foi substituída pela [assistente real com conversa persistida](assistente-real-2026-10-20.md). O restante registra o protótipo inicial, não o comportamento atual.

O usuário aceitou a hierarquia e a clareza da navegação da fundação em 20/10/2026. Pediu explorar, somente como interface nesta entrega, uma assistente virtual que atue como analista de sistemas: entrevistar, propor um plano e futuramente operar a ferramenta criando Épicos, Histórias e Tarefas.

## Interação proposta

- A criação manual permanece disponível. Um botão abre a assistente lateral, com identificação do contexto de planejamento atual.
- Uma entrevista guiada coleta o objetivo, as pessoas atendidas, o resultado esperado e as restrições. Nenhum domínio ou projeto é fornecido previamente.
- O usuário revisa as respostas e um rascunho de estrutura antes de qualquer futura operação. Nesta versão, o rascunho é organizado localmente por regras de interface; não representa análise de um modelo.
- O painel pode ser fechado e reaberto no mesmo contexto. Não há gravação da conversa no servidor ou persistência após recarregar a página.
- O estado de protótipo fica explícito. A ação de criar itens fica indisponível até a integração real; nenhum Épico, História, Tarefa ou histórico é escrito pela assistente.

## Evolução funcional proposta — ainda não implementada

Vincular a conversa a um Sistema/Projeto explícito e versionado; usar o provider local de SDLC-13 para entrevistar e elaborar uma proposta estruturada; permitir revisar títulos, critérios de aceite, dependências e tarefas; apresentar um resumo das operações antes de aplicá-las. A execução deve respeitar a persona e as aprovações de planejamento existentes, com idempotência, controle de concorrência e autoria humana/sistema no histórico. O aceite de um plano não pode aprovar automaticamente gates ou simular implementação.

Essa evolução complementa SDLC-14. Deve receber critérios próprios de recuperação de conversa, confirmação do destino, proposta desatualizada, aplicação parcial e cancelamento antes de ser considerada uma capacidade operacional.

## Avaliação humana

Abrir a assistente, responder com um objetivo próprio, revisar o rascunho, voltar às respostas e fechar/reabrir o painel. Avaliar se contexto, progresso da entrevista e diferença entre proposta e operação estão claros.

## Evidências desta entrega

Interface desenhada e revisada por agente com perfil de UX. Build de produção e checagem TypeScript passaram. Um teste Chromium passou cobrindo entrevista, edição, revisão, botão de criação indisponível, Escape, retorno de foco, preservação ao fechar e reinício ao mudar de contexto. O teste bloqueou qualquer requisição de escrita à API e confirmou zero operações; nenhum dado de planejamento foi criado ou alterado. Capturas de 1440 px e 390 px foram inspecionadas, sem overflow horizontal. A entrevista usa rolagem própria no painel.

Disponível na prévia http://localhost:3310 pelo botão **Assistente IA · PRÉVIA**. Este aceite valida a interação do protótipo; não atesta análise por IA ou aplicação de planos.
